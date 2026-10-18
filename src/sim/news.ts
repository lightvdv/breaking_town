import { chance, int, type RngState } from './rng';
import { leaveCity } from './city';
import { averageTrust, channelOf, clamp, groupOf, templateOf } from './lookup';
import type { Modifiers } from './modifiers';
import type {
  CardEffect,
  CardInstance,
  CardTemplate,
  ChannelId,
  Content,
  ExposedStory,
  IssueLevel,
  Placement,
  GameState,
  NewsTier,
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
  /** How strongly viewers react: tier, placement, scope, topic fatigue (1 = normal). */
  impact: number;
  /** The card's tier after distortion. */
  tier: NewsTier;
  /** Expected share of the city that notices the story: the outlet's readers × placement. */
  reachChance: number;
  /** Fact-check chance assuming the news reaches a quarter of the city. */
  exposureRisk: number;
}

export function cardTruth(card: CardInstance, distortion: number): TruthLevel {
  return Math.min(2, card.baseTruth + distortion) as TruthLevel;
}

export function maxDistortion(card: CardInstance): number {
  return 2 - card.baseTruth;
}

/** Each step of distortion raises the story one tier, up to a sensation (CONCEPT.md §3.1). */
export function effectiveTier(card: CardInstance, distortion: number): NewsTier {
  return Math.min(3, card.tier + distortion) as NewsTier;
}

/** Stories that hurt the city (everything except good news). */
export function isHarmful(effect: CardEffect | null): boolean {
  return effect !== null && effect.type !== 'moodUp';
}

/**
 * Impact of a story — how strongly viewers react (CONCEPT.md §5.2а). It never changes reach.
 * 1 means a normal story; divided by impactNorm so content `interest` values stay readable.
 */
function impactOf(state: GameState, c: Content, card: CardInstance, tpl: CardTemplate, pub: Publication, repeatsThisTurn: number): number {
  const b = c.balance;
  const streak = (state.topicStreak[tpl.topic] ?? 0) + repeatsThisTurn;
  const fatigue = Math.pow(1 - b.fatiguePerRepeat, streak);
  const scope = card.scope === 'global' ? b.globalEffectMul : 1;
  const placement = b.placementImpact[pub.placement];
  return (tpl.interest * b.tierInterest[effectiveTier(card, pub.distortion)] * scope * placement * fatigue) / b.impactNorm;
}

/** Owned channels a resident follows; only followers see the issue (CONCEPT.md §5.2). */
function followedChannels(state: GameState, r: Resident): ChannelId[] {
  return r.follows.filter((ch) => state.ownedChannels.includes(ch));
}

/** Expected share of active residents that notice a story with this placement. */
export function outletReach(state: GameState, c: Content, placement: Placement = 1): number {
  const active = state.residents.filter((r) => r.status === 'active');
  if (!active.length) return 0;
  const readers = active.filter((r) => followedChannels(state, r).length > 0).length;
  return (readers / active.length) * c.balance.placementRead[placement];
}

/** The story's audience reacts more strongly, everyone else less. */
function audienceMul(c: Content, tpl: CardTemplate, group: string): number {
  const audience = tpl.audience ?? [];
  if (audience.length === 0) return 1;
  return audience.includes(group) ? c.balance.audienceBoost : c.balance.audienceOthers;
}

/** The most viral owned channel makes stories spread by word of mouth. */
function outletVirality(state: GameState, c: Content): number {
  return Math.max(...state.ownedChannels.map((ch) => channelOf(c, ch).virality));
}

/** The riskiest owned channel sets the fact-check pressure on every story. */
function outletExposureRisk(state: GameState, c: Content): number {
  return Math.max(...state.ownedChannels.map((ch) => channelOf(c, ch).exposureRisk));
}

export function exposureRiskOf(
  state: GameState,
  c: Content,
  mods: Modifiers,
  truth: TruthLevel,
  placement: Placement,
  reachShare: number,
): number {
  const b = c.balance;
  const defense = state.metrics.cityIndex < b.defenseCityIndex ? 1 + b.defenseCheckerBoost : 1;
  const checkersOpen = state.buildings.some((x) => x.type === 'factCheckers' && x.open);
  const base = checkersOpen ? b.checkerBase : b.checkerBase * 0.5;
  // A trusted outlet is checked less (CONCEPT.md §4.1).
  const shield = 1 - b.trustShield * clamp(averageTrust(state, c) / 100);
  return clamp(
    base *
      b.truthRisk[truth] *
      outletExposureRisk(state, c) *
      b.placementExposureRisk[placement] *
      (0.5 + reachShare) *
      mods.checkerMul *
      defense *
      shield,
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
  return {
    title: tpl.titles[truth] ?? '',
    truth,
    effect: tpl.effects[truth],
    impact: impactOf(state, c, card, tpl, pub, repeatsThisTurn),
    tier: effectiveTier(card, pub.distortion),
    reachChance: outletReach(state, c, pub.placement),
    exposureRisk: exposureRiskOf(state, c, mods, truth, pub.placement, 0.25),
  };
}

function beliefChance(
  state: GameState,
  c: Content,
  mods: Modifiers,
  r: Resident,
  tpl: CardTemplate,
  truth: TruthLevel,
): number {
  const b = c.balance;
  let plausibility = b.plausibility[truth] + mods.plausibilityAdd;
  if (tpl.witness && r.job !== null && state.buildings[r.job].type === tpl.witness) {
    plausibility *= b.witness[truth];
  }
  // People do not believe dirt about their own group.
  if (tpl.target === r.group) plausibility *= b.witness[truth];
  const trust = (r.trust + mods.trustBonus) / 100;
  const skepticism = groupOf(c, r.group).skepticism;
  return clamp(b.beliefScale * trust * plausibility * (1 - skepticism), 0, b.maxBelief);
}

function applyEffect(
  state: GameState,
  c: Content,
  rng: RngState,
  r: Resident,
  e: CardEffect,
  /** Impact × audience × global effect scale. */
  mult: number,
  target?: string,
): boolean {
  const b = c.balance;
  switch (e.type) {
    case 'stigma':
      // Believers from other groups turn on the target group (CONCEPT.md §3.3а).
      if (r.group === target) return false;
      r.mood = clamp(r.mood - e.strength * mult);
      if (chance(rng, e.strength * b.stigmaProtest * mult)) {
        r.protestTurns = Math.max(r.protestTurns, e.duration ?? 2);
        r.mood = clamp(r.mood - b.protestMoodPenalty);
      }
      return true;
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
  impact: number;
  viewers: number[];
  report: PublicationReport;
}

/** The story goes out on every owned channel; a resident sees it if any channel reaches them. */
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
  const impact = impactOf(state, c, card, tpl, pub, repeatsThisTurn);
  // Interesting stories are retold more, and viral channels spread them further.
  const retell = clamp(
    b.wordOfMouthChance * (0.5 + tpl.engagement * b.tierEngagement[effectiveTier(card, pub.distortion)]) * (1 + outletVirality(state, c)),
    0,
    0.9,
  );

  const report: PublicationReport = {
    cardUid: card.uid,
    title,
    truth,
    placement: pub.placement,
    reached: 0,
    byChannel: Object.fromEntries(state.ownedChannels.map((ch) => [ch, 0])),
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
    if (!chance(rng, beliefChance(state, c, mods, r, tpl, truth) * factor)) {
      setReaction(state, r.id, 'doubted');
      report.doubted++;
      return false;
    }
    setReaction(state, r.id, effect?.type === 'moodUp' ? 'happy' : 'scared');
    report.believed++;
    r.beliefs.push({ cardUid: card.uid, title, turn: state.turn });
    if (r.beliefs.length > b.maxBeliefs) r.beliefs.shift();
    // Impact, not reach, decides how hard the story hits this resident.
    const hit = impact * audienceMul(c, tpl, r.group);
    if (effect) {
      const delta = effect.type === 'moodUp' ? b.hopePerBelief : -b.fearPerBelief;
      r.outlook = clamp(r.outlook + delta * hit);
    }
    if (effect && applyEffect(state, c, rng, r, effect, b.effectScale * hit, tpl.target)) {
      report.effects[effect.type] = (report.effects[effect.type] ?? 0) + 1;
    }
    return true;
  };

  for (const r of state.residents) {
    if (r.status !== 'active') continue;
    const channels = followedChannels(state, r);
    if (channels.length === 0 || !chance(rng, b.placementRead[pub.placement])) continue;
    for (const ch of channels) report.byChannel[ch]++;
    viewers.push(r.id);
    if (consider(r, 1)) believers.push(r);
  }
  report.reached = viewers.length;

  // Word of mouth: believers retell the story to someone who has not heard it yet.
  for (let i = 0; i < believers.length; i++) {
    if (!chance(rng, retell)) continue;
    const candidate = state.residents[int(rng, state.residents.length)];
    if (candidate.status !== 'active' || heard.has(candidate.id)) continue;
    report.wordOfMouth++;
    setReaction(state, believers[i].id, 'talk');
    consider(candidate, b.wordOfMouthFactor);
  }

  // The target group of an investigation feels hunted, readers or not (CONCEPT.md §3.3а).
  if (effect?.type === 'stigma' && tpl.target) {
    const active = state.residents.filter((r) => r.status === 'active');
    const accusers = believers.filter((r) => r.group !== tpl.target).length + report.wordOfMouth;
    const pressure = clamp(accusers / Math.max(1, active.length));
    let left = 0;
    for (const r of active) {
      if (r.group !== tpl.target) continue;
      r.outlook = clamp(r.outlook - b.stigmaOutlook * pressure * impact);
      if (chance(rng, b.stigmaLeave * pressure * impact)) {
        leaveCity(r);
        left++;
      }
    }
    report.stigma = { target: tpl.target, pressure, left };
    if (left) report.effects.leaveCity = (report.effects.leaveCity ?? 0) + left;
  }

  return { pub, truth, impact, viewers, report };
}

/** A caught story costs reputation and ad income (CONCEPT.md §4.1); returns it for the exposure popup. */
export function exposeNews(
  state: GameState,
  c: Content,
  mods: Modifiers,
  story: Omit<ExposedStory, 'trustLoss'>,
  viewers: number[],
): ExposedStory {
  const b = c.balance;
  const before = averageTrust(state, c);
  const penalty = b.trustGain * b.trustPenaltyMul * b.placementExposurePenalty[story.placement] * mods.exposurePenaltyMul;
  const viewerSet = new Set(viewers);
  for (const r of state.residents) {
    if (r.status !== 'active') continue;
    if (viewerSet.has(r.id)) {
      r.trust = clamp(r.trust - penalty, 0, 100);
      setReaction(state, r.id, 'outraged');
    } else r.trust = clamp(r.trust - penalty * b.trustPenaltyBystanderShare, 0, 100);
    r.beliefs = r.beliefs.filter((x) => x.cardUid !== story.cardUid);
  }
  state.scandal = b.scandalAdMul;
  return { ...story, trustLoss: before - averageTrust(state, c) };
}

/** Fact-checkers look at this turn's news; true news builds trust, caught lies destroy it. */
export function verifyNews(state: GameState, c: Content, rng: RngState, mods: Modifiers, news: PublishedNews[]): ExposedStory[] {
  const b = c.balance;
  const active = Math.max(1, state.residents.filter((r) => r.status === 'active').length);
  const exposed: ExposedStory[] = [];
  for (const n of news) {
    if (n.truth === 0) {
      for (const id of n.viewers) state.residents[id].trust = clamp(state.residents[id].trust + b.trustGain, 0, 100);
      continue;
    }
    const card = state.hand.find((x) => x.uid === n.pub.cardUid)!;
    const story = {
      cardUid: card.uid,
      templateId: card.templateId,
      title: n.report.title,
      truth: n.truth,
      tier: effectiveTier(card, n.pub.distortion),
      placement: n.pub.placement,
      turn: state.turn,
    };
    const risk = exposureRiskOf(state, c, mods, n.truth, n.pub.placement, n.viewers.length / active);
    if (chance(rng, risk)) {
      n.report.exposed = true;
      exposed.push(exposeNews(state, c, mods, story, n.viewers));
    } else {
      state.pendingLies.push({ story, viewers: n.viewers, risk: risk * b.lateExposureFactor, turnsLeft: b.lateExposureTurns });
    }
  }
  return exposed;
}

/** Old lies can still surface. Returns the lies exposed this turn. */
export function processLateExposures(state: GameState, c: Content, rng: RngState, mods: Modifiers): ExposedStory[] {
  const exposed: ExposedStory[] = [];
  const keep = [];
  for (const lie of state.pendingLies) {
    if (chance(rng, lie.risk)) exposed.push(exposeNews(state, c, mods, lie.story, lie.viewers));
    else if (--lie.turnsLeft > 0) keep.push(lie);
  }
  state.pendingLies = keep;
  return exposed;
}

/** Points of an issue: every published story adds points by its tier after distortion (CONCEPT.md §4.2а). */
export function issueScore(c: Content, tiers: NewsTier[]): number {
  return tiers.reduce<number>((s, t) => s + c.balance.issueTierPoints[t], 0);
}

export function issueLevel(c: Content, score: number): IssueLevel {
  const [ordinary, interesting, sensational] = c.balance.issueThresholds;
  return score >= sensational ? 3 : score >= interesting ? 2 : score >= ordinary ? 1 : 0;
}
