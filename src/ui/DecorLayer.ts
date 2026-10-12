import Phaser from 'phaser';
import { app, Button } from '@core';
import { decor } from '../game/content';
import { fits, freeSpot, itemBox, type DecorPos, type Rect } from '../logic/decor.ts';
import { DECOR_TEX, ensureDecorTexture } from '../render/decor';
import { save } from '../save';

const DEPTH = 2;
const ARRANGE_DEPTH = 1250;

/**
 * Decorations on the backdrop (CLAUDE.md 4b item 10). They sit under the game and never cover it:
 * `blocked` gives the areas of the game and its buttons for the current layout.
 * Positions are kept per orientation as a share of the screen; one that no longer fits (a resize,
 * a new button) moves to the nearest free spot on screen without changing what was saved.
 */
export class DecorLayer {
  private scene: Phaser.Scene;
  private blocked: () => Rect[];
  private sprites = new Map<string, Phaser.GameObjects.Image>();
  /** Where each item sits now (world units), before its gentle drift. */
  private at = new Map<string, { x: number; y: number }>();
  private time = 0;
  private arrangeParts: Phaser.GameObjects.GameObject[] = [];
  private onArrangeDone: (() => void) | null = null;
  private hud: () => { x: number; y: number; w: number };
  arranging = false;
  /** Items dropped in a new place since arrange mode opened (the decor tutorial waits for one). */
  moves = 0;
  /** The game has been laid out at least once, so the blocked areas are real. */
  private laidOut = false;

  constructor(scene: Phaser.Scene, blocked: () => Rect[], hud: () => { x: number; y: number; w: number }) {
    this.scene = scene;
    this.blocked = blocked;
    this.hud = hud;
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this));
  }

  private get size() {
    return decor.itemSize;
  }

  private get orient(): 'l' | 'p' {
    return app.viewport.info.portrait ? 'p' : 'l';
  }

  /** Makes the sprites match what is shown, then places them. */
  sync() {
    const shown = save.data.decor.shown;
    for (const [id, img] of this.sprites) {
      if (!shown.includes(id)) {
        img.destroy();
        this.sprites.delete(id);
        this.at.delete(id);
      }
    }
    for (const id of shown) {
      if (this.sprites.has(id)) continue;
      const img = this.scene.add.image(0, 0, ensureDecorTexture(this.scene, id)).setDepth(this.arranging ? ARRANGE_DEPTH : DEPTH);
      img.setScale(this.size / DECOR_TEX);
      this.sprites.set(id, img);
      if (this.arranging) this.makeDraggable(id, img);
    }
    if (this.laidOut) this.layout();
  }

  /** Places every item for the current screen. Call after the game's own layout. */
  layout() {
    this.laidOut = true;
    const vp = app.viewport.info;
    const screen = { width: vp.width, height: vp.height };
    const blocked = this.blocked();
    const taken: Rect[] = [];
    for (const id of save.data.decor.shown) {
      const img = this.sprites.get(id);
      if (!img) continue;
      const saved = save.data.decor.pos[id]?.[this.orient];
      const want = saved ? { x: saved[0] * vp.width, y: saved[1] * vp.height } : { x: vp.width / 2, y: vp.height / 2 };
      const spot = freeSpot(want.x, want.y, this.size, blocked, taken, screen);
      if (!spot) {
        img.setVisible(false);
        this.at.delete(id);
        continue;
      }
      if (!saved) this.save(id, spot.x, spot.y);
      img.setVisible(true).setPosition(spot.x, spot.y);
      this.at.set(id, spot);
      taken.push(itemBox(spot.x, spot.y, this.size));
    }
    if (this.arranging) this.drawBlocked();
  }

  /** Puts an item on screen at the free spot nearest the middle. False when it cannot be shown. */
  show(id: string): boolean {
    const d = save.data.decor;
    if (d.shown.includes(id)) return true;
    if (d.shown.length >= decor.maxShown) return false;
    const vp = app.viewport.info;
    const taken = [...this.at.values()].map((p) => itemBox(p.x, p.y, this.size));
    const spot = freeSpot(vp.width / 2, vp.height / 2, this.size, this.blocked(), taken, { width: vp.width, height: vp.height });
    if (!spot) return false;
    d.shown.push(id);
    this.save(id, spot.x, spot.y);
    this.sync();
    return true;
  }

  hide(id: string) {
    const d = save.data.decor;
    d.shown = d.shown.filter((x) => x !== id);
    this.sync();
  }

  private save(id: string, x: number, y: number) {
    const vp = app.viewport.info;
    const pos: DecorPos = [Math.round((x / vp.width) * 1000) / 1000, Math.round((y / vp.height) * 1000) / 1000];
    const d = save.data.decor;
    d.pos[id] = { ...d.pos[id], [this.orient]: pos };
  }

  private tick(_t: number, delta: number) {
    this.time += delta / 1000;
    if (this.arranging) return;
    let i = 0;
    for (const [id, img] of this.sprites) {
      const p = this.at.get(id);
      i += 1;
      if (!p) continue;
      // A slow drift, each item on its own phase, so the backdrop feels alive without pulling the eye.
      img.y = p.y + Math.sin(this.time * 0.6 + i * 1.7) * 3;
      img.rotation = Math.sin(this.time * 0.3 + i) * 0.05;
    }
  }

  // ---------- arrange mode ----------

  /** Lets the player drag the items around. The game underneath is covered and does not take input. */
  arrange(onDone: () => void) {
    if (this.arranging) return;
    this.arranging = true;
    this.moves = 0;
    this.onArrangeDone = onDone;
    const scene = this.scene;
    const vp = app.viewport.info;
    const cover = scene.add.rectangle(0, 0, vp.width, vp.height, 0x000000, 0.35).setOrigin(0).setDepth(1200).setInteractive();
    const g = scene.add.graphics().setDepth(1201);
    // Dark card under the hint and the Done button, over the shop.
    const back = scene.add.graphics().setDepth(1255);
    const font = { fontFamily: app.theme.font, resolution: app.textResolution };
    const hint = scene.add
      .text(0, 0, app.t('decor.arrangeHint'), { ...font, fontStyle: '900', fontSize: 26, color: '#ffffff', align: 'center', wordWrap: { width: 300 } })
      .setOrigin(0.5)
      .setDepth(1260)
      .setShadow(0, 3, '#000000aa', 6, false, true);
    const done = new Button(scene, 0, 0, { label: app.t('decor.done'), width: 220, height: 88, fontSize: 34, onClick: () => this.endArrange() }).setDepth(1260);
    this.arrangeParts = [cover, g, hint, done, back];
    for (const [id, img] of this.sprites) {
      img.setDepth(ARRANGE_DEPTH).setRotation(0);
      const p = this.at.get(id);
      if (p) img.setPosition(p.x, p.y);
      this.makeDraggable(id, img);
    }
    this.layout();
  }

  /** An item on screen (center and size), for the tutorial's pointer. */
  itemRect(id: string): { x: number; y: number; w: number; h: number } | null {
    const img = this.sprites.get(id);
    if (!img?.visible) return null;
    return { x: img.x, y: img.y, w: this.size + 16, h: this.size + 16 };
  }

  private suggestion: { key: string; spot: { x: number; y: number } | null } | null = null;

  /**
   * A free spot clearly away from where the item is now (the nearest one at least two item sizes off),
   * for the tutorial's hand to drag towards. Null when the item is not on screen or there is no other room.
   */
  suggestSpot(id: string): { x: number; y: number; w: number; h: number } | null {
    const p = this.at.get(id);
    if (!p || !this.sprites.get(id)?.visible) return null;
    const vp = app.viewport.info;
    const key = `${id}|${Math.round(p.x)},${Math.round(p.y)}|${vp.width}x${vp.height}`;
    if (this.suggestion?.key !== key) {
      const size = this.size;
      const screen = { width: vp.width, height: vp.height };
      const blocked = this.blocked();
      const others = [...this.at.entries()].filter(([other]) => other !== id).map(([, q]) => itemBox(q.x, q.y, size));
      const minD = (size * 2) ** 2;
      let best: { x: number; y: number } | null = null;
      let bestD = Infinity;
      for (let gy = size / 2 + 8; gy <= vp.height - size / 2 - 8; gy += 16) {
        for (let gx = size / 2 + 8; gx <= vp.width - size / 2 - 8; gx += 16) {
          const d = (gx - p.x) ** 2 + (gy - p.y) ** 2;
          if (d >= minD && d < bestD && fits(gx, gy, size, blocked, others, screen)) {
            bestD = d;
            best = { x: gx, y: gy };
          }
        }
      }
      this.suggestion = { key, spot: best };
    }
    const spot = this.suggestion.spot;
    return spot ? { x: spot.x, y: spot.y, w: this.size + 16, h: this.size + 16 } : null;
  }

  /** The Done button of arrange mode, on screen. */
  doneRect(): { x: number; y: number; w: number; h: number } | null {
    const done = this.arrangeParts[3] as Button | undefined;
    return this.arranging && done ? { x: done.x, y: done.y, w: 220, h: 88 } : null;
  }

  endArrange() {
    if (!this.arranging) return;
    this.arranging = false;
    this.arrangeParts.forEach((o) => o.destroy());
    this.arrangeParts = [];
    for (const img of this.sprites.values()) {
      img.removeAllListeners();
      img.disableInteractive();
      img.clearTint().setDepth(DEPTH);
    }
    this.layout();
    this.onArrangeDone?.();
    this.onArrangeDone = null;
  }

  private drawBlocked() {
    const [cover, g, hint, done, back] = this.arrangeParts as [Phaser.GameObjects.Rectangle, Phaser.GameObjects.Graphics, Phaser.GameObjects.Text, Button, Phaser.GameObjects.Graphics];
    if (!g) return;
    const vp = app.viewport.info;
    cover.setSize(vp.width, vp.height);
    cover.input?.hitArea.setSize(vp.width, vp.height);
    g.clear();
    for (const r of this.blocked()) {
      g.fillStyle(0xff4d6d, 0.16);
      g.fillRoundedRect(r.x, r.y, r.w, r.h, 14);
      g.lineStyle(2, 0xff4d6d, 0.5);
      g.strokeRoundedRect(r.x, r.y, r.w, r.h, 14);
    }
    const h = this.hud();
    const wide = !vp.portrait;
    const wrap = wide ? h.w - 40 : h.w - 300;
    hint.setWordWrapWidth(wrap);
    if (wide) {
      hint.setPosition(h.x, h.y - 70);
      done.setPosition(h.x, h.y + 50);
    } else {
      // Phone: hint on the left of the strip, Done on the right.
      hint.setPosition(h.x - h.w / 2 + 30 + wrap / 2, h.y);
      done.setPosition(h.x + h.w / 2 - 140, h.y);
    }
    const bw = h.w - 20;
    const bh = wide ? 300 : 150;
    back.clear();
    back.fillStyle(0x15123a, 0.96);
    back.fillRoundedRect(h.x - bw / 2, (wide ? h.y - 10 : h.y) - bh / 2, bw, bh, 22);
    back.lineStyle(3, 0xffffff, 0.15);
    back.strokeRoundedRect(h.x - bw / 2, (wide ? h.y - 10 : h.y) - bh / 2, bw, bh, 22);
  }

  private makeDraggable(id: string, img: Phaser.GameObjects.Image) {
    img.setInteractive({ useHandCursor: true });
    this.scene.input.setDraggable(img);
    const others = () =>
      [...this.at.entries()].filter(([other]) => other !== id).map(([, p]) => itemBox(p.x, p.y, this.size));
    const ok = (x: number, y: number) => {
      const vp = app.viewport.info;
      return fits(x, y, this.size, this.blocked(), others(), { width: vp.width, height: vp.height });
    };
    img.on('dragstart', () => img.setScale((this.size / DECOR_TEX) * 1.15));
    img.on('drag', (p: Phaser.Input.Pointer) => {
      img.setPosition(p.worldX, p.worldY);
      if (ok(p.worldX, p.worldY)) img.clearTint();
      else img.setTint(0xff6680);
    });
    img.on('dragend', () => {
      img.setScale(this.size / DECOR_TEX).clearTint();
      if (ok(img.x, img.y)) {
        this.at.set(id, { x: img.x, y: img.y });
        this.save(id, img.x, img.y);
        this.moves += 1;
        app.audio.play('ui-tap', { volume: 0.6 });
      } else {
        const back = this.at.get(id) ?? { x: img.x, y: img.y };
        this.scene.tweens.add({ targets: img, x: back.x, y: back.y, duration: 180, ease: 'Quad.Out' });
      }
    });
  }
}
