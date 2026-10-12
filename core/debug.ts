// On-screen debug info for phone testing. Open the game with ?debug in the URL.
// Shows frame rate, screen numbers, platform, language and save size.

interface DebugSource {
  game: { loop: { actualFps: number; delta: number } };
  viewport: { info: { width: number; height: number; scale: number; dpr: number; cssWidth: number; cssHeight: number; portrait: boolean } };
  platform: { id: string };
  i18n: { lang: string };
  pause: { paused: boolean };
  gameplay: { isActive: boolean };
  ads: { lastOutcome: string | null };
  save: { data: unknown };
  textResolution: number;
}

export class DebugOverlay {
  private box: HTMLDivElement;
  /** Extra lines a scene can set, for example measured speed. */
  static extra: Record<string, string> = {};

  private timer: ReturnType<typeof setInterval>;
  /** Game work per frame (update + building draw calls), smoothed. Drawing on the GPU is not in it. */
  private jsMs = 0;
  private loop: { callback?: (time: number, delta: number) => void } | null = null;
  private original: ((time: number, delta: number) => void) | null = null;
  /** Frames the browser itself offers per second (requestAnimationFrame), counted apart from the game. */
  private rafCount = 0;
  private rafRate = 0;
  private rafId = 0;
  private rafSince = performance.now();

  constructor(private app: DebugSource) {
    this.box = document.createElement('div');
    this.box.style.cssText =
      'position:fixed;left:6px;bottom:6px;z-index:9998;pointer-events:none;white-space:pre;' +
      'font:12px/1.35 ui-monospace,monospace;color:#0f0;background:rgba(0,0,0,.65);padding:6px 8px;border-radius:6px';
    document.body.append(this.box);
    this.timer = setInterval(() => this.render(), 250);
    // Low frame rate: these two lines tell whether the game or the browser is the limit.
    //   game ms near or above 16 -> the game's own work is too heavy for this device.
    //   game ms small, raf low (30) -> the browser or page is capping frames (power saving, embedded page).
    //   game ms small, raf 60, fps low -> drawing (GPU) is the limit.
    this.hook();
    const raf = () => {
      this.rafCount += 1;
      const now = performance.now();
      if (now - this.rafSince >= 1000) {
        this.rafRate = (this.rafCount * 1000) / (now - this.rafSince);
        this.rafCount = 0;
        this.rafSince = now;
      }
      this.rafId = requestAnimationFrame(raf);
    };
    this.rafId = requestAnimationFrame(raf);
  }

  private wrapped: ((time: number, delta: number) => void) | null = null;

  /** Times the game's frame callback. Called again on each refresh: Phaser sets the callback only once it has booted. */
  private hook() {
    const loop = (this.app.game as unknown as { loop: { callback?: (time: number, delta: number) => void } }).loop;
    if (!loop?.callback || loop.callback === this.wrapped) return;
    this.loop = loop;
    const original = (this.original = loop.callback);
    this.wrapped = (time, delta) => {
      const start = performance.now();
      original(time, delta);
      this.jsMs = this.jsMs * 0.9 + (performance.now() - start) * 0.1;
    };
    loop.callback = this.wrapped;
  }

  destroy() {
    clearInterval(this.timer);
    cancelAnimationFrame(this.rafId);
    if (this.loop && this.original) this.loop.callback = this.original;
    this.box.remove();
  }

  private render() {
    this.hook();
    const a = this.app;
    const v = a.viewport.info;
    const lines = [
      `fps ${a.game.loop.actualFps.toFixed(0)}  delta ${a.game.loop.delta.toFixed(1)}ms`,
      `game ${this.jsMs.toFixed(1)}ms/frame  raf ${this.rafRate.toFixed(0)}/s`,
      `css ${v.cssWidth}x${v.cssHeight}  dpr ${v.dpr}  ${v.portrait ? 'portrait' : 'landscape'}`,
      `units ${v.width.toFixed(0)}x${v.height.toFixed(0)}  scale ${v.scale.toFixed(3)}  textRes ${a.textResolution}`,
      `platform ${a.platform.id}  lang ${a.i18n.lang}`,
      `paused ${a.pause.paused}  gameplay ${a.gameplay.isActive}  ad ${a.ads.lastOutcome ?? '-'}`,
      `save ${JSON.stringify(a.save.data).length} bytes`,
      ...Object.entries(DebugOverlay.extra).map(([k, val]) => `${k} ${val}`),
    ];
    this.box.textContent = lines.join('\n');
  }
}
