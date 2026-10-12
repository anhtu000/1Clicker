// The whole economy of one run, in plain TypeScript with no Phaser import.
// The game scene and the balance simulator (tools/sim) both drive this class,
// so simulated pacing matches the real game.
import { pityLeft, rarityOdds, Rng, rollRarity } from '../../core/rng.ts';
import type { Content, SpecialDef, StatId, UpgradeDef } from './content.ts';

/**
 * A celestial body on the board. t: tier from 1. r: rarity index (0 = common).
 * s: hidden body id (a Galaxy merged into tier t). Hidden bodies have rarities too, but never merge.
 */
export interface Body {
  t: number;
  r: number;
  s?: string;
}

export type RunMode = 'main' | 'speedrun';
export type RewardId = 'freeUpgrade' | 'luckyScan' | 'twin';

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
  /** The player switched Auto Scan off (to save up). Missing in older saves: on. */
  autoScanOff?: boolean;
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
  /** Binary Merge upgrade: an identical copy that appeared in another slot. */
  twin: NewBody | null;
  /** Energy the merge paid (already added to the run). */
  bonus: number;
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
  slots: 0,
  lensLevel: 0,
  scanCostMult: 1,
  luck: 1,
  autoScanEvery: 0,
  autoMergeEvery: 0,
  offlineCapHours: 0,
  twinChance: 0,
  starFreq: 1,
};

export function codexKey(body: Body): string {
  return body.s ? `s.${body.s}.${body.r}` : `${body.t}.${body.r}`;
}

/** Hidden bodies are stored in the collection under "s.<id>.<rarity>". */
export const isSpecialKey = (key: string) => key.startsWith('s.');

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
    rewardReadyAt: Object.fromEntries(
      (['freeUpgrade', 'luckyScan', 'twin'] as const).map((id) => [id, content.economy.rewarded[id].firstAt]),
    ),
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
    if (body.s) return 0; // hidden bodies are for the collection only
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
        if (isSpecialKey(key)) continue;
        const r = Number(key.split('.')[1]);
        bonus += this.content.rarities[r]?.codexBonus ?? 0;
      }
      this.codexCache = bonus;
    }
    return this.codexCache;
  }

  /** Energy from the board for one tap, before tap upgrades. Probes collect this much per probe tap. */
  baseTapValue(): number {
    return this.content.economy.tap.base * this.power() * this.codexMult();
  }

  /** Energy for one tap by hand. Tap upgrades (tapMult) and crits only help hand taps. */
  tapValue(): number {
    return this.baseTapValue() * this.stat('tapMult');
  }

  /** Average multiplier from critical taps. */
  critAverage(): number {
    return 1 + Math.min(1, this.stat('critChance')) * (this.content.economy.tap.critMult - 1);
  }

  /** Probe taps per second, each worth baseTapValue. Probe Fleet sets it; 0 until its first level. */
  autoRate(): number {
    return this.stat('autoTps');
  }

  /** Probe income per second. */
  autoIncome(): number {
    return this.autoRate() * this.baseTapValue();
  }

  /** Energy per second from steady tapping at `tps` taps per second, crits included. */
  manualIncome(tps: number): number {
    return tps * this.tapValue() * this.critAverage();
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

  /**
   * Price of the next scan. Total paid for the first n scans is baseCost * n^exponent (s.units counts them),
   * so each scan costs a little more than the last. Bigger bodies from the Gravity Lens cost nothing extra.
   */
  scanCost(): number {
    const u = this.s.units;
    const raw = this.unitsTotalCost(u + 1) - this.unitsTotalCost(u);
    return Math.ceil(raw * this.stat('scanCostMult'));
  }

  /**
   * Price of the first `u` units together: baseCost * u^exponent, then past softCapUnits the price
   * per unit keeps rising, but only as (u / cap)^softCapExponent.
   */
  private unitsTotalCost(u: number): number {
    const { baseCost: b, exponent: k, softCapUnits: cap, softCapExponent: m = 1 } = this.content.economy.scan;
    if (!cap || u <= cap) return b * u ** k;
    // Price per unit at the cap, then integrate (u / cap)^m from the cap to u.
    const perUnitAtCap = b * k * cap ** (k - 1);
    return b * cap ** k + perUnitAtCap * (cap / (m + 1)) * ((u / cap) ** (m + 1) - 1);
  }

  freeSlot(): number {
    for (let i = 0; i < this.slots; i++) if (!this.s.board[i]) return i;
    return -1;
  }

  canScan(): boolean {
    return this.freeSlot() >= 0 && this.s.energy >= this.scanCost();
  }

  /** Chance of tier 1, 2, 3, 4 for one scan at the current Gravity Lens level. */
  scanTierOdds(): number[] {
    const rows = this.content.economy.scan.tierOdds;
    return rows[Math.min(rows.length - 1, Math.max(0, Math.floor(this.stat('lensLevel'))))];
  }

  /** Tier of the body one scan finds. */
  private rollScanTier(): number {
    const odds = this.scanTierOdds();
    let roll = this.rng.next();
    for (let i = 0; i < odds.length; i++) {
      roll -= odds[i];
      if (roll < 0) return i + 1;
    }
    return odds.length;
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
    if (!body.s && body.t > this.s.highestTier) this.s.highestTier = body.t;
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
    this.s.units += 1;
    const t = this.rollScanTier();
    const floor = this.s.scans === this.content.economy.script.rareScan ? 1 : 0;
    return this.place(this.freeSlot(), { t, r: this.rollRarity(floor) });
  }

  canMerge(a: number, b: number): boolean {
    const x = this.s.board[a];
    const y = this.s.board[b];
    return a !== b && !!x && !!y && !x.s && !y.s && x.t === y.t && x.t < this.content.economy.goalTier;
  }

  /** The hidden body a and b would make: a Galaxy and a body of a special's tier, either way round. */
  fusionOf(a: number, b: number): SpecialDef | null {
    const x = this.s.board[a];
    const y = this.s.board[b];
    if (a === b || !x || !y || x.s || y.s) return null;
    const goal = this.content.economy.goalTier;
    const other = x.t === goal ? y : y.t === goal ? x : null;
    if (!other || other.t === goal) return null;
    return this.content.specials.find((sp) => sp.tier === other.t) ?? null;
  }

  /**
   * Galaxy + partner: both leave the board, the hidden body takes b's slot. Not done by Auto Merge.
   * Rarity works as in a merge: at least the average of the pair, rounded down, then rolled.
   */
  fuse(a: number, b: number): (NewBody & { special: SpecialDef }) | null {
    const special = this.fusionOf(a, b);
    if (!special) return null;
    const x = this.s.board[a]!;
    const y = this.s.board[b]!;
    this.s.board[a] = null;
    const r = this.rollRarity(Math.floor((x.r + y.r) / 2));
    this.syncRng();
    return { ...this.place(b, { t: special.tier, r, s: special.id }), special };
  }

  /** Crystals a hidden body sells for: its base price times its rarity's power multiplier. */
  sellValue(body: Body): number {
    const special = body.s ? this.content.specials.find((sp) => sp.id === body.s) : null;
    return special ? Math.round(special.sell * this.content.rarities[body.r].mult) : 0;
  }

  /** Takes a body off the board (sold). Returns it, or null for an empty slot. */
  removeBody(slot: number): Body | null {
    const body = this.s.board[slot];
    if (!body) return null;
    this.s.board[slot] = null;
    this.powerCache = null;
    return body;
  }

  /** Energy a merge of this pair gives: a share of the current scan price (CLAUDE.md 4b). */
  mergeBonus(tier: number, rarerRarity: number): number {
    const row = this.content.economy.mergeBonus.scanShare[tier - 1];
    const share = row?.[Math.min(rarerRarity, row.length - 1)] ?? 0;
    return share > 0 ? Math.round(share * this.scanCost()) : 0;
  }

  /**
   * Merges body a into body b. The result is one tier higher, in b's slot.
   * Its rarity is rolled, and is never below the average rarity of the pair rounded down,
   * so merging two Epics always keeps at least Epic, and Epic + Common keeps at least Rare.
   * Every merge also pays a bonus that grows with tier and with the rarer body's rarity.
   */
  merge(a: number, b: number): MergeResult | null {
    if (!this.canMerge(a, b)) return null;
    const x = this.s.board[a]!;
    const y = this.s.board[b]!;
    const bonus = this.mergeBonus(x.t, Math.max(x.r, y.r));
    this.s.board[a] = null;
    this.s.merges += 1;
    if (bonus > 0) this.gain(bonus);
    let floor = Math.floor((x.r + y.r) / 2);
    if (this.s.merges === this.content.economy.script.rareMerge) floor = Math.max(floor, 1);
    const result = this.place(b, { t: x.t + 1, r: this.rollRarity(floor) });
    const finished = result.body.t === this.content.economy.goalTier && this.s.finishedAt === null;
    if (finished) this.s.finishedAt = this.s.time;
    let twin: NewBody | null = null;
    if (this.canDuplicate(b) && this.rng.chance(this.stat('twinChance'))) twin = this.duplicate(b);
    this.syncRng();
    return { ...result, from: a, finished, twin, bonus };
  }

  /** Adds energy from outside the run (offline earnings, daily gift). */
  addEnergy(amount: number) {
    if (amount > 0) this.gain(amount);
  }

  /** Swaps two bodies that cannot merge, so the player can tidy the board. */
  swap(a: number, b: number): boolean {
    if (a === b || a >= this.slots || b >= this.slots || !this.s.board[a] || !this.s.board[b]) return false;
    [this.s.board[a], this.s.board[b]] = [this.s.board[b], this.s.board[a]];
    return true;
  }

  /** Moves a body to an empty slot. */
  move(a: number, b: number): boolean {
    if (a === b || !this.s.board[a] || this.s.board[b] || b >= this.slots) return false;
    this.s.board[b] = this.s.board[a];
    this.s.board[a] = null;
    return true;
  }

  /** A copy of this body can be made: low enough tier, and a free slot. */
  canDuplicate(slot: number): boolean {
    const body = this.s.board[slot];
    return !!body && !body.s && body.t <= this.content.economy.twinMaxTier && this.freeSlot() >= 0;
  }

  /** Puts an identical copy of the body in the first free slot (Binary Merge, or the rewarded twin). */
  duplicate(slot: number): NewBody | null {
    if (!this.canDuplicate(slot)) return null;
    const body = this.s.board[slot]!;
    return this.place(this.freeSlot(), { t: body.t, r: body.r });
  }

  /** Energy the core gives for absorbing this body. */
  absorbValue(slot: number): number {
    const body = this.s.board[slot];
    // Hidden bodies are sold for crystals instead; the core does not take them.
    return body && !body.s ? this.content.economy.absorbTaps * this.tapValue() : 0;
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
      if (!x || x.s || x.t >= this.content.economy.goalTier) continue;
      for (let j = i + 1; j < this.slots; j++) {
        const y = board[j];
        if (!y || y.s || y.t !== x.t) continue;
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

  /** The body the core would miss least: lowest tier, then lowest rarity. Hidden bodies are never picked. -1 if none. */
  weakestSlot(): number {
    let best = -1;
    for (let i = 0; i < this.slots; i++) {
      const b = this.s.board[i];
      if (!b || b.s) continue;
      const w = this.s.board[best] ?? null;
      if (!w || b.t < w.t || (b.t === w.t && b.r < w.r)) best = i;
    }
    return best;
  }

  /**
   * Board full with nothing to merge and no slot upgrade to buy right now (CLAUDE.md 4b).
   * Never a dead end: any body can go to the core, and hidden bodies sell for crystals.
   */
  isStuck(): boolean {
    return this.freeSlot() < 0 && !this.findPair() && !this.canBuy('slots');
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

  /** Highest level that can be bought now: some lines open their last levels only after the Galaxy. */
  levelCap(u: UpgradeDef): number {
    return u.capBeforeGoal && this.s.highestTier < this.content.economy.goalTier ? u.capBeforeGoal : u.max;
  }

  isMaxed(u: UpgradeDef): boolean {
    return this.level(u.id) >= this.levelCap(u);
  }

  /** At its cap for now, with more levels waiting behind the Galaxy. */
  waitsForGoal(u: UpgradeDef): boolean {
    return this.isMaxed(u) && this.levelCap(u) < u.max;
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
    return this.manualIncome(this.content.economy.stars.activeTps) + this.autoIncome();
  }

  /**
   * The upgrade that shows a "free with ad" button: the priciest one the player cannot afford yet,
   * within a few minutes of income. A free upgrade should be worth clearly more than the ad's 30 seconds.
   */
  freeUpgradeTarget(): string | null {
    const cap = this.activeIncome() * this.content.economy.rewarded.freeUpgrade.maxIncomeSeconds;
    let best: UpgradeDef | null = null;
    for (const u of this.content.upgrades) {
      if ((u.noAdFirst && this.level(u.id) === 0) || !this.isVisible(u) || this.isMaxed(u)) continue;
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
    // One tier above what a paid scan would find right now.
    const t = Math.min(this.content.economy.goalTier - 1, this.rollScanTier() + cfg.tierBonus);
    return this.place(slot, { t, r: this.rollRarity(cfg.rarityFloor) });
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

    // Auto Scan can be switched off, so the player can save up for an upgrade (CLAUDE.md 4b).
    const scanEvery = this.s.autoScanOff ? 0 : this.stat('autoScanEvery');
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
    const base = st.seconds * this.activeIncome();
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
    const range = st.early && this.s.time < st.early.untilSec ? st.early : st;
    // Star Magnet: stars come more often (starFreq 1.08 = 8% more stars), so the wait is divided by it.
    this.s.starTimer = (range.everyMin + this.rng.next() * (range.everyMax - range.everyMin)) / this.stat('starFreq');
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
