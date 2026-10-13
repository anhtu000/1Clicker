// In-page director for the store preview videos (tools/capture/video.py, CLAUDE.md 4.1 and 5c).
// Loaded into the running game on the dev server (?clean&fixedres#video+reset) with
// import('/tools/capture/director.ts'). It stops the game's own loop, fakes the clock and steps the game
// one frame at a time at 30 fps, so the video plays at real speed however slow the headless renderer is
// (no fast-forward, as CrazyGames asks). Every action goes through the game's own code; only the results
// of a few rolls are fixed so the script shows the same story every time.
import Phaser from 'phaser';
import { app } from '@core';

export const FPS = 30;
const DT = 1000 / FPS;

// The scene's private members are used on purpose: this is a test harness, not game code.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Pt = { x: number; y: number };

let clock = 0;
let sc: Any;
let hand: Phaser.GameObjects.Graphics;
let script: Generator<void, void, void>;
let frameNo = 0;

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

/** Time only moves when the director steps: tweens (Date.now), timers and the game loop all follow it. */
function installClock() {
  const perf0 = performance.now();
  const date0 = Date.now();
  performance.now = () => perf0 + clock;
  Date.now = () => date0 + clock;
  Math.random = seeded(20261014);
}

/** Pointing hand like the tutorial's (fingertip at 0,0). The default mouse cursor never shows (CrazyGames rule). */
function drawHand(g: Phaser.GameObjects.Graphics) {
  const draw = (fill: number, grow: number) => {
    g.fillStyle(fill, 1);
    g.fillRoundedRect(-11 - grow, -6 - grow, 22 + grow * 2, 58 + grow * 2, 11 + grow);
    g.fillRoundedRect(9 - grow, 26 - grow, 20 + grow * 2, 34 + grow * 2, 10 + grow);
    g.fillRoundedRect(27 - grow, 32 - grow, 19 + grow * 2, 30 + grow * 2, 9 + grow);
    g.fillRoundedRect(43 - grow, 39 - grow, 17 + grow * 2, 26 + grow * 2, 8 + grow);
    g.fillRoundedRect(-13 - grow, 44 - grow, 72 + grow * 2, 50 + grow * 2, 20 + grow);
    g.fillRoundedRect(-34 - grow, 40 - grow, 34 + grow * 2, 18 + grow * 2, 9 + grow);
  };
  draw(0x14122b, 4);
  draw(0xffffff, 0);
}

const HAND_SCALE = 1.15;
const ease = (k: number) => 0.5 - Math.cos(Math.PI * k) / 2;
const frames = (sec: number) => Math.max(1, Math.round(sec * FPS));

function* wait(sec: number) {
  for (let i = frames(sec); i > 0; i--) yield;
}

function* moveHand(to: Pt, sec: number) {
  const from = { x: hand.x, y: hand.y };
  const n = frames(sec);
  for (let i = 1; i <= n; i++) {
    const k = ease(i / n);
    hand.setPosition(Phaser.Math.Linear(from.x, to.x, k), Phaser.Math.Linear(from.y, to.y, k));
    yield;
  }
}

function* fadeHand(to: number, sec: number) {
  const from = hand.alpha;
  const n = frames(sec);
  for (let i = 1; i <= n; i++) {
    hand.setAlpha(Phaser.Math.Linear(from, to, i / n));
    yield;
  }
}

/** Finger down for a few frames, then up. `onDown` runs on the press. */
function* press(onDown: () => void, onUp?: () => void) {
  hand.setScale(HAND_SCALE * 0.86);
  onDown();
  yield;
  yield;
  hand.setScale(HAND_SCALE * 0.93);
  yield;
  hand.setScale(HAND_SCALE);
  onUp?.();
  yield;
}

/** Taps the core at about `perSec` taps a second, spread a little over its face. */
function* tapCore(sec: number, perSec = 7) {
  const rnd = seeded(77 + frameNo);
  const core = sc.core as Pt & { radius: number };
  const n = frames(sec);
  let next = 0;
  for (let i = 0; i < n; i++) {
    if (i >= next) {
      const p = { x: core.x + (rnd() - 0.5) * core.radius * 0.6, y: core.y + (rnd() - 0.5) * core.radius * 0.6 };
      hand.setPosition(p.x, p.y);
      sc.tapCore(p.x, p.y);
      hand.setScale(HAND_SCALE * 0.86);
      next = i + Math.round(FPS / perSec + (rnd() - 0.5));
    } else {
      hand.setScale(Math.min(HAND_SCALE, hand.scaleX + 0.05));
    }
    yield;
  }
  hand.setScale(HAND_SCALE);
}

function* pressButton(btn: Any) {
  yield* moveHand({ x: btn.x, y: btn.y }, 0.3);
  yield* press(() => btn.emit('pointerdown', {}), () => btn.emit('pointerup', {}));
}

/** Rolls the next scan: tier and rarity. */
function fixScan(t: number, r: number) {
  sc.run.rollScanTier = () => t;
  sc.run.rollRarity = () => r;
}

function unfix() {
  delete sc.run.rollScanTier;
  delete sc.run.rollRarity;
  delete sc.run.mergeRarity;
}

/** Drags the body in slot `from` onto slot `to` with the hand, through the board's own drag handlers. */
function* drag(from: number, to: number, sec: number, rarity: number) {
  const board = sc.board;
  const a: Pt = board.slotPos(from);
  const b: Pt = board.slotPos(to);
  yield* moveHand(a, 0.22);
  const s = board.sprites[from];
  sc.run.mergeRarity = () => rarity;
  hand.setScale(HAND_SCALE * 0.9);
  s.emit('dragstart');
  yield;
  yield;
  const n = frames(sec);
  for (let i = 1; i <= n; i++) {
    const k = ease(i / n);
    const p = { worldX: Phaser.Math.Linear(a.x, b.x, k), worldY: Phaser.Math.Linear(a.y, b.y, k) };
    s.emit('drag', p);
    hand.setPosition(p.worldX, p.worldY);
    yield;
  }
  s.emit('dragend', { worldX: b.x, worldY: b.y });
  unfix();
  hand.setScale(HAND_SCALE);
  yield;
}

/** A wave of shooting stars (one per entry, true = golden), caught one after the other. */
function* stars(goldens: boolean[]) {
  const run = sc.run;
  run.s.wave = goldens.map((golden) => ({ golden, caught: false }));
  run.s.starGolden = goldens[0];
  run.s.starTimer = -run.content.economy.stars.lifetime;
  sc.spawnStars(goldens);
  yield* wait(0.5);
  for (let i = 0; i < goldens.length; i++) {
    // Chase the moving star, then tap it.
    const n = frames(0.45);
    for (let f = 1; f <= n; f++) {
      const star = sc.stars[i];
      if (!star) break;
      const k = 0.25 + 0.75 * (f / n);
      hand.setPosition(Phaser.Math.Linear(hand.x, star.x, k), Phaser.Math.Linear(hand.y, star.y, k));
      yield;
    }
    if (sc.stars[i]) yield* press(() => sc.catchStar(i));
  }
  run.s.starTimer = 9999;
}

function* buy(id: string) {
  const rect = sc.shop.cardRect(id);
  yield* moveHand({ x: rect.x, y: rect.y }, 0.35);
  const run = sc.run;
  const cost = run.upgradeCost(run.upgrade(id));
  if (run.s.energy < cost) run.s.energy = cost * 1.02;
  yield* press(() => sc.buy(id));
}

/** The story: tap, scan, merge up the chain to a Legendary Planet, catch stars, upgrade, make a Mythic Galaxy. */
function* story(): Generator<void, void, void> {
  const run = sc.run;
  const core = sc.core as Pt;
  hand.setPosition(core.x + 160, core.y + 140).setAlpha(0);
  yield* fadeHand(1, 0.2);
  yield* moveHand(core, 0.25);
  yield* tapCore(1.6);
  // Scan: a Stardust lands next to the chain.
  fixScan(1, 0);
  yield* pressButton(sc.scanBtn);
  unfix();
  yield* wait(0.15);
  // Merge up: Stardust, Meteoroid, Asteroid, Comet, Moon, then the Planet comes out Legendary.
  const free = run.s.board.findIndex((b: unknown, i: number) => i >= 14 && b);
  if (free < 0) throw new Error('the scan did not happen (energy or free slot)');
  yield* drag(free, 0, 0.36, 0);
  yield* drag(2, 0, 0.36, 1);
  yield* drag(1, 0, 0.36, 0);
  yield* drag(3, 0, 0.36, 1);
  yield* drag(4, 0, 0.4, 3);
  yield* fadeHand(0, 0.15);
  while (sc.revealOpen) yield;
  yield* wait(0.1);
  // Back to the core while shooting stars cross: one golden.
  hand.setPosition(core.x, core.y + 60);
  yield* fadeHand(1, 0.15);
  yield* tapCore(0.6);
  yield* stars([true, false]);
  // Upgrade: more energy per tap.
  yield* buy('focus');
  yield* moveHand(core, 0.3);
  yield* tapCore(1.0);
  // The goal: two Black Holes make a Mythic Galaxy.
  yield* drag(12, 11, 0.6, 4);
  yield* fadeHand(0, 0.15);
  yield* wait(2.2);
}

/** True once the run is on screen. */
export function ready(): boolean {
  const scene = app.game?.scene.getScene('Play') as Any;
  return !!(scene && scene.run && scene.scene.isActive());
}

/** Freezes the game and prepares the script. Returns the canvas size. */
export function start(opts: { energyShare?: number } = {}) {
  sc = app.game.scene.getScene('Play');
  // Close anything a returning save opens on its own (welcome back, daily gift).
  sc.children.list.filter((o: Any) => o.panelHeight !== undefined && o.active).forEach((p: Any) => p.close());
  installClock();
  app.game.loop.sleep();
  const run = sc.run;
  // No free copies, no random stars: only what the script does.
  run.canDuplicate = () => false;
  run.s.starTimer = 9999;
  // Enough for the scan in the script, and part of the way to the upgrade it buys.
  run.s.energy = run.scanCost() * 1.05 + run.upgradeCost(run.upgrade('focus')) * (opts.energyShare ?? 0.5);
  sc.shownEnergy = run.s.energy;
  hand = sc.add.graphics().setDepth(5000).setScale(HAND_SCALE).setAlpha(0);
  drawHand(hand);
  script = story();
  // Settle: a few frames so the closed panels and the energy display are gone or still.
  for (let i = 0; i < 12; i++) step();
  return { w: app.game.canvas.width, h: app.game.canvas.height };
}

function step() {
  clock += DT;
  app.game.loop.step(performance.now());
}

/** Plays one frame of the story. False when it has ended. */
export function frame(): boolean {
  const r = script.next();
  step();
  frameNo += 1;
  return !r.done;
}

(window as unknown as { director: unknown }).director = { ready, start, frame };
