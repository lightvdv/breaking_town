import { tr } from '../i18n';
import { payTrust, requirementMet, trustBlock } from './economy';
import { clamp } from './lookup';
import { getModifiers } from './modifiers';
import { findNews, reporterOf, searchLuck } from './reporters';
import { chance, weightedPick, type RngState } from './rng';
import { skilledReporter } from './staff';
import type { Content, GameState, NewsTier, UpgradeDef } from './types';

/**
 * The upgrades (CONCEPT.md §3.5): the board's deck that offers a few cards at a time, and
 * abilities used from the bar above the paper.
 */

/**
 * Cards the draft can offer now: in the player's collection, not owned, of this mode,
 * requirements met, a series only by its next step.
 */
export function deckCards(state: GameState, c: Content): UpgradeDef[] {
  return c.upgrades.filter((u) => {
    if (state.upgrades.includes(u.id) || (u.mode && u.mode !== state.mode)) return false;
    if (state.collection && !state.collection[u.id]) return false;
    if (!requirementMet(state, u.requires)) return false;
    if (u.effects.channel && !state.ownedChannels.includes(u.effects.channel)) return false;
    if (u.series) return u === c.upgrades.find((x) => x.series === u.series && !state.upgrades.includes(x.id));
    return true;
  });
}

/** Deals the draft (CONCEPT.md §3.5б): `shopOfferSize` cards of the collection at random, rarer ones less often; one may be taken. */
export function dealShop(state: GameState, c: Content, rng: RngState): void {
  const b = c.balance;
  const pool = deckCards(state, c).map((u) => ({ u, weight: (b.rarityWeight?.[u.rarity ?? 'common'] ?? 1) * (u.rare ? b.shopRareWeight : 1) }));
  const offer: string[] = [];
  while (offer.length < b.shopOfferSize && pool.length) {
    const pick = weightedPick(rng, pool);
    pool.splice(pool.indexOf(pick), 1);
    offer.push(pick.u.id);
  }
  state.shopOffer = offer;
  state.shopPicks = 0;
}

/** At the start of a turn: the deck is dealt again when its day comes. */
export function advanceShop(state: GameState, c: Content, rng: RngState): void {
  if (state.turn < state.shopRefreshTurn) return;
  dealShop(state, c, rng);
  state.shopRefreshTurn = state.turn + c.balance.shopRefreshDays;
  state.shopExtras = 0;
}

/**
 * What the next request for three more cards costs in reputation (CONCEPT.md §3.5б): the first of
 * an offer is free, then `shopRequestTrust`, growing by `shopRequestTrustStep` each time.
 */
export function shopRequestCost(state: GameState, c: Content): number {
  const n = state.shopExtras ?? 0;
  return n === 0 ? 0 : c.balance.shopRequestTrust + c.balance.shopRequestTrustStep * (n - 1);
}

/** Why three more cards cannot be asked for now, or null. */
export function refreshBlock(state: GameState, c: Content): string | null {
  if (state.outcome) return tr('Партия окончена');
  if (!deckCards(state, c).length) return tr('В колоде не осталось карт');
  if (trustBlock(state, c, shopRequestCost(state, c))) return tr('Не хватит репутации');
  return null;
}

/**
 * Three more cards out of turn (CONCEPT.md §3.5б): before or after a pick, for `shopRequestCost`
 * reputation; one of them is again taken for free. The board's own schedule does not move.
 */
export function refreshShop(state: GameState, c: Content): void {
  const block = refreshBlock(state, c);
  if (block) throw new Error(block);
  payTrust(state, shopRequestCost(state, c));
  state.shopExtras = (state.shopExtras ?? 0) + 1;
  dealShop(state, c, state.rng);
}

/** Can this card be taken now: it is in the board's offer. */
export function onSale(state: GameState, u: UpgradeDef): boolean {
  return state.shopOffer.includes(u.id);
}

// ---------- Abilities ----------

/** Owned abilities and the turn each is ready. */
export function abilitiesOf(state: GameState, c: Content): { def: UpgradeDef; readyTurn: number }[] {
  return c.upgrades.filter((u) => u.ability && state.upgrades.includes(u.id)).map((def) => ({ def, readyTurn: state.abilityReady[def.id] ?? 0 }));
}

/** Why an ability cannot be used now, or null. */
export function abilityBlock(state: GameState, c: Content, id: string): string | null {
  const def = c.upgrades.find((u) => u.id === id);
  if (!def?.ability || !state.upgrades.includes(id)) return 'not owned';
  if (state.outcome) return 'game over';
  if ((state.abilityReady[id] ?? 0) > state.turn) return 'cooling down';
  if (id === 'night_shift' && !freeReporters(state).length) return 'nobody free';
  if (id === 'sensation_day' && !boostTarget(state)) return 'nothing to raise';
  return null;
}

function freeReporters(state: GameState): string[] {
  return state.reporters.filter((id) => !state.investigations.some((x) => x.reporterId === id));
}

/** The story «Заголовок покрупнее» raises: the strongest that can still grow without a second sensation. */
function boostTarget(state: GameState) {
  const sensation = state.hand.some((x) => x.tier === 3);
  return [...state.hand].filter((x) => x.tier < (sensation ? 2 : 3)).sort((a, b) => b.tier - a.tier || a.uid - b.uid)[0] ?? null;
}

/**
 * Uses an ability (CONCEPT.md §3.5): «Ночная смена» brings one more story from the luckiest free
 * reporter, «Заголовок покрупнее» raises the best story of the day a level. Returns the uids of new cards.
 */
export function useAbility(state: GameState, c: Content, id: string): number[] {
  const block = abilityBlock(state, c, id);
  if (block) throw new Error(`Cannot use ${id}: ${block}`);
  const def = c.upgrades.find((u) => u.id === id)!;
  state.abilityReady[id] = state.turn + def.ability!.cooldown;
  const mods = getModifiers(state, c);
  if (id === 'night_shift') {
    const best = freeReporters(state).sort((a, b) => searchLuck(state, c, skilledReporter(state, c, reporterOf(c, b)), mods) - searchLuck(state, c, skilledReporter(state, c, reporterOf(c, a)), mods))[0];
    const { cards } = findNews(state, c, state.rng, mods, [], new Map(), { only: [best], sure: true });
    state.hand.push(...cards);
    return cards.map((x) => x.uid);
  }
  if (id === 'sensation_day') {
    const card = boostTarget(state)!;
    card.tier = Math.min(3, card.tier + 1) as NewsTier;
    return [];
  }
  return [];
}

/** The mole at the rival's may be found out: it is lost and the outlet's reputation suffers. */
export function checkMole(state: GameState, c: Content, rng: RngState): boolean {
  if (!state.upgrades.includes('mole') || !chance(rng, c.balance.moleRisk)) return false;
  state.upgrades = state.upgrades.filter((x) => x !== 'mole');
  for (const r of state.residents) if (r.status === 'active') r.trust = clamp(r.trust - c.balance.molePenalty, 0, 100);
  return true;
}
