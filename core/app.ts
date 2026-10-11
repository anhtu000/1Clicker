import Phaser from 'phaser';
import './styles.css';
import { AdManager, type AdOptions } from './ads';
import { AudioManager } from './audio';
import { DebugOverlay } from './debug';
import { Emitter } from './emitter';
import { loadFonts } from './fonts';
import { I18n, type LangFile } from './i18n';
import coreEn from './i18n/en.json';
import coreRu from './i18n/ru.json';
import { GameplayTracker, PauseManager } from './pause';
import { createPlatform, type Platform } from './platform';
import type { SaveStore } from './save';
import { Settings } from './settings';
import { defaultTheme, type Theme } from './theme';
import { Viewport, type ViewportOptions } from './viewport';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { PauseScene } from './scenes/PauseScene';

const CORE_STRINGS: Record<string, LangFile> = { en: coreEn, ru: coreRu };

export interface GameConfig {
  /** Short id, used as prefix for storage keys. Never change it after release or saves are lost. */
  id: string;
  title: string;
  /** Game strings per language. Merged over the core strings. English is required. */
  languages: { en: LangFile } & Record<string, LangFile>;
  /** The game's own scenes. */
  scenes: Phaser.Types.Scenes.SceneType[];
  /** Key of the main gameplay scene. */
  playScene: string;
  /**
   * Show the core main menu before play. Default true.
   * For a clicker, false gets the player to the first reward faster (CLAUDE.md 4.2).
   */
  menu?: boolean;
  /** Queue the game's assets. They load behind the loading bar. */
  preload?: (scene: Phaser.Scene) => void;
  save: SaveStore<any>;
  /** Seconds between autosaves. Default 5. */
  autosaveSec?: number;
  ads?: Partial<AdOptions>;
  theme?: Partial<Theme>;
  viewport?: ViewportOptions;
}

/**
 * Shared services. Scenes import `app` and use it directly:
 *   app.audio.play('coin');  app.t('shop.title');  app.save.data
 */
class App extends Emitter<{ language: [lang: string] }> {
  config!: GameConfig;
  game!: Phaser.Game;
  platform!: Platform;
  i18n!: I18n;
  settings!: Settings;
  save!: SaveStore<any>;
  audio!: AudioManager;
  ads!: AdManager;
  pause!: PauseManager;
  gameplay!: GameplayTracker;
  viewport!: Viewport;
  theme: Theme = defaultTheme;

  /** Translate a key of the current language. */
  t(key: string, vars?: Record<string, string | number>) {
    return this.i18n.t(key, vars);
  }

  /** Text render resolution that matches the screen, so text stays sharp. */
  get textResolution() {
    const s = this.viewport.info.scale;
    return Phaser.Math.Clamp(Math.ceil(s * 4) / 4, 0.5, 3);
  }

  async setLanguage(lang: string) {
    this.settings.lang = lang;
    this.i18n.set(lang);
    await loadFonts(this.theme.font, this.i18n.sampleText());
    this.emit('language', this.i18n.lang);
  }

  /** Short vibration. Android only, respects the player's setting. */
  haptic(ms = 10) {
    if (!this.settings?.haptics) return;
    try {
      navigator.vibrate?.(ms);
    } catch {
      // blocked in some iframes
    }
  }

  /** Opens the pause overlay on top of a gameplay scene. */
  openPause(from: Phaser.Scene) {
    if (this.game.scene.isActive('Pause')) return;
    from.scene.pause();
    from.scene.launch('Pause', { from: from.scene.key });
  }

  /** Goes back to the main menu from anywhere. Shows a midgame ad at this natural break. */
  async toMenu() {
    this.gameplay.stop();
    this.save.flush();
    const manager = this.game.scene;
    const target = this.config.menu === false ? this.config.playScene : 'Menu';
    for (const s of manager.getScenes(false)) {
      const key = s.scene.key;
      if (key !== target && (manager.isActive(key) || manager.isPaused(key) || manager.isSleeping(key))) manager.stop(key);
    }
    manager.start(target);
    await this.ads.midgame();
  }

  async start(config: GameConfig) {
    this.config = config;
    this.theme = { ...defaultTheme, ...config.theme };
    const params = new URLSearchParams(location.search);

    const parent = document.getElementById('game')!;
    this.viewport = new Viewport(parent, config.viewport);

    this.platform = await createPlatform();
    this.platform.loadingStart();

    // Strings: core strings first, game strings on top.
    const files: Record<string, LangFile> = {};
    for (const [lang, file] of Object.entries(config.languages)) files[lang] = { ...CORE_STRINGS[lang], ...file };
    this.i18n = new I18n(files, 'en');
    this.settings = new Settings(this.platform.storage, `${config.id}.settings`);
    this.i18n.set(params.get('lang') ?? this.settings.lang ?? this.i18n.match(this.platform.locale()));

    this.save = config.save;
    this.save.load(this.platform.storage);

    this.audio = new AudioManager(this.settings);
    this.pause = new PauseManager();
    this.gameplay = new GameplayTracker(this.platform);
    this.ads = new AdManager(this.platform, this.pause, {
      whenAdsDisabled: 'grant',
      midgameGapSec: 180,
      ...config.ads,
    });

    await loadFonts(this.theme.font, this.i18n.sampleText());
    document.body.style.background = this.theme.background;

    // Real frame time, not smoothed. Phaser's smoothing caps delta at 16.7 ms while the page has no focus,
    // which is common in a portal iframe. On a phone running at 30 fps that would make the game,
    // and idle income, run at half speed. Phaser still resets delta after a tab switch.
    const fps: Phaser.Types.Core.FPSConfig = { smoothStep: false };
    // ?fps=144 simulates a 144 Hz screen, to check that speed does not depend on frame rate.
    const fpsParam = Number(params.get('fps'));
    if (fpsParam > 0) Object.assign(fps, { target: fpsParam, forceSetTimeOut: true });

    const scenes: Phaser.Types.Scenes.SceneType[] = [BootScene, PauseScene, ...config.scenes];
    if (config.menu !== false) scenes.splice(1, 0, MenuScene);

    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      title: config.title,
      backgroundColor: this.theme.background,
      scale: this.viewport.scaleConfig(),
      input: { activePointers: 4 },
      disableContextMenu: true,
      banner: false,
      fps,
      render: { antialias: true, powerPreference: 'high-performance' },
      scene: scenes,
    });
    this.viewport.attach(this.game);
    this.audio.attach(this.game);
    this.platform.onMuteChange((muted) => this.audio.setPortalMuted(muted));
    this.wirePause();
    this.startAutosave(config.autosaveSec ?? 5);

    if (params.has('debug')) this.toggleDebug();
  }

  private debug: DebugOverlay | null = null;

  /** Shows or hides the debug box. Also: ?debug in the URL, or tap the menu title 5 times. */
  toggleDebug() {
    if (this.debug) {
      this.debug.destroy();
      this.debug = null;
    } else {
      this.debug = new DebugOverlay(this);
      (window as any).__app = this;
    }
  }

  private wirePause() {
    // Hidden tab: Phaser already stops its loop. We add a reason so sound and game logic follow.
    this.pause.watchVisibility();
    this.pause.on('pause', () => {
      this.audio.setPauseMuted(true);
      this.game.pause();
    });
    this.pause.on('resume', () => {
      this.audio.setPauseMuted(false);
      this.game.resume();
    });
  }

  private startAutosave(seconds: number) {
    setInterval(() => this.save.flush(), seconds * 1000);
    // Write right away when the player leaves, with a fresh timestamp for offline income.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save.flush(true);
    });
    window.addEventListener('pagehide', () => this.save.flush(true));
    this.pause.on('pause', () => this.save.flush(true));
  }
}

export const app = new App();

/** Entry point, called from src/main.ts. */
export function startGame(config: GameConfig) {
  app.start(config).catch((err) => {
    console.error(err);
    const box = document.getElementById('boot-error');
    if (box) {
      box.textContent = 'Something went wrong while loading. Please reload the page.';
      box.style.display = 'block';
    }
  });
}
