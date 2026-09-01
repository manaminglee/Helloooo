require('dotenv').config(
  process.env.DOTENV_CONFIG_PATH ? { path: process.env.DOTENV_CONFIG_PATH } : {}
);

/**
 * Mana Mingle - Secure backend: interest-based group video (max 4), WebRTC signaling, WebSockets
 */
const express = require('express');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const geoip = require('geoip-lite');
const { createClient } = require('@supabase/supabase-js');
const { registerEnhancements } = require('./enhancements');
const nvidiaAi = require('./nvidiaAi');
const { registerUniqueFeatures } = require('./uniqueFeatures');
const { createPersistence } = require('./persistence');
const { registerPayments } = require('./payments');
const creatorSecurity = require('./creatorSecurity');
const creatorEmail = require('./creatorEmail');
const creatorNotifications = require('./creatorNotifications');
const adminLiveMonitor = require('./adminLiveMonitor');
const { registerAudioChannels } = require('./audioChannels');
const { registerYoutubeLiveHandlers, stopAllForSocket, isFfmpegAvailable } = require('./youtubeLive');
const livekitRooms = require('./livekitRooms');
const { registerRaceGame } = require('./raceGame');
const { registerEconomy } = require('./economy');
const { registerAudioIdentity } = require('./audioIdentity');
const { registerModeration } = require('./moderation');
const { createMatchQueue } = require('./matchQueue');
const { createInfra } = require('./infra');
const { promises: dnsPromises } = require('dns');

const APP_VERSION = (() => {
  try { return require('../package.json').version || '0.0.0'; } catch { return '0.0.0'; }
})();

// Process-level safety nets: never crash silently on stray async failures.
process.on('unhandledRejection', (reason) => {
  console.error('[PROCESS] Unhandled promise rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[PROCESS] Uncaught exception:', err);
});

/** Normalize ADMIN_KEY from env (trim whitespace / optional quotes). Never log the value. */
function getAdminKey() {
  const raw = process.env.ADMIN_KEY;
  if (raw == null || typeof raw !== 'string') return null;
  let key = raw.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1).trim();
  }
  return key || null;
}

// Persistence Strategy: Supabase (Cloud) or Local JSON (Node)
const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
// Use service role key to bypass RLS for server-side admin operations.
// Falls back to anon key if service role not provided.
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
let supabase = null;

// Local DB State (Fallback)
const LOCAL_DB_PATH = path.join(__dirname, 'data', 'manadb.json');
let localDb = {
  creators: [],
  referral_logs: [],
  withdrawals: [],
  admin_history: [],
  trust_scores: {},
  moderation_reports: [],
  conversation_ratings: [],
  pro_users: {},
  creator_events: [],
  creator_password_resets: [],
  creator_notifications: [],
  consumed_payments: [],
  audio_identities: {},
};

function loadLocalDb() {
  try {
    if (!fs.existsSync(path.dirname(LOCAL_DB_PATH))) fs.mkdirSync(path.dirname(LOCAL_DB_PATH), { recursive: true });
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf8'));
      localDb = {
        creators: [],
        referral_logs: [],
        withdrawals: [],
        admin_history: [],
        trust_scores: {},
        moderation_reports: [],
        conversation_ratings: [],
        pro_users: {},
        creator_events: [],
        creator_password_resets: [],
        creator_notifications: [],
        consumed_payments: [],
        audio_identities: {},
        ...parsed,
      };
      console.log('[DB] Local storage loaded.');
    }
  } catch (e) {
    console.error('[DB] Local DB load failed', e);
    // Preserve the corrupt file for forensics instead of silently starting empty.
    try {
      if (fs.existsSync(LOCAL_DB_PATH)) {
        const backupPath = LOCAL_DB_PATH.replace(/\.json$/, `.corrupt-${Date.now()}.json`);
        fs.copyFileSync(LOCAL_DB_PATH, backupPath);
        console.warn(`[DB] Corrupt local DB backed up to ${path.basename(backupPath)}. Starting with empty state.`);
      }
    } catch (backupErr) {
      console.error('[DB] Could not back up corrupt local DB', backupErr);
    }
  }
}

function saveLocalDb() {
  // Atomic write: write to a temp file, then rename over the target so a crash
  // mid-write can never leave a truncated manadb.json behind.
  try {
    const tmpPath = `${LOCAL_DB_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(localDb, null, 2));
    fs.renameSync(tmpPath, LOCAL_DB_PATH);
  } catch (e) { console.error('[DB] Local DB save failed', e); }
}

let supabaseHealthy = null; // null = not configured; true/false = last boot check result
if (supabaseUrl && supabaseKey && supabaseUrl.startsWith('http')) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('[DB] Supabase connected.');
  // Verify connection asynchronously
  supabase.from('creators').select('count', { count: 'exact', head: true })
    .then(({ error }) => {
      if (error) {
        supabaseHealthy = false;
        console.error('[DB] Supabase connection test FAILED:', error.message);
        console.warn('[DB] Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env / Render environment variables.');
      } else {
        supabaseHealthy = true;
        console.log('[DB] Supabase connection verified OK.');
      }
    })
    .catch(() => { supabaseHealthy = false; });
} else {
  console.warn('[DB] Supabase not configured. Using local JSON storage (data resets on restart).');
}
loadLocalDb();
const persistence = createPersistence({
  supabase,
  localDb,
  saveLocalDb,
  adminKey: getAdminKey(),
});

// CLI overrides for local preview tooling: `npm run dev -- --port=7100 --host=0.0.0.0`
const cliArgs = process.argv.slice(2);
const cliPort = (cliArgs.find((a) => a.startsWith('--port=')) || '').split('=')[1]
  || (cliArgs.includes('--port') ? cliArgs[cliArgs.indexOf('--port') + 1] : '');
const cliHost = (cliArgs.find((a) => a.startsWith('--host=')) || '').split('=')[1]
  || (cliArgs.includes('--host') ? cliArgs[cliArgs.indexOf('--host') + 1] : '');
const PORT = Number(cliPort) || process.env.PORT || 3000;
const HOST = cliHost || process.env.HOST || undefined;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Validate sensitive config at startup (never log secret values)
function validateEnv() {
  const adminKey = getAdminKey();
  if (NODE_ENV === 'production') {
    if (!adminKey || adminKey.length < 16) {
      console.warn(
        '[SECURITY] In production, set a strong ADMIN_KEY (min 16 chars) in .env to enable the admin panel. ' +
        'See .env.example.'
      );
    }
  }
  // Never log ADMIN_KEY, TURN_PASSWORD, or any env value that could be secret
}
validateEnv();

function countryFromIP(ip) {
  const parsed = geoip.lookup(ip);
  return parsed?.country || null;
}

const GROUP_MAX = 4;
const PAIR_MAX = 2;
/** Max WebRTC signaling messages per socket per rolling minute */
const SIGNAL_MAX_PER_MINUTE = 400;

// Runtime feature flags / settings
const settings = {
  adsEnabled: false,
  allowDevTools: false,
  maintenanceMode: false,
  safetyAiEnabled: true,
  coinsEnabled: true,
  guestRegistration: true,
  adScripts: {
    hero: '',
    sidebar: '',
    footer: '',
    chat_banner: '',
    chat_sidebar: '',
  }
};

// interestKey -> roomId (for groups: "interest_mode")
const interestToRoom = new Map();
const rooms = new Map();
const users = new Map();
// 1:1 queues: mode -> [{ socketId, userData, interest }] (memory fallback; Redis when REDIS_URL set)
const pairQueues = { text: [], video: [] };
const matchQueue = createMatchQueue();
const infra = createInfra();
// Group queues: interestKey -> [{ socketId, userData }]
const groupQueues = new Map();

// Admin & Safety State
const blockedIps = new Set();
const warnedIps = new Set();
const userBlocks = new Map(); // ip -> Set of blocked IPs (user-level block list)
const reports = [];
const stats = { totalMessages: 0, totalConnections: 0, uniqueIps: new Set() };
const errorLogs = []; // Buffer for NVIDIA AI to analyze
function logSystemError(module, error, context = {}) {
  const log = { id: Date.now(), timestamp: new Date(), module, message: error.message || error, context };
  errorLogs.push(log);
  if (errorLogs.length > 50) errorLogs.shift();
  console.error(`[SYSTEM ERROR][${module}]`, error);
}

/**
 * Wrap a socket handler so async failures are logged and surfaced to the caller
 * as an `error` event instead of becoming unhandled rejections.
 */
function wrapSocketHandler(socket, eventName, fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (err) {
      logSystemError(`socket:${eventName}`, err, { socketId: socket.id });
      try { socket.emit('error', { message: 'Something went wrong. Please try again.' }); } catch { /* ignore */ }
    }
  };
}

/** Timing-safe string comparison for admin-key style secrets. */
function safeEqualKeys(provided, expected) {
  try {
    const a = Buffer.from(String(expected || ''), 'utf8');
    const b = Buffer.from(String(provided || ''), 'utf8');
    return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

// --- Targeted socket delivery (no global broadcasts of privileged data) ---
const ADMIN_ROOM = 'mm-admin-sockets';

function emitToAdmins(event, payload) {
  io.to(ADMIN_ROOM).emit(event, payload);
}

/** Socket ids belonging to a creator account (by creator id, referral code, or authorized IP). */
function creatorSocketIds(creator) {
  const ids = [];
  if (!creator) return ids;
  for (const [sid, u] of users.entries()) {
    if (creator.id && u.creatorData?.id === creator.id) { ids.push(sid); continue; }
    if (creator.referral_code && u.creatorData?.referral_code === creator.referral_code) { ids.push(sid); continue; }
    if (Array.isArray(creator.authorized_ips) && u.ip && creator.authorized_ips.includes(u.ip)) ids.push(sid);
  }
  return ids;
}

function emitToCreator(creator, event, payload) {
  for (const sid of creatorSocketIds(creator)) io.to(sid).emit(event, payload);
}

/** Resolve a creator by referral code and emit only to that creator's sockets. */
async function emitToCreatorByReferralCode(referralCode, event, payload) {
  const code = String(referralCode || '').trim();
  if (!code) return;
  let creator = null;
  try {
    if (supabase) {
      const { data } = await supabase.from('creators').select('id, referral_code, authorized_ips').eq('referral_code', code).maybeSingle();
      creator = data;
    } else {
      const c = localDb.creators.find((x) => x.referral_code === code);
      creator = c ? { id: c.id, referral_code: c.referral_code, authorized_ips: c.authorized_ips } : null;
    }
  } catch { /* fall through to in-memory matching only */ }
  for (const [sid, u] of users.entries()) {
    if (u.creatorData?.referral_code === code) { io.to(sid).emit(event, payload); continue; }
    if (creator?.id && u.creatorData?.id === creator.id) { io.to(sid).emit(event, payload); continue; }
    if (Array.isArray(creator?.authorized_ips) && u.ip && creator.authorized_ips.includes(u.ip)) io.to(sid).emit(event, payload);
  }
}

// --- SSRF guards for /api/validate-url ---
const validateUrlBuckets = new Map(); // ip -> { start, count }
const VALIDATE_URL_MAX_PER_MINUTE = 10;

/** Platforms that block datacenter HEAD/GET — format + host check is enough. */
const SOCIAL_PROFILE_HOSTS = [
  'instagram.com',
  'cdninstagram.com',
  'youtube.com',
  'youtu.be',
  'tiktok.com',
  'twitter.com',
  'x.com',
  'snapchat.com',
  'facebook.com',
  'fb.com',
  'twitch.tv',
  'linkedin.com',
  'reddit.com',
  'threads.net',
];

function isSocialProfileHost(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^www\./, '');
  return SOCIAL_PROFILE_HOSTS.some((s) => h === s || h.endsWith(`.${s}`));
}

/** HTTP statuses that mean “host answered” even if the page is gated. */
function isReachableHttpStatus(status) {
  const s = Number(status) || 0;
  if (s <= 0) return false;
  if (s < 400) return true;
  // Bot walls / auth walls / method not allowed — still proves the URL exists.
  return [401, 403, 405, 429, 999].includes(s);
}

function isPrivateOrReservedIp(ip) {
  if (!ip) return true;
  let v4 = ip.includes('.') ? ip : null;
  if (!v4 && ip.toLowerCase().startsWith('::ffff:')) v4 = ip.slice(7);
  if (v4) {
    const parts = v4.split('.').map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;                 // 0/8, 10/8, loopback
    if (a === 169 && b === 254) return true;                           // link-local
    if (a === 172 && b >= 16 && b <= 31) return true;                  // 172.16/12
    if (a === 192 && b === 168) return true;                           // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true;                 // CGNAT 100.64/10
    return false;
  }
  // IPv6
  const first = parseInt(ip.split(':')[0] || '0', 16);
  if (Number.isNaN(first)) return true;
  if (ip === '::1' || ip === '::') return true;                        // loopback / unspecified
  if ((first & 0xffc0) === 0xfe80) return true;                        // fe80::/10 link-local
  if ((first & 0xfe00) === 0xfc00) return true;                        // fc00::/7 unique-local
  return false;
}

async function resolvesToPrivateIp(hostname) {
  const lower = String(hostname || '').toLowerCase();
  if (!lower || lower === 'localhost' || lower.endsWith('.localhost') || lower.endsWith('.local') || lower.endsWith('.internal')) return true;
  try {
    const addrs = await dnsPromises.lookup(lower, { all: true, verbatim: true });
    if (!addrs.length) return true;
    return addrs.some((a) => isPrivateOrReservedIp(a.address));
  } catch {
    return true; // unresolvable hosts are treated as unsafe
  }
}

/**
 * Server-authoritative coin price table for `spend-coins` / `/api/user/spend`.
 * number    -> always charge this price (client-declared amount ignored)
 * [numbers] -> client amount must be one of these fixed prices
 * Any reason not listed here is rejected (no free-form spends => no minting).
 * Mirrors the emits in client/src (GroupVideoRoom.jsx, VideoChat.jsx).
 */
const SPEND_PRICES = {
  'screenshare': 50,
  'Premium Video Filter (60s)': 15,
  '3d-emoji': 5,
  'media-share': [10, 15],
  'room-boost': 25,
};
const SPEND_MAX_AMOUNT = 10000; // absolute sanity cap, even for table-priced spends

const ipActivity = new Map(); // ip -> { firstSeen, lastSeen, persisted }
const coinUsers = new Map(); // ip -> { coins, last_claim, streak, ... }
/** Assigned after registerEconomy — used by claim/spend/admin routes via late binding. */
let economy = null;

async function getCoinUser(ip) {
  if (coinUsers.has(ip)) return coinUsers.get(ip);
  if (supabase) {
    const { data } = await supabase.from('user_coins').select('*').eq('ip', ip).single();
    if (data) {
      coinUsers.set(ip, data);
      return data;
    }
  }
  // Newcomer: Initial 3-min hurdle for registration
  const newcomer = {
    ip,
    coins: 0,
    last_claim: 0,
    streak: 1,
    last_claim_date: null,
    active_seconds: 0, // Reset when hitting 3600 (1 hour)
    total_active_seconds: 0,
    registered: false
  };
  coinUsers.set(ip, newcomer);
  return newcomer;
}

async function persistCoinUser(ip) {
  const u = coinUsers.get(ip);
  if (!u) return;
  const activity = ipActivity.get(ip);
  if (u.registered) return;

  // 3-minute threshold for initial registry (180 seconds)
  if (activity && (Date.now() - activity.firstSeen > 180000)) {
    await updateCoinUser(ip, { registered: true });
    if (activity) activity.persisted = true;

    let balance = Math.max(0, Number(coinUsers.get(ip)?.coins) || 0);
    if (typeof economy !== 'undefined' && economy?.credit) {
      const res = await economy.credit(ip, 40, 'Initial Registration (3m)', { registration: true });
      balance = res.ok ? res.balance : balance + 40;
    } else {
      balance += 40;
      await updateCoinUser(ip, { coins: balance });
    }

    if (supabase) {
      await supabase.from('activity_logs').insert({ ip, action: 'registered_ip', amount: 40, details: 'Identity Verified (3m Cycle)' });
    } else {
      saveLocalDb();
    }

    const fresh = coinUsers.get(ip);
    for (const [sid, user] of users.entries()) {
      if (user.ip === ip) {
        io.to(sid).emit('coins-updated', {
          coins: fresh?.coins ?? balance,
          reason: 'Initial Registration (3m)',
          registered: true,
          activeSeconds: fresh?.active_seconds || 0,
        });
      }
    }
    console.log(`[DB] Registered IP ${ip} - 40 Coins Synthesized.`);
  }
}

async function updateCoinUser(ip, updates) {
  const u = await getCoinUser(ip);
  Object.assign(u, updates);
  coinUsers.set(ip, u);

  // Always use upsert for spent coins/activity to ensure persistence
  const activity = ipActivity.get(ip);
  if (activity?.persisted || u.registered) {
    if (supabase) {
      // USE UPSERT instead of UPDATE to ensure records are created if missing
      await supabase.from('user_coins').upsert(u);
    } else {
      saveLocalDb();
    }
  }
}

const statsHistory = []; // { timestamp, users, rooms }
const statsInterval = setInterval(() => {
  statsHistory.push({
    timestamp: Date.now(),
    users: users.size,
    rooms: rooms.size,
  });
  if (statsHistory.length > 60) statsHistory.shift(); // Keep last hour
}, 60000);

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function sanitize(str, max = 50) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, max).replace(/[<>]/g, '');
}

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim();
  const ip = req.ip || req.connection?.remoteAddress || '';
  return ip === '::1' ? '127.0.0.1' : ip;
}

const MIN_CREATOR_WITHDRAWAL_COINS = 2000;

/**
 * Resolve an approved creator by X-Creator-Token / Bearer referral code, else by authorized IP.
 */
async function getApprovedCreatorForRequest(req) {
  const ip = getClientIp(req);
  const auth = req.headers.authorization || '';
  const token = String(req.headers['x-creator-token'] || req.headers['x-creator-referral'] || '').trim()
    || (auth.startsWith('Bearer ') ? auth.slice(7).trim() : '');

  if (token) {
    let c = null;
    if (supabase) {
      const { data } = await supabase.from('creators').select('*').eq('referral_code', token).maybeSingle();
      c = data;
    } else {
      c = localDb.creators.find((x) => x.referral_code === token);
    }
    if (c && c.status === 'approved') return { creator: c, ip, via: 'token' };
  }

  let c2 = null;
  if (supabase) {
    const { data } = await supabase
      .from('creators')
      .select('*')
      .contains('authorized_ips', [ip])
      .eq('status', 'approved')
      .maybeSingle();
    c2 = data;
  } else {
    c2 = localDb.creators.find((x) => x.authorized_ips.includes(ip) && x.status === 'approved');
  }
  return { creator: c2 || null, ip, via: c2 ? 'ip' : null };
}

/** Resolve creator by referral token (any status) for notifications / status checks. */
async function getCreatorForRequest(req) {
  const ip = getClientIp(req);
  const auth = req.headers.authorization || '';
  const token = String(req.headers['x-creator-token'] || req.headers['x-creator-referral'] || '').trim()
    || (auth.startsWith('Bearer ') ? auth.slice(7).trim() : '');

  if (token) {
    let c = null;
    if (supabase) {
      const { data } = await supabase.from('creators').select('*').eq('referral_code', token).maybeSingle();
      c = data;
    } else {
      c = localDb.creators.find((x) => x.referral_code === token);
    }
    if (c) return { creator: c, ip, via: 'token' };
  }

  let c2 = null;
  if (supabase) {
    const { data } = await supabase.from('creators').select('*').contains('authorized_ips', [ip]).maybeSingle();
    c2 = data;
  } else {
    c2 = localDb.creators.find((x) => x.authorized_ips.includes(ip));
  }
  return { creator: c2 || null, ip, via: c2 ? 'ip' : null };
}

const notifyCtx = () => ({
  supabase,
  localDb,
  saveLocalDb,
  io,
  emitToCreator: (referralCode, event, payload) => {
    emitToCreatorByReferralCode(referralCode, event, payload).catch((e) => console.error('[NOTIFY] targeted emit failed', e.message));
  },
});

async function notifyCreatorAction(creator, payload) {
  if (!creator?.id) return;
  await creatorNotifications.pushCreatorNotification(notifyCtx(), {
    creatorId: creator.id,
    referralCode: creator.referral_code,
    ...payload,
  });
}

async function resolveCreatorIdentity(userData, data, ip) {
  if (!userData) return;
  const token = String(data?.creatorToken || data?.referralCode || '').trim();
  if (token) {
    let creator = null;
    if (supabase) {
      const { data: row } = await supabase.from('creators').select('*').eq('referral_code', token).eq('status', 'approved').maybeSingle();
      creator = row;
    } else {
      creator = localDb.creators.find((c) => c.referral_code === token && c.status === 'approved');
    }
    if (creator) {
      userData.isCreator = true;
      userData.nickname = creator.handle_name;
      userData.creatorData = creator;
      await linkCreatorIpIfNeeded(creator, ip);
    }
  }
  if (userData.isCreator) {
    if (userData.creatorData?.handle_name) {
      userData.nickname = userData.creatorData.handle_name;
    } else if (userData.nickname && userData.nickname !== 'Anonymous') {
      let creator = null;
      if (supabase) {
        const { data: row } = await supabase.from('creators').select('*').ilike('handle_name', userData.nickname).eq('status', 'approved').maybeSingle();
        creator = row;
      } else {
        creator = localDb.creators.find((c) => c.handle_name.toLowerCase() === userData.nickname.toLowerCase() && c.status === 'approved');
      }
      if (creator) {
        userData.creatorData = creator;
        userData.nickname = creator.handle_name;
      }
    }
  }
}

function buildCreatorIntroMessage(roomId, creatorSocketId, creatorUser) {
  const handle = creatorUser.creatorData?.handle_name || creatorUser.nickname || 'Creator';
  return {
    id: generateId('msg'),
    roomId,
    socketId: creatorSocketId,
    nickname: handle,
    text: `Verified creator @${handle} connected. View their profile to follow and get updates.`,
    ts: Date.now(),
    isCreator: true,
    isIntro: true,
    creatorHandle: handle,
    profilePath: `/creator/${encodeURIComponent(handle)}`,
  };
}

function pushRoomChatMessage(room, entry) {
  room.messages = room.messages || [];
  room.messages.push(entry);
  if (room.messages.length > MESSAGE_HISTORY) room.messages = room.messages.slice(-MESSAGE_HISTORY);
  io.to(room.id).emit('chat-message', { roomId: room.id, ...entry });
}

async function linkCreatorIpIfNeeded(creator, ip) {
  if (!creator || !ip) return;
  if (!Array.isArray(creator.authorized_ips)) creator.authorized_ips = [];
  if (creator.authorized_ips.includes(ip)) return;
  creator.authorized_ips.push(ip);
  if (supabase) {
    await supabase.from('creators').update({ authorized_ips: creator.authorized_ips }).eq('id', creator.id);
  } else {
    saveLocalDb();
  }
}

function interestKey(interest, mode) {
  return `${interest}_${mode}`;
}

/** Normalize interest tags from primary + optional list (excludes "general"). */
function parseInterests(data, primaryInterest, sanitizeFn) {
  const set = new Set();
  const add = (v) => {
    const s = sanitizeFn(String(v || '').toLowerCase(), 30);
    if (s && s !== 'general') set.add(s);
  };
  add(primaryInterest);
  if (Array.isArray(data?.interests)) data.interests.forEach(add);
  return [...set];
}

/** Intersection of two normalized interest lists. */
function computeSharedInterests(listA, listB, primaryInterest) {
  const b = new Set(listB || []);
  const shared = (listA || []).filter((x) => b.has(x));
  const primary = sanitize(String(primaryInterest || '').toLowerCase(), 30);
  if (primary && primary !== 'general' && (listA || []).includes(primary) && b.has(primary) && !shared.includes(primary)) {
    shared.unshift(primary);
  }
  return shared.slice(0, 6);
}

function getRoomByInterestKey(key, returnEvenIfFull = false) {
  const roomId = interestToRoom.get(key);
  if (!roomId) return null;
  const room = rooms.get(roomId);
  if (!room) {
    interestToRoom.delete(key);
    return null;
  }
  if (!returnEvenIfFull && room.users.size >= room.maxSize) {
    return null;
  }
  return room;
}

function getAnyRoomByMode(mode) {
  // FILL STRATEGY: Prioritize rooms with 3/4 members, then 2/4, then 1/4.
  const eligible = Array.from(rooms.values()).filter(r => r.mode === mode && r.users.size < r.maxSize);
  eligible.sort((a, b) => b.users.size - a.users.size);
  return eligible[0] || null;
}

const MESSAGE_HISTORY = 50;

function createRoom(interest, mode, socketId, userData, maxSize = GROUP_MAX) {
  const roomId = generateId('room');
  const key = interestKey(interest, mode);
  const u = users.get(socketId);
  const room = {
    id: roomId,
    interest,
    mode,
    interestKey: mode === 'group_text' || mode === 'group_video' ? key : null,
    maxSize,
    users: new Set([socketId]),
    participants: [{ socketId, userId: userData.id, nickname: userData.nickname, country: userData.country, isCreator: !!u?.isCreator }],
    messages: [],
    createdAt: Date.now(),
    hostId: socketId,
  };
  rooms.set(roomId, room);
  if (room.interestKey) interestToRoom.set(key, roomId);
  return room;
}

function addUserToRoom(room, socketId, userData) {
  if (room.users.size >= room.maxSize) return false;
  const u = users.get(socketId);
  room.users.add(socketId);
  room.participants.push({ socketId, userId: userData.id, nickname: userData.nickname, country: userData.country, isCreator: !!u?.isCreator });
  return true;
}

function terminateUserSession(socketId, message, io, { blockIp = false } = {}) {
  const userData = users.get(socketId);
  if (!userData) return { ok: false, error: 'User not found' };

  const ip = userData.ip;
  const msg = message || 'Your session was terminated by a moderator for violating community guidelines.';

  for (const roomId of [...(userData.rooms || [])]) {
    removeUserFromRoom(socketId, roomId, io);
    io.sockets.sockets.get(socketId)?.leave(roomId);
    userData.rooms.delete(roomId);
  }

  void matchQueue.removeFromQueues(socketId);
  for (const [key, q] of groupQueues.entries()) {
    groupQueues.set(key, q.filter((e) => e.socketId !== socketId));
  }

  adminLiveMonitor.clearMonitorPanel(socketId);
  io.to(socketId).emit('session-terminated-by-admin', { message: msg });

  if (blockIp && ip) blockedIps.add(ip);

  setTimeout(() => {
    io.sockets.sockets.get(socketId)?.disconnect(true);
  }, 2000);

  return { ok: true, ip };
}

function removeUserFromRoom(socketId, roomId, io) {
  const room = rooms.get(roomId);
  if (!room) return;
  room.users.delete(socketId);
  room.participants = room.participants.filter((p) => p.socketId !== socketId);
  const userData = users.get(socketId);
  if (room.users.size > 0) {
    io.to(roomId).emit('user-left', {
      socketId,
      userId: socketId,
      nickname: userData?.nickname || 'Anonymous',
      roomId,
      participantCount: room.users.size,
    });

    // Check if anyone is waiting in the queue for this group
    if (room.interestKey) {
      const q = groupQueues.get(room.interestKey) || [];
      if (q.length > 0) {
        // Pop next available valid user
        while (q.length > 0) {
          const nextUser = q.shift();
          const nextSocket = io.sockets.sockets.get(nextUser.socketId);
          if (nextSocket && users.has(nextUser.socketId)) {
            // Let them join
            const actuallyAdded = addUserToRoom(room, nextUser.socketId, nextUser.userData);
            if (actuallyAdded) {
              nextUser.userData.rooms.add(room.id);
              nextSocket.join(room.id);
              // Send them joined events
              const peers = room.participants
                .filter((p) => p.socketId !== nextUser.socketId)
                .map((p) => {
                  const u = users.get(p.socketId);
                  return { socketId: p.socketId, userId: u?.id, nickname: p.nickname, country: u?.country };
                });
              nextSocket.emit('group-joined', {
                roomId: room.id,
                mode: room.mode,
                interest: room.interest,
                participantCount: room.users.size,
                country: nextUser.userData.country,
              });
              nextSocket.emit('existing-peers', { roomId: room.id, peers, total: peers.length });
              nextSocket.emit('chat-history', { roomId: room.id, messages: (room.messages || []).slice(-MESSAGE_HISTORY) });
              nextSocket.to(room.id).emit('user-joined', {
                roomId: room.id,
                socketId: nextUser.socketId,
                userId: nextUser.userData.id,
                nickname: nextUser.userData.nickname,
                country: nextUser.userData.country,
                participantCount: room.users.size,
              });
              break;
            }
          }
        }
      }
    }
  } else {
    rooms.delete(roomId);
    if (room.interestKey) interestToRoom.delete(room.interestKey);
  }
}

// Regional cache for O(1) broadcast
let regionalCache = { in: 0, us: 0, eu: 0, ot: 0 };
let lastRegionFullScan = 0;

function emitOnlineCount() {
  const now = Date.now();
  // Only do expensive full scan every 60 seconds
  if (now - lastRegionFullScan > 60000) {
    const regions = { in: 0, us: 0, eu: 0, ot: 0 };
    const EU_CODES = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB'];
    users.forEach(u => {
      const c = u.country;
      if (c === 'IN') regions.in++;
      else if (c === 'US') regions.us++;
      else if (EU_CODES.includes(c)) regions.eu++;
      else regions.ot++;
    });
    regionalCache = regions;
    lastRegionFullScan = now;
  }

  io.emit('online_count', {
    count: users.size,
    regions: regionalCache,
    timestamp: now
  });
}

// Express app
const app = express();
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// One origin allowlist for BOTH HTTP CORS and Socket.IO CORS. Keeping these in
// sync matters: a domain allowed over HTTP but not for sockets shows up to
// users as an endless "connecting…" state.
const ALLOWED_ORIGINS = NODE_ENV === 'production'
  ? [
    'https://helloooo.site',
    'https://www.helloooo.site',
    'https://manamingle.site',
    'https://www.manamingle.site',
    process.env.FRONTEND_ORIGIN,
    'http://localhost:5173',
  ].filter(Boolean)
  : true;

app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
}));

app.use(express.json({ limit: '2mb' }));

// Clearer response when body exceeds limit (e.g. huge avatar data-URL)
app.use((err, req, res, next) => {
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({
      error: 'Upload too large. Use a smaller avatar photo (under ~500KB after compression).',
    });
  }
  return next(err);
});

app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many requests' },
  standardHeaders: true,
}));

const creatorRegisterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many creator applications. Try again later.' },
  standardHeaders: true,
});

const creatorLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
});

// AI endpoints proxy to a paid external provider; the generic 120/min limit is
// too loose for calls that cost money per request. Cap them tightly per IP.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'AI is busy. Please slow down and try again shortly.' },
  standardHeaders: true,
});
app.use('/api/ai', aiLimiter);

// Public settings (for client feature flags like ads, dev tools, ad HTML slots)
app.get('/api/settings', (req, res) => {
  res.json({
    adsEnabled: settings.adsEnabled,
    allowDevTools: settings.allowDevTools,
    adScripts: { ...settings.adScripts },
  });
});

// 3-Minute Activity Reward (40 Coins) — locked ledger path
app.post('/api/coins/activity-reward', async (req, res) => {
  const ip = getClientIp(req);
  const now = Date.now();
  const MIN_INTERVAL = 180000;

  try {
    if (!economy?.runLocked || !economy?.applyCredit) {
      return res.status(503).json({ error: 'Economy unavailable' });
    }
    const activity = ipActivity.get(ip);
    if (!activity) return res.status(403).json({ error: 'Uplink not recognized' });

    const result = await economy.runLocked(ip, async () => {
      const cUser = await getCoinUser(ip);
      const lastClaim = Number(cUser.last_reward_claimed) || 0;
      const timeSinceLast = now - (lastClaim || activity.firstSeen);
      if (timeSinceLast < MIN_INTERVAL) {
        return { ok: false, status: 429, error: 'Sync cycle incomplete. Wait for uplink.' };
      }
      await updateCoinUser(ip, {
        last_reward_claimed: now,
        registered: true,
      });
      const credited = await economy.applyCredit(ip, 40, 'activity_reward_3m');
      if (!credited.ok) return { ok: false, status: 400, error: credited.error || 'Credit failed' };
      if (supabase) {
        supabase.from('activity_logs').insert({ ip, action: 'claimed_3m_bonus', amount: 40 }).then(() => {}).catch(() => {});
      }
      return { ok: true, balance: credited.balance };
    });

    if (!result.ok) {
      return res.status(result.status || 400).json({ error: result.error });
    }
    res.json({ success: true, balance: result.balance, message: 'Activity recognized. 40 Coins synthesized.' });
  } catch (e) {
    res.status(500).json({ error: 'Economy link failure' });
  }
});

// TURN credentials — see also consolidated handler below (line ~1391)
// Primary Admin Hub consolidated further down at line 1068

app.post('/api/admin/coins/update', requireAdmin, async (req, res) => {
  const { ip, amount, set, reason } = req.body || {};
  const rawIp = String(ip || '').trim().slice(0, 64);
  if (!rawIp) return res.status(400).json({ error: 'IP required' });

  const amt = Math.floor(Number(amount));
  if (!Number.isFinite(amt)) return res.status(400).json({ error: 'amount required' });
  const MAX = 100000;
  if (Math.abs(amt) > MAX) return res.status(400).json({ error: `Amount capped at ±${MAX}` });

  try {
    if (!economy?.credit || !economy?.debit || !economy?.setBalance) {
      return res.status(503).json({ error: 'Economy unavailable' });
    }
    const note = sanitize(String(reason || 'Admin Adjustment'), 80);
    let result;
    if (set) {
      if (amt < 0) return res.status(400).json({ error: 'Set balance cannot be negative' });
      result = await economy.setBalance(rawIp, amt, note, { admin: true });
    } else if (amt === 0) {
      return res.status(400).json({ error: 'non-zero amount required' });
    } else if (amt > 0) {
      result = await economy.credit(rawIp, amt, note, { admin: true });
    } else {
      result = await economy.debit(rawIp, Math.abs(amt), note, { admin: true });
    }
    if (!result?.ok) {
      return res.status(400).json({ error: result?.error || 'Update failed' });
    }
    if (typeof moderation !== 'undefined' && moderation?.audit) {
      moderation.audit('admin_coin_adjust', { ip: rawIp, amount: amt, set: !!set, reason: note });
    }
    res.json({ success: true, newBalance: result.balance });
  } catch (e) {
    res.status(500).json({ error: 'Update failed' });
  }
});

app.post('/api/admin/end-room', requireAdmin, async (req, res) => {
  const { roomId, message } = req.body || {};
  if (!roomId) return res.status(400).json({ error: 'Room ID required' });
  const room = rooms.get(roomId);
  if (room) {
    const msg = message || 'This session was terminated by administrative protocol.';
    io.to(roomId).emit('room-ended-by-admin', { message: msg });
    [...room.users].forEach((sid) => {
      adminLiveMonitor.clearMonitorPanel(sid);
      io.sockets.sockets.get(sid)?.leave(roomId);
    });
    rooms.delete(roomId);
    if (room.interestKey) interestToRoom.delete(room.interestKey);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Room not found' });
  }
});

app.get('/api/admin/live-panels', requireAdmin, (req, res) => {
  res.json(adminLiveMonitor.buildLivePanelsSnapshot(users, rooms));
});

app.post('/api/admin/warn-user', requireAdmin, (req, res) => {
  const { socketId, message } = req.body || {};
  if (!socketId) return res.status(400).json({ error: 'socketId required' });
  const user = users.get(socketId);
  if (!user) return res.status(404).json({ error: 'User not online' });
  if (user.ip) warnedIps.add(user.ip);
  io.to(socketId).emit('content-flagged', {
    message: message || '⚠️ WARNING: Your behavior has been flagged by a moderator. Please follow community rules.',
  });
  res.json({ success: true, ip: user.ip });
});

app.post('/api/admin/terminate-user', requireAdmin, (req, res) => {
  const { socketId, message, blockIp } = req.body || {};
  if (!socketId) return res.status(400).json({ error: 'socketId required' });
  const result = terminateUserSession(socketId, message, io, { blockIp: !!blockIp });
  if (!result.ok) return res.status(404).json({ error: result.error });
  res.json({ success: true, ip: result.ip });
});

// Debug: Supabase connection status (safe - no secrets exposed)
app.get('/api/debug/status', async (req, res) => {
  // Operational detail (storage backend, unique-IP counts) is admin-only in
  // production; /health stays public for the platform health check.
  if (NODE_ENV === 'production' && !isAdminRequest(req)) {
    return res.status(404).json({ error: 'Not found' });
  }
  const result = {
    supabase_client_initialized: !!supabase,
    storage_mode: supabase ? 'supabase' : 'local_json',
    env: process.env.NODE_ENV || 'unknown',
    uptime_seconds: Math.floor(process.uptime()),
    unique_ips: stats.uniqueIps.size
  };
  res.json(result);
});

// --- CREATOR MATRIX HUB (High Priority) ---
// Background URL validator (avoids CORS and opening new tabs)
app.post('/api/validate-url', async (req, res) => {
  let { url } = req.body || {};
  if (!url) return res.status(400).json({ valid: false, error: 'No URL provided' });

  // Per-IP rate limit: this endpoint is an SSRF/probing primitive without it.
  const clientIp = getClientIp(req);
  const now = Date.now();
  let bucket = validateUrlBuckets.get(clientIp);
  if (!bucket || now - bucket.start > 60000) {
    bucket = { start: now, count: 0 };
    validateUrlBuckets.set(clientIp, bucket);
  }
  bucket.count += 1;
  if (validateUrlBuckets.size > 5000) validateUrlBuckets.clear(); // bound memory
  if (bucket.count > VALIDATE_URL_MAX_PER_MINUTE) {
    return res.status(429).json({ valid: false, error: 'Too many validation requests' });
  }

  let parsed;
  try {
    const raw = String(url).trim();
    parsed = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return res.json({ valid: false, error: 'Invalid URL format' });
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return res.json({ valid: false, error: 'Only http(s) URLs are allowed' });
  }
  if (await resolvesToPrivateIp(parsed.hostname)) {
    return res.json({ valid: false, error: 'URL host is not allowed' });
  }

  // Instagram / TikTok / YouTube / X block most server IPs — accept well-formed social URLs.
  if (isSocialProfileHost(parsed.hostname)) {
    return res.json({
      valid: true,
      status: 200,
      mode: 'social_format',
      normalized: parsed.href,
      note: 'Social profile URL accepted (platforms block server probes).',
    });
  }

  const doFetch = async (method) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      return await fetch(parsed.href, {
        method,
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    let response;
    try {
      response = await doFetch('HEAD');
      // Some CDNs reject HEAD with 405 — fall through to GET.
      if (response.status === 405 || response.status === 501) {
        response = await doFetch('GET');
      }
    } catch {
      try {
        response = await doFetch('GET');
      } catch {
        return res.json({ valid: false, error: 'Unreachable' });
      }
    }
    if (response.url) {
      let finalUrl;
      try {
        finalUrl = new URL(response.url);
      } catch {
        return res.json({ valid: false, error: 'Invalid redirect target' });
      }
      if (!['http:', 'https:'].includes(finalUrl.protocol) || await resolvesToPrivateIp(finalUrl.hostname)) {
        return res.json({ valid: false, error: 'Redirect target is not allowed' });
      }
      // Redirect landed on a social host (e.g. bit.ly → instagram) — accept.
      if (isSocialProfileHost(finalUrl.hostname)) {
        return res.json({
          valid: true,
          status: response.status,
          mode: 'social_redirect',
          normalized: finalUrl.href,
        });
      }
    }
    const reachable = isReachableHttpStatus(response.status);
    res.json({
      valid: reachable,
      status: response.status,
      mode: 'live',
      error: reachable ? undefined : `HTTP ${response.status}`,
    });
  } catch (e) {
    res.json({ valid: false, error: 'Unreachable' });
  }
});

app.post('/api/creators/register', creatorRegisterLimiter, async (req, res) => {
  const { handle, platform, link, email, password } = req.body || {};
  const ip = getClientIp(req);

  const rate = creatorSecurity.checkRegisterRate(ip);
  if (!rate.allowed) {
    return res.status(429).json({ error: `Too many applications from this network. Retry in ${rate.retryAfterSec}s.` });
  }

  const handleCheck = creatorSecurity.validateHandle(handle);
  if (!handleCheck.ok) return res.status(400).json({ error: handleCheck.error });

  const platformCheck = creatorSecurity.validatePlatform(platform);
  if (!platformCheck.ok) return res.status(400).json({ error: platformCheck.error });

  const linkCheck = creatorSecurity.validateProfileLink(link, handleCheck.handle);
  if (!linkCheck.ok) return res.status(400).json({ error: linkCheck.error });

  const emailCheck = creatorSecurity.validateEmail(email);
  if (!emailCheck.ok) return res.status(400).json({ error: emailCheck.error });

  const passCheck = creatorSecurity.validatePassword(password);
  if (!passCheck.ok) return res.status(400).json({ error: passCheck.error });

  const password_hash = await creatorSecurity.hashPassword(passCheck.password);

  const pin = Math.floor(1000 + Math.random() * 9000);
  const referral_code = `${handleCheck.handle.replace(/\s+/g, '')}${pin}`;
  const entry = {
    id: generateId('creator'),
    handle_name: sanitize(handleCheck.handle, 30),
    platform: sanitize(platformCheck.platform, 20),
    profile_link: sanitize(linkCheck.link, 200),
    email: emailCheck.email,
    authorized_ips: [ip],
    referral_code,
    status: 'pending',
    coins_earned: 0,
    earnings_rs: 0,
    referral_count: 0,
    followers_count: 0,
    follower_ips: [],
    tips_received_total: 0,
    featured: false,
    avatar_url: null,
    bio: '',
    password: null,
    password_hash,
    created_at: new Date().toISOString()
  };

  /** Insert with retries that strip unknown columns (older Supabase schemas). */
  async function insertCreatorRow(row) {
    const payload = { ...row };
    if (payload.email == null) delete payload.email;
    if (payload.avatar_url == null) delete payload.avatar_url;

    for (let attempt = 0; attempt < 8; attempt++) {
      const { error } = await supabase.from('creators').insert(payload);
      if (!error) return { ok: true };

      // Unique constraint (handle / referral_code / email)
      if (error.code === '23505') {
        return { ok: false, conflict: true, message: error.message };
      }

      const msg = String(error.message || error.details || '');
      const colMatch =
        msg.match(/Could not find the ['"](\w+)['"] column/i) ||
        msg.match(/column ["'](\w+)["'] of relation/i) ||
        msg.match(/unknown column ["']?(\w+)["']?/i);
      if (colMatch && Object.prototype.hasOwnProperty.call(payload, colMatch[1])) {
        const col = colMatch[1];
        console.warn(`[CREATORS] register: stripping missing column "${col}" and retrying`);
        if (col === 'password_hash' && payload.password_hash) {
          // Keep credentials usable on schemas that only have `password`.
          payload.password = payload.password_hash;
        }
        delete payload[col];
        continue;
      }

      console.error('[CREATORS] register insert failed', error.code, msg);
      return { ok: false, message: msg || 'Database save failed' };
    }
    return { ok: false, message: 'Database save failed after schema retries' };
  }

  try {
    if (supabase) {
      const { data: existing } = await supabase.from('creators').select('id').ilike('handle_name', entry.handle_name).maybeSingle();
      if (existing) return res.status(400).json({ error: 'Handle already registered.' });

      const inserted = await insertCreatorRow(entry);
      if (!inserted.ok) {
        if (inserted.conflict) return res.status(400).json({ error: 'Handle or access code already registered.' });
        return res.status(500).json({ error: 'Database save failed. Please try again.' });
      }
    } else {
      const existing = localDb.creators.find(c => c.handle_name.toLowerCase() === entry.handle_name.toLowerCase());
      if (existing) return res.status(400).json({ error: 'Handle already registered.' });
      localDb.creators.push(entry);
      saveLocalDb();
    }

    res.json({
      success: true,
      message: 'Application submitted. Save your access code and use your password to log in after approval.',
      accessCode: referral_code,
    });

    // Side-effects after response — never turn a successful register into a 500.
    notifyCreatorAction(entry, {
      type: 'application_submitted',
      title: 'Application received',
      message: 'Your creator application is pending review. You will be notified here when an admin updates your status.',
      important: false,
    }).catch((e) => console.error('[CREATORS] notify failed', e.message));

    try {
      emitToAdmins('creator-new-application', {
        id: entry.id,
        handle_name: entry.handle_name,
        platform: entry.platform,
        profile_link: entry.profile_link,
        email: entry.email,
        referral_code: entry.referral_code,
        status: 'pending',
        coins_earned: 0,
        referral_count: 0,
        created_at: entry.created_at
      });
    } catch (e) {
      console.error('[CREATORS] admin emit failed', e.message);
    }

    creatorEmail.notifyAdminNewApplication(entry).catch((e) => console.error('[EMAIL] admin notify failed', e.message));
  } catch (e) {
    console.error('[CREATORS] register failed', e);
    if (!res.headersSent) res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/creators/login', creatorLoginLimiter, async (req, res) => {
  const { handle, password } = req.body || {};
  const currentIp = getClientIp(req);

  const handleCheck = creatorSecurity.validateHandle(handle);
  if (!handleCheck.ok) return res.status(400).json({ error: handleCheck.error });

  const passCheck = creatorSecurity.validatePassword(password, { forLogin: true });
  if (!passCheck.ok) return res.status(400).json({ error: passCheck.error });

  const lock = creatorSecurity.checkLoginLock(handleCheck.handle, currentIp);
  if (lock.locked) {
    return res.status(429).json({ error: `Too many failed attempts. Try again in ${lock.retryAfterSec}s.` });
  }

  try {
    let creator = null;
    if (supabase) {
      const { data } = await supabase.from('creators').select('*').ilike('handle_name', handleCheck.handle).maybeSingle();
      creator = data;
    } else {
      creator = localDb.creators.find(c => c.handle_name.toLowerCase() === handleCheck.handle.toLowerCase());
    }

    const valid = creator ? await creatorSecurity.verifyPassword(passCheck.password, creator) : false;
    if (!creator || !valid) {
      creatorSecurity.recordLoginFailure(lock.key);
      if (supabase) await supabase.from('creator_logins').insert({ handle: handleCheck.handle, ip: currentIp, success: false, reason: 'invalid_credentials' });
      return res.status(401).json({ error: 'Invalid handle or password.' });
    }

    if (creator.status !== 'approved') {
      if (supabase) await supabase.from('creator_logins').insert({ handle: handleCheck.handle, creator_id: creator.id, ip: currentIp, success: false, reason: 'pending_review' });
      return res.status(403).json({ error: creator.status === 'rejected' ? 'Application was rejected. Contact support.' : 'Application pending review.' });
    }

    if (valid === 'legacy') {
      const hash = await creatorSecurity.hashPassword(passCheck.password);
      if (supabase) {
        await supabase.from('creators').update({ password_hash: hash, password: null }).eq('id', creator.id);
      } else {
        creator.password_hash = hash;
        creator.password = null;
        saveLocalDb();
      }
      creator.password_hash = hash;
      creator.password = null;
    }

    if (!Array.isArray(creator.authorized_ips)) creator.authorized_ips = [];
    if (!creator.authorized_ips.includes(currentIp)) {
      creator.authorized_ips.push(currentIp);
      if (supabase) {
        await supabase.from('creators').update({ authorized_ips: creator.authorized_ips }).eq('id', creator.id);
      } else {
        saveLocalDb();
      }
    }

    creatorSecurity.clearLoginFailures(lock.key);
    if (supabase) await supabase.from('creator_logins').insert({ handle: handleCheck.handle, creator_id: creator.id, ip: currentIp, success: true });
    res.json({ success: true, data: creatorSecurity.stripCreatorSecrets(creator) });
  } catch (e) { res.status(500).json({ error: 'Authentication failed' }); }
});

app.post('/api/creators/forgot-password', creatorLoginLimiter, async (req, res) => {
  const { handle, referral_code: code } = req.body || {};
  const handleCheck = creatorSecurity.validateHandle(handle);
  if (!handleCheck.ok) return res.status(400).json({ error: handleCheck.error });
  const refCode = String(code || '').trim();
  if (!refCode) return res.status(400).json({ error: 'Access code is required.' });

  try {
    let creator = null;
    if (supabase) {
      const { data } = await supabase.from('creators').select('*').ilike('handle_name', handleCheck.handle).eq('referral_code', refCode).maybeSingle();
      creator = data;
    } else {
      creator = localDb.creators.find(
        (c) => c.handle_name.toLowerCase() === handleCheck.handle.toLowerCase() && c.referral_code === refCode
      );
    }

    if (creator && creator.status === 'approved' && creator.email) {
      const token = await creatorSecurity.createPasswordResetToken(supabase, localDb, saveLocalDb, creator.id);
      const resetUrl = `${creatorEmail.getFrontendUrl()}/?creator_reset=${token}`;
      await creatorEmail.notifyPasswordReset(creator, resetUrl);
    }

    res.json({
      success: true,
      message: 'If a matching approved account with email exists, a reset link was sent.',
    });
  } catch (e) {
    res.status(500).json({ error: 'Could not process reset request' });
  }
});

app.post('/api/creators/reset-password', async (req, res) => {
  const { token, password } = req.body || {};
  const passCheck = creatorSecurity.validatePassword(password);
  if (!passCheck.ok) return res.status(400).json({ error: passCheck.error });
  if (!token) return res.status(400).json({ error: 'Reset token required' });

  try {
    const row = await creatorSecurity.findValidResetToken(supabase, localDb, String(token).trim());
    if (!row) return res.status(400).json({ error: 'Invalid or expired reset link.' });

    let creator = null;
    if (supabase) {
      const { data } = await supabase.from('creators').select('*').eq('id', row.creator_id).single();
      creator = data;
    } else {
      creator = localDb.creators.find((c) => c.id === row.creator_id);
    }
    if (!creator || creator.status !== 'approved') {
      return res.status(400).json({ error: 'Invalid or expired reset link.' });
    }

    const hash = await creatorSecurity.hashPassword(passCheck.password);
    if (supabase) {
      await supabase.from('creators').update({ password_hash: hash, password: null }).eq('id', creator.id);
    } else {
      creator.password_hash = hash;
      creator.password = null;
      saveLocalDb();
    }
    await creatorSecurity.markResetTokenUsed(supabase, localDb, saveLocalDb, row.token);

    res.json({ success: true, message: 'Password updated. You can log in now.' });
  } catch (e) {
    res.status(500).json({ error: 'Password reset failed' });
  }
});

app.get('/api/creators/follow-status', async (req, res) => {
  const handle = creatorSecurity.normalizeHandle(req.query.handle || '');
  const visitorIp = getClientIp(req);
  if (!creatorSecurity.validateHandle(handle).ok) {
    return res.json({ following: false });
  }
  try {
    let creator = null;
    if (supabase) {
      const { data } = await supabase.from('creators').select('follower_ips').ilike('handle_name', handle).maybeSingle();
      creator = data;
    } else {
      creator = localDb.creators.find((c) => c.handle_name.toLowerCase() === handle.toLowerCase());
    }
    const ips = creator?.follower_ips || [];
    res.json({ following: ips.includes(visitorIp) });
  } catch (e) {
    res.json({ following: false });
  }
});

// Update Creator Profile (Avatar, Bio, payout UPI)
app.post('/api/creators/update-profile', async (req, res) => {
  const { bio, avatar_url, preferred_upi } = req.body || {};

  try {
    const { creator, ip } = await getApprovedCreatorForRequest(req);
    if (!creator || creator.status !== 'approved') return res.status(403).json({ error: 'Unauthorized' });
    await linkCreatorIpIfNeeded(creator, ip);

    let nextAvatar = avatar_url != null && avatar_url !== '' ? String(avatar_url) : creator.avatar_url;
    if (nextAvatar && nextAvatar !== creator.avatar_url) {
      if (nextAvatar.startsWith('data:image/') && nextAvatar.length > 700_000) {
        return res.status(413).json({
          error: 'Avatar too large. Compress the image or pick a smaller photo.',
        });
      }
      if (!nextAvatar.startsWith('data:image/') && !/^https?:\/\//i.test(nextAvatar)) {
        return res.status(400).json({ error: 'Avatar must be an image or https URL.' });
      }
      nextAvatar = nextAvatar.slice(0, 700_000);
    }

    const updates = {
      bio: bio != null ? sanitize(String(bio), 150) : creator.bio,
      avatar_url: nextAvatar,
    };

    if (preferred_upi != null && String(preferred_upi).trim() !== '') {
      const upiCheck = creatorSecurity.validateUpi(preferred_upi);
      if (!upiCheck.ok) return res.status(400).json({ error: upiCheck.error });
      updates.preferred_upi = upiCheck.upi;
    } else if (preferred_upi === '') {
      updates.preferred_upi = '';
    }

    if (supabase) {
      const { error } = await supabase.from('creators').update(updates).eq('id', creator.id);
      if (error) {
        console.error('[CREATORS] update-profile', error.message);
        return res.status(500).json({ error: 'Could not save profile. Try a smaller avatar.' });
      }
    } else {
      Object.assign(creator, updates);
      saveLocalDb();
    }

    res.json({ success: true, message: 'Profile updated in the matrix.' });
  } catch (e) {
    res.status(500).json({ error: 'Profile uplink failed' });
  }
});

app.get('/api/creators/status', async (req, res) => {
  const { id, handle } = req.query || {};
  const ip = req.ip === '::1' ? '127.0.0.1' : req.ip;
  try {
    let creator = null;
    // Support "handle:name" prefix from client for handle-name lookup
    const isHandleLookup = id && id.startsWith('handle:');
    const handleFromId = isHandleLookup ? id.replace(/^handle:/, '').trim() : null;

    if (supabase) {
      if (isHandleLookup && handleFromId) {
        const { data } = await supabase.from('creators').select('*').ilike('handle_name', handleFromId).single();
        creator = data;
      } else if (id) {
        // Primary: try referral_code match
        const { data: byCode } = await supabase.from('creators').select('*').eq('referral_code', id).single();
        creator = byCode;
        // Secondary fallback: try handle_name match (in case user types their handle)
        if (!creator) {
          const { data: byHandle } = await supabase.from('creators').select('*').ilike('handle_name', id).single();
          creator = byHandle;
        }
      } else if (handle) {
        const { data } = await supabase.from('creators').select('*').ilike('handle_name', handle).single();
        creator = data;
      } else {
        const { data } = await supabase.from('creators').select('*').contains('authorized_ips', [ip]).single();
        creator = data;
      }
    } else {
      if (isHandleLookup && handleFromId) {
        creator = localDb.creators.find(c => c.handle_name.toLowerCase() === handleFromId.toLowerCase());
      } else if (id) {
        creator = localDb.creators.find(c => c.referral_code === id);
        // Fallback: try by handle name
        if (!creator) creator = localDb.creators.find(c => c.handle_name.toLowerCase() === id.toLowerCase());
      } else if (handle) {
        creator = localDb.creators.find(c => c.handle_name.toLowerCase() === handle.toLowerCase());
      } else {
        creator = localDb.creators.find(c => c.authorized_ips.includes(ip));
      }
    }
    res.json({ data: creator ? creatorSecurity.stripCreatorSecrets(creator, { includePasswordOnce: creator.status === 'approved' && creator.password && !creator.password_hash }) : null });
  } catch (e) { res.json({ data: null }); }
});

app.get('/api/creators/notifications', async (req, res) => {
  try {
    const { creator } = await getCreatorForRequest(req);
    if (!creator) return res.status(403).json({ error: 'Unauthorized' });
    const notifications = await creatorNotifications.listCreatorNotifications(notifyCtx(), creator.id);
    const unreadCount = await creatorNotifications.countUnreadNotifications(notifyCtx(), creator.id);
    res.json({ success: true, notifications, unreadCount });
  } catch (e) {
    res.status(500).json({ error: 'Could not load notifications' });
  }
});

app.post('/api/creators/notifications/read', async (req, res) => {
  try {
    const { creator } = await getCreatorForRequest(req);
    if (!creator) return res.status(403).json({ error: 'Unauthorized' });
    const { ids, all } = req.body || {};
    await creatorNotifications.markNotificationsRead(notifyCtx(), creator.id, {
      ids: Array.isArray(ids) ? ids : ids ? [ids] : [],
      all: !!all,
    });
    const unreadCount = await creatorNotifications.countUnreadNotifications(notifyCtx(), creator.id);
    res.json({ success: true, unreadCount });
  } catch (e) {
    res.status(500).json({ error: 'Could not update notifications' });
  }
});

app.post('/api/creators/withdraw', async (req, res) => {
  const { upi } = req.body || {};
  const upiCheck = creatorSecurity.validateUpi(upi);
  if (!upiCheck.ok) return res.status(400).json({ error: upiCheck.error });
  try {
    const { creator, ip } = await getApprovedCreatorForRequest(req);
    if (!creator || creator.status !== 'approved') return res.status(403).json({ error: 'Unauthorized' });
    await linkCreatorIpIfNeeded(creator, ip);

    // Critical section: check balance + no-pending, insert the withdrawal, and
    // zero the balance. This MUST be serialized per creator — two concurrent
    // requests could otherwise both pass the pending/balance checks and each
    // insert a full-balance withdrawal before either zeroed it (TOCTOU
    // double-spend of real money). runLocked (per-key mutex) serializes them.
    const runCritical = async () => {
      // Re-read the authoritative balance inside the lock, never trust the
      // snapshot read before the lock was acquired.
      let freshCoins = creator.coins_earned || 0;
      if (supabase) {
        const { data: fresh } = await supabase.from('creators').select('coins_earned').eq('id', creator.id).maybeSingle();
        if (fresh) freshCoins = fresh.coins_earned || 0;
      } else {
        const fresh = localDb.creators.find((c) => c.id === creator.id);
        if (fresh) freshCoins = fresh.coins_earned || 0;
      }

      if (freshCoins < MIN_CREATOR_WITHDRAWAL_COINS) {
        return { status: 400, body: { error: `Minimum ${MIN_CREATOR_WITHDRAWAL_COINS} coins required for withdrawal.` } };
      }

      const coinsToWithdraw = freshCoins;
      const withdrawal = {
        id: generateId('wd'),
        creator_id: creator.id,
        handle_name: creator.handle_name,
        upi: upiCheck.upi,
        amount: coinsToWithdraw,
        amount_rs: creatorSecurity.computeEarningsRs(coinsToWithdraw),
        coins_spent: coinsToWithdraw,
        status: 'pending',
        admin_note: null,
        created_at: new Date().toISOString()
      };

      if (supabase) {
        const { data: pending } = await supabase.from('withdrawals').select('id').eq('creator_id', creator.id).eq('status', 'pending').limit(1);
        if (pending?.length) return { status: 400, body: { error: 'You already have a pending withdrawal request.' } };
        await supabase.from('withdrawals').insert(withdrawal);
        await supabase.from('creators').update({ coins_earned: 0, earnings_rs: 0 }).eq('id', creator.id);
      } else {
        const pending = (localDb.withdrawals || []).find(w => w.creator_id === creator.id && w.status === 'pending');
        if (pending) return { status: 400, body: { error: 'You already have a pending withdrawal request.' } };
        localDb.withdrawals.push(withdrawal);
        const freshLocal = localDb.creators.find((c) => c.id === creator.id) || creator;
        freshLocal.coins_earned = 0;
        freshLocal.earnings_rs = 0;
        saveLocalDb();
      }
      // Keep the in-memory snapshot consistent with the persisted state.
      creator.coins_earned = 0;
      creator.earnings_rs = 0;
      await creatorSecurity.logCreatorEvent(supabase, localDb, saveLocalDb, {
        creatorId: creator.id,
        eventType: 'withdrawal_requested',
        amount: -coinsToWithdraw,
        details: `Withdrawal queued (${upiCheck.upi})`,
      });
      return { status: 200, body: { success: true, message: 'Withdrawal request submitted. Admin will review within 48 hours.' } };
    };

    const out = economy?.runLocked
      ? await economy.runLocked(`withdraw:${creator.id}`, runCritical)
      : await runCritical();
    return res.status(out.status).json(out.body);
  } catch (e) { res.status(500).json({ error: 'Withdrawal request failed' }); }
});

app.post('/api/creators/re-request', async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Code required' });
  // In a real system, this would notify the admin via socket or email
  emitToAdmins('admin-notification', { type: 'creator_ping', message: `Creator ${code} is requesting status update.` });
  res.json({ success: true });
});

// --- ADMIN CONTROL CENTER ---
app.get('/api/admin/creators', requireAdmin, async (req, res) => {
  try {
    let creators = [];
    let withdrawals = [];
    if (supabase) {
      const { data: cData } = await supabase.from('creators').select('*').order('created_at', { ascending: false });
      const { data: wData } = await supabase.from('withdrawals').select('*, creators(handle_name)').order('created_at', { ascending: false });
      creators = cData || [];
      withdrawals = wData || [];
    } else {
      creators = [...localDb.creators].reverse();
      withdrawals = [...localDb.withdrawals].reverse();
    }
    res.json({ success: true, creators, withdrawals });
  } catch (e) { res.status(500).json({ error: 'Admin query failed' }); }
});

app.get('/api/admin/history', requireAdmin, async (req, res) => {
  try {
    let history = [];
    if (supabase) {
      const { data } = await supabase.from('admin_history').select('*').order('created_at', { ascending: false }).limit(100);
      history = data || [];
    } else {
      history = [...(localDb.admin_history || [])].reverse().slice(0, 100);
    }
    res.json({ success: true, history });
  } catch (e) { res.status(500).json({ error: 'History query failed' }); }
});

app.post('/api/admin/creators/approve', requireAdmin, async (req, res) => {
  const { creatorId, status } = req.body || {};
  try {
    let creator = null;
    if (supabase) {
      const { data } = await supabase.from('creators').select('*').eq('id', creatorId).single();
      creator = data;
    } else {
      creator = localDb.creators.find(x => x.id === creatorId);
    }
    if (!creator) return res.status(404).json({ error: 'Node Not Found' });

    let updates = { status };
    let plainPassword = null;
    if (status === 'approved') {
      if (!creator.password_hash && !creator.password) {
        plainPassword = creatorSecurity.generateSecurePassword(creator.handle_name);
        updates.password_hash = await creatorSecurity.hashPassword(plainPassword);
        updates.password = null;
      } else if (creator.password && !creator.password_hash) {
        plainPassword = creator.password;
        updates.password_hash = await creatorSecurity.hashPassword(creator.password);
        updates.password = null;
      }
      // password_hash already set at registration — creator uses their chosen password
      updates.coins_earned = (creator.coins_earned || 0) + 500;
      updates.earnings_rs = creatorSecurity.computeEarningsRs(updates.coins_earned);
      updates.rejection_reason = null;
    } else if (status === 'rejected') {
      updates.rejection_reason = sanitize(req.body?.reason || 'Did not meet program requirements', 200);
    }

    if (supabase) {
      await supabase.from('creators').update(updates).eq('id', creatorId);
      await supabase.from('admin_history').insert({
        action_type: 'CREATOR_APPROVE',
        target_id: creatorId,
        target_name: creator.handle_name,
        details: `Status set to ${status}${status === 'approved' ? ' (+500 bonus coins)' : ''}`
      });
      if (status === 'approved') {
        await creatorSecurity.logCreatorEvent(supabase, localDb, saveLocalDb, {
          creatorId,
          eventType: 'approval_bonus',
          amount: 500,
          details: 'Creator approval bonus',
        });
      }
    } else {
      Object.assign(creator, updates);
      localDb.admin_history.push({
        id: Date.now().toString(),
        action_type: 'CREATOR_APPROVE',
        target_id: creatorId,
        target_name: creator.handle_name,
        details: `Status set to ${status}`,
        created_at: new Date().toISOString()
      });
      saveLocalDb();
    }
    res.json({ success: true, password: plainPassword || undefined });

    const merged = { ...creator, ...updates };
    // Never broadcast credentials: a fresh password is delivered only via the
    // admin REST response above and the approval email. The socket payload is
    // scoped to the affected creator + admin sockets and carries no secrets.
    const statusPayload = {
      referral_code: creator.referral_code,
      handle_name: creator.handle_name,
      status,
      rejection_reason: updates.rejection_reason || null,
    };
    emitToCreator(merged, 'creator-status-changed', statusPayload);
    emitToAdmins('creator-status-changed', statusPayload);

    if (status === 'approved') {
      await notifyCreatorAction(merged, {
        type: 'approved',
        title: 'Application approved',
        message: plainPassword
          ? `You're in! Admin assigned a temporary password — check your email or the approval screen. +500 bonus coins added.`
          : `You're approved! Log in with the password you set during registration. +500 bonus coins added.`,
        important: true,
        metadata: { bonus_coins: 500 },
      });
      creatorEmail.notifyCreatorApproved(merged, plainPassword).catch((e) => console.error('[EMAIL] approve notify', e.message));
    } else if (status === 'rejected') {
      await notifyCreatorAction(merged, {
        type: 'rejected',
        title: 'Application rejected',
        message: updates.rejection_reason || 'Your application was not approved at this time.',
        important: true,
      });
      creatorEmail.notifyCreatorRejected(merged, updates.rejection_reason).catch((e) => console.error('[EMAIL] reject notify', e.message));
    }
  } catch (e) { res.status(500).json({ error: 'Approval failed' }); }
});

app.post('/api/admin/creators/featured', requireAdmin, async (req, res) => {
  const { creatorId, featured } = req.body || {};
  if (!creatorId || typeof featured !== 'boolean') {
    return res.status(400).json({ error: 'creatorId and featured (boolean) required' });
  }
  try {
    let creator = null;
    if (supabase) {
      const { data } = await supabase.from('creators').select('*').eq('id', creatorId).single();
      creator = data;
    } else {
      creator = localDb.creators.find((c) => c.id === creatorId);
    }
    if (!creator) return res.status(404).json({ error: 'Creator not found' });
    if (creator.status !== 'approved') {
      return res.status(400).json({ error: 'Only approved creators can be featured' });
    }

    if (supabase) {
      await supabase.from('creators').update({ featured }).eq('id', creatorId);
      await supabase.from('admin_history').insert({
        action_type: 'CREATOR_FEATURED',
        target_id: creatorId,
        target_name: creator.handle_name,
        details: featured ? 'Pinned to featured directory' : 'Removed from featured',
      });
    } else {
      creator.featured = featured;
      localDb.admin_history.push({
        id: Date.now().toString(),
        action_type: 'CREATOR_FEATURED',
        target_id: creatorId,
        target_name: creator.handle_name,
        details: featured ? 'Featured' : 'Unfeatured',
        created_at: new Date().toISOString(),
      });
      saveLocalDb();
    }
    await notifyCreatorAction(creator, {
      type: featured ? 'featured_on' : 'featured_off',
      title: featured ? 'Featured on homepage' : 'Removed from featured',
      message: featured
        ? 'An admin pinned your profile to the featured creators strip on the landing page.'
        : 'An admin removed your profile from the featured creators strip.',
      important: true,
    });
    res.json({ success: true, featured });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update featured status' });
  }
});

app.post('/api/admin/creators/reset-password', requireAdmin, async (req, res) => {
  const { creatorId } = req.body || {};
  if (!creatorId) return res.status(400).json({ error: 'creatorId required' });
  try {
    let creator = null;
    if (supabase) {
      const { data } = await supabase.from('creators').select('*').eq('id', creatorId).single();
      creator = data;
    } else {
      creator = localDb.creators.find((c) => c.id === creatorId);
    }
    if (!creator || creator.status !== 'approved') {
      return res.status(404).json({ error: 'Approved creator not found' });
    }

    const plainPassword = creatorSecurity.generateSecurePassword(creator.handle_name);
    const password_hash = await creatorSecurity.hashPassword(plainPassword);
    if (supabase) {
      await supabase.from('creators').update({ password_hash, password: null }).eq('id', creatorId);
      await supabase.from('admin_history').insert({
        action_type: 'CREATOR_PASSWORD_RESET',
        target_id: creatorId,
        target_name: creator.handle_name,
        details: 'Admin reset creator password',
      });
    } else {
      creator.password_hash = password_hash;
      creator.password = null;
      saveLocalDb();
    }

    creatorEmail.notifyPasswordResetByAdmin(creator, plainPassword).catch((e) => console.error('[EMAIL] admin reset', e.message));
    await notifyCreatorAction(creator, {
      type: 'password_reset',
      title: 'Password reset by admin',
      message: creator.email
        ? 'An admin reset your login password. Check your email for the new credentials.'
        : 'An admin reset your login password. Contact support if you did not receive new credentials.',
      important: true,
    });
    res.json({ success: true, password: plainPassword });
  } catch (e) {
    res.status(500).json({ error: 'Password reset failed' });
  }
});

app.post('/api/admin/withdrawals/status', requireAdmin, async (req, res) => {
  const { withdrawalId, status, note } = req.body || {};
  if (!withdrawalId || !['paid', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid withdrawal update' });
  }
  try {
    let withdrawal = null;
    if (supabase) {
      const { data } = await supabase.from('withdrawals').select('*').eq('id', withdrawalId).single();
      withdrawal = data;
    } else {
      withdrawal = (localDb.withdrawals || []).find((w) => w.id === withdrawalId);
    }
    if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' });
    if (withdrawal.status !== 'pending') return res.status(400).json({ error: 'Withdrawal already processed' });

    const updates = {
      status,
      admin_note: sanitize(note || '', 200) || null,
      processed_at: new Date().toISOString(),
    };

    if (status === 'rejected') {
      let creator = null;
      if (supabase) {
        const { data: c } = await supabase.from('creators').select('*').eq('id', withdrawal.creator_id).single();
        creator = c;
      } else {
        creator = localDb.creators.find((c) => c.id === withdrawal.creator_id);
      }
      if (creator) {
        const refundCoins = withdrawal.coins_spent || withdrawal.amount || 0;
        const newCoins = (creator.coins_earned || 0) + refundCoins;
        const newEarnings = creatorSecurity.computeEarningsRs(newCoins);
        if (supabase) {
          await supabase.from('creators').update({ coins_earned: newCoins, earnings_rs: newEarnings }).eq('id', creator.id);
        } else {
          creator.coins_earned = newCoins;
          creator.earnings_rs = newEarnings;
        }
        await creatorSecurity.logCreatorEvent(supabase, localDb, saveLocalDb, {
          creatorId: creator.id,
          eventType: 'withdrawal_rejected',
          amount: refundCoins,
          details: updates.admin_note || 'Withdrawal rejected — coins restored',
        });
      }
    } else {
      await creatorSecurity.logCreatorEvent(supabase, localDb, saveLocalDb, {
        creatorId: withdrawal.creator_id,
        eventType: 'withdrawal_paid',
        amount: 0,
        details: `Paid ₹${withdrawal.amount_rs || 0} to ${withdrawal.upi}`,
      });
    }

    if (supabase) {
      await supabase.from('withdrawals').update(updates).eq('id', withdrawalId);
      await supabase.from('admin_history').insert({
        action_type: 'WITHDRAWAL_UPDATE',
        target_id: withdrawalId,
        target_name: withdrawal.handle_name,
        details: `Status: ${status}`,
      });
    } else {
      Object.assign(withdrawal, updates);
      localDb.admin_history.push({
        id: Date.now().toString(),
        action_type: 'WITHDRAWAL_UPDATE',
        target_id: withdrawalId,
        target_name: withdrawal.handle_name,
        details: `Status: ${status}`,
        created_at: new Date().toISOString(),
      });
      saveLocalDb();
    }

    let creatorForEmail = null;
    if (supabase) {
      const { data: c } = await supabase.from('creators').select('*').eq('id', withdrawal.creator_id).single();
      creatorForEmail = c;
    } else {
      creatorForEmail = localDb.creators.find((c) => c.id === withdrawal.creator_id);
    }
    if (creatorForEmail) {
      await notifyCreatorAction(creatorForEmail, {
        type: status === 'paid' ? 'withdrawal_paid' : 'withdrawal_rejected',
        title: status === 'paid' ? 'Withdrawal paid' : 'Withdrawal rejected',
        message: status === 'paid'
          ? `Your payout of ₹${withdrawal.amount_rs || 0} to ${withdrawal.upi} was marked paid by admin.`
          : `Your withdrawal was rejected${updates.admin_note ? `: ${updates.admin_note}` : ''}. Coins were restored to your balance.`,
        important: true,
        metadata: { withdrawal_id: withdrawalId, status },
      });
      creatorEmail.notifyWithdrawalUpdate(creatorForEmail, withdrawal, status, updates.admin_note).catch((e) => console.error('[EMAIL] withdrawal', e.message));
    }

    // Targeted delivery only: the affected creator + admin sockets.
    const withdrawalPayload = { creator_id: withdrawal.creator_id, withdrawalId, status };
    emitToCreator(creatorForEmail || { id: withdrawal.creator_id }, 'creator-withdrawal-updated', withdrawalPayload);
    emitToAdmins('creator-withdrawal-updated', withdrawalPayload);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update withdrawal' });
  }
});

app.post('/api/creators/verify-ref', async (req, res) => {
  const { code } = req.body || {};
  const visitorIp = getClientIp(req);
  if (!code) return res.status(400).json({ error: 'Empty Signal' });
  try {
    let creator = null;
    if (supabase) {
      const { data } = await supabase.from('creators').select('*').eq('referral_code', code).single();
      creator = data;
    } else {
      creator = localDb.creators.find(c => c.referral_code === code);
    }
    if (!creator) return res.status(404).json({ error: 'Creator not found' });
    let logExists = false;
    if (supabase) {
      const { data } = await supabase.from('referral_logs').select('*').eq('creator_id', creator.id).eq('visitor_ip', visitorIp).single();
      logExists = !!data;
    } else {
      logExists = localDb.referral_logs.some(l => l.creator_id === creator.id && l.visitor_ip === visitorIp);
    }
    if (logExists) return res.json({ success: true, already_claimed: true });
    if (supabase) {
      await supabase.from('referral_logs').insert({ creator_id: creator.id, visitor_ip: visitorIp });
      const newCoins = (creator.coins_earned || 0) + 10;
      const newRefCount = (creator.referral_count || 0) + 1;
      const newEarnings = creatorSecurity.computeEarningsRs(newCoins);
      await supabase.from('creators').update({ coins_earned: newCoins, earnings_rs: newEarnings, referral_count: newRefCount }).eq('id', creator.id);
      await creatorSecurity.logCreatorEvent(supabase, localDb, saveLocalDb, {
        creatorId: creator.id,
        eventType: 'referral_visit',
        amount: 10,
        details: `Referral from ${visitorIp}`,
      });
    } else {
      localDb.referral_logs.push({ creator_id: creator.id, visitor_ip: visitorIp, created_at: new Date().toISOString() });
      creator.coins_earned = (creator.coins_earned || 0) + 10;
      creator.referral_count = (creator.referral_count || 0) + 1;
      creator.earnings_rs = creatorSecurity.computeEarningsRs(creator.coins_earned);
      await creatorSecurity.logCreatorEvent(supabase, localDb, saveLocalDb, {
        creatorId: creator.id,
        eventType: 'referral_visit',
        amount: 10,
        details: `Referral from ${visitorIp}`,
      });
      saveLocalDb();
    }
    if (!coinUsers.has(visitorIp)) {
      // We'll use the async helper here
      await getCoinUser(visitorIp);
    }
    const u = await getCoinUser(visitorIp);
    if (economy?.credit) {
      await economy.credit(visitorIp, 5, 'referral_bonus', { creatorId: creator.id });
    } else {
      const updatedCoins = (u.coins || 0) + 5;
      await updateCoinUser(visitorIp, { coins: updatedCoins });
    }
    res.json({ success: true, message: 'Referral node synchronized' });
  } catch (e) { res.status(500).json({ error: 'Sync failed' }); }
});

/** Public: whether TURN is configured (no secrets) */
app.get('/api/debug/webrtc-config', (req, res) => {
  if (NODE_ENV === 'production' && !isAdminRequest(req)) {
    return res.status(404).json({ error: 'Not found' });
  }
  const turnUrl = (process.env.TURN_URL || '').trim();
  const turnUser = (process.env.TURN_USERNAME || '').trim();
  const turnPass = (process.env.TURN_PASSWORD || '').trim();
  const turnConfigured = !!(turnUrl && turnUser && turnPass);
  res.json({
    stun: true,
    turnConfigured,
    hint: turnConfigured ? 'Relay available for strict NAT' : 'STUN only unless TURN_* env is set',
  });
});

/** Approved creator: recent economy activity from creator_events */
app.get('/api/creators/my-activity', async (req, res) => {
  try {
    const { creator, ip } = await getApprovedCreatorForRequest(req);
    if (!creator) return res.status(403).json({ error: 'Not an approved creator' });
    await linkCreatorIpIfNeeded(creator, ip);

    if (supabase) {
      const { data, error } = await supabase
        .from('creator_events')
        .select('*')
        .eq('creator_id', creator.id)
        .order('created_at', { ascending: false })
        .limit(80);
      if (error) {
        const { data: refRows } = await supabase
          .from('referral_logs')
          .select('*')
          .eq('creator_id', creator.id)
          .order('created_at', { ascending: false })
          .limit(80);
        const entries = (refRows || []).map((l, i) => ({
          id: `ref_${i}_${l.created_at}`,
          action: 'referral_visit',
          amount: 10,
          details: 'Referral link visit',
          created_at: l.created_at,
        }));
        return res.json({ entries });
      }
      const entries = (data || []).map((row) => ({
        id: row.id,
        action: row.event_type,
        amount: row.amount,
        details: row.details,
        created_at: row.created_at,
      }));
      return res.json({ entries });
    }

    const events = (localDb.creator_events || [])
      .filter((e) => e.creator_id === creator.id)
      .slice(-80)
      .reverse()
      .map((row) => ({
        id: row.id,
        action: row.event_type,
        amount: row.amount,
        details: row.details,
        created_at: row.created_at,
      }));
    if (events.length) return res.json({ entries: events });

    const synthetic = (localDb.referral_logs || [])
      .filter((l) => l.creator_id === creator.id)
      .slice(-80)
      .reverse()
      .map((l, i) => ({
        id: `ref_${i}_${l.created_at || i}`,
        action: 'referral_visit',
        amount: 10,
        details: 'Referral link visit',
        created_at: l.created_at || new Date().toISOString(),
      }));
    return res.json({ entries: synthetic });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load activity' });
  }
});

/** Approved creator: 7-day analytics for dashboard chart */
app.get('/api/creators/my-analytics', async (req, res) => {
  try {
    const { creator, ip } = await getApprovedCreatorForRequest(req);
    if (!creator) return res.status(403).json({ error: 'Not an approved creator' });
    await linkCreatorIpIfNeeded(creator, ip);

    const days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().slice(0, 10));
    }

    const emptyDay = () => ({ referrals: 0, tips: 0, follows: 0, coins: 0 });
    const byDay = Object.fromEntries(days.map((d) => [d, emptyDay()]));

    if (supabase) {
      const since = new Date(now);
      since.setDate(since.getDate() - 6);
      since.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from('creator_events')
        .select('event_type, amount, created_at')
        .eq('creator_id', creator.id)
        .gte('created_at', since.toISOString());
      (data || []).forEach((row) => {
        const key = String(row.created_at).slice(0, 10);
        if (!byDay[key]) return;
        const amt = Number(row.amount) || 0;
        if (row.event_type === 'referral_visit') byDay[key].referrals += 1;
        else if (row.event_type === 'tip') { byDay[key].tips += 1; byDay[key].coins += amt; }
        else if (row.event_type === 'follow') byDay[key].follows += 1;
        else if (amt > 0) byDay[key].coins += amt;
      });
    } else {
      (localDb.creator_events || [])
        .filter((e) => e.creator_id === creator.id)
        .forEach((row) => {
          const key = String(row.created_at).slice(0, 10);
          if (!byDay[key]) return;
          const amt = Number(row.amount) || 0;
          if (row.event_type === 'referral_visit') byDay[key].referrals += 1;
          else if (row.event_type === 'tip') { byDay[key].tips += 1; byDay[key].coins += amt; }
          else if (row.event_type === 'follow') byDay[key].follows += 1;
          else if (amt > 0) byDay[key].coins += amt;
        });
    }

    res.json({
      series: days.map((date) => ({ date, ...byDay[date] })),
      totals: {
        referrals: creator.referral_count || 0,
        followers: creator.followers_count || 0,
        tips_received: creator.tips_received_total || 0,
        coins_earned: creator.coins_earned || 0,
      },
    });
  } catch (e) {
    res.status(500).json({ error: 'Analytics unavailable' });
  }
});

/** Public featured creators directory */
app.get('/api/creators/featured', async (req, res) => {
  try {
    let list = [];
    if (supabase) {
      const { data } = await supabase
        .from('creators')
        .select('handle_name, platform, bio, avatar_url, referral_count, followers_count, featured')
        .eq('status', 'approved')
        .order('featured', { ascending: false })
        .order('referral_count', { ascending: false })
        .limit(12);
      list = data || [];
    } else {
      list = localDb.creators
        .filter((c) => c.status === 'approved')
        .sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || (b.referral_count || 0) - (a.referral_count || 0))
        .slice(0, 12)
        .map(({ handle_name, platform, bio, avatar_url, referral_count, followers_count, featured }) => ({
          handle_name, platform, bio, avatar_url, referral_count, followers_count, featured,
        }));
    }
    res.json({ creators: list });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load creators' });
  }
});

/** Approved creator: withdrawal requests for this account */
app.get('/api/creators/my-withdrawals', async (req, res) => {
  try {
    const { creator, ip } = await getApprovedCreatorForRequest(req);
    if (!creator) return res.status(403).json({ error: 'Not an approved creator' });
    await linkCreatorIpIfNeeded(creator, ip);

    if (supabase) {
      const { data } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('creator_id', creator.id)
        .order('created_at', { ascending: false })
        .limit(25);
      return res.json({ withdrawals: data || [] });
    }
    const list = (localDb.withdrawals || []).filter((w) => w.creator_id === creator.id).slice(-25).reverse();
    res.json({ withdrawals: list });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load withdrawals' });
  }
});

app.get('/api/creator/profile/:handle', async (req, res) => {
  const handle = creatorSecurity.normalizeHandle(req.params.handle);
  const visitorIp = getClientIp(req);
  if (!creatorSecurity.validateHandle(handle).ok) return res.status(400).json({ error: 'Invalid handle' });
  try {
    let creator = null;
    if (supabase) {
      const { data } = await supabase.from('creators').select('handle_name, platform, profile_link, coins_earned, referral_count, status, earnings_rs, avatar_url, bio, followers_count, follower_ips').ilike('handle_name', handle).maybeSingle();
      creator = data;
    } else {
      creator = localDb.creators.find(c => c.handle_name.toLowerCase() === handle.toLowerCase());
    }
    if (!creator || creator.status !== 'approved') return res.status(404).json({ error: 'Creator not found' });
    const isFollowing = (creator.follower_ips || []).includes(visitorIp);
    res.json(creatorSecurity.stripCreatorSecrets({
      handle_name: creator.handle_name,
      platform: creator.platform,
      profile_link: creator.profile_link,
      coins_earned: creator.coins_earned,
      referral_count: creator.referral_count || 0,
      followers_count: creator.followers_count || 0,
      avatar_url: creator.avatar_url,
      bio: creator.bio,
      status: creator.status,
      earnings_rs: creator.earnings_rs,
      is_following: isFollowing,
    }));
  } catch (e) { res.status(500).json({ error: 'Query failed' }); }
});

app.post('/api/creators/follow', async (req, res) => {
  const { handle } = req.body || {};
  const visitorIp = getClientIp(req);
  const handleCheck = creatorSecurity.validateHandle(handle);
  if (!handleCheck.ok) return res.status(400).json({ error: handleCheck.error });
  try {
    let creator = null;
    if (supabase) {
      const { data } = await supabase.from('creators').select('*').ilike('handle_name', handleCheck.handle).maybeSingle();
      creator = data;
    } else {
      creator = localDb.creators.find(c => c.handle_name.toLowerCase() === handleCheck.handle.toLowerCase());
    }
    if (!creator || creator.status !== 'approved') return res.status(404).json({ error: 'Creator not found' });

    const ips = creator.follower_ips || [];
    if (ips.includes(visitorIp)) return res.json({ success: true, already_following: true, count: creator.followers_count });

    const newIps = [...ips, visitorIp];
    const newCount = (creator.followers_count || 0) + 1;

    if (supabase) {
      await supabase.from('creators').update({ follower_ips: newIps, followers_count: newCount }).eq('id', creator.id);
    } else {
      creator.follower_ips = newIps;
      creator.followers_count = newCount;
      saveLocalDb();
    }
    await creatorSecurity.logCreatorEvent(supabase, localDb, saveLocalDb, {
      creatorId: creator.id,
      eventType: 'follow',
      amount: 0,
      details: `New follower from ${visitorIp}`,
    });
    res.json({ success: true, count: newCount });
  } catch (e) { res.status(500).json({ error: 'Follow failed' }); }
});

// Request tracing is a development aid only. In production it floods the log
// budget and echoes query strings that can carry creator ids / reset tokens.
if (NODE_ENV !== 'production') {
  app.use('/api', (req, res, next) => {
    console.log(`[API_TRACE] ${req.method} ${req.path}`);
    next();
  });
}

// Get active interests for group chats
app.get('/api/rooms/active-interests', (req, res) => {
  const mode = req.query.mode || 'group_video';
  const interestCounts = new Map();

  for (const room of rooms.values()) {
    if (room.mode === mode && room.interest && room.interest !== 'general') {
      const currentCount = interestCounts.get(room.interest) || 0;
      interestCounts.set(room.interest, currentCount + room.users.size);
    }
  }

  const results = Array.from(interestCounts.entries())
    .map(([interest, count]) => ({ interest, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  res.json({ interests: results });
});

// Cloudflare Turnstile verification
app.post('/api/verify-turnstile', async (req, res) => {
  const { token } = req.body || {};
  const secret = (process.env.TURNSTILE_SECRET_KEY || '').trim();
  if (!secret) {
    // Fail closed: never fall back to Cloudflare's always-pass test secret.
    if (NODE_ENV === 'production') {
      console.error('[TURNSTILE] TURNSTILE_SECRET_KEY is not set — refusing verification in production.');
      return res.status(503).json({ success: false, error: 'Turnstile is not configured' });
    }
    // Development bypass — allowed locally, but always logged so it is never silent.
    console.warn('[TURNSTILE] WARNING: TURNSTILE_SECRET_KEY unset — verification bypassed (development only, never do this in production).');
    return res.json({ success: true, devBypass: true });
  }
  if (!token) return res.status(400).json({ success: false, error: 'Token required' });
  try {
    const ip = req.ip === '::1' ? '127.0.0.1' : req.ip;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    let r;
    try {
      r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, response: token, remoteip: ip }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    const data = await r.json();
    if (data.success) return res.json({ success: true });
    return res.status(400).json({ success: false, 'error-codes': data['error-codes'] });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Verification failed' });
  }
});

// Admin auth: timing-safe comparison so key is not leaked by response time
function requireAdmin(req, res, next) {
  const adminKey = getAdminKey();
  if (!adminKey) {
    return res.status(503).json({ error: 'Admin panel not configured' });
  }
  const provided = (req.header('x-admin-key') || '').toString().trim();
  try {
    const a = Buffer.from(adminKey, 'utf8');
    const b = Buffer.from(provided, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Admin: toggle settings like ads, allowDevTools, maintenanceMode, etc.
app.post('/api/admin/settings', requireAdmin, (req, res) => {
  const body = req.body || {};
  Object.keys(settings).forEach((k) => {
    if (k === 'adScripts' && body.adScripts && typeof body.adScripts === 'object') {
      settings.adScripts = { ...settings.adScripts, ...body.adScripts };
    } else if (typeof body[k] === 'boolean' && typeof settings[k] === 'boolean') {
      settings[k] = body[k];
    }
  });
  io.emit('settings_updated', settings);
  res.json(settings);
});

// Admin: Integrated high-fidelity activity overview
app.get('/api/admin/overview', requireAdmin, async (req, res) => {
  const roomList = Array.from(rooms.values()).map((room) => ({
    id: room.id,
    mode: room.mode,
    interest: room.interest,
    participantCount: room.users.size,
    participants: room.participants,
    createdAt: room.createdAt,
  }));

  const userList = Array.from(users.values()).map(u => ({
    nickname: u.nickname,
    country: u.country,
    ip: u.ip,
    mode: u.mode || 'idle',
    coins: coinUsers.get(u.ip)?.coins || 0,
    socketId: u.socketId
  }));

  const economyList = Array.from(coinUsers.values()).map(u => ({
    ip: u.ip,
    coins: u.coins,
    streak: u.streak,
    registered: !!u.registered,
    activeSeconds: u.active_seconds || 0,
    persisted: ipActivity.get(u.ip)?.persisted || u.registered || false
  }));

  const totalCoins = economyList.reduce((sum, u) => sum + (u.coins || 0), 0);

  const liveSnapshot = adminLiveMonitor.buildLivePanelsSnapshot(users, rooms);
  const livePanelBySocket = new Map();
  for (const lr of liveSnapshot.rooms) {
    for (const panel of lr.panels) livePanelBySocket.set(panel.socketId, panel);
  }

  const turnUrl = (process.env.TURN_URL || '').trim();
  const turnUser = (process.env.TURN_USERNAME || '').trim();
  const turnPass = (process.env.TURN_PASSWORD || '').trim();
  const turnConfigured = !!(turnUrl && turnUser && turnPass);
  const queueStats = await matchQueue.getStats();

  res.json({
    ...settings,
    infrastructure: {
      turnConfigured,
      turnUrlHint: turnConfigured ? turnUrl.split(':')[0] + ':***' : null,
      signalMaxPerMinute: SIGNAL_MAX_PER_MINUTE,
      stunEndpoints: 2,
      relayFallback: !turnConfigured,
      matchQueue: queueStats.backend,
    },
    users: users.size,
    rooms: rooms.size,
    queues: {
      text: queueStats.text,
      video: queueStats.video,
      backend: queueStats.backend,
    },
    roomList,
    userList,
    economyList,
    coinStats: {
      totalCoinsInSystem: totalCoins,
      uniqueWallets: coinUsers.size
    },
    reports: reports.slice(-20),
    openReportsCount: reports.length,
    blockedIps: Array.from(blockedIps),
    warnedIps: Array.from(warnedIps),
    stats: {
      totalMessages: stats.totalMessages,
      totalConnections: stats.totalConnections,
      uniqueIps: stats.uniqueIps.size,
      uptimeSeconds: Math.floor(process.uptime()),
    },
    statsHistory,
    roomsWithActivity: Array.from(rooms.values()).map((r) => ({
      id: r.id,
      interest: r.interest,
      mode: r.mode,
      sessionType: r.maxSize <= 2 && (r.mode === 'video' || r.mode === 'text') ? '1:1' : 'group',
      participantCount: r.users.size,
      maxSize: r.maxSize,
      createdAt: r.createdAt,
      participants: (r.participants || []).map((p) => {
        const u = users.get(p.socketId);
        const panel = livePanelBySocket.get(p.socketId);
        return {
          socketId: p.socketId,
          nickname: p.nickname,
          country: p.country,
          isCreator: !!p.isCreator,
          ip: u?.ip || null,
          frame: panel?.frame || null,
          frameStale: panel?.stale ?? true,
        };
      }),
      messages: r.messages?.slice(-8) || [],
    })),
    memory: process.memoryUsage(),
  });
});

// Economy Audit Trail for Admin (Activity Logs)
app.get('/api/admin/economy/logs', requireAdmin, async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      return res.json({ logs: data || [] });
    }
    // Fallback for local DB
    res.json({ logs: [] });
  } catch (e) {
    res.status(500).json({ error: 'Audit trail offline' });
  }
});

app.post('/api/admin/warn', requireAdmin, (req, res) => {
  const { ip, message } = req.body || {};
  if (!ip) return res.status(400).json({ error: 'IP required' });
  warnedIps.add(ip);
  let count = 0;
  for (const [socketId, user] of users.entries()) {
    if (user.ip === ip) {
      io.to(socketId).emit('content-flagged', { message: message || '⚠️ SYSTEM WARNING: Your behavior has been flagged. Please follow community rules.' });
      count++;
    }
  }
  res.json({ success: true, warned: count });
});

app.post('/api/admin/unwarn', requireAdmin, (req, res) => {
  const { ip } = req.body || {};
  if (ip) warnedIps.delete(ip);
  res.json({ success: true });
});

app.post('/api/admin/block', requireAdmin, (req, res) => {
  const { ip } = req.body || {};
  if (ip) {
    blockedIps.add(ip);
    // Find online users with this IP and boot them
    for (const [socketId, user] of users.entries()) {
      if (user.ip === ip) {
        io.to(socketId).emit('blocked-ip');
        io.sockets.sockets.get(socketId)?.disconnect(true);
      }
    }
  }
  res.json({ success: true, blockedIps: Array.from(blockedIps) });
});

app.post('/api/admin/unblock', requireAdmin, (req, res) => {
  const { ip } = req.body || {};
  if (ip) blockedIps.delete(ip);
  res.json({ success: true, blockedIps: Array.from(blockedIps) });
});

app.post('/api/admin/resolve-report', requireAdmin, (req, res) => {
  const { reportId } = req.body || {};
  const reportIndex = reports.findIndex(r => r.id === reportId);
  if (reportIndex !== -1) reports.splice(reportIndex, 1);
  res.json({ success: true, reports });
});

app.post('/api/admin/announcement', requireAdmin, (req, res) => {
  const { message } = req.body || {};
  if (message) {
    io.emit('system-announcement', { message });
  }
  res.json({ success: true });
});

app.post('/api/admin/content-flagged', requireAdmin, (req, res) => {
  const { ip, message } = req.body || {};
  if (!ip) return res.status(400).json({ error: 'IP required' });
  let count = 0;
  for (const [socketId, user] of users.entries()) {
    if (user.ip === ip) {
      io.to(socketId).emit('content-flagged', { message: message || 'Your content was flagged for review. Please follow community guidelines.' });
      count++;
    }
  }
  res.json({ success: true, notified: count });
});

app.post('/api/admin/killswitch', requireAdmin, (req, res) => {
  let kickCount = 0;
  for (const [socketId] of users.entries()) {
    io.sockets.sockets.get(socketId)?.disconnect(true);
    kickCount++;
  }
  // Clear serverside caches just in case
  void matchQueue.clearAll();
  rooms.clear();
  interestToRoom.clear();
  users.clear();
  userBlocks.clear();
  io.emit('online_count', { count: 0 }); // Update anyone reconnecting
  res.json({ success: true, kicked: kickCount });
});

// Health
app.get('/health', async (req, res) => {
  const qStats = await matchQueue.getStats().catch(() => ({ backend: 'unknown', text: 0, video: 0 }));
  res.json({
    status: 'ok',
    db: supabase ? (supabaseHealthy === false ? 'unavailable' : 'supabase') : 'local',
    version: APP_VERSION,
    uptime: process.uptime(),
    users: users.size,
    rooms: rooms.size,
    matchQueue: qStats.backend,
    waiting: { text: qStats.text, video: qStats.video },
    architecture: {
      edge: 'Cloudflare / WAF (DNS) → HTTPS/WSS',
      gateway: 'Express (API + Socket.IO) · rate limits · gift validation',
      redis: qStats.backend === 'redis' ? 'match · rooms · limits' : 'fallback:memory',
      postgres: supabase ? 'wallet · coins · gifts · users · audit' : 'local_json',
      media: livekitRooms.isConfigured()
        ? 'LiveKit SFU (group video) · WebRTC mesh (1:1)'
        : 'WebRTC mesh (set LIVEKIT_* for group SFU)',
      youtubeLive: isFfmpegAvailable() ? 'ffmpeg-ready' : 'ffmpeg-missing',
      livekit: livekitRooms.statusPayload(),
    },
  });
});

// LiveKit SFU status (no secrets) — group video media plane
app.get('/api/livekit/status', (req, res) => {
  res.json(livekitRooms.statusPayload());
});

// API TURN/ICE — regional UDP-first, then TCP, then TLS
const { buildIceServers } = require('./iceServers');
app.get('/api/turn', (req, res) => {
  const qCountry = String(req.query.country || '').trim();
  const qRegion = String(req.query.region || '').trim();
  let country = qCountry;
  if (!country) {
    try {
      const geoip = require('geoip-lite');
      const ip = (req.ip === '::1' ? '127.0.0.1' : req.ip) || '';
      const clean = String(ip).replace(/^::ffff:/, '');
      country = geoip.lookup(clean)?.country || '';
    } catch { /* ignore */ }
  }
  const { iceServers, region, relay } = buildIceServers({ country, region: qRegion });
  res.set('Cache-Control', 'private, max-age=60');
  res.json({ iceServers, region, relay, country: country || null });
});

// COIN SYSTEM API
const COIN_CLAIM_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

app.post('/api/user/credit-age', async (req, res) => {
  const ip = getClientIp(req);
  await getCoinUser(ip);
  res.json({ success: true });
});

app.get('/api/user/coins', async (req, res) => {
  const ip = getClientIp(req);
  try {
    const user = await getCoinUser(ip);
    const now = Date.now();
    const nextClaim = (Number(user.last_claim) || 0) + COIN_CLAIM_INTERVAL_MS;

    res.json({
      coins: user.coins,
      streak: user.streak,
      canClaim: now >= nextClaim,
      nextClaim: Math.max(0, nextClaim - now),
      registered: !!user.registered,
      activeSeconds: user.active_seconds || 0,
    });
  } catch (e) {
    res.status(500).json({ error: 'Platform sync delayed' });
  }
});

app.post('/api/user/claim', async (req, res) => {
  const ip = getClientIp(req);
  const now = Date.now();
  const waitTime = COIN_CLAIM_INTERVAL_MS;

  try {
    if (!economy?.runLocked || !economy?.applyCredit) {
      return res.status(503).json({ error: 'Economy unavailable' });
    }

    const result = await economy.runLocked(ip, async () => {
      const user = await getCoinUser(ip);
      if (now < (Number(user.last_claim) || 0) + waitTime) {
        return { ok: false, error: 'Too early to claim' };
      }

      const today = new Date().toDateString();
      const yesterday = new Date(now - 86400000).toDateString();
      let streak = Number(user.streak) || 1;
      if (user.last_claim_date === yesterday) streak += 1;
      else if (user.last_claim_date !== today) streak = 1;

      const bonus = streak > 1 ? Math.min((streak - 1) * 5, 50) : 0;
      const payout = 30 + bonus;

      await updateCoinUser(ip, {
        last_claim: now,
        last_claim_date: today,
        streak,
      });
      const credited = await economy.applyCredit(ip, payout, 'daily_claim', { streak, bonus });
      if (!credited.ok) return { ok: false, error: credited.error || 'Claim failed' };
      return { ok: true, coins: credited.balance, streak, bonus };
    });

    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json({ coins: result.coins, streak: result.streak, bonus: result.bonus });
  } catch (e) {
    res.status(500).json({ error: 'Claim failed' });
  }
});

app.post('/api/user/spend', async (req, res) => {
  const ip = getClientIp(req);
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0 || amount > SPEND_MAX_AMOUNT) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  const reason = String(req.body?.reason || '');
  const price = SPEND_PRICES[reason];
  if (price === undefined) {
    return res.status(400).json({ error: 'Unknown purchase' });
  }
  const charge = Array.isArray(price) ? (price.includes(amount) ? amount : null) : price;
  if (charge == null) {
    return res.status(400).json({ error: 'Invalid amount for this purchase' });
  }
  try {
    if (!economy?.debit) return res.status(503).json({ error: 'Economy unavailable' });
    const result = await economy.debit(ip, charge, `spend_${reason}`, { reason });
    if (!result.ok) {
      return res.status(400).json({ error: result.error || 'Insufficient coins' });
    }
    res.json({ success: true, balance: result.balance });
  } catch (e) {
    res.status(500).json({ error: 'Spend failed' });
  }
});

// NVIDIA AI PROXY
app.post('/api/ai/spark', async (req, res) => {
  const { interest } = req.body || {};
  if (!nvidiaAi.isConfigured()) return res.status(503).json({ error: 'AI Service Offline' });
  try {
    const spark = await nvidiaAi.spark(interest);
    res.json({ spark: spark || 'Hello! What is on your mind today?' });
  } catch (err) {
    res.status(500).json({ error: 'AI generation failed' });
  }
});

app.post('/api/ai/reply', async (req, res) => {
  const { lastMessage } = req.body || {};
  if (!nvidiaAi.isConfigured()) return res.status(503).json({ error: 'AI Service Offline' });
  try {
    const replies = await nvidiaAi.quickReplies(lastMessage);
    res.json({ replies });
  } catch (err) {
    res.status(500).json({ error: 'AI reply failed' });
  }
});

app.post('/api/ai/suggest', async (req, res) => {
  if (!nvidiaAi.isConfigured()) return res.status(503).json({ error: 'AI Offline' });
  try {
    const suggestions = await nvidiaAi.suggestTopics();
    res.json({ suggestions });
  } catch (err) {
    res.status(500).json({ error: 'AI failed' });
  }
});

app.post('/api/ai/translate', async (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.json({ translated: '' });
  if (!nvidiaAi.isConfigured()) return res.status(503).json({ error: 'AI Service Offline' });
  try {
    const translated = await nvidiaAi.translate(text);
    res.json({ translated: translated || text });
  } catch (err) {
    res.status(500).json({ error: 'AI translation failed' });
  }
});

// AI ADMIN SYSTEM SUMMARY
app.get('/api/admin/ai/summary', requireAdmin, async (req, res) => {
  if (!nvidiaAi.isConfigured()) return res.json({ summary: 'NVIDIA API Key not configured. AI diagnostics offline.' });

  try {
    const errorSummaries = errorLogs.map(l => `[${l.module}] ${l.message}`).join('\n');
    const reportSummaries = reports.filter(r => !r.resolved).map(r => `[REPORT] ${r.reason} against IP ${r.targetIp}`).join('\n');

    const context = `SYSTEM STATUS:
ERRORS (Last 50):
${errorSummaries || 'None detected.'}

OPEN REPORTS:
${reportSummaries || 'No open community flags.'}

USER STATS:
Current Users: ${users.size}
Server Uptime: ${process.uptime()}s 
`;

    const summary = await nvidiaAi.adminSummary(context);
    res.json({ summary, rawLogs: errorLogs });
  } catch (err) {
    logSystemError('ADMIN_AI', err);
    res.status(500).json({ error: 'AI summary failed' });
  }
});

// AI Moderation Proxy
app.post('/api/ai/moderate', async (req, res) => {
  const { text } = req.body || {};
  if (!text) return res.json({ safe: true, warning: null });

  if (!nvidiaAi.isConfigured()) {
    const badWords = ['hate', 'kill', 'suicide', 'die', 'murder', 'racist', 'nazi'];
    const isBad = badWords.some(w => text.toLowerCase().includes(w));
    return res.json({ safe: !isBad, warning: isBad ? 'Your message contains protected or harmful speech. Please follow our community guidelines.' : null });
  }

  try {
    const result = await nvidiaAi.moderate(text);
    res.json(result);
  } catch (err) {
    res.json({ safe: true });
  }
});




// Duplicate Approve Endpoint Removed to resolve 401 Neural Key Mismatch.
// Using the primary one at line 409 which correctly generates passwords.

// Removed duplicate creator list endpoint; merged into /api/admin/creators above.

// Serve React build when client/dist exists (single-host deploy). Else API-only (Vercel frontend).
const clientBuild = path.join(__dirname, '..', 'client', 'dist');
const clientExists = fs.existsSync(path.join(clientBuild, 'index.html'));
if (clientExists) {
  app.use(express.static(clientBuild, { index: false }));
}
app.get(/^(?!\/api|\/socket\.io|\/health)/, (req, res, next) => {
  if (clientExists) {
    return res.sendFile(path.join(clientBuild, 'index.html'), (err) => {
      if (err) next();
    });
  }
  const frontendUrl = process.env.FRONTEND_ORIGIN || 'https://helloooo.site';
  const url = frontendUrl.split(',')[0].trim();
  res.redirect(302, url);
});

const server = http.createServer(app);

const io = new Server(server, {
  path: '/socket.io',
  // Same allowlist as HTTP CORS — never fall back to "any origin" in
  // production, and never reject a domain the HTTP API already allows.
  cors: { origin: ALLOWED_ORIGINS, credentials: true },
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  allowEIO3: true
});

// Channel lookup shared with enhancements (share links) and economy (gift
// membership checks) — filled once audioChannels registers below.
const audioChannelLookup = { get: (_id) => null };

const enhancements = registerEnhancements(app, io, {
  rooms,
  users,
  reports,
  blockedIps,
  sanitize,
  generateId,
  supabase,
  localDb,
  saveLocalDb,
  countryFromIP,
  addUserToRoom,
  removeUserFromRoom,
  saveRating: (payload) => persistence.saveRating(payload),
  getAudioChannel: (id) => audioChannelLookup.get(id),
});

const uniqueFeatures = registerUniqueFeatures(app, io, {
  rooms,
  users,
  reports,
  sanitize,
  countryFromIP,
  persistence,
});

app.get('/api/pro/status', async (req, res) => {
  const ip = getClientIp(req);
  const status = await persistence.getProStatus(ip);
  res.json(status);
});

// Pro codes grant paid features; cap activation attempts per IP so a valid code
// can't be found by brute force (the global 120/min limit is far too loose here).
const proActivateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { ok: false, error: 'Too many activation attempts. Try again later.' },
  standardHeaders: true,
});
app.post('/api/pro/activate', proActivateLimiter, async (req, res) => {
  const ip = getClientIp(req);
  const code = String(req.body?.code || '').trim();
  if (!code) return res.status(400).json({ ok: false, error: 'Code required' });
  const result = await persistence.activatePro(ip, { code });
  if (!result.ok) return res.status(400).json(result);
  for (const [sid, user] of users.entries()) {
    if (user.ip === ip) {
      io.to(sid).emit('pro-activated', { isPro: true, proUntil: result.proUntil });
    }
  }
  res.json(result);
});

app.post('/api/vibe/session-summary', async (req, res) => {
  const { topics, durationSec } = req.body || {};
  if (!nvidiaAi.isConfigured()) {
    return res.json({ summary: 'friendly social', offline: true });
  }
  const summary = await nvidiaAi.vibeSummary(Array.isArray(topics) ? topics : [], Number(durationSec) || 0);
  res.json({ summary });
});

// ---------------------------------------------------------------------------
// Voice channels, coin race game, economy (gifts/tiers) and moderation.
// Registered in dependency order: moderation -> audio identity -> economy -> audio -> game.
// `isAdminRequest` reuses the same timing-safe key comparison as requireAdmin.
// ---------------------------------------------------------------------------
function isAdminRequest(req) {
  const adminKey = getAdminKey();
  if (!adminKey) return false;
  return safeEqualKeys((req.header('x-admin-key') || '').toString().trim(), adminKey);
}

const moderation = registerModeration(app, io, {
  users,
  blockedIps,
  supabase,
  isAdminRequest,
  sanitize,
  terminateUserSession,
  nvidiaAi,
  ADMIN_ROOM,
});

const audioIdentity = registerAudioIdentity(app, io, {
  saveLocalDb,
  localDb,
  supabase,
  audit: moderation.audit,
});

registerPayments(app, { persistence, blockedIps, io, users, audioIdentity });

economy = registerEconomy(app, io, {
  users,
  getCoinUser,
  updateCoinUser,
  supabase,
  saveLocalDb,
  isAdminRequest,
  sanitize,
  audit: moderation.audit,
  getAudioChannel: (id) => audioChannelLookup.get(id),
  rateLimit: (key, opts) => infra.rateLimit(key, opts),
  audioIdentity,
});

// Forward declaration: the game needs the channel registry, and channels need
// to tear down games when they empty. `raceGame` is assigned just below.
let raceGame = null;

const audioChannels = registerAudioChannels(app, io, {
  users,
  sanitize,
  generateId,
  blockedIps,
  userBlocks,
  isAdminRequest,
  audit: moderation.audit,
  economy,
  screenText: moderation.screenText,
  onChannelEmpty: (channelId) => {
    raceGame?.destroyForChannel(channelId);
    void infra.clearRoomPresence(channelId);
  },
  onChannelChange: (channel) => {
    if (!channel) return;
    void infra.setRoomPresence(channel.id, {
      kind: 'audio',
      topic: channel.topic,
      members: channel.members?.size || 0,
      speakers: [...(channel.members?.values?.() || [])].filter((m) => m.role !== 'listener').length,
    });
  },
});
audioChannelLookup.get = (id) => audioChannels.getChannel(id);

raceGame = registerRaceGame(app, io, {
  users,
  audioChannels,
  economy,
  isAdminRequest,
  audit: moderation.audit,
});

// API 404 fallback — must be after registerEnhancements (rooms/public, creators, etc.)
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Central error handler — must be registered after all routes/middleware.
// Catches synchronous throws and next(err) so routes never leak stack traces.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  logSystemError('EXPRESS', err, { method: req.method, url: req.originalUrl });
  if (res.headersSent) return;
  const status = Number(err?.status) || (err?.type === 'entity.parse.failed' ? 400 : 500);
  res.status(status).json({ error: status === 400 ? 'Bad request' : 'Internal server error' });
});

// Per-socket rate limit for signaling (WebRTC offer/answer/ICE bursts)
const signalCount = new Map();
const rateLimitNotifyAt = new Map();
function isSignalRateLimited(socketId, socket) {
  const now = Date.now();
  const entry = signalCount.get(socketId) || { count: 0, reset: now + 60000 };
  if (now > entry.reset) {
    entry.count = 0;
    entry.reset = now + 60000;
  }
  entry.count++;
  signalCount.set(socketId, entry);
  if (entry.count > SIGNAL_MAX_PER_MINUTE) {
    const last = rateLimitNotifyAt.get(socketId) || 0;
    if (now - last > 12000 && socket) {
      rateLimitNotifyAt.set(socketId, now);
      socket.emit('signal-rate-limited', {
        message: 'WebRTC signaling rate limit reached. Pause a moment and try again.',
        retryAfterMs: 60000,
      });
    }
    return true;
  }
  return false;
}

io.on('connection', (socket) => {
  const userId = generateId('usr');
  const ip = socket.handshake.headers['x-forwarded-for']?.split(',')[0]?.trim() || socket.handshake.address;
  const country = countryFromIP(ip);

  stats.totalConnections++;
  stats.uniqueIps.add(ip);

  if (settings.maintenanceMode) {
    socket.emit('system-maintenance', { message: 'Helloooo is currently undergoing scheduled maintenance. Please check back later!' });
    return socket.disconnect(true);
  }

  if (blockedIps.has(ip)) {
    socket.emit('blocked-ip', { message: 'Your IP has been blocked. Please pay to unblock.' });
    socket.disconnect(true);
    return;
  }

  users.set(socket.id, {
    id: userId,
    ip,
    country,
    region: country,
    language: null,
    nickname: 'Anonymous',
    rooms: new Set(),
    isCreator: false,
    creatorData: null
  });

  enhancements.attachSocketHandlers(socket, ip);
  uniqueFeatures.attachSocketHandlers(socket, ip);
  moderation.attachSocketHandlers(socket, ip);
  economy.attachSocketHandlers(socket, ip);
  audioIdentity.attachSocketHandlers(socket, ip, users);
  audioChannels.attachSocketHandlers(socket, ip);
  raceGame.attachSocketHandlers(socket, ip);

  // Uniform handler registration: wraps every handler in try/catch so a failing
  // async handler logs and emits `error` instead of an unhandled rejection.
  const on = (eventName, fn) => socket.on(eventName, wrapSocketHandler(socket, eventName, fn));

  // Per-socket pacing state for accumulate-activity heartbeats.
  let lastActivityAcceptedAt = 0;

  // Admin sockets authenticate with the admin key and join a private room so
  // privileged events (new applications, admin notifications) are never broadcast.
  on('admin-auth', (data) => {
    const adminKey = getAdminKey();
    if (!adminKey) return;
    if (safeEqualKeys(data?.adminKey, adminKey)) {
      socket.join(ADMIN_ROOM);
      socket.emit('admin-auth-ok', { ok: true });
    }
  });

  // Leave any group-room waiting queues (client emits when cancelling queue UI).
  on('cancel-group-queue', () => {
    for (const [key, q] of groupQueues.entries()) {
      groupQueues.set(key, q.filter((e) => e.socketId !== socket.id));
    }
  });

  (async () => {
    let finalNick = 'Anonymous';
    let finalIsCreator = false;
    if (supabase) {
      const { data } = await supabase.from('creators').select('*').contains('authorized_ips', [ip]).eq('status', 'approved').single();
      if (data) {
        const u = users.get(socket.id);
        if (u) {
          u.isCreator = true;
          u.nickname = data.handle_name;
          u.creatorData = data;
          finalNick = u.nickname;
          finalIsCreator = true;
        }
      }
    } else {
      const data = localDb.creators.find(c => c.authorized_ips.includes(ip) && c.status === 'approved');
      if (data) {
        const u = users.get(socket.id);
        if (u) {
          u.isCreator = true;
          u.nickname = data.handle_name;
          u.creatorData = data;
          finalNick = u.nickname;
          finalIsCreator = true;
        }
      }
    }
    // Ensure user has a coin profile and send persistent states
    const coinData = await getCoinUser(ip);
    const proStatus = await persistence.getProStatus(ip);
    socket.emit('connected', {
      userId,
      nickname: finalNick,
      isCreator: finalIsCreator,
      country,
      coins: coinData.coins || 0,
      registered: !!coinData.registered,
      activeSeconds: coinData.active_seconds || 0,
      isPro: proStatus.isPro,
      subscription: proStatus.subscription,
      proUntil: proStatus.proUntil || null,
      settings: {
        adsEnabled: settings.adsEnabled,
        allowDevTools: settings.allowDevTools,
        adScripts: { ...settings.adScripts },
      },
    });

    emitOnlineCount();
  })();

  on('list-group-rooms', (data) => {
    const { mode } = data || {}; // 'group_video' or 'group_text'
    const available = [];
    for (const [rid, room] of rooms.entries()) {
      if ((!mode || room.mode === mode) && (room.mode === 'group_video' || room.mode === 'group_text')) {
        available.push({
          id: room.id,
          interest: room.interest,
          mode: room.mode,
          participantCount: room.users.size,
          maxSize: room.maxSize,
          isFull: room.users.size >= room.maxSize,
          queueLength: (groupQueues.get(room.interestKey) || []).length
        });
      }
    }
    socket.emit('group-rooms-list', { rooms: available });
  });

  on('report-user', (data) => {
    let targetIp = 'unknown';
    const targetSid = data?.targetSocketId;
    if (targetSid && users.has(targetSid)) {
      targetIp = users.get(targetSid).ip || 'unknown';
    } else {
      for (const [, room] of rooms) {
        if (!room.users.has(socket.id)) continue;
        for (const pt of room.participants) {
          if (pt.socketId === socket.id) continue;
          const opponentData = users.get(pt.socketId);
          if (opponentData) {
            targetIp = opponentData.ip || targetIp;
            break;
          }
        }
        if (targetIp !== 'unknown') break;
      }
    }
    reports.push({
      id: generateId('rpt'),
      reporterIp: ip,
      targetIp,
      reason: sanitize(String(data?.reason || 'unspecified'), 120),
      timestamp: Date.now()
    });
    persistence.saveReport(reports[reports.length - 1]).catch(() => {});
    uniqueFeatures.adjustTrust(ip, -2);
    if (targetIp && targetIp !== 'unknown') uniqueFeatures.adjustTrust(targetIp, -8);
    if (data?.block && targetIp && targetIp !== ip && targetIp !== 'unknown') {
      if (!userBlocks.has(ip)) userBlocks.set(ip, new Set());
      userBlocks.get(ip).add(targetIp);
      audioChannels.kickByIp?.(targetIp, 'blocked');
    }
  });

  on('block-user', (data) => {
    let targetIp = null;
    if (data?.targetSocketId) {
      const u = users.get(data.targetSocketId);
      if (u) targetIp = u.ip;
    }
    if (!targetIp) {
      for (const [, room] of rooms) {
        if (room.users.has(socket.id)) {
          for (const pt of room.participants) {
            if (pt.socketId !== socket.id) {
              const opp = users.get(pt.socketId);
              if (opp) { targetIp = opp.ip; break; }
            }
          }
          if (targetIp) break;
        }
      }
    }
    if (targetIp && targetIp !== ip) {
      if (!userBlocks.has(ip)) userBlocks.set(ip, new Set());
      userBlocks.get(ip).add(targetIp);
      audioChannels.kickByIp?.(targetIp, 'blocked');
    }
  });

  // Find partner for 1:1 text or video (Redis queue or in-memory fallback)
  on('find-partner', async (data) => {
    const userData = users.get(socket.id);
    if (!userData) return;
    await resolveCreatorIdentity(userData, data, ip);
    const mode = data?.mode === 'video' ? 'video' : 'text';
    const interest = sanitize(String(data?.interest || 'general').toLowerCase(), 30) || 'general';
    const nickname = userData.isCreator
      ? sanitize(userData.nickname || userData.creatorData?.handle_name || 'Creator', 30)
      : sanitize(data?.nickname || userData.nickname || 'Anonymous', 30);
    const region = sanitize(String(data?.region || userData.country || ''), 10);
    const language = sanitize(String(data?.language || ''), 20);
    const conversationMode = sanitize(String(data?.conversationMode || 'free'), 30);
    const topicContract = sanitize(String(data?.topicContract || ''), 40);
    userData.nickname = nickname;
    userData.region = region;
    userData.language = language;

    const proStatus = await persistence.getProStatus(ip);
    const wantsPro = !!(data?.matchCountryOnly || data?.matchRegionOnly || data?.reconnectToUserId);
    if (wantsPro && !proStatus.isPro) {
      socket.emit('pro-required', { message: 'Pro required for reconnect and region matching.' });
    }
    const matchCountryOnly = !!(proStatus.isPro && data?.matchCountryOnly);
    const matchRegionOnly = !!(proStatus.isPro && data?.matchRegionOnly);
    const reconnectToUserId = proStatus.isPro && data?.reconnectToUserId
      ? sanitize(String(data.reconnectToUserId), 64)
      : null;

    if (userData.rooms && userData.rooms.size > 0) {
      for (const rid of [...userData.rooms]) {
        const room = rooms.get(rid);
        userData.rooms.delete(rid);
        try { socket.leave(rid); } catch { /* ignore */ }
        if (room && room.users.has(socket.id)) {
          removeUserFromRoom(socket.id, rid, io);
        }
      }
    }

    const myBlocks = userBlocks.get(ip);
    const baseCanMatch = (e) => {
      if (e.socketId === socket.id) return false;
      const otherIp = users.get(e.socketId)?.ip || e.userData?.ip;
      if (!otherIp || blockedIps.has(otherIp)) return false;
      if (myBlocks && myBlocks.has(otherIp)) return false;
      if (userBlocks.get(otherIp)?.has(ip)) return false;
      return true;
    };

    const canMatch = (e) => {
      if (!baseCanMatch(e)) return false;
      const otherUser = users.get(e.socketId);
      const otherCountry = otherUser?.country || e.userData?.country;
      const otherRegion = otherUser?.region || e.region || e.userData?.country;
      if (matchCountryOnly && otherCountry !== userData.country) return false;
      if (matchRegionOnly && otherRegion !== region) return false;

      const otherId = e.userData?.id || otherUser?.id;
      if (reconnectToUserId) return otherId === reconnectToUserId;
      if (e.reconnectToUserId) return e.reconnectToUserId === userData.id;

      const sw = userData.skipWindow;
      const otherSw = e.userData?.skipWindow || otherUser?.skipWindow;
      if (sw?.partnerId && otherId && sw.partnerId === otherId && Date.now() < sw.until) {
        if (otherSw?.partnerId === userData.id && Date.now() < otherSw.until) return true;
        return false;
      }
      if (otherSw?.partnerId === userData.id && Date.now() < otherSw.until) return false;

      return true;
    };

    const isAvailable = (e) => {
      const ud = users.get(e.socketId);
      if (!ud || !io.sockets.sockets.get(e.socketId)) return false;
      if (ud.rooms && ud.rooms.size > 0) return false;
      return true;
    };

    const repFn = (otherIp) => persistence.getReputationBoost(otherIp);
    const interests = parseInterests(data, interest, sanitize);
    const entry = {
      socketId: socket.id,
      userData,
      interest,
      interests,
      region,
      language,
      conversationMode,
      topicContract,
      matchCountryOnly,
      matchRegionOnly,
      reconnectToUserId,
    };

    const result = await matchQueue.findOrEnqueue({
      mode,
      entry,
      isCreator: !!userData.isCreator,
      canMatch,
      isAvailable,
      pickSmartMatch: enhancements.pickSmartMatch,
      interest,
      region,
      language,
      repFn,
    });

    if (result.status === 'matched' && result.match) {
      const match = result.match;
      const otherData = users.get(match.socketId);
      const otherSocket = io.sockets.sockets.get(match.socketId);
      if (!otherData || !otherSocket) {
        await matchQueue.findOrEnqueue({
          mode,
          entry,
          isCreator: !!userData.isCreator,
          canMatch,
          isAvailable,
          pickSmartMatch: enhancements.pickSmartMatch,
          interest,
          region,
          language,
          repFn,
        });
        socket.emit('waiting-for-partner', { mode, interest });
        return;
      }

      const room = createRoom(interest, mode, socket.id, { id: userData.id, nickname: userData.nickname, country: userData.country, isCreator: userData.isCreator }, PAIR_MAX);
      uniqueFeatures.enrichPartnerMatch(room, socket.id, data);
      addUserToRoom(room, match.socketId, { id: otherData.id, nickname: otherData.nickname, country: otherData.country, isCreator: otherData.isCreator });
      userData.rooms.add(room.id);
      otherData.rooms.add(room.id);
      socket.join(room.id);
      otherSocket.join(room.id);

      const myPeer = { socketId: socket.id, userId: userData.id, nickname: userData.nickname, country: userData.country, isCreator: userData.isCreator };
      const otherPeer = { socketId: match.socketId, userId: otherData.id, nickname: otherData.nickname, country: otherData.country, isCreator: otherData.isCreator };

      userData.lastPartnerUserId = otherData.id;
      otherData.lastPartnerUserId = userData.id;

      const sessionConfig = uniqueFeatures.emitSessionConfig(room.id);
      const theirInterests = match.interests?.length
        ? match.interests
        : parseInterests({ interests: [match.interest] }, match.interest, sanitize);
      const sharedInterests = computeSharedInterests(interests, theirInterests, interest);
      const mutualSkipReconnect = !!(
        userData.skipWindow?.partnerId === otherData.id
        && otherData.skipWindow?.partnerId === userData.id
        && Date.now() < (userData.skipWindow?.until || 0)
        && Date.now() < (otherData.skipWindow?.until || 0)
      );
      socket.emit('partner-found', { roomId: room.id, peer: otherPeer, country: userData.country, sessionConfig, sharedInterests, mutualSkipReconnect });
      otherSocket.emit('partner-found', { roomId: room.id, peer: myPeer, country: otherData.country, sessionConfig, sharedInterests, mutualSkipReconnect });

      const reconnectToken = enhancements.issueReconnectToken(socket.id, { roomId: room.id, nickname: userData.nickname, mode });
      socket.emit('reconnect-token', { token: reconnectToken });
      const otherToken = enhancements.issueReconnectToken(match.socketId, { roomId: room.id, nickname: otherData.nickname, mode });
      otherSocket.emit('reconnect-token', { token: otherToken });

      if (userData.isCreator) {
        pushRoomChatMessage(room, buildCreatorIntroMessage(room.id, socket.id, userData));
      }
      if (otherData.isCreator) {
        pushRoomChatMessage(room, buildCreatorIntroMessage(room.id, match.socketId, otherData));
      }

      const history = room.messages || [];
      socket.emit('chat-history', { roomId: room.id, messages: history });
      otherSocket.emit('chat-history', { roomId: room.id, messages: history });
    } else {
      socket.emit('waiting-for-partner', { mode, interest });
    }
  });

  on('cancel-find-partner', () => {
    void matchQueue.removeFromQueues(socket.id);
  });

  // Join group by interest (find or create room, max 4)
  on('join-group-by-topics', (data) => {
    const userData = users.get(socket.id);
    if (!userData) return;
    const interest = sanitize(String(data?.interest || '').toLowerCase(), 30) || 'general';
    const mode = data?.mode === 'group_text' ? 'group_text' : 'group_video';
    const nickname = sanitize(data?.nickname || 'Anonymous', 30);
    userData.nickname = nickname;

    const myBlocks = userBlocks.get(ip);
    const canJoinRoom = (r) => {
      for (const p of r.participants) {
        const otherIp = users.get(p.socketId)?.ip;
        if (!otherIp || blockedIps.has(otherIp)) return false;
        if (myBlocks && myBlocks.has(otherIp)) return false;
        if (userBlocks.get(otherIp)?.has(ip)) return false;
      }
      return true;
    };

    const key = interestKey(interest, mode);
    let room = getRoomByInterestKey(key, true); // Get it even if full

    // If the pod for this interest is full, spill into a fresh room with this user as host
    // (interestToRoom updates to the new room so the next joiners land there).
    let preferFreshPod = false;
    if (room && room.users.size >= room.maxSize) {
      preferFreshPod = true;
      room = null;
    }

    if (room && !canJoinRoom(room)) room = null;
    if (!room && !preferFreshPod) {
      room = getAnyRoomByMode(mode);
      if (room && !canJoinRoom(room)) room = null;
    }
    if (!room) {
      const trending = ['movies', 'music', 'gaming', 'coding', 'anime', 'travel', 'food', 'art', 'fitness', 'tech'];
      const finalInterest = (interest || 'general').trim().toLowerCase() === 'general' ? trending[Math.floor(Math.random() * trending.length)] : interest;
      room = createRoom(finalInterest, mode, socket.id, { id: userData.id, nickname: userData.nickname, country: userData.country, isCreator: userData.isCreator });
    } else {
      const added = addUserToRoom(room, socket.id, { id: userData.id, nickname: userData.nickname, country: userData.country, isCreator: userData.isCreator });
      if (!added) {
        socket.emit('room-full', { message: 'Room is full. Try again.' });
        return;
      }
    }

    userData.rooms.add(room.id);
    socket.join(room.id);

    const peers = room.participants
      .filter((p) => p.socketId !== socket.id)
      .map((p) => {
        const u = users.get(p.socketId);
        return {
          socketId: p.socketId,
          userId: u?.id,
          nickname: p.nickname,
          country: u?.country,
          isCreator: !!u?.isCreator
        };
      });

    socket.emit('group-joined', {
      roomId: room.id,
      mode,
      interest: room.interest,
      participantCount: room.users.size,
      country: userData.country,
      sfu: livekitRooms.isConfigured() && mode === 'group_video'
        ? { enabled: true, provider: 'livekit', url: livekitRooms.publicUrl() }
        : { enabled: false },
    });
    const groupReconnect = enhancements.issueReconnectToken(socket.id, { roomId: room.id, nickname: userData.nickname, mode });
    socket.emit('reconnect-token', { token: groupReconnect });
    socket.emit('existing-peers', { roomId: room.id, peers, total: peers.length });
    socket.emit('chat-history', { roomId: room.id, messages: (room.messages || []).slice(-MESSAGE_HISTORY) });

    socket.to(room.id).emit('user-joined', {
      roomId: room.id,
      socketId: socket.id,
      userId: userData.id,
      nickname: userData.nickname,
      country: userData.country,
      isCreator: !!userData.isCreator,
      participantCount: room.users.size,
    });
  });

  on('join-specific-group', (data) => {
    const userData = users.get(socket.id);
    if (!userData) return;
    const { roomId, nickname } = data || {};
    if (!roomId) return socket.emit('error', { message: 'Room ID required' });
    userData.nickname = sanitize(nickname || 'Anonymous', 30);

    const room = rooms.get(roomId);
    if (!room) return socket.emit('room-full', { message: 'Room not found or expired.' });
    if (room.mode !== 'group_video' && room.mode !== 'group_text') return socket.emit('room-full', { message: 'Invalid room mode.' });

    const myBlocks = userBlocks.get(ip);
    for (const p of room.participants) {
      const otherIp = users.get(p.socketId)?.ip;
      if (!otherIp || blockedIps.has(otherIp)) return socket.emit('error', { message: 'Cannot join this room.' });
      if (myBlocks && myBlocks.has(otherIp)) return socket.emit('error', { message: 'Cannot join this room.' });
      if (userBlocks.get(otherIp)?.has(ip)) return socket.emit('error', { message: 'Cannot join this room.' });
    }

    const added = addUserToRoom(room, socket.id, { id: userData.id, nickname: userData.nickname, country: userData.country, isCreator: userData.isCreator });
    if (!added) {
      const key = room.interestKey;
      if (key) {
        if (!groupQueues.has(key)) groupQueues.set(key, []);
        const q = groupQueues.get(key);
        q.push({ socketId: socket.id, userData: { id: userData.id, nickname: userData.nickname, country: userData.country, rooms: userData.rooms, isCreator: userData.isCreator } });
        socket.emit('waiting-in-group-queue', { queuePosition: q.length, interest: room.interest });
        return;
      }
      return socket.emit('room-full', { message: 'Room is full.' });
    }

    userData.rooms.add(room.id);
    socket.join(room.id);

    const peers = room.participants
      .filter((p) => p.socketId !== socket.id)
      .map((p) => {
        const u = users.get(p.socketId);
        return { socketId: p.socketId, userId: u?.id, nickname: p.nickname, country: u?.country, isCreator: !!u?.isCreator };
      });

    socket.emit('group-joined', {
      roomId: room.id,
      mode: room.mode,
      interest: room.interest,
      participantCount: room.users.size,
      country: userData.country,
      sfu: livekitRooms.isConfigured() && room.mode === 'group_video'
        ? { enabled: true, provider: 'livekit', url: livekitRooms.publicUrl() }
        : { enabled: false },
    });
    const joinReconnect = enhancements.issueReconnectToken(socket.id, { roomId: room.id, nickname: userData.nickname, mode: room.mode });
    socket.emit('reconnect-token', { token: joinReconnect });
    socket.emit('existing-peers', { roomId: room.id, peers, total: peers.length });
    socket.emit('chat-history', { roomId: room.id, messages: (room.messages || []).slice(-MESSAGE_HISTORY) });

    socket.to(room.id).emit('user-joined', {
      roomId: room.id,
      socketId: socket.id,
      userId: userData.id,
      nickname: userData.nickname,
      country: userData.country,
      isCreator: !!userData.isCreator,
      participantCount: room.users.size,
    });
  });

  on('leave-room', (data) => {
    const roomId = String(data?.roomId || '');
    const userData = users.get(socket.id);
    const room = rooms.get(roomId);
    if (!userData || !room || !room.users.has(socket.id)) return;

    if (room.mode === 'text' || room.mode === 'video') {
      for (const pt of room.participants || []) {
        if (pt.socketId === socket.id) continue;
        const partner = users.get(pt.socketId);
        if (partner?.id) {
          userData.skipWindow = { partnerId: partner.id, until: Date.now() + 15000 };
        }
        break;
      }
    }

    userData.rooms.delete(roomId);
    socket.leave(roomId);
    removeUserFromRoom(socket.id, roomId, io);
    socket.emit('left-room', { roomId });
  });

  on('rename-group-room', async (data) => {
    const { roomId, newInterest } = data || {};
    const u = users.get(socket.id);
    const room = rooms.get(roomId);
    if (!u || !room) return;
    if (!u.isCreator) {
      return socket.emit('error', { message: 'Only verified creators can specialize room topics.' });
    }
    if (room.mode !== 'group_video' && room.mode !== 'group_text') return;

    // Validate BEFORE charging: membership first, then topic. No charge on failure.
    if (!room.users.has(socket.id)) {
      return socket.emit('error', { message: 'You are not in this room.' });
    }
    const sanitized = sanitize(String(newInterest || '').toLowerCase(), 30);
    if (!sanitized) return socket.emit('error', { message: 'Topic is too short or invalid.' });

    const cUser = await getCoinUser(ip);
    const balance = Number(cUser.coins) || 0;
    if (balance < 25) {
      return socket.emit('error', { message: 'Insufficient Mana (25 Coins Required).' });
    }

    if (!economy?.debit) {
      return socket.emit('error', { message: 'Economy unavailable.' });
    }
    const spent = await economy.debit(ip, 25, 'realm_specialize', { roomId });
    if (!spent.ok) {
      return socket.emit('error', { message: spent.error || 'Insufficient Mana (25 Coins Required).' });
    }

    room.interest = sanitized;
    io.to(roomId).emit('group-renamed', { interest: sanitized, nickname: u.nickname });

    // PERSISTENCE: Commit specialized topic to SQL
    if (supabase) {
      await supabase.from('group_rooms').upsert({ id: roomId, interest: sanitized, creator_ip: ip });
      await supabase.from('activity_logs').insert({ ip, action: 'renamed_room', amount: 25, details: `Topic: ${sanitized} (Room: ${roomId})` });
    }
  });

  on('send-message', async (data) => {
    const { roomId, text, replyTo } = data || {};
    const u = users.get(socket.id);
    if (!u) return socket.emit('error', { message: 'Session lost. Please refresh.' });
    const room = rooms.get(roomId);
    if (!room) return socket.emit('error', { message: 'Chat room not found or closed.' });
    if (!room.users.has(socket.id)) return socket.emit('error', { message: 'You are no longer in this room.' });
    if (settings.maintenanceMode) return socket.emit('error', { message: 'Messaging disabled during maintenance.' });
    if (!enhancements.beforeSendMessage(socket, roomId)) return;

    const msgType = data?.type === 'voice' ? 'voice' : 'text';
    let msg = String(text || '');
    if (msgType === 'voice') {
      if (msg.length > 150000) return socket.emit('error', { message: 'Voice message too large.' });
    } else {
      msg = sanitize(msg, 500);
      if (!msg) return;
    }

    // AI SAFETY MONITORING — text only
    if (msgType !== 'voice') {
    const profanities = [
      // English Core
      'fuck', 'shit', 'asshole', 'bitch', 'bastard', 'cunt', 'dick', 'pussy', 'nigga', 'nigger', 'faggot',
      'slut', 'whore', 'motherfucker', 'cock', 'jerk', 'dumbass', 'retard', 'scum', 'rape', 'suicide', 'kill',
      'porn', 'sex', 'nude', 'naked', 'xxx', 'horny', 'cum', 'cock', 'tit', 'boob', 'vagina', 'penis', 'anal',
      // Slang / Shortcuts / Symbols
      'fvk', 'sh1t', 'a$$', 'b1tch', 'fcuk', 's-h-i-t', 'n-i-g-g-a', 'stfu', 'lmao', 'f.u.c.k', 'f_u_c_k', 'f-u-c-k',
      'b.i.t.c.h', 'b_i_t_c_h', 'b-i-t-c-h', 'n.i.g.g.a', 'n_i_g_g_a', 'n-i-g-g-a', 'fucc', 'fack', 'fuk',
      // Hindi
      'gaali', 'harami', 'chutiya', 'madarchod', 'behenchod', 'bsdk', 'randi', 'saala', 'kaminey', 'loda', 'rakhel', 'gaand', 'bhosadike', 'choot',
      // Telugu
      'lanja', 'munda', 'pichode', 'nee amma', 'badacow', 'na kodaka', 'dengu', 'lanja kodaka', 'modda', 'puku', 'moddalo', 'erripuku', 'dengey',
      // Common Spanish/Global
      'puta', 'pendejo', 'mierda', 'cabron', 'kurwa', 'foda', 'merde'
    ];

    // Obfuscation Shield: Remove spaces and common symbols to detect hidden harmful words
    const strippedMsg = msg.toLowerCase().replace(/[\s\.\-\_\@\#\$\%\^\&\*\(\)\=\+\{\}\[\]\:\;\"\'\<\>\,\?\/\\]/g, '');
    // Escape regex metacharacters so entries like 'a$$' or 'f.u.c.k' are matched literally,
    // otherwise 'a$$' compiles to `a$$` (trailing-'a' anchor) and blocks any message ending in 'a'.
    const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(${profanities.map(escapeRe).join('|')})`, 'i');

    if (settings.safetyAiEnabled && (pattern.test(msg) || pattern.test(strippedMsg))) {
      socket.emit('content-flagged', {
        message: '⚠️ MESSAGE BLOCKED: Please be respectful. Toxic or explicit language detected.',
        reason: 'Community Guidelines Violation'
      });
      return;
    }

    if (settings.safetyAiEnabled && nvidiaAi.isConfigured()) {
      const mod = await nvidiaAi.moderate(msg);
      if (!mod.safe) {
        socket.emit('content-flagged', {
          message: mod.warning || '⚠️ MESSAGE BLOCKED: Content flagged by AI safety review.',
          reason: 'AI Moderation'
        });
        return;
      }
    }
    }

    stats.totalMessages++;
    const entry = {
      id: generateId('msg'),
      nickname: u.nickname,
      ts: Date.now(),
      socketId: socket.id,
      isCreator: !!u.isCreator,
      country: u.country || null,
      type: msgType,
    };
    if (msgType === 'voice') {
      entry.audio = msg;
      entry.text = '🎤 Voice message';
    } else {
      entry.text = msg;
    }
    // Add reply reference if provided
    if (replyTo && typeof replyTo === 'object') {
      entry.replyTo = {
        id: sanitize(String(replyTo.id || ''), 50),
        text: sanitize(String(replyTo.text || ''), 100),
        nickname: sanitize(String(replyTo.nickname || ''), 30),
      };
    }
    room.messages = room.messages || [];
    room.messages.push(entry);
    if (room.messages.length > 100) room.messages = room.messages.slice(-MESSAGE_HISTORY);
    io.to(roomId).emit('chat-message', { roomId, ...entry });
  });

  on('admin-end-room', (data) => {
    const { roomId, adminKey: providedKey, message } = data || {};
    const adminKey = getAdminKey();
    if (!adminKey || !safeEqualKeys(providedKey, adminKey)) return;
    const room = rooms.get(roomId);
    if (room) {
      const msg = message || 'This session was terminated by administrative protocol.';
      io.to(roomId).emit('room-ended-by-admin', { message: msg });
      [...room.users].forEach((sid) => {
        adminLiveMonitor.clearMonitorPanel(sid);
        io.sockets.sockets.get(sid)?.leave(roomId);
      });
      rooms.delete(roomId);
      if (room.interestKey) interestToRoom.delete(room.interestKey);
    }
  });

  // Wave reaction
  on('send-wave', (data) => {
    const { roomId } = data || {};
    const u = users.get(socket.id);
    const room = rooms.get(roomId);
    if (!u || !room || !room.users.has(socket.id)) return;
    socket.to(roomId).emit('wave-reaction', { fromSocketId: socket.id, nickname: u.nickname });
  });

  // Good vibes
  const goodVibesPending = new Map();
  on('send-good-vibes', (data) => {
    const { roomId } = data || {};
    const u = users.get(socket.id);
    const room = rooms.get(roomId);
    if (!u || !room || !room.users.has(socket.id)) return;
    if (!goodVibesPending.has(roomId)) goodVibesPending.set(roomId, new Set());
    const pending = goodVibesPending.get(roomId);
    pending.add(socket.id);
    const allSent = [...room.users].every(uid => pending.has(uid));
    if (allSent) {
      io.to(roomId).emit('good-vibes-match', { roomId });
      goodVibesPending.delete(roomId);
    }
  });

  on('typing', (data) => {
    const { roomId, isTyping } = data || {};
    // Membership check: only relay typing state for rooms the sender is in.
    const room = rooms.get(roomId);
    if (!roomId || !room || !room.users.has(socket.id)) return;
    socket.to(roomId).emit('stranger-typing', { isTyping: !!isTyping, socketId: socket.id });
  });

  // Hand raise relay
  on('hand-raise', (data) => {
    const { roomId, raised } = data || {};
    const room = rooms.get(roomId);
    if (!room || !room.users.has(socket.id)) return;
    socket.to(roomId).emit('hand-raise', { socketId: socket.id, raised });
  });

  // Room reaction relay
  on('room-reaction', (data) => {
    const { roomId, emoji } = data || {};
    const room = rooms.get(roomId);
    if (!room || !room.users.has(socket.id)) return;
    socket.to(roomId).emit('room-reaction', { socketId: socket.id, emoji });
  });

  on('peer-recording-status', (data) => {
    const { roomId, recording } = data || {};
    const room = rooms.get(roomId);
    const u = users.get(socket.id);
    if (!room || !room.users.has(socket.id)) return;
    if (!!recording && !u?.isCreator) {
      return socket.emit('error', { message: 'Recording is for verified creators only.' });
    }
    socket.to(roomId).emit('peer-recording-status', { socketId: socket.id, recording: !!recording });
  });

  on('tip-creator', async (data) => {
    const { roomId, targetSocketId, amount: rawAmount } = data || {};
    const room = rooms.get(roomId);
    if (!room || !room.users.has(socket.id) || !targetSocketId) return;
    const sender = users.get(socket.id);
    const target = users.get(targetSocketId);
    if (!target?.isCreator || !target.creatorData?.id) {
      return socket.emit('error', { message: 'Tip target is not a verified creator.' });
    }
    // Self-tip guard: tipping converts free/spendable coins into the creator's
    // withdrawable `coins_earned` (real money). A creator tipping their own
    // account from a second tab would launder promotional coins into cash, so
    // block a tip to yourself (same socket) or to your own creator account.
    if (targetSocketId === socket.id) {
      return socket.emit('error', { message: 'You cannot tip yourself.' });
    }
    if (sender?.creatorData?.id && sender.creatorData.id === target.creatorData.id) {
      return socket.emit('error', { message: 'You cannot tip your own creator account.' });
    }
    const amount = Math.min(Math.max(Math.floor(Number(rawAmount) || 0), 1), 500);
    if (amount <= 0) return;

    if (!economy?.debit) {
      return socket.emit('error', { message: 'Economy unavailable.' });
    }
    const spent = await economy.debit(ip, amount, 'creator_tip', { roomId, targetSocketId });
    if (!spent.ok) {
      return socket.emit('error', { message: spent.error || 'Insufficient coins' });
    }

    const creator = target.creatorData;
    const tipTotal = (creator.tips_received_total || 0) + amount;
    const credited = await creatorSecurity.creditCreatorCoins(supabase, localDb, saveLocalDb, creator, amount, {
      type: 'tip',
      details: `Tip from ${sender?.nickname || 'Anonymous'}`,
      metadata: { from_ip: ip, from_nickname: sender?.nickname, room_id: roomId },
    });

    if (supabase) {
      await supabase.from('creators').update({ tips_received_total: tipTotal }).eq('id', creator.id);
    } else {
      creator.tips_received_total = tipTotal;
      saveLocalDb();
    }
    creator.tips_received_total = tipTotal;
    target.creatorData = { ...creator, ...credited, tips_received_total: tipTotal };

    io.to(targetSocketId).emit('creator-tip-received', {
      fromNickname: sender?.nickname || 'Someone',
      amount,
    });
    if (credited) {
      io.to(targetSocketId).emit('creator-balance-updated', credited);
    }
  });

  on('video-style', (data) => {
    const { roomId, filter, blur, targetSocketId } = data || {};
    if (!roomId) return;
    // Membership check: the sender must actually be in the room they style.
    const room = rooms.get(roomId);
    if (!room || !room.users.has(socket.id)) return;
    if (targetSocketId) {
      io.to(targetSocketId).emit('stranger-video-style', { socketId: socket.id, filter, blur });
    } else {
      socket.to(roomId).emit('stranger-video-style', { socketId: socket.id, filter, blur });
    }
  });

  // Log IP activity when connecting
  if (!ipActivity.has(ip)) {
    ipActivity.set(ip, { firstSeen: Date.now(), lastSeen: Date.now(), persisted: false });
  } else {
    ipActivity.get(ip).lastSeen = Date.now();
  }

  // Background check for persistence (only if they stayed long enough)
  persistCoinUser(ip);

  on('join-standard', async (data) => {
    // Initial data handshake for standard modes
  });

  on('spend-coins', async (data) => {
    const { amount, reason } = data || {};
    const reasonKey = String(reason || '');
    const u = users.get(socket.id);
    if (reasonKey === 'room-boost' && !u?.isCreator) {
      return socket.emit('error', { message: 'Room boost is for verified creators only.' });
    }
    const price = SPEND_PRICES[reasonKey];
    if (price === undefined) {
      // Unknown reason => reject without charging (anti free-form mint).
      return socket.emit('error', { message: 'Unknown purchase.' });
    }
    // Server-authoritative charge: the client-declared amount is never trusted
    // unless the table explicitly offers a fixed set of price points.
    let charge;
    if (Array.isArray(price)) {
      const clientAmount = Number(amount);
      if (!Number.isInteger(clientAmount) || !price.includes(clientAmount)) {
        return socket.emit('error', { message: 'Invalid amount for this purchase.' });
      }
      charge = clientAmount;
    } else {
      charge = price;
    }
    if (!Number.isFinite(charge) || !Number.isInteger(charge) || charge <= 0 || charge > SPEND_MAX_AMOUNT) {
      return socket.emit('error', { message: 'Invalid amount.' });
    }

    if (!economy?.debit) {
      return socket.emit('error', { message: 'Economy unavailable.' });
    }
    const spent = await economy.debit(ip, charge, `spend_${reasonKey}`, { reason: reasonKey });
    if (!spent.ok) {
      return socket.emit('error', { message: spent.error || 'Insufficient coins' });
    }
    console.log(`[COINS] User ${socket.id} spent ${charge} for ${reasonKey}`);
  });

  on('claim-active-reward', async () => {
    // Legacy support for welcome bonus if needed, but primary logic is now hourly/accumulated
    const activity = ipActivity.get(ip);
    if (!activity) return;
    const now = Date.now();
    const cUser = await getCoinUser(ip);

    // If they haven't gotten their welcome bonus yet and hit 3m
    if (!cUser.registered && (now - activity.firstSeen >= 180000)) {
      await persistCoinUser(ip);
      // persistCoinUser already credits 40 coins and emits updates
    }
  });

  // HIGH ACCURACY ACCUMULATOR: Triggered frequently by client when active
  on('accumulate-activity', async (data) => {
    // Per-socket pacing: the client heartbeats every ~20s, so calls arriving
    // faster than 15s are ignored — scripted floods can't farm activity time.
    const nowMs = Date.now();
    if (nowMs - lastActivityAcceptedAt < 15000) return;
    lastActivityAcceptedAt = nowMs;

    const { seconds } = data || {};
    const clamped = Math.min(Math.max(Number(seconds) || 0, 0), 60); // Anti-cheat
    if (clamped <= 0) return;

    const cUser = await getCoinUser(ip);
    const newActive = (cUser.active_seconds || 0) + clamped;
    const nextTotal = (cUser.total_active_seconds || 0) + clamped;

    let coinsEarned = 0;
    let finalActive = newActive;

    // Hourly 30-Coin Milestone (Enforced only for verified IPs)
    if (cUser.registered && finalActive >= 3600) {
      coinsEarned = 30;
      finalActive -= 3600;
      await updateCoinUser(ip, {
        active_seconds: finalActive,
        total_active_seconds: nextTotal,
      });
      cUser.active_seconds = finalActive;
      if (economy?.credit) {
        await economy.credit(ip, coinsEarned, 'hourly_active_reward');
      }
    } else {
      await updateCoinUser(ip, {
        active_seconds: finalActive,
        total_active_seconds: nextTotal,
      });
      cUser.active_seconds = finalActive;
    }

    // If they hit 3m but aren't registered yet, trigger persistence (+40 coins)
    if (!cUser.registered && nextTotal >= 180) {
      await persistCoinUser(ip);
    }

    // Credit already emits coins-updated; still push activity progress when no payout.
    if (!coinsEarned) {
      const fresh = coinUsers.get(ip) || cUser;
      for (const [sid, user] of users.entries()) {
        if (user.ip === ip) {
          io.to(sid).emit('coins-updated', {
            coins: fresh.coins,
            activeSeconds: fresh.active_seconds || 0,
            registered: !!fresh.registered,
          });
        }
      }
    }
  });

  on('send-3d-emoji', async (data) => {
    const { roomId, emoji } = data || {};
    const u = users.get(socket.id);
    if (!u?.isCreator) {
      return socket.emit('error', { message: '3D emoji effects are for verified creators only.' });
    }
    // Membership check BEFORE charging.
    const room = rooms.get(roomId);
    if (!room || !room.users.has(socket.id)) {
      return socket.emit('error', { message: 'You are not in this room.' });
    }
    const cUser = await getCoinUser(ip);

    if ((cUser.coins || 0) < 5) return socket.emit('error', { message: 'Need 5 coins for 3D Emoji' });
    if (!economy?.debit) return socket.emit('error', { message: 'Economy unavailable.' });
    const spent = await economy.debit(ip, 5, '3d_emoji', { roomId });
    if (!spent.ok) return socket.emit('error', { message: spent.error || 'Need 5 coins for 3D Emoji' });

    io.to(roomId).emit('3d-emoji', { roomId, emoji, nickname: u?.nickname || 'Someone', socketId: socket.id });
  });

  on('send-media', async (data) => {
    const { roomId, type, content } = data || {};
    const u = users.get(socket.id);
    // Membership check BEFORE charging.
    const room = rooms.get(roomId);
    if (!room || !room.users.has(socket.id)) {
      return socket.emit('error', { message: 'You are not in this room.' });
    }
    // Type whitelist mirroring client usage (image/video data URLs only).
    if (type !== 'image' && type !== 'video') {
      return socket.emit('error', { message: 'Unsupported media type.' });
    }
    // Payload cap: 900KB of data-URL content (mirrors client-side file limits).
    if (typeof content !== 'string' || !content.startsWith('data:') || content.length > 900 * 1024) {
      return socket.emit('error', { message: 'Media payload too large.' });
    }
    const cUser = await getCoinUser(ip);

    const cost = type === 'video' ? 15 : 10;
    if ((cUser.coins || 0) < cost) return socket.emit('error', { message: `Need ${cost} coins for Media` });
    if (!economy?.debit) return socket.emit('error', { message: 'Economy unavailable.' });
    const spent = await economy.debit(ip, cost, `media_${type}`, { roomId, type });
    if (!spent.ok) return socket.emit('error', { message: spent.error || `Need ${cost} coins for Media` });

    io.to(roomId).emit('media-message', { id: generateId('med'), roomId, type, content, nickname: u?.nickname || 'Someone', ts: Date.now(), socketId: socket.id });
  });

  on('admin-monitor-frame', (data) => {
    adminLiveMonitor.ingestMonitorFrame(socket.id, data, users, rooms);
  });

  on('webrtc-signal', (data) => {
    if (isSignalRateLimited(socket.id, socket)) return;
    const { roomId, targetSocketId, type, signal } = data || {};
    const userData = users.get(socket.id);
    const room = rooms.get(roomId);
    if (!userData || !room || !room.users.has(socket.id) || !room.users.has(targetSocketId)) return;
    // When LiveKit SFU is active for group video, ignore mesh media signaling
    if (room.mode === 'group_video' && livekitRooms.isConfigured()) return;
    const valid = ['offer', 'answer', 'ice-candidate'].includes(type);
    if (!valid) return;
    const target = io.sockets.sockets.get(targetSocketId);
    if (!target) return;
    target.emit('webrtc-signal', {
      fromSocketId: socket.id,
      fromUserId: userData.id,
      fromNickname: userData.nickname,
      fromCountry: userData.country,
      fromIsCreator: !!userData.isCreator,
      signal,
      type,
      roomId,
    });
  });

  // LiveKit access token — group video or audio SFU rooms
  on('livekit-token', async (data) => {
    try {
      if (!livekitRooms.isConfigured()) {
        return socket.emit('livekit-token-error', { message: 'LiveKit SFU is not configured on this server.' });
      }
      const roomId = String(data?.roomId || '');
      const u = users.get(socket.id);
      if (!u) {
        return socket.emit('livekit-token-error', { message: 'Not signed in.' });
      }
      const kind = String(data?.kind || 'group_video');
      const nickname = sanitize(data?.nickname || u.nickname || 'Anonymous', 30);

      if (kind === 'audio') {
        const channel = audioChannels.getChannel(roomId);
        if (!channel?.members.has(socket.id)) {
          return socket.emit('livekit-token-error', { message: 'Join the voice room before requesting SFU audio.' });
        }
        if (!channel.useSfu) {
          return socket.emit('livekit-token-error', { message: 'This room is not on LiveKit SFU yet.' });
        }
        const tokenPayload = await livekitRooms.mintParticipantToken({
          socketId: socket.id,
          roomId,
          nickname,
          country: u.country || '',
          isCreator: !!u.isCreator,
          canPublish: true,
          canSubscribe: true,
        });
        return socket.emit('livekit-token', tokenPayload);
      }

      const room = rooms.get(roomId);
      if (!room || !room.users.has(socket.id)) {
        return socket.emit('livekit-token-error', { message: 'Join the Helloooo room before requesting an SFU token.' });
      }
      if (room.mode !== 'group_video') {
        return socket.emit('livekit-token-error', { message: 'LiveKit video is only used for group video.' });
      }
      const tokenPayload = await livekitRooms.mintParticipantToken({
        socketId: socket.id,
        roomId,
        nickname,
        country: u.country || '',
        isCreator: !!u.isCreator,
        canPublish: true,
        canSubscribe: true,
        roomAdmin: !!u.isCreator,
      });
      socket.emit('livekit-token', tokenPayload);
    } catch (err) {
      console.error('[livekit-token]', err.message);
      socket.emit('livekit-token-error', { message: err.message || 'Could not mint LiveKit token' });
    }
  });

  registerYoutubeLiveHandlers(socket, on, { users });

  on('disconnect', () => {
    stopAllForSocket(socket.id);
    void matchQueue.removeFromQueues(socket.id);
    for (const [key, q] of groupQueues.entries()) {
      groupQueues.set(key, q.filter(u => u.socketId !== socket.id));
    }
    const userData = users.get(socket.id);
    if (userData?.rooms) {
      userData.rooms.forEach((roomId) => {
        removeUserFromRoom(socket.id, roomId, io);
      });
    }
    users.delete(socket.id);
    adminLiveMonitor.clearMonitorPanel(socket.id);
    signalCount.delete(socket.id);
    rateLimitNotifyAt.delete(socket.id);
    emitOnlineCount();
  });
});

(async () => {
  try {
    const redisUrl = (process.env.REDIS_URL || process.env.REDIS_TLS_URL || '').trim();
    await matchQueue.init({ io, redisUrl, memoryQueues: pairQueues });
    infra.bindRedis(matchQueue.getClient());
  } catch (err) {
    console.error('[matchQueue] Startup init error:', err.message);
  }

  server.listen(PORT, HOST || '0.0.0.0', () => {
    console.log(`Helloooo server listening on port ${PORT} (${NODE_ENV})`);
    if (matchQueue.isRedis()) console.log('[matchQueue] Redis matchmaking active');
  });
})();

// --- Graceful shutdown: drain, flush, close, exit (with hard 5s deadline) ---
let shuttingDown = false;
function gracefulShutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[SHUTDOWN] ${signal} received — draining connections...`);

  const finish = (code) => {
    try { saveLocalDb(); } catch { /* ignore */ }
    process.exit(code);
  };
  const forceTimer = setTimeout(() => {
    console.error('[SHUTDOWN] Cleanup exceeded 5s — forcing exit.');
    finish(1);
  }, 5000);
  forceTimer.unref();

  try { clearInterval(statsInterval); } catch { /* ignore */ }
  void matchQueue.shutdown();
  try { server.close(); } catch { /* ignore */ } // stop accepting new HTTP connections
  try {
    io.close(() => {
      clearTimeout(forceTimer);
      console.log('[SHUTDOWN] Sockets closed, local DB flushed. Bye.');
      finish(0);
    });
    io.disconnectSockets(true); // drop live socket.io clients
  } catch {
    clearTimeout(forceTimer);
    finish(0);
  }
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
