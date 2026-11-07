/**
 * Voice-room identity: username + hashed PIN registration/login.
 * Run: node server/__audioidentitytest.js
 */
const assert = require('assert');
const express = require('express');
const { registerAudioIdentity } = require('./audioIdentity');

let passed = 0;
const ok = (name) => { passed += 1; console.log(`  ✓ ${name}`); };

function hangingSupabase() {
  const pending = () => new Promise(() => {});
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    maybeSingle() { return pending(); },
    upsert() { return pending(); },
    then(resolve, reject) { return pending().then(resolve, reject); },
    catch(reject) { return pending().catch(reject); },
  };
  return { from() { return chain; } };
}

async function makeServer({ supabase = null, storageTimeoutMs = 400 } = {}) {
  const app = express();
  app.use(express.json());
  const localDb = {};
  registerAudioIdentity(app, null, {
    saveLocalDb: () => {},
    localDb,
    audit: () => {},
    supabase,
    getCreatorForRequest: null,
    storageTimeoutMs,
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address();
  return {
    base: `http://127.0.0.1:${port}`,
    localDb,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function post(base, path, body, headers = {}) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

async function get(base, path, headers = {}) {
  const res = await fetch(`${base}${path}`, { headers });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json };
}

function assertNoSecrets(payload, pin) {
  const raw = JSON.stringify(payload);
  assert.ok(!raw.includes(pin), 'response must not echo the PIN');
  assert.ok(!payload.identity?.pinHash && !payload.identity?.pinSalt && !payload.identity?.pin);
  assert.ok(!payload.pinHash && !payload.pinSalt);
}

async function main() {
  console.log('\n── audio identity register / login ──');
  const srv = await makeServer();
  const pin = '7392';
  const otherPin = '8461';
  const username = `VoiceUser${Date.now().toString(36)}`;

  try {
    const badName = await post(srv.base, '/api/audio-identity/register', { username: 'ab', pin });
    assert.strictEqual(badName.status, 400);
    assert.match(String(badName.body.error || ''), /Username/i);
    ok('rejects invalid username');

    const weak = await post(srv.base, '/api/audio-identity/register', { username, pin: '1234' });
    assert.strictEqual(weak.status, 400);
    assert.match(String(weak.body.error || ''), /obvious PIN|1234|1111/i);
    ok('rejects weak PIN');

    const shortPin = await post(srv.base, '/api/audio-identity/register', { username, pin: '12' });
    assert.strictEqual(shortPin.status, 400);
    assert.match(String(shortPin.body.error || ''), /4 digits/i);
    ok('rejects invalid PIN length');

    const created = await post(srv.base, '/api/audio-identity/register', { username, pin, nameColor: '#f472b6' });
    assert.strictEqual(created.status, 200, JSON.stringify(created.body));
    assert.strictEqual(created.body.ok, true);
    assert.ok(created.body.token);
    assert.strictEqual(created.body.identity.username, username);
    assert.strictEqual(created.body.identity.coins, 25);
    assertNoSecrets(created.body, pin);
    ok('fresh registration returns session and server balance');

    const taken = await post(srv.base, '/api/audio-identity/register', { username, pin: otherPin });
    assert.strictEqual(taken.status, 400);
    assert.match(String(taken.body.error || ''), /taken/i);
    ok('duplicate username is rejected');

    const wrong = await post(srv.base, '/api/audio-identity/login', { username, pin: otherPin });
    assert.strictEqual(wrong.status, 401);
    assert.match(String(wrong.body.error || ''), /Wrong PIN/i);
    assertNoSecrets(wrong.body, otherPin);
    ok('wrong PIN is rejected');

    const unknown = await post(srv.base, '/api/audio-identity/login', { username: `Nope${Date.now()}`, pin });
    assert.strictEqual(unknown.status, 401);
    assert.match(String(unknown.body.error || ''), /Unknown username/i);
    ok('unknown username is rejected');

    const loggedIn = await post(srv.base, '/api/audio-identity/login', { username, pin });
    assert.strictEqual(loggedIn.status, 200, JSON.stringify(loggedIn.body));
    assert.strictEqual(loggedIn.body.ok, true);
    assert.ok(loggedIn.body.token);
    assert.strictEqual(loggedIn.body.identity.username, username);
    assertNoSecrets(loggedIn.body, pin);
    ok('returning login with correct PIN succeeds');

    const me = await get(srv.base, '/api/audio-identity/me', { 'x-audio-session': loggedIn.body.token });
    assert.strictEqual(me.body.ok, true);
    assert.strictEqual(me.body.identity.username, username);
    assert.strictEqual(me.body.identity.coins, 25);
    assertNoSecrets(me.body, pin);
    ok('session persists and /me returns the same identity');

    const anon = await get(srv.base, '/api/audio-identity/me');
    assert.notStrictEqual(anon.body.ok, true);
    ok('unauthenticated /me does not invent a session');

    const twin = `Twin${Date.now().toString(36)}`;
    const [first, second] = await Promise.all([
      post(srv.base, '/api/audio-identity/register', { username: twin, pin }),
      post(srv.base, '/api/audio-identity/register', { username: twin, pin: otherPin }),
    ]);
    const winners = [first, second].filter((r) => r.body.ok);
    const losers = [first, second].filter((r) => !r.body.ok);
    assert.strictEqual(winners.length, 1, 'exactly one concurrent register should win');
    assert.strictEqual(losers.length, 1);
    assert.match(String(losers[0].body.error || ''), /taken/i);
    const winPin = first.body.ok ? pin : otherPin;
    const losePin = first.body.ok ? otherPin : pin;
    const winLogin = await post(srv.base, '/api/audio-identity/login', { username: twin, pin: winPin });
    const loseLogin = await post(srv.base, '/api/audio-identity/login', { username: twin, pin: losePin });
    assert.strictEqual(winLogin.body.ok, true);
    assert.strictEqual(loseLogin.body.ok, false);
    ok('concurrent double-submit creates only one identity');
  } finally {
    await srv.close();
  }

  console.log('\n── audio identity storage timeout ──');
  const hung = await makeServer({ supabase: hangingSupabase(), storageTimeoutMs: 300 });
  try {
    const started = Date.now();
    const result = await post(hung.base, '/api/audio-identity/register', {
      username: `Hang${Date.now().toString(36)}`,
      pin: '7392',
    });
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 2500, `register hung for ${elapsed}ms`);
    assert.strictEqual(result.body.ok, false);
    assert.match(String(result.body.error || ''), /storage|try again/i);
    assert.deepStrictEqual(hung.localDb.audio_identities || {}, {});
    ok('hanging storage fails fast without creating an identity');
  } finally {
    await hung.close();
  }

  console.log(`\n${passed} audio-identity checks passed`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
