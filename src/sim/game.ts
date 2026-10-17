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
import { averageTrust, groupOf, templateOf, trustSnapshot } from './lookup';
import { getModifiers, type Modifiers } from './modifiers';
import { cardTruth, isHarmful, maxDistortion, processLateExposures, publish, verifyNews, type PublishedNews } from './news';
import { findNews, scopeOf } from './reporters';
import type {
  CardTemplate,
  ChannelId,
  Content,
  Decision,
  GameState,
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

  const scandal: Record<ChannelId, number> = {};
  const hype: Record<ChannelId, number> = {};
  for (const ch of c.channels) {
    scandal[ch.id] = 1;
    hype[ch.id] = 0;
  }

  const state: GameState = {
    version: 1,
    seed,
    rng,
    turn: 0,
    money: c.balance.startMoney,
    exposure: 0,
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
    lastFinds: [],
    scandal,
    hype,
    topicStreak: {},
    pendingLies: [],
    initialPopulation: residents.length,
    initialEmployed: residents.filter((r) => r.job !== null).length,
    metrics: { population: 1, employment: 1, economy: 1, mood: 0.6, order: 1, cityIndex: 100, activeResidents: residents.length },
    lastReactions: {},
    todayEvents: [],
    outcome: null,
  };
  state.metrics = computeMetrics(state, c);
  startTurn(state, c);
  return state;
}

function cardAvailable(state: GameState, tpl: CardTemplate): boolean {
  return !tpl.requires || state.buildings.some((x) => x.type === tpl.requires && x.open);
}

/** Real events happen in the city; reporters may turn them into true cards. */
function generateEvents(state: GameState, c: Content, rng: RngState): CardTemplate[] {
  const b = c.balance;
  const pool = c.cards.filter((t) => t.source === 'event' && scopeOf(t) === 'local' && cardAvailable(state, t));
  const count = b.eventsMin + int(rng, b.eventsMax - b.eventsMin + 1);
  const out: CardTemplate[] = [];
  for (let i = 0; i < count && pool.length; i++) {
    const tpl = weightedPick(rng, pool);
    pool.splice(pool.indexOf(tpl), 1);
    if (tpl.cityEffect) applyCityEffect(state, rng, tpl.cityEffect);
    state.todayEvents.push(tpl.titles[0] ?? tpl.id);
    out.push(tpl);
  }
  return out;
}

function startTurn(state: GameState, c: Content): string[] {
  state.turn++;
  state.todayEvents = [];
  const notes = advanceCity(state, c, state.rng);
  const events = generateEvents(state, c, state.rng);
  const { cards, finds } = findNews(state, c, state.rng, getModifiers(state, c), events);
  state.hand = [...state.hand, ...cards];
  state.lastFinds = finds;
  state.metrics = computeMetrics(state, c);
  return notes;
}

export function validateDecision(state: GameState, c: Content, d: Decision, mods: Modifiers): void {
  if (d.publish.length > mods.publishPerTurn) {
    throw new Error(`Can publish at most ${mods.publishPerTurn} cards per turn`);
  }
  if (d.hold.length > c.balance.maxHold) throw new Error(`Can hold at most ${c.balance.maxHold} cards`);
  const used = new Set<number>();
  for (const p of d.publish) {
    const card = state.hand.find((x) => x.uid === p.cardUid);
    if (!card) throw new Error(`Card ${p.cardUid} is not in hand`);
    if (used.has(p.cardUid)) throw new Error(`Card ${p.cardUid} published twice`);
    used.add(p.cardUid);
    if (!state.ownedChannels.includes(p.channel)) throw new Error(`Channel ${p.channel} is not owned`);
    if (![0, 1, 2].includes(p.framing)) throw new Error(`Bad framing ${p.framing}`);
    if (!Number.isInteger(p.distortion) || p.distortion < 0 || p.distortion > maxDistortion(card)) {
      throw new Error(`Bad distortion ${p.distortion} for card ${p.cardUid}`);
    }
    if (p.framing === 2 && !isHarmful(templateOf(c, card.templateId).effects[cardTruth(card, p.distortion)])) {
      throw new Error(`Panic framing needs a harmful story (card ${p.cardUid})`);
    }
  }
  for (const uid of d.hold) {
    if (!state.hand.some((x) => x.uid === uid)) throw new Error(`Card ${uid} is not in hand`);
    if (used.has(uid)) throw new Error(`Card ${uid} is both published and held`);
  }
}

export function checkOutcome(state: GameState, c: Content): Outcome | null {
  const b = c.balance;
  if (state.metrics.cityIndex < b.winCityIndex) return { result: 'win', reason: 'cityDestroyed' };
  if (state.exposure >= b.exposureLimit) return { result: 'lose', reason: 'exposure' };
  if (state.brokeTurns >= b.brokeTurnsLimit) return { result: 'lose', reason: 'bankrupt' };
  if (state.ownedChannels.every((ch) => averageTrust(state, c, ch) < b.trustCollapse)) {
    return { result: 'lose', reason: 'trustCollapse' };
  }
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
  const trustBefore = trustSnapshot(state, c);
  const moneyBefore = state.money;
  const exposureBefore = state.exposure;

  state.lastReactions = {};
  state.exposure = Math.max(0, state.exposure - b.exposureDecay);
  for (const ch of Object.keys(state.scandal)) {
    state.scandal[ch] = Math.min(1, state.scandal[ch] + b.scandalRecovery);
  }

  const lateExposures = processLateExposures(state, c, rng, mods);

  const published: PublishedNews[] = [];
  const topicsThisTurn: Partial<Record<Topic, number>> = {};
  for (const p of d.publish) {
    const card = state.hand.find((x) => x.uid === p.cardUid)!;
    const topic = templateOf(c, card.templateId).topic;
    published.push(publish(state, c, rng, mods, p, topicsThisTurn[topic] ?? 0));
    topicsThisTurn[topic] = (topicsThisTurn[topic] ?? 0) + 1;
  }
  verifyNews(state, c, rng, mods, published);
  // Loud framing makes the channel "cry wolf" (CONCEPT.md §4.2); the decay happens now so that
  // next turn's previews show exactly the hype the publications will meet.
  for (const p of d.publish) state.hype[p.channel] = Math.min(100, (state.hype[p.channel] ?? 0) + b.hypeGain[p.framing]);
  for (const ch of Object.keys(state.hype)) state.hype[ch] = Math.max(0, state.hype[ch] - b.hypeDecay);

  const viewSets: Record<ChannelId, Set<number>> = {};
  for (const n of published) {
    const set = (viewSets[n.pub.channel] ??= new Set());
    for (const id of n.viewers) set.add(id);
  }
  const views: Record<ChannelId, number> = {};
  for (const ch of state.ownedChannels) views[ch] = viewSets[ch]?.size ?? 0;
  const { income, upkeep } = collectIncome(state, c, views);
  state.brokeTurns = state.money < 0 ? state.brokeTurns + 1 : 0;

  const streak: Partial<Record<Topic, number>> = {};
  for (const [topic, n] of Object.entries(topicsThisTurn) as [Topic, number][]) {
    streak[topic] = (state.topicStreak[topic] ?? 0) + n;
  }
  state.topicStreak = streak;

  const held = new Set(d.hold);
  state.hand = state.hand.filter((x) => held.has(x.uid));

  const notes = startTurn(state, c);
  state.outcome = checkOutcome(state, c);

  return {
    turn,
    publications: published.map((n) => n.report),
    lateExposures,
    views,
    income,
    upkeep,
    moneyDelta: state.money - moneyBefore,
    exposureDelta: state.exposure - exposureBefore,
    hypeAfter: { ...state.hype },
    trustBefore,
    trustAfter: trustSnapshot(state, c),
    metricsBefore,
    metricsAfter: state.metrics,
    events: [...state.todayEvents],
    notes,
    outcome: state.outcome,
  };
}
