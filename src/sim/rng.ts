/**
 * Seeded PRNG (mulberry32). The state is a plain object so it serializes with the game state;
 * every random choice in the simulation must go through these helpers.
 */
export interface RngState {
  s: number;
}

export function createRng(seed: number): RngState {
  return { s: seed >>> 0 };
}

export function next(r: RngState): number {
  r.s = (r.s + 0x6d2b79f5) >>> 0;
  let t = r.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function chance(r: RngState, p: number): boolean {
  return next(r) < p;
}

export function int(r: RngState, maxExclusive: number): number {
  return Math.floor(next(r) * maxExclusive);
}

export function pick<T>(r: RngState, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick from empty list');
  return items[int(r, items.length)];
}

export function weightedPick<T extends { weight: number }>(r: RngState, items: readonly T[]): T {
  const total = items.reduce((s, x) => s + x.weight, 0);
  let roll = next(r) * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll < 0) return item;
  }
  return items[items.length - 1];
}
