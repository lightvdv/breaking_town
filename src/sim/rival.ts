import { chance, int, next, weightedPick, type RngState } from './rng';
import { clamp, conflictsStarted, rivalStarted, templateOf } from './lookup';
import { modifiersOf } from './modifiers';
import { effectiveTier, isSoothed, limitSensations, maxDistortion, minDistortion, publish, storyTitle, type PublishedNews } from './news';
import { pickPair } from './relations';
import { isRecent, scopeOf } from './reporters';
import type { CardInstance, CardTemplate, Content, GameMode, GameState, GroupId, IssueLevel, NewsTier, Placement, PrintedStory, RivalKind, TruthLevel } from './types';

/**
 * The rival paper (CONCEPT.md §8): in the save mode the holding's tabloid «Вечерний Набат» scares the
 * town, in the destroy mode the honest «Голос города» defends it. Either prints every day by the same
 * rules as ours, to its own readers and with its own trust, and debunks our recent lies. Its issue
 * comes out with ours; for a few days after, our reporters can find debunks of its own lies — by
 * chance, or on purpose when sent to watch it.
 */

/** Debunk templates: ours against each rival's lies, and each rival's against ours. */
export const RIVAL_TEMPLATES: Record<RivalKind, { ours: string; theirs: string }> = {
  tabloid: { ours: 'debunk', theirs: 'tabloid_debunk' },
  guardian: { ours: 'debunk_guardian', theirs: 'guardian_debunk' },
};
export const DEBUNK_TEMPLATE = RIVAL_TEMPLATES.tabloid.ours;

/** The rival of a mode. */
export function rivalKindOf(mode: GameMode): RivalKind {
  return mode === 'save' ? 'tabloid' : 'guardian';
}

export function rivalReaders(state: GameState): number {
  return state.residents.filter((r) => r.status === 'active' && r.rivalReader).length;
}

/** Average trust of the rival's readers (0 when it has none). */
export function rivalTrust(state: GameState): number {
  const readers = state.residents.filter((r) => r.status === 'active' && r.rivalReader);
  return readers.length ? readers.reduce((s, r) => s + r.rivalTrust, 0) / readers.length : 0;
}

/** At the start of the game part of the city already reads it. */
export function seedRival(state: GameState, c: Content, rng: RngState): void {
  const b = c.balance;
  for (const r of state.residents) {
    r.rivalTrust = clamp(b.rivalStartTrust + (next(rng) - 0.5) * 20, 0, 100);
    r.rivalReader = chance(rng, b.rivalStartShare * (b.rivalAffinity[state.rival!.kind][r.group] ?? 0.5) * 2);
  }
}

/** Something to reassure people with: good true news, a bad event it can soothe, a conflict it can calm. */
function reassuring(t: CardTemplate): boolean {
  if (t.baseTruth !== 0) return false;
  const told = t.effects[0];
  return !!t.softTitles || (!!told && told.type === 'moodUp');
}

/** Our recent lies the rival answers: the tabloid our soothing ones, the guardian our scary ones. */
function counterTargets(state: GameState, c: Content): PrintedStory[] {
  const kind = state.rival?.kind;
  // The lies of the forgiven first days are forgiven by the rival too.
  return state.ourPrinted.filter(
    (p) => p.truth > 0 && !p.debunked && !p.exposed && p.turn >= c.balance.factCheckStartTurn && (kind === 'tabloid' ? !!p.soothed : !p.soothed),
  );
}

/** Something people could be scared with: the story's worst version does harm. */
function frightening(t: CardTemplate): boolean {
  const worst = t.effects[2];
  return !!worst && worst.type !== 'moodUp' && worst.type !== 'debunk';
}

function available(state: GameState, t: CardTemplate): boolean {
  return !t.requires || state.buildings.some((x) => x.type === t.requires && x.open);
}

/**
 * The rival's issue of the day, written at the start of the turn and printed with ours: today's bad
 * events first, then frightening rumors and stories. It lies when its readers trust it and is more
 * careful when they do not. Nobody sees it before it comes out.
 */
export function planRival(state: GameState, c: Content, rng: RngState, events: CardTemplate[], eventPairs: Map<string, [GroupId, GroupId]>): void {
  const rival = state.rival;
  if (!rival) return;
  rival.plan = [];
  if (!rivalStarted(state, c)) return;
  const b = c.balance;
  const guardian = rival.kind === 'guardian';
  // Every author we lured away is a story less a day (CONCEPT.md §8.4).
  const count = 1 + int(rng, Math.max(1, (guardian ? b.guardianStoriesMax : b.rivalStoriesMax) - (rival.lured ?? 0)));
  // It answers our freshest lies that work against it, on top of its own stories.
  for (const story of counterTargets(state, c).slice(0, Math.min(count, c.balance.rivalCountersMax))) {
    rival.plan.push({ card: { ...makeDebunk(state, story, ''), templateId: RIVAL_TEMPLATES[rival.kind].theirs }, placement: 0, distortion: 0 });
  }
  // The tabloid looks for what frightens, the guardian for what reassures.
  const fits = (t: CardTemplate) => (guardian ? reassuring(t) : frightening(t));
  const chosen: CardTemplate[] = events.filter((t) => !t.arc && fits(t)).slice(0, count);
  // It follows the running story arcs too, on top (CONCEPT.md §3.1а): the tabloid fans every stage, the guardian soothes what it can.
  chosen.push(...events.filter((t) => typeof t.arcStage === 'number' && (guardian ? !!t.softTitles : true) && chance(rng, b.rivalArcChance)));
  const pool = c.cards.filter(
    (t) =>
      (t.source === 'rumor' || t.source === 'event' || t.source === 'fact') &&
      !(guardian && t.source === 'rumor') &&
      fits(t) &&
      !t.arc &&
      (!t.conflict || conflictsStarted(state, c)) &&
      available(state, t) &&
      !isRecent(state, c, t.id) &&
      !chosen.includes(t) &&
      !state.hand.some((x) => x.templateId === t.id),
  );
  // It does not like to repeat itself: what it printed lately weighs less, the longer ago the more.
  const seen = (rival.seen ??= {});
  const fresh = (t: CardTemplate) => {
    const last = seen[t.id];
    return last === undefined ? 1 : Math.min(1, Math.max(0.05, (state.turn - last) / b.repeatFadeDays));
  };
  while (chosen.length < count && pool.length) {
    const t = weightedPick(
      rng,
      pool.map((x) => ({ x, weight: x.interest * x.weight * fresh(x) })),
    ).x;
    pool.splice(pool.indexOf(t), 1);
    chosen.push(t);
  }

  const careful = rivalTrust(state) < b.rivalTrustCollapse * 2;
  for (const tpl of chosen) {
    state.lastSeen[tpl.id] = state.turn;
    seen[tpl.id] = state.turn;
    const [lo, hi] = tpl.tiers ?? [0, 3];
    const tiers = b.tierWeights.map((weight, tier) => ({ weight, tier: tier as NewsTier })).filter((x) => x.tier >= lo && x.tier <= hi);
    const card: CardInstance = {
      uid: state.nextUid++,
      templateId: tpl.id,
      baseTruth: tpl.baseTruth,
      createdTurn: state.turn,
      tier: weightedPick(rng, tiers).tier,
      scope: scopeOf(tpl),
      reporterId: '',
    };
    if (tpl.conflict) card.conflict = eventPairs.get(tpl.id) ?? (tpl.conflict === 'any' ? pickPair(state, c, rng) : [...tpl.conflict]);
    const places = tpl.requires ? state.buildings.filter((x) => x.type === tpl.requires && x.open) : [];
    if (places.length) card.building = places[int(rng, places.length)].id;
    if (tpl.softTitles) card.soft = true;
    const max = maxDistortion(card);
    // The guardian calms conflicts and soothes bad news, with a lie only while it is trusted.
    const distortion = guardian ? (card.conflict ? -1 : card.soft ? (careful ? -1 : minDistortion(card)) : 0) : careful ? Math.min(1, max) : max;
    rival.plan.push({ card, placement: 0, distortion });
  }
  // Its loudest story takes the front page, the next the article, the rest are briefs.
  rival.plan.sort((x, y) => effectiveTier(y.card, y.distortion) - effectiveTier(x.card, x.distortion));
  rival.plan.forEach((s, i) => (s.placement = (i === 0 ? 2 : i === 1 ? 1 : 0) as Placement));
  // It too prints one sensation at most.
  const asPubs = rival.plan.map((s) => ({ cardUid: s.card.uid, placement: s.placement, distortion: s.distortion }));
  limitSensations({ ...state, hand: rival.plan.map((s) => s.card) }, c, asPubs);
  asPubs.forEach((p, i) => (rival.plan[i].distortion = p.distortion));
}

/** Forgets what was printed longer ago than a story can still be debunked. */
export function pruneRival(state: GameState, c: Content): void {
  const fresh = (p: PrintedStory) => state.turn - p.turn <= c.balance.debunkWindow;
  if (state.rival) state.rival.printed = state.rival.printed.filter(fresh);
  state.ourPrinted = state.ourPrinted.filter(fresh);
}

/** Remembers our issue: the rival may debunk its lies for a few days. */
export function recordOurIssue(state: GameState, c: Content, news: PublishedNews[]): void {
  if (!state.rival) return;
  for (const n of news) {
    const card = state.hand.find((x) => x.uid === n.pub.cardUid);
    if (!card || card.debunk) continue;
    const tpl = templateOf(c, card.templateId);
    const soothed = isSoothed(card, n.pub.distortion);
    state.ourPrinted.unshift({
      uid: card.uid,
      templateId: card.templateId,
      title: n.report.title,
      truth: n.truth,
      placement: n.pub.placement,
      turn: state.turn,
      effect: (soothed ? tpl.softEffects?.[-n.pub.distortion - 1] : tpl.effects[n.truth])?.type ?? null,
      debunked: false,
      exposed: n.report.exposed,
      soothed,
    });
  }
}

/** Its recent half-truths and lies that nobody has debunked yet (true stories cannot be debunked). */
export function debunkTargets(state: GameState): PrintedStory[] {
  return (state.rival?.printed ?? []).filter((p) => p.truth > 0 && !p.debunked && !p.exposed && !state.hand.some((x) => x.debunk?.uid === p.uid));
}

/** A debunk of a printed rival story, written by a reporter: true against a lie, a half-truth against a half-truth. */
export function makeDebunk(state: GameState, story: PrintedStory, reporterId: string): CardInstance {
  return {
    uid: state.nextUid++,
    templateId: RIVAL_TEMPLATES[state.rival?.kind ?? 'tabloid'].ours,
    baseTruth: (2 - story.truth) as TruthLevel,
    createdTurn: state.turn,
    tier: Math.max(0, Math.min(2, story.placement)) as NewsTier,
    scope: 'local',
    reporterId,
    debunk: { uid: story.uid, title: story.title, effect: story.effect },
  };
}

/** Sends a reporter to watch the rival paper (or back to ordinary search). */
export function setRivalWatch(state: GameState, reporterId: string, on: boolean): void {
  if (!state.reporters.includes(reporterId)) throw new Error(`Reporter ${reporterId} is not hired`);
  state.rivalWatch = state.rivalWatch.filter((x) => x !== reporterId);
  if (on) state.rivalWatch.push(reporterId);
}

/** Our published debunks mark the stories they answer, so nobody brings them again. */
export function markDebunked(state: GameState, debunkedUids: number[]): void {
  const rival = state.rival;
  if (!rival) return;
  for (const p of rival.printed) {
    if (!p.debunked && debunkedUids.includes(p.uid)) {
      p.debunked = true;
      rival.debunked++;
    }
  }
}

/** Prints the rival's issue, out the same day as ours; what it printed can be debunked for a few days. */
export function publishRival(state: GameState, c: Content, rng: RngState): PublishedNews[] {
  const rival = state.rival;
  if (!rival || rival.closed) return [];
  const mods = modifiersOf(c, []);
  const news = rival.plan.map((s) => publish(state, c, rng, mods, { cardUid: s.card.uid, placement: s.placement, distortion: s.distortion }, 0, { rival: { card: s.card } }));
  // Its debunks of our stories: nobody brings those again.
  const answered = rival.plan.filter((s) => s.card.debunk).map((s) => s.card.debunk!.uid);
  for (const p of state.ourPrinted) if (answered.includes(p.uid)) p.debunked = true;
  rival.printed = [
    ...rival.plan.map((s, i) => ({
      uid: s.card.uid,
      templateId: s.card.templateId,
      title: storyTitle(c, s.card, s.distortion),
      truth: news[i].truth,
      placement: s.placement,
      turn: state.turn,
      effect: (isSoothed(s.card, s.distortion) ? templateOf(c, s.card.templateId).softEffects?.[-s.distortion - 1] : templateOf(c, s.card.templateId).effects[news[i].truth])?.type ?? null,
      debunked: false,
      soothed: isSoothed(s.card, s.distortion),
    })),
    ...rival.printed,
  ];
  rival.plan = [];
  return news;
}

/**
 * Fact-checkers look at the rival too: a caught story costs its readers' trust and nobody believes it
 * any more; true stories earn it a little trust.
 */
export function verifyRival(state: GameState, c: Content, rng: RngState, news: PublishedNews[]): void {
  const b = c.balance;
  for (const n of news) {
    if (n.truth === 0) {
      for (const id of n.viewers) state.residents[id].rivalTrust = clamp(state.residents[id].rivalTrust + b.rivalTrustGain, 0, 100);
      continue;
    }
    const risk = b.rivalExposure * b.truthRisk[n.truth] * b.placementExposureRisk[n.pub.placement];
    if (!chance(rng, risk)) continue;
    n.report.exposed = true;
    const printed = state.rival?.printed.find((p) => p.uid === n.pub.cardUid);
    if (printed) printed.exposed = true;
    const seen = new Set(n.viewers);
    for (const r of state.residents) {
      if (r.status !== 'active') continue;
      if (seen.has(r.id) || r.rivalReader) r.rivalTrust = clamp(r.rivalTrust - b.rivalExposurePenalty * (seen.has(r.id) ? 1 : 0.5), 0, 100);
      r.beliefs = r.beliefs.filter((x) => x.cardUid !== n.pub.cardUid);
    }
  }
}

/** Readers come and go: those who doubted it drop it more often, trusting non-readers start buying it. */
export function updateRivalReaders(state: GameState, c: Content, rng: RngState, news: PublishedNews[], level: IssueLevel = 0, stealMul = 1): void {
  const rival = state.rival;
  // Before it starts printing its readers stay as they are.
  if (!rival || !rivalStarted(state, c)) return;
  const b = c.balance;
  const doubted = new Set(news.flatMap((n) => n.doubters));
  // Our gripping issue takes its readers: who read both and was caught by ours drops it (CONCEPT.md §8.4).
  const steal = b.rivalSteal[level] * stealMul;
  for (const r of state.residents) {
    if (r.status !== 'active') {
      r.rivalReader = false;
      continue;
    }
    const caught = state.lastReactions[r.id];
    if (r.rivalReader && steal > 0 && (caught === 'scared' || caught === 'talk' || caught === 'happy') && chance(rng, steal)) {
      r.rivalReader = false;
      continue;
    }
    if (r.rivalReader) {
      const distrust = 1 - r.rivalTrust / 100;
      if (chance(rng, (doubted.has(r.id) ? b.rivalChurnDoubt : b.rivalChurn) * (0.5 + distrust))) r.rivalReader = false;
    } else if (chance(rng, b.rivalJoin * (b.rivalAffinity[rival.kind][r.group] ?? 0.5) * (r.rivalTrust / 100))) r.rivalReader = true;
  }
  const active = state.residents.filter((r) => r.status === 'active').length;
  if (rivalReaders(state) < b.rivalCloseShare * active || rivalTrust(state) < b.rivalTrustCollapse) {
    rival.closed = true;
    rival.plan = [];
    rival.printed = [];
    for (const r of state.residents) r.rivalReader = false;
  }
}



/** What luring its next author away costs: dearer each time (CONCEPT.md §8.4). */
export function lureCost(state: GameState, c: Content): number {
  return Math.round(c.balance.rivalLureCost * (1 + (state.rival?.lured ?? 0)));
}

/** Why its author cannot be lured away now, or null. */
export function lureBlock(state: GameState, c: Content): string | null {
  const rival = state.rival;
  if (!rival || rival.closed || state.outcome) return 'no rival';
  if (!rivalStarted(state, c)) return 'not yet';
  if ((rival.lured ?? 0) >= c.balance.rivalLureMax) return 'nobody left';
  if (state.money < lureCost(state, c)) return 'no money';
  return null;
}

/** Lures an author of the rival away: it prints a story less a day, and its readers trust it less. */
export function lureRivalAuthor(state: GameState, c: Content): void {
  const block = lureBlock(state, c);
  if (block) throw new Error(`Cannot lure: ${block}`);
  state.money -= lureCost(state, c);
  const rival = state.rival!;
  rival.lured = (rival.lured ?? 0) + 1;
  for (const r of state.residents) if (r.status === 'active') r.rivalTrust = clamp(r.rivalTrust - c.balance.rivalLureTrust, 0, 100);
}
