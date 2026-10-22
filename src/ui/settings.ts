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
  /**
   * Novice: the paper's controls open day by day with notes (CONCEPT.md §7.3); veteran: all at once.
   * Chosen in the new game window and remembered for the next games.
   */
  experience: 'novice' | 'veteran';
  /** Notes of the gradual opening already read: they are never shown again, in any game. */
  notesSeen: string[];
  /** The novice's notes are unfolded; folded (the default) they are one line until opened. */
  guideOpen: boolean;
}

const KEY = `breaking-town-settings${STORAGE_SUFFIX}`;
const defaults: Settings = { fastSearch: false, skipCutscenes: false, introSeen: false, introSeenSave: false, difficulty: 'normal', rivalOpen: false, experience: 'novice', notesSeen: [], guideOpen: false };

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
