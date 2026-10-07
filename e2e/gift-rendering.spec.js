const { test, expect } = require('@playwright/test');
test.skip(process.env.HELLOOOO_ROOM_TESTS !== '1', 'Uses the isolated room suite');

test('catalog 3D scenes animate, resize and fall back after GPU loss', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  const { gifts } = await (await request.get('http://127.0.0.1:3000/api/economy/catalog')).json();
  const scenes = gifts.filter(g => g.renderType === 'webgl' || g.renderType === '3d_video');
  expect(scenes.length).toBeGreaterThan(0);
  await page.evaluate(async () => {
    const { default: React } = await import('/node_modules/.vite/deps/react.js');
    const dom = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { WebGLGiftRenderer } = await import('/src/gifts/WebGLGiftRenderer.jsx');
    await import('/src/gifts/gifts.css');
    const host = document.createElement('div'); host.id = 'gift-probe'; host.style.cssText = 'position:fixed;top:0;left:0;width:320px;height:320px;z-index:99999;background:#090914'; document.body.appendChild(host);
    const root = (dom.createRoot || dom.default.createRoot)(host);
    window.renderGiftProbe = gift => root.render(React.createElement(WebGLGiftRenderer, { key: gift.id, gift, quality: 'high', mode: 'celebration' }));
  });
  for (const gift of scenes) {
    await page.evaluate(gift => window.renderGiftProbe(gift), gift);
    await expect(page.locator('#gift-probe .pg-webgl')).toHaveAttribute('data-gift-scene', gift.scene || gift.id);
    await expect(page.locator('#gift-probe canvas')).toBeVisible();
    await expect.poll(() => page.locator('#gift-probe canvas').evaluate(c => c.width)).toBeGreaterThan(0);
  }
  const first = await page.locator('#gift-probe').screenshot();
  await page.waitForTimeout(250); // Compare different animation frames, not just canvas existence.
  const second = await page.locator('#gift-probe').screenshot({ path: 'test-results/gift-3d.png' });
  expect(first.equals(second)).toBe(false);
  const before = await page.locator('#gift-probe canvas').evaluate(c => c.width);
  await page.locator('#gift-probe').evaluate(el => { el.style.width = '220px'; });
  await expect.poll(() => page.locator('#gift-probe canvas').evaluate(c => c.width)).not.toBe(before);
  await page.locator('#gift-probe canvas').evaluate(c => c.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
  await expect(page.locator('#gift-probe .pg-webgl')).toHaveCount(0);
  await expect(page.locator('#gift-probe .pg-css')).toBeVisible();
  expect(errors).toEqual([]);
});
