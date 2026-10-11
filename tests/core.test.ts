// Unit tests for pure helpers. Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatClock, formatDuration, formatNumber } from '../core/format.ts';
import { claimDaily, dailyStatus, FixedStep, secondsAway } from '../core/time.ts';

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

test('formatDuration and formatClock', () => {
  assert.equal(formatDuration(45), '45s');
  assert.equal(formatDuration(200), '3m 20s');
  assert.equal(formatDuration(3900), '1h 05m');
  assert.equal(formatDuration(90000), '1d 1h');
  assert.equal(formatClock(75.4), '1:15.40');
  assert.equal(formatClock(3725), '1:02:05.00');
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
