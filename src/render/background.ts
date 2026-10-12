import Phaser from 'phaser';
import { app } from '@core';

// Deep-space backdrop: a nebula painted once on a canvas, and twinkling stars drawn each frame.

/** Backdrop themes, bought in the decor shop (CLAUDE.md 4b item 10). Ids match src/content/decor.json. */
const THEMES: Record<string, { stops: [string, string, string]; clouds: [string, number][]; seed: number }> = {
  nebula: { stops: ['#0b0826', '#07061a', '#0a0b24'], clouds: [['#5b2bd1', 0.2], ['#1f6fd6', 0.16], ['#c2378f', 0.12], ['#2bb3c9', 0.08]], seed: 7 },
  aurora: { stops: ['#03181b', '#020c11', '#05131d'], clouds: [['#2bd18f', 0.17], ['#1fa3c9', 0.15], ['#6a4bd1', 0.1], ['#9be36b', 0.06]], seed: 21 },
  ember: { stops: ['#1c0a08', '#0e0505', '#190b06'], clouds: [['#e0662b', 0.18], ['#c22f2f', 0.15], ['#e0b02b', 0.09], ['#7a2bd1', 0.07]], seed: 33 },
  abyss: { stops: ['#020617', '#01030c', '#030a1c'], clouds: [['#1f4fd6', 0.18], ['#19b5d6', 0.1], ['#3a2bd1', 0.12], ['#9fb8ff', 0.04]], seed: 48 },
  rose: { stops: ['#190716', '#0c040b', '#160815'], clouds: [['#e04fa8', 0.18], ['#b02bd1', 0.14], ['#ff9a7a', 0.08], ['#4b6fff', 0.06]], seed: 59 },
};

export const nebulaKey = (theme: string) => `nebula-${THEMES[theme] ? theme : 'nebula'}`;

/** The painted backdrop of a theme, made once. Also used for the thumbnails in the decor shop. */
export function ensureNebulaTexture(scene: Phaser.Scene, theme: string): string {
  const key = nebulaKey(theme);
  if (scene.textures.exists(key)) return key;
  const t = THEMES[theme] ?? THEMES.nebula;
  const w = 512;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, t.stops[0]);
  bg.addColorStop(0.55, t.stops[1]);
  bg.addColorStop(1, t.stops[2]);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  let s = t.seed;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  // Clouds of color, layered with 'lighter' so overlaps glow.
  ctx.globalCompositeOperation = 'lighter';
  for (const [color, alpha] of t.clouds) {
    for (let i = 0; i < 7; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = 60 + rnd() * 170;
      const n = parseInt(color.slice(1), 16);
      const rgb = `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${rgb},${alpha})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  // Faint fixed stars baked in.
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.35})`;
    const r = rnd() < 0.9 ? 0.6 : 1.2;
    ctx.beginPath();
    ctx.arc(rnd() * w, rnd() * h, r, 0, Math.PI * 2);
    ctx.fill();
  }
  scene.textures.addCanvas(key, c);
  return key;
}

interface TwinkleStar {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
  drift: number;
}

/** Fills the whole screen. Call layout() on resize and update(delta) every frame. */
export class SpaceBackground {
  private image: Phaser.GameObjects.Image;
  private stars: Phaser.GameObjects.Graphics;
  private list: TwinkleStar[] = [];
  private time = 0;

  constructor(scene: Phaser.Scene, theme = 'nebula') {
    this.image = scene.add.image(0, 0, ensureNebulaTexture(scene, theme)).setOrigin(0.5).setDepth(-100);
    this.stars = scene.add.graphics().setDepth(-99);
    for (let i = 0; i < 70; i++) {
      this.list.push({
        x: Math.random(),
        y: Math.random(),
        r: Phaser.Math.FloatBetween(0.8, 2.4),
        phase: Math.random() * Math.PI * 2,
        speed: Phaser.Math.FloatBetween(0.6, 2.2),
        drift: Phaser.Math.FloatBetween(2, 9),
      });
    }
  }

  /** Switches to another theme's backdrop. */
  setTheme(theme: string) {
    this.image.setTexture(ensureNebulaTexture(this.image.scene, theme));
    this.layout();
  }

  layout() {
    const vp = app.viewport.info;
    const scale = Math.max(vp.width / this.image.width, vp.height / this.image.height);
    this.image.setPosition(vp.width / 2, vp.height / 2).setScale(scale * 1.05);
  }

  update(delta: number) {
    this.time += delta / 1000;
    const vp = app.viewport.info;
    const g = this.stars;
    g.clear();
    for (const s of this.list) {
      // Slow drift downward, as if the camera is rising through space.
      s.y += (s.drift * delta) / 1000 / vp.height;
      if (s.y > 1) s.y -= 1;
      const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this.time * s.speed + s.phase));
      g.fillStyle(0xffffff, a * 0.8);
      g.fillCircle(s.x * vp.width, s.y * vp.height, s.r);
    }
  }
}
