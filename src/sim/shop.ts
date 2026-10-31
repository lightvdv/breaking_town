import { requirementMet } from './economy';
import { clamp } from './lookup';
import { getModifiers } from './modifiers';
import { findNews, reporterOf, searchLuck } from './reporters';
import { chance, weightedPick, type RngState } from './rng';
import { skilledReporter } from './staff';
import type { Content, ForkDef, GameState, NewsTier, UpgradeDef } from './types';

/**
 * The upgrades (CONCEPT.md §3.5): forks of two options taken for good, a deck that offers a few
 * cards at a time, and abilities used from the bar above the paper.
 */

/** Forks open on their day; one whose option is owned is decided. */
export function openForks(state: GameState, c: Content): ForkDef[] {
  return c.forks.filter((f) => state.turn >= f.day && !f.options.some((id) => state.upgrades.includes(id)));
}

/** The fork's option the player took, if any. */
export function forkChoice(state: GameState, f: ForkDef): string | null {
  return f.options.find((id) => state.upgrades.includes(id)) ?? null;
}

/**
 * Cards the draft can offer now: in the player's collection, not owned, not a fork option, of this
 * mode, requirements met, a series only by its next step.
 */
export function deckCards(state: GameState, c: Content): UpgradeDef[] {
  return c.upgrades.filter((u) => {
    if (state.upgrades.includes(u.id) || u.fork || (u.mode && u.mode !== state.mode)) return false;
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
  state.shopRefreshTurn = state.turn + b.shopRefreshDays;
}

/** At the start of a turn: the deck is dealt again when its day comes. */
export function advanceShop(state: GameState, c: Content, rng: RngState): void {
  if (state.turn >= state.shopRefreshTurn) dealShop(state, c, rng);
}

/** Deals the deck before its day, for `shopRefreshCost`. */
export function refreshShop(state: GameState, c: Content): void {
  if (state.outcome) throw new Error('Game is over');
  if (state.money < c.balance.shopRefreshCost) throw new Error('Not enough money to refresh the shop');
  state.money -= c.balance.shopRefreshCost;
  dealShop(state, c, state.rng);
}

/** Can this upgrade be bought now: on today's deck or an option of an open fork. */
export function onSale(state: GameState, c: Content, u: UpgradeDef): boolean {
  if (u.fork) return openForks(state, c).some((f) => f.id === u.fork);
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
  if (state.money < def.ability.cost) return 'no money';
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
  state.money -= def.ability!.cost;
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
