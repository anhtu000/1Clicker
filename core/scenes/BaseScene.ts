import Phaser from 'phaser';
import { app } from '../app';
import type { ViewportInfo } from '../viewport';

export interface BaseSceneOptions {
  /** True for scenes where the player is playing. Sends gameplayStart/Stop to the portal. */
  gameplay?: boolean;
}

function forEachText(list: Phaser.GameObjects.GameObject[], fn: (t: Phaser.GameObjects.Text) => void) {
  for (const obj of list) {
    if (obj instanceof Phaser.GameObjects.Text) fn(obj);
    else if (obj instanceof Phaser.GameObjects.Container) forEachText(obj.list, fn);
  }
}

/**
 * Base for every scene. Handles screen size, sharp text, and portal gameplay events.
 *
 * Write a scene like this:
 *   build(data)  create objects once (positions do not matter yet)
 *   layout(vp)   place objects for the current screen. Runs after build and on every resize or rotation.
 *   update(time, delta)  per-frame logic. Always scale movement by delta (ms), never by frame count.
 */
export abstract class BaseScene extends Phaser.Scene {
  /** Current screen in design units. Same object that layout() receives. */
  vp!: ViewportInfo;

  constructor(
    key: string,
    private baseOptions: BaseSceneOptions = {},
  ) {
    super({ key });
  }

  protected abstract build(data?: unknown): void;
  protected abstract layout(vp: ViewportInfo): void;

  create(data?: unknown) {
    this.vp = app.viewport.info;
    app.viewport.applyTo(this.cameras.main);

    // Every text gets the screen's resolution, including ones created later.
    const onAdded = (obj: Phaser.GameObjects.GameObject) => {
      if (obj instanceof Phaser.GameObjects.Text) obj.setResolution(app.textResolution);
    };
    this.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, onAdded);

    const offResize = app.viewport.on('change', (vp) => {
      this.vp = vp;
      app.viewport.applyTo(this.cameras.main);
      const res = app.textResolution;
      forEachText(this.children.list, (t) => {
        if (t.style.resolution !== res) t.setResolution(res);
      });
      this.layout(vp);
    });
    const offLang = app.on('language', () => this.onLanguageChange());

    const onPause = () => app.gameplay.stop();
    const onResume = () => app.gameplay.start();
    if (this.baseOptions.gameplay) {
      app.gameplay.start();
      this.events.on(Phaser.Scenes.Events.PAUSE, onPause);
      this.events.on(Phaser.Scenes.Events.RESUME, onResume);
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, onAdded);
      this.events.off(Phaser.Scenes.Events.PAUSE, onPause);
      this.events.off(Phaser.Scenes.Events.RESUME, onResume);
      offResize();
      offLang();
      if (this.baseOptions.gameplay) app.gameplay.stop();
    });

    this.build(data);
    this.layout(this.vp);
  }

  /** Default: rebuild the scene so every string is in the new language. */
  protected onLanguageChange() {
    if (this.scene.isActive()) this.scene.restart();
  }

  /** Text with the theme font. Sizes are in design units. */
  protected text(x: number, y: number, value: string, size = 36, color = app.theme.text, weight: '700' | '900' = '900') {
    return this.add.text(x, y, value, {
      fontFamily: app.theme.font,
      fontStyle: weight,
      fontSize: size,
      color,
      resolution: app.textResolution,
    });
  }
}
