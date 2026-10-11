// Simulated player for balance checks. Drives the same Run class as the game.
// The player model is an assumption (see PROFILES); real playtests replace it.
import { checkContent, type Content } from '../../src/logic/content.ts';
import { newRunState, Run, type RewardId } from '../../src/logic/run.ts';

/** How the player uses rewarded buttons. */
export interface AdPolicy {
  id: 'none' | 'realistic' | 'basic';
  label: string;
  /** Extra seconds the player waits after a button is ready before pressing it. */
  delay: number;
  /** Seconds the ad takes. The game is paused meanwhile, the clock is not. */
  adSeconds: number;
}

export const AD_POLICIES: AdPolicy[] = [
  { id: 'none', label: 'No ads', delay: 0, adSeconds: 0 },
  { id: 'realistic', label: 'Watches ads (30 s each, not always right away)', delay: 90, adSeconds: 30 },
  { id: 'basic', label: 'Basic Launch (reward without ad, used as soon as ready)', delay: 0, adSeconds: 0 },
];

/** Manual taps per second while the player is free to tap, by minute. Assumption. */
export interface TapProfile {
  id: string;
  tps: (sec: number) => number;
}

export const PROFILES: Record<string, TapProfile> = {
  normal: { id: 'normal', tps: (s) => (s < 300 ? 6 : s < 900 ? 4.5 : 3) },
  slow: { id: 'slow', tps: (s) => (s < 300 ? 3 : s < 900 ? 2.2 : 1.5) },
};

/** Seconds of attention per action. Assumption. */
const ACTION_TIME = { scan: 0.35, merge: 1.0, buy: 0.6, absorb: 1.2, reward: 0.5 };

/** A player stops scanning to save for the cheapest upgrade when it is this many seconds of income away. */
const SAVE_WINDOW_SEC = 30;

/** Upgrades a player buys as soon as they can, because they open something new. */
const UNLOCKS = new Set(['probes', 'slots', 'deepScan', 'autoScan', 'autoMerge']);

export interface Milestone {
  t: number;
  what: string;
}

export interface RunReport {
  seed: number;
  policy: string;
  profile: string;
  finished: boolean;
  /** Wall-clock seconds to the goal, ads included. */
  finishSec: number;
  milestones: Milestone[];
  /** Longest stretch with no scan, merge or purchase, per period. */
  maxGap: { first10: number; to30: number; after30: number };
  scans: number;
  merges: number;
  manualTaps: number;
  absorbs: number;
  stars: number;
  rewards: Record<string, number>;
  codexFound: number;
  rarityCounts: number[];
  /** Energy per second (manual + auto) sampled each minute. */
  incomeByMinute: number[];
  scanCostByMinute: number[];
  /** Expected energy per second (manual + probes), every 10 s of wall clock. */
  incomeSeries: number[];
  /** Every stretch of 20 s or more with no scan, merge or purchase: [start, length]. */
  longGaps: [number, number][];
}

/** Deterministic 0..1 from the seed and a counter, so a missed star does not use the game's RNG. */
function starRoll(seed: number, n: number): number {
  const x = Math.sin(seed * 9301 + n * 49297) * 233280;
  return x - Math.floor(x);
}

export function loadContent(read: (path: string) => string): Content {
  return checkContent(
    JSON.parse(read('src/content/bodies.json')),
    JSON.parse(read('src/content/economy.json')),
    JSON.parse(read('src/content/upgrades.json')),
  );
}

export function simulate(content: Content, seed: number, policy: AdPolicy, profile: TapProfile, limitSec = 3 * 3600, dt = 0.1): RunReport {
  const run = new Run(content, newRunState(content, 'speedrun', seed), { found: {} });
  const s = run.s;
  let clock = 0; // wall clock, includes ads
  let busyUntil = 0;
  let tapAcc = 0;
  let manualTaps = 0;
  let absorbs = 0;
  let stars = 0;
  let lastAction = 0;
  const maxGap = { first10: 0, to30: 0, after30: 0 };
  const rewards: Record<string, number> = { freeUpgrade: 0, luckyScan: 0, mergeAll: 0 };
  const milestones: Milestone[] = [];
  const seen = new Set<string>();
  const rarityCounts = content.rarities.map(() => 0);
  const incomeByMinute: number[] = [];
  const scanCostByMinute: number[] = [];
  const incomeSeries: number[] = [];
  let manualEnergyThisMinute = 0;
  let energyMarkMinute = 0;

  const mark = (key: string, what: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    milestones.push({ t: clock, what });
  };
  const longGaps: [number, number][] = [];
  const acted = () => {
    const gap = clock - lastAction;
    if (gap >= 20) longGaps.push([lastAction, gap]);
    const bucket = lastAction < 600 ? 'first10' : lastAction < 1800 ? 'to30' : 'after30';
    maxGap[bucket] = Math.max(maxGap[bucket], gap);
    lastAction = clock;
  };
  const noteBody = (r: number, t: number) => {
    rarityCounts[r] += 1;
    mark(`tier${t}`, `First ${content.tiers[t - 1].id} (tier ${t})`);
    if (r >= 2) mark(`rarity${r}`, `First ${content.rarities[r].id}`);
  };
  const trackVisible = () => {
    for (const u of content.upgrades) if (run.isVisible(u)) mark(`show-${u.id}`, `Shop shows ${u.id}`);
  };

  const useReward = (id: RewardId): boolean => {
    if (policy.id === 'none' || !run.rewardReady(id)) return false;
    // "delay": the button has been ready for a while before this player bothers.
    const readyAt = s.rewardReadyAt[id] ?? 0;
    if (s.time < readyAt + policy.delay) return false;
    if (id === 'freeUpgrade') {
      const target = run.freeUpgradeTarget();
      if (!target) return false;
      run.grant(target);
      mark(`bought-${target}-${run.level(target)}`, `Got ${target} L${run.level(target)} (ad)`);
    } else if (id === 'luckyScan') {
      const result = run.luckyScan();
      if (!result) return false;
      noteBody(result.body.r, result.body.t);
    } else {
      // Only worth an ad when it does real work.
      let pairs = 0;
      const tiers: Record<number, number> = {};
      for (let i = 0; i < run.slots; i++) {
        const b = s.board[i];
        if (b) tiers[b.t] = (tiers[b.t] ?? 0) + 1;
      }
      for (const n of Object.values(tiers)) pairs += Math.floor(n / 2);
      if (pairs < 3) return false;
      for (const r of run.mergeAll()) noteBody(r.body.r, r.body.t);
    }
    run.useReward(id, policy.id === 'basic');
    rewards[id] += 1;
    acted();
    // The ad pauses the game: the wall clock moves on, the run does not. Watching is not idle time.
    clock += policy.adSeconds;
    lastAction = clock;
    busyUntil = Math.max(busyUntil, clock) + ACTION_TIME.reward;
    return true;
  };

  const decide = (): boolean => {
    if (useReward('freeUpgrade') || useReward('luckyScan') || useReward('mergeAll')) return true;

    for (const u of content.upgrades) {
      if (UNLOCKS.has(u.id) && run.canBuy(u.id)) {
        run.buy(u.id);
        mark(`bought-${u.id}-${run.level(u.id)}`, `Bought ${u.id} L${run.level(u.id)}`);
        busyUntil = clock + ACTION_TIME.buy;
        acted();
        return true;
      }
    }

    const pair = run.findPair();
    if (pair) {
      const result = run.merge(pair[0], pair[1])!;
      noteBody(result.body.r, result.body.t);
      busyUntil = clock + ACTION_TIME.merge;
      acted();
      return true;
    }

    // The cheapest upgrade in the shop is what the player is working toward.
    let goal: string | null = null;
    let goalCost = Infinity;
    for (const u of content.upgrades) {
      if (!run.isVisible(u) || run.isMaxed(u)) continue;
      const cost = run.upgradeCost(u);
      if (cost < goalCost) {
        goal = u.id;
        goalCost = cost;
      }
    }
    if (goal && run.canBuy(goal)) {
      run.buy(goal);
      mark(`bought-${goal}-${run.level(goal)}`, `Bought ${goal} L${run.level(goal)}`);
      busyUntil = clock + ACTION_TIME.buy;
      acted();
      return true;
    }
    // Close enough to the goal: stop scanning and save for it.
    const income = profile.tps(clock) * run.tapValue() * run.critAverage() + run.autoIncome();
    const saving = goal !== null && goalCost - s.energy <= income * SAVE_WINDOW_SEC;
    if (!saving && run.canScan()) {
      const result = run.scan()!;
      noteBody(result.body.r, result.body.t);
      busyUntil = clock + ACTION_TIME.scan;
      acted();
      return true;
    }
    // Stuck: board full and nothing pairs. Feed the lowest body to the core.
    if (run.freeSlot() < 0 && !pair) {
      let lowest = -1;
      for (let i = 0; i < run.slots; i++) {
        const b = s.board[i];
        if (b && (lowest < 0 || b.t < s.board[lowest]!.t || (b.t === s.board[lowest]!.t && b.r < s.board[lowest]!.r))) lowest = i;
      }
      if (lowest >= 0) {
        run.absorb(lowest);
        absorbs += 1;
        mark('absorb', 'First absorb (board stuck)');
        busyUntil = clock + ACTION_TIME.absorb;
        acted();
        return true;
      }
    }
    return false;
  };

  while (clock < limitSec && s.finishedAt === null) {
    // run.update counts run time; the player acts on the wall clock.
    for (const ev of run.update(dt)) {
      if (ev.kind === 'scan' || ev.kind === 'merge') noteBody(ev.result.body.r, ev.result.body.t);
    }
    // Catch a shooting star after a short reaction time; the player misses about 1 in 6.
    if (run.starUp && s.starTimer > -content.economy.stars.lifetime + 1.5 && starRoll(seed, s.taps) > 1 / 6) {
      run.catchStar();
      stars += 1;
      mark('star', 'First shooting star caught');
      acted();
    }
    clock += dt;
    trackVisible();

    if (clock >= busyUntil) {
      if (!decide()) {
        tapAcc += profile.tps(clock) * dt;
        while (tapAcc >= 1) {
          tapAcc -= 1;
          manualEnergyThisMinute += run.tap().amount;
          manualTaps += 1;
        }
      }
    }
    if (s.levels.probes) mark('auto', 'Automation: probes start tapping');

    if (Math.floor(clock / 10) > incomeSeries.length - 1) {
      incomeSeries.push(profile.tps(clock) * run.tapValue() * run.critAverage() + run.autoIncome());
    }
    const minute = Math.floor(clock / 60);
    if (minute > energyMarkMinute) {
      incomeByMinute.push(manualEnergyThisMinute / 60 + run.autoIncome());
      scanCostByMinute.push(run.scanCost());
      manualEnergyThisMinute = 0;
      energyMarkMinute = minute;
    }
  }
  acted();

  return {
    seed,
    policy: policy.id,
    profile: profile.id,
    finished: s.finishedAt !== null,
    finishSec: clock,
    milestones,
    maxGap,
    scans: s.scans,
    merges: s.merges,
    manualTaps,
    absorbs,
    stars,
    rewards,
    codexFound: Object.keys(run.codex.found).length,
    rarityCounts,
    incomeByMinute,
    scanCostByMinute,
    incomeSeries,
    longGaps,
  };
}
