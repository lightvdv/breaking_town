import type { Difficulty } from '../sim';
import { STORAGE_SUFFIX } from '../assets';
/**
 * Player settings (CONCEPT.md §7.3 «Настройки»): kept in the browser apart from the save, so a new
 * game keeps them. Reads and writes never throw.
 */
export interface Settings {
  /** Show the reporters' finds at once instead of one by one. */
  fastSearch: boolean;
  /** Skip the city cutscenes of bright days. */
  skipCutscenes: boolean;
  /** The opening story was shown (it plays only before the first game of each mode). */
  introSeen: boolean;
  introSeenSave: boolean;
  /** The difficulty of new games (CONCEPT.md §4.6). */
  difficulty: Difficulty;
  /** The rival paper's stories are unfolded above the issue; once opened they stay open on the next days. */
  rivalOpen: boolean;
}

const KEY = `breaking-town-settings${STORAGE_SUFFIX}`;
const defaults: Settings = { fastSearch: false, skipCutscenes: false, introSeen: false, introSeenSave: false, difficulty: 'normal', rivalOpen: false };

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
}
