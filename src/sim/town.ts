import { generateTown, isGeneratedTown, GEN_PREFIX } from './townGen';
import type { Balance, Content, Difficulty, GameMode, TownDef } from './types';

/** The campaign's towns (CONCEPT.md §9) and generated ones (`gen-<seed>`, §9.5). */
export function townOf(c: Content, id: string): TownDef {
  if (isGeneratedTown(id)) return generateTown(c, Number(id.slice(GEN_PREFIX.length)));
  const t = c.towns.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown town: ${id}`);
  return t;
}

/** How long a game in this town lasts for this side on this pass (the full destruction gets `ruinDays` on top). */
export function townDays(t: TownDef, mode: GameMode, level?: Difficulty): number {
  return (mode === 'destroy' && level ? t.passDays?.[level] : undefined) ?? t.modes?.[mode]?.days ?? t.days;
}

/**
 * The content of a campaign town, on top of the difficulty's (`withDifficulty` first): its groups,
 * buildings, game length and balance; multipliers keep the difficulty's scale (whole numbers stay whole).
 */
export function withTown(c: Content, id: string, mode: GameMode, level: Difficulty = 'normal'): Content {
  const t = townOf(c, id);
  const m = t.modes?.[mode];
  const balance = { ...c.balance, ...t.balance, ...m?.balance, turnLimit: townDays(t, mode, level) } as Balance;
  // The pass's main goal (CONCEPT.md §9.2); a stage goal moves the line to bring the town under.
  const goal = mode === 'destroy' ? t.goals?.[level] : undefined;
  if (goal) balance.goal = goal;
  if (goal?.type === 'stage') balance.winCityIndex = goal.index;
  // The full destruction takes longer than bringing the town to its knees.
  if (goal?.type === 'stage' && goal.index <= 30) balance.turnLimit += balance.ruinDays ?? 0;
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
