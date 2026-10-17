import type { ChannelId, Content, GameState } from './types';

export interface ChannelMods {
  reachAdd: number;
  reachMul: number;
}

/** Combined effect of everything the player has bought. */
export interface Modifiers {
  reporterLuck: number;
  frontPageSlots: number;
  exposurePenaltyMul: number;
  checkerMul: number;
  plausibilityAdd: number;
  /** Added to every resident's trust in the outlet. */
  trustBonus: number;
  channels: Record<ChannelId, ChannelMods>;
}

export function getModifiers(state: GameState, c: Content): Modifiers {
  const m: Modifiers = {
    reporterLuck: 0,
    frontPageSlots: c.balance.frontPageSlots,
    exposurePenaltyMul: 1,
    checkerMul: 1,
    plausibilityAdd: 0,
    trustBonus: 0,
    channels: {},
  };
  for (const ch of c.channels) m.channels[ch.id] = { reachAdd: 0, reachMul: 1 };

  for (const id of state.upgrades) {
    const u = c.upgrades.find((x) => x.id === id);
    if (!u) continue;
    const e = u.effects;
    m.reporterLuck += e.reporterLuck ?? 0;
    m.frontPageSlots += e.frontPageSlots ?? 0;
    m.exposurePenaltyMul *= e.exposurePenaltyMul ?? 1;
    m.checkerMul *= e.checkerMul ?? 1;
    m.plausibilityAdd += e.plausibilityAdd ?? 0;
    m.trustBonus += e.trustBonus ?? 0;
    if (e.channel) {
      const cm = m.channels[e.channel];
      cm.reachAdd += e.reachAdd ?? 0;
      cm.reachMul *= e.reachMul ?? 1;
    }
  }
  return m;
}
