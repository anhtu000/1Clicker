import Phaser from 'phaser';
import { app } from '@core';

// Deep-space backdrop: a nebula painted once on a canvas, and twinkling stars drawn each frame.

const NEBULA_KEY = 'nebula';

function nebulaTexture(scene: Phaser.Scene) {
  if (scene.textures.exists(NEBULA_KEY)) return;
  const w = 512;
  const h = 512;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#0b0826');
  bg.addColorStop(0.55, '#07061a');
  bg.addColorStop(1, '#0a0b24');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  let s = 7;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  // Clouds of color, layered with 'lighter' so overlaps glow.
  const clouds = [
    ['#5b2bd1', 0.2],
    ['#1f6fd6', 0.16],
    ['#c2378f', 0.12],
    ['#2bb3c9', 0.08],
  ] as const;
  ctx.globalCompositeOperation = 'lighter';
  for (const [color, alpha] of clouds) {
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
  scene.textures.addCanvas(NEBULA_KEY, c);
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

  constructor(scene: Phaser.Scene) {
    nebulaTexture(scene);
    this.image = scene.add.image(0, 0, NEBULA_KEY).setOrigin(0.5).setDepth(-100);
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
