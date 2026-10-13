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

test('merge needs the same tier', () => {
  const run = fresh();
  run.s.board[0] = { t: 3, r: 2 };
  run.s.board[1] = { t: 3, r: 2 };
  run.s.board[2] = { t: 4, r: 0 };
  assert.equal(run.canMerge(0, 2), false);
  const result = run.merge(0, 1)!;
  assert.equal(result.body.t, 4);
  assert.equal(run.s.board[0], null);
  assert.equal(run.s.highestTier, 4);
});

test('merge rarity (user 13/10): half the time the average rounded down, else a normal roll; last stages always roll', () => {
  const rule = content.economy.mergeRarity;
  assert.deepEqual(rule, { keepAverage: 0.5, rollFromTier: 9 });
  // Epic + Common (average Rare) into tier 4, many seeds: about half exactly Rare from the rule,
  // and the rolled half follows the base odds (mostly Common, so the result can drop).
  const n = 2000;
  let rare = 0;
  let common = 0;
  for (let seed = 1; seed <= n; seed++) {
    const run = fresh('main', seed);
    run.s.merges = 5; // past the scripted Rare merge
    run.s.board[0] = { t: 3, r: 2 };
    run.s.board[1] = { t: 3, r: 0 };
    const r = run.merge(0, 1)!.body.r;
    if (r === 1) rare += 1;
    if (r === 0) common += 1;
  }
  const odds = fresh().rarityOdds();
  const expectRare = (rule.keepAverage + (1 - rule.keepAverage) * odds[1]) * n;
  const expectCommon = (1 - rule.keepAverage) * odds[0] * n;
  assert.ok(Math.abs(rare - expectRare) < 0.06 * n, `Rare ${rare}, expected about ${Math.round(expectRare)}`);
  assert.ok(Math.abs(common - expectCommon) < 0.06 * n, `Common ${common}, expected about ${Math.round(expectCommon)}`);
  // Two Mythic Black Holes into the Galaxy: always a roll, so rarely Mythic.
  let mythic = 0;
  for (let seed = 1; seed <= 400; seed++) {
    const run = fresh('main', seed);
    run.s.merges = 5;
    run.s.board[0] = { t: 8, r: 4 };
    run.s.board[1] = { t: 8, r: 4 };
    if (run.merge(0, 1)!.body.r === 4) mythic += 1;
  }
  assert.ok(mythic < 400 * 0.05, `tier 9 from two Mythics: ${mythic} of 400 Mythic`);
  // Pity still holds: a due Epic+ rule forces the roll even when the average would be Common.
  const run = fresh('main', 3);
  run.s.merges = 5;
  const epicRule = content.pity.findIndex((p) => p.minTier === 2);
  run.s.pity[epicRule] = content.pity[epicRule].within - 1;
  run.s.board[0] = { t: 2, r: 0 };
  run.s.board[1] = { t: 2, r: 0 };
  assert.ok(run.merge(0, 1)!.body.r >= 2, 'pity Epic');
  assert.equal(run.s.pity[epicRule], 0);
});

test('merge bonus: share of the scan price by tier and rarer rarity', () => {
  const run = fresh();
  const table = content.economy.mergeBonus.scanShare;
  assert.equal(table[0][0], 0, 'tier 1 Common pays nothing');
  // 13/10 (user): Rare x0.9, Epic and above x0.8, so tier 8 Legendary pays 0.8 of a scan.
  assert.equal(table[7][3], 0.8, 'tier 8 Legendary pays 0.8 of a scan');
  // grows along both directions
  for (let t = 0; t < table.length; t++) for (let r = 1; r < table[t].length; r++) assert.ok(table[t][r] > table[t][r - 1]);
  for (let t = 1; t < table.length; t++) for (let r = 0; r < table[t].length; r++) assert.ok(table[t][r] > table[t - 1][r]);
  run.s.energy = 0;
  run.s.board[0] = { t: 8, r: 3 };
  run.s.board[1] = { t: 8, r: 0 };
  const price = run.scanCost();
  const result = run.merge(0, 1)!;
  assert.equal(result.bonus, Math.round(0.8 * price));
  assert.equal(run.s.energy, Math.round(0.8 * price));
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
  assert.ok(Math.abs(run.power() - (1 + (content.economy.tierValueGrowth + 1) * content.economy.bodyValueScale!)) < 1e-9);
  assert.ok(run.tapValue() > empty);
});

test('discoveries give no energy bonus: the first run plays like a timed run (user 13/10)', () => {
  const main = fresh('main');
  const speed = fresh('speedrun');
  for (const run of [main, speed]) run.s.board[0] = { t: 3, r: 1 };
  main.codex.found['1.0'] = 1;
  main.codex.found['2.3'] = 1;
  main.codex.found['5.4'] = 1;
  assert.equal(main.tapValue(), speed.tapValue());
  assert.equal(main.autoIncome(), speed.autoIncome());
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
  // 13/10 (user): every level 20% stronger twice, then 30% more: level 1 is 2.25 x 1.2 x 1.2 x 1.3 = 4.212.
  assert.equal(focus.values![0], 4.212);
  // x1.5 per level; levels 21+ give 20% less than that (user 13/10), so level 21 is only x1.2 over level 20.
  for (let i = 1; i < focus.max; i++) assert.ok(Math.abs(focus.values![i] / focus.values![i - 1] - (i === 20 ? 1.2 : 1.5)) < 1e-3, `level ${i + 1}`);
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

test('hidden bodies: Galaxy + planet tier makes one; it never merges or copies, and keeps its Galaxy energy +10%', () => {
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
  assert.ok(made.body.r >= 0 && made.body.r < content.rarities.length, 'rarity as in a merge: the average (Rare) half the time, else a roll');
  assert.equal(codexKey(made.body), `s.${first.id}.${made.body.r}`);
  assert.equal(run.sellValue(made.body), Math.round(first.sell * content.rarities[made.body.r].mult));
  assert.equal(run.s.highestTier, highest);
  // The Galaxy and the planet left the board; the hidden body keeps the Epic Galaxy's energy x power
  // (1.1, user 13/10), whatever rarity it rolled.
  assert.equal(first.power, 1.1);
  assert.equal(made.body.g, 2);
  const galaxy = run.bodyValue({ t: goal, r: 2 });
  assert.ok(Math.abs(run.bodyValue(made.body) - 1.1 * galaxy) < 1e-6);
  assert.ok(Math.abs(powerBefore - run.power() - (galaxy + run.bodyValue({ t: first.tier, r: 0 }) - 1.1 * galaxy)) < 1e-6);
  // Older saves: no g, the hidden body's own rarity stands in.
  assert.ok(Math.abs(run.bodyValue({ t: first.tier, r: 1, s: first.id }) - 1.1 * run.bodyValue({ t: goal, r: 1 })) < 1e-6);
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

test('copies: Binary Merge up to its cap, the rewarded copy only up to the Asteroid', () => {
  const run = fresh();
  const adMax = run.adCopyMaxTier;
  assert.equal(adMax, 3, 'user 13/10: the rewarded copy stops at the Asteroid');
  assert.ok(content.economy.twinMaxTier > adMax);
  run.s.board[0] = { t: adMax, r: 1 };
  run.s.board[1] = { t: adMax + 1, r: 1 };
  assert.ok(run.canDuplicate(0, adMax));
  assert.equal(run.canDuplicate(1, adMax), false, 'a Comet is not offered');
  assert.equal(run.duplicate(1, adMax), null);
  assert.ok(run.canDuplicate(1), 'Binary Merge still copies it');
  const copy = run.duplicate(0, adMax)!;
  assert.deepEqual(copy.body, { t: adMax, r: 1 });
});

test('after the Galaxy (main run): stars worth double, scans climb half as fast', () => {
  const st = content.economy.stars;
  assert.equal(st.valueMultEndless, 2);
  assert.equal(st.seconds, 5.6, 'user 13/10: 8 s less 30%');
  const goal = content.economy.goalTier;
  const finishOne = (run: Run) => {
    run.s.board[0] = { t: goal - 1, r: 0 };
    run.s.board[1] = { t: goal - 1, r: 0 };
    run.s.units = 300;
    assert.ok(run.merge(0, 1)!.finished);
  };
  const main = fresh('main');
  const timed = fresh('speedrun');
  assert.equal(main.endless, false);
  const before = main.starValue();
  // Past the denser opening stretch, so both use the base range.
  main.s.time = timed.s.time = 9999;
  finishOne(main);
  finishOne(timed);
  assert.equal(main.endless, true);
  assert.equal(timed.endless, false, 'a timed run never turns endless');
  assert.equal(main.s.endlessUnits, 300);
  assert.ok(Math.abs(main.starValue() / main.activeIncome() - 2 * st.seconds) < 1e-9, 'endless star: twice the value');
  assert.ok(Math.abs(timed.starValue() / timed.activeIncome() - st.seconds) < 1e-9);
  assert.ok(before > 0);
  // Star waits: the same range everywhere (user 13/10: 4 to 8 s), no Star Magnet here.
  const waits = (run: Run) => {
    const out: number[] = [];
    for (let i = 0; i < 200; i++) {
      run.s.starTimer = -0.01;
      run.update(0.02);
      out.push(run.s.starTimer);
    }
    return out;
  };
  for (const run of [main, timed]) for (const w of waits(run)) assert.ok(w >= st.everyMin - 0.1 && w <= st.everyMax, `wait ${w}`);
  // Scan price: 100 scans after the Galaxy move the price as far as 25 would in a timed run (endlessGrowth 0.25).
  assert.equal(content.economy.scan.endlessGrowth, 0.25);
  timed.s.units = 325;
  const timedAt350 = timed.scanCost();
  main.s.units = 400;
  assert.equal(main.scanCost(), timedAt350);
  // Saves from before endlessUnits: the slower climb starts where the save is.
  const old = newRunState(content, 'main', 3);
  old.finishedAt = 100;
  old.units = 500;
  assert.equal(new Run(content, old, { found: {} }).s.endlessUnits, 500);
});

test('Lean Optics: 8 levels before the Galaxy, 11 after', () => {
  const run = fresh();
  const u = run.upgrade('discount');
  assert.equal(u.max, 11);
  assert.equal(run.levelCap(u), 8);
  run.s.highestTier = content.economy.goalTier;
  assert.equal(run.levelCap(u), 11);
});

test('star waves: every 4 to 8 s, sometimes two stars, each caught once', () => {
  const st = content.economy.stars;
  assert.equal(st.everyMin, 4);
  assert.equal(st.everyMax, 8);
  assert.equal(st.doubleChance, 0.2);
  const run = fresh('speedrun', 9);
  run.s.time = 9999;
  let waves = 0;
  let doubles = 0;
  for (let i = 0; i < 60000 && waves < 300; i++) {
    for (const ev of run.update(0.1)) {
      if (ev.kind !== 'star') continue;
      waves += 1;
      assert.ok(ev.stars.length === 1 || ev.stars.length === 2);
      if (ev.stars.length === 1) continue;
      doubles += 1;
      // Two stars: the next wave waits until both are caught (or the time is up).
      assert.ok(run.catchStar(1) > 0);
      assert.equal(run.catchStar(1), 0, 'caught once');
      assert.ok(run.starUp, 'the other star is still up');
      assert.ok(run.catchStar() > 0);
      assert.equal(run.starUp, false);
      assert.ok(run.s.starTimer >= st.everyMin - 1e-9);
    }
  }
  assert.equal(waves, 300);
  assert.ok(doubles > 30 && doubles < 95, `${doubles} double waves of 300`);
  // A golden star is worth goldenMult times a plain one.
  assert.ok(Math.abs(run.starValue(true) / run.starValue(false) - st.goldenMult) < 1e-9);
  // Older saves: a star up with no wave list is one star.
  const old = fresh();
  old.s.starTimer = -3;
  old.s.starGolden = true;
  delete old.s.wave;
  assert.equal(old.starWave.length, 1);
  assert.ok(Math.abs(old.catchStar() / old.starValue(false) - st.goldenMult) < 1e-9);
  assert.equal(old.starUp, false);
});

test('board value (user 13/10): tiers closer together, Gas Giant as before, low tiers worth more, high less', () => {
  const e = content.economy;
  assert.equal(e.tierValueGrowth, 2.5);
  const run = fresh();
  const before = (t: number) => 0.5 * 3 ** (t - 1); // growth 3, half value (earlier on 13/10)
  const now = (t: number) => run.bodyValue({ t, r: 0 });
  assert.ok(Math.abs(now(7) / before(7) - 1) < 0.01, 'Gas Giant unchanged');
  for (let t = 1; t < 7; t++) assert.ok(now(t) > before(t), `tier ${t} worth more`);
  for (let t = 8; t <= 10; t++) assert.ok(now(t) < before(t), `tier ${t} worth less`);
  for (let t = 2; t <= 10; t++) assert.ok(now(t) > 2 * now(t - 1), 'a merge still adds power (two bodies make one worth more than both)');
  run.s.board[0] = { t: 3, r: 1 };
  (run as any).powerCache = null;
  assert.ok(Math.abs(run.power() - (1 + run.bodyValue({ t: 3, r: 1 }))) < 1e-9, 'the empty-board 1 stays');
});

test('Stellar Luck and Gravity Lens (user 13/10): big steps first, then smaller and smaller', () => {
  const luck = content.upgrades.find((u) => u.id === 'luck')!;
  const steps = luck.values!.map((v, i) => v - (i ? luck.values![i - 1] : 1));
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i] < steps[i - 1], `luck step ${i + 1}`);
  assert.equal(luck.values!.at(-1), 3, 'same top as before: +200% weight for Rare and up');
  const rows = content.economy.scan.tierOdds;
  const moved = rows.map((row) => 1 - row[0]);
  for (let i = 2; i < moved.length; i++) assert.ok(moved[i] - moved[i - 1] < moved[i - 1] - moved[i - 2] + 1e-9, `lens step ${i}`);
  assert.deepEqual(rows.at(-1), [0.4, 0.3, 0.2, 0.1], 'same last row as before');
});
