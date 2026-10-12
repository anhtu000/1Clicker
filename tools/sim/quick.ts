// Fast balance check while tuning: key milestone medians for each ad policy, plus the idle player.
// Run: node --experimental-strip-types tools/sim/quick.ts [seeds]
import { readFileSync } from 'node:fs';
import { AD_POLICIES, loadContent, PROFILES, simulate, type AdPolicy, type TapProfile } from './player.ts';

const seeds = Number(process.argv[2] ?? 8);
const content = loadContent((p) => readFileSync(p, 'utf8'));
const fmt = (sec: number | undefined) =>
  sec === undefined ? '  -  ' : `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : undefined);

const KEYS = [
  'First comet (tier 4)',
  'First moon (tier 5)',
  'Bought fleet L1',
  'First planet (tier 6)',
  'Bought slots L1',
  'Bought slots L4',
  'Bought lens L3',
  'First gasGiant (tier 7)',
  'Bought autoScan L1',
  'First star (tier 8)',
  'Bought lens L6',
  'Bought slots L8',
  'First blackHole (tier 9)',
  'Bought autoMerge L1',
  'Bought lens L10',
  'First galaxy (tier 10)',
];

function show(policy: AdPolicy, profile: TapProfile, full: boolean) {
  const runs = Array.from({ length: seeds }, (_, i) => simulate(content, 1000 + i, policy, profile));
  const finish = median(runs.map((r) => r.finishSec));
  console.log(`\n${policy.label} | ${profile.label}: finish ${fmt(finish)}`);
  if (!full) return finish;
  const row = KEYS.map((k) => `${k.replace('First ', '').replace('Bought ', '+')}: ${fmt(median(runs.flatMap((r) => r.milestones.filter((m) => m.what === k).map((m) => m.t))))}`);
  for (let i = 0; i < row.length; i += 5) console.log('  ' + row.slice(i, i + 5).join(' | '));
  const r0 = runs[0];
  const at = (m: number) => {
    const i = m * 6;
    const man = r0.manualSeries[i];
    const aut = r0.autoSeries[i];
    return man === undefined ? '-' : `${man.toExponential(1)}/${aut.toExponential(1)}`;
  };
  console.log(`  hand/probe income @2 ${at(2)} @5 ${at(5)} @10 ${at(10)} @20 ${at(20)} @30 ${at(30)} @45 ${at(45)} @60 ${at(60)}`);
  const ratio = (from: number, to: number) => {
    const xs = runs.flatMap((r) => r.tapToAutoSeries.slice(from * 6, to * 6));
    return median(xs)?.toFixed(2) ?? '-';
  };
  console.log(`  hand(4.5 tps)/probe after auto: first 10 min ${ratio(0, 10)}, 10-30 ${ratio(10, 30)}, 30+ ${ratio(30, 999)}`);
  console.log(
    `  scans ${median(runs.map((r) => r.scans))} merges ${median(runs.map((r) => r.merges))} twins ${median(runs.map((r) => r.twins))} ` +
      `absorbs ${median(runs.map((r) => r.absorbs))} stars ${median(runs.map((r) => r.stars))} | ` +
      `max wait for a reward: first10 ${median(runs.map((r) => r.maxGap.first10))?.toFixed(1)}s ` +
      `10-30 ${median(runs.map((r) => r.maxGap.to30))?.toFixed(1)}s 30+ ${median(runs.map((r) => r.maxGap.after30))?.toFixed(1)}s | rewards ${JSON.stringify(r0.rewards)}`,
  );
  const first10 = runs.map((r) => r.longGaps.filter(([start]) => start < 600).length);
  console.log(`  waits of 20 s+ in the first 10 min (median count): ${median(first10)}`);
  return finish;
}

for (const policy of AD_POLICIES) show(policy, PROFILES.normal, true);
const engaged = show(AD_POLICIES[0], PROFILES.normal, false)!;
const idle = show(AD_POLICIES[0], PROFILES.idle, false)!;
console.log(`\nSteady tapper finishes ${Math.round((1 - engaged / idle) * 100)}% sooner than the idle player (no ads).`);
