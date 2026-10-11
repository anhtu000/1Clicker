import Phaser from 'phaser';
import {
  app,
  BaseScene,
  Button,
  burst,
  DebugOverlay,
  FixedStep,
  floatText,
  formatDuration,
  formatNumber,
  icons,
  punch,
  rewardButton,
  secondsAway,
  soundButton,
  toast,
  type ViewportInfo,
} from '@core';
import { save } from '../save';

// Framework demo. It touches every core feature so the framework can be checked on a phone:
// tap feedback, upgrades, idle income, offline income, rewarded ad, pause, sound, layout, delta time.
// Game #1 replaces this scene.

const ORBIT_SPEED = Math.PI / 2; // radians per second: one lap every 4 seconds at any frame rate

export class PlayScene extends BaseScene {
  private orb!: Phaser.GameObjects.Container;
  private orbBody!: Phaser.GameObjects.Arc;
  private comet!: Phaser.GameObjects.Arc;
  private coinsText!: Phaser.GameObjects.Text;
  private rateText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private stars!: Phaser.GameObjects.Graphics;
  private starList: { x: number; y: number; r: number; speed: number }[] = [];
  private buyTap!: Button;
  private buyAuto!: Button;
  private reward!: Button;
  private pauseBtn!: Button;
  private soundBtn!: Button;
  private orbitAngle = 0;
  private orbitRadius = 200;
  private income = new FixedStep(100, (sec) => this.addCoins(save.data.perSecond * sec, false));
  // Measures orbit speed against the wall clock, to prove movement follows real time.
  private measure = { start: 0, angle: 0 };

  constructor() {
    super('Play', { gameplay: true });
  }

  protected build() {
    const theme = app.theme;
    this.stars = this.add.graphics();
    for (let i = 0; i < 90; i++) {
      this.starList.push({ x: Math.random(), y: Math.random(), r: Phaser.Math.FloatBetween(1, 3.2), speed: Phaser.Math.FloatBetween(8, 40) });
    }

    this.orbBody = this.add.circle(0, 0, 150, theme.primary);
    const shine = this.add.circle(-45, -50, 46, 0xffffff, 0.22);
    this.orb = this.add.container(0, 0, [this.orbBody, shine]);
    this.orb.setSize(300, 300);
    this.orb.setInteractive(new Phaser.Geom.Circle(150, 150, 165), Phaser.Geom.Circle.Contains);
    this.orb.on('pointerdown', (p: Phaser.Input.Pointer) => this.tap(p.worldX, p.worldY));
    this.comet = this.add.circle(0, 0, 14, 0xffffff);

    this.coinsText = this.text(0, 0, '', 84).setOrigin(0.5);
    this.rateText = this.text(0, 0, '', 32, theme.textDim, '700').setOrigin(0.5);
    this.hint = this.text(0, 0, app.t('demo.hint'), 40, theme.text).setOrigin(0.5);
    this.tweens.add({ targets: this.hint, alpha: 0.35, duration: 700, yoyo: true, repeat: -1 });

    this.buyTap = new Button(this, 0, 0, { label: '', width: 420, height: 100, fontSize: 32, sound: false, onClick: () => this.buy('tap') });
    this.buyAuto = new Button(this, 0, 0, { label: '', width: 420, height: 100, fontSize: 32, sound: false, onClick: () => this.buy('auto') });
    this.reward = rewardButton(this, 0, 0, {
      label: app.t('demo.rewardDouble'),
      width: 420,
      onReward: () => {
        app.audio.play('reward');
        this.addCoins(Math.max(10, save.data.coins), true);
        burst(this, this.orb.x, this.orb.y, theme.reward, 28, 560);
      },
    });
    this.pauseBtn = new Button(this, 0, 0, {
      icon: icons.pauseIcon,
      width: 96,
      height: 96,
      color: theme.surface,
      textColor: theme.surfaceText,
      onClick: () => app.openPause(this),
    });
    this.soundBtn = soundButton(this, 0, 0);
    this.input.keyboard?.on('keydown-ESC', () => app.openPause(this));

    this.creditAway(secondsAway(save.lastSavedAt));
    // Coming back to the tab: credit the time spent away, like offline income.
    const offResume = app.pause.on('resume', (ms) => {
      this.measure.start = 0;
      this.creditAway(ms / 1000);
    });
    // Scene events outlive a restart, so listeners added here are removed on shutdown.
    const onSceneResume = () => (this.measure.start = 0);
    this.events.on(Phaser.Scenes.Events.RESUME, onSceneResume);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offResume();
      this.events.off(Phaser.Scenes.Events.RESUME, onSceneResume);
    });

    this.refresh();
  }

  protected layout(vp: ViewportInfo) {
    const s = vp.safe;
    this.pauseBtn.setPosition(80, 80);
    this.soundBtn.setPosition(vp.width - 80, 80);
    if (vp.portrait) {
      // Phone: counter on top, orb in the middle, shop below. The shop never covers the orb.
      this.coinsText.setPosition(vp.width / 2, s.y + 190);
      this.rateText.setPosition(vp.width / 2, s.y + 260);
      this.orb.setPosition(vp.width / 2, s.y + 560);
      const bottom = vp.height - 90;
      this.reward.setPosition(vp.width / 2, bottom - 280);
      this.buyTap.setPosition(vp.width / 2, bottom - 140);
      this.buyAuto.setPosition(vp.width / 2, bottom);
    } else {
      // Desktop 16:9: orb on the left, shop in a column on the right.
      const left = s.x + s.width * 0.36;
      const right = s.x + s.width * 0.78;
      this.coinsText.setPosition(left, s.y + 110);
      this.rateText.setPosition(left, s.y + 180);
      this.orb.setPosition(left, s.y + 440);
      this.reward.setPosition(right, s.y + 260);
      this.buyTap.setPosition(right, s.y + 400);
      this.buyAuto.setPosition(right, s.y + 540);
    }
    this.orbitRadius = 215;
    this.hint.setPosition(this.orb.x, this.orb.y + 215);
  }

  update(_time: number, delta: number) {
    // Movement scaled by delta: same speed at 30, 60 or 144 fps.
    this.orbitAngle += ORBIT_SPEED * (delta / 1000);
    this.comet.setPosition(
      this.orb.x + Math.cos(this.orbitAngle) * this.orbitRadius,
      this.orb.y + Math.sin(this.orbitAngle) * this.orbitRadius,
    );
    this.income.update(delta);
    this.drawStars(delta);

    if (!this.measure.start) this.measure = { start: performance.now(), angle: this.orbitAngle };
    const elapsed = (performance.now() - this.measure.start) / 1000;
    if (elapsed > 1) {
      const speed = (this.orbitAngle - this.measure.angle) / elapsed;
      DebugOverlay.extra[app.t('demo.speed')] = `${speed.toFixed(3)} rad/s (want ${ORBIT_SPEED.toFixed(3)})`;
    }
  }

  private drawStars(delta: number) {
    const { width, height } = this.vp;
    this.stars.clear();
    for (const star of this.starList) {
      star.y += (star.speed * delta) / 1000 / height;
      if (star.y > 1) star.y -= 1;
      this.stars.fillStyle(0xffffff, 0.25 + star.r / 6);
      this.stars.fillCircle(star.x * width, star.y * height, star.r);
    }
  }

  private tap(x: number, y: number) {
    save.data.taps += 1;
    this.addCoins(save.data.perTap, false);
    floatText(this, x, y - 30, `+${formatNumber(save.data.perTap)}`, { color: '#ffffff', size: 46 });
    punch(this, this.orb, 0.08);
    app.audio.play('tap', { pitchJitter: 120, volume: 0.8 });
    app.haptic(6);
    if (save.data.taps % 25 === 0) burst(this, x, y, app.theme.primary, 12);
    if (this.hint.visible && save.data.taps >= 3) this.hint.setVisible(false);
  }

  private cost(kind: 'tap' | 'auto') {
    const level = kind === 'tap' ? save.data.perTap - 1 : save.data.perSecond;
    const base = kind === 'tap' ? 10 : 25;
    return Math.floor(base * 1.35 ** level);
  }

  private buy(kind: 'tap' | 'auto') {
    const price = this.cost(kind);
    if (save.data.coins < price) return;
    save.data.coins -= price;
    if (kind === 'tap') save.data.perTap += 1;
    else save.data.perSecond += 1;
    const button = kind === 'tap' ? this.buyTap : this.buyAuto;
    app.audio.play('buy');
    app.haptic(15);
    punch(this, button, 0.06);
    burst(this, button.x, button.y, app.theme.primary, 16);
    this.refresh();
  }

  private addCoins(amount: number, pop: boolean) {
    save.data.coins += amount;
    if (pop) punch(this, this.coinsText, 0.15);
    this.refresh();
  }

  private creditAway(seconds: number) {
    const earned = Math.floor(seconds * save.data.perSecond);
    if (earned < 1 || seconds < 5) return;
    this.addCoins(earned, true);
    toast(this, app.t('demo.away', { n: formatNumber(earned), t: formatDuration(seconds, app.i18n.durationUnits()) }), 3200);
  }

  private refresh() {
    const d = save.data;
    this.coinsText.setText(formatNumber(d.coins));
    this.rateText.setText(app.t('demo.perSecond', { n: formatNumber(d.perSecond) }));
    this.buyTap.setLabel(`${app.t('demo.upgradeTap')}  ·  ${formatNumber(this.cost('tap'))}`);
    this.buyAuto.setLabel(`${app.t('demo.upgradeAuto')}  ·  ${formatNumber(this.cost('auto'))}`);
    this.buyTap.setEnabled(d.coins >= this.cost('tap'));
    this.buyAuto.setEnabled(d.coins >= this.cost('auto'));
  }
}
