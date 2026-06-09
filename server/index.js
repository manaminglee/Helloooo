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

// Persistence Strategy: Supabase (Cloud) or Local JSON (Node)
const supabaseUrl = (process.env.SUPABASE_URL || '').trim();
// Use service role key to bypass RLS for server-side admin operations.
// Falls back to anon key if service role not provided.
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
let supabase = null;

// Local DB State (Fallback)
const LOCAL_DB_PATH = path.join(__dirname, 'data', 'manadb.json');
let localDb = { creators: [], referral_logs: [], withdrawals: [], admin_history: [] };

function loadLocalDb() {
  try {
    if (!fs.existsSync(path.dirname(LOCAL_DB_PATH))) fs.mkdirSync(path.dirname(LOCAL_DB_PATH), { recursive: true });
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(LOCAL_DB_PATH, 'utf8'));
      localDb = { creators: [], referral_logs: [], withdrawals: [], admin_history: [], ...parsed };
      console.log('[DB] Local storage loaded.');
    }
  } catch (e) { console.error('[DB] Local DB load failed', e); }
}

function saveLocalDb() {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(localDb, null, 2));
  } catch (e) { console.error('[DB] Local DB save failed', e); }
}

if (supabaseUrl && supabaseKey && supabaseUrl.startsWith('http')) {
  supabase = createClient(supabaseUrl, supabaseKey);
  console.log('[DB] Supabase connected.');
  // Verify connection asynchronously
  supabase.from('creators').select('count', { count: 'exact', head: true })
    .then(({ error }) => {
      if (error) {
        console.error('[DB] Supabase connection test FAILED:', error.message);
        console.warn('[DB] Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env / Render environment variables.');
      } else {
        console.log('[DB] Supabase connection verified OK.');
      }
    });
} else {
  console.warn('[DB] Supabase not configured. Using local JSON storage (data resets on restart).');
  loadLocalDb();
}

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Validate sensitive config at startup (never log secret values)
function validateEnv() {
  const adminKey = process.env.ADMIN_KEY;
  if (NODE_ENV === 'production') {
    if (!adminKey || typeof adminKey !== 'string' || adminKey.length < 16) {
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
// 1:1 queues: mode -> [{ socketId, userData, interest }]
const pairQueues = { text: [], video: [] };
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

const ipActivity = new Map(); // ip -> { firstSeen, lastSeen, persisted }
const coinUsers = new Map(); // ip -> { coins, last_claim, streak, ... }

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
    u.registered = true;
    u.coins = (u.coins || 0) + 40; // CREDIT 40 COINS ON REGISTRATION

    if (supabase) {
      await supabase.from('user_coins').upsert(u);
      await supabase.from('activity_logs').insert({ ip, action: 'registered_ip', amount: 40, details: 'Identity Verified (3m Cycle)' });
    } else {
      saveLocalDb();
    }

    if (activity) activity.persisted = true;
    console.log(`[DB] Registered IP ${ip} - 40 Coins Synthesized.`);

    // Broadcast updated balance to all sockets sharing this IP
    for (const [sid, user] of users.entries()) {
      if (user.ip === ip) {
        io.to(sid).emit('coins-updated', {
          coins: u.coins,
          reason: 'Initial Registration (3m)',
          registered: true
        });
      }
    }
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
setInterval(() => {
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

app.use(cors({
  origin: NODE_ENV === 'production'
    ? [
      'https://manamingle.site',
      'https://www.manamingle.site',
      process.env.FRONTEND_ORIGIN,
      'http://localhost:5173',
    ].filter(Boolean)
    : true,
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

app.use(rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many requests' },
  standardHeaders: true,
}));

// Public settings (for client feature flags like ads, dev tools, ad HTML slots)
app.get('/api/settings', (req, res) => {
  res.json({
    adsEnabled: settings.adsEnabled,
    allowDevTools: settings.allowDevTools,
    adScripts: { ...settings.adScripts },
  });
});

// 3-Minute Activity Reward (40 Coins) - Synchronized with Socket.io
app.post('/api/coins/activity-reward', async (req, res) => {
  const ip = req.ip === '::1' ? '127.0.0.1' : req.ip;
  const now = Date.now();
  const MIN_INTERVAL = 180000; // 3 minutes

  try {
    const activity = ipActivity.get(ip);
    if (!activity) return res.status(403).json({ error: 'Uplink not recognized' });

    // Verify they actually spent at least 3m since first seen OR since last claim
    const cUser = await getCoinUser(ip);
    const lastClaim = Number(cUser.last_reward_claimed) || 0;
    const timeSinceLast = now - (lastClaim || activity.firstSeen);

    if (timeSinceLast < MIN_INTERVAL) {
      return res.status(429).json({ error: 'Sync cycle incomplete. Wait for uplink.' });
    }

    const reward = 40;
    const nextBalance = (cUser.coins || 0) + reward;

    await updateCoinUser(ip, {
      coins: nextBalance,
      last_reward_claimed: now,
      registered: true
    });

    if (supabase) {
      await supabase.from('activity_logs').insert({ ip, action: 'claimed_3m_bonus', amount: reward });
    }

    // Notify all connected sockets
    for (const [sid, user] of users.entries()) {
      if (user.ip === ip) {
        io.to(sid).emit('coins-updated', { coins: nextBalance, reason: 'Activity Sustained' });
      }
    }

    res.json({ success: true, balance: nextBalance, message: 'Activity recognized. 40 Coins synthesized.' });
  } catch (e) {
    res.status(500).json({ error: 'Economy link failure' });
  }
});

// TURN server credentials endpoint — always served from env vars, NEVER hardcoded in client
app.get('/api/turn', (req, res) => {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  const turnUrl = (process.env.TURN_URL || '').trim();
  const turnUser = (process.env.TURN_USERNAME || '').trim();
  const turnPass = (process.env.TURN_PASSWORD || '').trim();
  if (turnUrl && turnUser && turnPass) {
    iceServers.push({ urls: turnUrl, username: turnUser, credential: turnPass });
    // Also provide TLS fallback (port 443 often gets through firewalls)
    const tlsUrl = turnUrl.replace(/:\d+$/, ':443');
    if (tlsUrl !== turnUrl) {
      iceServers.push({ urls: tlsUrl, username: turnUser, credential: turnPass });
    }
  }
  res.json({ iceServers });
});

// Debug: Supabase connection status (safe - no secrets exposed)
// Primary Admin Hub consolidated further down at line 1068

app.post('/api/admin/coins/update', requireAdmin, async (req, res) => {
  const { ip, amount, set } = req.body || {};
  if (!ip) return res.status(400).json({ error: 'IP required' });

  try {
    const u = await getCoinUser(ip);
    const newBalance = set ? Number(amount) : (u.coins || 0) + Number(amount);
    await updateCoinUser(ip, { coins: newBalance });

    // Notify all sockets with this IP
    for (const [sid, user] of users.entries()) {
      if (user.ip === ip) {
        io.to(sid).emit('coins-updated', { coins: newBalance, reason: 'Admin Adjustment' });
      }
    }

    res.json({ success: true, newBalance });
  } catch (e) {
    res.status(500).json({ error: 'Update failed' });
  }
});

app.post('/api/admin/end-room', requireAdmin, async (req, res) => {
  const { roomId } = req.body || {};
  if (!roomId) return res.status(400).json({ error: 'Room ID required' });
  const room = rooms.get(roomId);
  if (room) {
    io.to(roomId).emit('room-ended-by-admin');
    [...room.users].forEach(sid => {
      const s = io.sockets.sockets.get(sid);
      if (s) s.leave(roomId);
    });
    rooms.delete(roomId);
    if (room.interestKey) interestToRoom.delete(room.interestKey);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Room not found' });
  }
});

// Debug: Supabase connection status (safe - no secrets exposed)
app.get('/api/debug/status', async (req, res) => {
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
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ valid: false, error: 'No URL provided' });
  try {
    new URL(url); // Validate URL format
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: controller.signal,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManaMingle/1.0)' }
      });
      clearTimeout(timeout);
      res.json({ valid: response.ok || response.status < 400, status: response.status });
    } catch (fetchErr) {
      clearTimeout(timeout);
      // Some hosts block HEAD - try GET with minimal read
      try {
        const r2 = await fetch(url, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ManaMingle/1.0)' }, signal: AbortSignal.timeout(6000) });
        res.json({ valid: r2.ok || r2.status < 400, status: r2.status });
      } catch {
        res.json({ valid: false, error: 'Unreachable' });
      }
    }
  } catch (e) {
    res.json({ valid: false, error: 'Invalid URL format' });
  }
});

app.post('/api/creators/register', async (req, res) => {
  const { handle, platform, link } = req.body || {};
  const ip = req.ip === '::1' ? '127.0.0.1' : req.ip;
  const pin = Math.floor(1000 + Math.random() * 9000);
  const referral_code = `${handle.replace(/\s+/g, '')}${pin}`;
  const entry = {
    id: generateId('creator'),
    handle_name: sanitize(handle, 30),
    platform: sanitize(platform, 20),
    profile_link: sanitize(link, 200),
    authorized_ips: [ip],
    referral_code, // Store the Handle+4PIN here for status checking
    status: 'pending',
    coins_earned: 0,
    earnings_rs: 0,
    referral_count: 0,
    followers_count: 0,
    follower_ips: [],
    avatar_url: null,
    bio: '',
    password: null, // No password until approved
    created_at: new Date().toISOString()
  };
  try {
    if (supabase) {
      // Check if handle already exists
      const { data: existing } = await supabase.from('creators').select('id').eq('handle_name', entry.handle_name).single();
      if (existing) return res.status(400).json({ error: 'Handle already registered.' });

      const { error: insertError } = await supabase.from('creators').insert(entry);
      if (insertError) return res.status(500).json({ error: 'Database save failed' });
    } else {
      const existing = localDb.creators.find(c => c.handle_name === entry.handle_name);
      if (existing) return res.status(400).json({ error: 'Handle already registered.' });
      localDb.creators.push(entry);
      saveLocalDb();
    }
    res.json({ success: true, message: 'Application Transmitted.', accessCode: referral_code });
    // Notify admin panel in real-time
    io.emit('creator-new-application', {
      id: entry.id,
      handle_name: entry.handle_name,
      platform: entry.platform,
      profile_link: entry.profile_link,
      referral_code: entry.referral_code,
      status: 'pending',
      coins_earned: 0,
      referral_count: 0,
      created_at: entry.created_at
    });
  } catch (e) { res.status(500).json({ error: 'Database uplink failed' }); }
});

app.post('/api/creators/login', async (req, res) => {
  const { handle, password } = req.body || {};
  const currentIp = req.ip === '::1' ? '127.0.0.1' : req.ip;
  if (!handle || !password) return res.status(400).json({ error: 'Incomplete Signal' });
  try {
    let creator = null;
    if (supabase) {
      const { data } = await supabase.from('creators').select('*').eq('handle_name', handle).eq('password', password).single();
      creator = data;
    } else {
      creator = localDb.creators.find(c => c.handle_name === handle && c.password === password);
    }
    if (!creator) {
      if (supabase) await supabase.from('creator_logins').insert({ handle, ip: currentIp, success: false, reason: 'invalid_credentials' });
      return res.status(401).json({ error: 'Invalid Credentials' });
    }
    if (creator.status !== 'approved') {
      if (supabase) await supabase.from('creator_logins').insert({ handle, creator_id: creator.id, ip: currentIp, success: false, reason: 'pending_review' });
      return res.status(403).json({ error: 'Application Pending Review' });
    }

    // Link current IP if not already linked
    if (!creator.authorized_ips.includes(currentIp)) {
      creator.authorized_ips.push(currentIp);
      if (supabase) {
        await supabase.from('creators').update({ authorized_ips: creator.authorized_ips }).eq('id', creator.id);
      } else {
        saveLocalDb();
      }
    }

    if (supabase) await supabase.from('creator_logins').insert({ handle, creator_id: creator.id, ip: currentIp, success: true });
    res.json({ success: true, data: creator });
  } catch (e) { res.status(500).json({ error: 'Authentication Failed' }); }
});

// Update Creator Profile (Avatar & Bio)
app.post('/api/creators/update-profile', async (req, res) => {
  const { bio, avatar_url } = req.body || {};

  try {
    const { creator, ip } = await getApprovedCreatorForRequest(req);
    if (!creator || creator.status !== 'approved') return res.status(403).json({ error: 'Unauthorized' });
    await linkCreatorIpIfNeeded(creator, ip);

    const updates = {
      bio: bio ? sanitize(bio, 150) : creator.bio,
      avatar_url: avatar_url || creator.avatar_url
    };

    if (supabase) {
      await supabase.from('creators').update(updates).eq('id', creator.id);
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
    res.json({ data: creator || null });
  } catch (e) { res.json({ data: null }); }
});

app.post('/api/creators/withdraw', async (req, res) => {
  const { upi } = req.body || {};
  if (!upi) return res.status(400).json({ error: 'UPI ID required' });
  try {
    const { creator, ip } = await getApprovedCreatorForRequest(req);
    if (!creator || creator.status !== 'approved') return res.status(403).json({ error: 'Unauthorized' });
    await linkCreatorIpIfNeeded(creator, ip);
    if ((creator.coins_earned || 0) < MIN_CREATOR_WITHDRAWAL_COINS) {
      return res.status(400).json({ error: `Min. ${MIN_CREATOR_WITHDRAWAL_COINS} coins required` });
    }

    const withdrawal = {
      id: generateId('wd'),
      creator_id: creator.id,
      handle_name: creator.handle_name,
      upi,
      amount_rs: Math.floor(creator.coins_earned / 10000) * 150 || 0,
      coins_spent: creator.coins_earned,
      status: 'pending',
      created_at: new Date().toISOString()
    };

    if (supabase) {
      await supabase.from('withdrawals').insert(withdrawal);
      await supabase.from('creators').update({ coins_earned: 0, earnings_rs: 0 }).eq('id', creator.id);
    } else {
      localDb.withdrawals.push(withdrawal);
      creator.coins_earned = 0;
      creator.earnings_rs = 0;
      saveLocalDb();
    }
    res.json({ success: true, message: 'Withdrawal signal queued for admin audit.' });
  } catch (e) { res.status(500).json({ error: 'Withdrawal request failed' }); }
});

app.post('/api/creators/re-request', async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Code required' });
  // In a real system, this would notify the admin via socket or email
  io.emit('admin-notification', { type: 'creator_ping', message: `Creator ${code} is requesting status update.` });
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
    if (status === 'approved') {
      if (!creator.password) {
        const pin = Math.floor(1000 + Math.random() * 9000);
        updates.password = `${creator.handle_name}@${pin}`;
      }
      // --- CREATOR BONUS: 500 COINS ON APPROVAL ---
      updates.coins_earned = (creator.coins_earned || 0) + 500;
    }

    if (supabase) {
      await supabase.from('creators').update(updates).eq('id', creatorId);
      await supabase.from('admin_history').insert({
        action_type: 'CREATOR_APPROVE',
        target_id: creatorId,
        target_name: creator.handle_name,
        details: `Status set to ${status} (+500 Bonus if approved)`
      });
    } else {
      Object.assign(creator, updates);
      localDb.admin_history.push({
        id: Date.now().toString(),
        action_type: 'CREATOR_APPROVE',
        target_id: creatorId,
        target_name: creator.handle_name,
        details: `Status set to ${status} (+500 Bonus)`,
        created_at: new Date().toISOString()
      });
      saveLocalDb();
    }
    res.json({ success: true, password: updates.password });
    // Notify creator in real-time (they may have the status modal open)
    io.emit('creator-status-changed', {
      referral_code: creator.referral_code,
      handle_name: creator.handle_name,
      status,
      password: updates.password || creator.password
    });
  } catch (e) { res.status(500).json({ error: 'Approval failed' }); }
});

app.post('/api/creators/verify-ref', async (req, res) => {
  const { code } = req.body || {};
  const visitorIp = req.ip === '::1' ? '127.0.0.1' : req.ip;
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
      const newEarnings = Math.floor(newCoins / 10000) * 150;
      await supabase.from('creators').update({ coins_earned: newCoins, earnings_rs: newEarnings, referral_count: newRefCount }).eq('id', creator.id);
    } else {
      localDb.referral_logs.push({ creator_id: creator.id, visitor_ip: visitorIp, created_at: new Date().toISOString() });
      creator.coins_earned = (creator.coins_earned || 0) + 10;
      creator.referral_count = (creator.referral_count || 0) + 1;
      creator.earnings_rs = Math.floor(creator.coins_earned / 10000) * 150;
      saveLocalDb();
    }
    if (!coinUsers.has(visitorIp)) {
      // We'll use the async helper here
      await getCoinUser(visitorIp);
    }
    const u = await getCoinUser(visitorIp);
    const updatedCoins = (u.coins || 0) + 5;
    await updateCoinUser(visitorIp, { coins: updatedCoins });
    res.json({ success: true, message: 'Referral node synchronized' });
  } catch (e) { res.status(500).json({ error: 'Sync failed' }); }
});

/** Public: whether TURN is configured (no secrets) */
app.get('/api/debug/webrtc-config', (req, res) => {
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

/** Approved creator: recent economy activity (token or IP; aggregates all authorized IPs) */
app.get('/api/creators/my-activity', async (req, res) => {
  try {
    const { creator, ip } = await getApprovedCreatorForRequest(req);
    if (!creator) return res.status(403).json({ error: 'Not an approved creator' });
    await linkCreatorIpIfNeeded(creator, ip);

    const ips = (creator.authorized_ips && creator.authorized_ips.length) ? creator.authorized_ips : [ip];

    if (supabase) {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .in('ip', ips)
        .order('created_at', { ascending: false })
        .limit(80);
      if (error) return res.json({ entries: [] });
      let entries = data || [];
      if (!entries.length) {
        const { data: refRows } = await supabase
          .from('referral_logs')
          .select('*')
          .eq('creator_id', creator.id)
          .order('created_at', { ascending: false })
          .limit(80);
        entries = (refRows || []).map((l, i) => ({
          id: `ref_${i}_${l.created_at}`,
          ip: l.visitor_ip,
          action: 'referral_visit',
          amount: 10,
          details: 'Referral link visit',
          created_at: l.created_at,
        }));
      }
      return res.json({ entries });
    }

    const synthetic = (localDb.referral_logs || [])
      .filter((l) => l.creator_id === creator.id)
      .slice(-80)
      .reverse()
      .map((l, i) => ({
        id: `ref_${i}_${l.created_at || i}`,
        ip: l.visitor_ip,
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
  const { handle } = req.params;
  try {
    let creator = null;
    if (supabase) {
      const { data } = await supabase.from('creators').select('handle_name, platform, coins_earned, referral_count, status, earnings_rs').eq('handle_name', handle).single();
      creator = data;
    } else {
      creator = localDb.creators.find(c => c.handle_name === handle);
    }
    if (!creator) return res.status(404).json({ error: 'Creator not found' });
    res.json({
      handle_name: creator.handle_name,
      platform: creator.platform,
      profile_link: creator.profile_link,
      coins_earned: creator.coins_earned,
      referral_count: creator.referral_count || 0,
      followers_count: creator.followers_count || 0,
      avatar_url: creator.avatar_url,
      bio: creator.bio,
      status: creator.status,
      earnings_rs: creator.earnings_rs
    });
  } catch (e) { res.status(500).json({ error: 'Query failed' }); }
});

app.post('/api/creators/follow', async (req, res) => {
  const { handle } = req.body || {};
  const visitorIp = req.ip === '::1' ? '127.0.0.1' : req.ip;
  if (!handle) return res.status(400).json({ error: 'Handle required' });
  try {
    let creator = null;
    if (supabase) {
      const { data } = await supabase.from('creators').select('*').eq('handle_name', handle).single();
      creator = data;
    } else {
      creator = localDb.creators.find(c => c.handle_name === handle);
    }
    if (!creator) return res.status(404).json({ error: 'Creator not found' });

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
    res.json({ success: true, count: newCount });
  } catch (e) { res.status(500).json({ error: 'Follow failed' }); }
});

app.use('/api', (req, res, next) => {
  console.log(`[API_TRACE] ${req.method} ${req.originalUrl}`);
  next();
});

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
  const secret = process.env.TURNSTILE_SECRET_KEY || '1x0000000000000000000000000000000AA';
  if (!token) return res.status(400).json({ success: false, error: 'Token required' });
  try {
    const ip = req.ip === '::1' ? '127.0.0.1' : req.ip;
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
    });
    const data = await r.json();
    if (data.success) return res.json({ success: true });
    return res.status(400).json({ success: false, 'error-codes': data['error-codes'] });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Verification failed' });
  }
});

// Admin auth: timing-safe comparison so key is not leaked by response time
function requireAdmin(req, res, next) {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey || typeof adminKey !== 'string') {
    return res.status(503).json({ error: 'Admin panel not configured' });
  }
  const provided = (req.header('x-admin-key') || '').toString().trim();
  try {
    const a = Buffer.from(adminKey.trim(), 'utf8');
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
    persisted: ipActivity.get(u.ip)?.persisted || u.registered || false
  }));

  const totalCoins = economyList.reduce((sum, u) => sum + (u.coins || 0), 0);

  const turnUrl = (process.env.TURN_URL || '').trim();
  const turnUser = (process.env.TURN_USERNAME || '').trim();
  const turnPass = (process.env.TURN_PASSWORD || '').trim();
  const turnConfigured = !!(turnUrl && turnUser && turnPass);

  res.json({
    ...settings,
    infrastructure: {
      turnConfigured,
      turnUrlHint: turnConfigured ? turnUrl.split(':')[0] + ':***' : null,
      signalMaxPerMinute: SIGNAL_MAX_PER_MINUTE,
      stunEndpoints: 2,
      relayFallback: !turnConfigured,
    },
    users: users.size,
    rooms: rooms.size,
    queues: {
      text: pairQueues.text.length,
      video: pairQueues.video.length,
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
    roomsWithActivity: Array.from(rooms.values()).map(r => ({
      id: r.id,
      interest: r.interest,
      mode: r.mode,
      messages: r.messages?.slice(-5) || [],
      users: Array.from(r.users).map(sid => users.get(sid)?.nickname)
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
  pairQueues.text = [];
  pairQueues.video = [];
  rooms.clear();
  interestToRoom.clear();
  users.clear();
  userBlocks.clear();
  io.emit('online_count', { count: 0 }); // Update anyone reconnecting
  res.json({ success: true, kicked: kickCount });
});

// Health
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    users: users.size,
    rooms: rooms.size,
  });
});

// API TURN/ICE (optional TURN later)
function normalizeTurnUrl(url) {
  if (!url || typeof url !== 'string') return 'turn:global.relay.metered.ca:443';
  const s = url.trim();
  if (s.startsWith('stun:') || s.startsWith('turn:') || s.startsWith('turns:')) return s;
  return `turn:${s}`;
}
app.get('/api/turn', (req, res) => {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  if (process.env.TURN_USERNAME && process.env.TURN_PASSWORD) {
    iceServers.push({
      urls: normalizeTurnUrl(process.env.TURN_URL || 'turn:global.relay.metered.ca:443'),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_PASSWORD,
    });
  } else {
    // Free Public TURN relay fallback for robust cross-network P2P connections
    iceServers.push({
      urls: 'turn:a.relay.metered.ca:80',
      username: 'e8dd65b92f3c0ab9bda3c714',
      credential: '2xMGSyyWIYfJTh3m'
    });
    iceServers.push({
      urls: 'turn:a.relay.metered.ca:443',
      username: 'e8dd65b92f3c0ab9bda3c714',
      credential: '2xMGSyyWIYfJTh3m'
    });
    iceServers.push({
      urls: 'turn:a.relay.metered.ca:443?transport=tcp',
      username: 'e8dd65b92f3c0ab9bda3c714',
      credential: '2xMGSyyWIYfJTh3m'
    });
    iceServers.push({
      urls: 'turns:a.relay.metered.ca:443?transport=tcp',
      username: 'e8dd65b92f3c0ab9bda3c714',
      credential: '2xMGSyyWIYfJTh3m'
    });
  }
  res.json({ iceServers });
});

// COIN SYSTEM API
const COIN_CLAIM_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

app.post('/api/user/credit-age', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || (req.ip === '::1' ? '127.0.0.1' : req.ip);
  await getCoinUser(ip);
  res.json({ success: true });
});

app.get('/api/user/coins', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || (req.ip === '::1' ? '127.0.0.1' : req.ip);
  try {
    const user = await getCoinUser(ip);
    const now = Date.now();
    const nextClaim = (Number(user.last_claim) || 0) + COIN_CLAIM_INTERVAL_MS;

    res.json({
      coins: user.coins,
      streak: user.streak,
      canClaim: now >= nextClaim,
      nextClaim: Math.max(0, nextClaim - now)
    });
  } catch (e) {
    res.status(500).json({ error: 'Platform sync delayed' });
  }
});

app.post('/api/user/claim', async (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || (req.ip === '::1' ? '127.0.0.1' : req.ip);
  const user = await getCoinUser(ip);
  const now = Date.now();
  const waitTime = COIN_CLAIM_INTERVAL_MS;

  if (now < (Number(user.last_claim) || 0) + waitTime) {
    return res.status(400).json({ error: 'Too early to claim' });
  }

  // Streak logic (daily check)
  const today = new Date().toDateString();
  const yesterday = new Date(now - 86400000).toDateString();

  if (user.last_claim_date === yesterday) {
    user.streak += 1;
  } else if (user.last_claim_date !== today) {
    user.streak = 1;
  }

  // 30 coins base + bonus (5 per streak day, max 50 bonus)
  const bonus = user.streak > 1 ? Math.min((user.streak - 1) * 5, 50) : 0;
  const nextBalance = (user.coins || 0) + (30 + bonus);

  await updateCoinUser(ip, {
    coins: nextBalance,
    last_claim: now,
    last_claim_date: today,
    streak: user.streak
  });

  res.json({ coins: nextBalance, streak: user.streak, bonus });
});

app.post('/api/user/spend', async (req, res) => {
  const { amount } = req.body;
  const ip = req.ip === '::1' ? '127.0.0.1' : req.ip;
  const user = await getCoinUser(ip);

  if (!user || user.coins < amount) {
    return res.status(400).json({ error: 'Insufficient coins' });
  }

  const nextBalance = user.coins - amount;
  await updateCoinUser(ip, { coins: nextBalance });
  res.json({ success: true, balance: nextBalance });
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
  const frontendUrl = process.env.FRONTEND_ORIGIN || 'https://manamingle.site';
  const url = frontendUrl.split(',')[0].trim();
  res.redirect(302, url);
});

const server = http.createServer(app);

const io = new Server(server, {
  path: '/socket.io',
  cors: { origin: NODE_ENV === 'production' ? process.env.FRONTEND_ORIGIN || true : true, credentials: true },
  pingTimeout: 60000,
  pingInterval: 25000,
  connectTimeout: 45000,
  allowEIO3: true
});

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
});

const uniqueFeatures = registerUniqueFeatures(app, io, {
  rooms,
  users,
  reports,
  sanitize,
  countryFromIP,
});

// API 404 fallback — must be after registerEnhancements (rooms/public, creators, etc.)
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
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
    socket.emit('system-maintenance', { message: 'ManaMingle is currently undergoing scheduled maintenance. Please check back later!' });
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
    socket.emit('connected', {
      userId,
      nickname: finalNick,
      isCreator: finalIsCreator,
      country,
      coins: coinData.coins || 0,
      registered: !!coinData.registered,
      activeSeconds: coinData.active_seconds || 0,
      settings: {
        adsEnabled: settings.adsEnabled,
        allowDevTools: settings.allowDevTools,
        adScripts: { ...settings.adScripts },
      },
    });

    emitOnlineCount();
  })();

  socket.on('list-group-rooms', (data) => {
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

  socket.on('report-user', (data) => {
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
  });

  socket.on('block-user', (data) => {
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
    }
  });

  // Find partner for 1:1 text or video
  socket.on('find-partner', (data) => {
    const userData = users.get(socket.id);
    if (!userData) return;
    const mode = data?.mode === 'video' ? 'video' : 'text';
    const interest = sanitize(String(data?.interest || 'general').toLowerCase(), 30) || 'general';
    const nickname = sanitize(data?.nickname || 'Anonymous', 30);
    const region = sanitize(String(data?.region || userData.country || ''), 10);
    const language = sanitize(String(data?.language || ''), 20);
    const conversationMode = sanitize(String(data?.conversationMode || 'free'), 30);
    const topicContract = sanitize(String(data?.topicContract || ''), 40);
    userData.nickname = nickname;
    userData.region = region;
    userData.language = language;

    const myBlocks = userBlocks.get(ip);
    const canMatch = (e) => {
      if (e.socketId === socket.id) return false;
      const otherIp = users.get(e.socketId)?.ip;
      if (!otherIp || blockedIps.has(otherIp)) return false;
      if (myBlocks && myBlocks.has(otherIp)) return false;
      if (userBlocks.get(otherIp)?.has(ip)) return false;
      return true;
    };
    const queue = pairQueues[mode];
    let match = enhancements.pickSmartMatch(queue.filter((e) => e.interest === interest), interest, region, language, canMatch);
    if (!match) match = enhancements.pickSmartMatch(queue, interest, region, language, canMatch);
    if (match) {
      const idx = queue.indexOf(match);
      queue.splice(idx, 1);
      const otherData = users.get(match.socketId);
      if (!otherData || !io.sockets.sockets.get(match.socketId)) return;
      const room = createRoom(interest, mode, socket.id, { id: userData.id, nickname: userData.nickname, country: userData.country }, PAIR_MAX);
      uniqueFeatures.enrichPartnerMatch(room, socket.id, data);
      addUserToRoom(room, match.socketId, { id: otherData.id, nickname: otherData.nickname, country: otherData.country });
      userData.rooms.add(room.id);
      otherData.rooms.add(room.id);
      socket.join(room.id);
      io.sockets.sockets.get(match.socketId).join(room.id);

      const myPeer = { socketId: socket.id, userId: userData.id, nickname: userData.nickname, country: userData.country, isCreator: userData.isCreator };
      const otherPeer = { socketId: match.socketId, userId: otherData.id, nickname: otherData.nickname, country: otherData.country, isCreator: otherData.isCreator };

      const sessionConfig = uniqueFeatures.emitSessionConfig(room.id);
      socket.emit('partner-found', { roomId: room.id, peer: otherPeer, country: userData.country, sessionConfig });
      io.sockets.sockets.get(match.socketId).emit('partner-found', { roomId: room.id, peer: myPeer, country: otherData.country, sessionConfig });

      const reconnectToken = enhancements.issueReconnectToken(socket.id, { roomId: room.id, nickname: userData.nickname, mode });
      socket.emit('reconnect-token', { token: reconnectToken });
      const otherToken = enhancements.issueReconnectToken(match.socketId, { roomId: room.id, nickname: otherData.nickname, mode });
      io.sockets.sockets.get(match.socketId).emit('reconnect-token', { token: otherToken });

      // --- AUTOMATED CREATOR INTRO MESSAGE ---
      if (userData.isCreator) {
        const intro = `Hi! I am @${userData.nickname} - follow my profile here: ${process.env.FRONTEND_URL || 'manamingle.site'}/creator/${userData.nickname}`;
        io.to(room.id).emit('chat-message', {
          sender: socket.id,
          nickname: userData.nickname,
          text: intro,
          timestamp: Date.now(),
          isCreator: true,
          isIntro: true
        });
      }
      if (otherData.isCreator) {
        const intro = `Hi! I am @${otherData.nickname} - follow my profile here: ${process.env.FRONTEND_URL || 'manamingle.site'}/creator/${otherData.nickname}`;
        io.to(room.id).emit('chat-message', {
          sender: match.socketId,
          nickname: otherData.nickname,
          text: intro,
          timestamp: Date.now(),
          isCreator: true,
          isIntro: true
        });
      }

      socket.emit('chat-history', { roomId: room.id, messages: [] });
      io.sockets.sockets.get(match.socketId).emit('chat-history', { roomId: room.id, messages: [] });
    } else {
      const entry = { socketId: socket.id, userData, interest, region, language, conversationMode, topicContract };
      if (userData.isCreator) queue.unshift(entry);
      else queue.push(entry);
      socket.emit('waiting-for-partner', { mode, interest });
    }
  });

  socket.on('cancel-find-partner', () => {
    ['text', 'video'].forEach((m) => {
      pairQueues[m] = pairQueues[m].filter((e) => e.socketId !== socket.id);
    });
  });

  // Join group by interest (find or create room, max 4)
  socket.on('join-group-by-topics', (data) => {
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

  socket.on('join-specific-group', (data) => {
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

  socket.on('leave-room', (data) => {
    const roomId = String(data?.roomId || '');
    const userData = users.get(socket.id);
    const room = rooms.get(roomId);
    if (!userData || !room || !room.users.has(socket.id)) return;
    userData.rooms.delete(roomId);
    socket.leave(roomId);
    removeUserFromRoom(socket.id, roomId, io);
    socket.emit('left-room', { roomId });
  });

  socket.on('rename-group-room', async (data) => {
    const { roomId, newInterest } = data || {};
    const u = users.get(socket.id);
    const room = rooms.get(roomId);
    if (!u || !room) return;
    if (room.mode !== 'group_video' && room.mode !== 'group_text') return;

    const cUser = await getCoinUser(ip);
    const balance = Number(cUser.coins) || 0;
    if (balance < 25) {
      return socket.emit('error', { message: 'Insufficient Mana (25 Coins Required).' });
    }

    // Server-authoritative deduction
    const nextBalance = balance - 25;
    await updateCoinUser(ip, { coins: nextBalance });

    const sanitized = sanitize(String(newInterest || '').toLowerCase(), 30);
    if (!sanitized) return socket.emit('error', { message: 'Topic is too short or invalid.' });

    room.interest = sanitized;
    io.to(roomId).emit('group-renamed', { interest: sanitized, nickname: u.nickname });

    // PERSISTENCE: Commit specialized topic to SQL
    if (supabase) {
      await supabase.from('group_rooms').upsert({ id: roomId, interest: sanitized, creator_ip: ip });
      await supabase.from('activity_logs').insert({ ip, action: 'renamed_room', amount: 25, details: `Topic: ${sanitized} (Room: ${roomId})` });
    }

    // Sync all IP sockets
    for (const [sid, user] of users.entries()) {
      if (user.ip === ip) {
        io.to(sid).emit('coins-updated', { coins: nextBalance, reason: 'Realm Specialized' });
      }
    }
  });

  socket.on('send-message', (data) => {
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
    const pattern = new RegExp(`(${profanities.join('|')})`, 'i');

    if (settings.safetyAiEnabled && (pattern.test(msg) || pattern.test(strippedMsg))) {
      socket.emit('content-flagged', {
        message: '⚠️ MESSAGE BLOCKED: Please be respectful. Toxic or explicit language detected.',
        reason: 'Community Guidelines Violation'
      });
      return;
    }
    }

    stats.totalMessages++;
    const entry = {
      id: generateId('msg'),
      nickname: u.nickname,
      ts: Date.now(),
      socketId: socket.id,
      isCreator: !!u.isCreator,
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

  socket.on('admin-end-room', (data) => {
    const { roomId, adminKey: providedKey } = data || {};
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey || providedKey !== adminKey) return;
    const room = rooms.get(roomId);
    if (room) {
      io.to(roomId).emit('room-ended-by-admin');
      [...room.users].forEach(sid => {
        const s = io.sockets.sockets.get(sid);
        if (s) s.leave(roomId);
      });
      rooms.delete(roomId);
      if (room.interestKey) interestToRoom.delete(room.interestKey);
    }
  });

  // Wave reaction
  socket.on('send-wave', (data) => {
    const { roomId } = data || {};
    const u = users.get(socket.id);
    const room = rooms.get(roomId);
    if (!u || !room || !room.users.has(socket.id)) return;
    socket.to(roomId).emit('wave-reaction', { fromSocketId: socket.id, nickname: u.nickname });
  });

  // Good vibes
  const goodVibesPending = new Map();
  socket.on('send-good-vibes', (data) => {
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

  socket.on('typing', (data) => {
    const { roomId, isTyping } = data || {};
    if (roomId) socket.to(roomId).emit('stranger-typing', { isTyping, socketId: socket.id });
  });

  // Hand raise relay
  socket.on('hand-raise', (data) => {
    const { roomId, raised } = data || {};
    const room = rooms.get(roomId);
    if (!room || !room.users.has(socket.id)) return;
    socket.to(roomId).emit('hand-raise', { socketId: socket.id, raised });
  });

  // Room reaction relay
  socket.on('room-reaction', (data) => {
    const { roomId, emoji } = data || {};
    const room = rooms.get(roomId);
    if (!room || !room.users.has(socket.id)) return;
    socket.to(roomId).emit('room-reaction', { socketId: socket.id, emoji });
  });

  socket.on('peer-recording-status', (data) => {
    const { roomId, recording } = data || {};
    const room = rooms.get(roomId);
    if (!room || !room.users.has(socket.id)) return;
    socket.to(roomId).emit('peer-recording-status', { socketId: socket.id, recording: !!recording });
  });

  socket.on('tip-creator', (data) => {
    const { roomId, targetSocketId, amount } = data || {};
    const room = rooms.get(roomId);
    if (!room || !room.users.has(socket.id) || !targetSocketId) return;
    const sender = users.get(socket.id);
    io.to(targetSocketId).emit('creator-tip-received', {
      fromNickname: sender?.nickname || 'Someone',
      amount: Math.min(Math.max(Number(amount) || 0, 0), 500),
    });
  });

  socket.on('video-style', (data) => {
    const { roomId, filter, blur, targetSocketId } = data || {};
    if (!roomId) return;
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

  socket.on('join-standard', async (data) => {
    // Initial data handshake for standard modes
  });

  socket.on('spend-coins', async (data) => {
    const { amount, reason } = data || {};
    const cUser = await getCoinUser(ip);

    if (cUser.coins < amount) return socket.emit('error', { message: 'Insufficient coins' });
    const nextBalance = cUser.coins - amount;
    await updateCoinUser(ip, { coins: nextBalance });

    // Notify all sockets with this IP
    for (const [sid, user] of users.entries()) {
      if (user.ip === ip) {
        io.to(sid).emit('coins-updated', { coins: nextBalance, reason });
      }
    }
    console.log(`[COINS] User ${socket.id} spent ${amount} for ${reason}`);
  });

  socket.on('claim-active-reward', async () => {
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
  socket.on('accumulate-activity', async (data) => {
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
      // Payout 30 coins
      const nextBalance = (cUser.coins || 0) + coinsEarned;
      await updateCoinUser(ip, {
        coins: nextBalance,
        active_seconds: finalActive,
        total_active_seconds: nextTotal
      });
      io.to(socket.id).emit('coins-updated', { coins: nextBalance, reason: '1 Hour Active Reward' });
    } else {
      await updateCoinUser(ip, {
        active_seconds: finalActive,
        total_active_seconds: nextTotal
      });
    }

    // If they hit 3m but aren't registered yet, trigger persistence
    if (!cUser.registered && nextTotal >= 180) {
      await persistCoinUser(ip);
    }
  });

  socket.on('send-3d-emoji', async (data) => {
    const { roomId, emoji } = data || {};
    const u = users.get(socket.id);
    const cUser = await getCoinUser(ip);

    if (cUser.coins < 5) return socket.emit('error', { message: 'Need 5 coins for 3D Emoji' });
    const nextBalance = cUser.coins - 5;
    await updateCoinUser(ip, { coins: nextBalance });

    // Notify all sockets with this IP
    for (const [sid, user] of users.entries()) {
      if (user.ip === ip) {
        io.to(sid).emit('coins-updated', { coins: nextBalance, reason: '3D Emoji' });
      }
    }
    io.to(roomId).emit('3d-emoji', { roomId, emoji, nickname: u?.nickname || 'Someone', socketId: socket.id });
  });

  socket.on('send-media', async (data) => {
    const { roomId, type, content } = data || {};
    const u = users.get(socket.id);
    const cUser = await getCoinUser(ip);

    const cost = type === 'video' ? 15 : 10;
    if (cUser.coins < cost) return socket.emit('error', { message: `Need ${cost} coins for Media` });
    const nextBalance = cUser.coins - cost;
    await updateCoinUser(ip, { coins: nextBalance });

    // Notify all sockets with this IP
    for (const [sid, user] of users.entries()) {
      if (user.ip === ip) {
        io.to(sid).emit('coins-updated', { coins: nextBalance, reason: 'Media Upload' });
      }
    }
    io.to(roomId).emit('media-message', { id: generateId('med'), roomId, type, content, nickname: u?.nickname || 'Someone', ts: Date.now(), socketId: socket.id });
  });

  socket.on('webrtc-signal', (data) => {
    if (isSignalRateLimited(socket.id, socket)) return;
    const { roomId, targetSocketId, type, signal } = data || {};
    const userData = users.get(socket.id);
    const room = rooms.get(roomId);
    if (!userData || !room || !room.users.has(socket.id) || !room.users.has(targetSocketId)) return;
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

  socket.on('disconnect', () => {
    pairQueues.text = pairQueues.text.filter((e) => e.socketId !== socket.id);
    pairQueues.video = pairQueues.video.filter((e) => e.socketId !== socket.id);
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
    signalCount.delete(socket.id);
    rateLimitNotifyAt.delete(socket.id);
    emitOnlineCount();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Mana Mingle server listening on port ${PORT} (${NODE_ENV})`);
});
