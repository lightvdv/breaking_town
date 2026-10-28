import tutorial from '../content/tutorial.json';
import { cardTruth, lureBlock, templateOf, type Balance, type CardInstance, type Content, type Decision, type Difficulty, type GameLength, type GameState, type TurnReport } from '../sim';

/**
 * The tutorial mission (CONCEPT.md §7.3 «Обучение»): an easy short game where the player is given one
 * task at a time — hire a reporter, frame a story, buy an upgrade, a run of truth, dig, stir a
 * conflict, hunt, strike the rival — and the button to press glows. A step is done by doing it in the
 * game; any step can be skipped. The texts live in `content/tutorial.json`.
 */

export interface TutorialProgress {
  /** Index of the current step; past the last one the tutorial is over. */
  step: number;
  /** What the player's issues did so far: printed, distorted, heated, stigma, streak. */
  flags: string[];
  /** Steps done or skipped, also out of order: a done step stays done. */
  done?: string[];
}

export interface TutorialStep {
  id: string;
  title: string;
  text: string;
  /** One line for the bar over windows. */
  hint: string;
  /** Shown instead of the text while the step cannot be done yet. */
  ready?: string;
}

export const tutorialSteps = tutorial.steps as TutorialStep[];
export const tutorialDifficulty = tutorial.difficulty as Difficulty;
export const tutorialLength = tutorial.length as GameLength;

/** The tutorial game's balance on top of its difficulty and length: no tasks, twist or offers to distract. */
export function withTutorial(c: Content): Content {
  return { ...c, balance: { ...c.balance, ...(tutorial.balance as Partial<Balance>) } };
}

/** What the screen shows now, for the step's checks and the buttons to light up. */
export interface TutorialView {
  state: GameState;
  c: Content;
  /** The issue as laid out: cards with their placement and framing. */
  laidOut: { card: CardInstance; placement: number; distortion: number }[];
  /** An open truth menu, the reporter search running. */
  menuOpen: boolean;
  searching: boolean;
}

const isStigma = (v: TutorialView, x: CardInstance) => templateOf(v.c, x.templateId).source === 'investigation' && !!templateOf(v.c, x.templateId).target;
const huntable = (v: TutorialView, x: CardInstance) => x.building !== undefined && !!v.state.buildings[x.building]?.open && v.state.buildings[x.building].jobs > 0;
const lureNow = (v: TutorialView) => {
  const block = lureBlock(v.state, v.c);
  return block === null || block === 'no money';
};

interface StepLogic {
  done: (v: TutorialView, flags: string[]) => boolean;
  /** False while the step cannot be done yet (no conflict story today, the rival not out yet). */
  ready?: (v: TutorialView) => boolean;
  /** Where to press, in order: the first selector with a visible element lights up. */
  targets: (v: TutorialView) => string[];
}

/** Lights up «Подача» of the matching story, the strongest option in its menu, then «В печать». */
const framingTargets = (v: TutorialView, match: (x: CardInstance) => boolean, laid: boolean) =>
  laid ? ['.publish'] : v.menuOpen ? ['[data-tut=distort]:not([disabled])'] : v.laidOut.filter((x) => match(x.card)).map((x) => `[data-uid="${x.card.uid}"] [data-tut=framing]`);

const logic: Record<string, StepLogic> = {
  front: { done: (_, f) => f.includes('printed'), targets: () => ['.publish'] },
  framing: {
    done: (_, f) => f.includes('distorted'),
    ready: (v) => !v.searching,
    targets: (v) =>
      framingTargets(
        v,
        (x) => !x.conflict && !x.debunk,
        v.laidOut.some((x) => x.distortion > 0),
      ).concat(v.laidOut.some((x) => x.placement === 2) ? [] : ['.publish']),
  },
  hire: { done: (v) => v.state.reporters.length >= 3, targets: () => ['[data-tut=hire]:not([disabled])', '[data-tut=agency]:not([disabled])', '.rep-slot'] },
  topic: { done: (v) => Object.values(v.state.reporterTopics).some((x) => x.length > 0), targets: () => ['[data-tut=topic-crime]', '.rep-card'] },
  shop: { done: (v) => v.state.upgrades.length > 0, targets: () => ['[data-tut=buy]:not([disabled])', '.hud-shop'] },
  // Rumors and lies break the run: their «✕» glows until the issue is all truth.
  streak: {
    done: (_, f) => f.includes('streak'),
    targets: (v) => [...v.laidOut.filter((x) => cardTruth(x.card, x.distortion) > 0).map((x) => `[data-uid="${x.card.uid}"] .out-btn`), '.streak-badge'],
  },
  dig: {
    done: (v, f) => v.state.investigations.length > 0 || f.includes('stigma') || v.state.hand.some((x) => isStigma(v, x)),
    targets: () => ['[data-tut=dig]', '.rep-card'],
  },
  stigma: {
    done: (_, f) => f.includes('stigma'),
    ready: (v) => v.state.hand.some((x) => isStigma(v, x)),
    targets: (v) => {
      const laid = v.laidOut.find((x) => isStigma(v, x.card));
      return laid?.placement === 2 ? ['.publish'] : ['[data-tut=to-front]:not([disabled])', ...v.state.hand.filter((x) => isStigma(v, x)).map((x) => `[data-uid="${x.uid}"]`)];
    },
  },
  conflict: {
    done: (_, f) => f.includes('heated'),
    ready: (v) => v.state.hand.some((x) => !!x.conflict),
    targets: (v) => {
      const laid = v.laidOut.some((x) => x.card.conflict && x.distortion > 0);
      return laid ? ['.publish'] : v.menuOpen ? ['[data-tut=distort]:not([disabled])'] : v.state.hand.filter((x) => x.conflict).map((x) => `[data-uid="${x.uid}"] [data-tut=framing]`);
    },
  },
  hunt: {
    done: (v) => v.state.hunt !== null,
    ready: (v) => v.state.hand.some((x) => huntable(v, x)),
    targets: () => ['button.hunt-chip'],
  },
  lure: {
    done: (v) => (v.state.rival?.lured ?? 0) > 0 || !!v.state.rival?.closed,
    ready: lureNow,
    targets: () => ['[data-tut=lure]:not([disabled])', '.rival-toggle'],
  },
  goal: { done: (v) => !!v.state.outcome, targets: () => ['.hud-goal'] },
};

/**
 * The step the player is on: the first not done yet; while it waits (the dirt is still being dug,
 * no conflict today) a later step that can be done now goes ahead. Null when the tutorial is over.
 */
export function currentStep(p: TutorialProgress, v: TutorialView): { def: TutorialStep; index: number; ready: boolean } | null {
  const done = new Set(p.done ?? []);
  tutorialSteps.forEach((x, i) => {
    if (i < p.step || logic[x.id]?.done(v, p.flags)) done.add(x.id);
  });
  p.done = [...done];
  const open = tutorialSteps.map((def, index) => ({ def, index, ready: logic[def.id]?.ready?.(v) ?? true })).filter((x) => !done.has(x.def.id));
  if (!open.length) return null;
  p.step = open[0].index;
  if (open[0].ready || open[0].def.id === 'goal') return open[0];
  return open.find((x) => x.ready && x.def.id !== 'goal') ?? open[0];
}

/** Skips a step (it counts as done). */
export function skipStep(p: TutorialProgress, id: string): void {
  p.done = [...new Set([...(p.done ?? []), id])];
}

/** Selectors of the button to press now, first visible first. */
export function stepTargets(id: string, v: TutorialView): string[] {
  return logic[id]?.targets(v) ?? [];
}

/** After an issue: what it did, for the steps that are done by printing. */
export function issueFlags(hand: CardInstance[], c: Content, d: Decision, r: TurnReport): string[] {
  const out = ['printed'];
  for (const p of d.publish) {
    const card = hand.find((x) => x.uid === p.cardUid);
    if (!card) continue;
    if (p.distortion > 0) out.push(card.conflict ? 'heated' : 'distorted');
    if (templateOf(c, card.templateId).source === 'investigation' && templateOf(c, card.templateId).target) out.push('stigma');
  }
  if (r.cleanStreak.bonus > 0) out.push('streak');
  return out;
}
