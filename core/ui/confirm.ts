import Phaser from 'phaser';
import { app } from '../app';
import { Button } from './button';
import { Panel } from './panel';

/** Words for a "Are you sure?" panel. */
export interface ConfirmText {
  title: string;
  text: string;
  /** The action button (right, main color). */
  confirm: string;
  /** The button that backs out (left). The close button also backs out. */
  cancel: string;
}

/**
 * Asks before something the player cannot undo, for example leaving a timed run.
 * Backing out is the left button, in the panel color; the action is on the right in the main color,
 * the same order as the game's other two-button panels.
 */
export function confirmPanel(scene: Phaser.Scene, words: ConfirmText, onConfirm: () => void, onClose?: () => void): Panel {
  const panel = new Panel(scene, { title: words.title, width: 620, height: 420, onClose });
  const theme = app.theme;
  const text = scene.add
    .text(0, panel.top + 60, words.text, {
      fontFamily: theme.font,
      fontStyle: '700',
      fontSize: 30,
      color: theme.surfaceText,
      align: 'center',
      wordWrap: { width: panel.panelWidth - 90 },
      resolution: app.textResolution,
    })
    .setOrigin(0.5);
  const w = Math.min(268, (panel.panelWidth - 72) / 2);
  const y = panel.bottom - 80;
  const cancel = new Button(scene, -w / 2 - 12, y, {
    label: words.cancel,
    width: w,
    height: 96,
    fontSize: 32,
    color: theme.surface,
    textColor: theme.surfaceText,
    onClick: () => panel.close(),
  });
  // A surface-colored button on a surface panel needs an outline to read as a button.
  const ring = scene.add.graphics();
  ring.lineStyle(3, 0xffffff, 0.25);
  ring.strokeRoundedRect(-w - 12, y - 48, w, 96, theme.radius);
  let done = false;
  const confirm = new Button(scene, w / 2 + 12, y, {
    label: words.confirm,
    width: w,
    height: 96,
    fontSize: 32,
    onClick: () => {
      if (done) return;
      done = true;
      panel.close();
      onConfirm();
    },
  });
  panel.content.add([text, ring, cancel, confirm]);
  return panel;
}
