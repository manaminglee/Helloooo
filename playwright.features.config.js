const base = require('./playwright.config');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'helloooo-browser-'));
process.env.HELLOOOO_ISOLATED_AD_TESTS = '1';
module.exports = {
  ...base,
  testMatch: ['**/ad-settings.spec.js', '**/video-features.spec.js', '**/smoke.spec.js'],
  workers: 1,
  use: { ...base.use, launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] }, permissions: ['camera', 'microphone'] },
  webServer: base.webServer.map((server, i) => ({ ...server, reuseExistingServer: false, ...(i === 0 ? { env: { ...server.env, LOCAL_DB_DIR: directory, DOTENV_CONFIG_PATH: path.join(directory, 'absent.env'), SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', REDIS_URL: '' } } : {}) })),
};
