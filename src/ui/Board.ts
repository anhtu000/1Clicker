import Phaser from 'phaser';
import { app } from '@core';
import type { Run } from '../logic/run.ts';
import { BodySprite } from './BodySprite';

export interface BoardCallbacks {
  /** A body from slot `from` was dropped on slot `to` (the slot may be empty). */
  onDrop: (from: number, to: number) => void;
  /** Dropped outside the board, at this world point. Return true when the drop was used. */
  onDropOutside: (from: number, x: number, y: number) => boolean;
  /** A body was tapped without dragging. */
  onTap?: (slot: number) => void;
  onDragStart?: (slot: number) => void;
  /** Extra place to highlight while dragging (the core, for absorbing). */
  dropZone?: () => { x: number; y: number; r: number } | null;
}

/**
 * The 4x4 board. Bodies are dragged with one finger: drop on the same tier to merge,
 * on an empty slot to move. Sprites live at the scene root in world coordinates,
 * so a dragged body is never clipped or offset by a parent container.
 */
export class Board {
  readonly cols = 4;
  readonly rows = 4;
  cell = 120;
  gap = 10;
  /** Center of the board. */
  x = 0;
  y = 0;
  private scene: Phaser.Scene;
  private run: Run;
  private cb: BoardCallbacks;
  private bg: Phaser.GameObjects.Graphics;
  private hints: Phaser.GameObjects.Graphics;
  private sprites: (BodySprite | null)[] = [];
  /** Every live sprite the board made, so sync() can remove any that lost its slot. */
  private all = new Set<BodySprite>();
  private dragFrom = -1;
  private time = 0;

  constructor(scene: Phaser.Scene, run: Run, callbacks: BoardCallbacks) {
    this.scene = scene;
    this.run = run;
    this.cb = callbacks;
    this.bg = scene.add.graphics().setDepth(5);
    this.hints = scene.add.graphics().setDepth(6);
    scene.input.dragDistanceThreshold = 10;
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this));
  }

  get size() {
    return this.cols * this.cell + (this.cols - 1) * this.gap;
  }

  /** Places the board centered on (x, y) with this cell size. */
  layout(x: number, y: number, cell: number) {
    this.x = x;
    this.y = y;
    this.cell = cell;
    this.gap = Math.round(cell * 0.08);
    this.drawCells();
    this.sprites.forEach((s, i) => {
      if (!s || i === this.dragFrom) return;
      const p = this.slotPos(i);
      s.setPosition(p.x, p.y);
      s.resize(this.cell);
      (s.input?.hitArea as Phaser.Geom.Circle | undefined)?.setTo(this.cell / 2, this.cell / 2, this.cell / 2);
    });
  }

  /** World position of a slot's center. */
  slotPos(i: number) {
    const col = i % this.cols;
    const row = Math.floor(i / this.cols);
    const step = this.cell + this.gap;
    return {
      x: this.x - this.size / 2 + this.cell / 2 + col * step,
      y: this.y - this.size / 2 + this.cell / 2 + row * step,
    };
  }

  /** Rectangle of a slot, for tutorial targets. */
  slotRect(i: number) {
    const p = this.slotPos(i);
    return { x: p.x, y: p.y, w: this.cell, h: this.cell };
  }

  /** Slot under a world point, or -1. */
  slotAt(x: number, y: number): number {
    const step = this.cell + this.gap;
    const left = this.x - this.size / 2;
    const top = this.y - this.size / 2;
    const col = Math.floor((x - left) / step);
    const row = Math.floor((y - top) / step);
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return -1;
    // Ignore drops in the gap only when they are clearly outside the cell.
    return row * this.cols + col;
  }

  sprite(i: number): BodySprite | null {
    return this.sprites[i] ?? null;
  }

  /** Makes the sprites match the run's board. New or changed bodies pop in. */
  sync(popSlots: number[] = []) {
    const board = this.run.s.board;
    for (let i = 0; i < board.length; i++) {
      const b = board[i];
      let s = this.sprites[i] ?? null;
      // A destroyed sprite left in a slot counts as empty, so the body gets drawn again.
      if (s && !s.active) s = this.sprites[i] = null;
      if (!b) {
        if (s && i !== this.dragFrom) s.destroy();
        if (i !== this.dragFrom) this.sprites[i] = null;
        continue;
      }
      const p = this.slotPos(i);
      if (!s) {
        s = new BodySprite(this.scene, p.x, p.y, b, this.cell).setDepth(10);
        this.makeDraggable(s);
        this.sprites[i] = s;
        const made = s;
        this.all.add(made);
        made.once(Phaser.GameObjects.Events.DESTROY, () => this.all.delete(made));
        s.pop();
      } else if (s.celestial.t !== b.t || s.celestial.r !== b.r) {
        s.setBody(b);
        if (popSlots.includes(i)) s.pop();
      } else if (popSlots.includes(i)) {
        s.pop();
      }
      if (i !== this.dragFrom) {
        s.setPosition(p.x, p.y);
        s.settle();
      }
    }
    // Safety net: a sprite that is in no slot (and not being dragged) is a ghost of an old state.
    for (const s of this.all) if (!this.sprites.includes(s)) s.destroy();
    this.drawCells();
  }

  /** The run moved a body to an empty slot: keep the same sprite and glide it there. */
  moved(from: number, to: number) {
    const s = this.sprites[from];
    if (!s) return this.sync();
    this.sprites[to]?.destroy();
    this.sprites[to] = s;
    this.sprites[from] = null;
    const p = this.slotPos(to);
    this.scene.tweens.add({ targets: s, x: p.x, y: p.y, duration: 140, ease: 'Quad.Out' });
  }

  /** The run swapped two bodies: both sprites glide to their new slots (the dragged one keeps its look). */
  swapped(a: number, b: number) {
    const sa = this.sprites[a];
    const sb = this.sprites[b];
    this.sprites[a] = sb;
    this.sprites[b] = sa;
    for (const [s, slot] of [[sa, b], [sb, a]] as const) {
      if (!s) continue;
      const p = this.slotPos(slot);
      this.scene.tweens.add({ targets: s, x: p.x, y: p.y, duration: 160, ease: 'Quad.Out' });
    }
    this.sync();
  }

  /**
   * The run already merged `from` into `to`: the sprite of `from` leaves its slot now and slides
   * into `to` as an effect only. The state never waits on an animation, so a second drag or an
   * auto merge during the slide cannot leave the board and the run out of step.
   */
  mergeInto(from: number, to: number) {
    const s = this.sprites[from];
    if (!s) return;
    this.sprites[from] = null;
    this.all.delete(s);
    s.disableInteractive();
    s.setDepth(30);
    const p = this.slotPos(to);
    this.scene.tweens.add({ targets: s, x: p.x, y: p.y, scale: 0.6, alpha: 0.6, duration: 140, ease: 'Quad.In', onComplete: () => s.destroy() });
  }

  private makeDraggable(s: BodySprite) {
    // A sized container measures its hit area from the top-left corner, so the circle is centered at (cell/2, cell/2).
    const r = this.cell * 0.5;
    s.setInteractive(new Phaser.Geom.Circle(this.cell / 2, this.cell / 2, r), Phaser.Geom.Circle.Contains);
    this.scene.input.setDraggable(s);
    s.on('pointerup', (_p: Phaser.Input.Pointer) => {
      if (this.dragFrom >= 0) return;
      const i = this.sprites.indexOf(s);
      if (i >= 0) this.cb.onTap?.(i);
    });
    s.on('dragstart', () => {
      const i = this.sprites.indexOf(s);
      if (i < 0) return;
      this.dragFrom = i;
      s.bob = false;
      s.setDepth(40);
      s.scaleTo(1.18, 100);
      app.audio.play('ui-tap', { volume: 0.5, pitchJitter: 80 });
      this.cb.onDragStart?.(i);
    });
    s.on('drag', (p: Phaser.Input.Pointer) => {
      s.setPosition(p.worldX, p.worldY - this.cell * 0.15);
    });
    s.on('dragend', (p: Phaser.Input.Pointer) => {
      const from = this.dragFrom;
      this.dragFrom = -1;
      s.bob = true;
      s.setDepth(10);
      this.hints.clear();
      if (from < 0) return;
      s.scaleTo(1, 100);
      const to = this.slotAt(p.worldX, p.worldY);
      if (to >= 0 && to !== from && to < this.run.slots) {
        this.cb.onDrop(from, to);
      } else if (to < 0 && this.cb.onDropOutside(from, p.worldX, p.worldY)) {
        // used
      }
      // Whatever happened, put sprites where the run says they are.
      const back = this.slotPos(from);
      if (this.sprites[from] === s && this.run.s.board[from]) {
        this.scene.tweens.add({ targets: s, x: back.x, y: back.y, duration: 160, ease: 'Back.Out' });
      }
    });
  }

  private drawCells() {
    const g = this.bg;
    g.clear();
    const r = this.cell * 0.2;
    for (let i = 0; i < this.cols * this.rows; i++) {
      const p = this.slotPos(i);
      const open = i < this.run.slots;
      g.fillStyle(open ? 0x1a1840 : 0x0e0d24, open ? 0.72 : 0.55);
      g.fillRoundedRect(p.x - this.cell / 2, p.y - this.cell / 2, this.cell, this.cell, r);
      g.lineStyle(2, open ? 0x6f63c9 : 0x2c2856, open ? 0.45 : 0.4);
      g.strokeRoundedRect(p.x - this.cell / 2, p.y - this.cell / 2, this.cell, this.cell, r);
      if (!open) {
        // Small padlock.
        const s = this.cell * 0.14;
        g.lineStyle(3, 0x3c3770, 0.9);
        g.strokeRoundedRect(p.x - s * 0.6, p.y - s * 1.1, s * 1.2, s * 1.1, s * 0.5);
        g.fillStyle(0x3c3770, 0.9);
        g.fillRoundedRect(p.x - s, p.y - s * 0.2, s * 2, s * 1.4, s * 0.25);
      }
    }
  }

  private tick(_t: number, delta: number) {
    this.time += delta / 1000;
    if (this.dragFrom < 0) return;
    // While dragging: pulse rings on bodies that can merge with the dragged one, and on the drop zone.
    const g = this.hints;
    g.clear();
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 8);
    const dragged = this.run.s.board[this.dragFrom];
    if (!dragged) return;
    for (let i = 0; i < this.run.slots; i++) {
      if (i === this.dragFrom || !this.run.canMerge(this.dragFrom, i)) continue;
      const p = this.slotPos(i);
      g.lineStyle(5, 0xffd166, 0.5 + 0.5 * pulse);
      g.strokeRoundedRect(p.x - this.cell / 2 - 3, p.y - this.cell / 2 - 3, this.cell + 6, this.cell + 6, this.cell * 0.22);
    }
    const zone = this.cb.dropZone?.();
    if (zone) {
      g.lineStyle(4, 0xff8a5c, 0.35 + 0.4 * pulse);
      g.strokeCircle(zone.x, zone.y, zone.r);
    }
  }
}
