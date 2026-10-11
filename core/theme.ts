/** Look of the shared UI. Each game passes its own values to startGame. */
export interface Theme {
  /** CSS font-family. The font must be bundled (see core/fonts.ts), never loaded from the web. */
  font: string;
  /** Page and letterbox color. */
  background: string;
  /** Main text color. */
  text: string;
  /** Secondary text color. */
  textDim: string;
  /** Primary button. */
  primary: number;
  primaryText: string;
  /** Secondary button and panels. */
  surface: number;
  surfaceText: string;
  /** Rewarded-ad accent, so ad buttons are always recognisable. */
  reward: number;
  rewardText: string;
  /** Corner radius in design units. */
  radius: number;
}

export const defaultTheme: Theme = {
  font: 'Nunito, system-ui, sans-serif',
  background: '#14122b',
  text: '#ffffff',
  textDim: '#b9b4d9',
  primary: 0xffb020,
  primaryText: '#2a1a00',
  surface: 0x2a2650,
  surfaceText: '#ffffff',
  reward: 0x2ecc71,
  rewardText: '#062b16',
  radius: 22,
};

/** "#ff0000" -> 0xff0000 */
export function hexToNumber(color: string): number {
  return parseInt(color.replace('#', ''), 16);
}
