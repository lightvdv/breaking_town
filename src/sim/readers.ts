import { chance, type RngState } from './rng';
import { channelOf, clamp, groupOf } from './lookup';
import type { Modifiers } from './modifiers';
import type { ChannelId, ChurnReason, Content, GameState, IssueLevel, ReadersChange, Resident } from './types';

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

/** Why a reader might leave after this turn, given what they experienced; null when they stay. */
function churnReason(state: GameState, r: Resident, issueSize: number): ChurnReason | null {
  if (issueSize === 0) return 'empty';
  const reaction = state.lastReactions[r.id];
  if (reaction === 'outraged') return 'exposed';
  if (reaction === 'scared' || reaction === 'happy' || reaction === 'talk') return null;
  if (reaction === 'doubted') return 'doubted';
  // The issue did not touch them: whether they stay depends on how interesting it was.
  return 'boring';
}

function churnChance(c: Content, reason: ChurnReason, level: IssueLevel): number {
  const b = c.balance;
  return { empty: b.churnEmpty, exposed: b.churnExposed, doubted: b.churnDoubt, boring: b.issueChurn[level] }[reason];
}

/** Applies churn and acquisition after an issue; returns who was lost and gained, and why. */
export function updateReaders(
  state: GameState,
  c: Content,
  rng: RngState,
  mods: Modifiers,
  issueSize: number,
  level: IssueLevel,
  /** Readers at the start of the turn: only they count as moved away when they leave the city. */
  readersAtStart: Set<number>,
): ReadersChange {
  // An interesting issue is talked about: more people start buying (CONCEPT.md §4.2а).
  const joinScale = c.balance.acquisitionRate * c.balance.issueAcquisition[issueSize === 0 ? 0 : level];
  const out: ReadersChange = {
    lost: 0,
    gained: 0,
    lostBy: { exposed: 0, doubted: 0, boring: 0, empty: 0 },
    movedAway: 0,
    gainedBy: Object.fromEntries(state.ownedChannels.map((ch) => [ch, 0])),
  };
  for (const r of state.residents) {
    if (r.status !== 'active') {
      if (readersAtStart.has(r.id)) out.movedAway++;
      r.follows = [];
      continue;
    }
    const wasReader = r.follows.length > 0;
    const reason = wasReader ? churnReason(state, r, issueSize) : null;
    if (reason && chance(rng, churnChance(c, reason, level))) {
      r.follows = [];
      out.lost++;
      out.lostBy[reason]++;
      continue;
    }
    for (const ch of state.ownedChannels) {
      if (!r.follows.includes(ch) && chance(rng, joinChance(c, mods, r, ch, joinScale))) {
        r.follows.push(ch);
        out.gainedBy[ch]++;
      }
    }
    if (!wasReader && r.follows.length > 0) out.gained++;
  }
  return out;
}
