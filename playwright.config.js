const { defineConfig, devices } = require('@playwright/test');

const backendEnv = {
  ...process.env,
  NODE_ENV: 'test',
  PORT: '3000',
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
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: 'node server/index.js',
      cwd: '.',
      url: 'http://127.0.0.1:3000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: backendEnv,
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5173',
      cwd: 'client',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
