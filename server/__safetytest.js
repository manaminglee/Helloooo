/**
 * Match safety checks — node server/__safetytest.js
 *
 * The report ladder decides whether somebody gets to keep meeting strangers, so
 * the failure modes cut both ways and both are tested: letting an abuser keep
 * matching, and suspending an innocent person because one angry stranger
 * hammered the report button.
 */
const assert = require('assert');
const { createMatchSafety } = require('./matchSafety');

let passed = 0;
const ok = (name) => { passed += 1; console.log(`  ✓ ${name}`); };

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A safety instance on a clock we control, so nothing here sleeps. */
function harness() {
  let now = 1_700_000_000_000;
  const suspensions = [];
  const safety = createMatchSafety({
    now: () => now,
    onSuspend: (ev) => suspensions.push(ev),
  });
  return {
    safety,
    suspensions,
    advance: (ms) => { now += ms; },
    at: () => now,
  };
}

function testOneReporterCannotSuspend() {
  console.log('\n── a single reporter ──');
  const { safety } = harness();

  for (let i = 0; i < 25; i += 1) {
    safety.report('d:target', 'd:angry', 'spam');
  }

  assert.strictEqual(safety.isSuspended('d:target'), false);
  ok('one person reporting 25 times cannot suspend anybody');

  const status = safety.statusOf('d:target');
  assert.strictEqual(status.strikes, 0);
  ok('and it does not bank a strike for later either');
}

function testDistinctReportersSuspend() {
  console.log('\n── distinct reporters ──');
  const { safety, suspensions } = harness();

  safety.report('d:target', 'd:a');
  safety.report('d:target', 'd:b');
  assert.strictEqual(safety.isSuspended('d:target'), false, 'two reporters is under the threshold');
  ok('below the threshold nothing happens');

  safety.report('d:target', 'd:c', 'nudity');
  assert.strictEqual(safety.isSuspended('d:target'), true);
  assert.strictEqual(suspensions.length, 1);
  assert.strictEqual(suspensions[0].strikes, 1);
  assert.strictEqual(suspensions[0].reason, 'nudity');
  ok('three distinct reporters pauses matching and fires one notification');
}

function testSelfReportIgnored() {
  console.log('\n── self reports ──');
  const { safety } = harness();

  for (const who of ['d:me', 'd:me', 'd:me']) safety.report('d:me', who);
  assert.strictEqual(safety.isSuspended('d:me'), false);
  ok('you cannot suspend yourself');

  const res = safety.report('unknown', 'd:a');
  assert.strictEqual(res.counted, false);
  ok('a report with no identifiable target is dropped rather than pooled');
}

function testEscalationAndExpiry() {
  console.log('\n── the ladder ──');
  const h = harness();
  const { safety } = h;

  const strike = (n) => {
    safety.report('d:t', `d:r${n}a`);
    safety.report('d:t', `d:r${n}b`);
    safety.report('d:t', `d:r${n}c`);
  };

  strike(1);
  const first = safety.statusOf('d:t');
  assert.strictEqual(first.strikes, 1);
  assert.ok(first.secondsLeft <= 30 * 60 && first.secondsLeft > 29 * 60, `first pause should be ~30m, got ${first.secondsLeft}s`);
  ok('the first pause is short — a cooling-off, not a ban');

  // Reports during a live suspension must not stack another strike on top.
  safety.report('d:t', 'd:r9a');
  safety.report('d:t', 'd:r9b');
  safety.report('d:t', 'd:r9c');
  assert.strictEqual(safety.statusOf('d:t').strikes, 1);
  ok('reports arriving during a pause do not compound it');

  h.advance(31 * MINUTE);
  assert.strictEqual(safety.isSuspended('d:t'), false);
  ok('the pause lifts by itself when it expires');

  strike(2);
  const second = safety.statusOf('d:t');
  assert.strictEqual(second.strikes, 2);
  assert.ok(second.secondsLeft > 5 * 3600, `second pause should be hours, got ${second.secondsLeft}s`);
  ok('a second offence is meaningfully longer than the first');

  h.advance(7 * HOUR);
  strike(3);
  assert.strictEqual(safety.statusOf('d:t').strikes, 3);
  h.advance(25 * HOUR);
  strike(4);
  const fourth = safety.statusOf('d:t');
  assert.ok(fourth.secondsLeft > 6 * 86400, 'fourth should reach the 7-day step');
  ok('the ladder tops out at a length a human should review, not forever');
}

function testReportsExpire() {
  console.log('\n── ageing out ──');
  const h = harness();
  const { safety } = h;

  safety.report('d:t', 'd:a');
  safety.report('d:t', 'd:b');
  h.advance(8 * DAY);            // past the 7-day window
  safety.report('d:t', 'd:c');

  assert.strictEqual(safety.isSuspended('d:t'), false);
  ok('reports older than the window no longer count toward a suspension');
}

function testFlaggingAndReviewQueue() {
  console.log('\n── the moderator queue ──');
  const h = harness();
  const { safety } = h;

  for (const r of ['a', 'b', 'c']) safety.report('d:bad', `d:${r}`, 'abuse');
  h.advance(31 * MINUTE);
  for (const r of ['d', 'e', 'f']) safety.report('d:bad', `d:${r}`, 'abuse');

  const queue = safety.reviewQueue();
  const entry = queue.find((e) => e.key === 'd:bad');
  assert.ok(entry, 'a repeat offender must appear in the review queue');
  assert.strictEqual(entry.flagged, true);
  assert.strictEqual(entry.strikes, 2);
  ok('a second strike flags the person for a human to look at');

  safety.report('d:mild', 'd:x');
  assert.ok(!safety.reviewQueue().some((e) => e.key === 'd:mild'));
  ok('one report does not put somebody in front of a moderator');

  safety.clear('d:bad');
  assert.strictEqual(safety.isSuspended('d:bad'), false);
  assert.ok(!safety.reviewQueue().some((e) => e.key === 'd:bad'));
  ok('a moderator override lifts the pause and clears the history');
}

function testSweepKeepsMemoryBounded() {
  console.log('\n── memory ──');
  const h = harness();
  const { safety } = h;

  for (let i = 0; i < 500; i += 1) safety.report(`d:t${i}`, `d:r${i}`);
  assert.strictEqual(safety.size(), 500);

  h.advance(8 * DAY);
  safety.sweep();
  assert.strictEqual(safety.size(), 0, 'fully expired records should be dropped');
  ok('the sweep drops records nobody needs, so the map cannot grow forever');

  // Strike history has to outlive the pause it caused, or somebody who
  // offends once a month sits on strike 1 forever and never escalates.
  for (const r of ['a', 'b', 'c']) safety.report('d:keep', `d:${r}`);
  h.advance(2 * DAY);
  safety.sweep();
  assert.strictEqual(safety.isSuspended('d:keep'), false, 'the pause itself should be over');
  assert.strictEqual(safety.statusOf('d:keep').strikes, 1, 'the strike must survive the expired pause');
  ok('a strike outlives the pause it caused, so the next offence escalates');

  for (const r of ['x', 'y', 'z']) safety.report('d:keep', `d:${r}`);
  assert.strictEqual(safety.statusOf('d:keep').strikes, 2);
  ok('and the next offence really is treated as a second strike');

  // But it decays, so a pause from a month ago is not held against them.
  h.advance(30 * DAY);
  safety.sweep();
  for (const r of ['p', 'q', 'r']) safety.report('d:keep', `d:${r}`);
  assert.strictEqual(safety.statusOf('d:keep').strikes, 1, 'old strikes should have decayed');
  ok('strikes decay after the window — an old pause is not a life sentence');
}

function testListenerCannotBreakReporting() {
  console.log('\n── robustness ──');
  const safety = createMatchSafety({
    onSuspend: () => { throw new Error('listener blew up'); },
  });

  for (const r of ['a', 'b', 'c']) safety.report('d:t', `d:${r}`);
  assert.strictEqual(safety.isSuspended('d:t'), true);
  ok('a throwing listener does not stop the suspension from taking effect');
}

function testRelayCredentialGuard() {
  console.log('\n── TURN relay credentials ──');
  const { assertRelayCredentialsUsable } = require('./iceServers');

  const dev = assertRelayCredentialsUsable({ NODE_ENV: 'development' });
  assert.strictEqual(dev.ok, true);
  assert.strictEqual(dev.level, 'warn');
  ok('development warns about the demo relay but still starts');

  const prod = assertRelayCredentialsUsable({ NODE_ENV: 'production' });
  assert.strictEqual(prod.ok, false);
  assert.strictEqual(prod.level, 'fatal');
  assert.ok(/black video/i.test(prod.message), 'the error must say what users will actually see');
  ok('production refuses to start on public demo credentials');

  const owned = assertRelayCredentialsUsable({
    NODE_ENV: 'production', TURN_URL: 't', TURN_USERNAME: 'u', TURN_PASSWORD: 'p',
  });
  assert.strictEqual(owned.level, 'ok');
  ok('an operator-owned TURN passes');

  const ownFallback = assertRelayCredentialsUsable({
    NODE_ENV: 'production', TURN_FALLBACK_USERNAME: 'mine', TURN_FALLBACK_PASSWORD: 'secret',
  });
  assert.strictEqual(ownFallback.level, 'ok');
  ok('your own shared-relay credentials pass too');

  const override = assertRelayCredentialsUsable({ NODE_ENV: 'production', TURN_ALLOW_DEMO_RELAY: '1' });
  assert.strictEqual(override.ok, true);
  ok('the escape hatch works, but has to be set on purpose');
}

(function run() {
  testOneReporterCannotSuspend();
  testDistinctReportersSuspend();
  testSelfReportIgnored();
  testEscalationAndExpiry();
  testReportsExpire();
  testFlaggingAndReviewQueue();
  testSweepKeepsMemoryBounded();
  testListenerCannotBreakReporting();
  testRelayCredentialGuard();
  console.log(`\n✅ ${passed} match-safety / relay checks passed\n`);
}());
