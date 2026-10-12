// On-screen debug info for phone testing. Open the game with ?debug in the URL.
// Shows frame rate, screen numbers, platform, language and save size.

interface DebugSource {
  game: unknown;
  viewport: {
    info: { width: number; height: number; scale: number; dpr: number; cssWidth: number; cssHeight: number; portrait: boolean };
    dprCap: number;
    setMaxDpr(value: number): void;
  };
  quality: { state: string; lastMs: number; cycle(): void } | null;
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
  /**
   * Frames the game actually drew per second, and the slowest gap between two of them in the last
   * second. Phaser's own fps counts every browser tick, also the ones its 120 Hz cap skips, so on a
   * phone it can say 118 while 60 frames are drawn.
   */
  private drawn = 0;
  private drawnRate = 0;
  private lastDraw = 0;
  private worstGap = 0;
  private shownGap = 0;
  private drawnSince = performance.now();
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
      'position:fixed;left:6px;bottom:6px;z-index:9998;white-space:pre;cursor:pointer;' +
      'font:12px/1.35 ui-monospace,monospace;color:#0f0;background:rgba(0,0,0,.65);padding:6px 8px;border-radius:6px';
    document.body.append(this.box);
    // Tap the box: next lower canvas resolution (wraps around), to test what the GPU can hold.
    this.box.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (app.quality) app.quality.cycle();
      else {
        const levels = [2, 1.5, 1.25, 1];
        const i = levels.findIndex((v) => v < app.viewport.dprCap - 0.01);
        app.viewport.setMaxDpr(i < 0 ? levels[0] : levels[i]);
      }
      this.render();
    });
    this.gpu = gpuName(app.game);
    this.timer = setInterval(() => this.render(), 250);
    // Low frame rate: these two lines tell whether the game or the browser is the limit.
    //   game ms near or above 16 -> the game's own work is too heavy for this device.
    //   game ms small, browser low (30 or 60) -> the browser or page is capping frames (power saving, embedded page, 60 Hz policy).
    //   game ms small, browser 60 or 120, fps drawn well below it -> drawing (GPU) is the limit. On 120 Hz phones the game draws 60 on purpose.
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
  private gpu = '';

  /** Times the game's frame callback. Called again on each refresh: Phaser sets the callback only once it has booted. */
  private hook() {
    const loop = (this.app.game as unknown as { loop: { callback?: (time: number, delta: number) => void } }).loop;
    if (!loop?.callback || loop.callback === this.wrapped) return;
    this.loop = loop;
    const original = (this.original = loop.callback);
    this.wrapped = (time, delta) => {
      const start = performance.now();
      original(time, delta);
      const end = performance.now();
      this.jsMs = this.jsMs * 0.9 + (end - start) * 0.1;
      if (this.lastDraw) this.worstGap = Math.max(this.worstGap, start - this.lastDraw);
      this.lastDraw = start;
      this.drawn += 1;
      if (end - this.drawnSince >= 1000) {
        this.drawnRate = (this.drawn * 1000) / (end - this.drawnSince);
        this.shownGap = this.worstGap;
        this.drawn = 0;
        this.worstGap = 0;
        this.drawnSince = end;
      }
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
      `fps ${this.drawnRate.toFixed(0)} drawn  slowest gap ${this.shownGap.toFixed(0)}ms`,
      `game ${this.jsMs.toFixed(1)}ms/frame  browser ${this.rafRate.toFixed(0)}/s`,
      `css ${v.cssWidth}x${v.cssHeight}  dpr ${v.dpr}  ${v.portrait ? 'portrait' : 'landscape'}`,
      `render cap ${a.viewport.dprCap}  ${a.quality ? `auto ${a.quality.state} ${a.quality.lastMs.toFixed(1)}ms` : 'fixed'}  (tap: lower)`,
      `gpu ${this.gpu}`,
      `units ${v.width.toFixed(0)}x${v.height.toFixed(0)}  scale ${v.scale.toFixed(3)}  textRes ${a.textResolution}`,
      `platform ${a.platform.id}  lang ${a.i18n.lang}`,
      `paused ${a.pause.paused}  gameplay ${a.gameplay.isActive}  ad ${a.ads.lastOutcome ?? '-'}`,
      `save ${JSON.stringify(a.save.data).length} bytes`,
      ...Object.entries(DebugOverlay.extra).map(([k, val]) => `${k} ${val}`),
    ];
    this.box.textContent = lines.join('\n');
  }
}

/** Name of the graphics chip, when the browser tells it (helps read phone test results). */
function gpuName(game: unknown): string {
  try {
    const gl = (game as { renderer?: { gl?: WebGLRenderingContext } }).renderer?.gl;
    if (!gl) return 'canvas';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return String(name).slice(0, 40);
  } catch {
    return '?';
  }
}
