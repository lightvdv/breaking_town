import { createRng, int, weightedPick, type RngState } from './rng';
import {
  advanceCity,
  applyCityEffect,
  computeMetrics,
  countWorkers,
  createResidents,
  tryAssignJob,
} from './city';
import { collectIncome } from './economy';
import { createBuildings } from './map';
import { averageTrust, groupOf, templateOf } from './lookup';
import { getModifiers, placementSlots, type Modifiers } from './modifiers';
import { effectiveTier, issueLevel, issueScore, maxDistortion, minDistortion, processLateExposures, publish, verifyNews, type PublishedNews } from './news';
import { advanceRelations, createTension, fillTitle, pairKeys, pairOf, tensionLevel } from './relations';
import { followersOf, readerCount, seedFollowers, updateReaders } from './readers';
import { advanceInvestigations, findNews, isRecent, scopeOf } from './reporters';
import type {
  CardTemplate,
  ChannelId,
  Content,
  Decision,
  GameState,
  GroupId,
  Highlight,
  Incident,
  Outcome,
  Topic,
  TurnReport,
} from './types';

export function createGame(c: Content, seed: number): GameState {
  const rng = createRng(seed);
  const { buildings, mapSize } = createBuildings(c, rng);
  const residents = createResidents(c, rng, buildings);
  const workers = countWorkers(residents);
  for (const r of residents) tryAssignJob(r, groupOf(c, r.group), buildings, workers);

  const state: GameState = {
    version: 1,
    seed,
    rng,
    turn: 0,
    money: c.balance.startMoney,
    brokeTurns: 0,
    residents,
    buildings,
    mapSize,
    hand: [],
    nextUid: 1,
    nextResidentId: residents.length,
    ownedChannels: c.channels.filter((ch) => ch.cost === 0 && ch.requires === null).map((ch) => ch.id),
    upgrades: [],
    reporters: [...c.balance.startReporters],
    agencyOffer: [],
    lastFinds: [],
    scandal: 1,
    investigations: [],
    topicStreak: {},
    lastSeen: {},
    reporterTopics: {},
    pendingLies: [],
    tension: createTension(c),
    reconciliation: null,
    reconcileReadyTurn: 0,
    todayIncidents: [],
    initialPopulation: residents.length,
    initialEmployed: residents.filter((r) => r.job !== null).length,
    metrics: { population: 1, employment: 1, economy: 1, mood: 0.6, order: 1, cityIndex: 100, activeResidents: residents.length },
    lastReactions: {},
    todayEvents: [],
    outcome: null,
  };
  state.metrics = computeMetrics(state, c);
  seedFollowers(state, c, rng, getModifiers(state, c));
  startTurn(state, c);
  return state;
}

function cardAvailable(state: GameState, tpl: CardTemplate): boolean {
  return !tpl.requires || state.buildings.some((x) => x.type === tpl.requires && x.open);
}

/** Real events happen in the city; reporters may turn them into true cards. */
function generateEvents(state: GameState, c: Content, rng: RngState): CardTemplate[] {
  const b = c.balance;
  // Conflict events (incidents) come only from tense relations (relations.ts).
  const all = c.cards.filter((t) => t.source === 'event' && !t.conflict && scopeOf(t) === 'local' && cardAvailable(state, t));
  // The same thing does not happen again soon (CONCEPT.md §3.3).
  const fresh = all.filter((t) => !isRecent(state, c, t.id));
  const pool = fresh.length ? fresh : all;
  const count = b.eventsMin + int(rng, b.eventsMax - b.eventsMin + 1);
  const out: CardTemplate[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    const tpl = weightedPick(rng, pool);
    pool.splice(pool.indexOf(tpl), 1);
    state.lastSeen[tpl.id] = state.turn;
    if (tpl.cityEffect) applyCityEffect(state, rng, tpl.cityEffect);
    state.todayEvents.push(tpl.titles[0] ?? tpl.id);
    out.push(tpl);
  }
  return out;
}

function startTurn(state: GameState, c: Content): string[] {
  state.turn++;
  // The agency's candidates take other jobs if nobody hires them the same day.
  state.agencyOffer = [];
  state.todayEvents = [];
  const notes = advanceCity(state, c, state.rng);
  const relations = advanceRelations(state, c, state.rng);
  notes.push(...relations.notes);
  state.todayIncidents = relations.incidents;
  const events = generateEvents(state, c, state.rng);
  // Incidents are today's events too: reporters may write them up as true conflict stories.
  const pairs = new Map<string, [GroupId, GroupId]>();
  for (const i of relations.incidents) {
    state.todayEvents.push(i.title);
    events.push(c.cards.find((t) => t.id === i.templateId)!);
    pairs.set(i.templateId, i.pair);
  }
  const dug = advanceInvestigations(state, c, state.rng);
  const { cards, finds } = findNews(state, c, state.rng, getModifiers(state, c), events, pairs);
  state.hand = [...state.hand, ...dug.cards, ...cards];
  state.lastFinds = [...dug.finds, ...finds];
  state.metrics = computeMetrics(state, c);
  return notes;
}

export function validateDecision(state: GameState, _c: Content, d: Decision, mods: Modifiers): void {
  // Any number of stories, but the front page and articles have limited room (CONCEPT.md §4.2).
  const slots = placementSlots(mods);
  const names = ['brief', 'article', 'front page'];
  for (const place of [1, 2] as const) {
    if (d.publish.filter((p) => p.placement === place).length > slots[place]) {
      throw new Error(`Only ${slots[place]} ${names[place]} slot(s) this turn`);
    }
  }
  const used = new Set<number>();
  for (const p of d.publish) {
    const card = state.hand.find((x) => x.uid === p.cardUid);
    if (!card) throw new Error(`Card ${p.cardUid} is not in hand`);
    if (used.has(p.cardUid)) throw new Error(`Card ${p.cardUid} published twice`);
    used.add(p.cardUid);
    if (![0, 1, 2].includes(p.placement)) throw new Error(`Bad placement ${p.placement}`);
    if (!Number.isInteger(p.distortion) || p.distortion < minDistortion(card) || p.distortion > maxDistortion(card)) {
      throw new Error(`Bad distortion ${p.distortion} for card ${p.cardUid}`);
    }
  }
}

export function checkOutcome(state: GameState, c: Content): Outcome | null {
  const b = c.balance;
  if (state.metrics.cityIndex < b.winCityIndex) return { result: 'win', reason: 'cityDestroyed' };
  if (state.brokeTurns >= b.brokeTurnsLimit) return { result: 'lose', reason: 'bankrupt' };
  if (averageTrust(state, c) < b.trustCollapse) return { result: 'lose', reason: 'trustCollapse' };
  if (state.turn > b.turnLimit) return { result: 'lose', reason: 'turnLimit' };
  return null;
}

/** Resolves the player's decision and advances the city to the next turn. */
export function playTurn(state: GameState, c: Content, d: Decision): TurnReport {
  if (state.outcome) throw new Error('Game is over');
  const b = c.balance;
  const rng = state.rng;
  const mods = getModifiers(state, c);
  validateDecision(state, c, d, mods);

  const turn = state.turn;
  const metricsBefore = state.metrics;
  const trustBefore = averageTrust(state, c);
  const moneyBefore = state.money;

  // Last turn's readers buy this issue (CONCEPT.md §5.2, §5.4).
  const buyers: Record<ChannelId, number> = {};
  for (const ch of state.ownedChannels) buyers[ch] = followersOf(state, ch);
  const readersBefore = readerCount(state);
  const readerIds = new Set(state.residents.filter((r) => r.status === 'active' && r.follows.length > 0).map((r) => r.id));
  const tensionBefore = { ...state.tension };
  const protestingBefore = new Set(state.residents.filter((r) => r.status === 'active' && r.protestTurns > 0).map((r) => r.id));
  const activeBefore = new Set(state.residents.filter((r) => r.status === 'active').map((r) => r.id));
  const openBefore = new Set(state.buildings.filter((x) => x.open).map((x) => x.id));
  const reconcileBefore = state.reconciliation;

  state.lastReactions = {};
  state.scandal = Math.min(1, state.scandal + b.scandalRecovery);

  const lateExposures = processLateExposures(state, c, rng, mods);

  const published: PublishedNews[] = [];
  const topicsThisTurn: Partial<Record<Topic, number>> = {};
  for (const p of d.publish) {
    const card = state.hand.find((x) => x.uid === p.cardUid)!;
    const topic = templateOf(c, card.templateId).topic;
    published.push(publish(state, c, rng, mods, p, topicsThisTurn[topic] ?? 0));
    topicsThisTurn[topic] = (topicsThisTurn[topic] ?? 0) + 1;
  }
  const exposures = [...lateExposures, ...verifyNews(state, c, rng, mods, published)];

  const { income, upkeep, upkeepItems } = collectIncome(state, c, buyers);
  state.brokeTurns = state.money < 0 ? state.brokeTurns + 1 : 0;

  const stories = d.publish.map((p) => ({ tier: effectiveTier(state.hand.find((x) => x.uid === p.cardUid)!, p.distortion), placement: p.placement }));
  const issue = { score: issueScore(c, stories), level: issueLevel(c, stories) };
  const readers = updateReaders(state, c, rng, mods, published.length, issue.level, readerIds);
  const readersAfter = readerCount(state);

  const streak: Partial<Record<Topic, number>> = {};
  for (const [topic, n] of Object.entries(topicsThisTurn) as [Topic, number][]) {
    streak[topic] = (state.topicStreak[topic] ?? 0) + n;
  }
  state.topicStreak = streak;

  state.hand = [];

  const tensionMid = { ...state.tension };
  const notes = startTurn(state, c);
  state.outcome = checkOutcome(state, c);
  const reconciliationStarted = state.reconciliation && state.reconciliation !== reconcileBefore ? { ...state.reconciliation } : null;
  const highlights = findHighlights(state, c, {
    tensionBefore: tensionMid,
    protestingBefore,
    activeBefore,
    openBefore,
    reconciliationStarted: reconciliationStarted?.pair ?? null,
    incidents: state.todayIncidents,
  });

  return {
    turn,
    publications: published.map((n) => n.report),
    exposures,
    buyers,
    income,
    upkeep,
    upkeepItems,
    moneyDelta: state.money - moneyBefore,
    readers: { before: readersBefore, ...readers, after: readersAfter },
    issue,
    tensionBefore,
    tensionAfter: { ...state.tension },
    reconciliationStarted,
    highlights,
    trustBefore,
    trustAfter: averageTrust(state, c),
    metricsBefore,
    metricsAfter: state.metrics,
    events: [...state.todayEvents],
    notes,
    outcome: state.outcome,
  };
}

/**
 * Bright moments of the city day for the cutscene before the issue (CONCEPT.md §7.3): incidents,
 * a pair breaking into clashes, mass protests or departures, a closed building, the mayor's
 * reconciliation. A quiet day has none.
 */
function findHighlights(
  state: GameState,
  c: Content,
  before: {
    tensionBefore: Record<string, number>;
    protestingBefore: Set<number>;
    activeBefore: Set<number>;
    openBefore: Set<number>;
    reconciliationStarted: string | null;
    incidents: Incident[];
  },
): Highlight[] {
  const b = c.balance;
  const out: Highlight[] = [];
  const hall = state.buildings.find((x) => x.type === 'cityHall')?.id ?? null;
  for (const i of before.incidents) out.push({ kind: 'fight', title: i.title, building: i.building, groups: [...i.pair] });
  for (const key of pairKeys(c)) {
    if (tensionLevel(c, state.tension[key]) === 3 && tensionLevel(c, before.tensionBefore[key] ?? 0) < 3) {
      out.push({ kind: 'clash', title: fillTitle(c, 'Столкновения: {a.many} против {b.manyGen}', pairOf(key)), building: hall, groups: pairOf(key) });
    }
  }
  const newProtesters = state.residents.filter((r) => r.status === 'active' && r.protestTurns > 0 && !before.protestingBefore.has(r.id)).length;
  if (newProtesters >= b.highlightProtestMin) out.push({ kind: 'protest', title: `На протест вышли ${newProtesters} человек`, building: hall, groups: [] });
  const left = state.residents.filter((r) => r.status === 'left' && before.activeBefore.has(r.id)).length;
  if (left >= b.highlightLeaveMin) out.push({ kind: 'exodus', title: `Из города уехали ${left} человек`, building: null, groups: [] });
  for (const x of state.buildings) {
    if (!x.open && before.openBefore.has(x.id)) out.push({ kind: 'closed', title: `${buildingName(c, x.type)} закрылся`, building: x.id, groups: [] });
  }
  if (before.reconciliationStarted) {
    out.push({
      kind: 'reconcile',
      title: fillTitle(c, 'Мэрия мирит: {a.many} и {b.many}', pairOf(before.reconciliationStarted)),
      building: hall,
      groups: pairOf(before.reconciliationStarted),
    });
  }
  return out.slice(0, 3);
}

function buildingName(c: Content, type: string): string {
  return c.buildings.find((x) => x.type === type)?.name ?? type;
}
