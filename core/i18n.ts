import type { DurationUnits } from './format';

/** A language file: nested objects of strings. Keys are joined with dots: { menu: { play: 'Play' } } -> "menu.play". */
export interface LangFile {
  [key: string]: string | LangFile;
}

/** Languages that Yandex wants shown in Russian (CLAUDE.md section 6). */
const RUSSIAN_GROUP = ['ru', 'be', 'kk', 'uk', 'uz'];

function flatten(file: LangFile, prefix = '', out: Record<string, string> = {}) {
  for (const [key, value] of Object.entries(file)) {
    const full = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'string') out[full] = value;
    else flatten(value, full, out);
  }
  return out;
}

/**
 * Strings live in JSON files, one per language (src/i18n/en.json ...).
 * English is the fallback for any key a translation is missing.
 *   t('shop.buy')                    -> "Buy"
 *   t('offline.earned', { n: '1.2K' }) -> "You earned 1.2K while away"
 */
export class I18n {
  private tables: Record<string, Record<string, string>> = {};
  private warned = new Set<string>();
  lang: string;

  constructor(
    files: Record<string, LangFile>,
    private fallback = 'en',
  ) {
    for (const [lang, file] of Object.entries(files)) this.tables[lang] = flatten(file);
    if (!this.tables[fallback]) throw new Error(`Missing fallback language "${fallback}"`);
    this.lang = fallback;
  }

  get languages(): string[] {
    return Object.keys(this.tables);
  }

  /** Picks the best language we have for a locale like "ru-RU", "pt-BR" or "tr". */
  match(locale: string | null | undefined): string {
    if (!locale) return this.fallback;
    const primary = locale.toLowerCase().split(/[-_]/)[0];
    if (this.tables[primary]) return primary;
    if (RUSSIAN_GROUP.includes(primary) && this.tables.ru) return 'ru';
    return this.fallback;
  }

  set(lang: string) {
    this.lang = this.tables[lang] ? lang : this.fallback;
    document.documentElement.lang = this.lang;
  }

  has(key: string) {
    return key in this.tables[this.lang] || key in this.tables[this.fallback];
  }

  t(key: string, vars?: Record<string, string | number>): string {
    let text = this.tables[this.lang][key] ?? this.tables[this.fallback][key];
    if (text == null) {
      if (!this.warned.has(key)) {
        this.warned.add(key);
        console.warn(`[i18n] missing key "${key}"`);
      }
      return key;
    }
    if (vars) text = text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
    return text;
  }

  /** Name of a language in that language, from the "lang.name" key of its file. */
  nameOf(lang: string): string {
    return this.tables[lang]?.['lang.name'] ?? lang;
  }

  /** Every string of the current language joined, so the font loader fetches the right glyph sets. */
  sampleText(): string {
    return Object.values(this.tables[this.lang]).join('');
  }

  durationUnits(): DurationUnits {
    return { d: this.t('unit.d'), h: this.t('unit.h'), m: this.t('unit.m'), s: this.t('unit.s') };
  }
}
