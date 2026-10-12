// Tests for decorations: buying and placement. Run: npm test
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buyDecor, checkDecor, fits, freeSpot, itemBox, newDecorState, overlaps } from './decor.ts';

const def = checkDecor(JSON.parse(readFileSync(new URL('../content/decor.json', import.meta.url), 'utf8')));

test('decor content passes its checks', () => {
  assert.ok(def.items.length >= def.maxShown, 'enough items to fill the screen');
  assert.throws(() => checkDecor({ backgrounds: [{ id: 'a', price: 5 }], items: [] }), /Content errors/);
});

test('buying: costs crystals, once per id, not without enough', () => {
  const state = newDecorState();
  const item = def.items[0];
  assert.equal(buyDecor(def, state, item.price - 1, item.id), null);
  assert.equal(buyDecor(def, state, item.price + 3, item.id), 3);
  assert.ok(state.owned.includes(item.id));
  assert.equal(buyDecor(def, state, 999, item.id), null, 'already owned');
  assert.equal(buyDecor(def, state, 999, 'nope'), null);
});

test('placement: stays on screen, off the game, off other items', () => {
  const screen = { width: 1280, height: 720 };
  const board = { x: 400, y: 100, w: 520, h: 520 };
  const size = def.itemSize;
  assert.equal(fits(500, 300, size, [board], [], screen), false, 'on the board');
  assert.equal(fits(10, 300, size, [], [], screen), false, 'off the left edge');
  assert.ok(fits(1000, 660, size, [board], [], screen));
  const placed = [itemBox(1000, 660, size)];
  assert.equal(fits(1020, 660, size, [board], placed, screen), false, 'on another item');
  const spot = freeSpot(500, 300, size, [board], placed, screen)!;
  assert.ok(spot);
  assert.ok(!overlaps(itemBox(spot.x, spot.y, size, 0), board));
  // A screen with no room left.
  assert.equal(freeSpot(100, 100, size, [{ x: 0, y: 0, w: 1280, h: 720 }], [], screen), null);
});
