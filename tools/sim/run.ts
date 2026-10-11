// Balance simulator. Run: npm run sim            (summary + one detailed run per ad policy)
//                         npm run sim -- 500     (number of seeds for the spread, default 200)
// Writes tools/sim/out/report.json for the report page.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { AD_POLICIES, loadContent, PROFILES, simulate, type RunReport } from './player.ts';

const seeds = Number(process.argv[2] ?? 200);
const content = loadContent((p) => readFileSync(p, 'utf8'));

const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
const pct = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
};

const out: Record<string, unknown> = { generatedAt: new Date().toISOString(), seeds, policies: {} };

for (const profile of Object.values(PROFILES)) {
  console.log(`\n=== Tap profile: ${profile.id} ===`);
  for (const policy of AD_POLICIES) {
    const runs: RunReport[] = [];
    for (let i = 0; i < seeds; i++) runs.push(simulate(content, 1000 + i, policy, profile));
    const times = runs.map((r) => r.finishSec);
    const unfinished = runs.filter((r) => !r.finished).length;
    const median = runs.find((r) => r.finishSec === pct(times, 50)) ?? runs[0];
    console.log(
      `${policy.label.padEnd(58)} finish p10 ${fmt(pct(times, 10))}  p50 ${fmt(pct(times, 50))}  p90 ${fmt(pct(times, 90))}` +
        (unfinished ? `  UNFINISHED ${unfinished}` : ''),
    );
    const gaps = (k: 'first10' | 'to30' | 'after30') => pct(runs.map((r) => r.maxGap[k]), 90).toFixed(1);
    console.log(
      `  gaps p90: first10 ${gaps('first10')}s, 10-30 ${gaps('to30')}s, 30+ ${gaps('after30')}s | ` +
        `scans ${median.scans} merges ${median.merges} taps ${median.manualTaps} absorbs ${median.absorbs} ` +
        `codex ${median.codexFound} rewards ${JSON.stringify(median.rewards)}`,
    );
    // Median minute of every milestone that at least half the runs reach.
    const whats = new Set(runs.flatMap((r) => r.milestones.map((m) => m.what)));
    const milestoneMedians: Record<string, number> = {};
    for (const what of whats) {
      const ts = runs.map((r) => r.milestones.find((m) => m.what === what)?.t).filter((t): t is number => t !== undefined);
      if (ts.length >= runs.length / 2) milestoneMedians[what] = pct(ts, 50);
    }
    // Longest wait between two "new things" in the first 10 minutes, per run.
    const isNew = (w: string) =>
      (w.startsWith('First ') && w !== 'First absorb (board stuck)') || w.startsWith('Shop shows') || w.startsWith('Automation') || / L1( \(ad\))?$/.test(w);
    const newGaps = runs.map((r) => {
      const ts = [0, ...r.milestones.filter((m) => m.t <= 600 && isNew(m.what)).map((m) => m.t), 600];
      let worst = 0;
      for (let i = 1; i < ts.length; i++) worst = Math.max(worst, ts[i] - ts[i - 1]);
      return worst;
    });
    const firstScan = runs.map((r) => r.milestones.find((m) => m.what.startsWith('First stardust'))?.t ?? 0);
    const summary = {
      p10: pct(times, 10),
      p50: pct(times, 50),
      p90: pct(times, 90),
      unfinished,
      gapsP90: { first10: Number(gaps('first10')), to30: Number(gaps('to30')), after30: Number(gaps('after30')) },
      gapsP50: {
        first10: pct(runs.map((r) => r.maxGap.first10), 50),
        to30: pct(runs.map((r) => r.maxGap.to30), 50),
        after30: pct(runs.map((r) => r.maxGap.after30), 50),
      },
      newThingGap: { p50: pct(newGaps, 50), p90: pct(newGaps, 90) },
      firstScanP90: pct(firstScan, 90),
      rewardsP50: {
        freeUpgrade: pct(runs.map((r) => r.rewards.freeUpgrade), 50),
        luckyScan: pct(runs.map((r) => r.rewards.luckyScan), 50),
        mergeAll: pct(runs.map((r) => r.rewards.mergeAll), 50),
      },
      codexP50: pct(runs.map((r) => r.codexFound), 50),
      starsP50: pct(runs.map((r) => r.stars), 50),
      scansP50: pct(runs.map((r) => r.scans), 50),
      mergesP50: pct(runs.map((r) => r.merges), 50),
      milestoneMedians,
    };
    if (profile.id === 'normal') {
      (out.policies as any)[policy.id] = {
        ...summary,
        label: policy.label,
        p10: pct(times, 10),
        p50: pct(times, 50),
        p90: pct(times, 90),
        unfinished,
        gapsP90: { first10: Number(gaps('first10')), to30: Number(gaps('to30')), after30: Number(gaps('after30')) },
        median,
        finishTimes: times,
      };
    }
    const profiles = ((out as any).profiles ??= {});
    (profiles[profile.id] ??= {})[policy.id] = {
      ...summary,
      tapToAuto: {
        to10: pct(runs.flatMap((r) => r.tapToAutoSeries.slice(0, 60)), 50),
        to30: pct(runs.flatMap((r) => r.tapToAutoSeries.slice(60, 180)), 50),
        after30: pct(runs.flatMap((r) => r.tapToAutoSeries.slice(180)), 50),
      },
    };
  }
}

const detail = (out.policies as any).none?.median as RunReport | undefined;
if (detail) {
  console.log('\n=== Milestones, median run without ads ===');
  for (const m of detail.milestones) console.log(`${fmt(m.t).padStart(6)}  ${m.what}`);
}

mkdirSync('tools/sim/out', { recursive: true });
writeFileSync('tools/sim/out/report.json', JSON.stringify(out, null, 1));
