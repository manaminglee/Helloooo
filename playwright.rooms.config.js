const base = require('./playwright.features.config');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'helloooo-rooms-'));
const token = 'cs_rooms_test_creator_session_only';
fs.writeFileSync(path.join(directory, 'manadb.json'), JSON.stringify({
  audio_identities: { livegiftguest: { username: 'livegiftguest', pinSalt: 'rooms-fixture-salt', pinHash: crypto.scryptSync('7392', 'rooms-fixture-salt', 32).toString('hex'), coins: 10000, xp: 0 } },
  creators: [{ id: 'rooms-test-creator', handle_name: 'roomshost', display_name: 'Rooms Host', status: 'approved', coins: 0, referral_code: 'rooms-test-referral' }],
  creator_sessions: [{ id: 'rooms-test-session', creator_id: 'rooms-test-creator', token_hash: crypto.createHash('sha256').update(token).digest('hex'), expires_at: new Date(Date.now() + 3600000).toISOString() }],
}));
process.env.HELLOOOO_ROOM_TESTS = '1';
module.exports = {
  ...base,
  testMatch: ['**/rooms-integration.spec.js', '**/gift-rendering.spec.js'],
  timeout: 60000,
  use: { ...base.use, screenshot: 'only-on-failure', launchOptions: { args: [...base.use.launchOptions.args, '--enable-unsafe-swiftshader'] } },
  webServer: [
    { command: 'node scripts/test-livekit.cjs', url: 'http://127.0.0.1:7880', timeout: 20000, reuseExistingServer: false },
    ...base.webServer.map((server, i) => i ? server : { ...server, env: { ...server.env, LOCAL_DB_DIR: directory, LIVEKIT_AUDIO_THRESHOLD: process.env.LIVEKIT_AUDIO_THRESHOLD || '2', LIVEKIT_URL: 'ws://127.0.0.1:7880', LIVEKIT_API_KEY: 'devkey', LIVEKIT_API_SECRET: 'secret' } }),
  ],
};
