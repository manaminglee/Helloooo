/**
 * Helloooo Virtual Economy Market Engine
 *
 * Server-authoritative INR-per-$1 *platform* rate for Nuts accounting.
 * This is NOT a real FX / crypto / investment product — it is an internal
 * creator economy index driven by purchases, gifts, and withdrawals.
 *
 * Clients may display the rate; they must never compute or override it.
 */
const crypto = require('crypto');

const MARKET_ROOM = 'mm-virtual-market';
const STATUS = {
  NORMAL: 'NORMAL',
  HIGH_DEMAND: 'HIGH_DEMAND',
  LOW_DEMAND: 'LOW_DEMAND',
  VOLATILE: 'VOLATILE',
  PAUSED: 'PAUSED',
  MAINTENANCE: 'MAINTENANCE',
};

const DEFAULT_CONFIG = {
  minRate: 88.0,
  maxRate: 92.0,
  baseRate: 90.0,
  currentRate: 90.0,
  sensitivity: 0.35,          // how strongly demand moves the rate
  updateIntervalMs: 15_000,
  maxMovePerUpdate: 0.25,     // absolute ₹ clamp per tick
  maxMovePercent: 0.35,       // percent clamp per tick
  smoothingAlpha: 0.28,       // EMA blend toward proposed
  creatorPayoutPct: 0.7,
  platformFeePct: 0.3,
  weights: {
    purchaseVolume: 1.0,
    purchaseVelocity: 0.8,
    giftVolume: 0.9,
    giftVelocity: 0.7,
    activeBuyers: 0.5,
    activeGifters: 0.5,
    activeCreators: 0.4,
    withdrawalPressure: 1.1,
    unusedCoinPressure: 0.6,
    platformRevenue: 0.3,
  },
  circuitBreaker: {
    enabled: true,
    spikeMultiplier: 8,
    pauseMs: 5 * 60_000,
  },
  disclaimer: 'Platform Virtual Economy Rate — not a real currency exchange or investment product.',
};

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

function roundRate(n) {
  return Math.round(Number(n) * 100) / 100;
}

function nowMs() {
  return Date.now();
}

function emptyMetrics() {
  return {
    purchaseVolumeCoins: 0,
    purchaseVolumeInr: 0,
    purchaseCount: 0,
    giftVolumeCoins: 0,
    giftCount: 0,
    activeBuyers: new Set(),
    activeGifters: new Set(),
    activeCreators: new Set(),
    withdrawalCoins: 0,
    withdrawalCount: 0,
    platformRevenueCoins: 0,
    unusedCoinEstimate: 0,
    suspiciousSkipped: 0,
  };
}

function registerMarketEngine(app, io, deps = {}) {
  const {
    supabase,
    localDb,
    saveLocalDb,
    isAdminRequest,
    sanitize,
    audit,
    emitToAdmins,
  } = deps;

  ensureShape();
  const cfg = { ...DEFAULT_CONFIG, ...(localDb.virtual_market?.config || {}) };
  // Enforce hard range on boot
  cfg.minRate = Number(cfg.minRate) || DEFAULT_CONFIG.minRate;
  cfg.maxRate = Number(cfg.maxRate) || DEFAULT_CONFIG.maxRate;
  if (cfg.minRate > cfg.maxRate) {
    const t = cfg.minRate;
    cfg.minRate = cfg.maxRate;
    cfg.maxRate = t;
  }
  cfg.currentRate = clamp(Number(cfg.currentRate) || cfg.baseRate, cfg.minRate, cfg.maxRate);
  cfg.baseRate = clamp(Number(cfg.baseRate) || cfg.currentRate, cfg.minRate, cfg.maxRate);

  let status = localDb.virtual_market?.status || STATUS.NORMAL;
  let previousRate = Number(localDb.virtual_market?.previousRate) || cfg.currentRate;
  let lastUpdateAt = Number(localDb.virtual_market?.lastUpdateAt) || nowMs();
  let pausedUntil = Number(localDb.virtual_market?.pausedUntil) || 0;
  let emaRate = cfg.currentRate;

  // Rolling window metrics (since last tick + history for velocity)
  let window = emptyMetrics();
  const recentTicks = []; // last N demand scores for volatility
  const history = Array.isArray(localDb.virtual_market?.history)
    ? localDb.virtual_market.history.slice(-5000)
    : [];

  const chat = Array.isArray(localDb.virtual_market?.chat)
    ? localDb.virtual_market.chat.slice(-80)
    : [];

  function ensureShape() {
    if (!localDb.virtual_market) {
      localDb.virtual_market = {
        config: { ...DEFAULT_CONFIG },
        status: STATUS.NORMAL,
        previousRate: DEFAULT_CONFIG.currentRate,
        lastUpdateAt: nowMs(),
        pausedUntil: 0,
        history: [],
        chat: [],
        audit: [],
        purchases: [],
        earnings: [],
      };
    }
    if (!localDb.virtual_market.history) localDb.virtual_market.history = [];
    if (!localDb.virtual_market.chat) localDb.virtual_market.chat = [];
    if (!localDb.virtual_market.audit) localDb.virtual_market.audit = [];
    if (!localDb.virtual_market.purchases) localDb.virtual_market.purchases = [];
    if (!localDb.virtual_market.earnings) localDb.virtual_market.earnings = [];
  }

  function persist() {
    ensureShape();
    localDb.virtual_market.config = { ...cfg };
    localDb.virtual_market.status = status;
    localDb.virtual_market.previousRate = previousRate;
    localDb.virtual_market.lastUpdateAt = lastUpdateAt;
    localDb.virtual_market.pausedUntil = pausedUntil;
    localDb.virtual_market.history = history.slice(-5000);
    localDb.virtual_market.chat = chat.slice(-80);
    saveLocalDb?.();
  }

  function auditLog(action, meta = {}) {
    ensureShape();
    const row = {
      id: crypto.randomBytes(6).toString('hex'),
      action,
      meta,
      at: nowMs(),
    };
    localDb.virtual_market.audit.unshift(row);
    if (localDb.virtual_market.audit.length > 500) {
      localDb.virtual_market.audit.length = 500;
    }
    try { audit?.(action, meta); } catch { /* */ }
    return row;
  }

  async function persistSnapshot(snap) {
    if (!supabase) return;
    try {
      await supabase.from('mm_market_snapshots').insert({
        id: snap.id,
        rate: snap.rate,
        previous_rate: snap.previousRate,
        change: snap.change,
        change_percent: snap.changePercent,
        status: snap.marketStatus,
        demand_score: snap.demandScore,
        purchase_volume: snap.purchaseVolumeCoins,
        gift_volume: snap.giftVolumeCoins,
        withdrawal_volume: snap.withdrawalCoins,
        active_buyers: snap.activeBuyers,
        active_gifters: snap.activeGifters,
        active_creators: snap.activeCreators,
        created_at: new Date(snap.timestamp).toISOString(),
      });
    } catch (e) {
      console.warn('[market] snapshot insert failed:', e.message);
    }
  }

  function publicRate() {
    const change = roundRate(cfg.currentRate - previousRate);
    const changePercent = previousRate
      ? roundRate(((cfg.currentRate - previousRate) / previousRate) * 100)
      : 0;
    return {
      rate: roundRate(cfg.currentRate),
      previousRate: roundRate(previousRate),
      change,
      changePercent,
      timestamp: lastUpdateAt,
      marketStatus: status,
      minRate: cfg.minRate,
      maxRate: cfg.maxRate,
      disclaimer: cfg.disclaimer,
      label: 'Platform Virtual Economy Rate',
      updatedAgoMs: Math.max(0, nowMs() - lastUpdateAt),
    };
  }

  function nutsToInr(nuts, rate = cfg.currentRate) {
    const n = Number(nuts) || 0;
    // Internal: 10_000 Nuts ≈ $1 accounting unit → INR via platform rate
    const usd = n / 10000;
    return roundRate(usd * Number(rate));
  }

  function inrToNutsApprox(inr, rate = cfg.currentRate) {
    const r = Number(rate) || cfg.baseRate;
    const usd = (Number(inr) || 0) / r;
    return Math.round(usd * 10000);
  }

  /**
   * Record activity that feeds the demand index.
   * Suspicious events MUST set { suspicious: true } so they are ignored.
   */
  function recordActivity(kind, payload = {}) {
    if (payload.suspicious) {
      window.suspiciousSkipped += 1;
      return { ok: true, counted: false };
    }
    const coins = Math.max(0, Number(payload.coins) || 0);
    const inr = Math.max(0, Number(payload.inr) || 0);
    const actor = String(payload.actorKey || payload.username || payload.userId || '').slice(0, 80);
    const creator = String(payload.creatorKey || payload.creatorId || '').slice(0, 80);

    switch (kind) {
      case 'purchase':
        window.purchaseVolumeCoins += coins;
        window.purchaseVolumeInr += inr || nutsToInr(coins);
        window.purchaseCount += 1;
        if (actor) window.activeBuyers.add(actor);
        break;
      case 'gift':
        window.giftVolumeCoins += coins;
        window.giftCount += 1;
        if (actor) window.activeGifters.add(actor);
        if (creator) window.activeCreators.add(creator);
        window.platformRevenueCoins += Math.max(0, Number(payload.platformShareCoins) || 0);
        break;
      case 'withdrawal':
        window.withdrawalCoins += coins;
        window.withdrawalCount += 1;
        if (creator) window.activeCreators.add(creator);
        break;
      case 'unused':
        window.unusedCoinEstimate = Math.max(0, Number(payload.unusedCoins) || window.unusedCoinEstimate);
        break;
      default:
        break;
    }
    return { ok: true, counted: true };
  }

  /**
   * Immutable purchase ledger row (rate frozen at purchase time).
   */
  function recordPurchase(row) {
    ensureShape();
    const rate = roundRate(cfg.currentRate);
    const entry = {
      id: row.id || crypto.randomBytes(8).toString('hex'),
      userId: row.userId || null,
      audioUsername: row.audioUsername || null,
      packageId: row.packageId || null,
      coins: Number(row.coins) || 0,
      currency: row.currency || 'INR',
      amountPaid: Number(row.amountPaid) || 0,
      marketRate: rate,
      provider: row.provider || 'unknown',
      providerTxId: row.providerTxId || null,
      status: row.status || 'completed',
      at: nowMs(),
    };
    localDb.virtual_market.purchases.unshift(entry);
    if (localDb.virtual_market.purchases.length > 2000) {
      localDb.virtual_market.purchases.length = 2000;
    }
    recordActivity('purchase', {
      coins: entry.coins,
      inr: entry.currency === 'INR' ? entry.amountPaid : nutsToInr(entry.coins, rate),
      actorKey: entry.audioUsername || entry.userId,
      suspicious: !!row.suspicious,
    });
    saveLocalDb?.();
    return entry;
  }

  /**
   * Immutable creator earnings row for a gift (rate frozen).
   */
  function recordGiftEarnings(row) {
    ensureShape();
    const rate = roundRate(Number(row.marketRate) || cfg.currentRate);
    const giftCoins = Number(row.giftCoins) || 0;
    const creatorShare = Number(row.creatorSharePct != null ? row.creatorSharePct : cfg.creatorPayoutPct);
    const creatorCoins = Number(row.creatorCoins != null
      ? row.creatorCoins
      : Math.floor(giftCoins * creatorShare));
    const platformCoins = Math.max(0, giftCoins - creatorCoins);

    // Soft anti-manipulation: self-gift / loop heuristics
    let suspicious = !!row.suspicious;
    const sender = String(row.senderKey || '');
    const creator = String(row.creatorId || '');
    if (sender && creator && (
      sender === creator
      || sender.includes(creator)
      || creator.includes(sender.replace(/^audio:/, ''))
    )) {
      suspicious = true;
    }
    // Rapid identical gifts from same sender→creator in window
    const recentSame = (localDb.virtual_market.earnings || [])
      .filter((e) => e.senderKey === sender && e.creatorId === creator && (nowMs() - e.at) < 60_000)
      .length;
    if (recentSame >= 12) suspicious = true;

    const entry = {
      id: row.id || crypto.randomBytes(8).toString('hex'),
      giftId: row.giftId || null,
      giftName: row.giftName || null,
      liveId: row.liveId || null,
      senderKey: row.senderKey || null,
      creatorId: row.creatorId || null,
      giftCoins,
      creatorSharePct: creatorShare,
      platformSharePct: 1 - creatorShare,
      creatorCoins,
      platformCoins,
      marketRate: rate,
      creatorInr: nutsToInr(creatorCoins, rate),
      platformInr: nutsToInr(platformCoins, rate),
      suspicious,
      at: nowMs(),
    };
    localDb.virtual_market.earnings.unshift(entry);
    if (localDb.virtual_market.earnings.length > 3000) {
      localDb.virtual_market.earnings.length = 3000;
    }
    recordActivity('gift', {
      coins: giftCoins,
      actorKey: entry.senderKey,
      creatorKey: entry.creatorId,
      platformShareCoins: platformCoins,
      suspicious,
    });
    saveLocalDb?.();
    return entry;
  }

  function demandScoreFrom(metrics) {
    const w = cfg.weights || DEFAULT_CONFIG.weights;
    // Normalize loosely against expected per-tick scales
    const purchase = (metrics.purchaseVolumeCoins / 5000) * w.purchaseVolume
      + (metrics.purchaseCount / 20) * w.purchaseVelocity
      + (metrics.activeBuyers.size / 30) * w.activeBuyers;
    const gifting = (metrics.giftVolumeCoins / 8000) * w.giftVolume
      + (metrics.giftCount / 40) * w.giftVelocity
      + (metrics.activeGifters.size / 40) * w.activeGifters
      + (metrics.activeCreators.size / 20) * w.activeCreators;
    const revenue = (metrics.platformRevenueCoins / 3000) * w.platformRevenue;
    const withdrawal = (metrics.withdrawalCoins / 4000) * w.withdrawalPressure;
    const unused = (metrics.unusedCoinEstimate / 200000) * w.unusedCoinPressure;

    const numerator = purchase + gifting + revenue + 0.15;
    const denominator = 1 + withdrawal + unused;
    return numerator / denominator;
  }

  function proposeRate(score) {
    // score ~1 => base; >1 pushes up; <1 pushes down
    const delta = (score - 1) * cfg.sensitivity * 2; // ₹
    return cfg.baseRate + delta;
  }

  function applyMovementLimits(from, proposed) {
    const absCap = Number(cfg.maxMovePerUpdate) || 0.25;
    const pctCap = ((Number(cfg.maxMovePercent) || 0.35) / 100) * from;
    const maxStep = Math.max(0.01, Math.min(absCap, pctCap || absCap));
    const stepped = clamp(proposed, from - maxStep, from + maxStep);
    const smoothed = from * (1 - cfg.smoothingAlpha) + stepped * cfg.smoothingAlpha;
    return clamp(roundRate(smoothed), cfg.minRate, cfg.maxRate);
  }

  function detectStatus(score, changeAbs) {
    if (status === STATUS.MAINTENANCE) return STATUS.MAINTENANCE;
    if (status === STATUS.PAUSED || (pausedUntil && nowMs() < pausedUntil)) return STATUS.PAUSED;
    if (changeAbs >= (cfg.maxMovePerUpdate || 0.25) * 0.9) return STATUS.VOLATILE;
    if (score >= 1.45) return STATUS.HIGH_DEMAND;
    if (score <= 0.65) return STATUS.LOW_DEMAND;
    return STATUS.NORMAL;
  }

  function maybeCircuitBreak(metrics, score) {
    if (!cfg.circuitBreaker?.enabled) return false;
    const spike = cfg.circuitBreaker.spikeMultiplier || 8;
    const giftSpike = metrics.giftCount > 80 * spike / 8;
    const buySpike = metrics.purchaseCount > 40 * spike / 8;
    const scoreSpike = score > 3.5 || score < 0.15;
    if (giftSpike || buySpike || scoreSpike) {
      status = STATUS.PAUSED;
      pausedUntil = nowMs() + (cfg.circuitBreaker.pauseMs || 300000);
      auditLog('market_circuit_break', {
        giftCount: metrics.giftCount,
        purchaseCount: metrics.purchaseCount,
        score,
        pausedUntil,
      });
      return true;
    }
    return false;
  }

  function snapshotVolumes(metrics) {
    return {
      purchaseVolumeCoins: metrics.purchaseVolumeCoins,
      purchaseVolumeInr: roundRate(metrics.purchaseVolumeInr),
      giftVolumeCoins: metrics.giftVolumeCoins,
      withdrawalCoins: metrics.withdrawalCoins,
      activeBuyers: metrics.activeBuyers.size,
      activeGifters: metrics.activeGifters.size,
      activeCreators: metrics.activeCreators.size,
      platformRevenueCoins: metrics.platformRevenueCoins,
      suspiciousSkipped: metrics.suspiciousSkipped,
    };
  }

  async function tick() {
    if (status === STATUS.MAINTENANCE) {
      broadcast();
      return publicRate();
    }
    if (pausedUntil && nowMs() >= pausedUntil && status === STATUS.PAUSED) {
      status = STATUS.NORMAL;
      pausedUntil = 0;
      auditLog('market_auto_resume', {});
    }

    const metrics = window;
    const score = demandScoreFrom(metrics);
    maybeCircuitBreak(metrics, score);

    const prev = cfg.currentRate;
    let next = prev;
    if (status !== STATUS.PAUSED && status !== STATUS.MAINTENANCE) {
      const proposed = proposeRate(score);
      next = applyMovementLimits(prev, proposed);
      emaRate = next;
    }

    previousRate = prev;
    cfg.currentRate = next;
    lastUpdateAt = nowMs();
    const change = roundRate(next - prev);
    status = detectStatus(score, Math.abs(change));

    const snap = {
      id: crypto.randomBytes(8).toString('hex'),
      rate: next,
      previousRate: prev,
      change,
      changePercent: prev ? roundRate((change / prev) * 100) : 0,
      timestamp: lastUpdateAt,
      marketStatus: status,
      demandScore: roundRate(score),
      ...snapshotVolumes(metrics),
    };
    history.push(snap);
    if (history.length > 5000) history.splice(0, history.length - 5000);
    recentTicks.push(score);
    if (recentTicks.length > 40) recentTicks.shift();

    // reset window
    window = emptyMetrics();
    persist();
    void persistSnapshot(snap);
    broadcast(snap);
    return snap;
  }

  function broadcast(extra = null) {
    const payload = { ...publicRate(), ...(extra || {}) };
    try {
      io.to(MARKET_ROOM).emit('market:rate:update', payload);
      io.emit('market:rate:update', payload); // keep simple for dashboards already connected
      io.to(MARKET_ROOM).emit('market:status:update', {
        marketStatus: status,
        timestamp: lastUpdateAt,
      });
      io.to(MARKET_ROOM).emit('market:volume:update', {
        ...(extra ? snapshotVolumes({
          purchaseVolumeCoins: extra.purchaseVolumeCoins || 0,
          purchaseVolumeInr: extra.purchaseVolumeInr || 0,
          giftVolumeCoins: extra.giftVolumeCoins || 0,
          giftCount: 0,
          activeBuyers: { size: extra.activeBuyers || 0 },
          activeGifters: { size: extra.activeGifters || 0 },
          activeCreators: { size: extra.activeCreators || 0 },
          withdrawalCoins: extra.withdrawalCoins || 0,
          platformRevenueCoins: extra.platformRevenueCoins || 0,
          suspiciousSkipped: extra.suspiciousSkipped || 0,
        }) : snapshotVolumes(window)),
        timestamp: lastUpdateAt,
      });
      emitToAdmins?.('market:rate:update', payload);
    } catch (e) {
      console.warn('[market] broadcast failed:', e.message);
    }
  }

  function historyForRange(range = '1D') {
    const ms = {
      '1H': 3600_000,
      '6H': 6 * 3600_000,
      '1D': 24 * 3600_000,
      '7D': 7 * 24 * 3600_000,
      '30D': 30 * 24 * 3600_000,
      '90D': 90 * 24 * 3600_000,
    }[range] || 24 * 3600_000;
    const since = nowMs() - ms;
    return history.filter((h) => h.timestamp >= since).map((h) => ({
      t: h.timestamp,
      rate: h.rate,
      change: h.change,
      status: h.marketStatus,
      purchaseVolume: h.purchaseVolumeCoins,
      giftVolume: h.giftVolumeCoins,
      withdrawalVolume: h.withdrawalCoins,
    }));
  }

  function insights() {
    const last = history.slice(-12);
    const lines = [];
    if (!last.length) {
      return ['Market rate is within the normal operating range.'];
    }
    const avgGift = last.reduce((s, h) => s + (h.giftVolumeCoins || 0), 0) / last.length;
    const lastGift = last[last.length - 1]?.giftVolumeCoins || 0;
    const avgBuy = last.reduce((s, h) => s + (h.purchaseVolumeCoins || 0), 0) / last.length;
    const lastBuy = last[last.length - 1]?.purchaseVolumeCoins || 0;
    const avgWd = last.reduce((s, h) => s + (h.withdrawalCoins || 0), 0) / last.length;
    const lastWd = last[last.length - 1]?.withdrawalCoins || 0;

    if (lastGift > avgGift * 1.25) lines.push('Gift activity increased over the last hour.');
    if (lastBuy > avgBuy * 1.25) lines.push('Coin purchases are currently above the recent average.');
    if (lastWd > avgWd * 1.25) lines.push('Creator withdrawals are currently elevated.');
    if (status === STATUS.NORMAL) lines.push('Market rate is within the normal operating range.');
    if (status === STATUS.HIGH_DEMAND) lines.push('Demand is elevated — rate adjustments are more active.');
    if (status === STATUS.LOW_DEMAND) lines.push('Demand is softer than usual.');
    if (status === STATUS.PAUSED) lines.push('Market temporarily stabilized for protection.');
    if (status === STATUS.VOLATILE) lines.push('Rate movement is more active than usual.');
    return lines.slice(0, 4);
  }

  function dashboardPayload(range = '1D') {
    const rate = publicRate();
    const series = historyForRange(range);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();
    const todayEarn = (localDb.virtual_market?.earnings || []).filter((e) => e.at >= todayMs);
    const todayPurch = (localDb.virtual_market?.purchases || []).filter((e) => e.at >= todayMs);
    const giftVol = todayEarn.reduce((s, e) => s + (e.giftCoins || 0), 0);
    const buyVol = todayPurch.reduce((s, e) => s + (e.coins || 0), 0);
    const creatorInr = todayEarn.reduce((s, e) => s + (e.creatorInr || 0), 0);
    const topGifters = {};
    for (const e of todayEarn) {
      const k = e.senderKey || 'unknown';
      topGifters[k] = (topGifters[k] || 0) + (e.giftCoins || 0);
    }
    const top = Object.entries(topGifters)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([username, coins]) => ({ username, coins, inr: nutsToInr(coins) }));

    return {
      ok: true,
      rate,
      range,
      series,
      volumes: {
        giftVolumeCoins: giftVol,
        purchaseVolumeCoins: buyVol,
        creatorEarningsInr: roundRate(creatorInr),
        withdrawableHintInr: roundRate(creatorInr),
      },
      topGifters: top,
      recentGifts: todayEarn.slice(0, 12),
      insights: insights(),
      chat: chat.slice(-40),
      disclaimer: cfg.disclaimer,
    };
  }

  // ---- REST ---------------------------------------------------------------
  app.get('/api/market/rate', (_req, res) => {
    res.json({ ok: true, ...publicRate() });
  });

  app.get('/api/market/dashboard', (req, res) => {
    const range = String(req.query?.range || '1D');
    res.json(dashboardPayload(range));
  });

  app.get('/api/market/history', (req, res) => {
    const range = String(req.query?.range || '1D');
    res.json({ ok: true, range, points: historyForRange(range) });
  });

  app.get('/api/market/chat', (_req, res) => {
    res.json({ ok: true, messages: chat.slice(-40), disclaimer: cfg.disclaimer });
  });

  app.post('/api/market/chat', (req, res) => {
    const username = String(sanitize?.(req.body?.username) || req.body?.username || 'Guest').slice(0, 24);
    let text = String(sanitize?.(req.body?.text) || req.body?.text || '').trim().slice(0, 160);
    if (!text) return res.status(400).json({ ok: false, error: 'Empty message' });
    // light spam / banned words
    const banned = /\b(guaranteed profit|buy now|sell now|get rich|investment tip)\b/i;
    if (banned.test(text)) {
      return res.status(400).json({ ok: false, error: 'That message is not allowed in market chat' });
    }
    const msg = {
      id: crypto.randomBytes(5).toString('hex'),
      username,
      text,
      at: nowMs(),
    };
    chat.push(msg);
    if (chat.length > 80) chat.splice(0, chat.length - 80);
    persist();
    io.to(MARKET_ROOM).emit('market:chat', msg);
    res.json({ ok: true, message: msg });
  });

  app.get('/api/admin/market', (req, res) => {
    if (!isAdminRequest?.(req)) return res.status(401).json({ error: 'Unauthorized' });
    res.json({
      ok: true,
      ...dashboardPayload(String(req.query?.range || '1D')),
      config: { ...cfg, weights: { ...cfg.weights } },
      audit: (localDb.virtual_market?.audit || []).slice(0, 40),
    });
  });

  app.post('/api/admin/market/config', (req, res) => {
    if (!isAdminRequest?.(req)) return res.status(401).json({ error: 'Unauthorized' });
    const b = req.body || {};
    const before = { ...cfg };
    if (b.minRate != null) cfg.minRate = Number(b.minRate);
    if (b.maxRate != null) cfg.maxRate = Number(b.maxRate);
    if (cfg.minRate > cfg.maxRate) {
      return res.status(400).json({ ok: false, error: 'minRate must be ≤ maxRate' });
    }
    if (b.baseRate != null) cfg.baseRate = clamp(Number(b.baseRate), cfg.minRate, cfg.maxRate);
    if (b.sensitivity != null) cfg.sensitivity = clamp(Number(b.sensitivity), 0.05, 2);
    if (b.updateIntervalMs != null) cfg.updateIntervalMs = clamp(Number(b.updateIntervalMs), 5000, 300000);
    if (b.maxMovePerUpdate != null) cfg.maxMovePerUpdate = clamp(Number(b.maxMovePerUpdate), 0.01, 2);
    if (b.maxMovePercent != null) cfg.maxMovePercent = clamp(Number(b.maxMovePercent), 0.05, 5);
    if (b.smoothingAlpha != null) cfg.smoothingAlpha = clamp(Number(b.smoothingAlpha), 0.05, 0.9);
    if (b.creatorPayoutPct != null) {
      cfg.creatorPayoutPct = clamp(Number(b.creatorPayoutPct), 0.1, 0.95);
      cfg.platformFeePct = roundRate(1 - cfg.creatorPayoutPct);
    }
    if (b.weights && typeof b.weights === 'object') {
      cfg.weights = { ...cfg.weights, ...b.weights };
    }
    if (b.resetToBase) {
      previousRate = cfg.currentRate;
      cfg.currentRate = clamp(cfg.baseRate, cfg.minRate, cfg.maxRate);
    }
    if (typeof b.setRate === 'number') {
      previousRate = cfg.currentRate;
      cfg.currentRate = clamp(Number(b.setRate), cfg.minRate, cfg.maxRate);
    }
    cfg.currentRate = clamp(cfg.currentRate, cfg.minRate, cfg.maxRate);
    auditLog('market_config_update', { before, after: { ...cfg }, by: 'admin' });
    persist();
    restartTimer();
    broadcast();
    res.json({ ok: true, config: cfg, rate: publicRate() });
  });

  app.post('/api/admin/market/status', (req, res) => {
    if (!isAdminRequest?.(req)) return res.status(401).json({ error: 'Unauthorized' });
    const next = String(req.body?.status || '').toUpperCase();
    if (!STATUS[next]) return res.status(400).json({ ok: false, error: 'Invalid status' });
    status = next;
    if (next === STATUS.PAUSED || next === STATUS.MAINTENANCE) {
      pausedUntil = nowMs() + (Number(req.body?.pauseMs) || 15 * 60_000);
    } else {
      pausedUntil = 0;
    }
    auditLog('market_status', { status, pausedUntil });
    persist();
    broadcast();
    res.json({ ok: true, ...publicRate() });
  });

  // Agency read-only + limited config mirror
  app.get('/api/agency/market', (req, res) => {
    // Agency key check is soft here — agency.js may wrap; allow admin too
    const key = req.headers['x-agency-key'] || req.headers['x-admin-key'];
    const adminOk = isAdminRequest?.(req);
    const agencyOk = key && (
      key === process.env.AGENCY_ADMIN_KEY || key === process.env.ADMIN_KEY
    );
    if (!adminOk && !agencyOk) return res.status(401).json({ error: 'Unauthorized' });
    res.json(dashboardPayload(String(req.query?.range || '1D')));
  });

  // ---- sockets ------------------------------------------------------------
  function attachSocketHandlers(socket) {
    socket.on('market:subscribe', () => {
      try { socket.join(MARKET_ROOM); } catch { /* */ }
      socket.emit('market:rate:update', publicRate());
    });
    socket.on('market:unsubscribe', () => {
      try { socket.leave(MARKET_ROOM); } catch { /* */ }
    });
  }

  let timer = null;
  function restartTimer() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => { void tick(); }, cfg.updateIntervalMs || 15_000);
    if (timer.unref) timer.unref();
  }
  restartTimer();

  // Seed one history point so charts are never empty on first boot
  if (!history.length) {
    history.push({
      id: 'seed',
      rate: cfg.currentRate,
      previousRate: cfg.currentRate,
      change: 0,
      changePercent: 0,
      timestamp: nowMs(),
      marketStatus: status,
      demandScore: 1,
      purchaseVolumeCoins: 0,
      giftVolumeCoins: 0,
      withdrawalCoins: 0,
      activeBuyers: 0,
      activeGifters: 0,
      activeCreators: 0,
    });
    persist();
  }

  return {
    getRate: () => roundRate(cfg.currentRate),
    publicRate,
    nutsToInr,
    inrToNutsApprox,
    recordActivity,
    recordPurchase,
    recordGiftEarnings,
    recordWithdrawal: (row) => recordActivity('withdrawal', {
      coins: row?.coins,
      creatorKey: row?.creatorId,
      suspicious: row?.suspicious,
    }),
    dashboardPayload,
    attachSocketHandlers,
    getConfig: () => ({ ...cfg }),
    STATUS,
    tick,
  };
}

module.exports = {
  registerMarketEngine,
  DEFAULT_CONFIG,
  STATUS,
  MARKET_ROOM,
};
