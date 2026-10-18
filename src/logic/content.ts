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
  color: string;
}

export type StatId =
  | 'tapMult'
  | 'critChance'
  | 'autoTps'
  | 'slots'
  | 'lensLevel'
  | 'scanCostMult'
  | 'luck'
  | 'autoScanEvery'
  | 'autoMergeEvery'
  | 'offlineCapHours'
  | 'twinChance'
  | 'starFreq';

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
  /** Its first level is never offered free for an ad (keeps a milestone, the first automation, on schedule). */
  noAdFirst?: boolean;
  /** Highest level until the goal tier (the Galaxy) has been made in this run; the rest opens after it. */
  capBeforeGoal?: number;
}

export interface EconomyDef {
  goalTier: number;
  tierValueGrowth: number;
  /**
   * Scales what every body on the board adds to a tap. 13/10 (user): first 0.5 with growth 3; then the
   * tiers closer together (growth 2.5, scale 1.493: Gas Giant unchanged, lower tiers worth more, higher less).
   */
  bodyValueScale?: number;
  board: { maxSlots: number; startSlots: number };
  tap: { base: number; critMult: number };
  scan: {
    baseCost: number;
    exponent: number;
    /**
     * Gravity Lens (CLAUDE.md 4b): row L is the chance of tier 1, 2, 3, 4... for one scan at lens level L.
     * Scans never find more than the row length allows.
     */
    tierOdds: number[][];
    /** Past this many units the price per unit grows slowly (softCapExponent), so the last tiers are not a wall. */
    softCapUnits?: number;
    softCapExponent?: number;
    /**
     * Main run after the Galaxy: the price climbs this much slower (0.5 = each scan moves the price
     * half as far), so collecting hidden bodies stays affordable (user 13/10).
     */
    endlessGrowth?: number;
  };
  absorbTaps: number;
  /**
   * Energy for each merge, as a share of the current scan price.
   * scanShare[tier - 1][rarity]: tier of the pair, rarity of the rarer body (CLAUDE.md 4b).
   */
  mergeBonus: { scanShare: number[][] };
  /** Highest tier the Binary Merge upgrade can copy. The rewarded copy has its own, lower cap (rewarded.twin.maxTier). */
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
    /** Chance that a wave brings two stars at once (user 13/10). */
    doubleChance?: number;
    /** Star value multiplier in the main run after the Galaxy, while hunting the collection (user 13/10: 2). */
    valueMultEndless?: number;
  };
  script: { rareScan: number; rareMerge: number };
  /**
   * Rarity of a merge result (user 13/10): keepAverage is the chance it is exactly the pair's average
   * rarity rounded down, else a normal roll. Merges into rollFromTier and up always roll.
   */
  mergeRarity: { keepAverage: number; rollFromTier: number };
  /** Full-screen reveal from this rarity up (user 19/10: Legendary); rarer-than-Common finds below it get an in-place effect. */
  reveal: { fullFromRarity: number };
  offline: { efficiency: number; capHours: number; minSeconds: number };
  rewarded: {
    /**
     * firstAt: seconds into a run before the button first appears, so the opening minutes are about tapping.
     * The free upgrade is the priciest one costing at most maxIncomeSeconds of an active player's income.
     */
    freeUpgrade: { cooldown: number; firstAt: number; maxIncomeSeconds: number; firstAtTier?: number };
    /** freeCooldownMult: own multiplier without an ad (user 14/10: 1, so it stays 4 minutes in Basic Launch). */
    luckyScan: { cooldown: number; firstAt: number; tierBonus: number; rarityFloor: number; freeCooldownMult?: number };
    /** Rewarded copy of the body just merged, offered up to maxTier (user 13/10: Asteroid). */
    twin: { cooldown: number; firstAt: number; maxTier: number };
    /** Cooldown multiplier while the portal gives rewards without an ad (CrazyGames Basic Launch). */
    freeCooldownMult: number;
    offlineMult: number;
    dailyMult: number;
    /**
     * Board full with nothing to merge (CLAUDE.md 4b): the panel offers to feed the weakest body to the core
     * for free, or by ad for energyMult times its energy. It opens after the board has been stuck for afterSec.
     */
    clearSlot: { energyMult: number; afterSec: number };
  };
  /** Daily gift track, one entry per day (CLAUDE.md 4b): minutes of active income, crystals, or both. */
  daily: { energyMin?: number; crystals?: number }[];
}

/**
 * Hidden body (CLAUDE.md 4b item 8): a Galaxy merged into a body of `tier` makes it.
 * Only for the collection: it cannot merge, adds no power, and sells for `sell` crystals.
 */
export interface SpecialDef {
  id: string;
  tier: number;
  sell: number;
  /** On the board it gives the energy of the Galaxy that made it, times this (user 13/10: 1.1). */
  power: number;
}

export interface Content {
  tiers: TierDef[];
  rarities: RarityDef[];
  pity: PityRule[];
  specials: SpecialDef[];
  economy: EconomyDef;
  upgrades: UpgradeDef[];
}

const STATS: StatId[] = [
  'tapMult',
  'critChance',
  'autoTps',
  'slots',
  'lensLevel',
  'scanCostMult',
  'luck',
  'autoScanEvery',
  'autoMergeEvery',
  'offlineCapHours',
  'twinChance',
  'starFreq',
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
  const specials: SpecialDef[] = bodies?.specials ?? [];
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
  check.uniqueIds(specials, 'special');
  specials.forEach((sp) => {
    check.need(sp.tier >= 1 && sp.tier < tiers.length, `special ${sp.id}: tier must be below the goal tier`);
    check.positive(sp.sell, `special ${sp.id}: sell`);
    check.positive(sp.power, `special ${sp.id}: power`);
  });
  check.need(new Set(specials.map((sp) => sp.tier)).size === specials.length, 'specials: one per tier');
  check.positive(economy?.rewarded?.clearSlot?.energyMult, 'economy.rewarded.clearSlot.energyMult');
  const adCopyMax = economy?.rewarded?.twin?.maxTier;
  check.need(Number.isInteger(adCopyMax) && adCopyMax >= 1 && adCopyMax < tiers.length, 'economy.rewarded.twin.maxTier: a tier below the goal tier');
  const daily: unknown = economy?.daily;
  check.need(Array.isArray(daily) && daily.length >= 2, 'economy.daily needs at least 2 days');
  if (Array.isArray(daily)) {
    daily.forEach((d, i) => check.need((d?.energyMin ?? 0) > 0 || (d?.crystals ?? 0) > 0, `economy.daily day ${i + 1}: needs energyMin or crystals above 0`));
  }
  check.positive(economy?.scan?.baseCost, 'economy.scan.baseCost');
  check.positive(economy?.scan?.exponent, 'economy.scan.exponent');
  check.positive(economy?.stars?.everyMin, 'economy.stars.everyMin');
  const keep = economy?.mergeRarity?.keepAverage;
  check.need(typeof keep === 'number' && keep >= 0 && keep <= 1, 'economy.mergeRarity.keepAverage: 0 to 1');
  const rollFrom = economy?.mergeRarity?.rollFromTier;
  check.need(Number.isInteger(rollFrom) && rollFrom >= 2 && rollFrom <= tiers.length, 'economy.mergeRarity.rollFromTier: a tier from 2 to the goal');
  const fullFrom = economy?.reveal?.fullFromRarity;
  check.need(Number.isInteger(fullFrom) && fullFrom >= 1, 'economy.reveal.fullFromRarity: a rarity index from 1 (Rare)');
  const scale = economy?.bodyValueScale;
  check.need(scale === undefined || (typeof scale === 'number' && scale > 0), 'economy.bodyValueScale: a number above 0');
  const valueMult = economy?.stars?.valueMultEndless;
  check.need(valueMult === undefined || (typeof valueMult === 'number' && valueMult > 0), 'economy.stars.valueMultEndless: a number above 0');
  const double = economy?.stars?.doubleChance;
  check.need(double === undefined || (typeof double === 'number' && double >= 0 && double <= 1), 'economy.stars.doubleChance: 0 to 1');
  const growth = economy?.scan?.endlessGrowth;
  check.need(growth === undefined || (typeof growth === 'number' && growth > 0 && growth <= 1), 'economy.scan.endlessGrowth: above 0, at most 1');
  const tierOdds: unknown = economy?.scan?.tierOdds;
  check.need(Array.isArray(tierOdds) && tierOdds.length >= 1, 'economy.scan.tierOdds needs at least one row (lens level 0)');
  if (Array.isArray(tierOdds)) {
    tierOdds.forEach((row: unknown, i) =>
      check.need(
        Array.isArray(row) && row.length >= 1 && row.length < tiers.length && row.every((v) => typeof v === 'number' && v >= 0) && Math.abs(row.reduce((a: number, b: number) => a + b, 0) - 1) < 1e-6,
        `economy.scan.tierOdds row ${i}: numbers >= 0 that add up to 1, one per tier, below the goal tier`,
      ),
    );
  }
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
    if (u.capBeforeGoal !== undefined) check.need(u.capBeforeGoal >= 1 && u.capBeforeGoal < u.max, `upgrade ${u.id}: capBeforeGoal must be from 1 to max - 1`);
    if (u.stat === 'lensLevel' && Array.isArray(tierOdds)) {
      check.need(u.op === 'add' && u.value === 1 && u.max <= tierOdds.length - 1, `upgrade ${u.id}: lensLevel goes up 1 per level, at most ${tierOdds.length - 1} (rows of economy.scan.tierOdds)`);
    }
  }
  check.done();
  return { tiers, rarities, pity, specials, economy, upgrades };
}
