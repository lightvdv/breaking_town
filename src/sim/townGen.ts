import { createRng, int, pick } from './rng';
import type { Balance, Content, TownChoice, TownDef } from './types';

/** Ids of generated towns: `gen-<size>.<way>.<rule>.<goal>`, or `gen-<seed>` for a random choice. */
export const GEN_PREFIX = 'gen-';

export function isGeneratedTown(id: string): boolean {
  return id.startsWith(GEN_PREFIX);
}

export function choiceId(x: TownChoice): string {
  return `${GEN_PREFIX}${x.size}.${x.way}.${x.rule}.${x.goal}`;
}

export function parseChoice(tail: string): TownChoice {
  const [size, way, rule, goal] = tail.split('.');
  return { size, way, rule, goal };
}

/** A random choice from a seed: the same seed always gives the same one. */
export function randomChoice(c: Content, seed: number): TownChoice {
  const g = c.townGen;
  const rng = createRng(seed ^ 0x2c1b3c6d);
  return { size: pick(rng, g.sizes).id, way: pick(rng, g.archetypes).id, rule: pick(rng, g.rules).id, goal: pick(rng, g.goals).id };
}

/**
 * How strong the news of this town are, how much longer or shorter its game is, and whether the
 * calibration ran out of room (CONCEPT.md §9.5): the measured corrections of its four choices add up,
 * so that any town keeps the difficulty's chances. Past the range of strength the days make up the rest.
 */
export function townPower(c: Content, x: TownChoice): { power: number; days: number; clamped: boolean } {
  const m = c.townCalibration;
  const g = c.townGen;
  const combo = m.combos[`${x.size}.${x.way}.${x.rule}.${x.goal}`] ?? 0;
  const wanted = (m.size[x.size] ?? 0) + (m.way[x.way] ?? 0) + (m.rule[x.rule] ?? 0) + (m.goal[x.goal] ?? 0) + combo;
  const [lo, hi] = g.powerRange;
  const power = Math.min(hi, Math.max(lo, Math.exp(wanted)));
  const wantedDays = 1 + g.daysPerLn * (wanted - Math.log(power));
  const days = Math.min(g.daysRange[1], Math.max(g.daysRange[0], wantedDays));
  return { power, days, clamped: days !== wantedDays };
}

/** What makes the news stronger: their impact, and the stain and the crime heat that do not follow it. */
export function powerMul(power: number): Partial<Record<keyof Balance, number>> {
  return { impactNorm: 1 / power, huntStain: power, crimeHeatGain: power };
}

/**
 * The town generator (CONCEPT.md §9.5): a size, a way of life (its groups and buildings), one special
 * rule and a main goal, chosen by the player or at random. The town plays like a campaign town.
 */
export function composeTown(c: Content, x: TownChoice): TownDef {
  const g = c.townGen;
  const size = g.sizes.find((s) => s.id === x.size);
  const arch = g.archetypes.find((a) => a.id === x.way);
  const rule = g.rules.find((r) => r.id === x.rule);
  const goal = g.goals.find((o) => o.id === x.goal)?.goal;
  if (!size || !arch || !rule || !goal) throw new Error(`Unknown town choice: ${JSON.stringify(x)}`);
  // A name of its own, the same for the same choice: never one of the campaign's towns.
  const id = choiceId(x);
  const rng = createRng([...id].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7));
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
  const tuned = townPower(c, x);
  const days = Math.round(size.days * tuned.days);
  const balanceMul: Partial<Record<keyof Balance, number>> = { ...arch.balanceMul, ...rule.balanceMul };
  for (const [key, mul] of Object.entries(powerMul(tuned.power)) as [keyof Balance, number][]) balanceMul[key] = (balanceMul[key] ?? 1) * mul;
  return {
    id,
    name,
    type: arch.type,
    look: arch.id,
    size: size.name,
    rule: { title: rule.title, text: `${arch.text} ${rule.text}` },
    days,
    stars: size.stars,
    groups: arch.groups,
    buildings,
    balance: { population: size.population, maxPopulation: size.maxPopulation, ...arch.balance, ...rule.balance },
    balanceMul,
    modes: { destroy: { days } },
    map: { x: 0, y: 0 },
    goals: { easy: goal, normal: goal, hard: goal },
  };
}

/** A town of a random choice. */
export function generateTown(c: Content, seed: number): TownDef {
  return { ...composeTown(c, randomChoice(c, seed)), id: `${GEN_PREFIX}${seed}` };
}
