/**
 * Live engine self-test —  node server/__livetest.js
 *
 * The whole suite runs TWICE: once with the memory store (single instance) and
 * once against a fake Redis client (multi-instance code path). Identical
 * assertions on both, so a Redis-only regression cannot hide.
 *
 * The last block simulates two server instances sharing one Redis to prove a
 * viewer on instance B can see and gift a room hosted on instance A.
 */
const assert = require('assert');
const { registerLiveStreams } = require('./liveStreams');
const { createLiveStore } = require('./liveStore');
const { createFakeRedis } = require('./__fakeredis');
const { filterText, buildWordList, createRateLimiter } = require('./liveModeration');

process.env.LIVEKIT_URL = 'wss://test.livekit.cloud';
process.env.LIVEKIT_API_KEY = 'devkey';
process.env.LIVEKIT_API_SECRET = 'devsecretdevsecretdevsecretdevsecret';

let passed = 0;
const ok = (name) => { passed += 1; console.log(`  ✓ ${name}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------- fakes ---------------- */
function makeWorld(sharedRedis = null) {
  const emitted = [];
  const sockets = new Map();

  const io = {
    emit: (evt, payload) => emitted.push({ to: '*', evt, payload }),
    to: (target) => ({ emit: (evt, payload) => emitted.push({ to: target, evt, payload }) }),
    sockets: { sockets },
  };

  const wallets = new Map([['alice', 1000], ['bob', 100000]]);
  const users = new Map();
  const creators = [{ id: 'c1', handle_name: 'nova', status: 'approved' }];

  const deps = {
    users,
    sanitize: (t) => String(t).replace(/[<>]/g, ''),
    generateId: () => `live_${Math.random().toString(36).slice(2, 8)}`,
    localDb: { creators },
    saveLocalDb: () => {},
    supabase: null,
    getRedis: () => sharedRedis,
    audioIdentity: {
      resolveWalletKey: (socket, u) => u.get(socket.id)?.audioIdentity?.username?.toLowerCase() || null,
      debit: async (key, amount) => {
        const bal = wallets.get(key) ?? 0;
        if (bal < amount) return { ok: false, error: 'Not enough coins', balance: bal };
        wallets.set(key, bal - amount);
        return { ok: true, balance: bal - amount, identity: { coins: bal - amount } };
      },
      giftXp: async () => {},
    },
    getCreatorForRequest: async () => ({ creator: null, via: null }),
    getSettings: () => ({ liveGoLivePolicy: 'approved' }),
    creditCreatorCoins: async () => ({ ok: true }),
    audit: () => {},
  };

  const app = { get: () => {}, post: () => {} };
  const engine = registerLiveStreams(app, io, deps);

  function makeSocket(id, ip = '1.2.3.4') {
    const handlers = new Map();
    const s = {
      id,
      handshake: { headers: {}, address: ip },
      join: () => {}, leave: () => {},
      emit: (evt, payload) => emitted.push({ to: id, evt, payload }),
      on: (evt, fn) => handlers.set(evt, fn),
      fire: (evt, payload) => new Promise((resolve) => {
        const fn = handlers.get(evt);
        if (!fn) return resolve({ ok: false, error: `no handler ${evt}` });
        let done = false;
        const settle = (v) => { if (!done) { done = true; resolve(v || { ok: true }); } };
        Promise.resolve(fn(payload, settle)).then(
          () => setImmediate(() => settle(null)),
          () => settle(null),
        );
        return undefined;
      }),
    };
    sockets.set(id, s);
    engine.attachSocketHandlers(s);
    return s;
  }

  return { io, emitted, engine, users, wallets, creators, makeSocket, deps };
}

/* ---------------- the suite ---------------- */
async function suite(label, sharedRedis) {
  console.log(`\n── engine · ${label} ──`);
  const w = makeWorld(sharedRedis);
  const { engine, emitted, users, wallets, creators, makeSocket } = w;

  assert.strictEqual(engine.store.kind, sharedRedis ? 'redis' : 'memory');
  ok(`store backend is ${engine.store.kind}`);

  const host = makeSocket('host1');
  const alice = makeSocket('alice1', '9.9.9.9');
  users.set('host1', { isCreator: true, creatorData: { id: 'c1' }, nickname: 'nova' });
  users.set('alice1', { audioIdentity: { username: 'Alice', nameColor: '#fff', level: 3 } });

  const started = await engine.startLive({ creator: creators[0], socketId: 'host1', title: 'Test live' });
  assert.ok(started.ok, started.error);
  const liveId = started.live.id;
  ok('host can start a live');

  const joined = await alice.fire('live:join', { liveId });
  assert.strictEqual(joined.ok, true);
  assert.strictEqual(joined.isModerator, false);
  ok('viewer joins and is not a moderator');

  /* comments */
  await alice.fire('live:comment', { liveId, text: 'hello everyone 👋' });
  const c1 = emitted.filter((e) => e.evt === 'live:comment').pop();
  assert.strictEqual(c1.payload.text, 'hello everyone 👋');
  assert.strictEqual(c1.payload.username, 'Alice');
  ok('comment broadcasts with identity + emoji intact');

  await alice.fire('live:comment', { liveId, text: '<script>x</script>hi' });
  assert.ok(!emitted.filter((e) => e.evt === 'live:comment').pop().payload.text.includes('<'));
  ok('comment markup is sanitised');

  const replayed = await alice.fire('live:join', { liveId });
  assert.ok(replayed.comments.length >= 2);
  ok('a late joiner gets comment history replayed');

  /* gifts */
  const before = wallets.get('alice');
  const g1 = await alice.fire('live:gift', { liveId, giftId: 'rose', nonce: 'n-1' });
  assert.strictEqual(g1.ok, true, g1.error);
  assert.strictEqual(wallets.get('alice'), before - 5);
  assert.strictEqual(g1.comboCount, 1);
  ok('gift debits the wallet server-side');

  const replay = await alice.fire('live:gift', { liveId, giftId: 'rose', nonce: 'n-1' });
  assert.strictEqual(replay.ok, false);
  assert.strictEqual(replay.duplicate, true);
  assert.strictEqual(wallets.get('alice'), before - 5);
  ok('replayed nonce is rejected and never charges twice');

  assert.strictEqual((await alice.fire('live:gift', { liveId, giftId: 'rose', nonce: 'n-2' })).comboCount, 2);
  assert.strictEqual((await alice.fire('live:gift', { liveId, giftId: 'rose', nonce: 'n-3' })).comboCount, 3);
  ok('repeat gifts build a combo counter');

  assert.strictEqual((await alice.fire('live:gift', { liveId, giftId: 'heart', nonce: 'n-4' })).comboCount, 1);
  ok('a different gift starts its own combo');

  const broke = await alice.fire('live:gift', { liveId, giftId: 'universe', nonce: 'n-5' });
  assert.strictEqual(broke.ok, false);
  assert.strictEqual(broke.insufficient, true);
  assert.strictEqual(broke.needed, 50000);
  ok('insufficient balance is refused with the shortfall');

  assert.strictEqual((await alice.fire('live:gift', { liveId, giftId: 'nope', nonce: 'n-6' })).ok, false);
  ok('unknown gift id is refused');

  const stats = await engine.hostStats(await engine.getLive(liveId));
  assert.strictEqual(stats.giftCount, 4);
  assert.strictEqual(stats.coinsReceived, 25);
  assert.strictEqual(stats.topGifters[0].username, 'Alice');
  assert.strictEqual(stats.topGifters[0].count, 4);
  ok('host stats track gifts, coins and top gifter');

  /* moderation */
  assert.strictEqual((await alice.fire('live:pin', { liveId, commentId: c1.payload.id })).ok, false);
  ok('a viewer cannot pin a comment');

  const pinned = await host.fire('live:pin', { liveId, commentId: c1.payload.id });
  assert.strictEqual(pinned.ok, true);
  assert.strictEqual(pinned.pinnedComment.text, 'hello everyone 👋');
  assert.strictEqual((await engine.getLive(liveId)).pinnedComment.text, 'hello everyone 👋');
  ok('host can pin a comment and it survives a room reload');

  assert.strictEqual((await host.fire('live:mute', { liveId, targetSocketId: 'alice1' })).muted, true);
  assert.strictEqual((await alice.fire('live:comment', { liveId, text: 'still here?' })).ok, false);
  ok('muted viewer cannot comment');

  await host.fire('live:mute', { liveId, targetSocketId: 'alice1', unmute: true });
  assert.strictEqual((await alice.fire('live:comment', { liveId, text: 'back' })).ok, true);
  ok('unmute restores commenting');

  assert.strictEqual((await host.fire('live:slow-mode', { liveId, seconds: 10 })).slowModeMs, 10000);
  const tooFast = await alice.fire('live:comment', { liveId, text: 'again' });
  assert.strictEqual(tooFast.ok, false);
  assert.ok(/slow mode/i.test(tooFast.error));
  ok('slow mode throttles viewers (not the host)');

  await host.fire('live:slow-mode', { liveId, seconds: 0 });
  await host.fire('live:comments-toggle', { liveId, disabled: true });
  assert.strictEqual((await alice.fire('live:comment', { liveId, text: 'hi' })).ok, false);
  assert.strictEqual((await host.fire('live:comment', { liveId, text: 'mods can talk' })).ok, true);
  ok('comments-off blocks viewers but not moderators');
  await host.fire('live:comments-toggle', { liveId, disabled: false });

  assert.strictEqual((await host.fire('live:promote-mod', { liveId, targetSocketId: 'alice1' })).isModerator, true);
  assert.strictEqual((await alice.fire('live:pin', { liveId, commentId: '' })).ok, true);
  ok('promoted moderator gains moderation rights');

  const list = await host.fire('live:viewers:list', { liveId });
  assert.strictEqual(list.ok, true);
  const aliceRow = list.viewers.find((v) => v.username === 'Alice');
  assert.ok(aliceRow.badges.includes('moderator'));
  assert.ok(aliceRow.badges.includes('top_gifter'));
  assert.strictEqual(aliceRow.giftedCoins, 25);
  ok('viewer list carries badges and gift totals');

  /* reactions */
  emitted.length = 0;
  for (let i = 0; i < 5; i += 1) await alice.fire('live:react', { liveId, count: 1 });
  assert.strictEqual(emitted.filter((e) => e.evt === 'live:reaction').length, 0);
  await wait(500);
  const flushed = emitted.filter((e) => e.evt === 'live:reaction');
  assert.strictEqual(flushed.length, 1, 'expected exactly one aggregated packet');
  assert.strictEqual(flushed[0].payload.count, 5);
  assert.strictEqual(flushed[0].payload.totalLikes, 5);
  ok('5 taps produce 1 aggregated broadcast');

  /* kick / block */
  const bob = makeSocket('bob1', '5.5.5.5');
  users.set('bob1', { audioIdentity: { username: 'Bob' } });
  await bob.fire('live:join', { liveId });
  assert.strictEqual((await host.fire('live:block', { liveId, targetSocketId: 'bob1' })).ok, true);
  assert.strictEqual((await bob.fire('live:join', { liveId })).ok, false);
  ok('blocked viewer cannot rejoin');

  /* end */
  const ended = await engine.endLive(liveId, 'test');
  assert.strictEqual(ended.ok, true);
  assert.strictEqual(ended.summary.giftCount, 4);
  assert.ok(ended.summary.likes >= 5);
  assert.strictEqual(ended.summary.topGifter.username, 'Alice');
  assert.ok(ended.summary.totalViewers >= 2);
  ok('end summary reports the real totals');

  assert.strictEqual(await engine.getLive(liveId), null);
  assert.strictEqual((await engine.listActive()).length, 0);
  ok('session is removed after end');

  engine.shutdown();
}

/* ---------------- cross-instance ---------------- */
async function crossInstance() {
  console.log('\n── two instances, one Redis ──');
  const redis = createFakeRedis();
  const a = makeWorld(redis);   // instance A — hosts the live
  const b = makeWorld(redis);   // instance B — a viewer lands here

  a.users.set('host1', { isCreator: true, creatorData: { id: 'c1' }, nickname: 'nova' });
  const hostA = a.makeSocket('host1');
  const started = await a.engine.startLive({ creator: a.creators[0], socketId: 'host1', title: 'Shared' });
  assert.ok(started.ok);
  const liveId = started.live.id;

  const feedOnB = await b.engine.listActive();
  assert.strictEqual(feedOnB.length, 1);
  assert.strictEqual(feedOnB[0].id, liveId);
  ok('instance B sees a live started on instance A');

  b.users.set('zoe1', { audioIdentity: { username: 'Zoe', level: 5 } });
  b.wallets.set('zoe', 500);
  const zoe = b.makeSocket('zoe1', '7.7.7.7');
  const joined = await zoe.fire('live:join', { liveId });
  assert.strictEqual(joined.ok, true);
  ok('a viewer on B can join a room hosted on A');

  assert.strictEqual(await a.engine.store.viewerCount(liveId), 1);
  ok('instance A counts the viewer that joined on B');

  const gift = await zoe.fire('live:gift', { liveId, giftId: 'crown', nonce: 'x-1' });
  assert.strictEqual(gift.ok, true, gift.error);
  assert.strictEqual(b.wallets.get('zoe'), 400);
  const statsOnA = await a.engine.hostStats(await a.engine.getLive(liveId));
  assert.strictEqual(statsOnA.giftCount, 1);
  assert.strictEqual(statsOnA.topGifters[0].username, 'Zoe');
  ok('a gift sent on B lands in the host stats on A');

  // The nonce store is shared, so a replay on the OTHER instance is refused —
  // this is the case a per-process Map could never catch.
  a.users.set('zoe2', { audioIdentity: { username: 'Zoe', level: 5 } });
  a.wallets.set('zoe', 400);
  const zoeOnA = a.makeSocket('zoe2', '7.7.7.7');
  await zoeOnA.fire('live:join', { liveId });
  const replay = await zoeOnA.fire('live:gift', { liveId, giftId: 'crown', nonce: 'x-1' });
  assert.strictEqual(replay.duplicate, true);
  assert.strictEqual(a.wallets.get('zoe'), 400);
  ok('a replayed nonce is refused on a DIFFERENT instance');

  await hostA.fire('live:mute', { liveId, targetSocketId: 'zoe1' });
  assert.strictEqual((await zoe.fire('live:comment', { liveId, text: 'hi' })).ok, false);
  ok('a mute issued on A is enforced on B');

  await a.engine.endLive(liveId, 'test');
  assert.strictEqual((await b.engine.listActive()).length, 0);
  ok('ending on A clears the room for B');

  a.engine.shutdown();
  b.engine.shutdown();
}

async function moderationUnit() {
  console.log('\n── liveModeration ──');
  const words = buildWordList(['spamword']);
  assert.strictEqual(filterText('hello there', words).blocked, false);
  ok('clean text passes');
  assert.strictEqual(filterText('you f u c k e r', words).blocked, true);
  ok('spaced-out evasion is caught');
  assert.strictEqual(filterText('buy my spamword now', words).blocked, true);
  ok('custom banned word is caught');
  assert.ok(!filterText('what the fuck', words).masked.toLowerCase().includes('fuck'));
  ok('offending word is masked, not dropped');

  const rl = createRateLimiter({ max: 2, windowMs: 1000 });
  assert.strictEqual(rl.check('k').ok, true);
  assert.strictEqual(rl.check('k').ok, true);
  assert.strictEqual(rl.check('k').ok, false);
  assert.strictEqual(rl.check('other').ok, true);
  ok('rate limiter buckets per key');
}

async function storeUnit() {
  console.log('\n── liveStore parity ──');
  for (const [label, client] of [['memory', null], ['redis', createFakeRedis()]]) {
    const s = createLiveStore({ getRedis: () => client });
    await s.createRoom({ id: 'r1', status: 'live', startedAt: Date.now(), likes: 0, giftCount: 0 });
    await s.bumpGifter('r1', 'alice', { username: 'A' }, 50);
    const top = await s.topGifters('r1', 3);
    assert.strictEqual(top[0].coins, 50, `${label}: coins`);
    assert.strictEqual(top[0].count, 1, `${label}: count applied once`);
    assert.strictEqual(await s.incrRoom('r1', 'likes', 3), 3, `${label}: incr`);
    assert.strictEqual(await s.claimNonce('alice', 'n', 5000), true);
    assert.strictEqual(await s.claimNonce('alice', 'n', 5000), false);
    await s.pushComment('r1', { id: 'c1', text: 'hi' });
    assert.strictEqual((await s.recentComments('r1')).length, 1);
    await s.dropComment('r1', 'c1');
    assert.strictEqual((await s.recentComments('r1')).length, 0);
    await s.markUnique('r1', 'alice');
    await s.markUnique('r1', 'alice');
    await s.markUnique('r1', 'bob');
    assert.strictEqual(await s.uniqueCount('r1'), 2, `${label}: unique count`);
    ok(`${label} store: writes apply exactly once`);
    await s.close?.();
  }
}

(async () => {
  await moderationUnit();
  await storeUnit();
  await suite('memory store', null);
  await suite('redis store', createFakeRedis());
  await crossInstance();
  console.log(`\n${passed} checks passed.\n`);
  process.exit(0);
})().catch((e) => {
  console.error('\n  ✗ FAILED:', e.message, '\n', e.stack);
  process.exit(1);
});
