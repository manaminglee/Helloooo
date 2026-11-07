const { defineConfig, devices } = require('@playwright/test');

const apiPort = process.env.HELLOOOO_API_PORT || '3000';
const vitePort = process.env.HELLOOOO_VITE_PORT || '5173';
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const viteOrigin = `http://127.0.0.1:${vitePort}`;

const backendEnv = {
  ...process.env,
  NODE_ENV: 'test',
  PORT: apiPort,
  EMAIL_TEST_MODE: 'true',
  ADMIN_KEY: process.env.ADMIN_KEY || 'playwright-ci-admin-key-32chars',
};

module.exports = defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || viteOrigin,
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
    permissions: ['camera', 'microphone'],
    launchOptions: {
      args: [
        '--use-fake-device-for-media-stream',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  webServer: [
    {
      command: 'node server/index.js',
      cwd: '.',
      url: `${apiOrigin}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: backendEnv,
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${vitePort}`,
      cwd: 'client',
      url: viteOrigin,
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: {
        ...process.env,
        HELLOOOO_API_PROXY: apiOrigin,
      },
    },
  ],
});
