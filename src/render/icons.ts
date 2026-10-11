import type Phaser from 'phaser';

// Small vector icons for the HUD and upgrade cards. Each draws centered on (0, 0) in a box of `size`.

type G = Phaser.GameObjects.Graphics;
export type GlyphDraw = (g: G, size: number, color: number) => void;

export const ENERGY_COLOR = 0xffc23d;

/** Four-point star: the energy currency. */
export const energyIcon: GlyphDraw = (g, size, color = ENERGY_COLOR) => {
  const s = size / 2;
  g.fillStyle(color, 1);
  g.beginPath();
  g.moveTo(0, -s);
  g.lineTo(s * 0.26, -s * 0.26);
  g.lineTo(s, 0);
  g.lineTo(s * 0.26, s * 0.26);
  g.lineTo(0, s);
  g.lineTo(-s * 0.26, s * 0.26);
  g.lineTo(-s, 0);
  g.lineTo(-s * 0.26, -s * 0.26);
  g.closePath();
  g.fillPath();
};

const ring = (g: G, r: number, w: number, color: number, alpha = 1) => {
  g.lineStyle(w, color, alpha);
  g.strokeCircle(0, 0, r);
};

const sat = (g: G, x: number, y: number, s: number, color: number) => {
  g.fillStyle(color, 1);
  g.fillRect(x - s * 0.18, y - s * 0.18, s * 0.36, s * 0.36);
  g.fillRect(x - s * 0.62, y - s * 0.1, s * 0.36, s * 0.2);
  g.fillRect(x + s * 0.26, y - s * 0.1, s * 0.36, s * 0.2);
};

/** Icon for each upgrade id. */
export const UPGRADE_ICONS: Record<string, GlyphDraw> = {
  focus: (g, size, c) => {
    const s = size / 2;
    ring(g, s * 0.75, s * 0.14, c);
    ring(g, s * 0.4, s * 0.12, c, 0.7);
    g.fillStyle(c, 1);
    g.fillCircle(0, 0, s * 0.16);
  },
  slots: (g, size, c) => {
    const s = size / 2;
    g.fillStyle(c, 1);
    for (let i = 0; i < 4; i++) g.fillRoundedRect(-s * 0.75 + (i % 2) * s * 0.85, -s * 0.75 + Math.floor(i / 2) * s * 0.85, s * 0.65, s * 0.65, s * 0.12);
  },
  discount: (g, size, c) => {
    const s = size / 2;
    g.lineStyle(s * 0.16, c, 1);
    g.lineBetween(-s * 0.55, s * 0.6, s * 0.55, -s * 0.6);
    ring(g, s * 0.22, s * 0.13, c);
    g.strokeCircle(-s * 0.45, -s * 0.42, s * 0.2);
    g.strokeCircle(s * 0.45, s * 0.42, s * 0.2);
  },
  probes: (g, size, c) => sat(g, 0, 0, size, c),
  fleet: (g, size, c) => {
    sat(g, -size * 0.18, -size * 0.18, size * 0.7, c);
    sat(g, size * 0.2, size * 0.2, size * 0.7, c);
  },
  crit: (g, size, c) => {
    const s = size / 2;
    g.fillStyle(c, 1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 ? s * 0.45 : s;
      g.fillTriangle(0, 0, Math.cos(a - 0.3) * s * 0.3, Math.sin(a - 0.3) * s * 0.3, Math.cos(a) * r, Math.sin(a) * r);
      g.fillTriangle(0, 0, Math.cos(a + 0.3) * s * 0.3, Math.sin(a + 0.3) * s * 0.3, Math.cos(a) * r, Math.sin(a) * r);
    }
  },
  luck: (g, size, c) => {
    const s = size / 2;
    energyIcon(g, size * 0.95, c);
    g.fillStyle(c, 0.6);
    g.fillCircle(s * 0.65, -s * 0.65, s * 0.15);
    g.fillCircle(-s * 0.7, s * 0.6, s * 0.12);
  },
  lens: (g, size, c) => {
    const s = size / 2;
    ring(g, s * 0.5, s * 0.16, c);
    g.lineStyle(s * 0.2, c, 1);
    g.lineBetween(s * 0.38, s * 0.38, s * 0.85, s * 0.85);
    g.fillStyle(c, 0.45);
    g.fillCircle(0, 0, s * 0.3);
  },
  binary: (g, size, c) => {
    const s = size / 2;
    g.fillStyle(c, 1);
    g.fillCircle(-s * 0.35, 0, s * 0.38);
    g.fillStyle(c, 0.65);
    g.fillCircle(s * 0.42, 0, s * 0.38);
  },
  starMagnet: (g, size, c) => {
    const s = size / 2;
    energyIcon(g, size * 0.55, c);
    g.lineStyle(s * 0.16, c, 0.8);
    g.beginPath();
    g.arc(0, 0, s * 0.8, Math.PI * 0.15, Math.PI * 0.85);
    g.strokePath();
  },
  deepScan: (g, size, c) => {
    const s = size / 2;
    ring(g, s * 0.8, s * 0.1, c, 0.6);
    ring(g, s * 0.5, s * 0.1, c, 0.8);
    g.fillStyle(c, 1);
    g.fillTriangle(0, 0, s * 0.8, -s * 0.3, s * 0.8, s * 0.3);
  },
  relay: (g, size, c) => {
    const s = size / 2;
    g.lineStyle(s * 0.15, c, 1);
    g.lineBetween(0, -s * 0.2, 0, s * 0.85);
    g.beginPath();
    g.arc(0, -s * 0.2, s * 0.4, Math.PI * 1.15, Math.PI * 1.85);
    g.strokePath();
    g.beginPath();
    g.arc(0, -s * 0.2, s * 0.75, Math.PI * 1.15, Math.PI * 1.85);
    g.strokePath();
  },
  autoScan: (g, size, c) => {
    const s = size / 2;
    ring(g, s * 0.75, s * 0.12, c);
    g.lineStyle(s * 0.14, c, 1);
    g.lineBetween(0, 0, s * 0.5, -s * 0.5);
    g.fillStyle(c, 1);
    g.fillCircle(0, 0, s * 0.14);
  },
  autoMerge: (g, size, c) => {
    const s = size / 2;
    g.lineStyle(s * 0.14, c, 1);
    g.beginPath();
    for (let k = 0; k <= 30; k++) {
      const t = (k / 30) * Math.PI * 3.2;
      const r = s * 0.12 + (k / 30) * s * 0.75;
      if (k === 0) g.moveTo(Math.cos(t) * r, Math.sin(t) * r);
      else g.lineTo(Math.cos(t) * r, Math.sin(t) * r);
    }
    g.strokePath();
  },
};
