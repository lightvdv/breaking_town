import { chance, int, next, weightedPick, type RngState } from './rng';
import { clamp, templateOf } from './lookup';
import { modifiersOf } from './modifiers';
import { effectiveTier, limitSensations, maxDistortion, publish, storyTitle, type PublishedNews } from './news';
import { pickPair } from './relations';
import { isRecent, scopeOf } from './reporters';
import type { CardInstance, CardTemplate, Content, GameState, GroupId, NewsTier, Placement, PrintedStory, TruthLevel } from './types';

/**
 * The rival paper «Вечерний Набат» of the save mode (CONCEPT.md §8): the holding's tabloid prints
 * frightening stories every day by the same rules as ours, to its own readers and with its own
 * trust. Its issue comes out with ours; for a few days after, our reporters can find debunks of its
 * lies — by chance, or on purpose when sent to watch it.
 */

export const DEBUNK_TEMPLATE = 'debunk';

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
    r.rivalReader = chance(rng, b.rivalStartShare * (b.rivalAffinity[r.group] ?? 0.5) * 2);
  }
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
  if (rival.closed) return;
  const b = c.balance;
  const count = 1 + int(rng, b.rivalStoriesMax);
  const chosen: CardTemplate[] = events.filter(frightening).slice(0, count);
  const pool = c.cards.filter(
    (t) =>
      (t.source === 'rumor' || t.source === 'event' || t.source === 'fact') &&
      frightening(t) &&
      available(state, t) &&
      !isRecent(state, c, t.id) &&
      !chosen.includes(t) &&
      !state.hand.some((x) => x.templateId === t.id),
  );
  while (chosen.length < count && pool.length) {
    const t = weightedPick(
      rng,
      pool.map((x) => ({ x, weight: x.interest * x.weight })),
    ).x;
    pool.splice(pool.indexOf(t), 1);
    chosen.push(t);
  }

  const careful = rivalTrust(state) < b.rivalTrustCollapse * 2;
  for (const tpl of chosen) {
    state.lastSeen[tpl.id] = state.turn;
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
    const max = maxDistortion(card);
    rival.plan.push({ card, placement: 0, distortion: careful ? Math.min(1, max) : max });
  }
  // Its loudest story takes the front page, the next the article, the rest are briefs.
  rival.plan.sort((x, y) => effectiveTier(y.card, y.distortion) - effectiveTier(x.card, x.distortion));
  rival.plan.forEach((s, i) => (s.placement = (i === 0 ? 2 : i === 1 ? 1 : 0) as Placement));
  // It too prints one sensation at most.
  const asPubs = rival.plan.map((s) => ({ cardUid: s.card.uid, placement: s.placement, distortion: s.distortion }));
  limitSensations({ ...state, hand: rival.plan.map((s) => s.card) }, c, asPubs);
  asPubs.forEach((p, i) => (rival.plan[i].distortion = p.distortion));
}

/** Forgets what the rival printed longer ago than a story can still be debunked. */
export function pruneRival(state: GameState, c: Content): void {
  if (state.rival) state.rival.printed = state.rival.printed.filter((p) => state.turn - p.turn <= c.balance.debunkWindow);
}

/** Its recent half-truths and lies that nobody has debunked yet (true stories cannot be debunked). */
export function debunkTargets(state: GameState): PrintedStory[] {
  return (state.rival?.printed ?? []).filter((p) => p.truth > 0 && !p.debunked && !p.exposed && !state.hand.some((x) => x.debunk?.uid === p.uid));
}

/** A debunk of a printed rival story, written by a reporter: true against a lie, a half-truth against a half-truth. */
export function makeDebunk(state: GameState, story: PrintedStory, reporterId: string): CardInstance {
  return {
    uid: state.nextUid++,
    templateId: DEBUNK_TEMPLATE,
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
  rival.printed = [
    ...rival.plan.map((s, i) => ({
      uid: s.card.uid,
      templateId: s.card.templateId,
      title: storyTitle(c, s.card, s.distortion),
      truth: news[i].truth,
      placement: s.placement,
      turn: state.turn,
      effect: templateOf(c, s.card.templateId).effects[news[i].truth]?.type ?? null,
      debunked: false,
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
export function updateRivalReaders(state: GameState, c: Content, rng: RngState, news: PublishedNews[]): void {
  const rival = state.rival;
  if (!rival || rival.closed) return;
  const b = c.balance;
  const doubted = new Set(news.flatMap((n) => n.doubters));
  for (const r of state.residents) {
    if (r.status !== 'active') {
      r.rivalReader = false;
      continue;
    }
    if (r.rivalReader) {
      const distrust = 1 - r.rivalTrust / 100;
      if (chance(rng, (doubted.has(r.id) ? b.rivalChurnDoubt : b.rivalChurn) * (0.5 + distrust))) r.rivalReader = false;
    } else if (chance(rng, b.rivalJoin * (b.rivalAffinity[r.group] ?? 0.5) * (r.rivalTrust / 100))) r.rivalReader = true;
  }
  const active = state.residents.filter((r) => r.status === 'active').length;
  if (rivalReaders(state) < b.rivalCloseShare * active || rivalTrust(state) < b.rivalTrustCollapse) {
    rival.closed = true;
    rival.plan = [];
    rival.printed = [];
    for (const r of state.residents) r.rivalReader = false;
  }
}


