import Phaser from 'phaser';
import { app, formatClock, Panel } from '@core';
import { content } from '../game/content';
import { RARITY_CSS } from '../render/palette';
import { save } from '../save';

/** Rows of the records board, from y (relative to the panel center). Returns the height used. */
export function drawRecords(scene: Phaser.Scene, panel: Panel, y: number, highlight: number | null): number {
  const font = { fontFamily: app.theme.font, resolution: app.textResolution };
  const list = save.data.records;
  const W = panel.panelWidth - 72;
  const rowH = 52;
  if (!list.length) {
    const empty = scene.add
      .text(0, y + 30, app.t('finish.noRecords'), { ...font, fontStyle: '700', fontSize: 26, color: app.theme.textDim, align: 'center', wordWrap: { width: W } })
      .setOrigin(0.5);
    panel.content.add(empty);
    return 70;
  }
  list.forEach((r, i) => {
    const cy = y + rowH / 2 + i * rowH;
    const mine = highlight === i + 1;
    const bg = scene.add.graphics();
    bg.fillStyle(mine ? 0xffc23d : 0x000000, mine ? 0.2 : i % 2 ? 0.12 : 0.22);
    bg.fillRoundedRect(-W / 2, cy - rowH / 2 + 3, W, rowH - 6, 12);
    const color = mine ? '#ffd166' : '#ffffff';
    const rank = scene.add.text(-W / 2 + 18, cy, `#${i + 1}`, { ...font, fontStyle: '900', fontSize: 26, color: app.theme.textDim }).setOrigin(0, 0.5);
    const time = scene.add.text(-W / 2 + 82, cy, formatClock(r.ms / 1000), { ...font, fontStyle: '900', fontSize: 28, color }).setOrigin(0, 0.5);
    const rarity = scene.add
      .text(W * 0.06, cy, app.t(`rarity.${content.rarities[r.rarity]?.id ?? 'common'}`), { ...font, fontStyle: '700', fontSize: 24, color: RARITY_CSS[r.rarity] ?? '#ffffff' })
      .setOrigin(0, 0.5);
    const date = r.at ? new Date(r.at).toLocaleDateString('en', { day: 'numeric', month: 'short' }) : '';
    const when = scene.add.text(W / 2 - 18, cy, date, { ...font, fontStyle: '700', fontSize: 22, color: app.theme.textDim }).setOrigin(1, 0.5);
    panel.content.add([bg, rank, time, rarity, when]);
  });
  return list.length * rowH;
}

/** The personal records board on its own. */
export function showRecords(scene: Phaser.Scene, highlight: number | null, onClose?: () => void): Panel {
  const rows = Math.max(1, save.data.records.length);
  const panel = new Panel(scene, { title: app.t('finish.records'), width: 600, height: 120 + rows * 52 + 80, onClose });
  drawRecords(scene, panel, panel.top - 10, highlight);
  return panel;
}
