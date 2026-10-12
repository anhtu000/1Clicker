import Phaser from 'phaser';
import { app } from '../app';
import type { IconDraw } from './icons';
import { drawId, setShape } from './shapes';

export interface ButtonOptions {
  label?: string;
  icon?: IconDraw;
  /** Size in design units. Keep at least 88 high so it is easy to hit on a phone. */
  width?: number;
  height?: number;
  color?: number;
  textColor?: string;
  fontSize?: number;
  /** Sound key played on press. false for silent. */
  sound?: string | false;
  onClick: () => void;
}

/** Darker shade of a color for the button's bottom edge. */
function shade(color: number, factor: number): number {
  const c = Phaser.Display.Color.IntegerToColor(color);
  return Phaser.Display.Color.GetColor(c.red * factor, c.green * factor, c.blue * factor);
}

const EDGE = 8; // height of the 3D bottom edge, in design units

/**
 * Chunky button with a pressed state, sound and vibration.
 * The click fires on release, and only if the press started on this button,
 * so a swipe across the screen does not trigger it.
 */
export class Button extends Phaser.GameObjects.Container {
  // Images of baked shapes, not live Graphics: much cheaper to draw on phones (see shapes.ts).
  private bg: Phaser.GameObjects.Image;
  private face: Phaser.GameObjects.Container;
  private labelText: Phaser.GameObjects.Text | null = null;
  private iconGfx: Phaser.GameObjects.Image | null = null;
  private opts: Required<Omit<ButtonOptions, 'label' | 'icon'>> & Pick<ButtonOptions, 'label' | 'icon'>;
  private pressed = false;
  private enabled = true;

  constructor(scene: Phaser.Scene, x: number, y: number, options: ButtonOptions) {
    super(scene, x, y);
    const theme = app.theme;
    this.opts = {
      width: 320,
      height: 96,
      color: theme.primary,
      textColor: theme.primaryText,
      fontSize: 40,
      sound: 'ui-tap',
      ...options,
    };
    this.bg = scene.add.image(0, 0, '__DEFAULT');
    this.face = scene.add.container(0, 0);
    this.add([this.bg, this.face]);
    if (this.opts.icon) {
      this.iconGfx = scene.add.image(0, 0, '__DEFAULT');
      this.face.add(this.iconGfx);
    }
    if (this.opts.label != null) {
      this.labelText = scene.add
        .text(0, 0, this.opts.label, {
          fontFamily: theme.font,
          fontStyle: '900',
          fontSize: this.opts.fontSize,
          color: this.opts.textColor,
          align: 'center',
        })
        .setOrigin(0.5);
      this.face.add(this.labelText);
    }
    this.redraw();
    this.layoutContent();

    // Touch targets are a bit larger than the drawn button.
    const pad = 10;
    const { width: w, height: h } = this.opts;
    this.setSize(w, h);
    this.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-pad, -pad, w + pad * 2, h + pad * 2),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });
    this.on('pointerdown', () => this.press());
    this.on('pointerout', () => this.release());
    this.on('pointerup', () => {
      const fire = this.pressed && this.enabled;
      this.release();
      if (fire) this.opts.onClick();
    });
    scene.add.existing(this);
  }

  setLabel(text: string) {
    this.labelText?.setText(text);
    this.layoutContent();
    return this;
  }

  setIcon(icon: IconDraw) {
    this.opts.icon = icon;
    if (!this.iconGfx) {
      this.iconGfx = this.scene.add.image(0, 0, '__DEFAULT');
      this.face.add(this.iconGfx);
      this.layoutContent();
    }
    this.redraw();
    return this;
  }

  setColor(color: number, textColor?: string) {
    this.opts.color = color;
    if (textColor) {
      this.opts.textColor = textColor;
      this.labelText?.setColor(textColor);
    }
    this.redraw();
    return this;
  }

  setEnabled(value: boolean) {
    this.enabled = value;
    this.setAlpha(value ? 1 : 0.45);
    if (!value) this.release();
    return this;
  }

  get isEnabled() {
    return this.enabled;
  }

  private press() {
    if (!this.enabled) return;
    this.pressed = true;
    this.face.y = EDGE / 2;
    this.redraw();
    if (this.opts.sound) app.audio.play(this.opts.sound, { pitchJitter: 60, volume: 0.7 });
    app.haptic(8);
  }

  private release() {
    if (!this.pressed) return;
    this.pressed = false;
    this.face.y = 0;
    this.redraw();
  }

  private layoutContent() {
    const hasBoth = this.iconGfx && this.labelText && this.labelText.text;
    const iconSize = this.opts.height * 0.42;
    if (hasBoth) {
      const total = iconSize + 14 + this.labelText!.width;
      this.iconGfx!.x = -total / 2 + iconSize / 2;
      this.labelText!.x = -total / 2 + iconSize + 14 + this.labelText!.width / 2;
    }
    const lift = -EDGE / 2;
    if (this.iconGfx) this.iconGfx.y = lift;
    if (this.labelText) this.labelText.y = lift;
  }

  private redraw() {
    const { width: w, height: h, color } = this.opts;
    const r = Math.min(app.theme.radius, h / 2);
    const pressed = this.pressed;
    setShape(this.bg, `button|${w}|${h}|${color}|${r}|${pressed ? 1 : 0}`, w, h, (g) => {
      // bottom edge
      g.fillStyle(shade(color, 0.62), 1);
      g.fillRoundedRect(-w / 2, -h / 2 + EDGE, w, h - EDGE, r);
      // face, lower when pressed
      const top = -h / 2 + (pressed ? EDGE / 2 : 0);
      g.fillStyle(color, 1);
      g.fillRoundedRect(-w / 2, top, w, h - EDGE, r);
      // soft highlight on the upper half
      g.fillStyle(0xffffff, 0.14);
      g.fillRoundedRect(-w / 2 + 6, top + 5, w - 12, (h - EDGE) * 0.42, { tl: r - 4, tr: r - 4, bl: 6, br: 6 });
    });

    const icon = this.opts.icon;
    if (this.iconGfx && icon) {
      const size = this.opts.height * 0.42;
      const iconColor = Phaser.Display.Color.HexStringToColor(this.opts.textColor).color;
      setShape(this.iconGfx, `icon|${drawId(icon)}|${size}|${iconColor}`, size, size, (g) => icon(g, size, iconColor), Math.ceil(size * 0.25));
    }
  }
}
