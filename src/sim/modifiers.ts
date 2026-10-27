import type { ChannelId, Content, GameState, GroupId, Placement, Topic } from './types';

export interface ChannelMods {
  reachAdd: number;
  reachMul: number;
  adRateAdd: number;
  upkeepAdd: number;
  frontReadMul: number;
  /** Added to the channel affinity of each group. */
  groupReach: Record<GroupId, number>;
}

/** Combined effect of everything the player has bought. */
export interface Modifiers {
  reporterLuck: number;
  frontPageSlots: number;
  articleSlots: number;
  exposurePenaltyMul: number;
  checkerMul: number;
  plausibilityAdd: number;
  /** Added to every resident's trust in the outlet. */
  trustBonus: number;
  churnMul: number;
  scaryImpactMul: number;
  trustGainMul: number;
  acquisitionMul: number;
  wordOfMouthMul: number;
  debunkFindAdd: number;
  seeRivalPlan: boolean;
  /** Youth and the jobless believe the outlet as if its reputation were at least this (the yellow press). */
  sensationTrust: number;
  /** Added to the churn of readers from these groups (the paper's style is not for them). */
  groupChurn: Record<GroupId, number>;
  huntStepMul: number;
  huntFindAdd: number;
  rivalStealMul: number;
  /** Impact of stories by topic: the paper's desks (CONCEPT.md §3.5). */
  topicImpactMul: Partial<Record<Topic, number>>;
  /** Chance a free reporter searches this topic: the desk's own reporter (CONCEPT.md §3.5). */
  topicFind: Partial<Record<Topic, number>>;
  channels: Record<ChannelId, ChannelMods>;
}

export function getModifiers(state: GameState, c: Content): Modifiers {
  return modifiersOf(c, state.upgrades);
}

/** Modifiers of a set of upgrades; with none, those of an outlet without upgrades (the rival paper). */
export function modifiersOf(c: Content, upgrades: string[]): Modifiers {
  const m: Modifiers = {
    reporterLuck: 0,
    frontPageSlots: c.balance.frontPageSlots,
    articleSlots: c.balance.articleSlots,
    exposurePenaltyMul: 1,
    checkerMul: 1,
    plausibilityAdd: 0,
    trustBonus: 0,
    churnMul: 1,
    scaryImpactMul: 1,
    trustGainMul: 1,
    acquisitionMul: 1,
    wordOfMouthMul: 1,
    debunkFindAdd: 0,
    seeRivalPlan: false,
    sensationTrust: 0,
    groupChurn: {},
    huntStepMul: 1,
    huntFindAdd: 0,
    rivalStealMul: 1,
    topicImpactMul: {},
    topicFind: {},
    channels: {},
  };
  for (const ch of c.channels) m.channels[ch.id] = { reachAdd: 0, reachMul: 1, adRateAdd: 0, upkeepAdd: 0, frontReadMul: 1, groupReach: {} };

  for (const id of upgrades) {
    const u = c.upgrades.find((x) => x.id === id);
    if (!u) continue;
    const e = u.effects;
    m.reporterLuck += e.reporterLuck ?? 0;
    m.exposurePenaltyMul *= e.exposurePenaltyMul ?? 1;
    m.checkerMul *= e.checkerMul ?? 1;
    m.plausibilityAdd += e.plausibilityAdd ?? 0;
    m.trustBonus += e.trustBonus ?? 0;
    m.churnMul *= e.churnMul ?? 1;
    m.scaryImpactMul *= e.scaryImpactMul ?? 1;
    m.trustGainMul *= e.trustGainMul ?? 1;
    m.acquisitionMul *= e.acquisitionMul ?? 1;
    m.wordOfMouthMul *= e.wordOfMouthMul ?? 1;
    m.debunkFindAdd += e.debunkFindAdd ?? 0;
    m.seeRivalPlan ||= !!e.seeRivalPlan;
    m.sensationTrust = Math.max(m.sensationTrust, e.sensationTrust ?? 0);
    m.huntStepMul *= e.huntStepMul ?? 1;
    m.huntFindAdd += e.huntFindAdd ?? 0;
    m.rivalStealMul *= e.rivalStealMul ?? 1;
    for (const [t, v] of Object.entries(e.topicImpactMul ?? {}) as [Topic, number][]) m.topicImpactMul[t] = (m.topicImpactMul[t] ?? 1) * v;
    for (const [t, v] of Object.entries(e.topicFind ?? {}) as [Topic, number][]) m.topicFind[t] = Math.max(m.topicFind[t] ?? 0, v);
    for (const [g, v] of Object.entries(e.groupChurn ?? {})) m.groupChurn[g] = (m.groupChurn[g] ?? 0) + (v ?? 0);
    if (e.channel) {
      const cm = m.channels[e.channel];
      cm.reachAdd += e.reachAdd ?? 0;
      cm.reachMul *= e.reachMul ?? 1;
      cm.adRateAdd += e.adRateAdd ?? 0;
      cm.upkeepAdd += e.upkeepAdd ?? 0;
      cm.frontReadMul *= e.frontReadMul ?? 1;
      for (const [g, v] of Object.entries(e.groupReach ?? {})) cm.groupReach[g] = (cm.groupReach[g] ?? 0) + (v ?? 0);
    }
  }
  return m;
}

/** How many stories fit at each placement (brief, article, front page) this turn. */
export function placementSlots(m: Modifiers): [number, number, number] {
  return [Infinity, m.articleSlots, m.frontPageSlots];
}

/**
 * Default layout of an issue (CONCEPT.md §4.2): stories ranked best first take the front page,
 * then the article slots; everything else goes in as briefs.
 */
export function rankedPlacements(count: number, m: Modifiers): Placement[] {
  return Array.from({ length: count }, (_, i) => (i < m.frontPageSlots ? 2 : i < m.frontPageSlots + m.articleSlots ? 1 : 0));
}
