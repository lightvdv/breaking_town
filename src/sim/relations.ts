import { chance, int, pick, weightedPick, type RngState } from './rng';
import { clamp, conflictsStarted, groupOf } from './lookup';
import { isRecent } from './reporters';
import { twistMods } from './twists';
import type { CardTemplate, Content, GameState, GroupId, Incident } from './types';

/**
 * Relations between social groups (CONCEPT.md §5.5): every pair of groups has a tension 0..100.
 * News and incidents heat it up, calm framing and time cool it down; high tension hurts the city.
 */

/** Pair key in content group order, e.g. "workers|intelligentsia". */
export function pairKey(c: Content, a: GroupId, b: GroupId): string {
  const ia = c.groups.findIndex((g) => g.id === a);
  const ib = c.groups.findIndex((g) => g.id === b);
  return ia <= ib ? `${a}|${b}` : `${b}|${a}`;
}

export function pairOf(key: string): [GroupId, GroupId] {
  const [a, b] = key.split('|');
  return [a, b];
}

/** All pairs of distinct groups, in content order. */
export function pairKeys(c: Content): string[] {
  const keys: string[] = [];
  c.groups.forEach((a, i) => c.groups.slice(i + 1).forEach((b) => keys.push(`${a.id}|${b.id}`)));
  return keys;
}

export function startTension(c: Content, key: string): number {
  return c.balance.tensionStart[key] ?? c.balance.tensionDefault;
}

export function createTension(c: Content): Record<string, number> {
  return Object.fromEntries(pairKeys(c).map((k) => [k, startTension(c, k)]));
}

/** 0 peace, 1 friction, 2 enmity, 3 clashes. */
export function tensionLevel(c: Content, t: number): 0 | 1 | 2 | 3 {
  const [friction, enmity, clash] = c.balance.tensionLevels;
  return t >= clash ? 3 : t >= enmity ? 2 : t >= friction ? 1 : 0;
}

export function addTension(state: GameState, key: string, delta: number): void {
  state.tension[key] = clamp((state.tension[key] ?? 0) + delta, 0, 100);
}

/** Word forms of a group for story titles: {a.many}, {b.oneAcc}… */
export function fillTitle(c: Content, text: string, pair: [GroupId, GroupId] | undefined): string {
  if (!pair) return text;
  const out = text.replace(/\{([ab])\.(\w+)\}/g, (_, who: string, form: string) => {
    const g = groupOf(c, who === 'a' ? pair[0] : pair[1]);
    return (g.forms as unknown as Record<string, string>)[form] ?? form;
  });
  return out.charAt(0).toUpperCase() + out.slice(1);
}

/** A pair for a story that can be about any two groups: tense pairs come up more often. */
export function pickPair(state: GameState, c: Content, rng: RngState): [GroupId, GroupId] {
  const key = weightedPick(
    rng,
    pairKeys(c).map((k) => ({ k, weight: (state.tension[k] ?? 0) + 10 })),
  ).k;
  const pair = pairOf(key);
  return chance(rng, 0.5) ? pair : [pair[1], pair[0]];
}

/** Templates that fit a pair: fixed to it (either order) or about any pair. */
function fits(t: CardTemplate, pair: [GroupId, GroupId]): boolean {
  if (t.conflict === 'any') return true;
  if (!t.conflict) return false;
  return (t.conflict[0] === pair[0] && t.conflict[1] === pair[1]) || (t.conflict[0] === pair[1] && t.conflict[1] === pair[0]);
}

/**
 * One day of relations: tension fades towards its start, the mayor's reconciliation cools the worst
 * pair, enmity sours moods, clashes bring people out to protest, friction breeds incidents.
 * Everything here is reversible: nobody leaves the city because of it.
 */
export function advanceRelations(state: GameState, c: Content, rng: RngState): { notes: string[]; incidents: Incident[] } {
  const b = c.balance;
  const notes: string[] = [];
  const incidents: Incident[] = [];
  const active = state.residents.filter((r) => r.status === 'active');
  // The mayor elected mid-game changes how the town lives with its quarrels (CONCEPT.md §4.9).
  const mayor = twistMods(state, c);

  for (const key of pairKeys(c)) {
    const t = state.tension[key] ?? startTension(c, key);
    state.tension[key] = clamp(t + (startTension(c, key) - t) * Math.min(1, b.tensionDecay * mayor.decayMul), 0, 100);
  }

  // The mayor steps in when a conflict gets out of hand.
  const rec = state.reconciliation;
  if (rec) {
    addTension(state, rec.pair, -b.reconcileDrop);
    rec.turnsLeft--;
    if (rec.turnsLeft <= 0) state.reconciliation = null;
  } else if (mayor.reconcile && state.turn >= state.reconcileReadyTurn) {
    const worst = pairKeys(c).reduce((x, y) => ((state.tension[y] ?? 0) > (state.tension[x] ?? 0) ? y : x));
    if ((state.tension[worst] ?? 0) >= b.reconcileThreshold - mayor.reconcileDrop) {
      state.reconciliation = { pair: worst, turnsLeft: b.reconcileTurns, startedTurn: state.turn };
      state.reconcileReadyTurn = state.turn + b.reconcileCooldown;
      addTension(state, worst, -b.reconcileDrop);
      notes.push(fillTitle(c, 'Мэрия объявила примирение: {a.many} и {b.many}', pairOf(worst)));
    }
  }

  for (const key of pairKeys(c)) {
    const level = tensionLevel(c, state.tension[key]);
    if (level < 2) continue;
    const [a, z] = pairOf(key);
    for (const r of active) {
      if (r.group !== a && r.group !== z) continue;
      r.mood = clamp(r.mood - b.enmityMood * (level === 3 ? 2 : 1));
      // Enemies keep out of each other's way: bars, and in clashes the shops too.
      if (chance(rng, b.enmityAvoid)) r.avoid.entertainment = Math.max(r.avoid.entertainment ?? 0, 2);
      if (level === 3 && chance(rng, b.enmityAvoid)) r.avoid.shop = Math.max(r.avoid.shop ?? 0, 2);
      if (level === 3 && chance(rng, b.clashProtest)) {
        r.protestTurns = Math.max(r.protestTurns, 2);
        r.mood = clamp(r.mood - b.protestMoodPenalty);
      }
    }
  }

  // Incidents: the tenser a pair, the likelier someone picks a fight. They become today's events.
  const [friction] = b.tensionLevels;
  const keys = pairKeys(c);
  for (let i = keys.length - 1; i > 0; i--) {
    const j = int(rng, i + 1);
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  for (const key of conflictsStarted(state, c) ? keys : []) {
    if (incidents.length >= b.incidentsMax) break;
    const t = state.tension[key];
    if (t < friction) continue;
    const odds = b.incidentChance * mayor.incidentMul * (0.25 + (0.75 * (t - friction)) / (100 - friction));
    if (!chance(rng, odds)) continue;
    const pair: [GroupId, GroupId] = chance(rng, 0.5) ? pairOf(key) : [pairOf(key)[1], pairOf(key)[0]];
    const all = c.cards.filter((x) => x.source === 'event' && fits(x, pair));
    const fresh = all.filter((x) => !isRecent(state, c, x.id) && !incidents.some((i) => i.templateId === x.id));
    const pool = fresh.length ? fresh : all.filter((x) => !incidents.some((i) => i.templateId === x.id));
    if (!pool.length) continue;
    const tpl = weightedPick(rng, pool);
    state.lastSeen[tpl.id] = state.turn;
    const places = state.buildings.filter((x) => x.type === tpl.place && x.open);
    const building = places.length ? pick(rng, places).id : null;
    addTension(state, key, b.tensionIncident);
    for (const r of active) if (r.group === pair[0] || r.group === pair[1]) r.mood = clamp(r.mood - b.incidentMood);
    const title = fillTitle(c, tpl.titles[0] ?? tpl.id, pair);
    incidents.push({ templateId: tpl.id, pair, building, title });
  }
  return { notes, incidents };
}
