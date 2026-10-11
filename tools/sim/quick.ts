// Fast balance check while tuning: key milestone medians for each ad policy.
// Run: node --experimental-strip-types tools/sim/quick.ts [seeds]
import { readFileSync } from 'node:fs';
import { AD_POLICIES, loadContent, PROFILES, simulate } from './player.ts';

const seeds = Number(process.argv[2] ?? 8);
const content = loadContent((p) => readFileSync(p, 'utf8'));
const fmt = (sec: number | undefined) =>
  sec === undefined ? '  -  ' : `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : undefined);

const KEYS = [
  'First comet (tier 4)',
  'First moon (tier 5)',
  'Bought probes L1',
  'First planet (tier 6)',
  'Bought slots L1',
  'Bought deepScan L1',
  'First gasGiant (tier 7)',
  'Bought autoScan L1',
  'First star (tier 8)',
  'Bought deepScan L2',
  'Bought slots L2',
  'First blackHole (tier 9)',
  'Bought autoMerge L1',
  'Bought deepScan L3',
  'First galaxy (tier 10)',
];

for (const policy of AD_POLICIES) {
  const runs = Array.from({ length: seeds }, (_, i) => simulate(content, 1000 + i, policy, PROFILES.normal));
  console.log(`\n${policy.label}`);
  const row = KEYS.map((k) => `${k.replace('First ', '').replace('Bought ', '+')}: ${fmt(median(runs.flatMap((r) => r.milestones.filter((m) => m.what === k).map((m) => m.t))))}`);
  for (let i = 0; i < row.length; i += 5) console.log('  ' + row.slice(i, i + 5).join(' | '));
  const r0 = runs[0];
  const at = (m: number) => (r0.incomeByMinute[m - 1] ?? 0).toExponential(1);
  console.log(`  income/s @1 ${at(1)} @5 ${at(5)} @10 ${at(10)} @20 ${at(20)} @30 ${at(30)} @45 ${at(45)} @60 ${at(60)}`);
  console.log(
    `  scans ${median(runs.map((r) => r.scans))} merges ${median(runs.map((r) => r.merges))} taps ${median(runs.map((r) => r.manualTaps))} ` +
      `absorbs ${median(runs.map((r) => r.absorbs))} gaps10 ${median(runs.map((r) => r.maxGap.first10))?.toFixed(1)} ` +
      `gaps30 ${median(runs.map((r) => r.maxGap.to30))?.toFixed(1)} gaps+ ${median(runs.map((r) => r.maxGap.after30))?.toFixed(1)} rewards ${JSON.stringify(r0.rewards)}`,
  );
  const ups = r0.milestones.filter((m) => m.what.startsWith('Bought') || m.what.startsWith('Got')).length;
  console.log(`  upgrades bought (run 0): ${ups}, unfinished: ${runs.filter((r) => !r.finished).length}`);
}
