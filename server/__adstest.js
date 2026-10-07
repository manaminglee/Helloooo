const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateAdSettings, createAdSettingsStore } = require('./adSettings');
const { validSignal } = require('./signalValidation');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'helloooo-ads-'));
const ads = { adsEnabled: true, adScripts: { hero: { provider: 'adsense', client: 'ca-pub-1234567890123456', slot: '1234567890' }, footer: '<a>Sponsored</a>' } };
assert.equal(validateAdSettings(ads), null);
createAdSettingsStore(dir).save(ads);
assert.deepEqual(createAdSettingsStore(dir).load(), ads);
for (const body of [{ adsEnabled: 'yes' }, { adScripts: [] }, { adScripts: { unknown: '' } }, { adScripts: { hero: 'x'.repeat(32769) } }, { adScripts: { hero: { provider: 'adsense', client: 'javascript:alert(1)', slot: '123' } } }]) assert.ok(validateAdSettings(body));
assert.throws(() => createAdSettingsStore(dir).save({ ...ads, adScripts: { hero: 42 } }));
assert.deepEqual(createAdSettingsStore(dir).load(), ads, 'Invalid writes preserve saved ads');
assert.ok(validSignal('offer', { type: 'offer', sdp: 'v=0\r\n' }));
assert.ok(validSignal('ice-candidate', null), 'End of candidates must reach peer');
assert.ok(validSignal('ice-candidate', { candidate: '', sdpMid: null }));
assert.equal(validSignal('offer', { type: 'answer', sdp: 'v=0' }), false);
assert.equal(validSignal('answer', { type: 'answer', sdp: 'v=0' + 'x'.repeat(131072) }), false);
assert.equal(validSignal('ice-candidate', { candidate: 'x', sdpMLineIndex: -1 }), false);
assert.equal(validSignal('evil', {}), false);
console.log('Ad persistence, invalid writes, publisher validation and signaling bounds passed.');

async function checkProductionOrigins() {
  const { spawn } = require('node:child_process');
  const port = 4598;
  const child = spawn(process.execPath, [path.join(__dirname, 'index.js')], {
    env: { ...process.env, PORT: String(port), NODE_ENV: 'production', LOCAL_DB_DIR: dir,
      DOTENV_CONFIG_PATH: path.join(dir, 'absent.env'), ADMIN_KEY: 'test-admin-only-123456789',
      TURN_URL: 'turn:127.0.0.1:3478', TURN_USERNAME: 'test', TURN_PASSWORD: 'test',
      SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', REDIS_URL: '' },
    stdio: 'ignore',
  });
  try {
    const base = `http://127.0.0.1:${port}`;
    const deadline = Date.now() + 15000;
    while (true) {
      try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
      if (Date.now() > deadline) throw new Error('Production test server did not start');
      await new Promise(r => setTimeout(r, 100));
    }
    const endpoint = `${base}/socket.io/?EIO=4&transport=polling`;
    assert.equal((await fetch(endpoint, { headers: { Origin: 'https://attacker.example' } })).status, 403);
    assert.equal((await fetch(endpoint, { headers: { Origin: 'https://helloooo.site' } })).status, 200);
    assert.equal((await fetch(endpoint, { headers: { Origin: 'null' } })).status, 403);
    console.log('Production Socket.IO rejects foreign and opaque browser origins, permits configured origin.');
  } finally { child.kill(); }
}
checkProductionOrigins().catch(error => { console.error(error); process.exitCode = 1; });
