import type { Balance, Content, Difficulty, GameMode } from './types';

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
