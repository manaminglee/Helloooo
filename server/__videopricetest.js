/**
 * Video pricing + matching helpers — node server/__videopricetest.js
 *
 * Covers both flag states: payments off (default, everything free) and on
 * (premium extras cost coins and are rejected without a balance).
 */
const assert = require('assert');
const vp = require('./videoPricing');

let passed = 0;
const ok = (name) => { passed += 1; console.log(`  ✓ ${name}`); };

function withEnv(vars, fn) {
  const prev = {};
  for (const [k, v] of Object.entries(vars)) {
    prev[k] = process.env[k];
    if (v == null) delete process.env[k];
    else process.env[k] = String(v);
  }
  try { return fn(); }
  finally {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

function testCatalogAndFlag() {
  console.log('\n── catalog + feature flag ──');
  withEnv({ VIDEO_PAYMENTS_ENABLED: null }, () => {
    assert.strictEqual(vp.paymentsEnabled(), false);
    const catalog = vp.publicCatalog();
    assert.strictEqual(catalog.enabled, false);
    assert.strictEqual(catalog.video.extendSessionCoins, 15);
    assert.strictEqual(catalog.groupVideo.freeMaxSize, 4);
    assert.strictEqual(catalog.groupVideo.creatorFreeMaxSize, 8);
    ok('payments default to off and expose configurable price points');
  });

  withEnv({ VIDEO_PAYMENTS_ENABLED: 'true', VIDEO_GENDER_FILTER_COINS: '21' }, () => {
    assert.strictEqual(vp.paymentsEnabled(), true);
    assert.strictEqual(vp.getVideoPricing().video.genderFilterCoins, 21);
    ok('VIDEO_PAYMENTS_ENABLED=true turns charging on and env overrides prices');
  });
}

function testFilterCostBothStates() {
  console.log('\n── filter costs ──');
  const req = { matchGender: 'female', matchCountryOnly: true, matchRegionOnly: false, reconnectToUserId: 'u1' };

  withEnv({ VIDEO_PAYMENTS_ENABLED: null }, () => {
    const free = vp.filterCost(req);
    assert.strictEqual(free.coins, 0);
    assert.strictEqual(free.complimentary, true);
    ok('with the flag off, gender/country/reconnect filters cost nothing');
  });

  withEnv({ VIDEO_PAYMENTS_ENABLED: '1' }, () => {
    const paid = vp.filterCost(req);
    assert.strictEqual(paid.coins, 10 + 8 + 20);
    assert.strictEqual(paid.items.length, 3);
    const pro = vp.filterCost({ ...req, isPro: true });
    assert.strictEqual(pro.coins, 0);
    assert.strictEqual(pro.complimentary, true);
    const none = vp.filterCost({});
    assert.strictEqual(none.coins, 0);
    ok('with the flag on, filters add up and Pro users are not charged');
  });
}

function testSessionLimits() {
  console.log('\n── session limits ──');
  withEnv({ VIDEO_PAYMENTS_ENABLED: null }, () => {
    assert.strictEqual(vp.sessionLimitSeconds({}), null);
    ok('no session cap when payments are off');
  });
  withEnv({ VIDEO_PAYMENTS_ENABLED: 'true' }, () => {
    assert.strictEqual(vp.sessionLimitSeconds({}), 300);
    assert.strictEqual(vp.sessionLimitSeconds({ isPro: true }), null);
    ok('free users get a timed session when payments are on; Pro does not');
  });
}

function testGroupCosts() {
  console.log('\n── group room costs ──');
  withEnv({ VIDEO_PAYMENTS_ENABLED: null }, () => {
    const cost = vp.groupCreateCost({ maxSize: 12, isPrivate: true, isCreator: false });
    assert.strictEqual(cost.coins, 0);
    assert.strictEqual(vp.freeGroupMaxSize(false), 4);
    assert.strictEqual(vp.freeGroupMaxSize(true), 8);
    assert.strictEqual(vp.clampGroupMaxSize(12, false), 12);
    ok('group extras are free when the flag is off; creators still get a higher free cap');
  });

  withEnv({ VIDEO_PAYMENTS_ENABLED: 'true' }, () => {
    const guestLarge = vp.groupCreateCost({ maxSize: 8, isPrivate: false, isCreator: false });
    assert.strictEqual(guestLarge.coins, 25);
    const creatorLarge = vp.groupCreateCost({ maxSize: 8, isPrivate: false, isCreator: true });
    assert.strictEqual(creatorLarge.coins, 0);
    const creatorXl = vp.groupCreateCost({ maxSize: 12, isPrivate: true, isCreator: true });
    assert.strictEqual(creatorXl.coins, 50 + 30);
    const guestPrivate = vp.groupCreateCost({ maxSize: 4, isPrivate: true, isCreator: false });
    assert.strictEqual(guestPrivate.coins, 30);
    assert.strictEqual(vp.assertEntryFee(10), 10);
    assert.strictEqual(vp.assertEntryFee(7), 0);
    assert.strictEqual(vp.effectiveEntryFee({ entryFee: 25 }), 25);
    ok('when payments are on, larger/private rooms charge guests; creators keep the 8-seat cap free');
  });

  withEnv({ VIDEO_PAYMENTS_ENABLED: null }, () => {
    assert.strictEqual(vp.effectiveEntryFee({ entryFee: 25 }), 0);
    ok('entry fees are ignored while payments are off');
  });
}

function testGenderMatch() {
  console.log('\n── gender matching ──');
  assert.strictEqual(vp.normalizeGender('Female'), 'female');
  assert.strictEqual(vp.normalizeGender('nb'), 'other');
  assert.strictEqual(vp.normalizeGender('xyz'), '');
  assert.strictEqual(vp.gendersCompatible('male', 'female', 'female', ''), true);
  assert.strictEqual(vp.gendersCompatible('male', 'female', 'male', ''), false);
  assert.strictEqual(vp.gendersCompatible('male', '', 'female', 'male'), true);
  assert.strictEqual(vp.gendersCompatible('male', '', 'female', 'female'), false);
  assert.strictEqual(vp.gendersCompatible('', '', 'female', ''), true);
  ok('gender filters are reciprocal and ignore unset preferences');
}

async function testChargeHelper() {
  console.log('\n── wallet charge helper ──');
  let balance = 40;
  const wallet = {
    getBalance: async () => balance,
    debit: async (_ctx, amt) => {
      if (balance < amt) return { ok: false, error: 'Insufficient coins' };
      balance -= amt;
      return { ok: true, balance };
    },
  };

  const free = await vp.chargeIfNeeded(wallet, {}, { coins: 0 }, 'x');
  assert.strictEqual(free.ok, true);
  assert.strictEqual(free.charged, 0);
  ok('a zero-cost charge is a no-op');

  const okSpend = await vp.chargeIfNeeded(wallet, {}, { coins: 15, items: [{ id: 'extend', coins: 15 }] }, 'video_session_extend');
  assert.strictEqual(okSpend.ok, true);
  assert.strictEqual(okSpend.charged, 15);
  assert.strictEqual(okSpend.balance, 25);
  ok('debit succeeds when the wallet can cover the catalog price');

  const fail = await vp.chargeIfNeeded(wallet, {}, { coins: 50 }, 'video_session_unlimited');
  assert.strictEqual(fail.ok, false);
  assert.strictEqual(fail.needCoins, 50);
  assert.strictEqual(balance, 25);
  ok('debit is refused server-side when the balance is too low');
}

function testSessionTimers() {
  console.log('\n── session timer helpers ──');
  const room = { id: 'r1' };
  const state = vp.startVideoSession(room, { unlimited: true });
  assert.strictEqual(state.unlimited, true);
  assert.strictEqual(room.videoSession.paused, false);

  const timed = { id: 'r2' };
  vp.startVideoSession(timed, { unlimited: false, freeSeconds: 120 });
  assert.ok(timed.videoSession.videoUntil > Date.now());
  const ext = vp.extendVideoSession(timed, { seconds: 60 });
  assert.ok(ext.remainingSeconds >= 120);
  vp.extendVideoSession(timed, { unlimited: true });
  assert.strictEqual(timed.videoSession.unlimited, true);
  vp.clearVideoTimers(timed);
  vp.clearVideoTimers(room);
  ok('session start / extend / unlimited transitions stay consistent');
}

function testAnonAndCreatorStats() {
  console.log('\n── anon handle + creator stats ──');
  const guest = {};
  const handle = vp.ensureAnonHandle(guest, () => Buffer.from('abc123', 'hex'));
  assert.strictEqual(handle, 'anon-abc123');
  assert.strictEqual(vp.ensureAnonHandle(guest, () => Buffer.from('ffff', 'hex')), 'anon-abc123');
  ok('anonymous handles are generated once and then reused');

  const creator = { isCreator: true };
  vp.bumpCreatorStats(creator, 'matches');
  vp.bumpCreatorStats(creator, 'followInvites', 2);
  assert.deepStrictEqual(creator.creatorVideoStats, {
    matches: 1, seconds: 0, followInvites: 2, followsGained: 0,
  });
  assert.strictEqual(vp.bumpCreatorStats({ isCreator: false }, 'matches'), null);
  ok('creator video stats increment only for verified creators');
}

async function main() {
  console.log('\nvideo pricing checks');
  testCatalogAndFlag();
  testFilterCostBothStates();
  testSessionLimits();
  testGroupCosts();
  testGenderMatch();
  await testChargeHelper();
  testSessionTimers();
  testAnonAndCreatorStats();
  console.log(`\n${passed} checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
