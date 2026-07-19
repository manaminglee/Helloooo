/**
 * sounds.js — Lightweight Web Audio API sound engine for Mana Mingle
 * No external files needed — all synthesized in-browser.
 *
 * - Lazy AudioContext (created on first play), resume attempted on every play
 *   so the first user gesture unlocks audio.
 * - Single master gain kept low (0.08) so UI sounds stay soft.
 * - Every sound respects the `soundFx` user pref (utils/userPrefs).
 */
import { getPrefs } from './userPrefs';

const MASTER_LEVEL = 0.08;

let ctx = null;
let masterGain = null;

const getCtx = () => {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    masterGain = ctx.createGain();
    masterGain.gain.value = MASTER_LEVEL;
    masterGain.connect(ctx.destination);
  }
  return ctx;
};

const play = (fn) => {
  try {
    if (!getPrefs().soundFx) return;
    const ac = getCtx();
    if (!ac || !masterGain) return;
    // Browsers block audio before the first user gesture — try to resume,
    // fail silently if still locked.
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    fn(ac, masterGain);
  } catch (e) { /* audio unavailable — ignore */ }
};

/** Schedule a soft sine tone into the master bus. */
function tone(ac, dest, { freq, endFreq = null, at = 0, peak = 1.0, attack = 0.02, decay = 0.4, type = 'sine' }) {
  const t0 = ac.currentTime + at;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.connect(gain);
  gain.connect(dest);
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t0 + attack + decay * 0.6);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + attack + decay);
  osc.start(t0);
  osc.stop(t0 + attack + decay + 0.05);
}

/** Message sent — short, quiet "pop". */
export const playPop = () => play((ac, dest) => {
  tone(ac, dest, { freq: 620, endFreq: 940, peak: 0.9, attack: 0.01, decay: 0.14, type: 'triangle' });
});

/** Message received — soft descending "ding". */
export const playDing = () => play((ac, dest) => {
  tone(ac, dest, { freq: 880, endFreq: 660, peak: 1.0, attack: 0.005, decay: 0.22 });
});

/** Partner found / group joined — warm two-tone ascending chime. */
export const playMatch = () => play((ac, dest) => {
  tone(ac, dest, { freq: 440, at: 0, peak: 1.0, attack: 0.04, decay: 0.5 });
  tone(ac, dest, { freq: 660, at: 0.15, peak: 1.0, attack: 0.04, decay: 0.5 });
});

/** Descending "disconnect" tone. */
export const playDisconnectSound = () => play((ac, dest) => {
  tone(ac, dest, { freq: 440, endFreq: 220, peak: 1.0, attack: 0.005, decay: 0.5 });
});

/** Quick wave "whoosh". */
export const playWaveSound = () => play((ac, dest) => {
  tone(ac, dest, { freq: 300, endFreq: 700, peak: 0.8, attack: 0.005, decay: 0.3 });
});

// ---------------------------------------------------------------------------
// Backwards-compatible aliases (existing call sites use these names)
// ---------------------------------------------------------------------------
export const playConnectSound = playMatch;
export const playMessageSound = playDing;
