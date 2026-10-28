import Phaser from 'phaser';
import { app } from '../app';
import { Button } from '../ui/button';
import { confirmPanel } from '../ui/confirm';
import { homeIcon, playIcon } from '../ui/icons';
import { musicButton, soundButton } from '../ui/widgets';
import type { ViewportInfo } from '../viewport';
import { BaseScene } from './BaseScene';

/** Pause overlay on top of a gameplay scene. Open it with app.openPause(scene). */
export class PauseScene extends BaseScene {
  private from = '';
  private dim!: Phaser.GameObjects.Rectangle;
  private panel!: Phaser.GameObjects.Graphics;
  private title!: Phaser.GameObjects.Text;
  private resume!: Button;
  private menu: Button | null = null;
  private soundBtn!: Button;
  private musicBtn: Button | null = null;

  constructor() {
    super('Pause');
  }

  protected build(data?: { from?: string }) {
    this.from = data?.from ?? app.config.playScene;
    // Scenes draw in list order. The game's scenes come later in the list, so move this one on top.
    this.scene.bringToTop();
    app.gameplay.stop();
    this.dim = this.add.rectangle(0, 0, 10, 10, 0x000000, 0.6).setOrigin(0).setInteractive();
    this.panel = this.add.graphics();
    this.title = this.text(0, 0, app.t('core.paused'), 64).setOrigin(0.5);
    this.resume = new Button(this, 0, 0, {
      label: app.t('core.resume'),
      icon: playIcon,
      width: 420,
      height: 110,
      fontSize: 44,
      onClick: () => this.close(),
    });
    if (app.menuKey) {
      this.menu = new Button(this, 0, 0, {
        label: app.t('core.menu'),
        icon: homeIcon,
        width: 420,
        height: 96,
        fontSize: 36,
        color: app.theme.surface,
        textColor: app.theme.surfaceText,
        onClick: () => {
          // A scene that would lose something (a timed run) asks first.
          const warning = app.leaveWarning?.();
          if (warning) confirmPanel(this, warning, () => app.toMenu());
          else app.toMenu();
        },
      });
    }
    this.soundBtn = soundButton(this, 0, 0);
    if (app.config.music) this.musicBtn = musicButton(this, 0, 0);
    // P resumes, as it pauses. Not Esc: in the browser Esc leaves full screen (CrazyGames quality guidelines).
    this.input.keyboard?.on('keydown-P', () => this.close());
  }

  protected layout(vp: ViewportInfo) {
    const cx = vp.width / 2;
    const cy = vp.height / 2;
    this.dim.setSize(vp.width, vp.height);
    this.dim.input?.hitArea.setSize(vp.width, vp.height);
    const w = 560;
    const h = this.menu ? 500 : 380;
    const top = cy - h / 2;
    this.panel.clear();
    this.panel.fillStyle(app.theme.surface, 1);
    this.panel.fillRoundedRect(cx - w / 2, top, w, h, app.theme.radius * 1.5);
    this.title.setPosition(cx, top + 85);
    this.resume.setPosition(cx, top + 235);
    this.menu?.setPosition(cx, top + 375);
    this.soundBtn.setPosition(cx + w / 2 - 70, top + 70);
    this.musicBtn?.setPosition(cx - w / 2 + 70, top + 70);
  }

  private close() {
    this.scene.stop();
    this.scene.resume(this.from);
  }
}
