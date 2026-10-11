import type Phaser from 'phaser';
import { Emitter } from './emitter';
import type { Settings } from './settings';

export interface PlayOptions {
  volume?: number;
  /** Random pitch spread in cents, so repeated clicks do not sound robotic. 100 = one semitone. */
  pitchJitter?: number;
  /** Fixed pitch shift in cents, for example to rise with a combo. */
  detune?: number;
}

/**
 * One place that decides if sound is on.
 * Sound is off when any of these is true:
 *   - the player muted it (saved in settings)
 *   - the portal forces mute (CrazyGames muteAudio, this wins over the player toggle)
 *   - the game is paused (ad on screen or tab hidden)
 */
export class AudioManager extends Emitter<{ change: [muted: boolean] }> {
  private game: Phaser.Game | null = null;
  private portalMuted = false;
  private pauseMuted = false;

  constructor(private settings: Settings) {
    super();
  }

  attach(game: Phaser.Game) {
    this.game = game;
    this.apply();
    // iOS suspends the audio context while the page is in the background (for example the CrazyGames app)
    // and only lets it start again from a touch or key press. Without this, sound stays off after the
    // player comes back. Checked on every touch, click or key while the context is not running.
    const resume = () => {
      const ctx = (game.sound as Partial<Phaser.Sound.WebAudioSoundManager>).context;
      if (ctx && ctx.state !== 'running' && ctx.state !== 'closed' && !this.pauseMuted) ctx.resume().catch(() => {});
    };
    for (const type of ['pointerdown', 'touchend', 'keydown']) document.addEventListener(type, resume, { capture: true, passive: true });
  }

  /** What the mute button should show. */
  get muted() {
    return this.settings.muted || this.portalMuted;
  }

  /** False while the portal forces mute, so the button cannot turn sound back on. */
  get canToggle() {
    return !this.portalMuted;
  }

  toggle() {
    if (!this.canToggle) return;
    this.settings.muted = !this.settings.muted;
    this.apply();
  }

  setPortalMuted(value: boolean) {
    this.portalMuted = value;
    this.apply();
  }

  setPauseMuted(value: boolean) {
    this.pauseMuted = value;
    this.apply();
  }

  play(key: string, options: PlayOptions = {}) {
    const game = this.game;
    if (!game || this.muted || this.pauseMuted) return;
    if (!game.cache.audio.exists(key)) {
      console.warn(`[audio] missing sound "${key}"`);
      return;
    }
    const jitter = options.pitchJitter ? (Math.random() * 2 - 1) * options.pitchJitter : 0;
    game.sound.play(key, { volume: options.volume ?? 1, detune: (options.detune ?? 0) + jitter });
  }

  private apply() {
    if (this.game) this.game.sound.mute = this.muted || this.pauseMuted;
    this.emit('change', this.muted);
  }
}
