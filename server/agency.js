/**
 * Agency dashboard API — creators, payouts, lives, audio rooms, Nuts economy.
 * Auth: AGENCY_ADMIN_KEY or ADMIN_KEY via x-agency-key / x-admin-key.
 */
const crypto = require('crypto');
const { NUTS_PER_USD, COIN_PACKAGES, GIFTS } = require('./giftCatalog');
const creatorSecurity = require('./creatorSecurity');

function safeEqualKeys(provided, expected) {
  try {
    const a = Buffer.from(String(expected || ''), 'utf8');
    const b = Buffer.from(String(provided || ''), 'utf8');
    return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function getAgencyKey() {
  const raw = (process.env.AGENCY_ADMIN_KEY || process.env.ADMIN_KEY || '').trim().replace(/^["']|["']$/g, '');
  return raw || null;
}

function registerAgency(app, io, deps) {
  const {
    settings,
    localDb,
    saveLocalDb,
    supabase,
    isAdminRequest,
    getAdminKey,
    liveStreams,
    audioChannels,
    audioIdentity,
    audit,
    applyCreatorStatus,
    applyCreatorStatusBulk,
    creatorApprovalDeps,
  } = deps;

  function isAgencyRequest(req) {
    const key = getAgencyKey();
    if (!key) return false;
    const provided = (req.header('x-agency-key') || req.header('x-admin-key') || '').toString().trim();
    if (safeEqualKeys(provided, key)) return true;
    const adminKey = getAdminKey?.();
    if (adminKey && safeEqualKeys(provided, adminKey)) return true;
    return false;
  }

  function requireAgency(req, res, next) {
    if (!getAgencyKey() && !getAdminKey?.()) {
      return res.status(503).json({ error: 'Agency panel not configured' });
    }
    if (!isAgencyRequest(req)) return res.status(401).json({ error: 'Unauthorized' });
    req.agencyAuthed = true;
    next();
  }

  // Ensure agency settings defaults
  if (settings.liveGoLivePolicy == null) settings.liveGoLivePolicy = 'approved';
  if (settings.nutsPayoutPerUsd == null) settings.nutsPayoutPerUsd = NUTS_PER_USD;
  if (settings.minWithdrawalNuts == null) settings.minWithdrawalNuts = 10000;
  if (settings.agencyAnnouncements == null) settings.agencyAnnouncements = '';

  app.get('/api/agency/overview', requireAgency, async (_req, res) => {
    const lives = liveStreams?.listActive?.() || [];
    let audioList = [];
    try {
      audioList = audioChannels?.listChannelsPublic?.() || audioChannels?.listForAdmin?.() || [];
    } catch {
      audioList = [];
    }
    const creators = localDb.creators || [];
    const pendingCreators = creators.filter((c) => c.status === 'pending').length;
    const withdrawals = (localDb.withdrawals || []).filter((w) => w.status === 'pending');
    res.json({
      ok: true,
      overview: {
        activeLives: lives.length,
        liveViewers: lives.reduce((n, l) => n + (l.viewerCount || 0), 0),
        audioRooms: Array.isArray(audioList) ? audioList.length : 0,
        pendingCreators,
        pendingWithdrawals: withdrawals.length,
        nutsPerUsd: settings.nutsPayoutPerUsd || NUTS_PER_USD,
        liveGoLivePolicy: settings.liveGoLivePolicy || 'approved',
        packages: COIN_PACKAGES,
        megaGifts: GIFTS.filter((g) => g.category === 'mega').length,
      },
      lives,
    });
  });

  app.get('/api/agency/creators', requireAgency, async (_req, res) => {
    let creators = [];
    let withdrawals = [];
    if (supabase) {
      const { data } = await supabase.from('creators').select('*').order('created_at', { ascending: false });
      creators = data || [];
      const { data: wData } = await supabase.from('withdrawals').select('*, creators(handle_name)').order('created_at', { ascending: false });
      withdrawals = wData || [];
    } else {
      creators = [...(localDb.creators || [])].reverse();
      withdrawals = [...(localDb.withdrawals || [])].reverse();
    }
    res.json({
      ok: true,
      creators,
      withdrawals,
      nutsPerUsd: settings.nutsPayoutPerUsd || NUTS_PER_USD,
      minWithdrawalNuts: settings.minWithdrawalNuts || 10000,
    });
  });

  app.post('/api/agency/creators/approve', requireAgency, async (req, res) => {
    const { creatorId, status, reason } = req.body || {};
    if (!applyCreatorStatus || !creatorApprovalDeps) {
      return res.status(501).json({ error: 'Approval module unavailable' });
    }
    try {
      const result = await applyCreatorStatus(creatorApprovalDeps(), {
        creatorId,
        status,
        reason,
      });
      if (!result.ok) {
        return res.status(result.error === 'Creator not found' ? 404 : 400).json({ error: result.error });
      }
      res.json({
        ok: true,
        already: !!result.already,
        password: result.password,
        creator: result.creator,
      });
    } catch (e) {
      console.error('[AGENCY_APPROVE]', e);
      res.status(500).json({ error: 'Approval failed' });
    }
  });

  app.post('/api/agency/creators/approve-bulk', requireAgency, async (req, res) => {
    if (!applyCreatorStatusBulk || !creatorApprovalDeps) {
      return res.status(501).json({ error: 'Approval module unavailable' });
    }
    try {
      let { creatorIds, status, reason, pendingOnly } = req.body || {};
      status = status || 'approved';
      if (pendingOnly) {
        let list = [];
        if (supabase) {
          const { data } = await supabase.from('creators').select('id').eq('status', 'pending');
          list = (data || []).map((r) => r.id);
        } else {
          list = (localDb.creators || []).filter((c) => c.status === 'pending').map((c) => c.id);
        }
        creatorIds = list;
      }
      const result = await applyCreatorStatusBulk(creatorApprovalDeps(), {
        creatorIds,
        status,
        reason,
      });
      if (!result.ok) return res.status(400).json({ error: result.error });
      res.json({ ok: true, ...result });
    } catch (e) {
      console.error('[AGENCY_APPROVE_BULK]', e);
      res.status(500).json({ error: 'Bulk approval failed' });
    }
  });

  app.post('/api/agency/withdrawals/status', requireAgency, async (req, res) => {
    const { withdrawalId, status, note } = req.body || {};
    if (!withdrawalId || !['approved', 'rejected', 'paid', 'pending'].includes(status)) {
      return res.status(400).json({ error: 'Invalid request' });
    }
    let withdrawal = (localDb.withdrawals || []).find((w) => w.id === withdrawalId);
    if (supabase) {
      const { data } = await supabase.from('withdrawals').select('*').eq('id', withdrawalId).maybeSingle();
      if (data) withdrawal = data;
    }
    if (!withdrawal) return res.status(404).json({ error: 'Not found' });
    withdrawal.status = status;
    withdrawal.admin_note = String(note || '').slice(0, 500);
    withdrawal.updated_at = new Date().toISOString();
    if (supabase) {
      await supabase.from('withdrawals').update({
        status,
        admin_note: withdrawal.admin_note,
        updated_at: withdrawal.updated_at,
      }).eq('id', withdrawalId);
    } else {
      saveLocalDb?.();
    }
    audit?.('agency_withdrawal', { withdrawalId, status });
    res.json({ ok: true, withdrawal });
  });

  app.get('/api/agency/lives', requireAgency, (_req, res) => {
    res.json({ ok: true, lives: liveStreams?.listActive?.() || [] });
  });

  app.post('/api/agency/lives/:id/end', requireAgency, async (req, res) => {
    req.agencyAuthed = true;
    const result = await liveStreams?.endLive?.(req.params.id, 'agency_force');
    res.json(result || { ok: false, error: 'Lives module unavailable' });
  });

  app.post('/api/agency/lives/battle/start', requireAgency, async (req, res) => {
    const result = await liveStreams?.startBattle?.(req.body?.liveIdA, req.body?.liveIdB);
    if (!result?.ok) return res.status(400).json(result || { ok: false });
    res.json(result);
  });

  app.get('/api/agency/audio', requireAgency, (_req, res) => {
    let channels = [];
    try {
      if (typeof audioChannels?.listForAdmin === 'function') channels = audioChannels.listForAdmin();
      else if (typeof audioChannels?.getAdminSnapshot === 'function') channels = audioChannels.getAdminSnapshot();
    } catch {
      channels = [];
    }
    res.json({ ok: true, channels });
  });

  app.post('/api/agency/audio/:channelId/action', requireAgency, async (req, res) => {
    if (typeof audioChannels?.adminAction === 'function') {
      const result = await audioChannels.adminAction(req.params.channelId, req.body || {});
      return res.json(result);
    }
    res.status(501).json({ error: 'Audio admin action not available' });
  });

  app.get('/api/agency/nuts', requireAgency, (_req, res) => {
    res.json({
      ok: true,
      packages: COIN_PACKAGES,
      gifts: GIFTS,
      nutsPerUsd: settings.nutsPayoutPerUsd || NUTS_PER_USD,
      minWithdrawalNuts: settings.minWithdrawalNuts || 10000,
      currencyLabel: 'Nuts',
    });
  });

  app.post('/api/agency/nuts/adjust', requireAgency, async (req, res) => {
    const username = String(req.body?.username || '').trim().toLowerCase();
    const delta = Math.floor(Number(req.body?.delta) || 0);
    if (!username || !delta) return res.status(400).json({ error: 'username and delta required' });
    if (!audioIdentity?.getByUsername) return res.status(501).json({ error: 'Identity module unavailable' });
    const rec = audioIdentity.getByUsername(username);
    if (!rec) return res.status(404).json({ error: 'Identity not found' });
    const key = rec.usernameKey || username;
    let result;
    if (delta > 0) result = await audioIdentity.credit(key, delta, 'agency_adjust', { note: req.body?.note });
    else result = await audioIdentity.debit(key, Math.abs(delta), 'agency_adjust', { note: req.body?.note });
    audit?.('agency_nuts_adjust', { username, delta });
    res.json(result || { ok: false });
  });

  app.get('/api/agency/settings', requireAgency, (_req, res) => {
    res.json({
      ok: true,
      settings: {
        liveGoLivePolicy: settings.liveGoLivePolicy || 'approved',
        nutsPayoutPerUsd: settings.nutsPayoutPerUsd || NUTS_PER_USD,
        minWithdrawalNuts: settings.minWithdrawalNuts || 10000,
        agencyAnnouncements: settings.agencyAnnouncements || '',
        coinsEnabled: settings.coinsEnabled !== false,
      },
    });
  });

  app.post('/api/agency/settings', requireAgency, (req, res) => {
    const body = req.body || {};
    if (body.liveGoLivePolicy === 'approved' || body.liveGoLivePolicy === 'applied') {
      settings.liveGoLivePolicy = body.liveGoLivePolicy;
    }
    if (typeof body.nutsPayoutPerUsd === 'number' && body.nutsPayoutPerUsd > 0) {
      settings.nutsPayoutPerUsd = Math.floor(body.nutsPayoutPerUsd);
    }
    if (typeof body.minWithdrawalNuts === 'number' && body.minWithdrawalNuts >= 0) {
      settings.minWithdrawalNuts = Math.floor(body.minWithdrawalNuts);
    }
    if (typeof body.agencyAnnouncements === 'string') {
      settings.agencyAnnouncements = body.agencyAnnouncements.slice(0, 2000);
    }
    if (typeof body.coinsEnabled === 'boolean') settings.coinsEnabled = body.coinsEnabled;
    io.emit('settings_updated', settings);
    audit?.('agency_settings', { ...body });
    res.json({ ok: true, settings });
  });

  return { requireAgency, isAgencyRequest, getAgencyKey };
}

module.exports = { registerAgency, getAgencyKey: () => (process.env.AGENCY_ADMIN_KEY || process.env.ADMIN_KEY || '').trim() };
