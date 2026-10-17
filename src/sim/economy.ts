import { channelOf } from './lookup';
import { reporterOf } from './reporters';
import type { ChannelId, Content, GameState, Requirement } from './types';

export interface PurchaseOption {
  id: string;
  kind: 'channel' | 'upgrade' | 'reporter';
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
  const roomForReporter = state.reporters.length < c.balance.maxReporters;
  for (const r of c.reporters) {
    if (state.reporters.includes(r.id)) continue;
    out.push({
      id: r.id,
      kind: 'reporter',
      name: r.name,
      description: r.bio,
      cost: r.hireCost,
      unlocked: roomForReporter,
      affordable: roomForReporter && state.money >= r.hireCost,
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
}

export function purchase(state: GameState, c: Content, id: string): void {
  if (state.outcome) throw new Error('Game is over');
  const option = listPurchases(state, c).find((x) => x.id === id);
  if (!option) throw new Error(`Nothing to buy with id ${id}`);
  if (!option.affordable) throw new Error(`Cannot buy ${id} now`);
  state.money -= option.cost;
  if (option.kind === 'channel') state.ownedChannels.push(id);
  else if (option.kind === 'reporter') state.reporters.push(id);
  else state.upgrades.push(id);
}

/** Channel upkeep, reporter salaries and running investigations, paid every turn. */
export function totalUpkeep(state: GameState, c: Content): number {
  const channels = state.ownedChannels.reduce((s, ch) => s + channelOf(c, ch).upkeep, 0);
  const salaries = state.reporters.reduce((s, id) => s + reporterOf(c, id).salary, 0);
  // Digging dirt costs money every turn: sources, bribes, stakeouts (CONCEPT.md §3.3а).
  const investigations = state.investigations.length * c.balance.investigationCost;
  return channels + salaries + investigations;
}

/** Sales to this turn's regular readers of each channel, minus upkeep (CONCEPT.md §5.4). */
export function collectIncome(
  state: GameState,
  c: Content,
  buyers: Record<ChannelId, number>,
): { income: Record<ChannelId, number>; upkeep: number } {
  const income: Record<ChannelId, number> = {};
  for (const ch of state.ownedChannels) {
    income[ch] = Math.round((buyers[ch] ?? 0) * channelOf(c, ch).adRate * state.scandal);
  }
  const upkeep = totalUpkeep(state, c);
  state.money += Object.values(income).reduce((s, x) => s + x, 0) - upkeep;
  return { income, upkeep };
}
