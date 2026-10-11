// Game content types and checks. The data itself lives in src/content/*.json (CLAUDE.md 4.6),
// so a theme or balance change is a JSON edit, not a code change.
import { contentChecker } from '../../core/content.ts';
import type { PityRule } from '../../core/rng.ts';

export interface TierDef {
  id: string;
}

export interface RarityDef {
  id: string;
  /** Relative weight of one roll. Odds shown to players come from these. */
  weight: number;
  /** Multiplies the body's power. */
  mult: number;
  /** Permanent energy bonus for discovering a body of this rarity (0.02 = +2%). */
  codexBonus: number;
  color: string;
}

export type StatId =
  | 'tapMult'
  | 'critChance'
  | 'autoTps'
  | 'autoMult'
  | 'slots'
  | 'spawnTier'
  | 'tierUpChance'
  | 'scanCostMult'
  | 'luck'
  | 'autoScanEvery'
  | 'autoMergeEvery'
  | 'offlineCapHours'
  | 'twinChance'
  | 'starRate';

export interface ShowRule {
  /** Highest tier reached in this run. */
  tier?: number;
  /** Another upgrade bought, at `level` or more (default 1). */
  upgrade?: string;
  level?: number;
}

export interface UpgradeDef {
  id: string;
  stat: StatId;
  /** add: base + value*level. mul: base * value^level. set: values[level-1]. */
  op: 'add' | 'mul' | 'set';
  value?: number;
  values?: number[];
  max: number;
  /** Price of the next level: cost * growth^level, or costs[level] when listed. */
  cost?: number;
  growth?: number;
  costs?: number[];
  show: ShowRule;
  /** Never offered as a free upgrade for an ad (keeps a milestone, such as the first automation, on schedule). */
  noAd?: boolean;
}

export interface EconomyDef {
  goalTier: number;
  tierValueGrowth: number;
  board: { maxSlots: number; startSlots: number };
  tap: { base: number; critMult: number };
  scan: {
    baseCost: number;
    exponent: number;
    spawnDiscount: number;
    doubleTierUpShare: number;
    /** Past this many units the price per unit grows slowly (softCapExponent), so the last tiers are not a wall. */
    softCapUnits?: number;
    softCapExponent?: number;
  };
  absorbTaps: number;
  /**
   * Energy for each merge, as a share of the current scan price.
   * scanShare[tier - 1][rarity]: tier of the pair, rarity of the rarer body (CLAUDE.md 4b).
   */
  mergeBonus: { scanShare: number[][] };
  /** Highest tier that can be copied (Binary Merge upgrade and the rewarded twin). */
  twinMaxTier: number;
  /** Shooting stars: tap one for a burst of energy. Fills the wait between purchases. */
  stars: {
    everyMin: number;
    everyMax: number;
    /** Seconds a star stays on screen. */
    lifetime: number;
    /** Reward = seconds * (activeTps * tapValue + probe income). */
    seconds: number;
    activeTps: number;
    goldenChance: number;
    goldenMult: number;
    /** Denser stars early on, so a reward is never far away in the first minutes. */
    early?: { untilSec: number; everyMin: number; everyMax: number };
  };
  script: { rareScan: number; rareMerge: number };
  offline: { efficiency: number; capHours: number; minSeconds: number };
  rewarded: {
    /**
     * firstAt: seconds into a run before the button first appears, so the opening minutes are about tapping.
     * The free upgrade is the priciest one costing at most maxIncomeSeconds of an active player's income.
     */
    freeUpgrade: { cooldown: number; firstAt: number; maxIncomeSeconds: number };
    luckyScan: { cooldown: number; firstAt: number; tierBonus: number; rarityFloor: number };
    /** Rewarded copy of the body just merged. */
    twin: { cooldown: number; firstAt: number };
    /** Cooldown multiplier while the portal gives rewards without an ad (CrazyGames Basic Launch). */
    freeCooldownMult: number;
    offlineMult: number;
    dailyMult: number;
  };
}

export interface Content {
  tiers: TierDef[];
  rarities: RarityDef[];
  pity: PityRule[];
  economy: EconomyDef;
  upgrades: UpgradeDef[];
}

const STATS: StatId[] = [
  'tapMult',
  'critChance',
  'autoTps',
  'autoMult',
  'slots',
  'spawnTier',
  'tierUpChance',
  'scanCostMult',
  'luck',
  'autoScanEvery',
  'autoMergeEvery',
  'offlineCapHours',
  'twinChance',
  'starRate',
];

/**
 * Checks the JSON files and returns them typed. Throws one error listing every problem,
 * so a typo in a content file fails at load time with a readable message.
 */
export function checkContent(bodies: any, economy: any, upgradesFile: any): Content {
  const check = contentChecker('src/content');
  const tiers: TierDef[] = bodies?.tiers ?? [];
  const rarities: RarityDef[] = bodies?.rarities ?? [];
  const pity: PityRule[] = bodies?.pity ?? [];
  const upgrades: UpgradeDef[] = upgradesFile?.upgrades ?? [];

  check.need(tiers.length >= 2, 'bodies.tiers needs at least 2 tiers');
  check.uniqueIds(tiers, 'tier');
  check.need(rarities.length >= 2, 'bodies.rarities needs at least 2 rarities');
  check.uniqueIds(rarities, 'rarity');
  rarities.forEach((r) => {
    check.positive(r.weight, `rarity ${r.id}: weight`);
    check.positive(r.mult, `rarity ${r.id}: mult`);
  });
  pity.forEach((p, i) => {
    check.need(p.minTier > 0 && p.minTier < rarities.length, `pity ${i + 1}: minTier out of range`);
    check.positive(p.within, `pity ${i + 1}: within`);
  });
  check.need(economy?.goalTier === tiers.length, 'economy.goalTier must equal the number of tiers');
  check.positive(economy?.scan?.baseCost, 'economy.scan.baseCost');
  check.positive(economy?.scan?.exponent, 'economy.scan.exponent');
  check.positive(economy?.stars?.everyMin, 'economy.stars.everyMin');
  const share: unknown = economy?.mergeBonus?.scanShare;
  check.need(Array.isArray(share) && share.length === tiers.length - 1, `economy.mergeBonus.scanShare needs ${tiers.length - 1} rows (one per tier that can merge)`);
  if (Array.isArray(share)) {
    share.forEach((row: unknown, i) =>
      check.need(
        Array.isArray(row) && row.length === rarities.length && row.every((v) => typeof v === 'number' && v >= 0),
        `economy.mergeBonus.scanShare row ${i + 1}: needs ${rarities.length} numbers >= 0`,
      ),
    );
  }

  check.uniqueIds(upgrades, 'upgrade');
  const ids = upgrades.map((u) => u.id);
  for (const u of upgrades) {
    check.need(STATS.includes(u.stat), `upgrade ${u.id}: unknown stat "${u.stat}"`);
    check.positive(u.max, `upgrade ${u.id}: max`);
    if (u.op === 'set') check.need(u.values?.length === u.max, `upgrade ${u.id}: values must have ${u.max} entries`);
    else check.need(typeof u.value === 'number', `upgrade ${u.id}: value missing`);
    if (u.costs) {
      check.need(u.costs.length === u.max, `upgrade ${u.id}: costs must have ${u.max} entries`);
      u.costs.forEach((c, i) => check.positive(c, `upgrade ${u.id}: costs[${i}]`));
    } else {
      check.positive(u.cost, `upgrade ${u.id}: cost`);
      check.positive(u.growth, `upgrade ${u.id}: growth`);
    }
    if (u.show?.upgrade) check.ref(u.show.upgrade, ids, `upgrade ${u.id}: show.upgrade`);
  }
  check.done();
  return { tiers, rarities, pity, economy, upgrades };
}
