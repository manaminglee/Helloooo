/**
 * Security regressions —  node server/__sectest.js
 *
 * Covers two fixed vulnerabilities:
 *
 * 1. referral_code is accepted as a legacy creator credential, yet public
 *    lookups used to return it. Knowing a creator's public handle was enough to
 *    read their code and then drain their balance to an attacker's UPI.
 * 2. Client IP came from the leftmost X-Forwarded-For entry, which is whatever
 *    the client claimed, so IP bans, rate limits and IP-keyed sessions could all
 *    be evaded by sending a header.
 */
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { httpClientIp, socketClientIp, normalizeIp } = require('./clientIp');
const creatorSecurity = require('./creatorSecurity');

const PORT = 3996;
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_KEY = 'test-admin-key-please-ignore';

let passed = 0;
const ok = (name) => { passed += 1; console.log(`  ✓ ${name}`); };

async function req(method, url, { body, headers = {} } = {}) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body: json };
}

function testClientIp() {
  console.log('\n── client IP cannot be forged ──');

  const socket = (xff, address = '10.0.0.1') => ({
    handshake: { headers: xff === null ? {} : { 'x-forwarded-for': xff }, address },
  });

  // The proxy appends the real peer, so the claimed value sits on the left.
  assert.strictEqual(socketClientIp(socket('1.2.3.4, 203.0.113.9')), '203.0.113.9');
  ok('a claimed X-Forwarded-For entry loses to the proxy-appended one');

  assert.strictEqual(socketClientIp(socket('9.9.9.9, 8.8.8.8, 203.0.113.9')), '203.0.113.9');
  ok('a long forged chain still resolves to the real peer');

  assert.strictEqual(socketClientIp(socket('203.0.113.9')), '203.0.113.9');
  ok('an honest single-entry chain is used as-is');

  assert.strictEqual(socketClientIp(socket(null)), '10.0.0.1');
  ok('no header falls back to the socket address');

  assert.strictEqual(socketClientIp(socket('  , 203.0.113.9 ,')), '203.0.113.9');
  ok('blank chain entries are ignored');

  assert.strictEqual(normalizeIp('::ffff:203.0.113.9'), '203.0.113.9');
  assert.strictEqual(normalizeIp('::1'), '127.0.0.1');
  ok('IPv4-mapped and loopback addresses are normalized');

  // Express resolves the chain from `trust proxy`, so req.ip is authoritative
  // and the raw header must not be consulted.
  const forged = { ip: '203.0.113.9', headers: { 'x-forwarded-for': '1.2.3.4' } };
  assert.strictEqual(httpClientIp(forged), '203.0.113.9');
  ok('HTTP requests trust req.ip over the raw header');
}

function testPublicCreatorView() {
  console.log('\n── public creator view withholds credentials ──');

  const row = {
    id: 'cr_1',
    handle_name: 'luna',
    status: 'approved',
    avatar_url: 'https://x/y.png',
    coins_earned: 5000,
    referral_code: 'SECRET99',
    email: 'luna@nova.test',
    preferred_upi: 'luna@upi',
    authorized_ips: ['203.0.113.9'],
    follower_ips: ['203.0.113.10'],
    password_hash: 'hash',
    password: 'plain',
  };

  const view = creatorSecurity.publicCreatorView(row);
  for (const field of ['referral_code', 'email', 'preferred_upi', 'authorized_ips', 'follower_ips', 'password_hash', 'password']) {
    assert.ok(!(field in view), `${field} must not be exposed publicly`);
  }
  ok('code, email, payout handle, IPs and passwords are all withheld');

  assert.strictEqual(view.handle_name, 'luna');
  assert.strictEqual(view.status, 'approved');
  assert.strictEqual(view.coins_earned, 5000);
  ok('public profile fields survive');

  const rosterView = creatorSecurity.publicCreatorView(row, { keep: ['email'] });
  assert.strictEqual(rosterView.email, 'luna@nova.test');
  assert.ok(!('referral_code' in rosterView), 'keep must not re-admit the code');
  assert.ok(!('preferred_upi' in rosterView), 'keep must not re-admit the payout handle');
  ok('keep re-admits only the named field');

  assert.strictEqual(creatorSecurity.publicCreatorView(null), null);
  ok('a missing creator yields null');

  // The creator's own authenticated view still needs their code.
  const own = creatorSecurity.stripCreatorSecrets(row);
  assert.strictEqual(own.referral_code, 'SECRET99');
  assert.ok(!('password_hash' in own), 'own view still hides the hash');
  ok('the creator’s own view keeps their access code');
}

// The exact state the legacy header used to authenticate: an approved creator
// with a withdrawable balance. Seeded directly because creator registration and
// login both require Supabase, while the legacy referral path does not.
const SEEDED_CODE = 'SECRETCODE9';
const SEEDED_CREATOR = {
  id: 'cr_sectest',
  handle_name: 'sectest',
  platform: 'Instagram',
  profile_link: 'https://instagram.com/sectest',
  email: 'sec@nova.test',
  referral_code: SEEDED_CODE,
  status: 'approved',
  coins_earned: 50000,
  preferred_upi: 'victim@upi',
  authorized_ips: ['203.0.113.9'],
  follower_ips: [],
  referral_count: 0,
  followers_count: 0,
};

async function testLegacyCredentialCannotMoveMoney() {
  console.log('\n── a leaked referral code cannot move money ──');

  const asLegacy = { 'x-creator-referral': SEEDED_CODE };

  let r = await req('POST', '/api/creators/withdraw', {
    headers: asLegacy,
    body: { upi: 'attacker@upi' },
  });
  assert.strictEqual(r.status, 403, `withdraw must refuse the legacy code, got ${r.status} ${JSON.stringify(r.body)}`);
  assert.match(r.body.error, /log in/i, 'the refusal should tell the user to log in again');
  ok('withdraw refuses the legacy referral code and says why');

  r = await req('POST', '/api/creators/update-profile', {
    headers: asLegacy,
    body: { preferred_upi: 'attacker@upi' },
  });
  assert.strictEqual(r.status, 403, `update-profile must refuse the legacy code, got ${r.status}`);
  ok('changing the payout handle refuses the legacy referral code');

  // Refusals are only meaningful if nothing changed underneath them.
  r = await req('GET', '/api/admin/creators', { headers: { 'x-admin-key': ADMIN_KEY } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body.withdrawals || [], [], 'no withdrawal should exist');
  ok('no withdrawal was queued');

  const victim = (r.body.creators || []).find((c) => c.handle_name === 'sectest');
  assert.ok(victim, 'the seeded creator still exists');
  assert.strictEqual(victim.coins_earned, 50000, 'balance must be untouched');
  assert.strictEqual(victim.preferred_upi, 'victim@upi', 'payout handle must be untouched');
  ok('the balance and payout handle are untouched');

  // The compat shim must survive for read-only routes so this fix does not log
  // every legacy user out.
  r = await req('GET', '/api/creators/my-withdrawals', { headers: asLegacy });
  assert.strictEqual(r.status, 200, `read-only legacy access should still work, got ${r.status}`);
  ok('read-only legacy access still works');
}

async function main() {
  testClientIp();
  testPublicCreatorView();

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-sec-'));
  fs.writeFileSync(
    path.join(dataDir, 'manadb.json'),
    JSON.stringify({
      creators: [SEEDED_CREATOR],
      referral_logs: [],
      withdrawals: [],
      admin_history: [],
      trust_scores: {},
    }, null, 2),
  );

  const server = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      NODE_ENV: 'development',
      ADMIN_KEY,
      AGENCY_ADMIN_KEY: ADMIN_KEY,
      LOCAL_DB_DIR: dataDir,
      SUPABASE_URL: '',
      SUPABASE_ANON_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
    },
    stdio: 'ignore',
  });

  const stop = () => { try { server.kill(); } catch { /* already gone */ } };
  process.on('exit', stop);

  const deadline = Date.now() + 40000;
  for (;;) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) break;
    } catch { /* not listening yet */ }
    if (Date.now() > deadline) { stop(); throw new Error('server did not start'); }
    await new Promise((r) => setTimeout(r, 300));
  }

  try {
    await testLegacyCredentialCannotMoveMoney();
  } finally {
    stop();
    // Let the child's handles unwind before the loop tears down.
    await new Promise((r) => setTimeout(r, 250));
  }

  console.log(`\n${passed} checks passed.\n`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error('\n✗ ' + (e && e.message ? e.message : e));
  process.exit(1);
});
