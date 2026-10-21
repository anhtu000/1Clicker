import type Phaser from 'phaser';
import { Emitter } from './emitter';
import { MusicPlayer, type MusicConfig } from './music';
import type { Settings } from './settings';

export interface PlayOptions {
  /** Multiplies the sound's own level from setSounds (default 1). */
  volume?: number;
  /** Random pitch spread in cents, so repeated clicks do not sound robotic. 100 = one semitone. */
  pitchJitter?: number;
  /** Fixed pitch shift in cents, for example to rise with a combo. */
  detune?: number;
}

/** A sound's default level and pitch spread, usually from the game's content JSON. */
export interface SoundDefaults {
  volume?: number;
  pitchJitter?: number;
}

/**
 * One place that decides if sound is on.
 * Sound is off when any of these is true:
 *   - the player muted it (saved in settings)
 *   - the portal forces mute (CrazyGames muteAudio, this wins over the player toggle)
 *   - the game is paused (ad on screen or tab hidden)
 * Music has its own switch on top (settings.musicOff); the mute above silences it too.
 */
export class AudioManager extends Emitter<{ change: [muted: boolean] }> {
  private game: Phaser.Game | null = null;
  private portalMuted = false;
  private pauseMuted = false;
  private defaults: Record<string, SoundDefaults> = {};
  private music: MusicPlayer | null = null;

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

  /** Default level and pitch spread per sound key. play() multiplies its own volume on top. */
  setSounds(defaults: Record<string, SoundDefaults>) {
    this.defaults = defaults;
  }

  /**
   * Starts the background music once the game is up (call after the loading screen). Needs Web Audio;
   * with the HTML5 audio fallback the game simply has no music.
   */
  startMusic(config: MusicConfig) {
    const manager = this.game?.sound as Partial<Phaser.Sound.WebAudioSoundManager> | undefined;
    if (this.music || !manager?.context || !manager.destination || config.tracks.length === 0) return;
    this.music = new MusicPlayer(manager.context, manager.destination, config);
    this.music.setEnabled(this.musicOn);
    this.music.start();
  }

  /** What the mute button should show. */
  get muted() {
    return this.settings.muted || this.portalMuted;
  }

  /** False while the portal forces mute, so the button cannot turn sound back on. */
  get canToggle() {
    return !this.portalMuted;
  }

  /** The player's music switch (the mute above still silences music when on). */
  get musicOn() {
    return !this.settings.musicOff;
  }

  toggle() {
    if (!this.canToggle) return;
    this.settings.muted = !this.settings.muted;
    this.apply();
  }

  toggleMusic() {
    this.settings.musicOff = !this.settings.musicOff;
    this.music?.setEnabled(this.musicOn);
    this.emit('change', this.muted);
  }

  /** Lowers the music for a moment under a big sound. */
  duckMusic(level = 0.35, holdSec = 2) {
    this.music?.duck(level, holdSec);
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
    const base = this.defaults[key] ?? {};
    const spread = options.pitchJitter ?? base.pitchJitter ?? 0;
    const jitter = spread ? (Math.random() * 2 - 1) * spread : 0;
    game.sound.play(key, { volume: (base.volume ?? 1) * (options.volume ?? 1), detune: (options.detune ?? 0) + jitter });
  }

  private apply() {
    if (this.game) this.game.sound.mute = this.muted || this.pauseMuted;
    this.emit('change', this.muted);
  }
}
