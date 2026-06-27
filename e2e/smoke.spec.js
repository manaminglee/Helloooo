const { test, expect } = require('@playwright/test');

test.describe('Mana Mingle smoke (anonymous)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('wc_age', '1');
      sessionStorage.setItem('wc_bot', '1');
    });
  });

  test('landing loads and shows core modes', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Mana Mingle/i);
    await expect(page.getByRole('button', { name: /Start Video/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Group Jam/i })).toBeVisible();
  });

  test('debug flag does not break page', async ({ page }) => {
    await page.goto('/?debug=1');
    await expect(page.locator('#root')).toBeVisible();
  });

  test('interest entry and text mode navigation', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Start Text/i }).click();
    await expect(page.locator('#text-back-btn')).toBeVisible({ timeout: 15000 });
  });
});
