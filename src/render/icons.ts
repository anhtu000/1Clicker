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

export const CRYSTAL_COLOR = 0x7fe8ff;

/** Cut gem: the crystal currency (decorations only). */
export const crystalIcon: GlyphDraw = (g, size, color = CRYSTAL_COLOR) => {
  const s = size / 2;
  g.fillStyle(color, 1);
  g.beginPath();
  g.moveTo(-s * 0.55, -s * 0.62);
  g.lineTo(s * 0.55, -s * 0.62);
  g.lineTo(s * 0.92, -s * 0.18);
  g.lineTo(0, s * 0.9);
  g.lineTo(-s * 0.92, -s * 0.18);
  g.closePath();
  g.fillPath();
  // facets
  g.fillStyle(0xffffff, 0.45);
  g.fillTriangle(-s * 0.55, -s * 0.62, s * 0.05, -s * 0.62, -s * 0.3, -s * 0.18);
  g.fillStyle(0x000000, 0.18);
  g.fillTriangle(s * 0.92, -s * 0.18, 0, s * 0.9, s * 0.3, -s * 0.18);
  g.lineStyle(Math.max(1, s * 0.07), 0xffffff, 0.35);
  g.lineBetween(-s * 0.92, -s * 0.18, s * 0.92, -s * 0.18);
};

/** Three lines: the menu. */
export const menuIcon: GlyphDraw = (g, size, color) => {
  const s = size / 2;
  g.fillStyle(color, 1);
  for (let i = -1; i <= 1; i++) g.fillRoundedRect(-s * 0.72, i * s * 0.5 - s * 0.1, s * 1.44, s * 0.2, s * 0.1);
};

/** Stopwatch: timed run. */
export const stopwatchIcon: GlyphDraw = (g, size, color) => {
  const s = size / 2;
  g.lineStyle(size * 0.1, color, 1);
  g.strokeCircle(0, s * 0.1, s * 0.72);
  g.fillStyle(color, 1);
  g.fillRoundedRect(-s * 0.18, -s * 0.95, s * 0.36, s * 0.22, s * 0.06);
  g.lineBetween(0, s * 0.1, 0, -s * 0.38);
  g.lineBetween(0, s * 0.1, s * 0.3, s * 0.3);
};

/** Grid of cells: the collection. */
export const collectionIcon: GlyphDraw = (g, size, color) => {
  const s = size / 2;
  for (let i = 0; i < 9; i++) {
    g.fillStyle(color, i === 4 ? 1 : 0.75);
    g.fillCircle(-s * 0.62 + (i % 3) * s * 0.62, -s * 0.62 + Math.floor(i / 3) * s * 0.62, s * 0.22);
  }
};

/** Ringed planet: decorations. */
export const decorIcon: GlyphDraw = (g, size, color) => {
  const s = size / 2;
  g.fillStyle(color, 1);
  g.fillCircle(0, 0, s * 0.46);
  g.lineStyle(s * 0.13, color, 1);
  g.strokeEllipse(0, 0, s * 1.9, s * 0.6);
};

/** Cup: records. */
export const trophyIcon: GlyphDraw = (g, size, color) => {
  const s = size / 2;
  g.fillStyle(color, 1);
  g.beginPath();
  g.moveTo(-s * 0.55, -s * 0.8);
  g.lineTo(s * 0.55, -s * 0.8);
  g.lineTo(s * 0.45, -s * 0.1);
  g.lineTo(s * 0.12, s * 0.2);
  g.lineTo(-s * 0.12, s * 0.2);
  g.lineTo(-s * 0.45, -s * 0.1);
  g.closePath();
  g.fillPath();
  g.fillRect(-s * 0.1, s * 0.15, s * 0.2, s * 0.4);
  g.fillRoundedRect(-s * 0.45, s * 0.52, s * 0.9, s * 0.22, s * 0.06);
  g.lineStyle(s * 0.12, color, 1);
  g.strokeCircle(-s * 0.58, -s * 0.48, s * 0.24);
  g.strokeCircle(s * 0.58, -s * 0.48, s * 0.24);
};

/** Arrows on four sides: move things around. */
export const arrangeIcon: GlyphDraw = (g, size, color) => {
  const s = size / 2;
  g.lineStyle(s * 0.13, color, 1);
  g.lineBetween(-s * 0.8, 0, s * 0.8, 0);
  g.lineBetween(0, -s * 0.8, 0, s * 0.8);
  g.fillStyle(color, 1);
  const a = s * 0.3;
  g.fillTriangle(s * 0.95, 0, s * 0.95 - a, -a * 0.8, s * 0.95 - a, a * 0.8);
  g.fillTriangle(-s * 0.95, 0, -s * 0.95 + a, -a * 0.8, -s * 0.95 + a, a * 0.8);
  g.fillTriangle(0, s * 0.95, -a * 0.8, s * 0.95 - a, a * 0.8, s * 0.95 - a);
  g.fillTriangle(0, -s * 0.95, -a * 0.8, -s * 0.95 + a, a * 0.8, -s * 0.95 + a);
};
