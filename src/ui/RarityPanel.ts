import Phaser from 'phaser';
import { app, Button, Panel } from '@core';
import { content } from '../game/content';
import { BODY_SIZE, ensureAuraTexture, ensureBodyTexture, TIER_SCALE } from '../render/bodies';
import { ENERGY_COLOR, energyIcon } from '../render/icons';
import { RARITY_CSS } from '../render/palette';

/**
 * After the first merge (user request 12/10): well done, the body just made in all five rarities,
 * and why rarity matters (rarer bodies give more energy, so more scans). Energy is shown as icons, not numbers.
 */
export function showRarities(scene: Phaser.Scene, tier: number, onClose: () => void): Panel {
  const vp = app.viewport.info;
  const wide = !vp.portrait;
  const panel = new Panel(scene, { title: app.t('rarities.title'), width: wide ? 960 : 660, height: wide ? 640 : 740, closable: false, onClose });
  const font = { fontFamily: app.theme.font, resolution: app.textResolution };
  const W = panel.panelWidth;
  const name = app.t(`tier.${content.tiers[tier - 1].id}`);

  const intro = scene.add
    .text(0, panel.top + 4, app.t('rarities.intro', { name, n: content.rarities.length }), {
      ...font,
      fontStyle: '900',
      fontSize: 30,
      color: app.theme.surfaceText,
      align: 'center',
      wordWrap: { width: W - 80 },
    })
    .setOrigin(0.5);
  panel.content.add(intro);

  // One column per rarity: the body, its name in the rarity color, and energy icons (one more each step up).
  const n = content.rarities.length;
  const colW = (W - 40) / n;
  const art = wide ? 120 : Math.min(150, colW + 10);
  const bodyY = panel.top + 70 + art / 2;
  // Small tiers are drawn small inside their texture: scale them up so every column shows a clear body.
  const scale = (art / (BODY_SIZE * 0.66 * TIER_SCALE[tier - 1])) * 0.8;
  content.rarities.forEach((rarity, i) => {
    const x = -W / 2 + 20 + colW * (i + 0.5);
    if (i > 0) {
      const glow = scene.add.image(x, bodyY, ensureAuraTexture(scene, i)).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.55).setScale((art / BODY_SIZE) * 1.1);
      panel.content.add(glow);
    }
    const img = scene.add.image(x, bodyY, ensureBodyTexture(scene, tier, i)).setScale(scale);
    scene.tweens.add({ targets: img, angle: 360, duration: 26000 - i * 2500, repeat: -1 });
    const label = scene.add
      .text(x, bodyY + art / 2 + 22, app.t(`rarity.${rarity.id}`), { ...font, fontStyle: '900', fontSize: 24, color: RARITY_CSS[i] })
      .setOrigin(0.5);
    if (label.width > colW - 6) label.setScale((colW - 6) / label.width);
    panel.content.add([img, label]);
    const size = 18;
    const gap = 3;
    const rowW = (i + 1) * size + i * gap;
    for (let k = 0; k <= i; k++) {
      const g = scene.add.graphics();
      energyIcon(g, size, ENERGY_COLOR);
      g.setPosition(x - rowW / 2 + size / 2 + k * (size + gap), bodyY + art / 2 + 58);
      panel.content.add(g);
    }
  });

  const textY = bodyY + art / 2 + 96;
  const text = scene.add
    .text(0, textY, app.t('rarities.text'), {
      ...font,
      fontStyle: '700',
      fontSize: 28,
      color: app.theme.surfaceText,
      align: 'center',
      wordWrap: { width: W - 90 },
      lineSpacing: 6,
    })
    .setOrigin(0.5, 0);
  const ok = new Button(scene, 0, panel.bottom - 80, { label: app.t('rarities.ok'), width: 280, height: 96, fontSize: 34, onClick: () => panel.close() });
  panel.content.add([text, ok]);
  return panel;
}
