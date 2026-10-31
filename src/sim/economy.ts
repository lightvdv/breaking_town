import { removeReporter } from './staff';
import { channelOf } from './lookup';
import { getModifiers } from './modifiers';
import { reporterOf } from './reporters';
import { onSale } from './shop';
import type { ChannelId, Content, GameState, Requirement, UpgradeDef, UpkeepItem } from './types';

export interface PurchaseOption {
  id: string;
  kind: 'channel' | 'upgrade';
  name: string;
  description: string;
  cost: number;
  /** Requirements are met; the player may still lack the money. */
  unlocked: boolean;
  affordable: boolean;
}

export function requirementMet(state: GameState, req: Requirement | null | undefined): boolean {
  if (!req) return true;
  if (req.channel && !state.ownedChannels.includes(req.channel)) return false;
  if (req.upgrade && !state.upgrades.includes(req.upgrade)) return false;
  return true;
}

export function listPurchases(state: GameState, c: Content): PurchaseOption[] {
  const out: PurchaseOption[] = [];
  for (const ch of c.channels) {
    if (state.ownedChannels.includes(ch.id)) continue;
    const unlocked = requirementMet(state, ch.requires);
    out.push({
      id: ch.id,
      kind: 'channel',
      name: ch.name,
      description: ch.description,
      cost: ch.cost,
      unlocked,
      affordable: unlocked && state.money >= ch.cost,
    });
  }
  // Upgrades are on sale only from today's deck or an open fork (CONCEPT.md §3.5).
  for (const u of c.upgrades) {
    if (state.upgrades.includes(u.id) || !onSale(state, c, u)) continue;
    const unlocked =
      requirementMet(state, u.requires) &&
      (!u.effects.channel || state.ownedChannels.includes(u.effects.channel));
    out.push({
      id: u.id,
      kind: 'upgrade',
      name: u.name,
      description: u.description,
      cost: boardPrice(state, u),
      unlocked,
      affordable: unlocked && state.money >= boardPrice(state, u),
    });
  }
  return out;
}

/** A task's voucher pays for any card of the deck (never a fork option). */
export function deckFree(state: GameState, u: UpgradeDef): boolean {
  return state.vouchers > 0 && !u.fork;
}

/**
 * What a card costs now (CONCEPT.md §3.5б): the first card of the board's offer is free, a second
 * from the same offer costs its price; a fork's option keeps its price (a voucher makes it free).
 */
export function boardPrice(state: GameState, u: UpgradeDef): number {
  if (u.fork) return u.cost;
  return (state.shopPicks ?? 0) === 0 || deckFree(state, u) ? 0 : u.cost;
}

/** Fires a hired reporter; the last one cannot be fired. */
export function fireReporter(state: GameState, id: string): void {
  if (state.outcome) throw new Error('Game is over');
  if (!state.reporters.includes(id)) throw new Error(`Reporter ${id} is not hired`);
  if (state.reporters.length <= 1) throw new Error('The last reporter cannot be fired');
  removeReporter(state, id);
}

export function purchase(state: GameState, c: Content, id: string): void {
  if (state.outcome) throw new Error('Game is over');
  const option = listPurchases(state, c).find((x) => x.id === id);
  if (!option) throw new Error(`Nothing to buy with id ${id}`);
  if (!option.affordable) throw new Error(`Cannot buy ${id} now`);
  state.money -= option.cost;
  if (option.kind === 'channel') state.ownedChannels.push(id);
  else {
    const u = c.upgrades.find((x) => x.id === id)!;
    if ((state.shopPicks ?? 0) > 0 && deckFree(state, u)) state.vouchers--;
    state.upgrades.push(id);
    // The first card of the offer is free, a second costs its price, then the offer is spent (CONCEPT.md §3.5б).
    if (state.shopOffer.includes(id)) {
      state.shopPicks = (state.shopPicks ?? 0) + 1;
      state.shopOffer = state.shopPicks >= 2 ? [] : state.shopOffer.filter((x) => x !== id);
    }
  }
}

/** Channel upkeep, reporter salaries and running investigations, paid every turn. */
export function upkeepItems(state: GameState, c: Content): UpkeepItem[] {
  const mods = getModifiers(state, c);
  return [
    ...state.ownedChannels.map((id) => ({ kind: 'channel' as const, id, amount: Math.max(0, channelOf(c, id).upkeep + mods.channels[id].upkeepAdd) })),
    ...state.reporters.map((id) => ({ kind: 'salary' as const, id, amount: Math.round(reporterOf(c, id).salary * mods.salaryMul) })),
    // Digging dirt costs money every turn: sources, bribes, stakeouts (CONCEPT.md §3.3а).
    ...state.investigations.map((x) => ({ kind: 'investigation' as const, id: x.reporterId, amount: Math.round(c.balance.investigationCost * mods.investigationCostMul) })),
    // A failed audit cut the budget for the rest of the game (CONCEPT.md §4.9).
    ...(state.budgetCut > 0 ? [{ kind: 'budget' as const, id: 'audit', amount: state.budgetCut }] : []),
  ];
}

export function totalUpkeep(state: GameState, c: Content): number {
  return upkeepItems(state, c).reduce((s, x) => s + x.amount, 0);
}

/** Income per reader of a channel, with upgrades such as kiosks. */
export function adRateOf(state: GameState, c: Content, channel: ChannelId): number {
  return channelOf(c, channel).adRate + getModifiers(state, c).channels[channel].adRateAdd;
}

/** Money from one reader per issue: the cover price the player set plus advertising (CONCEPT.md §5.4). */
export function incomePerReader(state: GameState, c: Content, channel: ChannelId): number {
  return (c.balance.prices[state.price] ?? 0) + adRateOf(state, c, channel);
}

/** Sales of one channel: its buyers × (price + ads) × the scandal multiplier. */
export function salesOf(state: GameState, c: Content, channel: ChannelId, buyers: number, scandal = state.scandal): number {
  return Math.round(buyers * incomePerReader(state, c, channel) * scandal);
}

/** Sets the cover price of the paper (index in `Balance.prices`); it applies from this issue on. */
export function setPrice(state: GameState, c: Content, level: number): void {
  if (state.outcome) throw new Error('Game is over');
  if (!Number.isInteger(level) || level < 0 || level >= c.balance.prices.length) throw new Error(`Bad price level ${level}`);
  state.price = level;
}

/** Sales to this turn's regular readers of each channel, minus upkeep (CONCEPT.md §5.4). */
export function collectIncome(
  state: GameState,
  c: Content,
  buyers: Record<ChannelId, number>,
): { income: Record<ChannelId, number>; upkeep: number; upkeepItems: UpkeepItem[] } {
  const income: Record<ChannelId, number> = {};
  for (const ch of state.ownedChannels) income[ch] = salesOf(state, c, ch, buyers[ch] ?? 0);
  // A sponsor's money comes with the sales (CONCEPT.md §3.5б).
  const sponsor = getModifiers(state, c).moneyPerDay;
  if (sponsor && state.ownedChannels.length) income[state.ownedChannels[0]] += Math.round(sponsor);
  const items = upkeepItems(state, c);
  const upkeep = items.reduce((s, x) => s + x.amount, 0);
  state.money += Object.values(income).reduce((s, x) => s + x, 0) - upkeep;
  return { income, upkeep, upkeepItems: items };
}
