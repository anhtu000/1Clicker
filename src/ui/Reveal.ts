import Phaser from 'phaser';
import { app, burst } from '@core';
import { RARITY_COLOR, RARITY_CSS } from '../render/palette';
import { BodySprite } from './BodySprite';
import type { Body } from '../logic/run.ts';

/**
 * Full-screen moment for an Epic or rarer find (CLAUDE.md 5c, A3): the body large,
 * its rarity in big letters and the odds ("1 in 500"), readable in a vertical video frame.
 * About 2.5 seconds; a tap closes it sooner.
 */
export function showReveal(scene: Phaser.Scene, body: Body, title: string, subtitle: string, odds: string, onDone?: () => void) {
  const vp = app.viewport.info;
  const cx = vp.width / 2;
  const cy = vp.height / 2 - (vp.portrait ? 60 : 20);
  const color = RARITY_COLOR[body.r];
  const css = RARITY_CSS[body.r];
  const depth = 1600;
  const dim = scene.add.rectangle(0, 0, vp.width, vp.height, 0x050414, 0.78).setOrigin(0).setDepth(depth).setInteractive();
  const rays = scene.add.graphics().setDepth(depth + 1).setPosition(cx, cy).setBlendMode(Phaser.BlendModes.ADD);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    rays.fillStyle(color, 0.16);
    rays.fillTriangle(0, 0, Math.cos(a - 0.09) * 700, Math.sin(a - 0.09) * 700, Math.cos(a + 0.09) * 700, Math.sin(a + 0.09) * 700);
  }
  const big = new BodySprite(scene, cx, cy, body, vp.portrait ? 300 : 260).setDepth(depth + 2);
  const font = { fontFamily: app.theme.font, resolution: app.textResolution };
  const head = scene.add
    .text(cx, cy - (vp.portrait ? 270 : 230), title.toUpperCase(), { ...font, fontStyle: '900', fontSize: vp.portrait ? 92 : 84, color: css })
    .setOrigin(0.5)
    .setDepth(depth + 3)
    .setStroke('#05040f', 14)
    .setShadow(0, 0, css, 24, true, true);
  const name = scene.add
    .text(cx, cy + (vp.portrait ? 220 : 185), subtitle, { ...font, fontStyle: '900', fontSize: 52, color: '#ffffff' })
    .setOrigin(0.5)
    .setDepth(depth + 3)
    .setStroke('#05040f', 10);
  const chance = scene.add
    .text(cx, name.y + 78, odds, { ...font, fontStyle: '900', fontSize: 64, color: css })
    .setOrigin(0.5)
    .setDepth(depth + 3)
    .setStroke('#05040f', 12);
  const parts = [dim, rays, big, head, name, chance];

  head.setScale(2.2).setAlpha(0);
  scene.tweens.add({ targets: head, scale: 1, alpha: 1, duration: 380, ease: 'Back.Out' });
  big.pop(80);
  for (const t of [name, chance]) {
    t.setAlpha(0);
    scene.tweens.add({ targets: t, alpha: 1, y: t.y - 12, duration: 300, delay: 260 });
  }
  scene.tweens.add({ targets: rays, angle: 40, duration: 2600 });
  burst(scene, cx, cy, color, 40, 640);
  scene.cameras.main.flash(180, (color >> 16) & 255, (color >> 8) & 255, color & 255, false);
  app.audio.play('reveal');
  app.audio.duckMusic(0.35, 2);
  app.haptic(40);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    scene.tweens.add({
      targets: parts,
      alpha: 0,
      duration: 220,
      onComplete: () => {
        parts.forEach((p) => p.destroy());
        onDone?.();
      },
    });
  };
  dim.on('pointerdown', close);
  scene.time.delayedCall(2500, close);
}
