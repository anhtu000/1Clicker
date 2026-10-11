import Phaser from 'phaser';
import { app } from '../app';
import { toast } from './toast';
import { Button } from './button';
import { playIcon, soundOffIcon, soundOnIcon } from './icons';

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

export interface RewardButtonOptions {
  label: string;
  width?: number;
  height?: number;
  fontSize?: number;
  /** Runs only when the player has earned the reward. */
  onReward: () => void;
}

/**
 * Button that shows a rewarded ad and gives the reward when the ad finishes (CLAUDE.md 4.5).
 * It hides itself when rewarded ads can never work here (no ad SDK).
 * When the ad fails, the player gets a short message and nothing is lost.
 */
export function rewardButton(scene: Phaser.Scene, x: number, y: number, options: RewardButtonOptions) {
  const button: Button = new Button(scene, x, y, {
    label: options.label,
    icon: playIcon,
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
        const blocked = app.ads.lastOutcome === 'adblock';
        toast(scene, app.t(blocked ? 'core.adBlocked' : 'core.adUnavailable'));
      }
      button.setVisible(app.ads.rewardedAvailable);
    },
  });
  button.setVisible(app.ads.rewardedAvailable);
  return button;
}
