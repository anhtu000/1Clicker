import Phaser from 'phaser';
import { app, formatNumber, punch, rewardButton, type Button } from '@core';
import type { UpgradeDef } from '../logic/content.ts';
import type { Run } from '../logic/run.ts';
import { ENERGY_COLOR, energyIcon, UPGRADE_ICONS } from '../render/icons';

export interface UpgradeListOptions {
  run: Run;
  /** Text under the name, for example "x1.5 energy per tap". */
  describe: (u: UpgradeDef) => string;
  onBuy: (id: string) => void;
  /** Rewarded "free upgrade" for the card that shows it. */
  onFree: (id: string) => void;
  freeCooldown: () => number;
}

interface Card {
  id: string;
  box: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Graphics;
  icon: Phaser.GameObjects.Graphics;
  name: Phaser.GameObjects.Text;
  desc: Phaser.GameObjects.Text;
  cost: Phaser.GameObjects.Text;
  coin: Phaser.GameObjects.Graphics;
  level: Phaser.GameObjects.Text;
  state: string;
}

/**
 * The shop, always on screen and never over the board (CLAUDE.md 4.2):
 * a horizontal strip under the board on phones, a column on the right on desktop.
 * Cards scroll with a drag. Cheapest first, so the next purchase is always at the front.
 */
export class UpgradeList {
  private scene: Phaser.Scene;
  private opts: UpgradeListOptions;
  private cards = new Map<string, Card>();
  private order: string[] = [];
  private zone: Phaser.GameObjects.Zone;
  private free: Button;
  private freeId: string | null = null;
  private horizontal = true;
  private area = { x: 0, y: 0, w: 0, h: 0 };
  private cardW = 210;
  private cardH = 150;
  private gap = 14;
  private scroll = 0;
  private velocity = 0;
  private dragStart: { pos: number; scroll: number } | null = null;
  /** True while the finger is scrolling, so the card under it does not get bought. */
  private scrolled = false;

  constructor(scene: Phaser.Scene, options: UpgradeListOptions) {
    this.scene = scene;
    this.opts = options;
    // Drag-to-scroll area, behind the cards.
    this.zone = scene.add.zone(0, 0, 10, 10).setOrigin(0).setDepth(19).setInteractive();
    this.zone.on('pointerdown', (p: Phaser.Input.Pointer) => this.startDrag(p));
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => this.moveDrag(p));
    scene.input.on('pointerup', () => this.endDrag());
    this.free = rewardButton(scene, 0, 0, {
      label: app.t('shop.free'),
      width: 150,
      height: 64,
      fontSize: 26,
      cooldown: options.freeCooldown,
      onReward: () => {
        if (this.freeId) options.onFree(this.freeId);
      },
    });
    this.free.setDepth(25);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this));
  }

  /** Strip (horizontal) or column, inside this rectangle (top-left x, y). */
  layout(x: number, y: number, w: number, h: number, horizontal: boolean) {
    this.area = { x, y, w, h };
    this.horizontal = horizontal;
    if (horizontal) {
      this.cardH = h;
      this.cardW = Math.min(230, Math.max(190, w / 3.3));
    } else {
      this.cardW = w;
      this.cardH = 116;
    }
    this.zone.setPosition(x, y).setSize(w, h);
    (this.zone.input!.hitArea as Phaser.Geom.Rectangle).setSize(w, h);
    for (const card of this.cards.values()) this.drawCard(card, true);
    this.refresh(true);
  }

  /** Card rectangle for tutorial targets, or null if the card is not shown. */
  cardRect(id: string) {
    const card = this.cards.get(id);
    if (!card || !card.box.visible) return null;
    return { x: card.box.x, y: card.box.y, w: this.cardW, h: this.cardH };
  }

  /** Scrolls so this card is in view. */
  reveal(id: string) {
    const i = this.order.indexOf(id);
    if (i < 0) return;
    this.scroll = Phaser.Math.Clamp(i * (this.span + this.gap) - this.gap, 0, this.maxScroll());
  }

  private get span() {
    return this.horizontal ? this.cardW : this.cardH;
  }

  private get length() {
    return this.horizontal ? this.area.w : this.area.h;
  }

  private maxScroll() {
    const content = this.order.length * (this.span + this.gap) - this.gap;
    return Math.max(0, content - this.length + this.gap * 2);
  }

  private startDrag(p: Phaser.Input.Pointer) {
    this.dragStart = { pos: this.horizontal ? p.x : p.y, scroll: this.scroll };
    this.scrolled = false;
    this.velocity = 0;
  }

  private moveDrag(p: Phaser.Input.Pointer) {
    if (!this.dragStart || !p.isDown) return;
    const pos = this.horizontal ? p.x : p.y;
    const moved = this.dragStart.pos - pos;
    // Pointer x/y are in screen pixels; convert to design units.
    const units = moved / app.viewport.info.scale;
    if (Math.abs(units) > 12) this.scrolled = true;
    if (this.scrolled) {
      const next = Phaser.Math.Clamp(this.dragStart.scroll + units, -40, this.maxScroll() + 40);
      this.velocity = next - this.scroll;
      this.scroll = next;
    }
  }

  private endDrag() {
    this.dragStart = null;
    // Let the click handler of a card see `scrolled` first.
    this.scene.time.delayedCall(0, () => (this.scrolled = false));
  }

  private makeCard(id: string): Card {
    const s = this.scene;
    const theme = app.theme;
    const font = { fontFamily: theme.font, resolution: app.textResolution };
    const bg = s.add.graphics();
    const icon = s.add.graphics();
    const name = s.add.text(0, 0, app.t(`upgrade.${id}.name`), { ...font, fontStyle: '900', fontSize: 26, color: theme.text });
    const desc = s.add.text(0, 0, '', { ...font, fontStyle: '700', fontSize: 22, color: theme.textDim });
    const coin = s.add.graphics();
    const cost = s.add.text(0, 0, '', { ...font, fontStyle: '900', fontSize: 28, color: '#ffd166' });
    const level = s.add.text(0, 0, '', { ...font, fontStyle: '900', fontSize: 20, color: theme.textDim });
    const box = s.add.container(0, 0, [bg, icon, name, desc, coin, cost, level]).setDepth(20);
    box.setSize(this.cardW, this.cardH);
    box.setInteractive({ useHandCursor: true });
    box.on('pointerup', () => {
      if (this.scrolled) return;
      const u = this.opts.run.upgrade(id);
      if (this.opts.run.canBuy(id)) {
        this.opts.onBuy(id);
        punch(s, box, 0.08);
      } else if (!this.opts.run.isMaxed(u)) {
        // Not enough energy: a small shake says so without a popup.
        s.tweens.add({ targets: box, x: box.x + 8, duration: 50, yoyo: true, repeat: 2 });
      }
    });
    const card: Card = { id, box, bg, icon, name, desc, cost, coin, level, state: '' };
    this.cards.set(id, card);
    return card;
  }

  private drawCard(card: Card, force = false) {
    const run = this.opts.run;
    const u = run.upgrade(card.id);
    const maxed = run.isMaxed(u);
    const price = maxed ? 0 : run.upgradeCost(u);
    const affordable = !maxed && run.s.energy >= price;
    const state = `${run.level(card.id)}|${maxed}|${affordable}|${this.cardW}|${this.cardH}`;
    if (!force && state === card.state) return;
    card.state = state;
    const w = this.cardW;
    const h = this.cardH;
    const g = card.bg;
    g.clear();
    g.fillStyle(affordable ? 0x2b2463 : 0x16143a, 0.95);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 20);
    g.lineStyle(3, affordable ? 0xffc23d : 0x3a3478, affordable ? 1 : 0.8);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 20);
    card.box.setSize(w, h);
    (card.box.input!.hitArea as Phaser.Geom.Rectangle).setTo(0, 0, w, h);
    const iconColor = affordable ? 0xffd166 : 0x9f97d9;
    card.icon.clear();
    (UPGRADE_ICONS[card.id] ?? UPGRADE_ICONS.focus)(card.icon, this.horizontal ? 42 : 46, iconColor);
    card.desc.setText(this.opts.describe(u));
    card.level.setText(maxed ? app.t('shop.max') : app.t('shop.level', { n: run.level(card.id) }));
    card.cost.setText(maxed ? '' : formatNumber(price));
    card.cost.setColor(affordable ? '#ffd166' : '#8d86c4');
    card.coin.clear();
    if (!maxed) energyIcon(card.coin, 24, affordable ? ENERGY_COLOR : 0x6d66a8);
    card.box.setAlpha(maxed ? 0.6 : 1);
    if (this.horizontal) {
      // Icon top-left, level top-right; name, effect and price below.
      card.icon.setPosition(-w / 2 + 34, -h / 2 + 34);
      card.level.setOrigin(1, 0).setPosition(w / 2 - 14, -h / 2 + 12);
      card.name.setOrigin(0, 0.5).setPosition(-w / 2 + 14, -h / 2 + 70).setFontSize(27);
      card.desc.setOrigin(0, 0).setPosition(-w / 2 + 14, -h / 2 + 88).setFontSize(22);
      card.desc.setWordWrapWidth(w - 28, true);
      card.coin.setPosition(-w / 2 + 28, h / 2 - 24);
      card.cost.setOrigin(0, 0.5).setPosition(-w / 2 + 48, h / 2 - 24).setFontSize(30);
    } else {
      card.icon.setPosition(-w / 2 + 44, 0);
      card.level.setOrigin(1, 0).setPosition(w / 2 - 14, -h / 2 + 10);
      card.name.setOrigin(0, 0.5).setPosition(-w / 2 + 86, -h / 2 + 30).setFontSize(26);
      card.desc.setOrigin(0, 0.5).setPosition(-w / 2 + 86, 0).setFontSize(21);
      // One line in the column: shrink instead of wrapping.
      card.desc.setWordWrapWidth(null as unknown as number);
      card.coin.setPosition(-w / 2 + 98, h / 2 - 28);
      card.cost.setOrigin(0, 0.5).setPosition(-w / 2 + 116, h / 2 - 28);
    }
    // Long names shrink to fit (clear of the level badge).
    const room = this.horizontal ? w - 28 : w - 100 - card.level.width - 10;
    card.name.setScale(card.name.width > room ? room / card.name.width : 1);
    const descRoom = this.horizontal ? Infinity : w - 100;
    card.desc.setScale(card.desc.width > descRoom ? descRoom / card.desc.width : 1);
  }

  /** Re-reads the run: new cards appear, order follows price, states follow energy. */
  refresh(force = false) {
    const run = this.opts.run;
    const visible = run.content.upgrades.filter((u) => run.isVisible(u));
    const price = (u: UpgradeDef) => (run.isMaxed(u) ? Infinity : run.upgradeCost(u));
    visible.sort((a, b) => price(a) - price(b));
    const ids = visible.map((u) => u.id);
    const changed = force || ids.join() !== this.order.join();
    this.order = ids;
    for (const id of ids) {
      const card = this.cards.get(id) ?? this.makeCard(id);
      this.drawCard(card, force || changed);
    }
    this.freeId = run.freeUpgradeTarget();
  }

  private tick(_t: number, delta: number) {
    // Inertia after a flick, and a soft pull back inside the bounds.
    if (!this.dragStart) {
      this.scroll += this.velocity;
      this.velocity *= Math.pow(0.88, delta / 16.7);
      const max = this.maxScroll();
      if (this.scroll < 0) this.scroll += (0 - this.scroll) * 0.2;
      if (this.scroll > max) this.scroll += (max - this.scroll) * 0.2;
    }
    const { x, y, w, h } = this.area;
    this.order.forEach((id, i) => {
      const card = this.cards.get(id)!;
      const offset = this.gap + i * (this.span + this.gap) - this.scroll;
      if (this.horizontal) card.box.setPosition(x + offset + this.cardW / 2, y + h / 2);
      else card.box.setPosition(x + w / 2, y + offset + this.cardH / 2);
      const inside = this.horizontal ? offset > -this.cardW && offset < w : offset > -this.cardH && offset < h;
      card.box.setVisible(inside);
    });
    // The free badge sits on its card's corner.
    const target = this.freeId ? this.cards.get(this.freeId) : null;
    // Shown only when it can be used: a countdown on a card is clutter.
    const showFree = !!target && target.box.visible && app.ads.rewardedAvailable && !app.clean && this.opts.freeCooldown() <= 0;
    this.free.setVisible(showFree);
    if (target && showFree) this.free.setPosition(target.box.x + this.cardW / 2 - 70, target.box.y - this.cardH / 2 + 4);
  }
}
