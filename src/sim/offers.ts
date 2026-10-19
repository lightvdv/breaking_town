import { buildingDefOf, clamp, templateOf } from './lookup';
import { isHarmful, storyEffect } from './news';
import { reporterOf } from './reporters';
import { chance, pick, type RngState } from './rng';
import { poachTarget, removeReporter, staffOf } from './staff';
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

/** What keeping a lured reporter costs: a bonus of a few salaries. */
export function retainCost(c: Content, reporterId: string): number {
  return reporterOf(c, reporterId).salary * c.balance.poachRetain;
}

/** The offer's text with the place, the reporter, the money and the days filled in. */
export function offerText(state: GameState, c: Content, def: OfferDef, offer: { building?: number; reporterId?: string }): string {
  const amount = def.kind === 'poach' && offer.reporterId ? retainCost(c, offer.reporterId) : (def.amount ?? 0);
  return def.text
    .replace('{place}', offer.building !== undefined ? placeName(state, c, offer.building) : '')
    .replace('{reporter}', offer.reporterId ? reporterOf(c, offer.reporterId).name : '')
    .replace('{amount}', `${amount} ₽`)
    .replace('{days}', String(def.days ?? 0));
}

/**
 * The day's offer (CONCEPT.md §3.5а): yesterday's lapses, finished deals end, and now and then
 * somebody comes with money or a folder. Returns notes for the turn report.
 */
export function advanceOffers(state: GameState, c: Content, rng: RngState): string[] {
  const b = c.balance;
  const notes: string[] = [];
  // A lured reporter we did not answer for goes over to the rival.
  if (state.offer && offerOf(c, state.offer.id).kind === 'poach') {
    const id = state.offer.reporterId!;
    if (state.reporters.includes(id)) notes.push(`${reporterOf(c, id).name} ${reporterOf(c, id).female ? 'ушла' : 'ушёл'} к конкуренту`);
    defect(state, c, id);
  }
  state.offer = null;
  for (const deal of state.deals.filter((x) => x.untilTurn < state.turn)) notes.push(`Сделка «${offerOf(c, deal.id).title}» закончилась`);
  state.deals = state.deals.filter((x) => x.untilTurn >= state.turn);
  // The rival lures our best reporter: that offer comes first.
  const lured = poachTarget(state, c, rng);
  const poach = lured && c.offers.find((o) => o.kind === 'poach' && (!o.mode || o.mode === state.mode));
  if (lured && poach) {
    state.offer = { id: poach.id, reporterId: lured };
    return notes;
  }
  if (state.turn < b.offerStartTurn || state.turn - state.lastOfferTurn < b.offerCooldown || !chance(rng, b.offerChance)) return notes;
  const pool = c.offers.filter(
    (o) =>
      o.kind !== 'poach' &&
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
  const def = offerOf(c, offer.id);
  if (def.kind === 'poach') {
    const id = offer.reporterId!;
    const cost = retainCost(c, id);
    if (accept && state.money < cost) {
      state.offer = offer;
      throw new Error('Not enough money to keep the reporter');
    }
    if (accept) {
      state.money -= cost;
      const s = staffOf(state, c, id);
      s.loyalty = clamp(s.loyalty + 0.3);
    } else defect(state, c, id);
    return null;
  }
  if (!accept) return null;
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

/** A reporter goes over to the rival: its readers trust it more (CONCEPT.md §3.3б). */
function defect(state: GameState, c: Content, id: string): void {
  if (!state.reporters.includes(id) || state.reporters.length <= 1) return;
  removeReporter(state, id);
  for (const r of state.residents) if (r.rivalReader) r.rivalTrust = clamp(r.rivalTrust + c.balance.poachRivalTrust, 0, 100);
}
