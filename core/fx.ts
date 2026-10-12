import Phaser from 'phaser';

// "Game feel" helpers (CLAUDE.md 4.3): numbers that fly up, small bounces, bursts, vibration.
// All of them are time-based tweens, so they run the same at 60 and 144 Hz.

export const DOT_TEXTURE = 'core-dot';

/** Creates the small round texture used by burst(). Called once by the boot scene. */
export function createFxTextures(scene: Phaser.Scene) {
  if (scene.textures.exists(DOT_TEXTURE)) return;
  const g = scene.make.graphics({}, false);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(16, 16, 16);
  g.generateTexture(DOT_TEXTURE, 32, 32);
  g.destroy();
}

export interface FloatOptions {
  color?: string;
  /** Font size in design units. */
  size?: number;
  /** How far it rises, in design units. */
  rise?: number;
  durationMs?: number;
  font?: string;
}

const floatPools = new WeakMap<Phaser.Scene, Map<string, Phaser.GameObjects.Text[]>>();

/**
 * "+12" that rises and fades. Reuses text objects, so fast clicking does not pile up garbage.
 * One pool per look (font, size, color): a reused label only changes its text. Changing a text's
 * size or color re-measures and redraws it several times, which stalls a phone on every tap.
 */
export function floatText(scene: Phaser.Scene, x: number, y: number, text: string, options: FloatOptions = {}) {
  let pools = floatPools.get(scene);
  if (!pools) {
    pools = new Map();
    floatPools.set(scene, pools);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => floatPools.delete(scene));
  }
  const size = options.size ?? 44;
  const color = options.color ?? '#ffffff';
  const font = options.font ?? 'Nunito, sans-serif';
  const look = `${font}|${size}|${color}`;
  let pool = pools.get(look);
  if (!pool) pools.set(look, (pool = []));
  let label = pool.find((t) => !t.active);
  if (!label) {
    label = scene.add.text(0, 0, text, { fontFamily: font, fontStyle: '900', fontSize: size, color, stroke: '#00000088', strokeThickness: Math.round(size / 7) });
    label.setOrigin(0.5).setDepth(1000);
    pool.push(label);
  }
  label
    .setActive(true)
    .setVisible(true)
    .setText(text)
    .setPosition(x + Phaser.Math.Between(-12, 12), y)
    .setAlpha(1)
    .setScale(0.6);
  const target = label;
  scene.tweens.add({ targets: target, scale: 1, duration: 120, ease: 'Back.Out' });
  scene.tweens.add({
    targets: target,
    y: y - (options.rise ?? 120),
    alpha: 0,
    duration: options.durationMs ?? 800,
    ease: 'Cubic.Out',
    onComplete: () => target.setActive(false).setVisible(false),
  });
}

/** Quick squash-and-stretch bounce. Calling it again restarts the bounce instead of stacking. */
export function punch(scene: Phaser.Scene, target: Phaser.GameObjects.Components.Transform, amount = 0.1, durationMs = 140) {
  const anyTarget = target as unknown as { __punch?: Phaser.Tweens.Tween; __baseScale?: number };
  anyTarget.__punch?.stop();
  const base = (anyTarget.__baseScale ??= target.scaleX);
  target.setScale(base * (1 + amount));
  anyTarget.__punch = scene.tweens.add({ targets: target, scale: base, duration: durationMs, ease: 'Back.Out' });
}

const burstEmitters = new WeakMap<Phaser.Scene, Phaser.GameObjects.Particles.ParticleEmitter>();

/** Burst of round particles, for purchases and rare drops. */
export function burst(scene: Phaser.Scene, x: number, y: number, color = 0xffffff, count = 14, speed = 420) {
  let emitter = burstEmitters.get(scene);
  if (!emitter) {
    emitter = scene.add.particles(0, 0, DOT_TEXTURE, {
      speed: { min: speed * 0.4, max: speed },
      lifespan: { min: 350, max: 650 },
      scale: { start: 0.55, end: 0 },
      alpha: { start: 1, end: 0.2 },
      gravityY: 600,
      emitting: false,
    });
    emitter.setDepth(900);
    burstEmitters.set(scene, emitter);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => burstEmitters.delete(scene));
  }
  emitter.setParticleTint(color);
  emitter.explode(count, x, y);
}
