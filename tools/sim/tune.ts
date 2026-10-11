// Balance tuner. Prices every upgrade level from a smooth target income curve and a schedule,
// then searches a few global knobs so the simulated no-ads player hits the tier and purchase targets.
// Writes the result to src/content/*.json.
// Run: node --experimental-strip-types tools/sim/tune.ts
//
// Price of a level planned for minute T:  scale * T^curve * SAVE(T)
//   (target income at minute T times the seconds of income one purchase should take).
// Searched: scale, curve, scan exponent; scan baseCost is solved so the goal lands on time.
import { readFileSync, writeFileSync } from 'node:fs';
import { AD_POLICIES, loadContent, PROFILES, simulate } from './player.ts';
import type { Content } from '../../src/logic/content.ts';

/** Minute each upgrade level should become affordable, for a player who never watches ads. */
export const SCHEDULE: Record<string, number[]> = {
  focus: [0.25, 0.6, 1, 1.6, 2.3, 3.2, 4.3, 5.8, 8, 11, 15, 20, 27, 36, 48],
  slots: [2.6, 20],
  discount: [2, 6, 14, 26, 42], // cheaper than other lines on purpose (user request 11/10)
  probes: [4.5],
  crit: [5.2, 9.5, 17, 30, 46],
  luck: [7, 15, 28, 43, 60],
  fleet: [5, 6.2, 7.5, 9.5, 12.5, 17, 23, 31, 41, 53],
  lens: [5.6, 12, 22, 35, 50],
  binary: [6.5, 14, 26, 40, 57],
  starMagnet: [8, 20, 38],
  deepScan: [9, 28, 52],
  relay: [11, 33, 62],
  autoScan: [18, 26, 36, 48, 64],
  autoMerge: [44, 54, 64, 74],
};

/** Minute the first body of each tier should appear. */
export const TIER_TARGETS: Record<number, number> = { 4: 1, 5: 2.5, 6: 6, 7: 12, 8: 22, 9: 40, 10: 75 };

/** Seconds of income one purchase should cost, by minute. Short early: a reward every 10-20 s. */
const saveSeconds = (minute: number) => (minute < 3 ? 6 : minute < 10 ? 10 : 25);

const SEEDS = [11, 12, 13, 14, 15];
const none = AD_POLICIES.find((p) => p.id === 'none')!;

function nice(n: number): number {
  if (n < 100) return Math.max(5, Math.round(n / 5) * 5);
  const p = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / p) * p;
}

const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

function price(content: Content, scale: number, curve: number) {
  for (const u of content.upgrades) {
    const minutes = SCHEDULE[u.id];
    if (!minutes) continue;
    u.costs = minutes.map((m) => nice(scale * m ** curve * saveSeconds(m)));
    for (let i = 1; i < u.costs.length; i++) u.costs[i] = Math.max(u.costs[i], nice(u.costs[i - 1] * 1.3));
    delete u.cost;
    delete u.growth;
  }
}

function measure(content: Content) {
  const runs = SEEDS.map((seed) => simulate(content, seed, none, PROFILES.normal, 3 * 3600, 0.25));
  const at = (what: string) => median(runs.map((r) => r.milestones.find((m) => m.what === what)?.t ?? 3 * 3600)) / 60;
  const tiers: Record<number, number> = {};
  for (const t of Object.keys(TIER_TARGETS).map(Number)) tiers[t] = at(`First ${content.tiers[t - 1].id} (tier ${t})`);
  const buys: Record<string, number[]> = {};
  let buyErr = 0;
  let n = 0;
  for (const [id, minutes] of Object.entries(SCHEDULE)) {
    buys[id] = minutes.map((m, i) => {
      const got = at(`Bought ${id} L${i + 1}`);
      if (id !== 'relay') {
        // relay only matters offline, so the simulated player is not judged on it
        buyErr += Math.log(Math.min(got, 180) / m) ** 2;
        n++;
      }
      return got;
    });
  }
  let tierErr = 0;
  for (const [t, target] of Object.entries(TIER_TARGETS)) tierErr += (Number(t) === 10 ? 4 : 1) * Math.log(tiers[Number(t)] / target) ** 2;
  // Longest wait for a reward in the first 10 minutes should stay under 20 s.
  const gap10 = median(runs.map((r) => r.maxGap.first10));
  tierErr += Math.max(0, Math.log(gap10 / 20)) * 2;
  return { tiers, buys, tierErr, buyErr: buyErr / n, gap10 };
}

/** Scales scan baseCost until the goal lands on its target. */
function solveBase(content: Content) {
  const scan = content.economy.scan;
  let lo = Math.log(0.001);
  let hi = Math.log(1e5);
  let m = measure(content);
  for (let step = 0; step < 9; step++) {
    const mid = (lo + hi) / 2;
    scan.baseCost = Math.exp(mid);
    m = measure(content);
    if (m.tiers[10] > TIER_TARGETS[10]) hi = mid;
    else lo = mid;
  }
  return m;
}

const showTiers = (tiers: Record<number, number>) =>
  Object.entries(tiers)
    .map(([t, v]) => `t${t} ${v.toFixed(1)}`)
    .join(' ');

if (import.meta.url === `file://${process.argv[1]}`) {
  const content = loadContent((p) => readFileSync(p, 'utf8'));
  const scan = content.economy.scan;

  // Stage 1: coarse search of the global knobs. Skipped with --refine (start from the files as they are).
  const refineOnly = process.argv.includes('--refine');
  let best = { err: Infinity, scale: 50, curve: 3.1, exp: scan.exponent, disc: scan.spawnDiscount, base: scan.baseCost };
  for (const disc of refineOnly ? [] : [1]) {
    for (const curve of [3.0, 3.4, 3.8]) {
      for (const scale of [25, 50]) {
        price(content, scale, curve);
        for (const exp of [0.7, 0.9, 1.1].map((x) => Number((curve + x).toFixed(2)))) {
          scan.exponent = exp;
          scan.spawnDiscount = disc;
          const m = solveBase(content);
          const err = m.tierErr + m.buyErr;
          if (err < best.err) best = { err, scale, curve, exp, disc, base: scan.baseCost };
          console.log(`disc ${disc} curve ${curve} scale ${scale} exp ${exp} base ${scan.baseCost.toPrecision(2)} | err ${err.toFixed(3)} (buy ${m.buyErr.toFixed(3)}) gap10 ${m.gap10.toFixed(1)} | ${showTiers(m.tiers)}`);
        }
      }
    }
  }
  if (!refineOnly) {
    console.log('\nSTAGE 1 BEST', JSON.stringify(best));
    price(content, best.scale, best.curve);
    scan.exponent = best.exp;
    scan.spawnDiscount = best.disc;
    scan.baseCost = best.base;
  }

  // Stage 2: move each upgrade level toward its planned minute, then re-solve the scan price.
  // Passes can overshoot (5 seeds are noisy), so the best pass is kept, not the last one.
  const snapshot = () => ({
    costs: content.upgrades.map((u) => (u.costs ? [...u.costs] : undefined)),
    exp: scan.exponent,
    base: scan.baseCost,
  });
  let bestPass = { err: Infinity, pass: 0, state: snapshot() };
  for (let pass = 1; pass <= Number(process.env.PASSES ?? 5); pass++) {
    const m = measure(content);
    for (const u of content.upgrades) {
      const plan = SCHEDULE[u.id];
      if (!plan || !u.costs) continue;
      u.costs = u.costs.map((cost, i) => {
        const ratio = plan[i] / Math.min(m.buys[u.id][i], 180);
        // Income grows about as minute^curve, so price scales by ratio^curve. Damped by half.
        return cost * ratio ** (best.curve * 0.5);
      });
      for (let i = 1; i < u.costs.length; i++) u.costs[i] = Math.max(u.costs[i], u.costs[i - 1] * 1.3);
    }
    // Re-fit the scan curve shape around the current exponent.
    let bestFit = { err: Infinity, exp: scan.exponent, base: scan.baseCost, m: measure(content) };
    const center = scan.exponent;
    for (const d of [-0.2, -0.1, 0, 0.1, 0.2]) {
      scan.exponent = Number((center + d).toFixed(2));
      const fit = solveBase(content);
      if (fit.tierErr < bestFit.err) bestFit = { err: fit.tierErr, exp: scan.exponent, base: scan.baseCost, m: fit };
    }
    scan.exponent = bestFit.exp;
    scan.baseCost = bestFit.base;
    const after = bestFit.m;
    console.log(`pass ${pass}: exp ${scan.exponent} base ${scan.baseCost.toPrecision(2)} buyErr ${after.buyErr.toFixed(3)} tierErr ${after.tierErr.toFixed(3)} gap10 ${after.gap10.toFixed(1)} | ${showTiers(after.tiers)}`);
    const err = after.tierErr + after.buyErr;
    if (err < bestPass.err) bestPass = { err, pass, state: snapshot() };
  }
  if (bestPass.pass > 0) {
    console.log(`keeping pass ${bestPass.pass}`);
    content.upgrades.forEach((u, i) => {
      const costs = bestPass.state.costs[i];
      if (costs) u.costs = costs;
    });
    scan.exponent = bestPass.state.exp;
    scan.baseCost = bestPass.state.base;
  }

  for (const u of content.upgrades) if (u.costs) u.costs = u.costs.map(nice);
  scan.baseCost = Number(scan.baseCost.toPrecision(2));
  const final = measure(content);
  console.log(`final: buyErr ${final.buyErr.toFixed(3)} tierErr ${final.tierErr.toFixed(3)} gap10 ${final.gap10.toFixed(1)} | ${showTiers(final.tiers)}`);

  const upgradesPath = 'src/content/upgrades.json';
  const lines = content.upgrades.map((u) => '    ' + JSON.stringify(u).replace(/,"/g, ', "').replace(/":/g, '": '));
  writeFileSync(upgradesPath, `{\n  "upgrades": [\n${lines.join(',\n')}\n  ]\n}\n`);
  const economyPath = 'src/content/economy.json';
  const eco = JSON.parse(readFileSync(economyPath, 'utf8'));
  eco.scan.baseCost = scan.baseCost;
  eco.scan.exponent = scan.exponent;
  eco.scan.spawnDiscount = scan.spawnDiscount;
  // Number arrays (the merge bonus table) stay on one line each.
  const json = JSON.stringify(eco, null, 2).replace(/\[\s+([-0-9.,\s]+?)\s+\]/g, (_m, inner: string) => `[${inner.split(',').map((x) => x.trim()).join(', ')}]`);
  writeFileSync(economyPath, json + '\n');
  console.log('Wrote', upgradesPath, economyPath);
}
