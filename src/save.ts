import { SaveStore } from '@core';

// Progress data of this game. Everything here is saved automatically.
export interface SaveData {
  coins: number;
  perTap: number;
  perSecond: number;
  taps: number;
}

export const save = new SaveStore<SaveData>({
  key: `${__GAME_ID__}.save`,
  version: 1,
  defaults: () => ({ coins: 0, perTap: 1, perSecond: 0, taps: 0 }),
});
