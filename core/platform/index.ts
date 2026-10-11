import { CrazyGamesPlatform } from './crazygames';
import { LocalPlatform, type LocalAdMode } from './local';
import type { Platform } from './types';

export type { AdKind, AdOutcome, Platform } from './types';

/**
 * Picks the adapter for this build target.
 * If the portal SDK fails (ad blocker, offline, wrong domain) the game still runs, with ads off.
 */
export async function createPlatform(): Promise<Platform> {
  if (__TARGET__ === 'crazygames') {
    try {
      return await CrazyGamesPlatform.create();
    } catch (err) {
      console.warn('[platform] CrazyGames SDK unavailable, running without it:', err);
      return new LocalPlatform('none');
    }
  }
  const param = new URLSearchParams(location.search).get('ads') as LocalAdMode | null;
  const modes: LocalAdMode[] = ['simulate', 'fail', 'basic', 'none'];
  return new LocalPlatform(param && modes.includes(param) ? param : 'simulate');
}
