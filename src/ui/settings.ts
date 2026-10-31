import type { Difficulty, GameLength } from '../sim';
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
  /** Short or full game (CONCEPT.md §4.6а): chosen in the new game window and remembered. */
  length: GameLength;
  /** First-encounter notes above the paper (CONCEPT.md §7.3 «Подсказки»); off in the settings. */
  hints: boolean;
  /** The tutorial mission was played to the end (the title screen stops offering it first). */
  tutorialDone: boolean;
  /** Notes already read: they are never shown again, in any game. */
  notesSeen: string[];
  /** The notes are unfolded; folded (the default) they are one line until opened. */
  guideOpen: boolean;
  /** The tasks plaque is unfolded (the default); folded it is one line. */
  tasksOpen: boolean;
  /** The «Редакция» plaque (promotions, quits) is unfolded; folded (the default) it is one line. */
  staffOpen: boolean;
  /** A single game in an ordinary town or a generated one (CONCEPT.md §9.5). */
  townKind: 'usual' | 'random';
  /** The seed of the generated town shown in the new game window; a new one after each start. */
  genSeed: number;
}

const KEY = `breaking-town-settings${STORAGE_SUFFIX}`;
const defaults: Settings = { fastSearch: false, skipCutscenes: false, introSeen: false, introSeenSave: false, difficulty: 'normal', rivalOpen: false, length: 'short', hints: true, tutorialDone: false, notesSeen: [], guideOpen: false, tasksOpen: true, staffOpen: false, townKind: 'usual', genSeed: 1 };

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
