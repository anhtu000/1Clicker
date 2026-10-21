import type { KeyValueStorage } from './storage';

interface SettingsData {
  muted: boolean;
  /** Background music switched off by the player (sound effects stay on). */
  musicOff: boolean;
  /** Short vibration on taps (Android only, iOS browsers ignore it). */
  haptics: boolean;
  /** Language the player picked. null means "follow the portal or browser". */
  lang: string | null;
  /** Canvas resolution cap chosen by the quality governor on this device (null: not measured yet). */
  renderDpr: number | null;
}

/** Player preferences, stored apart from game progress so a progress reset keeps them. */
export class Settings {
  private data: SettingsData = { muted: false, musicOff: false, haptics: true, lang: null, renderDpr: null };

  constructor(
    private storage: KeyValueStorage,
    private key: string,
  ) {
    try {
      const raw = storage.getItem(key);
      if (raw) this.data = { ...this.data, ...JSON.parse(raw) };
    } catch {
      // corrupt settings: keep defaults
    }
  }

  get muted() {
    return this.data.muted;
  }
  set muted(value: boolean) {
    this.data.muted = value;
    this.save();
  }

  get musicOff() {
    return this.data.musicOff;
  }
  set musicOff(value: boolean) {
    this.data.musicOff = value;
    this.save();
  }

  get haptics() {
    return this.data.haptics;
  }
  set haptics(value: boolean) {
    this.data.haptics = value;
    this.save();
  }

  get lang() {
    return this.data.lang;
  }
  set lang(value: string | null) {
    this.data.lang = value;
    this.save();
  }

  get renderDpr() {
    return this.data.renderDpr;
  }
  set renderDpr(value: number | null) {
    this.data.renderDpr = value;
    this.save();
  }

  private save() {
    try {
      this.storage.setItem(this.key, JSON.stringify(this.data));
    } catch {
      // storage adapters already swallow errors, this is a last guard
    }
  }
}
