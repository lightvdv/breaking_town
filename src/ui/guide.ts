import guide from '../content/guide.json';
import { templateOf, type Content, type GameMode, type GameState, type TurnReport } from '../sim';

/**
 * The gradual opening for novices (CONCEPT.md §7.3 «Постепенное открытие»): the paper's controls
 * appear one a day with a note above the paper, and the first time something new happens it gets a
 * note too. Veterans see everything at once and no notes. The texts live in `content/guide.json`.
 */

type ByMode<T> = T | Record<GameMode, T>;
const byMode = <T>(x: ByMode<T>, mode: GameMode): T =>
  typeof x === 'object' && x !== null && 'destroy' in x ? (x as Record<GameMode, T>)[mode] : (x as T);

/** Controls the novice gets day by day. */
export type Feature = 'framing' | 'price' | 'hire' | 'shop';

export interface GuideNote {
  id: string;
  title: string;
  text: string;
}

interface Unlock {
  id: string;
  turn: Record<GameMode, number>;
  title: ByMode<string>;
  text: ByMode<string>;
}

const unlocks = guide.unlocks as Unlock[];
const firsts = guide.firsts as { id: string; title: ByMode<string>; text: ByMode<string> }[];

/** The day a control opens for a novice in this mode. */
export function unlockDay(id: Feature | 'issue', mode: GameMode): number {
  return unlocks.find((u) => u.id === id)?.turn[mode] ?? 1;
}

/** What the player sees now: the first issue, the rival's plaque, the latest turn's report. */
export interface GuideView {
  state: GameState;
  c: Content;
  report: TurnReport | null;
  rivalShown: boolean;
}

/** The first time this is on screen, a note explains it. */
const firstSeen: Record<string, (v: GuideView) => boolean> = {
  conflict: (v) => v.state.hand.some((x) => !!x.conflict),
  rival: (v) => v.rivalShown,
  debunk: (v) => v.state.hand.some((x) => !!x.debunk),
  exposure: (v) => !!v.report?.exposures.length,
  arc: (v) => v.state.hand.some((x) => !!templateOf(v.c, x.templateId).arc),
  offer: (v) => !!v.state.offer,
  letters: (v) => v.state.letters.length > 0,
  investigation: (v) => v.state.hand.some((x) => templateOf(v.c, x.templateId).source === 'investigation'),
};

/** Today's notes not read yet: the day's unlock first, then what appears for the first time. */
export function pendingNotes(v: GuideView, seen: string[]): GuideNote[] {
  const mode = v.state.mode;
  const out: GuideNote[] = [];
  for (const u of unlocks) {
    if (u.turn[mode] !== v.state.turn || seen.includes(u.id)) continue;
    out.push({ id: u.id, title: byMode(u.title, mode), text: byMode(u.text, mode) });
  }
  for (const f of firsts) {
    if (seen.includes(f.id) || !firstSeen[f.id]?.(v)) continue;
    out.push({ id: f.id, title: byMode(f.title, mode), text: byMode(f.text, mode) });
  }
  return out;
}
