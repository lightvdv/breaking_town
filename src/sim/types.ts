import type { RngState } from './rng';

// ---------- Content (loaded from src/content/*.json) ----------

export type ChannelId = string;
export type GroupId = string;
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
  hireCost: number;
  /** Paid every turn while hired. */
  salary: number;
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
  /** Extra front-page slots. */
  frontPageSlots?: number;
  exposureGainMul?: number;
  checkerMul?: number;
  plausibilityAdd?: number;
}

export interface UpgradeDef {
  id: string;
  name: string;
  description: string;
  cost: number;
  requires: Requirement | null;
  effects: UpgradeEffects;
}

/** stigma = dirt on the template's `target` group: other groups turn on it, it feels hunted. */
export type EffectType = 'quitJob' | 'avoid' | 'leaveCity' | 'protest' | 'moodDown' | 'moodUp' | 'stigma';

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
   * event = real event (true card), rumor = made-up or exaggerated story,
   * investigation = dirt on a social group, only from assigned reporters (CONCEPT.md §3.3а).
   */
  source: 'event' | 'rumor' | 'investigation';
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
  engagement: number;
  weight: number;
  baseTruth: TruthLevel;
  /** Residents working in this building type saw the truth themselves. */
  witness?: BuildingType;
  /** Card only appears while a building of this type is open. */
  requires?: BuildingType;
  /** What the real event does to the city (events only). */
  cityEffect?: CityEffect;
}

export interface BuildingDef {
  type: BuildingType;
  name: string;
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
  /** Chance a local find is one of today's real events, when there is one. */
  eventPreference: number;
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
  churnBoring: number;
  churnEmpty: number;
  churnExposed: number;
  /** An issue is boring if every story's impact is below this. */
  boringImpact: number;
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

  /** By placement (brief, article, front page): impact, share of readers who notice, fact-check risk, exposure meter growth. */
  placementImpact: Triple<number>;
  placementRead: Triple<number>;
  placementExposureRisk: Triple<number>;
  placementExposureGain: Triple<number>;
  frontPageSlots: number;
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
  lateExposureFactor: number;
  lateExposureTurns: number;
  exposurePerScandal: number;
  exposureDecay: number;
  exposureLimit: number;
  scandalAdMul: number;
  scandalRecovery: number;
  brokeTurnsLimit: number;
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
  /** Only `frontPageSlots` stories may go on the front page. */
  placement: Placement;
  /** Added to the card's baseTruth to get the published truth level. */
  distortion: number;
}

export interface Decision {
  /** Cards not published are discarded at the end of the turn. */
  publish: Publication[];
}

export interface PendingLie {
  cardUid: number;
  title: string;
  placement: Placement;
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

export interface Outcome {
  result: 'win' | 'lose';
  reason: 'cityDestroyed' | 'exposure' | 'bankrupt' | 'trustCollapse' | 'turnLimit';
}

export interface GameState {
  version: 1;
  seed: number;
  rng: RngState;
  turn: number;
  money: number;
  exposure: number;
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
  lastFinds: Find[];
  /** Ad-rate multiplier of the outlet, drops after a scandal. */
  scandal: number;
  investigations: Investigation[];
  /** Consecutive turns each topic was published, ending last turn. */
  topicStreak: Partial<Record<Topic, number>>;
  pendingLies: PendingLie[];
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
}

export interface TurnReport {
  turn: number;
  publications: PublicationReport[];
  lateExposures: string[];
  /** Readers per channel who bought this turn's issue. */
  buyers: Record<ChannelId, number>;
  income: Record<ChannelId, number>;
  upkeep: number;
  moneyDelta: number;
  exposureDelta: number;
  /** Followers of at least one channel: at the start of the turn, lost and gained after it. */
  readers: { before: number; lost: number; gained: number; after: number };
  trustBefore: number;
  trustAfter: number;
  metricsBefore: CityMetrics;
  metricsAfter: CityMetrics;
  events: string[];
  notes: string[];
  outcome: Outcome | null;
}
