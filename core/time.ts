// Time helpers shared by idle income and daily rewards (CLAUDE.md 4.4).

/**
 * Seconds the player was away, capped so offline income cannot explode.
 * Returns 0 when the clock went backwards (device clock changed).
 */
export function secondsAway(lastSeenMs: number, nowMs = Date.now(), capSec = 8 * 3600): number {
  if (!lastSeenMs || nowMs <= lastSeenMs) return 0;
  return Math.min(capSec, (nowMs - lastSeenMs) / 1000);
}

/** Local calendar day as "YYYY-MM-DD", so a daily reward resets at the player's own midnight. */
export function dayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  // Date.UTC avoids daylight-saving gaps when counting whole days.
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export interface DailyState {
  /** dayKey of the last claim, or null if never claimed. */
  lastClaim: string | null;
  /** Consecutive days claimed, 1 on the first claim. */
  streak: number;
}

/**
 * What today's daily reward looks like.
 * streak is the value after claiming today: it grows on consecutive days and goes back to 1 after a missed day.
 */
export function dailyStatus(state: DailyState, today = dayKey()) {
  if (state.lastClaim === today) return { canClaim: false, streak: state.streak };
  const gap = state.lastClaim ? daysBetween(state.lastClaim, today) : Infinity;
  return { canClaim: true, streak: gap === 1 ? state.streak + 1 : 1 };
}

/**
 * Days of the current cycle already claimed (the tiles that show a tick). After claiming the last day
 * of a cycle the whole cycle shows ticked until the next day starts a new one.
 */
export function dailyClaimedInCycle(state: DailyState, cycle: number, today = dayKey()): number {
  const status = dailyStatus(state, today);
  if (status.canClaim) return (status.streak - 1) % cycle;
  return ((status.streak - 1) % cycle) + 1;
}

/** Marks today's reward as claimed. Returns the new state. Call only when dailyStatus says canClaim. */
export function claimDaily(state: DailyState, today = dayKey()): DailyState {
  return { lastClaim: today, streak: dailyStatus(state, today).streak };
}

/**
 * Runs game logic in fixed steps, whatever the screen refresh rate (60, 144, 165 Hz).
 * Use it for economy ticks. For movement, multiply speed by delta instead.
 *   const tick = new FixedStep(100, () => addIncome(0.1));
 *   update(_, delta) { tick.update(delta); }
 */
export class FixedStep {
  private acc = 0;
  private stepMs: number;
  private onStep: (stepSec: number) => void;
  private maxStepsPerFrame: number;

  /** maxStepsPerFrame stops a long hitch from freezing the game while it catches up. */
  constructor(stepMs: number, onStep: (stepSec: number) => void, maxStepsPerFrame = 10) {
    this.stepMs = stepMs;
    this.onStep = onStep;
    this.maxStepsPerFrame = maxStepsPerFrame;
  }

  update(deltaMs: number) {
    this.acc += deltaMs;
    let steps = 0;
    while (this.acc >= this.stepMs && steps < this.maxStepsPerFrame) {
      this.acc -= this.stepMs;
      this.onStep(this.stepMs / 1000);
      steps++;
    }
    if (steps === this.maxStepsPerFrame) this.acc = 0;
  }
}
