/**
 * Navbar wallet display contract — node server/__navbalancetest.js
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '../client/src/utils/walletDisplay.js'), 'utf8');
const wrapped = src.replace('export function selectDisplayBalance', 'function selectDisplayBalance')
  + '\nmodule.exports = { selectDisplayBalance };\n';
const sandbox = { module: { exports: {} }, exports: {} };
vm.runInNewContext(wrapped, sandbox);
const { selectDisplayBalance } = sandbox.module.exports;

let passed = 0;
const ok = (name) => { passed += 1; console.log(`  ✓ ${name}`); };

console.log('\n── navbar wallet display ──');

let r = selectDisplayBalance({ audioUsername: 'Ada', audioCoins: 25, guestBalance: 40 });
assert.strictEqual(r.source, 'audio');
assert.strictEqual(r.balance, 25);
assert.strictEqual(r.ready, true);
ok('signed-in audio wallet wins over guest IP balance');

r = selectDisplayBalance({ audioUsername: 'Ada', audioCoins: 0, guestBalance: 40 });
assert.strictEqual(r.balance, 0);
assert.strictEqual(r.ready, true);
ok('zero audio balance is shown, not replaced by guest coins');

r = selectDisplayBalance({ audioUsername: 'Ada', audioCoins: undefined, guestBalance: 40 });
assert.strictEqual(r.ready, false);
assert.strictEqual(r.balance, null);
ok('does not fabricate an audio balance from the guest wallet');

r = selectDisplayBalance({ audioUsername: '', audioCoins: 25, guestBalance: 12 });
assert.strictEqual(r.source, 'guest');
assert.strictEqual(r.balance, 12);
ok('guest wallet is used when no audio identity is signed in');

r = selectDisplayBalance({ audioUsername: null, audioCoins: null, guestBalance: undefined });
assert.strictEqual(r.ready, false);
assert.strictEqual(r.balance, null);
ok('unknown guest balance stays unready instead of inventing 0');

console.log(`\n${passed} nav-balance checks passed`);
