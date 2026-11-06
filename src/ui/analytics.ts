/**
 * Anonymous play statistics (CONCEPT.md §7.6) through PostHog (EU cloud): how people play, where they
 * stop, what they never open. Only a random id, no personal data; the player turns it off in the
 * settings («Отправлять анонимную статистику»). Off on the dev server and in tests. Every call is safe:
 * a blocked or failed PostHog never breaks the game.
 */
import posthog from 'posthog-js';
import { lang } from '../i18n';
import { STORAGE_SUFFIX } from '../assets';
import { averageTrust, cityStateOf, readerCount, scoreOf, type Content, type Decision, type GameState, type TurnReport } from '../sim';

/** The project's public key: it only lets a browser send events, so it is meant to live in the page. */
const KEY = 'phc_D6F4obbVxFXtjVqjRxrug2SHp2LyExS7kCZKKWnatZsD';
const HOST = 'https://eu.i.posthog.com';

let on = false;

/** Which build sends: the testers' beta, the dev preview, the itch.io zip or a local check ('local'). */
function build(): string {
  if (/^(localhost|127\.)/.test(location.hostname)) return 'local';
  if (import.meta.env.VITE_LANG === 'en' && import.meta.env.BASE_URL === './') return 'itch';
  return STORAGE_SUFFIX ? 'dev' : 'beta';
}

export function initAnalytics(enabled: boolean): void {
  if (import.meta.env.DEV || import.meta.env.MODE === 'test') return;
  try {
    posthog.init(KEY, {
      api_host: HOST,
      persistence: 'localStorage',
      person_profiles: 'identified_only',
      autocapture: false,
      capture_pageview: true,
      capture_pageleave: true,
      capture_exceptions: true,
      disable_session_recording: false,
      opt_out_capturing_by_default: !enabled,
      // `?phdebug` in the address logs what PostHog does to the console.
      loaded: (ph) => {
        if (location.search.includes('phdebug')) ph.debug(true);
      },
    });
    posthog.register({ build: build(), lang: lang(), phone: matchMedia('(max-width: 900px)').matches });
    on = true;
  } catch {
    on = false;
  }
}

/** The player's choice in the settings. */
export function setAnalytics(enabled: boolean): void {
  if (!on) return;
  try {
    if (enabled) posthog.opt_in_capturing();
    else posthog.opt_out_capturing();
  } catch {
    // Nothing to do: statistics are never worth an error.
  }
}

export function track(event: string, props: Record<string, unknown> = {}): void {
  if (!on) return;
  try {
    posthog.capture(event, props);
  } catch {
    // Ignored on purpose.
  }
}

/** Sent as the page closes, straight away (the batch queue would be lost): where the player stopped. */
export function trackLeave(props: Record<string, unknown>): void {
  if (!on) return;
  try {
    posthog.capture('leave', props, { transport: 'sendBeacon' });
  } catch {
    // Ignored on purpose.
  }
}

/** What every game event says about the game it is in. */
export function gameProps(state: GameState, kind: string): Record<string, unknown> {
  return { kind, difficulty: state.difficulty, length: state.length, town: state.town ?? null, day: state.turn };
}

/** One played day: the player's moves and where the paper and the town stand after it. */
export function trackTurn(state: GameState, c: Content, kind: string, decision: Decision, report: TurnReport): void {
  if (!on) return;
  const printed = decision.publish;
  track('turn_end', {
    ...gameProps(state, kind),
    day: report.turn,
    money: state.money,
    readers: readerCount(state),
    reputation: Math.round(averageTrust(state, c) * 100),
    city_index: Math.round(report.metricsAfter.cityIndex),
    city_stage: cityStateOf(c, report.metricsAfter.cityIndex),
    printed: printed.length,
    distorted: printed.filter((p) => p.distortion > 0).length,
    soothed: printed.filter((p) => p.distortion < 0).length,
    issue_level: report.issue.level,
    exposures: report.exposures.length,
    reporters: state.reporters.length,
    cards: state.upgrades.length,
    hunt: !!state.hunt,
    digging: state.investigations.length,
    loan: !!state.loan,
    price: state.price,
  });
  if (state.outcome) {
    track('game_end', {
      ...gameProps(state, kind),
      day: report.turn,
      result: state.outcome.result,
      reason: state.outcome.reason,
      stars: scoreOf(state, c).stars,
      city_index: Math.round(report.metricsAfter.cityIndex),
    });
  }
}
