import type { KeyValueStorage } from '../storage';

export type AdKind = 'midgame' | 'rewarded';

/**
 * How an ad request ended. The non-"finished" codes follow the CrazyGames SDK.
 * "unavailable" means there is no ad SDK at all (blocked script, wrong domain, web build).
 */
export type AdOutcome =
  | 'finished'
  | 'adsDisabledBasicLaunch'
  | 'unfilled'
  | 'adblock'
  | 'adCooldown'
  | 'unavailable'
  | 'other';

/** Everything the game needs from a portal. One adapter per portal. */
export interface Platform {
  /** "crazygames" or "local". */
  readonly id: string;
  /** False when ad requests can never succeed (no SDK). Used to hide ad buttons. */
  readonly adsSupported: boolean;
  readonly storage: KeyValueStorage;

  loadingStart(): void;
  loadingStop(): void;
  /** Player is actively playing (not in a menu or pause screen). */
  gameplayStart(): void;
  gameplayStop(): void;
  /** Big moment such as a boss win. Use rarely. */
  happyTime(): void;

  /** Shows an ad. onStarted fires when the ad is really on screen, so the game can pause and mute. */
  showAd(kind: AdKind, onStarted: () => void): Promise<AdOutcome>;

  /** Locale such as "en-US", or null when unknown. */
  locale(): string | null;
  isMobile(): boolean;
  /** The portal can force mute. Called once right away with the current value, then on change. */
  onMuteChange(fn: (muted: boolean) => void): void;
}
