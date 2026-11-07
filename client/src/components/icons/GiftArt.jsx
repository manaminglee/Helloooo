import { memo } from 'react';

/**
 * Original gift artwork for the Helloooo catalog.
 *
 * No emoji anywhere: emoji glyphs are drawn and owned by Apple, Google,
 * Microsoft and Samsung, they render differently on every handset, and they can
 * never be a product's own identity. Every mark below is ours.
 *
 * Rules of the family:
 *   · 32×32 grid, artwork inset ~2px, silhouette-first so it survives at 26px
 *   · a fixed palette — the whole catalog reads as one set
 *   · flat fills; richness comes from the rarity glow behind, not from the mark
 *   · marks are keyed by the gift's `art` field (defaults to its id), so the
 *     tray, banners and the takeover all resolve art the same way
 *
 * Motion is applied by the CALLER as a CSS class (see `motion` in the catalog),
 * never baked in here — one mark, many contexts, and the tray can pause every
 * animation on an off-screen page.
 */

const C = {
  red: '#f5455f', deepRed: '#c81e3c', pink: '#ff6ea0', rose: '#ff90b3', blush: '#ffc2d4',
  orange: '#ff8a3d', amber: '#fbbf24', gold: '#f5d78e', deepGold: '#d4a017',
  yellow: '#ffd84d', cream: '#fdf3e0', skin: '#f7c9a3', deepSkin: '#d99b6c',
  green: '#4ade80', leaf: '#2f9e5e', deepGreen: '#15803d',
  teal: '#2dd4bf', sky: '#7cc7f7', blue: '#3b82f6', deepBlue: '#1e3a8a',
  violet: '#a855f7', purple: '#6d28d9', magenta: '#e453c9', lilac: '#d8b4fe',
  stone: '#a8b0c0', deepStone: '#616b7e', sand: '#e6cd9a', deepSand: '#b8945a',
  brown: '#8b5a2b', white: '#ffffff', ink: '#2a2140', night: '#161228',
};

/* Each entry: [pathData, color] fills, or [pathData, color, strokeWidth]. */
const ART = {
  /* ----------------------------------------------------------------- funny */
  giggle_ears: [
    ['M11 22c-3-6-4-12-2.6-16.4C9.2 3 11 2.6 12 4.4c1.4 2.6 2 8.2 1.6 17.6Z', C.white],
    ['M21 22c3-6 4-12 2.6-16.4C22.8 3 21 2.6 20 4.4c-1.4 2.6-2 8.2-1.6 17.6Z', C.white],
    ['M11.4 19c-1.8-4.4-2.4-8.6-1.6-11.6.6 3 1.6 6.8 2.8 11.6Z', C.rose],
    ['M20.6 19c1.8-4.4 2.4-8.6 1.6-11.6-.6 3-1.6 6.8-2.8 11.6Z', C.rose],
    ['M6.6 22h18.8a2.4 2.4 0 0 1 0 4.8H6.6a2.4 2.4 0 0 1 0-4.8Z', C.magenta],
  ],
  shady_specs: [
    ['M1.6 12.2h6.2', C.stone, 1.8],
    ['M24.2 12.2h6.2', C.stone, 1.8],
    ['M5.2 11.2h9.2a1.2 1.2 0 0 1 1.2 1.2v6.4a4.6 4.6 0 0 1-9.2 0v-6.4a1.2 1.2 0 0 1 1.2-1.2z', C.ink],
    ['M17.6 11.2h9.2a1.2 1.2 0 0 1 1.2 1.2v6.4a4.6 4.6 0 0 1-9.2 0v-6.4a1.2 1.2 0 0 1 1.2-1.2z', C.ink],
    ['M14.4 15.2h3.2', C.stone, 2],
    ['M7.2 13.6h4.4M19.8 13.6h4.4', C.sky, 1.5],
    ['M8 12.8c2.4-.6 5.2-.4 6.4 1.4', C.white, 1.2],
  ],
  boom_star: [
    ['M16 4.2 19.4 12l8.4 1-6.1 5.8 1.6 8.2L16 23.1 8.7 27l1.6-8.2L4.2 13l8.4-1z', C.amber],
    ['M16 8.6 18 13l4.4.5-3.2 3 .8 4.3L16 18.7l-4 2.1.8-4.3-3.2-3L14 13z', C.gold],
    ['M25.4 6.6l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9zM6 4l.7 1.5 1.5.7-1.5.7L6 8.4l-.7-1.5L3.8 6.2l1.5-.7z', C.white],
  ],
  wink_wave: [
    ['M11 28c-3.4-2.2-5-5.6-4.8-10.2l.4-6.6a1.7 1.7 0 0 1 3.4.2l-.2 4.4V6.2a1.8 1.8 0 0 1 3.6 0v8.6-9.4a1.8 1.8 0 0 1 3.6 0v9.4V8.4a1.7 1.7 0 0 1 3.4 0v8.2l1.4-3.6a1.7 1.7 0 0 1 3.2 1.2l-2.6 7.4c-1 3-3.4 5-7 6.4z', C.skin],
    ['M9.6 15.8V11', C.deepSkin, 1.4],
    ['M26.6 4.4l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8z', C.amber],
  ],
  petal_mask: [
    ['M2.6 12c4.2-1.8 7.8-1.8 10.8 0l2.6 1.5 2.6-1.5c3-1.8 6.6-1.8 10.8 0-.6 5.2-2.6 8.4-6 9.6-3.2 1.1-5.6-.2-7-3.6l-.4-1-.4 1c-1.4 3.4-3.8 4.7-7 3.6-3.4-1.2-5.4-4.4-6-9.6Z', C.violet],
    ['M8.4 12.6c2.4-.7 4.3-.4 5.6 1-1.1 1.9-3 2.3-5.6 1.2zM23.6 12.6c-2.4-.7-4.3-.4-5.6 1 1.1 1.9 3 2.3 5.6 1.2z', C.night],
    ['M22.6 3.4c2.8 0 4.6 2 4.6 4.4s-1.9 4.2-4.6 4.2-4.6-1.8-4.6-4.2 1.8-4.4 4.6-4.4Z', C.red],
    ['M22.6 5.8c1.5 0 2.4 1 2.4 2.2s-1 2.1-2.4 2.1', C.rose, 1.6],
  ],
  cowboy_bear: [
    ['M2.6 21.4c3.6-3.4 8.2-5.2 13.4-5.2s9.8 1.8 13.4 5.2c-2.2 2.6-6.6 4-13.4 4s-11.2-1.4-13.4-4Z', C.brown],
    ['M8.6 18.4c.8-5 3.4-7.6 7.4-7.6s6.6 2.6 7.4 7.6z', C.deepSand],
    ['M20.4 11.6a4 4 0 1 1 0-8 4 4 0 0 1 0 8Z', C.brown],
    ['M18.8 6.6a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2M22 6.6a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2', C.ink],
    ['M17.6 2.6a2 2 0 1 1 0 4 2 2 0 0 1 0-4M23.2 2.6a2 2 0 1 1 0 4 2 2 0 0 1 0-4', C.brown],
    ['M8.4 22.6c1.4-1.8 3.2-2.6 5.4-2.4', C.sand, 1.5],
  ],
  bloom_crown: [
    ['M16 5.4c6.4 0 11.4 4.6 11.4 10.6S22.4 26.6 16 26.6 4.6 22 4.6 16 9.6 5.4 16 5.4Zm0 5.4c-3.4 0-6 2.4-6 5.2s2.6 5.2 6 5.2 6-2.4 6-5.2-2.6-5.2-6-5.2Z', C.orange],
    ['M16 3.6a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4M27 9.6a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4M5 9.6a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4M23 21.4a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4M9 21.4a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4', C.amber],
    ['M16 5.6a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4M27 11.6a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4M5 11.6a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4M23 23.4a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4M9 23.4a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4', C.yellow],
  ],
  hug_heart: [
    ['M16 27C7.4 21.4 4.6 17 4.6 13.2A5.9 5.9 0 0 1 16 10.8a5.9 5.9 0 0 1 11.4 2.4C27.4 17 24.6 21.4 16 27Z', C.pink],
    ['M5.6 17.6c-2.6.2-4.2 1.6-4.6 4.2 2.8.6 4.6-.4 5.6-2.8zM26.4 17.6c2.6.2 4.2 1.6 4.6 4.2-2.8.6-4.6-.4-5.6-2.8z', C.rose],
    ['M12.6 15.4a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6M19.4 15.4a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6', C.ink],
    ['M14.4 20.2c1 .9 2.2.9 3.2 0', C.ink, 1.3],
  ],

  /* ----------------------------------------------------------------- lucky */
  charm_donut: [
    ['M16 5.4c6 0 10.8 4.8 10.8 10.6S22 26.6 16 26.6 5.2 21.8 5.2 16 10 5.4 16 5.4Zm0 7.2a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z', C.deepSand],
    ['M16 5.4c6 0 10.8 4.4 10.8 9.2 0 2.4-2 3.4-4.6 2.6-2.6-.8-3.6.8-3 3.2.6 2.4-1.2 3.6-3.2 3.6-6 0-10.8-4-10.8-9.4S10 5.4 16 5.4Zm0 7.2a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Z', C.rose],
    ['M11 9.2l2.4 1.4M20 9l1.6 2.4M9.4 14.6l2.6.6M22.6 15.2l2 1.6M13.4 22.4l1.6 2', C.white, 1.5],
  ],
  charm_blush: [
    ['M16 4.6c6.6 0 11.6 4.8 11.6 11S22.6 27.4 16 27.4 4.4 21.8 4.4 15.6 9.4 4.6 16 4.6Z', C.amber],
    ['M16 4.6c6.6 0 11.6 4.8 11.6 11 0 2.6-.9 4.9-2.4 6.7-2.2-6.6-7-10.6-14.4-12 1.5-.5 3.2-.8 5.2-.8Z', C.gold],
    ['M9.4 11c1.9-1.7 3.9-1.6 5.4.4-1.6 2.4-3.5 2.7-5.4 1.2zM22.6 11c-1.9-1.7-3.9-1.6-5.4.4 1.6 2.4 3.5 2.7 5.4 1.2z', C.red],
    ['M13 19.4c1.9 1.5 4.1 1.5 6 0-1 2.4-2.5 3.6-3 3.6s-2-1.2-3-3.6Z', C.deepRed],
    ['M8.4 17.4a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8M23.6 17.4a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8', C.rose],
  ],
  charm_clap: [
    ['M6.6 27c-2.6-2.6-3.4-5.8-2.4-9.6l2-7.4a1.7 1.7 0 0 1 3.3.8l-1.2 4.6 3.2-9.8a1.8 1.8 0 0 1 3.4 1.1l-2.6 8 3-9.2a1.8 1.8 0 0 1 3.4 1.1l-2.8 8.6 2.2-6.6a1.7 1.7 0 0 1 3.2 1l-3 12c-.8 3.2-3 5.2-6.4 6z', C.skin],
    ['M22.4 8.2l1.6-4.4M26.6 11l3.4-2.8M26.4 16.6l4.2.4', C.amber, 1.9],
    ['M9.4 16l1.4-4.4M13.4 15l1.4-4.4', C.deepSkin, 1.3],
  ],
  charm_thumb: [
    ['M11.6 13.4 15.2 5c.7-1.6 2.2-2.2 3.5-1.4 1.2.8 1.6 2.2 1 3.8l-1.7 4.6h6.2c2 0 3.4 1.5 3 3.4l-2 9.4c-.4 2-2 3.2-4.2 3.2h-9.4z', C.skin],
    ['M4.6 13h6.4v14.8H4.6a1.6 1.6 0 0 1-1.6-1.6V14.6A1.6 1.6 0 0 1 4.6 13Z', C.orange],
    ['M11.6 16.6h11M11.6 20.4h10', C.deepSkin, 1.3],
    ['M24.4 4.4l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8z', C.amber],
  ],
  charm_fold: [
    ['M8.6 27.4c-2.8-2.4-3.8-5.4-3-9l1.6-7a1.7 1.7 0 0 1 3.3.7l-.9 4 1.5-4.8a1.8 1.8 0 0 1 3.5.9l-1.2 4.2 2.6-4.6a1.8 1.8 0 0 1 3.2 1.6l-2.4 4.6 3.4-3.2a1.7 1.7 0 0 1 2.4 2.4l-4.6 5.6c-1.4 2.6-3.6 4.2-6.6 4.6z', C.skin],
    ['M15.6 3c1.9 0 3.2 1.4 3.2 3 0 2.4-3.2 4.4-3.2 4.4s-3.2-2-3.2-4.4c0-1.6 1.3-3 3.2-3Z', C.red],
    ['M12.4 18.4l2.6-2.4M15.6 21l2.4-2.2', C.deepSkin, 1.3],
  ],
  charm_duck: [
    ['M12.4 6.6c4.4 0 7.6 3 8 7.4h4.4c2.2 0 3.4 1.4 3 3.4-.8 4.6-4.6 7.2-11.4 7.2-6.4 0-10.4-2.8-11.6-8.2C3.6 11 6.8 6.6 12.4 6.6Z', C.yellow],
    ['M20.4 14c-.4-4.4-3.6-7.4-8-7.4-1.6 0-3 .4-4.2 1 4.6.4 8.2 2.6 10.6 6.4z', C.amber],
    ['M24.8 11.4c2.6-.4 4.4.4 5.4 2.4-2.2 1.4-4.2 1.6-6 .6z', C.orange],
    ['M22.2 8.4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z', C.ink],
    ['M6.4 22.6c3 1.4 6.4 2 10 2', C.deepGold, 1.5],
  ],
  charm_cheer: [
    ['M2.6 29.4c-1.2-.4-1.6-1.6-1-2.8L11 13.4l7.2 7.2-13.4 8.4c-.7.5-1.5.6-2.2.4Z', C.violet],
    ['M11 13.4 18.2 20.6l3.4-3.4L14.4 10z', C.magenta],
    ['M23.4 3.4l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z', C.amber],
    ['M18.6 6.4a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4M28.4 12.4a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4M22.6 16.4a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8', C.rose],
    ['M26.4 6.6h3.2M20.4 2.4v3M28.6 19.4l2.4 1.4', C.teal, 1.7],
  ],
  charm_bell: [
    ['M16 4.6c4.6 0 7.4 3.4 7.4 8.4 0 4 .8 6.6 2.6 8.4H6c1.8-1.8 2.6-4.4 2.6-8.4 0-5 2.8-8.4 7.4-8.4Z', C.amber],
    ['M16 4.6c-2.6 0-4.6 1.1-5.8 3 3.8.4 6.4 2.6 8 6.6.9 2.3 1.5 4.7 1.8 7.2h5.9c-1.7-1.8-2.5-4.4-2.5-8.4 0-5-2.8-8.4-7.4-8.4Z', C.gold],
    ['M4.6 21.4h22.8v2.4H4.6z', C.deepGold],
    ['M16 23.8a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6Z', C.deepGold],
    ['M16 2a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8Z', C.deepGold],
  ],
  charm_crystal: [
    ['M12.4 28 7 14.6l4.6-6.2 5 5.4z', C.violet],
    ['M19.6 28 26 12.4l-4.4-7-5 8.4z', C.magenta],
    ['M16.6 13.4 11.6 8.4 16 2.6l4.8 4.8z', C.lilac],
    ['M12.4 28 16.6 13.4 19.6 28z', C.purple],
    ['M28 6.6l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z', C.white],
  ],
  glam_charm: [
    ['M18.4 12.6h7.2v13.6a2 2 0 0 1-2 2h-3.2a2 2 0 0 1-2-2z', C.rose],
    ['M18.4 8.4h7.2v4.2h-7.2z', C.deepGold],
    ['M19.6 2.4c2 1 3.2 2.6 3.2 4.6v1.4h-4.4V4.6c0-1.2.4-1.9 1.2-2.2Z', C.red],
    ['M6.4 16.4h7.2v9.8a2 2 0 0 1-2 2H8.4a2 2 0 0 1-2-2z', C.blush],
    ['M6.4 12.6h7.2v3.8H6.4z', C.gold],
    ['M20.6 15.4h2.8M20.6 19h2.8', C.blush, 1.3],
  ],
  wish_lamp: [
    ['M5.4 21.6h21.2c1.4 0 2.2 1 1.8 2.4-.8 2.6-4.6 4-11.6 4S6 26.6 4.8 24c-.6-1.4.2-2.4 1.4-2.4Z', C.deepGold],
    ['M8.6 21.6c-.8-4.6 2.2-7.8 7.4-7.8s8.2 3.2 7.4 7.8z', C.amber],
    ['M8.6 21.6c-.6-3.6 1.2-6.4 4.8-7.4-1.6 2.2-2.4 4.7-2.4 7.4z', C.gold],
    ['M23.4 16.4c3.4-1 6-.2 7.8 2.4-2.8 1.8-5.4 2-7.8.4z', C.deepGold],
    ['M8.4 15.8c-3-.4-5 .8-6 3.6 2.8 1.2 4.8.4 6-2.4z', C.deepGold],
    ['M13.4 13.8h5.2l-.9-3h-3.4z', C.deepGold],
    ['M16 4.4l1 2.4 2.4 1-2.4 1-1 2.4-1-2.4-2.4-1 2.4-1z', C.cream],
    ['M25.4 6.6l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z', C.white],
  ],
  hex_charm: [
    ['M2.4 24.6c0-1.8 6.1-3.2 13.6-3.2s13.6 1.4 13.6 3.2-6.1 3.2-13.6 3.2S2.4 26.4 2.4 24.6Z', C.purple],
    ['M17.6 3.2c1-1.2 2.6-.8 2.8.8l2.4 18c-2.2.4-4.4.6-6.8.6-2.8 0-5.4-.3-7.8-.9z', C.violet],
    ['M10.6 17.6c3.4-.8 7-.8 10.6 0l.5 3.6c-3.8-.9-7.8-.9-11.8 0z', C.ink],
    ['M14.4 18.6h3.4v2.6h-3.4z', C.amber],
    ['M25.6 8.6l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8zM6.4 12.4l.7 1.5 1.5.7-1.5.7-.7 1.5-.7-1.5-1.5-.7 1.5-.7z', C.amber],
  ],
  wish_bottle: [
    ['M11.4 12.4h9.2v13.4a2.6 2.6 0 0 1-2.6 2.6h-4a2.6 2.6 0 0 1-2.6-2.6z', C.blush],
    ['M13 6.6h6v5.8h-6z', C.rose],
    ['M12.4 3.4h7.2v3.2h-7.2z', C.deepSand],
    ['M13.4 16.6a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2M18.6 18.6a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2M15.6 22.4a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8', C.amber],
    ['M17.4 14.4l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z', C.white],
  ],
  fortune_tusk: [
    ['M8.6 11.6c-3.8-2-6.6-1.4-8.4 1.8 2.6 4 5.6 5 9 3zM23.4 11.6c3.8-2 6.6-1.4 8.4 1.8-2.6 4-5.6 5-9 3z', C.deepStone],
    ['M16 6.6c4.8 0 8 3.4 8 8.4 0 2.4-.6 4.5-1.7 6.3l-1.1 5.1h-2.6l-.7-3.4c-.6.1-1.2.2-1.9.2s-1.3-.1-1.9-.2l-.7 3.4h-2.6l-1.1-5.1A11.9 11.9 0 0 1 8 15c0-5 3.2-8.4 8-8.4Z', C.stone],
    ['M16 19.6c-.7 3.8.5 6.2 3.4 7.4.6-2.9.2-5.1-1.4-6.6z', C.deepStone],
    ['M12.6 19.6c-1.6 1.4-2.4 3-2.4 4.8 1.8-.6 3-1.8 3.6-3.6zM19.4 19.6c1.6 1.4 2.4 3 2.4 4.8-1.8-.6-3-1.8-3.6-3.6z', C.cream],
    ['M13 13.4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3M19 13.4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3', C.ink],
    ['M10.4 6.6h11.2l-1 -3.4h-9.2z', C.blue],
    ['M12.6 3.2h6.8L18.6.6h-5.2z', C.deepGold],
  ],
  pearl_shell: [
    ['M16 25.4C9 25.4 3.6 21 2.6 14.4l6-8.6 7.4 5 7.4-5 6 8.6c-1 6.6-6.4 11-13.4 11Z', C.blush],
    ['M16 25.4c-2.4-4.4-2.4-9.4 0-15M9.6 24c-.6-4.6.4-9 3-13.4M22.4 24c.6-4.6-.4-9-3-13.4M4.6 19.6c1.4-3.4 3.6-6 6.6-8M27.4 19.6c-1.4-3.4-3.6-6-6.6-8', C.rose, 1.4],
    ['M16 20.6a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z', C.white],
    ['M14.6 22.6a1.4 1.4 0 1 1 0 2.8 1.4 1.4 0 0 1 0-2.8Z', C.lilac],
    ['M25.4 3.4l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9z', C.lilac],
  ],
  cupid_bolt: [
    ['M16 26.6c-7.6-5-10-9-10-12.4A5.2 5.2 0 0 1 16 12a5.2 5.2 0 0 1 10 2.2c0 3.4-2.4 7.4-10 12.4Z', C.red],
    ['M6.4 12.4C3.6 9.6 1.6 8.6.4 9.4c1 4 2.6 6.6 5 7.8zM25.6 12.4c2.8-2.8 4.8-3.8 6-3-1 4-2.6 6.6-5 7.8z', C.white],
    ['M22.6 4.4 12.4 14.6', C.deepGold, 1.9],
    ['M28.4 1.6l-1.4 5-4.4-.6z', C.amber],
    ['M12.4 14.6l-4 1.4 1.4-4z', C.amber],
  ],
};

/* --------------------------------------------------------------- luxury */
Object.assign(ART, {
  rose_bear: [
    ['M8.4 6.4a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6M23.6 6.4a3.8 3.8 0 1 1 0 7.6 3.8 3.8 0 0 1 0-7.6', C.deepRed],
    ['M16 3.4c4.8 0 8.2 3.2 8.2 7.6S20.8 18.4 16 18.4 7.8 15.4 7.8 11 11.2 3.4 16 3.4Z', C.red],
    ['M16 17.6c5.4 0 9.2 3.6 9.2 8.2 0 1.4-.7 2.2-2.2 2.2H9c-1.5 0-2.2-.8-2.2-2.2 0-4.6 3.8-8.2 9.2-8.2Z', C.red],
    ['M11.4 7.4a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8M20.6 7.4a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8M16 4.6a1.9 1.9 0 1 1 0 3.8 1.9 1.9 0 0 1 0-3.8M10.4 20.4a2 2 0 1 1 0 4 2 2 0 0 1 0-4M21.6 20.4a2 2 0 1 1 0 4 2 2 0 0 1 0-4M16 24.4a2 2 0 1 1 0 4 2 2 0 0 1 0-4', C.deepRed],
    ['M13 12.4a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4M19 12.4a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4', C.ink],
    ['M16 19.4c2.2 0 3.8 1.5 3.8 3.5S18.2 26.4 16 26.4s-3.8-1.5-3.8-3.5 1.6-3.5 3.8-3.5Z', C.blush],
  ],
  heart_wings: [
    ['M15.6 15.4C10.6 12 8.6 8.4 12 4.6c-4.6 1.4-8 .4-11.4-2.4.6 6.6 3.4 11 8.4 13.2z', C.cream],
    ['M16.4 15.4c5-3.4 7-7 3.6-10.8 4.6 1.4 8 .4 11.4-2.4-.6 6.6-3.4 11-8.4 13.2z', C.white],
    ['M16 29C9.6 24.6 7.4 21 7.4 17.8A4.8 4.8 0 0 1 16 15.8a4.8 4.8 0 0 1 8.6 2c0 3.2-2.2 6.8-8.6 11.2Z', C.magenta],
    ['M16 4.6a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8Z', C.amber],
  ],
  gold_watch: [
    ['M16 3.4a12.6 12.6 0 1 1 0 25.2 12.6 12.6 0 0 1 0-25.2Z', C.amber],
    ['M16 6.6a9.4 9.4 0 1 1 0 18.8 9.4 9.4 0 0 1 0-18.8Z', C.gold],
    ['M16 9a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z', C.cream],
    ['M16 11.4V16l3.4 2', C.ink, 1.6],
    ['M11.6 1.6h8.8v3.4a12.4 12.4 0 0 0-8.8 0zM11.6 30.4h8.8V27a12.4 12.4 0 0 1-8.8 0z', C.deepGold],
    ['M27.4 6l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8z', C.white],
  ],
  neon_rider: [
    ['M7 24.4a4.6 4.6 0 1 0 0-9.2 4.6 4.6 0 0 0 0 9.2ZM25 24.4a4.6 4.6 0 1 0 0-9.2 4.6 4.6 0 0 0 0 9.2Z', C.ink],
    ['M7 22.2a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8ZM25 22.2a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8Z', C.sky],
    ['M7 19.8h6.4l4.2-6.4h5.6l1.8 6.4', C.magenta, 2.6],
    ['M12.4 13.4h8.2l2.4-4.6-3.4-1.4-2 3.4h-5.2z', C.violet],
    ['M22.6 8.8 27.4 6l1.6 3-4.8 2.4z', C.blue],
    ['M2.4 20h4M1.4 23.4h5', C.teal, 1.5],
  ],
  true_bloom: [
    ['M12.6 19.4h6.8l2.6 10.2H10z', C.cream],
    ['M12.6 19.4h6.8l-.6 2.6h-5.6z', C.deepSand],
    ['M7.6 8.4a5 5 0 1 1 0 10 5 5 0 0 1 0-10M24.4 8.4a5 5 0 1 1 0 10 5 5 0 0 1 0-10', C.deepRed],
    ['M16 2.4a5.6 5.6 0 1 1 0 11.2 5.6 5.6 0 0 1 0-11.2Z', C.red],
    ['M7.6 11c1.8 0 2.9 1.2 2.9 2.5s-1.2 2.4-2.7 2.4M24.4 11c-1.8 0-2.9 1.2-2.9 2.5s1.2 2.4 2.7 2.4', C.rose, 1.6],
    ['M16 5.4c1.9 0 3.1 1.3 3.1 2.7s-1.3 2.6-2.9 2.6c-1.1 0-1.9-.7-1.9-1.6s.6-1.6 1.5-1.6', C.rose, 1.7],
  ],
  gold_rain: [
    ['M4.4 28.4 16 12.6l11.6 15.8z', C.deepGold],
    ['M8.6 28.4 16 18l7.4 10.4z', C.amber],
    ['M12.6 28.4 16 23.6l3.4 4.8z', C.gold],
    ['M6.4 3a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4M16 1.6a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4M25.6 3a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4M11 8.6a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6M21 8.6a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6', C.amber],
    ['M2.6 10.4a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2M29.4 10.4a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2', C.gold],
  ],
  hyper_car: [
    ['M2.4 20.6c2.6-.6 5-2 7.2-4.2 1.6-1.6 3.4-2.4 5.4-2.4h5.4c3 0 5.6 1.2 8 3.6l3.2 3.2c.8.8.6 2-.6 2.4l-3 1H5.4c-2 0-3-1.2-3-3.6Z', C.magenta],
    ['M11 16.6c1.2-1 2.4-1.4 3.8-1.4h5c2 0 3.8.7 5.6 2.2l1.8 1.6H8.6z', C.night],
    ['M8.6 24.6a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8ZM24 24.6a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z', C.ink],
    ['M8.6 22.6a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8ZM24 22.6a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Z', C.stone],
    ['M1 12.6h8M3 9.4h7M5 6.4h6', C.violet, 1.8],
    ['M28.6 19.4l2.4.6', C.white, 1.6],
  ],
  skyline_glow: [
    ['M2.6 29.4h26.8v-1.8H2.6z', C.deepBlue],
    ['M4 27.6V17h4.6v10.6zM10.4 27.6V13h4v14.6zM22 27.6V15.6h4.4v12z', C.blue],
    ['M16.4 27.6V6.6h3.4v21z', C.sky],
    ['M18.1 2 19.8 6.6h-3.4z', C.teal],
    ['M5.4 19h1.8M5.4 22h1.8M11.8 15.4h1.4M11.8 18.6h1.4M11.8 21.8h1.4M23.4 18h1.6M23.4 21.4h1.6', C.cream, 1.3],
    ['M27.6 5l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8z', C.white],
  ],
  royal_lion: [
    ['M16 5.6c6.8 0 11.6 4.8 11.6 11.2S22.8 28 16 28 4.4 23.2 4.4 16.8 9.2 5.6 16 5.6Z', C.orange],
    ['M16 9.4c4.2 0 7.2 3 7.2 7s-3 7.2-7.2 7.2-7.2-3.2-7.2-7.2 3-7 7.2-7Z', C.amber],
    ['M12.6 14.6a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4M19.4 14.6a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4', C.ink],
    ['M16 18.6l-2 1.6c.5 1.4 1.2 2.2 2 2.2s1.5-.8 2-2.2z', C.deepRed],
    ['M6.4 8.4 10 12M25.6 8.4 22 12M4.6 20l3.6-1.6M27.4 20l-3.6-1.6', C.deepGold, 2],
    ['M7.4 6.6 11 10l5-5.6 5 5.6 3.6-3.4-1.6 6H9z', C.gold],
  ],
  private_jet: [
    ['M28.6 3.4c1.2 1.2 1.1 3-.3 4.7L19 18.6l-2.8 9.6-3.4-3.4 1.4-7.2-7.2 1.4-3.4-3.4 9.6-2.8L24 3.7c1.7-1.4 3.4-1.5 4.6-.3Z', C.cream],
    ['M28.6 3.4c1.2 1.2 1.1 3-.3 4.7L19 18.6l-1.4 4.8-1.6-1.6L26.4 9.4c1.4-1.7 1.9-3.5 2.2-6Z', C.white],
    ['M20.6 8.6a1.6 1.6 0 1 1 0 3.2 1.6 1.6 0 0 1 0-3.2Z', C.sky],
    ['M4.4 27.6c2.4-1.6 4.6-2.6 6.6-3M2.6 22.4c1.6-1 3-1.7 4.4-2', C.sky, 1.5],
  ],
  dream_castle: [
    ['M2.4 29h27.2v-2.2H2.4z', C.deepStone],
    ['M3.4 26.8V13.4h6.2v13.4zM22.4 26.8V13.4h6.2v13.4z', C.cream],
    ['M11.4 26.8V9.6h9.2v17.2z', C.white],
    ['M6.5 4.4 10.6 13.4H2.4zM25.5 4.4l4.1 9H21.4zM16 1.4 21.4 9.6H10.6z', C.magenta],
    ['M13.6 26.8v-6a2.4 2.4 0 0 1 4.8 0v6z', C.violet],
    ['M5.4 16.4h2.4v3H5.4zM24.2 16.4h2.4v3h-2.4zM14.8 13.4h2.4v3.4h-2.4z', C.sky],
  ],
});

/* ------------------------------------------------------------ privilege */
Object.assign(ART, {
  cloud_garden: [
    ['M6.4 20.4h19.2l-4.6 7.4c-1.6 2.6-3.2 3.4-5 3.4s-3.4-.8-5-3.4z', C.lilac],
    ['M4.4 15.4h23.2c1.6 0 2.6 1.2 2.4 2.6-.4 1.6-1.8 2.4-4 2.4H6c-2.2 0-3.6-.8-4-2.4-.2-1.4.8-2.6 2.4-2.6Z', C.violet],
    ['M10.4 15.4V8.6h7.2v6.8z', C.white],
    ['M9.4 8.6h9.2l-2-3h-5.2z', C.magenta],
    ['M12 10.6h1.6v2H12zM15 10.6h1.6v2H15z', C.sky],
    ['M21.4 15.4c-.4-3 .8-4.8 3.6-5.4-.2 3-1.4 4.8-3.6 5.4Z', C.green],
    ['M6.6 15.4c.4-2.6 2-4 4.6-4.2-.6 2.6-2.2 4-4.6 4.2Z', C.teal],
    ['M26.6 4.4l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8L24 7.0l1.8-.8z', C.cream],
  ],
  tide_muse: [
    ['M16 3.4a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8Z', C.blush],
    ['M11.6 4.6c-2.4 3.4-3 7-1.8 10.8l1.8 5.6h8.8l1.8-5.6c1.2-3.8.6-7.4-1.8-10.8-1.4 2.4-3 3.6-4.4 3.6s-3-1.2-4.4-3.6Z', C.teal],
    ['M11.6 21h8.8c1.4 4.2.4 7-3 8.4 1.4-2.8 1-5-1.4-6.4-2.4 1.4-2.8 3.6-1.4 6.4-3.4-1.4-4.4-4.2-3-8.4Z', C.sky],
    ['M4.6 24.6c2.6-2.4 5-3.4 7.2-3-1.6 2.8-4 3.8-7.2 3ZM27.4 24.6c-2.6-2.4-5-3.4-7.2-3 1.6 2.8 4 3.8 7.2 3Z', C.teal],
    ['M14.2 6.6a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4M17.8 6.6a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4', C.ink],
    ['M16 1.6a3 3 0 0 1 3 3h-6a3 3 0 0 1 3-3Z', C.cream],
  ],
  aeon_diamond: [
    ['M16 29.4C7.6 22.6 4.4 18 4.4 13.4A7 7 0 0 1 16 9.6a7 7 0 0 1 11.6 3.8c0 4.6-3.2 9.2-11.6 16Z', C.sky],
    ['M16 9.6 9.4 14l6.6 5.4L22.6 14z', C.white],
    ['M4.4 13.4 9.4 14l6.6 15.4zM27.6 13.4 22.6 14 16 29.4z', C.blue],
    ['M9.4 14h13.2L16 19.4z', C.teal],
    ['M25 3l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9z', C.cream],
  ],
  eternal_spire: [
    ['M2.6 29.4h26.8v-2H2.6z', C.deepStone],
    ['M11.4 27.4 13 13.6h6l1.6 13.8z', C.cream],
    ['M13 13.6 16 4.4l3 9.2z', C.white],
    ['M16 1 17.2 4.4h-2.4z', C.amber],
    ['M6.4 27.4 7.6 19h3l1 8.4zM22 27.4 23 19h3l1.2 8.4z', C.lilac],
    ['M7.6 19 9.1 14.4 10.6 19zM23 19l1.5-4.6L26 19z', C.violet],
    ['M14.8 27.4v-5a1.2 1.2 0 0 1 2.4 0v5z', C.magenta],
    ['M15 16.6h2v3h-2z', C.sky],
  ],
  legend_crown: [
    ['M4.6 22.6h22.8v4.6c0 .8-.6 1.4-1.4 1.4H6c-.8 0-1.4-.6-1.4-1.4z', C.deepGold],
    ['M4.6 22.6h22.8v1.6H4.6z', C.gold],
    ['M5.2 22.8 8 9.6 12.2 16 16 5.4 19.8 16 24 9.6 26.8 22.8z', C.amber],
    ['M8.6 22.6 10.4 13.8 12.4 17.8 16 9.2 19.6 17.8 21.6 13.8 23.4 22.6z', C.gold],
    ['M16 11.2a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4Z', C.red],
    ['M9.4 16.8a1.55 1.55 0 1 1 0 3.1 1.55 1.55 0 0 1 0-3.1M22.6 16.8a1.55 1.55 0 1 1 0 3.1 1.55 1.55 0 0 1 0-3.1', C.magenta],
    ['M16 3.2a2.05 2.05 0 1 1 0 4.1 2.05 2.05 0 0 1 0-4.1M8 7.6a1.55 1.55 0 1 1 0 3.1 1.55 1.55 0 0 1 0-3.1M24 7.6a1.55 1.55 0 1 1 0 3.1 1.55 1.55 0 0 1 0-3.1', C.cream],
    ['M10.2 24h2.2v1.8h-2.2zM14.9 24h2.2v1.8h-2.2zM19.6 24h2.2v1.8h-2.2z', C.magenta],
  ],
});

/* ==========================================================================
   SHADING
   --------------------------------------------------------------------------
   The marks below are drawn as flat silhouettes on purpose — flat shapes are
   editable, tiny, and never go blurry. The volume is added HERE, at render
   time, so all 40 gifts share one lighting model and a new gift inherits it
   for free.

   The model is a single key light from the upper left:
     · every flat fill becomes a radial gradient — lit face, body colour,
       shaded edge — which is what turns a circle into a sphere
     · one specular sheen across the whole silhouette, masked to it
     · one occlusion wash in the lower right, same mask
     · a soft contact shadow on the ground beneath

   Deliberately NO SVG filters. feGaussianBlur forces an off-screen render pass
   per element, and eight of those in a tray on top of a decoding video is
   exactly how a gift panel starts dropping frames. Gradients are free by
   comparison, and soft gradient stops give the same softness.
   ========================================================================== */

const WHITE = [255, 255, 255];
/* Shadows tint toward deep violet rather than black — black shading reads as
   dirt, a coloured shadow reads as a lit object. */
const SHADE = [34, 22, 58];

function hexToRgb(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function toHex(rgb) {
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}
function mix(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }

const tintCache = new Map();
function tint(hex, t, target) {
  const key = `${hex}|${t}|${target[0]}`;
  let v = tintCache.get(key);
  if (!v) { v = toHex(mix(hexToRgb(hex), target, t)); tintCache.set(key, v); }
  return v;
}
const lighten = (hex, t) => tint(hex, t, WHITE);
const darken = (hex, t) => tint(hex, t, SHADE);

/** Stable, collision-safe suffix for gradient ids within one document. */
function slug(v) {
  return String(v).replace(/[^a-zA-Z0-9]/g, '');
}

/** Neutral mark for an id with no art yet — never an emoji fallback. */
const FALLBACK = [
  ['M6 12.6h20v13a1.8 1.8 0 0 1-1.8 1.8H7.8A1.8 1.8 0 0 1 6 25.6z', '#a855f7'],
  ['M4.4 8.4h23.2v4.2H4.4z', '#e453c9'],
  ['M16 8.4v19', '#fdf3e0', 1.8],
];

export const GIFT_ART_IDS = Object.keys(ART);
export const hasGiftArt = (id) => Object.hasOwn(ART, String(id || ''));

/**
 * @param {string} id      gift id, or its `art` key
 * @param {string} tier    basic | rare | epic | legendary | mega
 * @param {string} motion  idle animation class suffix from the catalog
 * @param {boolean} still  force-disable motion (off-screen tray pages)
 * @param {boolean} flat   skip shading (tiny sizes, where it just muddies)
 */
export const GiftArt = memo(function GiftArt({
  id, tier = 'basic', size = 32, motion = null, still = false,
  flat = false, className = '', title = null,
}) {
  const paths = ART[id] || FALLBACK;
  const s = Number(size) || 32;
  const key = slug(id || 'x');
  // Below ~22px the shading has nowhere to resolve and only lowers contrast.
  const shade = !flat && s >= 22;
  const sparkle = shade && ['epic', 'legendary', 'mega', 'ultra'].includes(String(tier));

  const cls = ['mm-gift', motion && !still ? `mm-gift--${motion}` : '', className]
    .filter(Boolean).join(' ');

  const fills = [...new Set(paths.filter(([, , w]) => !w).map(([, c]) => c))];

  return (
    <svg
      className={cls}
      width={s}
      height={s}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}

      {shade && (
        <defs>
          {fills.map((c) => (
            <radialGradient
              key={c}
              id={`gg-${key}-${slug(c)}`}
              cx="32%" cy="24%" r="88%"
            >
              <stop offset="0%" stopColor={lighten(c, 0.48)} />
              <stop offset="22%" stopColor={lighten(c, 0.22)} />
              <stop offset="48%" stopColor={c} />
              <stop offset="78%" stopColor={darken(c, 0.18)} />
              <stop offset="100%" stopColor={darken(c, 0.38)} />
            </radialGradient>
          ))}

          {/* The silhouette. Both the sheen and the occlusion are clipped to
              it, so light never spills outside the object. */}
          <mask id={`gm-${key}`} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
            {paths.map(([d, , w], i) => (
              <path
                key={i}
                d={d}
                fill={w ? 'none' : '#fff'}
                stroke={w ? '#fff' : 'none'}
                strokeWidth={w || undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </mask>

          {/* A hotspot, not a wash. A broad sheen flattens light-coloured
              marks by lifting their whole silhouette toward white. */}
          <radialGradient id={`gs-${key}`} cx="30%" cy="18%" r="42%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.62" />
            <stop offset="28%" stopColor="#fff" stopOpacity="0.22" />
            <stop offset="58%" stopColor="#fff" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={`gh-${key}`} cx="28%" cy="16%" r="18%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`gr-${key}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
            <stop offset="42%" stopColor="#fff" stopOpacity="0" />
            <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.28" />
          </linearGradient>

          <radialGradient id={`go-${key}`} cx="76%" cy="86%" r="62%">
            <stop offset="0%" stopColor={toHex(SHADE)} stopOpacity="0.30" />
            <stop offset="70%" stopColor={toHex(SHADE)} stopOpacity="0.06" />
            <stop offset="100%" stopColor={toHex(SHADE)} stopOpacity="0" />
          </radialGradient>

          <radialGradient id={`gc-${key}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#000" stopOpacity="0.40" />
            <stop offset="65%" stopColor="#000" stopOpacity="0.14" />
            <stop offset="100%" stopColor="#000" stopOpacity="0" />
          </radialGradient>
        </defs>
      )}

      {/* No rarity disc — the mark itself is the art. Soft contact shadow only. */}
      {shade && <ellipse cx="16.4" cy="28.6" rx="9.5" ry="2.4" fill={`url(#gc-${key})`} />}

      {paths.map(([d, color, strokeWidth], i) => (
        strokeWidth
          ? (
            <path
              key={i}
              d={d}
              stroke={shade ? darken(color, 0.16) : color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          )
          : (
            <path
              key={i}
              d={d}
              fill={shade ? `url(#gg-${key}-${slug(color)})` : color}
            />
          )
      ))}

      {shade && (
        <g mask={`url(#gm-${key})`}>
          <rect x="0" y="0" width="32" height="32" fill={`url(#go-${key})`} />
          <rect x="0" y="0" width="32" height="32" fill={`url(#gs-${key})`} />
          <rect x="0" y="0" width="32" height="32" fill={`url(#gh-${key})`} />
        </g>
      )}

      {shade && (
        <g opacity="0.7">
          {paths.filter(([, , w]) => !w).map(([d], i) => (
            <path
              key={`rim-${i}`}
              d={d}
              fill="none"
              stroke={`url(#gr-${key})`}
              strokeWidth="0.7"
              strokeLinejoin="round"
            />
          ))}
        </g>
      )}

      {sparkle && (
        <g opacity="0.92">
          <path d="M27.2 5.4 28 7.4l2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" fill="#fff7d6" />
          <path d="M5.6 7 6.1 8.3 7.4 8.8 6.1 9.3 5.6 10.6 5.1 9.3 3.8 8.8 5.1 8.3z" fill="#fff" />
          <path d="M26.6 22.2 27 23.2l1 .4-1 .4-.4 1-.4-1-1-.4 1-.4z" fill="#ffe8a3" />
        </g>
      )}
    </svg>
  );
});

export default GiftArt;
