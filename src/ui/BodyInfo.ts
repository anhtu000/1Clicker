import Phaser from 'phaser';
import { app, Button, type icons } from '@core';

export interface BodyInfoOptions {
  /** The body on screen: the card points at it. */
  x: number;
  y: number;
  radius: number;
  texture: string;
  title: string;
  titleColor: string;
  lines: string[];
  action?: { label: string; icon?: icons.IconDraw; onClick: () => void };
  onClose?: () => void;
}

const W = 380;

/**
 * Small card next to a tapped body (CLAUDE.md 4b): name, rarity, what it makes.
 * Not modal: the game keeps going, and any tap outside closes it.
 */
export class BodyInfo extends Phaser.GameObjects.Container {
  private closed = false;
  private onDown: (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => void;
  private opts: BodyInfoOptions;

  constructor(scene: Phaser.Scene, opts: BodyInfoOptions) {
    super(scene, 0, 0);
    this.opts = opts;
    const font = { fontFamily: app.theme.font, resolution: app.textResolution };
    const pad = 18;
    const art = 72;
    const title = scene.add.text(pad + art + 12, pad + 4, opts.title, { ...font, fontStyle: '900', fontSize: 26, color: opts.titleColor }).setOrigin(0, 0);
    const room = W - pad * 2 - art - 12;
    if (title.width > room) title.setScale(room / title.width);
    const body = scene.add
      .text(pad + art + 12, pad + 40, opts.lines.join('\n'), { ...font, fontStyle: '700', fontSize: 21, color: '#d9d5f5', lineSpacing: 4, wordWrap: { width: room } })
      .setOrigin(0, 0);
    let h = Math.max(pad * 2 + art, pad + 40 + body.height + pad);
    let button: Button | null = null;
    if (opts.action) {
      const a = opts.action;
      button = new Button(scene, W / 2, h + 34, { label: a.label, icon: a.icon, width: W - pad * 2, height: 64, fontSize: 28, onClick: () => a.onClick() });
      h += 84;
    }
    const bg = scene.add.graphics();
    bg.fillStyle(0x000000, 0.35);
    bg.fillRoundedRect(0, 6, W, h, 20);
    bg.fillStyle(0x221d52, 0.97);
    bg.fillRoundedRect(0, 0, W, h, 20);
    bg.lineStyle(3, 0xffffff, 0.14);
    bg.strokeRoundedRect(1.5, 1.5, W - 3, h - 3, 20);
    const hit = scene.add.zone(0, 0, W, h).setOrigin(0).setInteractive();
    const img = scene.add.image(pad + art / 2, pad + art / 2, opts.texture).setScale((art / 192) * 1.2);
    this.add([bg, hit, img, title, body]);
    if (button) this.add(button);

    // Above the body when there is room, else below; kept on screen.
    const vp = app.viewport.info;
    let x = opts.x - W / 2;
    let y = opts.y - opts.radius - 14 - h;
    if (y < 8) y = opts.y + opts.radius + 14;
    x = Phaser.Math.Clamp(x, 8, vp.width - W - 8);
    y = Phaser.Math.Clamp(y, 8, vp.height - h - 8);
    this.setPosition(x, y).setDepth(1400);
    scene.add.existing(this);
    this.setScale(0.9).setAlpha(0);
    scene.tweens.add({ targets: this, scale: 1, alpha: 1, duration: 140, ease: 'Back.Out' });

    // Any press outside the card closes it. Added on the next frame, so the tap that opened it does not count.
    this.onDown = (_p, over) => {
      if (!over.some((o) => o === hit || o.parentContainer === this)) this.close();
    };
    scene.time.delayedCall(0, () => {
      if (!this.closed) scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown);
    });
    this.once(Phaser.GameObjects.Events.DESTROY, () => scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown));
  }

  get isOpen() {
    return !this.closed;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.opts.onClose?.();
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown);
    this.scene.tweens.add({ targets: this, alpha: 0, scale: 0.92, duration: 100, onComplete: () => this.destroy() });
  }
}
