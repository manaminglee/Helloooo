const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { chromium } = require('@playwright/test');

const OUT = '/workspace/helloooo-shots/landing-v4';
const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';

function bootScript() {
  return () => {
    sessionStorage.setItem('wc_age', '1');
    sessionStorage.setItem('wc_bot', '1');
    sessionStorage.setItem('mm_community_policy_video', '1');
  };
}

async function waitForLanding(page) {
  await page.waitForSelector('[data-landing-pin]', { timeout: 30000 });
  await page.getByRole('heading', { name: /Strangers/i }).waitFor({ timeout: 15000 });
  await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()));
  await page.waitForTimeout(400);
}

async function pinTravel(page) {
  return page.evaluate(() => {
    const pin = document.querySelector('[data-landing-pin]');
    if (!pin) return window.innerHeight;
    const top = pin.getBoundingClientRect().top + window.scrollY;
    return top + Math.max(pin.offsetHeight - window.innerHeight, 0) * 0.88;
  });
}

async function slowScrollTo(page, toY, steps = 28, ms = 55) {
  const start = await page.evaluate(() => window.scrollY);
  for (let i = 1; i <= steps; i += 1) {
    const y = start + ((toY - start) * i) / steps;
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(ms);
  }
}

async function shot(page, name) {
  const file = path.join(OUT, name);
  await page.screenshot({ path: file, fullPage: false });
  console.log('wrote', file);
}

async function collectPage(page, errors) {
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });
}

async function stills(browser, errors) {
  const viewports = [
    { name: '375', width: 375, height: 812 },
    { name: '768', width: 768, height: 1024 },
    { name: '1440', width: 1440, height: 900 },
  ];

  for (const vp of viewports) {
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 2 });
    await collectPage(page, errors);
    await page.addInitScript(bootScript());
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
    await waitForLanding(page);
    await shot(page, `${vp.name}-initial.png`);

    const dest = await pinTravel(page);
    await page.evaluate((y) => window.scrollTo(0, y), dest);
    await page.waitForSelector('[data-landing-stage][data-cards="1"]', { timeout: 8000 });
    await page.waitForTimeout(350);
    await shot(page, `${vp.name}-cards.png`);

    if (vp.name === '375' || vp.name === '1440') {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
      await shot(page, `${vp.name}-reversed.png`);
    }
    await page.close();
  }

  const reducePage = await browser.newPage({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
  });
  await collectPage(reducePage, errors);
  await reducePage.addInitScript(bootScript());
  await reducePage.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await waitForLanding(reducePage);
  await shot(reducePage, '375-reduced-motion.png');
  await reducePage.close();
}

async function recordScroll(browser, name, viewport) {
  const dir = path.join(OUT, `tmp-${name}`);
  fs.mkdirSync(dir, { recursive: true });
  const context = await browser.newContext({
    viewport,
    recordVideo: { dir, size: viewport },
  });
  const page = await context.newPage();
  const errors = [];
  await collectPage(page, errors);
  await page.addInitScript(bootScript());
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 });
  await waitForLanding(page);
  await page.waitForTimeout(600);
  const dest = await pinTravel(page);
  await slowScrollTo(page, dest, 32, 60);
  await page.waitForTimeout(700);
  await slowScrollTo(page, 0, 32, 60);
  await page.waitForTimeout(500);
  await context.close();

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.webm'));
  if (!files.length) throw new Error(`No video recorded for ${name}`);
  const webm = path.join(OUT, `${name}.webm`);
  fs.renameSync(path.join(dir, files[0]), webm);
  fs.rmSync(dir, { recursive: true, force: true });
  const mp4 = path.join(OUT, `${name}.mp4`);
  const conv = spawnSync('ffmpeg', [
    '-y', '-i', webm,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    mp4,
  ], { stdio: 'inherit' });
  if (conv.status !== 0) throw new Error(`ffmpeg failed for ${name}`);
  console.log('wrote', webm, 'and', mp4);
  return errors;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const errors = [];
  try {
    await stills(browser, errors);
    errors.push(...await recordScroll(browser, 'scroll-mobile', { width: 390, height: 844 }));
    errors.push(...await recordScroll(browser, 'scroll-desktop', { width: 1440, height: 900 }));
  } finally {
    await browser.close();
  }
  const unique = [...new Set(errors)];
  const report = path.join(OUT, 'console-report.txt');
  fs.writeFileSync(report, unique.length ? unique.join('\n') : 'No console or page errors captured.\n');
  console.log('console issues:', unique.length);
  unique.forEach((e) => console.log(' -', e));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
