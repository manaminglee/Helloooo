/**
 * Moderation, AI monitoring, security and audit trail.
 *
 * Responsibilities
 *  - Central audit log (every privileged/economic action is journaled).
 *  - Heuristic + AI text screening for chat and audio-channel topics.
 *  - Trust scoring: repeated offences escalate warn -> mute -> kick -> ban.
 *  - Admin block/unblock (IP + user), enforced across sockets in real time.
 *
 * The heuristic layer runs first and is synchronous, so obvious abuse is
 * blocked instantly even when the AI provider is slow or unavailable.
 */

const AUDIT_MAX = 1000;
const STRIKE_WINDOW_MS = 30 * 60 * 1000;

// Severity 3 = immediate ban-worthy, 2 = kick, 1 = warn.
const PATTERNS = [
  { re: /\b(child|minor|underage|teen)\s*(porn|nude|sex)/i, severity: 3, label: 'csam' },
  { re: /\b(kill|murder|rape)\s+(you|him|her|them)\b/i, severity: 3, label: 'threat' },
  { re: /\b(suicide|kill\s*myself|end\s*my\s*life)\b/i, severity: 0, label: 'self_harm_support' },
  { re: /(https?:\/\/|www\.)\S{4,}/i, severity: 1, label: 'link' },
  { re: /\b\d{10,}\b/, severity: 1, label: 'phone_number' },
  { re: /\b(onlyfans|telegram\s*@|whatsapp\s*\+?\d)/i, severity: 2, label: 'off_platform_solicit' },
  { re: /\b(fuck|bitch|slut|whore|cunt)\b/i, severity: 1, label: 'profanity' },
];

function registerModeration(app, io, deps) {
  const {
    users,
    blockedIps,
    supabase,
    isAdminRequest,
    sanitize,
    terminateUserSession,
    nvidiaAi,
    ADMIN_ROOM,
  } = deps;

  const auditLog = [];
  /** ip -> { strikes: [{at, severity, label}], score } */
  const trust = new Map();
  const stats = { screened: 0, blocked: 0, flagged: 0, bans: 0 };

  function audit(action, details = {}) {
    const entry = { action, details, at: Date.now() };
    auditLog.unshift(entry);
    if (auditLog.length > AUDIT_MAX) auditLog.length = AUDIT_MAX;

    // Stream to connected admin dashboards for live visibility.
    io.to(ADMIN_ROOM).emit('admin:audit', entry);

    if (supabase) {
      supabase
        .from('audit_logs')
        .insert({ action, details, created_at: new Date().toISOString() })
        .then(() => {})
        .catch(() => {});
    }
    return entry;
  }

  function trustFor(ip) {
    if (!trust.has(ip)) trust.set(ip, { strikes: [], score: 100 });
    const t = trust.get(ip);
    const cutoff = Date.now() - STRIKE_WINDOW_MS;
    t.strikes = t.strikes.filter((s) => s.at > cutoff);
    return t;
  }

  /** Synchronous heuristic screen — always runs, never blocks on network. */
  function screenHeuristic(text) {
    const value = String(text || '');
    for (const p of PATTERNS) {
      if (p.re.test(value)) {
        return { flagged: p.severity > 0, severity: p.severity, label: p.label };
      }
    }
    return { flagged: false, severity: 0, label: null };
  }

  /**
   * Full screen: heuristics first, then AI for borderline content.
   * Returns { allow, action, reason, severity }.
   */
  async function screenText(ip, text, context = 'chat') {
    stats.screened += 1;
    const h = screenHeuristic(text);

    // Self-harm is never punished — surface support instead.
    if (h.label === 'self_harm_support') {
      return { allow: true, action: 'support', reason: 'self_harm', severity: 0 };
    }

    let severity = h.severity;
    let label = h.label;

    // Escalate ambiguous cases to the AI classifier when available.
    // nvidiaAi.moderate() fails open (returns { safe:true, offline:true }) when
    // the provider is down, so heuristics remain the guaranteed floor.
    if (!h.flagged && String(text || '').length > 24 && typeof nvidiaAi?.moderate === 'function') {
      try {
        const verdict = await nvidiaAi.moderate(String(text).slice(0, 500));
        if (verdict && verdict.safe === false) {
          severity = Math.max(severity, 2);
          label = 'ai_flagged';
        }
      } catch (_) {
        /* AI unavailable — heuristics already applied */
      }
    }

    if (severity <= 0) return { allow: true, action: 'allow', severity: 0 };

    stats.flagged += 1;
    const t = trustFor(ip);
    t.strikes.push({ at: Date.now(), severity, label });
    t.score = Math.max(0, t.score - severity * 12);

    const total = t.strikes.reduce((sum, s) => sum + s.severity, 0);
    let action = 'warn';
    if (severity >= 3 || total >= 7) action = 'ban';
    else if (total >= 4) action = 'kick';
    else if (severity >= 2) action = 'mute';

    audit('moderation_flag', { ip, context, label, severity, action, score: t.score });

    if (action === 'ban') {
      stats.bans += 1;
      blockedIps.add(ip);
      for (const [sid, u] of users.entries()) {
        if (u.ip === ip) terminateUserSession(sid, 'Banned for violating community guidelines.', io, { blockIp: true });
      }
    } else if (action === 'kick') {
      for (const [sid, u] of users.entries()) {
        if (u.ip === ip) terminateUserSession(sid, 'Removed for violating community guidelines.', io);
      }
    }

    if (action !== 'allow') stats.blocked += 1;
    return { allow: action === 'warn', action, reason: label, severity };
  }

  /** Live monitoring feed for the admin dashboard. */
  function reportEvent(kind, payload) {
    io.to(ADMIN_ROOM).emit('admin:monitor-event', { kind, payload, at: Date.now() });
  }

  function attachSocketHandlers(socket, ip) {
    socket.on('moderation:report', (data) => {
      const reason = sanitize(String(data?.reason || 'unspecified'), 200);
      const target = String(data?.targetSocketId || '');
      const targetUser = users.get(target);
      audit('user_report', {
        byIp: ip,
        targetIp: targetUser?.ip,
        targetUserId: targetUser?.id,
        reason,
        channelId: data?.channelId || null,
      });
      reportEvent('report', { reason, targetUserId: targetUser?.id });
      socket.emit('moderation:reported', { ok: true });
    });
  }

  // ---------------- Admin HTTP ----------------

  app.get('/api/admin/moderation/audit', (req, res) => {
    if (!isAdminRequest(req)) return res.status(403).json({ error: 'Forbidden' });
    const limit = Math.min(Number(req.query.limit) || 200, AUDIT_MAX);
    res.json({ audit: auditLog.slice(0, limit), stats });
  });

  app.get('/api/admin/moderation/trust', (req, res) => {
    if (!isAdminRequest(req)) return res.status(403).json({ error: 'Forbidden' });
    const list = [...trust.entries()]
      .map(([ip, t]) => ({ ip, score: t.score, strikes: t.strikes.length, recent: t.strikes.slice(-5) }))
      .sort((a, b) => a.score - b.score)
      .slice(0, 100);
    res.json({ users: list, blockedIps: [...blockedIps] });
  });

  app.post('/api/admin/moderation/block', (req, res) => {
    if (!isAdminRequest(req)) return res.status(403).json({ error: 'Forbidden' });
    const { ip, blocked, reason } = req.body || {};
    if (!ip) return res.status(400).json({ error: 'ip required' });

    if (blocked === false) {
      blockedIps.delete(ip);
      trust.delete(ip);
      audit('admin_unblock', { ip, reason: sanitize(String(reason || ''), 120) });
      return res.json({ ok: true, blocked: false });
    }

    blockedIps.add(ip);
    for (const [sid, u] of users.entries()) {
      if (u.ip === ip) {
        terminateUserSession(sid, sanitize(String(reason || 'Blocked by an administrator.'), 160), io, { blockIp: true });
      }
    }
    audit('admin_block', { ip, reason: sanitize(String(reason || ''), 120) });
    res.json({ ok: true, blocked: true });
  });

  /** Screen arbitrary text on demand (admin tooling / preview). */
  app.post('/api/admin/moderation/screen', async (req, res) => {
    if (!isAdminRequest(req)) return res.status(403).json({ error: 'Forbidden' });
    const result = await screenText('admin-preview', String(req.body?.text || ''), 'preview');
    res.json(result);
  });

  return { audit, screenText, screenHeuristic, trustFor, reportEvent, attachSocketHandlers, auditLog, stats };
}

module.exports = { registerModeration };
