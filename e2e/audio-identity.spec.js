const { test, expect } = require('@playwright/test');
const { enterVideoFromLanding, waitUntilAppConnected } = require('./landingHelpers');

function uniqueName() {
  return `QA${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

async function registerViaApi(request, username, pin) {
  const res = await request.post('/api/audio-identity/register', {
    data: { username, pin },
  });
  const body = await res.json();
  return { status: res.status(), body };
}

test.describe.configure({ mode: 'serial' });

test.describe('audio identity API', () => {
  test('register, reject taken/invalid, and persist the new session', async ({ request }) => {
    const username = uniqueName();
    const pin = '7392';

    const created = await registerViaApi(request, username, pin);
    expect(created.status).toBe(200);
    expect(created.body.ok).toBeTruthy();
    expect(created.body.token).toBeTruthy();
    expect(created.body.identity.username).toBe(username);
    expect(JSON.stringify(created.body)).not.toContain(pin);

    const taken = await registerViaApi(request, username, '8461');
    expect(taken.body.ok).toBeFalsy();
    expect(String(taken.body.error)).toMatch(/taken/i);

    const invalid = await registerViaApi(request, 'ab', pin);
    expect(invalid.body.ok).toBeFalsy();
    expect(String(invalid.body.error)).toMatch(/Username/i);

    const weak = await registerViaApi(request, uniqueName(), '1234');
    expect(weak.body.ok).toBeFalsy();
    expect(String(weak.body.error)).toMatch(/PIN/i);

    const me = await request.get('/api/audio-identity/me', {
      headers: { 'x-audio-session': created.body.token },
    });
    const meBody = await me.json();
    expect(meBody.ok).toBeTruthy();
    expect(meBody.identity.username).toBe(username);
    expect(meBody.identity.coins).toBe(created.body.identity.coins);
  });
});

test.describe('audio identity voice-room UI', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('wc_age', '1');
      sessionStorage.setItem('wc_bot', '1');
      sessionStorage.setItem('mm_community_policy_video', '1');
      try { localStorage.setItem('mm_pwa_dismissed', '1'); } catch { /* ignore */ }
      try {
        sessionStorage.removeItem('mm_audio_session');
        localStorage.removeItem('mm_audio_username');
        localStorage.removeItem('mm_audio_device');
        localStorage.removeItem('mm_audio_device_id');
      } catch { /* ignore */ }
    });
  });

  async function openVoiceGate(page) {
    await page.goto('/');
    await waitUntilAppConnected(page);
    const audioDock = page.getByRole('button', { name: 'Audio', exact: true });
    await expect(audioDock).toBeVisible({ timeout: 20000 });
    await expect(audioDock).toBeEnabled({ timeout: 20000 });
    await audioDock.click();
    await expect(page.getByRole('dialog', { name: 'Voice room sign in' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Restoring your voice identity…')).toHaveCount(0);
  }

  async function completeRegister(page, username, pin) {
    await page.getByRole('button', { name: 'Create new username' }).click();
    const modal = page.getByRole('dialog', { name: 'Create voice room identity' });
    await expect(modal).toBeVisible();
    await modal.getByPlaceholder('e.g. Star_Voice').fill(username);
    await modal.getByRole('button', { name: 'Continue' }).click();
    await modal.getByPlaceholder('••••').first().fill(pin);
    await modal.getByPlaceholder('••••').nth(1).fill(pin);
    await expect(modal.getByRole('button', { name: 'Continue' })).toBeEnabled();
    await modal.getByRole('button', { name: 'Continue' }).click();
    await modal.getByRole('button', { name: 'Create & enter' }).click();
  }

  test('fresh registration enters the voice lobby', async ({ page }) => {
    const username = uniqueName();
    await openVoiceGate(page);
    await expect(page.getByLabel('Username')).toBeVisible();
    await completeRegister(page, username, '7392');
    await expect(page.getByRole('dialog', { name: 'Voice room sign in' })).toHaveCount(0, { timeout: 15000 });
    await expect(page.getByText(new RegExp(`@${username}`))).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: /Talk live/i })).toBeVisible();
  });

  test('returning PIN login works and wrong PIN is shown', async ({ page, request }) => {
    const username = uniqueName();
    const created = await registerViaApi(request, username, '7392');
    expect(created.body.ok).toBeTruthy();

    await page.addInitScript((name) => {
      localStorage.setItem('mm_audio_username', name);
    }, username);

    await openVoiceGate(page);
    await expect(page.getByText(new RegExp(`@${username}`))).toBeVisible();
    await page.getByPlaceholder('••••').fill('8461');
    await page.getByRole('button', { name: 'Enter voice rooms' }).click();
    await expect(page.locator('.mm-audio-id-error')).toContainText(/Wrong PIN/i);

    await page.getByPlaceholder('••••').fill('7392');
    await page.getByRole('button', { name: 'Enter voice rooms' }).click();
    await expect(page.getByRole('dialog', { name: 'Voice room sign in' })).toHaveCount(0, { timeout: 15000 });
    await expect(page.getByText(new RegExp(`@${username}`))).toBeVisible();
  });

  test('switch account reveals username login instead of getting stuck', async ({ page, request }) => {
    const username = uniqueName();
    const created = await registerViaApi(request, username, '7392');
    expect(created.body.ok).toBeTruthy();

    await page.addInitScript((name) => {
      localStorage.setItem('mm_audio_username', name);
    }, username);

    await openVoiceGate(page);
    await page.getByRole('button', { name: 'Switch account' }).click();
    await expect(page.getByLabel('Username')).toBeVisible();
    await page.getByLabel('Username').fill(username);
    await page.getByPlaceholder('••••').fill('7392');
    await page.getByRole('button', { name: 'Enter voice rooms' }).click();
    await expect(page.getByRole('heading', { name: /Talk live/i })).toBeVisible({ timeout: 15000 });
  });

  test('register timeout surfaces an error instead of spinning forever', async ({ page }) => {
    test.setTimeout(45000);
    await page.route('**/api/audio-identity/register', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 20000));
      await route.abort('timedout');
    });
    await openVoiceGate(page);
    await completeRegister(page, uniqueName(), '7392');
    const modal = page.getByRole('dialog', { name: 'Create voice room identity' });
    await expect(modal.locator('.mm-audio-id-error')).toContainText(/timed out|Network error/i, { timeout: 16000 });
    await expect(modal.getByRole('button', { name: 'Create & enter' })).toBeEnabled();
  });

  test('anonymous 1:1 video does not ask for username or PIN', async ({ page }) => {
    await page.goto('/');
    await enterVideoFromLanding(page);
    await expect(page.getByRole('dialog', { name: 'Voice room sign in' })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Create voice room identity' })).toHaveCount(0);
    await expect(page.getByText('Create voice identity')).toHaveCount(0);
  });
});
