import { chance, int, type RngState } from './rng';
import { leaveCity } from './city';
import { averageTrust, channelOf, clamp, factCheckStarted, groupOf, templateOf } from './lookup';
import { addTension, fillTitle, pairKey } from './relations';
import type { Modifiers } from './modifiers';
import { twistMods } from './twists';
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
  /** Conflict stories: the pair and how much its tension would move if a tenth of the pair believed. */
  tension: { pair: string; delta: number } | null;
}

/**
 * Calm framing of a conflict story is honest: it tells the truth and takes the heat out (CONCEPT.md §5.5).
 * Soothing a bad story is not: «Без паники» (−1) is a half-truth, «Всё хорошо!» (−2) a lie.
 */
export function cardTruth(card: CardInstance, distortion: number): TruthLevel {
  if (distortion < 0) return card.conflict ? 0 : (Math.min(2, -distortion) as TruthLevel);
  return Math.min(2, card.baseTruth + distortion) as TruthLevel;
}

/** What a story does to believers as it is told: the soothed effect, none for a calmed conflict, or by truth. */
export function storyEffect(c: Content, card: CardInstance, distortion: number): CardEffect | null {
  const tpl = templateOf(c, card.templateId);
  if (distortion < 0) return card.conflict ? null : tpl.softEffects?.[-distortion - 1] ?? null;
  return tpl.effects[cardTruth(card, distortion)];
}

export function maxDistortion(card: CardInstance): number {
  return 2 - card.baseTruth;
}

/** Conflict stories can be calmed one step below the truth; bad true stories soothed two steps. */
export function minDistortion(card: CardInstance): number {
  return card.conflict ? -1 : card.soft && card.baseTruth === 0 ? -2 : 0;
}

/** Soothing a bad story: «Без паники» or «Всё хорошо!» (not the honest calm framing of a conflict). */
export function isSoothed(card: CardInstance, distortion: number): boolean {
  return distortion < 0 && !card.conflict;
}

/** Each step of distortion raises the story one tier, up to a sensation (CONCEPT.md §3.1); calming lowers it. */
export function effectiveTier(card: CardInstance, distortion: number): NewsTier {
  return Math.max(0, Math.min(3, card.tier + distortion)) as NewsTier;
}

/**
 * Keeps an issue within `maxSensations` (CONCEPT.md §4.2а): a found sensation stays, then the ones
 * placed higher; the other blown-up stories are toned down until they are merely interesting.
 */
export function limitSensations(state: GameState, c: Content, publish: Publication[]): void {
  const cardOf = (p: Publication) => state.hand.find((x) => x.uid === p.cardUid)!;
  const sensations = publish
    .filter((p) => effectiveTier(cardOf(p), p.distortion) === 3)
    .sort((a, b) => cardOf(b).tier - cardOf(a).tier || b.placement - a.placement);
  for (const p of sensations.slice(c.balance.maxSensations)) {
    // Toned down to the truth at most: soothing is a choice, not a way out of the rule.
    const floor = Math.max(minDistortion(cardOf(p)), cardOf(p).conflict ? -1 : 0);
    while (p.distortion > floor && effectiveTier(cardOf(p), p.distortion) === 3) p.distortion--;
  }
}

/** The headline at this distortion, with the conflict pair's names filled in. */
export function storyTitle(c: Content, card: CardInstance, distortion: number): string {
  const tpl = templateOf(c, card.templateId);
  const truth = cardTruth(card, distortion);
  // A story told often (debunks above all) has several headlines; each card keeps one of them.
  const told = [tpl.titles[truth], ...(tpl.titleVariants?.[truth] ?? [])].filter((x): x is string => !!x);
  const raw = distortion < 0 ? (card.conflict ? tpl.calmTitle : tpl.softTitles?.[-distortion - 1]) ?? '' : told.length ? told[card.uid % told.length] : '';
  // A debunk quotes the rival's headline.
  return fillTitle(c, card.debunk ? raw.replace('{story}', card.debunk.title) : raw, card.conflict);
}

/** Framing of a conflict story as an index into tensionNews: calm, as is, heat, inflate. */
export function framingOf(card: CardInstance, distortion: number): 0 | 1 | 2 | 3 {
  return distortion < 0 ? 0 : ((cardTruth(card, distortion) + 1) as 1 | 2 | 3);
}

/** Stories that hurt the city (everything except good news). */
export function isHarmful(effect: CardEffect | null): boolean {
  return effect !== null && effect.type !== 'moodUp';
}

/**
 * Impact of a story — how strongly viewers react (CONCEPT.md §5.2а). It never changes reach.
 * 1 means a normal story; divided by impactNorm so content `interest` values stay readable.
 */
function impactOf(state: GameState, c: Content, mods: Modifiers, card: CardInstance, tpl: CardTemplate, pub: Publication, repeatsThisTurn: number): number {
  const b = c.balance;
  const streak = (state.topicStreak[tpl.topic] ?? 0) + repeatsThisTurn;
  const fatigue = Math.pow(1 - b.fatiguePerRepeat, streak);
  const scope = card.scope === 'global' ? b.globalEffectMul : 1;
  const placement = b.placementImpact[pub.placement];
  // A yellow layout makes frightening stories hit harder, a solid one softer (CONCEPT.md §3.5).
  const style = isHarmful(storyEffect(c, card, pub.distortion)) ? mods.scaryImpactMul : 1;
  return (tpl.interest * b.tierInterest[effectiveTier(card, pub.distortion)] * scope * placement * fatigue * style) / b.impactNorm;
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

/** The story's audience reacts more strongly, everyone else less; a conflict story's audience is its pair. */
function audienceMul(c: Content, tpl: CardTemplate, group: string, card?: CardInstance): number {
  const audience = card?.conflict ?? tpl.audience ?? [];
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
  // The first issues are forgiven: nobody checks a paper nobody reads yet.
  if (!factCheckStarted(state, c)) return 0;
  const defense = state.metrics.cityIndex < b.defenseCityIndex ? 1 + b.defenseCheckerBoost : 1;
  const checkersOpen = state.buildings.some((x) => x.type === 'factCheckers' && x.open);
  const base = checkersOpen ? b.checkerBase : b.checkerBase * 0.5;
  // A trusted outlet is checked less (CONCEPT.md §4.1).
  const shield = 1 - b.trustShield * clamp(averageTrust(state, c) / 100);
  // During the mayor's reconciliation the press is watched closely.
  const reconcile = state.reconciliation ? 1 + b.reconcileCheckerBoost : 1;
  return clamp(
    base *
      b.truthRisk[truth] *
      outletExposureRisk(state, c) *
      b.placementExposureRisk[placement] *
      (0.5 + reachShare) *
      mods.checkerMul *
      defense *
      reconcile *
      // The governor's visit: the press is watched closely (CONCEPT.md §4.9).
      twistMods(state, c).checkerMul *
      shield,
    0,
    0.95,
  );
}

/** A master's or a legend's stories are checked less: they know how to cover their tracks (CONCEPT.md §3.3б). */
export function reporterCheckMul(state: GameState, c: Content, card: CardInstance): number {
  const xp = state.reporters.includes(card.reporterId) ? (state.staff[card.reporterId]?.xp ?? 0) : 0;
  const level = c.balance.reporterLevels.filter((t) => xp >= t).length - 1;
  return c.balance.levelCheckMul[level] ?? 1;
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
  const impact = impactOf(state, c, mods, card, tpl, pub, repeatsThisTurn);
  return {
    title: storyTitle(c, card, pub.distortion),
    truth,
    effect: storyEffect(c, card, pub.distortion),
    impact,
    tier: effectiveTier(card, pub.distortion),
    reachChance: outletReach(state, c, pub.placement),
    exposureRisk: exposureRiskOf(state, c, mods, truth, pub.placement, 0.25) * reporterCheckMul(state, c, card),
    tension: card.conflict ? { pair: pairKey(c, ...card.conflict), delta: tensionShift(state, c, card, pub.distortion, impact, 0.1) } : null,
  };
}

/** How much a conflict story moves its pair's tension, given the share of the pair that believed it. */
function tensionShift(state: GameState, c: Content, card: CardInstance, distortion: number, impact: number, share: number): number {
  const b = c.balance;
  return b.tensionNews[state.mode][framingOf(card, distortion)] * impact * (b.tensionReachBase + share * b.tensionShareMul);
}

function beliefChance(
  state: GameState,
  c: Content,
  mods: Modifiers,
  r: Resident,
  tpl: CardTemplate,
  truth: TruthLevel,
  /** Trust in the outlet printing the story; the player's by default. */
  trustIn?: number,
): number {
  const b = c.balance;
  let plausibility = b.plausibility[truth] + mods.plausibilityAdd;
  if (tpl.witness && r.job !== null && state.buildings[r.job].type === tpl.witness) {
    plausibility *= b.witness[truth];
  }
  // People do not believe dirt about their own group.
  if (tpl.target === r.group) plausibility *= b.witness[truth];
  const trust = (trustIn ?? r.trust + mods.trustBonus) / 100;
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
    case 'debunk':
      // Handled by `publish`, which knows the story it answers.
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
      if (!chance(rng, e.strength * mult * (1.5 - r.mood) * b.leaveScale)) return false;
      leaveCity(r);
      return true;
    case 'fear':
      if (!chance(rng, e.strength * mult)) return false;
      r.fearTurns = Math.max(r.fearTurns, e.duration ?? 3);
      r.mood = clamp(r.mood - b.fearMood);
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
function setReaction(reactions: Record<number, Reaction>, id: number, reaction: Reaction): void {
  const current = reactions[id];
  if (!current || reactionPriority[reaction] >= reactionPriority[current]) reactions[id] = reaction;
}

/** A publication after it went out: who saw it and who believed it. */
export interface PublishedNews {
  pub: Publication;
  truth: TruthLevel;
  impact: number;
  viewers: number[];
  /** Viewers who did not believe it. */
  doubters: number[];
  report: PublicationReport;
}

export interface PublishOptions {
  /** Prints a story of the rival paper: its readers see it, judged by their trust in it (CONCEPT.md §8). */
  rival?: { card: CardInstance };
}

/** The story goes out on every owned channel; a resident sees it if any channel reaches them. */
export function publish(
  state: GameState,
  c: Content,
  rng: RngState,
  mods: Modifiers,
  pub: Publication,
  repeatsThisTurn: number,
  opts: PublishOptions = {},
): PublishedNews {
  const b = c.balance;
  const rival = opts.rival;
  const card = rival?.card ?? state.hand.find((x) => x.uid === pub.cardUid);
  if (!card) throw new Error(`Card ${pub.cardUid} is not in hand`);
  const tpl = templateOf(c, card.templateId);
  const truth = cardTruth(card, pub.distortion);
  const title = storyTitle(c, card, pub.distortion);
  const calm = pub.distortion < 0 && !!card.conflict;
  const soothed = isSoothed(card, pub.distortion);
  const effect = calm ? null : soothed ? tpl.softEffects?.[-pub.distortion - 1] ?? null : tpl.effects[truth];
  // The rival's stories have their own strength (`rivalImpactMul`).
  const impact = impactOf(state, c, mods, card, tpl, pub, repeatsThisTurn) * (rival ? b.rivalImpactMul[state.rival?.kind ?? 'tabloid'] : 1);
  // Interesting stories are retold more, and viral channels spread them further.
  const retell = clamp(
    b.wordOfMouthChance * (0.5 + tpl.engagement * b.tierEngagement[effectiveTier(card, pub.distortion)]) * (1 + outletVirality(state, c)) * mods.wordOfMouthMul,
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
    ...(card.building !== undefined ? { building: card.building } : {}),
  };
  // A photographer makes the front page read more (CONCEPT.md §3.5).
  const frontRead = Math.max(1, ...state.ownedChannels.map((ch) => mods.channels[ch]?.frontReadMul ?? 1));
  const heard = new Set<number>();
  const viewers: number[] = [];
  const doubters: number[] = [];
  const believers: Resident[] = [];
  const good = effect?.type === 'moodUp' || effect?.type === 'debunk';
  // Reactions to the rival's issue are kept apart: they neither hide ours nor make our readers leave.
  const reactions = rival ? state.rivalReactions : state.lastReactions;
  // A debunk brings relief from a scary story, and the fear back when it takes away a false comfort:
  // everything «Голос города» prints comforts and everything «Набат» prints scares (RIVAL_TEMPLATES).
  const takesComfort = card.templateId === 'debunk_guardian' || card.templateId === 'tabloid_debunk';
  const mood = effect?.type === 'debunk' ? (takesComfort ? 'scared' : 'happy') : good || calm ? 'happy' : 'scared';
  report.mood = mood;

  const consider = (r: Resident, factor: number): boolean => {
    heard.add(r.id);
    if (!chance(rng, beliefChance(state, c, mods, r, tpl, truth, rival ? r.rivalTrust : undefined) * factor)) {
      setReaction(reactions, r.id, 'doubted');
      report.doubted++;
      doubters.push(r.id);
      return false;
    }
    setReaction(reactions, r.id, mood);
    report.believed++;
    r.beliefs.push({ cardUid: card.uid, title, turn: state.turn });
    if (r.beliefs.length > b.maxBeliefs) r.beliefs.shift();
    // Impact, not reach, decides how hard the story hits this resident.
    const hit = impact * audienceMul(c, tpl, r.group, card);
    if (effect && effect.type !== 'debunk') {
      const delta = good ? b.hopePerBelief : -b.fearPerBelief;
      r.outlook = clamp(r.outlook + delta * hit);
    }
    // A believed debunk: the outlet it answers loses this reader's trust (the rival's when we print
    // it, ours when the rival does), and who believed the story stops believing it — the fear or the
    // false comfort it brought goes away (CONCEPT.md §8).
    if (effect?.type === 'debunk') {
      if (rival) r.trust = clamp(r.trust - b.rivalDebunkTrust * effect.strength * hit, 0, 100);
      else r.rivalTrust = clamp(r.rivalTrust - b.debunkTrust * effect.strength * hit, 0, 100);
    }
    if (effect?.type === 'debunk' && card.debunk) {
      if (r.beliefs.some((x) => x.cardUid === card.debunk!.uid)) {
        r.beliefs = r.beliefs.filter((x) => x.cardUid !== card.debunk!.uid);
        const comforted = card.debunk.effect === 'moodUp';
        r.outlook = clamp(r.outlook + (comforted ? -b.hopePerBelief : b.fearPerBelief) * hit);
        if (card.debunk.effect === 'fear') r.fearTurns = 0;
        if (card.debunk.effect === 'protest') r.protestTurns = 0;
        report.effects.debunk = (report.effects.debunk ?? 0) + 1;
      }
    }
    if (effect && applyEffect(state, c, rng, r, effect, b.effectScale * hit, tpl.target)) {
      report.effects[effect.type] = (report.effects[effect.type] ?? 0) + 1;
    }
    return true;
  };

  for (const r of state.residents) {
    if (r.status !== 'active') continue;
    const channels = rival ? [] : followedChannels(state, r);
    if ((rival ? !r.rivalReader : channels.length === 0) || !chance(rng, b.placementRead[pub.placement] * (pub.placement === 2 && !rival ? frontRead : 1))) continue;
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
    setReaction(reactions, believers[i].id, 'talk');
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
      if (chance(rng, b.stigmaLeave * pressure * impact * b.leaveScale)) {
        leaveCity(r);
        left++;
      }
    }
    report.stigma = { target: tpl.target, pressure, left };
    if (left) report.effects.leaveCity = (report.effects.leaveCity ?? 0) + left;
    // Dirt on a group sets the rest of the city against it (CONCEPT.md §5.5): like a heated conflict
    // story, the more of its other readers believed it, the harder.
    const others = viewers.filter((id) => state.residents[id].group !== tpl.target).length;
    const share = clamp(believers.filter((r) => r.group !== tpl.target).length / Math.max(1, others));
    report.tension = {};
    for (const g of c.groups) {
      if (g.id === tpl.target) continue;
      const key = pairKey(c, tpl.target, g.id);
      const delta = b.tensionStigma * impact * (b.tensionReachBase + share * b.tensionShareMul);
      addTension(state, key, delta);
      report.tension[key] = delta;
    }
  }

  // A conflict story heats or cools its pair, more so when the pair itself believed it.
  if (card.conflict) {
    const [a, z] = card.conflict;
    const key = pairKey(c, a, z);
    const members = state.residents.filter((r) => r.status === 'active' && (r.group === a || r.group === z));
    const memberIds = new Set(members.map((r) => r.id));
    const believedInPair = state.residents.filter((r) => memberIds.has(r.id) && r.beliefs.some((x) => x.cardUid === card.uid)).length;
    const delta = tensionShift(state, c, card, pub.distortion, impact, believedInPair / Math.max(1, members.length));
    addTension(state, key, delta);
    report.tension = { [key]: delta };
    // Calming earns the trust of both groups' readers.
    if (calm) for (const id of viewers) if (memberIds.has(id)) state.residents[id].trust = clamp(state.residents[id].trust + b.calmTrust, 0, 100);
  }

  return { pub, truth, impact, viewers, doubters, report };
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
  const penalty =
    b.trustGain * b.trustPenaltyMul * b.placementExposurePenalty[story.placement] * mods.exposurePenaltyMul * (story.setup ? b.setupPenaltyMul : 1);
  const viewerSet = new Set(viewers);
  for (const r of state.residents) {
    if (r.status !== 'active') continue;
    if (viewerSet.has(r.id)) {
      r.trust = clamp(r.trust - penalty, 0, 100);
      setReaction(state.lastReactions, r.id, 'outraged');
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
    const fake = !!state.hand.find((x) => x.uid === n.pub.cardUid)?.setup;
    if (n.truth === 0 && !fake) {
      // True news builds trust by its place in the paper; word of mouth carries a little of it to the rest (CONCEPT.md §5.3).
      const gain = b.trustGain * b.placementTrustGain[n.pub.placement] * mods.trustGainMul;
      const seen = new Set(n.viewers);
      for (const r of state.residents) {
        if (r.status !== 'active') continue;
        r.trust = clamp(r.trust + (seen.has(r.id) ? gain : gain * b.trustGainBystanderShare), 0, 100);
      }
      continue;
    }
    const card = state.hand.find((x) => x.uid === n.pub.cardUid)!;
    const story = {
      cardUid: card.uid,
      templateId: card.templateId,
      ...(card.conflict ? { conflict: card.conflict } : {}),
      title: n.report.title,
      // A fake kompromat is a lie, however true it was told.
      truth: fake ? 2 : n.truth,
      tier: effectiveTier(card, n.pub.distortion),
      placement: n.pub.placement,
      turn: state.turn,
      ...(fake ? { setup: true } : {}),
      ...(card.reporterId ? { reporterId: card.reporterId } : {}),
    };
    const risk = exposureRiskOf(state, c, mods, story.truth, n.pub.placement, n.viewers.length / active) * reporterCheckMul(state, c, card);
    if (chance(rng, risk)) {
      n.report.exposed = true;
      exposed.push(exposeNews(state, c, mods, story, n.viewers));
    } else if (risk > 0) {
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
    else if (--lie.turnsLeft > 0) {
      // People forget: every issue the old lie is less likely to surface (CONCEPT.md §5.3).
      lie.risk *= c.balance.lateExposureDecay;
      keep.push(lie);
    }
  }
  state.pendingLies = keep;
  return exposed;
}

/** A published story as the issue level sees it: its tier after distortion and its place in the paper. */
export interface IssueStory {
  tier: NewsTier;
  placement: Placement;
}

/**
 * Points of an issue: every published story adds points by its tier after distortion, scaled by its
 * place — a sensation hidden in the briefs counts for little (CONCEPT.md §4.2а).
 */
export function issueScore(c: Content, stories: IssueStory[]): number {
  return stories.reduce<number>((s, x) => s + c.balance.issueTierPoints[x.tier] * c.balance.issuePlacementPoints[x.placement], 0);
}

/** Level of an issue; a sensational issue needs a sensation on the front page. */
export function issueLevel(c: Content, stories: IssueStory[]): IssueLevel {
  const [ordinary, interesting, sensational] = c.balance.issueThresholds;
  const score = issueScore(c, stories);
  const level: IssueLevel = score >= sensational ? 3 : score >= interesting ? 2 : score >= ordinary ? 1 : 0;
  return level === 3 && !stories.some((x) => x.tier === 3 && x.placement === 2) ? 2 : level;
}
