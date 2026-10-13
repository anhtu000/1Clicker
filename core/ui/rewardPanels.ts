import Phaser from 'phaser';
import { app } from '../app';
import { formatDuration, formatNumber } from '../format';
import { burst, punch } from '../fx';
import { claimDaily, dailyClaimedInCycle, dailyStatus, type DailyState } from '../time';
import { Button } from './button';
import { checkIcon, type IconDraw } from './icons';
import { Panel } from './panel';
import { rewardButton } from './widgets';

// "Come back" screens shared by both games (CLAUDE.md 4.4): income while away and the daily gift.
// Each has a plain button and a rewarded-ad button that multiplies the reward (CLAUDE.md 4.5).

export interface OfflinePanelOptions {
  /** Seconds the player was away (already capped by the game). */
  seconds: number;
  /** What the player earned while away. */
  amount: number;
  /** Multiplier for watching an ad. Default 2. */
  adMultiplier?: number;
  /** Optional currency icon drawn left of the amount. */
  icon?: IconDraw;
  iconColor?: number;
  /** Gives the reward. Called exactly once, with the final amount. */
  onCollect: (amount: number, watchedAd: boolean) => void;
}

/** "Welcome back! You were away 2h 15m. +1.25M" with Collect and Collect x2 (ad). */
export function showOfflinePanel(scene: Phaser.Scene, options: OfflinePanelOptions): Panel {
  const mult = options.adMultiplier ?? 2;
  let given = false;
  const give = (watched: boolean) => {
    if (given) return;
    given = true;
    options.onCollect(options.amount * (watched ? mult : 1), watched);
  };
  const panel = new Panel(scene, {
    title: app.t('core.welcomeBack'),
    height: 600,
    // Closing without choosing still gives the base reward: nothing is lost.
    onClose: () => give(false),
  });
  const theme = app.theme;
  const font = { fontFamily: theme.font, resolution: app.textResolution };
  const away = scene.add
    .text(0, panel.top + 10, app.t('core.awayFor', { t: formatDuration(options.seconds, app.i18n.durationUnits()) }), {
      ...font,
      fontStyle: '700',
      fontSize: 32,
      color: theme.textDim,
    })
    .setOrigin(0.5);
  const amount = scene.add
    .text(0, panel.top + 110, `+${formatNumber(options.amount)}`, { ...font, fontStyle: '900', fontSize: 88, color: theme.text })
    .setOrigin(0.5);
  panel.content.add([away, amount]);
  if (options.icon) {
    const g = scene.add.graphics();
    options.icon(g, 72, options.iconColor ?? theme.primary);
    g.setPosition(-amount.width / 2 - 56, amount.y);
    panel.content.add(g);
  }

  const bottom = panel.bottom;
  const double = rewardButton(scene, 0, bottom - 230, {
    label: app.t('core.collectDouble', { n: mult }),
    width: 440,
    height: 104,
    fontSize: 38,
    onReward: () => {
      give(true);
      amount.setText(`+${formatNumber(options.amount * mult)}`);
      punch(scene, amount, 0.2);
      burst(scene, panel.x + app.viewport.info.width / 2, app.viewport.info.height / 2, theme.reward, 30, 520);
      scene.time.delayedCall(450, () => panel.close());
    },
  });
  const collect = new Button(scene, 0, double.visible ? bottom - 100 : bottom - 150, {
    label: app.t('core.collect'),
    width: 440,
    height: 96,
    fontSize: 36,
    color: double.visible ? theme.surface : theme.primary,
    textColor: double.visible ? theme.surfaceText : theme.primaryText,
    onClick: () => {
      give(false);
      panel.close();
    },
  });
  panel.content.add([double, collect]);
  return panel;
}

export interface DailyRewardView {
  /** Short text under the day number, for example "+5 min" or "Lucky scan". */
  label: string;
  icon?: IconDraw;
  iconColor?: number;
}

export interface DailyPanelOptions {
  state: DailyState;
  /** One entry per day of the cycle, usually 7. The cycle repeats after the last day. */
  rewards: DailyRewardView[];
  /** Multiplier for watching an ad. Default 2. */
  adMultiplier?: number;
  /**
   * Gives today's reward. dayIndex is 0-based within the cycle.
   * Save `next` as the new daily state.
   */
  onClaim: (dayIndex: number, multiplier: number, next: DailyState) => void;
  onClose?: () => void;
}

/** Index of today's reward in the cycle, or of the next one when today is already claimed. */
export function dailyDayIndex(state: DailyState, cycle: number): { index: number; canClaim: boolean } {
  const status = dailyStatus(state);
  if (status.canClaim) return { index: (status.streak - 1) % cycle, canClaim: true };
  return { index: status.streak % cycle, canClaim: false };
}

/** The 7-day gift track with Claim and Claim x2 (ad). Shows "come back tomorrow" when already claimed. */
export function showDailyPanel(scene: Phaser.Scene, options: DailyPanelOptions): Panel {
  const theme = app.theme;
  const mult = options.adMultiplier ?? 2;
  const cycle = options.rewards.length;
  const { index: today, canClaim } = dailyDayIndex(options.state, cycle);
  // Ticked tiles. Once today is claimed, `today` already points at tomorrow's tile, so it is not ticked.
  const claimedCount = dailyClaimedInCycle(options.state, cycle);
  // Landscape: one row of tiles, so the panel fits a 16:9 frame. Portrait: two rows (4 + 3).
  const wide = !app.viewport.info.portrait;
  const panel = new Panel(scene, { title: app.t('core.dailyTitle'), width: wide ? 1040 : 620, height: wide ? 600 : 760, onClose: options.onClose });
  const font = { fontFamily: theme.font, resolution: app.textResolution };

  const perRow = wide ? cycle : Math.ceil(cycle / 2);
  const gap = 14;
  const tileW = Math.min(132, (panel.panelWidth - 60 - gap * (perRow - 1)) / perRow);
  const tileH = 170;
  const tiles: Phaser.GameObjects.Container[] = [];
  options.rewards.forEach((reward, i) => {
    const row = i < perRow ? 0 : 1;
    const inRow = row === 0 ? perRow : cycle - perRow;
    const col = row === 0 ? i : i - perRow;
    const x = (col - (inRow - 1) / 2) * (tileW + gap);
    const y = panel.top + 70 + row * (tileH + gap);
    const done = i < claimedCount;
    const isToday = i === today && canClaim;
    const g = scene.add.graphics();
    g.fillStyle(isToday ? theme.primary : 0xffffff, isToday ? 1 : done ? 0.05 : 0.1);
    g.fillRoundedRect(-tileW / 2, -tileH / 2 + 30, tileW, tileH, 18);
    const day = scene.add
      .text(0, -tileH / 2 + 62, app.t('core.dayN', { n: i + 1 }), {
        ...font,
        fontStyle: '900',
        fontSize: 26,
        color: isToday ? theme.primaryText : theme.textDim,
      })
      .setOrigin(0.5);
    const label = scene.add
      .text(0, tileH / 2 - 10, reward.label, {
        ...font,
        fontStyle: '700',
        fontSize: 24,
        color: isToday ? theme.primaryText : theme.text,
        align: 'center',
        wordWrap: { width: tileW - 12 },
      })
      .setOrigin(0.5, 1);
    const parts: Phaser.GameObjects.GameObject[] = [g, day, label];
    const icon = scene.add.graphics();
    if (done) checkIcon(icon, 54, 0x5ee08a);
    else reward.icon?.(icon, 56, isToday ? Phaser.Display.Color.HexStringToColor(theme.primaryText).color : (reward.iconColor ?? theme.primary));
    icon.setPosition(0, 22);
    parts.push(icon);
    const tile = scene.add.container(x, y, parts);
    if (done) tile.setAlpha(0.6);
    if (isToday) scene.tweens.add({ targets: tile, scale: 1.05, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    tiles.push(tile);
  });
  panel.content.add(tiles);

  const bottom = panel.bottom;
  if (!canClaim) {
    const msg = scene.add
      .text(0, bottom - 200, app.t('core.comeBack', { n: today + 1 }), {
        ...font,
        fontStyle: '700',
        fontSize: 32,
        color: theme.textDim,
        align: 'center',
        wordWrap: { width: panel.panelWidth - 80 },
      })
      .setOrigin(0.5);
    const close = new Button(scene, 0, bottom - 90, {
      label: app.t('core.close'),
      width: 400,
      height: 96,
      fontSize: 36,
      color: theme.surface,
      textColor: theme.surfaceText,
      onClick: () => panel.close(),
    });
    panel.content.add([msg, close]);
    return panel;
  }

  let claimed = false;
  const claim = (m: number) => {
    if (claimed) return;
    claimed = true;
    const next = claimDaily(options.state);
    options.onClaim(today, m, next);
    const tile = tiles[today];
    scene.tweens.killTweensOf(tile);
    punch(scene, tile, 0.25);
    const vp = app.viewport.info;
    burst(scene, vp.width / 2 + tile.x, vp.height / 2 + tile.y, m > 1 ? theme.reward : theme.primary, 26, 420);
    app.audio.play('reward');
    scene.time.delayedCall(500, () => panel.close());
  };
  const double = rewardButton(scene, 0, bottom - 220, {
    label: app.t('core.claimDouble', { n: mult }),
    width: 440,
    height: 104,
    fontSize: 38,
    onReward: () => claim(mult),
  });
  const plain = new Button(scene, 0, double.visible ? bottom - 92 : bottom - 140, {
    label: app.t('core.claim'),
    width: 440,
    height: 96,
    fontSize: 36,
    color: double.visible ? theme.surface : theme.primary,
    textColor: double.visible ? theme.surfaceText : theme.primaryText,
    onClick: () => claim(1),
  });
  panel.content.add([double, plain]);
  return panel;
}
