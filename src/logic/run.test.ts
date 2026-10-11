// Tests for the game #1 economy. Run: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkContent } from './content.ts';
import { newRunState, Run } from './run.ts';

const read = (p: string) => JSON.parse(readFileSync(new URL(`../content/${p}`, import.meta.url), 'utf8'));
const content = checkContent(read('bodies.json'), read('economy.json'), read('upgrades.json'));
const fresh = (mode: 'main' | 'speedrun' = 'main', seed = 5) => new Run(content, newRunState(content, mode, seed), { found: {} });

test('content files pass their checks', () => {
  assert.equal(content.tiers.length, content.economy.goalTier);
  assert.throws(() => checkContent({ tiers: [], rarities: [] }, {}, { upgrades: [{ id: 'x' }] }), /Content errors/);
});

test('first tap gives energy right away', () => {
  const run = fresh();
  const { amount } = run.tap();
  assert.ok(amount >= 1);
  assert.equal(run.s.energy, amount);
});

test('scan places a body, costs energy and raises the price', () => {
  const run = fresh();
  run.s.energy = 1e9;
  const before = run.scanCost();
  const result = run.scan()!;
  assert.equal(result.slot, 0);
  assert.equal(result.body.t, 1);
  assert.ok(result.isNew);
  // The first prices round up to 1, so the rise shows from the third scan.
  assert.ok(run.scanCost() >= before);
  // The second paid scan is scripted to be Rare or better.
  assert.ok(run.scan()!.body.r >= 1);
  assert.ok(run.scanCost() > before);
});

test('board fills up, then scanning stops', () => {
  const run = fresh();
  run.s.energy = 1e12;
  for (let i = 0; i < run.slots; i++) assert.ok(run.scan());
  assert.equal(run.freeSlot(), -1);
  assert.equal(run.canScan(), false);
});

test('merge needs the same tier; two Epics stay at least Epic', () => {
  const run = fresh();
  run.s.board[0] = { t: 3, r: 2 };
  run.s.board[1] = { t: 3, r: 2 };
  run.s.board[2] = { t: 4, r: 0 };
  assert.equal(run.canMerge(0, 2), false);
  const result = run.merge(0, 1)!;
  assert.equal(result.body.t, 4);
  assert.ok(result.body.r >= 2);
  assert.equal(run.s.board[0], null);
  assert.equal(run.s.highestTier, 4);
});

test('merge keeps at least the average rarity of the pair, rounded down', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const run = fresh('main', seed);
    run.s.merges = 5; // past the scripted Rare merge
    run.s.board[0] = { t: 3, r: 2 };
    run.s.board[1] = { t: 3, r: 0 };
    assert.ok(run.merge(0, 1)!.body.r >= 1, 'Epic + Common gives at least Rare');
    run.s.board[2] = { t: 2, r: 4 };
    run.s.board[3] = { t: 2, r: 1 };
    assert.ok(run.merge(2, 3)!.body.r >= 2, 'Mythic + Rare gives at least Epic');
  }
});

test('merge bonus: share of the scan price by tier and rarer rarity', () => {
  const run = fresh();
  const table = content.economy.mergeBonus.scanShare;
  assert.equal(table[0][0], 0, 'tier 1 Common pays nothing');
  assert.equal(table[7][3], 1, 'tier 8 Legendary pays a full scan');
  // grows along both directions
  for (let t = 0; t < table.length; t++) for (let r = 1; r < table[t].length; r++) assert.ok(table[t][r] > table[t][r - 1]);
  for (let t = 1; t < table.length; t++) for (let r = 0; r < table[t].length; r++) assert.ok(table[t][r] > table[t - 1][r]);
  run.s.energy = 0;
  run.s.board[0] = { t: 8, r: 3 };
  run.s.board[1] = { t: 8, r: 0 };
  const price = run.scanCost();
  const result = run.merge(0, 1)!;
  assert.equal(result.bonus, price);
  assert.equal(run.s.energy, price);
  run.s.board[2] = { t: 1, r: 0 };
  run.s.board[3] = { t: 1, r: 0 };
  assert.equal(run.merge(2, 3)!.bonus, 0);
});

test('merging into the goal tier finishes the run once', () => {
  const run = fresh('speedrun');
  const goal = content.economy.goalTier;
  run.s.time = 1234;
  run.s.board[0] = { t: goal - 1, r: 0 };
  run.s.board[1] = { t: goal - 1, r: 0 };
  const result = run.merge(0, 1)!;
  assert.ok(result.finished);
  assert.equal(run.s.finishedAt, 1234);
  // The goal tier cannot merge further.
  run.s.board[2] = { t: goal, r: 0 };
  assert.equal(run.canMerge(1, 2), false);
});

test('power and tap value follow the board', () => {
  const run = fresh();
  const empty = run.tapValue();
  run.s.board[0] = { t: 2, r: 0 };
  run.merge(0, 0); // invalid, no change
  run.s.board[1] = { t: 1, r: 0 };
  // Board changed directly: clear the cache the way place() does.
  (run as any).powerCache = null;
  assert.equal(run.power(), 1 + 3 + 1);
  assert.ok(run.tapValue() > empty);
});

test('codex bonus applies in main mode only', () => {
  const main = fresh('main');
  const speed = fresh('speedrun');
  main.codex.found['1.0'] = 1;
  main.codex.found['2.3'] = 1;
  speed.codex.found['1.0'] = 1;
  assert.ok(main.codexMult() > 1);
  assert.equal(speed.codexMult(), 1);
});

test('upgrades: visibility, price, purchase', () => {
  const run = fresh();
  const focus = run.upgrade('focus');
  assert.ok(run.isVisible(focus));
  assert.equal(run.isVisible(run.upgrade('probes')), false);
  run.s.energy = run.upgradeCost(focus);
  assert.ok(run.buy('focus'));
  assert.equal(run.level('focus'), 1);
  assert.equal(run.s.energy, 0);
  assert.equal(run.stat('tapMult'), focus.value);
});

test('free upgrade target skips noAd upgrades and stays within the income cap', () => {
  const run = fresh();
  run.s.highestTier = 5;
  run.s.energy = 0;
  for (let i = 0; i < 8; i++) run.s.board[i] = { t: 5, r: 0 };
  (run as any).powerCache = null;
  const target = run.freeUpgradeTarget();
  assert.notEqual(target, 'probes');
  if (target) {
    const cap = run.activeIncome() * content.economy.rewarded.freeUpgrade.maxIncomeSeconds;
    assert.ok(run.upgradeCost(run.upgrade(target)) <= cap);
  }
});

test('reward cooldown is longer when the reward came without an ad', () => {
  const run = fresh();
  run.useReward('luckyScan');
  const normal = run.rewardWait('luckyScan');
  const run2 = fresh();
  run2.useReward('luckyScan', true);
  assert.equal(run2.rewardWait('luckyScan'), normal * content.economy.rewarded.freeCooldownMult);
  assert.equal(run.rewardReady('luckyScan'), false);
});

test('lucky scan is free, higher tier, at least Rare', () => {
  const run = fresh();
  const result = run.luckyScan()!;
  assert.equal(result.body.t, 1 + content.economy.rewarded.luckyScan.tierBonus);
  assert.ok(result.body.r >= 1);
  assert.equal(run.s.scans, 0);
});

test('shooting stars appear, can be caught once, and go away', () => {
  const run = fresh();
  const st = content.economy.stars;
  let shownAt = -1;
  for (let i = 0; i < (st.everyMax + 1) * 10 && shownAt < 0; i++) {
    if (run.update(0.1).some((e) => e.kind === 'star')) shownAt = run.s.time;
  }
  assert.ok(shownAt >= st.everyMin - 0.2, `first star at ${shownAt}`);
  assert.ok(run.starUp);
  assert.ok(run.catchStar() > 0);
  assert.equal(run.catchStar(), 0);
  assert.equal(run.starUp, false);
  // An uncaught star leaves after its lifetime.
  const other = fresh();
  let gone = false;
  for (let i = 0; i < (st.everyMin + st.lifetime + 1) * 10; i++) if (other.update(0.1).some((e) => e.kind === 'starGone')) gone = true;
  assert.ok(gone);
});

test('offline earnings come from probes, capped, main mode only', () => {
  const run = fresh();
  assert.equal(run.offlineEarnings(3600), 0);
  run.s.levels.probes = 1;
  (run as any).statCache = null;
  const hour = run.offlineEarnings(3600);
  assert.ok(hour > 0);
  const capH = run.stat('offlineCapHours');
  assert.equal(run.offlineEarnings(100 * 3600), run.offlineEarnings(capH * 3600));
  assert.equal(run.offlineEarnings(30), 0);
});

test('auto scan and auto merge work on their own', () => {
  const run = fresh();
  run.s.levels.autoScan = 5;
  run.s.levels.autoMerge = 4;
  (run as any).statCache = null;
  run.s.energy = 1e15;
  for (let i = 0; i < 300; i++) run.update(0.1);
  assert.ok(run.s.scans > 10);
  assert.ok(run.s.merges > 5);
});

test('personal records: fastest first, top 5, rank of the new run', async () => {
  const { addRecord } = await import('./records.ts');
  const rec = (ms: number) => ({ ms, at: ms, merges: 0, scans: 0, rarity: 0 });
  let list = [] as ReturnType<typeof addRecord>['list'];
  for (const ms of [50, 30, 40]) list = addRecord(list, rec(ms)).list;
  assert.deepEqual(list.map((r) => r.ms), [30, 40, 50]);
  const first = addRecord(list, rec(20));
  assert.equal(first.rank, 1);
  list = first.list;
  list = addRecord(list, rec(45)).list; // 20 30 40 45 50
  const slow = addRecord(list, rec(60));
  assert.equal(slow.rank, null, 'slower than all five: not on the list');
  assert.equal(slow.list.length, 5);
  const tie = addRecord(list, rec(40));
  assert.equal(tie.rank, 4, 'a tie goes behind the run that set it first');
  assert.deepEqual(tie.list.map((r) => r.ms), [20, 30, 40, 40, 45]);
});
