import Phaser from 'phaser';
import { paletteFor, RARITY_CSS, type Palette } from './palette';

// Celestial bodies drawn in code with the Canvas 2D API, then stored as Phaser textures.
// No image files: the build stays small and every tier and rarity shares one style.

export const BODY_SIZE = 192;
export const bodyKey = (tier: number, rarity: number) => `body-${tier}-${rarity}`;
export const auraKey = (rarity: number) => `aura-${rarity}`;
export const SPARK_KEY = 'spark';

/** Small seeded generator so the same tier and rarity always draws the same details. */
function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Ctx = CanvasRenderingContext2D;

function withAlpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Shaded ball lit from the upper left. */
function sphere(ctx: Ctx, x: number, y: number, r: number, p: Palette) {
  const g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.08, x, y, r);
  g.addColorStop(0, p.light);
  g.addColorStop(0.45, p.base);
  g.addColorStop(1, p.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Night side and a thin rim of light, drawn over a body already clipped to its outline. */
function shade(ctx: Ctx, x: number, y: number, r: number, p: Palette, strength = 0.75) {
  // Darkness pooled at the lower right, fading out before the lit upper left.
  const night = ctx.createRadialGradient(x + r * 0.9, y + r * 0.95, 0, x + r * 0.9, y + r * 0.95, r * 2.1);
  night.addColorStop(0, withAlpha('#05030f', strength));
  night.addColorStop(0.45, withAlpha('#05030f', strength * 0.55));
  night.addColorStop(1, withAlpha('#05030f', 0));
  ctx.fillStyle = night;
  ctx.fillRect(x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = withAlpha(p.light, 0.35);
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.96, Math.PI * 0.95, Math.PI * 1.65);
  ctx.stroke();
  ctx.restore();
}

function craters(ctx: Ctx, x: number, y: number, r: number, p: Palette, rnd: () => number, count: number, size = 0.18) {
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const d = Math.sqrt(rnd()) * r * 0.78;
    const cx = x + Math.cos(a) * d;
    const cy = y + Math.sin(a) * d;
    const cr = r * size * (0.4 + rnd() * 0.8);
    // Craters near the edge look flattened.
    const squash = 1 - (d / r) * 0.45;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.scale(squash, 1);
    ctx.fillStyle = withAlpha(p.dark, 0.5);
    ctx.beginPath();
    ctx.arc(0, 0, cr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = withAlpha(p.accent, 0.55);
    ctx.beginPath();
    ctx.arc(cr * 0.18, cr * 0.18, cr * 0.82, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = withAlpha(p.light, 0.35);
    ctx.lineWidth = cr * 0.16;
    ctx.beginPath();
    ctx.arc(0, 0, cr, Math.PI * 0.6, Math.PI * 1.4, true);
    ctx.stroke();
    ctx.restore();
  }
}

/** Lumpy outline for rocks. */
function rockPath(ctx: Ctx, x: number, y: number, r: number, rnd: () => number, lumps: number, rough: number, stretch: number) {
  const pts: [number, number][] = [];
  for (let i = 0; i < lumps; i++) {
    const a = (i / lumps) * Math.PI * 2;
    const rr = r * (1 - rough + rnd() * rough * 2);
    pts.push([x + Math.cos(a) * rr * stretch, y + Math.sin(a) * rr]);
  }
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    if (i === 0) ctx.moveTo(mx, my);
    else ctx.quadraticCurveTo(ax, ay, mx, my);
  }
  const [ax, ay] = pts[0];
  const [bx, by] = pts[1];
  ctx.quadraticCurveTo(ax, ay, (ax + bx) / 2, (ay + by) / 2);
  ctx.closePath();
}

function glow(ctx: Ctx, x: number, y: number, r: number, color: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, withAlpha(color, alpha));
  g.addColorStop(0.4, withAlpha(color, alpha * 0.4));
  g.addColorStop(1, withAlpha(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function sparkle(ctx: Ctx, x: number, y: number, s: number, color: string) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
  ctx.restore();
}

// ---------- tiers ----------

function stardust(ctx: Ctx, x: number, y: number, r: number, p: Palette, rnd: () => number) {
  glow(ctx, x, y, r * 1.05, p.glow, 0.55);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Grains on a loose spiral.
  for (let i = 0; i < 70; i++) {
    const k = i / 70;
    const a = k * Math.PI * 5 + rnd() * 0.8;
    const d = r * (0.08 + k * 0.78) * (0.8 + rnd() * 0.4);
    const s = r * (0.03 + rnd() * 0.05) * (1.2 - k * 0.6);
    ctx.fillStyle = withAlpha(rnd() < 0.3 ? p.accent : p.base, 0.55 + rnd() * 0.45);
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  glow(ctx, x, y, r * 0.35, p.light, 0.9);
  sparkle(ctx, x, y, r * 0.28, withAlpha(p.light, 0.9));
}

function rock(ctx: Ctx, x: number, y: number, r: number, p: Palette, rnd: () => number, big: boolean) {
  ctx.save();
  rockPath(ctx, x, y, r, rnd, big ? 11 : 8, big ? 0.16 : 0.22, big ? 1.12 : 1.05);
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.05, x, y, r * 1.1);
  g.addColorStop(0, p.light);
  g.addColorStop(0.5, p.base);
  g.addColorStop(1, p.dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  craters(ctx, x, y, r, p, rnd, big ? 7 : 4, big ? 0.17 : 0.2);
  // Grain
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = withAlpha(rnd() < 0.5 ? p.dark : p.light, 0.12);
    ctx.fillRect(x - r + rnd() * r * 2, y - r + rnd() * r * 2, r * 0.05, r * 0.05);
  }
  shade(ctx, x, y, r, p, 0.7);
  ctx.restore();
}

function comet(ctx: Ctx, x: number, y: number, r: number, p: Palette, rnd: () => number) {
  // Tail streams away from the light, to the lower right.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const spread = 0.28 + i * 0.14;
    const len = r * (1.6 - i * 0.25);
    const tail = ctx.createLinearGradient(x, y, x + len, y + len * 0.55);
    tail.addColorStop(0, withAlpha(i === 0 ? p.light : p.glow, 0.6 - i * 0.15));
    tail.addColorStop(1, withAlpha(p.glow, 0));
    ctx.fillStyle = tail;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.15, y - r * spread);
    ctx.quadraticCurveTo(x + len * 0.6, y - r * spread * 0.4, x + len, y + len * 0.55);
    ctx.quadraticCurveTo(x + len * 0.4, y + r * spread * 1.2, x - r * 0.1, y + r * spread * 0.7);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  const cx = x - r * 0.35;
  const cy = y - r * 0.25;
  glow(ctx, cx, cy, r * 0.9, p.glow, 0.6);
  ctx.save();
  rockPath(ctx, cx, cy, r * 0.42, rnd, 9, 0.15, 1.1);
  const g = ctx.createRadialGradient(cx - r * 0.15, cy - r * 0.18, 0, cx, cy, r * 0.45);
  g.addColorStop(0, p.light);
  g.addColorStop(0.6, p.base);
  g.addColorStop(1, p.dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  glow(ctx, cx - r * 0.08, cy - r * 0.1, r * 0.25, '#ffffff', 0.7);
}

function moon(ctx: Ctx, x: number, y: number, r: number, p: Palette, rnd: () => number) {
  glow(ctx, x, y, r * 1.35, p.glow, 0.18);
  ctx.save();
  sphere(ctx, x, y, r, p);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  // Dark seas, then craters.
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = withAlpha(p.dark, 0.25);
    ctx.beginPath();
    ctx.ellipse(x - r * 0.5 + rnd() * r, y - r * 0.5 + rnd() * r, r * (0.2 + rnd() * 0.25), r * (0.15 + rnd() * 0.2), rnd() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  craters(ctx, x, y, r, p, rnd, 9, 0.14);
  shade(ctx, x, y, r, p, 0.85);
  ctx.restore();
}

function planet(ctx: Ctx, x: number, y: number, r: number, p: Palette, rnd: () => number) {
  glow(ctx, x, y, r * 1.4, p.glow, 0.3);
  ctx.save();
  sphere(ctx, x, y, r, p);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  // Continents: clusters of blobs.
  for (let c = 0; c < 4; c++) {
    const cx = x - r * 0.7 + rnd() * r * 1.4;
    const cy = y - r * 0.7 + rnd() * r * 1.4;
    ctx.fillStyle = withAlpha(p.accent, 0.85);
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.ellipse(cx + (rnd() - 0.5) * r * 0.5, cy + (rnd() - 0.5) * r * 0.35, r * (0.08 + rnd() * 0.16), r * (0.06 + rnd() * 0.1), rnd() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Cloud streaks.
  ctx.strokeStyle = withAlpha('#ffffff', 0.35);
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const cy = y - r * 0.8 + rnd() * r * 1.6;
    ctx.lineWidth = r * (0.03 + rnd() * 0.04);
    ctx.beginPath();
    ctx.moveTo(x - r * (0.2 + rnd() * 0.8), cy);
    ctx.quadraticCurveTo(x, cy - r * 0.08, x + r * (0.2 + rnd() * 0.8), cy + r * 0.05);
    ctx.stroke();
  }
  shade(ctx, x, y, r, p, 0.85);
  ctx.restore();
  // Atmosphere rim.
  ctx.strokeStyle = withAlpha(p.glow, 0.55);
  ctx.lineWidth = r * 0.07;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.01, Math.PI * 0.8, Math.PI * 1.75);
  ctx.stroke();
}

function ring(ctx: Ctx, x: number, y: number, r: number, p: Palette, front: boolean) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.38);
  ctx.beginPath();
  // Back half above the planet's center line, front half below.
  if (front) ctx.rect(-r * 2, 0, r * 4, r * 2);
  else ctx.rect(-r * 2, -r * 2, r * 4, r * 2);
  ctx.clip();
  for (let i = 0; i < 4; i++) {
    ctx.strokeStyle = withAlpha(i % 2 ? p.light : p.accent, front ? 0.7 - i * 0.08 : 0.45 - i * 0.06);
    ctx.lineWidth = r * (0.07 - i * 0.008);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * (1.38 + i * 0.12), r * (0.34 + i * 0.03), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function gasGiant(ctx: Ctx, x: number, y: number, r: number, p: Palette, rnd: () => number) {
  glow(ctx, x, y, r * 1.5, p.glow, 0.22);
  ring(ctx, x, y, r, p, false);
  ctx.save();
  sphere(ctx, x, y, r, p);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(x, y);
  ctx.rotate(-0.38);
  for (let i = 0; i < 9; i++) {
    const by = -r + (i + 0.5) * (r * 2 / 9) + (rnd() - 0.5) * r * 0.08;
    ctx.fillStyle = withAlpha(i % 2 ? p.accent : p.light, i % 2 ? 0.45 : 0.2);
    ctx.beginPath();
    ctx.moveTo(-r * 1.2, by);
    for (let k = 0; k <= 8; k++) ctx.lineTo(-r * 1.2 + (k / 8) * r * 2.4, by + Math.sin(k * 1.3 + i) * r * 0.03);
    ctx.lineTo(r * 1.2, by + r * 0.13);
    ctx.lineTo(-r * 1.2, by + r * 0.13);
    ctx.fill();
  }
  // Storm spot.
  ctx.fillStyle = withAlpha(p.dark, 0.4);
  ctx.beginPath();
  ctx.ellipse(r * 0.25, r * 0.28, r * 0.18, r * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  shade(ctx, x, y, r, p, 0.8);
  ctx.restore();
  ring(ctx, x, y, r, p, true);
}

function star(ctx: Ctx, x: number, y: number, r: number, p: Palette, rnd: () => number) {
  glow(ctx, x, y, r * 1.75, p.glow, 0.55);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Corona rays.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rnd() * 0.2;
    const len = r * (1.25 + rnd() * 0.45);
    const ray = ctx.createLinearGradient(x, y, x + Math.cos(a) * len, y + Math.sin(a) * len);
    ray.addColorStop(0, withAlpha(p.base, 0.5));
    ray.addColorStop(1, withAlpha(p.glow, 0));
    ctx.strokeStyle = ray;
    ctx.lineWidth = r * (0.05 + rnd() * 0.06);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  ctx.restore();
  const g = ctx.createRadialGradient(x - r * 0.15, y - r * 0.15, 0, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, p.light);
  g.addColorStop(0.75, p.base);
  g.addColorStop(1, p.dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.86, 0, Math.PI * 2);
  ctx.fill();
  // Granules.
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r * 0.86, 0, Math.PI * 2);
  ctx.clip();
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = withAlpha(rnd() < 0.5 ? p.dark : '#ffffff', 0.1);
    ctx.beginPath();
    ctx.arc(x - r + rnd() * r * 2, y - r + rnd() * r * 2, r * (0.05 + rnd() * 0.07), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function blackHole(ctx: Ctx, x: number, y: number, r: number, p: Palette, rnd: () => number) {
  glow(ctx, x, y, r * 1.6, p.glow, 0.35);
  const disk = (front: boolean) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.22);
    ctx.beginPath();
    if (front) ctx.rect(-r * 2, 0, r * 4, r * 2);
    else ctx.rect(-r * 2, -r * 2, r * 4, r * 2);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      ctx.strokeStyle = withAlpha(i < 2 ? p.light : i < 4 ? p.base : p.glow, front ? 0.75 - i * 0.1 : 0.5 - i * 0.07);
      ctx.lineWidth = r * (0.12 - i * 0.012);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * (0.75 + i * 0.16), r * (0.2 + i * 0.04), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  };
  disk(false);
  // Light bent over the top of the hole.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = withAlpha(p.light, 0.75);
  ctx.lineWidth = r * 0.07;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.5, Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();
  ctx.strokeStyle = withAlpha(p.base, 0.5);
  ctx.lineWidth = r * 0.12;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.58, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.44, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = withAlpha(p.accent, 0.9);
  ctx.lineWidth = r * 0.025;
  ctx.beginPath();
  ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
  ctx.stroke();
  disk(true);
  void rnd;
}

function galaxy(ctx: Ctx, x: number, y: number, r: number, p: Palette, rnd: () => number) {
  glow(ctx, x, y, r * 1.5, p.glow, 0.4);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.4);
  ctx.scale(1, 0.62);
  ctx.globalCompositeOperation = 'lighter';
  for (let arm = 0; arm < 2; arm++) {
    for (let i = 0; i < 140; i++) {
      const k = i / 140;
      const a = arm * Math.PI + k * Math.PI * 2.6;
      const d = r * (0.12 + k * 1.15);
      const jitter = r * 0.13 * (0.3 + k);
      const px = Math.cos(a) * d + (rnd() - 0.5) * jitter;
      const py = Math.sin(a) * d + (rnd() - 0.5) * jitter;
      const s = r * (0.012 + rnd() * 0.035) * (1.3 - k * 0.6);
      ctx.fillStyle = withAlpha(rnd() < 0.25 ? p.accent : rnd() < 0.5 ? p.light : p.base, 0.45 + rnd() * 0.5);
      ctx.beginPath();
      ctx.arc(px, py, s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
  glow(ctx, x, y, r * 0.55, p.light, 0.95);
  glow(ctx, x, y, r * 0.22, '#ffffff', 1);
}

const DRAW = [stardust, (c: Ctx, x: number, y: number, r: number, p: Palette, rnd: () => number) => rock(c, x, y, r, p, rnd, false), (c: Ctx, x: number, y: number, r: number, p: Palette, rnd: () => number) => rock(c, x, y, r, p, rnd, true), comet, moon, planet, gasGiant, star, blackHole, galaxy];

/** Size of each tier relative to the texture, so bigger tiers look bigger on the board. */
export const TIER_SCALE = [0.62, 0.62, 0.74, 0.8, 0.82, 0.86, 0.9, 0.94, 0.96, 1];

// ---------- rarity marks ----------

function rarityMarks(ctx: Ctx, x: number, y: number, r: number, rarity: number, tier: number, rnd: () => number) {
  if (rarity === 0) return;
  const color = RARITY_CSS[rarity];
  // Fine glowing veins for Epic and up, on solid bodies.
  const solid = tier >= 2 && tier <= 7;
  if (rarity >= 2 && solid) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.95, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = withAlpha(color, rarity >= 4 ? 0.75 : 0.5);
    ctx.lineWidth = r * 0.025;
    for (let i = 0; i < 3 + rarity; i++) {
      let px = x + (rnd() - 0.5) * r * 1.4;
      let py = y + (rnd() - 0.5) * r * 1.4;
      ctx.beginPath();
      ctx.moveTo(px, py);
      for (let k = 0; k < 4; k++) {
        px += (rnd() - 0.5) * r * 0.45;
        py += (rnd() - 0.5) * r * 0.45;
        ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  // Mythic: iridescent sheen, on round solid bodies only (a disc over dust or a galaxy looks like a bubble).
  if (rarity === 4 && [2, 3, 5, 6, 7, 8].includes(tier)) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.98, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalCompositeOperation = 'overlay';
    const sheen = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
    ['#ff4f9a', '#ffd166', '#66f0ff', '#b56cff'].forEach((c, i) => sheen.addColorStop(i / 3, withAlpha(c, 0.55)));
    ctx.fillStyle = sheen;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }
  // Sparkles for Legendary and Mythic.
  if (rarity >= 3) {
    for (let i = 0; i < rarity + 1; i++) {
      const a = rnd() * Math.PI * 2;
      const d = r * (1.05 + rnd() * 0.25);
      sparkle(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, r * (0.08 + rnd() * 0.08), withAlpha('#ffffff', 0.9));
    }
  }
}

/** Draws one body centered in a square canvas context of the given size. */
export function drawBody(ctx: Ctx, size: number, tier: number, rarity: number) {
  const rnd = seeded(tier * 7919 + rarity * 104729 + 17);
  const x = size / 2;
  const y = size / 2;
  const r = size * 0.33 * TIER_SCALE[tier - 1];
  const p = paletteFor(tier, rarity);
  // Rare bodies sit in a soft halo of their rarity color.
  if (rarity > 0) glow(ctx, x, y, r * (1.35 + rarity * 0.08), RARITY_CSS[rarity], 0.22 + rarity * 0.06);
  DRAW[tier - 1](ctx, x, y, r, p, rnd);
  rarityMarks(ctx, x, y, r, rarity, tier, rnd);
}

// ---------- hidden bodies (a Galaxy merged into a planet, gas giant, star or black hole) ----------

/** Galaxy colors of each hidden body. The body of its tier sits inside the swirl. */
const SPECIAL_LOOK: Record<string, Palette> = {
  cradleWorld: { light: '#d4fff3', base: '#2bb39a', dark: '#0d4f45', accent: '#5ef2c9', glow: '#5ef2c9' },
  haloGiant: { light: '#fff1c9', base: '#e08a2b', dark: '#6b3a0e', accent: '#ffcf6b', glow: '#ffb84d' },
  starburstCore: { light: '#ffe0f6', base: '#c03aa6', dark: '#5a1350', accent: '#ff7ad9', glow: '#ff5fc8' },
  quasar: { light: '#e6f7ff', base: '#3a7bff', dark: '#10306e', accent: '#7fd4ff', glow: '#6fc8ff' },
};

export const specialKey = (id: string, rarity: number) => `special-${id}-${rarity}`;

/** A hidden body: a colored galaxy swirl wrapped around the body it was merged into, with rarity marks. */
export function drawSpecial(ctx: Ctx, size: number, id: string, tier: number, rarity: number) {
  const rnd = seeded(id.length * 7349 + tier * 911 + rarity * 104729 + 3);
  const x = size / 2;
  const y = size / 2;
  const r = size * 0.33;
  const look = SPECIAL_LOOK[id] ?? SPECIAL_LOOK.cradleWorld;
  if (rarity > 0) glow(ctx, x, y, r * (1.3 + rarity * 0.08), RARITY_CSS[rarity], 0.22 + rarity * 0.06);
  galaxy(ctx, x, y, r * 1.02, look, rnd);
  if (id === 'quasar') {
    // Two jets out of the poles, the signature of a quasar.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const dir of [-1, 1]) {
      const g = ctx.createLinearGradient(x, y, x, y + dir * r * 1.45);
      g.addColorStop(0, withAlpha('#ffffff', 0.9));
      g.addColorStop(1, withAlpha(look.accent, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.07, y);
      ctx.lineTo(x + r * 0.07, y);
      ctx.lineTo(x + r * 0.02, y + dir * r * 1.45);
      ctx.lineTo(x - r * 0.02, y + dir * r * 1.45);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  const inner = r * 0.52 * TIER_SCALE[tier - 1];
  DRAW[tier - 1](ctx, x, y, inner, paletteFor(tier, rarity), rnd);
  rarityMarks(ctx, x, y, inner, rarity, tier, rnd);
  // A thin golden halo marks it as something special.
  ctx.save();
  ctx.strokeStyle = withAlpha('#ffd166', 0.85);
  ctx.lineWidth = size * 0.012;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.98, r * 0.62, -0.4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  for (let i = 0; i < 5; i++) {
    const a = rnd() * Math.PI * 2;
    const d = r * (0.85 + rnd() * 0.3);
    sparkle(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.7, r * (0.06 + rnd() * 0.06), '#ffffff');
  }
}

/** Texture of a hidden body. */
export function ensureSpecialTexture(scene: Phaser.Scene, id: string, tier: number, rarity: number): string {
  const key = specialKey(id, rarity);
  if (!scene.textures.exists(key)) {
    const [c, ctx] = canvas(BODY_SIZE);
    drawSpecial(ctx, BODY_SIZE, id, tier, rarity);
    scene.textures.addCanvas(key, c);
  }
  return key;
}

/** Texture for any body on the board, hidden or not. */
export function ensureAnyBodyTexture(scene: Phaser.Scene, body: { t: number; r: number; s?: string }): string {
  return body.s ? ensureSpecialTexture(scene, body.s, body.t, body.r) : ensureBodyTexture(scene, body.t, body.r);
}

function canvas(size: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')!];
}

/** Draws a body texture the first time it is needed. Cheap after that. */
export function ensureBodyTexture(scene: Phaser.Scene, tier: number, rarity: number): string {
  const key = bodyKey(tier, rarity);
  if (!scene.textures.exists(key)) {
    const [c, ctx] = canvas(BODY_SIZE);
    drawBody(ctx, BODY_SIZE, tier, rarity);
    scene.textures.addCanvas(key, c);
  }
  return key;
}

/** Soft colored halo behind rare bodies, animated in the scene. */
export function ensureAuraTexture(scene: Phaser.Scene, rarity: number): string {
  const key = auraKey(rarity);
  if (scene.textures.exists(key)) return key;
  const [c, ctx] = canvas(BODY_SIZE);
  const color = RARITY_CSS[rarity];
  const h = BODY_SIZE / 2;
  glow(ctx, h, h, h, color, 0.5);
  if (rarity >= 3) {
    // Faint rays for Legendary and Mythic.
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const g = ctx.createLinearGradient(h, h, h + Math.cos(a) * h, h + Math.sin(a) * h);
      g.addColorStop(0, withAlpha(color, 0.35));
      g.addColorStop(1, withAlpha(color, 0));
      ctx.strokeStyle = g;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(h, h);
      ctx.lineTo(h + Math.cos(a) * h, h + Math.sin(a) * h);
      ctx.stroke();
    }
  }
  scene.textures.addCanvas(key, c);
  return key;
}

/** White spark for particles and shooting stars. */
export function ensureSparkTexture(scene: Phaser.Scene): string {
  if (!scene.textures.exists(SPARK_KEY)) {
    const [c, ctx] = canvas(64);
    glow(ctx, 32, 32, 32, '#ffffff', 1);
    sparkle(ctx, 32, 32, 28, '#ffffff');
    scene.textures.addCanvas(SPARK_KEY, c);
  }
  return SPARK_KEY;
}

export const CORE_KEY = 'core-orb';

/** The stellar core the player taps: a hot white-gold orb with a violet halo. */
export function ensureCoreTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(CORE_KEY)) return CORE_KEY;
  const size = 320;
  const [c, ctx] = canvas(size);
  const h = size / 2;
  glow(ctx, h, h, h, '#8f6bff', 0.55);
  glow(ctx, h, h, h * 0.7, '#ffb36b', 0.5);
  const g = ctx.createRadialGradient(h - 18, h - 22, 4, h, h, h * 0.42);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, '#fff1c2');
  g.addColorStop(0.75, '#ffb347');
  g.addColorStop(1, '#ff6a3d');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(h, h, h * 0.42, 0, Math.PI * 2);
  ctx.fill();
  // Swirls of plasma.
  const rnd = seeded(99);
  ctx.save();
  ctx.beginPath();
  ctx.arc(h, h, h * 0.42, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    ctx.strokeStyle = withAlpha('#ffffff', 0.18 + rnd() * 0.2);
    ctx.lineWidth = 3 + rnd() * 5;
    ctx.beginPath();
    const a = rnd() * Math.PI * 2;
    ctx.arc(h + Math.cos(a) * 20, h + Math.sin(a) * 20, h * (0.15 + rnd() * 0.25), a, a + 1.5 + rnd());
    ctx.stroke();
  }
  ctx.restore();
  scene.textures.addCanvas(CORE_KEY, c);
  return CORE_KEY;
}
