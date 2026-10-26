import { chance, type RngState } from './rng';
import { channelOf, clamp, groupOf } from './lookup';
import { wealthOf } from './city';
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

/** How willing a resident is to buy the paper at the current price: 0 = cannot afford it (CONCEPT.md §5.4). */
export function buyWillingness(state: GameState, c: Content, r: Resident): number {
  return c.balance.priceBuy[wealthOf(c, r)][state.price] ?? 0;
}

/** Per-turn chance that a resident who does not follow `channel` starts following it. */
export function joinChance(c: Content, mods: Modifiers, r: Resident, channel: ChannelId, scale: number): number {
  const ch = channelOf(c, channel);
  const affinity = (groupOf(c, r.group).channels[channel] ?? 0) + (mods.channels[channel].groupReach[r.group] ?? 0);
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
      if (chance(rng, joinChance(c, mods, r, ch, c.balance.startFollowShare) * buyWillingness(state, c, r))) r.follows.push(ch);
    }
  }
}

/** Why a reader might leave after this turn and how likely it is, given what they experienced; null when they stay. */
function churnOf(c: Content, mods: Modifiers, state: GameState, r: Resident, issueSize: number, level: IssueLevel): { reason: ChurnReason; chance: number } | null {
  const found = baseChurn(c, state, r, issueSize, level);
  const churn = found && { reason: found.reason, chance: found.chance * mods.churnMul };
  // Too dear: who cannot pay stops buying, who can but grudges it drops it now and then.
  const will = buyWillingness(state, c, r);
  const price = will <= 0 ? 1 : Math.max(0, 1 - will) * c.balance.priceChurn;
  return price > (churn?.chance ?? 0) ? { reason: 'price', chance: price } : churn;
}

function baseChurn(c: Content, state: GameState, r: Resident, issueSize: number, level: IssueLevel): { reason: ChurnReason; chance: number } | null {
  const b = c.balance;
  if (issueSize === 0) return { reason: 'empty', chance: b.churnEmpty };
  const reaction = state.lastReactions[r.id];
  if (reaction === 'outraged') return { reason: 'exposed', chance: b.churnExposed };
  if (reaction === 'doubted') return { reason: 'doubted', chance: b.churnDoubt };
  // Believers mostly stay, but a boring issue bores even them a little (CONCEPT.md §4.2а).
  const touched = reaction === 'scared' || reaction === 'happy' || reaction === 'talk';
  const chance = touched ? b.issueChurnBelievers[level] : b.issueChurn[level];
  return chance > 0 ? { reason: 'boring', chance } : null;
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
  const joinScale = c.balance.acquisitionRate * c.balance.issueAcquisition[issueSize === 0 ? 0 : level] * mods.acquisitionMul;
  const out: ReadersChange = {
    lost: 0,
    gained: 0,
    lostBy: { exposed: 0, doubted: 0, boring: 0, empty: 0, price: 0 },
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
    const churn = wasReader ? churnOf(c, mods, state, r, issueSize, level) : null;
    if (churn && chance(rng, churn.chance)) {
      r.follows = [];
      out.lost++;
      out.lostBy[churn.reason]++;
      continue;
    }
    for (const ch of state.ownedChannels) {
      if (!r.follows.includes(ch) && chance(rng, joinChance(c, mods, r, ch, joinScale) * buyWillingness(state, c, r))) {
        r.follows.push(ch);
        out.gainedBy[ch]++;
      }
    }
    if (!wasReader && r.follows.length > 0) out.gained++;
  }
  return out;
}

/**
 * Expected new readers after an issue of this level, without rolling (CONCEPT.md §7.3 «Улучшения»:
 * the upgrades window compares it with and without an upgrade).
 */
export function expectedJoins(state: GameState, c: Content, mods: Modifiers, level: IssueLevel): number {
  const scale = c.balance.acquisitionRate * c.balance.issueAcquisition[level] * mods.acquisitionMul;
  let sum = 0;
  for (const r of state.residents) {
    if (r.status !== 'active' || r.follows.length > 0) continue;
    for (const ch of state.ownedChannels) sum += joinChance(c, mods, r, ch, scale) * buyWillingness(state, c, r);
  }
  return sum;
}
