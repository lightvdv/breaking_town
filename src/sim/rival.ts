import { chance, int, next, weightedPick, type RngState } from './rng';
import { clamp } from './lookup';
import { modifiersOf } from './modifiers';
import { cardTruth, effectiveTier, limitSensations, maxDistortion, publish, storyTitle, type PublishedNews } from './news';
import { pickPair } from './relations';
import { isRecent, scopeOf } from './reporters';
import type { CardInstance, CardTemplate, Content, Find, GameState, GroupId, NewsTier, Placement, RivalStory } from './types';

/**
 * The rival paper «Вечерний Набат» of the save mode (CONCEPT.md §8): the holding's tabloid prints
 * frightening stories every day by the same rules as ours, to its own readers and with its own
 * trust. Our sources learn its next issue in advance, and every story of it comes with a debunk.
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
 * The rival's next issue: today's bad events first, then frightening rumors and stories. It lies when
 * its readers trust it and is more careful when they do not. Returns our sources' debunk cards.
 */
export function planRival(
  state: GameState,
  c: Content,
  rng: RngState,
  events: CardTemplate[],
  eventPairs: Map<string, [GroupId, GroupId]>,
): { cards: CardInstance[]; finds: Find[] } {
  const rival = state.rival;
  if (!rival) return { cards: [], finds: [] };
  rival.plan = [];
  if (rival.closed) return { cards: [], finds: [] };
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

  // Our sources bring a debunk for every story: true when the story lies, a lie when it is true.
  const cards: CardInstance[] = [];
  const finds: Find[] = [];
  const reporterId = state.reporters[0];
  for (const s of rival.plan) {
    const truth = cardTruth(s.card, s.distortion);
    const card: CardInstance = {
      uid: state.nextUid++,
      templateId: DEBUNK_TEMPLATE,
      baseTruth: (2 - truth) as 0 | 1 | 2,
      createdTurn: state.turn,
      tier: Math.max(0, effectiveTier(s.card, s.distortion) - 1) as NewsTier,
      scope: s.card.scope,
      reporterId,
      debunk: { uid: s.card.uid, title: storyTitle(c, s.card, s.distortion) },
    };
    cards.push(card);
    finds.push({ reporterId, cardUid: card.uid, tier: card.tier, forced: false, kind: 'search' });
  }
  return { cards, finds };
}

/** Prints the rival's issue; our believed debunks shield their believers from the stories they answer. */
export function publishRival(state: GameState, c: Content, rng: RngState, shields: Map<number, Set<number>>): { news: PublishedNews[]; shielded: number } {
  const rival = state.rival;
  if (!rival || rival.closed) return { news: [], shielded: 0 };
  const mods = modifiersOf(c, []);
  let shielded = 0;
  const news = rival.plan.map((s) => {
    const set = shields.get(s.card.uid) ?? new Set<number>();
    if (set.size) rival.debunked++;
    shielded += set.size;
    return publish(state, c, rng, mods, { cardUid: s.card.uid, placement: s.placement, distortion: s.distortion }, 0, { rival: { card: s.card, shielded: set } });
  });
  return { news, shielded };
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
    for (const r of state.residents) r.rivalReader = false;
  }
}

/** Headline of a planned rival story, for the UI. */
export function rivalTitle(c: Content, s: RivalStory): string {
  return storyTitle(c, s.card, s.distortion);
}

