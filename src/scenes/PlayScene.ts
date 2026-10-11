import Phaser from 'phaser';
import {
  app,
  BaseScene,
  Button,
  burst,
  FixedStep,
  floatText,
  formatDuration,
  formatNumber,
  icons,
  secondsAway,
  showOfflinePanel,
  soundButton,
  toast,
  Tutorial,
  type TutorialStep,
  type ViewportInfo,
} from '@core';
import { content } from '../game/content';
import type { UpgradeDef } from '../logic/content.ts';
import { newRunState, Run, type MergeResult, type NewBody } from '../logic/run.ts';
import { SpaceBackground } from '../render/background';
import { ensureBodyTexture } from '../render/bodies';
import { energyIcon, UPGRADE_ICONS } from '../render/icons';
import { RARITY_COLOR, RARITY_CSS } from '../render/palette';
import { applyPreset } from '../game/presets';
import { preset, save } from '../save';
import { Board } from '../ui/Board';
import { Core } from '../ui/Core';
import { showReveal } from '../ui/Reveal';
import { ShootingStar } from '../ui/ShootingStar';
import { BOOST_CARD, UpgradeList, type Boost } from '../ui/UpgradeList';

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
  private pauseBtn!: Button;
  private soundBtn!: Button;
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
    if (preset) applyPreset(preset, save.data);
    if (!save.data.run) save.data.run = newRunState(content, 'main', app.rng.int(1, 2 ** 31 - 1));
    this.run = new Run(content, save.data.run, save.data.codex);

    this.bg = new SpaceBackground(this);
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

    this.pauseBtn = new Button(this, 0, 0, {
      icon: icons.pauseIcon,
      width: 88,
      height: 88,
      color: app.theme.surface,
      textColor: app.theme.surfaceText,
      onClick: () => app.openPause(this),
    }).setDepth(30);
    this.soundBtn = soundButton(this, 0, 0, 88).setDepth(30);
    this.input.keyboard?.on('keydown-ESC', () => app.openPause(this));
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
    this.shownEnergy = this.run.s.energy;
    this.startIntro();
    this.welcomeBack();

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
      this.scanBtn.setPosition(cx, rowY);
      this.shop.layout(0, stripTop, vp.width, stripH, true);
      this.pauseBtn.setPosition(56, y0 + 56);
      this.soundBtn.setPosition(vp.width - 56, y0 + 56);
    } else {
      // Desktop 16:9: core and scan on the left, board in the middle, shop column on the right.
      const leftX = s.x + 200;
      this.placeEnergy(leftX, s.y + 66);
      this.rateText.setPosition(leftX, s.y + 116);
      this.core.setPosition(leftX, s.y + 272);
      this.core.setRadius(88);
      this.placeChain(leftX, s.y + 430, 360);
      this.scanBtn.setPosition(leftX, s.y + 560);
      const cell = 132;
      this.board.layout(s.x + 660, s.y + 372, cell);
      // The column runs to the bottom of the screen: frames taller than 16:9 show more cards.
      this.shop.layout(s.x + s.width - 330, s.y + 110, 316, vp.height - s.y - 110 - 16, false);
      // Pause and sound sit together above the shop column, clear of the energy counter.
      this.soundBtn.setPosition(s.x + s.width - 56, s.y + 52);
      this.pauseBtn.setPosition(s.x + s.width - 160, s.y + 52);
    }
    this.energyY = this.energyText.y;
    this.goalLabel.setPosition(this.chainCenter.x, this.chainCenter.y + 42);
  }

  private chainCenter = { x: 0, y: 0, w: 0 };
  private energyY = 0;

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
    this.bg.update(delta);
    if (!this.revealOpen) this.step.update(delta);
    // Count up the energy display smoothly instead of jumping.
    const target = this.run.s.energy;
    this.shownEnergy += (target - this.shownEnergy) * Math.min(1, delta / 90);
    if (Math.abs(target - this.shownEnergy) < 1) this.shownEnergy = target;
    this.energyText.setText(formatNumber(this.shownEnergy));
    this.placeEnergy(this.vp.portrait ? this.vp.width / 2 : this.vp.safe.x + 200, this.energyY);

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
    this.shop.refresh();
    this.checkTutorialTriggers();
  }

  // ---------- actions ----------

  private spaceAllowed() {
    const id = this.tutorial.currentId;
    return !this.revealOpen && (!id || id === 'tap' || id === 'tapPower') && !app.platform.isMobile();
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
    if (run.canMerge(from, to)) {
      this.board.slide(from, to, () => {
        const result = run.merge(from, to);
        if (!result) return this.board.sync();
        this.board.sync([result.slot, ...(result.twin ? [result.twin.slot] : [])]);
        this.mergeFx(result);
        this.offerCopy(result);
        this.refreshUi();
      });
    } else if (!run.s.board[to]) {
      if (run.move(from, to)) this.board.moved(from, to);
      else this.board.sync();
    } else if (run.swap(from, to)) {
      this.board.swapped(from, to);
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

  /** Reveals wait for each other: one Merge All can make several Epic or rarer bodies at once. */
  private revealQueue: NewBody[] = [];

  private reveal(result: NewBody) {
    if (this.revealOpen) {
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
    // Pitch rises with tier, so climbing the chain sounds like progress.
    app.audio.play('buy', { volume: 0.9, pitchJitter: 0 });
    app.haptic(12);
    app.moments.emit('merge', { level: result.body.t });
    if (result.twin) {
      const q = this.board.slotPos(result.twin.slot);
      floatText(this, q.x, q.y - 40, app.t('reveal.twin'), { color: '#9fd8ff', size: 40 });
      burst(this, q.x, q.y, 0x9fd8ff, 16, 300);
    }
    this.announce(result, false);
    if (result.finished) this.finish();
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

  /**
   * Which boost the card shows. One card, so the shop strip on a phone keeps room for upgrades:
   * the copy offer right after a merge, else merge all when it clears 2+ pairs, else lucky scan,
   * else merge all for a single pair; when none is ready, a countdown to the next one.
   */
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

    // Hidden until the first one is due, so the opening minutes are about tapping (economy.rewarded.firstAt).
    const shown = (['luckyScan', 'mergeAll'] as const).filter((id) => run.s.time >= rw[id].firstAt);
    if (!shown.length) return null;
    const pairs = run.pairCount();
    const room = run.freeSlot() >= 0;
    const lucky = (): Boost => ({
      id: 'luckyScan',
      name: app.t('boost.lucky'),
      desc: app.t('boost.luckyDesc'),
      icon: UPGRADE_ICONS.luck,
      wait: run.rewardWait('luckyScan'),
      blocked: room ? undefined : app.t('scan.full'),
      onReward: () => this.useLucky(),
    });
    const mergeAll = (): Boost => ({
      id: 'mergeAll',
      name: app.t('boost.mergeAll'),
      desc: app.t('boost.mergeAllDesc'),
      icon: UPGRADE_ICONS.autoMerge,
      wait: run.rewardWait('mergeAll'),
      blocked: pairs > 0 ? undefined : app.t('boost.noPairs'),
      onReward: () => this.useMergeAll(),
    });
    const ready = (id: 'luckyScan' | 'mergeAll') => shown.includes(id) && run.rewardReady(id);
    if (ready('mergeAll') && pairs >= 2) return mergeAll();
    if (ready('luckyScan') && room) return lucky();
    if (ready('mergeAll') && pairs >= 1) return mergeAll();
    // Nothing usable now: show the ready one that is blocked, or count down to the next one.
    if (ready('luckyScan')) return lucky();
    if (ready('mergeAll')) return mergeAll();
    const next = shown.reduce((a, b) => (run.rewardWait(a) <= run.rewardWait(b) ? a : b));
    return next === 'luckyScan' ? lucky() : mergeAll();
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

  private useMergeAll() {
    const results = this.run.mergeAll();
    this.run.useReward('mergeAll', app.ads.rewardsAreFree);
    this.board.sync(results.flatMap((r) => [r.slot, ...(r.twin ? [r.twin.slot] : [])]));
    results.forEach((r, i) => this.time.delayedCall(i * 90, () => this.mergeFx(r)));
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

  private finish() {
    const runMs = Math.round((this.run.s.finishedAt ?? this.run.s.time) * 1000);
    app.moments.emit('finish', { runMs });
    app.platform.happyTime();
    if (this.run.s.mode === 'main' && !save.data.firstFinishMs) save.data.firstFinishMs = runMs;
    if (this.run.s.mode === 'speedrun' && (!save.data.bestRunMs || runMs < save.data.bestRunMs)) save.data.bestRunMs = runMs;
    toast(this, `${app.t('finish.title')}  ${app.t('finish.time', { t: formatDuration(runMs / 1000, app.i18n.durationUnits()) })}`, 4000);
  }

  // ---------- coming back ----------

  private welcomeBack() {
    if (save.isNewPlayer || !save.lastSavedAt) return;
    const seconds = secondsAway(save.lastSavedAt, Date.now(), this.run.stat('offlineCapHours') * 3600);
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
    if (!save.data.tutorial.includes('goal') || this.tutorial.active || this.revealOpen) return;
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

/** Radar sweep for the scan button. */
const scanIcon: icons.IconDraw = (g, size, color) => {
  const s = size / 2;
  g.lineStyle(size * 0.09, color, 1);
  g.strokeCircle(0, 0, s * 0.8);
  g.strokeCircle(0, 0, s * 0.42);
  g.fillStyle(color, 1);
  g.fillTriangle(0, 0, s * 0.8, -s * 0.35, s * 0.8, s * 0.2);
};
