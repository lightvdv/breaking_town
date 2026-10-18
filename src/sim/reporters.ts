import { chance, pick, weightedPick, type RngState } from './rng';
import { clamp } from './lookup';
import type { Modifiers } from './modifiers';
import { pickPair } from './relations';
import type { CardInstance, CardTemplate, Content, Find, GameState, GroupId, NewsScope, NewsTier, ReporterDef, Topic } from './types';

export function reporterOf(c: Content, id: string): ReporterDef {
  const r = c.reporters.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown reporter: ${id}`);
  return r;
}

export function scopeOf(t: CardTemplate): NewsScope {
  return t.scope ?? 'local';
}

export function reporterLuck(r: ReporterDef, mods: Modifiers): number {
  return clamp(r.skills.luck + mods.reporterLuck, 0.05, 0.98);
}

/** True when the reporter is sent after topics that are all their specialties. */
export function onSpecialty(state: GameState, r: ReporterDef): boolean {
  const assigned = state.reporterTopics[r.id] ?? [];
  return assigned.length > 0 && assigned.every((t) => r.skills.topics.includes(t));
}

/** This turn's chance to find something: luck, plus a bonus for working on one's specialty. */
export function searchLuck(state: GameState, c: Content, r: ReporterDef, mods: Modifiers): number {
  return clamp(reporterLuck(r, mods) + (onSpecialty(state, r) ? c.balance.specialtyLuck : 0), 0.05, 0.98);
}

/** Sends a reporter after topics (CONCEPT.md §3.3); an empty list means any topic. */
export function setReporterTopics(state: GameState, c: Content, reporterId: string, topics: Topic[]): void {
  if (!state.reporters.includes(reporterId)) throw new Error(`Reporter ${reporterId} is not hired`);
  const known = new Set(c.cards.map((t) => t.topic));
  for (const t of topics) if (!known.has(t)) throw new Error(`Unknown topic ${t}`);
  if (topics.length) state.reporterTopics[reporterId] = [...new Set(topics)];
  else delete state.reporterTopics[reporterId];
}

/** Tier odds for a reporter: base weights, shifted up by nose (CONCEPT.md §3.3). */
export function tierWeights(c: Content, r: ReporterDef): number[] {
  const b = c.balance;
  return b.tierWeights.map((w, i) => w * (1 + r.skills.nose * b.noseTierBonus * i));
}

/** A story template found or happened within the last `repeatCooldown` turns. */
export function isRecent(state: GameState, c: Content, id: string): boolean {
  const seen = state.lastSeen[id];
  return seen !== undefined && state.turn - seen < c.balance.repeatCooldown;
}

function available(state: GameState, t: CardTemplate): boolean {
  return !t.requires || state.buildings.some((x) => x.type === t.requires && x.open);
}

/**
 * Hired reporters bring the news. Everything that happened in the city today (`events`, incidents
 * included) always reaches the issue: each event is written up by a reporter — one who covers its
 * topic if there is one, otherwise in turn. Then every reporter searches as usual for facts, rumors
 * and world news (CONCEPT.md §3.3). Returns the new cards and the search log.
 */
export function findNews(
  state: GameState,
  c: Content,
  rng: RngState,
  mods: Modifiers,
  events: CardTemplate[],
  /** Today's incidents: which pair each one was about. */
  eventPairs: Map<string, [GroupId, GroupId]> = new Map(),
): { cards: CardInstance[]; finds: Find[] } {
  const b = c.balance;
  const cards: CardInstance[] = [];
  const finds: Find[] = [];
  const inHand = new Set(state.hand.map((x) => x.templateId));
  const recent = (t: CardTemplate) => isRecent(state, c, t.id);
  const oldestSeen = (list: CardTemplate[]) => {
    const oldest = Math.min(...list.map((t) => state.lastSeen[t.id] ?? -Infinity));
    return list.filter((t) => (state.lastSeen[t.id] ?? -Infinity) === oldest);
  };

  const make = (r: ReporterDef, forcedTier: NewsTier | null): CardInstance | null => {
    const s = r.skills;
    const own = s.scope === 'any' ? null : s.scope;
    const scope: NewsScope = own
      ? chance(rng, b.scopeFocus)
        ? own
        : own === 'local'
          ? 'global'
          : 'local'
      : chance(rng, 0.5)
        ? 'local'
        : 'global';

    const fresh = (t: CardTemplate) => !inHand.has(t.id) && !cards.some((x) => x.templateId === t.id);
    const ofScope = (t: CardTemplate) => scopeOf(t) === scope && available(state, t) && fresh(t);
    // Mostly true stories (CONCEPT.md §3.3); investigation stories only come from assigned reporters.
    const facts = c.cards.filter((t) => ofScope(t) && (t.source === 'fact' || (scope === 'global' && t.source === 'event')));
    const rumors = c.cards.filter((t) => ofScope(t) && t.source === 'rumor');
    const wantsTruth = chance(rng, b.trueNewsShare);
    let candidates = wantsTruth ? (facts.length ? facts : rumors) : rumors.length ? rumors : facts;
    // Stories found or happened recently do not come back.
    const notRecent = candidates.filter((t) => !recent(t));
    candidates = notRecent.length ? notRecent : oldestSeen(candidates);
    // The player's assignment comes first, then the reporter's own specialties.
    const assigned = state.reporterTopics[r.id] ?? [];
    const focus = assigned.length ? (chance(rng, b.assignFocus) ? assigned : []) : s.topics.length && chance(rng, b.topicFocus) ? s.topics : [];
    if (focus.length) {
      const focused = candidates.filter((t) => focus.includes(t.topic));
      if (focused.length) candidates = focused;
    }
    if (candidates.length === 0) return null;

    return write(r, weightedPick(rng, candidates), forcedTier);
  };

  /** A card for a template, written up by a reporter (tier by the reporter's nose). */
  const write = (r: ReporterDef, tpl: CardTemplate, forcedTier: NewsTier | null): CardInstance => {
    state.lastSeen[tpl.id] = state.turn;
    const tiers = tierWeights(c, r).map((weight, tier) => ({ weight, tier: tier as NewsTier }));
    const card: CardInstance = {
      uid: state.nextUid++,
      templateId: tpl.id,
      baseTruth: tpl.baseTruth,
      createdTurn: state.turn,
      tier: forcedTier ?? weightedPick(rng, tiers).tier,
      scope: scopeOf(tpl),
      reporterId: r.id,
    };
    // Conflict stories are about a pair: today's incident's, the template's, or a tense one.
    if (tpl.conflict) card.conflict = eventPairs.get(tpl.id) ?? (tpl.conflict === 'any' ? pickPair(state, c, rng) : [...tpl.conflict]);
    cards.push(card);
    return card;
  };

  // Reporters busy with an investigation skip the ordinary search.
  const busy = new Set(state.investigations.map((x) => x.reporterId));
  const hired = state.reporters.filter((id) => !busy.has(id)).map((id) => reporterOf(c, id));

  // Today's events always make the news: the reporter on the topic, otherwise the next in turn.
  const writers = hired.length ? hired : state.reporters.slice(0, 1).map((id) => reporterOf(c, id));
  let turn = 0;
  for (const tpl of events) {
    if (!writers.length || inHand.has(tpl.id) || cards.some((x) => x.templateId === tpl.id)) continue;
    const r = writers.find((w) => w.skills.topics.includes(tpl.topic) || (state.reporterTopics[w.id] ?? []).includes(tpl.topic)) ?? writers[turn++ % writers.length];
    const card = write(r, tpl, null);
    finds.push({ reporterId: r.id, cardUid: card.uid, tier: card.tier, forced: false, kind: 'search' });
  }
  for (const r of hired) {
    const card = chance(rng, searchLuck(state, c, r, mods)) ? make(r, null) : null;
    finds.push({ reporterId: r.id, cardUid: card?.uid ?? null, tier: card?.tier ?? null, forced: false, kind: 'search' });
  }

  // Nobody found anything: someone still brings a dull story, so a turn is never empty.
  const failed = finds.filter((f) => f.cardUid === null);
  for (let i = cards.length; i < b.minFinds && failed.length; i++) {
    const f = pick(rng, failed);
    failed.splice(failed.indexOf(f), 1);
    const card = make(reporterOf(c, f.reporterId), 0);
    if (card) Object.assign(f, { cardUid: card.uid, tier: card.tier, forced: true });
  }
  return { cards, finds };
}

// ---------- Investigations (CONCEPT.md §3.3а) ----------

export function investigationTurns(c: Content, r: ReporterDef): number {
  const b = c.balance;
  return b.investigationTurns - (r.skills.nose >= b.investigationFastNose ? 1 : 0);
}

export function startInvestigation(state: GameState, c: Content, reporterId: string, target: string): void {
  if (state.outcome) throw new Error('Game is over');
  if (!state.reporters.includes(reporterId)) throw new Error(`Reporter ${reporterId} is not hired`);
  if (state.investigations.some((x) => x.reporterId === reporterId)) throw new Error(`Reporter ${reporterId} is already investigating`);
  if (!c.groups.some((g) => g.id === target)) throw new Error(`Unknown group ${target}`);
  if (!c.cards.some((t) => t.source === 'investigation' && t.target === target)) throw new Error(`No investigation story about ${target}`);
  const total = investigationTurns(c, reporterOf(c, reporterId));
  state.investigations.push({ reporterId, target, turnsLeft: total, total });
}

export function cancelInvestigation(state: GameState, reporterId: string): void {
  state.investigations = state.investigations.filter((x) => x.reporterId !== reporterId);
}

/** Advances investigations by a turn; finished ones bring an investigation card. */
export function advanceInvestigations(state: GameState, c: Content, rng: RngState): { cards: CardInstance[]; finds: Find[] } {
  const b = c.balance;
  const cards: CardInstance[] = [];
  const finds: Find[] = [];
  const keep = [];
  for (const inv of state.investigations) {
    if (!state.reporters.includes(inv.reporterId)) continue;
    inv.turnsLeft--;
    if (inv.turnsLeft > 0) {
      keep.push(inv);
      finds.push({ reporterId: inv.reporterId, cardUid: null, tier: null, forced: false, kind: 'investigating' });
      continue;
    }
    const r = reporterOf(c, inv.reporterId);
    const tpl = pick(
      rng,
      c.cards.filter((t) => t.source === 'investigation' && t.target === inv.target),
    );
    const sensation = clamp(b.investigationSensationBase + b.investigationSensationPerNose * r.skills.nose);
    const truthful = clamp(b.investigationTruthBase + b.investigationTruthPerNose * r.skills.nose);
    const card: CardInstance = {
      uid: state.nextUid++,
      templateId: tpl.id,
      baseTruth: chance(rng, truthful) ? 0 : 1,
      createdTurn: state.turn,
      tier: chance(rng, sensation) ? 3 : 2,
      scope: 'local',
      reporterId: r.id,
    };
    cards.push(card);
    finds.push({ reporterId: r.id, cardUid: card.uid, tier: card.tier, forced: false, kind: 'investigation' });
  }
  state.investigations = keep;
  return { cards, finds };
}
