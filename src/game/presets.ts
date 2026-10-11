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
  run.levels = { slots: 1, focus: 6, probes: 1, fleet: 3, crit: 2, luck: 1, lens: 1 };
  run.highestTier = 9;
  run.energy = 4.2e6;
  run.time = 20 * 60;
  return run;
}

export function applyPreset(name: string, data: SaveData) {
  if (data.run) return; // keep what the preset session did since
  if (name === 'showcase') {
    data.run = showcase();
    data.tutorial = ['tap', 'scan', 'scan2', 'merge', 'tapPower', 'goal', 'buy', 'star', 'full', 'probes', 'tapStill', 'rarity', 'reward', 'twin'];
    for (const b of data.run.board) if (b) data.codex.found[`${b.t}.${b.r}`] = 1;
  }
}
