// Public API of the shared framework. Game code imports from '@core'.
export { app, startGame, type GameConfig } from './app';
export { SaveStore, type SaveOptions } from './save';
export { BaseScene } from './scenes/BaseScene';
export type { ViewportInfo } from './viewport';
export { Button, type ButtonOptions } from './ui/button';
export { soundButton, rewardButton } from './ui/widgets';
export { toast } from './ui/toast';
export * as icons from './ui/icons';
export { floatText, punch, burst } from './fx';
export { formatNumber, formatDuration, formatClock } from './format';
export { secondsAway, dayKey, dailyStatus, claimDaily, FixedStep, type DailyState } from './time';
export { DebugOverlay } from './debug';
export type { Theme } from './theme';
export type { LangFile } from './i18n';
