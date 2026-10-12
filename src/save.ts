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
 * ?preset=<name> or #<name> (web build only) starts from a prepared state and saves under its own key,
 * so trying a preset never touches real progress.
 */
export const preset =
  __TARGET__ === 'web'
    ? // A link can carry #showcase where a query string is dropped (artifact pages).
      // #debug is not a preset; #showcase+debug is the showcase with the debug box.
      (new URLSearchParams(location.search).get('preset') ??
        (/^#[a-z+]+$/.test(location.hash) ? (location.hash.slice(1).split('+').find((p) => p && p !== 'debug') ?? null) : null))
    : null;

export const save = new SaveStore<SaveData>({
  key: preset ? `${__GAME_ID__}.preset.${preset}` : `${__GAME_ID__}.save`,
  version: 2,
  defaults: () => ({
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
  }),
  // Version 1 was the framework demo: nothing to keep.
  migrate: () => ({
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
  }),
});
