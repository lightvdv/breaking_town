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
   * event = real event that happens in the city (true card, may change the city),
   * fact = true everyday story that needs no event, rumor = made-up or exaggerated story,
   * investigation = dirt on a social group, only from assigned reporters (CONCEPT.md §3.3а).
   */
  source: 'event' | 'fact' | 'rumor' | 'investigation';
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
  /**
   * Conflict story between two groups (CONCEPT.md §5.5): a fixed pair or 'any' (the pair is chosen
   * when the story appears). Titles may use the pair's word forms: {a.one}, {b.manyGen}…
   * Conflict events are incidents: they only happen when the pair's tension is high enough.
   */
  conflict?: [GroupId, GroupId] | 'any';
  /** Conflict stories: the calming title, one step below the truth. */
  calmTitle?: string;
  /** Incidents: the kind of building where it happens (the city cutscene flies there). */
  place?: BuildingType;
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
  /** Chance a reporter sent after topics brings news on one of them. */
  assignFocus: number;
  /** Luck bonus when every assigned topic is among the reporter's specialties. */
  specialtyLuck: number;
  /** Chance a reporter brings a true story (event or fact) rather than a rumor (CONCEPT.md §3.3). */
  trueNewsShare: number;
  /** Chance a true local find is one of today's real events, when there is one. */
  eventPreference: number;
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
  /** Conflict stories: the two groups it is about (CONCEPT.md §5.5). */
  conflict?: [GroupId, GroupId];
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

export interface Outcome {
  result: 'win' | 'lose';
  reason: 'cityDestroyed' | 'bankrupt' | 'trustCollapse' | 'turnLimit';
}

export interface GameState {
  version: 1;
  seed: number;
  rng: RngState;
  turn: number;
  money: number;
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
export type ChurnReason = 'exposed' | 'doubted' | 'boring' | 'empty';

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
}
