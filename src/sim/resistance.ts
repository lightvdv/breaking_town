import { clamp } from './lookup';
import type { Modifiers } from './modifiers';
import { addTension, pairKeys } from './relations';
import { weightedPick, type RngState } from './rng';
import type { BuildingType, Content, DefenderDef, DefenderState, GameState, NoiseKind, PersonDef, ResistanceReport } from './types';

/**
 * The town's resistance (CONCEPT.md §5.7): our noise fills a scale, the scale raises named residents
 * against the paper, and the paper beats them with dirt (an investigation about the person) or by
 * closing where they work. Nothing here loses the game: the town rallies at 100 instead.
 */

export function defenderOf(c: Content, id: string): DefenderDef {
  const d = c.defenders.find((x) => x.id === id);
  if (!d) throw new Error(`Unknown defender ${id}`);
  return d;
}

export function personOf(c: Content, id: string): PersonDef | undefined {
  return c.people.find((x) => x.id === id);
}

export function isDefending(state: GameState, id: string): boolean {
  return state.defenders.some((d) => d.id === id);
}

/** What the standing defenders do to the paper, on top of its own modifiers. */
export function applyDefenders(state: GameState, c: Content, m: Modifiers): void {
  for (const d of state.defenders ?? []) {
    const def = c.defenders.find((x) => x.id === d.id);
    if (!def) continue;
    const k = d.level * c.balance.defenderPowerMul;
    const e = def.effect;
    const mul = (v: number | undefined) => Math.max(0.1, 1 + (v ?? 0) * k);
    m.checkerMul *= mul(e.checkerMul);
    m.scaryImpactMul *= mul(e.scaryImpactMul);
    m.wordOfMouthMul *= mul(e.wordOfMouthMul);
    m.lateExposureMul *= mul(e.lateExposureMul);
    m.crimeCoolMul *= mul(e.crimeCoolMul);
    for (const [g, v] of Object.entries(e.groupChurn ?? {})) m.groupChurn[g] = (m.groupChurn[g] ?? 0) + (v ?? 0) * k;
    for (const [t, v] of Object.entries(e.stainTypeMul ?? {}) as [BuildingType, number][]) m.stainTypeMul[t] = (m.stainTypeMul[t] ?? 1) * mul(v);
  }
}

/** Our noise of one turn by kind, in points before `resistanceGainMul`. */
export type Noise = Partial<Record<NoiseKind, number>>;

export function addNoise(noise: Noise, kind: NoiseKind, points: number): void {
  if (points > 0) noise[kind] = (noise[kind] ?? 0) + points;
}

/** The thresholds the scale must cross for a defender to stand up. */
function pickDefender(state: GameState, c: Content, rng: RngState): DefenderDef | null {
  const by = state.resistanceBy;
  const total = Object.values(by).reduce((a, v) => a + (v ?? 0), 0) || 1;
  const options = c.defenders
    .filter((d) => !isDefending(state, d.id) && !state.defendersDone.includes(d.id))
    .filter((d) => {
      const rid = state.people[d.id];
      return rid !== undefined && state.residents[rid]?.status === 'active';
    })
    // The kinds of noise we lean on raise the defenders against them.
    .map((d) => ({ d, weight: 1 + (4 * d.against.reduce((a, k) => a + (by[k] ?? 0), 0)) / total }));
  return options.length ? weightedPick(rng, options).d : null;
}

/**
 * The scale after an issue: today's noise and the dirt we printed on defenders (`discredit`: person
 * id → share of its readers who believed it), then the defenders grow, give up or stand up.
 * Called after the city day (`turn` = the new day). Returns null before the resistance starts.
 */
export function advanceResistance(
  state: GameState,
  c: Content,
  rng: RngState,
  noise: Noise,
  clean: boolean,
  discredit: Record<string, number>,
): ResistanceReport | null {
  const b = c.balance;
  const turn = state.turn;
  if (turn <= b.resistanceStartTurn) {
    state.resistance = 0;
    return null;
  }
  const before = state.resistance;
  const gain = Object.values(noise).reduce((a, v) => a + (v ?? 0), 0) * b.resistanceGainMul;
  let value = before + gain - b.resistanceDecay - (clean ? b.resistanceCleanDecay : 0);
  for (const [k, v] of Object.entries(noise) as [NoiseKind, number][]) state.resistanceBy[k] = (state.resistanceBy[k] ?? 0) + v;

  const report: ResistanceReport = { before, after: 0, gain: { ...noise }, rose: null, beaten: [], stronger: [], calmed: [], rallied: false };
  const beat = (d: DefenderState, why: ResistanceReport['beaten'][number]['why']) => {
    state.defenders = state.defenders.filter((x) => x !== d);
    state.defendersDone.push(d.id);
    report.beaten.push({ id: d.id, why });
  };

  for (const d of [...state.defenders]) {
    const share = discredit[d.id];
    if (share !== undefined) {
      if (share >= b.defenderBeatShare) {
        beat(d, 'discredited');
        value -= b.defenderBeatenDrop;
        continue;
      }
      d.level = Math.min(b.defenderMaxLevel, d.level + 1);
      report.stronger.push(d.id);
    }
    const rid = state.people[d.id];
    if (rid === undefined || state.residents[rid]?.status !== 'active') beat(d, 'left');
    else if (d.building !== null && !state.buildings[d.building]?.open) beat(d, 'closed');
    else if (turn > d.since && (turn - d.since) % b.defenderGrowDays === 0) d.level = Math.min(b.defenderMaxLevel, d.level + 1);
  }

  // The town rallies: quarrels cool, people take heart, the defenders grow.
  if (value >= 100) {
    report.rallied = true;
    for (const key of pairKeys(c)) addTension(state, key, -b.rallyTension);
    for (const r of state.residents) if (r.status === 'active') r.outlook = clamp(r.outlook + b.rallyOutlook);
    for (const d of state.defenders) d.level = Math.min(b.defenderMaxLevel, d.level + 1);
    value = b.rallyTo;
  }
  value = Math.max(0, Math.min(100, value));

  // The town calmed down: the defenders go home.
  if (value < b.resistanceCalm && state.defenders.length) {
    report.calmed = state.defenders.map((d) => d.id);
    state.defenders = [];
  }

  // A beaten defender spent the wave that raised them: the thresholds still under the scale wait for it to fall first.
  if (report.beaten.length) b.resistanceThresholds.forEach((t, i) => value >= t && !state.resistanceFired.includes(i) && state.resistanceFired.push(i));
  state.resistanceFired = state.resistanceFired.filter((i) => value > b.resistanceThresholds[i] - b.resistanceRearm);
  const next = b.resistanceThresholds.findIndex((t, i) => value >= t && !state.resistanceFired.includes(i));
  if (next >= 0 && state.defenders.length < b.defendersMax) {
    const def = pickDefender(state, c, rng);
    if (def) {
      state.resistanceFired.push(next);
      state.resistanceBy = {};
      const rid = state.people[def.id];
      state.defenders.push({ id: def.id, level: 1, since: turn, building: state.residents[rid].job });
      report.rose = def.id;
    }
  }

  state.resistance = value;
  report.after = value;
  return report;
}
