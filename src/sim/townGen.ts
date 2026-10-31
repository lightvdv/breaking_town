import { createRng, int, pick } from './rng';
import type { Content, Difficulty, TownDef } from './types';

/** Ids of generated towns: `gen-<seed>`; the same seed always gives the same town. */
export const GEN_PREFIX = 'gen-';

export function isGeneratedTown(id: string): boolean {
  return id.startsWith(GEN_PREFIX);
}

/**
 * The town generator (CONCEPT.md §9.5): a size, a way of life (its groups, buildings and goals),
 * one special rule and a name, all from one seed. The generated town plays like a campaign town:
 * its own length and a main goal on each of the three passes.
 */
export function generateTown(c: Content, seed: number): TownDef {
  const g = c.townGen;
  const rng = createRng(seed ^ 0x2c1b3c6d);
  const size = pick(rng, g.sizes);
  const arch = pick(rng, g.archetypes);
  const rule = pick(rng, g.rules);
  // A name of its own: never one of the campaign's towns.
  let name = '';
  do name = int(rng, 4) === 0 ? `${pick(rng, g.names.adjectives)} ${pick(rng, g.names.nouns)}` : `${pick(rng, g.names.first)}${pick(rng, g.names.second)}`;
  while (c.towns.some((t) => t.name === name));
  // Buildings of the way of life and the rule, scaled by the size (whole numbers, at least one).
  const buildings: TownDef['buildings'] = {};
  for (const b of c.buildings) {
    const own = { ...arch.buildings?.[b.type], ...rule.buildings?.[b.type] };
    const count = own.count ?? b.count;
    const scaled = count === 0 ? 0 : Math.max(1, Math.round(count * (b.type === 'home' || b.type === 'shop' || b.type === 'entertainment' ? size.buildingMul : 1)));
    const jobs = own.jobs ?? b.jobs;
    const scaledJobs = b.type === 'factory' ? Math.round(jobs * size.buildingMul) : jobs;
    if (scaled !== b.count || scaledJobs !== b.jobs) buildings[b.type] = { count: scaled, jobs: scaledJobs };
  }
  const goals: TownDef['goals'] = {};
  for (const level of ['easy', 'normal', 'hard'] as Difficulty[]) goals[level] = pick(rng, arch.goals[level]);
  return {
    id: `${GEN_PREFIX}${seed}`,
    name,
    type: arch.type,
    size: size.name,
    rule: { title: rule.title, text: `${arch.text} ${rule.text}` },
    days: size.days,
    stars: size.stars,
    groups: arch.groups,
    buildings,
    balance: { population: size.population, maxPopulation: size.maxPopulation, ...arch.balance, ...rule.balance },
    balanceMul: { ...arch.balanceMul, ...rule.balanceMul },
    modes: { destroy: { days: size.days }, save: { days: size.days - 6 } },
    map: { x: 0, y: 0 },
    goals,
  };
}
