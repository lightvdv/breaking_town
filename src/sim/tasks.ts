import { averageTrust, clamp } from './lookup';
import { readerCount } from './readers';
import { pick, type RngState } from './rng';
import { staffOf } from './staff';
import type { Content, ExposedStory, GameState, TaskDef, TaskState } from './types';

/**
 * Tasks (CONCEPT.md §4.8): the holding (in the save mode, the paper's board) gives a couple of side
 * goals with a deadline and a reward; the mid-game audit adds one with a penalty. All tasks done is
 * one of the game's stars.
 */

export function taskOf(c: Content, id: string): TaskDef {
  const t = c.tasks.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown task: ${id}`);
  return t;
}

/** The value a check counts from when the task is given. */
function baseOf(state: GameState, def: TaskDef): number {
  switch (def.check.type) {
    case 'debunks':
      return state.rival?.debunked ?? 0;
    case 'readersGain':
      return readerCount(state);
    case 'cityDrop':
      return state.metrics.cityIndex;
    case 'upgrades':
      return state.upgrades.length;
    default:
      return 0;
  }
}

/** What a done task pays at this difficulty. */
export function taskReward(c: Content, def: TaskDef): number {
  return Math.round(def.reward * c.balance.taskRewardMul);
}

/** A done task's prize beside the money: a free deck card, reputation or experience. */
function givePrize(state: GameState, c: Content, def: TaskDef): void {
  const p = def.prize;
  if (!p) return;
  if (p.type === 'voucher') state.vouchers++;
  else if (p.type === 'trust') for (const r of state.residents) r.trust = clamp(r.trust + p.amount, 0, 100);
  else for (const id of state.reporters) staffOf(state, c, id).xp += p.amount;
}

/** Gives a task now. */
export function giveTask(state: GameState, c: Content, id: string): TaskState {
  const def = taskOf(c, id);
  const task: TaskState = { id, startTurn: state.turn, untilTurn: state.turn + def.days - 1, status: 'active', base: baseOf(state, def) };
  state.tasks.push(task);
  return task;
}

/** The game's ordinary tasks, given on their day: different ones, of this mode. */
export function assignTasks(state: GameState, c: Content, rng: RngState): void {
  if (state.turn !== c.balance.taskStartTurn || state.tasks.some((t) => !taskOf(c, t.id).twist)) return;
  // A goal the town already meets (a bar that has closed) is no task.
  const met = (t: TaskDef) => t.kind === 'reach' && taskProgress(state, c, { id: t.id, startTurn: state.turn, untilTurn: state.turn, status: 'active', base: baseOf(state, t) }).holds;
  const pool = c.tasks.filter((t) => !t.twist && (!t.mode || t.mode === state.mode) && !met(t));
  for (let i = 0; i < c.balance.taskCount && pool.length; i++) {
    const def = pick(rng, pool);
    pool.splice(pool.indexOf(def), 1);
    giveTask(state, c, def.id);
  }
}

/** Where a task stands: the current value against its target (for the progress line). */
export function taskProgress(state: GameState, c: Content, task: TaskState): { value: number; target: number; holds: boolean } {
  const ch = taskOf(c, task.id).check;
  const of = (value: number, target: number) => ({ value, target, holds: value >= target });
  switch (ch.type) {
    case 'closed':
      return of(state.buildings.filter((x) => x.type === ch.building && !x.open).length, 1);
    case 'left': {
      const group = state.residents.filter((r) => r.group === ch.group);
      const left = group.filter((r) => r.status === 'left').length;
      return of(left, Math.max(1, Math.ceil(group.length * ch.share)));
    }
    case 'protesters':
      return of(state.residents.filter((r) => r.status === 'active' && r.protestTurns > 0).length, ch.count);
    case 'readers':
      return of(readerCount(state), ch.count);
    case 'readersGain':
      return of(readerCount(state) - task.base, ch.count);
    case 'income':
      return of(state.lastProfit, ch.amount);
    case 'upgrades':
      return of(state.upgrades.length - task.base, ch.count);
    case 'reporters':
      return of(state.reporters.length, ch.count);
    case 'noExposure':
      return of(0, 0);
    case 'trust':
      return of(Math.round(averageTrust(state, c)), ch.min);
    case 'mood':
      return of(Math.round(state.metrics.mood * 100), Math.round(ch.min * 100));
    case 'debunks':
      return of((state.rival?.debunked ?? 0) - task.base, ch.count);
    case 'cityDrop':
      return of(Math.round(task.base - state.metrics.cityIndex), ch.amount);
    case 'cityBelow':
      return { value: Math.round(state.metrics.cityIndex), target: ch.index, holds: state.metrics.cityIndex < ch.index };
    case 'scared':
      return of(Object.values(state.lastReactions).filter((x) => x === 'scared').length, ch.count);
  }
}

/**
 * After the turn: reach tasks are done when their check holds, keep tasks fail when it breaks (an
 * exposure breaks «no exposures»); at the deadline the rest are settled. Done tasks pay their reward,
 * a failed audit cuts the budget. Returns what changed.
 */
export function updateTasks(state: GameState, c: Content, exposures: ExposedStory[]): { done: string[]; failed: string[]; reward: number } {
  const out = { done: [] as string[], failed: [] as string[], reward: 0 };
  // The day that just ended: tasks are settled for it.
  const day = state.turn - 1;
  for (const task of state.tasks) {
    if (task.status !== 'active' || task.startTurn > day) continue;
    const def = taskOf(c, task.id);
    const holds = def.check.type === 'noExposure' ? exposures.length === 0 : taskProgress(state, c, task).holds;
    let status: TaskState['status'] | null = null;
    if (def.kind === 'reach') status = holds ? 'done' : day >= task.untilTurn ? 'failed' : null;
    else status = !holds ? 'failed' : day >= task.untilTurn ? 'done' : null;
    if (!status) continue;
    task.status = status;
    task.endTurn = day;
    if (status === 'done') {
      const reward = taskReward(c, def);
      state.money += reward;
      out.reward += reward;
      givePrize(state, c, def);
      out.done.push(task.id);
    } else {
      state.budgetCut += def.penalty ?? 0;
      out.failed.push(task.id);
    }
  }
  return out;
}

/**
 * The game's stars (CONCEPT.md §4.8): a win, all ordinary tasks done, not a single exposure.
 * A lost game has none.
 */
export function scoreOf(state: GameState, c: Content): { win: boolean; tasks: boolean; clean: boolean; stars: number } {
  const win = state.outcome?.result === 'win';
  const own = state.tasks.filter((t) => !taskOf(c, t.id).twist);
  const tasks = own.length > 0 && own.every((t) => t.status === 'done');
  const clean = state.exposedTotal === 0;
  return { win, tasks, clean, stars: win ? 1 + Number(tasks) + Number(clean) : 0 };
}
