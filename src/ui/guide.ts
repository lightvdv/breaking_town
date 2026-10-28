import guide from '../content/guide.json';
import { crimePressure, rivalStarted, templateOf, type Content, type GameMode, type GameState, type TurnReport } from '../sim';

/**
 * First-encounter notes (CONCEPT.md §7.3 «Подсказки»): the first time something new happens, a note
 * above the paper explains it, once ever. Off in the settings; the tutorial mission has its own steps
 * instead (`tutorial.ts`). The texts live in `content/guide.json`.
 */

type ByMode<T> = T | Record<GameMode, T>;
const byMode = <T>(x: ByMode<T>, mode: GameMode): T =>
  typeof x === 'object' && x !== null && 'destroy' in x ? (x as Record<GameMode, T>)[mode] : (x as T);

/** What a note's button opens: the upgrades, the newsroom, the rival's plaque. */
export type GuideAction = 'shop' | 'team' | 'rival';

export interface GuideNote {
  id: string;
  title: string;
  text: string;
  action?: { label: string; open: GuideAction };
}

const firsts = guide.firsts as { id: string; mode?: GameMode; title: ByMode<string>; text: ByMode<string>; action?: { label: string; open: GuideAction } }[];

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
  tasks: (v) => v.state.tasks.length > 0,
  twist: (v) => v.state.twist !== null && v.state.twist.result === null,
  investigation: (v) => v.state.hand.some((x) => templateOf(v.c, x.templateId).source === 'investigation'),
  // When the player is stuck (CONCEPT.md §7.3): money lying idle, a story nobody wrote, a town getting better.
  money_idle: (v) => v.state.money >= 600 && v.state.upgrades.length === 0 && v.state.turn >= 4,
  missed_story: (v) => v.state.missedEvents.length > 0 && v.state.reporters.length < 3 && v.state.turn >= 2,
  city_rising: (v) => v.state.turn >= 3 && !!v.report && v.report.metricsAfter.cityIndex > v.report.metricsBefore.cityIndex + 0.5,
  // The first time the attack's tools are at hand (CONCEPT.md §3.6а, §5.6, §8.4).
  hunt: (v) =>
    v.state.turn >= 3 &&
    v.state.hand.some((x) => x.building !== undefined && v.state.buildings[x.building]?.open && v.state.buildings[x.building].jobs > 0),
  crime: (v) => v.state.turn >= 6 && (v.state.crimeHeat >= 0.05 || crimePressure(v.state, v.c) >= 0.2),
  gang: (v) => v.state.arcs.some((a) => a.id === 'street_gang'),
  strikes: (v) => v.rivalShown && rivalStarted(v.state, v.c) && v.state.turn >= v.c.balance.rivalStartTurn[v.state.mode] + 1,
};

/** Today's notes not read yet: what appears for the first time. */
export function pendingNotes(v: GuideView, seen: string[]): GuideNote[] {
  const mode = v.state.mode;
  const out: GuideNote[] = [];
  for (const f of firsts) {
    if (seen.includes(f.id) || (f.mode && f.mode !== mode) || !firstSeen[f.id]?.(v)) continue;
    out.push({ id: f.id, title: byMode(f.title, mode), text: byMode(f.text, mode), ...(f.action ? { action: f.action } : {}) });
  }
  return out;
}
