import { Emitter } from './emitter';

/**
 * Tracks why the game is paused. Several reasons can overlap,
 * for example an ad that starts and then the player switches tab.
 * The game stays paused until every reason is gone.
 *
 * Built-in reasons: "hidden" (tab hidden) and "ad". Games can add their own.
 */
export class PauseManager extends Emitter<{
  pause: [];
  /** pausedMs is how long the pause lasted, useful to credit idle income after a tab switch. */
  resume: [pausedMs: number];
}> {
  private reasons = new Set<string>();
  private pausedAt = 0;

  get paused() {
    return this.reasons.size > 0;
  }

  has(reason: string) {
    return this.reasons.has(reason);
  }

  add(reason: string) {
    if (this.reasons.has(reason)) return;
    const wasPaused = this.paused;
    this.reasons.add(reason);
    if (!wasPaused) {
      this.pausedAt = performance.now();
      this.emit('pause');
    }
  }

  remove(reason: string) {
    if (!this.reasons.delete(reason)) return;
    if (!this.paused) this.emit('resume', performance.now() - this.pausedAt);
  }

  /** Pause while the tab is hidden (tab switch, phone lock, app switch). */
  watchVisibility() {
    const update = () => (document.hidden ? this.add('hidden') : this.remove('hidden'));
    document.addEventListener('visibilitychange', update);
    update();
  }
}

/**
 * Sends gameplayStart / gameplayStop to the portal only when the state really changes.
 * CrazyGames wants gameplayStop for menus and pause screens, but not for tab switches or ads.
 */
export class GameplayTracker {
  private active = false;

  constructor(private platform: { gameplayStart(): void; gameplayStop(): void }) {}

  get isActive() {
    return this.active;
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.platform.gameplayStart();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.platform.gameplayStop();
  }
}
