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
    let candidates: CardTemplate[];
    if (scope === 'local') {
      const todays = pool.filter(fresh);
      const rumors = c.cards.filter((t) => scopeOf(t) === 'local' && t.source === 'rumor' && available(state, t) && fresh(t));
      candidates = todays.length && chance(rng, b.eventPreference) ? todays : rumors.length ? rumors : todays;
    } else {
      candidates = c.cards.filter((t) => scopeOf(t) === 'global' && available(state, t) && fresh(t));
    }
    if (s.topics.length && chance(rng, b.topicFocus)) {
      const focused = candidates.filter((t) => s.topics.includes(t.topic));
      if (focused.length) candidates = focused;
    }
    if (candidates.length === 0) return null;

    const tpl = weightedPick(rng, candidates);
    const idx = pool.indexOf(tpl);
    if (idx >= 0) pool.splice(idx, 1);
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

  const hired = state.reporters.map((id) => reporterOf(c, id));
  for (const r of hired) {
    const card = chance(rng, reporterLuck(r, mods)) ? make(r, null) : null;
    finds.push({ reporterId: r.id, cardUid: card?.uid ?? null, tier: card?.tier ?? null, forced: false });
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
