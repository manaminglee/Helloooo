const { test, expect } = require('@playwright/test');
test('admin ad API validates writes and generates ads.txt', async ({ request }) => {
  test.skip(process.env.HELLOOOO_ISOLATED_AD_TESTS !== '1', 'Ad writes require the isolated feature-test server');
  const url = 'http://127.0.0.1:3000/api/admin/settings';
  const headers = { 'x-admin-key': process.env.ADMIN_KEY || 'playwright-ci-admin-key-32chars' };
  expect((await request.post(url, { data: { adsEnabled: true } })).status()).toBe(401);
  const adScripts = { hero: { provider: 'adsense', client: 'ca-pub-1234567890123456', slot: '1234567890' } };
  expect((await request.post(url, { headers, data: { adsEnabled: true, adScripts } })).ok()).toBe(true);
  expect(await (await request.get('http://127.0.0.1:3000/ads.txt')).text()).toContain('google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0');
  expect((await request.post(url, { headers, data: { adScripts: { hero: { provider: 'adsense', client: 'bad', slot: 'bad' } } } })).status()).toBe(400);
  const settings = await (await request.get('http://127.0.0.1:3000/api/settings')).json();
  expect(settings.adScripts.hero).toEqual(adScripts.hero);
  expect((await request.post(url, { headers, data: { adsEnabled: false, adScripts: { hero: '' } } })).ok()).toBe(true);
});


