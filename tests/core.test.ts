// Unit tests for pure helpers. Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatClock, formatCountdown, formatDuration, formatNumber } from '../core/format.ts';
import { claimDaily, dailyStatus, FixedStep, secondsAway } from '../core/time.ts';
import { contentChecker, indexById } from '../core/content.ts';
import { pickWeighted, pityLeft, rarityOdds, Rng, rollRarity } from '../core/rng.ts';

test('formatNumber uses K/M/B/T with 3 significant digits', () => {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(999), '999');
  assert.equal(formatNumber(999.9), '999');
  assert.equal(formatNumber(1000), '1.00K');
  assert.equal(formatNumber(1234), '1.23K');
  assert.equal(formatNumber(12345), '12.3K');
  assert.equal(formatNumber(123456), '123K');
  assert.equal(formatNumber(999999), '999K');
  assert.equal(formatNumber(1e6), '1.00M');
  assert.equal(formatNumber(1.5e9), '1.50B');
  assert.equal(formatNumber(2e12), '2.00T');
  assert.equal(formatNumber(1e15), '1.00aa');
  assert.equal(formatNumber(1e18), '1.00ab');
  assert.equal(formatNumber(-1234), '-1.23K');
  assert.equal(formatNumber(2.5, 1), '2.5');
  assert.equal(formatNumber(2, 1), '2');
});

test('formatDuration, formatClock and formatCountdown', () => {
  assert.equal(formatDuration(45), '45s');
  assert.equal(formatDuration(200), '3m 20s');
  assert.equal(formatDuration(3900), '1h 05m');
  assert.equal(formatDuration(90000), '1d 1h');
  assert.equal(formatClock(75.4), '1:15.40');
  assert.equal(formatClock(3725), '1:02:05.00');
  assert.equal(formatCountdown(151), '2:31');
  assert.equal(formatCountdown(8.2), '0:09');
  assert.equal(formatCountdown(-3), '0:00');
});

test('secondsAway is capped and ignores clock going backwards', () => {
  assert.equal(secondsAway(0, 10_000), 0);
  assert.equal(secondsAway(10_000, 70_000), 60);
  assert.equal(secondsAway(70_000, 10_000), 0);
  assert.equal(secondsAway(1, 1 + 100 * 3600 * 1000, 8 * 3600), 8 * 3600);
});

test('daily reward streak', () => {
  let state = { lastClaim: null as string | null, streak: 0 };
  assert.deepEqual(dailyStatus(state, '2026-10-12'), { canClaim: true, streak: 1 });
  state = claimDaily(state, '2026-10-12');
  assert.deepEqual(dailyStatus(state, '2026-10-12'), { canClaim: false, streak: 1 });
  state = claimDaily(state, '2026-10-13');
  assert.equal(state.streak, 2);
  // Month and year boundaries count as consecutive days.
  assert.equal(dailyStatus({ lastClaim: '2026-10-31', streak: 5 }, '2026-11-01').streak, 6);
  assert.equal(dailyStatus({ lastClaim: '2026-12-31', streak: 5 }, '2027-01-01').streak, 6);
  // A missed day resets the streak.
  assert.equal(dailyStatus({ lastClaim: '2026-10-12', streak: 5 }, '2026-10-14').streak, 1);
});

test('FixedStep gives the same total at any frame rate', () => {
  for (const frameMs of [1000 / 30, 1000 / 60, 1000 / 144, 1000 / 165]) {
    let total = 0;
    const step = new FixedStep(100, (sec) => (total += sec));
    for (let t = 0; t < 10_000; t += frameMs) step.update(frameMs);
    // At most one 0.1 s step can still be waiting in the accumulator.
    assert.ok(Math.abs(total - 10) < 0.11, `${frameMs.toFixed(2)} ms frames gave ${total}`);
  }
});

test('Rng is repeatable from a saved state', () => {
  const a = new Rng(42);
  a.next();
  a.next();
  const saved = a.state;
  const first = [a.next(), a.next(), a.next()];
  const b = new Rng(1);
  b.state = saved;
  assert.deepEqual([b.next(), b.next(), b.next()], first);
  for (let i = 0; i < 1000; i++) {
    const n = a.int(3, 7);
    assert.ok(n >= 3 && n <= 7 && Number.isInteger(n));
  }
});

test('pickWeighted follows the weights', () => {
  const rng = new Rng(7);
  const counts = [0, 0, 0];
  for (let i = 0; i < 30_000; i++) counts[pickWeighted(rng, [6, 3, 1])] += 1;
  assert.ok(Math.abs(counts[0] / 30_000 - 0.6) < 0.02);
  assert.ok(Math.abs(counts[2] / 30_000 - 0.1) < 0.01);
  assert.equal(pickWeighted(rng, [0, 0, 5]), 2);
});

test('rarity odds, floor and pity', () => {
  const weights = [720, 200, 60, 18, 2];
  const odds = rarityOdds(weights);
  assert.ok(Math.abs(odds[0] - 0.72) < 1e-9);
  // Luck on rare tiers lowers common.
  assert.ok(rarityOdds(weights, { weightMult: (t) => (t > 0 ? 2 : 1) })[0] < 0.72);

  const rng = new Rng(3);
  const rules = [{ minTier: 2, within: 25 }];
  const state = [0];
  let sinceEpic = 0;
  let worst = 0;
  for (let i = 0; i < 5000; i++) {
    const r = rollRarity(rng, weights, rules, state);
    sinceEpic = r >= 2 ? 0 : sinceEpic + 1;
    worst = Math.max(worst, sinceEpic);
  }
  // Never more than 24 rolls in a row without Epic or better.
  assert.ok(worst <= 24, `went ${worst} rolls without epic`);
  assert.equal(pityLeft(rules, [10], 0), 15);
  // Floor keeps at least the given tier.
  for (let i = 0; i < 200; i++) assert.ok(rollRarity(rng, weights, [], [], { floor: 3 }) >= 3);
});

test('contentChecker lists every problem at once', () => {
  const check = contentChecker('test.json');
  check.uniqueIds([{ id: 'a' }, { id: 'a' }, {}], 'item');
  check.positive(0, 'item a: cost');
  check.ref('b', ['a'], 'item a: unlock');
  assert.equal(check.errors.length, 4);
  assert.throws(() => check.done(), /item id "a" is used twice[\s\S]*cost must be a number above 0/);
  const ok = contentChecker('ok.json');
  ok.uniqueIds([{ id: 'x' }], 'item');
  ok.done();
  const get = indexById([{ id: 'x', n: 1 }], 'item');
  assert.equal(get('x').n, 1);
  assert.throws(() => get('y'), /Unknown item "y"/);
});
