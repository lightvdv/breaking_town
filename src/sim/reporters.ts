import { huntTemplates } from './hunt';
import { debunkTargets, makeDebunk } from './rival';
import { skilledReporter } from './staff';
import { chance, int, pick, weightedPick, type RngState } from './rng';
import { clamp, conflictsStarted } from './lookup';
import { getModifiers, type Modifiers } from './modifiers';
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
 * Hired reporters bring the news, one story each a day (CONCEPT.md §3.3). Today's events (incidents
 * and arc stages included) come first: each takes a free reporter — one whose specialty it is (who
 * writes it a level stronger: an exclusive), then one sent after its topic, then the next free one.
 * Events nobody is free for go unwritten (`missed`). The reporters left search as usual for facts,
 * rumors and world news. A reporter on an investigation, or watching the rival while it has lies to
 * debunk, takes no event. Returns the new cards, the search log and the missed events.
 */
export function findNews(
  state: GameState,
  c: Content,
  rng: RngState,
  mods: Modifiers,
  events: CardTemplate[],
  /** Today's incidents: which pair each one was about. */
  eventPairs: Map<string, [GroupId, GroupId]> = new Map(),
  /** Only these reporters search, and `sure` ones always find something (the «Ночная смена» ability). */
  opts: { only?: string[]; sure?: boolean } = {},
): { cards: CardInstance[]; finds: Find[]; missed: CardTemplate[] } {
  const b = c.balance;
  const cards: CardInstance[] = [];
  const missed: CardTemplate[] = [];
  const finds: Find[] = [];
  const inHand = new Set(state.hand.map((x) => x.templateId));
  const recent = (t: CardTemplate) => isRecent(state, c, t.id);
  const oldestSeen = (list: CardTemplate[]) => {
    const oldest = Math.min(...list.map((t) => state.lastSeen[t.id] ?? -Infinity));
    return list.filter((t) => (state.lastSeen[t.id] ?? -Infinity) === oldest);
  };

  // Save mode: the rival's recent lies wait for a debunk (CONCEPT.md §8).
  const targets = debunkTargets(state);

  const make = (r: ReporterDef, forcedTier: NewsTier | null): CardInstance | null => {
    // A reporter watching the rival mostly brings a debunk of its lies; anyone else may stumble on one.
    if (targets.length && chance(rng, state.rivalWatch.includes(r.id) ? b.assignFocus : b.debunkFindChance + mods.debunkFindAdd)) {
      const card = makeDebunk(state, targets.shift()!, r.id);
      cards.push(card);
      return card;
    }
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
    const ofScope = (t: CardTemplate) => !t.arc && (!t.conflict || conflictsStarted(state, c)) && scopeOf(t) === scope && available(state, t) && fresh(t);
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
    // A desk's own reporter (CONCEPT.md §3.5): an unassigned search may go to its topic.
    const desk = (Object.entries(mods.topicFind) as [Topic, number][]).find(([, p]) => chance(rng, p));
    const focus = assigned.length ? (chance(rng, b.assignFocus) ? assigned : []) : desk ? [desk[0]] : s.topics.length && chance(rng, b.topicFocus) ? s.topics : [];
    if (focus.length) {
      const focused = candidates.filter((t) => focus.includes(t.topic));
      if (focused.length) candidates = focused;
    }
    if (candidates.length === 0) return null;

    // What was in the news not so long ago comes up less often (`repeatFadeDays`).
    const fade = (t: CardTemplate) => {
      const last = state.lastSeen[t.id];
      return last === undefined ? 1 : Math.min(1, Math.max(0.05, (state.turn - last) / b.repeatFadeDays));
    };
    return write(r, weightedPick(rng, candidates.map((x) => ({ x, weight: x.weight * fade(x) }))).x, forcedTier);
  };

  /** A hunt: a reporter who found something today may have dug into its target (CONCEPT.md §3.6а). */
  const huntFind = (r: ReporterDef): CardInstance | null => {
    const target = state.hunt ? state.buildings[state.hunt.building] : null;
    if (!target?.open || !chance(rng, b.huntFindChance + mods.huntFindAdd)) return null;
    const pool = huntTemplates(c, target, (t) => !t.conflict && (t.source === 'rumor' || t.source === 'fact') && !inHand.has(t.id) && !cards.some((x) => x.templateId === t.id));
    if (!pool.length) return null;
    const card = write(r, weightedPick(rng, pool.map((x) => ({ x, weight: x.weight }))).x, null);
    card.building = target.id;
    return card;
  };

  /** A card for a template, written up by a reporter (tier by the reporter's nose). */
  const write = (r: ReporterDef, tpl: CardTemplate, forcedTier: NewsTier | null): CardInstance => {
    state.lastSeen[tpl.id] = state.turn;
    const [lo, hi] = tpl.tiers ?? [0, 3];
    const tiers = tierWeights(c, r)
      .map((weight, tier) => ({ weight, tier: tier as NewsTier }))
      .filter((x) => x.tier >= lo && x.tier <= hi);
    const card: CardInstance = {
      uid: state.nextUid++,
      templateId: tpl.id,
      baseTruth: tpl.baseTruth,
      createdTurn: state.turn,
      tier: forcedTier !== null ? (Math.min(hi, Math.max(lo, forcedTier)) as NewsTier) : weightedPick(rng, tiers).tier,
      scope: scopeOf(tpl),
      reporterId: r.id,
      ...(tpl.softTitles ? { soft: true } : {}),
    };
    // A story about a kind of place is about one open place of that kind (a closed bar makes no news).
    const places = tpl.requires ? state.buildings.filter((x) => x.type === tpl.requires && x.open) : [];
    if (places.length) card.building = pick(rng, places).id;
    // Conflict stories are about a pair: today's incident's, the template's, or a tense one.
    if (tpl.conflict) card.conflict = eventPairs.get(tpl.id) ?? (tpl.conflict === 'any' ? pickPair(state, c, rng) : [...tpl.conflict]);
    cards.push(card);
    return card;
  };

  // Reporters busy with an investigation skip the ordinary search.
  const busy = new Set(state.investigations.map((x) => x.reporterId));
  // Each works with the skills their experience has grown (CONCEPT.md §3.3б).
  const hired = state.reporters.filter((id) => !busy.has(id) && (!opts.only || opts.only.includes(id))).map((id) => skilledReporter(state, c, reporterOf(c, id)));

  // Today's events take free reporters first, one each; a specialist writes an exclusive.
  const free = [...hired];
  for (const tpl of events) {
    if (inHand.has(tpl.id) || cards.some((x) => x.templateId === tpl.id)) continue;
    const pool = free.filter((w) => !(targets.length && state.rivalWatch.includes(w.id)));
    const r =
      pool.find((w) => w.skills.topics.includes(tpl.topic)) ?? pool.find((w) => (state.reporterTopics[w.id] ?? []).includes(tpl.topic)) ?? pool[0];
    if (!r) {
      missed.push(tpl);
      continue;
    }
    free.splice(free.indexOf(r), 1);
    const card = write(r, tpl, null);
    if (r.skills.topics.includes(tpl.topic)) {
      card.tier = Math.min(tpl.tiers?.[1] ?? 3, card.tier + b.expertTierBonus) as NewsTier;
      card.expert = true;
    }
    finds.push({ reporterId: r.id, cardUid: card.uid, tier: card.tier, forced: false, kind: 'search' });
  }
  for (const r of free) {
    // Luck decides whether the reporter finds anything; a hunt decides what about (CONCEPT.md §3.6а).
    const card = opts.sure || chance(rng, searchLuck(state, c, r, mods)) ? (huntFind(r) ?? make(r, null)) : null;
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
  return { cards, finds, missed };
}

// ---------- Investigations (CONCEPT.md §3.3а) ----------

/** The investigation target that means the rival paper, not a group. */
export const RIVAL_DIG = 'rival';

export function investigationTurns(c: Content, r: ReporterDef, mods?: Modifiers): number {
  const b = c.balance;
  return Math.max(1, b.investigationTurns - (r.skills.nose >= b.investigationFastNose ? 1 : 0) + Math.round(mods?.investigationTurnsAdd ?? 0));
}

export function startInvestigation(state: GameState, c: Content, reporterId: string, target: string): void {
  if (state.outcome) throw new Error('Game is over');
  if (!state.reporters.includes(reporterId)) throw new Error(`Reporter ${reporterId} is not hired`);
  if (state.investigations.some((x) => x.reporterId === reporterId)) throw new Error(`Reporter ${reporterId} is already investigating`);
  // Digging into «Голос города» itself (CONCEPT.md §8.4): its money, its masters.
  if (target === RIVAL_DIG ? !state.rival || state.rival.closed : !c.groups.some((g) => g.id === target)) throw new Error(`Unknown target ${target}`);
  if (!c.cards.some((t) => t.source === 'investigation' && t.target === target)) throw new Error(`No investigation story about ${target}`);
  const total = investigationTurns(c, reporterOf(c, reporterId), getModifiers(state, c));
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
    // A closed rival leaves nothing to dig.
    if (inv.target === RIVAL_DIG && (!state.rival || state.rival.closed)) continue;
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

// ---------- HR agency (CONCEPT.md §3.3) ----------

/**
 * Pays the HR agency for a search: it offers one or two random reporters who are not on the staff
 * (common ones more often, by `weight`). A new search replaces the previous offer.
 */
/** What the next agency search costs this turn: the first one a day is free (CONCEPT.md §3.3). */
export function agencyCost(state: GameState, c: Content): number {
  return state.agencyCalls > 0 ? c.balance.agencyFee : 0;
}

export function callAgency(state: GameState, c: Content): string[] {
  const b = c.balance;
  if (state.outcome) throw new Error('Game is over');
  if (state.reporters.length >= b.maxReporters) throw new Error('The newsroom is full');
  const fee = agencyCost(state, c);
  if (state.money < fee) throw new Error('Not enough money for the agency');
  const pool = c.reporters.filter((r) => r.weight > 0 && !state.reporters.includes(r.id));
  if (!pool.length) throw new Error('The agency has nobody left to offer');
  state.money -= fee;
  state.agencyCalls++;
  const count = Math.min(pool.length, 1 + int(state.rng, b.agencyMaxOffer));
  const offer: string[] = [];
  for (let i = 0; i < count; i++) {
    const r = weightedPick(state.rng, pool);
    pool.splice(pool.indexOf(r), 1);
    offer.push(r.id);
  }
  state.agencyOffer = offer;
  return offer;
}

/** Hires one of the agency's candidates for the reporter's own price; the salary follows every turn. */
export function hireFromAgency(state: GameState, c: Content, id: string): void {
  if (state.outcome) throw new Error('Game is over');
  if (!state.agencyOffer.includes(id)) throw new Error(`Reporter ${id} was not offered`);
  if (state.reporters.length >= c.balance.maxReporters) throw new Error('The newsroom is full');
  const cost = reporterOf(c, id).hireCost;
  if (state.money < cost) throw new Error(`Not enough money to hire ${id}`);
  state.money -= cost;
  state.reporters.push(id);
  state.staff[id] = { xp: 0, loyalty: c.balance.startLoyalty };
  state.agencyOffer = state.agencyOffer.filter((x) => x !== id);
}
