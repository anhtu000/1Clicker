// Store covers for CrazyGames (and later portals), drawn with the game's own body art.
// Open with the dev server: /tools/capture/cover.html?layout=landscape|portrait|square&w=1920
// The page draws at w pixels wide (height from the layout's ratio) and sets window.coverReady.
// Rules (CrazyGames, 13/10): only the game title as text, no borders, no logos, no "Play" words.
import '@fontsource/nunito/latin-900.css';
import { drawBody } from '../../src/render/bodies';
import { RARITY_CSS } from '../../src/render/palette';

type Ctx = CanvasRenderingContext2D;
type Layout = 'landscape' | 'portrait' | 'square';

/** Base size of each layout; drawing coordinates are in these units, then scaled to the asked width. */
const BASE: Record<Layout, [number, number]> = { landscape: [1920, 1080], portrait: [800, 1200], square: [800, 800] };

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function glow(ctx: Ctx, x: number, y: number, r: number, color: string, alpha: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.4, rgba(color, alpha * 0.4));
  g.addColorStop(1, rgba(color, 0));
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

/** Deep space like the game's backdrop: dark gradient, colored clouds, stars. */
function background(ctx: Ctx, w: number, h: number, seed: number) {
  const bg = ctx.createLinearGradient(0, 0, w * 0.3, h);
  bg.addColorStop(0, '#0d0930');
  bg.addColorStop(0.55, '#07061a');
  bg.addColorStop(1, '#0a0b24');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const rnd = seeded(seed);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const clouds: [string, number][] = [['#5b2bd1', 0.22], ['#1f6fd6', 0.16], ['#c2378f', 0.13], ['#2bb3c9', 0.08]];
  const m = Math.max(w, h);
  for (const [color, alpha] of clouds) {
    for (let i = 0; i < 6; i++) glow(ctx, rnd() * w, rnd() * h, m * (0.12 + rnd() * 0.3), color, alpha);
  }
  ctx.restore();
  for (let i = 0; i < (w * h) / 2600; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.5})`;
    ctx.beginPath();
    ctx.arc(rnd() * w, rnd() * h, rnd() < 0.92 ? m * 0.0006 + 0.4 : m * 0.0014, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 0; i < 14; i++) sparkle(ctx, rnd() * w, rnd() * h, m * (0.004 + rnd() * 0.006), 'rgba(255,255,255,0.85)');
}

/** The stellar core the player taps, drawn large: white-gold orb, violet halo, plasma swirls. */
function core(ctx: Ctx, x: number, y: number, r: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, y, r * 3.2, '#8f6bff', 0.45);
  glow(ctx, x, y, r * 1.9, '#ffb36b', 0.45);
  ctx.restore();
  const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.3, r * 0.05, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, '#fff1c2');
  g.addColorStop(0.75, '#ffb347');
  g.addColorStop(1, '#ff6a3d');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  const rnd = seeded(99);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    ctx.strokeStyle = `rgba(255,${200 + Math.floor(rnd() * 55)},${120 + Math.floor(rnd() * 80)},${0.25 + rnd() * 0.3})`;
    ctx.lineWidth = r * (0.03 + rnd() * 0.05);
    ctx.beginPath();
    const a0 = rnd() * Math.PI * 2;
    ctx.arc(x + (rnd() - 0.5) * r * 0.6, y + (rnd() - 0.5) * r * 0.6, r * (0.35 + rnd() * 0.5), a0, a0 + 1.2 + rnd() * 1.6);
    ctx.stroke();
  }
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, x, y, r * 0.75, '#fff1c2', 0.55);
  ctx.restore();
}

function orbit(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot: number, alpha: number, width: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.strokeStyle = `rgba(200,190,255,${alpha})`;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** One body of the game, d = drawing box (the body itself is about a third of it, by tier). */
function body(ctx: Ctx, x: number, y: number, d: number, tier: number, rarity: number) {
  ctx.save();
  if (rarity >= 2) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, x, y, d * 0.55, RARITY_CSS[rarity], 0.35 + rarity * 0.05);
    ctx.restore();
  }
  ctx.translate(x - d / 2, y - d / 2);
  drawBody(ctx, d, tier, rarity);
  ctx.restore();
}

/** A shooting star: bright head, fading trail. */
function shootingStar(ctx: Ctx, x: number, y: number, len: number, angle: number, size: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const tx = x - Math.cos(angle) * len;
  const ty = y - Math.sin(angle) * len;
  const g = ctx.createLinearGradient(tx, ty, x, y);
  g.addColorStop(0, 'rgba(159,216,255,0)');
  g.addColorStop(1, 'rgba(207,232,255,0.9)');
  ctx.strokeStyle = g;
  ctx.lineCap = 'round';
  ctx.lineWidth = size * 0.5;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.restore();
  glow(ctx, x, y, size * 2.2, '#cfe8ff', 0.8);
  sparkle(ctx, x, y, size * 1.6, '#ffffff');
}

/** The title, the only text allowed: "Cosmic" and "Clicker" in gold, "RNG" in the rarity colors. */
function title(ctx: Ctx, lines: { text: string; x: number; y: number; size: number; rng?: boolean }[], align: CanvasTextAlign) {
  for (const l of lines) {
    ctx.save();
    ctx.font = `900 ${l.size}px Nunito`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    // Dark outline and violet glow so it reads on any part of the sky.
    ctx.shadowColor = 'rgba(120,80,255,0.85)';
    ctx.shadowBlur = l.size * 0.35;
    ctx.lineJoin = 'round';
    ctx.lineWidth = l.size * 0.16;
    ctx.strokeStyle = '#140b3a';
    ctx.strokeText(l.text, l.x, l.y);
    ctx.shadowBlur = 0;
    const top = l.y - l.size * 0.78;
    const g = ctx.createLinearGradient(0, top, 0, l.y + l.size * 0.05);
    if (l.rng) {
      const w = ctx.measureText(l.text).width;
      const x0 = align === 'center' ? l.x - w / 2 : align === 'right' ? l.x - w : l.x;
      const gh = ctx.createLinearGradient(x0, 0, x0 + w, 0);
      gh.addColorStop(0, RARITY_CSS[1]);
      gh.addColorStop(0.35, RARITY_CSS[2]);
      gh.addColorStop(0.7, RARITY_CSS[4]);
      gh.addColorStop(1, RARITY_CSS[3]);
      ctx.fillStyle = gh;
    } else {
      g.addColorStop(0, '#fffbe8');
      g.addColorStop(0.55, '#ffd166');
      g.addColorStop(1, '#ff9a3c');
      ctx.fillStyle = g;
    }
    ctx.fillText(l.text, l.x, l.y);
    // Guard: the title must stay inside the frame with a margin (portals crop thumbnails a little).
    const tw = ctx.measureText(l.text).width + ctx.lineWidth;
    const left = align === 'center' ? l.x - tw / 2 : align === 'right' ? l.x - tw : l.x;
    const frameW = (ctx.getTransform().a ? ctx.canvas.width / ctx.getTransform().a : ctx.canvas.width);
    if (left < 24 || left + tw > frameW - 24) console.error(`title "${l.text}" leaves the frame: ${Math.round(left)}..${Math.round(left + tw)} of ${Math.round(frameW)}`);
    // Thin light rim on top.
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = Math.max(1, l.size * 0.012);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.strokeText(l.text, l.x, l.y);
    ctx.restore();
  }
}

/** The merge chain around the core: [tier, rarity, angle on the orbit (deg), box size, distance factor]. */
type Spot = [number, number, number, number, number];

function scene(ctx: Ctx, layout: Layout) {
  const [W, H] = BASE[layout];
  background(ctx, W, H, layout === 'landscape' ? 7 : layout === 'portrait' ? 11 : 5);
  // Per layout: core position and size, orbit, chain, galaxy, title.
  const cfg = {
    landscape: {
      core: [560, 600, 150], orbit: [430, 165, -0.2], chainScale: 1.15,
      galaxy: [1060, 300, 520], star: [1500, 120, 260, 0.35, 34],
      title: { align: 'center' as CanvasTextAlign, lines: [{ text: 'COSMIC', x: 1460, y: 700, size: 160 }, { text: 'RNG CLICKER', x: 1460, y: 860, size: 124, rng: true }] },
    },
    portrait: {
      core: [400, 790, 118], orbit: [300, 116, -0.2], chainScale: 0.84,
      galaxy: [610, 540, 330], star: [700, 470, 200, 0.45, 20],
      title: { align: 'center' as CanvasTextAlign, lines: [{ text: 'COSMIC', x: 400, y: 190, size: 150 }, { text: 'RNG CLICKER', x: 400, y: 330, size: 108, rng: true }] },
    },
    square: {
      core: [400, 330, 100], orbit: [270, 98, -0.2], chainScale: 0.74,
      galaxy: [640, 150, 260], star: [170, 90, 150, 0.4, 16],
      title: { align: 'center' as CanvasTextAlign, lines: [{ text: 'COSMIC', x: 400, y: 626, size: 118 }, { text: 'RNG CLICKER', x: 400, y: 736, size: 92, rng: true }] },
    },
  }[layout];
  const [cx, cy, cr] = cfg.core;
  const [rx, ry, rot] = cfg.orbit;
  // Shooting star behind everything else in the sky.
  const [sx, sy, slen, sang, ssize] = cfg.star;
  shootingStar(ctx, sx, sy, slen, sang, ssize);
  // Back half of the orbit, the core, then the front half with the bodies.
  orbit(ctx, cx, cy, rx * 1.28, ry * 1.28, rot + 0.15, 0.12, 2);
  orbit(ctx, cx, cy, rx, ry, rot, 0.28, 3);
  core(ctx, cx, cy, cr);
  // Big Mythic Galaxy: the goal of every run.
  const [gx, gy, gd] = cfg.galaxy;
  body(ctx, gx, gy, gd, 10, 4);
  const chain: Spot[] = [
    [1, 0, 200, 150, 1],
    [2, 1, 168, 170, 1],
    [3, 0, 138, 190, 1],
    [4, 2, 108, 210, 1],
    [5, 1, 80, 230, 1],
    [6, 3, 46, 270, 1],
    [7, 2, 10, 280, 1],
    [8, 4, -28, 300, 1.02],
    [9, 3, -70, 320, 1.05],
  ];
  // Draw from the back of the orbit to the front, so nearer bodies overlap farther ones.
  const placed = chain.map(([t, r, deg, d, k]) => {
    const a = (deg * Math.PI) / 180;
    const ex = Math.cos(a) * rx * k;
    const ey = Math.sin(a) * ry * k;
    const x = cx + ex * Math.cos(rot) - ey * Math.sin(rot);
    const y = cy + ex * Math.sin(rot) + ey * Math.cos(rot);
    return { t, r, x, y, d: d * cfg.chainScale, depth: Math.sin(a) };
  });
  placed.sort((p, q) => p.depth - q.depth);
  for (const p of placed) body(ctx, p.x, p.y, p.d, p.t, p.r);
  title(ctx, cfg.title.lines, cfg.title.align);
}

async function main() {
  const params = new URLSearchParams(location.search);
  const layout = (params.get('layout') ?? 'landscape') as Layout;
  const [bw, bh] = BASE[layout];
  const w = Number(params.get('w') ?? bw);
  const h = Math.round((w * bh) / bw);
  const canvas = document.getElementById('cover') as HTMLCanvasElement;
  canvas.width = w;
  canvas.height = h;
  await document.fonts.load('900 100px Nunito', 'COSMIC RNG CLICKER');
  const ctx = canvas.getContext('2d')!;
  ctx.scale(w / bw, h / bh);
  scene(ctx, layout);
  (window as unknown as { coverReady: boolean }).coverReady = true;
}

main();
