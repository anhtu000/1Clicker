import Phaser from 'phaser';
import { CORE_KEY, ensureCoreTexture, ensureSparkTexture } from '../render/bodies';

/**
 * The stellar core the player taps. Pulses gently, squashes on each tap,
 * and spins two faint orbit rings so it never looks static.
 */
export class Core extends Phaser.GameObjects.Container {
  radius = 110;
  private orb: Phaser.GameObjects.Image;
  private halo: Phaser.GameObjects.Image;
  private rings: Phaser.GameObjects.Graphics;
  private time = 0;
  private kick = 0;

  constructor(scene: Phaser.Scene, onTap: (x: number, y: number) => void) {
    super(scene, 0, 0);
    ensureCoreTexture(scene);
    this.halo = scene.add.image(0, 0, ensureSparkTexture(scene)).setBlendMode(Phaser.BlendModes.ADD).setTint(0x8f6bff).setAlpha(0.5);
    this.rings = scene.add.graphics();
    this.orb = scene.add.image(0, 0, CORE_KEY);
    this.add([this.halo, this.rings, this.orb]);
    this.setInteractive(new Phaser.Geom.Circle(0, 0, 150), Phaser.Geom.Circle.Contains);
    this.on('pointerdown', (p: Phaser.Input.Pointer) => onTap(p.worldX, p.worldY));
    scene.add.existing(this);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this));
  }

  setRadius(r: number) {
    this.radius = r;
    const hit = this.input?.hitArea as Phaser.Geom.Circle | undefined;
    hit?.setTo(0, 0, r * 1.35);
    this.orb.setScale((r * 2.4) / 320);
    this.halo.setScale((r * 5) / 64);
  }

  /** Squash and flash on a tap. Stronger for critical taps. */
  hit(strength = 1) {
    this.kick = Math.min(1.6, this.kick + 0.5 * strength);
  }

  private tick(_t: number, delta: number) {
    const dt = delta / 1000;
    this.time += dt;
    this.kick = Math.max(0, this.kick - dt * 5);
    const breathe = 1 + Math.sin(this.time * 2.2) * 0.025;
    const squash = 1 - this.kick * 0.08;
    this.orb.setScale(((this.radius * 2.4) / 320) * breathe * squash);
    this.halo.setAlpha(0.45 + this.kick * 0.3 + Math.sin(this.time * 1.3) * 0.08);
    const g = this.rings;
    g.clear();
    const r = this.radius;
    for (let i = 0; i < 2; i++) {
      const a = this.time * (i ? -0.35 : 0.5) + i;
      g.lineStyle(2, i ? 0xffc27a : 0xa98bff, 0.35);
      g.beginPath();
      // Tilted ellipse drawn as a polyline.
      for (let k = 0; k <= 48; k++) {
        const t = (k / 48) * Math.PI * 2;
        const ex = Math.cos(t) * r * (1.35 + i * 0.18);
        const ey = Math.sin(t) * r * (0.42 + i * 0.1);
        const x = ex * Math.cos(a) - ey * Math.sin(a);
        const y = ex * Math.sin(a) + ey * Math.cos(a);
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokePath();
      // A small moon riding each ring.
      const t = this.time * (i ? 0.9 : 1.3);
      const ex = Math.cos(t) * r * (1.35 + i * 0.18);
      const ey = Math.sin(t) * r * (0.42 + i * 0.1);
      g.fillStyle(i ? 0xffd9a8 : 0xd8ccff, 0.9);
      g.fillCircle(ex * Math.cos(a) - ey * Math.sin(a), ex * Math.sin(a) + ey * Math.cos(a), 5 + i * 2);
    }
  }
}
