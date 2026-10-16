import type {
  BuildingDef,
  BuildingType,
  CardTemplate,
  ChannelDef,
  ChannelId,
  Content,
  GameState,
  GroupDef,
} from './types';

export function clamp(v: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, v));
}

function find<T extends { id: string }>(items: readonly T[], id: string, kind: string): T {
  const item = items.find((x) => x.id === id);
  if (!item) throw new Error(`Unknown ${kind}: ${id}`);
  return item;
}

export const groupOf = (c: Content, id: string): GroupDef => find(c.groups, id, 'group');
export const channelOf = (c: Content, id: string): ChannelDef => find(c.channels, id, 'channel');
export const templateOf = (c: Content, id: string): CardTemplate => find(c.cards, id, 'card');

export function buildingDefOf(c: Content, type: BuildingType): BuildingDef {
  const def = c.buildings.find((b) => b.type === type);
  if (!def) throw new Error(`Unknown building type: ${type}`);
  return def;
}

/** Affinity-weighted average trust of active residents in a channel. */
export function averageTrust(state: GameState, c: Content, channel: ChannelId): number {
  let sum = 0;
  let weight = 0;
  for (const r of state.residents) {
    if (r.status !== 'active') continue;
    const w = groupOf(c, r.group).channels[channel] ?? 0;
    sum += w * r.trust[channel];
    weight += w;
  }
  return weight > 0 ? sum / weight : 0;
}

export function trustSnapshot(state: GameState, c: Content): Record<ChannelId, number> {
  const out: Record<ChannelId, number> = {};
  for (const ch of state.ownedChannels) out[ch] = averageTrust(state, c, ch);
  return out;
}
