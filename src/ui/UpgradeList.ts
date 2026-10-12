import Phaser from 'phaser';
import { app, formatCountdown, formatNumber, icons, punch, rewardButton, toast, type Button } from '@core';
import type { UpgradeDef } from '../logic/content.ts';
import type { Run } from '../logic/run.ts';
import { ENERGY_COLOR, energyIcon, UPGRADE_ICONS, type GlyphDraw } from '../render/icons';

/**
 * A rewarded boost, shown as the first card of the shop. CrazyGames does not want rewarded-ad buttons
 * in the main play area, so lucky scan, merge all and the copy offer live here (CLAUDE.md 4.5, 4b).
 */
export interface Boost {
  /** Which boost. */
  id: string;
  name: string;
  desc: string;
  icon: GlyphDraw;
  /** Seconds until it can be used; 0 = ready. While waiting the card shows a countdown. */
  wait: number;
  /** Ready, but cannot be used right now: this short reason replaces the price line (for example "Board full"). */
  blocked?: string;
  onReward: () => void;
}

export interface UpgradeListOptions {
  run: Run;
  /** Text under the name, for example "x1.5 energy per tap". */
  describe: (u: UpgradeDef) => string;
  onBuy: (id: string) => void;
  /** Rewarded "free upgrade" for the card that shows it. */
  onFree: (id: string) => void;
  freeCooldown: () => number;
  /** The boost to show first, or null for none. Read on every refresh. */
  boost?: () => Boost | null;
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

/** Id of the boost card in the list. Not an upgrade id. */
export const BOOST_CARD = '__boost';

const REWARD_TEXT = '#7ff0b8';

/**
 * The shop, always on screen and never over the board (CLAUDE.md 4.2):
 * a horizontal strip under the board on phones, a column on the right on desktop.
 * Cards scroll with a drag or the mouse wheel. Order is fixed, so a card stays put when bought;
 * the rewarded boost, when there is one, comes first.
 */
export class UpgradeList {
  private scene: Phaser.Scene;
  private opts: UpgradeListOptions;
  private cards = new Map<string, Card>();
  /** Upgrade ids shown, in upgrades.json order. */
  private order: string[] = [];
  /** What is shown, in order: the boost card (if any), then the upgrades. */
  private list: string[] = [];
  private boost: Boost | null = null;
  private boostBusy = false;
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
    this.zone.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.startDrag(p);
      this.downOn = null;
    });
    scene.input.on('pointermove', (p: Phaser.Input.Pointer) => this.moveDrag(p));
    scene.input.on('pointerup', () => this.endDrag());
    scene.input.on('wheel', (p: Phaser.Input.Pointer, _over: unknown, dx: number, dy: number) => this.wheel(p, dx, dy));
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
    this.horizontal = horizontal;
    if (horizontal) {
      this.cardH = h;
      this.cardW = Math.min(230, Math.max(190, w / 3.3));
    } else {
      this.cardW = w;
      this.cardH = 116;
      // The column ends on a card edge, so at rest it shows whole cards only.
      const n = Math.max(1, Math.floor((h - this.gap) / (this.cardH + this.gap)));
      h = n * (this.cardH + this.gap) + this.gap;
    }
    this.area = { x, y, w, h };
    this.zone.setPosition(x, y).setSize(w, h);
    (this.zone.input!.hitArea as Phaser.Geom.Rectangle).setSize(w, h);
    this.refresh(true);
  }

  /** Card rectangle for tutorial targets (an upgrade id or BOOST_CARD), or null if the card is not shown. */
  cardRect(id: string) {
    const card = this.cards.get(id);
    if (!card || !card.box.visible || !this.list.includes(id)) return null;
    return { x: card.box.x, y: card.box.y, w: this.cardW, h: this.cardH };
  }

  /** Scrolls so this card is in view. */
  reveal(id: string) {
    const i = this.list.indexOf(id);
    if (i < 0) return;
    this.scroll = Phaser.Math.Clamp(i * (this.span + this.gap) - this.gap, 0, this.maxScroll());
  }

  /** The boost on show, if any. */
  get currentBoost(): Boost | null {
    return this.boost;
  }

  private get span() {
    return this.horizontal ? this.cardW : this.cardH;
  }

  private get length() {
    return this.horizontal ? this.area.w : this.area.h;
  }

  private maxScroll() {
    const content = this.list.length * (this.span + this.gap) - this.gap;
    return Math.max(0, content - this.length + this.gap * 2);
  }

  private startDrag(p: Phaser.Input.Pointer) {
    this.dragStart = { pos: this.horizontal ? p.worldX : p.worldY, scroll: this.scroll };
    this.scrolled = false;
    this.velocity = 0;
  }

  private moveDrag(p: Phaser.Input.Pointer) {
    if (!this.dragStart || !p.isDown) return;
    // World coordinates are design units (x/y are screen pixels), so the list follows the finger 1:1.
    const pos = this.horizontal ? p.worldX : p.worldY;
    const units = this.dragStart.pos - pos;
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
    this.scene.time.delayedCall(0, () => {
      this.scrolled = false;
      this.downOn = null;
    });
  }

  /** Card the current press started on: a tap buys only when it is pressed and released on the same card. */
  private downOn: string | null = null;

  /** Mouse wheel over the shop scrolls it (desktop). */
  private wheel(p: Phaser.Input.Pointer, dx: number, dy: number) {
    const { x, y, w, h } = this.area;
    if (p.worldX < x || p.worldX > x + w || p.worldY < y || p.worldY > y + h) return;
    // One card per notch, so the settle-on-card-edge below never undoes a small wheel step.
    const delta = this.horizontal ? dx || dy : dy;
    if (!delta) return;
    const step = this.span + this.gap;
    this.velocity = 0;
    this.scroll = Phaser.Math.Clamp(this.scroll + Math.sign(delta) * step * Math.max(1, Math.round(Math.abs(delta) / 100)), 0, this.maxScroll());
  }

  private makeCard(id: string, label: string, onTap: (card: Card) => void): Card {
    const s = this.scene;
    const theme = app.theme;
    const font = { fontFamily: theme.font, resolution: app.textResolution };
    const bg = s.add.graphics();
    const icon = s.add.graphics();
    const name = s.add.text(0, 0, label, { ...font, fontStyle: '900', fontSize: 26, color: theme.text });
    const desc = s.add.text(0, 0, '', { ...font, fontStyle: '700', fontSize: 22, color: theme.textDim });
    const coin = s.add.graphics();
    const cost = s.add.text(0, 0, '', { ...font, fontStyle: '900', fontSize: 28, color: '#ffd166' });
    const level = s.add.text(0, 0, '', { ...font, fontStyle: '900', fontSize: 20, color: theme.textDim });
    const box = s.add.container(0, 0, [bg, icon, name, desc, coin, cost, level]).setDepth(20);
    box.setSize(this.cardW, this.cardH);
    box.setInteractive({ useHandCursor: true });
    const card: Card = { id, box, bg, icon, name, desc, cost, coin, level, state: '' };
    // A press on a card also starts a scroll, so the list can be dragged anywhere, not only in the gaps.
    box.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.startDrag(p);
      this.downOn = id;
    });
    box.on('pointerup', () => {
      if (!this.scrolled && this.downOn === id) onTap(card);
    });
    this.cards.set(id, card);
    return card;
  }

  private shake(card: Card) {
    // Not available right now: a small shake says so without a popup.
    this.scene.tweens.add({ targets: card.box, x: card.box.x + 8, duration: 50, yoyo: true, repeat: 2 });
  }

  private tapUpgrade(card: Card) {
    const run = this.opts.run;
    if (run.canBuy(card.id)) {
      this.opts.onBuy(card.id);
      punch(this.scene, card.box, 0.08);
    } else if (!run.isMaxed(run.upgrade(card.id))) {
      this.shake(card);
    }
  }

  private async tapBoost(card: Card) {
    const boost = this.boost;
    if (!boost || boost.wait > 0 || boost.blocked || this.boostBusy) return this.shake(card);
    this.boostBusy = true;
    const earned = await app.ads.rewarded();
    this.boostBusy = false;
    if (!card.box.active) return; // scene changed while the ad was showing
    if (earned) {
      boost.onReward();
      punch(this.scene, card.box, 0.08);
    } else {
      toast(this.scene, app.t(app.ads.lastOutcome === 'adblock' ? 'core.adBlocked' : 'core.adUnavailable'));
    }
    this.refresh(true);
  }

  /** Background, frame and positions of the parts. Shared by upgrade and boost cards. */
  private frame(card: Card, fill: number, line: number, lineAlpha: number) {
    const w = this.cardW;
    const h = this.cardH;
    const g = card.bg;
    g.clear();
    g.fillStyle(fill, 0.95);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 20);
    g.lineStyle(3, line, lineAlpha);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 20);
    card.box.setSize(w, h);
    (card.box.input!.hitArea as Phaser.Geom.Rectangle).setTo(0, 0, w, h);
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
      card.cost.setOrigin(0, 0.5).setPosition(-w / 2 + 116, h / 2 - 28).setFontSize(28);
    }
  }

  /** Long names and effects shrink to fit (clear of the level badge). */
  private fit(card: Card) {
    const w = this.cardW;
    const room = this.horizontal ? w - 28 : w - 100 - card.level.width - 10;
    card.name.setScale(1);
    card.name.setScale(card.name.width > room ? room / card.name.width : 1);
    const descRoom = this.horizontal ? Infinity : w - 100;
    card.desc.setScale(1);
    card.desc.setScale(card.desc.width > descRoom ? descRoom / card.desc.width : 1);
  }

  private drawCard(card: Card, force = false) {
    const run = this.opts.run;
    const u = run.upgrade(card.id);
    const maxed = run.isMaxed(u);
    const price = maxed ? 0 : run.upgradeCost(u);
    const affordable = !maxed && run.s.energy >= price;
    const state = `${run.level(card.id)}|${maxed}|${affordable}|${this.cardW}|${this.cardH}|${this.horizontal}`;
    if (!force && state === card.state) return;
    card.state = state;
    this.frame(card, affordable ? 0x2b2463 : 0x16143a, affordable ? 0xffc23d : 0x3a3478, affordable ? 1 : 0.8);
    const iconColor = affordable ? 0xffd166 : 0x9f97d9;
    card.icon.clear();
    (UPGRADE_ICONS[card.id] ?? UPGRADE_ICONS.focus)(card.icon, this.horizontal ? 42 : 46, iconColor);
    card.desc.setText(this.opts.describe(u));
    // A level cap that lifts after the Galaxy shows the level, not MAX: there is more to come.
    card.level.setText(maxed && !run.waitsForGoal(u) ? app.t('shop.max') : app.t('shop.level', { n: run.level(card.id) }));
    card.cost.setText(maxed ? '' : formatNumber(price));
    card.cost.setColor(affordable ? '#ffd166' : '#8d86c4');
    card.coin.clear();
    if (!maxed) energyIcon(card.coin, 24, affordable ? ENERGY_COLOR : 0x6d66a8);
    this.fit(card);
  }

  private drawBoost(card: Card, boost: Boost, force = false) {
    const ready = boost.wait <= 0 && !boost.blocked;
    const status = boost.blocked ?? (boost.wait > 0 ? app.t('core.readyIn', { t: formatCountdown(boost.wait) }) : app.t('shop.free'));
    const state = `${boost.id}|${boost.name}|${boost.desc}|${ready}|${status}|${this.cardW}|${this.cardH}|${this.horizontal}`;
    if (!force && state === card.state) return;
    card.state = state;
    const reward = app.theme.reward;
    this.frame(card, ready ? 0x113a31 : 0x16143a, ready ? reward : 0x2f6b55, ready ? 1 : 0.8);
    card.icon.clear();
    boost.icon(card.icon, this.horizontal ? 42 : 46, ready ? 0x7ff0b8 : 0x5f9c86);
    card.name.setText(boost.name);
    card.desc.setText(boost.desc);
    card.level.setText('');
    // Video icon before the status line: this card plays a rewarded ad (CrazyGames asks for a clear marker).
    card.coin.clear();
    icons.videoIcon(card.coin, 30, ready ? 0x7ff0b8 : 0x5f9c86);
    card.cost.setText(status);
    card.cost.setColor(ready ? REWARD_TEXT : '#8fb8a8');
    card.cost.setScale(1);
    const costRoom = this.cardW - (this.horizontal ? 62 : 130);
    if (card.cost.width > costRoom) card.cost.setScale(costRoom / card.cost.width);
    this.fit(card);
  }

  /** Re-reads the run: new cards appear, order follows price, states follow energy. */
  refresh(force = false) {
    const run = this.opts.run;
    // Fixed order (upgrades.json): buying only raises the level, the card never moves under the finger.
    // New upgrades slot into their place as they unlock.
    const ids = run.content.upgrades.filter((u) => run.isVisible(u)).map((u) => u.id);
    const changed = force || ids.join() !== this.order.join();
    this.order = ids;
    for (const id of ids) {
      const card = this.cards.get(id) ?? this.makeCard(id, app.t(`upgrade.${id}.name`), (c) => this.tapUpgrade(c));
      this.drawCard(card, force || changed);
    }

    this.boost = this.opts.boost?.() ?? null;
    const boostCard = this.cards.get(BOOST_CARD) ?? (this.boost ? this.makeCard(BOOST_CARD, '', (c) => this.tapBoost(c)) : null);
    if (this.boost && boostCard) this.drawBoost(boostCard, this.boost, force);
    boostCard?.box.setVisible(!!this.boost);
    this.list = this.boost ? [BOOST_CARD, ...ids] : ids;
    this.freeId = run.freeUpgradeTarget();
  }

  /** Normal opacity of a card: maxed upgrades are dimmed. */
  private cardAlpha(id: string) {
    if (id === BOOST_CARD) return 1;
    return this.opts.run.isMaxed(this.opts.run.upgrade(id)) ? 0.6 : 1;
  }

  private tick(_t: number, delta: number) {
    // Inertia after a flick, and a soft pull back inside the bounds.
    if (!this.dragStart) {
      this.scroll += this.velocity;
      this.velocity *= Math.pow(0.88, delta / 16.7);
      const max = this.maxScroll();
      if (this.scroll < 0) this.scroll += (0 - this.scroll) * 0.2;
      else if (this.scroll > max) this.scroll += (max - this.scroll) * 0.2;
      else if (Math.abs(this.velocity) < 1) {
        // Settle on a card edge once the flick slows down.
        const step = this.span + this.gap;
        const target = Phaser.Math.Clamp(Math.round(this.scroll / step) * step, 0, max);
        this.scroll += (target - this.scroll) * 0.2;
        if (Math.abs(target - this.scroll) < 0.5) this.scroll = target;
      }
    }
    const { x, y, w, h } = this.area;
    this.list.forEach((id, i) => {
      const card = this.cards.get(id)!;
      const offset = this.gap + i * (this.span + this.gap) - this.scroll;
      if (this.horizontal) {
        // The strip spans the screen width, so the screen edge clips it.
        card.box.setPosition(x + offset + this.cardW / 2, y + h / 2);
        card.box.setVisible(offset > -this.cardW && offset < w).setAlpha(this.cardAlpha(id));
      } else {
        // The column has buttons above it: cards scrolled past its ends fade out instead of
        // drawing over them (there is no clipping mask).
        card.box.setPosition(x + w / 2, y + offset + this.cardH / 2);
        const over = Math.max(0, -offset, offset + this.cardH - h);
        const fade = Phaser.Math.Clamp(1 - over / (this.cardH * 0.5), 0, 1);
        card.box.setVisible(fade > 0.02).setAlpha(this.cardAlpha(id) * fade);
      }
    });
    // The free badge sits on its card's corner.
    const target = this.freeId ? this.cards.get(this.freeId) : null;
    // Shown only when it can be used: a countdown on a card is clutter.
    const fullyShown = !!target && target.box.visible && target.box.alpha >= this.cardAlpha(target.id) - 0.01;
    const showFree = fullyShown && app.ads.rewardedAvailable && !app.clean && this.opts.freeCooldown() <= 0;
    this.free.setVisible(showFree);
    if (target && showFree) this.free.setPosition(target.box.x + this.cardW / 2 - 70, target.box.y - this.cardH / 2 + 4);
  }
}
