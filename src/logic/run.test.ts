// Tests for the game #1 economy. Run: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { checkContent } from './content.ts';
import { codexKey, newRunState, Run } from './run.ts';

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
  assert.equal(run.isVisible(run.upgrade('fleet')), false);
  run.s.energy = run.upgradeCost(focus);
  assert.ok(run.buy('focus'));
  assert.equal(run.level('focus'), 1);
  assert.equal(run.s.energy, 0);
  // Level 1 is 1.5x stronger than the old 1.5x per level (user request 13/10): 2.25, then x1.5 per level.
  assert.equal(run.stat('tapMult'), focus.values![0]);
  assert.equal(focus.values![0], 2.25);
  for (let i = 1; i < focus.max; i++) assert.ok(Math.abs(focus.values![i] / focus.values![i - 1] - 1.5) < 1e-3);
});

test('free upgrade target never gives the first probes, and stays within the income cap', () => {
  const run = fresh();
  run.s.highestTier = 5;
  run.s.energy = 0;
  for (let i = 0; i < 8; i++) run.s.board[i] = { t: 5, r: 0 };
  (run as any).powerCache = null;
  const target = run.freeUpgradeTarget();
  assert.notEqual(target, 'fleet', 'Probe Fleet level 1 (the first automation) is not offered for an ad');
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
  assert.equal(run.autoIncome(), 0, 'no probes before Probe Fleet level 1');
  run.s.levels.fleet = 1;
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

test('hidden bodies: Galaxy + planet tier makes one; it never merges, copies, or adds power', () => {
  const run = fresh();
  const goal = content.economy.goalTier;
  const [first] = content.specials;
  run.s.board[0] = { t: goal, r: 2 };
  run.s.board[1] = { t: first.tier, r: 0 };
  run.s.board[2] = { t: first.tier, r: 0 };
  run.s.board[3] = { t: 1, r: 0 };
  assert.equal(run.fusionOf(0, 3), null, 'stardust has no hidden form');
  assert.equal(run.fusionOf(1, 2), null, 'two planets merge normally, no fusion');
  const highest = run.s.highestTier;
  const powerBefore = run.power();
  const made = run.fuse(1, 0)!; // planet dragged onto the Galaxy: lands in the Galaxy's slot
  assert.equal(made.slot, 0);
  assert.equal(made.body.s, first.id);
  assert.ok(made.isNew);
  assert.equal(run.s.board[1], null);
  assert.ok(made.body.r >= 1, 'Epic Galaxy + Common planet: at least Rare, like a merge');
  assert.equal(codexKey(made.body), `s.${first.id}.${made.body.r}`);
  assert.equal(run.sellValue(made.body), Math.round(first.sell * content.rarities[made.body.r].mult));
  assert.equal(run.s.highestTier, highest);
  // the Galaxy (and the planet) left the board, the hidden body adds nothing
  assert.ok(run.power() < powerBefore);
  run.s.board[1] = { t: first.tier, r: 2, s: first.id };
  assert.equal(run.canMerge(0, 1), false, 'two hidden bodies never merge');
  assert.equal(run.canMerge(0, 2), false, 'hidden + its tier never merges');
  assert.equal(run.canDuplicate(0), false);
  assert.equal(run.absorbValue(0), 0);
  assert.equal(run.findPair(), null);
  assert.equal(run.removeBody(0)!.s, first.id);
  assert.equal(run.s.board[0], null);
});

test('board full with nothing to merge: stuck, and the weakest body can go to the core', () => {
  const run = fresh();
  // A hidden body first, then one body of each tier: no two can merge.
  run.s.board[0] = { t: 7, r: 2, s: content.specials[1].id };
  for (let i = 1; i < run.slots; i++) run.s.board[i] = { t: i, r: i % 3 };
  run.s.board[run.slots - 1] = { t: content.economy.goalTier, r: 0 };
  (run as any).powerCache = null;
  assert.equal(run.findPair(), null);
  assert.ok(run.isStuck());
  const weak = run.weakestSlot();
  assert.equal(run.s.board[weak]!.t, 1, 'lowest tier, never the hidden body');
  assert.ok(run.absorb(weak) > 0);
  assert.equal(run.isStuck(), false);
});

test('Probe Fleet: level 1 starts the probes, each later level raises their income', () => {
  const run = fresh();
  const fleet = run.upgrade('fleet');
  let last = run.autoRate();
  assert.equal(last, 0);
  for (let level = 1; level <= fleet.max; level++) {
    run.s.levels.fleet = level;
    (run as any).statCache = null;
    assert.ok(run.autoRate() > last, `level ${level} raises probe income`);
    last = run.autoRate();
  }
  // Core Focus is for taps only: it does not change probe income.
  run.s.board[0] = { t: 3, r: 0 };
  (run as any).powerCache = null;
  const auto = run.autoIncome();
  run.s.levels.focus = 5;
  (run as any).statCache = null;
  assert.equal(run.autoIncome(), auto);
  assert.ok(run.tapValue() > run.baseTapValue());
});

test('Gravity Lens: scans stay at tier 1 without it, reach tier 4 at most, and match the odds table', () => {
  const odds = content.economy.scan.tierOdds;
  assert.deepEqual(odds[0], [1, 0, 0, 0]);
  assert.deepEqual(odds[10], [0.4, 0.3, 0.2, 0.1]);
  const count = (lens: number, n: number) => {
    const run = fresh('main', 77);
    run.s.levels.lens = lens;
    (run as any).statCache = null;
    const tiers = [0, 0, 0, 0, 0];
    for (let i = 0; i < n; i++) {
      run.s.energy = 1e30;
      run.s.board[0] = null;
      const r = run.scan()!;
      tiers[r.body.t] += 1;
    }
    return tiers;
  };
  const none = count(0, 200);
  assert.equal(none[1], 200, 'lens 0: every scan is tier 1');
  const max = count(10, 4000);
  assert.equal(max.length, 5, 'never above tier 4');
  for (let t = 1; t <= 4; t++) assert.ok(Math.abs(max[t] / 4000 - odds[10][t - 1]) < 0.03, `tier ${t}: ${max[t] / 4000}`);
});

test('Stellar Luck adds 25% weight to Rare and up per level; Star Magnet makes stars 8% more frequent per level', () => {
  const run = fresh();
  const rareUp = () => 1 - run.rarityOdds()[0];
  const before = rareUp();
  run.s.levels.luck = 8;
  (run as any).statCache = null;
  assert.equal(run.stat('luck'), 3);
  assert.ok(rareUp() > before * 2);
  run.s.levels.starMagnet = 8;
  (run as any).statCache = null;
  assert.ok(Math.abs(run.stat('starFreq') - 1.64) < 1e-9);
});

test('Core Focus and Probe Fleet keep their last levels until the Galaxy is made', () => {
  const run = fresh();
  const focus = run.upgrade('focus');
  const fleet = run.upgrade('fleet');
  assert.equal(run.levelCap(focus), 17);
  assert.equal(run.levelCap(fleet), 13);
  run.s.levels.focus = 17;
  run.s.energy = 1e30;
  assert.equal(run.canBuy('focus'), false);
  assert.ok(run.waitsForGoal(focus));
  run.s.highestTier = content.economy.goalTier;
  assert.equal(run.levelCap(focus), focus.max);
  assert.ok(run.canBuy('focus'));
  assert.equal(run.waitsForGoal(focus), false);
});
