import Phaser from 'phaser';
import { app, Button, formatNumber, Panel, type icons } from '@core';
import { crystalIcon } from '../render/icons';
import { save } from '../save';

export interface MenuEntry {
  label: string;
  icon?: icons.IconDraw;
  onClick: () => void;
  /** Red dot: something waits there (the daily gift). */
  badge?: boolean;
}

/** List of places to go, with the crystal balance on top. Each entry closes the menu first. */
export function showGameMenu(scene: Phaser.Scene, entries: MenuEntry[], onClose?: () => void): Panel {
  const rowH = 92;
  const panel = new Panel(scene, { title: app.t('menu.title'), width: 560, height: 120 + 64 + entries.length * rowH + 30, onClose });
  const font = { fontFamily: app.theme.font, resolution: app.textResolution };
  // Crystals.
  const gem = scene.add.graphics();
  crystalIcon(gem, 34, 0x7fe8ff);
  const amount = scene.add.text(0, 0, app.t('menu.crystals', { n: formatNumber(save.data.crystals) }), { ...font, fontStyle: '900', fontSize: 28, color: '#bff4ff' }).setOrigin(0, 0.5);
  const w = 34 + 12 + amount.width;
  const y0 = panel.top - 6;
  gem.setPosition(-w / 2 + 17, y0);
  amount.setPosition(-w / 2 + 46, y0);
  panel.content.add([gem, amount]);

  entries.forEach((e, i) => {
    const y = panel.top + 56 + rowH / 2 + i * rowH;
    const b = new Button(scene, 0, y, {
      label: e.label,
      icon: e.icon,
      width: 440,
      height: 76,
      fontSize: 30,
      color: app.theme.surface,
      textColor: app.theme.surfaceText,
      onClick: () => {
        panel.close();
        e.onClick();
      },
    });
    const ring = scene.add.graphics();
    ring.lineStyle(3, 0xffffff, 0.22);
    ring.strokeRoundedRect(-220, y - 38, 440, 76, app.theme.radius);
    panel.content.add([ring, b]);
    if (e.badge) {
      const dot = scene.add.graphics();
      dot.fillStyle(0xff5a6e, 1);
      dot.fillCircle(206, y - 30, 11);
      dot.lineStyle(3, 0xffffff, 1);
      dot.strokeCircle(206, y - 30, 11);
      panel.content.add(dot);
    }
  });
  return panel;
}
