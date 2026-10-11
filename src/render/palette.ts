// Colors for code-drawn bodies. Each tier has a natural palette (Common); rarer bodies shift
// toward their rarity's hue, so a Legendary Moon still reads as a moon, just gilded.

export interface Palette {
  /** Lit side. */
  light: string;
  /** Main surface. */
  base: string;
  /** Shadow side. */
  dark: string;
  /** Details: craters, bands, continents, tail. */
  accent: string;
  /** Halo or atmosphere. */
  glow: string;
}

/** Natural look of each tier (index = tier - 1). */
const COMMON: Palette[] = [
  { light: '#fff6d8', base: '#d9cfff', dark: '#5a4f9a', accent: '#ffffff', glow: '#b9a8ff' }, // stardust
  { light: '#c9b9a6', base: '#8a7765', dark: '#2f2620', accent: '#5c4b3d', glow: '#8a7765' }, // meteoroid
  { light: '#bfb6ad', base: '#7d736b', dark: '#2a2522', accent: '#564d47', glow: '#7d736b' }, // asteroid
  { light: '#f2fbff', base: '#9fd8f0', dark: '#2e5a78', accent: '#d8f4ff', glow: '#7fd4ff' }, // comet
  { light: '#f1efe9', base: '#b9b5ac', dark: '#3b3934', accent: '#8f8a80', glow: '#d9d6cf' }, // moon
  { light: '#9fe3ff', base: '#2f86c9', dark: '#0c2347', accent: '#4fae6a', glow: '#6cc8ff' }, // planet
  { light: '#ffe2b0', base: '#d9945a', dark: '#4a2412', accent: '#a65d36', glow: '#ffbf80' }, // gas giant
  { light: '#ffffff', base: '#ffe28a', dark: '#ff8a1f', accent: '#fff3c4', glow: '#ffc24d' }, // star
  { light: '#fff1d6', base: '#ff9a3c', dark: '#000000', accent: '#ffd28a', glow: '#ff7a2e' }, // black hole
  { light: '#ffffff', base: '#b9a3ff', dark: '#2a1c6e', accent: '#7fd8ff', glow: '#a98bff' }, // galaxy
];

/** Hue each rarity pulls toward, and how strongly (common = no change). */
const RARITY_HUE: { hue: number; amount: number; sat: number }[] = [
  { hue: 0, amount: 0, sat: 1 },
  { hue: 200, amount: 1, sat: 1.15 }, // rare: icy blue
  { hue: 278, amount: 1, sat: 1.2 }, // epic: violet
  { hue: 40, amount: 1, sat: 1.35 }, // legendary: gold
  { hue: 328, amount: 1, sat: 1.3 }, // mythic: magenta
];

/** Display color of each rarity (labels, rings, odds). Matches bodies.json. */
export const RARITY_COLOR = [0xc9d2ff, 0x4fc3ff, 0xb56cff, 0xffb020, 0xff4f9a];
export const RARITY_CSS = ['#c9d2ff', '#4fc3ff', '#b56cff', '#ffb020', '#ff4f9a'];

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x: number) =>
    Math.round(Math.max(0, Math.min(1, x)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

function shift(hex: string, rarity: number): string {
  const { hue, amount, sat } = RARITY_HUE[rarity];
  if (!amount) return hex;
  const [h, s, l] = hexToHsl(hex);
  // Take the rarity's hue; lightness stays, so lit side, shadow and details keep their contrast.
  let delta = hue - h;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  // Grey surfaces get some color of their own, or a grey moon would stay grey at every rarity.
  const s2 = Math.min(1, Math.max(s, 0.35) * sat);
  return hslToHex((h + delta * amount + 360) % 360, s2, l);
}

export function paletteFor(tier: number, rarity: number): Palette {
  const p = COMMON[tier - 1];
  // Black holes keep a black center whatever the rarity.
  const dark = tier === 9 ? p.dark : shift(p.dark, rarity);
  return {
    light: shift(p.light, rarity),
    base: shift(p.base, rarity),
    dark,
    accent: shift(p.accent, rarity),
    glow: shift(p.glow, rarity),
  };
}
