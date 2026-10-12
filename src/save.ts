import { SaveStore, type DailyState } from '@core';
import { newDecorState, type DecorState } from './logic/decor.ts';
import type { RunRecord } from './logic/records.ts';
import type { Codex, RunState } from './logic/run.ts';

// Progress of this game. Everything here is saved automatically (core/save.ts).
export interface SaveData {
  /** The main run. null until the first tap. */
  run: RunState | null;
  /** Timed replay run, separate from the main run. */
  speedrun: RunState | null;
  /** Which run is on screen. The main run is never touched by a timed run. */
  mode: 'main' | 'speedrun';
  /** When the player left the main run for a timed run (ms), 0 = not away. Probes keep earning meanwhile. */
  mainLeftAt: number;
  /** Bodies discovered, shared by all runs. */
  codex: Codex;
  /** Tutorial steps already done. */
  tutorial: string[];
  daily: DailyState;
  /** Best replay time in ms, 0 = none yet. Lower is better. Leaderboard metric for later (CLAUDE.md 4b). */
  bestRunMs: number;
  /** Fastest timed runs on this device, fastest first (personal records board). */
  records: RunRecord[];
  /** Second currency, for decorations only (CLAUDE.md 4b item 9). */
  crystals: number;
  /** Decorations bought and where they sit (CLAUDE.md 4b item 10). */
  decor: DecorState;
  /** When the decor shop's crystal ad was last watched (ms), for its cooldown. */
  decorAdAt: number;
  /** Main-run time to the goal, kept for the finish screen. */
  firstFinishMs: number;
}

/**
 * Test builds only (web: the draft artifact and the phone test file). Changing this value wipes the
 * test saves on the next load, so a new round of testing starts from the very beginning. #reset in
 * the address does the same once. Settings (sound, language) stay. The portal build never does this.
 */
const WEB_SAVE_EPOCH = '2026-10-13a';

if (__TARGET__ === 'web') {
  try {
    const epochKey = `${__GAME_ID__}.webEpoch`;
    const asked = /(^#|\+)reset(\+|$)/.test(location.hash) || new URLSearchParams(location.search).has('reset');
    if (asked || localStorage.getItem(epochKey) !== WEB_SAVE_EPOCH) {
      for (const key of Object.keys(localStorage)) {
        if (key === `${__GAME_ID__}.save` || key.startsWith(`${__GAME_ID__}.preset.`)) localStorage.removeItem(key);
      }
      localStorage.setItem(epochKey, WEB_SAVE_EPOCH);
    }
    // Drop #reset from the address, so a reload does not wipe again.
    if (asked) {
      const query = location.search
        .slice(1)
        .split('&')
        .filter((p) => p && p !== 'reset' && !p.startsWith('reset='))
        .join('&');
      const hash = location.hash.replace(/(^#|\+)reset(?=\+|$)/, '$1').replace(/^#\+/, '#').replace(/\+$/, '').replace(/^#$/, '');
      history.replaceState(null, '', location.pathname + (query ? `?${query}` : '') + hash);
    }
  } catch {
    // no storage here: every load is fresh anyway
  }
}

/**
 * ?preset=<name> or #<name> (web build only) starts from a prepared state and saves under its own key,
 * so trying a preset never touches real progress.
 */
export const preset =
  __TARGET__ === 'web'
    ? // A link can carry #showcase where a query string is dropped (artifact pages).
      // #debug is not a preset; #showcase+debug is the showcase with the debug box.
      (new URLSearchParams(location.search).get('preset') ??
        (/^#[a-z+]+$/.test(location.hash) ? (location.hash.slice(1).split('+').find((p) => p && p !== 'debug' && p !== 'reset') ?? null) : null))
    : null;

const fresh = (): SaveData => ({
  run: null,
  speedrun: null,
  mode: 'main',
  mainLeftAt: 0,
  codex: { found: {} },
  tutorial: [],
  daily: { lastClaim: null, streak: 0 },
  bestRunMs: 0,
  records: [],
  crystals: 0,
  decor: newDecorState(),
  decorAdAt: 0,
  firstFinishMs: 0,
});

/** Version 2 to 3: Orbit Ring went from 2 levels of +4 slots to 8 levels of +1, so the same board stays open. */
function fromV2(old: SaveData): SaveData {
  for (const run of [old.run, old.speedrun]) {
    if (run?.levels?.slots) run.levels.slots *= 4;
  }
  return old;
}

/**
 * Version 3 to 4 (upgrade rework 12/10): Probe Bay folded into Probe Fleet (level 1 now starts the probes),
 * Deep Scanner removed. Other lines keep their level; their effect per level changed with the rework.
 */
function fromV3(old: SaveData): SaveData {
  for (const run of [old.run, old.speedrun]) {
    if (!run?.levels) continue;
    const { probes = 0, fleet = 0 } = run.levels;
    run.levels.fleet = probes > 0 ? fleet + 1 : 0;
    delete run.levels.probes;
    delete run.levels.deepScan;
  }
  return old;
}

export const save = new SaveStore<SaveData>({
  key: preset ? `${__GAME_ID__}.preset.${preset}` : `${__GAME_ID__}.save`,
  version: 4,
  defaults: fresh,
  // Version 1 was the framework demo: nothing to keep.
  migrate: (old, from) => (from === 2 ? fromV3(fromV2(old)) : from === 3 ? fromV3(old) : fresh()),
});
