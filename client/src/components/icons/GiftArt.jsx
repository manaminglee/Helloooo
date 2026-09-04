import { memo } from 'react';

/**
 * Original gift artwork.
 *
 * Every gift in the catalog is drawn here as SVG on a shared 32×32 grid. None
 * of it is emoji: emoji glyphs are drawn and owned by Apple, Google, Microsoft
 * and Samsung, they render differently on every device, and they can never be
 * a product's own identity. These are ours.
 *
 * Rules of the family:
 *   · 32×32 grid, artwork inset ~3px, silhouette-first so it survives at 26px
 *   · a fixed palette (below) — the whole catalog reads as one set
 *   · flat fills, no gradients in the marks themselves; rarity supplies the
 *     richness instead, as a glow behind legendary and mega pieces
 *   · landmarks are silhouettes, not illustrations. At gift-tray size a
 *     silhouette is the only thing that still reads.
 *
 * Adding a gift: add its id here. The tray, banners and full-screen takeover
 * all resolve art by gift id, so nothing else needs touching.
 */

const C = {
  red: '#f5455f', deepRed: '#c81e3c', pink: '#ff6ea0', rose: '#ff90b3',
  orange: '#ff8a3d', amber: '#fbbf24', gold: '#f5d78e', deepGold: '#d4a017',
  yellow: '#ffd84d', cream: '#fdf3e0',
  green: '#4ade80', leaf: '#2f9e5e', deepGreen: '#15803d',
  teal: '#2dd4bf', sky: '#7cc7f7', blue: '#3b82f6', deepBlue: '#1e3a8a',
  violet: '#a855f7', purple: '#6d28d9', magenta: '#e453c9',
  stone: '#a8b0c0', deepStone: '#616b7e', sand: '#e6cd9a', deepSand: '#b8945a',
  brown: '#8b5a2b', white: '#ffffff', ink: '#2a2140', night: '#161228',
};

/* Each entry: [pathData, color] fills, or [pathData, color, strokeWidth]. */
const ART = {
  /* ------------------------------------------------------------------ fruits */
  apple: [
    ['M16 10c2.6-3.6 9-2.6 9 4.2 0 5.8-3.8 12-6.4 12-1.2 0-1.5-.8-2.6-.8s-1.4.8-2.6.8C10.8 26.2 7 20 7 14.2 7 7.4 13.4 6.4 16 10Z', C.red],
    ['M16.6 9.6c-.3-3.2 1.6-5.8 5-6.2.4 3.4-1.6 6-5 6.2Z', C.leaf],
    ['M15.2 9.8c-.4-2-.2-3.6.6-5', C.brown, 1.6],
  ],
  mango: [
    ['M23.4 8.2c3.6 2.6 3.6 9-.6 13.2s-10.4 5-13 1.6c-2.6-3.4-.6-9.4 3.6-13S19.8 5.6 23.4 8.2Z', C.amber],
    ['M14.4 12.4c2.2-2.6 5.4-4 7.8-4', C.orange, 1.8],
    ['M22.8 8c.4-2.6 2-4.2 4.6-4.6.2 2.8-1.6 4.6-4.6 4.6Z', C.leaf],
  ],
  banana: [
    ['M5.6 17.2c1.4 7 11.6 10.4 19 4.2 1.6-1.4.6-3.6-1.4-3-6 1.8-12.4-.4-14.2-5.6-.8-2.2-4-1.2-3.4 4.4Z', C.yellow],
    ['M24.6 21.4c1.6-1.4.6-3.6-1.4-3l-1 .3', C.deepGold, 1.6],
  ],
  grape: [
    ['M16 10.5c.4-3 2.4-4.8 6-5.2', C.leaf, 1.8],
    ['M20.6 3.4c2.8-.6 4.8.6 6 3.2-3 1.2-5.2.2-6-3.2Z', C.leaf],
    ['M7.6 13.4a3.2 3.2 0 1 0 6.4 0 3.2 3.2 0 1 0-6.4 0M18 13.4a3.2 3.2 0 1 0 6.4 0 3.2 3.2 0 1 0-6.4 0M12.8 18.6a3.2 3.2 0 1 0 6.4 0 3.2 3.2 0 1 0-6.4 0M9.6 23.4a3.2 3.2 0 1 0 6.4 0 3.2 3.2 0 1 0-6.4 0M16 23.4a3.2 3.2 0 1 0 6.4 0 3.2 3.2 0 1 0-6.4 0', C.violet],
    ['M12.8 13.4a3.2 3.2 0 1 0 6.4 0 3.2 3.2 0 1 0-6.4 0M7.6 18.6a3.2 3.2 0 1 0 6.4 0 3.2 3.2 0 1 0-6.4 0M18 18.6a3.2 3.2 0 1 0 6.4 0 3.2 3.2 0 1 0-6.4 0', C.purple],
  ],
  watermelon: [
    ['M3.6 23.4a14 14 0 0 1 24.8 0Z', C.green],
    ['M6.4 22.6a11 11 0 0 1 19.2 0Z', C.cream],
    ['M8.4 21.8a9 9 0 0 1 15.2 0Z', C.red],
    ['M12 19.4a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 1 0-2.2 0M17.8 19.4a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 1 0-2.2 0M14.9 15.6a1.1 1.1 0 1 0 2.2 0 1.1 1.1 0 1 0-2.2 0', C.ink],
  ],
  pineapple: [
    ['M16 10.4c4 0 6.6 3.4 6.6 8s-2.6 8-6.6 8-6.6-3.4-6.6-8 2.6-8 6.6-8Z', C.amber],
    ['M16 3.4c1.6 2 2.2 4.4 1.8 7-2.6.4-4.6-.8-6-3.4 2-.6 3.4-1.8 4.2-3.6Z', C.leaf],
    ['M16 3.4c-1.6 2-2.2 4.4-1.8 7 2.6.4 4.6-.8 6-3.4-2-.6-3.4-1.8-4.2-3.6Z', C.deepGreen],
  ],

  /* ----------------------------------------------------------------- flowers */
  rose: [
    ['M16 27.6V17.4', C.leaf, 1.9],
    ['M16 22.6c-3-1.8-5.4-1.2-7 1.8 3 1.8 5.4 1.2 7-1.8Z', C.leaf],
    ['M16 21.4c3-1.8 5.4-1.2 7 1.8-3 1.8-5.4 1.2-7-1.8Z', C.deepGreen],
    ['M16 3.6c5.8 0 9.4 3.8 9.4 8.4S21.8 20.6 16 20.6 6.6 16.6 6.6 12 10.2 3.6 16 3.6Z', C.deepRed],
    ['M9.4 10.6c1.4-3.4 4-5 7.6-4.6-1 3.6-3.6 5.6-7.6 4.6Z', C.red],
    ['M22.6 10.6c-1.4-3.4-4-5-7.6-4.6 1 3.6 3.6 5.6 7.6 4.6Z', C.red],
    ['M9.6 14.6c3.4-1.4 6.2-.6 8.4 2.4-3.2 1.6-6 .8-8.4-2.4Z', C.red],
    ['M22.4 14.6c-3.4-1.4-6.2-.6-8.4 2.4 3.2 1.6 6 .8 8.4-2.4Z', C.red],
    ['M17.8 10.2c1.4.8 1.8 2.4 1 3.8s-2.6 1.8-4 1c-1-.6-1.4-1.8-.8-2.8', C.pink, 1.9],
  ],
  tulip: [
    ['M16 28V15', C.leaf, 1.8],
    ['M16 22c-3-1.6-5.4-1-7 1.6 2.8 1.8 5.2 1.2 7-1.6Z', C.leaf],
    ['M8.6 8.6c2 0 3.4 1.4 3.8 3.4.6-2.6 1.8-4 3.6-4s3 1.4 3.6 4c.4-2 1.8-3.4 3.8-3.4v5.6c0 3.2-3.2 5.8-7.4 5.8s-7.4-2.6-7.4-5.8z', C.pink],
  ],
  sunflower: [
    ['M16 26V17', C.leaf, 1.8],
    ['M16 3.4 18 9h-4zM16 24.6 14 19h4zM3.8 14l5.6 2v-4zM28.2 14l-5.6-2v4zM7.4 5.4 12 9.2l-2.8 2.8zM24.6 22.6 20 18.8l2.8-2.8zM24.6 5.4 20 9.2l2.8 2.8zM7.4 22.6 12 18.8l-2.8-2.8z', C.amber],
    ['M16 8.6a5.4 5.4 0 1 1 0 10.8 5.4 5.4 0 0 1 0-10.8Z', C.brown],
  ],
  cherry_blossom: [
    ['M16 4c2.2 0 3.6 2 3 4.4-2 .6-4 .6-6 0-.6-2.4.8-4.4 3-4.4Z', C.rose],
    ['M27.4 12.4c.7 2.1-.8 4-3.2 3.9-1.2-1.7-1.8-3.6-1.8-5.6 2.3-.7 4.3.1 5 1.7Z', C.rose],
    ['M23 25.8c-1.8 1.3-4 .5-4.6-1.8 1.4-1.5 3-2.6 4.9-3.2 1.4 1.9 1.4 4-.3 5Z', C.rose],
    ['M9 25.8c1.8 1.3 4 .5 4.6-1.8-1.4-1.5-3-2.6-4.9-3.2-1.4 1.9-1.4 4 .3 5Z', C.rose],
    ['M4.6 12.4c-.7 2.1.8 4 3.2 3.9 1.2-1.7 1.8-3.6 1.8-5.6-2.3-.7-4.3.1-5 1.7Z', C.rose],
    ['M16 13.4a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z', C.amber],
  ],
  bouquet: [
    ['M11.4 15.6h9.2l2.4 12H9z', C.cream],
    ['M11.4 15.6h9.2l-.6 3h-8z', C.deepSand],
    ['M10 9.4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z', C.pink],
    ['M22 9.4a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z', C.violet],
    ['M16 4.6a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8Z', C.red],
  ],
  lotus: [
    ['M16 8c2.8 2.4 4 5.4 3.6 9h-7.2C12 13.4 13.2 10.4 16 8Z', C.pink],
    ['M8 11.4c3.4.8 5.6 2.8 6.6 6l-2 2.4C9.6 18 8 15.2 8 11.4Z', C.rose],
    ['M24 11.4c-3.4.8-5.6 2.8-6.6 6l2 2.4c3-1.8 4.6-4.6 4.6-8.4Z', C.rose],
    ['M4 17.6c4.6 0 8.4 2.6 12 7.8-5.6 1.6-9.8-1-12-7.8Z', C.magenta],
    ['M28 17.6c-4.6 0-8.4 2.6-12 7.8 5.6 1.6 9.8-1 12-7.8Z', C.magenta],
  ],

  /* ------------------------------------------------------------- spectacles */
  sunglasses: [
    ['M2.4 10h27.2l-1.2 3.6H3.6z', C.stone],
    ['M4.2 13.4h10.2v4.8a5.1 5.1 0 0 1-10.2 0zM17.6 13.4h10.2v4.8a5.1 5.1 0 0 1-10.2 0z', C.deepStone],
    ['M14.4 15.4h3.2', C.stone, 1.9],
    ['M6.4 14.8h3.6M19.8 14.8h3.6', C.sky, 1.5],
  ],
  glasses: [
    ['M9 12.4a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6ZM23 12.4a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6Z', C.sky],
    ['M13.8 17.2h4.4M3.2 15 4.6 13M28.8 15 27.4 13', C.stone, 1.8],
  ],
  party_glasses: [
    ['M9 12.4a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6ZM23 12.4a4.8 4.8 0 1 1 0 9.6 4.8 4.8 0 0 1 0-9.6Z', C.magenta],
    ['M13.8 17.2h4.4', C.amber, 1.8],
    ['M9 14.2l1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1zM23 14.2l1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1z', C.amber],
  ],
  monocle: [
    ['M13 8.4a8.6 8.6 0 1 1 0 17.2 8.6 8.6 0 0 1 0-17.2Zm0 2.6a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z', C.gold],
    ['M21 11.4 27 6.2', C.gold, 1.8],
    ['M13 11a6 6 0 0 1 5.4 3.4', C.white, 1.6],
  ],
  vr: [
    ['M4 11.4h24a2 2 0 0 1 2 2v5.4a2 2 0 0 1-2 2h-6.6L16 17.4l-5.4 3.4H4a2 2 0 0 1-2-2v-5.4a2 2 0 0 1 2-2Z', C.ink],
    ['M6 14h6.6v4H6zM19.4 14H26v4h-6.6z', C.teal],
  ],

  /* ---------------------------------------------------------------- classic */
  heart: [
    ['M16 27.6C6.4 21.2 3 16.4 3 11.8A6.6 6.6 0 0 1 16 9.2a6.6 6.6 0 0 1 13 2.6c0 4.6-3.4 9.4-13 15.8Z', C.red],
    ['M9.6 8.6a4 4 0 0 0-3.4 3.6', C.rose, 1.8],
  ],
  star: [
    ['M16 3.2 20 12l9.6 1.2-7 6.6 1.8 9.4L16 24.6 7.6 29.2 9.4 19.8l-7-6.6L12 12Z', C.amber],
    ['M16 7.6 18.4 13l5.8.8-4.2 4', C.gold, 1.6],
  ],
  fire: [
    ['M16 2.8c1.4 5 7.6 6.4 7.6 13.4A7.6 7.6 0 0 1 16 28.6a7.6 7.6 0 0 1-7.6-12.4c0-4 2.4-5.6 3.4-8.6.6 1.8 1.6 2.8 3 3 .4-3 .6-5.6 1.2-7.8Z', C.orange],
    ['M16 15.6c1 2.4 3.4 3 3.4 5.8a3.6 3.6 0 0 1-7.2 0c0-2 1.6-3.2 2.2-5 .4.8 1 1.2 1.6 1.4Z', C.yellow],
  ],
  cake: [
    ['M6 16.4h20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z', C.cream],
    ['M4 21.6c2.4 0 2.4 2 4.8 2s2.4-2 4.8-2 2.4 2 4.8 2 2.4-2 4.8-2 2.4 2 4.8 2v-3.2a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2z', C.pink],
    ['M16 16.4V11', C.stone, 1.8],
    ['M16 5.4c1.6 1.8 2.4 3.2 2.4 4.2a2.4 2.4 0 0 1-4.8 0c0-1 .8-2.4 2.4-4.2Z', C.amber],
  ],
};

/* -------------------------------------------------------------- landmarks
   Silhouettes only. At 26px in a gift tray an illustration turns to mud; a
   silhouette keeps its identity. Two tones per mark: face and shadow.        */
Object.assign(ART, {
  charminar: [
    ['M4.4 27.6h23.2v-2.4H4.4z', C.deepSand],
    ['M8.6 25.2h14.8V12.4H8.6z', C.sand],
    ['M11 25.2v-4.6a2.4 2.4 0 0 1 4.8 0v4.6zM16.2 25.2v-4.6a2.4 2.4 0 0 1 4.8 0v4.6z', C.deepSand],
    ['M5.4 25.2h3.2V10.6H5.4zM23.4 25.2h3.2V10.6h-3.2z', C.sand],
    ['M7 10.6a1.6 1.6 0 0 0-3.2 0zM28.2 10.6a1.6 1.6 0 0 0-3.2 0zM17.6 12.4a1.6 1.6 0 0 0-3.2 0z', C.gold],
  ],
  taj_mahal: [
    ['M3.6 27.6h24.8v-2.2H3.6z', C.deepSand],
    ['M9 25.4h14v-9.2H9z', C.cream],
    ['M16 5.6c4 2.6 5.8 5.8 5.8 10.6H10.2C10.2 11.4 12 8.2 16 5.6Z', C.cream],
    ['M16 3.2v2.6', C.gold, 1.6],
    ['M4.6 25.4h2.8V13.4H4.6zM24.6 25.4h2.8V13.4h-2.8z', C.sand],
    ['M13.4 25.4v-5.2a2.6 2.6 0 0 1 5.2 0v5.2z', C.deepSand],
  ],
  berlin_gate: [
    ['M3.4 27.6h25.2v-2.4H3.4z', C.deepStone],
    ['M4.6 25.2h22.8V11.4H4.6z', C.stone],
    ['M8 25.2V14.8h2.6v10.4zM13 25.2V14.8h2.6v10.4zM18 25.2V14.8h2.6v10.4z', C.deepStone],
    ['M3.6 11.4h24.8V8.6H3.6z', C.stone],
    ['M12.4 8.6V5.4h7.2v3.2z', C.deepStone],
  ],
  eiffel: [
    ['M16 2.6 24.4 28h-4.2L16 13.6 11.8 28H7.6z', C.deepStone],
    ['M10.6 20.4h10.8v2.2H10.6zM12.4 13.6h7.2v2h-7.2z', C.stone],
    ['M16 2.6v4', C.gold, 1.6],
  ],
  statue_liberty: [
    ['M11.2 28h9.6l-1.4-3.4h-6.8z', C.deepStone],
    ['M13 24.6 14.6 13h3.6l1.8 11.6z', C.teal],
    ['M16 6.6a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2Z', C.teal],
    ['M16 6.6 14.6 3.6M16 6.6 16 3M16 6.6 17.6 3.6M13.4 7.4 11 5.2M18.6 7.4 21 5.2', C.teal, 1.5],
    ['M19.4 13.4 22.6 6', C.teal, 1.8],
    ['M22.6 6c1.4-1.4 2.6-1.2 3.4.6-1.4 1.6-2.6 1.4-3.4-.6Z', C.amber],
  ],
  colosseum: [
    ['M4.6 24.8c0-6.4 5.1-11.4 11.4-11.4s11.4 5 11.4 11.4v2.8H4.6z', C.sand],
    ['M8 24.8v-4.4a2 2 0 0 1 4 0v4.4zM14 24.8v-4.8a2 2 0 0 1 4 0v4.8zM20 24.8v-4.4a2 2 0 0 1 4 0v4.4z', C.deepSand],
    ['M5.4 18.2h21.2v2H5.4z', C.deepSand],
    ['M9.4 12.4l1.6 3M22.6 12.4l-1.6 3', C.deepSand, 1.5],
  ],
  big_ben: [
    ['M11.6 28h8.8V15.4h-8.8z', C.sand],
    ['M10.8 15.4h10.4v-2.6H10.8z', C.deepSand],
    ['M16 3 20.4 12.8h-8.8z', C.deepSand],
    ['M16 16.8a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8Z', C.cream],
    ['M16 18.6v1.6l1.4.9', C.ink, 1.3],
  ],
  sydney_opera: [
    ['M2.6 27.6h26.8v-2.2H2.6z', C.sky],
    ['M4 25.4c0-6 3.4-10.6 8.4-12.4-1 4.6-.6 8.8 1.2 12.4z', C.cream],
    ['M11 25.4c0-6.6 3.8-11.6 9.2-13.6-1 5-.6 9.6 1.4 13.6z', C.white],
    ['M18.6 25.4c0-5.4 3.2-9.4 7.8-11-.8 4-.4 7.8 1.2 11z', C.cream],
  ],
  fuji: [
    ['M2.4 26.6 16 6.4l13.6 20.2z', C.deepBlue],
    ['M9.6 16.6c1.6 1.4 2.8 1.4 4 0s2.4-1.4 4 0 2.6 1.4 4.2 0L16 6.4z', C.white],
  ],
  pyramids: [
    ['M2.6 27.6h26.8v-2.2H2.6z', C.deepSand],
    ['M11 25.4 20 8.6l9 16.8z', C.sand],
    ['M2.4 25.4 9.4 12.6l7 12.8z', C.deepSand],
    ['M20 8.6l4.6 8.6L20 25.4z', C.deepSand],
  ],
  great_wall: [
    ['M1.6 28h28.8v-2.2H1.6z', C.deepGreen],
    ['M2.4 25.8v-4.6h8.2v-4h9.4v-4.4h9.6v13z', C.stone],
    ['M2.4 21.2v-1.7h1.4v.9h1.6v-.9h1.4v1.7zM10.6 17.2v-1.7H12v.9h1.6v-.9H15v1.7zM20 12.8v-1.7h1.4v.9H23v-.9h1.4v1.7z', C.deepStone],
    ['M7.6 25.8v-8.4H12v8.4zM18.8 25.8v-9.6h4.6v9.6z', C.deepStone],
    ['M7.6 17.4v-2.1H9v1.1h1.6v-1.1H12v2.1zM18.8 16.2v-2.1h1.5v1.1h1.6v-1.1h1.5v2.1z', C.stone],
  ],
  christ_redeemer: [
    ['M9.4 28h13.2l-2.6-4.4h-8z', C.deepStone],
    ['M14.4 23.6 15.2 12h1.6l.8 11.6z', C.stone],
    ['M16 6.4a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4Z', C.stone],
    ['M4.6 12.6h22.8v2.4H4.6z', C.stone],
  ],
  burj: [
    ['M16 2 18.6 12h2.2l1.4 7.4h2L26 28H6l1.8-8.6h2L11.2 12h2.2z', C.sky],
    ['M16 2v26', C.white, 1.2],
  ],
  machu: [
    ['M2.6 27.6h26.8v-2.2H2.6z', C.leaf],
    ['M4 25.4 13 8.6l7 9.4 4-4.4 5 11.8z', C.deepGreen],
    ['M8.6 25.4v-3h5v3zM15 25.4v-4.6h6.4v4.6z', C.stone],
  ],
  niagara: [
    ['M1.6 8.4h10.2v6.4H1.6zM20.2 8.4h10.2v6.4H20.2z', C.deepGreen],
    ['M1.6 8.4h10.2v2.2H1.6zM20.2 8.4h10.2v2.2H20.2z', C.leaf],
    ['M11.8 10.6h8.4v4.2h-8.4z', C.sky],
    ['M11.4 14.4h9.2v8.4c0 1.5-2.1 2.6-4.6 2.6s-4.6-1.1-4.6-2.6z', C.sky],
    ['M14 15.4v8.2M16 15.2v8.6M18 15.4v8.2', C.white, 1.5],
    ['M8.4 26.2c2.2 1.4 4.8 2.1 7.6 2.1s5.4-.7 7.6-2.1', C.white, 2.1],
    ['M6 23.4c1.2.9 2.5 1.5 4 1.8M26 23.4c-1.2.9-2.5 1.5-4 1.8', C.white, 1.6],
  ],
  acropolis: [
    ['M4.6 28h22.8v-2.4H4.6z', C.deepSand],
    ['M6.6 25.6V14h2.8v11.6zM11.4 25.6V14h2.8v11.6zM16.2 25.6V14H19v11.6zM21 25.6V14h2.8v11.6z', C.cream],
    ['M4.6 14h22.8v-2.4H4.6z', C.sand],
    ['M16 5 27 11.6H5z', C.cream],
  ],
  golden_gate: [
    ['M2.6 21.6h26.8v2.6H2.6z', C.deepRed],
    ['M8.4 24.2V6.6h2.6v17.6zM21 24.2V6.6h2.6v17.6z', C.red],
    ['M2.6 21.6C6 14 8.4 10.4 9.7 10.4S13.4 14 16 21.6c2.6-7.6 5-11.2 6.3-11.2s3.7 3.6 7.1 11.2', C.red, 1.8],
    ['M8.4 9.6h2.6v1.6H8.4zM21 9.6h2.6v1.6H21z', C.deepRed],
  ],
  petra: [
    ['M3.4 28h25.2v-2.4H3.4z', C.deepSand],
    ['M5.6 25.6V9.4L16 3l10.4 6.4v16.2z', C.sand],
    ['M12.6 25.6v-8a3.4 3.4 0 0 1 6.8 0v8z', C.deepSand],
    ['M9 20.6V14h1.8v6.6zM21.2 20.6V14H23v6.6z', C.deepSand],
    ['M16 6.4a2.4 2.4 0 1 1 0 4.8 2.4 2.4 0 0 1 0-4.8Z', C.deepSand],
  ],
  angkor: [
    ['M2.6 28h26.8v-2.4H2.6z', C.deepStone],
    ['M4 25.6V17h6v8.6zM22 25.6V17h6v8.6z', C.stone],
    ['M7 4.6 10.6 17H3.4zM25 4.6 28.6 17h-7.2z', C.stone],
    ['M11.6 25.6V13.6h8.8v12z', C.stone],
    ['M16 1.6 21.6 13.6h-11.2z', C.sand],
  ],
  stonehenge: [
    ['M2.6 28h26.8v-2.4H2.6z', C.deepStone],
    ['M4.4 25.6V12.4h4.4v13.2zM13.8 25.6V12.4h4.4v13.2zM23.2 25.6V12.4h4.4v13.2z', C.stone],
    ['M3.4 12.4h6.4V8.6H3.4zM12.8 12.4h6.4V8.6h-6.4zM22.2 12.4h6.4V8.6h-6.4z', C.deepStone],
  ],
});

/* ------------------------------------------------------- premium + mega */
Object.assign(ART, {
  crown: [
    ['M4 24.4h24v3.2H4z', C.deepGold],
    ['M3.2 8.4 8.6 14 16 4.8 23.4 14l5.4-5.6-2.4 13.6H5.6z', C.amber],
    ['M8.6 14 16 4.8 23.4 14l-3.4 2.6h-8z', C.gold],
    ['M16 17.4a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z', C.red],
  ],
  diamond: [
    ['M8.6 4.6h14.8L29 12.4 16 28.4 3 12.4z', C.sky],
    ['M8.6 4.6 12 12.4h8l3.4-7.8z', C.white],
    ['M3 12.4h26L16 28.4z', C.teal],
    ['M12 12.4h8L16 28.4z', C.sky],
  ],
  rocket: [
    ['M16 2.4c4.4 3.4 6.6 8 6.6 14l-2.6 5.2h-8l-2.6-5.2c0-6 2.2-10.6 6.6-14Z', C.cream],
    ['M9.4 16.4 5 21.6l1 5 4.4-4.4zM22.6 16.4 27 21.6l-1 5-4.4-4.4z', C.red],
    ['M16 8.6a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z', C.sky],
    ['M12.8 23.4h6.4c-.6 3.6-1.7 5.6-3.2 6.2-1.5-.6-2.6-2.6-3.2-6.2Z', C.orange],
  ],
  galaxy: [
    ['M16 3.4a12.6 12.6 0 1 1 0 25.2 12.6 12.6 0 0 1 0-25.2Z', C.purple],
    ['M16 7.4c5.2 0 8.6 2.6 8.6 5.6 0 4.4-6 5.4-11 7.4-3.4 1.4-4.6 3.4-3 5.2-4-2-6.2-5.6-6.2-9.6C4.4 10.4 9.6 7.4 16 7.4Z', C.violet],
    ['M16 13.6a2.8 2.8 0 1 1 0 5.6 2.8 2.8 0 0 1 0-5.6Z', C.cream],
    ['M22.4 8.6l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7zM9 21.6l.6 1.3 1.3.6-1.3.6-.6 1.3-.6-1.3-1.3-.6 1.3-.6z', C.gold],
  ],
  trophy: [
    ['M10 3.4h12v8.2a6 6 0 0 1-12 0z', C.amber],
    ['M10 5.6H5.4v2a4.6 4.6 0 0 0 4 4.6M22 5.6h4.6v2a4.6 4.6 0 0 1-4 4.6', C.deepGold, 1.9],
    ['M14.4 17.4h3.2v3.8h-3.2z', C.deepGold],
    ['M9.6 28h12.8l-1.4-5.2H11z', C.deepGold],
    ['M16 5.8l1.2 2.6 2.8.4-2 2 .5 2.8-2.5-1.3-2.5 1.3.5-2.8-2-2 2.8-.4z', C.gold],
  ],
  unicorn: [
    ['M8.4 27.4c-1.8-5.6-.6-10.2 3-13.8 3.6-3.6 8.2-4.2 11.6-1.6l3.8-1-1.4 3.8c1.6 4.4.2 8.2-4.4 11.4z', C.white],
    ['M21.6 11.2 27.8 2l-3.6 10.6z', C.amber],
    ['M9.6 13.8c-2-2.6-1.8-5 .6-7.2 1.4 2.8 2.4 4.9 3 6.4Z', C.pink],
    ['M8.4 27.4c-3-1.4-4.6-4-4.8-7.8 3 1.3 5.4 3.8 7.2 7.4z', C.violet],
    ['M20.4 16.2a1.7 1.7 0 1 1 0 3.4 1.7 1.7 0 0 1 0-3.4Z', C.ink],
    ['M23.8 23.4a1.1 1.1 0 1 1 0 2.2 1.1 1.1 0 0 1 0-2.2Z', C.pink],
  ],
  dragon: [
    ['M12.4 13.6 28.8 3.6c1.4 4.8.6 8.8-2.4 12l-1.7-2.6-2.2 2.6-1.9-2.5-2.2 2.5-1.7-2.3z', C.deepGreen],
    ['M2.6 28.4c4.6-.5 7.5-2.4 8.7-5.6 1-2.8 2.9-4.7 5.6-5.6 3-1 4.9-2.7 5.6-5.3l4.2 1c-.9 4.7-3.8 7.8-8.7 9.2-3.4 1-5.7 2.6-6.8 4.9z', C.green],
    ['M20.2 8.2c2.5-1 4.6-.6 6.2 1.2l3.8.3-2.5 2.7c-.6 2.1-2.3 2.9-5 2.4z', C.green],
    ['M22.4 7.8 23.9 3.2l1.5 4.4z', C.amber],
    ['M24.6 10.8a1.35 1.35 0 1 1 0 2.7 1.35 1.35 0 0 1 0-2.7Z', C.ink],
    ['M2.6 28.4 1.4 24.6l3.6 1.5z', C.deepGreen],
  ],
  champagne: [
    ['M11 3.4h10l-1 6.6a4 4 0 0 1-8 0z', C.deepGreen],
    ['M16 15.4v10M11.6 27.4h8.8', C.gold, 2],
    ['M16 13.6a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2Z', C.gold],
    ['M8 5.4 5 2.6M24 5.4 27 2.6M6.6 11 3.4 10M25.4 11l3.2-1', C.amber, 1.6],
  ],

  /* mega tier — these get the full-screen takeover, so they carry more shape */
  nut_storm: [
    ['M16 8.6c5 0 8.6 4 8.6 9.4S21 27.6 16 27.6 7.4 23.4 7.4 18s3.6-9.4 8.6-9.4Z', C.deepGold],
    ['M16 11.6c3 0 5.2 2.6 5.2 6s-2.2 6-5.2 6-5.2-2.6-5.2-6 2.2-6 5.2-6Z', C.gold],
    ['M4 8.6c4-3.4 9-4.6 15-3.6M6.4 4.2c5-2.6 10.6-2.8 16.8-.6M28 11.4c-2.6-2.6-5.6-4.2-9-5', C.amber, 1.8],
  ],
  golden_nut: [
    ['M16 4.6c6 0 10 5 10 11.4S22 27.6 16 27.6 6 22.4 6 16 10 4.6 16 4.6Z', C.deepGold],
    ['M16 7.6c4 0 6.8 3.6 6.8 8.4S20 24.4 16 24.4 9.2 20.8 9.2 16 12 7.6 16 7.6Z', C.gold],
    ['M16 4.6v23M11.4 7.4c-1.6 5.4-1.6 11 0 17M20.6 7.4c1.6 5.4 1.6 11 0 17', C.deepGold, 1.4],
    ['M25 5.6l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z', C.cream],
  ],
  phoenix: [
    ['M16 2.6c2.6 4 3.6 7.6 3 11 3.4-1.4 5.6-4 6.6-7.6 2.4 6.6 1.4 12-3 16.2l3 6.2-9.6-4-9.6 4 3-6.2C5 17.4 4 12 6.4 5.4c1 3.6 3.2 6.2 6.6 7.6-.6-3.4.4-7 3-10.4Z', C.orange],
    ['M16 9.6c1.6 2.6 2 5 1.2 7.4-.8 2.4-1.2 4.4-1.2 6-1.6-2.6-2-5-1.2-7.4.8-2.4 1.2-4.4 1.2-6Z', C.amber],
  ],
  meteor: [
    ['M22 4.4a6.6 6.6 0 1 1 0 13.2 6.6 6.6 0 0 1 0-13.2Z', C.orange],
    ['M22 7.4a3.6 3.6 0 1 1 0 7.2 3.6 3.6 0 0 1 0-7.2Z', C.amber],
    ['M17 15.6 3.4 29.2M14.6 9.4 5.6 18.4M23 21.6l-6 6', C.orange, 2.2],
    ['M8.4 4.6l.8 1.8 1.8.8-1.8.8-.8 1.8-.8-1.8-1.8-.8 1.8-.8z', C.gold],
  ],
  castle: [
    ['M3.4 28h25.2v-2.4H3.4z', C.deepStone],
    ['M4 25.6V12h6.4v13.6zM21.6 25.6V12H28v13.6z', C.stone],
    ['M11.4 25.6V9h9.2v16.6z', C.stone],
    ['M3.4 12V8.4h1.8v1.8H7V8.4h1.8v1.8h1.6V8.4H12V12zM20 12V8.4h1.8v1.8h1.6V8.4h1.8v1.8H27V8.4h1.6V12z', C.deepStone],
    ['M16 1.4 20.6 9h-9.2z', C.red],
    ['M13.4 25.6v-6a2.6 2.6 0 0 1 5.2 0v6z', C.deepStone],
  ],
  universe: [
    ['M16 2.4a13.6 13.6 0 1 1 0 27.2 13.6 13.6 0 0 1 0-27.2Z', C.night],
    ['M16 9.6a6.4 6.4 0 1 1 0 12.8 6.4 6.4 0 0 1 0-12.8Z', C.violet],
    ['M16 12.6a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8Z', C.cream],
    ['M2.6 16c0-2.6 6-4.8 13.4-4.8S29.4 13.4 29.4 16 23.4 20.8 16 20.8 2.6 18.6 2.6 16Z', C.magenta, 1.6],
    ['M8.6 6.6l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6L6.3 8.9l1.6-.7zM24 21l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6zM21.6 5.4l.5 1.1 1.1.5-1.1.5-.5 1.1-.5-1.1-1.1-.5 1.1-.5z', C.gold],
  ],
});

/* Rarity is expressed by the surround, never by changing the mark itself, so a
   Rose is always the same Rose whichever tier it sits in. */
const GLOW = {
  rare: 'rgba(56,189,248,0.34)',
  epic: 'rgba(192,132,252,0.38)',
  legendary: 'rgba(251,191,36,0.46)',
  mega: 'rgba(251,113,133,0.46)',
};

/** Neutral mark for a gift id with no art yet — never an emoji fallback. */
const FALLBACK = [
  ['M6 12.6h20v13a1.8 1.8 0 0 1-1.8 1.8H7.8A1.8 1.8 0 0 1 6 25.6z', C.violet],
  ['M4.4 8.4h23.2v4.2H4.4z', C.magenta],
  ['M16 8.4v19', C.cream, 1.8],
];

export const GIFT_ART_IDS = Object.keys(ART);
export const hasGiftArt = (id) => Object.hasOwn(ART, String(id || ''));

/**
 * @param {string} id     gift id from the server catalog
 * @param {string} tier   basic | rare | epic | legendary | mega
 */
export const GiftArt = memo(function GiftArt({ id, tier = 'basic', size = 32, className = '', title = null }) {
  const paths = ART[id] || FALLBACK;
  const glow = GLOW[tier];
  const s = Number(size) || 32;

  return (
    <svg
      className={`mm-gift ${className}`.trim()}
      width={s}
      height={s}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {glow && <circle cx="16" cy="16" r="15" fill={glow} />}
      {paths.map(([d, color, strokeWidth], i) => (
        strokeWidth
          ? (
            <path
              key={i}
              d={d}
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          )
          : <path key={i} d={d} fill={color} />
      ))}
    </svg>
  );
});

export default GiftArt;
