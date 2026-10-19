import { applyCityEffect } from './city';
import { templateOf } from './lookup';
import { chance, pick, type RngState } from './rng';
import type { ArcDef, ArcState, CardInstance, CardTemplate, Content, GameState, Placement } from './types';

/** Days an arc lasts: its stages and the ending. */
export const ARC_DAYS = 4;

export function arcOf(c: Content, id: string): ArcDef {
  const a = c.arcs.find((x) => x.id === id);
  if (!a) throw new Error(`Unknown arc: ${id}`);
  return a;
}

function canStart(state: GameState, a: ArcDef): boolean {
  return !a.requires || state.buildings.some((x) => x.type === a.requires && x.open);
}

/** Where the arc is heading now: > 0 to the bad ending, the press and the mood both count. */
export function arcLean(state: GameState, c: Content, arc: ArcState): number {
  const b = c.balance;
  return arc.pressure + b.arcMoodBias * (b.arcMoodPivot - state.metrics.mood);
}

/**
 * A day of the story arcs (CONCEPT.md §3.1а): running arcs move to their next stage, after the third
 * the ending comes, bad or good by the pressure of the press and the city's mood; a new arc may begin.
 * Returns today's arc templates (they are today's events: a reporter always writes them up).
 */
export function advanceArcs(state: GameState, c: Content, rng: RngState): { events: CardTemplate[]; notes: string[] } {
  const b = c.balance;
  const events: CardTemplate[] = [];
  const notes: string[] = [];
  for (const arc of [...state.arcs]) {
    const def = arcOf(c, arc.id);
    if (arc.stage < def.stages.length) {
      events.push(templateOf(c, def.stages[arc.stage++]));
      continue;
    }
    const bad = arcLean(state, c, arc) > 0;
    const tpl = templateOf(c, bad ? def.bad : def.good);
    events.push(tpl);
    if (tpl.cityEffect) applyCityEffect(state, rng, tpl.cityEffect);
    notes.push(`Сюжет «${def.name}» закончился ${bad ? 'плохо' : 'хорошо'}`);
    state.arcs = state.arcs.filter((x) => x !== arc);
  }
  if (state.turn >= b.arcStartTurn && state.arcs.length < b.arcsMax && chance(rng, b.arcChance)) {
    const pool = c.arcs.filter((a) => !state.arcsDone.includes(a.id) && canStart(state, a));
    if (pool.length) {
      const def = pick(rng, pool);
      state.arcs.push({ id: def.id, stage: 1, pressure: 0, startTurn: state.turn });
      state.arcsDone.push(def.id);
      events.push(templateOf(c, def.stages[0]));
    }
  }
  // Arc stages are news of the day, whether or not they happened as facts (a rumor stage did not).
  for (const t of events) if (t.source === 'event') state.todayEvents.push(t.titles[0] ?? t.id);
  return { events, notes };
}

/** A published stage pushes its arc: inflamed to the bad ending, soothed to the good one. */
export function pushArc(state: GameState, c: Content, card: CardInstance, placement: Placement, distortion: number): void {
  const tpl = templateOf(c, card.templateId);
  if (!tpl.arc || typeof tpl.arcStage !== 'number') return;
  const arc = state.arcs.find((x) => x.id === tpl.arc);
  if (arc) arc.pressure += distortion * c.balance.arcPlacementWeight[placement];
}

/** The arc kicker of a card: «Завод закроют? · день 2 из 4». Null for ordinary stories. */
export function arcInfo(
  state: GameState,
  c: Content,
  card: CardInstance,
): { name: string; day: number; days: number; lean: number | null } | null {
  const tpl = templateOf(c, card.templateId);
  if (!tpl.arc) return null;
  const def = arcOf(c, tpl.arc);
  const arc = state.arcs.find((x) => x.id === tpl.arc);
  return {
    name: def.name,
    day: typeof tpl.arcStage === 'number' ? tpl.arcStage : ARC_DAYS,
    days: ARC_DAYS,
    lean: arc ? arcLean(state, c, arc) : null,
  };
}

