import { applyCityEffect } from './city';
import { getModifiers } from './modifiers';
import { groupOf, templateOf } from './lookup';
import type { PublishedNews } from './news';
import { isRecent, scopeOf } from './reporters';
import { chance, pick, weightedPick, type RngState } from './rng';
import type { CardTemplate, Content, GameState } from './types';

/**
 * Crime (CONCEPT.md §5.6): fear makes itself come true. The more people are afraid of crime or out
 * of work, the more real robberies, burglaries and fights happen — and every one of them frightens
 * more people. A police station holds it back; a gang that took the town pushes it for good.
 */

/**
 * How ripe the town is for crime, 0..1: the heat our crime stories raised, the jobless, the gang
 * that stayed — held back by the police while it is open.
 */
export function crimePressure(state: GameState, c: Content): number {
  const b = c.balance;
  const active = state.residents.filter((r) => r.status === 'active');
  if (!active.length) return 0;
  const jobless = active.filter((r) => r.job === null && groupOf(c, r.group).jobs.length > 0).length;
  const base = state.crimeHeat + (jobless / active.length) * b.crimeJobless + state.crimeBoost;
  return Math.min(1, base * (policeHolds(state) ? b.policeCrimeMul : 1));
}

/**
 * Crime on the streets, 0..1: the heat of our crime stories and the gang, held back by the police.
 * Unlike `crimePressure` it leaves the jobless out — order already counts them on their own.
 */
export function streetCrime(state: GameState, c: Content): number {
  return Math.min(1, (state.crimeHeat + state.crimeBoost) * (policeHolds(state) ? c.balance.policeCrimeMul : 1));
}

/**
 * After our issue: crime stories that were believed heat the town up — people talk of nothing else,
 * the bold get bolder; the heat cools down by `crimeHeatDecay` a day. Returns the heat.
 */
export function heatCrime(state: GameState, c: Content, published: PublishedNews[]): number {
  const b = c.balance;
  let heat = state.crimeHeat * (1 - b.crimeHeatDecay);
  for (const n of published) {
    const card = state.hand.find((x) => x.uid === n.pub.cardUid);
    if (!card || templateOf(c, card.templateId).topic !== 'crime' || !n.report.reached) continue;
    heat += b.crimeHeatGain * n.impact * b.impactNorm * (n.report.believed / n.report.reached) * getModifiers(state, c).crimeHeatMul;
  }
  state.crimeHeat = Math.min(1, heat);
  return state.crimeHeat;
}

/** Is there a police station still open (towns without one have none to lose)? */
export function policeHolds(state: GameState): boolean {
  return state.buildings.some((x) => x.type === 'police' && x.open);
}

/** The town once had police and it closed: order suffers on top of the crime. */
export function policeLost(state: GameState): boolean {
  return state.buildings.some((x) => x.type === 'police') && !policeHolds(state);
}

/**
 * The day's real crime, on top of the ordinary events: up to `crimeMaxEvents`, each with chance
 * `crimeBase` + `crimeSpiral` × pressure. They frighten people by themselves and become true stories.
 */
export function crimeEvents(state: GameState, c: Content, rng: RngState, taken: CardTemplate[]): CardTemplate[] {
  const b = c.balance;
  const p = b.crimeBase + b.crimeSpiral * crimePressure(state, c);
  const pool = c.cards.filter(
    (t) =>
      t.source === 'event' &&
      t.topic === 'crime' &&
      !t.arc &&
      !t.response &&
      !t.conflict &&
      scopeOf(t) === 'local' &&
      !taken.includes(t) &&
      (!t.requires || state.buildings.some((x) => x.type === t.requires && x.open)) &&
      !isRecent(state, c, t.id),
  );
  const out: CardTemplate[] = [];
  for (let i = 0; i < b.crimeMaxEvents && pool.length && chance(rng, p); i++) {
    const tpl = weightedPick(rng, pool.map((x) => ({ x, weight: x.weight }))).x;
    pool.splice(pool.indexOf(tpl), 1);
    state.lastSeen[tpl.id] = state.turn;
    if (tpl.cityEffect) applyCityEffect(state, rng, tpl.cityEffect, c);
    state.todayEvents.push(tpl.titles[0] ?? tpl.id);
    out.push(tpl);
  }
  return out;
}

/**
 * The town answers fear (CONCEPT.md §5.6): while crime runs hot (`crimeResponseHeat`) the police or
 * the mayor may act — a raid, patrols — with chance `crimeResponseChance` a day. The answer cools the
 * heat at once and is a true reassuring event.
 */
export function crimeResponse(state: GameState, c: Content, rng: RngState): CardTemplate[] {
  const b = c.balance;
  if (state.crimeHeat < b.crimeResponseHeat || !chance(rng, b.crimeResponseChance)) return [];
  const pool = c.cards.filter((t) => t.response && (!t.requires || state.buildings.some((x) => x.type === t.requires && x.open)) && !isRecent(state, c, t.id));
  if (!pool.length) return [];
  const tpl = pick(rng, pool);
  state.lastSeen[tpl.id] = state.turn;
  if (tpl.cityEffect) applyCityEffect(state, rng, tpl.cityEffect, c);
  state.todayEvents.push(tpl.titles[0] ?? tpl.id);
  return [tpl];
}

/** A gang comes when order breaks down: the gang arc starts by itself (CONCEPT.md §3.1а). */
export function gangDue(state: GameState, c: Content): boolean {
  return state.metrics.order < c.balance.gangOrder && !state.arcsDone.includes('street_gang');
}
