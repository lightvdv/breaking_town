import type { ChannelId, Content, GameState } from './types';

export interface ChannelMods {
  reachAdd: number;
  interestMul: number;
  trustBonus: number;
}

/** Combined effect of everything the player has bought. */
export interface Modifiers {
  handSize: number;
  publishPerTurn: number;
  exposureGainMul: number;
  checkerMul: number;
  plausibilityAdd: number;
  channels: Record<ChannelId, ChannelMods>;
}

export function getModifiers(state: GameState, c: Content): Modifiers {
  const m: Modifiers = {
    handSize: c.balance.handSize,
    publishPerTurn: c.balance.publishPerTurn,
    exposureGainMul: 1,
    checkerMul: 1,
    plausibilityAdd: 0,
    channels: {},
  };
  for (const ch of c.channels) m.channels[ch.id] = { reachAdd: 0, interestMul: 1, trustBonus: 0 };

  for (const id of state.upgrades) {
    const u = c.upgrades.find((x) => x.id === id);
    if (!u) continue;
    const e = u.effects;
    m.handSize += e.handSize ?? 0;
    m.publishPerTurn += e.publishPerTurn ?? 0;
    m.exposureGainMul *= e.exposureGainMul ?? 1;
    m.checkerMul *= e.checkerMul ?? 1;
    m.plausibilityAdd += e.plausibilityAdd ?? 0;
    if (e.channel) {
      const cm = m.channels[e.channel];
      cm.reachAdd += e.reachAdd ?? 0;
      cm.interestMul *= e.interestMul ?? 1;
      cm.trustBonus += e.trustBonus ?? 0;
    }
  }
  return m;
}
