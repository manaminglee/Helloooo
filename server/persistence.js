/**
 * Durable storage for trust, reports, ratings, and Pro status (Supabase + local JSON fallback).
 */
const crypto = require('crypto');

function hashIp(ip, salt) {
  return crypto.createHash('sha256').update(String(ip || '') + String(salt || 'mm')).digest('hex').slice(0, 16);
}

function createPersistence({ supabase, localDb, saveLocalDb, adminKey }) {
  const salt = adminKey || 'mm';
  const trustCache = new Map();
  const reputationCache = new Map();

  function ensureLocalShape() {
    if (!localDb.trust_scores) localDb.trust_scores = {};
    if (!localDb.moderation_reports) localDb.moderation_reports = [];
    if (!localDb.conversation_ratings) localDb.conversation_ratings = [];
    if (!localDb.pro_users) localDb.pro_users = {};
    if (!localDb.consumed_payments) localDb.consumed_payments = [];
  }

  // Payment idempotency: consumed session/order ids are kept in memory AND
  // persisted to the local DB so verify endpoints cannot be replayed.
  const consumedPayments = new Set(
    (localDb.consumed_payments || []).map((r) => String(r?.ref || r))
  );

  function hasConsumedPayment(ref) {
    return !!ref && consumedPayments.has(String(ref));
  }

  async function markPaymentConsumed(ref, meta = {}) {
    if (!ref) return;
    const key = String(ref);
    if (consumedPayments.has(key)) return;
    consumedPayments.add(key);
    ensureLocalShape();
    localDb.consumed_payments.push({ ref: key, ...meta, consumed_at: new Date().toISOString() });
    if (localDb.consumed_payments.length > 5000) {
      localDb.consumed_payments = localDb.consumed_payments.slice(-5000);
    }
    saveLocalDb?.();
    if (supabase) {
      await supabase.from('mm_consumed_payments').upsert({
        ref: key,
        provider: meta.provider || null,
        product: meta.product || null,
        package_id: meta.packageId || null,
        username_key: meta.usernameKey || null,
        meta,
        consumed_at: new Date().toISOString(),
      }).catch(() => {});
    }
  }

  async function hydrateConsumedPayments() {
    if (!supabase) return;
    try {
      const { data } = await supabase.from('mm_consumed_payments').select('ref').order('consumed_at', { ascending: false }).limit(5000);
      for (const row of data || []) {
        if (row?.ref) consumedPayments.add(String(row.ref));
      }
    } catch { /* ignore */ }
  }
  void hydrateConsumedPayments();

  async function loadTrust(ip) {
    const h = hashIp(ip, salt);
    if (trustCache.has(h)) return trustCache.get(h);
    ensureLocalShape();
    let row = null;
    if (supabase) {
      const { data } = await supabase.from('mm_trust_scores').select('*').eq('ip_hash', h).maybeSingle();
      row = data;
    }
    if (!row && localDb.trust_scores[h]) row = localDb.trust_scores[h];
    const trust = {
      score: row?.score ?? 50,
      sessions: row?.sessions ?? 0,
      badges: Array.isArray(row?.badges) ? row.badges : (row?.badges ? JSON.parse(row.badges) : []),
      reports: row?.reports ?? 0,
    };
    trustCache.set(h, trust);
    return trust;
  }

  async function saveTrust(ip, trust) {
    const h = hashIp(ip, salt);
    trustCache.set(h, trust);
    ensureLocalShape();
    localDb.trust_scores[h] = { ...trust, updated_at: Date.now() };
    saveLocalDb?.();
    if (supabase) {
      await supabase.from('mm_trust_scores').upsert({
        ip_hash: h,
        score: trust.score,
        sessions: trust.sessions,
        badges: trust.badges,
        reports: trust.reports,
        updated_at: new Date().toISOString(),
      }).catch(() => {});
    }
  }

  async function saveReport(report) {
    ensureLocalShape();
    localDb.moderation_reports.push(report);
    if (localDb.moderation_reports.length > 2000) {
      localDb.moderation_reports = localDb.moderation_reports.slice(-2000);
    }
    saveLocalDb?.();
    if (supabase) {
      await supabase.from('mm_reports').insert({
        id: report.id,
        reporter_ip: report.reporterIp,
        target_ip: report.targetIp,
        reason: report.reason,
        created_at: new Date(report.timestamp).toISOString(),
      }).catch(() => {});
    }
  }

  async function saveRating({ raterIp, targetIp, rating, roomId }) {
    ensureLocalShape();
    const entry = {
      rater_ip: raterIp,
      target_ip: targetIp || null,
      rating,
      room_id: roomId || null,
      ts: Date.now(),
    };
    localDb.conversation_ratings.push(entry);
    if (localDb.conversation_ratings.length > 5000) {
      localDb.conversation_ratings = localDb.conversation_ratings.slice(-5000);
    }
    saveLocalDb?.();
    if (targetIp) {
      const h = hashIp(targetIp, salt);
      const prev = reputationCache.get(h) || { sum: 0, count: 0 };
      prev.sum += rating;
      prev.count += 1;
      reputationCache.set(h, prev);
    }
    if (supabase) {
      await supabase.from('mm_conversation_ratings').insert({
        rater_ip: raterIp,
        target_ip: targetIp,
        rating,
        room_id: roomId,
        created_at: new Date().toISOString(),
      }).catch(() => {});
    }
  }

  async function getReputationBoost(ip) {
    if (!ip) return 0;
    const h = hashIp(ip, salt);
    if (!reputationCache.has(h)) {
      ensureLocalShape();
      const rows = localDb.conversation_ratings.filter((r) => r.target_ip === ip);
      if (rows.length) {
        const sum = rows.reduce((a, r) => a + Number(r.rating || 0), 0);
        reputationCache.set(h, { sum, count: rows.length });
      } else if (supabase) {
        const { data } = await supabase.from('mm_conversation_ratings').select('rating').eq('target_ip', ip).limit(50);
        if (data?.length) {
          const sum = data.reduce((a, r) => a + Number(r.rating || 0), 0);
          reputationCache.set(h, { sum, count: data.length });
        }
      }
    }
    const rep = reputationCache.get(h);
    if (!rep || !rep.count) return 0;
    const avg = rep.sum / rep.count;
    if (avg >= 4.5) return 8;
    if (avg >= 4) return 5;
    if (avg >= 3.5) return 2;
    if (avg < 2.5) return -4;
    return 0;
  }

  async function getProStatus(ip) {
    ensureLocalShape();
    const local = localDb.pro_users[ip];
    if (local?.is_pro && (!local.pro_until || local.pro_until > Date.now())) {
      return { isPro: true, subscription: 'pro', proUntil: local.pro_until || null };
    }
    if (supabase) {
      const { data } = await supabase.from('mm_pro_users').select('*').eq('ip', ip).maybeSingle();
      if (data?.is_pro && (!data.pro_until || new Date(data.pro_until).getTime() > Date.now())) {
        return { isPro: true, subscription: 'pro', proUntil: data.pro_until };
      }
    }
    return { isPro: false, subscription: null };
  }

  async function activatePro(ip, { code, days = 30 } = {}) {
    const codes = (process.env.PRO_ACCESS_CODES || '').split(',').map((c) => c.trim()).filter(Boolean);
    const stripeUrl = (process.env.STRIPE_PRO_URL || '').trim();
    let ok = false;
    if (code && codes.includes(String(code).trim())) ok = true;
    if (!ok) return { ok: false, error: 'Invalid Pro code' };

    const proUntil = Date.now() + days * 24 * 60 * 60 * 1000;
    ensureLocalShape();
    localDb.pro_users[ip] = { is_pro: true, pro_until: proUntil, updated_at: Date.now() };
    saveLocalDb?.();
    if (supabase) {
      await supabase.from('mm_pro_users').upsert({
        ip,
        is_pro: true,
        pro_until: new Date(proUntil).toISOString(),
        updated_at: new Date().toISOString(),
      }).catch(() => {});
    }
    return { ok: true, proUntil };
  }

  async function grantProSubscription(ip, days = 30) {
    const proUntil = Date.now() + days * 24 * 60 * 60 * 1000;
    ensureLocalShape();
    localDb.pro_users[ip] = { is_pro: true, pro_until: proUntil, updated_at: Date.now(), source: 'payment' };
    saveLocalDb?.();
    if (supabase) {
      await supabase.from('mm_pro_users').upsert({
        ip,
        is_pro: true,
        pro_until: new Date(proUntil).toISOString(),
        updated_at: new Date().toISOString(),
      }).catch(() => {});
    }
    return { ok: true, proUntil };
  }

  return {
    hashIp: (ip) => hashIp(ip, salt),
    loadTrust,
    saveTrust,
    saveReport,
    saveRating,
    getReputationBoost,
    getProStatus,
    activatePro,
    grantProSubscription,
    hasConsumedPayment,
    markPaymentConsumed,
  };
}

module.exports = { createPersistence };
