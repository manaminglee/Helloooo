/**
 * Matchmaking checks — node server/__matchtest.js
 *
 * Runs the queue twice: once on the in-memory backend and once on a fake Redis,
 * because the two search paths are separate code and have drifted before. The
 * behaviours asserted here are the ones a user actually feels:
 *
 *   · someone who shares your interest wins over someone who does not
 *   · but nobody waits forever for a hobby match — tier 2 takes anyone
 *   · 'general' is not an interest, so it never counts as something shared
 *   · a skip does not put you straight back with the person you skipped
 *   · the queue read is O(1) round trips, not one per waiting person
 */
const assert = require('assert');
const { createMatchQueue, sharesInterest, interestsOf } = require('./matchQueue');
const { createFakeRedis } = require('./__fakeredis');

let passed = 0;
const ok = (name) => { passed += 1; console.log(`  ✓ ${name}`); };

/* ---------------------------------------------------------------- helpers */

/** A stand-in for enhancements.pickSmartMatch with the same scoring shape. */
function makePicker() {
  const GENERIC = new Set(['', 'general', 'any', 'anything', 'random']);
  const setOf = (primary, list) => {
    const out = new Set();
    for (const x of [primary, ...(list || [])]) {
      const v = String(x || '').trim().toLowerCase();
      if (v && !GENERIC.has(v)) out.add(v);
    }
    return out;
  };
  return async (queue, interest, region, language, canMatch, repFn, opts = {}) => {
    const eligible = queue.filter((e) => canMatch(e));
    if (!eligible.length) return null;
    const want = setOf(interest, opts.interests);
    const scored = eligible.map((e) => {
      let score = 0;
      let shared = 0;
      for (const v of setOf(e.interest, e.interests)) if (want.has(v)) shared += 1;
      if (shared > 0) score += 40 + Math.min(shared, 3) * 12;
      if (e.enqueuedAt) score += Math.min(6, (Date.now() - e.enqueuedAt) / 5000);
      return { entry: e, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].entry;
  };
}

function entryFor(id, interest, interests = []) {
  return {
    socketId: id,
    enqueuedAt: Date.now(),
    interest,
    interests,
    userData: { id: `u_${id}`, nickname: id, country: 'IN' },
  };
}

/**
 * Put people in the queue without letting them match each other — canMatch is
 * false while seating, so every one of them lands in the list and the search
 * under test starts from a known board.
 */
async function seatAll(queue, people, base) {
  for (const p of people) {
    const res = await queue.findOrEnqueue({
      ...base, canMatch: () => false, entry: p, interest: p.interest,
    });
    assert.strictEqual(res.status, 'waiting', `${p.socketId} should have queued, not matched`);
  }
}

/* ------------------------------------------------------------ the checks */

async function runBackend(label, { redisUrl, redisFactory }) {
  console.log(`\n── matchmaking (${label}) ──`);

  const memoryQueues = { text: [], video: [] };
  const queue = createMatchQueue();
  const io = { adapter: () => {}, sockets: { sockets: new Map() } };
  if (redisFactory) {
    // Inject the fake client the same way init would have.
    await queue.init({ io, redisUrl: null, memoryQueues });
    queue.__setRedisForTest?.(redisFactory());
  } else {
    await queue.init({ io, redisUrl, memoryQueues });
  }

  const base = {
    mode: 'video',
    isCreator: false,
    canMatch: () => true,
    isAvailable: () => true,
    pickSmartMatch: makePicker(),
    region: 'IN',
    language: 'en',
    repFn: async () => 0,
  };

  // 1 — shared interest beats no shared interest.
  await queue.clearAll();
  memoryQueues.video = [];
  await seatAll(queue, [
    entryFor('stranger_a', 'cooking'),
    entryFor('stranger_b', 'gaming'),
    entryFor('stranger_c', 'travel'),
  ], base);

  let res = await queue.findOrEnqueue({
    ...base,
    entry: entryFor('seeker', 'gaming', ['gaming']),
    interest: 'gaming',
  });
  assert.strictEqual(res.status, 'matched');
  assert.strictEqual(res.match.socketId, 'stranger_b', 'should have matched the gamer');
  ok('a shared interest wins over strangers with different interests');

  // 2 — more overlap beats less.
  await queue.clearAll();
  memoryQueues.video = [];
  await seatAll(queue, [
    entryFor('one_match', 'music', ['music']),
    entryFor('three_match', 'music', ['music', 'films', 'travel']),
  ], base);

  res = await queue.findOrEnqueue({
    ...base,
    entry: entryFor('seeker', 'music', ['music', 'films', 'travel']),
    interest: 'music',
  });
  assert.strictEqual(res.match.socketId, 'three_match', 'should prefer the deeper overlap');
  ok('more shared interests beats fewer');

  // 3 — nobody shares your interest: still match, don't strand them.
  await queue.clearAll();
  memoryQueues.video = [];
  await seatAll(queue, [entryFor('anyone', 'knitting')], base);

  res = await queue.findOrEnqueue({
    ...base,
    entry: entryFor('seeker', 'astrophysics', ['astrophysics']),
    interest: 'astrophysics',
  });
  assert.strictEqual(res.status, 'matched');
  assert.strictEqual(res.match.socketId, 'anyone');
  ok('with no interest overlap it still connects you to a stranger');

  // 4 — canMatch is respected, which is what keeps a skip from bouncing back.
  await queue.clearAll();
  memoryQueues.video = [];
  await seatAll(queue, [entryFor('just_skipped', 'gaming')], base);

  res = await queue.findOrEnqueue({
    ...base,
    canMatch: (e) => e.socketId !== 'just_skipped',
    entry: entryFor('seeker', 'gaming', ['gaming']),
    interest: 'gaming',
  });
  assert.strictEqual(res.status, 'waiting', 'the skipped partner must not be re-matched');
  ok('a blocked partner is never returned, so a skip finds someone new');

  // 5 — an unavailable entry is skipped rather than handed out.
  await queue.clearAll();
  memoryQueues.video = [];
  await seatAll(queue, [entryFor('ghost', 'gaming'), entryFor('real', 'gaming')], base);

  res = await queue.findOrEnqueue({
    ...base,
    isAvailable: (e) => e.socketId !== 'ghost',
    entry: entryFor('seeker', 'gaming', ['gaming']),
    interest: 'gaming',
  });
  assert.strictEqual(res.match.socketId, 'real');
  ok('entries that went away are swept, not matched');

  await queue.shutdown();
}

function testInterestHelpers() {
  console.log('\n── interest helpers ──');

  assert.strictEqual(sharesInterest({ interest: 'music' }, new Set(['music'])), true);
  assert.strictEqual(sharesInterest({ interests: ['films'] }, new Set(['films'])), true);
  assert.strictEqual(sharesInterest({ interest: 'music' }, new Set(['films'])), false);
  ok('a shared interest is detected in either the primary field or the list');

  for (const generic of ['general', 'any', 'random', '']) {
    assert.strictEqual(
      sharesInterest({ interest: generic }, interestsOf({ interest: generic })),
      false,
      `${generic || '(empty)'} must not count as a shared interest`,
    );
  }
  ok('the default interest never counts as something two people share');

  assert.strictEqual(sharesInterest({ interest: 'MUSIC ' }, new Set(['music'])), true);
  ok('interest matching ignores case and stray whitespace');
}

async function testQueueReadIsBounded() {
  console.log('\n── queue read cost ──');

  const fake = createFakeRedis();
  let gets = 0;
  let mgets = 0;
  const counting = new Proxy(fake, {
    get(target, prop) {
      if (prop === 'get') { return (...a) => { gets += 1; return target.get(...a); }; }
      if (prop === 'mGet') { return (...a) => { mgets += 1; return target.mGet(...a); }; }
      const v = target[prop];
      return typeof v === 'function' ? v.bind(target) : v;
    },
  });

  const queue = createMatchQueue();
  const io = { adapter: () => {}, sockets: { sockets: new Map() } };
  await queue.init({ io, redisUrl: null, memoryQueues: { text: [], video: [] } });
  queue.__setRedisForTest(counting);

  const base = {
    mode: 'video',
    isCreator: false,
    canMatch: () => false,          // force a full scan with no match
    isAvailable: () => true,
    pickSmartMatch: makePicker(),
    region: 'IN',
    language: 'en',
    repFn: async () => 0,
  };

  for (let i = 0; i < 40; i += 1) {
    await queue.findOrEnqueue({ ...base, entry: entryFor(`w${i}`, 'gaming'), interest: 'gaming' });
  }

  gets = 0;
  mgets = 0;
  await queue.findOrEnqueue({ ...base, entry: entryFor('seeker', 'gaming'), interest: 'gaming' });

  assert.strictEqual(gets, 0, `expected no per-entry GETs, saw ${gets}`);
  assert.strictEqual(mgets, 1, `expected exactly one MGET, saw ${mgets}`);
  ok('a search over 40 waiting people costs one MGET, not one GET each');

  await queue.shutdown();
}

(async () => {
  testInterestHelpers();
  await runBackend('memory', { redisUrl: null });
  await runBackend('redis', { redisFactory: createFakeRedis });
  await testQueueReadIsBounded();
  console.log(`\n✅ ${passed} matchmaking checks passed\n`);
})().catch((err) => {
  console.error('\n❌', err.message);
  process.exit(1);
});
