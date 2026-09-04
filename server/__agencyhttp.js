/**
 * Agency HTTP smoke —  node server/__agencyhttp.js
 *
 * Boots the real server and drives the agency flow over HTTP, so the wiring
 * (route registration, middleware order, DI refs) is exercised for real rather
 * than only the module in isolation. Uses an isolated localDb so it never
 * touches server/data/manadb.json.
 */
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 3997;
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

async function main() {
  // A scratch data dir keeps the developer's real local db untouched.
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-agency-'));

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

  const admin = { 'x-admin-key': ADMIN_KEY };

  try {
    console.log('\n── admin creates an agency ──');

    let r = await req('POST', '/api/admin/agencies', { body: { name: 'Nova' } });
    assert.strictEqual(r.status, 401);
    ok('creating an agency without the admin key is refused');

    r = await req('POST', '/api/admin/agencies', {
      headers: admin,
      body: { name: 'Nova Talent', ownerEmail: 'owner@nova.test', ownerPassword: 'nova-owner-password' },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const agencyKey = r.body.agencyKey;
    const agencyId = r.body.agency.id;
    assert.ok(agencyKey?.startsWith('agk_'));
    ok('admin creates an agency and receives a one-time key');

    r = await req('POST', '/api/admin/agencies', {
      headers: admin,
      body: { name: 'Bad', ownerEmail: 'x@y.test', ownerPassword: 'short' },
    });
    assert.strictEqual(r.status, 400);
    ok('a weak owner password is refused');

    console.log('\n── agency authenticates ──');

    r = await req('GET', '/api/agency/me');
    assert.strictEqual(r.status, 401);
    ok('/api/agency/me needs credentials');

    r = await req('GET', '/api/agency/me', { headers: { 'x-agency-key': agencyKey } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.scope, 'owner');
    assert.strictEqual(r.body.agency.id, agencyId);
    assert.ok(r.body.mint, 'mint state is returned');
    ok('the agency key resolves to that agency with its mint state');

    r = await req('POST', '/api/agency/login', {
      body: { email: 'owner@nova.test', password: 'wrong-password' },
    });
    assert.strictEqual(r.status, 401);
    ok('a wrong password is refused');

    r = await req('POST', '/api/agency/login', {
      body: { email: 'owner@nova.test', password: 'nova-owner-password' },
    });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const session = { 'x-agency-session': r.body.token };
    ok('the owner logs in with email and password');

    console.log('\n── invite grants instant live access ──');

    r = await req('POST', '/api/agency/invites', { headers: session, body: { label: 'IG' } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body));
    const code = r.body.invite.code;
    ok('the owner generates an invite code');

    r = await req('GET', `/api/agency/invite/${code}`);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.invite.agencyName, 'Nova Talent');
    assert.strictEqual(r.body.invite.grantsInstantLive, true);
    ok('the public invite lookup names the inviting agency');

    r = await req('GET', '/api/agency/invite/NOTREAL1');
    assert.strictEqual(r.status, 404);
    ok('an unknown invite code 404s');

    r = await req('POST', '/api/creators/register', {
      body: {
        handle: 'lunatest', platform: 'instagram',
        link: 'https://instagram.com/lunatest',
        email: 'luna@nova.test', password: 'Creator-pass-123',
        agencyInvite: 'BOGUSXXX',
      },
    });
    assert.strictEqual(r.status, 400);
    ok('registering with a bogus invite is refused before any row is created');

    console.log('\n── tenant isolation ──');

    r = await req('POST', '/api/admin/agencies', {
      headers: admin,
      body: { name: 'Rival', ownerEmail: 'owner@rival.test', ownerPassword: 'rival-owner-password' },
    });
    const rivalKey = r.body.agencyKey;
    const rivalId = r.body.agency.id;

    r = await req('GET', '/api/agency/roster', { headers: { 'x-agency-key': rivalKey } });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.body.creators, []);
    assert.strictEqual(r.body.agency.id, rivalId);
    ok('a new agency sees an empty roster, not the platform roster');

    // Naming another tenant explicitly must not grant access to it.
    r = await req('GET', `/api/agency/roster?agencyId=${agencyId}`, {
      headers: { 'x-agency-key': rivalKey },
    });
    assert.strictEqual(r.body.agency.id, rivalId, 'agencyId query must be ignored for tenants');
    ok('a tenant cannot pivot to another agency via agencyId');

    console.log('\n── platform levers stay with the operator ──');

    r = await req('POST', '/api/agency/nuts/adjust', {
      headers: { 'x-agency-key': agencyKey },
      body: { username: 'anyone', delta: 1000000 },
    });
    assert.strictEqual(r.status, 403);
    ok('a tenant cannot mint arbitrary Nuts via nuts/adjust');

    r = await req('POST', '/api/agency/settings', {
      headers: { 'x-agency-key': agencyKey },
      body: { nutsPayoutPerUsd: 1 },
    });
    assert.strictEqual(r.status, 403);
    ok('a tenant cannot rewrite the global payout rate');

    r = await req('POST', '/api/agency/settings', {
      headers: admin,
      body: { agencyAnnouncements: 'hello' },
    });
    assert.strictEqual(r.status, 200);
    ok('the operator can still change global settings');

    console.log('\n── mint pool ──');

    r = await req('GET', '/api/agency/mint', { headers: { 'x-agency-key': agencyKey } });
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.mint.perMinute > 0, 'a per-minute drip rate is reported');
    assert.ok(r.body.mint.nextDailyAllowance >= r.body.mint.dailyAllowance, 'allowance ramps up');
    ok('the mint reports its drip rate and tomorrow’s allowance');

    r = await req('POST', '/api/agency/mint/sell', {
      headers: { 'x-agency-key': agencyKey },
      body: { username: 'nobody-here', nuts: 999999999 },
    });
    assert.strictEqual(r.status, 400);
    ok('selling more than the pool holds is refused');

    console.log('\n── admin oversight ──');

    r = await req('GET', '/api/admin/agencies', { headers: admin });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.agencies.length, 2);
    ok('admin lists every agency');

    r = await req('POST', `/api/admin/agencies/${agencyId}`, {
      headers: admin, body: { commissionPct: 0.35 },
    });
    assert.strictEqual(r.body.agency.commissionPct, 0.35);
    ok('admin tunes an agency commission rate');

    r = await req('POST', `/api/admin/agencies/${agencyId}/rotate-key`, { headers: admin });
    const rotated = r.body.agencyKey;
    assert.ok(rotated && rotated !== agencyKey);
    r = await req('GET', '/api/agency/me', { headers: { 'x-agency-key': agencyKey } });
    assert.strictEqual(r.status, 401);
    r = await req('GET', '/api/agency/me', { headers: { 'x-agency-key': rotated } });
    assert.strictEqual(r.status, 200);
    ok('rotating the key locks out the old one over HTTP');

    r = await req('POST', `/api/admin/agencies/${rivalId}`, {
      headers: admin, body: { status: 'suspended' },
    });
    assert.strictEqual(r.body.agency.status, 'suspended');
    r = await req('GET', '/api/agency/me', { headers: { 'x-agency-key': rivalKey } });
    assert.strictEqual(r.status, 403);
    ok('suspending an agency locks its dashboard');

    console.log(`\n${passed} checks passed.\n`);
  } finally {
    stop();
    try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* temp dir */ }
  }
}

main().catch((e) => {
  console.error(`\n  ✗ FAILED: ${e.message}\n`);
  console.error(e);
  process.exit(1);
});
