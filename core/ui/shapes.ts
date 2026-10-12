import Phaser from 'phaser';
import { app } from '../app';

// Static vector shapes drawn once into a texture, then shown as plain images.
//
// Why: in WebGL Phaser rebuilds every Graphics object every frame (each rounded corner and circle
// becomes dozens of points that are triangulated again). On a mid-range phone that alone took the
// game to about 20 fps (measured 12/10: Graphics were three quarters of the frame time). An image
// costs almost nothing to draw. Use Graphics only for shapes that change every frame.

const ids = new WeakMap<object, number>();
let nextId = 1;

/** A stable short id for a drawing function, so textures drawn by it can be cached by key. */
export function drawId(fn: object): number {
  let id = ids.get(fn);
  if (id === undefined) {
    id = nextId++;
    ids.set(fn, id);
  }
  return id;
}

/** Pixels per design unit for baked shapes: sharp at the current screen scale, never below 1. */
export function shapeResolution(): number {
  return Phaser.Math.Clamp(Math.ceil(app.viewport.info.scale * 2) / 2, 1, 3);
}

/**
 * Texture of a shape `w` x `h` design units (plus `pad` on each side for strokes and shadows).
 * `draw` gets a Graphics whose (0, 0) is the center of the shape, so the same drawing code works
 * here and on a live Graphics. Cached under `key`; the texture's pixel size includes the resolution.
 * Show it with shapeImage() or set the scale to 1 / res yourself.
 */
export function shapeTexture(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void, pad = 4) {
  const res = shapeResolution();
  const full = `shape:${key}@${res}`;
  if (!scene.textures.exists(full)) {
    const g = scene.make.graphics({}, false);
    g.translateCanvas((w / 2 + pad) * res, (h / 2 + pad) * res);
    g.scaleCanvas(res, res);
    draw(g);
    g.generateTexture(full, Math.ceil((w + pad * 2) * res), Math.ceil((h + pad * 2) * res));
    g.destroy();
  }
  return { key: full, res };
}

/** Sets an image to a baked shape (centered on the image's position). Returns the image. */
export function setShape(
  image: Phaser.GameObjects.Image,
  key: string,
  w: number,
  h: number,
  draw: (g: Phaser.GameObjects.Graphics) => void,
  pad = 4,
) {
  const t = shapeTexture(image.scene, key, w, h, draw, pad);
  if (image.texture.key !== t.key) image.setTexture(t.key);
  return image.setScale(1 / t.res);
}

/** New image showing a baked shape, added to the scene (adding it to a container moves it there). */
export function shapeImage(scene: Phaser.Scene, x: number, y: number, key: string, w: number, h: number, draw: (g: Phaser.GameObjects.Graphics) => void, pad = 4) {
  const t = shapeTexture(scene, key, w, h, draw, pad);
  return scene.add.image(x, y, t.key).setScale(1 / t.res);
}
