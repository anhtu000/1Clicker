// Decorations (CLAUDE.md 4b item 10): backgrounds, planets and ships bought with crystals and placed
// freely on the backdrop, never over the game. Pure logic, shared with the tests.
import { contentChecker } from '../../core/content.ts';

export interface DecorItemDef {
  id: string;
  kind: 'planet' | 'ship';
  price: number;
}

export interface DecorDef {
  backgrounds: { id: string; price: number }[];
  items: DecorItemDef[];
  /** Most items on screen at once. */
  maxShown: number;
  /** Size of an item on screen, in design units. */
  itemSize: number;
  /** Rewarded ad in the decor shop: crystals per ad, and the wait between two. */
  ad: { crystals: number; cooldownSec: number };
}

/** Position as a share of the screen (0-1), kept per orientation so phone and desktop layouts each have their own. */
export type DecorPos = [number, number];

export interface DecorState {
  /** Background in use. */
  bg: string;
  /** Backgrounds and items bought. */
  owned: string[];
  /** Items on screen, in the order they were put there. */
  shown: string[];
  /** l: landscape, p: portrait. */
  pos: Record<string, { l?: DecorPos; p?: DecorPos }>;
}

export const newDecorState = (): DecorState => ({ bg: 'nebula', owned: ['nebula'], shown: [], pos: {} });

export function checkDecor(raw: any): DecorDef {
  const check = contentChecker('src/content/decor.json');
  const backgrounds = raw?.backgrounds ?? [];
  const items = raw?.items ?? [];
  check.need(backgrounds.length >= 1 && backgrounds[0]?.price === 0, 'decor.backgrounds: the first one is the free default (price 0)');
  check.uniqueIds([...backgrounds, ...items], 'decor');
  items.forEach((it: DecorItemDef) => {
    check.need(it.kind === 'planet' || it.kind === 'ship', `decor ${it.id}: kind must be planet or ship`);
    check.positive(it.price, `decor ${it.id}: price`);
  });
  check.positive(raw?.maxShown, 'decor.maxShown');
  check.positive(raw?.itemSize, 'decor.itemSize');
  check.positive(raw?.ad?.crystals, 'decor.ad.crystals');
  check.positive(raw?.ad?.cooldownSec, 'decor.ad.cooldownSec');
  check.done();
  return raw as DecorDef;
}

export function priceOf(def: DecorDef, id: string): number | null {
  return def.backgrounds.find((b) => b.id === id)?.price ?? def.items.find((i) => i.id === id)?.price ?? null;
}

/** Buys a background or an item. Returns the crystals left, or null when it cannot be bought. */
export function buyDecor(def: DecorDef, state: DecorState, crystals: number, id: string): number | null {
  const price = priceOf(def, id);
  if (price === null || state.owned.includes(id) || crystals < price) return null;
  state.owned.push(id);
  return crystals - price;
}

// ---------- placement ----------

/** Axis-aligned box, by its top-left corner. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Box of an item centered on (x, y), with a small gap around it. */
export const itemBox = (x: number, y: number, size: number, gap = 6): Rect => ({ x: x - size / 2 - gap, y: y - size / 2 - gap, w: size + gap * 2, h: size + gap * 2 });

/** An item centered on (x, y) is on screen and clear of the game and of the other items. */
export function fits(x: number, y: number, size: number, blocked: Rect[], others: Rect[], screen: { width: number; height: number }): boolean {
  const box = itemBox(x, y, size);
  if (box.x < 0 || box.y < 0 || box.x + box.w > screen.width || box.y + box.h > screen.height) return false;
  return !blocked.some((r) => overlaps(box, r)) && !others.some((r) => overlaps(box, r));
}

/** Nearest free spot to (x, y) on a coarse grid, or null when the screen has no room left. */
export function freeSpot(x: number, y: number, size: number, blocked: Rect[], others: Rect[], screen: { width: number; height: number }): { x: number; y: number } | null {
  if (fits(x, y, size, blocked, others, screen)) return { x, y };
  const step = Math.max(8, Math.round(size / 4));
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let gy = size / 2 + 6; gy <= screen.height - size / 2 - 6; gy += step) {
    for (let gx = size / 2 + 6; gx <= screen.width - size / 2 - 6; gx += step) {
      const d = (gx - x) ** 2 + (gy - y) ** 2;
      if (d < bestD && fits(gx, gy, size, blocked, others, screen)) {
        bestD = d;
        best = { x: gx, y: gy };
      }
    }
  }
  return best;
}
