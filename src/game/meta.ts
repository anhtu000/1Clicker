import Phaser from 'phaser';
import { app, dailyDayIndex, dailyStatus, formatNumber, Panel, showDailyPanel, toast } from '@core';
import { Run } from '../logic/run.ts';
import { crystalIcon, CRYSTAL_COLOR, ENERGY_COLOR, energyIcon } from '../render/icons';
import { save } from '../save';
import { content } from './content';

// Things around the runs, shared by the play screen and the home screen: crystals and the daily gift.

/** Adds crystals and says so. */
export function addCrystals(scene: Phaser.Scene, n: number, quiet = false) {
  save.data.crystals += n;
  save.flush();
  if (!quiet) toast(scene, app.t('crystal.got', { n }));
}

export function dailyClaimable(): boolean {
  return dailyStatus(save.data.daily).canClaim;
}

/** The daily gift opens by itself once per session, on whichever screen comes first. */
let dailyOffered = false;
export function takeDailyOffer(): boolean {
  if (dailyOffered || !dailyClaimable()) return false;
  dailyOffered = true;
  return true;
}

/** The main run, for energy rewards. Uses the run on screen when it is the main one. */
function mainRun(onScreen: Run | null): Run | null {
  if (onScreen && onScreen.s.mode === 'main') return onScreen;
  return save.data.run ? new Run(content, save.data.run, save.data.codex) : null;
}

/**
 * The 7-day gift (CLAUDE.md 4b): minutes of active income for the main run, and crystals.
 * Energy always goes to the main run, so a timed run's record stays fair.
 */
export function openDaily(scene: Phaser.Scene, onScreen: Run | null, onClaimed?: () => void, onClose?: () => void): Panel {
  const days = content.economy.daily;
  const views = days.map((d) =>
    d.crystals
      ? { label: app.t('daily.crystals', { n: d.crystals }), icon: crystalIcon, iconColor: CRYSTAL_COLOR }
      : { label: app.t('daily.energy', { n: d.energyMin ?? 0 }), icon: energyIcon, iconColor: ENERGY_COLOR },
  );
  return showDailyPanel(scene, {
    state: save.data.daily,
    rewards: views,
    adMultiplier: content.economy.rewarded.dailyMult,
    onClaim: (i, mult, next) => {
      save.data.daily = next;
      const day = days[i];
      const parts: string[] = [];
      if (day.crystals) {
        save.data.crystals += day.crystals * mult;
        parts.push(app.t('crystal.got', { n: day.crystals * mult }));
      }
      if (day.energyMin) {
        const run = mainRun(onScreen);
        if (run) {
          const energy = Math.max(10, Math.round(run.activeIncome() * 60 * day.energyMin * mult));
          run.addEnergy(energy);
          parts.push(`+${formatNumber(energy)}`);
        }
      }
      save.flush();
      if (parts.length) toast(scene, parts.join('  '));
      onClaimed?.();
    },
    onClose,
  });
}

/** Today's tile, for a hint on the menu. */
export function dailyToday() {
  return dailyDayIndex(save.data.daily, content.economy.daily.length);
}
