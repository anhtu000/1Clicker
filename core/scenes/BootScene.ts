import Phaser from 'phaser';
import { app } from '../app';
import { createFxTextures } from '../fx';
import { hexToNumber } from '../theme';

/**
 * Loading screen. Draws a progress bar while the game's assets load, then opens the menu or the game.
 * It is a plain Phaser scene because the bar must exist during preload(), before create().
 */
export class BootScene extends Phaser.Scene {
  private bar!: Phaser.GameObjects.Graphics;
  private title!: Phaser.GameObjects.Text;
  private label!: Phaser.GameObjects.Text;
  private progress = 0;

  constructor() {
    super({ key: 'Boot' });
  }

  preload() {
    // The HTML spinner covers the page until Phaser is ready to draw.
    document.getElementById('boot-spinner')?.remove();
    const font = { fontFamily: app.theme.font, resolution: app.textResolution };
    this.title = this.add.text(0, 0, app.config.title, { ...font, fontStyle: '900', fontSize: 64, color: app.theme.text });
    this.label = this.add.text(0, 0, app.t('core.loading'), {
      ...font,
      fontStyle: '700',
      fontSize: 30,
      color: app.theme.textDim,
    });
    this.title.setOrigin(0.5);
    this.label.setOrigin(0.5);
    this.bar = this.add.graphics();
    this.place();
    const offResize = app.viewport.on('change', () => this.place());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offResize);

    this.load.on(Phaser.Loader.Events.PROGRESS, (value: number) => {
      this.progress = value;
      this.drawBar();
    });
    app.config.preload?.(this);
  }

  create() {
    this.progress = 1;
    this.drawBar();
    createFxTextures(this);
    app.platform.loadingStop();
    // A short beat so a fast load does not flash.
    this.time.delayedCall(120, () => this.scene.start(app.startScene()));
  }

  private place() {
    const vp = app.viewport.info;
    app.viewport.applyTo(this.cameras.main);
    const cx = vp.width / 2;
    const cy = vp.height / 2;
    this.title.setPosition(cx, cy - 90);
    this.label.setPosition(cx, cy + 70);
    this.bar.setPosition(cx, cy);
    this.drawBar();
  }

  private drawBar() {
    const w = Math.min(560, app.viewport.info.width * 0.7);
    const h = 28;
    this.bar.clear();
    this.bar.fillStyle(0xffffff, 0.12);
    this.bar.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    this.bar.fillStyle(hexToNumber(app.theme.text), 1);
    this.bar.fillRoundedRect(-w / 2, -h / 2, Math.max(h, w * this.progress), h, h / 2);
  }
}
