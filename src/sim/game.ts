import { createRng, int, weightedPick, type RngState } from './rng';
import {
  advanceCity,
  applyCityEffect,
  computeMetrics,
  countWorkers,
  createResidents,
  tryAssignJob,
} from './city';
import { advanceArcs, pushArc } from './arcs';
import { collectIncome } from './economy';
import { advanceOffers, settleDeals } from './offers';
import { updateStaff } from './staff';
import { assignTasks, updateTasks } from './tasks';
import { advanceTwist, settleAudit } from './twists';
import { assignPeople, snapshotPeople, updatePeople } from './people';
import { createBuildings } from './map';
import { averageTrust, groupOf, templateOf } from './lookup';
import { getModifiers, placementSlots, type Modifiers } from './modifiers';
import { effectiveTier, issueLevel, issueScore, maxDistortion, minDistortion, processLateExposures, publish, verifyNews, type PublishedNews } from './news';
import { advanceRelations, createTension, fillTitle, pairKeys, pairOf, tensionLevel } from './relations';
import { followersOf, readerCount, seedFollowers, updateReaders } from './readers';
import { advanceInvestigations, findNews, isRecent, scopeOf } from './reporters';
import { markDebunked, planRival, pruneRival, publishRival, recordOurIssue, rivalKindOf, rivalReaders, rivalTrust, seedRival, updateRivalReaders, verifyRival } from './rival';
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
  GameMode,
  Difficulty,
} from './types';

/**
 * `c` must already be the content of this difficulty (`withDifficulty`) and, in the campaign, of the
 * town (`withTown`). A campaign town may start with a reporter brought from the last town, with their experience.
 */
export function createGame(
  c: Content,
  seed: number,
  mode: GameMode = 'destroy',
  difficulty: Difficulty = 'normal',
  opts: { town?: string; reporters?: { id: string; xp: number }[] } = {},
): GameState {
  const team = opts.reporters?.length ? opts.reporters : c.balance.startReporters.map((id) => ({ id, xp: 0 }));
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
    mode,
    difficulty,
    // Either mode has a rival paper: the tabloid when we defend the town, the guardian when we ruin it.
    rival: { kind: rivalKindOf(mode), plan: [], printed: [], closed: false, debunked: 0 },
    rivalWatch: [],
    ourPrinted: [],
    arcs: [],
    arcsDone: [],
    offer: null,
    deals: [],
    lastOfferTurn: 0,
    people: {},
    letters: [],
    fates: [],
    staff: Object.fromEntries(team.map((x) => [x.id, { xp: x.xp, loyalty: c.balance.startLoyalty }])),
    money: c.balance.startMoney,
    price: c.balance.startPrice,
    brokeTurns: 0,
    residents,
    buildings,
    mapSize,
    hand: [],
    nextUid: 1,
    nextResidentId: residents.length,
    ownedChannels: c.channels.filter((ch) => ch.cost === 0 && ch.requires === null).map((ch) => ch.id),
    upgrades: [],
    reporters: team.map((x) => x.id),
    agencyOffer: [],
    agencyCalls: 0,
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
    missedEvents: [],
    rivalReactions: {},
    todayEvents: [],
    tasks: [],
    exposedTotal: 0,
    cleanStreak: 0,
    twist: null,
    budgetCut: 0,
    town: opts.town ?? null,
    outcome: null,
  };
  state.metrics = computeMetrics(state, c);
  assignPeople(state, c, rng);
  seedFollowers(state, c, rng, getModifiers(state, c));
  if (state.rival) seedRival(state, c, rng);
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
  const all = c.cards.filter((t) => t.source === 'event' && !t.conflict && !t.arc && scopeOf(t) === 'local' && cardAvailable(state, t));
  // The same thing does not happen again soon (CONCEPT.md §3.3).
  const fresh = all.filter((t) => !isRecent(state, c, t.id));
  const pool = fresh.length ? fresh : all;
  const count = b.eventsMin + int(rng, b.eventsMax - b.eventsMin + 1);
  const out: CardTemplate[] = [];
  // What happened not so long ago is less likely again (`repeatFadeDays`).
  const fade = (t: CardTemplate) => {
    const last = state.lastSeen[t.id];
    return last === undefined ? 1 : Math.min(1, Math.max(0.05, (state.turn - last) / b.repeatFadeDays));
  };
  for (let i = 0; i < count && pool.length; i++) {
    const tpl = weightedPick(
      rng,
      pool.map((x) => ({ x, weight: x.weight * fade(x) })),
    ).x;
    pool.splice(pool.indexOf(tpl), 1);
    state.lastSeen[tpl.id] = state.turn;
    if (tpl.cityEffect) applyCityEffect(state, rng, tpl.cityEffect);
    state.todayEvents.push(tpl.titles[0] ?? tpl.id);
    out.push(tpl);
  }
  return out;
}

function startTurn(state: GameState, c: Content): { notes: string[]; twist: { started: boolean; ended: boolean } } {
  state.turn++;
  // The agency's candidates take other jobs if nobody hires them the same day.
  state.agencyOffer = [];
  state.agencyCalls = 0;
  state.todayEvents = [];
  const notes = advanceCity(state, c, state.rng);
  // The mid-game twist (CONCEPT.md §4.9): before relations, so a new mayor rules from his first day.
  const twist = advanceTwist(state, c, state.rng);
  notes.push(...twist.notes);
  const relations = advanceRelations(state, c, state.rng);
  notes.push(...relations.notes);
  state.todayIncidents = relations.incidents;
  const events = generateEvents(state, c, state.rng);
  // Story arcs move on: their stages are today's events too (CONCEPT.md §3.1а).
  const arcs = advanceArcs(state, c, state.rng);
  events.push(...arcs.events);
  notes.push(...arcs.notes);
  notes.push(...advanceOffers(state, c, state.rng));
  // Incidents are today's events too: reporters may write them up as true conflict stories.
  const pairs = new Map<string, [GroupId, GroupId]>();
  for (const i of relations.incidents) {
    state.todayEvents.push(i.title);
    events.push(c.cards.find((t) => t.id === i.templateId)!);
    pairs.set(i.templateId, i.pair);
  }
  pruneRival(state, c);
  const dug = advanceInvestigations(state, c, state.rng);
  const { cards, finds, missed } = findNews(state, c, state.rng, getModifiers(state, c), events, pairs);
  const incidentTitles = new Map(relations.incidents.map((i) => [i.templateId, i.title]));
  state.missedEvents = missed.map((t) => incidentTitles.get(t.id) ?? t.titles[0] ?? t.id);
  state.hand = [...state.hand, ...dug.cards, ...cards];
  state.lastFinds = [...dug.finds, ...finds];
  // Save mode: the rival writes today's issue; it comes out with ours (CONCEPT.md §8).
  planRival(state, c, state.rng, events, pairs);
  // At most one sensation a day (CONCEPT.md §4.2а): the others come out as interesting stories.
  let sensations = 0;
  for (const card of state.hand) if (card.tier === 3 && ++sensations > c.balance.maxSensations) card.tier = 2;
  for (const f of state.lastFinds) if (f.cardUid !== null) f.tier = state.hand.find((x) => x.uid === f.cardUid)?.tier ?? f.tier;
  state.metrics = computeMetrics(state, c);
  // The game's tasks are given on their day (CONCEPT.md §4.8).
  assignTasks(state, c, state.rng);
  return { notes, twist: { started: twist.started, ended: twist.ended } };
}

/**
 * The clean streak (CONCEPT.md §5.3): every issue printed without a half-truth or lie adds a day; a
 * lie breaks it, an empty issue leaves it as it is. After `cleanStreakDays` days the whole town
 * trusts the paper `cleanStreakBonus` more and the streak starts again.
 */
function advanceCleanStreak(state: GameState, c: Content, published: { truth: number }[]): { days: number; broken: boolean; bonus: number } {
  const b = c.balance;
  if (!published.length) return { days: state.cleanStreak, broken: false, bonus: 0 };
  if (published.some((n) => n.truth > 0)) {
    const broken = state.cleanStreak > 0;
    state.cleanStreak = 0;
    return { days: 0, broken, bonus: 0 };
  }
  state.cleanStreak++;
  if (state.cleanStreak < b.cleanStreakDays) return { days: state.cleanStreak, broken: false, bonus: 0 };
  const before = averageTrust(state, c);
  for (const r of state.residents) if (r.status === 'active') r.trust = Math.min(100, r.trust + b.cleanStreakBonus);
  state.cleanStreak = 0;
  return { days: b.cleanStreakDays, broken: false, bonus: averageTrust(state, c) - before };
}

export function validateDecision(state: GameState, c: Content, d: Decision, mods: Modifiers): void {
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
  // An issue carries at most one sensation, found or blown up (CONCEPT.md §4.2а).
  const sensations = d.publish.filter((p) => effectiveTier(state.hand.find((x) => x.uid === p.cardUid)!, p.distortion) === 3).length;
  if (sensations > c.balance.maxSensations) throw new Error(`Only ${c.balance.maxSensations} sensation(s) per issue`);
}

export function checkOutcome(state: GameState, c: Content): Outcome | null {
  const b = c.balance;
  if (state.mode === 'destroy' && state.rival?.closed) return { result: 'win', reason: 'rivalClosed' };
  if (state.mode === 'save') {
    // Save the town (CONCEPT.md §8): close the rival or hold out to the end; lose the town and it is over.
    if (state.rival?.closed) return { result: 'win', reason: 'rivalClosed' };
    if (state.metrics.cityIndex < b.saveLoseIndex) return { result: 'lose', reason: 'cityFallen' };
    if (state.brokeTurns >= b.brokeTurnsLimit) return { result: 'lose', reason: 'bankrupt' };
    if (averageTrust(state, c) < b.trustCollapse) return { result: 'lose', reason: 'trustCollapse' };
    if (state.turn > b.turnLimit) return { result: 'win', reason: 'citySaved' };
    return null;
  }
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
  const peopleBefore = snapshotPeople(state);

  state.lastReactions = {};
  state.rivalReactions = {};
  state.scandal = Math.min(1, state.scandal + b.scandalRecovery);

  const lateExposures = processLateExposures(state, c, rng, mods);

  const published: PublishedNews[] = [];
  const topicsThisTurn: Partial<Record<Topic, number>> = {};
  for (const p of d.publish) {
    const card = state.hand.find((x) => x.uid === p.cardUid)!;
    const topic = templateOf(c, card.templateId).topic;
    published.push(publish(state, c, rng, mods, p, topicsThisTurn[topic] ?? 0));
    pushArc(state, c, card, p.placement, p.distortion);
    topicsThisTurn[topic] = (topicsThisTurn[topic] ?? 0) + 1;
  }
  // Save mode (CONCEPT.md §8): our debunks answered its recent lies; its new issue comes out today.
  const rivalBefore = state.rival ? { readers: rivalReaders(state), trust: rivalTrust(state) } : null;
  const debunks = d.publish.map((p) => state.hand.find((x) => x.uid === p.cardUid)!).filter((x) => x.debunk);
  markDebunked(state, debunks.map((x) => x.debunk!.uid));
  const cured = published.filter((n) => debunks.some((x) => x.uid === n.pub.cardUid)).reduce((sum, n) => sum + (n.report.effects.debunk ?? 0), 0);
  for (const s of state.rival?.closed ? [] : (state.rival?.plan ?? [])) pushArc(state, c, s.card, s.placement, s.distortion);
  const rivalNews = publishRival(state, c, rng);
  const exposures = [...lateExposures, ...verifyNews(state, c, rng, mods, published)];
  const cleanStreak = advanceCleanStreak(state, c, published);
  verifyRival(state, c, rng, rivalNews);
  // The rival may answer our lies over the next days.
  recordOurIssue(state, c, published);
  // Reporters grow, take our lies to heart, and may quit (CONCEPT.md §3.3б).
  const staff = updateStaff(state, c, rng, mods, published);
  exposures.push(...staff.exposures);

  // Deals with a catch (CONCEPT.md §3.5а): a bad story about what we promised to keep quiet about costs us.
  const deals = settleDeals(state, c, d.publish);
  const { income, upkeep, upkeepItems } = collectIncome(state, c, buyers);
  state.brokeTurns = state.money < 0 ? state.brokeTurns + 1 : 0;

  const stories = d.publish.map((p) => ({ tier: effectiveTier(state.hand.find((x) => x.uid === p.cardUid)!, p.distortion), placement: p.placement }));
  const issue = { score: issueScore(c, stories), level: issueLevel(c, stories) };
  const readers = updateReaders(state, c, rng, mods, published.length, issue.level, readerIds);
  updateRivalReaders(state, c, rng, rivalNews);
  const readersAfter = readerCount(state);

  const streak: Partial<Record<Topic, number>> = {};
  for (const [topic, n] of Object.entries(topicsThisTurn) as [Topic, number][]) {
    streak[topic] = (state.topicStreak[topic] ?? 0) + n;
  }
  state.topicStreak = streak;

  state.hand = [];

  const tensionMid = { ...state.tension };
  state.exposedTotal += exposures.length;
  const day = startTurn(state, c);
  const notes = day.notes;
  // Tasks are settled for the day that ended; the audit ends with its task.
  const tasks = updateTasks(state, c, exposures);
  const auditEnded = settleAudit(state, c, tasks.done, tasks.failed);
  // The named residents: what the day did to them, and their letters to the paper (CONCEPT.md §2.2а).
  updatePeople(state, c, rng, peopleBefore, published, exposures);
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
    cleanStreak,
    publications: published.map((n) => n.report),
    exposures,
    buyers,
    income,
    upkeep,
    upkeepItems,
    deals,
    staff: { levelUps: staff.levelUps, quit: staff.quit, leaked: staff.leaked },
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
    tasks,
    ...(day.twist.started || day.twist.ended || auditEnded ? { twist: { started: day.twist.started, ended: day.twist.ended || auditEnded } } : {}),
    ...(state.rival && rivalBefore
      ? {
          rival: {
            publications: rivalNews.map((n) => n.report),
            cured,
            readersBefore: rivalBefore.readers,
            readersAfter: rivalReaders(state),
            trustBefore: rivalBefore.trust,
            trustAfter: rivalTrust(state),
            closed: state.rival.closed,
          },
        }
      : {}),
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
