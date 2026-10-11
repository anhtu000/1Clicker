// Platform used for local dev, the "web" build and as a fallback when a portal SDK fails.
// Ads are simulated with a DOM overlay so pause and mute can be tested without a portal.
// Add ?ads=<mode> to the URL to test other cases:
//   ?ads=fail   every ad comes back "unfilled"
//   ?ads=basic  every ad comes back "adsDisabledBasicLaunch" (CrazyGames Basic Launch)
//   ?ads=none   no ad SDK at all
import { createLocalStorage } from '../storage';
import type { AdKind, AdOutcome, Platform } from './types';

export type LocalAdMode = 'simulate' | 'fail' | 'basic' | 'none';

const SIMULATED_AD_MS = 2500;

export class LocalPlatform implements Platform {
  readonly id = 'local';
  readonly storage = createLocalStorage();
  readonly adsSupported: boolean;

  constructor(private adMode: LocalAdMode = 'simulate') {
    this.adsSupported = adMode !== 'none';
  }

  loadingStart() {}
  loadingStop() {}
  gameplayStart() {}
  gameplayStop() {}
  happyTime() {
    console.info('[local] happy time');
  }

  async showAd(kind: AdKind, onStarted: () => void): Promise<AdOutcome> {
    if (this.adMode === 'fail') return 'unfilled';
    if (this.adMode === 'basic') return 'adsDisabledBasicLaunch';
    if (this.adMode === 'none') return 'unavailable';
    onStarted();
    await showFakeAd(kind);
    return 'finished';
  }

  locale() {
    return navigator.language ?? null;
  }

  isMobile() {
    return window.matchMedia('(pointer: coarse)').matches;
  }

  onMuteChange(fn: (muted: boolean) => void) {
    // Same test flag the CrazyGames SDK uses locally.
    fn(new URLSearchParams(location.search).get('muteAudio') === 'true');
  }
}

function showFakeAd(kind: AdKind): Promise<void> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;inset:0;z-index:9999;display:flex;flex-direction:column;align-items:center;' +
      'justify-content:center;gap:12px;background:rgba(0,0,0,.88);color:#fff;font:600 20px system-ui,sans-serif';
    const label = document.createElement('div');
    const count = document.createElement('div');
    count.style.cssText = 'font-size:48px';
    label.textContent = `Simulated ${kind} ad`;
    overlay.append(label, count);
    document.body.append(overlay);

    const end = performance.now() + SIMULATED_AD_MS;
    const tick = () => {
      const left = end - performance.now();
      if (left <= 0) {
        overlay.remove();
        resolve();
        return;
      }
      count.textContent = String(Math.ceil(left / 1000));
      setTimeout(tick, 100);
    };
    tick();
  });
}
