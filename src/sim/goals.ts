import { tensionLevel } from './relations';
import type { Content, GameState, TownGoal } from './types';

/**
 * The town's main goal (CONCEPT.md §9.2): what wins the destroy mode on this pass. A town without
 * one is brought down to `winCityIndex` («Упадок»), as in a single game.
 */
export function goalOf(c: Content): TownGoal {
  return c.balance.goal ?? { type: 'stage', index: c.balance.winCityIndex };
}

/** How far the goal is: `now` against `need`, and whether it is reached. */
export interface GoalProgress {
  goal: TownGoal;
  done: boolean;
  now: number;
  need: number;
  /** A «close» goal: people still at work in the open buildings of the type, and their jobs. */
  staff?: { workers: number; jobs: number };
}

export function goalProgress(state: GameState, c: Content): GoalProgress {
  const goal = goalOf(c);
  switch (goal.type) {
    case 'stage':
      return { goal, done: state.metrics.cityIndex < goal.index, now: Math.round(state.metrics.cityIndex), need: goal.index };
    case 'close': {
      const all = state.buildings.filter((b) => b.type === goal.building);
      const closed = all.filter((b) => !b.open).length;
      const need = Math.min(all.length, goal.count ?? all.length);
      const open = new Set(all.filter((b) => b.open).map((b) => b.id));
      const workers = state.residents.filter((r) => r.status === 'active' && r.job !== null && open.has(r.job)).length;
      const jobs = all.reduce((s, b) => s + b.jobs, 0);
      return { goal, done: all.length > 0 && closed >= need, now: closed, need, staff: { workers, jobs } };
    }
    case 'drive': {
      const group = state.residents.filter((r) => r.group === goal.group);
      const left = group.filter((r) => r.status === 'left').length;
      const need = Math.max(1, Math.ceil(goal.share * group.length));
      return { goal, done: left >= need, now: left, need };
    }
    case 'clashes':
      return { goal, done: state.clashDays >= goal.days, now: state.clashDays, need: goal.days };
    case 'rival':
      return { goal, done: !!state.rival?.closed, now: state.rival?.closed ? 1 : 0, need: 1 };
    case 'gang':
      return { goal, done: state.crimeBoost > 0, now: Math.round(state.metrics.order * 100), need: Math.round(c.balance.gangOrder * 100) };
  }
}

/** Counts the days some pair of groups stays at clashes (end of the day, after relations moved). */
export function updateGoal(state: GameState, c: Content): void {
  const clashing = Object.values(state.tension).some((t) => tensionLevel(c, t) === 3);
  state.clashDays = clashing ? (state.clashDays ?? 0) + 1 : 0;
}
