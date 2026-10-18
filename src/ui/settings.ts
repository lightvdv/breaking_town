/**
 * Player settings (CONCEPT.md §7.3 «Настройки»): kept in the browser apart from the save, so a new
 * game keeps them. Reads and writes never throw.
 */
export interface Settings {
  theme: 'auto' | 'light' | 'dark';
  /** Show the reporters' finds at once instead of one by one. */
  fastSearch: boolean;
  /** Skip the city cutscenes of bright days. */
  skipCutscenes: boolean;
  /** The opening story was shown (it plays only before the first game). */
  introSeen: boolean;
}

const KEY = 'breaking-town-settings';
const defaults: Settings = { theme: 'auto', fastSearch: false, skipCutscenes: false, introSeen: false };

export function loadSettings(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...defaults };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Private mode or full storage: settings just are not remembered.
  }
  applyTheme(s);
}

/** Light or dark palette; "auto" follows the system. */
export function applyTheme(s: Settings): void {
  if (s.theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = s.theme;
}
