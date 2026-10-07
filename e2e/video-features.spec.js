const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('wc_age', '1');
    sessionStorage.setItem('wc_bot', '1');
    sessionStorage.setItem('mm_community_policy_video', '1');
  });
});

test('video preview keeps playing through layouts and mobile resize', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Video Chat: 1-on-1 live video' }).click();
  await expect(page.getByRole('button', { name: 'Vertical layout', exact: true })).toBeVisible({ timeout: 20000 });
  const playing = () => page.locator('video').evaluateAll(videos => videos.some(v => v.videoWidth > 0 && !v.paused && v.srcObject?.active));
  await expect.poll(playing).toBe(true);
  await page.getByRole('button', { name: 'Vertical layout', exact: true }).click();
  await expect(page.locator('.mm-desk-media--sidebar')).toBeVisible();
  await expect.poll(playing).toBe(true);
  await page.getByRole('button', { name: 'Horizontal layout', exact: true }).click();
  await expect.poll(playing).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Switch to vertical panels' }).click();
  await expect(page.getByRole('button', { name: 'Switch to horizontal panels' })).toBeVisible();
  await expect.poll(playing).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('mm_video_desk_layout'))).toBe('sidebar');
});

test('sponsor HTML cannot execute inside the application', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const dom = await import('/node_modules/.vite/deps/react-dom_client.js');
    const createRoot = dom.createRoot || dom.default.createRoot;
    const { AdSlot } = await import('/src/components/AdSlot.jsx');
    const host = document.createElement('div');
    document.body.appendChild(host);
    createRoot(host).render(React.createElement(AdSlot, { adsEnabled: true, slotKey: 'test', script: '<img src="invalid" onerror="parent.document.body.dataset.adAttack=1"><script>parent.document.body.dataset.adAttack=1</script><p>Sponsor test</p>' }));
  });
  const frame = page.frameLocator('iframe[title="Advertisement: test"]');
  await expect(frame.getByText('Sponsor test')).toBeVisible();
  expect(await page.locator('body').getAttribute('data-ad-attack')).toBeNull();
  await expect(page.locator('iframe[title="Advertisement: test"]')).not.toHaveAttribute('sandbox', /allow-scripts|allow-same-origin/);
});

test('two independent browsers exchange video and messages', async ({ page, browser }) => {
  test.setTimeout(90000);
  const otherContext = await browser.newContext({ permissions: ['camera', 'microphone'] });
  const other = await otherContext.newPage();
  await other.addInitScript(() => {
    sessionStorage.setItem('wc_age', '1'); sessionStorage.setItem('wc_bot', '1'); sessionStorage.setItem('mm_community_policy_video', '1');
  });
  try {
    for (const p of [page, other]) {
      await p.goto('http://127.0.0.1:5173/');
      await p.getByRole('button', { name: 'Video Chat: 1-on-1 live video' }).click();
    }
    for (const p of [page, other]) {
      await expect.poll(() => p.locator('video').evaluateAll(v => v.filter(el => el.videoWidth > 0 && !el.paused && el.srcObject?.active).length), { timeout: 35000 }).toBeGreaterThanOrEqual(2);
      const ready = p.getByRole('button', { name: /I'm ready/ });
      await expect(ready).toBeVisible();
      await ready.click();
    }
    for (const p of [page, other]) await expect(p.locator('.mm-neural-gate')).toHaveCount(0);
    await page.locator('.mm-desk-chat__input').fill('Hello from a real peer');
    await page.locator('.mm-desk-chat__send').click();
    await expect(other.getByText('Hello from a real peer', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Vertical layout', exact: true }).click();
    await expect(page.locator('.mm-desk-sidebar .mm-desk-chat__input')).toBeVisible();
    await expect(page.locator('.mm-desk-sidebar')).toHaveCSS('opacity', '1');
    await expect.poll(() => page.locator('video').evaluateAll(v => v.filter(el => el.videoWidth > 0 && !el.paused).length)).toBeGreaterThanOrEqual(2);
    await page.screenshot({ path: 'test-results/video-desktop.png', animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Switch to horizontal panels' }).click();
    await expect(page.locator('.mm-mobile-video-stage--horizontal')).toBeVisible();
    await expect.poll(() => page.locator('.mm-mobile-video-stage--horizontal video').evaluateAll(v => v.filter(el => el.videoWidth > 0 && !el.paused).length)).toBeGreaterThanOrEqual(2);
    await page.screenshot({ path: 'test-results/video-mobile.png', animations: 'disabled' });
  } finally { await otherContext.close(); }
});

test('AdSense uses one loader for multiple responsive units', async ({ page }) => {
  let loads = 0;
  await page.route('https://pagead2.googlesyndication.com/**', async route => {
    loads++;
    await route.fulfill({ contentType: 'application/javascript', body: 'window.adsbygoogle = {push: function(){window.adRequests=(window.adRequests||0)+1}};' });
  });
  await page.goto('/');
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const dom = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { AdSlot } = await import('/src/components/AdSlot.jsx');
    const host = document.createElement('div'); document.body.appendChild(host);
    (dom.createRoot || dom.default.createRoot)(host).render(React.createElement(React.Fragment, null,
      ...['1234567890', '1234567891'].map(slot => React.createElement(AdSlot, { key: slot, adsEnabled: true, script: { provider: 'adsense', client: 'ca-pub-1234567890123456', slot } }))));
  });
  await expect.poll(() => page.evaluate(() => window.adRequests)).toBe(2);
  expect(loads).toBe(1);
  await expect(page.locator('ins.adsbygoogle')).toHaveCount(2);
});


