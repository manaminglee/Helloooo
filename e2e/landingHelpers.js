const { expect } = require('@playwright/test');

const VIDEO_MODE_NAME = 'Video chat: Meet a stranger face to face';
const TEXT_MODE_NAME = 'Text chat: Just type, stay anonymous';
const GROUP_MODE_NAME = 'Group video: Up to 8 people';
const LIVE_MODE_NAME = 'Live: Watch creators';

function livesEntry(page) {
  return page.getByRole('dialog', { name: 'Voice room sign in' })
    .or(page.locator('.feed-root'))
    .or(page.locator('.live-root'))
    .or(page.locator('.live-desktop-block'));
}

function videoShell(page) {
  return page.locator('.mm-desk-shell, .mm-mobile-shell');
}

/**
 * Mode cards and the mobile dock disable until the socket is up, matching
 * handleJoin which no-ops when disconnected or already joining.
 */
async function waitUntilAppConnected(page) {
  await expect(page.getByRole('button', { name: VIDEO_MODE_NAME })).toBeEnabled({ timeout: 20000 });
}

async function revealLandingModeCards(page) {
  await page.waitForSelector('[data-landing-pin]', { timeout: 20000 });
  await page.evaluate(() => {
    const pin = document.querySelector('[data-landing-pin]');
    if (!pin) return;
    const top = pin.getBoundingClientRect().top + window.scrollY;
    const travel = Math.max(pin.offsetHeight - window.innerHeight, 0) * 0.88;
    window.scrollTo(0, top + travel);
  });
  await page.waitForSelector('[data-landing-stage][data-cards="1"]', { timeout: 8000 });
}

async function dismissCommunityPolicyIfShown(page) {
  const understand = page.getByRole('button', { name: 'I understand', exact: true });
  try {
    await understand.click({ timeout: 1500 });
  } catch {
    /* already accepted via sessionStorage */
  }
}

async function enterVideoFromLanding(page) {
  const videoBtn = page.getByRole('button', { name: VIDEO_MODE_NAME });
  const shell = videoShell(page);
  await waitUntilAppConnected(page);

  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await videoBtn.click();
    await dismissCommunityPolicyIfShown(page);
    const scan = page.locator('.mm-landing-scan');
    await scan.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
    await scan.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    try {
      await expect(shell).toBeVisible({ timeout: 12000 });
      return;
    } catch (err) {
      lastError = err;
      await waitUntilAppConnected(page);
    }
  }
  throw lastError;
}

/**
 * Open Lives the way a user does now: the floating dock on phones/tablets,
 * or the landing mode card (plus the name gate) on desktop.
 */
async function enterLivesViaModeCard(page) {
  const cardLive = page.getByRole('button', { name: LIVE_MODE_NAME });
  await revealLandingModeCards(page);
  await expect(cardLive).toBeEnabled({ timeout: 20000 });
  await cardLive.click();
  const browse = page.getByRole('button', { name: 'Browse lives', exact: true });
  try {
    await expect(browse).toBeVisible({ timeout: 10000 });
    await browse.click();
  } catch {
    // A stored display name skips the gate and joins immediately.
    await expect(livesEntry(page)).toBeVisible({ timeout: 10000 });
  }
}

async function openLives(page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('wc_age', '1');
    sessionStorage.setItem('wc_bot', '1');
    sessionStorage.setItem('mm_community_policy_video', '1');
    try { localStorage.setItem('mm_pwa_dismissed', '1'); } catch { /* ignore */ }
  });
  await page.goto('/');
  await waitUntilAppConnected(page);

  const dockLive = page.getByRole('button', { name: 'Live', exact: true });
  // Opacity-0 hide-on-scroll counts as not visible; only treat the dock as
  // the entry path when it is actually on screen.
  const dockVisible = await dockLive.isVisible().catch(() => false);

  if (dockVisible) {
    await expect(dockLive).toBeEnabled({ timeout: 20000 });
    await dockLive.click();
  } else {
    await enterLivesViaModeCard(page);
  }

  try {
    await expect(livesEntry(page)).toBeVisible({ timeout: 20000 });
    return;
  } catch {
    // Dock click can no-op if the socket dropped between enable and click;
    // the mode card then uses the name gate.
    await waitUntilAppConnected(page);
    await enterLivesViaModeCard(page);
    await expect(livesEntry(page)).toBeVisible({ timeout: 20000 });
  }
}

module.exports = {
  VIDEO_MODE_NAME,
  TEXT_MODE_NAME,
  GROUP_MODE_NAME,
  LIVE_MODE_NAME,
  revealLandingModeCards,
  enterVideoFromLanding,
  openLives,
  waitUntilAppConnected,
};
