// CrazyGames HTML5 SDK v3 adapter.
// Docs: https://docs.crazygames.com/sdk/intro/
// The SDK script tag is injected into <head> by vite.shared.mjs for the "crazygames" target.
import { createLocalStorage, type KeyValueStorage } from '../storage';
import type { AdKind, AdOutcome, Platform } from './types';

interface CrazyError {
  code: string;
  message: string;
}

interface CrazySDK {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  ad: {
    requestAd(
      type: AdKind,
      callbacks: { adStarted?: () => void; adFinished?: () => void; adError?: (error: CrazyError) => void },
    ): void;
  };
  game: {
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    happytime(): void;
    settings: { muteAudio: boolean; disableChat: boolean };
    addSettingsChangeListener(fn: (settings: { muteAudio: boolean }) => void): void;
  };
  data: KeyValueStorage;
  user: {
    systemInfo?: { countryCode?: string; locale?: string; device?: { type?: string } };
  };
}

declare global {
  interface Window {
    CrazyGames?: { SDK: CrazySDK };
  }
}

const KNOWN_ERRORS: AdOutcome[] = ['adsDisabledBasicLaunch', 'unfilled', 'adblock', 'adCooldown'];

// Ads that never start within this time are treated as unfilled, so the game never waits forever.
const AD_START_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Saves through the SDK data module, which syncs progress for logged-in players.
 * It only works when "Progress Save" is ticked in the CrazyGames submission form.
 * If any call fails (for example dataModuleDisabled), we switch to localStorage for the session.
 */
class CrazyDataStorage implements KeyValueStorage {
  private fallback: KeyValueStorage | null = null;

  constructor(private sdkData: KeyValueStorage) {}

  private run<T>(useSdk: (s: KeyValueStorage) => T, useLocal: (s: KeyValueStorage) => T): T {
    if (this.fallback) return useLocal(this.fallback);
    try {
      return useSdk(this.sdkData);
    } catch (err) {
      console.warn('[crazygames] data module failed, saving to localStorage instead:', err);
      this.fallback = createLocalStorage();
      return useLocal(this.fallback);
    }
  }

  getItem(key: string) {
    return this.run((s) => s.getItem(key), (s) => s.getItem(key));
  }
  setItem(key: string, value: string) {
    this.run((s) => s.setItem(key, value), (s) => s.setItem(key, value));
  }
  removeItem(key: string) {
    this.run((s) => s.removeItem(key), (s) => s.removeItem(key));
  }
}

export class CrazyGamesPlatform implements Platform {
  readonly id = 'crazygames';
  readonly adsSupported = true;
  readonly storage: KeyValueStorage;

  /** Throws when the SDK is missing, times out or is disabled on this domain. */
  static async create(): Promise<CrazyGamesPlatform> {
    const sdk = window.CrazyGames?.SDK;
    if (!sdk) throw new Error('SDK script not loaded (blocked by an ad blocker or offline)');
    await withTimeout(sdk.init(), 8000, 'SDK init timed out');
    if (sdk.environment === 'disabled') throw new Error('SDK is disabled on this domain');
    return new CrazyGamesPlatform(sdk);
  }

  private constructor(private sdk: CrazySDK) {
    this.storage = new CrazyDataStorage(sdk.data);
  }

  // SDK calls are wrapped so a portal-side error never crashes the game.
  private safe(name: string, fn: () => void) {
    try {
      fn();
    } catch (err) {
      console.warn(`[crazygames] ${name} failed:`, err);
    }
  }

  loadingStart() {
    this.safe('loadingStart', () => this.sdk.game.loadingStart());
  }
  loadingStop() {
    this.safe('loadingStop', () => this.sdk.game.loadingStop());
  }
  gameplayStart() {
    this.safe('gameplayStart', () => this.sdk.game.gameplayStart());
  }
  gameplayStop() {
    this.safe('gameplayStop', () => this.sdk.game.gameplayStop());
  }
  happyTime() {
    this.safe('happytime', () => this.sdk.game.happytime());
  }

  showAd(kind: AdKind, onStarted: () => void): Promise<AdOutcome> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (outcome: AdOutcome) => {
        if (done) return;
        done = true;
        clearTimeout(startTimer);
        resolve(outcome);
      };
      const startTimer = setTimeout(() => finish('unfilled'), AD_START_TIMEOUT_MS);
      try {
        this.sdk.ad.requestAd(kind, {
          adStarted: () => {
            clearTimeout(startTimer);
            if (!done) onStarted();
          },
          adFinished: () => finish('finished'),
          adError: (error) => {
            const code = error?.code as AdOutcome;
            finish(KNOWN_ERRORS.includes(code) ? code : 'other');
          },
        });
      } catch (err) {
        console.warn('[crazygames] requestAd failed:', err);
        finish('other');
      }
    });
  }

  locale() {
    return this.sdk.user.systemInfo?.locale ?? navigator.language ?? null;
  }

  isMobile() {
    const type = this.sdk.user.systemInfo?.device?.type;
    if (type) return type !== 'desktop';
    return window.matchMedia('(pointer: coarse)').matches;
  }

  onMuteChange(fn: (muted: boolean) => void) {
    fn(Boolean(this.sdk.game.settings?.muteAudio));
    this.safe('addSettingsChangeListener', () =>
      this.sdk.game.addSettingsChangeListener((settings) => fn(Boolean(settings.muteAudio))),
    );
  }
}
