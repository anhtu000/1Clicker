import Phaser from 'phaser';
import { app, BaseScene, Button, formatNumber, icons, soundButton, type ViewportInfo } from '@core';
import { content } from '../game/content';
import { dailyClaimable, openDaily, takeDailyOffer } from '../game/meta';
import game from '../game.json';
import { isSpecialKey, newRunState, Run } from '../logic/run.ts';
import { SpaceBackground } from '../render/background';
import { ensureAuraTexture, ensureBodyTexture } from '../render/bodies';
import { collectionIcon, crystalIcon, decorIcon, stopwatchIcon, trophyIcon } from '../render/icons';
import { save } from '../save';
import { showCollection } from '../ui/CollectionPanel';
import { showDecorShop } from '../ui/DecorShop';
import { showRecords } from '../ui/RecordsPanel';

/**
 * Home screen for returning players (CLAUDE.md 4b, menu: 'returning'). New players skip it and land in the game.
 * Continue, a timed run once a Galaxy has been made, the collection, the decor shop, records, and the daily gift.
 * No ads on any of these buttons: they are navigation (CrazyGames rule).
 */
export class HomeScene extends BaseScene {
  private bg!: SpaceBackground;
  private title!: Phaser.GameObjects.Text;
  private hero!: Phaser.GameObjects.Image;
  private heroGlow!: Phaser.GameObjects.Image;
  private play!: Button;
  private timed: Button | null = null;
  private tiles: Button[] = [];
  private giftBtn!: Button;
  private giftDot!: Phaser.GameObjects.Graphics;
  private soundBtn!: Button;
  private gem!: Phaser.GameObjects.Graphics;
  private crystals!: Phaser.GameObjects.Text;
  private busy = false;

  constructor() {
    super('Home');
  }

  protected build() {
    app.gameplay.stop();
    this.busy = false;
    this.tiles = [];
    this.timed = null;
    const font = { fontFamily: app.theme.font, resolution: app.textResolution };
    this.bg = new SpaceBackground(this, save.data.decor.bg);

    // The furthest body this player has made, slowly turning.
    const main = save.data.run;
    const top = save.data.firstFinishMs > 0 ? content.economy.goalTier : Math.max(1, main?.highestTier ?? 1);
    const best = Object.keys(save.data.codex.found)
      .filter((k) => !isSpecialKey(k) && Number(k.split('.')[0]) === top)
      .map((k) => Number(k.split('.')[1]))
      .reduce((a, b) => Math.max(a, b), 0);
    this.heroGlow = this.add.image(0, 0, ensureAuraTexture(this, Math.max(1, best))).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.7);
    this.hero = this.add.image(0, 0, ensureBodyTexture(this, top, best));
    this.tweens.add({ targets: [this.hero, this.heroGlow], angle: 360, duration: 40000, repeat: -1 });

    this.title = this.add.text(0, 0, game.title, { ...font, fontStyle: '900', fontSize: 84, color: '#ffffff', align: 'center' }).setOrigin(0.5);
    this.title.setShadow(0, 6, '#00000088', 10, false, true);
    // Hidden switch for phone testing (web build only): 5 quick taps on the title show the debug box.
    // Not in the portal build, where a player tapping the title could open it by accident.
    let taps: number[] = [];
    if (__TARGET__ === 'web') this.title.setInteractive().on('pointerdown', () => {
      const now = performance.now();
      taps = [...taps.filter((t) => now - t < 2000), now];
      if (taps.length >= 5) {
        taps = [];
        app.toggleDebug();
      }
    });

    this.play = new Button(this, 0, 0, { label: app.t('menu.continue'), width: 440, height: 116, fontSize: 48, onClick: () => this.go() });
    this.tweens.add({ targets: this.play, scale: 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    if (save.data.firstFinishMs > 0) {
      this.timed = new Button(this, 0, 0, {
        label: app.t('menu.timed'),
        icon: stopwatchIcon,
        width: 440,
        height: 92,
        fontSize: 34,
        color: app.theme.surface,
        textColor: app.theme.surfaceText,
        onClick: () => this.startTimed(),
      });
    }
    const tile = (label: string, icon: icons.IconDraw, onClick: () => void) => {
      const b = new Button(this, 0, 0, { label, icon, width: 260, height: 84, fontSize: 28, color: app.theme.surface, textColor: app.theme.surfaceText, onClick });
      this.tiles.push(b);
      return b;
    };
    tile(app.t('menu.collection'), collectionIcon, () => this.collection());
    tile(app.t('menu.decor'), decorIcon, () => this.decorShop());
    if (save.data.records.length) tile(app.t('menu.records'), trophyIcon, () => this.panel(() => showRecords(this, null, () => (this.busy = false))));
    this.giftBtn = tile(app.t('menu.daily'), icons.giftIcon, () => this.daily());
    this.giftDot = this.add.graphics();
    this.giftDot.fillStyle(0xff5a6e, 1);
    this.giftDot.fillCircle(0, 0, 12);
    this.giftDot.lineStyle(3, 0xffffff, 1);
    this.giftDot.strokeCircle(0, 0, 12);

    this.soundBtn = soundButton(this, 0, 0, 88);
    this.gem = this.add.graphics();
    crystalIcon(this.gem, 40, 0x7fe8ff);
    this.crystals = this.add.text(0, 0, '', { ...font, fontStyle: '900', fontSize: 36, color: '#bff4ff' }).setOrigin(1, 0.5);
    this.refresh();
    // The daily gift opens by itself the first time the screen shows today.
    if (takeDailyOffer()) this.time.delayedCall(350, () => this.daily());
  }

  update(_t: number, delta: number) {
    this.bg.update(delta);
  }

  protected layout(vp: ViewportInfo) {
    const cx = vp.width / 2;
    const s = vp.safe;
    this.bg.layout();
    this.soundBtn.setPosition(s.x + 56, s.y + 56);
    this.crystals.setPosition(vp.width - s.x - 24, s.y + 56);
    this.gem.setPosition(this.crystals.x - this.crystals.width - 30, s.y + 56);
    const portrait = vp.portrait;
    this.title.setFontSize(portrait ? 76 : 80).setWordWrapWidth(s.width - 80);
    // Tiles two by two; a last tile alone in its row is centered.
    const placeTiles = (x: number, y: number, rowH: number) =>
      this.tiles.forEach((b, i) => {
        const alone = i === this.tiles.length - 1 && i % 2 === 0;
        b.setPosition(alone ? x : x + (i % 2 ? 140 : -140), y + Math.floor(i / 2) * rowH);
      });
    const rows = Math.ceil(this.tiles.length / 2);
    if (portrait) {
      const y0 = s.y + s.height * 0.12;
      this.title.setPosition(cx, y0 + 40);
      this.hero.setPosition(cx, y0 + 300).setScale(1.5);
      this.heroGlow.setPosition(cx, y0 + 300).setScale(2.4);
      this.play.setPosition(cx, y0 + 560);
      this.timed?.setPosition(cx, y0 + 680);
      placeTiles(cx, y0 + (this.timed ? 810 : 710), 104);
    } else {
      // Title and the body on the left, buttons on the right, both centered in the height.
      const leftX = s.x + s.width * 0.28;
      this.title.setWordWrapWidth(s.width * 0.5).setPosition(leftX, s.y + 130);
      this.hero.setPosition(leftX, s.y + 440).setScale(1.7);
      this.heroGlow.setPosition(leftX, s.y + 440).setScale(2.6);
      const rightX = s.x + s.width * 0.72;
      const blockH = 116 + (this.timed ? 118 : 0) + 30 + rows * 100;
      const top = s.y + (s.height - blockH) / 2 + 58;
      this.play.setPosition(rightX, top);
      this.timed?.setPosition(rightX, top + 118);
      placeTiles(rightX, top + (this.timed ? 118 : 0) + 136, 100);
    }
    this.giftDot.setPosition(this.giftBtn.x + 118, this.giftBtn.y - 34);
  }

  private refresh() {
    this.crystals.setText(formatNumber(save.data.crystals));
    this.giftDot.setVisible(dailyClaimable());
    if (this.vp) this.layout(this.vp);
  }

  /** One panel at a time; `busy` clears when it closes. */
  private panel(open: () => void) {
    if (this.busy) return;
    this.busy = true;
    open();
  }

  /**
   * Continue always opens the main run (bug 13/10: it resumed an unfinished or finished timed run).
   * A timed run left open is dropped, as "Leave timed run" does; probes kept earning meanwhile.
   */
  private go() {
    if (this.busy) return;
    this.busy = true;
    if (save.data.mode === 'speedrun') {
      save.data.mode = 'main';
      save.data.speedrun = null;
      save.flush();
    }
    this.scene.start('Play');
  }

  /** A fresh timed run. The main run waits, and its probes keep earning (welcome back on return). */
  private startTimed() {
    if (this.busy) return;
    this.busy = true;
    if (save.data.mode === 'main') save.data.mainLeftAt = Date.now();
    save.data.speedrun = newRunState(content, 'speedrun', app.rng.int(1, 2 ** 31 - 1));
    save.data.mode = 'speedrun';
    save.flush();
    this.scene.start('Play');
  }

  private mainRun(): Run {
    if (!save.data.run) save.data.run = newRunState(content, 'main', app.rng.int(1, 2 ** 31 - 1));
    return new Run(content, save.data.run, save.data.codex);
  }

  private collection() {
    this.panel(() => {
      const run = this.mainRun();
      const found = save.data.codex.found;
      showCollection(
        this,
        { content, found, odds: run.rarityOdds(), pity: content.pity.map((rule, i) => ({ rarity: rule.minTier, left: run.pityLeft(i) })) },
        () => (this.busy = false),
      );
    });
  }

  private decorShop() {
    save.data.decorNew = false;
    this.panel(() =>
      showDecorShop(this, {
        onBackground: (id) => this.bg.setTheme(id),
        onClose: () => {
          this.busy = false;
          this.refresh();
        },
      }),
    );
  }

  private daily() {
    this.panel(() =>
      openDaily(
        this,
        null,
        () => this.refresh(),
        () => {
          this.busy = false;
          this.refresh();
        },
      ),
    );
  }
}
