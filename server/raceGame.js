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
const TRACK_LENGTH = Number(process.env.RACE_TRACK_LENGTH) || 1000;
const LOBBY_MS = Number(process.env.RACE_LOBBY_MS) || 12000;
const MAX_RACE_MS = Number(process.env.RACE_MAX_MS) || 90000;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;
const BOOST_COOLDOWN_MS = 900;
const MAX_BOOST_CHARGES = 6;
// ~22s base race at default track length; boosts pull it under 20s.
const BASE_SPEED = 4.5;              // units per tick
const BOOST_SPEED = 9;
const BOOST_DURATION_MS = 1200;
const HOUSE_RAKE = 0.05;             // 5% burned — keeps coin supply in check

const ALLOWED_FEES = [0, 10, 25, 50, 100, 250];

const CARS = [
  { id: 'crimson', name: 'Crimson', color: '#ef4444' },
  { id: 'azure', name: 'Azure', color: '#3b82f6' },
  { id: 'viper', name: 'Viper', color: '#22c55e' },
  { id: 'amber', name: 'Amber', color: '#f59e0b' },
  { id: 'violet', name: 'Violet', color: '#a855f7' },
  { id: 'cyan', name: 'Cyan', color: '#06b6d4' },
  { id: 'rose', name: 'Rose', color: '#ec4899' },
  { id: 'lime', name: 'Lime', color: '#84cc16' },
];

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

  async function settle(g) {
    const ranked = [...g.players.values()]
      .filter((p) => p.finished && !p.forfeited)
      .sort((a, b) => a.place - b.place);

    const splits = payoutSplit(g.pot, Math.min(ranked.length, 3));
    const results = [];

    for (let i = 0; i < ranked.length; i += 1) {
      const p = ranked[i];
      const prize = splits[i] || 0;
      if (prize > 0) {
        try {
          await economy.credit(p.ip, prize, `race_win_place_${p.place}`, { gameId: g.id });
        } catch (_) {
          /* credit failure must not break settlement of other players */
        }
      }
      // socketId lets each client spot its own payout without leaking IPs.
      results.push({ userId: p.userId, socketId: p.socketId, nickname: p.nickname, place: p.place, prize });
    }

    g.results = results;
    g.status = 'finished';
    gamesPlayed += 1;

    io.to(g.channelId).emit('game:finished', {
      channelId: g.channelId,
      gameId: g.id,
      results,
      pot: g.pot,
      rake: Math.floor(g.pot * HOUSE_RAKE),
    });
    emitState(g);
    audit?.('race_settled', { channelId: g.channelId, gameId: g.id, pot: g.pot, results });

    // Auto-clear a finished game so the room can start another.
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

    for (const p of g.players.values()) {
      if (p.finished || p.forfeited) continue;
      const boosting = p.boostUntil > now;
      // Small deterministic jitter keeps races lively without letting a client
      // influence the outcome — the seed is server-side only.
      const jitter = 0.85 + ((Math.sin((g.seed + p.seedOffset + now / 250)) + 1) / 2) * 0.3;
      p.progress += (boosting ? BOOST_SPEED : BASE_SPEED) * jitter;

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
        // Rank the stragglers by distance so the pot always resolves.
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
        finished: p.finished,
        place: p.place,
      })),
    });

    if (finishedThisTick) emitState(g);
  }

  function startRace(g) {
    if (g.status !== 'lobby') return;
    const joined = [...g.players.values()];
    if (joined.length < MIN_PLAYERS) {
      // Not enough racers — refund escrow and reset to lobby.
      refundAll(g, 'not_enough_players');
      return;
    }
    g.status = 'racing';
    g.startedAt = Date.now();
    g.nextPlace = 1;
    g.seed = Math.random() * 1000;
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

  /** Everyone ready (and enough players) starts the race immediately. */
  function maybeQuickStart(g) {
    const players = [...g.players.values()];
    if (players.length >= MIN_PLAYERS && players.every((p) => p.ready)) startRace(g);
  }

  function attachSocketHandlers(socket, ip) {
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
      };
      games.set(channel.id, g);
      channel.gameId = g.id;

      g.lobbyTimer = setTimeout(() => {
        const cur = games.get(channel.id);
        if (cur && cur.id === g.id && cur.status === 'lobby') startRace(cur);
      }, LOBBY_MS);

      // If the creator can't pay the entry fee, roll the game back — otherwise
      // an empty zombie lobby would block the channel until it timed out.
      const joined = await joinGame(socket, ip, g);
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
      if (g.players.size >= MAX_PLAYERS) {
        sock.emit('game:error', { message: 'Race is full.' });
        return false;
      }

      const userData = users.get(sock.id);
      if (!userData) return false;

      // Escrow the entry fee before admitting the player.
      let paid = false;
      if (g.entryFee > 0) {
        const result = await economy.debit(playerIp, g.entryFee, 'race_entry', { gameId: g.id });
        if (!result?.ok) {
          sock.emit('game:error', {
            message: result?.error || 'Not enough coins for this entry fee.',
            needCoins: g.entryFee,
          });
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
        lastBoostAt: 0,
        seedOffset: Math.random() * 100,
      });
      emitState(g);
      return true;
    }

    on('game:join', async (data) => {
      const channel = requireMembership(data.channelId);
      if (!channel) return;
      const g = games.get(channel.id);
      if (!g) return socket.emit('game:error', { message: 'No race running — start one!' });
      await joinGame(socket, ip, g);
    });

    on('game:ready', (data) => {
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
