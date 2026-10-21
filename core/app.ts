import Phaser from 'phaser';
import './styles.css';
import { AdManager, type AdOptions } from './ads';
import { AudioManager, type SoundDefaults } from './audio';
import type { MusicConfig } from './music';
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
import { Rng } from './rng';
import { defaultTheme, type Theme } from './theme';
import { Viewport, type ViewportOptions } from './viewport';
import { QualityGovernor } from './quality';
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
   * When the menu shows before play. Default true.
   *   true:        always
   *   false:       never; the game opens straight into playScene
   *   'returning': only for players who already have a save. New players go straight to play,
   *                so the first reward comes within seconds (CLAUDE.md 4.2)
   */
  menu?: boolean | 'returning';
  /** Key of the game's own menu scene, used instead of the core menu. */
  menuScene?: string;
  /** Queue the game's assets. They load behind the loading bar. */
  preload?: (scene: Phaser.Scene) => void;
  /** Default level and pitch spread per sound key (app.audio.play multiplies on top). */
  sounds?: Record<string, SoundDefaults>;
  /** Background music. It loads after the loading screen and starts with the first tap or key. */
  music?: MusicConfig;
  save: SaveStore<any>;
  /** Seconds between autosaves. Default 5. */
  autosaveSec?: number;
  ads?: Partial<AdOptions>;
  theme?: Partial<Theme>;
  viewport?: ViewportOptions;
}

/**
 * Big moments in play, for portal happy-time, clip capture and later analytics (CLAUDE.md 5c, A2).
 * The game emits them with app.moments.emit(...); core and tools listen.
 */
export interface MomentEvents extends Record<string, unknown[]> {
  /** A rare result. tier is the rarity index, odds the chance of that roll (0.002 = 1 in 500). */
  rarePull: [{ tier: number; odds: number; label?: string }];
  merge: [{ level: number }];
  collectionNew: [{ id: string }];
  finish: [{ runMs: number }];
}

class Moments extends Emitter<MomentEvents> {
  emit<K extends keyof MomentEvents>(event: K, ...args: MomentEvents[K]) {
    super.emit(event, ...args);
  }
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
  /** Phones only: lowers the canvas resolution when frames are slow (see quality.ts). */
  quality: QualityGovernor | null = null;
  theme: Theme = defaultTheme;
  /**
   * Seeded random numbers for gameplay (CLAUDE.md 5c, A1). Never call Math.random() for gameplay.
   * ?seed=123 fixes the seed in the web build only, so a rare moment can be replayed.
   */
  rng!: Rng;
  /** Seed used for this session. */
  seed = 0;
  readonly moments = new Moments();
  /** ?clean: no ad buttons, no toasts, no debug box, no mouse cursor. For recording videos (CLAUDE.md 5c, A4). */
  clean = false;

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

  /** Key of the menu scene, or null when the game has no menu. */
  get menuKey(): string | null {
    if (this.config.menu === false) return null;
    return this.config.menuScene ?? 'Menu';
  }

  /** First scene after loading: the menu, or play for a new player when menu is 'returning'. */
  startScene(): string {
    const menu = this.menuKey;
    if (!menu) return this.config.playScene;
    if (this.config.menu === 'returning' && this.save.isNewPlayer) return this.config.playScene;
    return menu;
  }

  /**
   * Goes back to the main menu from anywhere. No ad here: CrazyGames does not allow a midgame ad
   * on a navigation button (publishing brief, section 8). Show ads at real breaks instead (level end, new run).
   */
  toMenu() {
    this.gameplay.stop();
    this.save.flush();
    const manager = this.game.scene;
    const target = this.menuKey ?? this.config.playScene;
    for (const s of manager.getScenes(false)) {
      const key = s.scene.key;
      if (key !== target && (manager.isActive(key) || manager.isPaused(key) || manager.isSleeping(key))) manager.stop(key);
    }
    manager.start(target);
  }

  async start(config: GameConfig) {
    this.config = config;
    this.theme = { ...defaultTheme, ...config.theme };
    const params = new URLSearchParams(location.search);
    const seedParam = Number(params.get('seed'));
    this.seed = __TARGET__ === 'web' && seedParam > 0 ? seedParam : (Date.now() ^ (performance.now() * 1000)) >>> 0;
    this.rng = new Rng(this.seed);
    this.clean = params.has('clean');
    if (this.clean) document.documentElement.classList.add('clean');

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
    this.audio.setSounds(config.sounds ?? {});
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
    // Phones with 120 Hz screens: draw every other screen refresh (60 fps). Otherwise the browser aims
    // for 120, misses often, and frame times jump between 16, 25 and 33 ms (felt as stutter, phone test
    // 12/10). Phaser skips a frame while less than 1000/limit ms have passed, so 95 skips the 8.3 ms
    // refreshes of a 120 Hz screen but keeps every refresh at 90 Hz and 60 Hz (a limit of exactly 60
    // would drop frames on a 60 Hz screen whenever a refresh comes a hair early).
    const mobile = this.platform.isMobile();
    if (mobile && !(fpsParam > 0)) fps.limit = 95;
    // Resolution the governor settled on for this phone last time.
    if (mobile && this.settings.renderDpr) this.viewport.setMaxDpr(this.settings.renderDpr);

    const scenes: Phaser.Types.Scenes.SceneType[] = [BootScene, PauseScene, ...config.scenes];
    if (config.menu !== false && !config.menuScene) scenes.splice(1, 0, MenuScene);

    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      title: config.title,
      backgroundColor: this.theme.background,
      scale: this.viewport.scaleConfig(),
      input: { activePointers: 4 },
      disableContextMenu: true,
      banner: false,
      fps,
      // No multisampling: shapes are drawn into textures already smoothed (ui/shapes.ts), and on phones
      // the multisampled canvas cost a large share of the drawing time.
      render: { antialias: true, antialiasGL: false, powerPreference: 'high-performance' },
      scene: scenes,
    });
    this.viewport.attach(this.game);
    if (mobile && !params.has('fixedres')) this.quality = new QualityGovernor(this);
    this.audio.attach(this.game);
    this.platform.onMuteChange((muted) => this.audio.setPortalMuted(muted));
    this.wirePause();
    this.startAutosave(config.autosaveSec ?? 5);

    // #debug works where a query string is dropped (artifact pages); it can follow a preset: #showcase+debug.
    const hashDebug = /^#(?:[a-z]+\+)*debug(?:\+|$)/.test(location.hash);
    if ((params.has('debug') || hashDebug) && !this.clean) this.toggleDebug();
  }

  private debug: DebugOverlay | null = null;

  /** Shows or hides the debug box. Also: ?debug or #debug in the URL, or tap the menu title 5 times. */
  toggleDebug() {
    if (this.clean) return;
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
