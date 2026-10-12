import Phaser from 'phaser';

/** Canvas resolution caps the governor can use, highest first. */
export const RENDER_LEVELS = [2, 1.5, 1.25, 1];

/** Median frame time above this (about 50 fps) means the device is not keeping up. */
const SLOW_MS = 20;
/** Frame time sampled before each decision. */
const WINDOW_MS = 3000;

interface QualitySource {
  game: Phaser.Game;
  viewport: { dprCap: number; setMaxDpr(value: number): void };
  settings: { renderDpr: number | null };
  pause: { paused: boolean };
}

/**
 * Phones only. Watches the frame time and lowers the canvas resolution while the game cannot hold
 * about 50 fps: fewer pixels is the main lever when the GPU is the limit. A lower level is kept only
 * if it clearly helped; otherwise the previous one comes back and the governor stops, so a phone
 * limited by something else does not get a blurry picture for nothing. The level found is saved
 * in the settings, so the next visit starts there.
 */
export class QualityGovernor {
  /** The player (or the debug box) picked a level: stop deciding for this session. */
  manual = false;
  /** Decision made for this session. */
  done = false;
  /** Last measured median frame time, for the debug box. */
  lastMs = 0;
  private deltas: number[] = [];
  private sampled = 0;
  private settleUntil = performance.now() + 3000;
  /** Median at the level above, while a lower level is on trial. */
  private before: number | null = null;

  constructor(private app: QualitySource) {
    app.game.events.on(Phaser.Core.Events.STEP, (_time: number, delta: number) => this.sample(delta));
  }

  get state() {
    if (this.manual) return 'manual';
    if (this.done) return 'set';
    return this.before !== null ? 'trying' : 'watching';
  }

  /** Debug: next lower level, wrapping to the highest. */
  cycle() {
    this.manual = true;
    const cap = this.app.viewport.dprCap;
    const i = RENDER_LEVELS.findIndex((v) => v < cap - 0.01);
    this.app.viewport.setMaxDpr(i < 0 ? RENDER_LEVELS[0] : RENDER_LEVELS[i]);
  }

  private sample(delta: number) {
    if (this.done || this.manual) return;
    const now = performance.now();
    // Hidden tab, pause, ads: frame times say nothing about the device.
    if (this.app.pause.paused || document.hidden) {
      this.reset(now + 1000);
      return;
    }
    if (now < this.settleUntil) return;
    this.deltas.push(delta);
    this.sampled += delta;
    if (this.sampled >= WINDOW_MS) this.decide(now);
  }

  private reset(settleUntil: number) {
    this.deltas = [];
    this.sampled = 0;
    this.settleUntil = Math.max(this.settleUntil, settleUntil);
  }

  private decide(now: number) {
    const sorted = [...this.deltas].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    this.lastMs = median;
    this.reset(now);
    const cap = this.app.viewport.dprCap;
    const lower = RENDER_LEVELS.find((v) => v < cap - 0.01);

    if (this.before !== null) {
      // A lower level is on trial: keep it only if frames got clearly faster.
      if (median > this.before * 0.85) {
        const back = RENDER_LEVELS[Math.max(0, RENDER_LEVELS.findIndex((v) => Math.abs(v - cap) < 0.01) - 1)];
        this.app.viewport.setMaxDpr(back);
        return this.finish(back);
      }
      this.before = null;
    }
    if (median <= SLOW_MS || lower === undefined) return this.finish(cap);
    this.before = median;
    this.app.viewport.setMaxDpr(lower);
    this.settleUntil = now + 1500;
  }

  private finish(level: number) {
    this.done = true;
    this.app.settings.renderDpr = level;
  }
}
