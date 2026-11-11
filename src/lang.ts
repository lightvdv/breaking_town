/**
 * Picks the language before any other module is evaluated (imported first by main.ts), since labels are
 * translated when their modules load (CONCEPT.md §7.5). Order: `?lang=` in the address, the player's
 * choice in the settings, a Russian-speaking browser (ru/uk/be/kk → Russian, also in the itch.io build),
 * then the build's default (`VITE_LANG`, the itch.io build is English), else English.
 */
import { setLang, type Lang } from './i18n';
import { STORAGE_SUFFIX } from './assets';

export const LANG_KEY = `breaking-town-lang${STORAGE_SUFFIX}`;

function pick(): Lang {
  const ok = (x: string | null | undefined): x is Lang => x === 'ru' || x === 'en';
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (ok(q)) return q;
    const saved = localStorage.getItem(LANG_KEY);
    if (ok(saved)) return saved;
  } catch {
    // No storage: fall through to the defaults.
  }
  if (/^(ru|uk|be|kk)\b/i.test(navigator.language ?? '')) return 'ru';
  const env = import.meta.env.VITE_LANG as string | undefined;
  return ok(env) ? env : 'en';
}

const chosen = pick();
setLang(chosen);
document.documentElement.lang = chosen;
if (chosen === 'en') document.title = 'Breaking Town';

/** Remembers the player's language and reloads the page in it. */
export function chooseLang(l: Lang): void {
  const url = new URL(location.href);
  url.searchParams.delete('lang');
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    // Not remembered: the page still reloads in it once.
    url.searchParams.set('lang', l);
  }
  location.replace(url.toString());
}
