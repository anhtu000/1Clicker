import type { KeyValueStorage } from './storage';

export interface SaveOptions<T> {
  /** Storage key, for example "clicker.save". */
  key: string;
  /** Bump when the shape of T changes, and handle the old shape in migrate. */
  version: number;
  /** Fresh data for a new player. Called again on reset. */
  defaults: () => T;
  /** Turns data saved by an older version into the current shape. */
  migrate?: (old: any, fromVersion: number) => T;
}

interface Envelope<T> {
  v: number;
  /** Date.now() when written. Used for offline income. */
  t: number;
  data: T;
}

/**
 * Game progress with autosave. Game code reads and changes save.data directly:
 *   save.data.coins += 10;
 * The autosave timer writes it when it has changed (see startAutosave in app.ts).
 * It also writes when the tab is hidden or closed, and before an ad.
 */
export class SaveStore<T extends object> {
  data: T;
  /** When the previous session last saved (ms). 0 for a new player. */
  lastSavedAt = 0;
  /** True when this player had no save. Good moment for a first-time hint. */
  isNewPlayer = true;

  private storage: KeyValueStorage | null = null;
  /** JSON of data at the last write, to skip writes when nothing changed. */
  private lastDataJson = '';

  constructor(private options: SaveOptions<T>) {
    this.data = options.defaults();
  }

  /** Called once by the framework after the portal SDK is ready. */
  load(storage: KeyValueStorage) {
    this.storage = storage;
    let raw: string | null = null;
    try {
      raw = storage.getItem(this.options.key);
    } catch (err) {
      console.warn('[save] read failed:', err);
    }
    if (!raw) return;

    try {
      const env = JSON.parse(raw) as Envelope<unknown>;
      let data: T;
      if (env.v === this.options.version) data = env.data as T;
      else if (env.v < this.options.version && this.options.migrate) data = this.options.migrate(env.data, env.v);
      else throw new Error(`save version ${env.v}, game expects ${this.options.version}`);
      // Fields added in a newer version get their default value.
      this.data = { ...this.options.defaults(), ...data };
      this.lastSavedAt = env.t ?? 0;
      this.isNewPlayer = false;
      this.lastDataJson = JSON.stringify(this.data);
    } catch (err) {
      // Keep the bad save under another key so it is not lost, then start fresh.
      console.error('[save] could not read save, starting fresh:', err);
      try {
        storage.setItem(this.options.key + '.broken', raw);
      } catch {
        // ignore
      }
    }
  }

  /**
   * Writes now if anything changed. Safe to call often.
   * force writes even without changes, to refresh the timestamp used for offline income.
   */
  flush(force = false): boolean {
    if (!this.storage) return false;
    const dataJson = JSON.stringify(this.data);
    if (!force && dataJson === this.lastDataJson) return false;
    const env: Envelope<T> = { v: this.options.version, t: Date.now(), data: this.data };
    try {
      this.storage.setItem(this.options.key, JSON.stringify(env));
      this.lastDataJson = dataJson;
      return true;
    } catch (err) {
      console.warn('[save] write failed:', err);
      return false;
    }
  }

  /** Wipes progress. Used by a "reset progress" button and in tests. */
  reset() {
    this.data = this.options.defaults();
    this.isNewPlayer = true;
    this.lastSavedAt = 0;
    this.lastDataJson = '';
    this.flush();
  }
}
