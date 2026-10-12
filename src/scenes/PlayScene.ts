import Phaser from 'phaser';
import {
  app,
  BaseScene,
  Button,
  burst,
  FixedStep,
  floatText,
  formatClock,
  formatDuration,
  formatNumber,
  icons,
  Panel,
  secondsAway,
  showOfflinePanel,
  rewardButton,
  soundButton,
  toast,
  Tutorial,
  type TutorialStep,
  type ViewportInfo,
} from '@core';
import { content } from '../game/content';
import { addRecord } from '../logic/records.ts';
import { isSpecialKey, newRunState, Run, type Body, type MergeResult, type NewBody } from '../logic/run.ts';
import type { SpecialDef, UpgradeDef } from '../logic/content.ts';
import { SpaceBackground } from '../render/background';
import { ensureAnyBodyTexture, ensureAuraTexture, ensureBodyTexture, ensureSpecialTexture } from '../render/bodies';
import { arrangeIcon, collectionIcon, crystalIcon, decorIcon, energyIcon, menuIcon, stopwatchIcon, trophyIcon, UPGRADE_ICONS } from '../render/icons';
import { RARITY_COLOR, RARITY_CSS } from '../render/palette';
import { applyPreset } from '../game/presets';
import { preset, save } from '../save';
import { Board } from '../ui/Board';
import { Core } from '../ui/Core';
import { showReveal } from '../ui/Reveal';
import { ShootingStar } from '../ui/ShootingStar';
import { BOOST_CARD, UpgradeList, type Boost } from '../ui/UpgradeList';
import { showCollection } from '../ui/CollectionPanel';
import { BodyInfo } from '../ui/BodyInfo';
import { DecorLayer } from '../ui/DecorLayer';
import { showDecorShop } from '../ui/DecorShop';
import { showGameMenu, type MenuEntry } from '../ui/GameMenu';
import { drawRecords, showRecords } from '../ui/RecordsPanel';
import { addCrystals, dailyClaimable, openDaily, takeDailyOffer } from '../game/meta';
import type { Rect } from '../logic/decor.ts';

const STEP_SEC = 0.1;
/** Seconds the boost card offers a copy after a merge. Longer than a button on the board needed: the shop is further away. */
const COPY_OFFER_SEC = 8;

/** Main screen: core to tap, board to merge, shop, and the systems around them. */
export class PlayScene extends BaseScene {
  private run!: Run;
  private bg!: SpaceBackground;
  private core!: Core;
  private board!: Board;
  private shop!: UpgradeList;
  private energyText!: Phaser.GameObjects.Text;
  private energyIconG!: Phaser.GameObjects.Graphics;
  private rateText!: Phaser.GameObjects.Text;
  private goalLabel!: Phaser.GameObjects.Text;
  private chain: Phaser.GameObjects.Image[] = [];
  private chainMarker!: Phaser.GameObjects.Graphics;
  private scanBtn!: Button;
  /** Auto Scan on/off, shown once Auto Scan is bought (CLAUDE.md 4b). */
  private autoBtn!: Button;
  private autoShown = '';
  private pauseBtn!: Button;
  private soundBtn!: Button;
  /** Menu: collection, decor, daily gift, timed runs, records (CLAUDE.md 4b). */
  private menuBtn!: Button;
  /** Red dot on the menu button while the daily gift waits. */
  private menuDot!: Phaser.GameObjects.Graphics;
  private decorLayer!: DecorLayer;
  /** Card of the body last tapped. */
  private info: BodyInfo | null = null;
  private infoSlot = -1;
  private infoBody: Body | null = null;
  /** The card a tap just closed: tapping the same body again closes its card instead of reopening it. */
  private infoClosed = { slot: -1, at: 0 };
  /** Board stuck (full, nothing to merge, no slot to buy) since this run time, and whether its panel showed. */
  private stuckSince: number | null = null;
  private stuckShown = false;
  /** The shop's area, kept clear of decorations. */
  private shopRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private timerText!: Phaser.GameObjects.Text;
  private bestText!: Phaser.GameObjects.Text;
  /** The Galaxy was made: show the finish panel once nothing else is on screen. */
  private finishPending: { runMs: number; rank: number | null; rarity: number } | null = null;
  /** Panels on screen (they can stack: records over the finish panel). */
  private openPanels = 0;
  /** A scene switch is under way (timed run start or leave): ignore further button presses. */
  private switching = false;
  /** Rewarded copy of the body just merged, offered on the boost card for a few seconds. */
  private copyOffer: { slot: number; until: number } | null = null;
  private star: ShootingStar | null = null;
  private tutorial!: Tutorial;
  private step = new FixedStep(STEP_SEC * 1000, () => this.onStep());
  private refreshTimer = 0;
  private shownEnergy = 0;
  /** Taps since the current tutorial step began. */
  private tapsInStep = 0;
  private starsCaught = 0;
  private revealOpen = false;

  constructor() {
    super('Play', { gameplay: true });
  }

  protected build() {
    // Phaser reuses this object when the scene restarts (timed run, language change): reset per-run state.
    this.chain = [];
    this.autoShown = '';
    this.copyOffer = null;
    this.star = null;
    this.step = new FixedStep(STEP_SEC * 1000, () => this.onStep());
    this.refreshTimer = 0;
    this.tapsInStep = 0;
    this.starsCaught = 0;
    this.revealOpen = false;
    this.revealQueue = [];
    this.discoveryQueue = [];
    this.queued = new Set();
    this.finishPending = null;
    this.openPanels = 0;
    this.switching = false;
    this.info = null;
    this.infoSlot = -1;
    this.stuckSince = null;
    this.stuckShown = false;

    if (preset) applyPreset(preset, save.data);
    if (!save.data.run) save.data.run = newRunState(content, 'main', app.rng.int(1, 2 ** 31 - 1));
    if (save.data.mode === 'speedrun' && !save.data.speedrun) save.data.mode = 'main';
    const state = save.data.mode === 'speedrun' ? save.data.speedrun! : save.data.run;
    // Saves from before the records board had only the best time.
    if (!save.data.records.length && save.data.bestRunMs) save.data.records = [{ ms: save.data.bestRunMs, at: 0, merges: 0, scans: 0, rarity: 0 }];
    this.run = new Run(content, state, save.data.codex);

    this.bg = new SpaceBackground(this, save.data.decor.bg);
    this.core = new Core(this, (x, y) => this.tapCore(x, y));
    this.core.setDepth(8);

    const font = { fontFamily: app.theme.font, resolution: app.textResolution };
    this.energyIconG = this.add.graphics().setDepth(30);
    energyIcon(this.energyIconG, 44, 0xffc23d);
    this.energyText = this.add.text(0, 0, '0', { ...font, fontStyle: '900', fontSize: 76, color: '#ffffff' }).setOrigin(0, 0.5).setDepth(30);
    this.energyText.setShadow(0, 4, '#00000088', 8, false, true);
    this.rateText = this.add.text(0, 0, '', { ...font, fontStyle: '700', fontSize: 28, color: '#b9b4d9' }).setOrigin(0.5).setDepth(30);
    this.goalLabel = this.add.text(0, 0, app.t('hud.goal', { name: app.t('tier.galaxy') }), { ...font, fontStyle: '700', fontSize: 24, color: '#b9b4d9' }).setOrigin(0.5).setDepth(30);
    this.chainMarker = this.add.graphics().setDepth(29);
    for (let t = 1; t <= content.tiers.length; t++) {
      this.chain.push(this.add.image(0, 0, ensureBodyTexture(this, t, 0)).setDepth(30));
    }

    this.board = new Board(this, this.run, {
      onDrop: (from, to) => this.dropOnSlot(from, to),
      onDropOutside: (from, x, y) => this.dropOutside(from, x, y),
      onTap: (slot) => this.showBodyInfo(slot),
      onDragStart: () => this.closeInfo(),
      dropZone: () => ({ x: this.core.x, y: this.core.y, r: this.core.radius * 1.25 }),
    });

    this.shop = new UpgradeList(this, {
      run: this.run,
      describe: (u) => this.describe(u),
      onBuy: (id) => this.buy(id),
      onFree: (id) => {
        this.run.grant(id);
        this.run.useReward('freeUpgrade', app.ads.rewardsAreFree);
        this.afterPurchase(id);
      },
      freeCooldown: () => this.run.rewardWait('freeUpgrade'),
      boost: () => this.boost(),
    });

    this.scanBtn = new Button(this, 0, 0, { label: '', icon: scanIcon, width: 300, height: 108, fontSize: 36, sound: false, onClick: () => this.scan() });
    this.scanBtn.setDepth(30);
    this.autoBtn = new Button(this, 0, 0, { label: '', icon: UPGRADE_ICONS.autoScan, width: 176, height: 88, fontSize: 26, onClick: () => this.toggleAutoScan() });
    this.autoBtn.setDepth(30).setVisible(false);

    this.pauseBtn = new Button(this, 0, 0, {
      icon: icons.pauseIcon,
      width: 88,
      height: 88,
      color: app.theme.surface,
      textColor: app.theme.surfaceText,
      onClick: () => app.openPause(this),
    }).setDepth(30);
    this.soundBtn = soundButton(this, 0, 0, 88).setDepth(30);
    const timed = this.run.s.mode === 'speedrun';
    this.menuBtn = new Button(this, 0, 0, {
      icon: menuIcon,
      width: 88,
      height: 88,
      color: app.theme.surface,
      textColor: app.theme.surfaceText,
      onClick: () => this.showMenu(),
    }).setDepth(30);
    this.menuDot = this.add.graphics().setDepth(31);
    this.menuDot.fillStyle(0xff5a6e, 1);
    this.menuDot.fillCircle(0, 0, 11);
    this.menuDot.lineStyle(3, 0xffffff, 1);
    this.menuDot.strokeCircle(0, 0, 11);
    this.decorLayer = new DecorLayer(
      this,
      () => this.decorBlocked(),
      () => ({ x: this.shopRect.x + this.shopRect.w / 2, y: this.shopRect.y + this.shopRect.h / 2, w: this.shopRect.w }),
    );
    this.timerText = this.add.text(0, 0, '', { ...font, fontStyle: '900', fontSize: 34, color: '#ffffff' }).setDepth(30);
    this.bestText = this.add.text(0, 0, '', { ...font, fontStyle: '700', fontSize: 22, color: '#b9b4d9' }).setDepth(30);
    this.timerText.setVisible(timed);
    this.bestText.setVisible(timed).setText(save.data.bestRunMs ? app.t('finish.best', { t: formatClock(save.data.bestRunMs / 1000) }) : '');
    // Esc closes an open panel (the panel handles it) or ends arranging; otherwise it pauses.
    this.input.keyboard?.on('keydown-ESC', () => {
      if (this.decorLayer.arranging) return this.decorLayer.endArrange();
      if (this.info?.isOpen) return this.closeInfo();
      if (!this.panelsOnScreen()) app.openPause(this);
    });
    // Space taps the core on a computer (CLAUDE.md 4.2). Holding the key does not repeat.
    this.input.keyboard?.addCapture('SPACE');
    this.input.keyboard?.on('keydown-SPACE', (e: KeyboardEvent) => {
      if (e.repeat || !this.spaceAllowed()) return;
      this.tapCore(this.core.x + Phaser.Math.Between(-30, 30), this.core.y + Phaser.Math.Between(-30, 30));
    });

    this.tutorial = new Tutorial(this, {
      onStepDone: (id) => {
        if (!save.data.tutorial.includes(id)) save.data.tutorial.push(id);
        this.tapsInStep = 0;
      },
    });

    this.board.sync();
    this.shop.refresh(true);
    this.decorLayer.sync();
    this.shownEnergy = this.run.s.energy;
    this.startIntro();
    this.welcomeBack();
    if (this.run.s.mode === 'speedrun' && this.run.s.finishedAt !== null) {
      const runMs = Math.round(this.run.s.finishedAt * 1000);
      const i = save.data.records.findIndex((r) => r.ms === runMs);
      const galaxy = this.run.s.board.find((b) => b?.t === content.economy.goalTier);
      this.finishPending = { runMs, rank: i >= 0 ? i + 1 : null, rarity: galaxy?.r ?? 0 };
    }

    const offResume = app.pause.on('resume', (ms) => this.creditAway(ms / 1000));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offResume);
  }

  // ---------- layout ----------

  protected layout(vp: ViewportInfo) {
    const s = vp.safe;
    this.bg.layout();
    if (vp.portrait) {
      // Phone, top to bottom: energy, core, goal chain, board, scan button, shop strip.
      // Uses the full height: taller phones get a bigger board instead of empty bands.
      const cx = vp.width / 2;
      const top = Math.max(0, s.y - 60);
      const stripH = 184;
      const stripTop = vp.height - stripH - 16;
      const rowY = stripTop - 70;
      const boardBottom = rowY - 72;
      const headH = 430; // energy + core + chain
      const avail = boardBottom - (top + headH);
      const boardSize = Math.min(vp.width - 96, avail);
      const cell = Math.floor(boardSize / (4 + 3 * 0.08));
      const spare = Math.max(0, avail - boardSize);
      const y0 = top + spare * 0.45;
      this.placeEnergy(cx, y0 + 66);
      this.rateText.setPosition(cx, y0 + 116);
      this.core.setPosition(cx, y0 + 250);
      this.core.setRadius(88);
      this.placeChain(cx, y0 + 404, 600);
      const size = cell * 4 + 3 * Math.round(cell * 0.08);
      this.board.layout(cx, boardBottom - size / 2, cell);
      // Scan alone is centered; with the Auto switch the pair is centered together.
      const withAuto = this.run.level('autoScan') > 0;
      this.scanBtn.setPosition(withAuto ? cx - 94 : cx, rowY);
      this.autoBtn.setPosition(cx + 156, rowY);
      this.shop.layout(0, stripTop, vp.width, stripH, true);
      this.shopRect = { x: 0, y: stripTop, w: vp.width, h: vp.height - stripTop };
      // Pause and sound together in the top-left corner, clear of the centered energy counter.
      this.pauseBtn.setPosition(52, y0 + 52);
      this.soundBtn.setPosition(150, y0 + 52);
      // Menu and the timed run's clock on the right, clear of the centered energy counter.
      this.menuBtn.setPosition(vp.width - 52, y0 + 52);
      this.timerText.setOrigin(1, 0.5).setPosition(vp.width - 16, y0 + 122);
      this.bestText.setOrigin(1, 0.5).setPosition(vp.width - 16, y0 + 156);
    } else {
      // Desktop: pause and sound in the top-left corner of the screen; the whole right side,
      // top to bottom, is the upgrade column; core column and board share the rest, centered.
      this.pauseBtn.setPosition(56, 56);
      this.soundBtn.setPosition(156, 56);
      this.menuBtn.setPosition(256, 56);
      this.timerText.setOrigin(0, 0.5).setPosition(316, 40);
      this.bestText.setOrigin(0, 0.5).setPosition(316, 76);
      const shopW = 320;
      const shopX = vp.width - shopW - 16;
      this.shop.layout(shopX, 16, shopW, vp.height - 32, false);
      this.shopRect = { x: shopX, y: 0, w: vp.width - shopX, h: vp.height };

      const colW = 380; // energy, core, goal chain, scan
      const playRight = shopX - 20;
      const boardMax = Math.min(561, s.height - 40);
      const boardSize = Math.min(boardMax, playRight - colW - 24);
      const cell = Math.floor(boardSize / (4 + 3 * 0.08));
      const size = cell * 4 + 3 * Math.round(cell * 0.08);
      const used = colW + 24 + size;
      const x0 = Math.max(0, (playRight - used) / 2);
      const leftX = x0 + colW / 2;
      // Below the pause row on 16:9; centered with the board when the screen is taller.
      const colTop = Math.max(s.y + 4, 100);
      this.placeEnergy(leftX, colTop + 36);
      this.rateText.setPosition(leftX, colTop + 82);
      this.core.setPosition(leftX, colTop + 214);
      this.core.setRadius(84);
      this.placeChain(leftX, colTop + 336, 350);
      this.scanBtn.setPosition(leftX, colTop + 456);
      this.autoBtn.setPosition(leftX, colTop + 560);
      this.board.layout(x0 + colW + 24 + size / 2, Math.max(s.y + s.height / 2, colTop + size / 2 - 40), cell);
    }
    this.energyY = this.energyText.y;
    this.energyX = vp.portrait ? vp.width / 2 : this.core.x;
    this.goalLabel.setPosition(this.chainCenter.x, this.chainCenter.y + 42);
    this.menuDot.setPosition(this.menuBtn.x + 34, this.menuBtn.y - 34);
    this.decorLayer?.layout();
    this.closeInfo();
  }

  private chainCenter = { x: 0, y: 0, w: 0 };
  private energyY = 0;
  private energyX = 0;

  private placeEnergy(cx: number, y: number) {
    const w = this.energyText.width + 56;
    this.energyIconG.setPosition(cx - w / 2 + 22, y);
    this.energyText.setPosition(cx - w / 2 + 52, y);
  }

  private placeChain(cx: number, y: number, width: number) {
    this.chainCenter = { x: cx, y, w: width };
    const step = width / this.chain.length;
    this.chain.forEach((img, i) => {
      img.setPosition(cx - width / 2 + step * (i + 0.5), y);
      img.setScale((step * 1.25) / 192);
    });
    this.refreshChain();
  }

  private refreshChain() {
    const top = this.run.s.highestTier;
    this.chain.forEach((img, i) => {
      const t = i + 1;
      // Undiscovered tiers are dark silhouettes: the player sees there is more to find.
      img.setTint(t <= top ? 0xffffff : 0x3a3478);
      img.setAlpha(t <= top ? 1 : 0.55);
    });
    const g = this.chainMarker;
    g.clear();
    if (top > 0) {
      const img = this.chain[top - 1];
      g.lineStyle(3, 0xffc23d, 0.9);
      g.strokeCircle(img.x, img.y, (this.chainCenter.w / this.chain.length) * 0.5);
    }
  }

  // ---------- frame ----------

  update(_time: number, delta: number) {
    if (this.timerText.visible) this.timerText.setText(formatClock(this.run.s.finishedAt ?? this.run.s.time));
    if (!this.revealOpen && this.revealQueue.length && !this.panelsOnScreen()) this.reveal(this.revealQueue.shift()!);
    if (!this.revealOpen && this.discoveryQueue.length && !this.panelsOnScreen()) {
      const next = this.discoveryQueue.shift()!;
      this.showDiscoveryPanel(next.special, next.rarity);
    }
    if (this.finishPending && !this.revealOpen && !this.panelsOnScreen() && !this.tutorial.active) {
      const done = this.finishPending;
      this.finishPending = null;
      this.showFinishPanel(done.runMs, done.rank, done.rarity);
    }
    this.bg.update(delta);
    if (!this.revealOpen) this.step.update(delta);
    // Count up the energy display smoothly instead of jumping.
    const target = this.run.s.energy;
    this.shownEnergy += (target - this.shownEnergy) * Math.min(1, delta / 90);
    if (Math.abs(target - this.shownEnergy) < 1) this.shownEnergy = target;
    this.energyText.setText(formatNumber(this.shownEnergy));
    this.placeEnergy(this.energyX, this.energyY);

    this.refreshTimer -= delta;
    if (this.refreshTimer <= 0) {
      this.refreshTimer = 200;
      this.refreshUi();
    }
    // Tutorial star: keep it on screen until it is caught.
    if (this.star && this.tutorial.currentId === 'star') {
      this.star.hold = true;
      this.run.s.starTimer = Math.min(this.run.s.starTimer, -2);
    }
    // The copy offer waits while its tutorial step is being read.
    if (this.copyOffer && this.tutorial.currentId === 'twin') this.copyOffer.until = Math.max(this.copyOffer.until, this.run.s.time + 2);
  }

  private onStep() {
    for (const ev of this.run.update(STEP_SEC)) {
      if (ev.kind === 'scan') {
        this.board.sync([ev.result.slot]);
        this.announce(ev.result, false);
      } else if (ev.kind === 'merge') {
        this.board.sync([ev.result.slot, ...(ev.result.twin ? [ev.result.twin.slot] : [])]);
        this.mergeFx(ev.result);
      } else if (ev.kind === 'star') {
        this.spawnStar(ev.golden);
      } else if (ev.kind === 'starGone') {
        this.removeStar(false);
      }
    }
  }

  private refreshUi() {
    const run = this.run;
    const auto = run.autoIncome();
    this.rateText.setText(
      auto > 0 ? app.t('hud.perSecond', { n: formatNumber(auto) }) : app.t('hud.perTap', { n: formatNumber(run.tapValue()) }),
    );
    const full = run.freeSlot() < 0;
    this.scanBtn.setLabel(full ? app.t('scan.full') : `${app.t('scan.button')}  ${formatNumber(run.scanCost())}`);
    this.scanBtn.setEnabled(run.canScan());
    this.refreshAutoButton();
    this.refreshGoal();
    this.shop.refresh();
    this.checkTutorialTriggers();
    this.checkStuck();
    // The card of a body that merged, moved or left closes.
    if (this.info?.isOpen && this.run.s.board[this.infoSlot] !== this.infoBody) this.closeInfo();
    // A new player gets the gift once the first purchase is done, not in the middle of the opening steps.
    if (this.calm() && save.data.tutorial.includes('buy') && takeDailyOffer()) this.showDaily();
  }

  /** Nothing else on screen: no panel, reveal, tutorial step, arranging or switch. */
  private calm() {
    return !this.revealOpen && !this.panelsOnScreen() && !this.tutorial.active && !this.decorLayer.arranging && !this.switching;
  }

  // ---------- actions ----------

  private spaceAllowed() {
    const id = this.tutorial.currentId;
    return !this.revealOpen && !this.panelsOnScreen() && !this.decorLayer.arranging && (!id || id === 'tap' || id === 'tapPower') && !app.platform.isMobile();
  }

  /** Any modal panel open: ours, or the framework's (welcome back, daily gift). */
  private panelsOnScreen() {
    return this.openPanels > 0 || this.children.list.some((o) => o instanceof Panel && o.active);
  }

  private tapCore(x: number, y: number) {
    if (this.revealOpen) return;
    const id = this.tutorial.currentId;
    if (id && id !== 'tap' && id !== 'tapPower' && id !== 'star') return;
    const { amount, crit } = this.run.tap();
    this.tapsInStep += 1;
    this.core.hit(crit ? 2.5 : 1);
    floatText(this, x, y - 30, `+${formatNumber(amount)}`, { color: crit ? '#ffd166' : '#ffffff', size: crit ? 64 : 44, rise: crit ? 170 : 120 });
    if (crit) {
      burst(this, x, y, 0xffd166, 18, 360);
      app.audio.play('tap', { pitchJitter: 40, volume: 1 });
      app.haptic(18);
    } else {
      app.audio.play('tap', { pitchJitter: 140, volume: 0.75 });
      app.haptic(6);
    }
    if (this.run.s.taps % 20 === 0) burst(this, this.core.x, this.core.y, 0xa98bff, 10, 220);
  }

  private scan() {
    const run = this.run;
    if (!run.canScan()) {
      if (run.freeSlot() < 0) toast(this, app.t('scan.full'));
      return;
    }
    const result = run.scan()!;
    app.audio.play('buy', { pitchJitter: 120, volume: 0.8 });
    this.beam(result.slot);
    this.board.sync([result.slot]);
    this.announce(result, false);
    this.refreshUi();
  }

  /** A short line of light from the core to the new body. */
  private beam(slot: number) {
    const to = this.board.slotPos(slot);
    const g = this.add.graphics().setDepth(9).setBlendMode(Phaser.BlendModes.ADD);
    g.lineStyle(6, 0x9fd8ff, 0.8);
    g.lineBetween(this.core.x, this.core.y, to.x, to.y);
    this.tweens.add({ targets: g, alpha: 0, duration: 260, onComplete: () => g.destroy() });
  }

  private dropOnSlot(from: number, to: number) {
    const run = this.run;
    if (run.fusionOf(from, to)) {
      // A Galaxy meets a planet, gas giant, star or black hole: a hidden body (CLAUDE.md 4b item 8).
      const made = run.fuse(from, to)!;
      this.board.mergeInto(from, to);
      this.board.sync([made.slot]);
      this.fusionFx(made);
      this.refreshUi();
    } else if (run.canMerge(from, to)) {
      const result = run.merge(from, to)!;
      this.board.mergeInto(from, to);
      this.board.sync([result.slot, ...(result.twin ? [result.twin.slot] : [])]);
      this.mergeFx(result);
      this.offerCopy(result);
      this.refreshUi();
    } else if (!run.s.board[to] && run.move(from, to)) {
      this.board.moved(from, to);
    } else if (run.swap(from, to)) {
      this.board.swapped(from, to);
    } else {
      // Nothing changed (for example the body was merged away by Auto Merge while being dragged).
      this.board.sync();
    }
  }

  private dropOutside(from: number, x: number, y: number): boolean {
    // Dropping on the core feeds the body to it for energy.
    if (Phaser.Math.Distance.Between(x, y, this.core.x, this.core.y) > this.core.radius * 1.4) return false;
    const value = this.run.absorb(from);
    if (!value) return false;
    this.board.sync();
    this.core.hit(2);
    floatText(this, this.core.x, this.core.y - 60, app.t('reveal.absorbed', { n: formatNumber(value) }), { color: '#ffd166', size: 56 });
    burst(this, this.core.x, this.core.y, 0xffb36b, 24, 420);
    app.audio.play('reward', { volume: 0.7 });
    return true;
  }

  private buy(id: string) {
    if (!this.run.buy(id)) return;
    app.audio.play('buy');
    app.haptic(15);
    this.afterPurchase(id);
  }

  private afterPurchase(id: string) {
    const rect = this.shop.cardRect(id);
    if (rect) burst(this, rect.x, rect.y, 0xffc23d, 16, 300);
    this.board.layout(this.board.x, this.board.y, this.board.cell);
    this.board.sync();
    this.shop.refresh(true);
    this.refreshUi();
  }

  // ---------- feedback ----------

  /** New body: label it, and give Epic or rarer finds the full reveal. */
  private announce(result: NewBody, lucky: boolean) {
    const { body } = result;
    const p = this.board.slotPos(result.slot);
    this.refreshChain();
    if (result.isNew) app.moments.emit('collectionNew', { id: `${body.t}.${body.r}` });
    if (body.r >= 2) {
      const odds = this.run.rarityOdds()[body.r];
      app.moments.emit('rarePull', { tier: body.r, odds, label: `${body.t}` });
      this.reveal(result);
    } else if (body.r === 1 || result.isNew || lucky) {
      const text = body.r === 1 ? app.t('rarity.rare') : app.t('reveal.new');
      floatText(this, p.x, p.y - 40, text, { color: RARITY_CSS[body.r], size: 34, rise: 80 });
    }
    if (body.r >= 1) burst(this, p.x, p.y, RARITY_COLOR[body.r], 12 + body.r * 6, 320);
  }

  /** Reveals wait for each other: auto merge, twins and scans can make several Epic or rarer bodies close together. */
  private revealQueue: NewBody[] = [];

  private reveal(result: NewBody) {
    // One at a time, and never over a panel (welcome back, finish): queued until the screen is clear.
    if (this.revealOpen || this.panelsOnScreen()) {
      this.revealQueue.push(result);
      return;
    }
    const { body } = result;
    const odds = this.run.rarityOdds()[body.r];
    const name = `${app.t(`rarity.${content.rarities[body.r].id}`)} ${app.t(`tier.${content.tiers[body.t - 1].id}`)}`;
    this.revealOpen = true;
    showReveal(this, body, app.t(`rarity.${content.rarities[body.r].id}`), name, app.t('reveal.odds', { n: formatNumber(Math.round(1 / odds)) }), () => {
      this.revealOpen = false;
      const next = this.revealQueue.shift();
      if (next) return this.reveal(next);
      if (body.r >= 2 && !save.data.tutorial.includes('rarity')) {
        this.queueOnce('rarity', [{ id: 'rarity', text: app.t('tut.rarity'), ack: app.t('tut.ok') }]);
      }
    });
  }

  private mergeFx(result: MergeResult) {
    const p = this.board.slotPos(result.slot);
    const color = RARITY_COLOR[result.body.r];
    burst(this, p.x, p.y, color, 16 + result.body.t * 2, 300 + result.body.t * 20);
    this.board.sprite(result.slot)?.bump(0.25);
    // Merge bonus: energy rising from the new body, below the rarity label.
    if (result.bonus > 0) {
      floatText(this, p.x, p.y + this.board.cell * 0.15, `+${formatNumber(result.bonus)}`, { color: '#ffd166', size: 34 + Math.min(16, result.body.r * 4), rise: 90 });
    }
    // Pitch rises with tier, so climbing the chain sounds like progress.
    app.audio.play('buy', { volume: 0.9, detune: (result.body.t - 5) * 90 });
    app.haptic(12);
    app.moments.emit('merge', { level: result.body.t });
    if (result.twin) {
      const q = this.board.slotPos(result.twin.slot);
      floatText(this, q.x, q.y - 40, app.t('reveal.twin'), { color: '#9fd8ff', size: 40 });
      burst(this, q.x, q.y, 0x9fd8ff, 16, 300);
    }
    this.announce(result, false);
    if (result.finished) this.finish(result.body.r);
  }

  /** Collection screen: odds and pity follow the run on screen; the bonus is the collection's. */
  private showCollectionPanel() {
    const found = save.data.codex.found;
    let bonus = 0;
    for (const key of Object.keys(found)) if (!isSpecialKey(key)) bonus += content.rarities[Number(key.split('.')[1])]?.codexBonus ?? 0;
    this.openPanels += 1;
    showCollection(
      this,
      {
        content,
        found,
        odds: this.run.rarityOdds(),
        pity: content.pity.map((rule, i) => ({ rarity: rule.minTier, left: this.run.pityLeft(i) })),
        bonus,
      },
      () => (this.openPanels = Math.max(0, this.openPanels - 1)),
    );
  }

  /** A hidden body was made: gold burst, and the discovery panel the first time. */
  private fusionFx(made: NewBody & { special: SpecialDef }) {
    const p = this.board.slotPos(made.slot);
    burst(this, p.x, p.y, 0xffd166, 40, 520);
    burst(this, p.x, p.y, 0x9fd8ff, 24, 380);
    this.board.sprite(made.slot)?.bump(0.4);
    app.audio.play('reward');
    app.haptic(30);
    app.moments.emit('collectionNew', { id: `s.${made.special.id}.${made.body.r}` });
    const name = `${app.t(`rarity.${content.rarities[made.body.r].id}`)} ${app.t(`special.${made.special.id}.name`)}`;
    if (!made.isNew) {
      floatText(this, p.x, p.y - 50, name, { color: RARITY_CSS[made.body.r], size: 36 });
      return;
    }
    // Shown once the screen is clear, like the Galaxy panel.
    this.discoveryQueue.push({ special: made.special, rarity: made.body.r });
  }

  private discoveryQueue: { special: SpecialDef; rarity: number }[] = [];

  private showDiscoveryPanel(special: SpecialDef, rarity: number) {
    const panel = this.openPanel({ title: app.t('special.title'), width: 600, height: 640, closable: false });
    const font = { fontFamily: app.theme.font, resolution: app.textResolution };
    const y0 = panel.top + 100;
    const glow = this.add.image(0, y0, ensureAuraTexture(this, Math.max(1, rarity))).setScale(1.6).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.8);
    const img = this.add.image(0, y0, ensureSpecialTexture(this, special.id, special.tier, rarity)).setScale(1.25);
    this.tweens.add({ targets: [glow, img], angle: 360, duration: 30000, repeat: -1 });
    const label = `${app.t(`rarity.${content.rarities[rarity].id}`)} ${app.t(`special.${special.id}.name`)}`;
    const name = this.add.text(0, y0 + 140, label, { ...font, fontStyle: '900', fontSize: 40, color: RARITY_CSS[rarity] }).setOrigin(0.5);
    if (name.width > panel.panelWidth - 60) name.setScale((panel.panelWidth - 60) / name.width);
    const text = this.add
      .text(0, y0 + 220, app.t('special.only'), { ...font, fontStyle: '700', fontSize: 26, color: app.theme.surfaceText, align: 'center', wordWrap: { width: panel.panelWidth - 90 } })
      .setOrigin(0.5);
    const ok = new Button(this, 0, panel.bottom - 80, { label: app.t('special.ok'), width: 260, height: 96, fontSize: 34, onClick: () => panel.close() });
    panel.content.add([glow, img, name, text, ok]);
    const vp = this.vp;
    for (let i = 0; i < 5; i++) this.time.delayedCall(i * 160, () => burst(this, vp.width * (0.25 + Math.random() * 0.5), vp.height * (0.2 + Math.random() * 0.3), [0xffd166, 0x9fd8ff, 0xff7ad9][i % 3], 24, 480));
  }

  // ---------- rewarded boosts (one card at the front of the shop, CLAUDE.md 4b) ----------

  /** After a merge: the boost card offers a copy of the result for a few seconds. */
  private offerCopy(result: MergeResult) {
    this.copyOffer = null;
    if (!this.run.rewardReady('twin') || !this.run.canDuplicate(result.slot) || !app.ads.rewardedAvailable || app.clean) return;
    this.copyOffer = { slot: result.slot, until: this.run.s.time + COPY_OFFER_SEC };
    this.shop.refresh();
    // Scroll the shop back to the front only the first time, so a player browsing upgrades is not interrupted.
    if (!save.data.tutorial.includes('twin')) this.shop.reveal(BOOST_CARD);
    this.queueOnce('twin', [{ id: 'twin', text: app.t('tut.twin'), target: () => this.shop.cardRect(BOOST_CARD), ack: app.t('tut.ok') }]);
  }

  /** Which boost the card shows: the copy offer right after a merge, else Lucky Scan. */
  private boost(): Boost | null {
    const run = this.run;
    if (!app.ads.rewardedAvailable || app.clean) return null;
    const rw = content.economy.rewarded;

    const offer = this.copyOffer;
    if (offer && run.s.time < offer.until && run.rewardReady('twin') && run.canDuplicate(offer.slot)) {
      const b = run.s.board[offer.slot]!;
      const name = app.t(`tier.${content.tiers[b.t - 1].id}`);
      return {
        id: `twin.${offer.slot}`,
        name: app.t('boost.copy'),
        desc: app.t('boost.copyDesc', { name }),
        icon: UPGRADE_ICONS.binary,
        wait: 0,
        onReward: () => this.useCopy(offer.slot),
      };
    }
    this.copyOffer = null;

    // Hidden until it is first due, so the opening minutes are about tapping (economy.rewarded.firstAt).
    // After that the card stays, with a countdown while the reward recharges.
    if (run.s.time < rw.luckyScan.firstAt) return null;
    return {
      id: 'luckyScan',
      name: app.t('boost.lucky'),
      desc: app.t('boost.luckyDesc'),
      icon: UPGRADE_ICONS.luck,
      wait: run.rewardWait('luckyScan'),
      blocked: run.freeSlot() >= 0 ? undefined : app.t('scan.full'),
      onReward: () => this.useLucky(),
    };
  }

  private toggleAutoScan() {
    this.run.s.autoScanOff = !this.run.s.autoScanOff;
    this.run.s.autoScanAcc = 0;
    this.refreshAutoButton();
  }

  private refreshAutoButton() {
    const has = this.run.level('autoScan') > 0;
    const on = !this.run.s.autoScanOff;
    const state = `${has}|${on}`;
    if (state === this.autoShown) return;
    const appeared = has && !this.autoBtn.visible;
    this.autoShown = state;
    this.autoBtn.setVisible(has);
    if (appeared && this.vp.portrait) this.layout(this.vp);
    else if (appeared) this.decorLayer.layout();
    this.autoBtn.setLabel(app.t(on ? 'scan.autoOn' : 'scan.autoOff'));
    // Green while it spends energy on its own; plain when off.
    this.autoBtn.setColor(on ? app.theme.reward : app.theme.surface, on ? app.theme.rewardText : app.theme.surfaceText);
  }

  private useLucky() {
    const result = this.run.luckyScan();
    if (!result) return toast(this, app.t('scan.full'));
    this.run.useReward('luckyScan', app.ads.rewardsAreFree);
    this.board.sync([result.slot]);
    this.beam(result.slot);
    this.announce(result, true);
    this.refreshUi();
  }

  private useCopy(slot: number) {
    const copy = this.run.duplicate(slot);
    this.run.useReward('twin', app.ads.rewardsAreFree);
    this.copyOffer = null;
    if (copy) {
      this.board.sync([copy.slot]);
      this.announce(copy, false);
      const p = this.board.slotPos(copy.slot);
      floatText(this, p.x, p.y - 40, app.t('reveal.twin'), { color: '#9fd8ff', size: 40 });
    }
    this.refreshUi();
  }

  private spawnStar(golden: boolean) {
    this.removeStar(false);
    const vp = this.vp;
    const area = vp.portrait ? { x: 0, y: vp.safe.y + 160, w: vp.width, h: 700 } : { x: 0, y: vp.safe.y + 120, w: vp.width, h: 480 };
    this.star = new ShootingStar(this, area, content.economy.stars.lifetime, golden, () => this.catchStar());
    if (!save.data.tutorial.includes('star') && save.data.tutorial.includes('goal')) {
      // Points at whichever star is up: if this one leaves before the step starts, the next one is used.
      this.queueOnce('star', [
        {
          id: 'star',
          text: app.t('tut.star'),
          target: () => (this.star?.active ? { x: this.star.x, y: this.star.y, w: 110, h: 110 } : null),
          done: () => this.starsCaught > 0,
        },
      ]);
    }
  }

  private catchStar() {
    const star = this.star;
    if (!star) return;
    const golden = this.run.s.starGolden;
    const value = this.run.catchStar();
    if (!value) return;
    this.starsCaught += 1;
    floatText(this, star.x, star.y - 20, `+${formatNumber(value)}`, { color: golden ? '#ffd166' : '#cfe8ff', size: golden ? 64 : 50 });
    if (golden) toast(this, app.t('star.golden'), 1500);
    burst(this, star.x, star.y, golden ? 0xffd166 : 0x9fd8ff, golden ? 30 : 18, 380);
    app.audio.play('reward', { volume: 0.8 });
    app.haptic(20);
    this.removeStar(true);
  }

  private removeStar(caught: boolean) {
    const star = this.star;
    if (!star) return;
    this.star = null;
    if (caught) star.destroy();
    else this.tweens.add({ targets: star, alpha: 0, duration: 300, onComplete: () => star.destroy() });
  }

  private finish(rarity: number) {
    const runMs = Math.round((this.run.s.finishedAt ?? this.run.s.time) * 1000);
    app.moments.emit('finish', { runMs });
    app.platform.happyTime();
    if (this.run.s.mode === 'main' && !save.data.firstFinishMs) save.data.firstFinishMs = runMs;
    let rank: number | null = null;
    if (this.run.s.mode === 'speedrun') {
      const entry = { ms: runMs, at: Date.now(), merges: this.run.s.merges, scans: this.run.s.scans, rarity };
      const result = addRecord(save.data.records, entry);
      save.data.records = result.list;
      rank = result.rank;
      save.data.bestRunMs = result.list[0]?.ms ?? runMs;
    }
    save.flush();
    // Shown once the Galaxy reveal (and any tutorial step) is gone.
    this.finishPending = { runMs, rank, rarity };
  }

  // ---------- end of a run: finish panel, timed runs (CLAUDE.md 4b, item 7) ----------

  private collectionCount() {
    const keys = Object.keys(save.data.codex.found);
    const hidden = keys.filter(isSpecialKey).length;
    return { n: keys.length - hidden, total: content.tiers.length * content.rarities.length, hidden, hiddenTotal: content.specials.length * content.rarities.length };
  }

  /** A modal panel that keeps count of what is open. */
  private openPanel(options: { title: string; width: number; height: number; closable?: boolean }) {
    this.openPanels += 1;
    return new Panel(this, { ...options, onClose: () => (this.openPanels = Math.max(0, this.openPanels - 1)) });
  }

  private showRecordsPanel(highlight: number | null) {
    this.openPanels += 1;
    showRecords(this, highlight, () => (this.openPanels = Math.max(0, this.openPanels - 1)));
  }

  /** Two buttons of the same size side by side, for the bottom of a panel. */
  private panelButtons(panel: Panel, y: number, left: { label: string; onClick: () => void }, right: { label: string; onClick: () => void }) {
    const w = Math.min(268, (panel.panelWidth - 72) / 2);
    const a = new Button(this, -w / 2 - 12, y, { label: left.label, width: w, height: 96, fontSize: 32, color: app.theme.surface, textColor: app.theme.surfaceText, onClick: left.onClick });
    const b = new Button(this, w / 2 + 12, y, { label: right.label, width: w, height: 96, fontSize: 32, onClick: right.onClick });
    // Surface-colored button on a surface panel: give it an outline so it reads as a button.
    const ring = this.add.graphics();
    ring.lineStyle(3, 0xffffff, 0.25);
    ring.strokeRoundedRect(-w / 2 - 12 - w / 2, y - 48, w, 96, app.theme.radius);
    panel.content.add([ring, a, b]);
  }

  private showFinishPanel(runMs: number, rank: number | null, rarity: number) {
    const run = this.run;
    const timed = run.s.mode === 'speedrun';
    const record = timed && rank === 1;
    const hasRecords = save.data.records.length > 0;
    // Wide screens get the stats in one row, so everything fits in a 16:9 frame.
    const wide = !this.vp.portrait;
    const panel = this.openPanel({ title: app.t('finish.title'), width: wide ? 900 : 640, height: wide ? 680 : 880, closable: false });
    const font = { fontFamily: app.theme.font, resolution: app.textResolution };
    const W = panel.panelWidth;
    const H = panel.panelHeight;
    const cols = wide ? 4 : 2;
    const rows = 4 / cols;
    const statH = 92;
    const statsH = rows * statH + (rows - 1) * 12;
    // Space between the title and the buttons, shared out; the Galaxy takes what is left.
    const avail = H - 120 - 150;
    const fixed = 8 + 36 + 22 + statsH + 22 + 48 + (hasRecords ? 36 : 0);
    const size = Phaser.Math.Clamp(avail - fixed, 90, 220);
    let y = panel.top - 14 + size / 2;

    // The Galaxy itself, slowly turning, with a glow behind it.
    const scale = (size / 192) * 1.15;
    const glow = this.add.image(0, y, ensureAuraTexture(this, Math.max(1, rarity))).setScale(scale * 1.5).setAlpha(0.8).setBlendMode(Phaser.BlendModes.ADD);
    const galaxy = this.add.image(0, y, ensureBodyTexture(this, content.economy.goalTier, rarity)).setScale(scale);
    this.tweens.add({ targets: [glow, galaxy], angle: 360, duration: 24000, repeat: -1 });
    y += size / 2 + 8 + 18;
    const from = this.add
      .text(0, y, app.t('finish.from', { rarity: withArticle(app.t(`rarity.${content.rarities[rarity].id}`)) }), { ...font, fontStyle: '700', fontSize: 28, color: RARITY_CSS[rarity] })
      .setOrigin(0.5);
    panel.content.add([glow, galaxy, from]);
    y += 18 + 22;

    // Stats.
    const { n, total } = this.collectionCount();
    const time = timed ? formatClock(runMs / 1000) : formatDuration(runMs / 1000, app.i18n.durationUnits());
    const stats: [string, string][] = [
      [app.t('finish.time'), time],
      [app.t('finish.merges'), formatNumber(run.s.merges)],
      [app.t('finish.scans'), formatNumber(run.s.scans)],
      [app.t('finish.collection'), `${n}/${total}`],
    ];
    const cellW = (W - 64 - (cols - 1) * 12) / cols;
    stats.forEach(([label, value], i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = -W / 2 + 32 + cellW / 2 + col * (cellW + 12);
      const cy = y + statH / 2 + row * (statH + 12);
      const box = this.add.graphics();
      box.fillStyle(0x000000, 0.22);
      box.fillRoundedRect(x - cellW / 2, cy - statH / 2, cellW, statH, 18);
      const l = this.add.text(x, cy - 20, label, { ...font, fontStyle: '700', fontSize: 22, color: app.theme.textDim }).setOrigin(0.5);
      const v = this.add.text(x, cy + 16, value, { ...font, fontStyle: '900', fontSize: 36, color: '#ffffff' }).setOrigin(0.5);
      if (v.width > cellW - 16) v.setScale((cellW - 16) / v.width);
      panel.content.add([box, l, v]);
    });
    y += statsH + 22 + 24;
    const recordY = y;

    // Record line.
    let recordText: string;
    let recordColor = app.theme.textDim;
    if (record) {
      recordText = app.t('finish.record');
      recordColor = '#ffd166';
    } else if (timed && rank) {
      recordText = app.t('finish.rank', { n: rank });
      recordColor = '#ffd166';
    } else if (save.data.bestRunMs) {
      recordText = app.t('finish.best', { t: formatClock(save.data.bestRunMs / 1000) });
    } else {
      recordText = app.t('finish.noBest');
    }
    const rec = this.add.text(0, recordY, recordText, { ...font, fontStyle: '900', fontSize: record ? 40 : 26, color: recordColor, align: 'center', wordWrap: { width: panel.panelWidth - 80 } }).setOrigin(0.5);
    panel.content.add(rec);
    if (record) this.tweens.add({ targets: rec, scale: 1.08, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    if (hasRecords) {
      const link = this.add
        .text(0, recordY + 38, app.t('finish.viewRecords'), { ...font, fontStyle: '900', fontSize: 24, color: '#9fd8ff' })
        .setOrigin(0.5)
        .setPadding(16, 8, 16, 8)
        .setInteractive({ useHandCursor: true });
      link.on('pointerup', () => this.showRecordsPanel(timed ? rank : null));
      panel.content.add(link);
    }

    const buttonsY = panel.bottom - 80;
    if (timed) {
      this.panelButtons(panel, buttonsY, { label: app.t('finish.home'), onClick: () => this.leaveTimedRun() }, { label: app.t('finish.again'), onClick: () => void this.startTimedRun() });
    } else {
      this.panelButtons(
        panel,
        buttonsY,
        {
          label: app.t('finish.keep'),
          onClick: () => {
            panel.close();
            this.refreshGoal();
          },
        },
        { label: app.t('finish.timed'), onClick: () => void this.startTimedRun() },
      );
    }

    // Celebration around the panel.
    const vp = this.vp;
    for (let i = 0; i < 6; i++) {
      this.time.delayedCall(i * 180, () => burst(this, vp.width * (0.2 + Math.random() * 0.6), vp.height * (0.15 + Math.random() * 0.3), [0xffd166, 0x9fd8ff, 0xd38bff][i % 3], 26, 520));
    }
    app.audio.play('reward');
  }

  /** Explains the timed run, then starts it. Opened from the stopwatch button. */
  private showTimedPanel() {
    if (this.openPanels > 0) return;
    const rows = Math.max(1, save.data.records.length);
    const panel = this.openPanel({ title: app.t('finish.timed'), width: 620, height: 120 + 100 + 44 + rows * 52 + 170 });
    const font = { fontFamily: app.theme.font, resolution: app.textResolution };
    const text = this.add
      .text(0, panel.top + 34, app.t('finish.timedText'), { ...font, fontStyle: '700', fontSize: 28, color: app.theme.surfaceText, align: 'center', wordWrap: { width: panel.panelWidth - 90 } })
      .setOrigin(0.5);
    const head = this.add.text(0, panel.top + 112, app.t('finish.records'), { ...font, fontStyle: '900', fontSize: 26, color: '#ffd166' }).setOrigin(0.5);
    panel.content.add([text, head]);
    drawRecords(this, panel, panel.top + 136, null);
    this.panelButtons(panel, panel.bottom - 80, { label: app.t('finish.cancel'), onClick: () => panel.close() }, { label: app.t('finish.start'), onClick: () => void this.startTimedRun() });
  }

  private showLeavePanel() {
    if (this.openPanels > 0) return;
    const panel = this.openPanel({ title: app.t('finish.leaveTitle'), width: 600, height: 440 });
    const font = { fontFamily: app.theme.font, resolution: app.textResolution };
    const text = this.add
      .text(0, panel.top + 70, app.t('finish.leaveText'), { ...font, fontStyle: '700', fontSize: 30, color: app.theme.surfaceText, align: 'center', wordWrap: { width: panel.panelWidth - 90 } })
      .setOrigin(0.5);
    panel.content.add(text);
    this.panelButtons(panel, panel.bottom - 80, { label: app.t('finish.stay'), onClick: () => panel.close() }, { label: app.t('finish.leave'), onClick: () => this.leaveTimedRun() });
  }

  /** New timed run from stardust. A natural break, so a midgame ad may show first (CLAUDE.md 4.5). */
  private async startTimedRun() {
    if (this.switching) return;
    this.switching = true;
    if (save.data.mode === 'main') save.data.mainLeftAt = Date.now();
    save.data.speedrun = newRunState(content, 'speedrun', app.rng.int(1, 2 ** 31 - 1));
    save.data.mode = 'speedrun';
    save.flush();
    await app.ads.midgame();
    this.scene.restart();
  }

  private leaveTimedRun() {
    if (this.switching) return;
    this.switching = true;
    save.data.mode = 'main';
    save.data.speedrun = null;
    save.flush();
    this.scene.restart();
  }

  /** Goal line under the chain: the Galaxy until it is made, then the collection. */
  private refreshGoal() {
    const done = this.run.s.mode === 'main' && (this.run.s.finishedAt !== null || save.data.firstFinishMs > 0);
    if (done) {
      const { n, total } = this.collectionCount();
      this.goalLabel.setText(app.t('finish.endless', { n, total }));
      // Keep it inside its column.
      const room = this.chainCenter.w + 20;
      this.goalLabel.setScale(this.goalLabel.width > room ? room / this.goalLabel.width : 1);
    } else {
      this.goalLabel.setText(app.t('hud.goal', { name: app.t('tier.galaxy') })).setScale(1);
    }
    // The menu shows once the opening steps are done, so it does not pull a new player away from the core.
    const menuOn = this.run.s.mode === 'speedrun' || save.data.tutorial.includes('goal');
    this.menuBtn.setVisible(menuOn);
    this.menuDot.setVisible(menuOn && dailyClaimable());
  }

  // ---------- menu, body card, decorations, stuck board (CLAUDE.md 4b items 8-10) ----------

  private showMenu() {
    if (this.panelsOnScreen() || this.switching || this.decorLayer.arranging) return;
    this.closeInfo();
    const timed = this.run.s.mode === 'speedrun';
    const entries: MenuEntry[] = [
      { label: app.t('menu.daily'), icon: icons.giftIcon, badge: dailyClaimable(), onClick: () => this.showDaily() },
      { label: app.t('menu.collection'), icon: collectionIcon, onClick: () => this.showCollectionPanel() },
      { label: app.t('menu.decor'), icon: decorIcon, onClick: () => this.openDecorShop() },
    ];
    if (save.data.decor.shown.length) entries.push({ label: app.t('menu.arrange'), icon: arrangeIcon, onClick: () => this.arrangeDecor() });
    if (timed) entries.push({ label: app.t('menu.leave'), icon: icons.homeIcon, onClick: () => this.showLeavePanel() });
    else if (save.data.firstFinishMs > 0) entries.push({ label: app.t('menu.timed'), icon: stopwatchIcon, onClick: () => this.showTimedPanel() });
    if (save.data.records.length) entries.push({ label: app.t('menu.records'), icon: trophyIcon, onClick: () => this.showRecordsPanel(null) });
    this.openPanels += 1;
    showGameMenu(this, entries, () => (this.openPanels = Math.max(0, this.openPanels - 1)));
  }

  private showDaily() {
    this.openPanels += 1;
    openDaily(
      this,
      this.run,
      () => this.refreshUi(),
      () => (this.openPanels = Math.max(0, this.openPanels - 1)),
    );
  }

  private openDecorShop() {
    this.openPanels += 1;
    showDecorShop(this, {
      onBackground: (id) => this.bg.setTheme(id),
      showItem: (id) => this.decorLayer.show(id),
      hideItem: (id) => this.decorLayer.hide(id),
      onArrange: () => this.arrangeDecor(),
      onClose: () => (this.openPanels = Math.max(0, this.openPanels - 1)),
    });
  }

  private arrangeDecor() {
    this.closeInfo();
    this.decorLayer.arrange(() => save.flush());
  }

  /** Areas decorations keep off: the board, the core column, the shop and every button, with a margin. */
  private decorBlocked(): Rect[] {
    const pad = 10;
    const box = (x: number, y: number, w: number, h: number): Rect => ({ x: x - w / 2 - pad, y: y - h / 2 - pad, w: w + pad * 2, h: h + pad * 2 });
    const vp = this.vp;
    const list: Rect[] = [
      box(this.board.x, this.board.y, this.board.size, this.board.size),
      box(this.core.x, this.core.y, this.core.radius * 2.5, this.core.radius * 2.5),
      box(this.energyX, this.energyY, 420, 92),
      box(this.rateText.x, this.rateText.y, 380, 44),
      box(this.chainCenter.x, this.chainCenter.y + 14, this.chainCenter.w + 20, 104),
      box(this.scanBtn.x, this.scanBtn.y, 300, 108),
      { ...this.shopRect },
      box(this.pauseBtn.x, this.pauseBtn.y, 88, 88),
      box(this.soundBtn.x, this.soundBtn.y, 88, 88),
      box(this.menuBtn.x, this.menuBtn.y, 88, 88),
    ];
    // Shown only in some runs: items there move aside for that run and come back after (saved spots stay).
    if (this.autoBtn.visible) list.push(box(this.autoBtn.x, this.autoBtn.y, 176, 88));
    if (this.timerText.visible) {
      if (vp.portrait) list.push({ x: vp.width - 240, y: this.timerText.y - 30, w: 240, h: 96 });
      else list.push({ x: this.timerText.x - pad, y: 10, w: 230, h: 96 });
    }
    return list;
  }

  private closeInfo() {
    this.info?.close();
    this.info = null;
    this.infoSlot = -1;
    this.infoBody = null;
  }

  /** Tapping a body shows its name, rarity and what it makes; a hidden body can be sold here. */
  private showBodyInfo(slot: number) {
    const body = this.run.s.board[slot];
    const same = (this.infoSlot === slot && this.info?.isOpen) || (this.infoClosed.slot === slot && performance.now() - this.infoClosed.at < 400);
    this.closeInfo();
    this.infoClosed.slot = -1;
    if (!body || same || this.revealOpen || this.panelsOnScreen() || this.decorLayer.arranging) return;
    const tid = this.tutorial.currentId;
    if (tid && tid !== 'tap' && tid !== 'tapPower') return;
    const rarity = app.t(`rarity.${content.rarities[body.r].id}`);
    const goal = content.economy.goalTier;
    const p = this.board.slotPos(slot);
    const lines: string[] = [];
    let title: string;
    let action: { label: string; icon?: icons.IconDraw; onClick: () => void } | undefined;
    if (body.s) {
      title = `${rarity} ${app.t(`special.${body.s}.name`)}`;
      lines.push(app.t('info.special'));
      const value = this.run.sellValue(body);
      action = { label: `${app.t('info.sell')}  ${value}`, icon: crystalIcon, onClick: () => this.sellBody(slot) };
    } else {
      title = `${rarity} ${app.t(`tier.${content.tiers[body.t - 1].id}`)}`;
      lines.push(app.t('info.tier', { n: body.t, total: goal }));
      if (body.t < goal) lines.push(app.t('info.makes', { name: app.t(`tier.${content.tiers[body.t].id}`) }));
      else lines.push(app.t('info.goal'));
    }
    this.info = new BodyInfo(this, {
      x: p.x,
      y: p.y,
      radius: this.board.cell / 2,
      texture: ensureAnyBodyTexture(this, body),
      title,
      titleColor: RARITY_CSS[body.r],
      lines,
      action,
      onClose: () => (this.infoClosed = { slot, at: performance.now() }),
    });
    this.infoSlot = slot;
    this.infoBody = body;
  }

  /** Hidden body sold for crystals (CLAUDE.md 4b item 9). It stays in the collection. */
  private sellBody(slot: number) {
    const body = this.run.s.board[slot];
    if (!body?.s) return;
    const value = this.run.sellValue(body);
    const p = this.board.slotPos(slot);
    this.closeInfo();
    this.run.removeBody(slot);
    this.board.sync();
    addCrystals(this, value, true);
    floatText(this, p.x, p.y - 30, app.t('crystal.got', { n: value }), { color: '#bff4ff', size: 40 });
    burst(this, p.x, p.y, 0x7fe8ff, 24, 380);
    app.audio.play('reward', { volume: 0.8 });
    this.refreshUi();
  }

  /**
   * Board full, nothing to merge, no slot to buy (CLAUDE.md 4b): after a few seconds a panel offers
   * to feed the weakest body to the core, or the same for energy x5 by ad, or the main menu.
   * Once per stuck spell: it comes back only after the board has moved again.
   */
  private checkStuck() {
    const run = this.run;
    if (!run.isStuck() || (run.s.finishedAt !== null && run.s.mode === 'speedrun')) {
      this.stuckSince = null;
      this.stuckShown = false;
      return;
    }
    if (this.stuckShown || !save.data.tutorial.includes('full')) return;
    if (!this.calm()) {
      this.stuckSince = null;
      return;
    }
    this.stuckSince ??= run.s.time;
    if (run.s.time - this.stuckSince < content.economy.rewarded.clearSlot.afterSec) return;
    this.stuckShown = true;
    this.showBoardFull();
  }

  private showBoardFull() {
    const run = this.run;
    const font = { fontFamily: app.theme.font, resolution: app.textResolution };
    // The body that would go: the weakest one, or the cheapest hidden one when only those are left.
    let slot = run.weakestSlot();
    if (slot < 0) {
      let best = Infinity;
      run.s.board.forEach((b, i) => {
        if (b?.s && i < run.slots && run.sellValue(b) < best) {
          best = run.sellValue(b);
          slot = i;
        }
      });
    }
    const body = run.s.board[slot];
    if (!body) return;
    // Landscape: the body on the left, the choices on the right, so it fits a 16:9 frame.
    const wide = !this.vp.portrait;
    const panel = this.openPanel({ title: app.t('full.title'), width: wide ? 900 : 640, height: wide ? 600 : 860 });
    const W = panel.panelWidth;
    const text = this.add
      .text(0, panel.top + 24, app.t('full.text'), { ...font, fontStyle: '700', fontSize: 28, color: app.theme.surfaceText, align: 'center', wordWrap: { width: W - 90 } })
      .setOrigin(0.5);
    const imgX = wide ? -W / 4 + 10 : 0;
    const imgY = wide ? panel.top + 180 : panel.top + 170;
    const img = this.add.image(imgX, imgY, ensureAnyBodyTexture(this, body)).setScale(wide ? 0.9 : 0.8);
    const name = body.s ? app.t(`special.${body.s}.name`) : app.t(`tier.${content.tiers[body.t - 1].id}`);
    const label = this.add
      .text(imgX, imgY + 100, `${app.t(`rarity.${content.rarities[body.r].id}`)} ${name}`, { ...font, fontStyle: '900', fontSize: 28, color: RARITY_CSS[body.r] })
      .setOrigin(0.5);
    panel.content.add([text, img, label]);
    const bx = wide ? W / 4 - 10 : 0;
    const bw = wide ? 380 : 440;
    const by = wide ? panel.top + 130 : panel.top + 340;
    if (body.s) {
      const sell = new Button(this, bx, by, {
        label: app.t('full.sell', { n: run.sellValue(body) }),
        icon: crystalIcon,
        width: bw,
        height: 96,
        fontSize: 32,
        onClick: () => {
          panel.close();
          this.sellBody(slot);
        },
      });
      panel.content.add(sell);
    } else {
      const feed = new Button(this, bx, by, {
        label: app.t('full.feed', { name }),
        width: bw,
        height: 96,
        fontSize: 32,
        onClick: () => {
          panel.close();
          this.feedToCore(slot, 1);
        },
      });
      if (feed.width > bw) feed.setScale(bw / feed.width);
      const mult = content.economy.rewarded.clearSlot.energyMult;
      const ad = rewardButton(this, bx, by + 112, {
        label: app.t('full.ad', { n: mult }),
        width: bw,
        height: 96,
        fontSize: 32,
        onReward: () => {
          panel.close();
          this.feedToCore(slot, mult);
        },
      });
      panel.content.add([feed, ad]);
    }
    const menuY = wide ? by + 220 : panel.bottom - 70;
    const menu = new Button(this, bx, menuY, {
      label: app.t('full.menu'),
      icon: icons.homeIcon,
      width: 300,
      height: 80,
      fontSize: 28,
      color: app.theme.surface,
      textColor: app.theme.surfaceText,
      onClick: () => app.toMenu(),
    });
    const ring = this.add.graphics();
    ring.lineStyle(3, 0xffffff, 0.22);
    ring.strokeRoundedRect(bx - 150, menuY - 40, 300, 80, app.theme.radius);
    const tip = this.add
      .text(0, wide ? panel.bottom - 40 : by + 210, app.t('full.tip'), { ...font, fontStyle: '700', fontSize: 22, color: app.theme.textDim, align: 'center', wordWrap: { width: W - 90 } })
      .setOrigin(0.5);
    panel.content.add([ring, menu, tip]);
  }

  /** The body goes into the core like a drag would; `mult` > 1 for the ad version. */
  private feedToCore(slot: number, mult: number) {
    const from = this.board.slotPos(slot);
    const value = this.run.absorb(slot);
    if (!value) return;
    if (mult > 1) this.run.addEnergy(value * (mult - 1));
    this.board.sync();
    this.beam(slot);
    this.core.hit(2);
    floatText(this, this.core.x, this.core.y - 60, app.t('reveal.absorbed', { n: formatNumber(value * mult) }), { color: '#ffd166', size: 56 });
    burst(this, from.x, from.y, 0xffb36b, 16, 300);
    burst(this, this.core.x, this.core.y, 0xffb36b, 24, 420);
    app.audio.play('reward', { volume: 0.7 });
    this.refreshUi();
  }

  // ---------- coming back ----------

  private welcomeBack() {
    // Back from a timed run: the main run's probes kept working while the player raced.
    const back = this.run.s.mode === 'main' && save.data.mainLeftAt > 0;
    const since = back ? save.data.mainLeftAt : save.lastSavedAt;
    if (back) save.data.mainLeftAt = 0;
    if (!back && (save.isNewPlayer || !save.lastSavedAt)) return;
    const seconds = secondsAway(since, Date.now(), this.run.stat('offlineCapHours') * 3600);
    const amount = this.run.offlineEarnings(seconds);
    if (amount <= 0) return;
    showOfflinePanel(this, {
      seconds,
      amount,
      adMultiplier: content.economy.rewarded.offlineMult,
      icon: (g, size, color) => energyIcon(g, size, color),
      iconColor: 0xffc23d,
      onCollect: (value) => {
        this.run.addEnergy(value);
        this.refreshUi();
      },
    });
  }

  /** Tab was hidden: probes kept working. Short breaks are credited quietly. */
  private creditAway(seconds: number) {
    const amount = this.run.offlineEarnings(seconds);
    if (amount <= 0) return;
    this.run.addEnergy(amount);
    toast(this, `+${formatNumber(amount)}`);
  }

  // ---------- tutorial ----------

  private queueOnce(id: string, steps: TutorialStep[]) {
    if (save.data.tutorial.includes(id) || this.queued.has(id)) return;
    this.queued.add(id);
    this.tutorial.queue(steps);
  }

  private queued = new Set<string>();

  private startIntro() {
    if (save.data.tutorial.includes('goal')) return;
    const coreRect = () => ({ x: this.core.x, y: this.core.y, w: this.core.radius * 2.2, h: this.core.radius * 2.2 });
    const scanRect = () => ({ x: this.scanBtn.x, y: this.scanBtn.y, w: 300, h: 108 });
    const desktop = !app.platform.isMobile();
    const steps: TutorialStep[] = [
      { id: 'tap', text: app.t(desktop ? 'tut.tapDesktop' : 'tut.tapMobile'), target: coreRect, done: () => this.tapsInStep >= 5 },
      { id: 'scan', text: app.t('tut.scan'), target: scanRect, done: () => this.run.s.scans >= 1 },
      { id: 'scan2', text: app.t('tut.scanAgain'), target: scanRect, done: () => this.run.s.scans >= 2 },
      {
        id: 'merge',
        text: app.t('tut.merge'),
        target: () => this.board.slotRect(1),
        dragTo: () => this.board.slotRect(0),
        done: () => this.run.s.merges >= 1,
      },
      { id: 'tapPower', text: app.t('tut.power'), target: coreRect, done: () => this.tapsInStep >= 5 },
      {
        id: 'goal',
        text: app.t('tut.goal'),
        target: () => ({ x: this.chainCenter.x, y: this.chainCenter.y, w: this.chainCenter.w, h: 70 }),
        ack: app.t('tut.ok'),
      },
    ];
    this.tutorial.queue(steps.filter((s) => !save.data.tutorial.includes(s.id)));
  }

  /** Teaches each new thing the first time it shows up. Runs with the UI refresh. */
  private checkTutorialTriggers() {
    if (!save.data.tutorial.includes('goal') || this.tutorial.active || this.revealOpen || this.decorLayer.arranging) return;
    const run = this.run;
    const focus = run.upgrade('focus');
    if (run.s.energy >= run.upgradeCost(focus) && run.level('focus') === 0) {
      this.shop.reveal('focus');
      this.queueOnce('buy', [{ id: 'buy', text: app.t('tut.upgrade'), target: () => this.shop.cardRect('focus'), done: () => run.level('focus') > 0 }]);
      return;
    }
    if (run.freeSlot() < 0 && !run.findPair()) {
      this.queueOnce('full', [{ id: 'full', text: app.t('tut.full'), target: () => ({ x: this.board.x, y: this.board.y, w: this.board.size, h: this.board.size }), ack: app.t('tut.ok') }]);
      return;
    }
    const probes = run.upgrade('probes');
    if (run.isVisible(probes) && run.level('probes') === 0 && run.s.energy >= run.upgradeCost(probes)) {
      this.shop.reveal('probes');
      this.queueOnce('probes', [
        { id: 'probes', text: app.t('tut.probes'), target: () => this.shop.cardRect('probes'), done: () => run.level('probes') > 0 },
        { id: 'tapStill', text: app.t('tut.tapStill'), target: () => ({ x: this.core.x, y: this.core.y, w: this.core.radius * 2.2, h: this.core.radius * 2.2 }), ack: app.t('tut.ok') },
      ]);
      return;
    }
    if (run.level('autoScan') > 0 && !save.data.tutorial.includes('autoScan')) {
      this.queueOnce('autoScan', [
        { id: 'autoScan', text: app.t('tut.autoScan'), target: () => ({ x: this.autoBtn.x, y: this.autoBtn.y, w: 176, h: 88 }), ack: app.t('tut.ok') },
      ]);
      return;
    }
    const boost = this.shop.currentBoost;
    if (boost && boost.wait <= 0 && !boost.blocked && !boost.id.startsWith('twin') && !save.data.tutorial.includes('reward')) {
      this.shop.reveal(BOOST_CARD);
      this.queueOnce('reward', [{ id: 'reward', text: app.t('tut.reward'), target: () => this.shop.cardRect(BOOST_CARD), ack: app.t('tut.ok') }]);
    }
  }

  private describe(u: UpgradeDef): string {
    const v = u.value ?? 0;
    const level = this.run.level(u.id);
    switch (u.stat) {
      case 'tapMult':
      case 'autoMult':
        return app.t(`upgrade.${u.id}.desc`, { v: trim(v) });
      case 'scanCostMult':
      case 'starRate':
        return app.t(`upgrade.${u.id}.desc`, { v: Math.round((1 - v) * 100) });
      case 'critChance':
      case 'tierUpChance':
      case 'twinChance':
        return app.t(`upgrade.${u.id}.desc`, { v: Math.round(v * 100) });
      case 'luck':
        return app.t(`upgrade.${u.id}.desc`, { v: Math.round(v * 100) });
      case 'spawnTier': {
        const next = Math.min(content.tiers.length, this.run.stat('spawnTier') + 1);
        return app.t(`upgrade.${u.id}.desc`, { next: app.t(`tier.${content.tiers[next - 1].id}`) });
      }
      case 'autoScanEvery':
      case 'autoMergeEvery': {
        const values = u.values ?? [];
        return app.t(`upgrade.${u.id}.desc`, { v: trim(values[Math.min(level, values.length - 1)]) });
      }
      default:
        return app.t(`upgrade.${u.id}.desc`, { v: trim(v) });
    }
  }
}

function trim(n: number) {
  return String(Math.round(n * 100) / 100);
}

/** "Epic" -> "an Epic", "Rare" -> "a Rare" (English string only). */
function withArticle(word: string) {
  return `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`;
}

/** Radar sweep for the scan button. */
const scanIcon: icons.IconDraw = (g, size, color) => {
  const s = size / 2;
  g.lineStyle(size * 0.09, color, 1);
  g.strokeCircle(0, 0, s * 0.8);
  g.strokeCircle(0, 0, s * 0.42);
  g.fillStyle(color, 1);
  g.fillTriangle(0, 0, s * 0.8, -s * 0.35, s * 0.8, s * 0.2);
};
