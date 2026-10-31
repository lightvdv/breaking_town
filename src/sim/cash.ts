import { groupOf, templateOf } from './lookup';
import { chance, pick, weightedPick } from './rng';
import { buyWillingness } from './readers';
import type { CardInstance, CashDef, Content, GameState, NewsTier } from './types';

/**
 * «Чёрная касса» (CONCEPT.md §3.5в): the paper's money buys one-off moves, each with its price and
 * a few days of cooldown — a leaked sensation, a bribe for the fact-checkers, an ad campaign, hired
 * provocateurs, paparazzi on the hunt's target, a free run of the paper.
 */

export function cashOf(c: Content, id: string): CashDef {
  const def = c.cash.find((x) => x.id === id);
  if (!def) throw new Error(`Unknown cash action ${id}`);
  return def;
}

/** The card that opened a move, if any. */
function cardOf(state: GameState, c: Content, id: string) {
  return c.upgrades.find((u) => u.cash === id && state.upgrades.includes(u.id));
}

/** Is the move in the cash: a base one, or opened by an owned card? */
export function cashOpen(state: GameState, c: Content, id: string): boolean {
  return !!cashOf(c, id).base || !!cardOf(state, c, id);
}

/** The moves the cash offers now, in content order. */
export function cashMoves(state: GameState, c: Content): CashDef[] {
  return c.cash.filter((x) => cashOpen(state, c, x.id));
}

/** A move's price: a card of a higher level in the collection makes it cheaper (÷ `cardLevelPower`). */
export function cashCost(state: GameState, c: Content, id: string): number {
  const card = cardOf(state, c, id);
  const level = card ? (state.collection?.[card.id] ?? 1) : 1;
  return Math.round(cashOf(c, id).cost / (c.balance.cardLevelPower?.[level - 1] ?? 1));
}

/** Is a move bought today (or for tomorrow) still waiting to act on `turn`? */
export function cashActive(state: GameState, id: string, turn = state.turn): boolean {
  return state.cashEffects?.[id] === turn;
}

/** Why a move cannot be bought now, or null. */
export function cashBlock(state: GameState, c: Content, id: string): string | null {
  if (state.outcome) return 'Партия окончена';
  if (!cashOpen(state, c, id)) return 'нужна карта';
  const ready = state.cashReady?.[id] ?? 0;
  if (ready > state.turn) return `через ${ready - state.turn} ${ready - state.turn === 1 ? 'день' : 'дня'}`;
  if (state.money < cashCost(state, c, id)) return 'не хватает денег';
  if (id === 'paparazzi' && !state.hunt) return 'нет травли';
  if (id === 'leak' && !leakPool(state, c).length) return 'источник молчит';
  return null;
}

/** Rumors that can be a sensation, about the town: what a source sells. */
function leakPool(state: GameState, c: Content) {
  const inHand = new Set(state.hand.map((x) => x.templateId));
  return c.cards.filter((t) => t.source === 'rumor' && !t.arc && !t.conflict && !inHand.has(t.id) && (t.tiers?.[1] ?? 3) >= 3 && (!t.requires || state.buildings.some((b) => b.type === t.requires && b.open)));
}

/** Buys a move; a leak returns the card it put into today's hand. */
export function useCash(state: GameState, c: Content, id: string): CardInstance | null {
  const block = cashBlock(state, c, id);
  if (block) throw new Error(`Cannot use ${id}: ${block}`);
  const def = cashOf(c, id);
  const rng = state.rng;
  state.money -= cashCost(state, c, id);
  state.cashReady = { ...state.cashReady, [id]: state.turn + def.cooldown };
  state.cashEffects = { ...state.cashEffects };
  switch (id) {
    case 'leak': {
      const tpl = weightedPick(rng, leakPool(state, c).map((x) => ({ x, weight: x.weight }))).x;
      state.lastSeen[tpl.id] = state.turn;
      // One sensation a day: with one in hand the leak comes as an interesting story.
      const tier: NewsTier = state.hand.some((x) => x.tier === 3) ? 2 : 3;
      const card: CardInstance = {
        uid: state.nextUid++,
        templateId: tpl.id,
        baseTruth: tpl.baseTruth,
        createdTurn: state.turn,
        tier,
        scope: 'local',
        reporterId: state.reporters[0] ?? '',
        ...(chance(rng, def.setupChance ?? 0) ? { setup: true } : {}),
      };
      const places = tpl.requires ? state.buildings.filter((b) => b.type === tpl.requires && b.open) : [];
      if (places.length) card.building = pick(rng, places).id;
      state.hand.push(card);
      return card;
    }
    case 'ads': {
      const owned = state.ownedChannels[0];
      if (owned) {
        for (const r of state.residents) {
          if (r.status !== 'active' || r.follows.includes(owned)) continue;
          if (chance(rng, (def.share ?? 0.15) * buyWillingness(state, c, r) * ((groupOf(c, r.group).channels[owned] ?? 0) > 0 ? 1 : 0))) r.follows.push(owned);
        }
      }
      return null;
    }
    case 'bribe':
    case 'giveaway':
      state.cashEffects[id] = state.turn;
      return null;
    case 'provoke':
    case 'paparazzi':
      state.cashEffects[id] = state.turn + 1;
      return null;
  }
  return null;
}

/** The fact-check is bribed today: lies are checked `checkerMul` as often. */
export function bribeMul(state: GameState, c: Content): number {
  return cashActive(state, 'bribe') ? (cashOf(c, 'bribe').checkerMul ?? 1) : 1;
}

/** Is the template a story the source could sell? (for tests and the UI) */
export function isLeak(c: Content, card: CardInstance): boolean {
  return templateOf(c, card.templateId).source === 'rumor' && card.tier >= 2;
}
