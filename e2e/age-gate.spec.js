const { test, expect } = require('@playwright/test');
const { VIDEO_MODE_NAME } = require('./landingHelpers');

test.describe('age verification gate', () => {
  test('shows the wordmark without the square app icon', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Age Verification' })).toBeVisible();
    await expect(page.locator('.helloooo-wordmark')).toBeVisible();
    await expect(page.locator('img.helloooo-logo')).toHaveCount(0);
  });

  test('leaves the gate after confirm even if bonus credit never returns', async ({ page }) => {
    await page.route('**/api/user/credit-age', () => {});
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Age Verification' })).toBeVisible();
    await page.getByRole('button', { name: /I am 18 years or older/ }).click();
    await expect(page.getByRole('button', { name: VIDEO_MODE_NAME })).toBeVisible({ timeout: 20000 });
    expect(await page.evaluate(() => sessionStorage.getItem('wc_age') === '1' && sessionStorage.getItem('wc_bot') === '1')).toBe(true);
  });
});
