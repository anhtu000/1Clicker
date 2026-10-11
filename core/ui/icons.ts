import Phaser from 'phaser';

// Icons drawn with vector shapes, so they stay sharp at any scale and need no image files.
// Each function draws centered on (0, 0) inside a box of the given size.

const pts = (list: [number, number][]) => list.map(([x, y]) => new Phaser.Math.Vector2(x, y));

export type IconDraw = (g: Phaser.GameObjects.Graphics, size: number, color: number) => void;

export const soundOnIcon: IconDraw = (g, size, color) => {
  const s = size / 2;
  g.fillStyle(color, 1);
  g.fillPoints(
    pts([
      [-s * 0.85, -s * 0.3],
      [-s * 0.45, -s * 0.3],
      [-s * 0.05, -s * 0.7],
      [-s * 0.05, s * 0.7],
      [-s * 0.45, s * 0.3],
      [-s * 0.85, s * 0.3],
    ]),
    true,
  );
  g.lineStyle(size * 0.09, color, 1);
  g.beginPath();
  g.arc(-s * 0.05, 0, s * 0.45, -0.75, 0.75);
  g.strokePath();
  g.beginPath();
  g.arc(-s * 0.05, 0, s * 0.8, -0.8, 0.8);
  g.strokePath();
};

export const soundOffIcon: IconDraw = (g, size, color) => {
  const s = size / 2;
  g.fillStyle(color, 1);
  g.fillPoints(
    pts([
      [-s * 0.85, -s * 0.3],
      [-s * 0.45, -s * 0.3],
      [-s * 0.05, -s * 0.7],
      [-s * 0.05, s * 0.7],
      [-s * 0.45, s * 0.3],
      [-s * 0.85, s * 0.3],
    ]),
    true,
  );
  g.lineStyle(size * 0.09, color, 1);
  g.lineBetween(s * 0.25, -s * 0.3, s * 0.85, s * 0.3);
  g.lineBetween(s * 0.25, s * 0.3, s * 0.85, -s * 0.3);
};

export const pauseIcon: IconDraw = (g, size, color) => {
  const s = size / 2;
  g.fillStyle(color, 1);
  g.fillRoundedRect(-s * 0.55, -s * 0.65, s * 0.38, s * 1.3, s * 0.1);
  g.fillRoundedRect(s * 0.17, -s * 0.65, s * 0.38, s * 1.3, s * 0.1);
};

export const playIcon: IconDraw = (g, size, color) => {
  const s = size / 2;
  g.fillStyle(color, 1);
  g.fillTriangle(-s * 0.45, -s * 0.65, -s * 0.45, s * 0.65, s * 0.7, 0);
};

/** Screen with a play triangle: marks anything that shows a rewarded ad (CrazyGames asks for a clear video icon). */
export const videoIcon: IconDraw = (g, size, color) => {
  const s = size / 2;
  g.lineStyle(size * 0.1, color, 1);
  g.strokeRoundedRect(-s * 0.9, -s * 0.68, s * 1.8, s * 1.36, s * 0.24);
  g.fillStyle(color, 1);
  g.fillTriangle(-s * 0.26, -s * 0.36, -s * 0.26, s * 0.36, s * 0.4, 0);
};

export const homeIcon: IconDraw = (g, size, color) => {
  const s = size / 2;
  g.fillStyle(color, 1);
  g.fillTriangle(-s * 0.85, -s * 0.05, s * 0.85, -s * 0.05, 0, -s * 0.8);
  g.fillRect(-s * 0.55, -s * 0.1, s * 1.1, s * 0.85);
};

export const closeIcon: IconDraw = (g, size, color) => {
  const s = size / 2;
  g.lineStyle(size * 0.13, color, 1);
  g.lineBetween(-s * 0.5, -s * 0.5, s * 0.5, s * 0.5);
  g.lineBetween(-s * 0.5, s * 0.5, s * 0.5, -s * 0.5);
};

export const checkIcon: IconDraw = (g, size, color) => {
  const s = size / 2;
  g.lineStyle(size * 0.14, color, 1);
  g.beginPath();
  g.moveTo(-s * 0.6, 0);
  g.lineTo(-s * 0.15, s * 0.45);
  g.lineTo(s * 0.65, -s * 0.45);
  g.strokePath();
};

export const giftIcon: IconDraw = (g, size, color) => {
  const s = size / 2;
  g.fillStyle(color, 1);
  g.fillRoundedRect(-s * 0.75, -s * 0.2, s * 1.5, s * 0.95, s * 0.1);
  g.fillRoundedRect(-s * 0.85, -s * 0.5, s * 1.7, s * 0.35, s * 0.08);
  g.fillStyle(0x000000, 0.25);
  g.fillRect(-s * 0.1, -s * 0.5, s * 0.2, s * 1.25);
  g.lineStyle(size * 0.09, color, 1);
  g.strokeEllipse(-s * 0.28, -s * 0.68, s * 0.5, s * 0.3);
  g.strokeEllipse(s * 0.28, -s * 0.68, s * 0.5, s * 0.3);
};
