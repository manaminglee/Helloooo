/**
 * Multi-tenant agency core.
 *
 * The original agency panel was a single global tenant behind one shared
 * AGENCY_ADMIN_KEY. This module adds real tenancy on top of it:
 *
 *   - Admin mints an agency; each gets its own secret key plus an owner
 *     email/password login. The legacy AGENCY_ADMIN_KEY still works and is
 *     treated as a "super" scope that sees every tenant.
 *   - Every creator can be bound to exactly one agency (and to the member who
 *     recruited them) via a one-time invite code.
 *   - Each agency owns a mintable pool of sellable Nuts that drips in
 *     continuously and whose daily allowance compounds.
 *   - Gift revenue pays the agency a commission carved out of the PLATFORM's
 *     cut, so a creator never earns less for being under an agency.
 *
 * localDb is the source of truth (it is what the rest of this codebase treats
 * as authoritative and it works with no Supabase configured); Supabase is a
 * best-effort mirror so the rows survive a redeploy.
 */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const DAY_MS = 24 * 60 * 60 * 1000;
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const SESSION_PREFIX = 'ags_';
const KEY_PREFIX = 'agk_';

/** Commission is carved from the platform's slice, so it can never exceed it. */
const MAX_COMMISSION_PCT = 0.9;
/** A mint that never stops growing would eventually print infinite Nuts. */
const DEFAULT_MINT_DAILY = 50000;
const DEFAULT_MINT_GROWTH_PCT = 0.02;
const DEFAULT_MINT_POOL_CAP = 5000000;
const MAX_MINT_GROWTH_PCT = 0.25;
/** Compounding is capped so a long downtime cannot explode the allowance. */
const MAX_CATCHUP_DAYS = 60;

const MINT_TICK_MS = 60 * 1000;

const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function timingSafeEqualHex(a, b) {
  try {
    const bufA = Buffer.from(String(a || ''), 'hex');
    const bufB = Buffer.from(String(b || ''), 'hex');
    return bufA.length > 0 && bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

const rid = (p, n = 10) => `${p}_${crypto.randomBytes(n).toString('hex')}`;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const dayKeyOf = (ms) => new Date(ms).toISOString().slice(0, 10);

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'agency';
}

/** Invite codes are read aloud and typed by hand — drop ambiguous glyphs. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function mintInviteCode(len = 8) {
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i += 1) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

function registerAgencyTenancy(app, io, deps = {}) {
  const {
    localDb,
    saveLocalDb,
    supabase,
    audioIdentity,
    audit,
    getSuperKey,
    getMarket,
    sanitize = (s) => String(s ?? ''),
    now = () => Date.now(),
  } = deps;

  /* ----------------------------------------------------------------------- *
   * Storage shape
   * ----------------------------------------------------------------------- */
  function ensureShape() {
    if (!Array.isArray(localDb.agencies)) localDb.agencies = [];
    if (!Array.isArray(localDb.agency_members)) localDb.agency_members = [];
    if (!Array.isArray(localDb.agency_invites)) localDb.agency_invites = [];
    if (!Array.isArray(localDb.agency_ledger)) localDb.agency_ledger = [];
    if (!Array.isArray(localDb.agency_sales)) localDb.agency_sales = [];
    if (!Array.isArray(localDb.agency_sessions)) localDb.agency_sessions = [];
  }
  ensureShape();

  // saveLocalDb rewrites the whole JSON file synchronously. Mint accrual runs
  // on every read, so persisting inline would turn a dashboard poll into a
  // disk-bound operation. Coalesce instead.
  let persistTimer = null;
  function schedulePersist() {
    if (persistTimer) return;
    persistTimer = setTimeout(() => {
      persistTimer = null;
      try { saveLocalDb?.(); } catch { /* best effort */ }
    }, 4000);
  }
  function persistNow() {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
    try { saveLocalDb?.(); } catch { /* best effort */ }
  }

  function mirror(table, row, conflict = 'id') {
    if (!supabase) return;
    supabase.from(table).upsert(row, { onConflict: conflict }).then(() => {}, () => {});
  }

  const agencyById = (id) => localDb.agencies.find((a) => a.id === id) || null;
  const memberById = (id) => localDb.agency_members.find((m) => m.id === id) || null;

  function membersOf(agencyId) {
    return localDb.agency_members.filter((m) => m.agency_id === agencyId);
  }
  function creatorsOf(agencyId) {
    return (localDb.creators || []).filter((c) => c.agency_id === agencyId);
  }

  /* ----------------------------------------------------------------------- *
   * Mint engine
   *
   * Accrual is lazy: state carries `mint_last_tick_at` plus a fractional
   * `mint_carry`, so the pool is correct whether it is read once a minute or
   * once a week, and a restart cannot silently skip a drip.
   * ----------------------------------------------------------------------- */
  function accrue(agency, at = now()) {
    if (!agency || agency.status !== 'active') return agency;

    const last = Number(agency.mint_last_tick_at) || at;
    const today = dayKeyOf(at);
    let changed = false;

    // Day rollover: the allowance compounds once per elapsed day, then the
    // per-day accrual budget resets.
    if (agency.mint_day_key !== today) {
      const prevDay = Date.parse(`${agency.mint_day_key || today}T00:00:00.000Z`);
      const daysElapsed = Number.isFinite(prevDay)
        ? clamp(Math.floor((Date.parse(`${today}T00:00:00.000Z`) - prevDay) / DAY_MS), 1, MAX_CATCHUP_DAYS)
        : 1;
      const growth = 1 + (Number(agency.mint_growth_pct) || 0);
      const grown = (Number(agency.mint_daily_allowance) || 0) * (growth ** daysElapsed);
      agency.mint_daily_allowance = Math.floor(clamp(grown, 0, agency.mint_pool_cap));
      agency.mint_accrued_today = 0;
      agency.mint_day_key = today;
      agency.mint_days_elapsed = (Number(agency.mint_days_elapsed) || 0) + daysElapsed;
      changed = true;
    }

    const elapsed = Math.max(0, at - last);
    if (elapsed > 0) {
      const allowance = Number(agency.mint_daily_allowance) || 0;
      const gross = (allowance / DAY_MS) * elapsed + (Number(agency.mint_carry) || 0);
      let minted = Math.floor(gross);
      agency.mint_carry = gross - minted;

      const dailyRoom = Math.max(0, allowance - (Number(agency.mint_accrued_today) || 0));
      const poolRoom = Math.max(0, (Number(agency.mint_pool_cap) || 0) - (Number(agency.mint_pool_nuts) || 0));
      minted = Math.min(minted, dailyRoom, poolRoom);

      if (minted > 0) {
        agency.mint_pool_nuts = (Number(agency.mint_pool_nuts) || 0) + minted;
        agency.mint_accrued_today = (Number(agency.mint_accrued_today) || 0) + minted;
        agency.mint_minted_total = (Number(agency.mint_minted_total) || 0) + minted;
        changed = true;
      }
      // The pool being full is not a reason to replay the same window later.
      agency.mint_last_tick_at = at;
    }

    // Only dirty the db when Nuts actually moved. A dashboard poll accrues on
    // every read, and saveLocalDb rewrites the whole file.
    if (changed) schedulePersist();
    return agency;
  }

  function mintView(agency) {
    accrue(agency);
    const allowance = Number(agency.mint_daily_allowance) || 0;
    const market = getMarket?.();
    const pool = Number(agency.mint_pool_nuts) || 0;
    return {
      poolNuts: pool,
      poolCap: Number(agency.mint_pool_cap) || 0,
      dailyAllowance: allowance,
      accruedToday: Number(agency.mint_accrued_today) || 0,
      remainingToday: Math.max(0, allowance - (Number(agency.mint_accrued_today) || 0)),
      perMinute: Math.round((allowance / DAY_MS) * 60_000),
      growthPct: Number(agency.mint_growth_pct) || 0,
      // What tomorrow's allowance becomes, so the dashboard can show the ramp.
      nextDailyAllowance: Math.floor(clamp(
        allowance * (1 + (Number(agency.mint_growth_pct) || 0)),
        0,
        Number(agency.mint_pool_cap) || 0,
      )),
      daysElapsed: Number(agency.mint_days_elapsed) || 0,
      mintedTotal: Number(agency.mint_minted_total) || 0,
      soldNuts: Number(agency.nuts_sold) || 0,
      poolValueInr: market?.nutsToInr ? market.nutsToInr(pool) : null,
      marketRate: market?.getRate?.() ?? null,
    };
  }

  /** Every active agency drips even with nobody watching the dashboard. */
  const mintTimer = setInterval(() => {
    if (!localDb.agencies.length) return;
    try {
      // accrue() schedules its own coalesced save when it actually mints, so
      // an idle deployment with no agencies never touches the disk.
      for (const a of localDb.agencies) accrue(a);
    } catch (e) {
      console.warn('[AGENCY_MINT] tick failed:', e.message);
    }
  }, MINT_TICK_MS);
  if (mintTimer.unref) mintTimer.unref();

  /* ----------------------------------------------------------------------- *
   * Agency lifecycle
   * ----------------------------------------------------------------------- */
  async function createAgency({
    name,
    ownerEmail,
    ownerPassword,
    ownerName,
    commissionPct,
    mintDailyAllowance,
    mintGrowthPct,
    mintPoolCap,
    ownerOverridePct,
  }) {
    const cleanName = sanitize(String(name || '').trim(), 60);
    if (cleanName.length < 2) return { ok: false, error: 'Agency name is required' };

    const email = String(ownerEmail || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return { ok: false, error: 'A valid owner email is required' };
    }
    if (localDb.agency_members.some((m) => m.email === email && m.status === 'active')) {
      return { ok: false, error: 'That email already belongs to an agency member' };
    }
    const password = String(ownerPassword || '');
    if (password.length < 10) return { ok: false, error: 'Owner password must be at least 10 characters' };

    let slug = slugify(cleanName);
    if (localDb.agencies.some((a) => a.slug === slug)) slug = `${slug}-${crypto.randomBytes(2).toString('hex')}`;

    const id = rid('agc', 8);
    const secret = crypto.randomBytes(24).toString('hex');
    const at = now();

    const agency = {
      id,
      name: cleanName,
      slug,
      status: 'active',
      key_hash: sha256(secret),
      key_rotated_at: new Date(at).toISOString(),
      commission_pct: clamp(Number(commissionPct) || 0.2, 0, MAX_COMMISSION_PCT),
      owner_override_pct: clamp(Number(ownerOverridePct) || 0.1, 0, 1),
      mint_pool_nuts: 0,
      mint_pool_cap: Math.max(0, Math.floor(Number(mintPoolCap) || DEFAULT_MINT_POOL_CAP)),
      mint_daily_allowance: Math.max(0, Math.floor(Number(mintDailyAllowance) || DEFAULT_MINT_DAILY)),
      mint_growth_pct: clamp(Number(mintGrowthPct) ?? DEFAULT_MINT_GROWTH_PCT, 0, MAX_MINT_GROWTH_PCT),
      mint_accrued_today: 0,
      mint_carry: 0,
      mint_last_tick_at: at,
      mint_day_key: dayKeyOf(at),
      mint_days_elapsed: 0,
      mint_minted_total: 0,
      nuts_sold: 0,
      sales_inr: 0,
      commission_earned_nuts: 0,
      created_at: new Date(at).toISOString(),
    };

    const owner = {
      id: rid('agm', 8),
      agency_id: id,
      email,
      name: sanitize(String(ownerName || cleanName).trim(), 60),
      password_hash: await bcrypt.hash(password, 12),
      role: 'owner',
      commission_pct: 1,
      earned_nuts: 0,
      status: 'active',
      created_at: new Date(at).toISOString(),
    };

    localDb.agencies.push(agency);
    localDb.agency_members.push(owner);
    persistNow();

    mirror('agencies', agency);
    mirror('agency_members', owner);
    audit?.('agency_created', { agencyId: id, name: cleanName, ownerEmail: email });

    // The plaintext key exists only in this response; only its hash is stored.
    return { ok: true, agency: publicAgency(agency), agencyKey: `${KEY_PREFIX}${id}.${secret}`, owner: publicMember(owner) };
  }

  async function rotateKey(agencyId) {
    const agency = agencyById(agencyId);
    if (!agency) return { ok: false, error: 'Agency not found' };
    const secret = crypto.randomBytes(24).toString('hex');
    agency.key_hash = sha256(secret);
    agency.key_rotated_at = new Date(now()).toISOString();
    persistNow();
    mirror('agencies', agency);
    audit?.('agency_key_rotated', { agencyId });
    return { ok: true, agencyKey: `${KEY_PREFIX}${agencyId}.${secret}` };
  }

  function updateAgency(agencyId, patch = {}) {
    const agency = agencyById(agencyId);
    if (!agency) return { ok: false, error: 'Agency not found' };

    // Accrue against the OLD allowance before changing it, otherwise the
    // elapsed window since the last tick would be paid at the new rate.
    accrue(agency);

    if (typeof patch.name === 'string' && patch.name.trim()) agency.name = sanitize(patch.name.trim(), 60);
    if (patch.status === 'active' || patch.status === 'suspended') {
      if (patch.status === 'active' && agency.status !== 'active') agency.mint_last_tick_at = now();
      agency.status = patch.status;
    }
    if (Number.isFinite(Number(patch.commissionPct))) {
      agency.commission_pct = clamp(Number(patch.commissionPct), 0, MAX_COMMISSION_PCT);
    }
    if (Number.isFinite(Number(patch.ownerOverridePct))) {
      agency.owner_override_pct = clamp(Number(patch.ownerOverridePct), 0, 1);
    }
    if (Number.isFinite(Number(patch.mintDailyAllowance))) {
      agency.mint_daily_allowance = Math.max(0, Math.floor(Number(patch.mintDailyAllowance)));
    }
    if (Number.isFinite(Number(patch.mintGrowthPct))) {
      agency.mint_growth_pct = clamp(Number(patch.mintGrowthPct), 0, MAX_MINT_GROWTH_PCT);
    }
    if (Number.isFinite(Number(patch.mintPoolCap))) {
      agency.mint_pool_cap = Math.max(0, Math.floor(Number(patch.mintPoolCap)));
    }
    persistNow();
    mirror('agencies', agency);
    audit?.('agency_updated', { agencyId, patch });
    return { ok: true, agency: publicAgency(agency) };
  }

  /* ----------------------------------------------------------------------- *
   * Auth — super key, per-agency key, member session
   * ----------------------------------------------------------------------- */
  function superKeyMatches(provided) {
    const expected = getSuperKey?.();
    if (!expected || !provided) return false;
    return timingSafeEqualHex(sha256(provided), sha256(expected));
  }

  function agencyFromKey(provided) {
    const raw = String(provided || '').trim();
    if (!raw.startsWith(KEY_PREFIX)) return null;
    const body = raw.slice(KEY_PREFIX.length);
    const dot = body.indexOf('.');
    if (dot <= 0) return null;
    // The id is a lookup hint only — the secret still has to match its hash.
    const agency = agencyById(body.slice(0, dot));
    if (!agency) return null;
    if (!timingSafeEqualHex(sha256(body.slice(dot + 1)), agency.key_hash)) return null;
    return agency;
  }

  function extractToken(req) {
    const auth = req.headers.authorization || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const tok = String(req.headers['x-agency-session'] || bearer || '').trim();
    return tok.startsWith(SESSION_PREFIX) ? tok : '';
  }

  function sessionMember(req) {
    const tok = extractToken(req);
    if (!tok) return null;
    const hash = sha256(tok);
    const row = localDb.agency_sessions.find((s) => s.token_hash === hash && !s.revoked_at);
    if (!row) return null;
    if (Date.parse(row.expires_at) < now()) return null;
    const member = memberById(row.member_id);
    if (!member || member.status !== 'active') return null;
    return member;
  }

  /**
   * Resolves who is calling and which tenant they may touch.
   *   super  → the legacy AGENCY_ADMIN_KEY / ADMIN_KEY: every agency
   *   owner  → per-agency key, or a logged-in owner member
   *   member → a logged-in non-owner member
   */
  function resolveContext(req) {
    const headerKey = String(req.header('x-agency-key') || req.header('x-admin-key') || '').trim();

    if (headerKey) {
      const tenant = agencyFromKey(headerKey);
      if (tenant) {
        if (tenant.status !== 'active') return { scope: null, error: 'Agency suspended' };
        return { scope: 'owner', agency: tenant, member: null, viaKey: true };
      }
      if (superKeyMatches(headerKey)) return { scope: 'super', agency: null, member: null };
      return { scope: null };
    }

    const member = sessionMember(req);
    if (member) {
      const tenant = agencyById(member.agency_id);
      if (!tenant) return { scope: null };
      if (tenant.status !== 'active') return { scope: null, error: 'Agency suspended' };
      return { scope: member.role === 'owner' ? 'owner' : 'member', agency: tenant, member };
    }

    return { scope: null };
  }

  function requireTenant(req, res, next) {
    const ctx = resolveContext(req);
    if (!ctx.scope) return res.status(ctx.error ? 403 : 401).json({ error: ctx.error || 'Unauthorized' });
    req.agencyCtx = ctx;
    // Super scope may act on a specific tenant by naming it explicitly.
    if (ctx.scope === 'super') {
      const wanted = String(req.header('x-agency-id') || req.query.agencyId || req.body?.agencyId || '').trim();
      if (wanted) {
        const tenant = agencyById(wanted);
        if (!tenant) return res.status(404).json({ error: 'Agency not found' });
        req.agencyCtx = { ...ctx, agency: tenant };
      }
    }
    next();
  }

  function requireOwner(req, res, next) {
    requireTenant(req, res, () => {
      if (req.agencyCtx.scope === 'member') {
        return res.status(403).json({ error: 'Owner access required' });
      }
      next();
    });
  }

  /** Super scope with no tenant selected cannot act on "the" agency. */
  function tenantOf(req, res) {
    const agency = req.agencyCtx?.agency;
    if (!agency) {
      res.status(400).json({ error: 'Specify an agencyId (super scope manages many agencies)' });
      return null;
    }
    return agency;
  }

  async function login({ email, password, ip, userAgent }) {
    const mail = String(email || '').trim().toLowerCase();
    const member = localDb.agency_members.find((m) => m.email === mail && m.status === 'active');
    // Compare against a dummy hash when the member is unknown so a missing
    // account and a wrong password take the same time to answer.
    const hash = member?.password_hash || '$2a$12$0000000000000000000000000000000000000000000000000000';
    const ok = await bcrypt.compare(String(password || ''), hash).catch(() => false);
    if (!member || !ok) return { ok: false, error: 'Invalid email or password' };

    const agency = agencyById(member.agency_id);
    if (!agency) return { ok: false, error: 'Agency not found' };
    if (agency.status !== 'active') return { ok: false, error: 'Agency suspended' };

    const token = `${SESSION_PREFIX}${crypto.randomBytes(32).toString('hex')}`;
    const row = {
      id: rid('ags', 8),
      agency_id: agency.id,
      member_id: member.id,
      token_hash: sha256(token),
      ip: String(ip || ''),
      user_agent: String(userAgent || '').slice(0, 200),
      created_at: new Date(now()).toISOString(),
      expires_at: new Date(now() + SESSION_TTL_MS).toISOString(),
      revoked_at: null,
    };
    localDb.agency_sessions.push(row);
    if (localDb.agency_sessions.length > 4000) {
      localDb.agency_sessions = localDb.agency_sessions.slice(-2000);
    }
    persistNow();
    audit?.('agency_login', { agencyId: agency.id, memberId: member.id, ip });

    return {
      ok: true,
      token,
      expiresAt: row.expires_at,
      agency: publicAgency(agency),
      member: publicMember(member),
    };
  }

  function logout(req) {
    const tok = extractToken(req);
    if (!tok) return { ok: true };
    const hash = sha256(tok);
    for (const s of localDb.agency_sessions) {
      if (s.token_hash === hash) s.revoked_at = new Date(now()).toISOString();
    }
    persistNow();
    return { ok: true };
  }

  /* ----------------------------------------------------------------------- *
   * Members
   * ----------------------------------------------------------------------- */
  async function addMember(agency, { email, password, name, commissionPct }) {
    const mail = String(email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(mail)) return { ok: false, error: 'A valid email is required' };
    if (localDb.agency_members.some((m) => m.email === mail && m.status === 'active')) {
      return { ok: false, error: 'That email is already a member' };
    }
    const pass = String(password || '');
    if (pass.length < 10) return { ok: false, error: 'Password must be at least 10 characters' };

    const member = {
      id: rid('agm', 8),
      agency_id: agency.id,
      email: mail,
      name: sanitize(String(name || mail.split('@')[0]).trim(), 60),
      password_hash: await bcrypt.hash(pass, 12),
      role: 'member',
      commission_pct: clamp(Number(commissionPct) ?? 0.5, 0, 1),
      earned_nuts: 0,
      status: 'active',
      created_at: new Date(now()).toISOString(),
    };
    localDb.agency_members.push(member);
    persistNow();
    mirror('agency_members', member);
    audit?.('agency_member_added', { agencyId: agency.id, memberId: member.id });
    return { ok: true, member: publicMember(member) };
  }

  function updateMember(agency, memberId, patch = {}) {
    const member = memberById(memberId);
    if (!member || member.agency_id !== agency.id) return { ok: false, error: 'Member not found' };
    if (Number.isFinite(Number(patch.commissionPct))) {
      member.commission_pct = clamp(Number(patch.commissionPct), 0, 1);
    }
    if (patch.status === 'active' || patch.status === 'disabled') {
      if (member.role === 'owner' && patch.status === 'disabled') {
        return { ok: false, error: 'Cannot disable the agency owner' };
      }
      member.status = patch.status;
      if (patch.status === 'disabled') {
        // A disabled member must not keep a live dashboard session.
        for (const s of localDb.agency_sessions) {
          if (s.member_id === member.id && !s.revoked_at) s.revoked_at = new Date(now()).toISOString();
        }
      }
    }
    if (typeof patch.name === 'string' && patch.name.trim()) member.name = sanitize(patch.name.trim(), 60);
    persistNow();
    mirror('agency_members', member);
    return { ok: true, member: publicMember(member) };
  }

  /* ----------------------------------------------------------------------- *
   * Invites — the path that grants a creator direct live access
   * ----------------------------------------------------------------------- */
  function createInvite(agency, member, { label, maxUses, expiresInDays } = {}) {
    let code = mintInviteCode();
    while (localDb.agency_invites.some((i) => i.code === code)) code = mintInviteCode();

    const invite = {
      code,
      agency_id: agency.id,
      // Attribution for commission: whoever generated the link owns the recruit.
      member_id: member?.id || membersOf(agency.id).find((m) => m.role === 'owner')?.id || null,
      label: sanitize(String(label || '').trim(), 60),
      max_uses: Math.max(0, Math.floor(Number(maxUses) || 0)) || 0, // 0 = unlimited
      uses: 0,
      expires_at: Number(expiresInDays) > 0
        ? new Date(now() + Number(expiresInDays) * DAY_MS).toISOString()
        : null,
      revoked_at: null,
      created_at: new Date(now()).toISOString(),
    };
    localDb.agency_invites.push(invite);
    persistNow();
    mirror('agency_invites', invite, 'code');
    audit?.('agency_invite_created', { agencyId: agency.id, code });
    return { ok: true, invite: publicInvite(invite) };
  }

  function revokeInvite(agency, code) {
    const invite = localDb.agency_invites.find(
      (i) => i.code === String(code || '').toUpperCase() && i.agency_id === agency.id,
    );
    if (!invite) return { ok: false, error: 'Invite not found' };
    invite.revoked_at = new Date(now()).toISOString();
    persistNow();
    mirror('agency_invites', invite, 'code');
    return { ok: true, invite: publicInvite(invite) };
  }

  /** Shared by the public preview endpoint and by registration itself. */
  function checkInvite(rawCode) {
    const code = String(rawCode || '').trim().toUpperCase();
    if (!code) return { ok: false, error: 'Invite code required' };
    const invite = localDb.agency_invites.find((i) => i.code === code);
    if (!invite) return { ok: false, error: 'That invite code is not valid' };
    if (invite.revoked_at) return { ok: false, error: 'That invite has been revoked' };
    if (invite.expires_at && Date.parse(invite.expires_at) < now()) {
      return { ok: false, error: 'That invite has expired' };
    }
    if (invite.max_uses > 0 && invite.uses >= invite.max_uses) {
      return { ok: false, error: 'That invite has already been fully used' };
    }
    const agency = agencyById(invite.agency_id);
    if (!agency) return { ok: false, error: 'That agency no longer exists' };
    if (agency.status !== 'active') return { ok: false, error: 'That agency is not active' };
    return { ok: true, invite, agency };
  }

  /**
   * Claims one use of an invite and returns the fields to merge into the new
   * creator row — including `status: 'approved'`, which is what "direct access
   * to live" means.
   *
   * Check-and-increment happens with no await in between, so it is atomic
   * against concurrent registrations: two requests racing on the last use of a
   * single-use code cannot both win. The caller MUST call releaseInvite if it
   * then fails to create the creator, or the use is burned for nothing.
   */
  function consumeInvite(rawCode, creator) {
    const check = checkInvite(rawCode);
    if (!check.ok) return check;
    const { invite, agency } = check;

    invite.uses += 1;
    invite.last_used_at = new Date(now()).toISOString();
    persistNow();
    mirror('agency_invites', invite, 'code');

    audit?.('agency_invite_consumed', {
      agencyId: agency.id, code: invite.code, creatorId: creator?.id,
    });

    return {
      ok: true,
      agency,
      invite,
      patch: {
        agency_id: agency.id,
        agency_member_id: invite.member_id,
        agency_invite_code: invite.code,
        agency_joined_at: new Date(now()).toISOString(),
        status: 'approved',
        approved_at: new Date(now()).toISOString(),
        rejection_reason: null,
      },
    };
  }

  /** Hands back a use claimed by consumeInvite when the signup did not land. */
  function releaseInvite(rawCode) {
    const invite = localDb.agency_invites.find((i) => i.code === String(rawCode || '').trim().toUpperCase());
    if (!invite || invite.uses <= 0) return { ok: false };
    invite.uses -= 1;
    persistNow();
    mirror('agency_invites', invite, 'code');
    return { ok: true };
  }

  /* ----------------------------------------------------------------------- *
   * Commission — carved out of the platform's cut
   * ----------------------------------------------------------------------- */
  function ledgerPush(row) {
    localDb.agency_ledger.push(row);
    if (localDb.agency_ledger.length > 20000) {
      localDb.agency_ledger = localDb.agency_ledger.slice(-10000);
    }
    mirror('agency_ledger', row);
  }

  /**
   * Called once per settled gift. `creatorShare` is what the creator already
   * received; the agency is paid only out of `giftCost - creatorShare`, so a
   * creator's take-home is identical whether or not they have an agency.
   */
  function settleCommission({ creatorId, giftCost, creatorShare, giftId, liveId, creatorRow }) {
    const cost = Math.max(0, Math.floor(Number(giftCost) || 0));
    const share = Math.max(0, Math.floor(Number(creatorShare) || 0));
    const platformShare = cost - share;
    if (platformShare <= 0) return null;

    // localDb.creators is only filled on approval, so prefer the row the
    // caller already resolved rather than depending on that timing.
    const creator = creatorRow?.id === creatorId
      ? creatorRow
      : (localDb.creators || []).find((c) => c.id === creatorId);
    if (!creator?.agency_id) return null;
    const agency = agencyById(creator.agency_id);
    if (!agency || agency.status !== 'active') return null;

    const total = Math.floor(platformShare * (Number(agency.commission_pct) || 0));
    if (total <= 0) return null;

    const recruiter = creator.agency_member_id ? memberById(creator.agency_member_id) : null;
    const owner = membersOf(agency.id).find((m) => m.role === 'owner') || null;

    let recruiterCut = 0;
    let ownerCut = 0;
    if (recruiter && recruiter.status === 'active' && recruiter.role !== 'owner') {
      recruiterCut = Math.floor(total * (Number(recruiter.commission_pct) || 0));
      ownerCut = Math.floor(recruiterCut * (Number(agency.owner_override_pct) || 0));
      // The override is funded from the recruiter's slice, never minted on top.
      recruiterCut -= ownerCut;
    } else if (recruiter && recruiter.role === 'owner') {
      // Owner recruited directly — no split, they take the member slice whole.
      ownerCut = total;
    }
    const houseCut = total - recruiterCut - ownerCut;

    const at = new Date(now()).toISOString();
    agency.commission_earned_nuts = (Number(agency.commission_earned_nuts) || 0) + total;

    if (recruiterCut > 0) {
      recruiter.earned_nuts = (Number(recruiter.earned_nuts) || 0) + recruiterCut;
      ledgerPush({
        id: rid('agl'), agency_id: agency.id, member_id: recruiter.id, creator_id: creatorId,
        kind: 'commission', nuts: recruiterCut, gift_id: giftId || null, live_id: liveId || null,
        details: `Commission on @${creator.handle_name}`, created_at: at,
      });
    }
    if (ownerCut > 0 && owner) {
      owner.earned_nuts = (Number(owner.earned_nuts) || 0) + ownerCut;
      ledgerPush({
        id: rid('agl'), agency_id: agency.id, member_id: owner.id, creator_id: creatorId,
        kind: recruiterCut > 0 ? 'owner_override' : 'commission', nuts: ownerCut,
        gift_id: giftId || null, live_id: liveId || null,
        details: `${recruiterCut > 0 ? 'Override' : 'Commission'} on @${creator.handle_name}`, created_at: at,
      });
    }
    if (houseCut > 0) {
      ledgerPush({
        id: rid('agl'), agency_id: agency.id, member_id: null, creator_id: creatorId,
        kind: 'house', nuts: houseCut, gift_id: giftId || null, live_id: liveId || null,
        details: `Agency share on @${creator.handle_name}`, created_at: at,
      });
    }

    schedulePersist();
    return { agencyId: agency.id, total, recruiterCut, ownerCut, houseCut, platformShare };
  }

  /* ----------------------------------------------------------------------- *
   * Selling minted Nuts to a user wallet
   * ----------------------------------------------------------------------- */
  async function sellNuts(agency, member, { username, nuts, note }) {
    accrue(agency);
    const amount = Math.floor(Number(nuts) || 0);
    if (amount <= 0) return { ok: false, error: 'Enter how many Nuts to sell' };
    if (amount > (Number(agency.mint_pool_nuts) || 0)) {
      return { ok: false, error: 'Not enough Nuts in the mint pool', poolNuts: agency.mint_pool_nuts };
    }
    if (!audioIdentity?.getByUsername) return { ok: false, error: 'Identity module unavailable' };

    const rec = audioIdentity.getByUsername(String(username || '').trim().toLowerCase());
    if (!rec) return { ok: false, error: 'No user with that username' };
    const walletKey = rec.usernameKey || String(username).trim().toLowerCase();

    // Debit the pool BEFORE crediting so a credit failure cannot mint Nuts
    // that were never backed by the pool.
    agency.mint_pool_nuts -= amount;
    const credit = await audioIdentity.credit(walletKey, amount, 'agency_nuts_sale', {
      agencyId: agency.id, memberId: member?.id || null, note: sanitize(String(note || ''), 200),
    });
    if (!credit?.ok) {
      agency.mint_pool_nuts += amount;
      persistNow();
      return { ok: false, error: credit?.error || 'Could not credit that wallet' };
    }

    const market = getMarket?.();
    const inr = market?.nutsToInr ? market.nutsToInr(amount) : null;
    const sale = {
      id: rid('agsale'),
      agency_id: agency.id,
      member_id: member?.id || null,
      username_key: walletKey,
      nuts: amount,
      inr,
      market_rate: market?.getRate?.() ?? null,
      note: sanitize(String(note || ''), 200),
      created_at: new Date(now()).toISOString(),
    };
    localDb.agency_sales.push(sale);
    if (localDb.agency_sales.length > 10000) localDb.agency_sales = localDb.agency_sales.slice(-5000);
    agency.nuts_sold = (Number(agency.nuts_sold) || 0) + amount;
    agency.sales_inr = Number(((Number(agency.sales_inr) || 0) + (inr || 0)).toFixed(2));

    ledgerPush({
      id: rid('agl'), agency_id: agency.id, member_id: member?.id || null, creator_id: null,
      kind: 'sale', nuts: -amount, details: `Sold ${amount} Nuts to @${rec.username || walletKey}`,
      created_at: sale.created_at,
    });
    persistNow();
    mirror('agency_sales', sale);
    audit?.('agency_nuts_sold', { agencyId: agency.id, nuts: amount, to: walletKey });

    return { ok: true, sale, poolNuts: agency.mint_pool_nuts, balance: credit.balance, mint: mintView(agency) };
  }

  /* ----------------------------------------------------------------------- *
   * Views
   * ----------------------------------------------------------------------- */
  function publicAgency(a) {
    if (!a) return null;
    return {
      id: a.id,
      name: a.name,
      slug: a.slug,
      status: a.status,
      commissionPct: a.commission_pct,
      ownerOverridePct: a.owner_override_pct,
      commissionEarnedNuts: Number(a.commission_earned_nuts) || 0,
      nutsSold: Number(a.nuts_sold) || 0,
      salesInr: Number(a.sales_inr) || 0,
      creatorCount: creatorsOf(a.id).length,
      memberCount: membersOf(a.id).filter((m) => m.status === 'active').length,
      keyRotatedAt: a.key_rotated_at || null,
      createdAt: a.created_at,
    };
  }
  function publicMember(m) {
    if (!m) return null;
    return {
      id: m.id,
      agencyId: m.agency_id,
      email: m.email,
      name: m.name,
      role: m.role,
      commissionPct: m.commission_pct,
      earnedNuts: Number(m.earned_nuts) || 0,
      status: m.status,
      recruitedCount: (localDb.creators || []).filter((c) => c.agency_member_id === m.id).length,
      createdAt: m.created_at,
    };
  }
  function publicInvite(i) {
    if (!i) return null;
    const member = i.member_id ? memberById(i.member_id) : null;
    return {
      code: i.code,
      label: i.label,
      maxUses: i.max_uses,
      uses: i.uses,
      expiresAt: i.expires_at,
      revokedAt: i.revoked_at,
      recruiter: member ? { id: member.id, name: member.name, email: member.email } : null,
      createdAt: i.created_at,
      active: !i.revoked_at
        && (!i.expires_at || Date.parse(i.expires_at) >= now())
        && (i.max_uses === 0 || i.uses < i.max_uses),
    };
  }

  function rosterOf(agency) {
    const ledger = localDb.agency_ledger.filter((l) => l.agency_id === agency.id);
    const byCreator = new Map();
    for (const row of ledger) {
      if (!row.creator_id || row.nuts <= 0) continue;
      byCreator.set(row.creator_id, (byCreator.get(row.creator_id) || 0) + row.nuts);
    }
    return creatorsOf(agency.id).map((c) => {
      const member = c.agency_member_id ? memberById(c.agency_member_id) : null;
      return {
        id: c.id,
        handle: c.handle_name,
        status: c.status,
        avatarUrl: c.avatar_url || null,
        coinsEarned: Number(c.coins_earned) || 0,
        earningsRs: Number(c.earnings_rs) || 0,
        followers: Number(c.followers_count) || 0,
        joinedAt: c.agency_joined_at || c.created_at,
        inviteCode: c.agency_invite_code || null,
        recruiter: member ? { id: member.id, name: member.name } : null,
        commissionGeneratedNuts: byCreator.get(c.id) || 0,
      };
    }).sort((a, b) => b.commissionGeneratedNuts - a.commissionGeneratedNuts);
  }

  function earningsOf(agency, { limit = 200 } = {}) {
    const rows = localDb.agency_ledger
      .filter((l) => l.agency_id === agency.id)
      .slice(-Math.max(1, Math.min(1000, limit)))
      .reverse();
    const totals = { commission: 0, ownerOverride: 0, house: 0, sold: 0 };
    for (const l of localDb.agency_ledger) {
      if (l.agency_id !== agency.id) continue;
      if (l.kind === 'commission') totals.commission += l.nuts;
      else if (l.kind === 'owner_override') totals.ownerOverride += l.nuts;
      else if (l.kind === 'house') totals.house += l.nuts;
      else if (l.kind === 'sale') totals.sold += Math.abs(l.nuts);
    }
    const market = getMarket?.();
    return {
      rows: rows.map((l) => ({
        id: l.id,
        kind: l.kind,
        nuts: l.nuts,
        memberId: l.member_id,
        memberName: l.member_id ? memberById(l.member_id)?.name || null : null,
        creatorId: l.creator_id,
        details: l.details,
        createdAt: l.created_at,
      })),
      totals,
      totalNuts: totals.commission + totals.ownerOverride + totals.house,
      totalInr: market?.nutsToInr
        ? market.nutsToInr(totals.commission + totals.ownerOverride + totals.house)
        : null,
    };
  }

  /* ----------------------------------------------------------------------- *
   * Routes
   * ----------------------------------------------------------------------- */
  app.post('/api/agency/login', async (req, res) => {
    const result = await login({
      email: req.body?.email,
      password: req.body?.password,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    if (!result.ok) return res.status(401).json(result);
    res.json(result);
  });

  app.post('/api/agency/logout', (req, res) => res.json(logout(req)));

  app.get('/api/agency/me', requireTenant, (req, res) => {
    const { scope, agency, member } = req.agencyCtx;
    if (scope === 'super' && !agency) {
      return res.json({
        ok: true,
        scope,
        agencies: localDb.agencies.map(publicAgency),
      });
    }
    res.json({
      ok: true,
      scope,
      agency: publicAgency(agency),
      member: publicMember(member),
      mint: mintView(agency),
      commissionPct: agency.commission_pct,
    });
  });

  app.get('/api/agency/roster', requireTenant, (req, res) => {
    const agency = tenantOf(req, res);
    if (!agency) return undefined;
    return res.json({ ok: true, agency: publicAgency(agency), creators: rosterOf(agency) });
  });

  app.get('/api/agency/members', requireTenant, (req, res) => {
    const agency = tenantOf(req, res);
    if (!agency) return undefined;
    return res.json({ ok: true, members: membersOf(agency.id).map(publicMember) });
  });

  app.post('/api/agency/members', requireOwner, async (req, res) => {
    const agency = tenantOf(req, res);
    if (!agency) return undefined;
    const result = await addMember(agency, req.body || {});
    return res.status(result.ok ? 200 : 400).json(result);
  });

  app.post('/api/agency/members/:id', requireOwner, (req, res) => {
    const agency = tenantOf(req, res);
    if (!agency) return undefined;
    const result = updateMember(agency, req.params.id, req.body || {});
    return res.status(result.ok ? 200 : 400).json(result);
  });

  app.get('/api/agency/invites', requireTenant, (req, res) => {
    const agency = tenantOf(req, res);
    if (!agency) return undefined;
    const { scope, member } = req.agencyCtx;
    const all = localDb.agency_invites.filter((i) => i.agency_id === agency.id);
    // A plain member only manages the links they own.
    const visible = scope === 'member' && member ? all.filter((i) => i.member_id === member.id) : all;
    return res.json({ ok: true, invites: visible.map(publicInvite) });
  });

  app.post('/api/agency/invites', requireTenant, (req, res) => {
    const agency = tenantOf(req, res);
    if (!agency) return undefined;
    const result = createInvite(agency, req.agencyCtx.member, req.body || {});
    return res.status(result.ok ? 200 : 400).json(result);
  });

  app.post('/api/agency/invites/:code/revoke', requireTenant, (req, res) => {
    const agency = tenantOf(req, res);
    if (!agency) return undefined;
    const { scope, member } = req.agencyCtx;
    if (scope === 'member') {
      const own = localDb.agency_invites.find(
        (i) => i.code === String(req.params.code || '').toUpperCase() && i.member_id === member?.id,
      );
      if (!own) return res.status(403).json({ error: 'You can only revoke your own invites' });
    }
    const result = revokeInvite(agency, req.params.code);
    return res.status(result.ok ? 200 : 404).json(result);
  });

  /** Public: lets the creator signup form show which agency is inviting. */
  app.get('/api/agency/invite/:code', (req, res) => {
    const check = checkInvite(req.params.code);
    if (!check.ok) return res.status(404).json({ ok: false, error: check.error });
    const recruiter = check.invite.member_id ? memberById(check.invite.member_id) : null;
    res.json({
      ok: true,
      invite: {
        code: check.invite.code,
        agencyName: check.agency.name,
        agencySlug: check.agency.slug,
        recruiterName: recruiter?.name || null,
        // Advertising the perk is the whole point of the invite link.
        grantsInstantLive: true,
      },
    });
  });

  app.get('/api/agency/mint', requireTenant, (req, res) => {
    const agency = tenantOf(req, res);
    if (!agency) return undefined;
    return res.json({ ok: true, mint: mintView(agency) });
  });

  app.post('/api/agency/mint/sell', requireTenant, async (req, res) => {
    const agency = tenantOf(req, res);
    if (!agency) return undefined;
    const result = await sellNuts(agency, req.agencyCtx.member, req.body || {});
    return res.status(result.ok ? 200 : 400).json(result);
  });

  app.get('/api/agency/sales', requireTenant, (req, res) => {
    const agency = tenantOf(req, res);
    if (!agency) return undefined;
    const sales = localDb.agency_sales
      .filter((s) => s.agency_id === agency.id)
      .slice(-200)
      .reverse();
    return res.json({ ok: true, sales });
  });

  app.get('/api/agency/earnings', requireTenant, (req, res) => {
    const agency = tenantOf(req, res);
    if (!agency) return undefined;
    return res.json({ ok: true, ...earningsOf(agency, { limit: Number(req.query.limit) || 200 }) });
  });

  return {
    // auth
    requireTenant,
    requireOwner,
    resolveContext,
    tenantOf,
    login,
    logout,
    // lifecycle
    createAgency,
    updateAgency,
    rotateKey,
    listAgencies: () => localDb.agencies.map(publicAgency),
    getAgency: (id) => publicAgency(agencyById(id)),
    agencyById,
    // members
    addMember,
    updateMember,
    memberById,
    // invites / binding
    checkInvite,
    consumeInvite,
    releaseInvite,
    createInvite,
    revokeInvite,
    // money
    settleCommission,
    sellNuts,
    accrue,
    mintView,
    rosterOf,
    earningsOf,
    membersOf,
    creatorsOf,
    // views
    publicAgency,
    publicMember,
    publicInvite,
    // constants worth asserting against in tests
    MAX_COMMISSION_PCT,
    DAY_MS,
    stop: () => clearInterval(mintTimer),
  };
}

module.exports = {
  registerAgencyTenancy,
  MAX_COMMISSION_PCT,
  MAX_MINT_GROWTH_PCT,
  DEFAULT_MINT_DAILY,
  DEFAULT_MINT_GROWTH_PCT,
  DEFAULT_MINT_POOL_CAP,
  SESSION_PREFIX,
  KEY_PREFIX,
  DAY_MS,
};
