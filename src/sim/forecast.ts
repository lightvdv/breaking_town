import { averageTrust } from './lookup';
import { createRng } from './rng';
import { playTurn } from './game';
import type { Content, Decision, GameState } from './types';

/** What the issue as laid out now is expected to do: average changes over a few rehearsals. */
export interface Forecast {
  money: number;
  readers: number;
  trust: number;
  /** The city index after the next day. */
  cityIndex: number;
}

/**
 * Rehearses the turn on copies of the state (CONCEPT.md §7.3 «прогноз»): the real state is not
 * touched. Every rehearsal uses the same random streams whatever the layout, so two layouts differ
 * by the choice, not by luck. Returns null if the decision is not allowed.
 */
export function forecastTurn(state: GameState, c: Content, d: Decision, samples = 3): Forecast | null {
  const sum: Forecast = { money: 0, readers: 0, trust: 0, cityIndex: 0 };
  const json = JSON.stringify(state);
  for (let i = 0; i < samples; i++) {
    const copy = JSON.parse(json) as GameState;
    copy.rng = createRng((state.seed * 31 + state.turn * 7919 + i * 104729) >>> 0);
    let report;
    try {
      report = playTurn(copy, c, d);
    } catch {
      return null;
    }
    sum.money += report.moneyDelta;
    sum.readers += report.readers.after - report.readers.before;
    sum.trust += averageTrust(copy, c) - report.trustBefore;
    sum.cityIndex += report.metricsAfter.cityIndex;
  }
  return { money: sum.money / samples, readers: sum.readers / samples, trust: sum.trust / samples, cityIndex: sum.cityIndex / samples };
}
