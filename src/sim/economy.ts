import { channelOf } from './lookup';
import type { ChannelId, Content, GameState, Requirement } from './types';

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

export function purchase(state: GameState, c: Content, id: string): void {
  if (state.outcome) throw new Error('Game is over');
  const option = listPurchases(state, c).find((x) => x.id === id);
  if (!option) throw new Error(`Nothing to buy with id ${id}`);
  if (!option.affordable) throw new Error(`Cannot buy ${id} now`);
  state.money -= option.cost;
  if (option.kind === 'channel') {
    state.ownedChannels.push(id);
    state.scandal[id] = 1;
  } else state.upgrades.push(id);
}

export function totalUpkeep(state: GameState, c: Content): number {
  return state.ownedChannels.reduce((s, ch) => s + channelOf(c, ch).upkeep, 0);
}

/** Ad income for this turn's views minus channel upkeep. */
export function collectIncome(
  state: GameState,
  c: Content,
  views: Record<ChannelId, number>,
): { income: Record<ChannelId, number>; upkeep: number } {
  const income: Record<ChannelId, number> = {};
  for (const ch of state.ownedChannels) {
    income[ch] = Math.round((views[ch] ?? 0) * channelOf(c, ch).adRate * state.scandal[ch]);
  }
  const upkeep = totalUpkeep(state, c);
  state.money += Object.values(income).reduce((s, x) => s + x, 0) - upkeep;
  return { income, upkeep };
}
