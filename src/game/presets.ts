import { content } from './content';
import { newRunState, type Body, type RunState } from '../logic/run.ts';
import type { SaveData } from '../save';

// Prepared states for testing and for recording video (CLAUDE.md 5c, B2). Web build only.

function showcase(): RunState {
  const run = newRunState(content, 'main', 4242);
  const bodies: Body[] = [
    { t: 1, r: 0 }, { t: 2, r: 1 }, { t: 3, r: 0 }, { t: 4, r: 2 },
    { t: 5, r: 0 }, { t: 5, r: 3 }, { t: 6, r: 1 }, { t: 6, r: 0 },
    { t: 7, r: 2 }, { t: 7, r: 0 }, { t: 8, r: 4 }, { t: 9, r: 3 },
  ];
  bodies.forEach((b, i) => (run.board[i] = b));
  run.levels = { slots: 4, focus: 6, fleet: 4, crit: 2, luck: 1, lens: 2 };
  run.highestTier = 9;
  run.energy = 4.2e6;
  run.time = 20 * 60;
  return run;
}

const ALL_STEPS = ['tap', 'scan', 'scan2', 'merge', 'rarities', 'tapPower', 'goal', 'buy', 'star', 'full', 'probes', 'tapStill', 'rarity', 'reward', 'twin', 'autoScan', 'autoMerge', 'decorGift', 'decorBuy', 'decorArrange', 'decorDrag', 'decor'];

/** Two Asteroids to merge into the first Comet (checks the guided first decoration). */
function comet(): RunState {
  const run = newRunState(content, 'main', 11);
  run.board[0] = { t: 3, r: 0 };
  run.board[1] = { t: 3, r: 0 };
  run.board[2] = { t: 2, r: 0 };
  run.levels = { focus: 2 };
  run.highestTier = 3;
  run.energy = 400;
  run.time = 150;
  run.starTimer = 60;
  return run;
}

/** Right after the opening tutorial, with the first shooting star two seconds away (checks the star step). */
function starStep(): RunState {
  const run = newRunState(content, 'main', 7);
  run.board[0] = { t: 2, r: 1 };
  run.highestTier = 2;
  run.energy = 60;
  run.time = 40;
  run.starTimer = 2;
  return run;
}

/** One merge from the Galaxy: two Black Holes side by side (checks the finish panel). */
function almost(): RunState {
  const run = showcase();
  run.board[10] = { t: 9, r: 1 };
  run.board[11] = { t: 9, r: 3 };
  run.time = 41 * 60 + 7.5;
  return run;
}

/** A Galaxy next to a planet, gas giant, star and black hole (checks the hidden bodies). */
function hidden(): RunState {
  const run = showcase();
  run.board[8] = { t: 10, r: 2 };
  run.board[9] = { t: 6, r: 0 };
  run.board[10] = { t: 7, r: 1 };
  run.board[11] = { t: 10, r: 0 };
  run.finishedAt = 30 * 60;
  run.highestTier = 10;
  return run;
}

/** Board full and every slot bought: tiers 1-9 once, three Galaxies, four hidden bodies. Nothing can merge (checks the Board full panel). */
function stuck(): RunState {
  const run = showcase();
  run.levels.slots = 8;
  for (let t = 1; t <= 9; t++) run.board[t - 1] = { t, r: t % 3 };
  run.board[9] = { t: 10, r: 0 };
  run.board[10] = { t: 10, r: 1 };
  run.board[11] = { t: 10, r: 2 };
  run.board[12] = { t: 6, r: 1, s: 'cradleWorld' };
  run.board[13] = { t: 7, r: 0, s: 'haloGiant' };
  run.board[14] = { t: 8, r: 2, s: 'starburstCore' };
  run.board[15] = { t: 9, r: 0, s: 'quasar' };
  run.highestTier = 10;
  run.finishedAt = 30 * 60;
  return run;
}

export function applyPreset(name: string, data: SaveData) {
  if (data.run) return; // keep what the preset session did since
  if (name === 'starstep') {
    data.run = starStep();
    data.tutorial = ['tap', 'scan', 'scan2', 'merge', 'tapPower', 'goal'];
    data.codex.found['2.1'] = 1;
  }
  if (name === 'comet') {
    data.run = comet();
    data.tutorial = ALL_STEPS.filter((id) => !id.startsWith('decor'));
    data.crystals = 0;
  }
  if (name === 'almost') {
    data.run = almost();
    data.tutorial = [...ALL_STEPS];
    for (const b of data.run.board) if (b) data.codex.found[`${b.t}.${b.r}`] = 1;
  }
  if (name === 'almosttimed') {
    // A timed run one merge from the Galaxy, with a few earlier records (checks the records board).
    data.run = showcase();
    data.speedrun = { ...almost(), mode: 'speedrun' };
    data.mode = 'speedrun';
    data.firstFinishMs = 52 * 60 * 1000;
    const day = 24 * 3600 * 1000;
    data.records = [
      { ms: 38 * 60e3 + 12_340, at: Date.now() - 3 * day, merges: 96, scans: 88, rarity: 1 },
      { ms: 40 * 60e3 + 5_000, at: Date.now() - 2 * day, merges: 101, scans: 90, rarity: 0 },
      { ms: 44 * 60e3 + 51_200, at: Date.now() - day, merges: 110, scans: 97, rarity: 2 },
      { ms: 47 * 60e3 + 2_800, at: Date.now() - day, merges: 104, scans: 99, rarity: 0 },
    ];
    data.bestRunMs = data.records[0].ms;
    data.tutorial = [...ALL_STEPS];
  }
  if (name === 'stuck') {
    data.run = stuck();
    data.firstFinishMs = 30 * 60 * 1000;
    data.tutorial = [...ALL_STEPS];
    for (const b of data.run.board) if (b) data.codex.found[b.s ? `s.${b.s}.${b.r}` : `${b.t}.${b.r}`] = 1;
  }
  if (name === 'hidden') {
    data.run = hidden();
    data.crystals = 300;
    data.firstFinishMs = 30 * 60 * 1000;
    data.tutorial = [...ALL_STEPS];
    for (const b of data.run.board) if (b) data.codex.found[`${b.t}.${b.r}`] = 1;
  }
  if (name === 'showcase') {
    data.run = showcase();
    data.tutorial = [...ALL_STEPS];
    for (const b of data.run.board) if (b) data.codex.found[`${b.t}.${b.r}`] = 1;
  }
}
