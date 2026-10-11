import Phaser from 'phaser';
import { ensureSparkTexture } from '../render/bodies';

/**
 * A shooting star crossing the screen. Big hit area so it is easy to catch on a phone.
 * The run decides when stars appear and how long they last; this only draws and reports taps.
 */
export class ShootingStar extends Phaser.GameObjects.Container {
  private head: Phaser.GameObjects.Image;
  private trail: Phaser.GameObjects.Graphics;
  private from = new Phaser.Math.Vector2();
  private to = new Phaser.Math.Vector2();
  private life = 1;
  private age = 0;
  private points: { x: number; y: number }[] = [];
  private golden: boolean;
  /** Freeze in place (tutorial step waiting for the catch). */
  hold = false;

  constructor(scene: Phaser.Scene, area: { x: number; y: number; w: number; h: number }, lifetime: number, golden: boolean, onCatch: () => void) {
    super(scene, 0, 0);
    this.golden = golden;
    this.life = lifetime;
    // Diagonal path across the given area, slower than it looks so it can be caught.
    const leftToRight = Math.random() < 0.5;
    this.from.set(leftToRight ? area.x - 40 : area.x + area.w + 40, area.y + Math.random() * area.h * 0.5);
    this.to.set(leftToRight ? area.x + area.w + 40 : area.x - 40, this.from.y + area.h * (0.25 + Math.random() * 0.3));
    this.trail = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.head = scene.add.image(0, 0, ensureSparkTexture(scene)).setBlendMode(Phaser.BlendModes.ADD).setScale(golden ? 1.6 : 1.2);
    this.head.setTint(golden ? 0xffd166 : 0xcfe8ff);
    this.add([this.trail, this.head]);
    this.setDepth(60);
    this.setSize(150, 150);
    this.setInteractive(new Phaser.Geom.Circle(75, 75, 75), Phaser.Geom.Circle.Contains);
    this.on('pointerdown', () => onCatch());
    scene.add.existing(this);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    this.once(Phaser.GameObjects.Events.DESTROY, () => scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this));
    this.tick(0, 0);
  }

  get headX() {
    return this.x;
  }

  private tick(_t: number, delta: number) {
    if (!this.hold) this.age += delta / 1000;
    const k = Math.min(1, this.age / this.life);
    this.x = Phaser.Math.Linear(this.from.x, this.to.x, k);
    this.y = Phaser.Math.Linear(this.from.y, this.to.y, k) - Math.sin(k * Math.PI) * 60;
    this.head.rotation += delta / 300;
    this.points.unshift({ x: this.x, y: this.y });
    if (this.points.length > 18) this.points.pop();
    const g = this.trail;
    g.clear();
    for (let i = 1; i < this.points.length; i++) {
      const a = 1 - i / this.points.length;
      g.lineStyle(14 * a, this.golden ? 0xffc23d : 0x9fd8ff, a * 0.7);
      g.lineBetween(this.points[i - 1].x - this.x, this.points[i - 1].y - this.y, this.points[i].x - this.x, this.points[i].y - this.y);
    }
  }
}
