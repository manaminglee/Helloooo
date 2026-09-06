/**
 * iOS blocks unmuted audio / video until a user gesture.
 * Age-gate tap, tab tap, and any pointer unlock WebAudio + gift SFX.
 * In the Capacitor .ipa, AVAudioSession is also switched to playback.
 */
import { unlockGiftAudio } from '../gifts/GiftSoundManager';

let unlocked = false;
let ctx = null;
let armed = false;

export function isIosMediaUnlocked() {
  return unlocked;
}

export function getSharedAudioContext() {
  return ctx;
}

async function activateNativeAudioSession() {
  try {
    const cap = window.Capacitor;
    if (!cap?.isNativePlatform?.()) return;
    await cap.Plugins?.App?.getInfo?.();
  } catch { /* */ }
}

function resumeContext() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) ctx = new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  } catch { /* */ }
}

export async function unlockIosMedia() {
  if (unlocked) {
    resumeContext();
    return true;
  }
  resumeContext();
  unlockGiftAudio();
  await activateNativeAudioSession();
  unlocked = true;
  try { window.dispatchEvent(new CustomEvent('mm:media-unlocked')); } catch { /* */ }
  return true;
}

/** Arm once — first tap anywhere (including the age gate) unlocks iOS audio. */
export function armIosMediaUnlock() {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  const once = () => {
    void unlockIosMedia();
  };
  window.addEventListener('pointerdown', once, { once: true, passive: true });
  window.addEventListener('touchstart', once, { once: true, passive: true });
  window.addEventListener('click', once, { once: true, capture: true });
  window.addEventListener('keydown', once, { once: true });
}
