import type { Balance, Content, Difficulty, GameLength, GameMode } from './types';

/**
 * The content a game of this difficulty runs on (CONCEPT.md §4.6): the balance with the level's
 * overrides. The sim always gets the adjusted content; the difficulty itself is kept in the state.
 */
export function withDifficulty(c: Content, difficulty: Difficulty, mode: GameMode): Content {
  const def = c.difficulties.find((x) => x.id === difficulty);
  const patch = { ...def?.balance, ...def?.modes[mode] };
  if (!Object.keys(patch).length) return c;
  return { ...c, balance: { ...c.balance, ...patch } as Balance };
}

/**
 * The content of a full or short game (CONCEPT.md §4.6а), on top of the difficulty's: the short
 * game has its own turn limit by difficulty, a nearer goal and a quicker start; multipliers keep the
 * difficulty's scale.
 */
export function withLength(c: Content, length: GameLength, difficulty: Difficulty): Content {
  const def = c.lengths.find((x) => x.id === length);
  if (!def || (!def.balance && !def.balanceMul && !def.days)) return c;
  const balance = { ...c.balance, ...def.balance } as Balance;
  if (def.days) balance.turnLimit = def.days[difficulty];
  for (const [key, mul] of Object.entries(def.balanceMul ?? {}) as [keyof Balance, number][]) {
    const v = balance[key];
    if (typeof v === 'number') (balance as unknown as Record<string, number>)[key] = Number.isInteger(v) ? Math.round(v * mul) : v * mul;
  }
  return { ...c, balance };
}
