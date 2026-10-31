import { STORAGE_SUFFIX } from '../assets';
import type { Content, Difficulty, GameMode, TownDef } from '../sim';

/**
 * The campaign (CONCEPT.md §9): a side, seven towns in a row on the region map, three passes of each
 * (easy, normal, hard — every one with its own main goal), the stars won on each pass, and the one
 * reporter who goes on to the next town. Kept in the browser apart from the game save; reads and
 * writes never throw.
 */
export interface Campaign {
  side: GameMode;
  /** Best result per town id and pass. */
  results: Record<string, Partial<Record<Difficulty, { stars: number; days: number }>>>;
  /** Index of the furthest town opened. */
  reached: number;
  /** The reporter who comes along to the next town, with their experience. */
  carry: { id: string; xp: number } | null;
  /** The final is won. */
  finished: boolean;
}

/** The three passes of a town in order (CONCEPT.md §9.1). */
export const PASSES: Difficulty[] = ['easy', 'normal', 'hard'];
export const passNames: Record<Difficulty, string> = { easy: 'Первый тираж', normal: 'Второй тираж', hard: 'Третий тираж' };

const KEY = `breaking-town-campaign${STORAGE_SUFFIX}`;

export function loadCampaign(c: Content): Campaign | null {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? 'null') as (Campaign & { difficulty?: Difficulty }) | null;
    if (!data || (data.side !== 'destroy' && data.side !== 'save')) return null;
    data.results ??= {};
    // An old campaign kept one result per town, won at the campaign's difficulty: it becomes that pass.
    for (const [id, r] of Object.entries(data.results) as [string, unknown][]) {
      if (r && typeof (r as { stars?: unknown }).stars === 'number') data.results[id] = { [data.difficulty ?? 'normal']: r as { stars: number; days: number } };
    }
    delete data.difficulty;
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

export function newCampaign(side: GameMode): Campaign {
  return { side, results: {}, reached: 0, carry: null, finished: false };
}

/** Stars of a town: the best result of each pass added up (up to 9). */
export function townStars(camp: Campaign, id: string): number {
  return Object.values(camp.results[id] ?? {}).reduce((s, r) => s + (r?.stars ?? 0), 0);
}

/** Stars won in the campaign so far. */
export function campaignStars(camp: Campaign): number {
  return Object.keys(camp.results).reduce((s, id) => s + townStars(camp, id), 0);
}

/** done = won before, now = the next to play, gated = reached but short of stars, locked = ahead. */
export function townState(c: Content, camp: Campaign, i: number): 'done' | 'now' | 'gated' | 'locked' {
  const t: TownDef = c.towns[i];
  if (Object.keys(camp.results[t.id] ?? {}).length) return 'done';
  if (i > camp.reached) return 'locked';
  return campaignStars(camp) < (t.starsToEnter ?? 0) ? 'gated' : 'now';
}

/** A pass of a town: won, open to play, or locked until the pass before it is won. */
export function passState(c: Content, camp: Campaign, i: number, level: Difficulty): 'won' | 'open' | 'locked' {
  const t = c.towns[i];
  if (camp.results[t.id]?.[level]) return 'won';
  const town = townState(c, camp, i);
  if (town === 'locked' || town === 'gated') return 'locked';
  const k = PASSES.indexOf(level);
  return k === 0 || camp.results[t.id]?.[PASSES[k - 1]] ? 'open' : 'locked';
}

/** A pass won: its best result is kept, the first win opens the next town; the final ends the campaign. */
export function winTown(c: Content, camp: Campaign, id: string, level: Difficulty, result: { stars: number; days: number }): void {
  const town = (camp.results[id] ??= {});
  const old = town[level];
  if (!old || result.stars > old.stars || (result.stars === old.stars && result.days < old.days)) town[level] = result;
  const i = c.towns.findIndex((t) => t.id === id);
  if (i === camp.reached && i < c.towns.length - 1) camp.reached = i + 1;
  if (i === c.towns.length - 1) camp.finished = true;
}
