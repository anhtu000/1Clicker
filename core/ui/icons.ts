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

export const homeIcon: IconDraw = (g, size, color) => {
  const s = size / 2;
  g.fillStyle(color, 1);
  g.fillTriangle(-s * 0.85, -s * 0.05, s * 0.85, -s * 0.05, 0, -s * 0.8);
  g.fillRect(-s * 0.55, -s * 0.1, s * 1.1, s * 0.85);
};
