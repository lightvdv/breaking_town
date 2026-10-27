import type {
  BuildingDef,
  BuildingType,
  CardTemplate,
  ChannelDef,
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

/** «Бар «Якорь»»: the type's name plus the building's own name when there are several of the type. */
export function buildingName(state: GameState, c: Content, id: number): string {
  const x = state.buildings[id];
  const def = buildingDefOf(c, x.type);
  const k = state.buildings.filter((y) => y.type === x.type).indexOf(x);
  return def.names?.length ? `${def.name} ${def.names[k % def.names.length]}` : def.name;
}

/** «Больница закрылась», «Фактчекеры закрылись», «Завод закрылся». */
export function closedLine(state: GameState, c: Content, id: number): string {
  return `${buildingName(state, c, id)} ${buildingDefOf(c, state.buildings[id].type).closed ?? 'закрылся'}`;
}

/** Share of a group that follows at least one owned channel, 0..1. */
export function coverageOf(state: GameState, group: GroupDef): number {
  let miss = 1;
  for (const ch of state.ownedChannels) miss *= 1 - (group.channels[ch] ?? 0);
  return 1 - miss;
}

/** Average trust in the outlet, weighted by how much each resident follows the owned channels. */
export function averageTrust(state: GameState, c: Content): number {
  let sum = 0;
  let weight = 0;
  for (const r of state.residents) {
    if (r.status !== 'active') continue;
    const w = coverageOf(state, groupOf(c, r.group));
    sum += w * r.trust;
    weight += w;
  }
  return weight > 0 ? sum / weight : 0;
}

/** The gentle first days (CONCEPT.md §4.7): conflicts between groups begin on this day. */
export function conflictsStarted(state: GameState, c: Content): boolean {
  return state.turn >= c.balance.conflictStartTurn;
}

/** The rival paper starts printing on its day (by mode) and until it closes. */
export function rivalStarted(state: GameState, c: Content): boolean {
  return !!state.rival && !state.rival.closed && state.turn >= c.balance.rivalStartTurn[state.mode];
}

/** Fact-checkers look at our stories from this day on: the first lies are forgiven. */
export function factCheckStarted(state: GameState, c: Content): boolean {
  return state.turn >= c.balance.factCheckStartTurn;
}
