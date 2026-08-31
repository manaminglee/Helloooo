/**
 * Server-authoritative coin race game for audio channels.
 *
 * One shared game instance per audio channel — every player in the room is
 * wired into the SAME race, so all clients render identical state from the
 * server's tick broadcast. Clients send only intent ("boost"); they never
 * report their own position, so progress cannot be forged.
 *
 * Anti-cheat model:
 *   - Positions advance only inside the server tick.
 *   - Boost is server-rate-limited and consumes a server-tracked charge pool.
 *   - Entry fees are escrowed at start; the pot is paid from escrow only.
 *   - A player who leaves mid-race forfeits their stake (stays in the pot).
 *
 * Socket API
 *   game:create {channelId, entryFee}     -> game:state
 *   game:join   {channelId}               -> game:state | game:error
 *   game:ready  {channelId, ready}
 *   game:boost  {channelId}
 *   game:leave  {channelId}
 *   game:info   {channelId}
 * Broadcasts: game:state, game:tick, game:finished, game:error
 */

const TICK_MS = 100;                 // 10 ticks/sec — smooth without flooding
// Env-overridable so tests can run short races and ops can tune pacing.
const TRACK_LENGTH = Number(process.env.RACE_TRACK_LENGTH) || 1200;
const LOBBY_MS = Number(process.env.RACE_LOBBY_MS) || 10000;
const MAX_RACE_MS = Number(process.env.RACE_MAX_MS) || 100000;
const MIN_PLAYERS = 1;               // solo heists allowed
const MAX_PLAYERS = 8;
const BOOST_COOLDOWN_MS = 1100;
const MAX_BOOST_CHARGES = 4;         // scarce boosts — timing matters
// Slower base pace; boosts are the skill window for collectibles.
const BASE_SPEED = 3.2;
const BOOST_SPEED = 8.4;
const BOOST_DURATION_MS = 900;
const HOUSE_RAKE = 0.08;
const COLLECT_RADIUS = 18;           // must boost near a coin to grab it
const HAZARD_RADIUS = 22;
const HAZARD_SLOW_MS = 1400;

const ALLOWED_FEES = [0, 10, 25, 50, 100, 250];

const CARS = [
  { id: 'gt-red', name: 'Crimson GT', color: '#dc2626', accent: '#fca5a5' },
  { id: 'nsx-blue', name: 'Azure NSX', color: '#2563eb', accent: '#93c5fd' },
  { id: 'lambo-green', name: 'Viper Lambo', color: '#16a34a', accent: '#86efac' },
  { id: 'porsche-amber', name: 'Amber Turbo', color: '#d97706', accent: '#fcd34d' },
  { id: 'mclaren-violet', name: 'Violet Spider', color: '#7c3aed', accent: '#c4b5fd' },
  { id: 'nissan-cyan', name: 'Cyan Drift', color: '#0891b2', accent: '#67e8f9' },
  { id: 'ferrari-rose', name: 'Rose Scuderia', color: '#db2777', accent: '#f9a8d4' },
  { id: 'lotus-lime', name: 'Lime Elise', color: '#65a30d', accent: '#bef264' },
];

/** Deterministic-ish collectible / hazard layout from game seed. */
function buildTrackItems(seed, trackLen) {
  const coins = [];
  const hazards = [];
  let s = seed * 9973;
  const next = () => {
    s = (s * 16807 + 7) % 2147483647;
    return s / 2147483647;
  };
  // Sparse, high-value coins — hard to chain without burning boosts early.
  for (let i = 0; i < 9; i += 1) {
    const at = 80 + next() * (trackLen - 160);
    const value = next() > 0.78 ? 12 : next() > 0.45 ? 7 : 4;
    coins.push({ id: `c${i}`, at: Math.round(at), value, lane: Math.floor(next() * 3) });
  }
  for (let i = 0; i < 5; i += 1) {
    hazards.push({
      id: `h${i}`,
      at: Math.round(120 + next() * (trackLen - 220)),
      lane: Math.floor(next() * 3),
    });
  }
  coins.sort((a, b) => a.at - b.at);
  return { coins, hazards };
}

function registerRaceGame(app, io, deps) {
  const {
    users,
    audioChannels,
    economy,       // { getBalance, debit, credit } — all async, atomic
    isAdminRequest,
    audit,
  } = deps;

  /** channelId -> game */
  const games = new Map();
  let gamesPlayed = 0;
  let coinsWagered = 0;

  const publicPlayer = (p) => ({
    socketId: p.socketId,
    userId: p.userId,
    nickname: p.nickname,
    car: p.car,
    progress: Math.round(p.progress * 10) / 10,
    ready: p.ready,
    finished: p.finished,
    place: p.place,
    boostCharges: p.boostCharges,
    boosting: p.boostUntil > Date.now(),
    forfeited: p.forfeited,
    collected: p.collected || 0,
    collectedValue: p.collectedValue || 0,
    slowed: p.slowUntil > Date.now(),
  });

  const publicGame = (g) => ({
    channelId: g.channelId,
    gameId: g.id,
    status: g.status,
    entryFee: g.entryFee,
    pot: g.pot,
    trackLength: TRACK_LENGTH,
    startsInMs: g.status === 'lobby' ? Math.max(0, g.lobbyEndsAt - Date.now()) : 0,
    elapsedMs: g.startedAt ? Date.now() - g.startedAt : 0,
    players: [...g.players.values()].map(publicPlayer),
    minPlayers: MIN_PLAYERS,
    maxPlayers: MAX_PLAYERS,
    results: g.results || null,
    mode: g.players.size <= 1 ? 'solo' : 'versus',
    coins: (g.coins || []).map((c) => ({
      id: c.id,
      at: c.at,
      value: c.value,
      lane: c.lane,
      takenBy: c.takenBy || null,
    })),
    hazards: (g.hazards || []).map((h) => ({ id: h.id, at: h.at, lane: h.lane })),
  });

  const emitState = (g) => io.to(g.channelId).emit('game:state', publicGame(g));

  /** Prize split by placement — winner-heavy but not winner-take-all. */
  function payoutSplit(pot, finishers) {
    if (finishers <= 0 || pot <= 0) return [];
    const net = Math.floor(pot * (1 - HOUSE_RAKE));
    if (finishers === 1) return [net];
    if (finishers === 2) return [Math.floor(net * 0.65), net - Math.floor(net * 0.65)];
    const first = Math.floor(net * 0.5);
    const second = Math.floor(net * 0.3);
    const third = net - first - second;
    return [first, second, third];
  }

  /** Solo heist: earn only what you skillfully collect + a tiny finish crumb. */
  function soloSkillPrize(p, entryFee) {
    const loot = Math.min(p.collectedValue || 0, 48);
    const finishCrumb = entryFee > 0 ? Math.floor(entryFee * 0.15) : 3;
    // Hard: average player recovers little; perfect timing can beat stake slightly.
    return loot + finishCrumb;
  }

  async function settle(g) {
    const ranked = [...g.players.values()]
      .filter((p) => p.finished && !p.forfeited)
      .sort((a, b) => a.place - b.place);

    const solo = ranked.length === 1 && g.players.size === 1;
    const splits = solo ? [] : payoutSplit(g.pot, Math.min(ranked.length, 3));
    const results = [];

    for (let i = 0; i < ranked.length; i += 1) {
      const p = ranked[i];
      let prize = splits[i] || 0;
      if (solo) {
        prize = soloSkillPrize(p, g.entryFee);
        // Escrowed entry stays with house unless skill prize covers part — credit skill prize only.
      } else if ((p.collectedValue || 0) > 0) {
        // Tiny hard-earned bonus on top of placement (capped).
        prize += Math.min(p.collectedValue, 15);
      }
      if (prize > 0) {
        try {
          await economy.credit(p.ip, prize, solo ? 'race_solo_heist' : `race_win_place_${p.place}`, {
            gameId: g.id,
            collected: p.collected || 0,
          });
        } catch (_) {
          /* credit failure must not break settlement of other players */
        }
      }
      results.push({
        userId: p.userId,
        socketId: p.socketId,
        nickname: p.nickname,
        place: p.place,
        prize,
        collected: p.collected || 0,
        collectedValue: p.collectedValue || 0,
      });
    }

    g.results = results;
    g.status = 'finished';
    gamesPlayed += 1;

    io.to(g.channelId).emit('game:finished', {
      channelId: g.channelId,
      gameId: g.id,
      results,
      pot: g.pot,
      solo,
      rake: Math.floor(g.pot * HOUSE_RAKE),
    });
    emitState(g);
    audit?.('race_settled', { channelId: g.channelId, gameId: g.id, pot: g.pot, results, solo });

    setTimeout(() => {
      const cur = games.get(g.channelId);
      if (cur && cur.id === g.id && cur.status === 'finished') {
        games.delete(g.channelId);
        const ch = audioChannels.getChannel(g.channelId);
        if (ch) ch.gameId = null;
        io.to(g.channelId).emit('game:state', null);
      }
    }, 15000);
  }

  function stopLoop(g) {
    if (g.timer) {
      clearInterval(g.timer);
      g.timer = null;
    }
  }

  function tick(g) {
    if (g.status !== 'racing') return;
    const now = Date.now();
    let finishedThisTick = false;
    let lootChanged = false;

    for (const p of g.players.values()) {
      if (p.finished || p.forfeited) continue;
      const boosting = p.boostUntil > now;
      const slowed = p.slowUntil > now;
      const jitter = 0.82 + ((Math.sin((g.seed + p.seedOffset + now / 250)) + 1) / 2) * 0.28;
      let speed = boosting ? BOOST_SPEED : BASE_SPEED;
      if (slowed) speed *= 0.45;
      p.progress += speed * jitter;

      // Collect roadside coins ONLY while boosting (skill window).
      if (boosting && g.coins) {
        for (const coin of g.coins) {
          if (coin.takenBy) continue;
          if (Math.abs(p.progress - coin.at) <= COLLECT_RADIUS) {
            coin.takenBy = p.socketId;
            p.collected = (p.collected || 0) + 1;
            p.collectedValue = (p.collectedValue || 0) + coin.value;
            lootChanged = true;
          }
        }
      }

      // Hazards punish reckless boosts.
      if (boosting && g.hazards) {
        for (const h of g.hazards) {
          if (p.hitHazards?.has(h.id)) continue;
          if (Math.abs(p.progress - h.at) <= HAZARD_RADIUS) {
            p.hitHazards = p.hitHazards || new Set();
            p.hitHazards.add(h.id);
            p.slowUntil = now + HAZARD_SLOW_MS;
            p.boostUntil = Math.min(p.boostUntil, now);
          }
        }
      }

      if (p.progress >= TRACK_LENGTH) {
        p.progress = TRACK_LENGTH;
        p.finished = true;
        p.place = g.nextPlace++;
        finishedThisTick = true;
      }
    }

    const active = [...g.players.values()].filter((p) => !p.finished && !p.forfeited);
    const timedOut = now - g.startedAt > MAX_RACE_MS;

    if (active.length === 0 || timedOut) {
      if (timedOut) {
        [...g.players.values()]
          .filter((p) => !p.finished && !p.forfeited)
          .sort((a, b) => b.progress - a.progress)
          .forEach((p) => {
            p.finished = true;
            p.place = g.nextPlace++;
          });
      }
      stopLoop(g);
      settle(g);
      return;
    }

    io.to(g.channelId).emit('game:tick', {
      channelId: g.channelId,
      gameId: g.id,
      t: now - g.startedAt,
      players: [...g.players.values()].map((p) => ({
        socketId: p.socketId,
        progress: Math.round(p.progress * 10) / 10,
        boosting: p.boostUntil > now,
        slowed: p.slowUntil > now,
        finished: p.finished,
        place: p.place,
        collected: p.collected || 0,
        collectedValue: p.collectedValue || 0,
      })),
      coins: lootChanged
        ? g.coins.map((c) => ({ id: c.id, at: c.at, value: c.value, lane: c.lane, takenBy: c.takenBy || null }))
        : undefined,
    });

    if (finishedThisTick || lootChanged) emitState(g);
  }

  function startRace(g) {
    if (g.status !== 'lobby') return;
    const joined = [...g.players.values()];
    if (joined.length < MIN_PLAYERS) {
      refundAll(g, 'not_enough_players');
      return;
    }
    g.status = 'racing';
    g.startedAt = Date.now();
    g.nextPlace = 1;
    g.seed = Math.random() * 1000;
    const items = buildTrackItems(g.seed, TRACK_LENGTH);
    g.coins = items.coins;
    g.hazards = items.hazards;
    emitState(g);
    g.timer = setInterval(() => {
      try {
        tick(g);
      } catch (err) {
        stopLoop(g);
        if (process.env.NODE_ENV !== 'production') console.error('[race tick]', err);
      }
    }, TICK_MS);
  }

  async function refundAll(g, reason) {
    stopLoop(g);
    for (const p of g.players.values()) {
      if (p.paid && g.entryFee > 0) {
        try {
          await economy.credit(p.ip, g.entryFee, 'race_refund', { gameId: g.id, reason });
        } catch (_) {
          /* keep refunding the rest */
        }
      }
    }
    games.delete(g.channelId);
    const ch = audioChannels.getChannel(g.channelId);
    if (ch) ch.gameId = null;
    io.to(g.channelId).emit('game:error', { message: 'Race cancelled — entry fees refunded.', reason });
    io.to(g.channelId).emit('game:state', null);
  }

  function assignCar(g) {
    const taken = new Set([...g.players.values()].map((p) => p.car.id));
    return CARS.find((c) => !taken.has(c.id)) || CARS[0];
  }

  /** Everyone ready (and enough players) starts the race immediately. Solo can solo-ready. */
  function maybeQuickStart(g) {
    if (g.status !== 'lobby') return;
    // Never quick-start while another player's entry fee is still settling —
    // otherwise a solo ready can lock late joiners out of a race they already paid for.
    if (g.pendingJoins > 0) return;
    const players = [...g.players.values()];
    if (players.length >= MIN_PLAYERS && players.every((p) => p.ready)) startRace(g);
  }

  function attachSocketHandlers(socket, ip) {
    // A join (create/join) escrows the entry fee asynchronously. If the same
    // socket fires game:ready before that debit settles, the player record
    // doesn't exist yet and the ready would be silently dropped — so ready
    // (and boost/leave) await any in-flight join first.
    let joinInFlight = null;
    const trackJoin = (promise) => {
      const tracked = promise.finally(() => {
        if (joinInFlight === tracked) joinInFlight = null;
      });
      joinInFlight = tracked;
      return tracked;
    };
    const awaitJoin = async () => {
      if (joinInFlight) {
        try { await joinInFlight; } catch { /* join errors already reported */ }
      }
    };
    const on = (evt, fn) => {
      socket.on(evt, async (data) => {
        try {
          await fn(data || {});
        } catch (err) {
          socket.emit('game:error', { message: 'Game action failed.' });
          if (process.env.NODE_ENV !== 'production') console.error(`[${evt}]`, err);
        }
      });
    };

    /** A player must actually be in the audio channel to touch its game. */
    const requireMembership = (channelId) => {
      const channel = audioChannels.getChannel(channelId);
      if (!channel || !channel.members.has(socket.id)) {
        socket.emit('game:error', { message: 'Join the voice channel first.' });
        return null;
      }
      return channel;
    };

    on('game:create', async (data) => {
      const channel = requireMembership(data.channelId);
      if (!channel) return;
      if (games.has(channel.id)) {
        return socket.emit('game:error', { message: 'A race is already running in this channel.' });
      }
      const entryFee = ALLOWED_FEES.includes(Number(data.entryFee)) ? Number(data.entryFee) : 0;

      const g = {
        id: `race_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        channelId: channel.id,
        status: 'lobby',
        entryFee,
        pot: 0,
        players: new Map(),
        lobbyEndsAt: Date.now() + LOBBY_MS,
        startedAt: null,
        nextPlace: 1,
        seed: Math.random() * 1000,
        timer: null,
        lobbyTimer: null,
        results: null,
        pendingJoins: 0, // joins whose entry-fee escrow is still settling
        joining: new Set(), // socket ids whose join is mid-flight (per-socket dedupe)
      };
      games.set(channel.id, g);
      channel.gameId = g.id;

      g.lobbyTimer = setTimeout(() => {
        const cur = games.get(channel.id);
        if (!cur || cur.id !== g.id || cur.status !== 'lobby') return;
        // Lobby expiry policy: start with 2+ players (even if someone forgot
        // to ready up), or solo only when that player actually readied.
        // A solo, unready lobby is abandoned — cancel and refund the escrow.
        const players = [...cur.players.values()];
        if (players.length >= 2 || (players.length === 1 && players[0].ready)) {
          startRace(cur);
        } else {
          void refundAll(cur, 'not_enough_players');
        }
      }, LOBBY_MS);

      // If the creator can't pay the entry fee, roll the game back — otherwise
      // an empty zombie lobby would block the channel until it timed out.
      const joined = await trackJoin(joinGame(socket, ip, g));
      if (!joined) {
        clearTimeout(g.lobbyTimer);
        games.delete(channel.id);
        channel.gameId = null;
        return;
      }
      audit?.('race_created', { channelId: channel.id, entryFee, by: users.get(socket.id)?.id });
    });

    /** Returns true when the player was admitted (and charged). */
    async function joinGame(sock, playerIp, g) {
      if (g.status !== 'lobby') {
        sock.emit('game:error', { message: 'Race already started — wait for the next one.' });
        return false;
      }
      // Idempotent: re-joining must never charge twice.
      if (g.players.has(sock.id)) {
        emitState(g);
        return true;
      }
      // Concurrency guard: the player isn't added to g.players until AFTER the
      // async entry-fee debit below, so a second join firing before the first
      // settles (double-click / laggy retry) would otherwise sail past the
      // has() check above and charge the entry fee twice. Reserve the slot
      // synchronously here so only the first in-flight join for this socket
      // proceeds to charge.
      if (g.joining.has(sock.id)) {
        return true;
      }
      if (g.players.size + g.joining.size >= MAX_PLAYERS) {
        sock.emit('game:error', { message: 'Race is full.' });
        return false;
      }

      const userData = users.get(sock.id);
      if (!userData) return false;

      g.joining.add(sock.id);
      try {
        // Escrow the entry fee before admitting the player.
        let paid = false;
        if (g.entryFee > 0) {
          g.pendingJoins += 1;
          let result;
          try {
            result = await economy.debit(playerIp, g.entryFee, 'race_entry', { gameId: g.id });
          } finally {
            g.pendingJoins = Math.max(0, g.pendingJoins - 1);
          }
          if (!result?.ok) {
            sock.emit('game:error', {
              message: result?.error || 'Not enough coins for this entry fee.',
              needCoins: g.entryFee,
            });
            // A ready quorum may have been waiting on this join to settle.
            maybeQuickStart(g);
            return false;
          }
          paid = true;
          g.pot += g.entryFee;
          coinsWagered += g.entryFee;
        }

        g.players.set(sock.id, {
        socketId: sock.id,
        userId: userData.id,
        ip: playerIp,
        nickname: userData.nickname || 'Racer',
        car: assignCar(g),
        progress: 0,
        ready: false,
        finished: false,
        forfeited: false,
        place: null,
        paid,
        boostCharges: MAX_BOOST_CHARGES,
        boostUntil: 0,
        slowUntil: 0,
        lastBoostAt: 0,
        seedOffset: Math.random() * 100,
        collected: 0,
        collectedValue: 0,
        hitHazards: new Set(),
      });
        emitState(g);
        // If everyone else already readied while this join settled, re-check now.
        maybeQuickStart(g);
        return true;
      } finally {
        g.joining.delete(sock.id);
      }
    }

    on('game:join', async (data) => {
      const channel = requireMembership(data.channelId);
      if (!channel) return;
      const g = games.get(channel.id);
      if (!g) return socket.emit('game:error', { message: 'No race running — start one!' });
      await trackJoin(joinGame(socket, ip, g));
    });

    on('game:ready', async (data) => {
      await awaitJoin();
      const g = games.get(String(data.channelId || ''));
      const p = g?.players.get(socket.id);
      if (!p || g.status !== 'lobby') return;
      p.ready = !!data.ready;
      emitState(g);
      maybeQuickStart(g);
    });

    on('game:boost', (data) => {
      const g = games.get(String(data.channelId || ''));
      const p = g?.players.get(socket.id);
      if (!p || g.status !== 'racing' || p.finished || p.forfeited) return;

      const now = Date.now();
      if (p.boostCharges <= 0) return;
      if (now - p.lastBoostAt < BOOST_COOLDOWN_MS) return; // server-side cooldown
      p.boostCharges -= 1;
      p.lastBoostAt = now;
      p.boostUntil = now + BOOST_DURATION_MS;
    });

    on('game:leave', (data) => {
      const g = games.get(String(data.channelId || ''));
      const p = g?.players.get(socket.id);
      if (!p) return;
      if (g.status === 'lobby') {
        // Pre-race exit refunds the stake.
        if (p.paid && g.entryFee > 0) {
          economy.credit(ip, g.entryFee, 'race_leave_refund', { gameId: g.id }).catch(() => {});
          g.pot = Math.max(0, g.pot - g.entryFee);
        }
        g.players.delete(socket.id);
      } else {
        p.forfeited = true; // mid-race exit forfeits into the pot
      }
      emitState(g);
    });

    on('game:info', (data) => {
      const g = games.get(String(data.channelId || ''));
      socket.emit('game:state', g ? publicGame(g) : null);
    });

    socket.on('disconnect', () => {
      for (const g of games.values()) {
        const p = g.players.get(socket.id);
        if (!p) continue;
        if (g.status === 'lobby') {
          if (p.paid && g.entryFee > 0) {
            economy.credit(p.ip, g.entryFee, 'race_disconnect_refund', { gameId: g.id }).catch(() => {});
            g.pot = Math.max(0, g.pot - g.entryFee);
          }
          g.players.delete(socket.id);
        } else {
          p.forfeited = true;
        }
        emitState(g);
      }
    });
  }

  /** Called when an audio channel empties — tear down its game cleanly. */
  function destroyForChannel(channelId) {
    const g = games.get(channelId);
    if (!g) return;
    stopLoop(g);
    if (g.lobbyTimer) clearTimeout(g.lobbyTimer);
    if (g.status === 'lobby') refundAll(g, 'channel_closed');
    else games.delete(channelId);
  }

  app.get('/api/admin/games', (req, res) => {
    if (!isAdminRequest(req)) return res.status(403).json({ error: 'Forbidden' });
    res.json({
      active: [...games.values()].map(publicGame),
      stats: { gamesPlayed, coinsWagered, activeGames: games.size },
    });
  });

  app.post('/api/admin/games/:channelId/cancel', (req, res) => {
    if (!isAdminRequest(req)) return res.status(403).json({ error: 'Forbidden' });
    const g = games.get(req.params.channelId);
    if (!g) return res.status(404).json({ error: 'No game' });
    refundAll(g, 'admin_cancelled');
    audit?.('admin_race_cancel', { channelId: req.params.channelId });
    res.json({ ok: true });
  });

  return { attachSocketHandlers, destroyForChannel, games, CARS, ALLOWED_FEES };
}

module.exports = { registerRaceGame, CARS, ALLOWED_FEES, TRACK_LENGTH };
