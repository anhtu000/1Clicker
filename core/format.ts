// Number and time formatting for big idle numbers (CLAUDE.md 4.3: K/M/B/T).

const SUFFIXES = ['', 'K', 'M', 'B', 'T'];

/** Suffix for 1000^tier. After T comes aa, ab ... az, ba ... (common idle-game style). */
function suffixFor(tier: number): string {
  if (tier < SUFFIXES.length) return SUFFIXES[tier];
  const n = tier - SUFFIXES.length; // 0 => "aa"
  const first = String.fromCharCode(97 + Math.floor(n / 26));
  const second = String.fromCharCode(97 + (n % 26));
  return first + second;
}

/**
 * 999 -> "999", 1234 -> "1.23K", 12345 -> "12.3K", 1.5e9 -> "1.50B".
 * Always 3 significant digits above 1000, so the width stays stable while numbers grow.
 * Values are rounded down so the player never sees more than they have.
 * Below 1000, `decimals` controls small values such as "2.5/s".
 */
export function formatNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return value > 0 ? '∞' : '-∞';
  if (value < 0) return '-' + formatNumber(-value, decimals);
  if (value < 1000) {
    const factor = 10 ** decimals;
    const floored = Math.floor(value * factor + 1e-9) / factor;
    return decimals > 0 ? trimZeros(floored.toFixed(decimals)) : String(floored);
  }
  let tier = Math.floor(Math.log10(value) / 3);
  let scaled = value / 1000 ** tier;
  // Floating point can give 999.9999 for an exact 1e6. Fix the tier before rounding.
  if (scaled >= 1000) {
    tier += 1;
    scaled /= 1000;
  }
  const digits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;
  const factor = 10 ** digits;
  const floored = Math.floor(scaled * factor + 1e-9) / factor;
  return floored.toFixed(digits) + suffixFor(tier);
}

function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text;
}

/** Unit labels, so formatDuration can follow the current language. */
export interface DurationUnits {
  d: string;
  h: string;
  m: string;
  s: string;
}

const EN_UNITS: DurationUnits = { d: 'd', h: 'h', m: 'm', s: 's' };

/** 45 -> "45s", 200 -> "3m 20s", 3900 -> "1h 05m", 90000 -> "1d 1h". Shows at most 2 units. */
export function formatDuration(totalSeconds: number, units: DurationUnits = EN_UNITS): string {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (d > 0) return `${d}${units.d} ${h}${units.h}`;
  if (h > 0) return `${h}${units.h} ${pad(m)}${units.m}`;
  if (m > 0) return `${m}${units.m} ${pad(s)}${units.s}`;
  return `${s}${units.s}`;
}

/** Cooldown countdown, rounded up to whole seconds: 151 -> "2:31", 9 -> "0:09". */
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Stopwatch style for speedrun timers: 75.4 -> "1:15.40", 3725 -> "1:02:05.00". */
export function formatClock(totalSeconds: number): string {
  const cs = Math.max(0, Math.floor(totalSeconds * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}.${pad(c)}` : `${m}:${pad(s)}.${pad(c)}`;
}
