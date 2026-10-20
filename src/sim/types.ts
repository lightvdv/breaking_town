import type { RngState } from './rng';

// ---------- Content (loaded from src/content/*.json) ----------

export type ChannelId = string;
export type GroupId = string;
/** Wealth class for buying the paper: with a job, on a pension, or without income. */
export type WealthClass = 'working' | 'pensioner' | 'jobless';
export type BuildingType =
  | 'home'
  | 'factory'
  | 'shop'
  | 'entertainment'
  | 'hospital'
  | 'cityHall'
  | 'factCheckers';
export type Topic = 'factory' | 'food' | 'fun' | 'health' | 'power' | 'crime';
/** 0 = правда, 1 = полуправда, 2 = ложь */
export type TruthLevel = 0 | 1 | 2;
/** Where a story stands in the issue: 0 = заметка, 1 = статья, 2 = первая полоса (CONCEPT.md §4.2). */
export type Placement = 0 | 1 | 2;
export type Triple<T> = [T, T, T];
/** 0 = скучная, 1 = обычная, 2 = интересная, 3 = сенсация */
export type NewsTier = 0 | 1 | 2 | 3;
export type Quad<T> = [T, T, T, T];
export type NewsScope = 'local' | 'global';

export interface ReporterDef {
  id: string;
  name: string;
  bio: string;
  /** How often the HR agency offers this reporter (higher = more often; 0 = never, e.g. the start reporter). */
  weight: number;
  /** Paid once when hired from the agency's offer, on top of the agency fee. */
  hireCost: number;
  /** Paid every turn while hired. */
  salary: number;
  /** For Russian verb forms in the UI: «уволилась» / «уволился». */
  female?: boolean;
  /** 0..1: how much printing their stories as lies hurts their loyalty (CONCEPT.md §3.3б). */
  honesty: number;
  /** A personal story: bad news on this topic hurts them (e.g. a son at the factory). */
  tie?: { topic: Topic; text: string };
  skills: {
    /** Chance to find a story each turn. */
    luck: number;
    /** 0..3, shifts the odds towards higher tiers. */
    nose: number;
    scope: NewsScope | 'any';
    topics: Topic[];
  };
  /** Appearance for the placeholder portrait generator (palette color names). */
  portrait: Record<string, string>;
}

export interface GroupDef {
  id: GroupId;
  name: string;
  share: number;
  skepticism: number;
  /** How much the group consumes each channel, 0..1. */
  channels: Record<ChannelId, number>;
  /** Building types the group works in, in order of preference. Empty = never works. */
  jobs: BuildingType[];
  /** Daily income for groups that never work. */
  pension: number;
  color: string;
  /** Word forms for conflict story titles ({a.one}, {b.manyGen}…). */
  forms: GroupForms;
}

export interface GroupForms {
  /** «рабочий» */
  one: string;
  /** «рабочего» */
  oneAcc: string;
  /** «рабочему» */
  oneDat: string;
  /** «рабочим» */
  oneIns: string;
  /** «рабочие» */
  many: string;
  /** «рабочих» */
  manyGen: string;
  /** «рабочим» */
  manyDat: string;
  /** «рабочими» */
  manyIns: string;
}

export interface Requirement {
  channel?: ChannelId;
  upgrade?: string;
}

export interface ChannelDef {
  id: ChannelId;
  name: string;
  description: string;
  cost: number;
  upkeep: number;
  baseReach: number;
  virality: number;
  adRate: number;
  /** The highest value among owned channels scales the fact-check risk of every story. */
  exposureRisk: number;
  requires: Requirement | null;
}

export interface UpgradeEffects {
  /** reachAdd and reachMul apply to this channel only. */
  channel?: ChannelId;
  reachAdd?: number;
  reachMul?: number;
  /** Added to every resident's trust in the outlet. */
  trustBonus?: number;
  /** Added to every reporter's luck. */
  reporterLuck?: number;
  /** Multiplies the reputation lost when a story is exposed. */
  exposurePenaltyMul?: number;
  checkerMul?: number;
  plausibilityAdd?: number;
  /** For `channel`: added to sales per reader. */
  adRateAdd?: number;
  /** For `channel`: added to the upkeep per turn (negative = cheaper). */
  upkeepAdd?: number;
  /** For `channel`: added to the channel affinity of these groups. */
  groupReach?: Partial<Record<GroupId, number>>;
  /** Multiplies the chance that a reader stops buying. */
  churnMul?: number;
}

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  requires: Requirement | null;
  effects: UpgradeEffects;
  /** Upgrades of one series (e.g. kiosks) are bought one after another and shown as one line. */
  series?: string;
  /** Heading of the upgrades window this upgrade is listed under. */
  section?: string;
}

/** stigma = dirt on the template's `target` group: other groups turn on it, it feels hunted. */
/** fear = afraid of crime: stays at home for a few days and counts against order (CONCEPT.md §2.3). */
/** debunk = believers stop trusting the rival paper and will not believe the story it answers. */
export type EffectType = 'quitJob' | 'avoid' | 'leaveCity' | 'protest' | 'moodDown' | 'moodUp' | 'stigma' | 'fear' | 'debunk';

export interface CardEffect {
  type: EffectType;
  building?: BuildingType;
  /** Chance per believer for quitJob/avoid/leaveCity/protest; mood delta for moodUp/moodDown. */
  strength: number;
  duration?: number;
}

export interface CityEffect {
  type: 'mood' | 'money' | 'layoff';
  building?: BuildingType;
  amount: number;
}

export interface CardTemplate {
  id: string;
  /**
   * event = real event that happens in the city (true card, may change the city),
   * fact = true everyday story that needs no event, rumor = made-up or exaggerated story,
   * investigation = dirt on a social group, only from assigned reporters (CONCEPT.md §3.3а).
   */
  /** debunk = our answer to a story of the rival paper (save mode, CONCEPT.md §8); never found by search. */
  /** offer = the dirt an anonymous source sends with an offer (CONCEPT.md §3.5а); never found by search. */
  source: 'event' | 'fact' | 'rumor' | 'investigation' | 'debunk' | 'offer';
  /** Investigations: the social group the dirt is about. */
  target?: GroupId;
  /** local = about this city (default), global = about the country or the world. */
  scope?: NewsScope;
  /** Groups this story interests; they read it more often. Empty or missing = everyone alike. */
  audience?: GroupId[];
  topic: Topic;
  /** Title per truth level; null where that level is impossible (below baseTruth). */
  titles: Triple<string | null>;
  effects: Triple<CardEffect | null>;
  interest: number;
  /**
   * Lowest and highest tier a reporter can find this story at, so the headline fits its level: a new
   * bus schedule is never a sensation (CONCEPT.md §3.1). Distortion can still raise it above.
   */
  tiers?: [NewsTier, NewsTier];
  engagement: number;
  weight: number;
  baseTruth: TruthLevel;
  /** Residents working in this building type saw the truth themselves. */
  witness?: BuildingType;
  /** Card only appears while a building of this type is open. */
  requires?: BuildingType;
  /** What the real event does to the city (events only). */
  cityEffect?: CityEffect;
  /**
   * Conflict story between two groups (CONCEPT.md §5.5): a fixed pair or 'any' (the pair is chosen
   * when the story appears). Titles may use the pair's word forms: {a.one}, {b.manyGen}…
   * Conflict events are incidents: they only happen when the pair's tension is high enough.
   */
  conflict?: [GroupId, GroupId] | 'any';
  /** Conflict stories: the calming title, one step below the truth. */
  calmTitle?: string;
  /**
   * Bad true stories: the soothing headlines «Без паники» (half-truth) and «Всё хорошо!» (lie), with
   * their effects — distortion −1 and −2 (CONCEPT.md §3.1).
   */
  softTitles?: [string, string];
  softEffects?: [CardEffect | null, CardEffect | null];
  /** Incidents: the kind of building where it happens (the city cutscene flies there). */
  place?: BuildingType;
  /** Story arcs (CONCEPT.md §3.1а): the arc this template is a stage of; never found by ordinary search. */
  arc?: string;
  arcStage?: 1 | 2 | 3 | 'bad' | 'good';
}

/**
 * Offers with a catch (CONCEPT.md §3.5а): silence = paid not to write bad news about one place,
 * subsidy = paid daily for no bad news on a topic, kompromat = a sensation that may be a setup.
 */
export type OfferKind = 'silence' | 'subsidy' | 'kompromat' | 'poach';

export interface OfferDef {
  id: string;
  kind: OfferKind;
  /** Offered only in this mode; any mode when missing. */
  mode?: GameMode;
  /** Needs an open building of this type (silence: the place the deal is about). */
  requires?: BuildingType;
  title: string;
  /** {place}, {amount} and {days} are filled in. */
  text: string;
  /** What can go wrong, shown with the offer. */
  catch: string;
  /** silence: paid at once; subsidy: paid every day. */
  amount?: number;
  days?: number;
  /** silence: money to pay back and reputation lost when the deal is broken. */
  penalty?: number;
  trustPenalty?: number;
  /** subsidy: reputation every reader loses each day of the deal; the topic it keeps us quiet about. */
  trustDrain?: number;
  topic?: Topic;
  /** kompromat: the card it brings and the chance the dirt is fake. */
  template?: string;
  setupChance?: number;
}

/** An offer on the table this turn; it lapses (declined) when the turn ends. */
export interface Offer {
  id: string;
  /** silence: the building the deal is about. */
  building?: number;
  /** poach: the reporter the rival lures away. */
  reporterId?: string;
}

/** A hired reporter's own record (CONCEPT.md §3.3б): experience from printed stories and loyalty 0..1. */
export interface StaffState {
  xp: number;
  loyalty: number;
}

/** An accepted deal that lasts until `untilTurn`. */
export interface Deal {
  id: string;
  building?: number;
  untilTurn: number;
}

/** A named resident whose fate the player can follow (CONCEPT.md §2.2а). */
export interface PersonDef {
  id: string;
  name: string;
  /** «бармен», «пенсионерка»: the signature under a letter. */
  role: string;
  group: GroupId;
  /** Works in a building of this type when the game starts, if one has room. */
  job?: BuildingType;
  female?: boolean;
  bio: string;
  /** Chance to write to the paper after reading an issue. */
  letterChance: number;
  portrait: Record<string, string>;
}

export type LetterKind = 'scared' | 'happy' | 'doubted' | 'outraged' | 'lostJob' | 'left' | 'protest' | 'price';

/** Letter templates by kind ({title}, {женская|мужская} forms) and signatures of anonymous readers. */
export type LetterTemplates = Record<LetterKind, string[]> & { anonymous: string[] };

/** A letter in «Письма читателей»: from a named resident (`from`) or an anonymous reader. */
export interface Letter {
  from: string | null;
  name: string;
  kind: LetterKind;
  text: string;
}

/** Something that happened to a named resident. */
export interface FateEvent {
  person: string;
  turn: number;
  kind: 'lostJob' | 'gotJob' | 'left' | 'protest' | 'fear';
  /** lostJob: the building they worked in. */
  building?: number;
}

/** A multi-day story (CONCEPT.md §3.1а): three stages on three days, then one of two endings. */
export interface ArcDef {
  id: string;
  name: string;
  /** Starts only while a building of this type is open. */
  requires?: BuildingType;
  stages: string[];
  bad: string;
  good: string;
}

export interface BuildingDef {
  type: BuildingType;
  name: string;
  /** Own names of the buildings of this type, e.g. «Якорь» for bars, so news and notes can tell them apart. */
  names?: string[];
  count: number;
  jobs: number;
  /** Footprint on the isometric map in tiles: 1 = 1×1, 2 = 2×2. */
  size: 1 | 2;
  color: string;
}

export interface Balance {
  population: number;
  maxPopulation: number;
  turnLimit: number;
  winCityIndex: number;
  startMoney: number;

  maxReporters: number;
  /** HR agency (CONCEPT.md §3.3): the fee for one search and how many candidates it offers at most. */
  agencyFee: number;
  agencyMaxOffer: number;
  /** Price of one issue at each level the player can choose: free, cheap, middle, dear (CONCEPT.md §5.4). */
  prices: number[];
  startPrice: number;
  /** How willing each wealth class is to buy at each price level (0 = cannot afford). */
  priceBuy: Record<WealthClass, number[]>;
  /** Per-turn chance that a reader who finds the price too high stops buying, × (1 − willingness). */
  priceChurn: number;
  /** Multiplies every chance to leave the city: people mostly stay, jobless and afraid. */
  leaveScale: number;
  /** How much a jobless resident adds to the crime that lowers order. */
  joblessCrime: number;
  /** Mood lost by a resident who gets scared of crime. */
  fearMood: number;
  /** Chance a scared resident skips the shop that day (bars are skipped always). */
  fearShopSkip: number;
  /** Save mode (CONCEPT.md §8): the city falls when its index drops below this. */
  saveLoseIndex: number;
  /**
   * What the player sees instead of the city index (CONCEPT.md §2.3): stages from the best down,
   * each from its `min` index; `winCityIndex` and `saveLoseIndex` must be one of these bounds.
   */
  cityStates: { name: string; min: number }[];
  /** Rival paper: share of the city reading it at the start, its readers' starting trust, per-group appeal. */
  rivalStartShare: number;
  rivalStartTrust: number;
  rivalAffinity: Record<RivalKind, Record<GroupId, number>>;
  /** Per-turn chances: a non-reader starts buying it (× trust × appeal), a reader drops it, more after doubting it. */
  rivalJoin: number;
  rivalChurn: number;
  rivalChurnDoubt: number;
  /** It prints 1..rivalStoriesMax stories a day. */
  rivalStoriesMax: number;
  /** The same for the guardian of the destroy mode. */
  guardianStoriesMax: number;
  /** At most this many of its daily stories are debunks of ours. */
  rivalCountersMax: number;
  /** Fact-check chance of its half-truths and lies, and the trust its readers lose when one is caught. */
  rivalExposure: number;
  rivalExposurePenalty: number;
  /** Trust a true rival story earns from its viewers. */
  rivalTrustGain: number;
  /** It closes when fewer than this share of the city read it or its readers' trust falls below rivalTrustCollapse. */
  rivalCloseShare: number;
  rivalTrustCollapse: number;
  /** A believed debunk: the rival trust lost (× impact × the debunk's strength). */
  debunkTrust: number;
  /** Story arcs (CONCEPT.md §3.1а): daily start chance, how many run at once, the first turn one may start. */
  arcChance: number;
  arcsMax: number;
  arcStartTurn: number;
  /** Pressure a published stage adds per distortion step, by placement (brief, article, front page). */
  arcPlacementWeight: number[];
  /** Mood below `arcMoodPivot` pushes the ending to the bad side by `arcMoodBias` per unit. */
  arcMoodBias: number;
  arcMoodPivot: number;
  /** Offers (CONCEPT.md §3.5а): daily chance, the first turn and the quiet days after each one. */
  offerChance: number;
  offerStartTurn: number;
  offerCooldown: number;
  /** «Письма читателей» (CONCEPT.md §2.2а): letters a day at most, chance of an anonymous one, fate events kept. */
  lettersMax: number;
  anonymousLetterChance: number;
  fatesKept: number;
  /** Reporters with character (CONCEPT.md §3.3б): xp needed for each level and what a level adds. */
  reporterLevels: number[];
  levelLuck: number;
  levelNose: number;
  /** xp for a printed story by placement (brief, article, front page). */
  xpPerPlacement: number[];
  startLoyalty: number;
  /** Loyalty lost per step of lying × honesty; gained for a story printed as true; lost for bad news on their tie. */
  lieLoyalty: number;
  truthLoyalty: number;
  tieLoyalty: number;
  loyaltyRecovery: number;
  /** Below this loyalty a reporter quits; with `leakChance` they tell the rival about our lies. */
  quitLoyalty: number;
  leakChance: number;
  /** The rival lures a reporter of level ≥ 1: daily chance × (1.5 − loyalty), from `poachStartTurn`; keeping them costs salary × `poachRetain`. */
  poachChance: number;
  poachStartTurn: number;
  poachRetain: number;
  /** A reporter who went over to the rival: its readers trust it this much more. */
  poachRivalTrust: number;
  /** A fake kompromat caught by the fact-checkers costs this many times the usual reputation. */
  setupPenaltyMul: number;
  /** Chance the rival takes up a stage of a running arc on top of its own stories. */
  rivalArcChance: number;
  /** The same for the rival's debunks of our stories: the reputation we lose. */
  rivalDebunkTrust: number;
  /** A story of the rival can be debunked this many days after it came out. */
  debunkWindow: number;
  /** Chance a reporter who does not watch the rival stumbles on a debunk instead of a story. */
  debunkFindChance: number;
  /** Most stories of sensation tier in a day's finds and in one issue. */
  maxSensations: number;
  startReporters: string[];
  /** Stories guaranteed per turn even if every reporter fails. */
  minFinds: number;
  tierWeights: Quad<number>;
  /** Impact (how strongly viewers react) by tier. Tiers never change reach. */
  tierInterest: Quad<number>;
  /** Word-of-mouth multiplier by tier. */
  tierEngagement: Quad<number>;
  /** Per point of nose, weight of tier i is multiplied by (1 + nose · bonus · i). */
  noseTierBonus: number;
  /** Chance a local/global reporter brings news of his own scope. */
  scopeFocus: number;
  /** Chance a reporter with topics brings news on one of them. */
  topicFocus: number;
  /** Chance a reporter sent after topics brings news on one of them. */
  assignFocus: number;
  /** Luck bonus when every assigned topic is among the reporter's specialties. */
  specialtyLuck: number;
  /** Chance a reporter brings a true story (event or fact) rather than a rumor (CONCEPT.md §3.3). */
  trueNewsShare: number;
  /** A story template does not come back for this many turns after it was found or happened. */
  repeatCooldown: number;
  /** Impact multiplier for global news. */
  globalEffectMul: number;
  /** Initial trust of residents in the outlet (± noise). */
  startTrust: number;
  /** Acquisition multiplier at trust 0; it grows linearly to 1 at trust 100. */
  reachTrustMin: number;
  /** Share of the potential audience that already follows the starting channels. */
  startFollowShare: number;
  /** Scales how fast non-followers start following a channel each turn. */
  acquisitionRate: number;
  /** Churn chances after an issue (see CONCEPT.md §5.2). */
  churnDoubt: number;
  churnEmpty: number;
  churnExposed: number;
  /**
   * Issue level (CONCEPT.md §4.2а): each published story adds points by its tier, scaled by its
   * placement (brief, article, front page); the sum against the thresholds gives boring / ordinary /
   * interesting / sensational.
   */
  issueTierPoints: [number, number, number, number];
  issuePlacementPoints: [number, number, number];
  issueThresholds: [number, number, number];
  /** By issue level: churn of readers the issue did not touch, and the acquisition multiplier. */
  issueChurn: [number, number, number, number];
  /** By issue level: churn of readers who believed something (a boring issue bores even them). */
  issueChurnBelievers: [number, number, number, number];
  issueAcquisition: [number, number, number, number];
  /** Impact that counts as ×1 effect strength. */
  impactNorm: number;
  /** City blocks per side; each block is a 2×2 lot surrounded by roads. */
  mapBlocks: number;
  /** How many 1×1 buildings share one lot; the rest of the lot is greenery. */
  smallPerLot: number;

  wage: number;
  benefit: number;
  shopPrice: number;
  funPrice: number;
  funChance: number;
  moodBaseline: number;
  moodRegression: number;
  /** Outlook lost per believed harmful story / gained per believed good story. */
  fearPerBelief: number;
  hopePerBelief: number;
  moodUnemployed: number;
  moodShop: number;
  moodNoShop: number;
  moodFun: number;
  despairMood: number;
  despairLeaveChance: number;
  quitMoodPenalty: number;
  protestMoodPenalty: number;
  rehireChance: number;
  factoryCloseShare: number;
  layoffTurnoverShare: number;
  growthCityIndex: number;
  growthPerTurn: number;

  defenseCityIndex: number;
  defenseCheckerBoost: number;
  defenseDebunkChance: number;
  defenseRehireBonus: number;

  /** By placement (brief, article, front page): impact, share of readers who notice, fact-check risk, reputation loss when exposed. */
  placementImpact: Triple<number>;
  placementRead: Triple<number>;
  placementExposureRisk: Triple<number>;
  placementExposurePenalty: Triple<number>;
  /** Room on the front page and for articles; briefs are unlimited. */
  frontPageSlots: number;
  articleSlots: number;
  /** Global multiplier on card effect strength. */
  effectScale: number;

  /** Investigations (CONCEPT.md §3.3а). */
  investigationTurns: number;
  /** Reporters with at least this nose finish one turn faster. */
  investigationFastNose: number;
  investigationSensationBase: number;
  investigationSensationPerNose: number;
  /** Chance the dirt is true rather than half-true. */
  investigationTruthBase: number;
  investigationTruthPerNose: number;
  /** Stigma: protest chance factor for believers from other groups. */
  stigmaProtest: number;
  /** Stigma on the target group, scaled by the share of the city that believed. */
  stigmaOutlook: number;
  stigmaLeave: number;
  /** Money per turn for each running investigation. */
  investigationCost: number;

  /** Group relations (CONCEPT.md §5.5). Start tension by pair key "a|b" (content group order); others get tensionDefault. */
  tensionStart: Record<string, number>;
  tensionDefault: number;
  /** Friction, enmity, clashes. */
  tensionLevels: Triple<number>;
  /** Share of the gap to the start value tension closes each turn. */
  tensionDecay: number;
  /** Tension shift of a conflict story by framing: calm, as is (true), heat (half-true), inflate (lie). */
  tensionNews: Quad<number>;
  /** Shift × impact × (tensionReachBase + share of the pair that believed × tensionShareMul). */
  tensionReachBase: number;
  tensionShareMul: number;
  /** Investigations: tension between the target and every other group, × pressure × impact. */
  tensionStigma: number;
  /** Incidents: chance per tense pair per day at full tension, how many a day at most, what they add. */
  incidentChance: number;
  incidentsMax: number;
  tensionIncident: number;
  incidentMood: number;
  /** Enmity: daily mood loss (doubled in clashes) and chance to avoid bars; clashes: daily protest chance. */
  enmityMood: number;
  enmityAvoid: number;
  clashProtest: number;
  /** Mayor's reconciliation: starts at this tension, cools the pair daily for some turns, then waits. */
  reconcileThreshold: number;
  reconcileDrop: number;
  reconcileTurns: number;
  reconcileCooldown: number;
  /** While it runs, fact-checkers look harder. */
  reconcileCheckerBoost: number;
  /** Reputation gained with the pair's viewers by a calming story. */
  calmTrust: number;
  /** A cutscene shows protests and departures only when at least this many people took part. */
  highlightProtestMin: number;
  highlightLeaveMin: number;
  plausibility: Triple<number>;
  witness: Triple<number>;
  beliefScale: number;
  maxBelief: number;
  wordOfMouthChance: number;
  wordOfMouthFactor: number;
  /** Impact multiplier for the story's audience and for everyone else. */
  audienceBoost: number;
  audienceOthers: number;
  fatiguePerRepeat: number;

  trustGain: number;
  trustPenaltyMul: number;
  trustPenaltyBystanderShare: number;
  checkerBase: number;
  truthRisk: Triple<number>;
  /** Old lies can surface later: first-turn risk = risk × factor, then × decay each turn, for `lateExposureTurns` issues. */
  lateExposureFactor: number;
  lateExposureDecay: number;
  lateExposureTurns: number;
  /** Fact-check risk × (1 − trustShield × reputation / 100): a trusted outlet is checked less. */
  trustShield: number;
  scandalAdMul: number;
  scandalRecovery: number;
  brokeTurnsLimit: number;
  /** The game is lost when the average reputation falls below this. */
  trustCollapse: number;

  eventsMin: number;
  eventsMax: number;
  maxBeliefs: number;
  cityIndexWeights: {
    population: number;
    employment: number;
    economy: number;
    mood: number;
    order: number;
  };
}

export interface Content {
  groups: GroupDef[];
  channels: ChannelDef[];
  upgrades: UpgradeDef[];
  cards: CardTemplate[];
  buildings: BuildingDef[];
  reporters: ReporterDef[];
  arcs: ArcDef[];
  offers: OfferDef[];
  people: PersonDef[];
  difficulties: DifficultyDef[];
  letters: LetterTemplates;
  balance: Balance;
}

// ---------- Game state (must stay JSON-serializable) ----------

export interface Belief {
  cardUid: number;
  title: string;
  turn: number;
}

export interface Resident {
  id: number;
  group: GroupId;
  home: number;
  /** Building id (= index in GameState.buildings) or null if unemployed. */
  job: number | null;
  money: number;
  mood: number;
  /** Long-term attitude to the city; mood drifts towards it. Bad news people believe lowers it. */
  outlook: number;
  status: 'active' | 'left';
  /** Trust in the player's outlet, 0..100. */
  trust: number;
  /** Owned channels this resident regularly buys / follows (CONCEPT.md §5.2). */
  follows: ChannelId[];
  beliefs: Belief[];
  protestTurns: number;
  /** Days the resident is still afraid of crime and stays at home. */
  fearTurns: number;
  /** Save mode: buys the rival paper, and how much they trust it (0..100). */
  rivalReader: boolean;
  rivalTrust: number;
  /** Building types the resident avoids, with turns remaining. */
  avoid: Partial<Record<BuildingType, number>>;
  /** Building types the resident quit and won't return to. */
  quitFrom: BuildingType[];
}

export interface Building {
  id: number;
  type: BuildingType;
  /** Top tile of the footprint on the isometric map. */
  x: number;
  y: number;
  size: 1 | 2;
  jobs: number;
  open: boolean;
  turnover: number;
}

export interface CardInstance {
  uid: number;
  templateId: string;
  baseTruth: TruthLevel;
  createdTurn: number;
  tier: NewsTier;
  scope: NewsScope;
  /** Who found the story. */
  reporterId: string;
  /** Conflict stories: the two groups it is about (CONCEPT.md §5.5). */
  conflict?: [GroupId, GroupId];
  /** The open building of the template's `requires` type the story is about. */
  building?: number;
  /** Its template has soothing headlines: it can be told «Без паники» or «Всё хорошо!». */
  soft?: boolean;
  /** Kompromat from an anonymous source that is fake: told as true, it is a lie for the fact-checkers. Hidden. */
  setup?: boolean;
  /** Debunks: the rival's printed story it answers (uid in `RivalState.printed`), its headline and effect. */
  debunk?: { uid: number; title: string; effect: EffectType | null };
}

/** A running story arc: `stage` stages have happened; `pressure` > 0 leans to the bad ending. */
export interface ArcState {
  id: string;
  stage: number;
  pressure: number;
  startTurn: number;
}

/** A story the rival paper prints in its issue (it comes out the same day as ours). */
export interface RivalStory {
  card: CardInstance;
  placement: Placement;
  distortion: number;
}

/** A story the rival already printed: it can be debunked for `debunkWindow` days. */
export interface PrintedStory {
  uid: number;
  templateId: string;
  title: string;
  truth: TruthLevel;
  placement: Placement;
  /** The turn of the issue it came out in. */
  turn: number;
  effect: EffectType | null;
  debunked: boolean;
  /** Caught by the fact-checkers: nobody believes it any more, there is nothing left to debunk. */
  exposed?: boolean;
  /** Told «Без паники» / «Всё хорошо!»: a lie that calms. */
  soothed?: boolean;
}

/** tabloid = «Вечерний Набат», scares the town (save mode); guardian = «Голос города», defends it (destroy mode). */
export type RivalKind = 'tabloid' | 'guardian';

/** The rival paper of either mode (CONCEPT.md §8). */
export interface RivalState {
  kind: RivalKind;
  /** Its issue being written; it comes out with ours and nobody sees it before. */
  plan: RivalStory[];
  /** What it printed in the last `debunkWindow` days, newest first. */
  printed: PrintedStory[];
  closed: boolean;
  /** Its stories our debunks answered, over the game. */
  debunked: number;
}

/** An incident between two groups that happened today (it becomes a true story). */
export interface Incident {
  templateId: string;
  pair: [GroupId, GroupId];
  /** Where it happened, if such a building is open. */
  building: number | null;
  title: string;
}

/** The mayor's reconciliation of the tensest pair (CONCEPT.md §5.5). */
export interface Reconciliation {
  pair: string;
  turnsLeft: number;
  startedTurn: number;
}

/** A bright moment of the city day, shown as a short cutscene before the issue (CONCEPT.md §7.3). */
export interface Highlight {
  kind: 'fight' | 'clash' | 'protest' | 'exodus' | 'closed' | 'reconcile';
  title: string;
  /** Building the camera flies to; null = the whole city. */
  building: number | null;
  /** Groups involved (fights, clashes, reconciliation). */
  groups: GroupId[];
}

/** One reporter's search result this turn (drives the start-of-turn animation). */
export interface Find {
  reporterId: string;
  cardUid: number | null;
  tier: NewsTier | null;
  /** True when the story was given by the minimum-finds rule after everyone failed. */
  forced: boolean;
  /** search = ordinary search; investigating = still digging; investigation = brought the dirt. */
  kind: 'search' | 'investigating' | 'investigation';
}

/** A reporter digging for dirt on a social group (CONCEPT.md §3.3а). */
export interface Investigation {
  reporterId: string;
  target: GroupId;
  turnsLeft: number;
  total: number;
}

/** A story goes out on every owned channel at once (CONCEPT.md §3.2). */
export interface Publication {
  cardUid: number;
  /** Front page and articles have limited room (`placementSlots`); briefs do not. */
  placement: Placement;
  /** Added to the card's baseTruth to get the published truth level; −1 = calm framing of a conflict story. */
  distortion: number;
}

export interface Decision {
  /** Cards not published are discarded at the end of the turn. */
  publish: Publication[];
}

/** A published story as the exposure popup shows it (CONCEPT.md §7.3). */
export interface ExposedStory {
  cardUid: number;
  templateId: string;
  title: string;
  truth: TruthLevel;
  tier: NewsTier;
  placement: Placement;
  /** Turn of the issue it was published in. */
  turn: number;
  /** Average reputation lost because of it. */
  trustLoss: number;
  /** Conflict stories: the pair it was about (picks the matching illustration). */
  conflict?: [GroupId, GroupId];
  /** The anonymous kompromat was a fake. */
  setup?: boolean;
  /** Who wrote it (a reporter who quits may leak our lies). */
  reporterId?: string;
  /** Leaked to the rival by a reporter who quit. */
  leaked?: boolean;
}

export interface PendingLie {
  story: Omit<ExposedStory, 'trustLoss'>;
  viewers: number[];
  risk: number;
  turnsLeft: number;
}

export interface CityMetrics {
  population: number;
  employment: number;
  economy: number;
  mood: number;
  order: number;
  cityIndex: number;
  activeResidents: number;
}

/** Reaction to this turn's news, shown as an animation above the resident (CONCEPT.md §7.2). */
export type Reaction = 'scared' | 'happy' | 'doubted' | 'talk' | 'outraged';

/** destroy = ruin the town for the holding; save = defend it from the holding's rival paper (CONCEPT.md §8). */
export type GameMode = 'destroy' | 'save';

/** Difficulty levels (CONCEPT.md §4.6): each overrides some balance numbers. */
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface DifficultyDef {
  id: Difficulty;
  name: string;
  text: string;
  balance: Partial<Balance>;
  /** Overrides for one mode only, e.g. the turn limit (more days help the defender, hurt the destroyer). */
  modes: Partial<Record<GameMode, Partial<Balance>>>;
}

export interface Outcome {
  result: 'win' | 'lose';
  /** citySaved / rivalClosed / cityFallen belong to the save mode. */
  reason: 'cityDestroyed' | 'bankrupt' | 'trustCollapse' | 'turnLimit' | 'citySaved' | 'rivalClosed' | 'cityFallen';
}

export interface GameState {
  version: 1;
  seed: number;
  rng: RngState;
  turn: number;
  mode: GameMode;
  /** Save mode only: the rival paper. */
  rival: RivalState | null;
  /** Reporters sent to watch the rival paper; they mostly bring debunks of its lies. */
  rivalWatch: string[];
  /** What we printed in the last `debunkWindow` days: the rival may debunk our lies. */
  ourPrinted: PrintedStory[];
  /** Running story arcs and the ids of arcs this game already had (each happens once). */
  arcs: ArcState[];
  arcsDone: string[];
  /** Offers with a catch (CONCEPT.md §3.5а): today's offer, the deals in force, the turn of the last offer. */
  offer: Offer | null;
  deals: Deal[];
  /** The level the game is played at; its content comes from `withDifficulty`. */
  difficulty: Difficulty;
  /** Named residents (CONCEPT.md §2.2а): person id → resident id; today's letters; what happened to them. */
  people: Record<string, number>;
  letters: Letter[];
  fates: FateEvent[];
  /** Experience and loyalty of the reporters, by id. */
  staff: Record<string, StaffState>;
  lastOfferTurn: number;
  money: number;
  /** Price level of the paper (index in `Balance.prices`), chosen by the player. */
  price: number;
  brokeTurns: number;
  residents: Resident[];
  buildings: Building[];
  /** The map is mapSize × mapSize tiles; see map.ts for roads. */
  mapSize: number;
  hand: CardInstance[];
  nextUid: number;
  nextResidentId: number;
  ownedChannels: ChannelId[];
  upgrades: string[];
  /** Hired reporter ids, in hiring order. */
  reporters: string[];
  /** Candidates the HR agency offered this turn; hiring them costs nothing more. Cleared each turn. */
  agencyOffer: string[];
  lastFinds: Find[];
  /** Ad-rate multiplier of the outlet, drops after a scandal. */
  scandal: number;
  investigations: Investigation[];
  /** Consecutive turns each topic was published, ending last turn. */
  topicStreak: Partial<Record<Topic, number>>;
  /** Turn each story template was last found or happened, so stories do not repeat soon. */
  lastSeen: Record<string, number>;
  /** Topics the player sends each reporter after; empty or missing = any topic (CONCEPT.md §3.3). */
  reporterTopics: Record<string, Topic[]>;
  pendingLies: PendingLie[];
  /** Tension 0..100 by group pair key (CONCEPT.md §5.5). */
  tension: Record<string, number>;
  reconciliation: Reconciliation | null;
  /** The mayor will not start another reconciliation before this turn. */
  reconcileReadyTurn: number;
  /** Incidents of the current city day. */
  todayIncidents: Incident[];
  initialPopulation: number;
  initialEmployed: number;
  metrics: CityMetrics;
  /** Reactions to the last turn's news, by resident id (for the UI). */
  lastReactions: Record<number, Reaction>;
  todayEvents: string[];
  outcome: Outcome | null;
}

// ---------- Reports ----------

export interface PublicationReport {
  cardUid: number;
  title: string;
  truth: TruthLevel;
  placement: Placement;
  /** Residents who saw the story on at least one channel. */
  reached: number;
  /** Viewers per channel (a resident may be counted on several channels). */
  byChannel: Record<ChannelId, number>;
  believed: number;
  doubted: number;
  wordOfMouth: number;
  effects: Partial<Record<EffectType, number>>;
  exposed: boolean;
  /** Investigations: who was targeted and what the stigma did to them. */
  stigma?: { target: GroupId; pressure: number; left: number };
  /** Conflict stories and investigations: how they moved the tension of each pair. */
  tension?: Record<string, number>;
}

/** One line of the per-turn expenses: a channel, a reporter's salary or a running investigation. */
export interface UpkeepItem {
  kind: 'channel' | 'salary' | 'investigation';
  /** Channel id or reporter id. */
  id: string;
  amount: number;
}

/** 0 boring, 1 ordinary, 2 interesting, 3 sensational (CONCEPT.md §4.2а). */
export type IssueLevel = 0 | 1 | 2 | 3;

/** Why readers stopped buying (CONCEPT.md §5.2). */
/** price = the issue costs more than the resident can or wants to pay (CONCEPT.md §5.4). */
export type ChurnReason = 'exposed' | 'doubted' | 'boring' | 'empty' | 'price';

export interface ReadersChange {
  lost: number;
  gained: number;
  lostBy: Record<ChurnReason, number>;
  /** Readers who left the city this turn. */
  movedAway: number;
  /** New followers per channel (a newcomer may start following several). */
  gainedBy: Record<ChannelId, number>;
}

export interface TurnReport {
  turn: number;
  publications: PublicationReport[];
  /** Stories exposed during this turn: this issue's and old lies that surfaced. */
  exposures: ExposedStory[];
  /** Readers per channel who bought this turn's issue. */
  buyers: Record<ChannelId, number>;
  income: Record<ChannelId, number>;
  upkeep: number;
  /** What the upkeep was paid for (money window, CONCEPT.md §7.3). */
  upkeepItems: UpkeepItem[];
  /** Offers with a catch (CONCEPT.md §3.5а): money the deals paid this turn and the deals we broke. */
  deals: { paid: number; broken: string[] };
  /** Reporters with character (CONCEPT.md §3.3б): who rose a level, who quit, who leaked our lies. */
  staff: { levelUps: string[]; quit: string[]; leaked: string[] };
  moneyDelta: number;
  /** Followers of at least one channel: at the start of the turn, lost and gained after it. */
  readers: ReadersChange & { before: number; after: number };
  /** How interesting the issue was: the points sum and the level it reached. */
  issue: { score: number; level: IssueLevel };
  /** Tension by pair before the issue and at the start of the next turn. */
  tensionBefore: Record<string, number>;
  tensionAfter: Record<string, number>;
  /** The mayor's reconciliation that started with the new day, if any. */
  reconciliationStarted: Reconciliation | null;
  /** Bright moments of the new day for the city cutscene; empty on a quiet day. */
  highlights: Highlight[];
  trustBefore: number;
  trustAfter: number;
  metricsBefore: CityMetrics;
  metricsAfter: CityMetrics;
  events: string[];
  notes: string[];
  outcome: Outcome | null;
  /** Save mode: what the rival printed this turn and how it stands now. */
  rival?: RivalReport;
}

export interface RivalReport {
  publications: PublicationReport[];
  /** Residents our debunks talked out of believing its stories. */
  cured: number;
  readersBefore: number;
  readersAfter: number;
  trustBefore: number;
  trustAfter: number;
  closed: boolean;
}
