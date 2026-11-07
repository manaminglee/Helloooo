const VIDEO_MODE_NAME = 'Video chat: Meet a stranger face to face';
const TEXT_MODE_NAME = 'Text chat: Just type, stay anonymous';
const GROUP_MODE_NAME = 'Group video: Up to 8 people';

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

module.exports = {
  VIDEO_MODE_NAME,
  TEXT_MODE_NAME,
  GROUP_MODE_NAME,
  revealLandingModeCards,
};
