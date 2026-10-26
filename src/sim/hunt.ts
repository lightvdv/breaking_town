import { buildingName, clamp } from './lookup';
import type { Modifiers } from './modifiers';
import { isHarmful, type PublishedNews } from './news';
import { chance, type RngState } from './rng';
import type { Building, CardEffect, CardInstance, CardTemplate, Content, GameState } from './types';

/**
 * A hunt against one place («травля») (CONCEPT.md §3.6а): the player names a target — the factory, a shop,
 * the fact-checkers — and hits it day after day. Every day in a row with a frightening story about it
 * makes the next one hit harder; believed stories stain the place, customers stay away and workers
 * quit, and when it closes the whole town feels it.
 */

/** Places a hunt can go after: anything people work at. */
export function huntTargets(state: GameState): Building[] {
  return state.buildings.filter((x) => x.open && x.jobs > 0);
}

export function startHunt(state: GameState, buildingId: number): void {
  if (state.outcome) throw new Error('Game is over');
  const x = state.buildings[buildingId];
  if (!x || !x.open || x.jobs === 0) throw new Error(`Cannot start a hunt against ${buildingId}`);
  if (state.hunt?.building === buildingId) return;
  state.hunt = { building: buildingId, startTurn: state.turn, step: 0, hits: 0 };
}

export function endHunt(state: GameState): void {
  state.hunt = null;
}

/** Is this our story about the hunt's target, told frighteningly? */
export function isHuntStory(state: GameState, card: CardInstance, effect: CardEffect | null): boolean {
  return !!state.hunt && card.building === state.hunt.building && isHarmful(effect);
}

/** How much harder a hunt story hits: `huntStep` for every day in a row, up to `huntMaxSteps`. */
export function huntBonus(state: GameState, c: Content, mods: Modifiers): number {
  const step = Math.min(state.hunt?.step ?? 0, c.balance.huntMaxSteps);
  return 1 + c.balance.huntStep * mods.huntStepMul * step;
}

/** A long hunt draws eyes: the fact-checkers look harder at every story about its target, `huntCheckerStep` a day in a row. */
export function huntWatch(state: GameState, c: Content, card: CardInstance, effect: CardEffect | null): number {
  return isHuntStory(state, card, effect) ? 1 + c.balance.huntCheckerStep * Math.min(state.hunt!.step, c.balance.huntMaxSteps) : 1;
}

/** A template a reporter can dig up about the target: about its kind of place, frightening at some truth. */
export function huntTemplates(c: Content, target: Building, ok: (t: CardTemplate) => boolean): CardTemplate[] {
  return c.cards.filter((t) => t.requires === target.type && !t.arc && t.effects.some((e) => isHarmful(e)) && ok(t));
}

/**
 * After our issue: hunt stories stain their place by how many believed them, and the day in a row
 * counts — or the hunt cools down a step. Returns what happened for the report.
 */
export function pressHunt(state: GameState, c: Content, published: PublishedNews[], effectOf: (n: PublishedNews) => CardEffect | null): { hit: boolean; stain: number } | null {
  const camp = state.hunt;
  if (!camp) return null;
  const b = c.balance;
  let hit = false;
  let stain = state.stains[camp.building] ?? 0;
  for (const n of published) {
    const card = state.hand.find((x) => x.uid === n.pub.cardUid);
    if (!card || !isHuntStory(state, card, effectOf(n))) continue;
    hit = true;
    const believed = n.report.reached ? n.report.believed / n.report.reached : 0;
    stain = clamp(stain + b.huntStain * n.impact * believed);
  }
  state.stains[camp.building] = stain;
  if (hit) {
    camp.hits++;
    camp.step = Math.min(b.huntMaxSteps, camp.step + 1);
  } else camp.step = Math.max(0, camp.step - 1);
  return { hit, stain };
}

/** In the city's day: a stained place loses customers and workers; the stain fades. */
export function stainedChoice(state: GameState, rng: RngState, x: Building): boolean {
  return chance(rng, state.stains[x.id] ?? 0);
}

export function quitStained(state: GameState, c: Content, rng: RngState): void {
  for (const [id, stain] of Object.entries(state.stains)) {
    const x = state.buildings[Number(id)];
    if (x.open && x.type !== 'shop' && x.type !== 'entertainment') {
      for (const r of state.residents) if (r.status === 'active' && r.job === x.id && chance(rng, stain * c.balance.stainQuit)) r.job = null;
    }
    const left = stain - c.balance.stainDecay;
    if (left > 0.001) state.stains[Number(id)] = left;
    else delete state.stains[Number(id)];
  }
}

/** The new day: a closed target means the hunt is won — the town is shaken; returns its name then. */
export function settleHunt(state: GameState, c: Content): string | null {
  const camp = state.hunt;
  if (!camp || state.buildings[camp.building].open) return null;
  const name = buildingName(state, c, camp.building);
  for (const r of state.residents) if (r.status === 'active') r.mood = clamp(r.mood - c.balance.huntWinMood);
  state.hunt = null;
  return name;
}
