// Key-value storage with the same shape as localStorage.
// Portals that offer cloud saves (CrazyGames data module) plug in behind this interface.
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * localStorage wrapped in try/catch, as the portals require.
 * localStorage throws in some iframes, in private mode and when the quota is full.
 * In those cases values live in memory for the session, so the game still runs.
 */
export function createLocalStorage(): KeyValueStorage {
  const memory = new Map<string, string>();
  let ls: Storage | null = null;
  try {
    ls = window.localStorage;
    ls.setItem('__probe__', '1');
    ls.removeItem('__probe__');
  } catch {
    ls = null;
    console.warn('[storage] localStorage unavailable, progress lasts only this session');
  }

  return {
    getItem(key) {
      try {
        const value = ls?.getItem(key);
        if (value != null) return value;
      } catch {
        // fall through to memory
      }
      return memory.get(key) ?? null;
    },
    setItem(key, value) {
      memory.set(key, value);
      try {
        ls?.setItem(key, value);
      } catch {
        // quota full or blocked: the memory copy still works this session
      }
    },
    removeItem(key) {
      memory.delete(key);
      try {
        ls?.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}
