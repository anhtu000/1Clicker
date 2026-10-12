import Phaser from 'phaser';
import type { Body } from '../logic/run.ts';
import { BODY_SIZE, ensureAnyBodyTexture, ensureAuraTexture } from '../render/bodies';

/** One celestial body on screen: the drawn body, plus an animated halo for rare ones. */
export class BodySprite extends Phaser.GameObjects.Container {
  /** The tier and rarity shown. (Not `body`: Phaser uses that name for physics.) */
  celestial!: Body;
  private aura: Phaser.GameObjects.Image | null = null;
  private img: Phaser.GameObjects.Image;
  private size: number;
  private spin = 0;
  private bobPhase = Math.random() * Math.PI * 2;
  /** Turned off while dragging so the body follows the finger exactly. */
  bob = true;

  constructor(scene: Phaser.Scene, x: number, y: number, body: Body, size: number) {
    super(scene, x, y);
    this.size = size;
    this.img = scene.add.image(0, 0, ensureAnyBodyTexture(scene, body));
    this.add(this.img);
    this.setBody(body);
    scene.add.existing(this);
    // Scene update rather than preUpdate: preUpdate stops once the sprite moves into a container.
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this));
  }

  setBody(body: Body) {
    this.celestial = body;
    this.img.setTexture(ensureAnyBodyTexture(this.scene, body));
    this.aura?.destroy();
    this.aura = null;
    if (body.r > 0) {
      this.aura = this.scene.add.image(0, 0, ensureAuraTexture(this.scene, body.r)).setBlendMode(Phaser.BlendModes.ADD);
      this.addAt(this.aura, 0);
    }
    this.setSize(this.size, this.size);
    this.resize(this.size);
  }

  resize(size: number) {
    this.size = size;
    // The texture has room for glow around the body, so it is drawn larger than the cell.
    const scale = (size / BODY_SIZE) * 1.3;
    this.img.setScale(scale);
    this.aura?.setScale(scale * (1.15 + this.celestial.r * 0.06));
    this.setSize(size, size);
  }

  /**
   * All size changes go through one tween that the sprite owns: a new one replaces the old one.
   * Overlapping scale tweens (pop, merge punch, drag) used to leave a body stuck at size 0:
   * still on the board, but invisible.
   */
  private scaleTween: Phaser.Tweens.Tween | null = null;

  /** Tweens the size to `to` (1 = normal), from `from` when given. */
  scaleTo(to: number, duration: number, ease = 'Quad.Out', from?: number, delay = 0) {
    this.scaleTween?.stop();
    if (from !== undefined) this.setScale(from);
    this.scaleTween = this.scene.tweens.add({ targets: this, scale: to, duration, delay, ease });
    return this;
  }

  /** Grows in from nothing, with a small overshoot. */
  pop(delay = 0) {
    this.popping = true;
    this.scaleTo(1, 320, 'Back.Out', 0, delay);
    this.scaleTween!.once(Phaser.Tweens.Events.TWEEN_COMPLETE, () => (this.popping = false));
    this.scaleTween!.once(Phaser.Tweens.Events.TWEEN_STOP, () => (this.popping = false));
    return this;
  }

  private popping = false;

  /** Short bump for a merge. Skipped while popping in, which already animates. */
  bump(amount = 0.25) {
    if (this.popping) return this;
    return this.scaleTo(1, 140, 'Back.Out', 1 + amount);
  }

  /** Back to normal size if no size tween is running. A safety net against any path that leaves it wrong. */
  settle() {
    if (!this.scaleTween?.isPlaying() && this.scaleX !== 1) this.setScale(1);
  }

  private tick(_time: number, delta: number) {
    const dt = delta / 1000;
    this.spin += dt;
    if (this.aura) {
      this.aura.rotation += dt * (0.2 + this.celestial.r * 0.15);
      this.aura.setAlpha(0.65 + 0.35 * Math.sin(this.spin * (1.5 + this.celestial.r * 0.4)));
    }
    if (this.bob) {
      this.bobPhase += dt * 1.6;
      this.img.y = Math.sin(this.bobPhase) * this.size * 0.025;
    } else {
      this.img.y = 0;
    }
  }
}
