const { test, expect } = require('@playwright/test');
const { waitUntilAppConnected } = require('./landingHelpers');

test.describe('navbar Nuts balance', () => {
  test('restored audio identity shows its server balance in the nav', async ({ page, request }) => {
    const username = `Nav${Date.now().toString(36)}`;
    const created = await request.post('/api/audio-identity/register', {
      data: { username, pin: '7392' },
    });
    const body = await created.json();
    expect(body.ok).toBeTruthy();
    expect(body.identity.coins).toBe(25);

    await page.addInitScript(({ token, name }) => {
      sessionStorage.setItem('wc_age', '1');
      sessionStorage.setItem('wc_bot', '1');
      sessionStorage.setItem('mm_community_policy_video', '1');
      sessionStorage.setItem('mm_audio_session', token);
      localStorage.setItem('mm_audio_username', name);
    }, { token: body.token, name: username });

    await page.goto('/');
    await waitUntilAppConnected(page);
    await expect(page.getByRole('button', { name: `${body.identity.coins} Nuts` })).toBeVisible({ timeout: 15000 });
  });

  test('guest nav shows a synced wallet without inventing an audio balance', async ({ page, request }) => {
    const guest = await request.get('/api/user/coins');
    const data = await guest.json();
    expect(data.coins).toBeDefined();

    await page.addInitScript(() => {
      sessionStorage.setItem('wc_age', '1');
      sessionStorage.setItem('wc_bot', '1');
      try {
        sessionStorage.removeItem('mm_audio_session');
        localStorage.removeItem('mm_audio_username');
      } catch { /* ignore */ }
    });
    await page.goto('/');
    await waitUntilAppConnected(page);
    await expect(page.getByRole('button', { name: `${data.coins} Nuts` })).toBeVisible({ timeout: 15000 });
  });
});
