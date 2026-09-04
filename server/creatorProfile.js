/**
 * Creator public profile: the 6-digit ID, the searchable directory, the score
 * and rank, and the gifts-received board.
 *
 * Everything here is READ-mostly and public. Nothing in this module exposes an
 * email, a payout detail, an IP or a KYC document — those live behind creator
 * auth elsewhere, and a public profile endpoint is exactly where such things
 * leak if you are not deliberate about it.
 */
const crypto = require('crypto');
const { scoreCreator, scoreTier } = require('./creatorScore');

/** Platform-wide creator share for gifts; env-tunable, transparency baseline. */
function creatorSharePct() {
  const raw = Number(process.env.LIVE_GIFT_CREATOR_SHARE);
  if (Number.isFinite(raw) && raw > 0 && raw <= 1) return raw;
  return 0.7;
}

function giftCutBreakdown(grossNuts) {
  const share = creatorSharePct();
  const gross = Math.max(0, Math.floor(Number(grossNuts) || 0));
  const creatorNuts = Math.floor(gross * share);
  return {
    creatorSharePct: share,
    platformCutPct: Math.round((1 - share) * 10000) / 10000,
    grossNuts: gross,
    creatorNuts,
    platformNuts: gross - creatorNuts,
  };
}

const CODE_MIN = 100000;
const CODE_MAX = 999999;
const SCORE_TTL_MS = 10 * 60 * 1000;   // recompute at most this often
const SEARCH_LIMIT = 20;

function registerCreatorProfile(app, io, deps) {
  const {
    supabase,
    localDb,
    saveLocalDb,
    sanitize,
    getCreatorForRequest,
    liveStreams,
    audit,
  } = deps;

  const scoreCache = new Map();   // creatorId -> { at, score, parts, metrics }

  const creatorsLocal = () => (localDb.creators || []);

  function publicCreator(c, extra = {}) {
    if (!c) return null;
    const share = creatorSharePct();
    return {
      id: c.id,
      code: c.creator_code || null,
      handle: c.handle_name,
      displayName: c.display_name || c.handle_name,
      avatarUrl: c.avatar_url || null,
      bio: c.bio || '',
      country: c.country || null,
      languages: c.languages || [],
      interests: c.interests || [],
      verified: !!(c.verified || c.status === 'approved'),
      // Public-facing links, surfaced only when the column exists on the row.
      profileLink: c.profile_link || c.social_link || null,
      profile_link: c.profile_link || c.social_link || null,
      socialLink: c.social_link || c.profile_link || null,
      platform: c.platform || null,
      followers: c.followers_count || 0,
      totalLives: c.total_lives || 0,
      liveMinutes: c.live_minutes || 0,
      giftsReceived: c.gifts_received || 0,
      featured: !!c.featured,
      joinedAt: c.created_at || null,
      giftCut: {
        creatorSharePct: share,
        platformCutPct: Math.round((1 - share) * 10000) / 10000,
      },
      ...extra,
    };
  }

  // -------------------------------------------------------------------------
  // 6-digit public ID
  //
  // Random, not sequential: a sequential id would tell every visitor exactly
  // how many creators exist and how fast the platform is growing.
  // -------------------------------------------------------------------------
  function randomCode() {
    return String(CODE_MIN + (crypto.randomInt(CODE_MAX - CODE_MIN + 1)));
  }

  async function codeTaken(code) {
    if (supabase) {
      const { data } = await supabase.from('creators').select('id').eq('creator_code', code).maybeSingle();
      if (data) return true;
    }
    return creatorsLocal().some((c) => c.creator_code === code);
  }

  /** Allocated lazily, so existing creators get one the first time they matter. */
  async function ensureCode(creator) {
    if (!creator) return null;
    if (creator.creator_code) return creator.creator_code;
    for (let i = 0; i < 12; i += 1) {
      const code = randomCode();
      // eslint-disable-next-line no-await-in-loop
      if (await codeTaken(code)) continue;
      creator.creator_code = code;
      if (supabase) {
        // eslint-disable-next-line no-await-in-loop
        const { error } = await supabase.from('creators').update({ creator_code: code }).eq('id', creator.id);
        if (error) { creator.creator_code = null; continue; }   // lost a race — retry
      }
      const row = creatorsLocal().find((c) => c.id === creator.id);
      if (row) row.creator_code = code;
      saveLocalDb?.();
      audit?.('creator_code_assigned', { creatorId: creator.id, code });
      return code;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // Metrics feeding the score
  // -------------------------------------------------------------------------
  async function metricsFor(creator) {
    const out = {
      coinsReceived: creator.coins_earned || 0,
      avgPeakViewers: 0,
      activeDays30: 0,
      followers: creator.followers_count || 0,
      totalLives: creator.total_lives || 0,
      liveMinutes: creator.live_minutes || 0,
    };

    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    if (supabase) {
      try {
        const { data } = await supabase
          .from('mm_live_streams')
          .select('peak_viewers, started_at, ended_at, nuts_earned')
          .eq('creator_id', creator.id)
          .order('started_at', { ascending: false })
          .limit(400);
        const rows = data || [];
        out.totalLives = rows.length || out.totalLives;
        const peaks = rows.map((r) => r.peak_viewers || 0).filter((n) => n > 0);
        out.avgPeakViewers = peaks.length
          ? Math.round(peaks.reduce((a, b) => a + b, 0) / peaks.length)
          : 0;
        const days = new Set(
          rows.filter((r) => r.started_at >= since)
            .map((r) => String(r.started_at).slice(0, 10)),
        );
        out.activeDays30 = days.size;
        out.liveMinutes = Math.round(rows.reduce((sum, r) => {
          if (!r.started_at || !r.ended_at) return sum;
          return sum + (new Date(r.ended_at) - new Date(r.started_at)) / 60000;
        }, 0));
      } catch { /* fall back to the stored columns */ }
    } else {
      const rows = (localDb.live_streams || []).filter((r) => r.creator_id === creator.id);
      out.totalLives = rows.length || out.totalLives;
      const peaks = rows.map((r) => r.peak_viewers || 0).filter((n) => n > 0);
      out.avgPeakViewers = peaks.length ? Math.round(peaks.reduce((a, b) => a + b, 0) / peaks.length) : 0;
      out.activeDays30 = new Set(
        rows.filter((r) => (r.started_at || 0) > Date.now() - 30 * 24 * 3600 * 1000)
          .map((r) => new Date(r.started_at).toISOString().slice(0, 10)),
      ).size;
    }
    return out;
  }

  async function scoreFor(creator) {
    const hit = scoreCache.get(creator.id);
    if (hit && Date.now() - hit.at < SCORE_TTL_MS) return hit;
    const metrics = await metricsFor(creator);
    const { score, parts, maturity } = scoreCreator(metrics);
    const entry = { at: Date.now(), score, parts, maturity, metrics };
    scoreCache.set(creator.id, entry);

    // Persist so ranking can be a plain indexed query rather than a full scan.
    if (supabase) {
      supabase.from('creators').update({
        score,
        score_at: new Date().toISOString(),
        total_lives: metrics.totalLives,
        live_minutes: metrics.liveMinutes,
      }).eq('id', creator.id).then(() => {}, () => {});
    }
    const row = creatorsLocal().find((c) => c.id === creator.id);
    if (row) {
      row.score = score;
      row.total_lives = metrics.totalLives;
      row.live_minutes = metrics.liveMinutes;
      saveLocalDb?.();
    }
    return entry;
  }

  /** 1-based position among approved creators, plus the size of the field. */
  async function rankFor(creator, score) {
    if (supabase) {
      try {
        const [{ count: ahead }, { count: total }] = await Promise.all([
          supabase.from('creators').select('id', { count: 'exact', head: true })
            .eq('status', 'approved').gt('score', score),
          supabase.from('creators').select('id', { count: 'exact', head: true })
            .eq('status', 'approved'),
        ]);
        return { rank: (ahead || 0) + 1, of: total || 1 };
      } catch { /* fall through */ }
    }
    const approved = creatorsLocal().filter((c) => c.status === 'approved');
    const ahead = approved.filter((c) => (c.score || 0) > score).length;
    return { rank: ahead + 1, of: approved.length || 1 };
  }

  // -------------------------------------------------------------------------
  // Gifts received — who sent what. Names come from the ledger, which is the
  // only place that records a sender, so the board cannot be faked client-side.
  // -------------------------------------------------------------------------
  async function giftsFor(creatorId) {
    let rows = [];
    if (supabase) {
      try {
        const { data } = await supabase
          .from('mm_live_gift_tx')
          .select('sender_name, gift_id, gift_name, coin_cost, created_at')
          .eq('receiver_creator_id', creatorId)
          .order('created_at', { ascending: false })
          .limit(500);
        rows = data || [];
      } catch { rows = []; }
    } else {
      rows = (localDb.live_gift_tx || [])
        .filter((t) => t.receiverCreatorId === creatorId)
        .sort((a, b) => b.at - a.at)
        .slice(0, 500)
        .map((t) => ({
          sender_name: t.senderName, gift_id: t.giftId, gift_name: t.giftName,
          coin_cost: t.coinCost, created_at: new Date(t.at).toISOString(),
        }));
    }

    const bySender = new Map();
    const byGift = new Map();
    let totalCoins = 0;
    for (const r of rows) {
      totalCoins += r.coin_cost || 0;
      const s = bySender.get(r.sender_name) || { username: r.sender_name, coins: 0, count: 0 };
      s.coins += r.coin_cost || 0;
      s.count += 1;
      bySender.set(r.sender_name, s);
      const g = byGift.get(r.gift_id) || { id: r.gift_id, name: r.gift_name, count: 0 };
      g.count += 1;
      byGift.set(r.gift_id, g);
    }

    return {
      totalCoins,
      totalGifts: rows.length,
      topSenders: [...bySender.values()].sort((a, b) => b.coins - a.coins).slice(0, 10),
      topGifts: [...byGift.values()].sort((a, b) => b.count - a.count).slice(0, 8),
      recent: rows.slice(0, 12).map((r) => ({
        username: r.sender_name,
        giftId: r.gift_id,
        giftName: r.gift_name,
        coins: r.coin_cost,
        at: r.created_at,
      })),
      // Gift-cut transparency: how the gross Nuts split creator vs platform.
      ...giftCutBreakdown(totalCoins),
      cut: giftCutBreakdown(totalCoins),
    };
  }

  // -------------------------------------------------------------------------
  // Lookup
  // -------------------------------------------------------------------------
  async function findCreator(key) {
    const raw = String(key || '').trim().replace(/^@/, '');
    if (!raw) return null;
    const isCode = /^\d{6}$/.test(raw);

    if (supabase) {
      const query = supabase.from('creators').select('*');
      const { data } = isCode
        ? await query.eq('creator_code', raw).maybeSingle()
        : await query.ilike('handle_name', raw).maybeSingle();
      if (data) return data;
      if (!isCode) {
        const { data: byId } = await supabase.from('creators').select('*').eq('id', raw).maybeSingle();
        if (byId) return byId;
      }
      return null;
    }
    return creatorsLocal().find((c) => (
      (isCode && c.creator_code === raw)
      || c.handle_name?.toLowerCase() === raw.toLowerCase()
      || c.id === raw
    )) || null;
  }

  async function assembleProfile(creator, { withGifts = true } = {}) {
    await ensureCode(creator);
    const { score, parts, maturity, metrics } = await scoreFor(creator);
    const { rank, of } = await rankFor(creator, score);
    const gifts = withGifts ? await giftsFor(creator.id) : null;

    let liveNow = null;
    try {
      const active = (await liveStreams?.listActive?.()) || [];
      liveNow = active.find((l) => l.creatorId === creator.id) || null;
    } catch { /* lives module optional */ }

    return publicCreator(creator, {
      score,
      scoreParts: parts,
      scoreMaturity: maturity,
      tier: scoreTier(score),
      rank,
      rankOf: of,
      totalLives: metrics.totalLives,
      liveMinutes: metrics.liveMinutes,
      avgPeakViewers: metrics.avgPeakViewers,
      activeDays30: metrics.activeDays30,
      gifts,
      liveNow: liveNow ? { id: liveNow.id, title: liveNow.title, viewerCount: liveNow.viewerCount } : null,
    });
  }

  // -------------------------------------------------------------------------
  // Routes
  // -------------------------------------------------------------------------

  /** Profile by 6-digit code, handle or id. */
  app.get('/api/creators/profile/:key', async (req, res) => {
    try {
      const creator = await findCreator(req.params.key);
      if (!creator || creator.status !== 'approved') {
        return res.status(404).json({ ok: false, error: 'Creator not found' });
      }
      res.json({ ok: true, creator: await assembleProfile(creator) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Profile failed' });
    }
  });

  /** Directory search: 6-digit code, handle or display name. */
  app.get('/api/creators/search', async (req, res) => {
    try {
      const q = String(req.query?.q || '').trim().replace(/^@/, '').slice(0, 40);
      if (q.length < 2) return res.json({ ok: true, creators: [] });

      // An exact 6-digit code is an ID lookup, not a fuzzy search.
      if (/^\d{6}$/.test(q)) {
        const one = await findCreator(q);
        return res.json({
          ok: true,
          creators: one && one.status === 'approved' ? [publicCreator(one, { score: one.score || 0 })] : [],
        });
      }

      let rows = [];
      if (supabase) {
        const { data } = await supabase.from('creators')
          .select('*')
          .eq('status', 'approved')
          .or(`handle_name.ilike.%${q}%,display_name.ilike.%${q}%`)
          .order('score', { ascending: false })
          .limit(SEARCH_LIMIT);
        rows = data || [];
      } else {
        const needle = q.toLowerCase();
        rows = creatorsLocal()
          .filter((c) => c.status === 'approved'
            && ((c.handle_name || '').toLowerCase().includes(needle)
              || (c.display_name || '').toLowerCase().includes(needle)))
          .sort((a, b) => (b.score || 0) - (a.score || 0))
          .slice(0, SEARCH_LIMIT);
      }
      const active = (await liveStreams?.listActive?.()) || [];
      const liveIds = new Set(active.map((l) => l.creatorId));
      res.json({
        ok: true,
        creators: rows.map((c) => publicCreator(c, {
          score: c.score || 0,
          tier: scoreTier(c.score || 0),
          isLive: liveIds.has(c.id),
        })),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Search failed' });
    }
  });

  /** Leaderboard — the "score among all creators" the profile references. */
  app.get('/api/creators/leaderboard', async (req, res) => {
    try {
      const limit = Math.min(50, Math.max(1, Number(req.query?.limit) || 20));
      let rows = [];
      if (supabase) {
        const { data } = await supabase.from('creators').select('*')
          .eq('status', 'approved').order('score', { ascending: false }).limit(limit);
        rows = data || [];
      } else {
        rows = creatorsLocal().filter((c) => c.status === 'approved')
          .sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, limit);
      }
      res.json({
        ok: true,
        creators: rows.map((c, i) => publicCreator(c, {
          rank: i + 1, score: c.score || 0, tier: scoreTier(c.score || 0),
        })),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Leaderboard failed' });
    }
  });

  /** The signed-in creator edits their own profile fields. */
  app.post('/api/creators/profile', async (req, res) => {
    try {
      const { creator, via } = await getCreatorForRequest(req);
      if (!creator || via !== 'session') {
        return res.status(401).json({ ok: false, error: 'Creator login required' });
      }
      const clean = (v, max) => sanitize ? sanitize(String(v || ''), max) : String(v || '').slice(0, max);
      const listOf = (v, max, itemMax) => (Array.isArray(v) ? v : [])
        .map((x) => clean(x, itemMax).trim())
        .filter(Boolean)
        .slice(0, max);

      const patch = {};
      if (req.body?.displayName != null) patch.display_name = clean(req.body.displayName, 40);
      if (req.body?.bio != null) patch.bio = clean(req.body.bio, 300);
      if (req.body?.country != null) patch.country = clean(req.body.country, 40);
      if (req.body?.languages != null) patch.languages = listOf(req.body.languages, 6, 24);
      if (req.body?.interests != null) patch.interests = listOf(req.body.interests, 10, 24);
      if (!Object.keys(patch).length) return res.status(400).json({ ok: false, error: 'Nothing to update' });

      if (supabase) {
        const { error } = await supabase.from('creators').update(patch).eq('id', creator.id);
        if (error) return res.status(500).json({ ok: false, error: 'Could not save profile' });
      }
      const row = creatorsLocal().find((c) => c.id === creator.id);
      if (row) { Object.assign(row, patch); saveLocalDb?.(); }
      Object.assign(creator, patch);

      res.json({ ok: true, creator: await assembleProfile(creator, { withGifts: false }) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Update failed' });
    }
  });

  /** The creator's own code, allocated on first request. */
  app.get('/api/creators/my-code', async (req, res) => {
    try {
      const { creator, via } = await getCreatorForRequest(req);
      if (!creator || via !== 'session') {
        return res.status(401).json({ ok: false, error: 'Creator login required' });
      }
      res.json({ ok: true, code: await ensureCode(creator) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Could not allocate a code' });
    }
  });

  return { ensureCode, assembleProfile, findCreator, scoreFor, rankFor, giftsFor, publicCreator };
}

module.exports = { registerCreatorProfile };
