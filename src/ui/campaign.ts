import { STORAGE_SUFFIX } from '../assets';
import type { Content, Difficulty, GameMode, TownDef } from '../sim';

/**
 * The campaign (CONCEPT.md §9): a side, seven towns in a row on the region map, the stars won in
 * each, and the one reporter who goes on to the next town. Kept in the browser apart from the game
 * save; reads and writes never throw.
 */
export interface Campaign {
  side: GameMode;
  difficulty: Difficulty;
  /** Best result per town id. */
  results: Record<string, { stars: number; days: number }>;
  /** Index of the furthest town opened. */
  reached: number;
  /** The reporter who comes along to the next town, with their experience. */
  carry: { id: string; xp: number } | null;
  /** The final is won. */
  finished: boolean;
}

const KEY = `breaking-town-campaign${STORAGE_SUFFIX}`;

export function loadCampaign(c: Content): Campaign | null {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Campaign | null;
    if (!data || (data.side !== 'destroy' && data.side !== 'save')) return null;
    data.results ??= {};
    data.reached = Math.max(0, Math.min(c.towns.length - 1, data.reached ?? 0));
    // A reporter removed from the content does not come along.
    if (data.carry && !c.reporters.some((r) => r.id === data.carry!.id)) data.carry = null;
    data.finished ??= false;
    return data;
  } catch {
    return null;
  }
}

export function saveCampaign(camp: Campaign | null): void {
  try {
    if (camp) localStorage.setItem(KEY, JSON.stringify(camp));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: the campaign lives as long as the tab.
  }
}

export function newCampaign(side: GameMode, difficulty: Difficulty): Campaign {
  return { side, difficulty, results: {}, reached: 0, carry: null, finished: false };
}

/** Stars won in the campaign so far (best result of each town). */
export function campaignStars(camp: Campaign): number {
  return Object.values(camp.results).reduce((s, r) => s + r.stars, 0);
}

/** done = won before, now = the next to play, gated = reached but short of stars, locked = ahead. */
export function townState(c: Content, camp: Campaign, i: number): 'done' | 'now' | 'gated' | 'locked' {
  const t: TownDef = c.towns[i];
  if (camp.results[t.id]) return 'done';
  if (i > camp.reached) return 'locked';
  return campaignStars(camp) < (t.starsToEnter ?? 0) ? 'gated' : 'now';
}

/** A town won: its best result is kept and the next one opens; the final ends the campaign. */
export function winTown(c: Content, camp: Campaign, id: string, result: { stars: number; days: number }): void {
  const old = camp.results[id];
  if (!old || result.stars > old.stars || (result.stars === old.stars && result.days < old.days)) camp.results[id] = result;
  const i = c.towns.findIndex((t) => t.id === id);
  if (i === camp.reached && i < c.towns.length - 1) camp.reached = i + 1;
  if (i === c.towns.length - 1) camp.finished = true;
}
