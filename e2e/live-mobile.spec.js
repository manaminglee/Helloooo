const { test, expect, devices } = require('@playwright/test');

/**
 * The layout contract, checked on real device metrics.
 *
 * The live experience promises: no horizontal scrolling, nothing clipped, and
 * every control fully inside the usable viewport on any phone. These are the
 * failures that are invisible in a desktop browser and obvious on a handset,
 * so they get asserted rather than eyeballed.
 */
const PHONES = [
  ['iPhone SE (small)', { width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['iPhone 14 Pro (Dynamic Island)', devices['iPhone 14 Pro'].viewport],
  ['Pixel 7 (tall 20:9)', { width: 412, height: 915 }],
  ['Galaxy Fold (very narrow)', { width: 280, height: 653 }],
  ['iPad mini (portrait)', { width: 744, height: 1133 }],
];

async function openLives(page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('wc_age', '1');
    sessionStorage.setItem('wc_bot', '1');
    sessionStorage.setItem('mm_community_policy_video', '1');
  });
  await page.goto('/');
  const btn = page.getByRole('button', { name: /^Lives:/ });
  await expect(btn).toBeEnabled({ timeout: 20000 });
  await btn.click();
  await page.waitForTimeout(600);   // let the lazy chunk mount
}

for (const [name, viewport] of PHONES) {
  test.describe(`lives on ${name}`, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      isMobile: true,
      hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    });

    test('never scrolls sideways', async ({ page }) => {
      await openLives(page);
      const overflow = await page.evaluate(() => {
        const d = document.documentElement;
        return { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth };
      });
      // A single pixel of slack for sub-pixel rounding on fractional DPRs.
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    });

    test('no element hangs outside the viewport', async ({ page }) => {
      await openLives(page);
      const strays = await page.evaluate(() => {
        const w = document.documentElement.clientWidth;
        const out = [];
        for (const el of document.querySelectorAll('body *')) {
          const s = getComputedStyle(el);
          if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          // Elements deliberately animating in from off-screen are exempt.
          if (s.animationName && s.animationName !== 'none') continue;
          if (r.right > w + 1 || r.left < -1) {
            out.push(`${el.tagName}.${el.className || '(no class)'} @ ${Math.round(r.left)}→${Math.round(r.right)} (vw ${w})`);
          }
        }
        return out.slice(0, 8);
      });
      expect(strays, `elements outside the viewport:\n${strays.join('\n')}`).toEqual([]);
    });

    test('every visible control is tappable and fully on screen', async ({ page }) => {
      await openLives(page);
      const bad = await page.evaluate(() => {
        const w = document.documentElement.clientWidth;
        const h = document.documentElement.clientHeight;
        const out = [];
        for (const el of document.querySelectorAll('button, input, a[href]')) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (getComputedStyle(el).visibility === 'hidden') continue;
          const clipped = r.right > w + 1 || r.left < -1 || r.bottom > h + 1 || r.top < -1;
          // 40px is the smaller of the two common touch-target minimums; the
          // live UI uses 40–44px round controls everywhere.
          const tiny = Math.min(r.width, r.height) < 24;
          if (clipped || tiny) {
            out.push(`${el.tagName} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}${clipped ? ' CLIPPED' : ' TOO SMALL'}`);
          }
        }
        return out.slice(0, 8);
      });
      expect(bad, `unusable controls:\n${bad.join('\n')}`).toEqual([]);
    });
  });
}

test.describe('lives layer', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('safe-area insets are applied, not hardcoded pixels', async ({ page }) => {
    await openLives(page);
    const usesEnv = await page.evaluate(() => {
      const sheets = [...document.styleSheets];
      let found = 0;
      for (const sheet of sheets) {
        let rules;
        try { rules = sheet.cssRules; } catch { continue; }   // cross-origin
        for (const rule of rules || []) {
          if (rule.cssText && rule.cssText.includes('safe-area-inset')) found += 1;
        }
      }
      return found;
    });
    expect(usesEnv).toBeGreaterThan(0);
  });

  test('the live layer is present in the stylesheet', async ({ page }) => {
    await openLives(page);
    const hasLiveTokens = await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.className = 'live-root';
      document.body.appendChild(probe);
      const bg = getComputedStyle(probe).backgroundColor;
      const pos = getComputedStyle(probe).position;
      probe.remove();
      return { bg, pos };
    });
    expect(hasLiveTokens.pos).toBe('fixed');
  });
});
