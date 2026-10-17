import { chance, int, type RngState } from './rng';
import { leaveCity } from './city';
import { channelOf, clamp, groupOf, templateOf } from './lookup';
import type { Modifiers } from './modifiers';
import type {
  CardEffect,
  CardInstance,
  CardTemplate,
  ChannelId,
  Content,
  Framing,
  GameState,
  Publication,
  PublicationReport,
  Reaction,
  Resident,
  TruthLevel,
} from './types';

/** What a publication would look like, without touching the state. Used by UI and bots. */
export interface PublicationPreview {
  title: string;
  truth: TruthLevel;
  effect: CardEffect | null;
  interest: number;
  /** Chance that a resident who fully consumes the channel sees the news. */
  reachChance: number;
  /** Fact-check chance assuming the news reaches a quarter of the city. */
  exposureRisk: number;
  /** Belief multiplier from the channel's hype (1 = undamaged). */
  credibility: number;
  /** The channel's current hype, 0..100. */
  hype: number;
}

export function cardTruth(card: CardInstance, distortion: number): TruthLevel {
  return Math.min(2, card.baseTruth + distortion) as TruthLevel;
}

export function maxDistortion(card: CardInstance): number {
  return 2 - card.baseTruth;
}

/** Panic framing is only allowed for stories that harm the city. */
export function isHarmful(effect: CardEffect | null): boolean {
  return effect !== null && effect.type !== 'moodUp';
}

/** Loud framing works less the more the channel has already shouted (CONCEPT.md §4.2). */
function loudBonus(multiplier: number, hype: number): number {
  return 1 + (multiplier - 1) * (1 - hype / 100);
}

function hypeOf(state: GameState, channel: ChannelId): number {
  return state.hype[channel] ?? 0;
}

function interestOf(
  state: GameState,
  c: Content,
  mods: Modifiers,
  card: CardInstance,
  tpl: CardTemplate,
  pub: Publication,
  repeatsThisTurn: number,
): number {
  const b = c.balance;
  const streak = (state.topicStreak[tpl.topic] ?? 0) + repeatsThisTurn;
  const fatigue = Math.pow(1 - b.fatiguePerRepeat, streak);
  const stale = Math.max(b.minStaleInterest, 1 - b.staleInterestPerTurn * (state.turn - card.createdTurn));
  const scope = card.scope === 'global' ? b.globalInterestMul : 1;
  return (
    tpl.interest *
    b.tierInterest[card.tier] *
    scope *
    loudBonus(b.framingInterest[pub.framing], hypeOf(state, pub.channel)) *
    mods.channels[pub.channel].interestMul *
    fatigue *
    stale
  );
}

function reachChanceOf(
  c: Content,
  mods: Modifiers,
  card: CardInstance,
  tpl: CardTemplate,
  channel: ChannelId,
  interest: number,
): number {
  const ch = channelOf(c, channel);
  const base = ch.baseReach + mods.channels[channel].reachAdd;
  const engagement = tpl.engagement * c.balance.tierEngagement[card.tier];
  return clamp(base * interest * (1 + engagement * ch.virality));
}

/** Tier and scope scale how strongly believers act on a story. */
function effectMulOf(c: Content, card: CardInstance): number {
  return c.balance.tierEffect[card.tier] * (card.scope === 'global' ? c.balance.globalEffectMul : 1);
}

export function exposureRiskOf(
  state: GameState,
  c: Content,
  mods: Modifiers,
  truth: TruthLevel,
  channel: ChannelId,
  framing: Framing,
  reachShare: number,
): number {
  const b = c.balance;
  const defense = state.metrics.cityIndex < b.defenseCityIndex ? 1 + b.defenseCheckerBoost : 1;
  const checkersOpen = state.buildings.some((x) => x.type === 'factCheckers' && x.open);
  const base = checkersOpen ? b.checkerBase : b.checkerBase * 0.5;
  return clamp(
    base *
      b.truthRisk[truth] *
      channelOf(c, channel).exposureRisk *
      b.framingExposureRisk[framing] *
      (0.5 + reachShare) *
      mods.checkerMul *
      defense,
    0,
    0.95,
  );
}

export function previewPublication(
  state: GameState,
  c: Content,
  mods: Modifiers,
  pub: Publication,
  repeatsThisTurn = 0,
): PublicationPreview {
  const card = state.hand.find((x) => x.uid === pub.cardUid);
  if (!card) throw new Error(`Card ${pub.cardUid} is not in hand`);
  const tpl = templateOf(c, card.templateId);
  const truth = cardTruth(card, pub.distortion);
  const interest = interestOf(state, c, mods, card, tpl, pub, repeatsThisTurn);
  return {
    title: tpl.titles[truth] ?? '',
    truth,
    effect: tpl.effects[truth],
    interest,
    reachChance: reachChanceOf(c, mods, card, tpl, pub.channel, interest),
    exposureRisk: exposureRiskOf(state, c, mods, truth, pub.channel, pub.framing, 0.25),
    credibility: hypeCredibility(state, c, pub),
    hype: hypeOf(state, pub.channel),
  };
}

/** How much the channel's shouting undermines belief in this publication (1 = not at all). */
function hypeCredibility(state: GameState, c: Content, pub: Publication): number {
  const h = hypeOf(state, pub.channel) / 100;
  const all = 1 - c.balance.hypeBeliefPenalty * h;
  return pub.framing > 0 ? all * (1 - c.balance.hypeLoudPenalty * h) : all;
}

function beliefChance(
  state: GameState,
  c: Content,
  mods: Modifiers,
  r: Resident,
  tpl: CardTemplate,
  truth: TruthLevel,
  pub: Publication,
): number {
  const b = c.balance;
  let plausibility = b.plausibility[truth] + mods.plausibilityAdd;
  if (tpl.witness && r.job !== null && state.buildings[r.job].type === tpl.witness) {
    plausibility *= b.witness[truth];
  }
  const trust = (r.trust[pub.channel] + mods.channels[pub.channel].trustBonus) / 100;
  const skepticism = groupOf(c, r.group).skepticism;
  return clamp(
    b.beliefScale * trust * plausibility * (1 - skepticism) * b.framingBelief[pub.framing] * hypeCredibility(state, c, pub),
    0,
    b.maxBelief,
  );
}

function applyEffect(
  state: GameState,
  c: Content,
  rng: RngState,
  r: Resident,
  e: CardEffect,
  /** Framing (already weakened by hype) × tier × scope × global scale. */
  mult: number,
): boolean {
  const b = c.balance;
  switch (e.type) {
    case 'moodUp':
      r.mood = clamp(r.mood + e.strength * mult);
      return true;
    case 'moodDown':
      r.mood = clamp(r.mood - e.strength * mult);
      return true;
    case 'quitJob': {
      if (r.job === null) return false;
      const job = state.buildings[r.job];
      if (job.type !== e.building || !chance(rng, e.strength * mult)) return false;
      r.job = null;
      if (!r.quitFrom.includes(job.type)) r.quitFrom.push(job.type);
      r.mood = clamp(r.mood - b.quitMoodPenalty);
      return true;
    }
    case 'avoid':
      if (!e.building || !chance(rng, e.strength * mult)) return false;
      r.avoid[e.building] = Math.max(r.avoid[e.building] ?? 0, e.duration ?? 3);
      return true;
    case 'leaveCity':
      if (!chance(rng, e.strength * mult * (1.5 - r.mood))) return false;
      leaveCity(r);
      return true;
    case 'protest':
      if (!chance(rng, e.strength * mult)) return false;
      r.protestTurns = Math.max(r.protestTurns, e.duration ?? 3);
      r.mood = clamp(r.mood - b.protestMoodPenalty);
      return true;
  }
}

const reactionPriority: Record<Reaction, number> = { doubted: 1, happy: 2, scared: 2, talk: 3, outraged: 4 };

/** Keeps the most telling reaction when several news reach the same resident in one turn. */
function setReaction(state: GameState, id: number, reaction: Reaction): void {
  const current = state.lastReactions[id];
  if (!current || reactionPriority[reaction] >= reactionPriority[current]) state.lastReactions[id] = reaction;
}

/** A publication after it went out: who saw it and who believed it. */
export interface PublishedNews {
  pub: Publication;
  truth: TruthLevel;
  viewers: number[];
  report: PublicationReport;
}

export function publish(
  state: GameState,
  c: Content,
  rng: RngState,
  mods: Modifiers,
  pub: Publication,
  repeatsThisTurn: number,
): PublishedNews {
  const b = c.balance;
  const card = state.hand.find((x) => x.uid === pub.cardUid);
  if (!card) throw new Error(`Card ${pub.cardUid} is not in hand`);
  const tpl = templateOf(c, card.templateId);
  const truth = cardTruth(card, pub.distortion);
  const title = tpl.titles[truth] ?? '';
  const effect = tpl.effects[truth];
  const interest = interestOf(state, c, mods, card, tpl, pub, repeatsThisTurn);
  const reachChance = reachChanceOf(c, mods, card, tpl, pub.channel, interest);
  const framingMul = loudBonus(b.framingEffect[pub.framing], hypeOf(state, pub.channel));
  const cardMul = effectMulOf(c, card) * framingMul;
  const audience = tpl.audience ?? [];

  const report: PublicationReport = {
    cardUid: card.uid,
    title,
    channel: pub.channel,
    truth,
    framing: pub.framing,
    reached: 0,
    believed: 0,
    doubted: 0,
    wordOfMouth: 0,
    effects: {},
    exposed: false,
  };
  const heard = new Set<number>();
  const viewers: number[] = [];
  const believers: Resident[] = [];

  const consider = (r: Resident, factor: number): boolean => {
    heard.add(r.id);
    if (!chance(rng, beliefChance(state, c, mods, r, tpl, truth, pub) * factor)) {
      setReaction(state, r.id, 'doubted');
      report.doubted++;
      return false;
    }
    setReaction(state, r.id, effect?.type === 'moodUp' ? 'happy' : 'scared');
    report.believed++;
    r.beliefs.push({ cardUid: card.uid, title, turn: state.turn });
    if (r.beliefs.length > b.maxBeliefs) r.beliefs.shift();
    if (effect) {
      const delta = effect.type === 'moodUp' ? b.hopePerBelief : -b.fearPerBelief;
      r.outlook = clamp(r.outlook + delta * cardMul);
    }
    if (effect && applyEffect(state, c, rng, r, effect, b.effectScale * cardMul)) {
      report.effects[effect.type] = (report.effects[effect.type] ?? 0) + 1;
    }
    return true;
  };

  for (const r of state.residents) {
    if (r.status !== 'active') continue;
    const affinity = groupOf(c, r.group).channels[pub.channel] ?? 0;
    const interested = audience.length === 0 ? 1 : audience.includes(r.group) ? b.audienceBoost : b.audienceOthers;
    if (!chance(rng, clamp(affinity * reachChance * interested))) continue;
    viewers.push(r.id);
    if (consider(r, 1)) believers.push(r);
  }
  report.reached = viewers.length;

  // Word of mouth: believers retell the story to someone who has not heard it yet.
  for (let i = 0; i < believers.length; i++) {
    if (!chance(rng, b.wordOfMouthChance)) continue;
    const candidate = state.residents[int(rng, state.residents.length)];
    if (candidate.status !== 'active' || heard.has(candidate.id)) continue;
    report.wordOfMouth++;
    setReaction(state, believers[i].id, 'talk');
    consider(candidate, b.wordOfMouthFactor);
  }

  return { pub, truth, viewers, report };
}

export function exposeNews(
  state: GameState,
  c: Content,
  mods: Modifiers,
  cardUid: number,
  channel: ChannelId,
  framing: Framing,
  viewers: number[],
): void {
  const b = c.balance;
  const penalty = b.trustGain * b.trustPenaltyMul;
  const viewerSet = new Set(viewers);
  for (const r of state.residents) {
    if (r.status !== 'active') continue;
    if (viewerSet.has(r.id)) {
      r.trust[channel] = clamp(r.trust[channel] - penalty, 0, 100);
      setReaction(state, r.id, 'outraged');
    } else if ((groupOf(c, r.group).channels[channel] ?? 0) > 0) {
      r.trust[channel] = clamp(r.trust[channel] - penalty * b.trustPenaltyBystanderShare, 0, 100);
    }
    r.beliefs = r.beliefs.filter((x) => x.cardUid !== cardUid);
  }
  state.exposure += b.exposurePerScandal * b.framingExposureGain[framing] * mods.exposureGainMul;
  state.scandal[channel] = b.scandalAdMul;
}

/** Fact-checkers look at this turn's news; true news builds trust, caught lies destroy it. */
export function verifyNews(state: GameState, c: Content, rng: RngState, mods: Modifiers, news: PublishedNews[]): void {
  const b = c.balance;
  const active = Math.max(1, state.residents.filter((r) => r.status === 'active').length);
  for (const n of news) {
    if (n.truth === 0) {
      for (const id of n.viewers) {
        const r = state.residents[id];
        r.trust[n.pub.channel] = clamp(r.trust[n.pub.channel] + b.trustGain, 0, 100);
      }
      continue;
    }
    const risk = exposureRiskOf(state, c, mods, n.truth, n.pub.channel, n.pub.framing, n.viewers.length / active);
    if (chance(rng, risk)) {
      n.report.exposed = true;
      exposeNews(state, c, mods, n.pub.cardUid, n.pub.channel, n.pub.framing, n.viewers);
    } else {
      state.pendingLies.push({
        cardUid: n.pub.cardUid,
        title: n.report.title,
        channel: n.pub.channel,
        framing: n.pub.framing,
        viewers: n.viewers,
        risk: risk * b.lateExposureFactor,
        turnsLeft: b.lateExposureTurns,
      });
    }
  }
}

/** Old lies can still surface. Returns titles of lies exposed this turn. */
export function processLateExposures(state: GameState, c: Content, rng: RngState, mods: Modifiers): string[] {
  const exposed: string[] = [];
  const keep = [];
  for (const lie of state.pendingLies) {
    if (chance(rng, lie.risk)) {
      exposeNews(state, c, mods, lie.cardUid, lie.channel, lie.framing, lie.viewers);
      exposed.push(lie.title);
    } else if (--lie.turnsLeft > 0) keep.push(lie);
  }
  state.pendingLies = keep;
  return exposed;
}
