// Seeded random numbers and rarity rolls with pity (CLAUDE.md 4.4: public drop rates).
// Pure TypeScript with no Phaser import, so balance scripts in Node can use it too.
// Both games use it: celestial bodies in game #1, pets with rarity in game #2.

/**
 * Small seeded generator (mulberry32). Save `state` with the player's progress,
 * so reloading the page cannot re-roll a result the player did not like.
 */
export class Rng {
  state: number;

  constructor(seed = Date.now()) {
    this.state = seed >>> 0 || 1;
  }

  /** 0 <= x < 1 */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Whole number from min to max, both included. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability p (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
}

/** Index picked with probability proportional to its weight. Weights of 0 are never picked. */
export function pickWeighted(rng: Rng, weights: readonly number[]): number {
  const total = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
  if (total <= 0) return 0;
  let roll = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    roll -= Math.max(0, weights[i]);
    if (roll < 0) return i;
  }
  return weights.length - 1;
}

/** "Guarantee tier `minTier` or rarer within `within` rolls." Tiers are ordered from common (0) to rarest. */
export interface PityRule {
  minTier: number;
  within: number;
}

/** Rolls since the last hit, one counter per pity rule. Plain data, saved with progress. */
export type PityState = number[];

export interface RollOptions {
  /** Changes a tier's weight, for luck upgrades. Called with the tier index. */
  weightMult?: (tier: number) => number;
  /** The result is never below this tier. */
  floor?: number;
}

/** Chance of each tier for one roll, ignoring pity and floor. For the "1 in X" display. */
export function rarityOdds(baseWeights: readonly number[], options: RollOptions = {}): number[] {
  const weights = baseWeights.map((w, i) => w * (options.weightMult?.(i) ?? 1));
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (total > 0 ? w / total : 0));
}

/** Rolls left before a pity rule forces its tier. */
export function pityLeft(rules: readonly PityRule[], state: PityState, rule: number): number {
  return Math.max(1, rules[rule].within - (state[rule] ?? 0));
}

/**
 * One rarity roll. Updates `state` in place and returns the tier index.
 * When a pity rule is due, the roll is redone among tiers at or above its minimum,
 * so a pity Epic can still come out Legendary.
 */
export function rollRarity(
  rng: Rng,
  baseWeights: readonly number[],
  rules: readonly PityRule[],
  state: PityState,
  options: RollOptions = {},
): number {
  const weights = baseWeights.map((w, i) => w * (options.weightMult?.(i) ?? 1));
  let forced = 0;
  rules.forEach((rule, i) => {
    if ((state[i] ?? 0) + 1 >= rule.within) forced = Math.max(forced, rule.minTier);
  });
  let tier = pickWeighted(rng, forced > 0 ? weights.map((w, i) => (i >= forced ? w : 0)) : weights);
  if (options.floor !== undefined) tier = Math.max(tier, options.floor);
  rules.forEach((rule, i) => {
    state[i] = tier >= rule.minTier ? 0 : (state[i] ?? 0) + 1;
  });
  return tier;
}
