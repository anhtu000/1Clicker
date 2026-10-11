import Phaser from 'phaser';
import { app } from '../app';

/** Short message near the bottom of the screen that fades out by itself. */
export function toast(scene: Phaser.Scene, message: string, durationMs = 2200) {
  if (app.clean) return;
  const vp = app.viewport.info;
  const theme = app.theme;
  const text = scene.add
    .text(0, 0, message, {
      fontFamily: theme.font,
      fontStyle: '700',
      fontSize: 30,
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: Math.min(vp.width - 80, 900) },
    })
    .setOrigin(0.5);
  const padX = 32;
  const padY = 18;
  const bg = scene.add.graphics();
  bg.fillStyle(0x000000, 0.78);
  bg.fillRoundedRect(-text.width / 2 - padX, -text.height / 2 - padY, text.width + padX * 2, text.height + padY * 2, 28);
  const box = scene.add.container(vp.width / 2, vp.height - vp.height * 0.14, [bg, text]).setDepth(2000).setAlpha(0);
  scene.tweens.add({ targets: box, alpha: 1, y: box.y - 20, duration: 180, ease: 'Cubic.Out' });
  scene.tweens.add({ targets: box, alpha: 0, delay: durationMs, duration: 300, onComplete: () => box.destroy() });
}
