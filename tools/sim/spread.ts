// Spread of finish times over many seeds, for one ad policy and tap profile.
// Run: node --experimental-strip-types tools/sim/spread.ts [seeds] [policy] [profile]
import { readFileSync } from 'node:fs';
import { AD_POLICIES, loadContent, PROFILES, simulate } from './player.ts';

const seeds = Number(process.argv[2] ?? 100);
const policy = AD_POLICIES.find((p) => p.id === (process.argv[3] ?? 'none'))!;
const profile = PROFILES[process.argv[4] ?? 'normal'];
const content = loadContent((p) => readFileSync(p, 'utf8'));
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const times = Array.from({ length: seeds }, (_, i) => simulate(content, 1000 + i, policy, profile, 3 * 3600, 0.2).finishSec).sort((a, b) => a - b);
const pct = (p: number) => fmt(times[Math.min(times.length - 1, Math.floor((p / 100) * times.length))]);
console.log(`${policy.id}/${profile.id} over ${seeds} seeds: p10 ${pct(10)} p25 ${pct(25)} p50 ${pct(50)} p75 ${pct(75)} p90 ${pct(90)} max ${fmt(times[times.length - 1])}`);
