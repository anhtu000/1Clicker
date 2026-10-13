// Simulated player for balance checks. Drives the same Run class as the game.
// Everything about the player is an assumption (profiles, action times, saving habit);
// real playtests replace it.
import { checkContent, type Content } from '../../src/logic/content.ts';
import { newRunState, Run, type MergeResult, type RewardId, type RunMode } from '../../src/logic/run.ts';

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

/** How much the player taps by hand while free to tap. */
export interface TapProfile {
  id: string;
  label: string;
  /** Taps per second at wall-clock second `sec`. `auto`: probes are working. */
  tps: (sec: number, auto: boolean) => number;
  /** Stops buying hand-tap upgrades once probes work. */
  ignoresTapUpgradesWithAuto?: boolean;
}

export const PROFILES: Record<string, TapProfile> = {
  normal: { id: 'normal', label: 'Taps steadily', tps: (s) => (s < 300 ? 6 : s < 900 ? 4.5 : 3) },
  slow: { id: 'slow', label: 'Taps at half speed', tps: (s) => (s < 300 ? 3 : s < 900 ? 2.2 : 1.5) },
  idle: {
    id: 'idle',
    label: 'Taps only now and then once probes work',
    tps: (s, auto) => (auto ? 0.5 : s < 300 ? 6 : 4.5),
    ignoresTapUpgradesWithAuto: true,
  },
};

const HAND_UPGRADES = new Set(['focus', 'crit']);

/** Seconds of attention per action. Assumption. */
const ACTION_TIME = { scan: 0.35, merge: 1.0, buy: 0.6, absorb: 1.2, reward: 0.5 };

/**
 * The player stops scanning to save for the cheapest upgrade when it is this many seconds
 * of income away. Shorter early, when everything is cheap and the player buys often.
 */
const saveWindow = (sec: number) => (sec < 600 ? 15 : 30);

/** Upgrades a player buys as soon as they can, because they open something new. */
const UNLOCKS = new Set(['slots', 'autoScan', 'autoMerge']);
/** Upgrades whose first level is an unlock (Probe Fleet level 1 starts the probes); later levels are ordinary. */
const FIRST_LEVEL_UNLOCKS = new Set(['fleet']);

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
  /** Longest stretch with no reward (scan, merge, purchase, star), per period. */
  maxGap: { first10: number; to30: number; after30: number };
  /** Every stretch of 20 s or more with no reward: [start, length]. */
  longGaps: [number, number][];
  scans: number;
  merges: number;
  twins: number;
  manualTaps: number;
  absorbs: number;
  stars: number;
  rewards: Record<string, number>;
  codexFound: number;
  rarityCounts: number[];
  /** Expected energy per second, sampled every 10 s: hand tapping at this profile's pace, and probes. */
  manualSeries: number[];
  autoSeries: number[];
  /** Hand income at a steady 4.5 taps per second divided by probe income, sampled every 10 s once probes work. */
  tapToAutoSeries: number[];
}

/** Deterministic 0..1 from the seed and a counter, so a missed star does not use the game's RNG. */
function roll01(seed: number, n: number): number {
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

/**
 * opts.mode: 'speedrun' (default, the timed run) or 'main'. opts.endlessSec: in a main run, keep playing
 * this long after the Galaxy (collecting hidden bodies) to see when the after-Galaxy levels get bought.
 */
export function simulate(
  content: Content,
  seed: number,
  policy: AdPolicy,
  profile: TapProfile,
  limitSec = 3 * 3600,
  dt = 0.1,
  opts: { mode?: RunMode; endlessSec?: number } = {},
): RunReport {
  const run = new Run(content, newRunState(content, opts.mode ?? 'speedrun', seed), { found: {} });
  const s = run.s;
  const endlessSec = opts.endlessSec ?? 0;
  let finishClock: number | null = null;
  const hiddenFound = new Set<string>();
  let clock = 0; // wall clock, includes ads
  let busyUntil = 0;
  let tapAcc = 0;
  let manualTaps = 0;
  let absorbs = 0;
  let stars = 0;
  let twins = 0;
  let lastAction = 0;
  let rollN = 0;
  /** Waves of shooting stars seen, and the last one the player reacted to. */
  let waveN = 0;
  let rolledWave = 0;
  const maxGap = { first10: 0, to30: 0, after30: 0 };
  const longGaps: [number, number][] = [];
  const rewards: Record<string, number> = { freeUpgrade: 0, luckyScan: 0, twin: 0 };
  const milestones: Milestone[] = [];
  const seen = new Set<string>();
  const rarityCounts = content.rarities.map(() => 0);
  const manualSeries: number[] = [];
  const autoSeries: number[] = [];
  const tapToAutoSeries: number[] = [];
  const auto = () => run.autoRate() > 0;

  const mark = (key: string, what: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    milestones.push({ t: clock, what });
  };
  const acted = () => {
    const gap = clock - lastAction;
    const bucket = lastAction < 600 ? 'first10' : lastAction < 1800 ? 'to30' : 'after30';
    maxGap[bucket] = Math.max(maxGap[bucket], gap);
    if (gap >= 20) longGaps.push([lastAction, gap]);
    lastAction = clock;
  };
  const noteBody = (r: number, t: number) => {
    rarityCounts[r] += 1;
    mark(`tier${t}`, `First ${content.tiers[t - 1].id} (tier ${t})`);
    if (r >= 2) mark(`rarity${r}`, `First ${content.rarities[r].id}`);
  };
  const bought = (id: string, viaAd = false) =>
    mark(`bought-${id}-${run.level(id)}`, `${viaAd ? 'Got' : 'Bought'} ${id} L${run.level(id)}${viaAd ? ' (ad)' : ''}`);

  const adReady = (id: RewardId) => {
    if (policy.id === 'none' || !run.rewardReady(id)) return false;
    // "delay": the button has been ready for a while before this player bothers.
    return s.time >= (s.rewardReadyAt[id] ?? 0) + policy.delay;
  };
  const watchAd = (id: RewardId) => {
    run.useReward(id, policy.id === 'basic');
    rewards[id] += 1;
    acted();
    // The ad pauses the game: the wall clock moves on, the run does not. Watching is not idle time.
    clock += policy.adSeconds;
    lastAction = clock;
    busyUntil = Math.max(busyUntil, clock) + ACTION_TIME.reward;
  };

  const afterMerge = (result: MergeResult) => {
    noteBody(result.body.r, result.body.t);
    if (result.twin) {
      twins += 1;
      noteBody(result.twin.body.r, result.twin.body.t);
    }
    // Rewarded copy of what was just merged, offered right after the merge.
    if (adReady('twin') && run.canDuplicate(result.slot, run.adCopyMaxTier)) {
      const copy = run.duplicate(result.slot, run.adCopyMaxTier);
      if (copy) {
        noteBody(copy.body.r, copy.body.t);
        watchAd('twin');
      }
    }
  };

  const useRewards = (): boolean => {
    if (adReady('freeUpgrade')) {
      const target = run.freeUpgradeTarget();
      if (target && !(profile.ignoresTapUpgradesWithAuto && auto() && HAND_UPGRADES.has(target))) {
        run.grant(target);
        bought(target, true);
        watchAd('freeUpgrade');
        return true;
      }
    }
    if (adReady('luckyScan')) {
      const result = run.luckyScan();
      if (result) {
        noteBody(result.body.r, result.body.t);
        watchAd('luckyScan');
        return true;
      }
    }
    return false;
  };

  const wants = (id: string) => !(profile.ignoresTapUpgradesWithAuto && auto() && HAND_UPGRADES.has(id));

  const decide = (): boolean => {
    if (useRewards()) return true;

    for (const u of content.upgrades) {
      const unlock = UNLOCKS.has(u.id) || (FIRST_LEVEL_UNLOCKS.has(u.id) && run.level(u.id) === 0);
      if (unlock && run.canBuy(u.id)) {
        run.buy(u.id);
        bought(u.id);
        busyUntil = clock + ACTION_TIME.buy;
        acted();
        return true;
      }
    }

    // After the Galaxy: keep the best Galaxy for its power, fuse any other with a partner into a
    // hidden body, then sell it (crystals). Fusing the only Galaxy would throw most of the income away.
    if (s.finishedAt !== null) {
      const goal = content.economy.goalTier;
      const galaxies = [];
      for (let i = 0; i < run.slots; i++) if (s.board[i] && !s.board[i]!.s && s.board[i]!.t === goal) galaxies.push(i);
      galaxies.sort((x, y) => s.board[x]!.r - s.board[y]!.r);
      for (const a of galaxies.length >= 2 ? galaxies.slice(0, -1) : []) {
        for (let b = 0; b < run.slots; b++) {
          if (!run.fusionOf(a, b)) continue;
          const made = run.fuse(a, b)!;
          hiddenFound.add(`${made.special.id}.${made.body.r}`);
          mark(`hidden-${hiddenFound.size}`, `Hidden body ${hiddenFound.size}`);
          run.removeBody(made.slot);
          busyUntil = clock + ACTION_TIME.merge;
          acted();
          return true;
        }
      }
    }

    const pair = run.findPair();
    if (pair) {
      afterMerge(run.merge(pair[0], pair[1])!);
      busyUntil = clock + ACTION_TIME.merge;
      acted();
      return true;
    }

    // The cheapest upgrade this player cares about is what they work toward.
    let goal: string | null = null;
    let goalCost = Infinity;
    for (const u of content.upgrades) {
      if (!run.isVisible(u) || run.isMaxed(u) || !wants(u.id)) continue;
      const cost = run.upgradeCost(u);
      if (cost < goalCost) {
        goal = u.id;
        goalCost = cost;
      }
    }
    if (goal && run.canBuy(goal)) {
      run.buy(goal);
      bought(goal);
      busyUntil = clock + ACTION_TIME.buy;
      acted();
      return true;
    }
    // Close enough to the goal: stop scanning and save for it.
    const income = run.manualIncome(profile.tps(clock, auto())) + run.autoIncome();
    const saving = goal !== null && goalCost - s.energy <= income * saveWindow(clock);
    if (!saving && run.canScan()) {
      const result = run.scan()!;
      noteBody(result.body.r, result.body.t);
      busyUntil = clock + ACTION_TIME.scan;
      acted();
      return true;
    }
    // Stuck: board full and nothing pairs. Feed the lowest body to the core.
    if (run.freeSlot() < 0) {
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

  while (clock < limitSec && (finishClock === null || clock < finishClock + endlessSec)) {
    for (const ev of run.update(dt)) {
      if (ev.kind === 'scan') noteBody(ev.result.body.r, ev.result.body.t);
      else if (ev.kind === 'merge') afterMerge(ev.result);
      else if (ev.kind === 'star') waveN += 1;
    }
    clock += dt;
    for (const u of content.upgrades) if (run.isVisible(u)) mark(`show-${u.id}`, `Shop shows ${u.id}`);

    // Each star of a wave is caught after a short reaction time, or missed (about 1 in 6).
    // (Before 13/10 the roll was retried every step, so almost every star was caught.)
    if (run.starUp && s.starTimer > -content.economy.stars.lifetime + 1.5 && rolledWave !== waveN) {
      rolledWave = waveN;
      const up = run.starWave.map((st, i) => (st.caught ? -1 : i)).filter((i) => i >= 0);
      for (const i of up) {
        if (roll01(seed, rollN++) <= 1 / 6) continue;
        run.catchStar(i);
        stars += 1;
        mark('star', 'First shooting star caught');
        acted();
      }
    }

    if (clock >= busyUntil && !decide()) {
      tapAcc += profile.tps(clock, auto()) * dt;
      while (tapAcc >= 1) {
        tapAcc -= 1;
        run.tap();
        manualTaps += 1;
      }
    }
    if (auto()) mark('auto', 'Automation: probes start working');
    if (finishClock === null && s.finishedAt !== null) finishClock = clock;

    if (Math.floor(clock / 10) > manualSeries.length - 1) {
      manualSeries.push(run.manualIncome(profile.tps(clock, auto())));
      autoSeries.push(run.autoIncome());
      if (auto()) tapToAutoSeries.push(run.manualIncome(4.5) / run.autoIncome());
    }
  }
  acted();

  return {
    seed,
    policy: policy.id,
    profile: profile.id,
    finished: s.finishedAt !== null,
    finishSec: finishClock ?? clock,
    milestones,
    maxGap,
    longGaps,
    scans: s.scans,
    merges: s.merges,
    twins,
    manualTaps,
    absorbs,
    stars,
    rewards,
    codexFound: Object.keys(run.codex.found).length,
    rarityCounts,
    manualSeries,
    autoSeries,
    tapToAutoSeries,
  };
}
