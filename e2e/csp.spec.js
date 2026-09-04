/**
 * Guards the Content-Security-Policy against the built client.
 *
 * The other suites run against the Vite dev server, which never sends the
 * header, so a CSP typo would only ever surface in production. This test
 * points a browser at the Express-served `client/dist` build and fails on any
 * violation the browser reports.
 */
const { test, expect } = require('@playwright/test');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = 3999;
const ORIGIN = `http://127.0.0.1:${PORT}`;

let server;

test.beforeAll(async () => {
  const built = path.join(ROOT, 'client', 'dist', 'index.html');
  if (!fs.existsSync(built)) test.skip(true, 'run `npm run build` first');

  server = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'production' },
    stdio: 'ignore',
  });

  const deadline = Date.now() + 30000;
  for (;;) {
    try {
      const res = await fetch(`${ORIGIN}/health`);
      if (res.ok) break;
    } catch { /* not listening yet */ }
    if (Date.now() > deadline) throw new Error('server did not start');
    await new Promise((r) => setTimeout(r, 300));
  }
});

test.afterAll(() => { server?.kill(); });

test('the built app loads with no CSP violations', async ({ page }) => {
  const violations = [];
  page.on('console', (msg) => {
    const text = msg.text();
    if (/Content Security Policy|Refused to/i.test(text)) violations.push(text);
  });

  await page.goto(ORIGIN, { waitUntil: 'networkidle' });

  // The bootstrap fallback is replaced only once React has actually mounted,
  // so its absence proves the entry chunk was allowed to run.
  await expect(page.locator('#boot-fallback')).toHaveCount(0);
  expect(violations).toEqual([]);
});

test('the CSP header locks down the dangerous directives', async () => {
  const res = await fetch(ORIGIN, { redirect: 'manual' });
  const csp = res.headers.get('content-security-policy') || '';

  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  // A wildcard or a bare scheme here would let any host serve executable code.
  expect(csp).toMatch(/script-src [^;]*'self'/);
  expect(csp).not.toMatch(/script-src [^;]*\*[\s;]/);
});
