import { channelOf } from './lookup';
import { getModifiers } from './modifiers';
import { reporterOf } from './reporters';
import type { ChannelId, Content, GameState, Requirement, UpkeepItem } from './types';

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

function requirementMet(state: GameState, req: Requirement | null | undefined): boolean {
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
  for (const u of c.upgrades) {
    if (state.upgrades.includes(u.id)) continue;
    const unlocked =
      requirementMet(state, u.requires) &&
      (!u.effects.channel || state.ownedChannels.includes(u.effects.channel));
    out.push({
      id: u.id,
      kind: 'upgrade',
      name: u.name,
      description: u.description,
      cost: u.cost,
      unlocked,
      affordable: unlocked && state.money >= u.cost,
    });
  }
  return out;
}

/** Fires a hired reporter; the last one cannot be fired. */
export function fireReporter(state: GameState, id: string): void {
  if (state.outcome) throw new Error('Game is over');
  if (!state.reporters.includes(id)) throw new Error(`Reporter ${id} is not hired`);
  if (state.reporters.length <= 1) throw new Error('The last reporter cannot be fired');
  state.reporters = state.reporters.filter((x) => x !== id);
  state.investigations = state.investigations.filter((x) => x.reporterId !== id);
  delete state.reporterTopics[id];
}

export function purchase(state: GameState, c: Content, id: string): void {
  if (state.outcome) throw new Error('Game is over');
  const option = listPurchases(state, c).find((x) => x.id === id);
  if (!option) throw new Error(`Nothing to buy with id ${id}`);
  if (!option.affordable) throw new Error(`Cannot buy ${id} now`);
  state.money -= option.cost;
  if (option.kind === 'channel') state.ownedChannels.push(id);
  else state.upgrades.push(id);
}

/** Channel upkeep, reporter salaries and running investigations, paid every turn. */
export function upkeepItems(state: GameState, c: Content): UpkeepItem[] {
  const mods = getModifiers(state, c);
  return [
    ...state.ownedChannels.map((id) => ({ kind: 'channel' as const, id, amount: Math.max(0, channelOf(c, id).upkeep + mods.channels[id].upkeepAdd) })),
    ...state.reporters.map((id) => ({ kind: 'salary' as const, id, amount: reporterOf(c, id).salary })),
    // Digging dirt costs money every turn: sources, bribes, stakeouts (CONCEPT.md §3.3а).
    ...state.investigations.map((x) => ({ kind: 'investigation' as const, id: x.reporterId, amount: c.balance.investigationCost })),
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
  const items = upkeepItems(state, c);
  const upkeep = items.reduce((s, x) => s + x.amount, 0);
  state.money += Object.values(income).reduce((s, x) => s + x, 0) - upkeep;
  return { income, upkeep, upkeepItems: items };
}
