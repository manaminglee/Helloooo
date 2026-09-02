/** Mirrors server/audioIdentity.js rules for instant client feedback. */
export const AUDIO_USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.\-!?@#$%&*]{2,19}$/;

const WEAK_PINS = new Set([
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '1234', '4321', '1212', '1010', '2580',
]);

export function sanitizeAudioUsernameInput(value) {
  return String(value || '').replace(/\s/g, '').slice(0, 20);
}

export function validateAudioUsername(name) {
  const n = String(name || '').trim();
  if (!n) return 'Choose a username.';
  if (!AUDIO_USERNAME_RE.test(n)) {
    return 'Username: 3–20 chars, start with a letter or number. You can use _ . - ! ? @ # $ % & *';
  }
  return '';
}

export function validateAudioPin(pin) {
  const p = String(pin || '').trim();
  if (!/^\d{4}$/.test(p)) return 'PIN must be exactly 4 digits.';
  if (WEAK_PINS.has(p)) return 'Pick a less obvious PIN — avoid 1234, 1111, etc.';
  return '';
}
