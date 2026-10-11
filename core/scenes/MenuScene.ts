import Phaser from 'phaser';
import { app } from '../app';
import { Button } from '../ui/button';
import { soundButton } from '../ui/widgets';
import type { ViewportInfo } from '../viewport';
import { BaseScene } from './BaseScene';

/** Main menu: title, Play/Continue, sound toggle, and a language button when the game has more than one. */
export class MenuScene extends BaseScene {
  private title!: Phaser.GameObjects.Text;
  private play!: Button;
  private soundBtn!: Button;
  private lang: Button | null = null;
  private glow!: Phaser.GameObjects.Graphics;

  constructor() {
    super('Menu');
  }

  protected build() {
    app.gameplay.stop();
    this.glow = this.add.graphics();
    this.title = this.text(0, 0, app.config.title, 92).setOrigin(0.5).setAlign('center');
    this.title.setShadow(0, 6, '#00000066', 0, false, true);
    // Hidden switch for phone testing: 5 quick taps on the title show the debug box.
    let taps: number[] = [];
    this.title.setInteractive().on('pointerdown', () => {
      const now = performance.now();
      taps = [...taps.filter((t) => now - t < 2000), now];
      if (taps.length >= 5) {
        taps = [];
        app.toggleDebug();
      }
    });
    this.play = new Button(this, 0, 0, {
      label: app.t(app.save.isNewPlayer ? 'core.play' : 'core.continue'),
      width: 420,
      height: 120,
      fontSize: 50,
      onClick: () => this.scene.start(app.config.playScene),
    });
    this.soundBtn = soundButton(this, 0, 0);
    const langs = app.i18n.languages;
    if (langs.length > 1) {
      this.lang = new Button(this, 0, 0, {
        label: app.i18n.nameOf(app.i18n.lang),
        width: 260,
        height: 96,
        fontSize: 32,
        color: app.theme.surface,
        textColor: app.theme.surfaceText,
        onClick: () => {
          const next = langs[(langs.indexOf(app.i18n.lang) + 1) % langs.length];
          void app.setLanguage(next);
        },
      });
    }
    // Gentle breathing on the Play button draws the eye without a tutorial.
    this.tweens.add({ targets: this.play, scale: 1.04, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
  }

  protected layout(vp: ViewportInfo) {
    const cx = vp.width / 2;
    const safe = vp.safe;
    this.title.setFontSize(vp.portrait ? 84 : 96);
    this.title.setWordWrapWidth(safe.width - 80);
    this.title.setPosition(cx, safe.y + safe.height * (vp.portrait ? 0.3 : 0.32));
    this.play.setPosition(cx, safe.y + safe.height * (vp.portrait ? 0.58 : 0.64));
    this.soundBtn.setPosition(vp.width - 80, 80);
    this.lang?.setPosition(cx, this.play.y + 150);

    this.glow.clear();
    const r = Math.max(vp.width, vp.height) * 0.55;
    for (let i = 0; i < 6; i++) {
      this.glow.fillStyle(0xffffff, 0.025);
      this.glow.fillCircle(cx, this.title.y, r * (1 - i * 0.14));
    }
  }
}
