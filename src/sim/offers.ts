import { buildingDefOf, clamp, templateOf } from './lookup';
import { isHarmful, storyEffect } from './news';
import { chance, pick, type RngState } from './rng';
import type { CardInstance, Content, Deal, GameState, OfferDef, Publication } from './types';

export function offerOf(c: Content, id: string): OfferDef {
  const o = c.offers.find((x) => x.id === id);
  if (!o) throw new Error(`Unknown offer: ${id}`);
  return o;
}

/** The own name of a place, «Колосок», or the kind of place when it has none. */
function placeName(state: GameState, c: Content, id: number): string {
  const x = state.buildings[id];
  const def = buildingDefOf(c, x.type);
  const k = state.buildings.filter((y) => y.type === x.type).indexOf(x);
  return def.names?.length ? def.names[k % def.names.length] : def.name;
}

/** The offer's text with the place, the money and the days filled in. */
export function offerText(state: GameState, c: Content, def: OfferDef, building?: number): string {
  return def.text
    .replace('{place}', building !== undefined ? placeName(state, c, building) : '')
    .replace('{amount}', `${def.amount ?? 0} ₽`)
    .replace('{days}', String(def.days ?? 0));
}

/**
 * The day's offer (CONCEPT.md §3.5а): yesterday's lapses, finished deals end, and now and then
 * somebody comes with money or a folder. Returns notes for the turn report.
 */
export function advanceOffers(state: GameState, c: Content, rng: RngState): string[] {
  const b = c.balance;
  const notes: string[] = [];
  state.offer = null;
  for (const deal of state.deals.filter((x) => x.untilTurn < state.turn)) notes.push(`Сделка «${offerOf(c, deal.id).title}» закончилась`);
  state.deals = state.deals.filter((x) => x.untilTurn >= state.turn);
  if (state.turn < b.offerStartTurn || state.turn - state.lastOfferTurn < b.offerCooldown || !chance(rng, b.offerChance)) return notes;
  const pool = c.offers.filter(
    (o) =>
      (!o.mode || o.mode === state.mode) &&
      (!o.requires || state.buildings.some((x) => x.type === o.requires && x.open)) &&
      !state.deals.some((d) => d.id === o.id) &&
      !(o.kind === 'kompromat' && o.template && state.lastSeen[o.template] !== undefined),
  );
  if (!pool.length) return notes;
  const def = pick(rng, pool);
  const places = def.kind === 'silence' ? state.buildings.filter((x) => x.type === def.requires && x.open) : [];
  state.offer = { id: def.id, ...(places.length ? { building: pick(rng, places).id } : {}) };
  state.lastOfferTurn = state.turn;
  return notes;
}

/**
 * The player's answer. Accepting a silence deal pays at once, a subsidy pays every day, a
 * kompromat comes into the hand as a sensation — maybe a fake. Returns the kompromat card if any.
 */
export function answerOffer(state: GameState, c: Content, accept: boolean): CardInstance | null {
  if (state.outcome) throw new Error('Game is over');
  const offer = state.offer;
  if (!offer) throw new Error('No offer today');
  state.offer = null;
  if (!accept) return null;
  const def = offerOf(c, offer.id);
  if (def.kind === 'kompromat') {
    const tpl = templateOf(c, def.template!);
    state.lastSeen[tpl.id] = state.turn;
    // One sensation a day: with one already in hand the dirt comes as an interesting story.
    const tier = state.hand.some((x) => x.tier === 3) ? 2 : 3;
    const card: CardInstance = {
      uid: state.nextUid++,
      templateId: tpl.id,
      baseTruth: tpl.baseTruth,
      createdTurn: state.turn,
      tier,
      scope: 'local',
      reporterId: state.reporters[0] ?? '',
      ...(chance(state.rng, def.setupChance ?? 0) ? { setup: true } : {}),
    };
    state.hand.push(card);
    return card;
  }
  const deal: Deal = { id: def.id, untilTurn: state.turn + (def.days ?? 1) - 1, ...(offer.building !== undefined ? { building: offer.building } : {}) };
  if (def.kind === 'silence') state.money += def.amount ?? 0;
  state.deals.push(deal);
  return null;
}

/** Would publishing this story like this break a deal in force? Returns the deal. */
export function dealBrokenBy(state: GameState, c: Content, card: CardInstance, distortion: number): Deal | null {
  const tpl = templateOf(c, card.templateId);
  if (!isHarmful(storyEffect(c, card, distortion))) return null;
  for (const deal of state.deals) {
    const def = offerOf(c, deal.id);
    if (def.kind === 'silence' && card.building !== undefined && card.building === deal.building) return deal;
    if (def.kind === 'subsidy' && tpl.topic === def.topic) return deal;
  }
  return null;
}

/**
 * After the issue: broken deals cost money and reputation, the subsidy pays and wears reputation
 * down (readers smell a bought paper).
 */
export function settleDeals(state: GameState, c: Content, published: Publication[]): { paid: number; broken: string[] } {
  const broken: string[] = [];
  for (const p of published) {
    const card = state.hand.find((x) => x.uid === p.cardUid);
    const deal = card && dealBrokenBy(state, c, card, p.distortion);
    if (!deal) continue;
    const def = offerOf(c, deal.id);
    state.money -= def.penalty ?? 0;
    for (const r of state.residents) if (r.status === 'active') r.trust = clamp(r.trust - (def.trustPenalty ?? 0), 0, 100);
    state.deals = state.deals.filter((x) => x !== deal);
    broken.push(def.title);
  }
  let paid = 0;
  for (const deal of state.deals) {
    const def = offerOf(c, deal.id);
    if (def.kind !== 'subsidy') continue;
    paid += def.amount ?? 0;
    for (const r of state.residents) if (r.status === 'active') r.trust = clamp(r.trust - (def.trustDrain ?? 0), 0, 100);
  }
  state.money += paid;
  return { paid, broken };
}
