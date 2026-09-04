import { memo } from 'react';

/**
 * The Helloooo icon system.
 *
 * One drawing style, one component, no emoji. Emoji are platform artwork —
 * Apple, Google and Microsoft each draw their own and own those drawings — so
 * they can never be a product's identity. These are original marks.
 *
 * Rules of the family (keep them if you add icons):
 *   · 24×24 grid, artwork inset 2px from the edge
 *   · 1.7 stroke, round caps and joins, no fill on structural strokes
 *   · exactly one SOLID accent per icon where the eye should land — the
 *     mic head, the camera lens, the bow of a gift. That weight distribution
 *     is the signature that makes the set read as ours rather than generic.
 *   · geometry only: circles, arcs and straight runs. No hand-drawn wobble.
 *
 * Usage:  <MmIcon name="gift" size={20} />
 * Colour comes from `currentColor`, so icons inherit the surface they sit on.
 */

// d = stroke paths, a = solid accent paths, c = circles [cx, cy, r, solid?]
const ICONS = {
  /* ---- live room ---- */
  gift: {
    d: ['M4.2 11.4h15.6v7.4a1.4 1.4 0 0 1-1.4 1.4H5.6a1.4 1.4 0 0 1-1.4-1.4z', 'M3 8.2h18v3.2H3z', 'M12 8.2v12'],
    a: ['M12 8.2c-2.6 0-4.6-.7-4.6-2.3S8.6 3.4 9.9 3.9C11.1 4.4 12 6.3 12 8.2Z', 'M12 8.2c2.6 0 4.6-.7 4.6-2.3s-1.2-2.5-2.5-2C12.9 4.4 12 6.3 12 8.2Z'],
  },
  heart: {
    d: ['M12 20.4C5.4 15.9 3.2 12.6 3.2 9.5A4.5 4.5 0 0 1 12 7.6a4.5 4.5 0 0 1 8.8 1.9c0 3.1-2.2 6.4-8.8 10.9Z'],
  },
  heartSolid: {
    a: ['M12 20.6C5.3 16 3 12.7 3 9.5A4.7 4.7 0 0 1 12 7.5a4.7 4.7 0 0 1 9 2c0 3.2-2.3 6.5-9 11.1Z'],
  },
  users: {
    d: ['M2.8 20.2c0-3 2.4-4.7 5.6-4.7s5.6 1.7 5.6 4.7', 'M16.4 15.9c2.7.3 4.8 1.9 4.8 4.3', 'M15.6 5.2a3.3 3.3 0 0 1 0 6.2'],
    c: [[8.4, 9.4, 3.5]],
  },
  share: {
    d: ['M12 3.6v11.2', 'M8.1 7.4 12 3.6l3.9 3.8', 'M5.2 13.2v5.8a1.4 1.4 0 0 0 1.4 1.4h10.8a1.4 1.4 0 0 0 1.4-1.4v-5.8'],
  },
  send: {
    d: ['M20.6 3.7 3.9 10.2l6.6 2.6 2.6 6.7z', 'M10.5 12.8 20.6 3.7'],
    a: ['M10.5 12.8 20.6 3.7l-7.5 15.8-2.6-6.7Z'],
  },
  shield: {
    d: ['M12 3.2 4.6 6v6.1c0 4 3.1 7.1 7.4 8.7 4.3-1.6 7.4-4.7 7.4-8.7V6z'],
    a: ['M12 6.1 7.4 7.8v4.3c0 2.5 1.9 4.5 4.6 5.6z'],
  },
  mic: {
    d: ['M6.3 10.9v1.2a5.7 5.7 0 0 0 11.4 0v-1.2', 'M12 17.8v3', 'M8.9 20.8h6.2'],
    a: ['M12 2.4a3.1 3.1 0 0 1 3.1 3.1v6.4a3.1 3.1 0 0 1-6.2 0V5.5A3.1 3.1 0 0 1 12 2.4Z'],
  },
  micOff: {
    d: ['M6.3 10.9v1.2a5.7 5.7 0 0 0 8.5 4.9', 'M17.7 12.1v-1.2', 'M12 17.8v3', 'M8.9 20.8h6.2', 'M9 5.2a3.1 3.1 0 0 1 6.1.3v6.4c0 .5-.1.9-.3 1.3', 'M8.9 9v2.9a3.1 3.1 0 0 0 3.6 3', 'M3.6 3 20.4 21'],
  },
  cameraFlip: {
    d: ['M3.4 8.6a1.4 1.4 0 0 1 1.4-1.4h2.9l1.4-2.3h5.8l1.4 2.3h2.9a1.4 1.4 0 0 1 1.4 1.4v9.4a1.4 1.4 0 0 1-1.4 1.4H4.8a1.4 1.4 0 0 1-1.4-1.4z', 'M9.4 13.3a2.6 2.6 0 0 1 4.5-1.8', 'M14.6 13.3a2.6 2.6 0 0 1-4.5 1.8', 'M13.9 9.4v2.1h-2.1', 'M10.1 17.2v-2.1h2.1'],
  },
  image: {
    d: ['M3.6 5.6h16.8v12.8H3.6z', 'M3.6 15.4 8.5 11l4 3.4 3.3-2.6 4.6 3.7'],
    c: [[8.2, 9.2, 1.5, true]],
  },
  pin: {
    d: ['M12 14.2v6.4', 'M8.1 3.4h7.8', 'M9.4 3.4v6l-2.6 2.4v1.9h10.4v-1.9l-2.6-2.4v-6'],
    a: ['M9.4 3.4h5.2v3.1H9.4z'],
  },
  trash: {
    d: ['M3.8 6.4h16.4', 'M9.4 3.6h5.2v2.8H9.4z', 'M5.9 6.4l.9 13a1.4 1.4 0 0 0 1.4 1.3h7.6a1.4 1.4 0 0 0 1.4-1.3l.9-13', 'M10.3 10.2v6.6', 'M13.7 10.2v6.6'],
  },
  userMinus: {
    d: ['M2.9 20.4c0-3.1 2.4-4.9 5.7-4.9 1.5 0 2.9.4 3.9 1.1', 'M15.2 18.4h5.9'],
    c: [[8.6, 9, 3.6]],
  },
  ban: {
    d: ['M5 5 19 19'],
    c: [[12, 12, 8.6]],
  },
  flag: {
    d: ['M5.6 3.4v17.2', 'M5.6 4.6h12.8l-2.6 4 2.6 4H5.6z'],
    a: ['M5.6 4.6h12.8l-2.6 4 2.6 4H5.6z'],
  },
  more: {
    c: [[5.4, 12, 1.6, true], [12, 12, 1.6, true], [18.6, 12, 1.6, true]],
  },
  close: {
    d: ['M6 6 18 18', 'M18 6 6 18'],
  },
  back: {
    d: ['M20 12H4.4', 'M10.6 5.4 4 12l6.6 6.6'],
  },
  refresh: {
    d: ['M20.2 12a8.2 8.2 0 1 1-2.6-6', 'M20.6 3.6v5.2h-5.2'],
  },
  check: {
    d: ['M4.6 12.6 9.6 17.6 19.4 6.8'],
  },
  chevron: {
    d: ['M9.4 5.2 16.2 12l-6.8 6.8'],
  },
  plus: {
    d: ['M12 5v14', 'M5 12h14'],
  },
  verified: {
    // Both stroked on purpose: a filled badge in currentColor would swallow a
    // currentColor check. Monochrome icons have to stay legible on any surface.
    d: [
      'M12 2.4 14.3 4.4l3-.4 1 2.9 2.7 1.4-1 2.9 1 2.9-2.7 1.4-1 2.9-3-.4L12 21.6 9.7 19.6l-3 .4-1-2.9L3 15.7l1-2.9-1-2.9 2.7-1.4 1-2.9 3 .4z',
      'M8.9 12.1 11.2 14.5 15.4 9.8',
    ],
  },
  broadcast: {
    d: ['M7.4 7.4a6.5 6.5 0 0 0 0 9.2', 'M16.6 16.6a6.5 6.5 0 0 0 0-9.2', 'M4.4 4.4a10.7 10.7 0 0 0 0 15.2', 'M19.6 19.6a10.7 10.7 0 0 0 0-15.2'],
    c: [[12, 12, 2.4, true]],
  },
  eye: {
    d: ['M2.6 12S6.2 5.8 12 5.8 21.4 12 21.4 12 17.8 18.2 12 18.2 2.6 12 2.6 12Z'],
    c: [[12, 12, 2.7, true]],
  },
  clock: {
    d: ['M12 6.8V12l3.4 2.1'],
    c: [[12, 12, 8.6]],
  },
  star: {
    d: ['M12 3.2l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.2l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z'],
  },
  starSolid: {
    a: ['M12 3.2l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.2l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z'],
  },
  sparkle: {
    a: ['M12 2.6c.7 4.4 2.3 6 6.7 6.7-4.4.7-6 2.3-6.7 6.7-.7-4.4-2.3-6-6.7-6.7 4.4-.7 6-2.3 6.7-6.7Z'],
    d: ['M18.4 15.4c.3 2 1 2.7 3 3-2 .3-2.7 1-3 3-.3-2-1-2.7-3-3 2-.3 2.7-1 3-3Z'],
  },
  crown: {
    d: ['M4 17.6h16', 'M3.4 7.2 7 11.4l5-6.4 5 6.4 3.6-4.2-1.6 8.4H5z'],
    a: ['M3.4 7.2 7 11.4l5-6.4 5 6.4 3.6-4.2-1.6 8.4H5z'],
  },
  trophy: {
    d: ['M7.4 3.6h9.2v5.2a4.6 4.6 0 0 1-9.2 0z', 'M7.4 5.2H4.6v1.4a3.4 3.4 0 0 0 2.8 3.3', 'M16.6 5.2h2.8v1.4a3.4 3.4 0 0 1-2.8 3.3', 'M12 13.4v3.8', 'M8.2 20.4h7.6l-.9-3.2H9.1z'],
  },
  coinStack: {
    d: ['M4.4 7.6c0-1.7 3.4-3 7.6-3s7.6 1.3 7.6 3-3.4 3-7.6 3-7.6-1.3-7.6-3Z', 'M4.4 7.6v8.8c0 1.7 3.4 3 7.6 3s7.6-1.3 7.6-3V7.6', 'M4.4 12c0 1.7 3.4 3 7.6 3s7.6-1.3 7.6-3'],
  },
  at: {
    d: ['M16.2 12a4.2 4.2 0 1 1-1.4-3.1', 'M16.2 8v5a2.6 2.6 0 0 0 5.2 0v-1a9.4 9.4 0 1 0-3.7 7.5'],
  },
  camera: {
    d: ['M3.4 8.6a1.4 1.4 0 0 1 1.4-1.4h2.9l1.4-2.3h5.8l1.4 2.3h2.9a1.4 1.4 0 0 1 1.4 1.4v9.4a1.4 1.4 0 0 1-1.4 1.4H4.8a1.4 1.4 0 0 1-1.4-1.4z'],
    c: [[12, 13.3, 3.4]],
  },
  volume: {
    d: ['M4.2 9.4h3.2L12 5.4v13.2l-4.6-4H4.2z', 'M15.6 9.6a3.6 3.6 0 0 1 0 4.8', 'M18.2 7.2a7 7 0 0 1 0 9.6'],
    a: ['M4.2 9.4h3.2L12 5.4v13.2l-4.6-4H4.2z'],
  },
  volumeOff: {
    d: ['M4.2 9.4h3.2L12 5.4v13.2l-4.6-4H4.2z', 'M16.2 9.8 20.6 14.2', 'M20.6 9.8 16.2 14.2'],
    a: ['M4.2 9.4h3.2L12 5.4v13.2l-4.6-4H4.2z'],
  },
  slowMode: {
    d: ['M12 7v5.2l3.2 1.9', 'M2.8 12a9.2 9.2 0 0 1 15.6-6.6', 'M21.2 12a9.2 9.2 0 0 1-15.6 6.6', 'M18.4 2.4v3.2h-3.2', 'M5.6 21.6v-3.2h3.2'],
  },
  chatOff: {
    d: ['M20.4 13.6a7.6 7.6 0 0 1-9.8 7.3L5 21.8l1-4.4a7.6 7.6 0 0 1 8-11.8', 'M3.6 3 20.4 21'],
  },
  chat: {
    d: ['M20.4 12.4a7.8 7.8 0 0 1-11.6 6.8L4 20.6l1.4-4.6A7.8 7.8 0 1 1 20.4 12.4Z'],
    c: [[8.6, 12.4, 1.2, true], [12, 12.4, 1.2, true], [15.4, 12.4, 1.2, true]],
  },
  signalOff: {
    d: ['M3.6 3 20.4 21', 'M6.8 15.2a7.4 7.4 0 0 1 3-2.1', 'M3.4 11.4a12.2 12.2 0 0 1 4.4-2.9', 'M20.6 11.4a12.2 12.2 0 0 0-8.8-3.5'],
    c: [[12, 18.4, 1.5, true]],
  },
};

export const MM_ICON_NAMES = Object.keys(ICONS);

export const MmIcon = memo(function MmIcon({
  name,
  size = 20,
  strokeWidth = 1.7,
  className = '',
  title = null,
  ...rest
}) {
  const icon = ICONS[name];
  if (!icon) return null;
  const s = Number(size) || 20;
  const accents = icon.a || [];
  const strokes = icon.d || [];
  const circles = icon.c || [];

  return (
    <svg
      className={`mm-icon ${className}`.trim()}
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title && <title>{title}</title>}
      {/* The single solid accent — drawn under the strokes unless the icon
          asks otherwise, so outlines always stay crisp on top of it. */}
      {accents.map((d, i) => (
        <path key={`a${i}`} d={d} fill="currentColor" stroke="none" opacity={icon.accentUnder ? 1 : 0.92} />
      ))}
      {strokes.map((d, i) => <path key={`d${i}`} d={d} />)}
      {circles.map(([cx, cy, r, solid], i) => (
        <circle
          key={`c${i}`}
          cx={cx}
          cy={cy}
          r={r}
          fill={solid ? 'currentColor' : 'none'}
          stroke={solid ? 'none' : 'currentColor'}
        />
      ))}
    </svg>
  );
});

export default MmIcon;
