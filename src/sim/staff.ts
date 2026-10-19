import { clamp, templateOf } from './lookup';
import type { Modifiers } from './modifiers';
import { exposeNews, isHarmful, storyEffect, type PublishedNews } from './news';
import { chance, type RngState } from './rng';
import type { Content, ExposedStory, GameState, ReporterDef, StaffState } from './types';

/** A reporter's experience and loyalty (CONCEPT.md §3.3б); new hires start fresh. */
export function staffOf(state: GameState, c: Content, id: string): StaffState {
  return (state.staff[id] ??= { xp: 0, loyalty: c.balance.startLoyalty });
}

/** 0 = new, then one level per threshold of `reporterLevels`. */
export function levelOf(c: Content, xp: number): number {
  return c.balance.reporterLevels.filter((t) => xp >= t).length - 1;
}

/** The reporter as they work now: their skills grown with experience. */
export function skilledReporter(state: GameState, c: Content, def: ReporterDef): ReporterDef {
  const level = levelOf(c, staffOf(state, c, def.id).xp);
  if (level <= 0) return def;
  const b = c.balance;
  return {
    ...def,
    skills: { ...def.skills, luck: Math.min(0.98, def.skills.luck + level * b.levelLuck), nose: Math.min(3, def.skills.nose + level * b.levelNose) },
  };
}

/**
 * After the issue: printed stories give their authors experience; lies about them cost an honest
 * reporter's loyalty, the truth wins it back, bad news on someone's personal tie hurts them.
 * Who cannot take it any more quits — and may tell the rival about our lies.
 */
export function updateStaff(
  state: GameState,
  c: Content,
  rng: RngState,
  mods: Modifiers,
  published: PublishedNews[],
): { levelUps: string[]; quit: string[]; leaked: string[]; exposures: ExposedStory[] } {
  const b = c.balance;
  const levelUps: string[] = [];
  const reporters = new Map(c.reporters.map((r) => [r.id, r]));
  for (const id of state.reporters) {
    const s = staffOf(state, c, id);
    s.loyalty = clamp(s.loyalty + b.loyaltyRecovery);
  }
  for (const n of published) {
    const card = state.hand.find((x) => x.uid === n.pub.cardUid);
    if (!card) continue;
    const tpl = templateOf(c, card.templateId);
    const author = state.reporters.includes(card.reporterId) ? reporters.get(card.reporterId) : undefined;
    if (author) {
      const s = staffOf(state, c, author.id);
      const before = levelOf(c, s.xp);
      s.xp += b.xpPerPlacement[n.pub.placement];
      if (levelOf(c, s.xp) > before) levelUps.push(author.id);
      // Exaggeration they live with; an outright lie made of their story they take to heart.
      const lie = n.truth === 2 ? 2 - card.baseTruth : 0;
      s.loyalty = clamp(s.loyalty + (lie ? -b.lieLoyalty * author.honesty * lie : n.truth === 0 ? b.truthLoyalty : 0));
    }
    // Scary untruth about their son's factory hurts, whoever wrote it.
    if (n.truth > 0 && isHarmful(storyEffect(c, card, n.pub.distortion))) {
      for (const id of state.reporters) {
        const r = reporters.get(id)!;
        if (r.tie?.topic === tpl.topic) staffOf(state, c, id).loyalty = clamp(staffOf(state, c, id).loyalty - b.tieLoyalty);
      }
    }
  }
  const quit: string[] = [];
  const leaked: string[] = [];
  const exposures: ExposedStory[] = [];
  for (const id of [...state.reporters]) {
    // The last reporter stays, sulking: a paper with nobody cannot work.
    if (state.reporters.length <= 1 || staffOf(state, c, id).loyalty >= b.quitLoyalty) continue;
    removeReporter(state, id);
    quit.push(id);
    if (state.rival && !state.rival.closed && chance(rng, b.leakChance)) {
      // Our unexposed lies by them surface at once: the rival prints what they told it.
      const theirs = state.pendingLies.filter((x) => x.story.reporterId === id);
      if (theirs.length) leaked.push(id);
      for (const lie of theirs) exposures.push(exposeNews(state, c, mods, { ...lie.story, leaked: true }, lie.viewers));
      state.pendingLies = state.pendingLies.filter((x) => !theirs.includes(x));
    }
  }
  return { levelUps, quit, leaked, exposures };
}

/** Takes a reporter off the staff (fired, quit or lured away). */
export function removeReporter(state: GameState, id: string): void {
  state.reporters = state.reporters.filter((x) => x !== id);
  state.investigations = state.investigations.filter((x) => x.reporterId !== id);
  delete state.reporterTopics[id];
  state.rivalWatch = state.rivalWatch.filter((x) => x !== id);
  delete state.staff[id];
}

/** The rival tries to lure our most experienced reporter (an offer we answer like any other). */
export function poachTarget(state: GameState, c: Content, rng: RngState): string | null {
  const b = c.balance;
  if (!state.rival || state.rival.closed || state.turn < b.poachStartTurn || state.reporters.length <= 1) return null;
  const best = [...state.reporters]
    .filter((id) => levelOf(c, staffOf(state, c, id).xp) >= 1)
    .sort((x, y) => staffOf(state, c, y).xp - staffOf(state, c, x).xp)[0];
  if (!best || !chance(rng, b.poachChance * (1.5 - staffOf(state, c, best).loyalty))) return null;
  return best;
}
