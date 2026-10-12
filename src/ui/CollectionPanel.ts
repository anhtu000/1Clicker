import Phaser from 'phaser';
import { app, Button, formatNumber, Panel } from '@core';
import type { Content } from '../logic/content.ts';
import { ensureBodyTexture, ensureSpecialTexture } from '../render/bodies';
import { RARITY_CSS } from '../render/palette';

// Collection screen (CLAUDE.md 4.4, 4b): every body by tier and rarity, the drop odds,
// the pity counters, and the hidden bodies with light hints.

export interface CollectionData {
  content: Content;
  /** codex.found: "tier.rarity" or "s.<id>.<rarity>" -> times seen. */
  found: Record<string, number>;
  /** Chance of each rarity on one roll, with the player's luck. */
  odds: number[];
  /** Rolls left before each pity rule kicks in. */
  pity: { rarity: number; left: number }[];
  /** Energy bonus from discoveries, e.g. 0.34 = +34%. */
  bonus: number;
}

/** Opens the collection. onClose runs when it closes. */
export function showCollection(scene: Phaser.Scene, data: CollectionData, onClose?: () => void): Panel {
  const vp = app.viewport.info;
  const wide = !vp.portrait;
  const panel = new Panel(scene, {
    title: app.t('collection.title'),
    width: wide ? 1160 : 700,
    height: wide ? vp.height - 60 : vp.height - 80,
    onClose,
  });
  const font = { fontFamily: app.theme.font, resolution: app.textResolution };
  const { content, found } = data;
  const tiers = content.tiers.length;
  const rarities = content.rarities.length;
  const bodiesFound = Object.keys(found).filter((k) => !k.startsWith('s.')).length;
  const hiddenFound = Object.keys(found).filter((k) => k.startsWith('s.')).length;
  const W = panel.panelWidth;
  const top = panel.top;

  // Tabs: bodies and hidden ones.
  const tabW = Math.min(300, (W - 80) / 2);
  const grid = scene.add.container(0, 0);
  panel.content.add(grid);
  const tabs: Button[] = [];
  const makeTab = (i: number, label: string) => {
    const b = new Button(scene, (i === 0 ? -1 : 1) * (tabW / 2 + 8), top + 14, {
      label,
      width: tabW,
      height: 60,
      fontSize: 26,
      color: app.theme.surface,
      textColor: app.theme.surfaceText,
      onClick: () => show(i),
    });
    tabs.push(b);
    panel.content.add(b);
  };
  makeTab(0, app.t('collection.bodies', { n: bodiesFound, total: tiers * rarities }));
  makeTab(1, app.t('collection.hidden', { n: hiddenFound, total: content.specials.length * rarities }));

  const areaTop = top + 54;
  // The footer takes three lines on a phone.
  const areaBottom = panel.bottom - (wide ? 70 : 96);

  const rarityLabel = (r: number) => app.t(`rarity.${content.rarities[r].id}`);
  const oddsLabel = (r: number) => app.t('collection.odds', { n: formatNumber(Math.max(1, Math.round(1 / Math.max(1e-9, data.odds[r])))) });

  /** A cell: the body if found, else a dark silhouette (or a question mark for hidden ones). */
  const cell = (x: number, y: number, size: number, key: string | null, isFound: boolean, mystery: boolean) => {
    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, isFound ? 0.28 : 0.18);
    bg.fillRoundedRect(x - size / 2 + 3, y - size / 2 + 3, size - 6, size - 6, size * 0.18);
    grid.add(bg);
    if (key && (isFound || !mystery)) {
      const img = scene.add.image(x, y, key).setScale(((size - 8) / 192) * 1.25);
      if (!isFound) img.setTint(0x231f47).setAlpha(0.75);
      grid.add(img);
    } else {
      grid.add(scene.add.text(x, y, '?', { ...font, fontStyle: '900', fontSize: Math.round(size * 0.45), color: '#5a5394' }).setOrigin(0.5));
    }
  };

  const showBodies = () => {
    const rowLabelW = wide ? 190 : 0;
    if (wide) {
      // Rows: rarities (with odds). Columns: tiers.
      const size = Math.min(92, (W - 60 - rowLabelW) / tiers, (areaBottom - areaTop - 20) / rarities);
      const gx = -W / 2 + 30 + rowLabelW;
      for (let r = 0; r < rarities; r++) {
        const y = areaTop + 10 + size / 2 + r * size;
        grid.add(scene.add.text(gx - 16, y - 13, rarityLabel(r), { ...font, fontStyle: '900', fontSize: 24, color: RARITY_CSS[r] }).setOrigin(1, 0.5));
        grid.add(scene.add.text(gx - 16, y + 15, oddsLabel(r), { ...font, fontStyle: '700', fontSize: 20, color: app.theme.textDim }).setOrigin(1, 0.5));
        for (let t = 1; t <= tiers; t++) {
          const key = `${t}.${r}`;
          cell(gx + size / 2 + (t - 1) * size, y, size, ensureBodyTexture(scene, t, r), key in found, false);
        }
      }
    } else {
      // Rows: tiers. Columns: rarities (with odds on top).
      const headH = 64;
      const size = Math.min(110, (W - 60) / rarities, (areaBottom - areaTop - headH) / tiers);
      const gx = -((size * rarities) / 2);
      for (let r = 0; r < rarities; r++) {
        const x = gx + size / 2 + r * size;
        grid.add(scene.add.text(x, areaTop + 16, rarityLabel(r), { ...font, fontStyle: '900', fontSize: 20, color: RARITY_CSS[r] }).setOrigin(0.5));
        grid.add(scene.add.text(x, areaTop + 42, oddsLabel(r), { ...font, fontStyle: '700', fontSize: 18, color: app.theme.textDim }).setOrigin(0.5));
      }
      for (let t = 1; t <= tiers; t++) {
        const y = areaTop + headH + size / 2 + (t - 1) * size;
        for (let r = 0; r < rarities; r++) {
          cell(gx + size / 2 + r * size, y, size, ensureBodyTexture(scene, t, r), `${t}.${r}` in found, false);
        }
      }
    }
    // Footer: discovery bonus and pity.
    const pity = data.pity.map((p) => app.t('collection.pity', { rarity: rarityLabel(p.rarity), n: p.left })).join(wide ? '  ·  ' : '\n');
    const bonus = app.t('collection.bonus', { n: Math.round(data.bonus * 100) });
    grid.add(
      scene.add
        .text(0, panel.bottom - (wide ? 42 : 50), `${bonus}\n${pity}`, { ...font, fontStyle: '700', fontSize: 20, color: app.theme.textDim, align: 'center', lineSpacing: 4, wordWrap: { width: W - 40 } })
        .setOrigin(0.5, 0.5),
    );
  };

  const showHidden = () => {
    const specials = content.specials;
    grid.add(
      scene.add
        .text(0, areaTop + 22, app.t('special.rowHint'), { ...font, fontStyle: '700', fontSize: 22, color: '#ffd166', align: 'center', wordWrap: { width: W - 80 } })
        .setOrigin(0.5),
    );
    const labelW = wide ? 280 : 0;
    const headH = wide ? 60 : 76;
    const rowsTop = areaTop + headH + (wide ? 0 : 30);
    const perRow = wide ? 1 : 1.5; // a phone row also carries its name/hint line above the cells
    const size = Math.min(wide ? 92 : 104, (W - 60 - labelW) / rarities, (areaBottom - rowsTop) / (specials.length * perRow));
    const gx = wide ? -W / 2 + 30 + labelW : -((size * rarities) / 2);
    if (!wide) {
      for (let r = 0; r < rarities; r++) {
        grid.add(scene.add.text(gx + size / 2 + r * size, rowsTop - 16, rarityLabel(r), { ...font, fontStyle: '900', fontSize: 18, color: RARITY_CSS[r] }).setOrigin(0.5));
      }
    }
    specials.forEach((sp, i) => {
      const any = Object.keys(found).some((k) => k.startsWith(`s.${sp.id}.`));
      const title = any ? app.t(`special.${sp.id}.name`) : '???';
      const hint = app.t(`special.${sp.id}.hint`);
      const rowH = size * perRow;
      const y = rowsTop + i * rowH + (wide ? size / 2 : size * 0.5 + 30);
      if (wide) {
        grid.add(scene.add.text(gx - 16, y - 13, title, { ...font, fontStyle: '900', fontSize: 24, color: any ? '#ffd166' : '#8d86c4' }).setOrigin(1, 0.5));
        grid.add(scene.add.text(gx - 16, y + 15, hint, { ...font, fontStyle: '700', fontSize: 20, color: app.theme.textDim }).setOrigin(1, 0.5));
      } else {
        grid.add(scene.add.text(0, y - size / 2 - 16, `${title}  ·  ${hint}`, { ...font, fontStyle: '900', fontSize: 20, color: any ? '#ffd166' : '#8d86c4' }).setOrigin(0.5));
      }
      for (let r = 0; r < rarities; r++) {
        const isFound = `s.${sp.id}.${r}` in found;
        cell(gx + size / 2 + r * size, y, size, ensureSpecialTexture(scene, sp.id, sp.tier, r), isFound, !any);
      }
    });
  };

  const show = (i: number) => {
    grid.removeAll(true);
    tabs.forEach((t, k) => t.setColor(k === i ? app.theme.primary : app.theme.surface, k === i ? app.theme.primaryText : app.theme.surfaceText));
    if (i === 0) showBodies();
    else showHidden();
  };
  show(0);
  return panel;
}
