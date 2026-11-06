import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applyOverlay, plural, setLang, textPaths, tr } from '../src/i18n';
import en from '../src/i18n/en.json';
import overlays from '../src/content/en.json';
import { content } from '../src/content';
import { validateContent } from '../src/sim';
import { codeKeys } from '../tools/i18n/extract';

/** Russian verb endings by gender: English needs none, so their translation is empty on purpose. */
const EMPTY_OK = new Set(['а', 'ась', 'ся', 'ла', 'ел']);
const holes = (s: string) => [...s.matchAll(/\{(\d+|[a-z]+(?:\.[a-zA-Z]+)?)\}/g)].map((m) => m[1]).sort();
const dict = en as Record<string, string>;
const files = fs.readdirSync('src/content').filter((f) => f.endsWith('.json') && f !== 'en.json').map((f) => f.slice(0, -5));
const overlay = overlays as Record<string, Record<string, string>>;

describe('English (CONCEPT.md §7.5)', () => {
  it('every text the code shows has a translation with the same placeholders', () => {
    const keys = codeKeys();
    const missing = [...keys.keys()].filter((k) => !(k in dict) || (!dict[k] && !EMPTY_OK.has(k)));
    expect(missing).toEqual([]);
    // A translation may leave out a placeholder (Russian gender endings like «уехал{0}»), never add one.
    const broken = [...keys.keys()].filter((k) => dict[k] && holes(dict[k]).some((x) => !holes(k).includes(x)));
    expect(broken).toEqual([]);
    const cyrillic = Object.entries(dict).filter(([, v]) => /[А-Яа-яЁё₽]/.test(v));
    expect(cyrillic).toEqual([]);
  });

  it('every content text has an English overlay, and none is stale', () => {
    for (const name of files) {
      const paths = textPaths(JSON.parse(fs.readFileSync(`src/content/${name}.json`, 'utf8')));
      const missing = Object.keys(paths).filter((p) => !overlay[name]?.[p]);
      expect(missing, name).toEqual([]);
      const stale = Object.keys(overlay[name] ?? {}).filter((p) => !(p in paths));
      expect(stale, name).toEqual([]);
      const broken = Object.keys(paths).filter((p) => JSON.stringify(holes(paths[p])) !== JSON.stringify(holes(overlay[name][p])));
      expect(broken, name).toEqual([]);
    }
  });

  it('the English content is whole and valid', () => {
    const english = Object.fromEntries(Object.entries(content).map(([k, v]) => [k, applyOverlay(v, overlay[k])]));
    expect(Object.keys(textPaths(english))).toEqual([]);
    expect(validateContent(english as unknown as typeof content)).toEqual([]);
  });

  it('tr fills placeholders and plural follows the language', () => {
    setLang('en');
    try {
      expect(tr('Выпуск № {0}', 7)).toBe('Issue No. 7');
      expect(plural(1, 'день', 'дня', 'дней')).toBe('day');
      expect(plural(3, 'день', 'дня', 'дней')).toBe('days');
    } finally {
      setLang('ru');
    }
    expect(tr('Выпуск № {0}', 7)).toBe('Выпуск № 7');
    expect(plural(3, 'день', 'дня', 'дней')).toBe('дня');
  });
});
