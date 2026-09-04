/**
 * Social follow graph for Helloooo.
 *
 * Keys are namespaced strings so audio identities and creators share one graph:
 *   `audio:<username-lowercase>`   — an audio/live identity
 *   `creator:<creator-id>`         — a creator row
 *
 * State lives in memory for instant reads and is mirrored to the local JSON db.
 * When Supabase is configured, the `mm_follows` table is the durable source of
 * truth (see supabase_migration_social_v1.sql) and memory is hydrated from it.
 *
 * A follow is a directed edge follower -> target. `isMutual` is true when both
 * directions exist, which the co-live guest flow uses as its gate.
 */

const KEY_RE = /^(audio|creator):.+$/;

function normalizeKey(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (KEY_RE.test(s)) {
    const [kind, ...rest] = s.split(':');
    const value = rest.join(':').trim();
    if (!value) return null;
    return kind === 'creator' ? `creator:${value}` : `audio:${value.toLowerCase()}`;
  }
  return null;
}

function makeKey(kind, value) {
  return normalizeKey(`${kind}:${value}`);
}

function registerSocialFollow(app, deps = {}) {
  const {
    supabase,
    localDb,
    saveLocalDb,
    audioIdentity,
    getCreatorForRequest,
    audit,
  } = deps;

  // followers: targetKey -> Set(followerKey)
  // following: followerKey -> Set(targetKey)
  const followers = new Map();
  const following = new Map();
  let hydrated = false;

  function ensureShape() {
    if (!Array.isArray(localDb.mm_follows)) localDb.mm_follows = [];
  }

  function addEdge(followerKey, targetKey) {
    if (!followers.has(targetKey)) followers.set(targetKey, new Set());
    if (!following.has(followerKey)) following.set(followerKey, new Set());
    followers.get(targetKey).add(followerKey);
    following.get(followerKey).add(targetKey);
  }

  function removeEdge(followerKey, targetKey) {
    followers.get(targetKey)?.delete(followerKey);
    following.get(followerKey)?.delete(targetKey);
  }

  function loadLocal() {
    ensureShape();
    for (const row of localDb.mm_follows) {
      const f = normalizeKey(row.follower_key);
      const t = normalizeKey(row.target_key);
      if (f && t) addEdge(f, t);
    }
  }

  async function hydrate() {
    if (hydrated) return;
    loadLocal();
    if (supabase) {
      try {
        const { data, error } = await supabase.from('mm_follows').select('follower_key, target_key');
        if (error) {
          console.warn('[socialFollow] Supabase load failed:', error.message);
        } else {
          for (const row of data || []) {
            const f = normalizeKey(row.follower_key);
            const t = normalizeKey(row.target_key);
            if (f && t) addEdge(f, t);
          }
        }
      } catch (e) {
        console.warn('[socialFollow] hydrate error:', e.message);
      }
    }
    hydrated = true;
  }
  void hydrate();

  function persistLocal(followerKey, targetKey, remove) {
    ensureShape();
    const idx = localDb.mm_follows.findIndex(
      (r) => normalizeKey(r.follower_key) === followerKey && normalizeKey(r.target_key) === targetKey,
    );
    if (remove) {
      if (idx >= 0) localDb.mm_follows.splice(idx, 1);
    } else if (idx < 0) {
      localDb.mm_follows.push({
        follower_key: followerKey,
        target_key: targetKey,
        created_at: new Date().toISOString(),
      });
    }
    saveLocalDb?.();
  }

  // -------------------------------------------------------------------------
  // Core graph operations
  // -------------------------------------------------------------------------
  async function follow(followerKeyRaw, targetKeyRaw) {
    await hydrate();
    const followerKey = normalizeKey(followerKeyRaw);
    const targetKey = normalizeKey(targetKeyRaw);
    if (!followerKey || !targetKey) return { ok: false, error: 'Invalid follow keys' };
    if (followerKey === targetKey) return { ok: false, error: 'Cannot follow yourself' };

    addEdge(followerKey, targetKey);
    persistLocal(followerKey, targetKey, false);
    if (supabase) {
      try {
        await supabase.from('mm_follows').upsert(
          { follower_key: followerKey, target_key: targetKey },
          { onConflict: 'follower_key,target_key' },
        );
      } catch (e) { console.warn('[socialFollow] upsert failed:', e.message); }
    }
    audit?.('social_follow', { followerKey, targetKey });
    return { ok: true, mutual: isMutual(followerKey, targetKey) };
  }

  async function unfollow(followerKeyRaw, targetKeyRaw) {
    await hydrate();
    const followerKey = normalizeKey(followerKeyRaw);
    const targetKey = normalizeKey(targetKeyRaw);
    if (!followerKey || !targetKey) return { ok: false, error: 'Invalid follow keys' };

    removeEdge(followerKey, targetKey);
    persistLocal(followerKey, targetKey, true);
    if (supabase) {
      try {
        await supabase.from('mm_follows').delete()
          .eq('follower_key', followerKey)
          .eq('target_key', targetKey);
      } catch (e) { console.warn('[socialFollow] delete failed:', e.message); }
    }
    audit?.('social_unfollow', { followerKey, targetKey });
    return { ok: true };
  }

  function isFollowing(followerKeyRaw, targetKeyRaw) {
    const followerKey = normalizeKey(followerKeyRaw);
    const targetKey = normalizeKey(targetKeyRaw);
    if (!followerKey || !targetKey) return false;
    return !!following.get(followerKey)?.has(targetKey);
  }

  function isMutual(aRaw, bRaw) {
    return isFollowing(aRaw, bRaw) && isFollowing(bRaw, aRaw);
  }

  function listFollowers(targetKeyRaw) {
    const targetKey = normalizeKey(targetKeyRaw);
    if (!targetKey) return [];
    return [...(followers.get(targetKey) || [])];
  }

  function listFollowing(followerKeyRaw) {
    const followerKey = normalizeKey(followerKeyRaw);
    if (!followerKey) return [];
    return [...(following.get(followerKey) || [])];
  }

  function followerCount(targetKeyRaw) {
    const targetKey = normalizeKey(targetKeyRaw);
    if (!targetKey) return 0;
    return followers.get(targetKey)?.size || 0;
  }

  // -------------------------------------------------------------------------
  // Request identity — the caller is an audio identity (session header) and/or
  // a creator session. We let a signed-in user act from either persona.
  // -------------------------------------------------------------------------
  async function actorKeysFor(req) {
    const keys = [];
    // Audio identity via session token header (never trust body-supplied ids).
    try {
      const token = String(req.headers['x-audio-session'] || req.body?.token || '');
      const session = audioIdentity?.getSession?.(token);
      if (session?.username) keys.push(makeKey('audio', session.username));
    } catch { /* no audio identity */ }
    // Creator persona via secure session.
    try {
      if (typeof getCreatorForRequest === 'function') {
        const { creator, via } = await getCreatorForRequest(req);
        if (creator && via === 'session') keys.push(makeKey('creator', creator.id));
      }
    } catch { /* no creator session */ }
    return keys.filter(Boolean);
  }

  // -------------------------------------------------------------------------
  // REST
  // -------------------------------------------------------------------------
  app.post('/api/social/follow', async (req, res) => {
    try {
      const actors = await actorKeysFor(req);
      const followerKey = normalizeKey(req.body?.followerKey) || actors[0];
      if (!followerKey) {
        return res.status(401).json({ ok: false, error: 'Sign in to follow' });
      }
      // Only allow acting as one of the caller's own personas.
      if (req.body?.followerKey && !actors.includes(followerKey)) {
        return res.status(403).json({ ok: false, error: 'Cannot follow on behalf of another identity' });
      }
      const targetKey = normalizeKey(req.body?.targetKey);
      if (!targetKey) return res.status(400).json({ ok: false, error: 'targetKey required (audio:<user> or creator:<id>)' });
      const result = await follow(followerKey, targetKey);
      if (!result.ok) return res.status(400).json(result);
      res.json({ ...result, followerCount: followerCount(targetKey) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Follow failed' });
    }
  });

  app.delete('/api/social/follow', async (req, res) => {
    try {
      const actors = await actorKeysFor(req);
      const followerKey = normalizeKey(req.body?.followerKey || req.query?.followerKey) || actors[0];
      if (!followerKey) return res.status(401).json({ ok: false, error: 'Sign in to unfollow' });
      if ((req.body?.followerKey || req.query?.followerKey) && !actors.includes(followerKey)) {
        return res.status(403).json({ ok: false, error: 'Cannot unfollow on behalf of another identity' });
      }
      const targetKey = normalizeKey(req.body?.targetKey || req.query?.targetKey);
      if (!targetKey) return res.status(400).json({ ok: false, error: 'targetKey required' });
      const result = await unfollow(followerKey, targetKey);
      if (!result.ok) return res.status(400).json(result);
      res.json({ ...result, followerCount: followerCount(targetKey) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Unfollow failed' });
    }
  });

  app.get('/api/social/status', async (req, res) => {
    try {
      await hydrate();
      const actors = await actorKeysFor(req);
      const followerKey = normalizeKey(req.query?.followerKey) || actors[0] || null;
      const targetKey = normalizeKey(req.query?.targetKey);
      if (!targetKey) return res.status(400).json({ ok: false, error: 'targetKey required' });
      res.json({
        ok: true,
        following: followerKey ? isFollowing(followerKey, targetKey) : false,
        mutual: followerKey ? isMutual(followerKey, targetKey) : false,
        followerCount: followerCount(targetKey),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Status failed' });
    }
  });

  app.get('/api/social/followers', async (req, res) => {
    try {
      await hydrate();
      const targetKey = normalizeKey(req.query?.targetKey);
      if (!targetKey) return res.status(400).json({ ok: false, error: 'targetKey required' });
      res.json({
        ok: true,
        followers: listFollowers(targetKey),
        following: listFollowing(targetKey),
        followerCount: followerCount(targetKey),
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Followers failed' });
    }
  });

  app.get('/api/social/mutual', async (req, res) => {
    try {
      await hydrate();
      const actors = await actorKeysFor(req);
      const self = normalizeKey(req.query?.followerKey) || actors[0];
      const targetKey = normalizeKey(req.query?.targetKey);
      if (!self || !targetKey) {
        return res.json({ ok: true, mutual: false });
      }
      // Allow target as creator:<id> or creator:<handle> — resolve handle if needed
      let target = targetKey;
      if (target.startsWith('creator:') && target.includes('@') === false) {
        /* keep as-is */
      }
      // Client may send creator:handle — try match handle on local creators
      if (target.startsWith('creator:')) {
        const raw = target.slice('creator:'.length);
        const byHandle = (localDb.creators || []).find(
          (c) => String(c.handle_name || '').toLowerCase() === raw.toLowerCase(),
        );
        if (byHandle) target = makeKey('creator', byHandle.id);
      }
      res.json({ ok: true, mutual: isMutual(self, target) });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'Mutual check failed' });
    }
  });

  app.get('/api/social/user/:username', async (req, res) => {
    try {
      const username = String(req.params.username || '').trim();
      if (!username) return res.status(400).json({ ok: false, error: 'username required' });
      const key = makeKey('audio', username);
      let identity = null;
      try {
        identity = audioIdentity?.getByUsername?.(username) || null;
      } catch { /* */ }
      const actors = await actorKeysFor(req);
      const self = actors[0];
      res.json({
        ok: true,
        user: {
          username: identity?.username || username,
          level: identity?.level || 0,
          nameColor: identity?.nameColor || '#e2e8f0',
          coins: identity?.coins ?? null,
          mutual: self ? isMutual(self, key) : false,
          followers: followerCount(key),
        },
      });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message || 'User lookup failed' });
    }
  });

  return {
    follow,
    unfollow,
    isFollowing,
    isMutual,
    listFollowers,
    listFollowing,
    followerCount,
    normalizeKey,
    makeKey,
    hydrate,
  };
}

module.exports = { registerSocialFollow, normalizeKey, makeKey };
