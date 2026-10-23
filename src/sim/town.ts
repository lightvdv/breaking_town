import type { Balance, Content, GameMode, TownDef } from './types';

/** The campaign's towns (CONCEPT.md §9). */
export function townOf(c: Content, id: string): TownDef {
  const t = c.towns.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown town: ${id}`);
  return t;
}

/** How long a game in this town lasts for this side. */
export function townDays(t: TownDef, mode: GameMode): number {
  return t.modes?.[mode]?.days ?? t.days;
}

/**
 * The content of a campaign town, on top of the difficulty's (`withDifficulty` first): its groups,
 * buildings, game length and balance; multipliers keep the difficulty's scale (whole numbers stay whole).
 */
export function withTown(c: Content, id: string, mode: GameMode): Content {
  const t = townOf(c, id);
  const m = t.modes?.[mode];
  const balance = { ...c.balance, ...t.balance, ...m?.balance, turnLimit: townDays(t, mode) } as Balance;
  for (const [key, mul] of Object.entries(t.balanceMul ?? {}) as [keyof Balance, number][]) {
    const v = balance[key];
    if (typeof v !== 'number') continue;
    const scaled = v * mul;
    (balance as unknown as Record<string, number>)[key] = Number.isInteger(v) ? Math.round(scaled) : scaled;
  }
  return {
    ...c,
    balance,
    groups: c.groups.map((g) => (t.groups?.[g.id] !== undefined ? { ...g, share: t.groups[g.id]! } : g)),
    buildings: c.buildings.map((b) => (t.buildings?.[b.type] ? { ...b, ...t.buildings[b.type] } : b)),
  };
}
