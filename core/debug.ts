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

  constructor(private app: DebugSource) {
    this.box = document.createElement('div');
    this.box.style.cssText =
      'position:fixed;left:6px;bottom:6px;z-index:9998;pointer-events:none;white-space:pre;' +
      'font:12px/1.35 ui-monospace,monospace;color:#0f0;background:rgba(0,0,0,.65);padding:6px 8px;border-radius:6px';
    document.body.append(this.box);
    this.timer = setInterval(() => this.render(), 250);
  }

  destroy() {
    clearInterval(this.timer);
    this.box.remove();
  }

  private render() {
    const a = this.app;
    const v = a.viewport.info;
    const lines = [
      `fps ${a.game.loop.actualFps.toFixed(0)}  delta ${a.game.loop.delta.toFixed(1)}ms`,
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
