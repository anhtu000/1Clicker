// Small typed event emitter for core services that live outside Phaser scenes.
type Listener = (...args: any[]) => void;

export class Emitter<Events extends Record<string, unknown[]>> {
  private listeners = new Map<keyof Events, Set<Listener>>();

  /** Subscribe. Returns a function that removes the listener. */
  on<K extends keyof Events>(event: K, fn: (...args: Events[K]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(fn as Listener);
    return () => this.off(event, fn);
  }

  off<K extends keyof Events>(event: K, fn: (...args: Events[K]) => void): void {
    this.listeners.get(event)?.delete(fn as Listener);
  }

  protected emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    for (const fn of [...(this.listeners.get(event) ?? [])]) fn(...args);
  }
}
