import Phaser from 'phaser';
import { app, Button, formatNumber, Panel, rewardButton, toast } from '@core';
import { decor } from '../game/content';
import { buyDecor } from '../logic/decor.ts';
import { ensureNebulaTexture } from '../render/background';
import { DECOR_TEX, ensureDecorTexture } from '../render/decor';
import { crystalIcon } from '../render/icons';
import { save } from '../save';

export interface DecorShopOptions {
  /** The background changed. */
  onBackground: (id: string) => void;
  /** Puts an item on screen. False when there is no room. Without it (home screen), items wait for the next game. */
  showItem?: (id: string) => boolean;
  hideItem?: (id: string) => void;
  /** Opens arrange mode (in play only). */
  onArrange?: () => void;
  onClose?: () => void;
}

type Tab = 'bg' | 'planet' | 'ship';

/** Decor shop (CLAUDE.md 4b item 10): backgrounds, planets and spacecraft for crystals, and an ad for more crystals. */
export function showDecorShop(scene: Phaser.Scene, opts: DecorShopOptions): Panel {
  const vp = app.viewport.info;
  const wide = !vp.portrait;
  const panel = new Panel(scene, { title: app.t('decor.title'), width: wide ? 1160 : 700, height: wide ? vp.height - 40 : Math.min(vp.height - 80, 1240), onClose: opts.onClose });
  const font = { fontFamily: app.theme.font, resolution: app.textResolution };
  const W = panel.panelWidth;
  const d = save.data.decor;

  // Header: balance on the left, crystals for an ad on the right.
  const headY = panel.top + 2;
  const gem = scene.add.graphics();
  crystalIcon(gem, 40, 0x7fe8ff);
  gem.setPosition(-W / 2 + 54, headY);
  const balance = scene.add.text(-W / 2 + 84, headY, '', { ...font, fontStyle: '900', fontSize: 36, color: '#bff4ff' }).setOrigin(0, 0.5);
  const refreshBalance = () => balance.setText(formatNumber(save.data.crystals));
  refreshBalance();
  // Left of the close button, which sits in the top-right corner.
  const ad = rewardButton(scene, W / 2 - 270, headY, {
    label: app.t('decor.watch', { n: decor.ad.crystals }),
    width: 236,
    height: 72,
    fontSize: 28,
    cooldown: () => Math.max(0, (save.data.decorAdAt + decor.ad.cooldownSec * 1000 - Date.now()) / 1000),
    onReward: () => {
      save.data.crystals += decor.ad.crystals;
      save.data.decorAdAt = Date.now();
      save.flush();
      toast(scene, app.t('crystal.got', { n: decor.ad.crystals }));
      app.audio.play('reward');
      refreshBalance();
      render();
    },
  });
  panel.content.add([gem, balance, ad]);

  // Tabs.
  let tab: Tab = 'bg';
  const tabIds: Tab[] = ['bg', 'planet', 'ship'];
  const tabLabels = [app.t('decor.backgrounds'), app.t('decor.planets'), app.t('decor.ships')];
  const tabW = Math.min(300, (W - 60) / 3 - 10);
  const tabY = panel.top + 76;
  const tabs = tabIds.map((id, i) => {
    const b = new Button(scene, (i - 1) * (tabW + 12), tabY, {
      label: tabLabels[i],
      width: tabW,
      height: 64,
      fontSize: 26,
      color: app.theme.surface,
      textColor: app.theme.surfaceText,
      onClick: () => {
        tab = id;
        render();
      },
    });
    panel.content.add(b);
    return b;
  });

  const grid = scene.add.container(0, 0);
  panel.content.add(grid);
  const gridTop = tabY + 52;
  const gridBottom = panel.bottom - (opts.onArrange ? 120 : 70);

  if (opts.onArrange) {
    const arrange = new Button(scene, 0, panel.bottom - 64, {
      label: app.t('decor.arrange'),
      width: 300,
      height: 84,
      fontSize: 32,
      onClick: () => {
        panel.close();
        opts.onArrange!();
      },
    });
    panel.content.add(arrange);
  } else {
    panel.content.add(
      scene.add.text(0, panel.bottom - 40, app.t('decor.arrangeInGame'), { ...font, fontStyle: '700', fontSize: 22, color: app.theme.textDim }).setOrigin(0.5),
    );
  }

  /** Price button: gem and number. Greyed out when the player is short. */
  const priceButton = (x: number, y: number, w: number, price: number, onBuy: () => void) => {
    const b = new Button(scene, x, y, { label: formatNumber(price), icon: crystalIcon, width: w, height: 52, fontSize: 26, onClick: onBuy });
    b.setEnabled(save.data.crystals >= price);
    return b;
  };

  const buy = (id: string) => {
    const left = buyDecor(decor, d, save.data.crystals, id);
    if (left === null) return;
    save.data.crystals = left;
    app.audio.play('buy');
    if (decor.backgrounds.some((b) => b.id === id)) {
      d.bg = id;
      opts.onBackground(id);
    } else if (opts.showItem) {
      if (!opts.showItem(id)) toast(scene, app.t(d.shown.length >= decor.maxShown ? 'decor.full' : 'decor.noRoom', { n: decor.maxShown }));
    } else if (d.shown.length < decor.maxShown) {
      d.shown.push(id); // placed on the next game screen
    }
    save.flush();
    refreshBalance();
    render();
  };

  const toggle = (id: string) => {
    if (d.shown.includes(id)) {
      if (opts.hideItem) opts.hideItem(id);
      else d.shown = d.shown.filter((x) => x !== id);
    } else if (d.shown.length >= decor.maxShown) {
      toast(scene, app.t('decor.full', { n: decor.maxShown }));
    } else if (opts.showItem) {
      if (!opts.showItem(id)) toast(scene, app.t('decor.noRoom'));
    } else {
      d.shown.push(id);
    }
    save.flush();
    render();
  };

  const render = () => {
    grid.removeAll(true);
    tabs.forEach((t, i) => t.setColor(tabIds[i] === tab ? app.theme.primary : app.theme.surface, tabIds[i] === tab ? app.theme.primaryText : app.theme.surfaceText));
    const list = tab === 'bg' ? decor.backgrounds.map((b) => ({ id: b.id, price: b.price })) : decor.items.filter((it) => it.kind === tab);
    // Landscape: one row per tab, so the cards stay tall enough in a 16:9 frame.
    const cols = wide ? Math.max(5, list.length) : 3;
    const rows = Math.ceil(list.length / cols);
    const gap = 14;
    const cardW = (W - 60 - gap * (cols - 1)) / cols;
    const cardH = Math.min(230, (gridBottom - gridTop - gap * (rows - 1)) / rows);
    list.forEach((entry, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const inRow = Math.min(cols, list.length - row * cols);
      const x = (col - (inRow - 1) / 2) * (cardW + gap);
      const top = gridTop + row * (cardH + gap);
      const owned = d.owned.includes(entry.id) || entry.price === 0;
      const box = scene.add.graphics();
      box.fillStyle(0x000000, 0.25);
      box.fillRoundedRect(x - cardW / 2, top, cardW, cardH, 18);
      grid.add(box);
      const art = Math.min(cardH * 0.46, cardW * 0.6);
      const artY = top + 10 + art / 2;
      if (tab === 'bg') {
        const img = scene.add.image(x, artY, ensureNebulaTexture(scene, entry.id));
        const scale = (cardW - 24) / 512;
        const cropH = Math.min(512, art / scale);
        img.setCrop(0, (512 - cropH) / 2, 512, cropH).setScale(scale);
        grid.add(img);
        if (d.bg === entry.id) {
          const ring = scene.add.graphics();
          ring.lineStyle(4, 0xffc23d, 1);
          ring.strokeRoundedRect(x - (cardW - 24) / 2, artY - art / 2, cardW - 24, art, 8);
          grid.add(ring);
        }
      } else {
        grid.add(scene.add.image(x, artY, ensureDecorTexture(scene, entry.id)).setScale(art / DECOR_TEX).setAlpha(owned ? 1 : 0.9));
      }
      const name = scene.add.text(x, top + 16 + art + 18, app.t(`decor.name.${entry.id}`), { ...font, fontStyle: '900', fontSize: 22, color: '#ffffff' }).setOrigin(0.5);
      if (name.width > cardW - 16) name.setScale((cardW - 16) / name.width);
      grid.add(name);
      const by = top + cardH - 36;
      const bw = Math.min(180, cardW - 24);
      if (!owned) {
        grid.add(priceButton(x, by, bw, entry.price, () => buy(entry.id)));
      } else if (tab === 'bg') {
        const inUse = d.bg === entry.id;
        const b = new Button(scene, x, by, {
          label: app.t(inUse ? 'decor.inUse' : 'decor.use'),
          width: bw,
          height: 52,
          fontSize: 24,
          color: inUse ? app.theme.reward : app.theme.surface,
          textColor: inUse ? app.theme.rewardText : app.theme.surfaceText,
          onClick: () => {
            if (inUse) return;
            d.bg = entry.id;
            opts.onBackground(entry.id);
            save.flush();
            render();
          },
        });
        grid.add(b);
      } else {
        const on = d.shown.includes(entry.id);
        const b = new Button(scene, x, by, {
          label: app.t(on ? 'decor.shown' : 'decor.show'),
          width: bw,
          height: 52,
          fontSize: 24,
          color: on ? app.theme.reward : app.theme.surface,
          textColor: on ? app.theme.rewardText : app.theme.surfaceText,
          onClick: () => toggle(entry.id),
        });
        grid.add(b);
      }
    });
  };
  render();
  return panel;
}
