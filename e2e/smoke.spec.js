const { test, expect } = require('@playwright/test');
const { VIDEO_MODE_NAME, TEXT_MODE_NAME, GROUP_MODE_NAME, revealLandingModeCards } = require('./landingHelpers');

test.describe('Helloooo smoke (anonymous)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('wc_age', '1');
      sessionStorage.setItem('wc_bot', '1');
      sessionStorage.setItem('mm_community_policy_video', '1');
    });
  });

  test('landing loads and shows core modes', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Helloooo/i);

    // Video preview is visible at the top; named group card appears after the scroll morph.
    const videoBtn = page.getByRole('button', { name: VIDEO_MODE_NAME });
    await expect(videoBtn).toBeVisible();
    await revealLandingModeCards(page);
    const groupBtn = page.getByRole('button', { name: GROUP_MODE_NAME });
    await expect(groupBtn).toBeVisible();
    await expect(videoBtn).toBeEnabled({ timeout: 20000 });
  });

  test('debug flag does not break page', async ({ page }) => {
    await page.goto('/?debug=1');
    await expect(page.locator('#root')).toBeVisible();
  });

  test('interest entry and text mode navigation', async ({ page }) => {
    await page.goto('/');

    const textBtn = page.getByRole('button', { name: TEXT_MODE_NAME });
    await expect(textBtn).toBeEnabled({ timeout: 20000 });
    await textBtn.click();

    await expect(page.locator('#text-back-btn')).toBeVisible({ timeout: 20000 });
  });
});
