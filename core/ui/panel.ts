import Phaser from 'phaser';
import { app } from '../app';
import type { ViewportInfo } from '../viewport';
import { Button } from './button';
import { closeIcon } from './icons';
import { shapeImage } from './shapes';

export interface PanelOptions {
  title: string;
  /** Size in design units. Shrinks to fit narrow screens. */
  width?: number;
  height?: number;
  /** Show the close button and close on Esc. Default true. */
  closable?: boolean;
  /** Runs once when the panel closes, however it was closed. */
  onClose?: () => void;
}

/**
 * Modal window over the current scene: dims the game, blocks taps behind it, pops in.
 * Put content in `content`; (0, 0) is the panel's center, `top` is the y just below the title.
 *   const panel = new Panel(scene, { title: 'Daily gift' });
 *   panel.content.add(scene.add.text(0, panel.top + 40, 'Hello').setOrigin(0.5));
 */
export class Panel extends Phaser.GameObjects.Container {
  readonly content: Phaser.GameObjects.Container;
  readonly panelWidth: number;
  readonly panelHeight: number;
  private dim: Phaser.GameObjects.Rectangle;
  private box: Phaser.GameObjects.Container;
  private closed = false;
  private opts: PanelOptions;
  private offResize: () => void;
  private onEsc = () => this.close();

  constructor(scene: Phaser.Scene, options: PanelOptions) {
    super(scene, 0, 0);
    this.opts = options;
    const theme = app.theme;
    const vp = app.viewport.info;
    this.panelWidth = Math.min(options.width ?? 620, vp.safe.width - 40);
    this.panelHeight = Math.min(options.height ?? 640, vp.height - 80);
    const w = this.panelWidth;
    const h = this.panelHeight;

    this.dim = scene.add.rectangle(0, 0, 10, 10, 0x000000, 0.62).setOrigin(0).setInteractive();
    const r = theme.radius * 1.5;
    // Baked into an image: a live Graphics is rebuilt every frame, which is slow on phones.
    const bg = shapeImage(scene, 0, 5, `panel|${w}|${h}|${theme.surface}|${r}`, w, h + 10, (g) => {
      g.fillStyle(0x000000, 0.35);
      g.fillRoundedRect(-w / 2, -h / 2 + 5, w, h, r);
      g.fillStyle(theme.surface, 1);
      g.fillRoundedRect(-w / 2, -h / 2 - 5, w, h, r);
      g.lineStyle(3, 0xffffff, 0.08);
      g.strokeRoundedRect(-w / 2 + 1.5, -h / 2 - 3.5, w - 3, h - 3, r);
    });
    // Swallow taps on the panel so they do not reach the dim layer.
    const hit = scene.add.zone(0, 0, w, h).setInteractive();
    const title = scene.add
      .text(0, -h / 2 + 62, options.title, {
        fontFamily: theme.font,
        fontStyle: '900',
        fontSize: 48,
        color: theme.surfaceText,
        align: 'center',
        resolution: app.textResolution,
      })
      .setOrigin(0.5);
    this.content = scene.add.container(0, 0);
    this.box = scene.add.container(0, 0, [bg, hit, title, this.content]);
    if (options.closable !== false) {
      const close = new Button(scene, w / 2 - 56, -h / 2 + 56, {
        icon: closeIcon,
        width: 88,
        height: 88,
        color: theme.surface,
        textColor: theme.textDim,
        onClick: () => this.close(),
      });
      this.box.add(close);
      scene.input.keyboard?.on('keydown-ESC', this.onEsc);
    }
    this.add([this.dim, this.box]);
    this.setDepth(1500);
    scene.add.existing(this);

    this.place(vp);
    this.offResize = app.viewport.on('change', (info) => this.place(info));
    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.offResize();
      scene.input.keyboard?.off('keydown-ESC', this.onEsc);
    });

    this.dim.setAlpha(0);
    this.box.setScale(0.86).setAlpha(0);
    scene.tweens.add({ targets: this.dim, alpha: 1, duration: 160 });
    scene.tweens.add({ targets: this.box, scale: 1, alpha: 1, duration: 260, ease: 'Back.Out' });
  }

  /** y of the area just below the title, relative to the panel center. */
  get top(): number {
    return -this.panelHeight / 2 + 120;
  }

  /** y of the bottom edge, relative to the panel center. */
  get bottom(): number {
    return this.panelHeight / 2;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.opts.onClose?.();
    this.scene.tweens.add({ targets: this.dim, alpha: 0, duration: 140 });
    this.scene.tweens.add({
      targets: this.box,
      scale: 0.9,
      alpha: 0,
      duration: 140,
      onComplete: () => this.destroy(),
    });
  }

  private place(vp: ViewportInfo) {
    this.dim.setSize(vp.width, vp.height);
    this.dim.input?.hitArea.setSize(vp.width, vp.height);
    this.box.setPosition(vp.width / 2, vp.height / 2);
  }
}
