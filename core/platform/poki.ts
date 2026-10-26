// Poki SDK v2 adapter.
// Docs: https://sdk.poki.com/html5 (checked 14/10/2026).
// The SDK script tag is injected into <head> by vite.config.ts for the "poki" target.
// Rules from the docs that this adapter and core/ads.ts follow:
//   - init() first; the game starts whether init resolves or rejects (ad blocker).
//   - gameLoadingFinished() once loading is done.
//   - gameplayStart() / gameplayStop() around active play (core/pause.ts calls them).
//   - commercialBreak() only at natural breaks; mute and pause while it runs.
//   - rewardedBreak() resolves true only when the player earned the reward.
//   - No outside links, no other ads, the game never locks when ads are blocked.
import { createLocalStorage } from '../storage';
import type { AdKind, AdOutcome, Platform } from './types';

interface PokiSDKApi {
  init(): Promise<void>;
  gameLoadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(onStart?: () => void): Promise<void>;
  rewardedBreak(options?: { size?: 'small' | 'medium' | 'large'; onStart?: () => void }): Promise<boolean>;
  getURLParam?(name: string): string;
}

declare global {
  interface Window {
    PokiSDK?: PokiSDKApi;
  }
}

// A break that never resolves (broken network) must not freeze the game.
const BREAK_TIMEOUT_MS = 60_000;

export class PokiPlatform implements Platform {
  readonly id = 'poki';
  readonly adsSupported = true;
  readonly storage = createLocalStorage();
  private gameplay = false;

  /** Throws when the SDK script is missing. A rejected init (ad blocker) still returns the adapter. */
  static async create(): Promise<PokiPlatform> {
    const sdk = window.PokiSDK;
    if (!sdk) throw new Error('Poki SDK script not loaded');
    try {
      await sdk.init();
    } catch (err) {
      // Poki: "start the game in both then and catch". Ads simply never show.
      console.warn('[poki] init rejected (ad blocker?), continuing:', err);
    }
    return new PokiPlatform(sdk);
  }

  private constructor(private sdk: PokiSDKApi) {}

  private safe(name: string, fn: () => void) {
    try {
      fn();
    } catch (err) {
      console.warn(`[poki] ${name} failed:`, err);
    }
  }

  loadingStart() {}
  loadingStop() {
    this.safe('gameLoadingFinished', () => this.sdk.gameLoadingFinished());
  }
  gameplayStart() {
    if (this.gameplay) return;
    this.gameplay = true;
    this.safe('gameplayStart', () => this.sdk.gameplayStart());
  }
  gameplayStop() {
    if (!this.gameplay) return;
    this.gameplay = false;
    this.safe('gameplayStop', () => this.sdk.gameplayStop());
  }
  happyTime() {}

  async showAd(kind: AdKind, onStarted: () => void): Promise<AdOutcome> {
    // Poki wants gameplayStop before any break; core/pause.ts sends gameplayStart again on resume.
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      onStarted();
    };
    const wasPlaying = this.gameplay;
    this.gameplayStop();
    try {
      if (kind === 'rewarded') {
        const ok = await withTimeout(this.sdk.rewardedBreak({ size: 'medium', onStart: start }), BREAK_TIMEOUT_MS);
        return ok ? 'finished' : 'unfilled';
      }
      await withTimeout(this.sdk.commercialBreak(start), BREAK_TIMEOUT_MS);
      return started ? 'finished' : 'unfilled';
    } catch (err) {
      console.warn(`[poki] ${kind} break failed:`, err);
      return 'other';
    } finally {
      if (wasPlaying) this.gameplayStart();
    }
  }

  locale() {
    return navigator.language ?? null;
  }

  isMobile() {
    return window.matchMedia('(pointer: coarse)').matches;
  }

  onMuteChange(fn: (muted: boolean) => void) {
    // Poki has no portal mute setting.
    fn(false);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
