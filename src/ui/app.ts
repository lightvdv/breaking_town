import { LANGS, lang, quoted, tr } from '../i18n';
import { chooseLang } from '../lang';
import { gameProps, initAnalytics, sendFeedback, setAnalytics, track, trackLeave, trackTurn } from './analytics';
import { ASSET_BASE } from '../assets';
import { versionLabel } from '../version';
import { CityScene, REACTION_ICON, type HoverTarget } from '../render/scene';
import {
  averageTrust,
  closedLine,
  huntBonus,
  endHunt,
  isHuntStory,
  topicWatchOf,
  startHunt,
  crimePressure,
  policeLost,
  buildingDefOf,
  buildingName,
  cancelInvestigation,
  channelOf,
  createGame,
  fireReporter,
  callAgency,
  agencyBlock,
  freeSeats,
  nextSeatReaders,
  hireFromAgency,
  getModifiers,
  groupOf,
  investigationTurns,
  issueLevel,
  effectiveTier,
  limitSensations,
  cardTruth,
  setReporterTopics,
  onSpecialty,
  listPurchases,
  maxDistortion,
  minDistortion,
  storyTitle,
  pairKey,
  pairKeys,
  pairOf,
  tensionLevel,
  arcInfo,
  withDifficulty,
  withLength,
  scoreOf,

  withTown,
  goalOf,
  goalProgress,
  isGeneratedTown,
  choiceId,
  randomChoice,
  townPower,
  townOf,
  type TownChoice,
  type TownDef,
  levelOf,
  staffOf,
  taskOf,
  taskProgress,
  electionLeader,
  runningTwist,
  twistOf,
  type CardEffect,
  type TaskDef,
  type TaskState,
  forecastTurn,
  refreshShop,
  shopRequestCost,
  refreshBlock,
  abilitiesOf,
  cashActive,
  cashBlock,
  cashCost,
  cashCooldown,
  cashMoves,
  useCash,
  type CashDef,
  abilityBlock,
  useAbility,
  expectedJoins,
  searchLuck,
  skilledReporter,
  type Forecast,
  answerOffer,
  dealBrokenBy,
  retainCost,
  retainBlock,
  personResident,
  type PersonDef,
  type FateEvent,
  offerOf,
  offerText,
  playTurn,
  previewPublication,
  purchase,
  placementSlots,
  rankedPlacements,
  readerCount,
  reporterOf,
  startInvestigation,
  templateOf,
  cityStateOf,
  type GameMode,
  type Difficulty,
  type GameLength,
  type CardTemplate,
  type CardInstance,
  type Content,
  type ChurnReason,
  type Topic,
  type Decision,
  type Modifiers,
  type ExposedStory,
  type Placement,
  type GameState,
  type Highlight,
  type NewsTier,
  type IssueLevel,
  type Reaction,
  type PublicationPreview,
  type PublicationReport,
  type Requirement,
  type UpgradeDef,
  type TurnReport,
} from '../sim';
import { h, pct, svg } from './dom';
import { loadSave, writeSave } from './save';
import { loadSettings, saveSettings } from './settings';
import { playIntro } from './intro';
import { currentStep, issueFlags, skipStep, skipTutorial, tipFor, stepTargets, stepShades, stepGlow, tutorialDifficulty, tutorialLength, tutorialSteps, withTutorial, type TutorialProgress, type TutorialView } from './tutorial';
import { recordOf, starLine, submitRecord } from './records';
import { collectable, levelCost, levelUp, loadCollection, MAX_LEVEL, openPack, packs, rarityNames, rewardFor, saveCollection, tagNames, type Collection, type PackResult } from './collection';
import { campaignStars, loadCampaign, newCampaign, PASSES, passNames, passState, saveCampaign, townStars, townState, winTown, type Campaign } from './campaign';
import { MAP_H, MAP_W, REGION_ART, townArt } from './campaignMap';
import { sound, SFX_NAMES, type MusicMood, type SfxName } from './sound';
import { bootDone, bootFailed, bootLabel, bootProgress, preloadImages } from '../boot';
import { aboutLine, levelNames, levelNamesGen, loyaltyOf, luckNames, noseNames, portrait, ReporterBar, skillTiers, type RepStatus } from './reporterBar';
import {
  toneOf,
  tensionLabels,
  effectLabels,
  effectText,
  effectShort,
  framingScale,
  placementLabels,
  issueLevelLabels,
  outcomeText,
  goalTitle,
  goalLine,
  reactionLabels,
  morningLabels,
  plural,
  scopeLabels,
  tierLabels,
  topicLabels,
  truthLabels,
  riskNotes,
  riskStep,
  issueStampOf,
  stampLabels,
} from './text';

interface Draft {
  publish: boolean;
  placement: Placement;
  distortion: number;
}

/** «Сводка»'s tabs, in order: the windows behind the top bar's tiles and the cards. */
const SUMMARY_TABS = [
  { id: 'shop', name: tr('Карты'), icon: 'cards' },
  { id: 'team', name: tr('Редакция'), icon: 'newsroom' },
  { id: 'readers', name: tr('Читатели'), icon: 'readers' },
  { id: 'reputation', name: tr('Репутация'), icon: 'reputation' },
  { id: 'city', name: tr('Город'), icon: 'city' },
  { id: 'population', name: tr('Жители'), icon: 'residents' },
] as const;

type Modal =
  | 'report'
  | 'debug'
  | 'city'
  | 'population'
  | 'readers'
  | 'reputation'
  | 'shop'
  | 'cash'
  | 'team'
  | 'dig'
  | 'pause'
  | 'howto'
  | 'settings'
  | 'about'
  | 'newgame'
  | 'tutorial'
  | 'office'
  | 'campaignNew'
  | 'carry'
  | 'feedback'
  | null;

/** How an upgrade series is called in the upgrades window. */
const seriesNames: Record<string, string> = { kiosks: tr('Киоски') };
const assetBase = ASSET_BASE;

function seedFromUrl(): number {
  const s = Number(new URLSearchParams(location.search).get('seed'));
  return Number.isFinite(s) && s > 0 ? s : randomSeed();
}

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000) + 1;
}

const signed = (d: number) => (d > 0 ? `+${d}` : `${d}`);

/** Card flight from the reporter to its place in the issue; louder for higher tiers (CONCEPT.md §7.3). */
function flightFrames(tier: NewsTier, dx: number, dy: number): { frames: Keyframe[]; options: KeyframeAnimationOptions } {
  const from = (s: number, r = 0) => `translate(${dx}px, ${dy}px) scale(${s}) rotate(${r}deg)`;
  const mid = (k: number, lift: number, s: number, r = 0) => `translate(${dx * k}px, ${dy * k - lift}px) scale(${s}) rotate(${r}deg)`;
  switch (tier) {
    case 0:
      return {
        frames: [{ transform: from(0.25), opacity: 0 }, { transform: 'none', opacity: 1 }],
        options: { duration: 450, easing: 'ease-out' },
      };
    case 1:
      return {
        frames: [
          { transform: from(0.25), opacity: 0 },
          { transform: mid(0.4, 60, 0.8), opacity: 1, offset: 0.55 },
          { transform: 'none', opacity: 1 },
        ],
        options: { duration: 450, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1.2)' },
      };
    case 2:
      return {
        frames: [
          { transform: from(0.2, -200), opacity: 0 },
          { transform: mid(0.4, 80, 1.05, 15), opacity: 1, offset: 0.6 },
          { transform: 'none', opacity: 1 },
        ],
        options: { duration: 550, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.15)' },
      };
    case 3:
      return {
        frames: [
          { transform: from(0.1, -30), opacity: 0 },
          { transform: mid(0.5, 120, 1.35, 8), opacity: 1, offset: 0.55 },
          { transform: 'scale(0.95)', opacity: 1, offset: 0.85 },
          { transform: 'none', opacity: 1 },
        ],
        options: { duration: 700, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1)' },
      };
  }
}

export function mountApp(root: HTMLElement, base: Content): void {
  // Continue a saved game if there is one; the seed in the URL only picks the city of a new game
  // (add &new to the URL to start over in that city).
  const params = new URLSearchParams(location.search);
  const settings = loadSettings();
  initAnalytics(settings.analytics);
  // Sound starts with the first press: browsers allow it only after one (CONCEPT.md §7.2а).
  sound.setVolumes(settings.musicVolume, settings.sfxVolume);
  const unlockSound = () => sound.unlock();
  addEventListener('pointerdown', unlockSound, true);
  addEventListener('keydown', unlockSound, true);
  addEventListener('click', (e) => (e.target as Element | null)?.closest?.('button, summary, .title-item') && sound.play('click'), true);
  const saved = params.has('new') ? null : loadSave<Draft>(base);
  // The debug window is a pause menu item only with ?debug in the address.
  const debugMode = params.has('debug');
  /** The title screen is up (CONCEPT.md §7.3 «Меню»); &new in the address starts a game at once. */
  let titleOpen = !params.has('new');
  /** A game was started or continued in this tab, so «Продолжить» makes sense. */
  // Only a game with at least one turn played counts: a city nobody touched is not offered to continue.
  let hasGame = saved !== null && saved.state.turn > 1;
  const urlMode: GameMode = 'destroy';
  // The game runs on the content of its difficulty (CONCEPT.md §4.6); `c` follows the current game.
  /** The content a game runs on: its difficulty's, and in the campaign its town's too (CONCEPT.md §4.6, §9). */
  // A short game and the tutorial mission patch it further (CONCEPT.md §4.6а, §7.3 «Обучение»).
  /** The town of a free game (CONCEPT.md §9.5): what the player composed, the default town at first. */
  const townChoice = (): TownChoice => {
    const g = base.townGen;
    const x = { ...g.defaults, ...settings.town };
    const known = g.sizes.some((o) => o.id === x.size) && g.archetypes.some((o) => o.id === x.way) && g.rules.some((o) => o.id === x.rule) && g.goals.some((o) => o.id === x.goal);
    return known ? x : g.defaults;
  };
  const contentFor = (difficulty: Difficulty, mode: GameMode, town: string | null, length: GameLength = 'full', tutorialGame = false) => {
    const x = withLength(withDifficulty(base, difficulty, mode), length, difficulty);
    const y = town ? withTown(x, town, mode, difficulty) : x;
    return tutorialGame ? withTutorial(y) : y;
  };
  let c = saved
    ? contentFor(saved.state.difficulty, saved.state.mode, saved.state.town, saved.state.length, !!saved.tutorial)
    : contentFor(settings.difficulty, urlMode, choiceId(townChoice()));
  /** The campaign (CONCEPT.md §9): its own storage; the map screen is open over the drifting city. */
  let campaign: Campaign | null = loadCampaign(base);
  /** The collection of cards between games and the «связи» to grow it (CONCEPT.md §3.5б). */
  let collection: Collection = loadCollection(base);
  /** «Связи» the game that just ended brought (the outcome window says it). */
  let lastReward = 0;
  /** What the last pack gave, shown in the office until the next action. */
  let packResult: PackResult | null = null;
  /** The rarity tab open in «Кабинет редактора». */
  let officeTab: 'all' | 'legendary' | 'rare' | 'common' = 'all';
  let campaignOpen = false;
  let campaignSel = 0;
  /** The pass of the campaign town being played (CONCEPT.md §9.1): it is the game's difficulty. */
  let campaignLevel: Difficulty = 'easy';
  let state: GameState = saved?.state ?? createGame(c, seedFromUrl(), urlMode, settings.difficulty, { town: choiceId(townChoice()) });
  let drafts = new Map<number, Draft>(saved?.drafts ?? []);
  // A saved layout that no longer fits the slots (e.g. two front pages from a removed upgrade) is laid out anew.
  {
    const slots = placementSlots(getModifiers(state, c));
    const used = [0, 0, 0];
    for (const d of drafts.values()) if (d.publish) used[d.placement]++;
    if (used.some((n, i) => n > slots[i])) drafts = new Map();
  }
  let report: TurnReport | null = saved?.report ?? null;
  /** The game just ended with a result better than the record (CONCEPT.md §4.8). */
  let newRecord = false;
  /** The tutorial mission's progress (CONCEPT.md §7.3 «Обучение»); null in an ordinary game. */
  let tutorial: TutorialProgress | null = saved?.tutorial ?? null;
  let error = '';
  let busy = false;
  /** The day the board's offer window opened by itself (once per offer, CONCEPT.md §3.5в). */
  let shopAutoTurn = 0;
  /** The opening story is on: the last game's result and windows stay hidden under it. */
  let introPlaying = false;
  let issueOpen = true;
  let modal: Modal = null;
  /** Reporter whose investigation window is open. */
  /** Explanations opened with «?» in the reporter window (by section). */
  const openInfo = new Set<string>();
  let scene: CityScene | null = null;
  // Start-of-turn search animation.
  let repStatus = new Map<string, RepStatus>();
  let searching = false;
  let skipSearch = false;
  let wake: (() => void) | null = null;
  let searchRun = 0;
  /** Cards already shown in the issue, and those that still have to fly in. */
  let revealed = new Set<number>();
  let flyQueue = new Set<number>();
  /** Cards whose impact / reach / risk details are unfolded. */
  const details = new Set<number>();
  /** The exposure notice of the last report was closed. */
  let exposuresSeen = false;
  /** The mayor's reconciliation notice of the last report was closed. */
  let reconcileSeen = false;
  let digSeen = false;
  /** The group the «Компромат» window digs under (CONCEPT.md §3.3а). */
  let digTarget: string | null = null;
  let staffSeen = false;
  /** The turn whose promotions the portraits already celebrated (none again after a reload). */
  let promotedTurn = saved?.report?.turn ?? -1;
  let offerError = '';
  /** Group picked on the relations circle: its lines stand out, the rest dim. */
  let relFocus: string | null = null;
  /** Story whose truth menu is open next to its headline. */
  let truthMenuFor: number | null = null;
  /** Phones: the story whose «where to» menu is open (stories are not dragged on a phone). */
  let moveMenuFor: number | null = null;
  let menuClosedFor: number | null = null;
  const isPhone = () => window.matchMedia('(max-width: 900px)').matches;
  /** Story picked by a tap; the next tap on a place in the paper moves it there (CONCEPT.md §7.3). */
  let selected: number | null = null;
  /** The tray of stories left out is unfolded. */
  let trayOpen = false;
  /** Plaques over the paper unfolded in this session (`foldPlaques`). */
  const openPlaques = new Set<string>();
  /** Issue level on the publish button at the last render, and its bump animation for this render. */
  let shownLevel: IssueLevel | null = null;
  let levelBump = '';

  // ---------- Persistent shell ----------
  // One top row (CONCEPT.md §7.3): resources, reporter portraits, the issue level and the buttons.
  const hudRes = h('div', { class: 'resources' });
  const hudActions = h('div', { class: 'hud-buttons' });
  const hudMenu = h('button', { class: 'icon-btn hud-menu', title: tr('Меню'), onclick: () => openModal('pause') }, '☰');
  const reporterBar = new ReporterBar(
    c,
    () => openModal('team', 'agency'),
    () => skip(),
    (id) => {
      error = '';
      openModal('team', `rep-${id}`);
    },
  );
  // The control row: our reporters' square portraits, then «Сводка» (a folder) and ☰ on the right.
  // «Сводка» is one window with tabs: the cards, the newsroom, readers, reputation and the city.
  const hudShop = h(
    'button',
    { class: 'icon-btn hud-shop', title: tr('Сводка: карты, редакция, читатели, репутация, город'), 'aria-label': tr('Сводка'), onclick: () => openModal('shop') },
    h('img', { class: 'shop-icon', src: `${assetBase}sprites/ui/folder.png`, alt: '', width: 16, height: 16 }),
    // Wide screens only: the folder says what it is.
    h('span', { class: 'shop-label' }, tr('Сводка')),
  );
  // Wide screens: the reporters are one block «Редакция», as wide as a full newsroom, so nothing
  // after it moves when someone is hired; on phones the wrapper melts away.
  const hudTeam = h('div', { class: 'hud-team' }, h('span', { class: 'hud-team-label' }, tr('Редакция')), reporterBar.el);
  // The dirty tricks, the cards' abilities and the tricks acting today: icons in the top bar (CONCEPT.md §3.5в).
  const abilityBar = h('div', { class: 'ability-bar hud-abilities', hidden: true });
  const hudControls = h('div', { class: 'hud-controls' }, hudTeam, hudShop, abilityBar, hudMenu);
  // Phones (CONCEPT.md §7.3): the actions live in a tab bar along the bottom edge, as in mobile games —
  // the cards, the newsroom, the summary and the dirty tricks; «В печать» is the raised button in its middle.
  const tab = (cls: string, icon: string, label: string, open: () => void) =>
    h(
      'button',
      { class: `tab ${cls}`, onclick: open },
      h(
        'span',
        { class: 'tab-icon' },
        // A sprite name, or an emoji like the dirty tricks' 🎭 in the top bar.
        /^[a-z_]+$/.test(icon) ? h('img', { src: `${assetBase}sprites/ui/${icon}.png`, alt: '', width: 16, height: 16 }) : h('span', { class: 'tab-emoji', 'aria-hidden': 'true' }, icon),
        h('span', { class: 'tab-badge', hidden: true }),
      ),
      h('span', { class: 'tab-label' }, label),
    );
  const tabCards = tab('tab-cards', 'cards', tr('Карты'), () => openModal('shop'));
  const tabTeam = tab('tab-team', 'newsroom', tr('Редакция'), () => openModal('team'));
  const tabSummary = tab('tab-summary', 'folder', tr('Сводка'), () => openModal('readers'));
  const tabCash = tab('tab-cash', '🎭', tr('Приёмы'), () => openModal('cash'));
  // On a phone «В печать» sits in the middle of the tab bar (CONCEPT.md §7.3); this gap is its place.
  const tabBar = h('nav', { class: 'tab-bar', 'aria-label': tr('Действия') }, tabCards, tabTeam, h('div', { class: 'tab-gap', 'aria-hidden': 'true' }), tabSummary, tabCash);
  const hudGoal = h('div', { class: 'hud-goal' });
  // A narrow track keeps only the names of the city's stage and the goal (CSS `.tight`).
  new ResizeObserver(() => hudGoal.classList.toggle('tight', hudGoal.offsetWidth < 400)).observe(hudGoal);
  const hud = h('header', { class: 'hud' }, hudControls, hudRes, hudGoal, hudActions);
  const cityHost = h('div', { class: 'city-host' });
  const cityEvents = h('div', { class: 'city-events' });
  // The same events at the top of the open issue: over the city they would show through its shade.
  const issueEvents = h('div', { class: 'city-events issue-events' });
  const loading = h('div', { class: 'city-loading' }, tr('Строим город…'));
  const tools = h(
    'div',
    { class: 'city-tools' },
    h('button', { class: 'icon-btn', title: tr('Приблизить'), onclick: () => scene?.zoomBy(1) }, '+'),
    h('button', { class: 'icon-btn', title: tr('Отдалить'), onclick: () => scene?.zoomBy(-1) }, '−'),
    h('button', { class: 'icon-btn', title: tr('Весь город'), onclick: () => scene?.resetView() }, '⌂'),
  );
  const issueHead = h('div', { class: 'issue-head' });
  // The issue is a newspaper mock-up: front page, the article, columns of briefs, and a tray for
  // stories left out; stories are dragged between them (CONCEPT.md §7.3).
  type ZoneKey = Placement | 'out';
  const zoneTexts: Record<string, [string, string]> = {
    2: [tr('Первая полоса'), tr('главную новость')],
    1: [tr('Статья'), tr('статью')],
    0: [tr('Заметки'), tr('заметку')],
    out: [tr('Не печатать'), tr('новость, чтобы не печатать её')],
  };
  /** The empty place whose «choose a story» list is open. */
  let chooserFor: ZoneKey | null = null;
  const targetTexts: Record<string, string> = { 2: tr('На первую полосу'), 1: tr('Статьёй'), 0: tr('Заметкой'), out: tr('Не печатать') };
  const makeZone = (key: ZoneKey) => {
    const items = h('div', { class: 'zone-items' });
    // An empty place is a button: it lists the stories that can go here.
    const empty = h('button', {
      class: 'zone-empty',
      onclick: () => {
        // No story left to put here and room on the staff: the place calls for another reporter (CONCEPT.md §7.3).
        if (empty.classList.contains('hire')) return openModal('team');
        chooserFor = chooserFor === key ? null : key;
        truthMenuFor = null;
        moveMenuFor = null;
        render();
      },
    });
    const chooser = h('div', { class: 'zone-chooser' });
    const label = h('h4', { class: 'zone-label' }, zoneTexts[key][0]);
    // While a story is picked, every other place shows a big target; a tap on it moves the story.
    const target = h('button', { class: 'zone-target', 'data-tut': key === 2 ? 'to-front' : undefined, onclick: () => moveSelected(key) }, h('span', {}, tr('Сюда: {0}', targetTexts[key])));
    const root = h('section', { class: `zone zone-${key}`, 'data-zone': String(key) }, label, items, empty, chooser, target);
    return { root, items, empty, chooser, label, target };
  };
  const zones: Record<string, ReturnType<typeof makeZone>> = { 2: makeZone(2), 1: makeZone(1), 0: makeZone(0), out: makeZone('out') };
  const issueNo = h('span', { class: 'issue-no' });
  // The paper's circulation in the masthead: readers are its strength (CONCEPT.md §10.3).
  const circulation = h('span', { class: 'circulation' });
  // What the laid-out issue will be, in the paper's own voice (CONCEPT.md §7.3 «Риск выпуска»).
  const todayLine = h('span', { class: 'today-line' });
  const issueStamp = h('div', { class: 'issue-stamp', hidden: true });
  // The clean streak under the stamp: «Без лжи 3 из 5 → +3% репутации» (CONCEPT.md §5.3).
  const streakBadge = h('div', { class: 'streak-badge', hidden: true, role: 'button', tabindex: '0' });
  // A tap opens what the streak gives: phones have no hover title.
  let streakTipOpen = false;
  streakBadge.addEventListener('click', () => {
    streakTipOpen = !streakTipOpen;
    renderStreak(streakBadge.classList.contains('dim'));
  });
  // Two rows (CONCEPT.md §7.3): the name of the paper, then the circulation on the left, «Сегодня в номере» and the issue number on the right.
  const masthead = h(
    'header',
    { class: 'masthead' },
    h('div', { class: 'stamp-box' }, issueStamp, streakBadge),
    h('h2', {}, tr('Городской Вестник')),
    h('button', { class: 'paper-close', title: tr('Свернуть — посмотреть на город'), onclick: () => closeIssue() }, '—'),
    h('div', { class: 'masthead-row' }, circulation, todayLine, issueNo),
  );
  // The tray of stories left out is the last rubric of the page, folded into one line (CONCEPT.md §7.3).
  // «Письма читателей» (CONCEPT.md §2.2а): what readers wrote about yesterday's issue.
  const lettersBox = h('section', { class: 'letters', hidden: true });
  const paper = h('div', { class: 'paper' }, masthead, h('div', { class: 'paper-grid' }, zones[2].root, zones[1].root, zones[0].root), lettersBox, zones.out.root);
  // Exposures and the mayor's reconciliation are announced by plaques above the paper (CONCEPT.md §7.3).
  // The novice's note of the day: a sticker above the paper (CONCEPT.md §7.3 «Постепенное открытие»).
  const guideNote = h('section', { class: 'guide-note', hidden: true, role: 'status' });
  // The tutorial's step in one line in an open window, under its title (CONCEPT.md §7.3 «Обучение»).
  const tutorialBar = h('div', { class: 'tutorial-bar', hidden: true, role: 'status' });
  const exposureNotice = h('section', { class: 'notice notice-exposed', hidden: true, role: 'status' });
  const reconcileNotice = h('section', { class: 'notice notice-peace', hidden: true, role: 'status' });
  // «Расследование готово» on the day the dirt comes in (CONCEPT.md §3.3а).
  const digNotice = h('section', { class: 'notice notice-dig', hidden: true, role: 'status' });
  const staffNotice = h('section', { class: 'notice notice-staff', hidden: true, role: 'status' });
  const offerNotice = h('section', { class: 'notice notice-offer', hidden: true, role: 'status' });
  // Tasks of the game and the mid-game twist (CONCEPT.md §4.8, §4.9).
  const tasksNotice = h('section', { class: 'notice notice-tasks', hidden: true, role: 'status' });
  const twistNotice = h('section', { class: 'notice notice-twist', hidden: true, role: 'status' });
  // The hunt against a place (CONCEPT.md §3.6а).
  const huntNotice = h('section', { class: 'notice notice-hunt', hidden: true, role: 'status' });
  // The folded issue: a newspaper over the city; a tap unfolds it.
  const issueFab = h(
    'button',
    { class: 'issue-fab', title: tr('Вернуться к выпуску'), 'aria-label': tr('Вернуться к выпуску'), hidden: true, onclick: () => openIssue() },
    h('img', { src: `${assetBase}sprites/ui/readers.png`, alt: '', width: 16, height: 16 }),
    h('span', {}, tr('К выпуску')),
  );
  const issue = h('div', { class: 'issue' }, h('div', { class: 'issue-panel' }, issueHead, issueEvents, guideNote, exposureNotice, digNotice, reconcileNotice, staffNotice, offerNotice, twistNotice, tasksNotice, huntNotice, paper));
  issue.addEventListener('click', (e) => {
    if (searching) skip();
    else if (e.target === issue || e.target === issue.firstElementChild) {
      if (selected !== null) pick(null);
      else closeIssue();
    }
  });
  // A press anywhere else closes an open truth menu.
  document.addEventListener('pointerdown', (e) => {
    menuClosedFor = null;
    if ((truthMenuFor === null && moveMenuFor === null && chooserFor === null) || (e.target as Element).closest('.place-menu, .truth-chip, .zone-empty')) return;
    // A tap on the story itself only closes its menu: the click that follows must not open it again.
    if (moveMenuFor !== null && (e.target as Element).closest(`[data-uid="${moveMenuFor}"]`)) menuClosedFor = moveMenuFor;
    truthMenuFor = null;
    moveMenuFor = null;
    chooserFor = null;
    render();
  });
  // …and an open luck or nose tip in the reporter window.
  document.addEventListener('pointerdown', (e) => {
    const tips = [...openInfo].filter((x) => x.endsWith('luck') || x.endsWith('nose'));
    if (!tips.length || (e.target as Element).closest('.skill-icon')) return;
    for (const x of tips) openInfo.delete(x);
    render();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selected !== null) pick(null);
  });
  // Start-of-turn notice about exposed stories; hovering it shows the cards (CONCEPT.md §7.3).
  // The day's summary after the scenes; it waits for «Следующий день» (CONCEPT.md §7.3).
  const daySummary = h('section', { class: 'day-summary', hidden: true, role: 'dialog', 'aria-label': tr('Итоги дня') });
  // City cutscene before the issue: letterbox bars and a caption of the bright moment (CONCEPT.md §7.3).
  const cutsceneCaption = h('div', { class: 'cutscene-caption' });
  const cutscene = h(
    'div',
    { class: 'cutscene', hidden: true },
    h('div', { class: 'letterbox top' }),
    h('div', { class: 'letterbox bottom' }),
    cutsceneCaption,
    h('button', { class: 'cutscene-skip', onclick: () => scene?.skipCutscene() }, tr('Пропустить ▸')),
  );
  const tooltip = h('div', { class: 'tooltip', hidden: true });
  const modalLayer = h('div', { class: 'modal-layer' });
  const outcomeLayer = h('div', { class: 'modal-layer' });
  const titleLayer = h('div', { class: 'title-screen', hidden: true });
  const campaignLayer = h('div', { class: 'campaign-screen', hidden: true });
  root.replaceChildren(
    hud,
    h('main', { class: 'stage' }, cityHost, cityEvents, tools, loading, cutscene, daySummary, issue, issueFab),
    tabBar,
    tooltip,
    titleLayer,
    campaignLayer,
    modalLayer,
    outcomeLayer,
  );
  const cardEls = new Map<number, HTMLElement>();

  // The loading screen (CONCEPT.md §7.3 «Загрузка») holds the player until everything is here: the
  // city's art (most of the bar), the interface pictures and the fonts.
  bootLabel();
  let artShare = 0;
  let uiShare = 0;
  const showBoot = () => bootProgress(artShare * 0.8 + uiShare * 0.2);
  const uiPictures = fetch(`${assetBase}manifest.json`)
    .then((r) => r.json() as Promise<Record<string, unknown>>)
    .then((m) => {
      const list = (key: string, dir: string) => ((m[key] as string[] | undefined) ?? []).map((x) => `${assetBase}sprites/${dir}/${x}.png`);
      return preloadImages([...list('ui', 'ui'), ...list('reporters', 'reporters'), ...list('groups', 'groups'), ...list('people', 'people'), ...list('intro', 'intro')], (x) => {
        uiShare = x;
        showBoot();
      });
    })
    .catch(() => undefined);
  Promise.all([
    CityScene.create(cityHost, c, state, showTooltip, (x) => {
      artShare = x;
      showBoot();
    }),
    uiPictures,
    document.fonts?.ready,
  ])
    .then(([s]) => {
      scene = s;
      loading.remove();
      if (titleOpen) s.startTour();
      bootDone();
    })
    .catch((e) => {
      const message = tr('Не удалось загрузить графику: {0}', e instanceof Error ? e.message : e);
      loading.textContent = message;
      bootFailed(message);
    });

  // ---------- Start-of-turn search ----------

  const pause = (ms: number) =>
    new Promise<void>((resolve) => {
      if (skipSearch) return resolve();
      const t = window.setTimeout(done, ms);
      function done() {
        window.clearTimeout(t);
        wake = null;
        resolve();
      }
      wake = done;
    });

  function skip(): void {
    if (!searching) return;
    skipSearch = true;
    wake?.();
  }

  const titleOf = (uid: number | null) => {
    const card = uid === null ? undefined : state.hand.find((x) => x.uid === uid);
    return card ? storyTitle(c, card, 0) : null;
  };

  /** Reporters show one by one what they found; each found card flies from its reporter into the issue. */
  async function runSearch(): Promise<void> {
    const run = ++searchRun;
    const finds = [...state.lastFinds];
    searching = true;
    // «Быстрый поиск» in the settings shows every find at once.
    skipSearch = settings.fastSearch;
    issueOpen = true;
    exposuresSeen = false;
    reconcileSeen = false;
    digSeen = false;
    staffSeen = false;
    repStatus = new Map();
    revealed = new Set();
    flyQueue = new Set();
    render();
    for (const f of finds) {
      if (run !== searchRun || skipSearch) break;
      repStatus.set(f.reporterId, { phase: 'searching' });
      render();
      await pause(300);
      if (run !== searchRun) return;
      repStatus.set(f.reporterId, { phase: 'done', find: f, title: titleOf(f.cardUid) });
      if (f.cardUid !== null && !skipSearch) {
        sound.play(f.tier === 3 ? 'sensation' : 'type');
        revealed.add(f.cardUid);
        flyQueue.add(f.cardUid);
      }
      render();
      await pause(f.tier === 3 ? 800 : f.tier === 2 ? 600 : 400);
    }
    if (run !== searchRun) return;
    for (const f of finds) {
      repStatus.set(f.reporterId, { phase: 'done', find: f, title: titleOf(f.cardUid) });
      if (f.cardUid !== null) revealed.add(f.cardUid);
    }
    searching = false;
    busy = false;
    // The board's new offer opens by itself the day it comes;
    // not during the tutorial, where a window popping up over the step only gets in the way.
    const offerNew = state.shopOffer.length && !state.shopPicks;
    if (offerNew && shopAutoTurn !== state.turn && !modal && !state.outcome && !tutorialStep()) {
      shopAutoTurn = state.turn;
      openModal('shop');
    }
    render();
    window.setTimeout(() => {
      if (run !== searchRun) return;
      repStatus = new Map();
      render();
    }, 1800);
  }

  // ---------- Actions ----------

  const impactOf = (card: CardInstance, mods: Modifiers) =>
    previewPublication(state, c, mods, { cardUid: card.uid, placement: 2, distortion: drafts.get(card.uid)?.distortion ?? 0 }).impact;

  /**
   * Default layout of a new issue (CONCEPT.md §7.3): every story goes in; the best one (tier, then
   * impact) takes the front page, the next the article slot, the rest are briefs.
   */
  function layOutIssue(): void {
    const fresh = state.hand.filter((card) => !drafts.has(card.uid));
    if (!fresh.length) return;
    const mods = getModifiers(state, c);
    const ranked = [...fresh].sort((a, b) => b.tier - a.tier || impactOf(b, mods) - impactOf(a, mods));
    const places = rankedPlacements(ranked.length, mods);
    ranked.forEach((card, i) => drafts.set(card.uid, { publish: true, placement: places[i], distortion: 0 }));
  }

  /** One sensation per issue (CONCEPT.md §4.2а): a story brought back or moved up is toned down if needed. */
  function fitSensations(): void {
    const publish = state.hand.filter((x) => drafts.get(x.uid)?.publish).map((x) => ({ cardUid: x.uid, ...drafts.get(x.uid)! }));
    limitSensations(state, c, publish);
    for (const p of publish) drafts.get(p.cardUid)!.distortion = p.distortion;
  }

  /** Another published story is already a sensation, so this one cannot become one. */
  function sensationTaken(card: CardInstance): boolean {
    return state.hand.some((x) => {
      const d = drafts.get(x.uid);
      return x.uid !== card.uid && !!d?.publish && effectiveTier(x, d.distortion) === 3;
    });
  }

  /**
   * Puts a card at a placement (dragged there, CONCEPT.md §7.3). When that placement is full, the
   * card dropped on (or the weakest holder) moves to this card's old place; a card brought back from
   * outside the issue pushes the holder down to the briefs.
   */
  function place(card: CardInstance, to: Placement, onto?: CardInstance): void {
    const d = draftOf(card);
    const from: Placement = d.publish ? d.placement : 0;
    if (d.publish && from === to) return;
    const mods = getModifiers(state, c);
    const holders = state.hand.filter((x) => x.uid !== card.uid && drafts.get(x.uid)?.publish && drafts.get(x.uid)!.placement === to);
    if (holders.length >= placementSlots(mods)[to]) {
      const target = onto && holders.includes(onto) ? onto : holders.sort((a, b) => impactOf(a, mods) - impactOf(b, mods))[0];
      drafts.get(target.uid)!.placement = from;
    }
    d.placement = to;
    d.publish = true;
  }

  /** Takes a card out of the issue (dragged to the tray); it burns at the end of the turn. */
  function unpublish(card: CardInstance): void {
    const d = draftOf(card);
    d.publish = false;
    d.placement = 0;
  }

  /** Picks a story for a move by tap (or drops the pick with null). */
  function pick(uid: number | null): void {
    selected = uid;
    truthMenuFor = null;
    render();
  }

  /** Moves the picked story to the tapped place. */
  function moveSelected(key: ZoneKey): void {
    const card = state.hand.find((x) => x.uid === selected);
    selected = null;
    if (card) {
      if (key === 'out') unpublish(card);
      else place(card, key);
    }
    render();
  }

  const draftOf = (card: CardInstance): Draft => {
    if (!drafts.has(card.uid)) layOutIssue();
    return drafts.get(card.uid)!;
  };

  function openModal(m: Modal, anchor?: string): void {
    if (m && m !== modal) track('window_open', { window: m, in_game: !titleOpen && hasGame });
    modal = m;
    render();
    if (anchor) document.getElementById(anchor)?.scrollIntoView({ block: 'start' });
  }

  /** The issue folds into the newspaper icon over the city (and unfolds from it). */
  let folding = false;
  const foldFrames = (): Keyframe[] => {
    const from = issue.getBoundingClientRect();
    const to = issueFab.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = Math.max(0.04, to.width / from.width);
    return [
      { transform: 'none', opacity: 1 },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.3 },
    ];
  };

  function closeIssue(): void {
    if (folding || !issueOpen) return;
    folding = true;
    sound.play('paper');
    // The icon is laid out (invisible) to learn where the paper flies.
    issueFab.hidden = false;
    issueFab.style.visibility = 'hidden';
    const anim = issue.animate(foldFrames(), { duration: 190, easing: 'cubic-bezier(0.5, 0, 0.75, 0)' });
    anim.onfinish = () => {
      folding = false;
      issueFab.style.visibility = '';
      issueOpen = false;
      render();
      issueFab.animate([{ transform: 'scale(0.4)' }, { transform: 'scale(1.15)' }, { transform: 'scale(1)' }], { duration: 150, easing: 'ease-out' });
    };
  }

  function openIssue(): void {
    if (folding || issueOpen) return;
    const frames = foldFrames().reverse();
    sound.play('paper');
    issueOpen = true;
    render();
    issue.animate(frames, { duration: 320, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' });
  }

  /** What kind of game is on, for the statistics (CONCEPT.md §7.6). */
  const gameKind = () => (tutorial ? 'tutorial' : state.town && !isGeneratedTown(state.town) ? 'campaign' : 'free');

  // Where the player stopped when the tab closes: the screen, the day, the open window (CONCEPT.md §7.6).
  addEventListener('pagehide', () =>
    trackLeave({
      screen: introPlaying ? 'intro' : titleOpen ? 'title' : campaignOpen ? 'campaign' : hasGame ? 'game' : 'other',
      window: modal,
      ...(hasGame ? { ...gameProps(state, gameKind()), outcome: state.outcome?.result ?? null, tutorial_step: tutorial ? trackedStep : null } : {}),
    }),
  );

  const newGame = (seed = randomSeed(), mode: GameMode = 'destroy', town: string | null = null, tutorialGame = false) => {
    hasGame = true;
    // A campaign town keeps the campaign's difficulty and starts with the reporter brought along;
    // the tutorial is an easy short game of its own (CONCEPT.md §7.3 «Обучение»).
    // A free game (CONCEPT.md §9.5) is a town the player composed, at the chosen difficulty.
    const campaignTown = !!town && !!campaign && !isGeneratedTown(town);
    const difficulty = tutorialGame ? tutorialDifficulty : campaignTown ? campaignLevel : settings.difficulty;
    const length: GameLength = tutorialGame ? tutorialLength : 'full';
    c = contentFor(difficulty, mode, town, length, tutorialGame);
    reporterBar.c = c;
    // The draft deals only cards of the player's collection, at their levels (CONCEPT.md §3.5б).
    collection = loadCollection(base);
    state = createGame(c, seed, mode, difficulty, { ...(town ? { town, ...(campaignTown && campaign?.carry ? { reporters: [campaign.carry] } : {}) } : {}), length, collection: { ...collection.cards } });
    lastReward = 0;
    tutorial = tutorialGame ? { step: 0, flags: [] } : null;
    newRecord = false;
    drafts = new Map();
    report = null;
    error = '';
    busy = true;
    modal = null;
    scene?.setState(state, false);
    scene?.resetView();
    track('game_start', gameProps(state, gameKind()));
    void runSearch();
  };

  const fire = (id: string) => {
    try {
      fireReporter(state, id);
      error = '';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    render();
  };

  const buy = (id: string) => {
    try {
      purchase(state, c, id);
      sound.play('coin');
      error = '';
      scene?.setState(state, false);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    render();
  };

  /** The issue as the player has laid it out now. */
  const currentDecision = (): Decision => {
    const decision: Decision = { publish: [] };
    for (const card of state.hand) {
      const d = draftOf(card);
      if (d.publish) decision.publish.push({ cardUid: card.uid, placement: d.placement, distortion: d.distortion });
    }
    return decision;
  };

  /** What the current layout is expected to do (CONCEPT.md §7.3): rehearsed once per layout. */
  let forecastKey = '';
  let forecast: Forecast | null = null;
  const currentForecast = (): Forecast | null => {
    if (!issueOpen || searching || busy || state.outcome) return null;
    const decision = currentDecision();
    const key = `${state.turn}|${state.upgrades.length}|${Math.round(averageTrust(state, c) * 10)}|${state.reporters.join()}|${JSON.stringify(decision)}`;
    if (key !== forecastKey) {
      forecastKey = key;
      forecast = forecastTurn(state, c, decision);
    }
    return forecast;
  };

  const endTurn = () => {
    const decision = currentDecision();
    const hand = state.hand;
    try {
      report = playTurn(state, c, decision);
      sound.play('press');
      error = '';
      trackTurn(state, c, gameKind(), decision, report);
      // The tutorial's steps that are done by printing (CONCEPT.md §7.3 «Обучение»).
      if (tutorial) tutorial.flags = [...new Set([...tutorial.flags, ...issueFlags(hand, c, decision, report)])];
      // The first-day note has done its job once an ordinary issue went to press.
      if (!tutorial && !settings.notesSeen.includes('first_day')) {
        settings.notesSeen = [...settings.notesSeen, 'first_day'];
        saveSettings(settings);
      }
      if (tutorial && state.outcome && !settings.tutorialDone) {
        settings.tutorialDone = true;
        saveSettings(settings);
      }
      // Every finished game brings «связи» for the office (CONCEPT.md §3.5б).
      if (state.outcome) {
        lastReward = rewardFor({ win: state.outcome.result === 'win', stars: scoreOf(state, c).stars, difficulty: state.difficulty, length: state.length, tutorial: !!tutorial, campaign: !!state.town && !isGeneratedTown(state.town) });
        collection = loadCollection(base);
        collection.currency += lastReward;
        saveCollection(collection);
      }
      // A won game may beat the record of its mode and difficulty.
      // A won single game may beat the record; a won campaign town opens the next one (CONCEPT.md §4.8, §9).
      if (state.outcome?.result === 'win' && state.town && isGeneratedTown(state.town) && !tutorial) newRecord = submitRecord(state.mode, state.difficulty, state.length, state.town, { stars: scoreOf(state, c).stars, days: report.turn });
      if (state.outcome?.result === 'win' && state.town && !isGeneratedTown(state.town) && campaign) {
        winTown(base, campaign, state.town, state.difficulty, { stars: scoreOf(state, c).stars, days: report.turn });
        saveCampaign(campaign);
      }
      drafts = new Map();
      details.clear();
      // The exposure and reconciliation notices wait for the start of the next turn.
      exposuresSeen = true;
      reconcileSeen = true;
      issueOpen = false;
      busy = true;
      scene?.setState(state, true);
      render();
      // The morning after the issue (CONCEPT.md §7.3): first the scenes — where the main story hit, then
      // the day's bright moments if there were any —, then the day's summary, which waits for the
      // player; then reporters look for the next stories.
      const r = report;
      void (async () => {
        if (scene && !settings.skipCutscenes) {
          await playMorning(r);
          if (r.highlights.length) await playCutscene(r.highlights);
        }
        await showSummary(r);
        if (state.outcome) {
          busy = false;
          render();
        } else void runSearch();
      })();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      render();
    }
  };

  const highlightLabels: Record<Highlight['kind'], string> = {
    fight: tr('Драка'),
    clash: tr('Столкновения'),
    protest: tr('Протест'),
    exodus: tr('Отъезд'),
    closed: tr('Закрытие'),
    reconcile: tr('Примирение'),
  };

  const highlightSounds: Record<Highlight['kind'], SfxName> = { fight: 'fight', clash: 'fight', protest: 'chant', exodus: 'exodus', closed: 'shutter', reconcile: 'chime' };

  /** A story's illustration; a conflict story about any pair shows exactly its two groups. */
  const newsArt = (templateId: string, pair?: [string, string]) =>
    `${assetBase}sprites/news/${templateId}${pair && templateOf(c, templateId).conflict === 'any' ? `__${pair[0]}__${pair[1]}` : ''}.png`;

  const summaryChip = (icon: string, text: string, cls = '') => h('span', { class: `morning-chip ${cls}` }, h('img', { src: icon, alt: '', width: 16, height: 16 }), text);
  const signedNum = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;
  /** Joy is the other side's win when we attack the town, fear when we defend it. */
  const reactionGoal = (x: Reaction) => (x === 'happy' ? (state.mode === 'destroy' ? ' down' : ' up') : x === 'scared' ? (state.mode === 'destroy' ? ' up' : ' down') : '');

  /** «Газета»: readers and reputation after the issue. */
  function paperChips(r: TurnReport): HTMLElement {
    const readers = r.readers.after - r.readers.before;
    const chips = [
      summaryChip(`${assetBase}sprites/ui/readers.png`, `${signedNum(readers)} ${plural(Math.abs(readers), 'читатель', 'читателя', 'читателей')}`, readers > 0 ? 'up' : readers < 0 ? 'down' : ''),
    ];
    const trust = Math.round(r.trustAfter - r.trustBefore);
    if (trust !== 0) chips.push(summaryChip(`${assetBase}sprites/ui/reputation.png`, tr('{0}% репутации', signedNum(trust)), trust > 0 ? 'up' : 'down'));
    return h('span', { class: 'morning-chips' }, ...chips);
  }

  /**
   * «Город»: its stage. How people took the news is told per story above: a resident keeps one
   * reaction a day, so totals for the whole issue would not add up with the stories' numbers.
   */
  function cityChips(r: TurnReport): HTMLElement {
    const city = Math.round(r.metricsAfter.cityIndex - r.metricsBefore.cityIndex);
    return h(
      'span',
      { class: 'morning-chips' },
      summaryChip(
        `${assetBase}sprites/ui/city_state_${cityStateOf(c, r.metricsAfter.cityIndex)}.png`,
        `${stageChange(r.metricsBefore.cityIndex, r.metricsAfter.cityIndex)}${city ? (city > 0 ? ' ▲' : ' ▼') : ''}`,
        // What is bad for the town is good for us.
        city === 0 ? '' : city < 0 ? 'up' : 'down',
      ),
    );
  }

  /** One printed story in the summary: its place, headline, truth, who read and believed it, what it did. */
  function summaryStory(p: PublicationReport, main = false): HTMLElement {
    const mood = p.mood ?? 'scared';
    // A bad story that only spoils the mood upsets people; fear is for stories that scare them off.
    const kinds = Object.keys(p.effects).filter((t) => (p.effects[t as keyof typeof p.effects] ?? 0) > 0);
    const feeling = mood === 'scared' && kinds.length > 0 && kinds.every((t) => t === 'moodDown') ? effectLabels.moodDown : morningLabels[mood];
    // What believers did beyond joy and fear; the mood itself is the first chip.
    const deeds = (Object.entries(p.effects) as [keyof typeof effectLabels, number][])
      .filter(([t, n]) => n > 0 && t !== 'moodUp' && t !== 'moodDown')
      .map(([t, n]) => `${n} ${effectLabels[t]}`);
    return h(
      'div',
      { class: `summary-story${main ? ' main' : ''}` },
      h(
        'div',
        { class: 'summary-story-head' },
        h('span', { class: 'summary-place' }, placementLabels[p.placement]),
        h('span', { class: `summary-truth t${p.truth}` }, truthLabels[p.truth]),
        p.exposed ? h('span', { class: 'summary-exposed' }, tr('Разоблачена')) : null,
      ),
      h(main ? 'b' : 'span', { class: 'summary-story-title' }, p.title),
      h(
        'span',
        { class: 'story-facts' },
        // Believers and doubters count those who heard it from friends too, so the sum shows both.
        h('span', { class: 'story-read' }, tr('прочитали {0}', p.reached), p.wordOfMouth ? tr(' · ещё {0} узнали от знакомых', p.wordOfMouth) : ''),
        // The reaction follows the story: fear for a harmful one, joy for a good one, a plain fact is just noted.
        p.believed
          ? summaryChip(
              `${assetBase}sprites/fx/${REACTION_ICON[mood]}.png`,
              mood === 'calm' ? `${p.believed} ${morningLabels.calm}` : tr('{0} поверили и {1}', p.believed, feeling),
              `react-${mood}${reactionGoal(mood)}`,
            )
          : null,
        p.doubted ? summaryChip(`${assetBase}sprites/fx/${REACTION_ICON.doubted}.png`, `${p.doubted} ${morningLabels.doubted}`, 'react-doubted') : null,
      ),
      deeds.length ? h('span', { class: 'story-deeds' }, deeds.join(' · ')) : null,
    );
  }

  /** The issue's main story: the front page, else the most believed one. */
  const mainStory = (r: TurnReport) => [...r.publications].sort((a, b) => b.placement - a.placement || b.believed - a.believed)[0];

  /** The morning after the issue (CONCEPT.md §7.3): the camera flies to where the main story hit. */
  async function playMorning(r: TurnReport): Promise<void> {
    const main = mainStory(r);
    cutsceneCaption.className = 'cutscene-caption kind-morning';
    cutsceneCaption.replaceChildren(
      h('span', { class: 'cutscene-kicker' }, tr('Утро · выпуск № {0} · {1}', r.turn, issueLevelLabels[r.issue.level].toLowerCase())),
      h('b', {}, main ? main.title : tr('Газета не вышла')),
    );
    cutsceneCaption.hidden = false;
    cutscene.hidden = false;
    tooltip.hidden = true;
    cutscene.parentElement!.classList.add('in-cutscene');
    // The crowd acts out how the main story was taken: believed (scared or happy) or doubted.
    const reaction = !main || main.believed + main.doubted === 0 ? null : main.believed >= main.doubted ? (main.mood ?? 'scared') : 'doubted';
    window.setTimeout(() => {
      if (reaction === 'scared') sound.play('crowdScared');
      else if (reaction === 'happy') sound.play('crowdHappy');
      else if (reaction === 'doubted') sound.play('crowdDoubt');
    }, 900);
    await scene!.playMorning(main?.building ?? null, reaction);
    cutscene.hidden = true;
    cutscene.parentElement!.classList.remove('in-cutscene');
  }

  /** The twist's news for the day's summary: it began, the town elected a mayor, the audit ended. */
  function twistLines(r: TurnReport): string[] {
    const t = state.twist;
    if (!r.twist || !t) return [];
    const def = twistOf(c, t.id);
    if (r.twist.started) return [tr('Начинается: {0}', def.title.toLowerCase())];
    if (t.result === 'peacemaker' || t.result === 'hardliner') return [tr('Выборы: новый мэр — {0}', mayorName())];
    if (def.kind === 'governor') return [tr('Губернатор уехал')];
    return [t.result === 'passed' ? tr('{0} пройдена', def.title) : tr('{0} провалена: бюджет урезан', def.title)];
  }

  /**
   * The day's summary after the scenes (CONCEPT.md §7.3): the main story, what it brought and what
   * happened in town. It stays until the player presses «Следующий день» (or Enter).
   */
  function showSummary(r: TurnReport): Promise<void> {
    // The issue first: its front page, then the rest behind one unfold (CONCEPT.md §7.3 «Итоги дня»).
    const stories = [...r.publications].sort((a, b) => b.placement - a.placement || b.believed - a.believed);
    const main = stories[0];
    const rest = stories.slice(1);
    const group = (title: string, ...body: (HTMLElement | null)[]) => h('section', { class: 'summary-group' }, h('h4', {}, title), ...body);
    const events: HTMLElement[] = [
      ...r.highlights.map((x) => h('li', {}, x.title)),
      ...r.exposures.map((x) => h('li', { class: 'bad' }, tr('Разоблачили: «{0}»', x.title))),
      ...r.deals.broken.map((x) => h('li', { class: 'bad' }, tr('Сделка «{0}» сорвана', x))),
      ...r.staff.quit.map((id) => h('li', { class: 'bad' }, `${reporterOf(c, id).name} ${reporterOf(c, id).female ? tr('уволилась') : tr('уволился')}`)),
      ...(r.cleanStreak.bonus ? [h('li', { class: 'good' }, tr('✓ {0} выпусков подряд без лжи: +{1}% репутации', c.balance.cleanStreakDays, Math.round(r.cleanStreak.bonus)))] : []),
      ...(r.cleanStreak.broken ? [h('li', { class: 'bad' }, tr('Серия выпусков без лжи прервалась'))] : []),
      ...r.tasks.done.map((id) => h('li', { class: 'good' }, tr('✓ Задание выполнено: {0} ({1})', taskOf(c, id).title, prizeText(taskOf(c, id))))),
      ...r.tasks.failed.map((id) => h('li', { class: 'bad' }, tr('✗ Задание провалено: {0}', taskOf(c, id).title))),
      ...twistLines(r).map((x) => h('li', {}, x)),
      ...(r.hunt?.won ? [h('li', { class: 'good' }, tr('🎯 Травля удалась: {0}. Город потрясён', lowerFirst(r.hunt.won)))] : []),
    ];
    return new Promise((done) => {
      const finish = () => {
        document.removeEventListener('keydown', onKey);
        daySummary.hidden = true;
        if (state.outcome) sound.play(state.outcome.result === 'win' ? 'win' : 'lose');
        done();
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        finish();
      };
      const next = h('button', { class: 'primary big summary-next', onclick: finish }, state.outcome ? tr('Чем всё кончилось ▸') : tr('Следующий день ▸'));
      daySummary.replaceChildren(
        h('span', { class: 'summary-kicker' }, tr('Итоги дня {0}', r.turn)),
        h(
          'section',
          { class: 'summary-issue' },
          h(
            'div',
            { class: 'summary-issue-head' },
            h('b', {}, tr('Выпуск № {0}', r.turn)),
            h('span', { class: `summary-level level-${r.issue.level}` }, issueLevelLabels[r.issue.level]),
            h('span', { class: 'summary-count' }, main ? `${stories.length} ${plural(stories.length, 'новость', 'новости', 'новостей')}` : ''),
          ),
          main ? summaryStory(main, true) : h('b', { class: 'summary-title' }, tr('Газета не вышла')),
          rest.length
            ? h(
                'details',
                { class: 'summary-more' },
                h('summary', {}, tr('Весь выпуск: ещё {0} {1}', rest.length, plural(rest.length, 'новость', 'новости', 'новостей'))),
                ...rest.map((p) => summaryStory(p)),
              )
            : null,
        ),
        group(tr('Газета'), paperChips(r)),
        group(tr('Город'), cityChips(r)),
        ...(events.length ? [group(tr('События дня'), h('ul', { class: 'summary-events' }, ...events))] : []),
        next,
      );
      tooltip.hidden = true;
      daySummary.hidden = false;
      sound.play('paper');
      if (r.exposures.length) window.setTimeout(() => sound.play('exposed'), 350);
      document.addEventListener('keydown', onKey);
      next.focus({ preventScroll: true });
    });
  }

  /** Plays the city cutscene with a caption for each bright moment. */
  async function playCutscene(highlights: Highlight[]): Promise<void> {
    cutscene.hidden = false;
    cutscene.parentElement!.classList.add('in-cutscene');
    tooltip.hidden = true;
    await scene!.playHighlights(highlights, (hl) => {
      cutsceneCaption.hidden = !hl;
      if (!hl) return;
      sound.play(highlightSounds[hl.kind]);
      cutsceneCaption.className = `cutscene-caption kind-${hl.kind}`;
      cutsceneCaption.replaceChildren(h('span', { class: 'cutscene-kicker' }, tr('Срочно · {0}', highlightLabels[hl.kind])), h('b', {}, hl.title));
    });
    cutscene.hidden = true;
    cutscene.parentElement!.classList.remove('in-cutscene');
  }

  // ---------- Tooltip ----------

  function showTooltip(t: HoverTarget | null): void {
    // The city is under the title screen, the issue or a window: no hints over it then (CONCEPT.md §7.3).
    // Anything drawn above the city at the pointer (menus, the opening story, plaques) hides them too.
    const covered = t && !cityHost.contains(document.elementFromPoint(t.clientX, t.clientY));
    if (!t || titleOpen || issueOpen || modal || covered) {
      tooltip.hidden = true;
      return;
    }
    const lines: (HTMLElement | string)[] = [];
    if (t.kind === 'resident') {
      const r = state.residents[t.id];
      if (!r) return;
      lines.push(
        h('strong', {}, groupOf(c, r.group).name),
        h('span', {}, tr('Настроение: {0} · настрой: {1}', pct(r.mood), pct(r.outlook))),
        h('span', {}, tr('Работа: {0}', r.job === null ? tr('нет') : buildingDefOf(c, state.buildings[r.job].type).name)),
        h('span', {}, tr('Ваша репутация: {0}', Math.round(r.trust))),
      );
      if (r.status === 'left') lines.push(h('span', { class: 'bad' }, tr('Уезжает из города')));
      if (r.protestTurns > 0) lines.push(h('span', { class: 'bad' }, tr('Протестует')));
      if (r.beliefs.length) {
        lines.push(h('span', { class: 'muted' }, tr('Верит:')), ...r.beliefs.slice(-3).map((b) => h('span', {}, `• ${b.title}`)));
      }
    } else {
      const b = state.buildings[t.id];
      const workers = state.residents.filter((r) => r.status === 'active' && r.job === b.id).length;
      const residents = state.residents.filter((r) => r.status === 'active' && r.home === b.id).length;
      lines.push(h('strong', {}, buildingDefOf(c, b.type).name));
      if (b.type === 'home') lines.push(h('span', {}, residents ? tr('Жильцов: {0}', residents) : tr('Дом опустел')));
      else {
        lines.push(h('span', {}, tr('Работников: {0} из {1}', workers, b.jobs)));
        lines.push(h('span', { class: b.open ? '' : 'bad' }, b.open ? tr('Работает') : tr('Закрыто')));
      }
    }
    tooltip.replaceChildren(...lines);
    tooltip.hidden = false;
    const x = Math.min(t.clientX + 14, window.innerWidth - tooltip.offsetWidth - 8);
    const y = Math.min(t.clientY + 14, window.innerHeight - tooltip.offsetHeight - 8);
    tooltip.style.transform = `translate(${x}px, ${y}px)`;
  }

  // ---------- Pieces ----------

  function meter(value: number, cls = ''): HTMLElement {
    return h('div', { class: `meter ${cls}` }, h('div', { style: `width:${pct(Math.max(0, Math.min(1, value)))}` }));
  }

  const bar = (label: string, v: number, cls = 'ok') =>
    h('div', { class: 'card-stat' }, h('span', {}, label), meter(v, cls), h('em', {}, pct(v)));

  /**
   * A trend arrow; `unit` null hides the number (the city index is never shown). The colour follows the
   * player's goal: for the town's own numbers (`town`) a fall is green and a rise red.
   */
  function trend(delta: number | null, unit: string | null = '', town = false): HTMLElement | null {
    if (delta === null || delta === 0) return null;
    const up = delta > 0;
    const good = town ? !up : up;
    const title = unit === null ? (up ? tr('Городу стало лучше за день') : tr('Городу стало хуже за день')) : tr('{0}{1}{2} за день', up ? '+' : '', delta, unit);
    return h('span', { class: `trend ${good ? 'up' : 'down'}`, title }, up ? '▲' : '▼');
  }

  /** Where the laid-out issue takes the city: «→ кризис» when the stage changes, an arrow otherwise. */
  function cityForecastNote(fc: Forecast | null): HTMLElement | null {
    if (!fc) return null;
    const here = cityStateOf(c, state.metrics.cityIndex);
    const next = cityStateOf(c, fc.cityIndex);
    const diff = Math.round(fc.cityIndex - state.metrics.cityIndex);
    if (next === here && diff === 0) return null;
    // Stage numbers grow towards ruin: a bigger one is worse for the city.
    const worse = next !== here ? next > here : diff < 0;
    const text = next !== here ? `≈→ ${c.balance.cityStates[next].name.toLowerCase()}` : tr('город ≈{0}', worse ? '▼' : '▲');
    // What is worse for the town is good for us: green.
    return h('small', { class: `res-forecast ${worse ? 'up' : 'down'}`, title: tr('Ожидается, если выпустить газету так и никакую ложь не поймают') }, text);
  }

  /** The list of stories that can fill an empty place: every other story of today, best first. */
  function storyChooser(key: Placement, ordered: CardInstance[], whereOf: (card: CardInstance) => Placement | 'out'): HTMLElement {
    const others = ordered.filter((x) => whereOf(x) !== key);
    const placeName = (w: Placement | 'out') => (w === 'out' ? tr('не в печати') : tr('сейчас: {0}', placementLabels[w].toLowerCase()));
    return h(
      'div',
      { class: 'place-menu chooser-menu', role: 'menu' },
      ...(others.length
        ? others.map((x) =>
            h(
              'button',
              {
                role: 'menuitem',
                onclick: () => {
                  chooserFor = null;
                  place(x, key);
                  render();
                },
              },
              h(
                'span',
                { class: 'opt' },
                h('span', { class: 'opt-title' }, storyTitle(c, x, draftOf(x).distortion)),
                h('span', { class: 'opt-head' }, tierMeter(x.tier), h('small', {}, placeName(whereOf(x)))),
              ),
            ),
          )
        : [h('p', { class: 'hint' }, tr('Других новостей сегодня нет.'))]),
    );
  }

  /** The expected change of a value if the issue goes out as laid out: «≈+37», grey and dotted. */
  function forecastTag(expected: number): HTMLElement | null {
    const n = Math.round(expected);
    if (n === 0) return null;
    return h('small', { class: `res-forecast ${n > 0 ? 'up' : 'down'}`, title: tr('Ожидается, если выпустить газету так и никакую ложь не поймают') }, `≈${n > 0 ? '+' : '−'}${Math.abs(n)}`);
  }

  /**
   * The goal track (CONCEPT.md §7.3): the city's five stages from «Процветает» to «Руины», a marker
   * where the city is (inside its stage too: the stage is coloured as far as the city has gone through it), a ghost marker where the laid-out issue will move it, and the mode's goal —
   * a flag on the stage to reach (destroy) or a line not to fall past (save).
   */
  function renderGoal(fc: Forecast | null): void {
    // A town's own main goal (CONCEPT.md §9.2): its words, a bar and how far it is.
    const own = goalOf(c);
    if (state.mode === 'destroy' && own.type !== 'stage') {
      const p = goalProgress(state, c);
      const share = p.done ? 1 : own.type === 'close' && p.staff ? Math.max(p.now / Math.max(1, p.need), 1 - p.staff.workers / Math.max(1, p.staff.jobs)) : own.type === 'gang' ? Math.max(0, Math.min(1, (100 - p.now) / Math.max(1, 100 - p.need))) : Math.min(1, p.now / Math.max(1, p.need));
      hudGoal.replaceChildren(
        h('b', { class: 'goal-title' }, tr('Цель')),
        h(
          'div',
          { class: 'goal-own' },
          h('span', { class: 'goal-text' }, goalTitle(c, own)),
          h('span', { class: 'goal-bar' }, h('i', { style: `width: ${Math.round(share * 100)}%` })),
          h('small', { class: 'goal-note' }, goalLine(p)),
        ),
      );
      hudGoal.title = `${goalTitle(c, own)}.`;
      return;
    }
    const stages = c.balance.cityStates;
    const here = cityStateOf(c, state.metrics.cityIndex);
    const next = fc ? cityStateOf(c, fc.cityIndex) : here;
    // The goal stage: the first one below the winning bound.
    const goal = stages.findIndex((x) => x.min < c.balance.winCityIndex);
    const gap = 3;
    // A place on the track: stage i plus the share of it gone through, the gaps between the steps counted.
    const at = (i: number, share: number) => `calc((100% - ${gap * (stages.length - 1)}px) * ${(i + share) / stages.length} + ${i * gap}px)`;
    const passed = (index: number) => {
      const i = cityStateOf(c, index);
      const top = i === 0 ? 100 : stages[i - 1].min;
      return Math.max(0, Math.min(1, (top - index) / Math.max(1, top - stages[i].min)));
    };
    const pos = (i: number) => at(i, 0.5);
    const share = passed(state.metrics.cityIndex);
    const ghost = fc ? at(next, passed(fc.cityIndex)) : null;
    hudGoal.replaceChildren(
      h('b', { class: 'goal-title' }, tr('Цель')),
      h(
        'div',
        { class: 'goal-track' },
        // Stages the city has been through keep their colours; those ahead are greyed out, so the
        // way to the goal reads at a glance.
        ...stages.map((_, i) =>
          h('span', {
            class: `goal-step s${i}${i > here ? ' ahead' : ''}${i === here ? ' part' : ''}${i === goal ? ' target' : ''}`,
            style: i === here ? `--passed: ${Math.round(share * 100)}%` : undefined,
          }),
        ),
        h('i', { class: 'goal-flag', style: `left: ${pos(goal)}`, title: tr('Цель') }, '🏁'),
        ghost && fc && Math.round(fc.cityIndex) !== Math.round(state.metrics.cityIndex) ? h('i', { class: 'goal-marker ghost', style: `left: ${ghost}` }) : null,
        h('i', { class: 'goal-marker', style: `left: ${at(here, share)}` }),
      ),
      h('div', { class: 'goal-names' }, ...stages.map((x, i) => h('span', { class: [i === here ? 'here' : '', i === goal ? 'goal' : ''].join(' ').trim() }, x.name))),
    );
    hudGoal.title = `${cityGoal()}.`;
  }

  /** A story's level as a meter (CONCEPT.md §7.3): three bars, the lit ones by tier, and the word. */
  /** The story's level after its headline: a plain mark, no tooltip. */
  function tierMeter(tier: number, raised = false): HTMLElement {
    return h(
      'span',
      { class: `tier-meter t${tier}` },
      h('span', { class: 'tier-bars', 'aria-hidden': 'true' }, ...[1, 2, 3].map((i) => h('i', { class: i <= tier ? 'on' : '' }))),
      h('b', {}, raised ? `${tierLabels[tier]} ↑` : tierLabels[tier]),
    );
  }

  /** Yesterday's change next to a value: «+28», «−2»; the city only gets an arrow. */
  function deltaTag(delta: number | null, unit: string | null = ''): HTMLElement | null {
    if (delta === null || delta === 0) return null;
    const up = delta > 0;
    const text = unit === null ? (up ? '▲' : '▼') : `${up ? '+' : '−'}${Math.abs(delta)}`;
    // The city (unit null) is coloured by the player's goal: a fall is green.
    const good = unit === null ? !up : up;
    return h('small', { class: `res-delta ${good ? 'up' : 'down'}`, title: unit === null ? (up ? tr('Городу стало лучше за день') : tr('Городу стало хуже за день')) : tr('{0}{1}{2} за день', up ? '+' : '−', Math.abs(delta), unit) }, text);
  }

  /** The city's stage: what the player sees instead of the city index (CONCEPT.md §2.3). */
  const cityStage = () => c.balance.cityStates[cityStateOf(c, state.metrics.cityIndex)];
  /** The stage a city falls into below an index bound (the win or lose line of a mode). */
  const stageBelow = (bound: number) => c.balance.cityStates.find((s) => s.min < bound)!.name;
  const stageChange = (before: number, after: number) => {
    const [was, now] = [cityStateOf(c, before), cityStateOf(c, after)].map((i) => c.balance.cityStates[i].name.toLowerCase());
    return was === now ? now : `${was} → ${now}`;
  };
  const cityGoal = () =>
    goalOf(c).type !== 'stage'
      ? tr('Цель — {0}', goalTitle(c, goalOf(c)).replace(/^./, (x) => x.toLowerCase()))
      : tr('Цель — довести город до стадии «{0}»', stageBelow(c.balance.winCityIndex));

  function resource(
    icon: string,
    label: string,
    value: string,
    delta: number | null,
    hint: string,
    cls = '',
    unit: string | null = '',
    onclick?: () => void,
    expected: number | null = null,
    note: HTMLElement | null = null,
  ): HTMLElement {
    return h(
      onclick ? 'button' : 'div',
      { class: `res ${cls}${onclick ? ' clickable' : ''}`, title: `${label}. ${hint}`, onclick },
      // Icon, the value with yesterday's change, and a caption under it (CONCEPT.md §7.3).
      h('img', { class: 'res-icon', src: `${assetBase}sprites/ui/${icon}.png`, alt: '', width: 32, height: 32 }),
      // While the issue is being laid out, the expected change replaces yesterday's.
      h('b', {}, value, expected !== null ? forecastTag(expected) : deltaTag(delta, unit)),
      // A forecast note (the city's) takes the caption's place while the issue is laid out.
      h('span', { class: 'res-label' }, note ?? label.toLowerCase()),
    );
  }

  /** What readers give, in the readers tile's hint: reach, and the next seat in the newsroom (CONCEPT.md §3.3). */
  function seatHint(): string {
    const next = nextSeatReaders(state, c);
    const seat = next === null ? tr('Все места в редакции открыты.') : tr('Следующее место в редакции откроется при {0} читателях.', next);
    return tr('Постоянные читатели — сила газеты: они читают каждый выпуск, а тираж открывает места в редакции. {0} Нажмите — кто пришёл и ушёл.', seat);
  }

  /** Top panel: three resources with icons (CONCEPT.md §7.3, §10.3); everything else lives in the debug menu. */
  function renderHud(): void {
    const trust = averageTrust(state, c);
    const r = report;
    const fc = currentForecast();
    renderGoal(fc);
    const items: (HTMLElement | null)[] = [
      resource(
        'readers',
        tr('Читатели'),
        `${readerCount(state)}`,
        r ? r.readers.after - r.readers.before : null,
        seatHint(),
        '',
        '',
        () => openModal('readers'),
        fc?.readers ?? null,
      ),
      resource(
        'reputation',
        tr('Репутация'),
        `${Math.round(trust)}%`,
        r ? Math.round(r.trustAfter - r.trustBefore) : null,
        tr('Чем выше, тем больше верят и реже проверяют. Упадёт до нуля — игра проиграна. Нажмите — подробности.'),
        trust < 20 ? 'bad' : '',
        '%',
        () => openModal('reputation'),
        fc?.trust ?? null,
      ),
      resource(
        `city_state_${cityStateOf(c, state.metrics.cityIndex)}`,
        tr('Город'),
        cityStage().name,
        r ? Math.round(r.metricsAfter.cityIndex - r.metricsBefore.cityIndex) : null,
        tr('{0}. Нажмите — подробности.', cityGoal()),
        'city-state',
        null,
        () => openModal('city'),
        null,
        cityForecastNote(fc),
      ),
    ];
    hudRes.replaceChildren(...items.filter((x): x is HTMLElement => x !== null));
    hudTeam.style.setProperty('--team-slots', String(c.balance.maxReporters));
    // While the issue is open: its level and «В печать»; folded: «Выпуск» brings it back.
    // On a phone the floating «В печать» steps aside while a window is open over the issue.
    const publishing = issueOpen && !state.outcome && !(modal && isPhone());
    hudActions.replaceChildren(
      ...(publishing ? [publishButton()] : []),
    );
    // A folded issue waits as a newspaper icon over the city.
    issueFab.hidden = issueOpen || folding || titleOpen || busy || !!state.outcome;
    // The tab bar's marks: a new offer or decision waits among the cards; the newsroom shows its
    // staff and pulses while the reporters search.
    const badge = (t: HTMLElement, text: string | null) => {
      const el = t.querySelector<HTMLElement>('.tab-badge')!;
      el.hidden = text === null;
      el.textContent = text ?? '';
    };
    const waiting = state.shopOffer.length > 0 && !state.shopPicks;
    badge(tabCards, waiting && !state.outcome ? '!' : null);
    badge(tabTeam, `${state.reporters.length}`);
    tabTeam.classList.toggle('busy', searching);
    const cashReady = cashMoves(state, c).filter((x) => !cashBlock(state, c, x.id)).length;
    badge(tabCash, cashReady && !state.outcome ? String(cashReady) : null);
    for (const [t, ids] of [
      [tabCards, ['shop']],
      [tabTeam, ['team']],
      [tabSummary, ['readers', 'reputation', 'city', 'population']],
      [tabCash, ['cash']],
    ] as const)
      t.classList.toggle('on', (ids as readonly string[]).includes(modal ?? ''));
  }

  /**
   * «В печать» shows what issue is going out: its icon and level, and the button looks duller or
   * louder by level, like story tier labels (CONCEPT.md §7.3). It bumps when the level changes.
   */
  /** An orange or red dot on «В печать» while the issue carries a lie that may be caught. */
  function riskDot(): HTMLElement | null {
    const { printed, untrue, risk } = issueRisk();
    const stamp = issueStampOf(untrue, risk, printed);
    if (stamp !== 'risk' && stamp !== 'danger') return null;
    return h('span', { class: `risk-dot ${stamp}`, title: stamp === 'danger' ? tr('Опасный выпуск: ложь могут поймать') : tr('В выпуске есть ложь') });
  }

  function publishButton(): HTMLElement {
    const disabled = busy || !!state.outcome;
    if (searching) return h('button', { class: 'primary publish', disabled: true }, tr('Репортёры ищут…'));
    const b = c.balance;
    const level = currentIssueLevel();
    const hint =
      tr('{0} выпуск. ', issueLevelLabels[level]) +
      (b.issueAcquisition[level] > 0 ? tr('Новых читателей ×{0}', b.issueAcquisition[level]) : tr('Новых читателей не будет')) +
      tr(', равнодушные уходят с шансом {0}', pct(b.issueChurn[level])) +
      (b.issueChurnBelievers[level] > 0 ? tr(', даже поверившие — {0}.', pct(b.issueChurnBelievers[level])) : '.') +
      tr(' Нажмите — опубликовать и завершить ход.');
    return h(
      'button',
      // A novice's first day: the button glows, it is the one thing to press (CONCEPT.md §7.3).
      { class: `publish level-${level}${levelBump ? ` ${levelBump}` : ''}`, title: hint, onclick: endTurn, disabled },
      h('img', { src: `${assetBase}sprites/ui/issue_${level}.png`, alt: '', width: 24, height: 24 }),
      // On a small laptop the level's word goes (its colour stays) so the top row keeps every button.
      h('span', {}, tr('В печать'), h('span', { class: 'publish-level' }, h('span', { class: 'publish-dot' }, ' · '), h('b', {}, level === 3 ? tr('СЕНСАЦИЯ!') : issueLevelLabels[level]))),
      riskDot(),
      h('span', { 'aria-hidden': 'true' }, '▸'),
    );
  }

  /** The day's events unfolded in the issue on a phone (folded by default, for the session). */
  let eventsOpen = false;
  function renderCityEvents(): void {
    const rec = state.reconciliation;
    const lines = [
      h('div', { class: 'day' }, tr('{0}День {1}', state.town ? `${base.towns.find((t) => t.id === state.town)?.name ?? ''} · ` : '', state.turn)),
      // Events no free reporter could write up are greyed (CONCEPT.md §3.3: one story a reporter a day).
      ...state.todayEvents.map((e) =>
        state.missedEvents.includes(e) ? h('div', { class: 'event missed', title: tr('Свободного репортёра не нашлось') }, tr('• {0} — никто не написал', e)) : h('div', { class: 'event' }, `• ${e}`),
      ),
      ...state.missedEvents.filter((e) => !state.todayEvents.includes(e)).map((e) => h('div', { class: 'event missed', title: tr('Свободного репортёра не нашлось') }, tr('• {0} — никто не написал', e))),
      ...(rec ? [h('div', { class: 'event peace' }, tr('☮ Примирение: {0} · ещё {1} {2}', pairNames(rec.pair, tr(' и ')), rec.turnsLeft, turnsWord(rec.turnsLeft)))] : []),
      ...(mayorName() ? [h('div', { class: 'event' }, tr('Мэр: {0}', mayorName()))] : []),
      // Crime (CONCEPT.md §5.6): how ripe the town is, the gang that stayed, a town without police.
      ...crimeLines().map((t) => h('div', { class: 'event crime' }, t)),
      // Investigations under way (CONCEPT.md §3.3а): who digs under whom, and the day before it is ready.
      ...state.investigations.map((x) => {
        const who = reporterOf(c, x.reporterId).name;
        const whom = digWhom(x.target);
        return h('div', { class: 'event digging' }, x.turnsLeft <= 1 ? tr('⛏ Завтра: эксклюзив про {0} ({1})', whom, who) : tr('⛏ {0} копает под {1} — ещё {2} {3}', who, whom, x.turnsLeft, turnsWord(x.turnsLeft)));
      }),
    ];
    cityEvents.replaceChildren(...lines);
    const copies = lines.map((l) => l.cloneNode(true) as HTMLElement);
    // On a phone the day's events in the issue fold to their day line, so the paper starts on the first screen.
    const more = copies.length - 1;
    if (more > 0) {
      const day = copies[0];
      day.classList.add('events-toggle');
      day.setAttribute('role', 'button');
      day.setAttribute('tabindex', '0');
      day.append(h('span', { class: 'events-count' }, eventsOpen ? ' ▴' : ` · ${tr('событий: {0}', more)} ▾`));
      day.addEventListener('click', () => {
        eventsOpen = !eventsOpen;
        renderCityEvents();
      });
    }
    issueEvents.classList.toggle('open', eventsOpen);
    issueEvents.replaceChildren(...copies);
  }

  /** «Преступность: неспокойно», «Банда держит улицы», «В городе нет полиции». */
  function crimeLines(): string[] {
    const p = crimePressure(state, c);
    const out: string[] = [];
    if (p >= 0.1) out.push(tr('🚨 Преступность: {0}', p >= 0.4 ? tr('разгул') : p >= 0.2 ? tr('растёт') : tr('неспокойно')));
    if (state.crimeBoost > 0) out.push(tr('🚨 Банда держит улицы'));
    if (policeLost(state)) out.push(tr('🚨 В городе нет полиции'));
    return out;
  }

  const pairNames = (key: string, sep: string) =>
    pairOf(key)
      .map((g) => groupOf(c, g).name.toLowerCase())
      .join(sep);
  const turnsWord = (n: number) => (n === 1 ? tr('ход') : n < 5 ? tr('хода') : tr('ходов'));

  /** The mayor elected mid-game, if any. */
  const mayorName = () => {
    const t = state.twist;
    if (!t || (t.result !== 'peacemaker' && t.result !== 'hardliner')) return null;
    return twistOf(c, t.id).candidates?.[t.result === 'peacemaker' ? 0 : 1] ?? null;
  };
  const daysWord = (n: number) => plural(n, 'день', 'дня', 'дней');

  /** What a done task gives: its prize (CONCEPT.md §4.8). */
  function prizeText(def: TaskDef): string {
    const p = def.prize;
    const parts: string[] = [];
    if (p?.type === 'voucher') parts.push(tr('бесплатное улучшение'));
    if (p?.type === 'trust') parts.push(tr('+{0}% репутации', p.amount));
    if (p?.type === 'xp') parts.push(tr('+{0} опыта репортёрам', p.amount));
    return parts.join(tr(' и ')) || tr('честь газеты');
  }

  /** Where a task stands, in a few words: «3 из 8», «сейчас 52%», «ещё 4 дня». */
  function taskLine(t: TaskState): string {
    const def = taskOf(c, t.id);
    if (t.status === 'done') return tr('выполнено · {0}', prizeText(def));
    if (t.status === 'failed') return def.penalty ? tr('провалено · репутация −{0}', def.penalty) : tr('провалено');
    const p = taskProgress(state, c, t);
    const left = t.untilTurn - state.turn + 1;
    const days = `${left > 1 ? tr('ещё {0} {1}', left, daysWord(left)) : tr('последний день')}`;
    const ch = def.check.type;
    const now =
      ch === 'noExposure' || ch === 'closed'
        ? ''
        : ch === 'cityBelow'
          ? tr('сейчас: {0} · ', cityStage().name.toLowerCase())
        : ch === 'trust' || ch === 'mood'
          ? tr('сейчас {0}% · ', p.value)
          : tr('{0} из {1} · ', Math.max(0, p.value), p.target);
    return `${now}${days} · ${prizeText(def)}`;
  }

  /** The tasks the plaque last showed: new ones always arrive folded. */
  let shownTasks: string | null = null;

  /** The game's tasks: folded to one line by default, like the newsroom's plaque (CONCEPT.md §4.8). */
  function renderTasks(): void {
    const list = state.tasks.filter((t) => t.status === 'active' || t.endTurn === state.turn - 1);
    const key = state.tasks.filter((t) => t.status === 'active').map((t) => `${t.id}@${t.untilTurn}`).join(',');
    if (shownTasks !== null && key && key !== shownTasks && settings.tasksOpen) {
      settings.tasksOpen = false;
      saveSettings(settings);
    }
    shownTasks = key;
    tasksNotice.hidden = !list.length || searching || !!state.outcome;
    if (tasksNotice.hidden) return;
    const own = state.tasks.filter((t) => !taskOf(c, t.id).twist);
    const giver = tr('Задания «Медиа-Плюс»');
    const icon = h('img', { src: `${assetBase}sprites/ui/task.png`, alt: '', width: 24, height: 24 });
    const toggle = (open: boolean) => (e: Event) => {
      e.stopPropagation();
      settings.tasksOpen = open;
      saveSettings(settings);
      render();
    };
    const doneCount = tr('{0} из {1}', own.filter((t) => t.status === 'done').length, own.length);
    tasksNotice.classList.toggle('folded', !settings.tasksOpen);
    if (!settings.tasksOpen) {
      tasksNotice.replaceChildren(
        h('button', { class: 'plaque-toggle', onclick: toggle(true) }, icon, h('span', {}, giver), h('span', { class: 'plaque-count task-count' }, doneCount), h('span', { class: 'chip-arrow' }, '▾')),
      );
      return;
    }
    tasksNotice.replaceChildren(
      h('div', { class: 'notice-head' }, icon, h('b', {}, giver), h('span', { class: 'plaque-stats' }, tr('выполнено {0}', doneCount)), h('button', { class: 'plaque-hide', title: tr('Свернуть'), 'aria-label': tr('Свернуть'), onclick: toggle(false) }, '▴')),
      h(
        'ul',
        { class: 'task-list' },
        ...list.map((t) =>
          h(
            'li',
            { class: `task task-${t.status}` },
            h('span', { class: 'task-mark' }, t.status === 'done' ? '✓' : t.status === 'failed' ? '✗' : '○'),
            h('span', { class: 'task-title' }, taskOf(c, t.id).title),
            h('span', { class: 'task-line' }, taskLine(t)),
          ),
        ),
      ),
    );
  }

  /** The mid-game twist while it runs: what it is, how long, and who would win the election today. */
  function renderTwist(): void {
    const t = runningTwist(state);
    twistNotice.hidden = !t || searching || !!state.outcome;
    if (!t || twistNotice.hidden) return;
    const def = twistOf(c, t.id);
    const left = t.untilTurn - state.turn;
    const icon = h('img', { src: `${assetBase}sprites/ui/${def.kind === 'election' ? 'ballot' : def.kind}.png`, alt: '', width: 24, height: 24 });
    const when =
      def.kind === 'election' ? (left > 1 ? tr('голосование через {0} {1}', left, daysWord(left)) : tr('голосование завтра')) : def.kind === 'governor' ? tr('ещё {0} {1}', left, daysWord(left)) : tr('задание — в списке заданий');
    const lead =
      def.kind === 'election' && def.candidates
        ? h('p', { class: 'notice-note twist-lead' }, tr('Если бы голосовали сегодня, победил бы {0}: город {1}.', def.candidates[electionLeader(state, c) === 'peacemaker' ? 0 : 1], electionLeader(state, c) === 'peacemaker' ? tr('спокоен') : tr('напуган')))
        : null;
    twistNotice.replaceChildren(
      h('div', { class: 'notice-head' }, icon, h('b', {}, def.title), h('span', { class: 'plaque-stats' }, when)),
      h('p', { class: 'notice-note' }, def.text),
      ...(lead ? [lead] : []),
    );
  }

  /** The tutorial's view of the screen: the laid-out issue, an open truth menu, the search. */
  function tutorialView(): TutorialView {
    return {
      state,
      c,
      laidOut: state.hand.filter((x) => draftOf(x).publish).map((x) => ({ card: x, placement: draftOf(x).placement, distortion: draftOf(x).distortion })),
      menuOpen: truthMenuFor !== null,
      searching: searching || busy,
    };
  }

  /** The step the tutorial is on now, or null outside it and once it is over. */
  const tutorialStep = () => (tutorial && !state.outcome ? currentStep(tutorial, tutorialView()) : null);

  /**
   * The tutorial's note above the paper (CONCEPT.md §7.3 «Обучение»): one task at a time, with its
   * number; it cannot be folded, any step can be skipped.
   */
  /** The step the player is reading in the sticker («◀ ▶»): null = the current one. Only reading — progress stays. */
  let tutorialPeek: number | null = null;
  /** Steps whose full text is folded in a window's bar. */
  const tutorialBarFolded = new Set<number>();

  /** «◀ шаг N из M ▶»: leafing through the steps to read an old hint again. */
  function tutorialNav(step: { index: number }, viewed: number): HTMLElement {
    const go = (i: number | null) => () => {
      tutorialPeek = i === step.index ? null : i;
      render();
    };
    return h(
      'span',
      { class: 'tut-nav' },
      h('button', { class: 'tut-nav-btn', title: tr('Предыдущий шаг'), 'aria-label': tr('Предыдущий шаг'), disabled: viewed <= 0, onclick: go(viewed - 1) }, '◀'),
      h('span', { class: 'tut-count' }, tr('Обучение · шаг {0} из {1}', viewed + 1, tutorialSteps.length)),
      h('button', { class: 'tut-nav-btn', title: tr('Следующий шаг'), 'aria-label': tr('Следующий шаг'), disabled: viewed >= step.index, onclick: go(viewed + 1) }, '▶'),
      viewed !== step.index ? h('button', { class: 'tut-nav-now ghost', onclick: go(null) }, tr('К текущему')) : null,
    );
  }

  /** A step's title and text; an earlier one says whether it is done (the steps ahead are never shown). */
  function tutorialText(step: { def: (typeof tutorialSteps)[number]; index: number; ready: boolean }, viewed: number): (HTMLElement | string)[] {
    if (viewed !== step.index) {
      const def = tutorialSteps[viewed];
      const done = (tutorial!.done ?? []).includes(def.id);
      return [h('b', { class: 'guide-title' }, def.title), h('span', { class: 'tut-state' }, done ? tr('Шаг пройден.') : tr('Шаг ещё не пройден.')), def.text];
    }
    return [
      h('b', { class: 'guide-title' }, step.def.title),
      step.ready ? step.def.text : (step.def.ready ?? step.def.text),
    ].filter((x): x is HTMLElement | string => x !== null);
  }

  /** The tutorial step last reported to the statistics. */
  let trackedStep = '';

  function renderTutorial(): void {
    const step = tutorialStep();
    guideNote.hidden = !step || !issueOpen;
    guideNote.classList.add('tutorial-note');
    guideNote.classList.remove('folded');
    if (!step) return;
    if (step.def.id !== trackedStep) {
      trackedStep = step.def.id;
      track('tutorial_step', { step: step.def.id, index: step.index, day: state.turn });
    }
    if (tutorialPeek !== null && tutorialPeek >= step.index) tutorialPeek = null;
    const viewed = tutorialPeek ?? step.index;
    const skip = () => {
      track('tutorial_skip', { step: step.def.id, index: step.index });
      skipStep(tutorial!, step.def.id);
      tutorialPeek = null;
      render();
    };
    const skipAll = () => {
      track('tutorial_skip_all', { step: step.def.id, index: step.index, day: state.turn });
      skipTutorial(tutorial!);
      tutorialPeek = null;
      render();
    };
    guideNote.replaceChildren(
      h('div', { class: 'guide-text' }, tutorialNav(step, viewed), ...tutorialText(step, viewed)),
      h(
        'div',
        { class: 'guide-buttons' },
        step.def.id === 'goal' || viewed !== step.index ? null : h('button', { class: 'guide-skip ghost', title: tr('Пропустить этот шаг'), onclick: skip }, tr('Пропустить шаг')),
        step.def.id === 'goal' ? null : h('button', { class: 'guide-skip ghost', title: tr('Убрать подсказки и играть дальше самому'), onclick: skipAll }, tr('Пропустить обучение')),
      ),
    );
  }

  /** Scrolled to once per step and target, so the player sees where to press. */
  let tutorialScrolled = '';

  /** The button to press now glows; over a window, a bar repeats the step in one line. */
  function renderTutorialTargets(): void {
    for (const el of document.querySelectorAll('.tut-target')) el.classList.remove('tut-target');
    spotlightOn(null);
    // The first-day note points at «В печать» (a glow, no shade: the player may look around first).
    if (modal === null && !busy && firstDayNote()) [...document.querySelectorAll<HTMLElement>('.publish')].find((x) => x.getClientRects().length > 0)?.classList.add('tut-target');
    const step = tutorialStep();
    tutorialBar.hidden = !step || modal === null || titleOpen;
    if (!step || titleOpen || busy || searching) return;
    if (!tutorialBar.hidden) {
      // The step in one line; its whole text unfolds under it — over a window the sticker is hidden,
      // and on a phone the window covers the whole issue.
      const folded = tutorialBarFolded.has(step.index);
      const viewed = tutorialPeek !== null && tutorialPeek < step.index ? tutorialPeek : step.index;
      tutorialBar.replaceChildren(
        h(
          'div',
          { class: 'tut-bar-line' },
          h('span', { class: 'tut-count' }, tr('Шаг {0}', step.index + 1)),
          h('span', { class: 'tut-bar-hint' }, step.def.hint),
          h(
            'button',
            {
              class: 'tut-bar-toggle ghost',
              'aria-expanded': String(!folded),
              onclick: () => {
                if (folded) tutorialBarFolded.delete(step.index);
                else tutorialBarFolded.add(step.index);
                render();
              },
            },
            folded ? tr('Подробнее ▾') : tr('Свернуть ▴'),
          ),
        ),
        ...(folded ? [] : [h('div', { class: 'tut-bar-full' }, tutorialNav(step, viewed), ...tutorialText(step, viewed))]),
      );
      // Under the window's title, so it never covers the button to press.
      modalLayer.querySelector('.modal-title')?.after(tutorialBar);
    }
    if (!step.ready) return;
    // Over a window only its buttons count; without one, only the game's.
    const scope: ParentNode = modal !== null ? modalLayer : document;
    const visible = (sel: string) => [...scope.querySelectorAll<HTMLElement>(sel)].find((x) => x.getClientRects().length > 0 && (modal !== null || !modalLayer.contains(x)));
    for (const sel of stepGlow(step.def.id)) visible(sel)?.classList.add('tut-target');
    for (const sel of stepTargets(step.def.id, tutorialView())) {
      const el = visible(sel);
      if (!el) continue;
      el.classList.add('tut-target');
      // The rest of the screen goes dark; a hint that is only something to look at stays undimmed.
      if (stepShades(step.def.id) && !el.matches('.streak-badge, .hud-goal')) spotlightOn(el);
      const key = `${step.index}|${sel}`;
      if (key !== tutorialScrolled) {
        tutorialScrolled = key;
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.bottom > innerHeight) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      return;
    }
    // The step is done elsewhere: the window's «×» glows, but the window stays bright — it may have
    // opened by itself (the board's offer) and its cards are worth taking.
    const close = modal !== null ? modalLayer.querySelector<HTMLElement>('.modal-title .icon-btn') : null;
    if (close) close.classList.add('tut-target');
  }

  /**
   * The tutorial's shade (CONCEPT.md §7.3 «Обучение»): the screen goes semi-dark except the button
   * to press and the step's own text; presses still go through. It follows the button every frame,
   * so scrolling and animations never leave the hole behind.
   */
  const shadePath = svg('path', { 'fill-rule': 'evenodd' });
  const shade = svg('svg', { class: 'tut-shade', 'aria-hidden': 'true' }, shadePath);
  shade.style.display = 'none';
  root.append(shade);
  let spotlight: HTMLElement | null = null;
  let spotFrame = 0;
  function spotlightOn(el: HTMLElement | null): void {
    spotlight = el;
    if (!el) {
      shade.style.display = 'none';
      cancelAnimationFrame(spotFrame);
      spotFrame = 0;
      return;
    }
    shade.style.display = '';
    if (!spotFrame) spotFrame = requestAnimationFrame(drawShade);
  }
  function drawShade(): void {
    spotFrame = 0;
    if (!spotlight || !spotlight.isConnected) return spotlightOn(null);
    const w = innerWidth;
    const hgt = innerHeight;
    const hole = (el: Element | null, pad: number) => {
      if (!el || !el.getClientRects().length) return '';
      const r = el.getBoundingClientRect();
      const x = Math.max(0, r.left - pad);
      const y = Math.max(0, r.top - pad);
      return ` M${x} ${y} H${Math.min(w, r.right + pad)} V${Math.min(hgt, r.bottom + pad)} H${x} Z`;
    };
    // The step's text stays readable: the note over the paper, or the step line in a window.
    const text = modal !== null ? (tutorialBar.isConnected && !tutorialBar.hidden ? tutorialBar : null) : guideNote.hidden ? null : guideNote;
    shadePath.setAttribute('d', `M0 0 H${w} V${hgt} H0 Z` + hole(spotlight, 8) + hole(text, 4));
    shade.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
    spotFrame = requestAnimationFrame(drawShade);
  }

  /** The sticker over the paper: the tutorial's step; an ordinary game shows no notes (CONCEPT.md §7.3). */
  /** The first day of a player's first ordinary game gets one short note on what to do (CONCEPT.md §7.3). */
  function firstDayNote(): boolean {
    return !tutorial && hasGame && !titleOpen && !state.outcome && state.turn <= 1 && issueOpen && !searching && !settings.notesSeen.includes('first_day');
  }

  function renderGuide(): void {
    if (tutorial) return renderTutorial();
    guideNote.classList.remove('tutorial-note');
    guideNote.hidden = !firstDayNote();
    if (guideNote.hidden) return;
    guideNote.classList.add('tutorial-note');
    guideNote.classList.remove('folded');
    guideNote.replaceChildren(
      h(
        'div',
        { class: 'guide-text' },
        h('b', { class: 'guide-title' }, tr('Ваш первый номер')),
        tr('Новости дня уже в газете, главная — на первой полосе. Можно поменять их местами или подать страшнее («Подача»). Затем — «В печать». Цель — вверху экрана.'),
      ),
      h(
        'div',
        { class: 'guide-buttons' },
        h(
          'button',
          {
            class: 'guide-skip ghost',
            onclick: () => {
              settings.notesSeen = [...settings.notesSeen, 'first_day'];
              saveSettings(settings);
              render();
            },
          },
          tr('Понятно'),
        ),
      ),
    );
  }

  /** The mayor's reconciliation notice, next to the exposure notice (CONCEPT.md §5.5). */
  function renderReconcile(): void {
    const rec = report?.reconciliationStarted;
    reconcileNotice.hidden = !rec || reconcileSeen || searching;
    if (!rec || reconcileNotice.hidden) return;
    reconcileNotice.replaceChildren(
      h(
        'div',
        { class: 'notice-head' },
        h('img', { src: `${assetBase}sprites/fx/peace.png`, alt: '', width: 24, height: 24 }),
        h('b', {}, tr('Мэрия объявила примирение: {0}', pairNames(rec.pair, tr(' и ')))),
        h(
          'button',
          {
            class: 'icon-btn',
            title: tr('Закрыть'),
            onclick: () => {
              reconcileSeen = true;
              render();
            },
          },
          '×',
        ),
      ),
      h('p', { class: 'notice-note' }, tr('{0} {1} их вражда будет остывать, а фактчекеры проверяют прессу строже.', rec.turnsLeft, turnsWord(rec.turnsLeft))),
    );
  }

  const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
  const upperFirst = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  const personPortrait = (id: string, cls = 'person-portrait') =>
    h('img', { class: cls, src: `${assetBase}sprites/people/${id}.png`, alt: '', width: 32, height: 32 });

  /** The letters column of today's paper: readers on yesterday's issue, the named residents first. */
  function renderLetters(): void {
    const letters = state.letters ?? [];
    lettersBox.hidden = !letters.length || searching;
    if (lettersBox.hidden) return;
    lettersBox.replaceChildren(
      h('h4', { class: 'zone-label' }, tr('Письма читателей')),
      h(
        'div',
        { class: 'letters-list' },
        ...letters.map((l) =>
          h(
            'div',
            { class: `letter letter-${l.kind}` },
            l.from ? personPortrait(l.from) : null,
            h('div', {}, h('p', { class: 'letter-text' }, `${quoted(l.text)}`), h('p', { class: 'letter-sign' }, `— ${l.name}`)),
          ),
        ),
      ),
    );
  }

  /** What happened to a named resident, in words. */
  function fateText(p: PersonDef, e: FateEvent): string {
    const a = p.female ? tr('а') : '';
    const place = e.building !== undefined && state.buildings[e.building] ? buildingName(state, c, e.building) : tr('работа');
    switch (e.kind) {
      case 'lostJob':
        return state.buildings[e.building ?? -1]?.open === false ? tr('{0} — остал{1} без работы', closedLine(state, c, e.building!), p.female ? tr('ась') : tr('ся')) : tr('потерял{0} работу ({1})', a, lowerFirst(place));
      case 'gotJob':
        return tr('{0} работу: {1}', p.female ? tr('нашла') : tr('нашёл'), lowerFirst(place));
      case 'left':
        return tr('уехал{0} из города', a);
      case 'protest':
        return tr('выш{0} на протест', p.female ? tr('ла') : tr('ел'));
      case 'fear':
        return tr('боится выходить из дома');
    }
  }

  /** The named residents (CONCEPT.md §2.2а): who they are, how they live now, what happened to them. */
  function peopleContent(): HTMLElement[] {
    return c.people.flatMap((p) => {
      const r = personResident(state, p.id);
      if (!r) return [];
      const a = p.female ? tr('а') : '';
      const now =
        r.status === 'left'
          ? tr('Уехал{0} из города.', a)
          : [
              r.job !== null ? tr('Работает: {0}', lowerFirst(buildingName(state, c, r.job))) : groupOf(c, p.group).jobs.length ? tr('Без работы') : tr('На пенсии'),
              r.protestTurns > 0 ? tr('протестует') : '',
              r.fearTurns > 0 ? tr('боится выходить из дома') : '',
              r.mood < 0.35 ? tr('в отчаянии') : r.mood > 0.7 ? (p.female ? tr('довольна жизнью') : tr('доволен жизнью')) : '',
              r.follows.length ? tr('читает «Вестник»') : '',
            ]
              .filter(Boolean)
              .join(' · ');
      const log = state.fates.filter((e) => e.person === p.id).slice(0, 3);
      return [
        h(
          'div',
          { class: `person-card${r.status === 'left' ? ' gone' : ''}` },
          personPortrait(p.id, 'person-portrait big'),
          h(
            'div',
            {},
            h('b', {}, `${p.name}, ${p.role}`),
            h('p', { class: 'hint' }, p.bio),
            h('p', { class: r.status === 'left' || (r.job === null && groupOf(c, p.group).jobs.length) ? 'bad' : '' }, now),
            ...log.map((e) => h('p', { class: 'person-log' }, tr('День {0}: {1}', e.turn, fateText(p, e)))),
          ),
        ),
      ];
    });
  }

  /** The newsroom's news of the day (CONCEPT.md §3.3б): who grew, who quit, who leaked our lies. */
  function renderStaff(): void {
    const st = report?.staff;
    const lines = st
      ? [
          ...st.levelUps.map((id) => tr('{0} {1} повышение: теперь {2}, пишет лучше и находит больше.', reporterOf(c, id).name, reporterOf(c, id).female ? tr('получила') : tr('получил'), levelNames[levelOf(c, staffOf(state, c, id).xp)].toLowerCase())),
          ...st.quit.map((id) => {
            const r = reporterOf(c, id);
            const a = r.female ? tr('а') : '';
            return st.leaked.includes(id)
              ? tr('{0} уволил{1} из-за лжи в газете — и рассказал{2} фактчекерам, что мы врали.', r.name, r.female ? tr('ась') : tr('ся'), a)
              : tr('{0} не выдержал{1} и уволил{2}.', r.name, a, r.female ? tr('ась') : tr('ся'));
          }),
        ]
      : [];
    staffNotice.hidden = !lines.length || staffSeen || searching;
    if (staffNotice.hidden) return;
    const toggle = (open: boolean) => (e: Event) => {
      e.stopPropagation();
      settings.staffOpen = open;
      saveSettings(settings);
      render();
    };
    staffNotice.classList.toggle('folded', !settings.staffOpen);
    // Folded by default: one line with the first news, like the tasks' plaque; the choice is remembered.
    if (!settings.staffOpen) {
      staffNotice.replaceChildren(
        h(
          'button',
          { class: 'plaque-toggle', onclick: toggle(true) },
          h('b', {}, tr('Редакция')),
          h('span', { class: 'staff-first' }, lines[0]),
          lines.length > 1 ? h('span', { class: 'plaque-count' }, tr('ещё {0}', lines.length - 1)) : null,
          h('span', { class: 'chip-arrow' }, '▾'),
        ),
      );
      return;
    }
    staffNotice.replaceChildren(
      h(
        'div',
        { class: 'notice-head' },
        h('b', {}, tr('Редакция')),
        h('button', { class: 'plaque-hide', title: tr('Свернуть'), 'aria-label': tr('Свернуть'), onclick: toggle(false) }, '▴'),
        h(
          'button',
          {
            class: 'icon-btn',
            title: tr('Закрыть'),
            onclick: () => {
              staffSeen = true;
              render();
            },
          },
          '×',
        ),
      ),
      ...lines.map((t) => h('p', { class: 'notice-note' }, t)),
    );
  }

  /** Today's offer with a catch (CONCEPT.md §3.5а): what is offered, what can go wrong, yes or no. */
  function renderOffer(): void {
    const offer = state.offer;
    offerNotice.hidden = !offer || searching || !!state.outcome;
    if (!offer || offerNotice.hidden) return;
    const def = offerOf(c, offer.id);
    const answer = (accept: boolean) => () => {
      try {
        const card = answerOffer(state, c, accept);
        if (card) revealed.add(card.uid);
        offerError = '';
      } catch {
        offerError = tr('Не хватит репутации.');
      }
      render();
    };
    const poach = def.kind === 'poach' && offer.reporterId;
    const retainLabel = () => {
      const cost = retainCost(state, c);
      return 'voucher' in cost ? tr('Удержать за ваучер') : tr('Удержать · репутация −{0}', cost.trust);
    };
    offerNotice.replaceChildren(
      h(
        'div',
        { class: 'notice-head' },
        poach ? portrait(offer.reporterId!, 'portrait notice-portrait') : h('img', { src: `${assetBase}sprites/ui/offer.png`, alt: '', width: 24, height: 24 }),
        h('b', {}, def.title),
      ),
      h('p', { class: 'notice-note' }, offerText(state, c, def, offer)),
      h('p', { class: 'notice-note offer-catch' }, def.catch),
      h(
        'div',
        { class: 'offer-buttons' },
        h(
          'button',
          { class: 'primary', onclick: answer(true), disabled: !!(poach && retainBlock(state, c)) },
          poach ? retainLabel() : def.kind === 'kompromat' ? tr('Взять документы') : tr('Согласиться'),
        ),
        poach && retainBlock(state, c) ? h('span', { class: 'bad' }, retainBlock(state, c)) : null,
        h('button', { onclick: answer(false) }, poach ? tr('Отпустить') : tr('Отказаться')),
        offerError ? h('span', { class: 'bad' }, offerError) : null,
      ),
    );
  }

  /**
   * Relations between groups (CONCEPT.md §5.5): groups stand on an invisible circle, every pair is
   * joined by a line — green in peace, yellow with friction, red on the brink. A click on a group
   * brings out its lines and dims the rest.
   */
  function relationsContent(): HTMLElement[] {
    const W = 320;
    const H = 280;
    const cx = W / 2;
    const cy = H / 2;
    const R = 100;
    const n = c.groups.length;
    const angle = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
    const pos = new Map(c.groups.map((g, i) => [g.id, { x: cx + R * Math.cos(angle(i)), y: cy + R * Math.sin(angle(i)) }]));
    const colorOf = (level: number) => (level === 0 ? '#63c74d' : level === 1 ? '#feae34' : '#e43b44');
    const focus = (on: string | null) => () => {
      relFocus = on;
      render();
    };
    const lines: SVGElement[] = [];
    for (const key of pairKeys(c)) {
      const [a, z] = pairOf(key);
      const t = state.tension[key] ?? 0;
      const level = tensionLevel(c, t);
      const pa = pos.get(a)!;
      const pz = pos.get(z)!;
      const touches = relFocus === a || relFocus === z;
      const dim = relFocus !== null && !touches ? ' dim' : '';
      lines.push(
        svg('line', {
          x1: pa.x,
          y1: pa.y,
          x2: pz.x,
          y2: pz.y,
          stroke: colorOf(level),
          'stroke-width': (3 + t / 20 + (touches ? 2.5 : 0)).toFixed(1),
          'stroke-linecap': 'round',
          class: `rel-line level-${level}${dim}`,
        }),
      );
    }
    const nodes = c.groups.map((g, i) => {
      const p = pos.get(g.id)!;
      const dx = Math.cos(angle(i));
      const dy = Math.sin(angle(i));
      const side = Math.abs(dx) > 0.3;
      const anchor = !side ? 'middle' : dx > 0 ? 'start' : 'end';
      return svg(
        'g',
        { class: `rel-node${relFocus === g.id ? ' focus' : ''}`, tabindex: 0, role: 'button', onclick: focus(relFocus === g.id ? null : g.id) },
        // The group's portrait in a ring of its colour.
        svg('circle', { class: 'ring', cx: p.x, cy: p.y, r: 27, fill: g.color, stroke: '#181425', 'stroke-width': 3 }),
        svg('image', {
          href: `${assetBase}sprites/groups/${g.id}.png`,
          x: p.x - 22,
          y: p.y - 22,
          width: 44,
          height: 44,
          'clip-path': `url(#rel-clip-${g.id})`,
          preserveAspectRatio: 'xMidYMid slice',
        }),
        svg('text', { x: side ? p.x + dx * 36 : p.x, y: side ? p.y + 5 : p.y + dy * 42 + 5, 'text-anchor': anchor }, g.name),
      );
    });
    const chart = svg(
      'svg',
      { class: 'relations', viewBox: `-70 -10 ${W + 140} ${H + 20}`, role: 'img', 'aria-label': tr('Отношения между группами') },
      svg('defs', {}, ...c.groups.map((g) => svg('clipPath', { id: `rel-clip-${g.id}` }, svg('circle', { cx: pos.get(g.id)!.x, cy: pos.get(g.id)!.y, r: 22 })))),
      svg('rect', { x: -70, y: -10, width: W + 140, height: H + 20, fill: 'transparent', onclick: focus(null) }),
      ...lines,
      ...nodes,
    );
    // Pairs whose relations changed state over the last turn, in the chart's free corner.
    const r = report;
    const changes = r
      ? pairKeys(c).flatMap((key) => {
          const was = tensionLevel(c, r.tensionBefore[key] ?? 0);
          const now = tensionLevel(c, r.tensionAfter[key] ?? 0);
          if (was === now) return [];
          return [
            h(
              'div',
              { class: `rel-change ${now > was ? 'worse' : 'better'}` },
              h('span', {}, pairOf(key).map((g) => groupOf(c, g).name).join(' ↔ ')),
              h('b', {}, `${tensionLabels[was].toLowerCase()} → ${tensionLabels[now].toLowerCase()}`),
            ),
          ];
        })
      : [];
    const out: (HTMLElement | null)[] = [
      h('h3', { class: 'section' }, tr('Отношения между группами')),
      h('div', { class: 'relations-box' }, chart, changes.length ? h('div', { class: 'rel-changes' }, ...changes) : null),
      state.reconciliation ? h('p', { class: 'hint-line' }, tr('☮ Мэрия мирит: {0}.', pairNames(state.reconciliation.pair, tr(' и ')))) : null,
      // A group picked on the circle: dig dirt on it from here (CONCEPT.md §3.3а).
      relFocus && !state.outcome
        ? h(
            'button',
            {
              class: 'dig-btn',
              onclick: () => {
                digTarget = relFocus;
                error = '';
                openModal('dig');
              },
            },
            tr('⛏ Копать компромат на {0}', groupOf(c, relFocus).forms.manyGen),
          )
        : null,
    ];
    return out.filter((x): x is HTMLElement => x !== null);
  }


  function placementNote(place: Placement): string {
    const b = c.balance;
    const read = pct(b.placementRead[place]);
    const impact = b.placementImpact[place];
    const risk = b.placementExposureRisk[place];
    const text = [tr('Мельком в подвале'), tr('Обычная статья в номере'), tr('Главный материал номера')][place];
    return tr('{0}: прочтут {1} читателей, воздействие ×{2}, риск ×{3}.', text, read, impact, risk);
  }

  /** Placeholder "text" under a headline: grey lines of varying length, stable per card. */
  function lorem(uid: number, lines: number): HTMLElement {
    return h(
      'div',
      { class: 'lorem', 'aria-hidden': 'true' },
      ...Array.from({ length: lines }, (_, i) => {
        const last = i === lines - 1;
        const width = last ? 35 + ((uid * 13 + i * 7) % 30) : 72 + ((uid * 37 + i * 53) % 29);
        return h('span', { style: `width:${width}%` });
      }),
    );
  }

  /** Builds a news item for its place in the newspaper; the root element is reused between renders. */
  function newsContent(card: CardInstance, mods: Modifiers, where: Placement | 'out'): { cls: string; children: Node[] } {
    const tpl = templateOf(c, card.templateId);
    const d = draftOf(card);
    const p = previewPublication(state, c, mods, { cardUid: card.uid, placement: d.placement, distortion: d.distortion });
    const audience = tpl.audience?.length ? tpl.audience.map((g) => groupOf(c, g).name.toLowerCase()).join(', ') : tr('все жители');
    const investigation = tpl.source === 'investigation';
    const target = tpl.target ? groupOf(c, tpl.target).name : '';
    const reporter = reporterOf(c, card.reporterId);
    const open = details.has(card.uid);
    // Distortion raises the tier, and the item restyles itself at once (CONCEPT.md §3.1).
    const tier = p.tier;
    const raised = tier > card.tier;
    const act = (f: () => void) => () => {
      f();
      render();
    };

    const sourceLabel = { event: tr('событие'), fact: tr('факт'), rumor: tr('слух'), investigation: tr('компромат на группу «{0}»', target), offer: tr('документы от анонима') }[tpl.source];
    // Truth menu next to the headline (CONCEPT.md §7.3); the place is changed by dragging or by a tap
    // on the story and then on a place in the paper.
    const menuOpen = truthMenuFor === card.uid;
    const menuItem = (current: boolean, disabled: boolean, choose: () => void, ...content: (Node | string)[]) =>
      h(
        'button',
        {
          role: 'menuitem',
          class: current ? 'current' : '',
          disabled: current || disabled,
          onclick: act(() => {
            truthMenuFor = null;
            moveMenuFor = null;
            choose();
          }),
        },
        h('span', { class: 'check' }, current ? '✓' : ''),
        ...content,
      );
    // Phones: where the story can go, opened by a tap on it (CONCEPT.md §7.3).
    const placeIcon = (i: number) => h('img', { src: `${assetBase}sprites/ui/place_${i}.png`, alt: '', width: 16, height: 16 });
    const moveTo = (key: ZoneKey) => () => {
      moveMenuFor = null;
      if (key === 'out') unpublish(card);
      else place(card, key);
    };
    const slots = placementSlots(getModifiers(state, c));
    const taken = (pl: Placement) => state.hand.filter((x) => x.uid !== card.uid && drafts.get(x.uid)?.publish && drafts.get(x.uid)!.placement === pl).length >= slots[pl];
    const moveMenu =
      moveMenuFor === card.uid
        ? h(
            'div',
            { class: 'place-menu move-menu', role: 'menu' },
            ...([2, 1, 0] as Placement[]).map((pl) => {
              const item = menuItem(
                where === pl,
                false,
                moveTo(pl),
                placeIcon(pl),
                h(
                  'span',
                  { class: 'opt' },
                  h('span', { class: 'opt-head' }, h('b', {}, placementLabels[pl]), taken(pl) && where !== pl ? h('small', {}, tr('поменяется местами')) : null),
                ),
              );
              if (pl === 2) item.dataset.tut = 'to-front';
              return item;
            }),
            menuItem(where === 'out', false, moveTo('out'), h('span', { class: 'move-out' }, '✕'), h('span', { class: 'opt' }, h('span', { class: 'opt-head' }, h('b', {}, tr('Не печатать'))))),
          )
        : null;
    // Truth: the icon shows the current level; a story can only be made less true.
    const truthIcon = (t: number) => h('img', { src: `${assetBase}sprites/ui/truth_${t}.png`, alt: '', width: 16, height: 16 });
    // Conflict stories: the menu is a framing scale with a calming step below the truth (CONCEPT.md §5.5).
    const calmIcon = () => h('img', { src: `${assetBase}sprites/fx/peace.png`, alt: '', width: 16, height: 16 });
    const pair = card.conflict ? pairKey(c, ...card.conflict) : null;
    const pairNames = card.conflict ? card.conflict.map((g) => groupOf(c, g).name.toLowerCase()).join(' ↔ ') : '';
    // A bad story about what we were paid to keep quiet about breaks the deal (CONCEPT.md §3.5а).
    const brokenDeal = where === 'out' ? null : dealBrokenBy(state, c, card, d.distortion);
    // Story arcs (CONCEPT.md §3.1а): which ending the arc heads to, with this story as it is told now.
    const arc = arcInfo(state, c, card);
    const arcLeanNow =
      arc && arc.lean !== null && arc.day < arc.days ? arc.lean + (where === 'out' ? 0 : d.distortion * c.balance.arcPlacementWeight[where]) : null;
    const truthButton = h(
      'button',
      {
        class: `truth-chip ${d.distortion < 0 && card.conflict ? 'calm' : `t${p.truth}`}${menuOpen ? ' on' : ''}`,
        'data-tut': 'framing',
        title: tr('{0} ({1}) — изменить подачу', toneOf(card, d.distortion), truthLabels[p.truth].toLowerCase()),
        'aria-haspopup': 'menu',
        'aria-expanded': String(menuOpen),
        disabled: busy,
        onclick: act(() => {
          truthMenuFor = menuOpen ? null : card.uid;
          moveMenuFor = null;
          selected = null;
        }),
      },
      h('span', { class: 'chip-prefix' }, tr('Подача:')),
      d.distortion < 0 && card.conflict ? calmIcon() : truthIcon(p.truth),
      h('span', { class: 'chip-label' }, toneOf(card, d.distortion)),
      h('span', { class: 'chip-arrow' }, '▾'),
    );
    // "✕" takes a story out of the issue; in the tray "↩" brings it back as a brief.
    const out = where === 'out';
    const outButton = h(
      'button',
      {
        class: 'out-btn',
        title: out ? tr('Вернуть в выпуск заметкой') : tr('Не печатать'),
        disabled: busy,
        onclick: act(() => {
          selected = null;
          if (out) place(card, 0);
          else unpublish(card);
        }),
      },
      out ? '↩' : '✕',
    );
    // Each option shows what the player gets and pays: the headline it turns into, its truth, the
    // story's level and the fact-check risk (CONCEPT.md §7.3). Which options there are depends on the
    // story: only bad true news can be soothed, a rumor cannot be told «как есть», a conflict is framed.
    // A hunt story (CONCEPT.md §3.6а): each option says how hard it hits the target next to the story told as it is.
    const huntBase = state.hunt && card.building === state.hunt.building ? (previewPublication(state, c, mods, { cardUid: card.uid, placement: d.placement, distortion: Math.max(0, minDistortion(card)) }).huntHit ?? 0) : null;
    // A louder telling reads stronger and says how much harder it hits (CONCEPT.md §7.3).
    const tellings = new Map<number, PublicationPreview>();
    for (let dist = minDistortion(card); dist <= maxDistortion(card); dist++) tellings.set(dist, previewPublication(state, c, mods, { cardUid: card.uid, placement: d.placement, distortion: dist }));
    const scale = framingScale([...tellings].map(([dist, p]) => ({ dist, effect: p.effect, believers: p.believers, impact: p.impact })));
    const option = (dist: number, icon: Node, blockedHint: string | null) => {
      const preview = tellings.get(dist)!;
      const steps = preview.tier - card.tier;
      const stats = tr('{0} · {1}{2} · риск {3}%', truthLabels[preview.truth], tierLabels[preview.tier], steps > 0 ? ` ${'↑'.repeat(steps)}` : steps < 0 ? ` ${'↓'.repeat(-steps)}` : '', Math.round(preview.exposureRisk * 100));
      const item = menuItem(
        d.distortion === dist,
        !!blockedHint,
        () => {
          d.distortion = dist;
          sound.play('stamp');
        },
        icon,
        h(
          'span',
          { class: 'opt' },
          h('span', { class: 'opt-head' }, h('b', {}, toneOf(card, dist)), h('small', {}, blockedHint ?? stats)),
          h('span', { class: 'opt-title' }, `${quoted(preview.title)}`),
          effectLine(preview, huntBase, scale.get(dist)),
        ),
      );
      // The tutorial lights up the louder framings (CONCEPT.md §7.3 «Обучение»).
      if (dist > 0) item.dataset.tut = 'distort';
      return item;
    };
    const steps: number[] = [];
    for (let dist = minDistortion(card); dist <= maxDistortion(card); dist++) steps.push(dist);
    // The strongest choice for the goal first: blown up when attacking the town, calmed when defending it.
    if (state.mode === 'destroy') steps.reverse();
    const truthMenu = menuOpen
      ? h(
          'div',
          { class: 'place-menu truth-menu', role: 'menu' },
          ...steps.map((dist) => {
            // Only one sensation per issue: a second one cannot be blown up.
            const blocked = d.publish && dist > 0 && effectiveTier(card, dist) === 3 && card.tier < 3 && sensationTaken(card);
            const icon = dist < 0 && card.conflict ? calmIcon() : truthIcon(cardTruth(card, dist));
            return option(dist, icon, blocked ? tr('в выпуске уже есть сенсация') : null);
          }),
        )
      : null;
    // The better the story, the louder its label looks (CONCEPT.md §7.3).
    // The level is not a control: three bars and a word right after the headline.
    const tierLabel = tierMeter(tier, raised);
    const info = open
      ? h(
          'div',
          { class: 'news-info' },
          h('p', {}, h('b', {}, tierLabels[tier]), raised ? tr(' (было: {0}, поднято искажением)', tierLabels[card.tier].toLowerCase()) : ''),
          h('p', {}, `${truthLabels[p.truth]} · ${topicLabels[tpl.topic]} · ${sourceLabel} · ${scopeLabels[card.scope]}`),
          h('p', { class: 'effect' }, effectText(c, p.effect, tpl.target)),
          h('p', {}, tr('Аудитория: {0}', audience)),
          h(
            'div',
            { class: 'card-stat', title: tr('Насколько сильно поверившие отреагируют: уровень, место в газете, масштаб, аудитория') },
            h('span', {}, tr('Воздействие')),
            meter(p.impact / 2.5, p.impact >= 1.4 ? 'danger' : 'ok'),
            h('em', {}, `×${p.impact.toFixed(1)}`),
          ),
          bar(tr('Охват города'), p.reachChance),
          bar(tr('Риск разоблачения'), p.exposureRisk, p.exposureRisk > 0.2 ? 'danger' : 'warn'),
          pair && p.tension
            ? h(
                'p',
                { class: p.tension.delta > 0 ? 'bad' : '' },
                `${pairNames[0].toUpperCase()}${pairNames.slice(1)}: ${tensionLabels[tensionLevel(c, state.tension[pair])].toLowerCase()}. ` +
                  tr('Новость {0} конфликт {1}.', p.tension.delta > 0 ? tr('разожжёт') : tr('остудит'), Math.abs(p.tension.delta) >= 8 ? tr('сильно') : Math.abs(p.tension.delta) >= 3 ? tr('заметно') : tr('чуть-чуть')),
              )
            : null,
          arcLeanNow !== null
            ? h(
                'p',
                { class: arcLeanNow > 0 ? 'bad' : '' },
                tr('Сюжет «{0}» идёт к {1} развязке. Раздутая новость тянет его к плохой, успокоенная — к хорошей.', arc!.name, arcLeanNow > 0 ? tr('плохой') : tr('хорошей')),
              )
            : null,
          where !== 'out' ? h('p', { class: 'hint' }, placementNote(where)) : null,
        )
      : null;

    const withImage = where === 2 || where === 1;
    // The editor's red pencil in the margin of an untrue story that may be caught (CONCEPT.md §7.3 «Риск выпуска»).
    const pencil = where !== 'out' && p.truth > 0 && p.exposureRisk > 0 ? riskStep(p.exposureRisk) : null;
    const cls = ['news', `at-${where}`, `truth-${p.truth}`, `tier-${tier}`, investigation ? 'investigation' : '', selected === card.uid ? 'selected' : '', pencil !== null ? `pencil pencil-${pencil}` : '']
      .filter(Boolean)
      .join(' ');
    const children: (HTMLElement | null)[] = [
      investigation ? h('div', { class: 'kicker' }, tr('Расследование · эксклюзив · {0}', target.toLowerCase())) : null,
      card.expert ? h('div', { class: 'kicker expert-kicker', title: tr('Событие по специальности репортёра: на уровень сильнее') }, tr('Эксклюзив · {0} знает тему', reporter.name)) : null,
      pair ? h('div', { class: `kicker conflict-kicker level-${tensionLevel(c, state.tension[pair])}` }, tr('Конфликт · {0}', pairNames)) : null,
      tpl.source === 'offer' ? h('div', { class: 'kicker offer-kicker' }, tr('Документы от анонима · подлинность не проверена')) : null,
      brokenDeal ? h('div', { class: 'kicker deal-kicker' }, tr('Нарушит сделку «{0}»', offerOf(c, brokenDeal.id).title)) : null,
      arc
        ? h(
            'div',
            { class: `kicker arc-kicker${arcLeanNow !== null ? (arcLeanNow > 0 ? ' arc-bad' : ' arc-good') : ''}` },
            tr('Сюжет · {0} · {1}', arc.name, arc.day < arc.days ? tr('день {0} из {1}', arc.day, arc.days) : tr('развязка')),
          )
        : null,
      // Which place the story is about, and the hunt against it (CONCEPT.md §3.6а).
      placeKicker(card),
      h(
        'div',
        { class: 'news-head' },
        // The controls sit in a row above the headline: level, truth, and «✕» on the right.
        h(
          'div',
          { class: 'head-tools' },
          truthButton,
          huntChip(card, p.effect),
          where !== 'out' ? helpChip(p.effect) : null,
          pencil !== null ? h('span', { class: 'pencil-note', title: tr('Риск разоблачения {0}%', Math.round(p.exposureRisk * 100)) }, riskNotes[pencil]) : null,
          watchChip(card, tpl, p.effect),
          // The tutorial's run of truth: an untrue story says plainly that it breaks the run and how to drop it.
          where !== 'out' && p.truth > 0 && tutorial && tutorialStep()?.def.id === 'streak'
            ? h('span', { class: 'untrue-tag' }, p.truth > 1 ? tr('Это ложь — серия «Без лжи» сорвётся. Уберите:') : tr('Это слух — серия «Без лжи» сорвётся. Уберите:'))
            : null,
          outButton,
        ),
        h('h3', { class: 'headline' }, p.title, ' ', tierLabel),
        where === 'out' ? null : boostLine(card, tpl, p),
        truthMenu,
        moveMenu,
      ),
      h(
        'div',
        { class: 'news-body' },
        withImage ? h('img', { class: 'news-art', src: newsArt(tpl.id, card.conflict), alt: '', width: 256, height: 144 }) : null,
        lorem(card.uid, where === 2 ? 16 : where === 1 ? 7 : 3),
      ),
      // One bottom row: the author, then everything about the story and its controls (CONCEPT.md §7.3).
      h(
        'div',
        { class: 'news-foot' },
        h('span', { class: 'byline' }, portrait(reporter.id, 'mini-portrait'), reporter.name),
        h(
          'span',
          { class: 'news-tools' },
          h(
            'button',
            {
              class: `info-btn${open ? ' on' : ''}`,
              title: tr('Подробности: эффект, аудитория, воздействие, охват, риск'),
              'aria-expanded': String(open),
              onclick: act(() => (open ? details.delete(card.uid) : details.add(card.uid))),
            },
            '?',
          ),
        ),
        info,
      ),
    ];
    return { cls, children: children.filter((x): x is HTMLElement => x !== null) };
  }

  /**
   * The place a story is about: its name for a bar or a shop, and the hunt — «Травля · удар +40%» on
   * a story about the target, a «Начать травлю» button on a story about any other workplace.
   */
  /** Whom an investigation digs under, in the genitive. */
  const digWhom = (target: string) => groupOf(c, target).forms.manyGen;

  const actNow = (f: () => void) => () => {
    f();
    render();
  };

  function placeKicker(card: CardInstance): HTMLElement | null {
    if (card.building === undefined || !state.buildings[card.building]) return null;
    return buildingDefOf(c, state.buildings[card.building].type).names ? h('div', { class: 'kicker place-kicker' }, buildingName(state, c, card.building)) : null;
  }

  /**
   * Fact-checkers watch a topic printed day after day (CONCEPT.md §5.3): «👁 Под надзором +45%» next
   * to «Подача» while the topic's streak lasts; a day without it lifts the watch.
   */
  function watchChip(card: CardInstance, tpl: CardTemplate, effect: CardEffect | null): HTMLElement | null {
    const watch = topicWatchOf(state, c, card, effect);
    if (watch <= 1) return null;
    const days = state.topicStreak[tpl.topic] ?? 0;
    return h(
      'span',
      { class: 'watch-chip', title: tr('Фактчекеры следят за темой «{0}»: {1} {2} подряд в газете. Неправду этой темы ловят на {3}% чаще. День без этой темы — и надзор снимется.', topicLabels[tpl.topic], days, daysWord(days), Math.round((watch - 1) * 100)) },
      tr('👁 Под надзором +{0}%', Math.round((watch - 1) * 100)),
    );
  }

  /**
   * The hunt chip in the story's control row, next to «Подача» (CONCEPT.md §3.6а): «🎯 Травить» on a
   * story about a workplace, «🎯 Травля · +40%» on a story about the target.
   */
  function huntChip(card: CardInstance, effect: CardEffect | null): HTMLElement | null {
    if (card.building === undefined) return null;
    const x = state.buildings[card.building];
    if (!x) return null;
    const name = buildingName(state, c, card.building).toLowerCase();
    if (state.hunt?.building === card.building) {
      const hits = isHuntStory(state, card, effect);
      const bonus = Math.round((huntBonus(state, c, getModifiers(state, c)) - 1) * 100);
      return h(
        'span',
        { class: `hunt-chip on${hits ? '' : ' idle'}`, title: hits ? tr('Травля: {0} — эта новость бьёт по цели', name) : tr('В такой подаче новость не страшная и по цели не ударит') },
        '🎯 ',
        hits ? (bonus ? tr('Травля +{0}%', bonus) : tr('Травля')) : tr('Не ударит'),
      );
    }
    // One target at a time: while a hunt runs, other places get no button (CONCEPT.md §3.6а).
    if (!x.open || x.jobs === 0 || state.outcome || state.hunt) return null;
    return h(
      'button',
      {
        class: 'hunt-chip',
        title: tr('Начать травлю: {0}. Бить по этому месту день за днём: каждая страшная новость о нём подряд сильнее прошлой, люди его обходят, работники уходят', name),
        onclick: actNow(() => startHunt(state, x.id)),
      },
      tr('🎯 Травить'),
    );
  }

  /**
   * A story that works for the other side gets a warning next to «Подача» (CONCEPT.md §7.3): good news
   * cheers the town up when we are out to break it.
   */
  function helpChip(effect: CardEffect | null): HTMLElement | null {
    if (state.mode !== 'destroy' || effect?.type !== 'moodUp') return null;
    return h(
      'span',
      { class: 'help-chip', title: tr('Хорошая новость радует горожан — городу станет лучше. Вам нужно наоборот: подайте её страшнее или уберите в «Не печатать».') },
      tr('⚠ Поможет городу'),
    );
  }

  /** «≈12 поверят · боятся выходить» under a framing in the truth menu, in the goal's colours (CONCEPT.md §7.3). */
  function effectLine(p: PublicationPreview, huntBase: number | null = null, scaled?: { step: 0 | 1 | 2; ratio: number | null }): HTMLElement {
    const short = effectShort(c, p.effect, p.impact, scaled?.step);
    const helps = p.effect === null ? 0 : p.effect.type === 'moodUp' ? 1 : -1;
    const toGoal = helps === 0 ? 0 : (helps < 0) === (state.mode === 'destroy') ? 1 : -1;
    const n = Math.round(p.believers);
    // In a hunt: how hard this telling hits the target, next to the story told as it is.
    const hit = huntBase === null ? null : !p.huntHit ? tr('🎯 по цели не ударит') : huntBase > 0 ? tr('🎯 удар ×{0}', (p.huntHit / huntBase).toFixed(1)) : tr('🎯 ударит по цели');
    return h(
      'span',
      { class: `opt-effect${toGoal > 0 ? ' for' : toGoal < 0 ? ' against' : ''}` },
      p.effect ? `≈${n} ${plural(n, 'поверит', 'поверят', 'поверят')} · ${short}` : short,
      scaled?.ratio && scaled.ratio > 1.05 && !hit ? h('span', { class: 'opt-hunt' }, tr(' · сильнее ×{0}', scaled.ratio.toFixed(1))) : null,
      hit ? h('span', { class: 'opt-hunt' }, ` · ${hit}`) : null,
    );
  }

  /** The hunt plaque (CONCEPT.md §3.6а): the target, the days in a row, how it holds, «Снять». */
  function renderHunt(): void {
    const camp = state.hunt;
    huntNotice.hidden = !camp || searching || !!state.outcome;
    if (!camp || huntNotice.hidden) return;
    const b = c.balance;
    const x = state.buildings[camp.building];
    const name = buildingName(state, c, camp.building);
    const stain = state.stains[camp.building] ?? 0;
    const staff = state.residents.filter((r) => r.status === 'active' && r.job === x.id).length;
    const shaky = stain < 0.15 ? tr('держится') : stain < 0.4 ? tr('люди его обходят') : tr('на грани');
    const bonus = Math.round((huntBonus(state, c, getModifiers(state, c)) - 1) * 100);
    const pips = h('span', { class: 'pips hunt-pips' }, ...Array.from({ length: b.huntMaxSteps }, (_, i) => h('span', { class: i < camp.step ? 'on' : '' })));
    huntNotice.replaceChildren(
      h(
        'div',
        { class: 'notice-head' },
        h('span', { class: 'hunt-icon', 'aria-hidden': 'true' }, '🎯'),
        h('b', {}, tr('Травля: {0}', name)),
        pips,
        h('span', { class: 'plaque-stats' }, bonus ? tr('удар +{0}%', bonus) : tr('ударьте сегодня')),
        h('button', { class: 'ghost hunt-stop', title: tr('Прекратить травлю'), onclick: actNow(() => endHunt(state)) }, tr('Прекратить')),
      ),
      h(
        'p',
        { class: 'hunt-line' },
        `${shaky[0].toUpperCase()}${shaky.slice(1)}`,
        x.type === 'shop' || x.type === 'entertainment' ? '' : tr(' · работников {0}', staff),
        tr(' · каждый день подряд со страшной новостью о нём бьёт сильнее, пропуск остужает травлю.'),
      ),
    );
  }

  /** Small fixed-size clipping that follows the pointer while a story is dragged. */
  function dragGhost(card: CardInstance): HTMLElement {
    const d = draftOf(card);
    const p = previewPublication(state, c, getModifiers(state, c), { cardUid: card.uid, placement: d.placement, distortion: d.distortion });
    return h(
      'div',
      { class: 'drag-ghost' },
      h(
        'div',
        { class: 'ghost-top' },
        h('img', { src: `${assetBase}sprites/ui/truth_${p.truth}.png`, alt: '', width: 16, height: 16 }),
        tierMeter(p.tier),
      ),
      h('b', { class: 'ghost-title' }, p.title),
    );
  }

  /** Where the ghost goes: beside the cursor, or above the finger so it does not hide the drop place. */
  function ghostAt(ghost: HTMLElement, x: number, y: number, touch: boolean): string {
    const w = ghost.offsetWidth;
    const hgt = ghost.offsetHeight;
    const gx = touch ? x - w / 2 : x + 14;
    const gy = touch ? y - hgt - 28 : y + 14;
    return `translate(${Math.round(gx)}px, ${Math.round(gy)}px) rotate(-2deg)`;
  }

  /**
   * Drag a story by any part except its controls between the front page, the article, the briefs
   * and the tray (CONCEPT.md §7.3). A mouse drags at once; a finger drags after a short press, so a
   * quick swipe still scrolls the issue.
   */
  function startDrag(e: PointerEvent, card: CardInstance, el: HTMLElement): void {
    const t = e.target as Element;
    if (busy || e.button !== 0 || t.closest('button, .news-info, .place-menu')) return;
    const touch = e.pointerType !== 'mouse';
    let ghost: HTMLElement | null = null;
    let over: HTMLElement | null = null;
    let armed = !touch;
    let last = { x: e.clientX, y: e.clientY };
    let scrollFrame = 0;
    const zoneAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest('[data-zone]') as HTMLElement | null) ?? null;
    // While a finger drags, the page must not scroll under it.
    const blockScroll = (ev: TouchEvent) => ev.preventDefault();
    const pressTimer = touch
      ? window.setTimeout(() => {
          armed = true;
          el.classList.add('lifting');
          document.addEventListener('touchmove', blockScroll, { passive: false });
          navigator.vibrate?.(15);
        }, 280)
      : 0;
    // Near the top or bottom edge the issue scrolls by itself, so every place is reachable.
    const autoScroll = () => {
      const box = issue.getBoundingClientRect();
      const bottom = box.bottom;
      const edge = 70;
      const dy = last.y < box.top + edge ? -14 : last.y > bottom - edge && last.y < bottom ? 14 : 0;
      if (dy) issue.scrollTop += dy;
      scrollFrame = requestAnimationFrame(autoScroll);
    };
    const begin = () => {
      // The same small clipping wherever the story comes from, so the paper under it stays visible.
      ghost = dragGhost(card);
      document.body.append(ghost);
      ghost.style.transform = ghostAt(ghost, last.x, last.y, touch);
      el.classList.remove('lifting');
      el.classList.add('dragging');
      issue.classList.add('drag-active');
      truthMenuFor = null;
      selected = null;
      scrollFrame = requestAnimationFrame(autoScroll);
    };
    const move = (ev: PointerEvent) => {
      last = { x: ev.clientX, y: ev.clientY };
      const moved = Math.hypot(ev.clientX - e.clientX, ev.clientY - e.clientY);
      if (!armed) {
        // A finger moved before the press: it is a scroll, not a drag.
        if (moved > 8) cleanup();
        return;
      }
      if (!ghost) {
        if (moved < 6) return;
        begin();
      }
      ev.preventDefault();
      ghost!.style.transform = ghostAt(ghost!, ev.clientX, ev.clientY, touch);
      const zone = zoneAt(ev.clientX, ev.clientY);
      if (zone !== over) {
        over?.classList.remove('drop-over');
        zone?.classList.add('drop-over');
        over = zone;
      }
    };
    const cleanup = () => {
      window.clearTimeout(pressTimer);
      cancelAnimationFrame(scrollFrame);
      document.removeEventListener('touchmove', blockScroll);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      el.classList.remove('lifting');
    };
    const end = (ev: PointerEvent) => {
      cleanup();
      if (!ghost) {
        // A tap without a drag picks the story (or drops the pick); then a tap on a place moves it.
        if (ev.type === 'pointerup') pick(selected === card.uid ? null : card.uid);
        return;
      }
      ghost.remove();
      el.classList.remove('dragging');
      issue.classList.remove('drag-active');
      over?.classList.remove('drop-over');
      const key = ev.type === 'pointerup' ? over?.dataset.zone : undefined;
      if (key === undefined) return;
      const ontoEl = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.news') as HTMLElement | null;
      const onto = state.hand.find((x) => String(x.uid) === ontoEl?.dataset.uid);
      if (key === 'out') unpublish(card);
      else place(card, Number(key) as Placement, onto);
      render();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  function fly(el: HTMLElement, card: CardInstance): void {
    // On a phone the portraits are not on screen: the story flies out of the «Редакция» tab.
    const own = reporterBar.rectOf(card.reporterId);
    const from = own && own.width > 0 ? own : tabTeam.getBoundingClientRect();
    const to = el.getBoundingClientRect();
    if (!from.width) return;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const { frames, options } = flightFrames(card.tier, dx, dy);
    el.classList.add('flying');
    const a = el.animate(frames, options);
    a.onfinish = a.oncancel = () => {
      el.classList.remove('flying');
      el.classList.add('landed');
    };
  }

  function renderIssue(): void {
    issue.classList.toggle('open', issueOpen);
    issue.classList.toggle('searching', searching);
    const mods = getModifiers(state, c);
    const visible = state.hand.filter((card) => revealed.has(card.uid));

    // An empty day says why when the newsroom is away digging (CONCEPT.md §3.3а).
    const digging = state.reporters.length > 0 && state.reporters.every((id) => state.investigations.some((x) => x.reporterId === id));
    const note = searching
      ? tr('Репортёры ищут новости… (щёлкните, чтобы пропустить)')
      : !visible.length
        ? digging
          ? tr('Сегодня новостей нет: вся редакция копает компромат.')
          : tr('Сегодня новостей нет.')
        : '';
    issueHead.replaceChildren(...(note ? [h('p', {}, note)] : []), ...(error ? [h('p', { class: 'bad' }, error)] : []));
    issueNo.textContent = tr('Выпуск № {0}', state.turn);
    circulation.textContent = tr('Тираж: {0}', readerCount(state));
    renderToday();
    renderAbilities();

    for (const [uid, el] of cardEls) {
      if (!visible.some((x) => x.uid === uid)) {
        el.remove();
        cardEls.delete(uid);
      }
    }
    const whereOf = (card: CardInstance): Placement | 'out' => {
      const d = draftOf(card);
      return d.publish ? d.placement : 'out';
    };
    // Stronger stories first inside each zone.
    const ordered = [...visible].sort((a, b) => b.tier - a.tier || a.uid - b.uid);
    const picked = busy ? undefined : visible.find((x) => x.uid === selected);
    if (!picked) selected = null;
    issue.classList.toggle('picking', !!picked);
    const left = ordered.filter((card) => whereOf(card) === 'out').length;
    zones.out.root.classList.toggle('unfolded', trayOpen && left > 0);
    zones.out.label.replaceChildren(
      h(
        'button',
        {
          class: 'tray-toggle',
          'aria-expanded': String(trayOpen && left > 0),
          disabled: !left,
          onclick: () => {
            trayOpen = !trayOpen;
            render();
          },
        },
        left ? tr('Не печатать ({0}) {1}', left, trayOpen ? '▴' : '▾') : tr('Не печатать'),
      ),
      left ? '' : h('span', { class: 'tray-hint' }, isPhone() ? tr('нажмите ✕ у новости') : tr('перетащите сюда новость или нажмите ✕')),
    );
    // The hiring hint is said once, in the first empty place; an empty place with nothing to put there stays blank.
    let hireSaid = false;
    for (const key of [2, 1, 0, 'out'] as const) {
      const here = ordered.filter((card) => whereOf(card) === key);
      // Phones tap, wide screens drag or tap (CONCEPT.md §7.3).
      const spare = ordered.some((card) => whereOf(card) === 'out');
      const hire = key !== 'out' && !spare && !searching && freeSeats(state, c) > 0 && !state.outcome;
      zones[key].empty.hidden = here.length > 0 || key === 'out' || (!spare && !hire && !searching);
      zones[key].empty.classList.toggle('hire', hire);
      zones[key].empty.textContent = hire
        ? hireSaid
          ? tr('＋ Нанять репортёра')
          : tr('Больше новостей нет: {0} в день. ＋ Нанять ещё', state.reporters.length === 1 ? tr('репортёр приносит одну') : tr('каждый репортёр приносит одну'))
        : isPhone()
          ? tr('＋ Выбрать {0}', zoneTexts[key][1])
          : tr('Перетащите сюда {0} — или нажмите и выберите', zoneTexts[key][1]);
      if (hire && here.length === 0) hireSaid = true;
      if (zones[key].empty.hidden && chooserFor === key) chooserFor = null;
      zones[key].chooser.replaceChildren(...(chooserFor === key && key !== 'out' ? [storyChooser(key, ordered, whereOf)] : []));
      zones[key].root.classList.toggle('here', !!picked && whereOf(picked) === key);
      for (const card of here) {
        const { cls, children } = newsContent(card, mods, key);
        let el = cardEls.get(card.uid);
        const isNew = !el;
        if (!el) {
          el = h('article', { 'data-uid': String(card.uid), tabindex: '0' });
          const self = el;
          el.addEventListener('pointerdown', (e) => {
            // Phones never drag: a tap (a click) opens the «where to» menu.
            if (!isPhone()) startDrag(e, card, self);
          });
          el.addEventListener('click', (e) => {
            if (!isPhone() || busy || (e.target as Element).closest('button, .news-info, .place-menu')) return;
            const closed = menuClosedFor === card.uid;
            menuClosedFor = null;
            if (closed) return;
            truthMenuFor = null;
            moveMenuFor = moveMenuFor === card.uid ? null : card.uid;
            render();
          });
          // From the keyboard: Enter picks the story, then Tab to a place and Enter moves it.
          el.addEventListener('keydown', (e) => {
            if (e.target !== self || (e.key !== 'Enter' && e.key !== ' ') || busy) return;
            e.preventDefault();
            pick(selected === card.uid ? null : card.uid);
          });
          cardEls.set(card.uid, el);
        }
        // Appending moves an existing element into its zone, in order.
        zones[key].items.append(el);
        const extra = [...el.classList].filter((x) => x === 'flying' || x === 'landed');
        el.className = [cls, ...extra].join(' ');
        el.replaceChildren(...children);
        if (isNew) {
          if (flyQueue.delete(card.uid) && issueOpen) fly(el, card);
          else el.classList.add('landed');
        }
      }
    }

  }

  /**
   * The fact-check risk of the issue being composed (CONCEPT.md §7.3 «Риск выпуска»): how many printed
   * stories are untrue and the chance at least one of them is caught today.
   */
  function issueRisk(mods = getModifiers(state, c)): { printed: number; untrue: number; risk: number } {
    let printed = 0;
    let untrue = 0;
    let clean = 1;
    for (const card of state.hand) {
      const d = drafts.get(card.uid);
      if (!d?.publish) continue;
      printed++;
      const p = previewPublication(state, c, mods, { cardUid: card.uid, placement: d.placement, distortion: d.distortion });
      if (p.truth === 0) continue;
      untrue++;
      clean *= 1 - p.exposureRisk;
    }
    return { printed, untrue, risk: 1 - clean };
  }

  /** «Сегодня в номере: интересный выпуск · всё правда · город ≈ → кризис» and the editor's stamp. */
  function renderToday(): void {
    const { printed, untrue, risk } = issueRisk();
    const stamp = searching ? null : issueStampOf(untrue, risk, printed);
    // «Чисто» is praise only for the honest paper: attacking the town, it is a plain grey mark.
    masthead.classList.toggle('mode-destroy', state.mode === 'destroy');
    issueStamp.hidden = !stamp;
    issueStamp.className = `issue-stamp${stamp ? ` stamp-${stamp}` : ''}`;
    issueStamp.replaceChildren(...(stamp ? [h('b', {}, stampLabels[stamp][0]), h('small', {}, stampLabels[stamp][1])] : []));
    renderStreak(untrue > 0);
    if (searching || !state.hand.some((x) => revealed.has(x.uid))) {
      todayLine.replaceChildren();
      return;
    }
    const level = currentIssueLevel();
    const parts: (HTMLElement | string)[] = [printed ? h('b', {}, level === 3 ? tr('сенсация') : tr('{0} выпуск', issueLevelLabels[level].toLowerCase())) : h('b', {}, tr('газета выйдет пустой'))];
    if (printed)
      parts.push(
        !untrue
          ? tr('всё правда')
          : risk <= 0
            ? tr('есть неправда · пока не проверяют')
            : h('span', {}, tr('есть неправда — '), h('b', { class: `risk-word step-${stamp === 'danger' ? 3 : riskStep(risk)}` }, stamp === 'danger' ? tr('опасно') : risk < 0.1 ? tr('риск небольшой') : tr('рискованно'))),
      );
    // An untrue story from yesterday may still be caught today: the forecast leaves it out, this says it.
    if (state.pendingLies.length) parts.push(h('span', { class: 'late-risk' }, tr('вчерашняя ложь ещё может всплыть')));
    const fc = currentForecast();
    if (fc) {
      const here = cityStateOf(c, state.metrics.cityIndex);
      const next = cityStateOf(c, fc.cityIndex);
      const diff = fc.cityIndex - state.metrics.cityIndex;
      // In the player's colours (CONCEPT.md §7.3): what brings the goal nearer, and a warning when the issue helps the other side.
      const text = next !== here ? tr('город ≈ → {0}', c.balance.cityStates[next].name.toLowerCase()) : Math.abs(diff) < 1 ? tr('город почти не заметит') : diff < 0 ? tr('город просядет') : tr('городу станет лучше');
      const toGoal = Math.abs(diff) < 1 ? 0 : (diff < 0) === (state.mode === 'destroy') ? 1 : -1;
      parts.push(
        toGoal === 0
          ? text
          : h('span', { class: `goal-word ${toGoal > 0 ? 'for' : 'against'}`, title: toGoal > 0 ? tr('Это приближает вашу цель') : tr('Это уводит от вашей цели') }, toGoal < 0 ? `⚠ ${text}` : text),
      );
    }
    todayLine.replaceChildren(tr('Сегодня в номере: '), ...parts.flatMap((x, i) => (i ? [' · ', x] : [x])));
  }

  /**
   * The clean streak (CONCEPT.md §5.3): pips for the issues in a row without a lie and what completing
   * it gives; with a lie laid out, a warning that it will break. Hidden until the player can lie.
   */
  function renderStreak(lieLaidOut: boolean): void {
    const b = c.balance;
    streakBadge.hidden = searching || !!state.outcome;
    if (streakBadge.hidden) return;
    const days = state.cleanStreak;
    const breaks = lieLaidOut && days > 0;
    streakBadge.className = `streak-badge${breaks ? ' breaks' : ''}${lieLaidOut ? ' dim' : ''}`;
    const about = tr('{0} выпусков подряд без полуправды и лжи — +{1}% репутации у всего города. Ложь обнуляет серию, пустой выпуск её не двигает.', b.cleanStreakDays, b.cleanStreakBonus);
    streakBadge.title = streakTipOpen ? '' : about;
    streakBadge.replaceChildren(
      h('span', { class: 'streak-label' }, breaks ? tr('Серия прервётся') : tr('Без лжи')),
      h('span', { class: 'streak-pips', 'aria-label': tr('{0} из {1}', days, b.cleanStreakDays) }, ...Array.from({ length: b.cleanStreakDays }, (_, i) => h('i', { class: i < days ? 'on' : '' }))),
      h('span', { class: 'streak-prize' }, tr('→ +{0}% репутации', b.cleanStreakBonus)),
      ...(streakTipOpen ? [h('span', { class: 'streak-tip' }, tr('{0} Сейчас: {1} из {2}.', about, days, b.cleanStreakDays))] : []),
    );
  }

  /** Level of the issue being composed: published stories' tiers after distortion (CONCEPT.md §4.2а). */
  function currentIssueLevel(): IssueLevel {
    const stories = state.hand
      .filter((x) => drafts.get(x.uid)?.publish)
      .map((x) => ({ tier: effectiveTier(x, drafts.get(x.uid)!.distortion), placement: drafts.get(x.uid)!.placement }));
    return issueLevel(c, stories);
  }

  /** Mini clipping of an exposed story: which issue it was in and what it cost. */
  function exposedCard(x: ExposedStory): HTMLElement {
    return h(
      'div',
      { class: `exposed-card truth-${x.truth}` },
      h('img', { src: newsArt(x.templateId, x.conflict), alt: '', width: 96, height: 54 }),
      h(
        'div',
        { class: 'exposed-text' },
        h('b', { class: 'headline' }, x.title),
        h(
          'span',
          {},
          tr('{0} · выпуск дня {1}, {2}', truthLabels[x.truth], x.turn, placementLabels[x.placement].toLowerCase()) +
            (x.setup ? tr(' · документы оказались фальшивкой') : '') +
            (x.leaked ? tr(' · слил ушедший репортёр') : ''),
        ),
      ),
      h('b', { class: 'exposed-loss' }, `−${x.trustLoss.toFixed(1)}%`),
    );
  }

  function renderExposures(): void {
    const list = report?.exposures ?? [];
    exposureNotice.hidden = !list.length || exposuresSeen || searching;
    if (exposureNotice.hidden) return;
    const loss = list.reduce((s, x) => s + x.trustLoss, 0);
    exposureNotice.replaceChildren(
      h(
        'div',
        { class: 'notice-head' },
        h('img', { src: `${assetBase}sprites/fx/exposed.png`, alt: '', width: 24, height: 24 }),
        h('b', {}, list.length === 1 ? tr('Новость разоблачили!') : tr('Разоблачили новостей: {0}', list.length)),
        h('span', { class: 'notice-loss' }, tr('репутация −{0}%', loss.toFixed(1))),
        h(
          'button',
          {
            class: 'icon-btn',
            title: tr('Закрыть'),
            onclick: () => {
              exposuresSeen = true;
              render();
            },
          },
          '×',
        ),
      ),
      h('div', { class: 'notice-cards' }, ...list.map(exposedCard)),
    );
  }

  // ---------- Modals ----------

  /** «Редакция» (CONCEPT.md §7.3): the staff and the HR agency, a window of its own. */
  function teamContent(): HTMLElement[] {
    // Seats open with the circulation (CONCEPT.md §3.3): the staff against the seats there are now.
    const max = Math.min(state.seats, c.balance.maxReporters);
    // Every reporter here looks like the head of their own window (CONCEPT.md §7.3 «Редакция»).
    const row = (id: string, price: string, action: HTMLElement | null, body: HTMLElement[] = []) =>
      reporterHead(id, {
        key: `team:${id}:`,
        compact: true,
        // Who they are and their topics sit behind the «?» by the name; the hiring price is on the button.
        lines: [price],
        body,
        action,
      });
    return [
      ...(error ? [h('p', { class: 'bad' }, error)] : []),
      h('h3', { class: 'section' }, tr('Штат ({0} / {1})', state.reporters.length, max)),
      ...state.reporters.map((id) =>
        row(
          id,
          '',
          // Topics and the «Компромат» list are right on the card; the last one cannot be fired.
          h(
            'span',
            { class: 'team-actions' },
            digButton(id),
            state.reporters.length > 1 ? h('button', { class: 'ghost', disabled: !!state.outcome, onclick: () => fire(id) }, tr('Уволить')) : null,
          ),
          teamTools(id),
        ),
      ),
      ...agencySection(row),
    ];
  }

  /** Whose «Компромат» list is open in «Редакция». */
  let digMenuFor: string | null = null;

  /** Runs a newsroom action, keeps its error for the window. */
  const teamAct = (f: () => void) => () => {
    try {
      f();
      error = '';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    render();
  };

  /** A «?» that opens one explanation (kept in `openInfo`). */
  const infoButton = (key: string, title: string) =>
    h(
      'button',
      {
        class: `section-info${openInfo.has(key) ? ' on' : ''}`,
        title,
        'aria-expanded': String(openInfo.has(key)),
        onclick: () => {
          if (openInfo.has(key)) openInfo.delete(key);
          else openInfo.add(key);
          render();
        },
      },
      '?',
    );

  /**
   * A reporter's work in «Редакция» (CONCEPT.md §3.3, §3.3а): search topics and
   * digging — the list of whom to dig into opens under the card, what each would bring behind «?».
   */
  function teamTools(id: string): HTMLElement[] {
    const r = reporterOf(c, id);
    const b = c.balance;
    const assigned = state.reporterTopics[id] ?? [];
    const topics = Object.keys(topicLabels) as Topic[];
    const chip = (label: string, on: boolean, pick: () => void, title = '') =>
      h('button', { class: `chip${on ? ' on' : ''}`, 'aria-pressed': String(on), title, disabled: !!state.outcome, onclick: teamAct(pick) }, label);
    const topicKey = `team:${id}:topics`;
    const out: HTMLElement[] = [
      h(
        'div',
        { class: 'team-topics' },
        h('span', { class: 'team-label' }, tr('Ищет:'), infoButton(topicKey, tr('Темы поиска'))),
        chip(tr('Любое'), assigned.length === 0, () => setReporterTopics(state, c, id, [])),
        ...topics.map((t) => {
          const special = r.skills.topics.includes(t);
          const on = assigned.includes(t);
          const el = chip(`${special ? '★ ' : ''}${topicLabels[t]}`, on, () => setReporterTopics(state, c, id, on ? assigned.filter((x) => x !== t) : [...assigned, t]), special ? tr('Специальность репортёра') : '');
          el.dataset.tut = `topic-${t}`;
          return el;
        }),
      ),
    ];
    if (openInfo.has(topicKey))
      out.push(
        h(
          'p',
          { class: 'hint info-text' },
          tr('С шансом {0} репортёр приносит новость на выбранные темы. ★ — его специальность: если все выбранные темы из них, удача +{1}.', pct(b.assignFocus), pct(b.specialtyLuck)) +
            (onSpecialty(state, r) ? tr(' Сейчас он работает по специальности.') : ''),
        ),
      );
    if (digMenuFor === id && !state.investigations.some((x) => x.reporterId === id)) out.push(digMenu(id));
    return out;
  }

  /** «Компромат ▾» on a reporter's card, or how far the digging has gone with «Отозвать». */
  function digButton(id: string): HTMLElement {
    const inv = state.investigations.find((x) => x.reporterId === id);
    if (inv)
      return h(
        'span',
        { class: 'team-dig' },
        h('span', { class: 'dig-progress', title: tr('Пока идёт расследование, репортёр не ищет обычные новости') }, tr('Копает под {0} · {1}/{2}', digWhom(inv.target), inv.total - inv.turnsLeft, inv.total)),
        h('button', { class: 'ghost', disabled: !!state.outcome, onclick: teamAct(() => cancelInvestigation(state, id)) }, tr('Отозвать')),
      );
    const open = digMenuFor === id;
    return h(
      'button',
      {
        class: `ghost dig-toggle${open ? ' on' : ''}`,
        'data-tut': open ? undefined : 'dig',
        'aria-expanded': String(open),
        disabled: !!state.outcome,
        onclick: () => {
          digMenuFor = open ? null : id;
          render();
        },
      },
      tr('Компромат {0}', open ? '▴' : '▾'),
    );
  }

  /**
   * Whom to dig into: every group; a press sets the reporter digging.
   */
  function digMenu(id: string): HTMLElement {
    const turns = investigationTurns(c, skilledReporter(state, c, reporterOf(c, id)));
    const option = (target: string, name: string, promise: () => HTMLElement) => {
      const key = `dig:${id}:${target}`;
      return h(
        'div',
        { class: 'dig-option' },
        h(
          'button',
          {
            class: 'dig-pick',
            'data-tut': 'dig',
            disabled: !!state.outcome,
            onclick: teamAct(() => {
              startInvestigation(state, c, id, target);
              digMenuFor = null;
            }),
          },
          name,
        ),
        infoButton(key, tr('Что это даст?')),
        openInfo.has(key) ? promise() : null,
      );
    };
    return h(
      'div',
      { class: 'dig-menu' },
      h('p', { class: 'dig-menu-head' }, tr('На кого копать? {0} {1} репортёр не пишет новостей.', turns, turnsWord(turns))),
      ...c.groups.map((g) => option(g.id, g.name, () => digPromise(g.id, id))),
    );
  }

  /**
   * HR agency (CONCEPT.md §3.3, §10.4): free, once a day, it offers one or two random reporters;
   * hiring is free too, but only into a free seat, and seats open with the paper's readers.
   */
  function agencySection(row: (id: string, price: string, action: HTMLElement | null) => HTMLElement): HTMLElement[] {
    const b = c.balance;
    const block = agencyBlock(state, c);
    const seats = freeSeats(state, c);
    const next = nextSeatReaders(state, c);
    const act = (f: () => void) => () => {
      try {
        f();
        error = '';
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      render();
    };
    const seatNote =
      seats > 0
        ? tr('Свободных мест в редакции: {0}.', seats)
        : next !== null
          ? tr('Свободных мест нет. Следующее откроется, когда у газеты будет {0} читателей (сейчас {1}).', next, readerCount(state))
          : state.reporters.length >= b.maxReporters
            ? tr('В редакции не больше {0} репортёров. Чтобы нанять другого, кого-то придётся уволить.', b.maxReporters)
            : tr('Свободных мест нет.');
    const why = block === 'called' ? tr('Агентство уже присылало кандидатов сегодня — завтра пришлёт новых.') : block === 'nobody' ? tr('Агентству больше некого предложить.') : null;
    return [
      h('h3', { class: 'section', id: 'agency' }, tr('Кадровое агентство «Перо и Ко»')),
      h('p', { class: 'hint' }, tr('Агентство бесплатно присылает кандидатов раз в день; нанять тоже ничего не стоит. Места в редакции открывает тираж.'), ' ', seatNote),
      ...state.agencyOffer.map((id) =>
        row(
          id,
          '',
          h(
            'button',
            { class: seats > 0 ? 'primary' : '', 'data-tut': 'hire', disabled: seats <= 0 || !!state.outcome, onclick: act(() => hireFromAgency(state, c, id)) },
            tr('Нанять'),
          ),
        ),
      ),
      why ? h('p', { class: 'hint' }, why) : null,
      state.agencyOffer.length || block
        ? null
        : h('button', { class: 'primary', 'data-tut': 'agency', onclick: act(() => callAgency(state, c)) }, tr('Найти репортёров')),
    ].filter((x): x is HTMLElement => x !== null);
  }

  function requirementText(req: Requirement | null): string {
    const parts: string[] = [];
    if (req?.channel) parts.push(channelOf(c, req.channel).name);
    if (req?.upgrade) parts.push(c.upgrades.find((u) => u.id === req.upgrade)?.name ?? req.upgrade);
    return parts.length ? tr('Нужно: {0}', parts.join(', ')) : '';
  }

  /**
   * «Улучшения газеты» (CONCEPT.md §3.5): upgrades by section; a series such as kiosks is one line
   * with its progress and the next step.
   */
  /**
   * What an upgrade would bring now, in the player's own numbers (CONCEPT.md §7.3 «Улучшения»):
   * readers a day, yesterday's losses or this issue's risk with it. Counted from the sim's own formulas on today's town, without rolling.
   */
  function upgradeGain(u: UpgradeDef): { parts: string[] } | null {
    const e = u.effects;
    const mods = getModifiers(state, c);
    const withIt = { ...state, upgrades: [...state.upgrades, u.id] };
    const modsWith = getModifiers(withIt, c);
    const level = report?.issue.level ?? 1;
    const parts: string[] = [];
    let readers = 0;
    if (e.reachAdd || e.reachMul || e.groupReach || e.trustBonus || e.acquisitionMul) readers += expectedJoins(withIt, c, modsWith, level) - expectedJoins(state, c, mods, level);
    if (readers >= 0.75) parts.push(tr('≈ +{0} {1} в день', Math.round(readers), plural(Math.round(readers), 'читатель', 'читателя', 'читателей')));
    else if (readers >= 0.1) {
      const every = Math.max(2, Math.round(1 / readers));
      parts.push(tr('≈ +1 читатель за {0} {1}', every, plural(every, 'день', 'дня', 'дней')));
    } else if (readers <= -0.75) parts.push(tr('≈ −{0} {1} в день', Math.round(-readers), plural(Math.round(-readers), 'новый читатель', 'новых читателя', 'новых читателей')));
    if (e.churnMul && report) {
      const lost = report.readers.lost;
      const saved = lost * (1 - e.churnMul);
      if (lost > 0) parts.push(tr('вчера ушли {0} {1} — ушли бы ≈ {2}', lost, plural(lost, 'читатель', 'читателя', 'читателей'), Math.round(lost - saved)));
    }
    if (e.trustBonus) parts.push(tr('+{0} к репутации', e.trustBonus));
    if (e.reporterLuck && state.reporters.length) {
      const luck = (m: typeof mods) => state.reporters.reduce((s, id) => s + searchLuck(state, c, skilledReporter(state, c, reporterOf(c, id)), m), 0) / state.reporters.length;
      parts.push(tr('удача редакции {0}% → {1}%', Math.round(luck(mods) * 100), Math.round(luck(modsWith) * 100)));
    }
    if (e.exposurePenaltyMul) {
      const loss = report?.exposures.reduce((s, x) => s + x.trustLoss, 0) ?? 0;
      const ratio = modsWith.exposurePenaltyMul / mods.exposurePenaltyMul;
      parts.push(
        loss >= 0.5
          ? tr('вчерашнее разоблачение стоило бы −{0} репутации, а не −{1}', Math.round(loss * ratio), Math.round(loss))
          : tr('разоблачения будут стоить на {0}% {1} репутации', Math.round(Math.abs(1 - ratio) * 100), ratio < 1 ? tr('меньше') : tr('больше')),
      );
    }
    if (e.checkerMul) {
      const now = issueRisk(mods);
      const after = issueRisk(modsWith);
      parts.push(
        now.untrue && now.risk > 0
          ? tr('риск этого выпуска {0}% → {1}%', Math.round(now.risk * 100), Math.round(after.risk * 100))
          : tr('ложь будут ловить на {0}% {1}', Math.round(Math.abs(1 - e.checkerMul) * 100), e.checkerMul < 1 ? tr('реже') : tr('чаще')),
      );
    }
    if (!parts.length) return null;
    return { parts };
  }

  /**
   * A card of the collection (CONCEPT.md §3.5б): its rarity frame, icon, name, level stars, directions,
   * what it gives and costs. Locked ones are a silhouette with their rarity only.
   */
  /**
   * A card's picture across its top (`sprites/cards/<id>.png`); until it is drawn, its glyph on a
   * panel of the same size, so the card keeps its shape.
   */
  function cardArt(u: UpgradeDef): HTMLElement {
    const art = h('div', { class: 'card-art', 'aria-hidden': 'true' }, h('span', { class: 'card-glyph' }, u.icon ?? '★'));
    const img = h('img', { src: `${assetBase}sprites/cards/${u.id}.png`, alt: '', loading: 'lazy' }) as HTMLImageElement;
    img.onerror = () => img.remove();
    art.append(img);
    return art;
  }

  function cardFace(u: UpgradeDef, opts: { level?: number; locked?: boolean; fresh?: boolean; foot?: HTMLElement | null; extra?: HTMLElement | null } = {}): HTMLElement {
    const rarity = u.rarity ?? 'common';
    if (opts.locked) {
      return h('div', { class: `coll-card rarity-${rarity} locked` }, h('span', { class: 'coll-rarity' }, rarityNames[rarity]), h('span', { class: 'coll-icon' }, '?'), h('b', {}, '???'), h('p', { class: 'hint' }, tr('Выпадает в конвертах и сейфах.')));
    }
    const level = opts.level ?? 1;
    const power = c.balance.cardLevelPower[level - 1] ?? 1;
    return h(
      'div',
      { class: `coll-card rarity-${rarity}${u.ability ? ' is-ability' : ''}` },
      h('span', { class: 'coll-rarity' }, rarityNames[rarity]),
      opts.fresh ? h('span', { class: 'coll-new' }, tr('Новая')) : null,
      cardArt(u),
      h('b', {}, u.name),
      h('span', { class: 'coll-level', title: tr('Уровень {0} из {1}{2}', level, MAX_LEVEL, power > 1 ? tr(': польза ×{0}', power) : '') }, '★'.repeat(level) + '☆'.repeat(MAX_LEVEL - level), power > 1 ? h('small', {}, tr(' польза ×{0}', power)) : null),
      u.tags?.length ? h('span', { class: 'coll-tags' }, ...u.tags.map((t) => h('span', { class: `tag-chip tag-${t}` }, tagNames[t] ?? t))) : null,
      h('p', { class: 'upg-plus' }, `+ ${u.description}`),
      u.drawback ? h('p', { class: 'upg-minus' }, `− ${u.drawback}`) : null,
      opts.extra ?? null,
      opts.foot ?? null,
    );
  }

  /**
   * «Кабинет редактора» (CONCEPT.md §3.5б): the «связи» earned in games buy packs with a random new
   * card and level the cards up; the whole collection is laid out by rarity, with the sets it can make.
   */
  /** Is there enough «связи» for the cheapest pack? Then the cards' buttons call with «!». */
  function packAffordable(): boolean {
    return collection.currency >= Math.min(...packs.map((p) => p.cost));
  }
  function collectionCount(): string {
    const all = collectable(base);
    return tr('{0} из {1}', all.filter((u) => collection.cards[u.id]).length, all.length);
  }
  function cardsIcon(): HTMLElement {
    return h('img', { class: 'office-icon', src: `${assetBase}sprites/ui/cards.png`, alt: '', width: 16, height: 16 });
  }

  function officeContent(): HTMLElement[] {
    collection = loadCollection(base);
    const all = collectable(base).sort((a, z) => ['legendary', 'rare', 'common'].indexOf(a.rarity!) - ['legendary', 'rare', 'common'].indexOf(z.rarity!) || a.name.localeCompare(z.name));
    const owned = all.filter((u) => collection.cards[u.id]).length;
    const act = (f: () => void) => () => {
      try {
        f();
        saveCollection(collection);
        error = '';
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      render();
    };
    const result = packResult;
    // What the pack gave: every new card face up, the best rarity in the title, «связи» back for the rest.
    const best = result?.cards.find((x) => x.rarity === 'legendary') ?? result?.cards.find((x) => x.rarity === 'rare') ?? result?.cards[0];
    const reveal = result
      ? h(
          'div',
          { class: `pack-reveal${best ? ` rarity-${best.rarity}` : ''}` },
          h(
            'p',
            { class: 'pack-reveal-title' },
            !best ? tr('Все карты уже у вас — вернули {0} ✦', result.refund) : best.rarity === 'legendary' ? tr('Легендарная карта!') : best.rarity === 'rare' ? tr('Редкая карта!') : tr('Новая карта'),
            best && result.refund ? tr(' · вернули {0} ✦', result.refund) : '',
          ),
          ...(result.cards.length ? [h('div', { class: 'pack-reveal-cards' }, ...result.cards.map((x) => cardFace(x.card, { level: 1 })))] : []),
        )
      : null;
    const kinds = ['legendary', 'rare', 'common'] as const;
    const rarityTabs = { legendary: tr('Легендарные'), rare: tr('Редкие'), common: tr('Обычные') };
    return [
      h(
        'div',
        { class: 'office-head' },
        h('p', { class: 'office-wallet' }, cardsIcon(), h('b', {}, tr('Ваши карты: {0} из {1}', owned, all.length)), h('span', { class: 'office-ties' }, tr('✦ {0} связей', collection.currency))),
        h('p', { class: 'hint office-earn' }, tr('Связи даются за каждую партию: поражение +15, победа +40 и +15 за каждую звезду, город кампании ×1.5. На них здесь покупают новые карты и улучшают свои.')),
      ),
      ...(error ? [h('p', { class: 'bad' }, error)] : []),
      h('h3', { class: 'section' }, tr('Ларёк «Медиа-Плюс» — новые карты')),
      h(
        'div',
        { class: 'packs' },
        ...packs.map((p) => {
          const short = p.cost - collection.currency;
          return h(
            'div',
            { class: `pack pack-${p.id}${short <= 0 ? ' can' : ''}` },
            h('img', { class: 'pack-art', src: `${assetBase}sprites/ui/pack_${p.id}.png`, alt: '', width: 64, height: 64 }),
            h('div', { class: 'pack-body' }, h('b', {}, p.name, h('span', { class: 'pack-price' }, ` · ✦ ${p.cost}`)), h('small', {}, p.text)),
            h(
              'button',
              {
                class: short <= 0 ? 'primary pack-buy' : 'pack-buy',
                disabled: short > 0,
                onclick: act(() => {
                  packResult = openPack(collection, base, p);
                }),
              },
              short <= 0 ? tr('Открыть за ✦ {0}', p.cost) : tr('Нужно ещё ✦ {0}', short),
            ),
          );
        }),
      ),
      ...(reveal ? [reveal] : []),
      h('h3', { class: 'section' }, tr('Коллекция')),
      h(
        'div',
        { class: 'office-tabs', role: 'tablist' },
        h(
          'button',
          {
            class: `office-tab${officeTab === 'all' ? ' on' : ''}`,
            role: 'tab',
            'aria-selected': String(officeTab === 'all'),
            onclick: () => {
              officeTab = 'all';
              render();
            },
          },
          h('b', {}, tr('Все')),
          h('small', {}, tr('{0} из {1}', owned, all.length)),
        ),
        ...kinds.map((r) => {
          const list = all.filter((u) => u.rarity === r);
          return h(
            'button',
            {
              class: `office-tab rarity-${r}${officeTab === r ? ' on' : ''}`,
              role: 'tab',
              'aria-selected': String(officeTab === r),
              onclick: () => {
                officeTab = r;
                render();
              },
            },
            h('b', {}, rarityTabs[r]),
            h('small', {}, tr('{0} из {1}', list.filter((u) => collection.cards[u.id]).length, list.length)),
          );
        }),
      ),
      h(
        'div',
        { class: 'coll-grid' },
        ...all
          .filter((u) => officeTab === 'all' || u.rarity === officeTab)
          // Yours first, then what is still to find.
          .sort((a, z) => Number(!!collection.cards[z.id]) - Number(!!collection.cards[a.id]))
          .map((u) => {
            const level = collection.cards[u.id];
            if (!level) return cardFace(u, { locked: true });
            const cost = levelCost(u, level);
            return cardFace(u, {
              level,
              fresh: collection.fresh.includes(u.id),
              foot:
                cost === null
                  ? h('span', { class: 'coll-max' }, tr('Высший уровень'))
                  : h('button', { class: collection.currency >= cost ? 'primary' : '', disabled: collection.currency < cost, onclick: act(() => levelUp(collection, u)) }, tr('↑ Улучшить · ✦ {0}', cost)),
            });
          }),
      ),
      h('h3', { class: 'section' }, tr('Наборы')),
      h('p', { class: 'hint' }, tr('Три карты одного направления в одной партии дают бонус набора.')),
      h(
        'div',
        { class: 'sets' },
        ...base.synergies.map((x) => {
          const cards = all.filter((u) => u.tags?.includes(x.tag));
          const have = cards.filter((u) => collection.cards[u.id]).length;
          return h('p', { class: 'set-line' }, h('span', { class: `tag-chip tag-${x.tag}` }, tagNames[x.tag] ?? x.tag), h('b', {}, ` ${x.name}`), h('span', { class: 'set-have' }, tr(' · в коллекции {0} из {1}', have, cards.length)), ` — ${x.description}`);
        }),
      ),
      h(
        'button',
        {
          class: 'ghost',
          onclick: () => {
            // The «Новая» badges are seen.
            collection.fresh = [];
            saveCollection(collection);
            packResult = null;
            openModal(null);
          },
        },
        tr('Закрыть'),
      ),
    ];
  }

  /**
   * Which of the paper's cards make this story hit harder (CONCEPT.md §3.5б), so the player sees
   * them at work: desks by topic, the yellow ones for frightening stories, hunt cards in a hunt.
   */
  function boostLine(card: CardInstance, tpl: CardTemplate, p: PublicationPreview): HTMLElement | null {
    const harmful = !!p.effect && p.effect.type !== 'moodUp';
    const hunted = p.huntHit !== null;
    const names = c.upgrades
      .filter((u) => state.upgrades.includes(u.id))
      .filter((u) => {
        const e = u.effects;
        return (e.topicImpactMul?.[tpl.topic] ?? 1) > 1 || (harmful && (e.scaryImpactMul ?? 1) > 1) || (hunted && ((e.stainMul ?? 1) > 1 || (e.huntStepMul ?? 1) > 1)) || (!!card.conflict && (e.tensionMul ?? 1) > 1) || (tpl.topic === 'crime' && (e.crimeHeatMul ?? 1) > 1);
      })
      .map((u) => `${u.icon ?? '★'} ${u.name}`);
    const sets = getModifiers(state, c).synergies.map((t) => c.synergies.find((x) => x.tag === t)!).filter((x) => (x.effects.topicImpactMul?.[tpl.topic] ?? 1) > 1 || (harmful && (x.effects.scaryImpactMul ?? 1) > 1) || (hunted && (x.effects.stainMul ?? 1) > 1) || (!!card.conflict && (x.effects.tensionMul ?? 1) > 1));
    const all = [...names, ...sets.map((x) => tr('набор «{0}»', x.name))];
    return all.length ? h('p', { class: 'boost-line', title: tr('Карты газеты, которые делают эту новость сильнее') }, tr('Усиливают: '), all.join(', ')) : null;
  }

  /** Sets in this game: how many cards of each direction are owned, and the bonus once there are enough. */
  function setLines(): HTMLElement[] {
    const owned = c.upgrades.filter((u) => state.upgrades.includes(u.id));
    const active = getModifiers(state, c).synergies;
    const lines = c.synergies
      .map((x) => ({ x, n: owned.filter((u) => u.tags?.includes(x.tag)).length }))
      .filter((y) => y.n > 0)
      .map(({ x, n }) => {
        // How many of its cards the paper has, as stars; what the set gives hides behind «?».
        const key = `set:${x.tag}`;
        const info = openInfo.has(key);
        const got = Math.min(n, x.count);
        // Can the set still be gathered in this game? Cards of its direction left in the collection;
        // when they are too few, say so and where to find more.
        const inDeck = c.upgrades.filter((u) => u.tags?.includes(x.tag) && !state.upgrades.includes(u.id) && (!state.collection || state.collection[u.id])).length;
        const short = !active.includes(x.tag) && n + inDeck < x.count;
        return h(
          'div',
          { class: `set-line${active.includes(x.tag) ? ' on' : ''}` },
          h('span', { class: `tag-chip tag-${x.tag}` }, tagNames[x.tag] ?? x.tag),
          h('b', {}, x.name),
          h('span', { class: 'set-stars', title: tr('{0} из {1}', got, x.count) }, '★'.repeat(got) + '☆'.repeat(x.count - got)),
          h(
            'button',
            {
              class: `section-info${info ? ' on' : ''}`,
              title: info ? tr('Скрыть') : tr('Что даёт набор?'),
              'aria-expanded': String(info),
              onclick: () => {
                if (info) openInfo.delete(key);
                else openInfo.add(key);
                render();
              },
            },
            '?',
          ),
          short ? h('p', { class: 'hint set-short' }, tr('В вашей коллекции не хватает карт «{0}», чтобы собрать набор в этой партии. Новые карты покупают между партиями — кнопка «Карты» на главном экране и на карте кампании.', tagNames[x.tag] ?? x.tag)) : null,
          info ? h('p', { class: 'hint info-text' }, active.includes(x.tag) ? tr('Действует: {0}', x.description) : tr('Ещё {0} — и {1}{2}', x.count - n, x.description.charAt(0).toLowerCase(), x.description.slice(1))) : null,
        );
      });
    return lines.length ? [h('h3', { class: 'section' }, tr('Наборы')), ...lines] : [];
  }

  /**
   * The upgrades window (CONCEPT.md §3.5): today's deck with plus and minus on every card, the sets,
   * and what is owned.
   */
  function shopContent(): HTMLElement[] {
    const b = c.balance;
    const options = new Map(listPurchases(state, c).map((o) => [o.id, o]));
    const gains = new Map<string, ReturnType<typeof upgradeGain>>();
    const gainOf = (u: UpgradeDef) => {
      if (!gains.has(u.id)) gains.set(u.id, options.has(u.id) ? upgradeGain(u) : null);
      return gains.get(u.id)!;
    };
    const deck = state.shopOffer.map((id) => c.upgrades.find((u) => u.id === id)).filter((u): u is UpgradeDef => !!u);
    const price = (u: UpgradeDef) => {
      const o = options.get(u.id);
      return h('button', { class: o?.affordable ? 'primary' : '', 'data-tut': 'buy', disabled: !o?.affordable || !!state.outcome, onclick: () => buy(u.id) }, tr('Взять'));
    };
    const series = (u: UpgradeDef) => (u.series ? c.upgrades.filter((x) => x.series === u.series) : null);
    const pips = (list: UpgradeDef[]) => h('span', { class: 'pips' }, ...list.map((x) => h('span', { class: state.upgrades.includes(x.id) ? 'on' : '' })));
    // What a card would bring now.
    const nowLine = (u: UpgradeDef) => {
      const g = gainOf(u);
      if (!g) return null;
      return h('p', { class: 'gain-line' }, tr('Сейчас: '), h('b', {}, g.parts.join(', ')));
    };
    const minus = (u: UpgradeDef) => (u.drawback ? h('p', { class: 'upg-minus' }, `− ${u.drawback}`) : null);
    const levelOf = (u: UpgradeDef) => state.collection?.[u.id] ?? 1;
    /**
     * A card (CONCEPT.md §7.3): its picture across the top, the rarity, the name, the tags and level
     * stars on one line, what it gives and costs, and an optional foot — «Сейчас» and «Взять».
     */
    const cardView = (u: UpgradeDef, foot: HTMLElement | null, cls = '') => {
      const line = series(u);
      const rarity = u.rarity ?? 'common';
      const level = levelOf(u);
      return h(
        'div',
        { class: `deck-card rarity-${rarity}${u.ability ? ' is-ability' : ''}${cls ? ` ${cls}` : ''}` },
        cardArt(u),
        h('span', { class: `deck-tag tag-${rarity}` }, u.ability ? tr('приём · {0}', rarityNames[rarity]) : u.cash ? tr('грязный приём · {0}', rarityNames[rarity]) : rarityNames[rarity]),
        h('div', { class: 'card-name' }, h('b', {}, line ? `${seriesNames[u.series!] ?? u.name}: ${u.name.toLowerCase()}` : u.name, line ? pips(line) : null)),
        h(
          'div',
          { class: 'card-meta' },
          ...(u.tags ?? []).map((t) => h('span', { class: `tag-chip tag-${t}` }, tagNames[t] ?? t)),
          h('span', { class: 'coll-level', title: tr('Уровень карты в вашей коллекции: {0} из {1}', level, MAX_LEVEL) }, '★'.repeat(level) + '☆'.repeat(MAX_LEVEL - level)),
        ),
        // What the card gives, its minus and what it needs: always in sight.
        h('p', { class: 'upg-plus' }, `+ ${u.description}`, level > 1 ? h('small', {}, tr(' · польза ×{0}', b.cardLevelPower[level - 1])) : null),
        minus(u),
        options.get(u.id) && !options.get(u.id)!.unlocked ? h('p', { class: 'req' }, requirementText(u.requires)) : null,
        foot,
      );
    };
    // On offer: «Сейчас» on the left and the button on the right, one row at the card's bottom.
    const offerCard = (u: UpgradeDef) => cardView(u, h('div', { class: 'deck-foot' }, nowLine(u) ?? h('span'), price(u)));
    // What is coming: a bar for each event, filled as its day nears (CONCEPT.md §3.5б).
    const days = Math.max(0, state.shopRefreshTurn - state.turn);
    const bar = (label: string, left: number, span: number) =>
      h(
        'div',
        { class: 'event-bar' },
        h('span', { class: 'event-name' }, label),
        h('span', { class: 'event-track' }, h('i', { style: `width: ${Math.round(Math.max(0, Math.min(1, 1 - left / Math.max(1, span))) * 100)}%` })),
        h('small', {}, left <= 1 ? tr('завтра') : tr('через {0} {1}', left, plural(left, 'день', 'дня', 'дней'))),
      );
    const events = deck.length ? [] : [bar(tr('Предложение совета'), days, b.shopRefreshDays)];
    const owned = c.upgrades.filter((u) => state.upgrades.includes(u.id) && !(u.series && c.upgrades.filter((x) => x.series === u.series && state.upgrades.includes(x.id)).pop() !== u));
    // Three more cards out of turn (CONCEPT.md §3.5б, §10.4): the first request of an offer is free,
    // each next one costs reputation, more every time, until the board's own offer.
    const requestCost = shopRequestCost(state, c);
    const requestBlocked = refreshBlock(state, c);
    const requestButton = (label: string) =>
      h(
        'button',
        {
          class: 'shop-request',
          disabled: !!requestBlocked,
          title: requestBlocked ?? tr('Совет пришлёт ещё три карты из вашей коллекции; одну из них можно взять. Первый запрос бесплатный, каждый следующий до очередного предложения стоит репутации, и всё больше.'),
          onclick: () => {
            try {
              refreshShop(state, c);
              error = '';
            } catch (e) {
              error = e instanceof Error ? e.message : String(e);
            }
            render();
          },
        },
        requestCost ? tr('{0} · репутация −{1}', label, requestCost) : tr('{0} · бесплатно', label),
      );
    return [
      state.vouchers ? h('p', { class: 'good voucher-line' }, tr('За задания: из предложения совета можно взять ещё {0}.', state.vouchers === 1 ? tr('одну карту') : tr('{0} карты', state.vouchers))) : null,
      ...(error ? [h('p', { class: 'bad' }, error)] : []),
      events.length ? h('div', { class: 'event-bars' }, ...events) : null,
      ...(deck.length || state.outcome ? [] : [h('div', { class: 'deck-head' }, h('span', { class: 'hint' }, tr('Не хотите ждать совета?')), requestButton(tr('Запросить ещё три карты')))]),
      ...(deck.length
        ? [
            h(
              'div',
              { class: 'deck-head' },
              h('h3', { class: 'section' }, state.shopPicks ? tr('Можно взять ещё одну — за награду задания') : tr('Совет директоров предлагает — возьмите одну')),
              requestButton(state.shopPicks ? tr('Запросить ещё три') : tr('Другие три')),
            ),
            h('div', { class: 'deck' }, ...deck.map(offerCard)),
          ]
        : []),
      // Sets of three cards of one direction (CONCEPT.md §3.5б): what is gathered and what it gives.
      ...setLines(),
      // What the paper has: the same cards, without «Сейчас» and «Взять».
      ...(owned.length ? [h('h3', { class: 'section' }, tr('Ваша газета')), h('div', { class: 'deck owned-deck' }, ...owned.map((u) => cardView(u, null, 'owned')))] : []),
    ].filter((x): x is HTMLElement => x !== null);
  }

  /** Debug menu: every parameter hidden from the top panel, the turn report and a new game. */
  function debugContent(): HTMLElement[] {
    const m = state.metrics;
    const b = c.balance;
    const row = (label: string, value: string) => h('div', { class: 'debug-row' }, h('span', {}, label), h('b', {}, value));
    return [
      h(
        'div',
        { class: 'debug-actions' },
        h('button', { disabled: !report, onclick: () => openModal('report') }, tr('Итоги хода')),
        h('button', { onclick: () => newGame() }, tr('Новая игра')),
      ),
      h('h3', { class: 'section' }, tr('Игра')),
      row(tr('Ход'), `${Math.min(state.turn, b.turnLimit)} / ${b.turnLimit}`),
      row(tr('Сид города'), `${state.seed}`),
      row(tr('Индекс города'), tr('{0} (победа < {1})', Math.round(m.cityIndex), b.winCityIndex)),
      row(tr('Каналы'), state.ownedChannels.map((ch) => channelOf(c, ch).name).join(', ')),
      row(tr('Места в редакции'), `${state.seats} / ${b.maxReporters}`),
      row(tr('Неразоблачённая ложь'), `${state.pendingLies.length}`),
      h('h3', { class: 'section' }, tr('Звуки')),
      h('div', { class: 'debug-actions' }, ...SFX_NAMES.map((n) => h('button', { onclick: () => sound.play(n) }, n))),
    ];
  }

  /** A line of a breakdown: label, optional detail, amount with sign and color. */
  function ledgerRow(label: string, amount: number, detail = '', unit = ''): HTMLElement {
    return h(
      'div',
      { class: 'ledger-row' },
      h('span', {}, label, detail ? h('small', {}, ` ${detail}`) : null),
      h('b', { class: amount > 0 ? 'gain' : amount < 0 ? 'loss' : '' }, `${signed(amount)}${unit}`),
    );
  }

  /** A line with a plain count (no sign). */
  function countRow(label: string, value: number, detail = ''): HTMLElement {
    return h('div', { class: 'ledger-row' }, h('span', {}, label, detail ? h('small', {}, ` ${detail}`) : null), h('b', {}, `${value}`));
  }

  function ledgerTotal(label: string, amount: number, unit = ''): HTMLElement {
    return h('div', { class: 'ledger-row total' }, h('span', {}, label), h('b', { class: amount >= 0 ? 'gain' : 'loss' }, `${signed(amount)}${unit}`));
  }

  /** Readers window: readers per channel, who left last turn and why, who came. */
  function readersContent(): HTMLElement[] {
    const r = report;
    const reasons: Record<ChurnReason, string> = {
      exposed: tr('увидели разоблачённую ложь'),
      doubted: tr('проигнорировали новость'),
      boring: tr('выпуск их не зацепил'),
      empty: tr('выпуска не было'),
    };
    const out: HTMLElement[] = [
      h('div', { class: 'city-index' }, h('img', { src: `${assetBase}sprites/ui/readers.png`, alt: '', width: 48, height: 48 }), h('div', {}, h('b', {}, `${readerCount(state)}`), h('span', {}, tr('постоянных читателей')))),
      h('h3', { class: 'section' }, tr('По группам')),
      ...c.groups.map((g) =>
        countRow(g.name, state.residents.filter((x) => x.status === 'active' && x.group === g.id && x.follows.some((ch) => state.ownedChannels.includes(ch))).length),
      ),
    ];
    if (r) {
      const rd = r.readers;
      out.push(
        h('h3', { class: 'section' }, tr('Прошлый ход ({0})', r.turn)),
        h('div', { class: 'ledger-row' }, h('span', {}, tr('Выпуск')), h('b', {}, `${issueLevelLabels[r.issue.level]} · ${c.balance.issueAcquisition[r.issue.level] ? tr('новых ×{0}', c.balance.issueAcquisition[r.issue.level]) : tr('новых нет')}`)),
        countRow(tr('Было'), rd.before),
        ...(Object.keys(reasons) as ChurnReason[]).filter((k) => rd.lostBy[k] > 0).map((k) => ledgerRow(tr('Ушли: {0}', reasons[k]), -rd.lostBy[k])),
        ...(rd.movedAway ? [ledgerRow(tr('Уехали из города'), -rd.movedAway)] : []),
        ledgerRow(tr('Пришли новые'), rd.gained),
        ledgerTotal(tr('Итого'), rd.after - rd.before),
        ...(r.deals?.readers ? [ledgerRow(tr('Раздали по сделке'), r.deals.readers)] : []),
        ...(r.deals?.broken ?? []).map((t) => h('p', { class: 'bad' }, tr('Нарушена сделка «{0}»', t))),
        ...(r.deals?.lost ? [ledgerRow(tr('Ушли из-за нарушенной сделки'), -r.deals.lost)] : []),
      );
    }
    // Deals that pay in readers (CONCEPT.md §3.5а, §10.4).
    if (state.deals.length) {
      out.push(
        h('h3', { class: 'section' }, tr('Сделки')),
        ...state.deals.map((x) =>
          h(
            'p',
            { class: 'hint' },
            tr('{0}: до дня {1}. {2}', offerOf(c, x.id).title, x.untilTurn, offerOf(c, x.id).kind === 'silence' && x.building !== undefined ? tr('Молчим о: {0}.', buildingName(state, c, x.building)) : tr('Ни одной плохой новости о власти.')),
          ),
        ),
      );
    }
    out.push(h('h3', { class: 'section' }, tr('Места в редакции')), h('p', { class: 'hint' }, seatHint()));
    return out;
  }

  /** Reputation window: the average, last turn's change and what changed it, the fact-check shield. */
  function reputationContent(): HTMLElement[] {
    const b = c.balance;
    const r = report;
    const trust = averageTrust(state, c);
    const out: HTMLElement[] = [
      h('div', { class: 'city-index' }, h('img', { src: `${assetBase}sprites/ui/reputation.png`, alt: '', width: 48, height: 48 }), h('div', {}, h('b', {}, `${Math.round(trust)}%`), h('span', {}, tr('средняя репутация у жителей')))),
      meter(trust / 100, trust < 20 ? 'danger' : 'ok'),
      h('div', { class: 'ledger-row' }, h('span', {}, tr('Фактчекеры проверяют вас реже на')), h('b', {}, `${Math.round(b.trustShield * trust)}%`)),
      h(
        'div',
        { class: 'ledger-row' },
        h('span', {}, tr('Выпусков подряд без лжи'), h('small', {}, tr(' за {0} — +{1}% всему городу', b.cleanStreakDays, b.cleanStreakBonus))),
        h('b', {}, tr('{0} из {1}', state.cleanStreak, b.cleanStreakDays)),
      ),
      h(
        'p',
        { class: 'hint' },
        tr('Правда приносит репутацию: на первой полосе больше всего, в заметке меньше; немного достаётся и тем, кто вас не читает. Пойманная ложь отнимает примерно столько, сколько дают 3–4 честных выпуска.'),
      ),
    ];
    if (r) {
      const loss = r.exposures.reduce((s, x) => s + x.trustLoss, 0);
      const delta = r.trustAfter - r.trustBefore;
      out.push(
        h('h3', { class: 'section' }, tr('Прошлый ход ({0})', r.turn)),
        ...r.exposures.map((x) => ledgerRow(tr('Разоблачено: «{0}»', x.title), -Math.round(x.trustLoss * 10) / 10, tr('выпуск дня {0}', x.turn), '%')),
        ...(r.cleanStreak.bonus ? [ledgerRow(tr('{0} выпусков без лжи', c.balance.cleanStreakDays), Math.round(r.cleanStreak.bonus * 10) / 10, '', '%')] : []),
        ledgerRow(tr('Правдивые новости и прочее'), Math.round((delta + loss - r.cleanStreak.bonus) * 10) / 10, '', '%'),
        ledgerTotal(tr('Итого'), Math.round(delta * 10) / 10, '%'),
      );
    }
    return out;
  }

  /** City window behind the city tile: the city's stage in words and what it is made of; the index itself stays hidden. */
  function cityContent(): HTMLElement[] {
    const m = state.metrics;
    const r = report;
    const stage = cityStateOf(c, m.cityIndex);
    const delta = (after: number, before: number) => trend(Math.round((after - before) * 100), '%', true);
    const metric = (label: string, key: 'population' | 'employment' | 'economy' | 'mood' | 'order') =>
      h('div', { class: 'city-metric' }, bar(label, m[key]), r ? delta(r.metricsAfter[key], r.metricsBefore[key]) : null);
    return [
      h(
        'div',
        { class: 'city-index' },
        h('img', { src: `${assetBase}sprites/ui/city_state_${stage}.png`, alt: '', width: 48, height: 48 }),
        h('div', {}, h('b', {}, c.balance.cityStates[stage].name), h('span', {}, cityGoal())),
      ),
      h(
        'div',
        { class: 'city-index' },
        h('img', { src: `${assetBase}sprites/ui/residents.png`, alt: '', width: 32, height: 32 }),
        h(
          'div',
          {},
          h('b', {}, `${m.activeResidents}`),
          h('span', {}, tr('жителей из {0}', state.initialPopulation)),
        ),
        r ? trend(r.metricsAfter.activeResidents - r.metricsBefore.activeResidents, '', true) : null,
      ),
      h('h3', { class: 'section' }, tr('Подробности')),
      metric(tr('Население'), 'population'),
      metric(tr('Занятость'), 'employment'),
      metric(tr('Экономика'), 'economy'),
      metric(tr('Настроение'), 'mood'),
      metric(tr('Порядок и безопасность'), 'order'),
      ...placesSection(),
    ];
  }

  /**
   * Every workplace the hunt can go after (CONCEPT.md §3.6а): its people, the stain and how it holds;
   * the target first with «Прекратить», the others with «🎯 Травить» while no hunt runs, closed ones last.
   */
  function placesSection(): HTMLElement[] {
    const target = state.hunt?.building;
    const places = state.buildings
      .filter((x) => x.jobs > 0)
      .sort((a, z) => Number(z.id === target) - Number(a.id === target) || Number(z.open) - Number(a.open) || a.id - z.id);
    const row = (x: (typeof places)[number]) => {
      const stain = state.stains[x.id] ?? 0;
      const staff = state.residents.filter((r) => r.status === 'active' && r.job === x.id).length;
      const status = !x.open ? tr('закрыто') : stain >= 0.4 ? tr('на грани') : stain >= 0.15 ? tr('теряет людей') : tr('работает');
      const action =
        state.outcome || !x.open
          ? null
          : x.id === target
            ? h('button', { class: 'ghost', onclick: actNow(() => endHunt(state)) }, tr('Прекратить'))
            : target === undefined
              ? h('button', { class: 'hunt-chip', title: tr('Бить по этому месту день за днём: люди его обходят, работники уходят, и оно закрывается'), onclick: actNow(() => startHunt(state, x.id)) }, tr('🎯 Травить'))
              : null;
      return h(
        'div',
        { class: `place-row${x.id === target ? ' target' : ''}${x.open ? '' : ' closed'}` },
        h('b', { class: 'place-name' }, x.id === target ? '🎯 ' : '', buildingName(state, c, x.id)),
        h('span', { class: 'place-staff' }, x.open ? tr('работают {0} из {1}', staff, x.jobs) : '—'),
        h('span', { class: 'place-stain', title: tr('Пятно травли: чем больше, тем быстрее уходят люди') }, meter(Math.min(1, stain), stain >= 0.4 ? 'danger' : 'warn'), h('em', {}, `${Math.round(stain * 100)}%`)),
        h('span', { class: `place-status${x.id === target ? ' hot' : ''}` }, x.id === target && x.open ? tr('травля') : status),
        action ?? h('span'),
      );
    };
    return [h('h3', { class: 'section' }, tr('Места для травли')), h('div', { class: 'place-list' }, ...places.map(row))];
  }

  /** Who lives in the city and how (CONCEPT.md §7.3): every group's size, work, mood, protests, readers. */
  function populationContent(): HTMLElement[] {
    const all = state.residents;
    const active = all.filter((x) => x.status === 'active');
    const avg = (list: typeof all, f: (x: (typeof all)[number]) => number) => (list.length ? list.reduce((s, x) => s + f(x), 0) / list.length : 0);
    const rows = c.groups.map((g) => {
      const here = active.filter((x) => x.group === g.id);
      const left = all.filter((x) => x.group === g.id && x.status === 'left').length;
      const working = here.filter((x) => x.job !== null);
      // Where they work: number of workers per building type.
      const jobs = new Map<string, number>();
      for (const x of working) {
        const name = buildingDefOf(c, state.buildings[x.job!].type).name.toLowerCase();
        jobs.set(name, (jobs.get(name) ?? 0) + 1);
      }
      const work = g.jobs.length
        ? [...[...jobs].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name} ${n}`), tr('без работы {0}', here.length - working.length)].join(' · ')
        : tr('на пенсии · пенсия {0} в день', g.pension);
      const protesting = here.filter((x) => x.protestTurns > 0).length;
      const readersHere = here.filter((x) => x.follows.length > 0).length;
      const believers = here.filter((x) => x.beliefs.length > 0).length;
      return h(
        'div',
        { class: 'group-card' },
        h(
          'div',
          { class: 'group-head' },
          h('span', { class: 'group-dot', style: `background:${g.color}` }),
          h('b', {}, g.name),
          h('span', {}, tr('{0} · {1} города', here.length, active.length ? pct(here.length / active.length) : '0%')),
          left ? h('span', { class: 'bad' }, tr('уехали {0}', left)) : null,
        ),
        bar(tr('Настроение'), avg(here, (x) => x.mood), avg(here, (x) => x.mood) < 0.35 ? 'danger' : 'ok'),
        bar(tr('Настрой к городу'), avg(here, (x) => x.outlook), avg(here, (x) => x.outlook) < 0.35 ? 'danger' : 'ok'),
        g.jobs.length ? bar(tr('Работают'), here.length ? working.length / here.length : 0) : null,
        bar(tr('Ваша репутация'), avg(here, (x) => x.trust) / 100, 'warn'),
        h('p', { class: 'group-line' }, tr('Работа: {0}', work)),
        h(
          'p',
          { class: 'group-line' },
          tr('Читают вас: {0} · верят вашим новостям: {1} · сбережения ≈ {2}', readersHere, believers, Math.round(avg(here, (x) => x.money))),
          protesting ? h('span', { class: 'bad' }, tr(' · протестуют: {0}', protesting)) : '',
        ),
        h(
          'button',
          {
            class: 'dig-btn',
            disabled: !!state.outcome,
            onclick: () => {
              digTarget = g.id;
              error = '';
              openModal('dig');
            },
          },
          state.investigations.some((x) => x.target === g.id) ? tr('⛏ Копаем под {0}…', g.forms.manyGen) : tr('⛏ Копать компромат на {0}', g.forms.manyGen),
        ),
      );
    });
    return [
      h(
        'div',
        { class: 'city-index' },
        h('img', { src: `${assetBase}sprites/ui/residents.png`, alt: '', width: 32, height: 32 }),
        h('div', {}, h('b', {}, `${active.length}`), h('span', {}, tr('жителей сейчас · всего уехали {0}', all.length - active.length))),
      ),
      ...relationsContent(),
      h('h3', { class: 'section' }, tr('Горожане')),
      ...peopleContent(),
      h('h3', { class: 'section' }, tr('Группы')),
      ...rows,
    ];
  }

  function reportContent(): HTMLElement[] {
    if (!report) return [h('p', { class: 'hint' }, tr('Итоги появятся после первого хода.'))];
    const r = report;
    return [
      ...r.publications.map((p) =>
        h(
          'div',
          { class: `report-item truth-${p.truth}${p.exposed ? ' exposed' : ''}` },
          h('strong', { class: 'headline' }, `${quoted(p.title)}`),
          h('p', {}, tr('{0}, {1}. Увидели {2}, поверили {3}, проигнорировали {4}, пересказали {5}.', truthLabels[p.truth], placementLabels[p.placement].toLowerCase(), p.reached, p.believed, p.doubted, p.wordOfMouth)),
          h('p', { class: 'muted' }, Object.entries(p.byChannel).map(([ch, v]) => `${channelOf(c, ch).name}: ${v}`).join(' · ')),
          Object.keys(p.effects).length
            ? h('p', {}, Object.entries(p.effects).map(([k, v]) => `${effectLabels[k as keyof typeof effectLabels]}: ${v}`).join(' · '))
            : null,
          p.stigma
            ? h(
                'p',
                { class: 'bad' },
                tr('Город ополчился на группу «{0}»: травля {1}, уехали {2}.', groupOf(c, p.stigma.target).name, pct(p.stigma.pressure), p.stigma.left),
              )
            : null,
          p.exposed ? h('p', { class: 'bad' }, tr('Разоблачено! Репутация и реклама упали.')) : null,
        ),
      ),
      ...(r.publications.length === 0 ? [h('p', { class: 'hint' }, tr('В этот ход ничего не опубликовано.'))] : []),
      ...r.exposures
        .filter((x) => x.turn !== r.turn)
        .map((x) => h('div', { class: 'report-item exposed' }, h('p', { class: 'bad' }, tr('Всплыла старая ложь из выпуска дня {0}: «{1}»', x.turn, x.title)))),
      h(
        'div',
        { class: 'report-item' },
        h(
          'p',
          {},
          tr('Читатели: было {0}, ушли {1}, пришли {2}, теперь {3}.', r.readers.before, r.readers.lost, r.readers.gained, r.readers.after),
        ),
        h(
          'p',
          {},
          tr('Город: {0}, жителей {1}, разоблачено {2}, репутация {3}', stageChange(r.metricsBefore.cityIndex, r.metricsAfter.cityIndex), signed(
            r.metricsAfter.activeResidents - r.metricsBefore.activeResidents,
          ), r.exposures.length, signed(Math.round(r.trustAfter - r.trustBefore))),
        ),
      ),
      ...(r.events.length || r.notes.length
        ? [h('div', { class: 'report-item' }, h('strong', {}, tr('Новый день')), ...r.events.map((e) => h('p', {}, `• ${e}`)), ...r.notes.map((n) => h('p', { class: 'muted' }, n)))]
        : []),
    ];
  }

  /**
   * The reporter window's head (CONCEPT.md §7.3 «Окно репортёра»): a big portrait, the name with «?»,
   * the level as a yellow plaque with four steps, the experience bar and what is left; in the corner
   * luck and nose as icons (their look grows with them; hover or tap tells the level) and loyalty.
   */
  /** What a level gives, for the plaque's hint: «Мастер: удача +10%, чутьё +1, ложь ловят на 20% реже». */
  function levelPerks(level: number): string {
    const b = c.balance;
    const parts = [tr('удача +{0}', pct(b.levelLuck[level] ?? 0)), tr('чутьё +{0}', b.levelNose[level] ?? 0)];
    const check = b.levelCheckMul[level] ?? 1;
    if (check < 1) parts.push(tr('ложь в его новостях ловят на {0} реже', pct(1 - check)));
    return level === 0 ? tr('{0}: пока без бонусов', levelNames[0]) : `${levelNames[level]}: ${parts.join(', ')}`;
  }

  function reporterHead(id: string, opts: { key?: string; lines?: (string | HTMLElement)[]; body?: HTMLElement[]; action?: HTMLElement | null; compact?: boolean } = {}): HTMLElement {
    const r = reporterOf(c, id);
    // A candidate from the agency has no record yet: a novice with no experience and no loyalty.
    const hired = state.reporters.includes(id);
    const xp = hired ? staffOf(state, c, id).xp : 0;
    const level = levelOf(c, xp);
    const steps = c.balance.reporterLevels;
    const next = steps[level + 1];
    const share = next === undefined ? 1 : (xp - steps[level]) / (next - steps[level]);
    const left = next === undefined ? 0 : next - xp;
    const fronts = Math.ceil(left / c.balance.xpPerPlacement[2]);
    const sk = skillTiers(c, state, r);
    const loyal = hired ? loyaltyOf(c, state, r) : null;
    // Several heads share a window in «Редакция»: each keeps its own open tips.
    const k = opts.key ?? '';
    const toggle = (key: string) => (e: Event) => {
      e.stopPropagation();
      if (openInfo.has(key)) openInfo.delete(key);
      else openInfo.add(key);
      render();
    };
    const skill = (key: string, icon: string, title: string, text: string) =>
      h(
        'button',
        { class: `skill-icon${openInfo.has(key) ? ' on' : ''}`, 'aria-label': title, 'aria-expanded': String(openInfo.has(key)), onclick: toggle(key) },
        h('img', { src: `${assetBase}sprites/ui/${icon}.png`, alt: '', width: 32, height: 32 }),
        h('span', { class: 'skill-tip' }, h('b', {}, title), text),
      );
    return h(
      'div',
      { class: `rep-head${opts.compact ? ' compact' : ''}`, id: hired && opts.compact ? `rep-${id}` : undefined },
      portrait(id, 'portrait rep-head-portrait'),
      h(
        'div',
        { class: 'rep-head-body' },
        h(
          'div',
          { class: 'rep-head-name' },
          r.name,
          h('button', { class: `section-info${openInfo.has(`${k}about`) ? ' on' : ''}`, title: tr('О репортёре'), 'aria-expanded': String(openInfo.has(`${k}about`)), onclick: toggle(`${k}about`) }, '?'),
        ),
        ...(openInfo.has(`${k}about`) ? [h('p', { class: 'hint info-text' }, aboutLine(r))] : []),
        h(
          'div',
          { class: 'rep-level' },
          h('span', { class: 'level-chip', title: levelPerks(level) }, levelNames[level]),
          h('span', { class: 'level-pips', title: tr('Ступень {0} из {1}', level + 1, steps.length) }, ...steps.map((_, i) => h('i', { class: i <= level ? 'on' : '' }))),
        ),
        ...(hired
          ? [
              h('div', { class: 'xp-bar', title: next === undefined ? tr('Опыт {0}', xp) : tr('Опыт {0} из {1}', xp, next) }, h('b', { style: `width: ${Math.round(share * 100)}%` })),
              h(
                'div',
                { class: 'xp-caption' },
                ...(next === undefined
                  ? [tr('Высшая ступень — расти больше некуда')]
                  : [tr('До «{0}» ещё ', levelNamesGen[level + 1]), h('b', {}, tr('{0} опыта', left)), opts.compact ? '' : ` · ≈ ${fronts} ${plural(fronts, 'первая полоса', 'первые полосы', 'первых полос')}`]),
              ),
            ]
          : []),
        ...(opts.lines ?? []).map((x) => h('p', { class: 'rep-head-line' }, x)),
        opts.action ? h('div', { class: 'rep-head-action' }, opts.action) : null,
      ),
      ...(opts.body?.length ? [h('div', { class: 'rep-head-tools' }, ...opts.body)] : []),
      h(
        'div',
        { class: 'rep-corner' },
        skill(`${k}luck`, `luck_${sk.luckTier}`, tr('Удача: {0}', luckNames[sk.luckTier].toLowerCase()), tr('{0} — так часто репортёр что-то находит. С опытом подкова становится лучше.', pct(sk.luck))),
        skill(`${k}nose`, `nose_${sk.noseTier}`, tr('Чутьё: {0}', noseNames[sk.noseTier].toLowerCase()), tr('Чем тоньше нюх, тем чаще находки интересные и сенсационные. С опытом нюх становится тоньше.')),
        loyal ? h('span', { class: `loyal loyal-${loyal.level}`, title: tr('Лояльность: ложь в газете её подтачивает, ниже предела репортёр уходит') }, loyal.word) : null,
      ),
    );
  }

  /**
   * «Приёмы» (CONCEPT.md §3.5): ready ones are blue with their price, the others say why not or in
   * how many days. A press uses the ability at once; a new story lands in the briefs.
   */
  function renderAbilities(): void {
    const owned = abilitiesOf(state, c);
    abilityBar.hidden = searching || !!state.outcome;
    if (abilityBar.hidden) return;
    const reasons: Record<string, string> = {
      'nobody free': tr('все репортёры заняты'),
      'nothing to raise': tr('нечего усиливать'),
    };
    const ready = cashMoves(state, c).filter((x) => !cashBlock(state, c, x.id)).length;
    const active = activeCash();
    abilityBar.replaceChildren(
      h(
        'button',
        { class: `ability cash-open${ready ? ' ready' : ' wait'}`, disabled: busy, title: tr('Грязные приёмы: {0}. Разовые ходы за паузу, сильные — ещё и за репутацию.', ready ? tr('доступно ходов — {0}', ready) : tr('пока ничего')), 'aria-label': tr('Грязные приёмы'), onclick: () => openModal('cash') },
        h('span', { class: 'ability-icon', 'aria-hidden': 'true' }, '🎭'),
        h('span', { class: 'ability-text' }, h('b', {}, tr('Грязные приёмы')), h('small', {}, ready ? tr('доступно: {0}', ready) : tr('пока ничего'))),
        ready ? h('span', { class: 'ability-badge' }, String(ready)) : null,
      ),
      // What acts today or tomorrow: an icon, its words in the tooltip.
      ...active.map((x) => h('span', { class: 'cash-chip', title: `${upperFirst(x.label)}. ${x.def.text}`, 'aria-label': x.label }, x.def.icon)),
      ...owned.map(({ def, readyTurn }) => {
        const block = abilityBlock(state, c, def.id);
        const wait = readyTurn - state.turn;
        const status = !block ? tr('готово') : block === 'cooling down' ? tr('через {0} {1}', wait, plural(wait, 'день', 'дня', 'дней')) : reasons[block] ?? '';
        return h(
          'button',
          {
            class: `ability${!block ? ' ready' : ' wait'}`,
            disabled: !!block || busy,
            title: `${def.name}: ${status}. ${def.description} ${def.drawback ?? ''}`.trim(),
            'aria-label': def.name,
            onclick: () => {
              try {
                const added = useAbility(state, c, def.id);
                for (const uid of added) {
                  drafts.set(uid, { publish: true, placement: 0, distortion: 0 });
                  revealed.add(uid);
                  flyQueue.add(uid);
                }
                error = '';
              } catch (e) {
                error = e instanceof Error ? e.message : String(e);
              }
              render();
            },
          },
          h('span', { class: 'ability-icon', 'aria-hidden': 'true' }, def.icon ?? '★'),
          // Waiting: the days left on the icon.
          block === 'cooling down' ? h('span', { class: 'ability-badge wait' }, String(wait)) : null,
        );
      }),
    );
  }

  /** Dirty tricks that act today or tomorrow, in words for the chips above the paper. */
  function activeCash(): { def: CashDef; label: string }[] {
    const out: { def: CashDef; label: string }[] = [];
    for (const def of c.cash) {
      if (cashActive(state, def.id)) out.push({ def, label: def.id === 'bribe' ? tr('фактчекеры подкуплены') : def.id === 'giveaway' ? tr('выпуск раздаётся бесплатно') : tr('сегодня') });
      else if (cashActive(state, def.id, state.turn + 1)) out.push({ def, label: def.id === 'provoke' ? tr('провокаторы выйдут завтра') : tr('папарацци принесут снимки завтра') });
    }
    return out;
  }

  /**
   * «Грязные приёмы» (CONCEPT.md §3.5в, §10.4): one-off moves for a cooldown, the strong ones for
   * reputation too. A leak lands in the briefs at once, like a story from an ability.
   */
  function cashContent(): (HTMLElement | null)[] {
    const active = new Set(activeCash().map((x) => x.def.id));
    return [
      ...(error ? [h('p', { class: 'bad' }, error)] : []),
      h(
        'div',
        { class: 'deck cash-list' },
        ...cashMoves(state, c).map((def) => {
          const block = cashBlock(state, c, def.id);
          return h(
            'div',
            { class: `deck-card cash-card${block ? ' wait' : ''}` },
            active.has(def.id) ? h('span', { class: 'best-mark' }, tr('действует')) : null,
            h('span', { class: 'upg-icon', 'aria-hidden': 'true' }, def.icon),
            h('b', {}, def.name),
            h('p', { class: 'upg-plus' }, def.text),
            h(
              'div',
              { class: 'deck-foot' },
              h('span', { class: 'hint' }, tr('пауза {0} {1}', cashCooldown(state, c, def.id), plural(cashCooldown(state, c, def.id), 'день', 'дня', 'дней'))),
              h(
                'button',
                {
                  class: block ? '' : 'primary',
                  disabled: !!block || busy,
                  onclick: () => {
                    try {
                      const card = useCash(state, c, def.id);
                      if (card) {
                        drafts.set(card.uid, { publish: true, placement: 0, distortion: 0 });
                        revealed.add(card.uid);
                        flyQueue.add(card.uid);
                      }
                      error = '';
                    } catch (e) {
                      error = e instanceof Error ? e.message : String(e);
                    }
                    render();
                  },
                },
                block ?? (cashCost(state, c, def.id) ? tr('Сделать · репутация −{0}', cashCost(state, c, def.id)) : tr('Сделать')),
              ),
            ),
          );
        }),
      ),
    ];
  }

  /** The day the dirt comes in: the exclusive is in today's paper (CONCEPT.md §3.3а). */
  function renderDig(): void {
    const done = state.lastFinds.filter((f) => f.kind === 'investigation' && f.cardUid !== null);
    digNotice.hidden = !done.length || digSeen || searching;
    if (digNotice.hidden) return;
    digNotice.replaceChildren(
      h(
        'div',
        { class: 'notice-head' },
        h('span', { class: 'dig-icon', 'aria-hidden': 'true' }, '⛏'),
        h('b', {}, done.length > 1 ? tr('Расследований готово: {0}', done.length) : tr('Расследование готово')),
        h('button', { class: 'icon-btn', title: tr('Закрыть'), onclick: () => ((digSeen = true), render()) }, '×'),
      ),
      ...done.map((f) => {
        const card = state.hand.find((x) => x.uid === f.cardUid);
        return h(
          'p',
          { class: 'notice-note' },
          tr('{0} {1} эксклюзив: ', reporterOf(c, f.reporterId).name, reporterOf(c, f.reporterId).female ? tr('принесла') : tr('принёс')),
          h('b', {}, card ? `${quoted(storyTitle(c, card, 0))}` : ''),
          card?.tier === 3 ? tr(' — сенсация!') : '',
          tr(' Поставьте его на первую полосу.'),
        );
      }),
    );
  }

  /**
   * What digging under a group would bring (CONCEPT.md §3.3а «Карточка-обещание»): the headline, when,
   * what it does to the town in words, what it costs, and how it may come out. With a reporter, the
   * days and odds are theirs.
   */
  function digPromise(target: string, reporterId: string | null): HTMLElement {
    const b = c.balance;
    const g = groupOf(c, target);
    const tpl = c.cards.find((t) => t.source === 'investigation' && t.target === target);
    const r = reporterId ? skilledReporter(state, c, reporterOf(c, reporterId)) : null;
    const days = r ? investigationTurns(c, r) : b.investigationTurns;
    const fast = b.investigationTurns - 1;
    const sensation = r ? Math.min(1, b.investigationSensationBase + b.investigationSensationPerNose * r.skills.nose) : null;
    const truth = r ? Math.min(1, b.investigationTruthBase + b.investigationTruthPerNose * r.skills.nose) : null;
    // Pairs already in a quarrel with the target: there the dirt may go as far as fights.
    const hot = c.groups
      .filter((x) => x.id !== target)
      .map((x) => ({ x, level: tensionLevel(c, state.tension[pairKey(c, target, x.id)] ?? 0) }))
      .filter((p) => p.level >= 1)
      .sort((a, b2) => b2.level - a.level);
    const others = state.residents.filter((x) => x.status === 'active' && x.group !== target && x.follows.length > 0).length;
    const effect = [
      tr('Настроит остальных против {0}: прочтут ≈ {1} ваших читателей из других групп.', g.forms.manyGen, others),
      ...hot.slice(0, 2).map((p) => tr('С {0} и так {1}{2}.', p.x.forms.manyIns, tensionLabels[p.level].toLowerCase(), p.level >= 2 ? tr(' — может дойти до драк') : '')),
      tr('Часть {0} уедет — даже те, кто вас не читает.', g.forms.manyGen),
    ];
    const odds = r
      ? [
          truth! >= 0.6 ? tr('скорее правда') : truth! >= 0.4 ? tr('правда или слух — как повезёт') : tr('скорее слух'),
          sensation! >= 0.5 ? tr('скорее всего сенсация') : sensation! >= 0.3 ? tr('может выйти сенсацией') : tr('сенсация — редкость'),
        ].join(', ')
      : tr('с чутьём репортёра выше шанс правды и сенсации');
    return h(
      'div',
      { class: 'dig-promise' },
      tpl ? h('p', { class: 'dig-headline' }, h('span', {}, tr('Выйдет примерно так: ')), h('b', {}, `${quoted(tpl.titles[0] ?? '')}`)) : null,
      h('p', { class: 'dig-when' }, r ? tr('Через {0} {1} — эксклюзив на первую полосу.', days, turnsWord(days)) : tr('Через {0} дня — эксклюзив на первую полосу.', fast === days ? days : `${fast}–${days}`)),
      ...effect.map((t) => h('p', { class: 'dig-effect' }, t)),
      h('p', { class: 'dig-cost' }, r ? tr('{0} {1} {2} не пишет новостей', days, turnsWord(days), r.name.split(' ').pop()) : tr('Репортёр всё это время не пишет новостей')),
      h('p', { class: 'dig-odds' }, tr('Что выйдет: {0}.', odds)),
    );
  }

  /** «Компромат на …»: the promise, then who can dig (CONCEPT.md §3.3а). */
  function digContent(): HTMLElement[] {
    const target = digTarget;
    if (!target) return [];
    const busy = (id: string) => state.investigations.find((x) => x.reporterId === id);
    const under = state.investigations.find((x) => x.target === target);
    return [
      digPromise(target, null),
      ...(error ? [h('p', { class: 'bad' }, error)] : []),
      h('h3', { class: 'section' }, under ? tr('Уже копает: {0}', reporterOf(c, under.reporterId).name) : tr('Кто будет копать')),
      ...state.reporters.map((id) => {
        const r = skilledReporter(state, c, reporterOf(c, id));
        const inv = busy(id);
        const days = investigationTurns(c, r);
        const truth = Math.min(1, c.balance.investigationTruthBase + c.balance.investigationTruthPerNose * r.skills.nose);
        const sensation = Math.min(1, c.balance.investigationSensationBase + c.balance.investigationSensationPerNose * r.skills.nose);
        return h(
          'div',
          { class: 'shop-item dig-who' },
          portrait(id, 'portrait carry-portrait'),
          h(
            'div',
            {},
            h('strong', {}, r.name),
            h(
              'p',
              { class: 'hint' },
              inv
                ? tr('Копает под {0} · ещё {1} {2}', digWhom(inv.target), inv.turnsLeft, turnsWord(inv.turnsLeft))
                : `${days} ${turnsWord(days)} · ${truth >= 0.6 ? tr('скорее правда') : truth >= 0.4 ? tr('правда или слух') : tr('скорее слух')} · ${sensation >= 0.5 ? tr('скорее сенсация') : sensation >= 0.3 ? tr('может выйти сенсацией') : tr('сенсация редко')}`,
            ),
          ),
          h(
            'button',
            {
              class: inv ? '' : 'primary',
              disabled: !!inv || !!state.outcome,
              onclick: () => {
                try {
                  startInvestigation(state, c, id, target);
                  error = '';
                  modal = null;
                } catch (e) {
                  error = e instanceof Error ? e.message : String(e);
                }
                render();
              },
            },
            tr('Копать'),
          ),
        );
      }),
      h('button', { class: 'ghost', onclick: () => openModal('population') }, tr('← Жители')),
    ];
  }

  function renderModal(): void {
    if (!modal) {
      modalLayer.replaceChildren();
      return;
    }
    const titles: Record<Exclude<Modal, null>, string> = {
      report: report ? tr('Итоги хода {0}', report.turn) : tr('Итоги хода'),
      debug: tr('Отладка'),
      city: tr('Сводка'),
      population: tr('Сводка'),
      readers: tr('Сводка'),
      reputation: tr('Сводка'),
      shop: tr('Сводка'),
      cash: tr('Грязные приёмы'),
      team: tr('Сводка'),
      dig: digTarget ? tr('Компромат на {0}', groupOf(c, digTarget).forms.manyGen) : tr('Компромат'),
      pause: tr('Меню'),
      howto: tr('Как играть'),
      settings: tr('Настройки'),
      about: tr('Об игре'),
      newgame: tr('Свободная игра'),
      tutorial: tr('Обучение'),
      office: tr('Карты · Кабинет редактора'),
      campaignNew: tr('Новая кампания'),
      carry: tr('Кто поедет дальше'),
      feedback: tr('Оставить отзыв'),
    };
    const body =
      modal === 'report' ? reportContent() : modal === 'debug' ? debugContent() : modal === 'city' ? cityContent() : modal === 'population' ? populationContent() : modal === 'readers' ? readersContent() : modal === 'reputation' ? reputationContent() : modal === 'dig' ? digContent() : modal === 'pause' ? pauseContent() : modal === 'howto' ? howtoContent() : modal === 'settings' ? settingsContent() : modal === 'about' ? aboutContent() : modal === 'newgame' ? newGameContent() : modal === 'tutorial' ? tutorialStartContent() : modal === 'office' ? officeContent() : modal === 'campaignNew' ? campaignNewContent() : modal === 'carry' ? carryContent() : modal === 'team' ? teamContent() : modal === 'cash' ? cashContent() : modal === 'feedback' ? feedbackContent() : shopContent();
    const scroll = modalLayer.querySelector('.modal-body')?.scrollTop ?? 0;
    // «Сводка» (CONCEPT.md §7.3): one window, its tabs in a column on the left of the content.
    const tab = SUMMARY_TABS.find((t) => t.id === modal);
    const panel = h(
      'div',
      { class: `modal window${modal === 'office' ? ' office' : ''}${tab ? ' summary' : ''}` },
      h('div', { class: 'modal-title' }, h('h2', {}, titles[modal], tab ? h('span', { class: 'summary-sub' }, ` · ${tab.name}`) : null), h('button', { class: 'icon-btn', title: tr('Закрыть'), onclick: () => openModal(null) }, '×')),
      tab ? h('div', { class: 'summary-wrap' }, summaryTabs(modal), h('div', { class: 'modal-body' }, ...body)) : h('div', { class: 'modal-body' }, ...body),
    );
    modalLayer.replaceChildren(panel);
    modalLayer.onclick = (e) => {
      if (e.target === modalLayer) openModal(null);
    };
    modalLayer.querySelector('.modal-body')!.scrollTop = scroll;
  }

  /** The tabs of «Сводка»: each opens its part in the same window. */
  function summaryTabs(on: Modal): HTMLElement {
    return h(
      'div',
      { class: 'summary-tabs', role: 'tablist' },
      ...SUMMARY_TABS.map((t) =>
        h(
          'button',
          { class: `summary-tab${t.id === on ? ' on' : ''}`, role: 'tab', title: t.name, 'aria-selected': String(t.id === on), onclick: () => openModal(t.id) },
          h('img', { src: `${assetBase}sprites/ui/${t.icon}.png`, alt: '', width: 16, height: 16 }),
          h('span', {}, t.name),
        ),
      ),
    );
  }

  /** The game's stars and what each was for (CONCEPT.md §4.8), and whether it is a new record. */
  function outcomeStars(): HTMLElement {
    const s = scoreOf(state, c);
    const row = (ok: boolean, text: string) => h('li', { class: ok ? 'ok' : '' }, `${ok ? '★' : '☆'} ${text}`);
    const best = tutorial || !state.town || !isGeneratedTown(state.town) ? null : recordOf(state.mode, state.difficulty, state.length, state.town);
    return h(
      'div',
      { class: 'outcome-stars' },
      h('div', { class: 'stars' }, starLine(s.stars)),
      h('ul', {}, row(s.win, tr('Победа')), row(s.tasks, tr('Все задания выполнены')), row(s.clean, tr('Ни одного разоблачения'))),
      newRecord ? h('p', { class: 'record new' }, tr('Новый рекорд!')) : best ? h('p', { class: 'record' }, tr('Рекорд: {0} · {1} {2}', starLine(best.stars), best.days, daysWord(best.days))) : null,
    );
  }

  /** After a game: a single one goes on to the next town or a new game; a campaign town back to the map. */
  function outcomeButtons(): HTMLElement[] {
    const win = state.outcome?.result === 'win';
    if (state.town && !isGeneratedTown(state.town) && campaign) {
      const i = base.towns.findIndex((t) => t.id === state.town);
      const last = i === base.towns.length - 1;
      const level = state.difficulty;
      return [
        win
          ? h('button', { class: 'primary big', onclick: () => (last ? openCampaign() : openModal('carry')) }, last ? tr('Кампания пройдена ▸') : tr('Кто поедет дальше ▸'))
          : h('button', { class: 'primary big', onclick: () => void startTown(i, level) }, tr('Переиграть')),
        h('button', { onclick: () => openCampaign() }, tr('На карту')),
      ];
    }
    return [
      // After the tutorial the real game is chosen in «Свободная игра» (length, difficulty).
      win && !tutorial
        ? h('button', { class: 'primary big', onclick: () => void startGame(state.mode) }, tr('Сыграть ещё ▸'))
        : h('button', { class: 'primary big', onclick: () => openModal('newgame') }, tr('Свободная игра')),
      h('button', { onclick: () => showTitle() }, tr('Главное меню')),
    ];
  }

  function renderOutcome(): void {
    // The main menu, the campaign map and the opening story cover the finished game: its result is not shown over them.
    // A window opened from it (the office, who goes on, a new game) takes its place until it is closed.
    if (!state.outcome || busy || titleOpen || campaignOpen || introPlaying || modal) {
      outcomeLayer.replaceChildren();
      return;
    }
    outcomeLayer.replaceChildren(
      h(
        'div',
        { class: `modal ${state.outcome.result}` },
        h('h2', {}, state.outcome.result === 'win' ? tr('Победа') : tr('Поражение')),
        h('p', {}, outcomeText(state.outcome, goalTitle(c, goalOf(c)))),
        h('p', { class: 'muted' }, tr('Сыграно ходов: {0}. Город: {1}.', Math.min(state.turn - 1, c.balance.turnLimit), cityStage().name.toLowerCase())),
        tutorial
          ? h('p', { class: 'tutorial-done' }, tr('Обучение пройдено. Теперь — настоящая партия на любой сложности («Свободная игра»).'))
          : null,
        outcomeStars(),
        // «Связи» for the office (CONCEPT.md §3.5б).
        lastReward
          ? h(
              'p',
              { class: 'reward-line' },
              h('b', {}, tr('+{0} ✦ связей', lastReward)),
              tr(' — на новые карты и их улучшение. '),
              packAffordable() ? h('b', { class: 'reward-enough' }, tr(' Хватит на конверт с новой картой!')) : null,
              h('button', { class: 'ghost', onclick: () => openModal('office') }, cardsIcon(), tr('Карты: купить и улучшить')),
            )
          : null,
        h(
          'div',
          { class: 'outcome-actions' },
          ...outcomeButtons(),
        ),
        h('button', { class: 'ghost feedback-btn', onclick: () => openFeedback('outcome') }, tr('✉ Оставить отзыв')),
      ),
    );
  }

  function render(): void {
    // The music darkens with the town: calm, crisis, decline (CONCEPT.md §7.2а).
    const stage = hasGame && !titleOpen ? cityStateOf(c, state.metrics.cityIndex) : 0;
    sound.setMood((stage <= 1 ? 0 : stage === 2 ? 1 : 2) as MusicMood);
    if (tutorial && !busy && !searching) {
      const step = tutorialStep();
      // «Стравите горожан» never waits for the town to quarrel on its own: a reporter brings one.
      const tip = step ? tipFor(tutorial, tutorialView()) : null;
      if (tip) {
        // It lands as a brief, already shown, like a night shift's story.
        revealed.add(tip.uid);
        drafts.set(tip.uid, { publish: true, placement: 0, distortion: 0 });
      }
    }
    layOutIssue();
    fitSensations();
    // The publish button bumps once when a change raises or lowers the issue level.
    const level = searching ? null : currentIssueLevel();
    levelBump = level === null || shownLevel === null || level === shownLevel ? '' : level > shownLevel ? 'bump-up' : 'bump-down';
    shownLevel = level;
    renderHud();
    reporterBar.render(state, repStatus, searching);
    // A promoted reporter's portrait celebrates once the day's search is over (CONCEPT.md §3.3б).
    if (report && !searching && !busy && promotedTurn !== report.turn) {
      promotedTurn = report.turn;
      reporterBar.celebrate(report.staff.levelUps);
      if (report.staff.levelUps.length) sound.play('chime');
    }
    renderCityEvents();
    renderIssue();
    renderExposures();
    renderReconcile();
    renderDig();
    renderStaff();
    renderLetters();
    renderOffer();
    renderTwist();
    renderTasks();
    renderHunt();
    foldPlaques();
    renderGuide();
    renderModal();
    renderOutcome();
    renderTitle();
    renderCampaign();
    renderTutorialTargets();
    renderMenus();
    saveSoon();
  }
  /**
   * A story's menu on a phone (CONCEPT.md §7.3): the floating «В печать» steps aside while one is open
   * (`menu-open`), and a menu that opens below the screen's edge is scrolled into view once.
   */
  let scrolledMenu = '';
  function renderMenus(): void {
    const key = truthMenuFor !== null ? `t${truthMenuFor}` : moveMenuFor !== null ? `m${moveMenuFor}` : chooserFor !== null ? `c${chooserFor}` : '';
    root.classList.toggle('menu-open', key !== '');
    if (!key || key === scrolledMenu) {
      scrolledMenu = key;
      return;
    }
    scrolledMenu = key;
    const menu = issue.querySelector('.place-menu, .zone-chooser:not(:empty)');
    requestAnimationFrame(() => menu?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
  }
  /**
   * The plaques over the paper start folded to their head line (CONCEPT.md §7.3); a press on the head
   * unfolds one for this session. The tasks and the newsroom fold by their own settings.
   */
  function foldPlaques(): void {
    const plaques: [HTMLElement, string][] = [
      [exposureNotice, 'exposed'],
      [reconcileNotice, 'peace'],
      [digNotice, 'dig'],
      [offerNotice, 'offer'],
      [twistNotice, 'twist'],
      [huntNotice, 'hunt'],
    ];
    for (const [el, key] of plaques) {
      const head = el.querySelector<HTMLElement>(':scope > .notice-head');
      if (el.hidden || !head) continue;
      const open = openPlaques.has(key);
      el.classList.toggle('plaque-folded', !open);
      head.classList.add('plaque-head');
      head.querySelector(':scope > .plaque-arrow')?.remove();
      head.append(h('span', { class: 'plaque-arrow', 'aria-hidden': 'true' }, open ? '▴' : '▾'));
      head.onclick = (e) => {
        if ((e.target as Element).closest('button')) return;
        if (open) openPlaques.delete(key);
        else openPlaques.add(key);
        render();
      };
    }
  }

  // ---------- Campaign (CONCEPT.md §9) ----------

  /** The map of the campaign. Without one, a new one starts right away. */
  function openCampaign(): void {
    track('campaign_open');
    if (!campaign) {
      campaign = newCampaign('destroy');
      saveCampaign(campaign);
    }
    const camp = campaign;
    const next = base.towns.findIndex((_, i) => townState(base, camp, i) === 'now' || townState(base, camp, i) === 'gated');
    campaignSel = next >= 0 ? next : Math.min(camp.reached, base.towns.length - 1);
    campaignOpen = true;
    titleOpen = false;
    modal = null;
    issueOpen = false;
    tooltip.hidden = true;
    scene?.startTour();
    render();
  }

  /** Plays a pass of a campaign town; the opening story first, if the player has never seen it. */
  async function startTown(i: number, level: Difficulty): Promise<void> {
    if (!campaign) return;
    const t = base.towns[i];
    campaignLevel = level;
    campaignOpen = false;
    modal = null;
    titleOpen = false;
    render();
    if (!settings.introSeen) await watchIntro();
    scene?.stopTour();
    newGame(randomSeed(), campaign.side, t.id);
  }

  /** The region map with the towns in a row, and the card of the chosen town. */
  let campaignKey = '';
  function renderCampaign(): void {
    campaignLayer.hidden = !campaignOpen || !campaign;
    if (campaignLayer.hidden || !campaign) {
      campaignLayer.replaceChildren();
      campaignKey = '';
      return;
    }
    const camp = campaign;
    // Rebuilt only when something on it changes: the map canvas is drawn pixel by pixel.
    const key = JSON.stringify([camp, campaignSel, collection.currency, collectionCount()]);
    if (key === campaignKey) return;
    campaignKey = key;
    const stars = campaignStars(camp);
    const need = base.towns.reduce((m, t) => Math.max(m, t.starsToEnter ?? 0), 0);
    // The menu behind ☰: toggled by a class, since the map is not re-rendered for it.
    const menu = h(
      'div',
      { class: 'camp-menu' },
      h('button', { onclick: () => openModal('campaignNew') }, tr('Новая кампания')),
      h(
        'button',
        {
          onclick: () => {
            campaignOpen = false;
            showTitle();
          },
        },
        tr('Главное меню'),
      ),
    );
    const menuButton = h('button', { class: 'icon-btn camp-burger', title: tr('Меню'), 'aria-label': tr('Меню') }, '☰');
    menuButton.onclick = () => menu.classList.toggle('open');
    const pins = base.towns.map((t, i) => {
      const st = townState(base, camp, i);
      const won = townStars(camp, t.id);
      return h(
        'button',
        {
          class: `town-pin ${st}${i === campaignSel ? ' sel' : ''}${t.starsToEnter ? ' final' : ''}`,
          style: `left: ${(t.map.x / MAP_W) * 100}%; top: ${(t.map.y / MAP_H) * 100}%`,
          title: t.name,
          onclick: () => {
            campaignSel = i;
            render();
          },
        },
        h('span', { class: 'pin' }, h('img', { src: `${assetBase}${townArt(t)}`, alt: '', width: 48, height: 48 })),
        h('span', { class: 'lbl' }, `${i + 1}. ${t.name}`),
        won > 0 ? h('span', { class: 'pin-stars' }, `★ ${won}`) : null,
      );
    });
    const board = h('div', { class: 'camp-board' }, h('img', { class: 'camp-region', src: `${assetBase}${REGION_ART}`, alt: '', width: MAP_W, height: MAP_H, draggable: 'false' }), ...pins);
    const mapEl = h('div', { class: 'camp-map' }, board);
    campaignLayer.replaceChildren(
      h(
        'header',
        { class: 'camp-top' },
        // What the player has: the campaign's stars and the «связи» for the editor's office.
        h(
          'span',
          { class: 'camp-assets' },
          h('span', { class: 'camp-asset', title: tr('Звёзды кампании. Финал открывается с {0} ★', need) }, h('b', {}, `★ ${stars}`), h('small', {}, tr('звёзды'))),
          // The «связи» lead where they are spent: the cards.
          h('button', { class: 'camp-asset camp-ties', title: tr('Связи холдинга — на новые карты и их улучшение'), onclick: () => openModal('office') }, h('b', {}, `✦ ${collection.currency}`), h('small', {}, tr('связи'))),
        ),
        h(
          'button',
          { class: `camp-office${packAffordable() ? ' can-buy' : ''}`, title: tr('Карты: купить новые за связи и улучшить свои (в коллекции {0})', collectionCount()), onclick: () => openModal('office') },
          cardsIcon(),
          h('span', { class: 'camp-office-text' }, tr('Карты')),
          packAffordable() ? h('span', { class: 'buy-badge' }, '!') : null,
        ),
        h('span', { class: 'camp-menu-wrap' }, menuButton, menu),
      ),
      h('div', { class: 'camp-wrap' }, mapEl, townCard(campaignSel)),
    );
    panMap(mapEl, board, base.towns[campaignSel]);
  }

  /** Where the campaign map was dragged to: kept while the player picks towns. */
  let mapPan: { x: number; y: number } | null = null;

  /**
   * The region picture covers its whole area (no bands around it); what does not fit is reached by
   * dragging or by the arrows at the edges where something is hidden. On the first look the chosen town
   * is in the middle; a drag that moved does not press a pin.
   */
  function panMap(mapEl: HTMLElement, board: HTMLElement, town: TownDef): void {
    // What has to be reachable: the picture and every town with its name, even a label that hangs over
    // the picture's edge (in the board's own pixels, a small margin around).
    // A pin with its name and stars, which hang outside its own box.
    const pinRect = (pin: HTMLElement) => {
      const rs = [pin, ...pin.children].map((x) => x.getBoundingClientRect());
      return { left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)), right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)) };
    };
    const extent = () => {
      const b = board.getBoundingClientRect();
      const e = { left: 0, top: 0, right: board.offsetWidth, bottom: board.offsetHeight };
      for (const pin of board.querySelectorAll<HTMLElement>('.town-pin')) {
        const r = pinRect(pin);
        e.left = Math.min(e.left, r.left - b.left - 6);
        e.top = Math.min(e.top, r.top - b.top - 6);
        e.right = Math.max(e.right, r.right - b.left + 6);
        e.bottom = Math.max(e.bottom, r.bottom - b.top + 6);
      }
      return e;
    };
    const clamp = (p: { x: number; y: number }) => {
      const e = extent();
      return {
        x: Math.min(-e.left, Math.max(mapEl.clientWidth - e.right, p.x)),
        y: Math.min(-e.top, Math.max(mapEl.clientHeight - e.bottom, p.y)),
      };
    };
    const apply = () => {
      if (!board.offsetWidth) return;
      mapPan = clamp(
        mapPan ?? {
          x: mapEl.clientWidth / 2 - (town.map.x / MAP_W) * board.offsetWidth,
          y: mapEl.clientHeight / 2 - (town.map.y / MAP_H) * board.offsetHeight,
        },
      );
      board.style.transform = `translate(${Math.round(mapPan.x)}px, ${Math.round(mapPan.y)}px)`;
      const near = clamp({ x: Infinity, y: Infinity });
      const far = clamp({ x: -Infinity, y: -Infinity });
      // A town or its name cut by the edge makes that side's arrow stand out.
      const m = mapEl.getBoundingClientRect();
      const cut = { left: false, right: false, up: false, down: false };
      // The arrows sit over the edges, so a name under an arrow counts as cut too.
      const edge = 50;
      for (const pin of board.querySelectorAll<HTMLElement>('.town-pin')) {
        const r = pinRect(pin);
        const midX = r.top < m.top + m.height / 2 + edge && r.bottom > m.top + m.height / 2 - edge;
        const midY = r.left < m.left + m.width / 2 + edge && r.right > m.left + m.width / 2 - edge;
        if (r.left < m.left + 2 || (midX && r.left < m.left + edge)) cut.left = true;
        if (r.right > m.right - 2 || (midX && r.right > m.right - edge)) cut.right = true;
        if (r.top < m.top + 2 || (midY && r.top < m.top + edge)) cut.up = true;
        if (r.bottom > m.bottom - 2 || (midY && r.bottom > m.bottom - edge)) cut.down = true;
      }
      for (const a of arrows) {
        const dir = a.dataset.dir as keyof typeof cut;
        const hidden = { left: mapPan.x < near.x - 12, right: mapPan.x > far.x + 12, up: mapPan.y < near.y - 12, down: mapPan.y > far.y + 12 }[dir];
        a.classList.toggle('off', !hidden);
        a.classList.toggle('town-hidden', hidden && cut[dir]);
      }
    };
    // One arrow per side: a press glides the map to that edge.
    const arrows = (['left', 'right', 'up', 'down'] as const).map((dir) =>
      h('button', {
        class: `camp-arrow ${dir}`,
        'data-dir': dir,
        title: tr('Показать другую часть карты'),
        onpointerdown: (e: Event) => e.stopPropagation(),
        onclick: () => {
          if (!mapPan) return;
          const near = clamp({ x: Infinity, y: Infinity });
          const far = clamp({ x: -Infinity, y: -Infinity });
          const to = { left: { x: near.x, y: mapPan.y }, right: { x: far.x, y: mapPan.y }, up: { x: mapPan.x, y: near.y }, down: { x: mapPan.x, y: far.y } }[dir];
          board.classList.add('gliding');
          setTimeout(() => board.classList.remove('gliding'), 500);
          mapPan = to;
          apply();
        },
      }, { left: '◀', right: '▶', up: '▲', down: '▼' }[dir]),
    );
    mapEl.append(...arrows);
    requestAnimationFrame(apply);
    new ResizeObserver(apply).observe(mapEl);
    let drag: { x: number; y: number; from: { x: number; y: number }; moved: boolean } | null = null;
    mapEl.onpointerdown = (e) => {
      drag = { x: e.clientX, y: e.clientY, from: mapPan ?? { x: 0, y: 0 }, moved: false };
      mapEl.setPointerCapture(e.pointerId);
    };
    mapEl.onpointermove = (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
      if (!drag.moved) return;
      mapPan = { x: drag.from.x + dx, y: drag.from.y + dy };
      apply();
    };
    mapEl.onpointerup = () => {
      // A drag swallows the click that follows it, so it never picks a town by accident.
      if (drag?.moved) mapEl.addEventListener('click', (ev) => ev.stopPropagation(), { capture: true, once: true });
      drag = null;
    };
  }

  /**
   * The chosen town: its picture, type, special rule, who comes along, and its three passes
   * (CONCEPT.md §9.1) — each with its main goal, days, best stars and a button; a pass opens once
   * the one before it is won.
   */
  function townCard(i: number): HTMLElement {
    const camp = campaign!;
    const t = base.towns[i];
    const st = townState(base, camp, i);
    // The town's icon on its own corner of the region map.
    const art = h(
      'div',
      { class: 'town-art', style: `background-image: url(${assetBase}${REGION_ART}); background-position: ${(t.map.x / MAP_W) * 100}% ${(t.map.y / MAP_H) * 100}%` },
      h('img', { src: `${assetBase}${townArt(t)}`, alt: '', width: 48, height: 48 }),
    );
    const pop = t.balance?.population ?? base.balance.population;
    const who = camp.carry ?? { id: base.balance.startReporters[0], xp: 0 };
    const rep = reporterOf(base, who.id);
    const pass = (level: Difficulty) => {
      const ps = passState(base, camp, i, level);
      const res = camp.results[t.id]?.[level];
      const pc = withTown(withDifficulty(base, level, camp.side), t.id, camp.side, level);
      const goal = camp.side === 'destroy' ? goalTitle(pc, goalOf(pc)) : tr('Не дать городу пасть');
      return h(
        'div',
        { class: `town-pass ${ps}` },
        h('div', { class: 'pass-head' }, h('b', {}, passNames[level]), h('span', { class: 'pass-level' }, base.difficulties.find((d) => d.id === level)?.name ?? ''), res ? h('span', { class: 'pass-stars' }, starLine(res.stars)) : null),
        h('div', { class: 'pass-goal' }, `🎯 ${goal} · ${pc.balance.turnLimit} ${daysWord(pc.balance.turnLimit)}`),
        ps === 'locked'
          ? h('span', { class: 'pass-lock' }, st === 'gated' ? tr('Нужно {0} ★ (у вас {1})', t.starsToEnter, campaignStars(camp)) : st === 'locked' ? tr('Сначала пройдите прошлый город') : tr('Сначала — {0}', passNames[PASSES[PASSES.indexOf(level) - 1]].toLowerCase()))
          : h('button', { class: ps === 'open' ? 'primary' : '', onclick: () => void startTown(i, level) }, ps === 'won' ? tr('Переиграть ради звёзд') : tr('Ехать в {0} ▸', t.name)),
      );
    };
    return h(
      'aside',
      { class: 'town-card' },
      h('h2', {}, t.name),
      h('div', { class: 'town-type' }, tr('{0} · жителей ~{1}', t.type, pop)),
      h('div', { class: 'town-rule' }, h('b', {}, t.rule.title), t.rule.text),
      h(
        'div',
        { class: 'town-facts' },
        h('span', {}, tr('Сложность')),
        // The lit bars take the town's colour: green for the easiest, red for the hardest.
        h('span', { class: `town-bars lvl-${t.stars}` }, ...[1, 2, 3, 4, 5].map((k) => h('i', { class: k <= t.stars ? 'on' : '' }))),
        h('span', {}, tr('Звёзды')),
        h('span', { class: 'town-best' }, tr('★ {0} из 9', townStars(camp, t.id))),
      ),
      st === 'now' || st === 'done'
        ? h(
            'div',
            { class: 'town-rep' },
            portrait(who.id, 'portrait town-rep-portrait'),
            h('div', {}, h('b', {}, `${camp.carry ? tr('С вами едет') : tr('Начнёт с вами')}: ${rep.name}`), h('span', { class: 'level-chip' }, levelNames[levelOf(base, who.xp)])),
          )
        : null,
      h('div', { class: 'town-passes' }, ...PASSES.map(pass)),
      // The picture last: on a narrow screen what matters comes first.
      art,
    );
  }

  /** Starting the campaign over: this window only confirms it. */
  function campaignNewContent(): HTMLElement[] {
    return [
      h('p', { class: 'bad' }, tr('Текущая кампания будет потеряна.')),
      h(
        'button',
        {
          class: 'primary',
          onclick: () => {
            campaign = newCampaign('destroy');
            saveCampaign(campaign);
            openCampaign();
          },
        },
        tr('Начать заново'),
      ),
      h('button', { class: 'ghost', onclick: () => openCampaign() }, tr('← Назад')),
    ];
  }

  /** After a won town: one reporter goes on to the next one, with their experience (CONCEPT.md §9). */
  function carryContent(): HTMLElement[] {
    const take = (id: string) => () => {
      if (!campaign) return;
      campaign.carry = { id, xp: staffOf(state, c, id).xp };
      saveCampaign(campaign);
      openCampaign();
    };
    return [
      h('p', {}, tr('В следующий город едет только один репортёр — со всем своим опытом. Остальные останутся здесь.')),
      ...state.reporters.map((id) => {
        const r = reporterOf(c, id);
        const xp = staffOf(state, c, id).xp;
        return h(
          'div',
          { class: 'shop-item carry-item' },
          portrait(id, 'portrait carry-portrait'),
          h('div', {}, h('strong', {}, r.name), h('span', { class: 'level-chip' }, levelNames[levelOf(c, xp)]), h('p', { class: 'hint' }, tr('Опыт {0}', xp))),
          h('button', { class: 'primary', onclick: take(id) }, tr('Взять')),
        );
      }),
    ];
  }

  // ---------- Menus (CONCEPT.md §7.3 «Меню») ----------

  /** Title screen over the live city: continue, new game, how to play, settings, about. */
  function renderTitle(): void {
    titleLayer.hidden = !titleOpen;
    root.classList.toggle('at-title', titleOpen || campaignOpen);
    if (!titleOpen) {
      titleLayer.replaceChildren();
      return;
    }
    const item = (label: string, onclick: () => void, cls = '') => h('button', { class: `title-item ${cls}`, onclick }, label);
    titleLayer.replaceChildren(
      h(
        'div',
        { class: 'title-box' },
        h('h1', { class: 'title-logo' }, h('span', {}, tr('УТКА')), ' ', h('span', {}, tr('В НОМЕР'))),
        h(
          'nav',
          { class: 'title-menu' },
          hasGame && !state.outcome
            ? h(
                'button',
                { class: 'title-item primary', onclick: continueGame },
                h('span', {}, tr('Продолжить')),
                h('small', {}, tr('{0} · день {1} из {2}', tutorial ? tr('Обучение') : state.town ? townOf(base, state.town).name : tr('Партия'), Math.min(state.turn, c.balance.turnLimit), c.balance.turnLimit)),
              )
            : null,
          h(
            'button',
            { class: 'title-item', onclick: () => openCampaign() },
            h('span', {}, tr('Кампания')),
            campaign ? h('small', {}, `★ ${campaignStars(campaign)} · ${campaign.finished ? tr('пройдена') : tr('город {0} из {1}', campaign.reached + 1, base.towns.length)}`) : null,
          ),
          // The tutorial mission first for a newcomer (CONCEPT.md §7.3 «Обучение»); a running game is not thrown away without asking.
          h(
            'button',
            { class: `title-item${!settings.tutorialDone && !(hasGame && !state.outcome) ? ' primary' : ''}`, onclick: () => (hasGame && !state.outcome ? openModal('tutorial') : void startGame('destroy', undefined, true)) },
            h('span', {}, tr('Обучение')),
            settings.tutorialDone ? h('small', {}, tr('пройдено')) : null,
          ),
          item(tr('Свободная игра'), () => openModal('newgame'), hasGame && !state.outcome ? '' : settings.tutorialDone ? 'primary' : ''),
          // The collection between games (CONCEPT.md §3.5б).
          h(
            'button',
            { class: `title-item office-item${packAffordable() ? ' can-buy' : ''}`, onclick: () => openModal('office') },
            h('span', {}, cardsIcon(), tr('Карты — купить и улучшить')),
            h('small', {}, `${collectionCount()} · ✦ ${collection.currency}${packAffordable() ? tr(' · хватит на конверт!') : ''}`),
          ),
          item(tr('Как играть'), () => openModal('howto')),
          item(tr('Настройки'), () => openModal('settings')),
          item(tr('Об игре'), () => openModal('about')),
          item(tr('✉ Оставить отзыв'), () => openFeedback('title')),
        ),
      ),
      h('div', { class: 'title-version' }, versionLabel),
    );
  }

  function showTitle(): void {
    titleOpen = true;
    tooltip.hidden = true;
    modal = null;
    issueOpen = false;
    scene?.startTour();
    render();
  }

  function continueGame(): void {
    track('game_continue', gameProps(state, gameKind()));
    titleOpen = false;
    modal = null;
    scene?.stopTour();
    issueOpen = true;
    busy = true;
    void runSearch();
  }

  /** Starts a new game; the opening story plays only before the player's very first game (CONCEPT.md §1.1). */
  async function startGame(mode: GameMode = 'destroy', seed?: number, tutorialGame = false): Promise<void> {
    modal = null;
    titleOpen = false;
    // The town composed in the free game's window (CONCEPT.md §9.5); the map is new every time.
    const town = tutorialGame ? null : choiceId(townChoice());
    render();
    if (!settings.introSeen) await watchIntro();
    scene?.stopTour();
    newGame(seed, mode, town, tutorialGame);
  }

  /** The opening story over the drifting city. */
  async function watchIntro(): Promise<void> {
    const wasTitle = titleOpen;
    titleOpen = false;
    modal = null;
    issueOpen = false;
    introPlaying = true;
    render();
    scene?.startTour();
    // The game interface hides behind the story as it does behind the title screen.
    root.classList.add('at-title');
    const introStart = Date.now();
    track('intro_start', { first: !settings.introSeen });
    await playIntro(root, c, assetBase);
    track('intro_end', { seconds: Math.round((Date.now() - introStart) / 1000) });
    introPlaying = false;
    root.classList.remove('at-title');
    settings.introSeen = true;
    saveSettings(settings);
    if (wasTitle) showTitle();
  }

  function pauseContent(): HTMLElement[] {
    const item = (label: string, onclick: () => void, cls = '') => h('button', { class: `menu-item ${cls}`, onclick }, label);
    return [
      h(
        'nav',
        { class: 'pause-menu' },
        item(tr('Продолжить'), () => openModal(null), 'primary'),
        item(tr('Как играть'), () => openModal('howto')),
        item(tr('Настройки'), () => openModal('settings')),
        ...(state.town && campaign ? [item(tr('Карта кампании'), () => openCampaign())] : []),
        item(tr('Свободная игра'), () => openModal('newgame')),
        item(tr('Главное меню'), () => showTitle()),
        item(tr('✉ Оставить отзыв'), () => openFeedback('pause'), 'feedback-item'),
        debugMode ? item(tr('Отладка'), () => openModal('debug'), 'ghost') : null,
      ),
      hasGame
        ? h(
            'p',
            { class: 'hint pause-difficulty' },
            tutorial ? tr('Обучение') : tr('Сложность: {0}', base.difficulties.find((d) => d.id === state.difficulty)?.name ?? ''),
          )
        : null,
    ].filter((x): x is HTMLElement => x !== null);
  }

  // ---------- Feedback (CONCEPT.md §7.6) ----------

  /** The «Оставить отзыв» form: a mood, a few words, one press; it lives until it is sent. */
  const feedback = { from: 'pause', mood: null as string | null, text: '', status: 'idle' as 'idle' | 'sending' | 'sent' | 'failed' };
  function openFeedback(from: string): void {
    feedback.from = from;
    if (feedback.status !== 'sending') feedback.status = 'idle';
    openModal('feedback');
  }
  const ITCH_PAGE = 'https://lightvdv.itch.io/breaking-town';
  function feedbackContent(): HTMLElement[] {
    const back = () => openModal(feedback.from === 'pause' ? 'pause' : null);
    if (feedback.status === 'sent') {
      return [h('p', { class: 'feedback-thanks' }, tr('Спасибо! Отзыв отправлен — мы прочитаем каждый.')), h('button', { class: 'primary big', onclick: back }, tr('← Назад'))];
    }
    const moods: [string, string][] = [
      ['like', tr('👍 Нравится')],
      ['meh', tr('😐 Так себе')],
      ['dislike', tr('👎 Не нравится')],
    ];
    const text = h('textarea', {
      class: 'feedback-text',
      rows: 5,
      maxlength: 2000,
      placeholder: tr('Что понравилось, что мешало, где запутались?'),
    }) as HTMLTextAreaElement;
    text.value = feedback.text;
    text.addEventListener('input', () => {
      feedback.text = text.value;
    });
    const send = async () => {
      if (!feedback.mood && !feedback.text.trim()) return;
      feedback.status = 'sending';
      render();
      const ok = await sendFeedback({ text: feedback.text.trim(), mood: feedback.mood, from: feedback.from, day: hasGame ? state.turn : null });
      feedback.status = ok ? 'sent' : 'failed';
      if (ok) {
        feedback.text = '';
        feedback.mood = null;
      }
      render();
    };
    const parts: (HTMLElement | null)[] = [
      h('p', {}, tr('Пара слов об игре очень поможет: она ещё в разработке.')),
      h(
        'div',
        { class: 'feedback-moods' },
        ...moods.map(([id, label]) =>
          h('button', {
            class: `chip${feedback.mood === id ? ' on' : ''}`,
            onclick: () => {
              feedback.mood = feedback.mood === id ? null : id;
              render();
            },
          }, label),
        ),
      ),
      text,
      feedback.status === 'failed' ? h('p', { class: 'bad' }, tr('Не удалось отправить. Проверьте интернет или напишите в комментариях на itch.io.')) : null,
      h(
        'button',
        { class: 'primary big', disabled: feedback.status === 'sending' || (!feedback.mood && !feedback.text.trim()), onclick: () => void send() },
        feedback.status === 'sending' ? tr('Отправляем…') : tr('Отправить'),
      ),
      h('p', { class: 'hint-line feedback-hint' }, tr('Отзыв анонимный. Можно и в комментариях: '), h('a', { href: `${ITCH_PAGE}#comments`, target: '_blank', rel: 'noopener' }, 'itch.io')),
      h('button', { class: 'ghost', onclick: back }, tr('← Назад')),
    ];
    return parts.filter((x): x is HTMLElement => x !== null);
  }

  /** The tutorial over a game in progress: it has its own settings, so only the warning and «Начать». */
  function tutorialStartContent(): HTMLElement[] {
    return [
      h('p', {}, tr('Лёгкая короткая партия: игра шаг за шагом показывает, как нанимать репортёров, приукрашивать новости, копать компромат, стравливать горожан и травить завод. Нужная кнопка подсвечивается.')),
      h('p', { class: 'bad' }, tr('Текущая партия будет потеряна.')),
      h('button', { class: 'primary big', onclick: () => void startGame('destroy', undefined, true) }, tr('Начать обучение')),
      h('button', { class: 'ghost', onclick: () => openModal(null) }, tr('← Назад')),
    ];
  }

  /** New game: the mode is chosen with a picture card (CONCEPT.md §8); a running game is lost. */
  function newGameContent(): HTMLElement[] {
    const choice = townChoice();
    const townId = choiceId(choice);
    // The record of this very town at the chosen difficulty (CONCEPT.md §4.8), once there is one.
    const record = recordOf('destroy', settings.difficulty, 'full', townId);
    // Difficulty (CONCEPT.md §4.6): remembered in the settings for the next games.
    const levels = h(
      'div',
      { class: 'difficulty' },
      h('span', { class: 'difficulty-label' }, tr('Сложность')),
      h(
        'div',
        { class: 'chips' },
        ...base.difficulties.map((d) =>
          h(
            'button',
            {
              class: `chip${settings.difficulty === d.id ? ' on' : ''}`,
              'aria-pressed': String(settings.difficulty === d.id),
              title: d.text,
              onclick: () => {
                settings.difficulty = d.id;
                saveSettings(settings);
                render();
              },
            },
            d.name,
          ),
        ),
      ),
    );
    // The town (CONCEPT.md §9.5): the player composes it; the calibration keeps the chosen difficulty.
    const g = base.townGen;
    const setChoice = (next: TownChoice) => {
      settings.town = next;
      saveSettings(settings);
      render();
    };
    const row = (label: string, part: keyof TownChoice, options: { id: string; name: string }[]) =>
      h(
        'label',
        { class: 'town-row' },
        h('span', { class: 'difficulty-label' }, label),
        h(
          'select',
          { onchange: (e: Event) => setChoice({ ...choice, [part]: (e.target as HTMLSelectElement).value }) },
          ...options.map((o) => h('option', { value: o.id, selected: o.id === choice[part] }, o.name)),
        ),
      );
    const town = townOf(base, townId);
    const tc = withTown(withDifficulty(base, settings.difficulty, 'destroy'), townId, 'destroy', settings.difficulty);
    const power = townPower(base, choice);
    const townCard = h(
      'div',
      { class: 'gen-town' },
      h('div', { class: 'gen-head' }, h('b', {}, town.name), h('button', { class: 'ghost', onclick: () => setChoice(randomChoice(base, randomSeed())) }, tr('Случайно'))),
      row(tr('Размер'), 'size', g.sizes.map((x) => ({ id: x.id, name: tr('{0} · ~{1} жителей', upperFirst(x.name), x.population) }))),
      row(tr('Уклад'), 'way', g.archetypes.map((x) => ({ id: x.id, name: upperFirst(x.type) }))),
      row(tr('Правило'), 'rule', g.rules.map((x) => ({ id: x.id, name: x.title }))),
      row(tr('Цель'), 'goal', g.goals.map((x) => ({ id: x.id, name: x.name }))),
      h('small', { class: 'hint' }, town.rule.text),
      h('div', { class: 'pass-goal' }, `🎯 ${goalTitle(tc, goalOf(tc))} · ${tc.balance.turnLimit} ${daysWord(tc.balance.turnLimit)}`),
      power.clamped ? h('p', { class: 'bad' }, power.days > 1 ? tr('Такой город сложнее выбранной сложности.') : tr('Такой город легче выбранной сложности.')) : null,
    );
    return [
      ...(hasGame && !state.outcome ? [h('p', { class: 'bad' }, tr('Текущая партия будет потеряна.'))] : []),
      townCard,
      levels,
      ...(record ? [h('small', { class: 'mode-record' }, tr('Рекорд: {0} · {1} {2}', starLine(record.stars), record.days, daysWord(record.days)))] : []),
      h('button', { class: 'primary big', onclick: () => void startGame('destroy') }, tr('Играть')),
    ];
  }

  function settingsContent(): HTMLElement[] {
    const toggle = (label: string, hint: string, key: 'fastSearch' | 'skipCutscenes') =>
      h(
        'label',
        { class: 'setting' },
        h('input', {
          type: 'checkbox',
          checked: settings[key],
          onchange: (e: Event) => {
            settings[key] = (e.target as HTMLInputElement).checked;
            saveSettings(settings);
          },
        }),
        h('span', {}, h('b', {}, label), h('small', {}, hint)),
      );
    // Loudness of the music and of the effects; at zero that part is off (CONCEPT.md §7.2а).
    const volume = (label: string, key: 'musicVolume' | 'sfxVolume') => {
      const value = h('small', { class: 'volume-value' }, settings[key] > 0 ? `${Math.round(settings[key] * 100)}%` : tr('выкл.'));
      return h(
        'label',
        { class: 'setting volume' },
        h('b', {}, label),
        h('input', {
          type: 'range',
          min: '0',
          max: '100',
          step: '5',
          value: String(Math.round(settings[key] * 100)),
          oninput: (e: Event) => {
            settings[key] = Number((e.target as HTMLInputElement).value) / 100;
            value.textContent = settings[key] > 0 ? `${Math.round(settings[key] * 100)}%` : tr('выкл.');
            sound.setVolumes(settings.musicVolume, settings.sfxVolume);
          },
          onchange: () => {
            saveSettings(settings);
            if (key === 'sfxVolume') sound.play('type');
          },
        }),
        value,
      );
    };
    return [
      // Both names in their own language, so a player who opened the wrong one finds theirs (CONCEPT.md §7.5).
      h('h3', { class: 'section' }, 'Язык · Language'),
      h(
        'div',
        { class: 'lang-row' },
        ...LANGS.map((l) => h('button', { class: l.id === lang() ? 'on' : 'ghost', 'aria-pressed': l.id === lang() ? 'true' : 'false', onclick: () => l.id !== lang() && chooseLang(l.id) }, l.name)),
      ),
      h('h3', { class: 'section' }, tr('Звук')),
      volume(tr('Музыка'), 'musicVolume'),
      volume(tr('Звуки'), 'sfxVolume'),
      h('h3', { class: 'section' }, tr('Анимации')),
      toggle(tr('Быстрый поиск'), tr('находки репортёров появляются сразу, без анимации'), 'fastSearch'),
      toggle(tr('Без роликов дня'), tr('не показывать драки, протесты и другие яркие события перед выпуском'), 'skipCutscenes'),
      h('h3', { class: 'section' }, tr('Статистика')),
      h(
        'label',
        { class: 'setting' },
        h('input', {
          type: 'checkbox',
          checked: settings.analytics,
          onchange: (e: Event) => {
            settings.analytics = (e.target as HTMLInputElement).checked;
            saveSettings(settings);
            setAnalytics(settings.analytics);
          },
        }),
        h('span', {}, h('b', {}, tr('Отправлять анонимную статистику')), h('small', {}, tr('как проходят партии и где их бросают — без имён и личных данных; помогает делать игру лучше'))),
      ),
      h('h3', { class: 'section' }, tr('Вступление')),
      h('button', { onclick: () => void watchIntro() }, tr('Посмотреть вступление ещё раз')),
    ];
  }

  /**
   * The rulebook (CONCEPT.md §7.3): the goal first — how to win and how to lose —, then one day step
   * by step, what to watch, the ways to hit the town beyond the issue, and first tips.
   * Keep it true: every change to a mechanic or a control checks this text too.
   */
  function howtoContent(): HTMLElement[] {
    const icon = (src: string) => h('img', { src: `${assetBase}sprites/${src}.png`, alt: '', width: 32, height: 32 });
    const block = (src: string, title: string, ...text: (string | HTMLElement)[]) =>
      h('div', { class: 'howto-block' }, icon(src), h('div', {}, h('b', {}, title), ...text.map((t) => (typeof t === 'string' ? h('p', {}, t) : t))));
    const list = (...items: string[]) => h('ul', { class: 'howto-list' }, ...items.map((x) => h('li', {}, x)));
    const step = (n: number, title: string, text: string) =>
      h('div', { class: 'howto-step' }, h('span', { class: 'howto-num' }, String(n)), h('div', {}, h('b', {}, title), h('p', {}, text)));
    // In a game its own numbers and goal; on the title screen those of a new game at the chosen difficulty.
    const cc = titleOpen ? withTown(withDifficulty(base, settings.difficulty, 'destroy'), choiceId(townChoice()), 'destroy', settings.difficulty) : c;
    const b = cc.balance;
    const townGoal = goalOf(cc);
    const stage = townGoal.type === 'stage';
    const goalText = stage ? tr('довести город до стадии «{0}»', stageBelow(b.winCityIndex)) : goalTitle(cc, townGoal).replace(/^./, (x) => x.toLowerCase());
    return [
      h('p', { class: 'howto-lead' }, tr('Вы — редактор газеты. Один ход — один день и один выпуск. Город читает вас, верит или не верит — и меняется.')),
      block(
        'ui/city',
        tr('Цель: разрушить город'),
        tr('Вы — газета холдинга «Медиа-Плюс». За {0} {1} нужно {2}: пугайте жителей, ссорьте их между собой, оставляйте без работы.', b.turnLimit, daysWord(b.turnLimit), goalText),
        list(
          stage ? tr('Победа: город дошёл до стадии «{0}».', stageBelow(b.winCityIndex)) : tr('Победа: главная цель города выполнена. Только она и побеждает.'),
          tr('Поражение: потеря репутации — вам перестали верить — или прошли {0} {1}, а цель не выполнена.', b.turnLimit, daysWord(b.turnLimit)),
          tr('В кампании и в свободной игре у города своя главная цель: закрыть завод, выжить молодёжь, довести до драк, отдать улицы банде или стереть город до «Руин». Она написана на месте полоски цели.'),
          tr('В свободной игре город вы собираете сами: размер, уклад, правило и цель. Какой бы он ни вышел, сложность остаётся той, что выбрана: игра подстраивает силу новостей, а если её не хватает — число дней.'),
        ),
      ),
      h('p', { class: 'hint-line' }, tr('Где сейчас город, видно на шкале «Цель» вверху: пять стадий от «Процветает» до «Руин», 🏁 — куда нужно дойти. Метка стоит точно там, где город, и внутри стадии: цветом закрашено, сколько её город уже прошёл. Бледная метка показывает, куда сдвинет город разложенный выпуск.')),
      h('h3', { class: 'section' }, tr('Один день')),
      step(1, tr('Репортёры приносят новости'), tr('Один репортёр — одна новость в день. Сначала они пишут о событиях дня; на что не хватило людей, то выйдет с пометкой «никто не написал». Остальные ищут сами: как повезёт. Нанимайте кнопкой «+» у портретов: агентство бесплатно присылает кандидатов раз в день, но нанять можно только на свободное место, а места открывает тираж. Нажав на портрет, в «Редакции» выбирайте прямо в его карточке, что он ищет. На телефоне портретов наверху нет: «Редакция» — вкладка внизу экрана.')),
      step(2, tr('Разложите выпуск'), tr('Первая полоса — главная новость: её прочитают все и сильнее всего ей поверят. Статья — вторая по силе. Остальное выходит заметками. Что не нужно — «Не печатать». Нажмите на новость, чтобы переложить её.')),
      step(3, tr('Выберите подачу'), tr('Кнопка «Подача» над заголовком: «Это неспроста» и «Всё пропало!» делают новость громче, «Без паники» и «Всё хорошо!» — тише, «Как есть» — правда. Чем дальше от правды, тем вероятнее, что вас поймают на лжи. В меню виден риск и что сделают поверившие.')),
      step(4, tr('В печать'), tr('Кнопка «В печать» показывает, каким выйдет номер: скучным, обычным, интересным или сенсационным. Пока выпуск открыт, «≈» у показателей наверху — прогноз. После печати город отреагирует: над жителями появятся значки, а в итогах дня будет видно, как приняли каждую новость.')),
      // What the icons over residents mean: the city has no legend of its own (CONCEPT.md §7.3).
      h(
        'div',
        { class: 'howto-reactions' },
        ...(Object.keys(REACTION_ICON) as Reaction[]).map((r) =>
          h('span', {}, h('img', { src: `${assetBase}sprites/fx/${REACTION_ICON[r]}.png`, alt: '', width: 16, height: 16 }), reactionLabels[r]),
        ),
      ),
      h('h3', { class: 'section' }, tr('Что беречь')),
      block('ui/reputation', tr('Репутация'), tr('Правда её поднимает, пойманная ложь обрушивает. Чем выше репутация, тем охотнее вам верят и тем реже проверяют.')),
      block('ui/readers', tr('Читатели'), tr('Постоянные читатели читают каждый выпуск: чем их больше, тем сильнее бьёт газета. Скучный выпуск их распугивает, интересный приводит новых. Тираж открывает места в редакции: второе место есть сразу, следующие — когда газету читают {0} жителей.', b.seatThresholds.map((x) => `${Math.round(x * 100)}%`).join(' / '))),
      block('ui/offer', tr('Грязные приёмы'), tr('🎭 вверху (на телефоне — вкладка «Приёмы»): разовые ходы от карт — слить слух, подкупить фактчекеров, подослать провокаторов. После хода приём ждёт несколько дней, а сильные стоят ещё и репутации. Рядом — значки приёмов редакции от карт.')),
      block('ui/folder', tr('Сводка и карты'), tr('«Сводка» (папка вверху; на телефоне — вкладки «Карты», «Редакция», «Сводка» и «Приёмы» внизу экрана, а «В печать» — большая кнопка посередине между ними) — карты газеты, читатели, репутация, город и жители; плитки показателей открывают её на своей вкладке. Каждые {0} дня совет директоров присылает на выбор три карты — одну можно взять, и окно в этот день открывается само (кроме обучения). Не хотите ждать — запросите ещё три: первый раз бесплатно, дальше за репутацию ({1}, каждый следующий запрос до очередного предложения дороже на {2}). Новые карты в коллекцию покупают между партиями: кнопка «Карты — купить и улучшить» на главном экране и «Карты» на карте кампании, за связи (✦), которые даёт каждая партия.', b.shopRefreshDays, b.shopRequestTrust, b.shopRequestTrustStep)),
      h('h3', { class: 'section' }, tr('Чем ещё бить по городу')),
      block('groups/workers', tr('Ссорьте группы'), tr('Конфликтные новости можно подогреть или успокоить. Вражда групп бьёт по городу сильнее всего; когда станет совсем жарко, вмешается мэрия.')),
      list(
        tr('🎯 Травля: кнопка «Травить» у новости о заводе, магазине или другом месте работы — или в «Сводке», вкладка «Город», где видны все такие места. Репортёры приносят о нём разные истории, по очереди; новости об этом месте бьют всё сильнее, если бить каждый день, люди уходят, и оно закрывается. Цель одна: пока идёт травля, другое место не выбрать — сначала «Прекратить» на её плашке над газетой.'),
        tr('Компромат: нажмите на портрет (на телефоне — вкладка «Редакция»), в карточке репортёра — «Компромат» и выберите, на кого копать. Репортёр несколько дней не пишет новостей, зато приносит эксклюзив, который настраивает город против группы.'),
        tr('Криминал: новости о преступности пугают людей и разжигают настоящую преступность. Преступность на улицах сама снижает «Порядок и безопасность», а банда, если она взяла улицы, держит его ниже до конца партии; полиция всё это сдерживает. Пока город раскалён, полиция и мэр отвечают рейдами и патрулями: они остужают улицы и успокаивают напуганных — закрытая полиция рейдов уже не устроит.'),
        tr('👁 Надзор за темой: если печатать одну тему день за днём, фактчекеры начинают за ней следить — неправду этой темы ловят на 25% чаще за каждый день подряд. Метка «Под надзором» у новости; день без этой темы снимает надзор. Правду надзор не трогает.'),
      ),
      h('h3', { class: 'section' }, tr('Первые советы')),
      list(
        tr('Фактчекеры начинают работу с {0}-го дня, и ложь первых выпусков не разоблачат. Потом правда копит репутацию — ваш запас на будущую ложь.', b.factCheckStartTurn),
        tr('Самую громкую новость — на первую полосу. Рискованную ложь дешевле спрятать в заметку.'),
        tr('Не печатайте неправду одной темы день за днём: фактчекеры возьмут её под надзор.'),
        tr('Нажмите на любой показатель наверху — откроется окно с подробностями.'),
      ),
      h('button', { onclick: () => void watchIntro() }, tr('Посмотреть вступление')),
    ];
  }

  function aboutContent(): HTMLElement[] {
    return [
      h('p', {}, h('b', {}, tr('Утка в номер')), tr(' — пошаговая сатирическая стратегия о газете, которая разрушает город новостями.')),
      h('p', {}, tr('Все персонажи, город и медиахолдинг «Медиа-Плюс» вымышлены. Любые совпадения с реальными СМИ — повод задуматься.')),
      h('p', { class: 'hint-line' }, tr('Ранняя версия: графика временная, баланс меняется.')),
      h('p', { class: 'hint-line' }, tr('Версия {0}', versionLabel)),
    ];
  }


  // ---------- Autosave ----------

  let saveTimer = 0;
  const saveNow = () => {
    window.clearTimeout(saveTimer);
    // Nothing is written until the player has actually played a turn: the title screen's fresh city
    // must not turn into a «Продолжить» on the next visit.
    if (!hasGame || state.turn <= 1) return;
    writeSave<Draft>({ state, report, drafts: [...drafts], tutorial });
  };
  /** Every change is saved shortly after it (renders come in bursts during animations). */
  function saveSoon(): void {
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, 400);
  }
  // A tablet may put the tab to sleep at any moment: save when it is hidden.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow();
  });
  window.addEventListener('pagehide', saveNow);

  if (titleOpen) {
    issueOpen = false;
    render();
  } else {
    hasGame = true;
    busy = true;
    void runSearch();
  }
}
