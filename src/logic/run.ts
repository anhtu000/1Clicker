// The whole economy of one run, in plain TypeScript with no Phaser import.
// The game scene and the balance simulator (tools/sim) both drive this class,
// so simulated pacing matches the real game.
import { pityLeft, rarityOdds, Rng, rollRarity } from '../../core/rng.ts';
import type { Content, StatId, UpgradeDef } from './content.ts';

/** A celestial body on the board. t: tier from 1. r: rarity index (0 = common). */
export interface Body {
  t: number;
  r: number;
}

export type RunMode = 'main' | 'speedrun';
export type RewardId = 'freeUpgrade' | 'luckyScan' | 'mergeAll';

/** Everything about a run, as plain data so it can be saved as JSON. */
export interface RunState {
  mode: RunMode;
  energy: number;
  board: (Body | null)[];
  levels: Record<string, number>;
  scans: number;
  /** Stardust-equivalent units bought by paid scans. The scan price follows this. */
  units: number;
  merges: number;
  taps: number;
  highestTier: number;
  pity: number[];
  rng: number;
  /** Seconds of play in this run. Does not count time away. */
  time: number;
  /** Run time when the goal tier was made. null until then. */
  finishedAt: number | null;
  autoScanAcc: number;
  autoMergeAcc: number;
  /** Seconds until the next shooting star. While a star is up: negative, counting the seconds it has left. */
  starTimer: number;
  /** The star on screen is golden. */
  starGolden: boolean;
  /** Run time when each rewarded button can be used again. */
  rewardReadyAt: Record<string, number>;
  totalEarned: number;
}

/** Bodies discovered so far, shared by every run. Key: "tier.rarity". */
export interface Codex {
  found: Record<string, number>;
}

export interface NewBody {
  slot: number;
  body: Body;
  /** First time this tier and rarity was seen: show the discovery card. */
  isNew: boolean;
}

export interface MergeResult extends NewBody {
  from: number;
  /** This merge made the goal tier. */
  finished: boolean;
}

export type RunEvent =
  | { kind: 'scan'; result: NewBody }
  | { kind: 'merge'; result: MergeResult }
  | { kind: 'star'; golden: boolean }
  | { kind: 'starGone' };

const BASE_STATS: Record<StatId, number> = {
  tapMult: 1,
  critChance: 0,
  autoTps: 0,
  autoMult: 1,
  slots: 0,
  spawnTier: 1,
  tierUpChance: 0,
  scanCostMult: 1,
  luck: 1,
  autoScanEvery: 0,
  autoMergeEvery: 0,
  offlineCapHours: 0,
};

export function codexKey(body: Body): string {
  return `${body.t}.${body.r}`;
}

export function newRunState(content: Content, mode: RunMode, seed = Date.now()): RunState {
  return {
    mode,
    energy: 0,
    board: new Array(content.economy.board.maxSlots).fill(null),
    levels: {},
    scans: 0,
    units: 0,
    merges: 0,
    taps: 0,
    highestTier: 0,
    pity: content.pity.map(() => 0),
    rng: seed >>> 0 || 1,
    time: 0,
    finishedAt: null,
    autoScanAcc: 0,
    autoMergeAcc: 0,
    starTimer: content.economy.stars.everyMin,
    starGolden: false,
    rewardReadyAt: {},
    totalEarned: 0,
  };
}

export class Run {
  readonly content: Content;
  readonly s: RunState;
  readonly codex: Codex;
  private rng: Rng;
  private statCache: Record<StatId, number> | null = null;
  private powerCache: number | null = null;
  private codexCache: number | null = null;

  constructor(content: Content, state: RunState, codex: Codex) {
    this.content = content;
    this.s = state;
    this.codex = codex;
    this.rng = new Rng(state.rng);
  }

  // ---------- stats ----------

  stat(id: StatId): number {
    if (!this.statCache) {
      const stats = { ...BASE_STATS, slots: this.content.economy.board.startSlots, offlineCapHours: this.content.economy.offline.capHours };
      for (const u of this.content.upgrades) {
        const level = this.level(u.id);
        if (level <= 0) continue;
        if (u.op === 'add') stats[u.stat] += (u.value ?? 0) * level;
        else if (u.op === 'mul') stats[u.stat] *= (u.value ?? 1) ** level;
        else stats[u.stat] = u.values![level - 1];
      }
      this.statCache = stats;
    }
    return this.statCache[id];
  }

  get slots(): number {
    return Math.min(this.content.economy.board.maxSlots, this.stat('slots'));
  }

  bodyValue(body: Body): number {
    return this.content.economy.tierValueGrowth ** (body.t - 1) * this.content.rarities[body.r].mult;
  }

  /** Sum of the board. Energy per tap scales with it. */
  power(): number {
    if (this.powerCache === null) {
      let sum = 1;
      for (const b of this.s.board) if (b) sum += this.bodyValue(b);
      this.powerCache = sum;
    }
    return this.powerCache;
  }

  /** Permanent bonus from discoveries. Not used in speedrun, so records stay comparable. */
  codexMult(): number {
    if (this.s.mode === 'speedrun') return 1;
    if (this.codexCache === null) {
      let bonus = 1;
      for (const key of Object.keys(this.codex.found)) {
        const r = Number(key.split('.')[1]);
        bonus += this.content.rarities[r]?.codexBonus ?? 0;
      }
      this.codexCache = bonus;
    }
    return this.codexCache;
  }

  tapValue(): number {
    return this.content.economy.tap.base * this.power() * this.stat('tapMult') * this.codexMult();
  }

  /** Average multiplier from critical taps. */
  critAverage(): number {
    return 1 + Math.min(1, this.stat('critChance')) * (this.content.economy.tap.critMult - 1);
  }

  /** Taps per second done by probes. */
  autoRate(): number {
    return this.stat('autoTps') * this.stat('autoMult');
  }

  /** Probe income. Probes never crit: critical hits are the reward for tapping by hand. */
  autoIncome(): number {
    return this.autoRate() * this.tapValue();
  }

  // ---------- actions ----------

  private gain(amount: number) {
    this.s.energy += amount;
    this.s.totalEarned += amount;
  }

  tap(): { amount: number; crit: boolean } {
    const crit = this.rng.chance(this.stat('critChance'));
    const amount = this.tapValue() * (crit ? this.content.economy.tap.critMult : 1);
    this.gain(amount);
    this.s.taps += 1;
    this.syncRng();
    return { amount, crit };
  }

  /** Stardust-equivalent units in one paid scan: a tier-2 body is 2 units, tier 3 is 4. */
  unitsPerScan(): number {
    return 2 ** (this.stat('spawnTier') - 1);
  }

  /**
   * Price of the next scan. Total paid for U units is baseCost * U^exponent,
   * so the price per unit rises smoothly whatever tier the scanner finds,
   * and each deeper scanner tier gets a discount.
   */
  scanCost(): number {
    const sc = this.content.economy.scan;
    const u = this.s.units;
    const add = this.unitsPerScan();
    const raw = sc.baseCost * ((u + add) ** sc.exponent - u ** sc.exponent);
    return Math.ceil(raw * sc.spawnDiscount ** (this.stat('spawnTier') - 1) * this.stat('scanCostMult'));
  }

  freeSlot(): number {
    for (let i = 0; i < this.slots; i++) if (!this.s.board[i]) return i;
    return -1;
  }

  canScan(): boolean {
    return this.freeSlot() >= 0 && this.s.energy >= this.scanCost();
  }

  /** Chance of each tier offset (0, +1, +2) for one scan, for the odds panel. */
  scanTierOdds(): number[] {
    const up = Math.min(1, this.stat('tierUpChance'));
    const share = this.content.economy.scan.doubleTierUpShare;
    return [1 - up, up * (1 - share), up * share];
  }

  /** Chance of each rarity for one roll at the current luck. */
  rarityOdds(): number[] {
    return rarityOdds(
      this.content.rarities.map((r) => r.weight),
      { weightMult: this.luckMult },
    );
  }

  /** Rolls left before pity rule `i` guarantees its rarity. */
  pityLeft(i: number): number {
    return pityLeft(this.content.pity, this.s.pity, i);
  }

  private luckMult = (tier: number) => (tier > 0 ? this.stat('luck') : 1);

  private rollRarity(floor: number): number {
    const r = rollRarity(
      this.rng,
      this.content.rarities.map((x) => x.weight),
      this.content.pity,
      this.s.pity,
      { weightMult: this.luckMult, floor },
    );
    this.syncRng();
    return r;
  }

  private place(slot: number, body: Body): NewBody {
    this.s.board[slot] = body;
    this.powerCache = null;
    if (body.t > this.s.highestTier) this.s.highestTier = body.t;
    const key = codexKey(body);
    const isNew = !(key in this.codex.found);
    if (isNew) {
      this.codex.found[key] = 1;
      this.codexCache = null;
    } else {
      this.codex.found[key] += 1;
    }
    return { slot, body, isNew };
  }

  /** Paid scan: spends energy, puts a new body in the first free slot. */
  scan(): NewBody | null {
    if (!this.canScan()) return null;
    this.s.energy -= this.scanCost();
    this.s.scans += 1;
    this.s.units += this.unitsPerScan();
    const odds = this.scanTierOdds();
    const roll = this.rng.next();
    const bonus = roll < odds[0] ? 0 : roll < odds[0] + odds[1] ? 1 : 2;
    const t = Math.min(this.content.economy.goalTier - 1, this.stat('spawnTier') + bonus);
    const floor = this.s.scans === this.content.economy.script.rareScan ? 1 : 0;
    return this.place(this.freeSlot(), { t, r: this.rollRarity(floor) });
  }

  canMerge(a: number, b: number): boolean {
    const x = this.s.board[a];
    const y = this.s.board[b];
    return a !== b && !!x && !!y && x.t === y.t && x.t < this.content.economy.goalTier;
  }

  /**
   * Merges body a into body b. The result is one tier higher, in b's slot.
   * Its rarity is rolled, and is never below the lower rarity of the pair,
   * so merging two Epics always keeps at least Epic.
   */
  merge(a: number, b: number): MergeResult | null {
    if (!this.canMerge(a, b)) return null;
    const x = this.s.board[a]!;
    const y = this.s.board[b]!;
    this.s.board[a] = null;
    this.s.merges += 1;
    let floor = Math.min(x.r, y.r);
    if (this.s.merges === this.content.economy.script.rareMerge) floor = Math.max(floor, 1);
    const result = this.place(b, { t: x.t + 1, r: this.rollRarity(floor) });
    const finished = result.body.t === this.content.economy.goalTier && this.s.finishedAt === null;
    if (finished) this.s.finishedAt = this.s.time;
    return { ...result, from: a, finished };
  }

  /** Moves a body to an empty slot. */
  move(a: number, b: number): boolean {
    if (a === b || !this.s.board[a] || this.s.board[b] || b >= this.slots) return false;
    this.s.board[b] = this.s.board[a];
    this.s.board[a] = null;
    return true;
  }

  /** Energy the core gives for absorbing this body. */
  absorbValue(slot: number): number {
    return this.s.board[slot] ? this.content.economy.absorbTaps * this.tapValue() : 0;
  }

  /** Feeds a body to the core for energy. Frees a slot when the board is stuck. */
  absorb(slot: number): number {
    const value = this.absorbValue(slot);
    if (!value) return 0;
    this.gain(value);
    this.s.board[slot] = null;
    this.powerCache = null;
    return value;
  }

  /** Lowest-tier pair that can merge, preferring two bodies of the same rarity. */
  findPair(): [number, number] | null {
    let best: [number, number] | null = null;
    let bestScore = Infinity;
    const board = this.s.board;
    for (let i = 0; i < this.slots; i++) {
      const x = board[i];
      if (!x || x.t >= this.content.economy.goalTier) continue;
      for (let j = i + 1; j < this.slots; j++) {
        const y = board[j];
        if (!y || y.t !== x.t) continue;
        const score = x.t * 100 + Math.abs(x.r - y.r) * 10 - Math.min(x.r, y.r);
        if (score < bestScore) {
          bestScore = score;
          // keep the rarer body's slot, so it stays where the player put it
          best = x.r > y.r ? [j, i] : [i, j];
        }
      }
    }
    return best;
  }

  // ---------- upgrades ----------

  level(id: string): number {
    return this.s.levels[id] ?? 0;
  }

  upgrade(id: string): UpgradeDef {
    const u = this.content.upgrades.find((x) => x.id === id);
    if (!u) throw new Error(`Unknown upgrade ${id}`);
    return u;
  }

  isVisible(u: UpgradeDef): boolean {
    const rule = u.show;
    if (rule.tier && this.s.highestTier < rule.tier) return false;
    if (rule.upgrade && this.level(rule.upgrade) < (rule.level ?? 1)) return false;
    return true;
  }

  isMaxed(u: UpgradeDef): boolean {
    return this.level(u.id) >= u.max;
  }

  upgradeCost(u: UpgradeDef): number {
    const level = this.level(u.id);
    return u.costs ? u.costs[level] : Math.ceil(u.cost! * u.growth! ** level);
  }

  canBuy(id: string): boolean {
    const u = this.upgrade(id);
    return this.isVisible(u) && !this.isMaxed(u) && this.s.energy >= this.upgradeCost(u);
  }

  buy(id: string): boolean {
    if (!this.canBuy(id)) return false;
    this.s.energy -= this.upgradeCost(this.upgrade(id));
    this.grant(id);
    return true;
  }

  /** Gives one level for free (rewarded ad). */
  grant(id: string) {
    const u = this.upgrade(id);
    if (this.isMaxed(u)) return;
    this.s.levels[id] = this.level(id) + 1;
    this.statCache = null;
  }

  // ---------- rewarded ads ----------

  rewardReady(id: RewardId): boolean {
    return this.s.time >= (this.s.rewardReadyAt[id] ?? 0);
  }

  /** Seconds until a rewarded button is back. */
  rewardWait(id: RewardId): number {
    return Math.max(0, (this.s.rewardReadyAt[id] ?? 0) - this.s.time);
  }

  /**
   * Starts the cooldown. Call after the reward is given.
   * free: the reward came without an ad (portal ads off), so the button recharges slower,
   * at about the pace of a player who watches ads.
   */
  useReward(id: RewardId, free = false) {
    const cfg = this.content.economy.rewarded;
    this.s.rewardReadyAt[id] = this.s.time + cfg[id].cooldown * (free ? cfg.freeCooldownMult : 1);
  }

  /** Income of a player tapping at a steady pace, plus probes. Used to size rewards. */
  activeIncome(): number {
    return this.content.economy.stars.activeTps * this.tapValue() * this.critAverage() + this.autoIncome();
  }

  /**
   * The upgrade that shows a "free with ad" button: the priciest one the player cannot afford yet,
   * within a few minutes of income. A free upgrade should be worth clearly more than the ad's 30 seconds.
   */
  freeUpgradeTarget(): string | null {
    const cap = this.activeIncome() * this.content.economy.rewarded.freeUpgrade.maxIncomeSeconds;
    let best: UpgradeDef | null = null;
    for (const u of this.content.upgrades) {
      if (u.noAd || !this.isVisible(u) || this.isMaxed(u)) continue;
      const cost = this.upgradeCost(u);
      if (cost <= this.s.energy || cost > cap) continue;
      if (!best || cost > this.upgradeCost(best)) best = u;
    }
    return best?.id ?? null;
  }

  /** Rewarded scan: free, higher tier, at least Rare. Does not raise the scan price. */
  luckyScan(): NewBody | null {
    const slot = this.freeSlot();
    if (slot < 0) return null;
    const cfg = this.content.economy.rewarded.luckyScan;
    const t = Math.min(this.content.economy.goalTier - 1, this.stat('spawnTier') + cfg.tierBonus);
    return this.place(slot, { t, r: this.rollRarity(cfg.rarityFloor) });
  }

  /** Rewarded: merges every pair on the board. */
  mergeAll(): MergeResult[] {
    const out: MergeResult[] = [];
    for (let pair = this.findPair(); pair; pair = this.findPair()) {
      const result = this.merge(pair[0], pair[1]);
      if (!result) break;
      out.push(result);
    }
    return out;
  }

  // ---------- time ----------

  /** Advances the run by dt seconds: probe income, auto scan, auto merge. */
  update(dt: number): RunEvent[] {
    const events: RunEvent[] = [];
    this.s.time += dt;
    const income = this.autoIncome();
    if (income > 0) this.gain(income * dt);

    const stars = this.content.economy.stars;
    if (this.s.starTimer > 0) {
      this.s.starTimer -= dt;
      if (this.s.starTimer <= 0) {
        this.s.starGolden = this.rng.chance(stars.goldenChance);
        this.syncRng();
        this.s.starTimer = -stars.lifetime;
        events.push({ kind: 'star', golden: this.s.starGolden });
      }
    } else {
      this.s.starTimer += dt;
      if (this.s.starTimer >= 0) {
        this.nextStar();
        events.push({ kind: 'starGone' });
      }
    }

    const scanEvery = this.stat('autoScanEvery');
    if (scanEvery > 0) {
      this.s.autoScanAcc += dt;
      while (this.s.autoScanAcc >= scanEvery) {
        this.s.autoScanAcc -= scanEvery;
        const result = this.scan();
        if (result) events.push({ kind: 'scan', result });
      }
    }
    const mergeEvery = this.stat('autoMergeEvery');
    if (mergeEvery > 0) {
      this.s.autoMergeAcc += dt;
      while (this.s.autoMergeAcc >= mergeEvery) {
        this.s.autoMergeAcc -= mergeEvery;
        const pair = this.findPair();
        const result = pair && this.merge(pair[0], pair[1]);
        if (result) events.push({ kind: 'merge', result });
      }
    }
    return events;
  }

  /** A shooting star is on screen. */
  get starUp(): boolean {
    return this.s.starTimer < 0;
  }

  /** Energy a caught star gives right now. */
  starValue(): number {
    const st = this.content.economy.stars;
    const base = st.seconds * (st.activeTps * this.tapValue() + this.autoIncome());
    return base * (this.s.starGolden ? st.goldenMult : 1);
  }

  /** Player tapped the star. Returns the energy given, 0 if no star was up. */
  catchStar(): number {
    if (!this.starUp) return 0;
    const value = this.starValue();
    this.gain(value);
    this.nextStar();
    return value;
  }

  private nextStar() {
    const st = this.content.economy.stars;
    this.s.starTimer = st.everyMin + this.rng.next() * (st.everyMax - st.everyMin);
    this.s.starGolden = false;
    this.syncRng();
  }

  /** Energy earned while away, from probes only (main mode). */
  offlineEarnings(seconds: number): number {
    if (this.s.mode !== 'main' || seconds < this.content.economy.offline.minSeconds) return 0;
    const capped = Math.min(seconds, this.stat('offlineCapHours') * 3600);
    return this.autoIncome() * this.content.economy.offline.efficiency * capped;
  }

  private syncRng() {
    this.s.rng = this.rng.state;
  }
}
