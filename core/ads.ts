import type { PauseManager } from './pause';
import type { AdKind, AdOutcome, Platform } from './platform';

export interface AdOptions {
  /**
   * What a rewarded button does while the portal has ads switched off
   * (CrazyGames Basic Launch returns "adsDisabledBasicLaunch").
   *   "grant": give the reward without an ad, so Basic Launch players get the same pacing
   *   "deny":  no reward
   * Other failures (no fill, ad blocker, no SDK) never grant a reward.
   */
  whenAdsDisabled: 'grant' | 'deny';
  /** Our own gap between midgame ads. CrazyGames uses about 3 minutes and counts rewarded ads too. */
  midgameGapSec: number;
}

/**
 * Wraps portal ads with the rules from CLAUDE.md section 4.5 and 6:
 * pause and mute while an ad runs, only one ad at a time, midgame ads spaced out.
 */
export class AdManager {
  /** Outcome of the most recent request, for messages such as "No ad available, try later". */
  lastOutcome: AdOutcome | null = null;
  private busy = false;
  private lastAdAt = -Infinity;
  private adsDisabled = false;

  constructor(
    private platform: Platform,
    private pause: PauseManager,
    private options: AdOptions,
  ) {}

  /** Show rewarded buttons only when this is true. */
  get rewardedAvailable() {
    if (this.adsDisabled) return this.options.whenAdsDisabled === 'grant';
    return this.platform.adsSupported;
  }

  get isShowing() {
    return this.busy;
  }

  /**
   * True once the portal has said ads are off and rewards are granted without one
   * (CrazyGames Basic Launch with whenAdsDisabled "grant"). Games use it to slow
   * reward cooldowns to the pace of a player who watches ads.
   */
  get rewardsAreFree() {
    return this.adsDisabled && this.options.whenAdsDisabled === 'grant';
  }

  /** Resolves true when the player has earned the reward. Give the reward only then. */
  async rewarded(): Promise<boolean> {
    if (this.busy) return false;
    if (this.adsDisabled) return this.options.whenAdsDisabled === 'grant';
    const outcome = await this.run('rewarded');
    if (outcome === 'finished') return true;
    if (outcome === 'adsDisabledBasicLaunch') {
      this.adsDisabled = true;
      return this.options.whenAdsDisabled === 'grant';
    }
    return false;
  }

  /**
   * Midgame ad at a natural break (level end, back to menu). Never during active play.
   * Skips silently when called too soon after the previous ad.
   */
  async midgame(): Promise<boolean> {
    if (this.busy || this.adsDisabled || !this.platform.adsSupported) return false;
    const sinceLast = (performance.now() - this.lastAdAt) / 1000;
    if (sinceLast < this.options.midgameGapSec) return false;
    const outcome = await this.run('midgame');
    if (outcome === 'adsDisabledBasicLaunch') this.adsDisabled = true;
    return outcome === 'finished';
  }

  private async run(kind: AdKind): Promise<AdOutcome> {
    this.busy = true;
    let paused = false;
    try {
      const outcome = await this.platform.showAd(kind, () => {
        paused = true;
        this.pause.add('ad');
      });
      this.lastOutcome = outcome;
      if (outcome === 'finished') this.lastAdAt = performance.now();
      return outcome;
    } finally {
      if (paused) this.pause.remove('ad');
      this.busy = false;
    }
  }
}
