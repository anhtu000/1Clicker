import Phaser from 'phaser';
import { Emitter } from './emitter';

/**
 * Screen layout in "design units".
 *
 * The game always gets a safe area of 1280x720 units (landscape) or 720x1280 units (portrait),
 * scaled as large as it fits. The longer side of the screen adds extra room beyond it.
 * Put important UI inside `safe`, and stretch backgrounds to `width` x `height`.
 *
 * The canvas renders at the real device resolution (CSS pixels x devicePixelRatio, capped),
 * and each scene camera zooms by `scale`. This keeps text and shapes sharp on every screen,
 * from a 1x desktop monitor to a 3x phone.
 */
export interface ViewportInfo {
  /** Visible area in design units. */
  width: number;
  height: number;
  portrait: boolean;
  /** Centered 1280x720 (or 720x1280) rectangle that is always fully visible. */
  safe: Phaser.Geom.Rectangle;
  /** Canvas pixels per design unit. Also the camera zoom. */
  scale: number;
  /** Device pixel ratio actually used (capped). */
  dpr: number;
  /** Size of the game area in CSS pixels. */
  cssWidth: number;
  cssHeight: number;
}

export interface ViewportOptions {
  /** Long and short side of the safe area. Default 1280 x 720 (16:9). */
  long?: number;
  short?: number;
  /** Higher DPR costs GPU fill rate on cheap phones. 2 is a good balance. */
  maxDpr?: number;
}

export class Viewport extends Emitter<{ change: [info: ViewportInfo] }> {
  info: ViewportInfo;
  private game: Phaser.Game | null = null;
  private long: number;
  private short: number;
  private maxDpr: number;
  private pending = false;

  constructor(
    private parent: HTMLElement,
    options: ViewportOptions = {},
  ) {
    super();
    this.long = options.long ?? 1280;
    this.short = options.short ?? 720;
    this.maxDpr = options.maxDpr ?? 2;
    this.info = this.measure();
  }

  /** Phaser scale config for the first frame. */
  scaleConfig(): Phaser.Types.Core.ScaleConfig {
    const { cssWidth, cssHeight, dpr } = this.info;
    return {
      mode: Phaser.Scale.NONE,
      parent: this.parent,
      width: Math.round(cssWidth * dpr),
      height: Math.round(cssHeight * dpr),
      zoom: 1 / dpr,
      autoCenter: Phaser.Scale.NO_CENTER,
    };
  }

  /** Highest device pixel ratio the canvas renders at. Lower it when the GPU cannot keep up. */
  get dprCap() {
    return this.maxDpr;
  }

  /** Changes the resolution cap and resizes the canvas right away (scenes get a 'change' event). */
  setMaxDpr(value: number) {
    this.maxDpr = value;
    if (this.game) this.update();
    else this.info = this.measure();
  }

  attach(game: Phaser.Game) {
    this.game = game;
    const schedule = () => {
      if (this.pending) return;
      this.pending = true;
      requestAnimationFrame(() => {
        this.pending = false;
        this.update();
      });
    };
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    new ResizeObserver(schedule).observe(this.parent);
    // Moving the window to a monitor with another DPR fires no resize event in some browsers.
    const watchDpr = () => {
      matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener(
        'change',
        () => {
          schedule();
          watchDpr();
        },
        { once: true },
      );
    };
    watchDpr();
  }

  /** Applies camera zoom so (0,0)-(width,height) in design units fills the screen. */
  applyTo(camera: Phaser.Cameras.Scene2D.Camera) {
    const { width, height, scale } = this.info;
    camera.setSize(this.game?.scale.width ?? width * scale, this.game?.scale.height ?? height * scale);
    camera.setZoom(scale);
    camera.centerOn(width / 2, height / 2);
  }

  private measure(): ViewportInfo {
    const rect = this.parent.getBoundingClientRect();
    const cssWidth = Math.max(1, Math.round(rect.width || window.innerWidth));
    const cssHeight = Math.max(1, Math.round(rect.height || window.innerHeight));
    const dpr = Math.min(this.maxDpr, Math.max(1, window.devicePixelRatio || 1));
    const portrait = cssHeight > cssWidth;
    const baseW = portrait ? this.short : this.long;
    const baseH = portrait ? this.long : this.short;
    const pxW = Math.round(cssWidth * dpr);
    const pxH = Math.round(cssHeight * dpr);
    const scale = Math.min(pxW / baseW, pxH / baseH);
    const width = pxW / scale;
    const height = pxH / scale;
    const safe = new Phaser.Geom.Rectangle((width - baseW) / 2, (height - baseH) / 2, baseW, baseH);
    return { width, height, portrait, safe, scale, dpr, cssWidth, cssHeight };
  }

  private update() {
    const next = this.measure();
    const prev = this.info;
    if (next.cssWidth === prev.cssWidth && next.cssHeight === prev.cssHeight && next.dpr === prev.dpr) return;
    this.info = next;
    const scale = this.game?.scale;
    if (scale) {
      scale.zoom = 1 / next.dpr;
      scale.resize(Math.round(next.cssWidth * next.dpr), Math.round(next.cssHeight * next.dpr));
    }
    this.emit('change', next);
  }
}
