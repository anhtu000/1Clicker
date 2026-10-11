// Personal records: the player's fastest timed runs, kept on this device (CLAUDE.md 4.4, 4b).
// An online leaderboard needs a portal invite (CrazyGames) or SDK (Yandex); until then this list is the board.

export interface RunRecord {
  /** Run time in ms. Lower is better. */
  ms: number;
  /** When it was set (Date.now()). */
  at: number;
  merges: number;
  scans: number;
  /** Rarity of the Galaxy that finished the run. */
  rarity: number;
}

export const MAX_RECORDS = 5;

/**
 * Adds a run to the list, fastest first, keeping the top `max`.
 * rank: 1-based place of the new run, or null when it did not make the list.
 * Ties keep the older run ahead: the record was set first.
 */
export function addRecord(list: RunRecord[], entry: RunRecord, max = MAX_RECORDS): { list: RunRecord[]; rank: number | null } {
  const next = [...list];
  let i = next.findIndex((r) => entry.ms < r.ms);
  if (i < 0) i = next.length;
  if (i >= max) return { list: next.slice(0, max), rank: null };
  next.splice(i, 0, entry);
  return { list: next.slice(0, max), rank: i + 1 };
}
