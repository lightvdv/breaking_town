import type { ChannelId, Content, GameState, GroupId, Placement } from './types';

export interface ChannelMods {
  reachAdd: number;
  reachMul: number;
  adRateAdd: number;
  upkeepAdd: number;
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
  channels: Record<ChannelId, ChannelMods>;
}

export function getModifiers(state: GameState, c: Content): Modifiers {
  const m: Modifiers = {
    reporterLuck: 0,
    frontPageSlots: c.balance.frontPageSlots,
    articleSlots: c.balance.articleSlots,
    exposurePenaltyMul: 1,
    checkerMul: 1,
    plausibilityAdd: 0,
    trustBonus: 0,
    churnMul: 1,
    channels: {},
  };
  for (const ch of c.channels) m.channels[ch.id] = { reachAdd: 0, reachMul: 1, adRateAdd: 0, upkeepAdd: 0, groupReach: {} };

  for (const id of state.upgrades) {
    const u = c.upgrades.find((x) => x.id === id);
    if (!u) continue;
    const e = u.effects;
    m.reporterLuck += e.reporterLuck ?? 0;
    m.exposurePenaltyMul *= e.exposurePenaltyMul ?? 1;
    m.checkerMul *= e.checkerMul ?? 1;
    m.plausibilityAdd += e.plausibilityAdd ?? 0;
    m.trustBonus += e.trustBonus ?? 0;
    m.churnMul *= e.churnMul ?? 1;
    if (e.channel) {
      const cm = m.channels[e.channel];
      cm.reachAdd += e.reachAdd ?? 0;
      cm.reachMul *= e.reachMul ?? 1;
      cm.adRateAdd += e.adRateAdd ?? 0;
      cm.upkeepAdd += e.upkeepAdd ?? 0;
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
