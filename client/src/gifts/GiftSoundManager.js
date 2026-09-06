import { getGiftsMuted } from './giftPrefs';

let unlocked = false;
let ctx = null;

export function unlockGiftAudio() {
  unlocked = true;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* */ }
}

function tone(freq, dur, type = 'sine', gain = 0.08) {
  if (getGiftsMuted() || !unlocked) return;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  } catch { /* */ }
}

const FALLBACK = {
  watch_orbit: () => { tone(880, 0.18); tone(1320, 0.35, 'triangle', 0.05); },
  rose_ascent: () => { tone(523, 0.4, 'sine', 0.06); },
  crown_rise: () => { tone(392, 0.25); setTimeout(() => tone(784, 0.5, 'triangle', 0.07), 180); },
  diamond_refract: () => { tone(1400, 0.22, 'triangle', 0.05); tone(2100, 0.18, 'sine', 0.04); },
  rider_impact: () => { tone(90, 0.35, 'sawtooth', 0.04); },
  gold_cascade: () => { tone(980, 0.08); setTimeout(() => tone(1200, 0.08), 90); setTimeout(() => tone(1500, 0.1), 180); },
  car_track: () => { tone(140, 0.5, 'sawtooth', 0.035); },
  castle_rise: () => { tone(261, 0.6, 'triangle', 0.06); },
  default: () => { tone(660, 0.16, 'sine', 0.05); },
};

const playing = new Map();

export function playGiftSound(gift) {
  if (getGiftsMuted()) return;
  unlockGiftAudio();
  const url = gift?.soundUrl;
  if (url) {
    try {
      const audio = new Audio(url);
      audio.volume = 0.55;
      void audio.play().catch(() => {
        (FALLBACK[gift?.scene] || FALLBACK.default)();
      });
      playing.set(gift.id, audio);
      return;
    } catch { /* */ }
  }
  (FALLBACK[gift?.scene] || FALLBACK.default)();
}

export function stopGiftSound(giftId) {
  const audio = playing.get(giftId);
  if (audio) {
    try { audio.pause(); audio.src = ''; } catch { /* */ }
    playing.delete(giftId);
  }
}
