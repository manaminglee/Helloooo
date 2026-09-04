/**
 * Agency tenancy self-test —  node server/__agencytest.js
 *
 * Covers the three things that are easy to get silently wrong:
 *   - mint accrual (per-minute drip, daily compounding, both caps)
 *   - commission arithmetic (funded from the platform cut, split correctly)
 *   - tenant isolation (one agency must never see or touch another's data)
 *
 * Time is injected, so the "every day" behaviour is asserted in milliseconds
 * rather than waited for.
 */
const assert = require('assert');
const { registerAgencyTenancy, DAY_MS, MAX_COMMISSION_PCT } = require('./agencyTenancy');

let passed = 0;
const ok = (name) => { passed += 1; console.log(`  ✓ ${name}`); };

/* ---------------- fakes ---------------- */
function makeWorld() {
  const localDb = { creators: [], withdrawals: [] };
  const routes = new Map();
  const app = {
    get: (p, ...h) => routes.set(`GET ${p}`, h),
    post: (p, ...h) => routes.set(`POST ${p}`, h),
  };
  const wallets = new Map();
  const audioIdentity = {
    getByUsername: (u) => (wallets.has(u) ? { usernameKey: u, username: u, coins: wallets.get(u) } : null),
    credit: async (k, n) => {
      if (!wallets.has(k)) return { ok: false, error: 'Identity not found' };
      wallets.set(k, wallets.get(k) + n);
      return { ok: true, balance: wallets.get(k) };
    },
  };

  let clock = Date.parse('2026-03-01T00:00:00.000Z');
  const tenancy = registerAgencyTenancy(app, { emit() {} }, {
    localDb,
    saveLocalDb: () => {},
    supabase: null,
    audioIdentity,
    audit: () => {},
    getSuperKey: () => 'super-operator-key',
    getMarket: () => ({ nutsToInr: (n) => n / 100, getRate: () => 100 }),
    now: () => clock,
  });

  return {
    localDb, tenancy, wallets, routes,
    at: (ms) => { clock = ms; },
    advance: (ms) => { clock += ms; },
    clockNow: () => clock,
  };
}

/** Minimal express req double. */
const req = (headers = {}, extra = {}) => ({
  headers,
  header: (h) => headers[h.toLowerCase()],
  query: {},
  body: {},
  ...extra,
});

/** requireTenant rejects on a falsy scope, so that is what we assert on. */
const assertDenied = (ctx, msg) => assert.ok(!ctx.scope, msg);

async function main() {
  /* ===================== mint accrual ===================== */
  console.log('\n── mint engine ──');
  {
    const w = makeWorld();
    const created = await w.tenancy.createAgency({
      name: 'Nova Talent',
      ownerEmail: 'owner@nova.test',
      ownerPassword: 'a-long-enough-password',
      mintDailyAllowance: 144000, // 100 Nuts per minute exactly
      mintGrowthPct: 0.1,
      mintPoolCap: 10_000_000,
      commissionPct: 0.5,
    });
    assert.ok(created.ok, created.error);
    assert.ok(created.agencyKey.startsWith('agk_'), 'key is prefixed');
    ok('admin can mint an agency and gets a one-time key');

    const agency = w.tenancy.agencyById(created.agency.id);
    assert.strictEqual(w.tenancy.mintView(agency).poolNuts, 0);
    ok('a fresh agency starts with an empty pool');

    w.advance(60_000);
    assert.strictEqual(w.tenancy.mintView(agency).poolNuts, 100);
    ok('the pool drips every minute');

    w.advance(9 * 60_000);
    assert.strictEqual(w.tenancy.mintView(agency).poolNuts, 1000);
    ok('ten minutes of drip accrues ten minutes of Nuts');

    // Sub-minute reads must not round away the remainder.
    const before = w.tenancy.mintView(agency).poolNuts;
    for (let i = 0; i < 6; i += 1) { w.advance(10_000); w.tenancy.mintView(agency); }
    assert.strictEqual(w.tenancy.mintView(agency).poolNuts, before + 100);
    ok('six 10-second reads accrue the same as one 60-second read');

    // A single day can never mint more than the allowance.
    w.advance(2 * DAY_MS);
    const afterTwoDays = w.tenancy.mintView(agency);
    assert.ok(afterTwoDays.dailyAllowance > 144000, 'allowance compounded');
    assert.strictEqual(afterTwoDays.dailyAllowance, Math.floor(144000 * 1.1 * 1.1));
    ok('the daily allowance compounds once per elapsed day');

    assert.ok(
      afterTwoDays.accruedToday <= afterTwoDays.dailyAllowance,
      `accrued ${afterTwoDays.accruedToday} exceeded allowance ${afterTwoDays.dailyAllowance}`,
    );
    ok('a day never mints more than its allowance');

    assert.strictEqual(afterTwoDays.perMinute, Math.round(afterTwoDays.dailyAllowance / 1440));
    ok('perMinute is reported from the current allowance');
  }

  {
    // The pool cap has to hold even across a long gap.
    const w = makeWorld();
    const created = await w.tenancy.createAgency({
      name: 'Capped', ownerEmail: 'c@c.test', ownerPassword: 'a-long-enough-password',
      mintDailyAllowance: 100000, mintGrowthPct: 0, mintPoolCap: 250,
    });
    const agency = w.tenancy.agencyById(created.agency.id);
    w.advance(30 * DAY_MS);
    assert.strictEqual(w.tenancy.mintView(agency).poolNuts, 250);
    ok('the pool never exceeds its cap');
  }

  {
    // A suspended agency must stop printing.
    const w = makeWorld();
    const created = await w.tenancy.createAgency({
      name: 'Paused', ownerEmail: 'p@p.test', ownerPassword: 'a-long-enough-password',
      mintDailyAllowance: 144000, mintGrowthPct: 0,
    });
    const agency = w.tenancy.agencyById(created.agency.id);
    w.advance(60_000);
    const running = w.tenancy.mintView(agency).poolNuts;
    w.tenancy.updateAgency(agency.id, { status: 'suspended' });
    w.advance(10 * 60_000);
    assert.strictEqual(w.tenancy.mintView(agency).poolNuts, running);
    ok('a suspended agency stops minting');
  }

  /* ===================== selling ===================== */
  console.log('\n── selling minted Nuts ──');
  {
    const w = makeWorld();
    const created = await w.tenancy.createAgency({
      name: 'Seller', ownerEmail: 's@s.test', ownerPassword: 'a-long-enough-password',
      mintDailyAllowance: 144000, mintGrowthPct: 0,
    });
    const agency = w.tenancy.agencyById(created.agency.id);
    w.wallets.set('buyer', 10);
    w.advance(10 * 60_000); // 1000 in the pool

    const sold = await w.tenancy.sellNuts(agency, null, { username: 'buyer', nuts: 400 });
    assert.ok(sold.ok, sold.error);
    assert.strictEqual(w.wallets.get('buyer'), 410);
    assert.strictEqual(sold.poolNuts, 600);
    ok('selling moves Nuts from the pool into a user wallet');

    const tooBig = await w.tenancy.sellNuts(agency, null, { username: 'buyer', nuts: 5000 });
    assert.strictEqual(tooBig.ok, false);
    assert.strictEqual(w.wallets.get('buyer'), 410);
    assert.strictEqual(w.tenancy.mintView(agency).poolNuts >= 600, true);
    ok('overselling the pool is refused and charges nothing');

    const unknown = await w.tenancy.sellNuts(agency, null, { username: 'ghost', nuts: 10 });
    assert.strictEqual(unknown.ok, false);
    // The pool must be restored when the wallet credit cannot land.
    assert.strictEqual(w.tenancy.mintView(agency).poolNuts >= 600, true);
    ok('a failed credit does not consume pool Nuts');
  }

  /* ===================== commission ===================== */
  console.log('\n── commission ──');
  {
    const w = makeWorld();
    const created = await w.tenancy.createAgency({
      name: 'Comm', ownerEmail: 'o@comm.test', ownerPassword: 'a-long-enough-password',
      commissionPct: 0.5, ownerOverridePct: 0.2,
    });
    const agency = w.tenancy.agencyById(created.agency.id);
    const scout = await w.tenancy.addMember(agency, {
      email: 'scout@comm.test', password: 'a-long-enough-password', name: 'Scout', commissionPct: 0.5,
    });
    assert.ok(scout.ok, scout.error);

    const invite = w.tenancy.createInvite(agency, { id: scout.member.id }, { label: 'IG push' });
    assert.ok(invite.ok);
    ok('a member can generate an invite code');

    const creator = { id: 'cr1', handle_name: 'luna', status: 'pending' };
    w.localDb.creators.push(creator);
    const consumed = w.tenancy.consumeInvite(invite.invite.code, creator);
    assert.ok(consumed.ok, consumed.error);
    Object.assign(creator, consumed.patch);
    assert.strictEqual(creator.status, 'approved');
    assert.strictEqual(creator.agency_id, agency.id);
    assert.strictEqual(creator.agency_member_id, scout.member.id);
    ok('an invited creator is approved instantly and bound to the recruiter');

    // 1000-Nut gift, creator keeps 700 → platform cut is 300.
    const settled = w.tenancy.settleCommission({
      creatorId: 'cr1', giftCost: 1000, creatorShare: 700, giftId: 'g1', liveId: 'l1',
    });
    assert.ok(settled, 'commission settled');
    assert.strictEqual(settled.platformShare, 300);
    assert.strictEqual(settled.total, 150); // 50% of the platform cut
    ok('commission is 50% of the platform cut, not of the gift');

    assert.strictEqual(creator.coins_earned || 0, 0);
    ok('the creator row is never debited to pay commission');

    // 150 total → scout 50% = 75, owner override 20% of 75 = 15, scout keeps 60.
    assert.strictEqual(settled.ownerCut, 15);
    assert.strictEqual(settled.recruiterCut, 60);
    assert.strictEqual(settled.houseCut, 75);
    assert.strictEqual(settled.recruiterCut + settled.ownerCut + settled.houseCut, settled.total);
    ok('recruiter, owner override and house shares sum to the commission');

    const members = w.tenancy.membersOf(agency.id).map(w.tenancy.publicMember);
    assert.strictEqual(members.find((m) => m.id === scout.member.id).earnedNuts, 60);
    assert.strictEqual(members.find((m) => m.role === 'owner').earnedNuts, 15);
    ok('member balances reflect their cut');

    const roster = w.tenancy.rosterOf(agency);
    assert.strictEqual(roster.length, 1);
    assert.strictEqual(roster[0].handle, 'luna');
    assert.strictEqual(roster[0].commissionGeneratedNuts, 150);
    ok('the roster attributes generated commission to the creator');

    // A creator with no agency generates nothing.
    w.localDb.creators.push({ id: 'cr2', handle_name: 'solo', status: 'approved' });
    assert.strictEqual(
      w.tenancy.settleCommission({ creatorId: 'cr2', giftCost: 1000, creatorShare: 700 }),
      null,
    );
    ok('an unaffiliated creator pays no commission');

    // A gift that leaves no platform cut cannot pay a commission.
    assert.strictEqual(
      w.tenancy.settleCommission({ creatorId: 'cr1', giftCost: 100, creatorShare: 100 }),
      null,
    );
    ok('a gift with no platform cut pays no commission');

    // Commission can never be configured to exceed the platform cut.
    w.tenancy.updateAgency(agency.id, { commissionPct: 5 });
    assert.strictEqual(w.tenancy.agencyById(agency.id).commission_pct, MAX_COMMISSION_PCT);
    ok('commission percentage is clamped to the platform cut');
  }

  /* ===================== invites ===================== */
  console.log('\n── invites ──');
  {
    const w = makeWorld();
    const created = await w.tenancy.createAgency({
      name: 'Inv', ownerEmail: 'o@inv.test', ownerPassword: 'a-long-enough-password',
    });
    const agency = w.tenancy.agencyById(created.agency.id);

    const single = w.tenancy.createInvite(agency, null, { maxUses: 1 });
    w.tenancy.consumeInvite(single.invite.code, { id: 'x1' });
    assert.strictEqual(w.tenancy.checkInvite(single.invite.code).ok, false);
    ok('a single-use invite stops working after one use');

    // Registration validates early, then claims just before the insert. The
    // claim itself must be the gate, or two racing signups both get approved.
    const raced = w.tenancy.createInvite(agency, null, { maxUses: 1 });
    assert.strictEqual(w.tenancy.checkInvite(raced.invite.code).ok, true);
    assert.strictEqual(w.tenancy.checkInvite(raced.invite.code).ok, true);
    assert.strictEqual(w.tenancy.consumeInvite(raced.invite.code, { id: 'r1' }).ok, true);
    assert.strictEqual(w.tenancy.consumeInvite(raced.invite.code, { id: 'r2' }).ok, false);
    ok('two signups that both passed the early check cannot both claim one use');

    // A failed insert must hand the use back rather than burn it.
    const rolled = w.tenancy.createInvite(agency, null, { maxUses: 1 });
    assert.strictEqual(w.tenancy.consumeInvite(rolled.invite.code, { id: 'f1' }).ok, true);
    assert.strictEqual(w.tenancy.checkInvite(rolled.invite.code).ok, false);
    w.tenancy.releaseInvite(rolled.invite.code);
    assert.strictEqual(w.tenancy.checkInvite(rolled.invite.code).ok, true);
    ok('releasing a claim after a failed signup restores the use');

    // Release must never push uses below zero and mint free uses.
    const floorTest = w.tenancy.createInvite(agency, null, { maxUses: 1 });
    w.tenancy.releaseInvite(floorTest.invite.code);
    w.tenancy.releaseInvite(floorTest.invite.code);
    assert.strictEqual(w.tenancy.consumeInvite(floorTest.invite.code, { id: 'z1' }).ok, true);
    assert.strictEqual(w.tenancy.consumeInvite(floorTest.invite.code, { id: 'z2' }).ok, false);
    ok('releasing an unclaimed invite cannot create extra uses');

    const revocable = w.tenancy.createInvite(agency, null, {});
    w.tenancy.revokeInvite(agency, revocable.invite.code);
    assert.strictEqual(w.tenancy.checkInvite(revocable.invite.code).ok, false);
    ok('a revoked invite is refused');

    const expiring = w.tenancy.createInvite(agency, null, { expiresInDays: 1 });
    w.advance(2 * DAY_MS);
    assert.strictEqual(w.tenancy.checkInvite(expiring.invite.code).ok, false);
    ok('an expired invite is refused');

    assert.strictEqual(w.tenancy.checkInvite('NOPE1234').ok, false);
    ok('an unknown invite code is refused');

    w.tenancy.updateAgency(agency.id, { status: 'suspended' });
    const afterSuspend = w.tenancy.createInvite(agency, null, {});
    assert.strictEqual(w.tenancy.checkInvite(afterSuspend.invite.code).ok, false);
    ok('a suspended agency cannot recruit');
  }

  /* ===================== auth + tenant isolation ===================== */
  console.log('\n── auth & isolation ──');
  {
    const w = makeWorld();
    const a = await w.tenancy.createAgency({
      name: 'Alpha', ownerEmail: 'owner@alpha.test', ownerPassword: 'alpha-password-long',
    });
    const b = await w.tenancy.createAgency({
      name: 'Beta', ownerEmail: 'owner@beta.test', ownerPassword: 'beta-password-long',
    });

    assertDenied(w.tenancy.resolveContext(req({})), 'no credentials');
    ok('an unauthenticated request resolves to no scope');

    assert.strictEqual(
      w.tenancy.resolveContext(req({ 'x-agency-key': 'super-operator-key' })).scope,
      'super',
    );
    ok('the operator key resolves to super scope');

    const asA = w.tenancy.resolveContext(req({ 'x-agency-key': a.agencyKey }));
    assert.strictEqual(asA.scope, 'owner');
    assert.strictEqual(asA.agency.id, a.agency.id);
    ok('a per-agency key resolves to that agency only');

    // Same agency id, wrong secret.
    const forged = `${a.agencyKey.split('.')[0]}.${'0'.repeat(48)}`;
    assertDenied(w.tenancy.resolveContext(req({ 'x-agency-key': forged })), 'forged secret');
    ok('a forged secret for a real agency id is refused');

    // Agency A's key must not resolve to agency B.
    assert.notStrictEqual(
      w.tenancy.resolveContext(req({ 'x-agency-key': b.agencyKey })).agency.id,
      a.agency.id,
    );
    ok('one agency key never resolves to another agency');

    const login = await w.tenancy.login({ email: 'owner@alpha.test', password: 'alpha-password-long' });
    assert.ok(login.ok, login.error);
    assert.strictEqual(login.member.role, 'owner');
    const bySession = w.tenancy.resolveContext(req({ 'x-agency-session': login.token }));
    assert.strictEqual(bySession.agency.id, a.agency.id);
    ok('owner email/password login yields a session scoped to their agency');

    assert.strictEqual((await w.tenancy.login({ email: 'owner@alpha.test', password: 'wrong' })).ok, false);
    assert.strictEqual((await w.tenancy.login({ email: 'nobody@x.test', password: 'whatever' })).ok, false);
    ok('bad credentials are refused');

    const scout = await w.tenancy.addMember(w.tenancy.agencyById(a.agency.id), {
      email: 'scout@alpha.test', password: 'scout-password-long', name: 'Scout',
    });
    const scoutLogin = await w.tenancy.login({ email: 'scout@alpha.test', password: 'scout-password-long' });
    assert.strictEqual(
      w.tenancy.resolveContext(req({ 'x-agency-session': scoutLogin.token })).scope,
      'member',
    );
    ok('a non-owner member resolves to member scope');

    w.tenancy.updateMember(w.tenancy.agencyById(a.agency.id), scout.member.id, { status: 'disabled' });
    assertDenied(
      w.tenancy.resolveContext(req({ 'x-agency-session': scoutLogin.token })),
      'disabled member session',
    );
    ok('disabling a member kills their live session');

    // Rotating the key must invalidate the old one.
    const rotated = await w.tenancy.rotateKey(a.agency.id);
    assertDenied(w.tenancy.resolveContext(req({ 'x-agency-key': a.agencyKey })), 'old key');
    assert.strictEqual(w.tenancy.resolveContext(req({ 'x-agency-key': rotated.agencyKey })).scope, 'owner');
    ok('rotating an agency key revokes the previous one');

    // Rosters must not bleed across tenants.
    w.localDb.creators.push(
      { id: 'ca', handle_name: 'alpha1', agency_id: a.agency.id, status: 'approved' },
      { id: 'cb', handle_name: 'beta1', agency_id: b.agency.id, status: 'approved' },
    );
    const rosterA = w.tenancy.rosterOf(w.tenancy.agencyById(a.agency.id));
    assert.deepStrictEqual(rosterA.map((c) => c.handle), ['alpha1']);
    ok("an agency roster contains only that agency's creators");

    // Commission for B's creator must never touch A.
    const beforeA = w.tenancy.agencyById(a.agency.id).commission_earned_nuts;
    w.tenancy.settleCommission({ creatorId: 'cb', giftCost: 1000, creatorShare: 700 });
    assert.strictEqual(w.tenancy.agencyById(a.agency.id).commission_earned_nuts, beforeA);
    assert.ok(w.tenancy.agencyById(b.agency.id).commission_earned_nuts > 0);
    ok("a creator's gift only pays their own agency");

    // Duplicate owner emails across agencies would make login ambiguous.
    const dupe = await w.tenancy.createAgency({
      name: 'Dupe', ownerEmail: 'owner@alpha.test', ownerPassword: 'another-long-password',
    });
    assert.strictEqual(dupe.ok, false);
    ok('an email cannot own two agencies');
  }

  console.log(`\n${passed} checks passed.\n`);
}

main().catch((e) => {
  console.error(`\n  ✗ FAILED: ${e.message}\n`);
  console.error(e);
  process.exit(1);
});
