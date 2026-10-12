import Phaser from 'phaser';
import { app } from '../app';
import { Button } from './button';

// Step-by-step tutorial (CLAUDE.md 4.2): one short line per step, a hand pointing at the right place,
// and the step only moves on when the player does what it says. Taps outside the target are blocked.
// Steps teach by doing, so each one should give a reward right away.

/** A rectangle in scene coordinates, given by its center and size. */
export interface TutorialTarget {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TutorialStep {
  /** Saved by the game so a finished step never shows again. */
  id: string;
  /** Already translated. Keep it to one short line. */
  text: string;
  /** Where to point. Called every frame, so moving targets and screen rotation work. null: no pointer. */
  target?: () => TutorialTarget | null;
  /** Drag steps: the hand moves from target to here. */
  dragTo?: () => TutorialTarget | null;
  /** The step ends when this turns true. Checked every frame. */
  done?: () => boolean;
  /** For steps with nothing to do but read: a button with this label ends the step. */
  ack?: string;
  /** Block taps outside the target. Default: true when there is a target. */
  block?: boolean;
}

export interface TutorialOptions {
  /** Called after each step, with its id. Save it here. */
  onStepDone?: (id: string) => void;
  depth?: number;
}

const PAD = 18;

/**
 * Runs steps one after another on top of a scene.
 *   const tut = new Tutorial(scene, { onStepDone: (id) => save.data.tutorial.push(id) });
 *   tut.queue([{ id: 'tap', text: 'Tap the core', target: () => coreRect(), done: () => taps >= 3 }]);
 * The game can also end the current step itself with tut.complete('tap').
 */
export class Tutorial {
  private scene: Phaser.Scene;
  private opts: TutorialOptions;
  private steps: TutorialStep[] = [];
  private current: TutorialStep | null = null;
  private shade: Phaser.GameObjects.Graphics;
  private blocker: Phaser.GameObjects.Zone;
  private bubble: Phaser.GameObjects.Container;
  private bubbleBg: Phaser.GameObjects.Graphics;
  private bubbleText: Phaser.GameObjects.Text;
  private hand: Phaser.GameObjects.Graphics;
  private ackButton: Button | null = null;
  private hole: TutorialTarget | null = null;
  private time = 0;
  private stepStarted = 0;
  private bubbleSize = '';

  constructor(scene: Phaser.Scene, options: TutorialOptions = {}) {
    this.scene = scene;
    this.opts = options;
    const depth = options.depth ?? 1400;
    const theme = app.theme;
    this.shade = scene.add.graphics().setDepth(depth);
    this.blocker = scene.add.zone(0, 0, 10, 10).setOrigin(0).setDepth(depth);
    this.blocker.setInteractive({
      hitArea: new Phaser.Geom.Rectangle(0, 0, 10, 10),
      // Taps inside the hole fall through to the game; everything else is swallowed.
      hitAreaCallback: (area: Phaser.Geom.Rectangle, x: number, y: number) => {
        if (!Phaser.Geom.Rectangle.Contains(area, x, y)) return false;
        const block = this.current?.block ?? !!this.hole;
        if (!block) return false;
        if (!this.hole) return true;
        const h = this.hole;
        return !(Math.abs(x - h.x) <= h.w / 2 + PAD && Math.abs(y - h.y) <= h.h / 2 + PAD);
      },
    });
    this.bubbleBg = scene.add.graphics();
    this.bubbleText = scene.add
      .text(0, 0, '', {
        fontFamily: theme.font,
        fontStyle: '900',
        fontSize: 36,
        color: '#ffffff',
        align: 'center',
        resolution: app.textResolution,
      })
      .setOrigin(0.5);
    this.bubble = scene.add.container(0, 0, [this.bubbleBg, this.bubbleText]).setDepth(depth + 2);
    this.hand = scene.add.graphics().setDepth(depth + 3);
    drawHand(this.hand);
    this.hide();

    const onUpdate = (_t: number, delta: number) => this.update(delta);
    scene.events.on(Phaser.Scenes.Events.UPDATE, onUpdate);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(Phaser.Scenes.Events.UPDATE, onUpdate));
  }

  /** A step is on screen. Games can pause timers or ignore keys meanwhile. */
  get active(): boolean {
    return this.current !== null;
  }

  get currentId(): string | null {
    return this.current?.id ?? null;
  }

  /** Adds steps to run after the ones already waiting. */
  queue(steps: TutorialStep[]) {
    this.steps.push(...steps);
    if (!this.current) this.next();
  }

  /** Ends the current step if its id matches (or any step when id is omitted). */
  complete(id?: string) {
    if (!this.current || (id && this.current.id !== id)) return;
    const done = this.current.id;
    this.current = null;
    this.opts.onStepDone?.(done);
    this.next();
  }

  private next() {
    this.ackButton?.destroy();
    this.ackButton = null;
    const step = this.steps.shift() ?? null;
    this.current = step;
    if (!step) {
      this.hide();
      return;
    }
    this.stepStarted = this.time;
    this.bubbleText.setText(step.text);
    this.bubbleText.setWordWrapWidth(Math.min(620, app.viewport.info.safe.width - 120));
    if (step.ack) {
      this.ackButton = new Button(this.scene, 0, 0, {
        label: step.ack,
        width: 300,
        height: 92,
        fontSize: 36,
        onClick: () => this.complete(step.id),
      });
      this.ackButton.setDepth((this.opts.depth ?? 1400) + 4);
    }
    this.shade.setVisible(true);
    this.bubble.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.bubble, alpha: 1, duration: 200 });
    this.layout();
  }

  private hide() {
    this.shade.clear().setVisible(false);
    this.bubble.setVisible(false);
    this.hand.setVisible(false);
    this.hole = null;
  }

  private update(delta: number) {
    this.time += delta / 1000;
    const step = this.current;
    if (!step) return;
    if (step.done?.()) {
      this.complete(step.id);
      return;
    }
    this.layout();
  }

  private layout() {
    const step = this.current;
    if (!step) return;
    const vp = app.viewport.info;
    this.blocker.setSize(vp.width, vp.height);
    (this.blocker.input!.hitArea as Phaser.Geom.Rectangle).setSize(vp.width, vp.height);

    // Targets are kept to the visible part of the screen, so the frame and the hand never sit off the edge.
    const target = onScreen(step.target?.() ?? null, vp.width, vp.height);
    const dragTo = onScreen(step.dragTo?.() ?? null, vp.width, vp.height);
    // The hole covers the target, and the drop point for drag steps.
    this.hole = target && dragTo ? union(target, dragTo) : target;

    const g = this.shade;
    g.clear();
    const h = this.hole;
    const dim = step.ack && !h ? 0.6 : 0.5;
    g.fillStyle(0x000000, dim);
    if (!h) {
      g.fillRect(0, 0, vp.width, vp.height);
    } else {
      const left = h.x - h.w / 2 - PAD;
      const right = h.x + h.w / 2 + PAD;
      const top = h.y - h.h / 2 - PAD;
      const bottom = h.y + h.h / 2 + PAD;
      g.fillRect(0, 0, vp.width, Math.max(0, top));
      g.fillRect(0, bottom, vp.width, Math.max(0, vp.height - bottom));
      g.fillRect(0, top, Math.max(0, left), bottom - top);
      g.fillRect(right, top, Math.max(0, vp.width - right), bottom - top);
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 5);
      g.lineStyle(5, app.theme.primary, 0.55 + 0.45 * pulse);
      g.strokeRoundedRect(left, top, right - left, bottom - top, 22);
    }

    // Bubble: away from the target, inside the safe area.
    const safe = vp.safe;
    const bw = this.bubbleText.width + 64;
    const bh = this.bubbleText.height + 44;
    // Redrawn only when its size changes (layout runs every frame; Graphics are costly on phones).
    const size = `${bw}x${bh}`;
    if (size !== this.bubbleSize) {
      this.bubbleSize = size;
      this.bubbleBg.clear();
      this.bubbleBg.fillStyle(0x0b0a1e, 0.94);
      this.bubbleBg.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 26);
      this.bubbleBg.lineStyle(3, app.theme.primary, 0.9);
      this.bubbleBg.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 26);
    }
    let by = vp.height / 2;
    if (h) {
      const above = h.y - h.h / 2 - PAD - bh / 2 - 40;
      const below = h.y + h.h / 2 + PAD + bh / 2 + 40;
      by = h.y > vp.height / 2 ? above : below;
      if (this.ackButton) by = h.y > vp.height / 2 ? above - 70 : below;
    } else if (this.ackButton) {
      by = vp.height / 2 - 70;
    }
    by = Phaser.Math.Clamp(by, safe.y + bh / 2 + 20, safe.y + safe.height - bh / 2 - (this.ackButton ? 140 : 20));
    this.bubble.setPosition(vp.width / 2, by);
    this.ackButton?.setPosition(vp.width / 2, by + bh / 2 + 70);

    // Hand: taps the target, or slides from target to dragTo.
    if (target) {
      this.hand.setVisible(true);
      const t = this.time - this.stepStarted;
      if (dragTo) {
        const cycle = (t % 1.8) / 1.8;
        const k = Phaser.Math.Easing.Cubic.InOut(Phaser.Math.Clamp((cycle - 0.15) / 0.6, 0, 1));
        this.hand.setPosition(Phaser.Math.Linear(target.x, dragTo.x, k) + 18, Phaser.Math.Linear(target.y, dragTo.y, k) + 26);
        this.hand.setScale(cycle < 0.15 || cycle > 0.8 ? 1 : 0.9);
        this.hand.setAlpha(cycle > 0.9 ? 1 - (cycle - 0.9) * 10 : 1);
      } else {
        const press = Math.max(0, Math.sin(t * 6));
        this.hand.setPosition(target.x + 18, target.y + 26 + press * 10);
        this.hand.setScale(1 - press * 0.08);
        this.hand.setAlpha(1);
      }
    } else {
      this.hand.setVisible(false);
    }
  }
}

/** The part of a target inside the screen (minus the frame's padding), or null when none of it is. */
function onScreen(t: TutorialTarget | null, width: number, height: number): TutorialTarget | null {
  if (!t) return null;
  const m = PAD + 6;
  const left = Math.max(m, t.x - t.w / 2);
  const right = Math.min(width - m, t.x + t.w / 2);
  const top = Math.max(m, t.y - t.h / 2);
  const bottom = Math.min(height - m, t.y + t.h / 2);
  if (right - left < 20 || bottom - top < 20) return null;
  return { x: (left + right) / 2, y: (top + bottom) / 2, w: right - left, h: bottom - top };
}

function union(a: TutorialTarget, b: TutorialTarget): TutorialTarget {
  const left = Math.min(a.x - a.w / 2, b.x - b.w / 2);
  const right = Math.max(a.x + a.w / 2, b.x + b.w / 2);
  const top = Math.min(a.y - a.h / 2, b.y - b.h / 2);
  const bottom = Math.max(a.y + a.h / 2, b.y + b.h / 2);
  return { x: (left + right) / 2, y: (top + bottom) / 2, w: right - left, h: bottom - top };
}

/** Pointing hand, fingertip at (0, 0), drawn in white with a dark outline. */
function drawHand(g: Phaser.GameObjects.Graphics) {
  const outline = 0x14122b;
  const draw = (fill: number, grow: number) => {
    g.fillStyle(fill, 1);
    // index finger
    g.fillRoundedRect(-11 - grow, -6 - grow, 22 + grow * 2, 58 + grow * 2, 11 + grow);
    // other fingers
    g.fillRoundedRect(9 - grow, 26 - grow, 20 + grow * 2, 34 + grow * 2, 10 + grow);
    g.fillRoundedRect(27 - grow, 32 - grow, 19 + grow * 2, 30 + grow * 2, 9 + grow);
    g.fillRoundedRect(43 - grow, 39 - grow, 17 + grow * 2, 26 + grow * 2, 8 + grow);
    // palm and thumb
    g.fillRoundedRect(-13 - grow, 44 - grow, 72 + grow * 2, 50 + grow * 2, 20 + grow);
    g.fillRoundedRect(-34 - grow, 40 - grow, 34 + grow * 2, 18 + grow * 2, 9 + grow);
  };
  draw(outline, 4);
  draw(0xffffff, 0);
}
