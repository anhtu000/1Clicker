import Phaser from 'phaser';
import { shapeTexture } from '@core';
import { CORE_KEY, ensureCoreTexture, ensureSparkTexture } from '../render/bodies';

/** Radius the ring textures are drawn for; the images are scaled to the real radius. */
const RING_BASE = 100;
const RING_COLORS = [0xa98bff, 0xffc27a];
const MOON_COLORS = [0xd8ccff, 0xffd9a8];
const ringAxes = (i: number, r: number) => ({ rx: r * (1.35 + i * 0.18), ry: r * (0.42 + i * 0.1) });

/**
 * The stellar core the player taps. Pulses gently, squashes on each tap,
 * and spins two faint orbit rings so it never looks static.
 */
export class Core extends Phaser.GameObjects.Container {
  radius = 110;
  private orb: Phaser.GameObjects.Image;
  private halo: Phaser.GameObjects.Image;
  /** Orbit rings and their moons: images turned each frame (a Graphics redrawn each frame is slow on phones). */
  private rings: Phaser.GameObjects.Image[] = [];
  private moons: Phaser.GameObjects.Image[] = [];
  private ringRes = 1;
  private time = 0;
  private kick = 0;
  /** Rings that spread out from the core on each tap (reused). */
  private waves: Phaser.GameObjects.Image[] = [];

  constructor(scene: Phaser.Scene, onTap: (x: number, y: number) => void) {
    super(scene, 0, 0);
    ensureCoreTexture(scene);
    this.halo = scene.add.image(0, 0, ensureSparkTexture(scene)).setBlendMode(Phaser.BlendModes.ADD).setTint(0x8f6bff).setAlpha(0.5);
    for (let i = 0; i < 2; i++) {
      this.rings.push(scene.add.image(0, 0, '__DEFAULT'));
      this.moons.push(scene.add.image(0, 0, '__DEFAULT'));
    }
    this.bakeRings();
    this.orb = scene.add.image(0, 0, CORE_KEY);
    this.add([this.halo, ...this.rings, ...this.moons, this.orb]);
    this.setInteractive(new Phaser.Geom.Circle(0, 0, 150), Phaser.Geom.Circle.Contains);
    this.on('pointerdown', (p: Phaser.Input.Pointer) => onTap(p.worldX, p.worldY));
    scene.add.existing(this);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this));
  }

  /** Ring and moon textures at the screen's current sharpness (called again on each layout). */
  private bakeRings() {
    for (let i = 0; i < 2; i++) {
      const { rx, ry } = ringAxes(i, RING_BASE);
      const ring = shapeTexture(this.scene, `core-ring|${i}`, rx * 2, ry * 2, (g) => {
        g.lineStyle(2, RING_COLORS[i], 0.35);
        g.strokeEllipse(0, 0, rx * 2, ry * 2, 72);
      });
      const mr = 5 + i * 2;
      const moon = shapeTexture(this.scene, `core-moon|${i}`, mr * 2, mr * 2, (g) => {
        g.fillStyle(MOON_COLORS[i], 0.9);
        g.fillCircle(0, 0, mr);
      }, 1);
      this.ringRes = ring.res;
      this.rings[i].setTexture(ring.key);
      this.moons[i].setTexture(moon.key).setScale(1 / moon.res);
    }
  }

  setRadius(r: number) {
    this.bakeRings();
    this.radius = r;
    const hit = this.input?.hitArea as Phaser.Geom.Circle | undefined;
    hit?.setTo(0, 0, r * 1.35);
    this.orb.setScale((r * 2.4) / 320);
    this.halo.setScale((r * 5) / 64);
  }

  /** Squash, flash and a ring spreading out on a tap. Stronger (and gold) for critical taps. */
  hit(strength = 1) {
    this.kick = Math.min(1.6, this.kick + 0.5 * strength);
    const tex = shapeTexture(this.scene, 'core-wave', RING_BASE * 2 + 8, RING_BASE * 2 + 8, (g) => {
      g.lineStyle(6, 0xffffff, 1);
      g.strokeCircle(0, 0, RING_BASE);
    });
    let wave = this.waves.find((w) => !w.visible);
    if (!wave) {
      if (this.waves.length >= 6) return;
      wave = this.scene.add.image(0, 0, tex.key).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      this.addAt(wave, 1);
      this.waves.push(wave);
    }
    const base = this.radius / RING_BASE / tex.res;
    const gold = strength > 1.5;
    wave.setTexture(tex.key).setTint(gold ? 0xffd166 : 0xc9b8ff).setScale(base * 0.95).setAlpha(gold ? 0.9 : 0.55).setVisible(true);
    this.scene.tweens.killTweensOf(wave);
    this.scene.tweens.add({
      targets: wave,
      scale: base * (gold ? 2.1 : 1.6),
      alpha: 0,
      duration: gold ? 420 : 300,
      ease: 'Cubic.Out',
      onComplete: () => wave!.setVisible(false),
    });
  }

  private tick(_t: number, delta: number) {
    const dt = delta / 1000;
    this.time += dt;
    this.kick = Math.max(0, this.kick - dt * 5);
    const breathe = 1 + Math.sin(this.time * 2.2) * 0.025;
    const squash = 1 - this.kick * 0.08;
    this.orb.setScale(((this.radius * 2.4) / 320) * breathe * squash);
    this.halo.setAlpha(0.45 + this.kick * 0.3 + Math.sin(this.time * 1.3) * 0.08);
    const r = this.radius;
    for (let i = 0; i < 2; i++) {
      // Tilted ellipse, turning slowly.
      const a = this.time * (i ? -0.35 : 0.5) + i;
      this.rings[i].setRotation(a).setScale(r / RING_BASE / this.ringRes);
      // A small moon riding each ring.
      const t = this.time * (i ? 0.9 : 1.3);
      const { rx, ry } = ringAxes(i, r);
      const ex = Math.cos(t) * rx;
      const ey = Math.sin(t) * ry;
      this.moons[i].setPosition(ex * Math.cos(a) - ey * Math.sin(a), ex * Math.sin(a) + ey * Math.cos(a));
    }
  }
}
