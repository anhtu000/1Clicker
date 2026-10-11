// Helpers for content stored as JSON (CLAUDE.md 4.6): items, upgrades, pets, decorations, events.
// Pure TypeScript, no Phaser, so balance scripts in Node can load the same files.
//
//   const check = contentChecker('upgrades.json');
//   check.uniqueIds(upgrades, 'upgrade');
//   for (const u of upgrades) check.positive(u.cost, `upgrade ${u.id}: cost`);
//   check.done(); // throws one error listing every problem

export interface ContentChecker {
  /** Records `message` when `ok` is falsy. */
  need(ok: unknown, message: string): void;
  /** A finite number above 0. */
  positive(value: unknown, what: string): void;
  /** Every item has a string id, and no id appears twice. */
  uniqueIds(items: readonly { id?: unknown }[], what: string): void;
  /** `id` is one of `known`, for references between files (show.upgrade, unlock.item ...). */
  ref(id: unknown, known: Iterable<string>, what: string): void;
  readonly errors: readonly string[];
  /** Throws if any check failed. */
  done(): void;
}

export function contentChecker(source: string): ContentChecker {
  const errors: string[] = [];
  const need = (ok: unknown, message: string) => {
    if (!ok) errors.push(message);
  };
  return {
    errors,
    need,
    positive: (value, what) => need(typeof value === 'number' && Number.isFinite(value) && value > 0, `${what} must be a number above 0 (got ${JSON.stringify(value)})`),
    uniqueIds(items, what) {
      const seen = new Set<string>();
      items.forEach((item, i) => {
        const id = item?.id;
        if (typeof id !== 'string' || !id) errors.push(`${what} #${i + 1} has no id`);
        else if (seen.has(id)) errors.push(`${what} id "${id}" is used twice`);
        else seen.add(id);
      });
    },
    ref(id, known, what) {
      const set = known instanceof Set ? (known as Set<string>) : new Set(known);
      need(typeof id === 'string' && set.has(id), `${what} points to "${String(id)}", which does not exist`);
    },
    done() {
      if (errors.length) throw new Error(`Content errors in ${source}:\n- ${errors.join('\n- ')}`);
    },
  };
}

/** Lookup by id that fails loudly on a typo instead of returning undefined. */
export function indexById<T extends { id: string }>(items: readonly T[], what = 'item'): (id: string) => T {
  const map = new Map(items.map((item) => [item.id, item]));
  return (id) => {
    const item = map.get(id);
    if (!item) throw new Error(`Unknown ${what} "${id}"`);
    return item;
  };
}
