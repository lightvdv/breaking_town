import type { Difficulty, GameMode } from '../sim';
import { STORAGE_SUFFIX } from '../assets';

/**
 * Best results by mode and difficulty (CONCEPT.md §4.8): the most stars, and with them the fewest
 * days. Kept in the browser apart from the save; reads and writes never throw.
 */
export interface GameRecord {
  stars: number;
  days: number;
}

const KEY = `breaking-town-records${STORAGE_SUFFIX}`;
const keyOf = (mode: GameMode, difficulty: Difficulty) => `${mode}|${difficulty}`;

function load(): Record<string, GameRecord> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, GameRecord>;
  } catch {
    return {};
  }
}

export function recordOf(mode: GameMode, difficulty: Difficulty): GameRecord | null {
  return load()[keyOf(mode, difficulty)] ?? null;
}

/** Keeps a won game's result if it beats the record; returns whether it did. */
export function submitRecord(mode: GameMode, difficulty: Difficulty, result: GameRecord): boolean {
  const all = load();
  const old = all[keyOf(mode, difficulty)];
  if (old && (old.stars > result.stars || (old.stars === result.stars && old.days <= result.days))) return false;
  all[keyOf(mode, difficulty)] = result;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Private mode: the record is not kept.
  }
  return true;
}

/** «★★☆» */
export const starLine = (stars: number) => '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars));
