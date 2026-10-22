import { clamp } from './lookup';
import { pick, type RngState } from './rng';
import { giveTask } from './tasks';
import type { Content, GameState, TwistDef } from './types';

/**
 * The mid-game twist (CONCEPT.md §4.9): on `twistTurn` one of the twists of the mode begins — the
 * mayor's election, an audit with a task, or the governor's visit — and changes the rest of the game.
 */

export function twistOf(c: Content, id: string): TwistDef {
  const t = c.twists.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown twist: ${id}`);
  return t;
}

/** The election's winner if it were held today: a calm town chooses the peacemaker. */
export function electionLeader(state: GameState, c: Content): 'peacemaker' | 'hardliner' {
  return state.metrics.mood >= c.balance.electionPivot ? 'peacemaker' : 'hardliner';
}

/** The twist running today (it began and has not ended). */
export function runningTwist(state: GameState): GameState['twist'] {
  const t = state.twist;
  return t && t.result === null && state.turn >= t.startTurn && state.turn < t.untilTurn ? t : null;
}

/** What the twist changes now: tension fading, incidents, reconciliation, fact-checkers. */
export function twistMods(state: GameState, c: Content): { decayMul: number; incidentMul: number; reconcileDrop: number; reconcile: boolean; checkerMul: number } {
  const b = c.balance;
  const mods = { decayMul: 1, incidentMul: 1, reconcileDrop: 0, reconcile: true, checkerMul: 1 };
  const t = state.twist;
  if (!t) return mods;
  if (t.result === 'peacemaker') {
    mods.decayMul = b.peacemakerDecayMul;
    mods.reconcileDrop = b.peacemakerReconcileDrop;
  } else if (t.result === 'hardliner') {
    mods.decayMul = b.hardlinerDecayMul;
    mods.incidentMul = b.hardlinerIncidentMul;
    // He reconciles too, but only when it is about to explode.
    mods.reconcileDrop = -b.hardlinerReconcileRise;
  }
  if (runningTwist(state) && twistOf(c, t.id).kind === 'governor') mods.checkerMul = b.governorCheckerMul;
  return mods;
}

/**
 * A day of the twist (in `startTurn`, before relations): it begins on its day, the governor helps the
 * town while he is here, and the election is held on its last day. Returns notes and whether it began
 * or ended today.
 */
export function advanceTwist(state: GameState, c: Content, rng: RngState): { notes: string[]; started: boolean; ended: boolean } {
  const b = c.balance;
  const out = { notes: [] as string[], started: false, ended: false };
  if (!state.twist && state.turn === b.twistTurn) {
    const pool = c.twists.filter((t) => !t.mode || t.mode === state.mode);
    if (!pool.length) return out;
    const def = pick(rng, pool);
    // It lasts `days` issues; the election is held, and the governor leaves, the morning after the last.
    state.twist = { id: def.id, startTurn: state.turn, untilTurn: state.turn + def.days, result: null };
    if (def.kind === 'audit' && def.task) giveTask(state, c, def.task);
    out.notes.push(def.title);
    out.started = true;
  }
  const t = state.twist;
  if (!t || t.result !== null) return out;
  const def = twistOf(c, t.id);
  if (def.kind === 'governor' && state.turn < t.untilTurn) {
    for (const r of state.residents) if (r.status === 'active') r.mood = clamp(r.mood + b.governorMood);
  }
  if (state.turn < t.untilTurn) return out;
  // The morning after its last day: the town has voted; the governor leaves. The audit ends with its task.
  if (def.kind === 'election') {
    t.result = electionLeader(state, c);
    out.notes.push(`Новый мэр — ${def.candidates?.[t.result === 'peacemaker' ? 0 : 1] ?? ''}`);
    out.ended = true;
  } else if (def.kind === 'governor') {
    t.result = 'passed';
    out.ended = true;
  }
  return out;
}

/** The audit ends when its task is done or failed. */
export function settleAudit(state: GameState, c: Content, done: string[], failed: string[]): boolean {
  const t = state.twist;
  if (!t || t.result !== null) return false;
  const task = twistOf(c, t.id).task;
  if (!task) return false;
  if (done.includes(task)) t.result = 'passed';
  else if (failed.includes(task)) t.result = 'failed';
  return t.result !== null;
}
