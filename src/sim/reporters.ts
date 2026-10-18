import { chance, pick, weightedPick, type RngState } from './rng';
import { clamp } from './lookup';
import type { Modifiers } from './modifiers';
import type { CardInstance, CardTemplate, Content, Find, GameState, NewsScope, NewsTier, ReporterDef } from './types';

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
 * Hired reporters search for stories. `events` are today's real local events; a reporter who
 * finds one takes it, so it cannot be found twice. Returns the new cards and the search log.
 */
export function findNews(
  state: GameState,
  c: Content,
  rng: RngState,
  mods: Modifiers,
  events: CardTemplate[],
): { cards: CardInstance[]; finds: Find[] } {
  const b = c.balance;
  const cards: CardInstance[] = [];
  const finds: Find[] = [];
  const pool = [...events];
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
    const todays = scope === 'local' ? pool.filter(fresh) : [];
    const truths = todays.length && (facts.length === 0 || chance(rng, b.eventPreference)) ? todays : facts;
    const wantsTruth = chance(rng, b.trueNewsShare);
    let candidates = wantsTruth ? (truths.length ? truths : rumors) : rumors.length ? rumors : truths;
    // Stories found or happened recently do not come back (today's events are exempt: they just happened).
    const notRecent = candidates.filter((t) => todays.includes(t) || !recent(t));
    candidates = notRecent.length ? notRecent : oldestSeen(candidates);
    if (s.topics.length && chance(rng, b.topicFocus)) {
      const focused = candidates.filter((t) => s.topics.includes(t.topic));
      if (focused.length) candidates = focused;
    }
    if (candidates.length === 0) return null;

    const tpl = weightedPick(rng, candidates);
    const idx = pool.indexOf(tpl);
    if (idx >= 0) pool.splice(idx, 1);
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
    cards.push(card);
    return card;
  };

  // Reporters busy with an investigation skip the ordinary search.
  const busy = new Set(state.investigations.map((x) => x.reporterId));
  const hired = state.reporters.filter((id) => !busy.has(id)).map((id) => reporterOf(c, id));
  for (const r of hired) {
    const card = chance(rng, reporterLuck(r, mods)) ? make(r, null) : null;
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
