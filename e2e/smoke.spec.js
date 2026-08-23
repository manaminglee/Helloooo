const { test, expect } = require('@playwright/test');

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

    // Use exact aria-labels from LandingHero mode cards (avoids matching "Start video chat")
    const videoBtn = page.getByRole('button', { name: 'Video Chat: 1-on-1 live video' });
    const groupBtn = page.getByRole('button', { name: 'Group Video: Up to 4 on camera' });

    await expect(videoBtn).toBeVisible();
    await expect(groupBtn).toBeVisible();
    await expect(videoBtn).toBeEnabled({ timeout: 20000 });
  });

  test('debug flag does not break page', async ({ page }) => {
    await page.goto('/?debug=1');
    await expect(page.locator('#root')).toBeVisible();
  });

  test('interest entry and text mode navigation', async ({ page }) => {
    await page.goto('/');

    const textBtn = page.getByRole('button', { name: 'Text Chat: Anonymous messaging' });
    await expect(textBtn).toBeEnabled({ timeout: 20000 });
    await textBtn.click();

    await expect(page.locator('#text-back-btn')).toBeVisible({ timeout: 20000 });
  });
});
