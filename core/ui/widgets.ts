import Phaser from 'phaser';
import { app } from '../app';
import { formatCountdown } from '../format';
import { toast } from './toast';
import { Button } from './button';
import { musicOffIcon, musicOnIcon, soundOffIcon, soundOnIcon, videoIcon } from './icons';

/** Square mute toggle. Follows the portal's forced mute and greys out while it is on. */
export function soundButton(scene: Phaser.Scene, x: number, y: number, size = 96) {
  const button = new Button(scene, x, y, {
    icon: app.audio.muted ? soundOffIcon : soundOnIcon,
    width: size,
    height: size,
    color: app.theme.surface,
    textColor: app.theme.surfaceText,
    onClick: () => app.audio.toggle(),
  });
  const refresh = () => {
    button.setIcon(app.audio.muted ? soundOffIcon : soundOnIcon);
    button.setEnabled(app.audio.canToggle);
  };
  refresh();
  const off = app.audio.on('change', refresh);
  button.once(Phaser.GameObjects.Events.DESTROY, off);
  return button;
}

/** Square music toggle (sound effects stay on). Greyed out while all sound is muted. */
export function musicButton(scene: Phaser.Scene, x: number, y: number, size = 96) {
  const button = new Button(scene, x, y, {
    icon: app.audio.musicOn ? musicOnIcon : musicOffIcon,
    width: size,
    height: size,
    color: app.theme.surface,
    textColor: app.theme.surfaceText,
    onClick: () => app.audio.toggleMusic(),
  });
  const refresh = () => {
    button.setIcon(app.audio.musicOn ? musicOnIcon : musicOffIcon);
    button.setEnabled(!app.audio.muted);
  };
  refresh();
  const off = app.audio.on('change', refresh);
  button.once(Phaser.GameObjects.Events.DESTROY, off);
  return button;
}

export interface RewardButtonOptions {
  label: string;
  width?: number;
  height?: number;
  fontSize?: number;
  /** Runs only when the player has earned the reward. */
  onReward: () => void;
  /**
   * Seconds until the reward can be used again (0 = ready). While it is above 0
   * the button is greyed out and shows a countdown instead of its label.
   */
  cooldown?: () => number;
}

/**
 * Button that shows a rewarded ad and gives the reward when the ad finishes (CLAUDE.md 4.5).
 * It hides itself when rewarded ads can never work here (no ad SDK).
 * When the ad fails, the player gets a short message and nothing is lost.
 */
export function rewardButton(scene: Phaser.Scene, x: number, y: number, options: RewardButtonOptions) {
  const button: Button = new Button(scene, x, y, {
    label: options.label,
    icon: videoIcon,
    width: options.width ?? 360,
    height: options.height ?? 96,
    fontSize: options.fontSize ?? 34,
    color: app.theme.reward,
    textColor: app.theme.rewardText,
    onClick: async () => {
      button.setEnabled(false);
      const earned = await app.ads.rewarded();
      if (!button.active) return; // scene changed while the ad was showing
      button.setEnabled(true);
      if (earned) {
        options.onReward();
      } else {
        const message = app.ads.failureMessage((k) => app.t(k));
        if (message) toast(scene, message);
      }
      button.setVisible(app.ads.rewardedAvailable && !app.clean);
    },
  });
  button.setVisible(app.ads.rewardedAvailable && !app.clean);

  if (options.cooldown) {
    const cooldown = options.cooldown;
    let shown = '';
    const refresh = () => {
      if (!button.active || app.ads.isShowing) return;
      const wait = Math.ceil(cooldown());
      const text = wait > 0 ? app.t('core.readyIn', { t: formatCountdown(wait) }) : options.label;
      if (text !== shown) {
        shown = text;
        button.setLabel(text);
      }
      const ready = wait <= 0;
      if (button.isEnabled !== ready) button.setEnabled(ready);
    };
    scene.events.on(Phaser.Scenes.Events.UPDATE, refresh);
    button.once(Phaser.GameObjects.Events.DESTROY, () => scene.events.off(Phaser.Scenes.Events.UPDATE, refresh));
    refresh();
  }
  return button;
}
