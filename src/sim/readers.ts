import { chance, type RngState } from './rng';
import { channelOf, clamp, groupOf } from './lookup';
import type { Modifiers } from './modifiers';
import type { ChannelId, Content, GameState, Resident } from './types';

/**
 * Regular readers of each channel (CONCEPT.md §5.2): last turn's buyers buy again, some leave
 * when they disliked the issue, and new ones arrive depending on channels, upgrades and trust.
 */

/** People who distrust the outlet are slower to start following it. */
function trustFactor(c: Content, mods: Modifiers, r: Resident): number {
  const min = c.balance.reachTrustMin;
  return min + (1 - min) * clamp((r.trust + mods.trustBonus) / 100);
}

/** Per-turn chance that a resident who does not follow `channel` starts following it. */
export function joinChance(c: Content, mods: Modifiers, r: Resident, channel: ChannelId, scale: number): number {
  const ch = channelOf(c, channel);
  const affinity = groupOf(c, r.group).channels[channel] ?? 0;
  const reach = (ch.baseReach + mods.channels[channel].reachAdd) * mods.channels[channel].reachMul;
  return clamp(affinity * reach * trustFactor(c, mods, r) * scale);
}

export function followersOf(state: GameState, channel: ChannelId): number {
  return state.residents.filter((r) => r.status === 'active' && r.follows.includes(channel)).length;
}

export function readerCount(state: GameState): number {
  return state.residents.filter((r) => r.status === 'active' && r.follows.some((ch) => state.ownedChannels.includes(ch))).length;
}

/** The starting channels already have an audience. */
export function seedFollowers(state: GameState, c: Content, rng: RngState, mods: Modifiers): void {
  for (const r of state.residents) {
    for (const ch of state.ownedChannels) {
      if (chance(rng, joinChance(c, mods, r, ch, c.balance.startFollowShare))) r.follows.push(ch);
    }
  }
}

/** Why a reader leaves after this turn, given what they experienced. */
function churnChance(state: GameState, c: Content, r: Resident, issueSize: number, boring: boolean): number {
  const b = c.balance;
  if (issueSize === 0) return b.churnEmpty;
  const reaction = state.lastReactions[r.id];
  if (reaction === 'outraged') return b.churnExposed;
  if (reaction === 'scared' || reaction === 'happy' || reaction === 'talk') return 0;
  if (reaction === 'doubted') return b.churnDoubt;
  return boring ? b.churnBoring : 0;
}

/** Applies churn and acquisition after an issue; returns how many readers were lost and gained. */
export function updateReaders(
  state: GameState,
  c: Content,
  rng: RngState,
  mods: Modifiers,
  issueSize: number,
  boring: boolean,
): { lost: number; gained: number } {
  let lost = 0;
  let gained = 0;
  for (const r of state.residents) {
    if (r.status !== 'active') {
      r.follows = [];
      continue;
    }
    const wasReader = r.follows.length > 0;
    if (wasReader && chance(rng, churnChance(state, c, r, issueSize, boring))) {
      r.follows = [];
      lost++;
      continue;
    }
    for (const ch of state.ownedChannels) {
      if (!r.follows.includes(ch) && chance(rng, joinChance(c, mods, r, ch, c.balance.acquisitionRate))) r.follows.push(ch);
    }
    if (!wasReader && r.follows.length > 0) gained++;
  }
  return { lost, gained };
}
