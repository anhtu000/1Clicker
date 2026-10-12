import Phaser from 'phaser';

// Decorations for the backdrop (CLAUDE.md 4b item 10): small planets and spacecraft, drawn in code.
// Each texture is DECOR_TEX pixels square; the item is shown at decor.itemSize design units.

type Ctx = CanvasRenderingContext2D;
export const DECOR_TEX = 160;
export const decorKey = (id: string) => `decor-${id}`;

const C = DECOR_TEX / 2;

/** Lit sphere: base color, a light from the top-left, and a soft dark side. */
function ball(ctx: Ctx, x: number, y: number, r: number, base: string, light: string, dark: string) {
  const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.45, r * 0.1, x, y, r);
  g.addColorStop(0, light);
  g.addColorStop(0.55, base);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/** Runs `draw` clipped to a circle, for surface details. */
function clipped(ctx: Ctx, x: number, y: number, r: number, draw: () => void) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  draw();
  ctx.restore();
}

/** Shadow over the lower right of a sphere, drawn after its details. */
function terminator(ctx: Ctx, x: number, y: number, r: number, strength = 0.55) {
  const g = ctx.createRadialGradient(x - r * 0.5, y - r * 0.5, r * 0.6, x - r * 0.2, y - r * 0.2, r * 1.5);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,20,${strength})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function halo(ctx: Ctx, x: number, y: number, r: number, color: string, alpha: number) {
  const n = parseInt(color.slice(1), 16);
  const rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
  const g = ctx.createRadialGradient(x, y, r * 0.8, x, y, r * 1.35);
  g.addColorStop(0, `rgba(${rgb},${alpha})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(x - r * 1.4, y - r * 1.4, r * 2.8, r * 2.8);
}

function bands(ctx: Ctx, x: number, y: number, r: number, colors: string[], tilt = 0) {
  clipped(ctx, x, y, r, () => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    const h = (r * 2) / colors.length;
    colors.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(0, -r + h * (i + 0.5), r * 1.3, h * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  });
}

const DRAW: Record<string, (ctx: Ctx) => void> = {
  moon(ctx) {
    const r = 52;
    ball(ctx, C, C, r, '#b9b9c6', '#eeeef5', '#6f6f80');
    clipped(ctx, C, C, r, () => {
      for (const [dx, dy, cr] of [[-18, -14, 11], [16, 8, 15], [-6, 24, 8], [22, -22, 7], [-28, 12, 6]]) {
        ctx.fillStyle = 'rgba(80,80,100,0.45)';
        ctx.beginPath();
        ctx.arc(C + dx, C + dy, cr, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.beginPath();
        ctx.arc(C + dx - cr * 0.2, C + dy - cr * 0.25, cr * 0.7, Math.PI, Math.PI * 1.6);
        ctx.lineTo(C + dx, C + dy);
        ctx.fill();
      }
    });
    terminator(ctx, C, C, r);
  },
  mars(ctx) {
    const r = 54;
    halo(ctx, C, C, r, '#ff7a4a', 0.25);
    ball(ctx, C, C, r, '#cf5c34', '#f29a6c', '#7c2a14');
    clipped(ctx, C, C, r, () => {
      ctx.fillStyle = 'rgba(120,40,20,0.5)';
      for (const [dx, dy, w, h] of [[-14, 6, 26, 12], [18, -10, 18, 9], [4, 26, 30, 8]]) {
        ctx.beginPath();
        ctx.ellipse(C + dx, C + dy, w, h, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.ellipse(C - 4, C - r + 6, 22, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    terminator(ctx, C, C, r);
  },
  venus(ctx) {
    const r = 56;
    halo(ctx, C, C, r, '#ffe3a0', 0.3);
    ball(ctx, C, C, r, '#e5c27d', '#fff1c9', '#9a7434');
    bands(ctx, C, C, r, ['rgba(255,240,200,0.35)', 'rgba(0,0,0,0)', 'rgba(200,150,80,0.3)', 'rgba(0,0,0,0)', 'rgba(255,240,200,0.3)', 'rgba(200,150,80,0.25)'], -0.25);
    terminator(ctx, C, C, r);
  },
  earth(ctx) {
    const r = 56;
    halo(ctx, C, C, r, '#7ac8ff', 0.45);
    ball(ctx, C, C, r, '#2a74d2', '#6fb6ff', '#0d2f6b');
    clipped(ctx, C, C, r, () => {
      ctx.fillStyle = '#4caf62';
      const blob = (pts: number[][]) => {
        ctx.beginPath();
        pts.forEach(([x, y], i) => (i ? ctx.lineTo(C + x, C + y) : ctx.moveTo(C + x, C + y)));
        ctx.closePath();
        ctx.fill();
      };
      blob([[-40, -20], [-18, -34], [-4, -20], [-14, 2], [-6, 20], [-24, 30], [-36, 8]]);
      blob([[10, -30], [34, -24], [44, -4], [30, 10], [18, 2], [8, -12]]);
      blob([[16, 22], [32, 20], [36, 36], [20, 44]]);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      for (const [dx, dy, a] of [[-10, -42, 0.2], [20, 30, -0.3], [-30, 18, 0.5]]) {
        ctx.beginPath();
        ctx.ellipse(C + dx, C + dy, 20, 5, a, 0, Math.PI * 1.3);
        ctx.stroke();
      }
    });
    terminator(ctx, C, C, r, 0.6);
  },
  neptune(ctx) {
    const r = 54;
    halo(ctx, C, C, r, '#6f8dff', 0.3);
    ball(ctx, C, C, r, '#3157d6', '#7d9bff', '#101f66');
    bands(ctx, C, C, r, ['rgba(0,0,0,0)', 'rgba(120,160,255,0.25)', 'rgba(0,0,0,0)', 'rgba(20,40,140,0.35)', 'rgba(120,160,255,0.2)', 'rgba(0,0,0,0)']);
    ctx.fillStyle = 'rgba(15,25,90,0.7)';
    ctx.beginPath();
    ctx.ellipse(C - 12, C + 8, 12, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    terminator(ctx, C, C, r);
  },
  uranus(ctx) {
    const r = 46;
    const ring = (front: boolean) => {
      ctx.save();
      ctx.translate(C, C);
      ctx.rotate(1.35);
      ctx.strokeStyle = 'rgba(200,245,255,0.7)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, 70, 14, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    };
    ring(false);
    ball(ctx, C, C, r, '#8fe0e6', '#d6fbff', '#3c8d99');
    terminator(ctx, C, C, r, 0.45);
    ring(true);
  },
  jupiter(ctx) {
    const r = 60;
    ball(ctx, C, C, r, '#d7a36d', '#f6dcb6', '#7c4b22');
    bands(ctx, C, C, r, ['#e9c49a', '#b97a45', '#f0d6b2', '#c98a52', '#e8c79e', '#a96a39', '#efd3ad', '#b97a45']);
    ctx.fillStyle = '#c0533a';
    ctx.beginPath();
    ctx.ellipse(C + 14, C + 16, 13, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    terminator(ctx, C, C, r, 0.55);
  },
  saturn(ctx) {
    const r = 38;
    const ring = (front: boolean) => {
      ctx.save();
      ctx.translate(C, C);
      ctx.rotate(-0.35);
      for (const [rx, ry, w, c] of [[74, 20, 7, 'rgba(230,205,150,0.9)'], [62, 16, 5, 'rgba(190,160,110,0.85)'], [52, 13, 3, 'rgba(240,220,170,0.7)']] as const) {
        ctx.strokeStyle = c;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    };
    ring(false);
    ball(ctx, C, C, r, '#e3c27f', '#fff0c8', '#8d6a2c');
    bands(ctx, C, C, r, ['rgba(0,0,0,0)', 'rgba(190,140,70,0.35)', 'rgba(255,240,200,0.3)', 'rgba(190,140,70,0.3)', 'rgba(0,0,0,0)'], -0.35);
    terminator(ctx, C, C, r, 0.5);
    ring(true);
  },
  comet(ctx) {
    ctx.save();
    ctx.translate(C, C);
    ctx.rotate(-0.6);
    const tail = ctx.createLinearGradient(-70, 0, 30, 0);
    tail.addColorStop(0, 'rgba(120,200,255,0)');
    tail.addColorStop(1, 'rgba(180,230,255,0.85)');
    ctx.fillStyle = tail;
    ctx.beginPath();
    ctx.moveTo(30, -14);
    ctx.quadraticCurveTo(-20, -18, -74, -4);
    ctx.quadraticCurveTo(-20, 4, -70, 14);
    ctx.quadraticCurveTo(-10, 18, 30, 14);
    ctx.closePath();
    ctx.fill();
    halo(ctx, 34, 0, 14, '#bfe8ff', 0.9);
    ball(ctx, 34, 0, 14, '#dff4ff', '#ffffff', '#7fb6d9');
    ctx.restore();
  },
  satellite(ctx) {
    ctx.save();
    ctx.translate(C, C);
    ctx.rotate(-0.4);
    const panel = (x: number) => {
      ctx.fillStyle = '#2b4fb8';
      ctx.fillRect(x, -16, 46, 32);
      ctx.strokeStyle = '#8fb0ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x, -16, 46, 32);
      for (let i = 1; i < 4; i++) {
        ctx.beginPath();
        ctx.moveTo(x + (46 / 4) * i, -16);
        ctx.lineTo(x + (46 / 4) * i, 16);
        ctx.stroke();
      }
    };
    ctx.fillStyle = '#9aa3b8';
    ctx.fillRect(-30, -3, 60, 6);
    panel(-74);
    panel(28);
    ctx.fillStyle = '#e0b84a';
    ctx.fillRect(-16, -18, 32, 36);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(-16, -18, 32, 8);
    ctx.strokeStyle = '#d7dbe8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(0, -34);
    ctx.stroke();
    ctx.fillStyle = '#d7dbe8';
    ctx.beginPath();
    ctx.arc(0, -36, 9, Math.PI, 0);
    ctx.fill();
    ctx.restore();
  },
  rocket(ctx) {
    ctx.save();
    ctx.translate(C, C);
    ctx.rotate(0.7);
    // flame
    const f = ctx.createLinearGradient(0, 30, 0, 74);
    f.addColorStop(0, '#fff3b0');
    f.addColorStop(0.5, '#ff9a3c');
    f.addColorStop(1, 'rgba(255,80,40,0)');
    ctx.fillStyle = f;
    ctx.beginPath();
    ctx.moveTo(-12, 34);
    ctx.quadraticCurveTo(0, 90, 12, 34);
    ctx.fill();
    // fins
    ctx.fillStyle = '#e04a4a';
    ctx.beginPath();
    ctx.moveTo(-14, 12);
    ctx.lineTo(-30, 38);
    ctx.lineTo(-14, 32);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(14, 12);
    ctx.lineTo(30, 38);
    ctx.lineTo(14, 32);
    ctx.fill();
    // body
    const b = ctx.createLinearGradient(-16, 0, 16, 0);
    b.addColorStop(0, '#ffffff');
    b.addColorStop(1, '#aeb6cc');
    ctx.fillStyle = b;
    ctx.beginPath();
    ctx.moveTo(0, -62);
    ctx.quadraticCurveTo(22, -30, 16, 34);
    ctx.lineTo(-16, 34);
    ctx.quadraticCurveTo(-22, -30, 0, -62);
    ctx.fill();
    // nose
    ctx.fillStyle = '#e04a4a';
    ctx.beginPath();
    ctx.moveTo(0, -62);
    ctx.quadraticCurveTo(13, -48, 15, -36);
    ctx.lineTo(-15, -36);
    ctx.quadraticCurveTo(-13, -48, 0, -62);
    ctx.fill();
    // window
    ctx.fillStyle = '#3d5fa8';
    ctx.beginPath();
    ctx.arc(0, -12, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#7e8aa8';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(-3, -15, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
  astronaut(ctx) {
    ctx.save();
    ctx.translate(C, C);
    ctx.rotate(-0.25);
    const suit = '#eef0f6';
    const shade = '#b9bfd0';
    // backpack
    ctx.fillStyle = shade;
    ctx.fillRect(-26, -16, 52, 40);
    // legs
    ctx.fillStyle = suit;
    ctx.fillRect(-18, 22, 14, 30);
    ctx.fillRect(4, 22, 14, 30);
    ctx.fillStyle = shade;
    ctx.fillRect(-18, 46, 14, 8);
    ctx.fillRect(4, 46, 14, 8);
    // arms
    ctx.strokeStyle = suit;
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-20, -2);
    ctx.lineTo(-40, 16);
    ctx.moveTo(20, -2);
    ctx.lineTo(42, -16);
    ctx.stroke();
    // body
    ctx.fillStyle = suit;
    ctx.beginPath();
    ctx.roundRect(-22, -12, 44, 40, 10);
    ctx.fill();
    ctx.fillStyle = '#e04a4a';
    ctx.fillRect(-8, 2, 16, 8);
    // helmet
    ball(ctx, 0, -30, 24, suit, '#ffffff', shade);
    const v = ctx.createLinearGradient(-14, -42, 14, -20);
    v.addColorStop(0, '#ffd77a');
    v.addColorStop(1, '#b8781e');
    ctx.fillStyle = v;
    ctx.beginPath();
    ctx.ellipse(2, -30, 16, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.ellipse(-4, -35, 5, 3, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },
  shuttle(ctx) {
    ctx.save();
    ctx.translate(C, C);
    ctx.rotate(-0.75);
    // wings
    ctx.fillStyle = '#d9dde8';
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(-36, 40);
    ctx.lineTo(36, 40);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2b2f3d';
    ctx.beginPath();
    ctx.moveTo(-36, 40);
    ctx.lineTo(-24, 30);
    ctx.lineTo(24, 30);
    ctx.lineTo(36, 40);
    ctx.closePath();
    ctx.fill();
    // body
    const b = ctx.createLinearGradient(-14, 0, 14, 0);
    b.addColorStop(0, '#ffffff');
    b.addColorStop(1, '#b4bacb');
    ctx.fillStyle = b;
    ctx.beginPath();
    ctx.moveTo(0, -66);
    ctx.quadraticCurveTo(15, -50, 14, -20);
    ctx.lineTo(14, 44);
    ctx.lineTo(-14, 44);
    ctx.lineTo(-14, -20);
    ctx.quadraticCurveTo(-15, -50, 0, -66);
    ctx.fill();
    ctx.fillStyle = '#2b2f3d';
    ctx.beginPath();
    ctx.moveTo(0, -66);
    ctx.quadraticCurveTo(10, -58, 11, -48);
    ctx.lineTo(-11, -48);
    ctx.quadraticCurveTo(-10, -58, 0, -66);
    ctx.fill();
    ctx.fillStyle = '#4a6fb5';
    ctx.fillRect(-7, -42, 14, 6);
    // tail fin and engines
    ctx.fillStyle = '#c3c8d6';
    ctx.fillRect(-3, 22, 6, 24);
    ctx.fillStyle = '#5c6275';
    for (const x of [-8, 0, 8]) {
      ctx.beginPath();
      ctx.arc(x, 48, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },
  ufo(ctx) {
    ctx.save();
    ctx.translate(C, C + 8);
    ctx.rotate(-0.15);
    // dome
    const d = ctx.createRadialGradient(-8, -30, 2, 0, -18, 30);
    d.addColorStop(0, 'rgba(220,255,255,0.95)');
    d.addColorStop(1, 'rgba(70,200,220,0.75)');
    ctx.fillStyle = d;
    ctx.beginPath();
    ctx.ellipse(0, -14, 28, 26, 0, Math.PI, 0);
    ctx.fill();
    // saucer
    const s = ctx.createLinearGradient(0, -16, 0, 18);
    s.addColorStop(0, '#d9dce6');
    s.addColorStop(1, '#6d7286');
    ctx.fillStyle = s;
    ctx.beginPath();
    ctx.ellipse(0, 0, 66, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#585d70';
    ctx.beginPath();
    ctx.ellipse(0, 10, 30, 8, 0, 0, Math.PI);
    ctx.fill();
    const lights = ['#ffd166', '#ff7ad9', '#7cf0a0', '#9fd8ff', '#ffd166'];
    lights.forEach((c, i) => {
      const x = -44 + i * 22;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, 2, 5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  },
  station(ctx) {
    ctx.save();
    ctx.translate(C, C);
    ctx.rotate(0.3);
    // solar wings
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#2b4fb8';
      ctx.fillRect(s > 0 ? 30 : -74, -30, 44, 22);
      ctx.fillRect(s > 0 ? 30 : -74, 8, 44, 22);
      ctx.strokeStyle = '#8fb0ff';
      ctx.lineWidth = 2;
      ctx.strokeRect(s > 0 ? 30 : -74, -30, 44, 22);
      ctx.strokeRect(s > 0 ? 30 : -74, 8, 44, 22);
    }
    ctx.fillStyle = '#9aa3b8';
    ctx.fillRect(-74, -3, 148, 6);
    // ring
    ctx.strokeStyle = '#d7dbe8';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 30, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#9aa3b8';
    ctx.lineWidth = 3;
    for (let a = 0; a < 4; a++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos((a * Math.PI) / 2 + 0.785) * 30, Math.sin((a * Math.PI) / 2 + 0.785) * 30);
      ctx.stroke();
    }
    // hub
    ball(ctx, 0, 0, 12, '#e8eaf2', '#ffffff', '#8d93a8');
    ctx.fillStyle = '#ffd166';
    for (let a = 0; a < 8; a++) {
      ctx.beginPath();
      ctx.arc(Math.cos((a * Math.PI) / 4) * 30, Math.sin((a * Math.PI) / 4) * 30, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  },
};

export const DECOR_IDS = Object.keys(DRAW);

/** Texture of a decoration, made once. */
export function ensureDecorTexture(scene: Phaser.Scene, id: string): string {
  const key = decorKey(id);
  if (scene.textures.exists(key)) return key;
  const c = document.createElement('canvas');
  c.width = DECOR_TEX;
  c.height = DECOR_TEX;
  const ctx = c.getContext('2d')!;
  (DRAW[id] ?? DRAW.moon)(ctx);
  scene.textures.addCanvas(key, c);
  return key;
}
