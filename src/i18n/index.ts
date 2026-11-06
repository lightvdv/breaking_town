/**
 * Localization (CONCEPT.md §7.5). The game is written in Russian: a Russian string is its own key. `t`
 * looks it up in the current language's dictionary (`en.json`), fills `{0}`, `{1}`… with the arguments and
 * falls back to the Russian text when a translation is missing. Content JSON is localized by overlays
 * (`applyOverlay`, paths from `textPaths`). Pure: no DOM, so the sim may use it too; the browser picks the
 * language in `src/lang.ts` before anything else is evaluated.
 */
import en from './en.json';

export type Lang = 'ru' | 'en';
export const LANGS: { id: Lang; name: string }[] = [
  { id: 'en', name: 'English' },
  { id: 'ru', name: 'Русский' },
];

const dicts: Record<Lang, Record<string, string> | null> = { ru: null, en: en as Record<string, string> };
let current: Lang = 'ru';

export function setLang(l: Lang): void {
  current = l;
}

export function lang(): Lang {
  return current;
}

function fill(s: string, args: unknown[]): string {
  return args.length ? s.replace(/\{(\d+)\}/g, (m, i) => (Number(i) < args.length ? String(args[Number(i)]) : m)) : s;
}

/** The text in the current language; `{0}`, `{1}`… take the arguments. */
export function tr(ru: string, ...args: unknown[]): string {
  const d = dicts[current];
  const s = d ? (d[ru] ?? ru) : ru;
  return fill(s, args);
}

/**
 * A word by number. Russian has three forms (1 читатель, 2 читателя, 5 читателей); another language takes
 * the translation of the first form for one and of the third for any other number.
 */
export function plural(n: number, one: string, few: string, many: string): string {
  if (current !== 'ru') return tr(Math.abs(n) === 1 ? one : many);
  const m10 = Math.abs(n) % 10;
  const m100 = Math.abs(n) % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

type Json = unknown;

function isRecord(x: Json): x is Record<string, Json> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

/** The key of an array item in a path: its `id` when it has one, else its index. */
function itemKey(x: Json, i: number): string {
  return isRecord(x) && typeof x.id === 'string' ? x.id : String(i);
}

/**
 * Applies a language's overlay to a content object (a copy): the overlay maps paths to texts, a path
 * being keys joined by `/`, where an array item is entered by its `id` when it has one, else by index
 * (`cards/factory_layoffs/titles/1`). Paths that no longer exist are skipped.
 */
export function applyOverlay<T>(base: T, overlay: Record<string, string> | undefined): T {
  if (!overlay) return base;
  const out = JSON.parse(JSON.stringify(base)) as Json;
  for (const [path, text] of Object.entries(overlay)) {
    const keys = path.split('/');
    let node: Json = out;
    for (let i = 0; i < keys.length - 1 && node !== undefined; i++) node = child(node, keys[i]);
    const last = keys[keys.length - 1];
    if (Array.isArray(node)) {
      const idx = node.findIndex((x, i) => itemKey(x, i) === last);
      if (idx >= 0 && typeof node[idx] === 'string') node[idx] = text;
    } else if (isRecord(node) && typeof node[last] === 'string') node[last] = text;
  }
  return out as T;
}

function child(node: Json, key: string): Json {
  if (Array.isArray(node)) return node.find((x, i) => itemKey(x, i) === key);
  return isRecord(node) ? node[key] : undefined;
}

/** Every text of a content object that needs translating (Russian or roubles), by path as `applyOverlay` reads them. */
export function textPaths(base: Json, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  const at = (k: string) => (prefix ? `${prefix}/${k}` : k);
  if (typeof base === 'string') {
    if (/[А-Яа-яЁё₽]/.test(base)) out[prefix] = base;
  } else if (Array.isArray(base)) base.forEach((x, i) => textPaths(x, at(itemKey(x, i)), out));
  else if (isRecord(base)) for (const [k, v] of Object.entries(base)) textPaths(v, at(k), out);
  return out;
}

/** Text in the language's quotation marks: «…» in Russian, “…” in English. */
export function quoted(s: string): string {
  return current === 'ru' ? `«${s}»` : `“${s}”`;
}
