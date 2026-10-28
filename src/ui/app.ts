import { ASSET_BASE } from '../assets';
import { CityScene, REACTION_ICON, type HoverTarget } from '../render/scene';
import {
  averageTrust,
  isHarmful,
  closedLine,
  huntBonus,
  endHunt,
  isHuntStory,
  startHunt,
  crimePressure,
  policeLost,
  buildingDefOf,
  buildingName,
  cancelInvestigation,
  channelOf,
  adRateOf,
  incomePerReader,
  setPrice,
  createGame,
  fireReporter,
  callAgency,
  agencyCost,
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
  townDays,
  withTown,
  levelOf,
  staffOf,
  taskOf,
  taskProgress,
  taskReward,
  electionLeader,
  runningTwist,
  twistOf,
  type CardEffect,
  type TaskDef,
  type TaskState,
  forecastTurn,
  forkChoice,
  openForks,
  refreshShop,
  abilitiesOf,
  abilityBlock,
  useAbility,
  expectedJoins,
  searchLuck,
  skilledReporter,
  type Forecast,
  answerOffer,
  dealBrokenBy,
  retainCost,
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
  salesOf,
  upkeepItems,
  followersOf,
  reporterOf,
  startInvestigation,
  rivalStarted,
  RIVAL_DIG,
  lureBlock,
  lureCost,
  lureRivalAuthor,
  templateOf,
  totalUpkeep,
  rivalReaders,
  rivalTrust,
  cityStateOf,
  setRivalWatch,
  type GameMode,
  type Difficulty,
  type GameLength,
  type CardInstance,
  type Content,
  type ChurnReason,
  type Topic,
  type Decision,
  type UpkeepItem,
  type Modifiers,
  type ExposedStory,
  type Placement,
  type GameState,
  type Highlight,
  type NewsTier,
  type IssueLevel,
  type Reaction,
  type PublicationPreview,
  type Requirement,
  type UpgradeDef,
  type WealthClass,
  type TurnReport,
} from '../sim';
import { h, pct, svg } from './dom';
import { loadSave, writeSave } from './save';
import { loadSettings, saveSettings } from './settings';
import { playIntro } from './intro';
import { pendingNotes } from './guide';
import { currentStep, issueFlags, skipStep, stepTargets, tutorialDifficulty, tutorialLength, tutorialSteps, withTutorial, type TutorialProgress, type TutorialView } from './tutorial';
import { recordOf, starLine, submitRecord } from './records';
import { campaignStars, loadCampaign, newCampaign, saveCampaign, townState, winTown, type Campaign } from './campaign';
import { drawRegion, drawTownArt, MAP_H, MAP_W, townIcon } from './campaignMap';
import { aboutLine, levelNames, levelNamesGen, loyaltyOf, luckNames, noseNames, portrait, ReporterBar, skillTiers, topicLine, type RepStatus } from './reporterBar';
import {
  priceLabels,
  modeLabels,
  rivalNames,
  toneOf,
  tensionLabels,
  effectLabels,
  effectText,
  effectShort,
  placementLabels,
  issueLevelLabels,
  outcomeText,
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

type Modal =
  | 'report'
  | 'debug'
  | 'city'
  | 'population'
  | 'money'
  | 'readers'
  | 'reputation'
  | 'shop'
  | 'team'
  | 'investigate'
  | 'dig'
  | 'pause'
  | 'howto'
  | 'settings'
  | 'about'
  | 'newgame'
  | 'campaignNew'
  | 'carry'
  | null;

/** How an upgrade series is called in the upgrades window. */
const seriesNames: Record<string, string> = { kiosks: 'Киоски' };
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
  const saved = params.has('new') ? null : loadSave<Draft>(base);
  // The debug window is a pause menu item only with ?debug in the address.
  const debugMode = params.has('debug');
  /** The title screen is up (CONCEPT.md §7.3 «Меню»); &new in the address starts a game at once. */
  let titleOpen = !params.has('new');
  /** A game was started or continued in this tab, so «Продолжить» makes sense. */
  // Only a game with at least one turn played counts: a city nobody touched is not offered to continue.
  let hasGame = saved !== null && saved.state.turn > 1;
  const urlMode: GameMode = params.get('mode') === 'save' ? 'save' : 'destroy';
  // The save mode is hidden for now: the game is tuned on the attack on the town (CONCEPT.md §8);
  // `&mode=save` in the address still starts one.
  const saveModeShown = false;
  // The game runs on the content of its difficulty (CONCEPT.md §4.6); `c` follows the current game.
  /** The content a game runs on: its difficulty's, and in the campaign its town's too (CONCEPT.md §4.6, §9). */
  // A short game and the tutorial mission patch it further (CONCEPT.md §4.6а, §7.3 «Обучение»).
  const contentFor = (difficulty: Difficulty, mode: GameMode, town: string | null, length: GameLength = 'full', tutorialGame = false) => {
    const x = withLength(withDifficulty(base, difficulty, mode), length, difficulty);
    const y = town ? withTown(x, town, mode) : x;
    return tutorialGame ? withTutorial(y) : y;
  };
  let c = saved
    ? contentFor(saved.state.difficulty, saved.state.mode, saved.state.town, saved.state.length, !!saved.tutorial)
    : contentFor(settings.difficulty, urlMode, null, settings.length);
  /** The campaign (CONCEPT.md §9): its own storage; the map screen is open over the drifting city. */
  let campaign: Campaign | null = loadCampaign(base);
  let campaignOpen = false;
  let campaignSel = 0;
  let state: GameState = saved?.state ?? createGame(c, seedFromUrl(), urlMode, settings.difficulty, { length: settings.length });
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
  let issueOpen = true;
  let modal: Modal = null;
  /** Reporter whose investigation window is open. */
  let investigator: string | null = null;
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
  /** The cover price menu in the masthead is open. */
  let priceMenuOpen = false;
  /** Story picked by a tap; the next tap on a place in the paper moves it there (CONCEPT.md §7.3). */
  let selected: number | null = null;
  /** The tray of stories left out is unfolded. */
  let trayOpen = false;
  /** Issue level on the publish button at the last render, and its bump animation for this render. */
  let shownLevel: IssueLevel | null = null;
  let levelBump = '';

  // ---------- Persistent shell ----------
  // One top row (CONCEPT.md §7.3): resources, reporter portraits, the issue level and the buttons.
  const hudRes = h('div', { class: 'resources' });
  const hudActions = h('div', { class: 'hud-buttons' });
  const hudMenu = h('button', { class: 'icon-btn hud-menu', title: 'Меню', onclick: () => openModal('pause') }, '☰');
  const reporterBar = new ReporterBar(
    c,
    () => openModal('team', 'agency'),
    () => skip(),
    (id) => {
      investigator = id;
      error = '';
      openModal('investigate');
    },
  );
  // The control row: our reporters' square portraits, then «Улучшения» (a cart) and ☰ on the right.
  const hudShop = h(
    'button',
    { class: 'icon-btn hud-shop', title: 'Улучшения газеты', 'aria-label': 'Улучшения', onclick: () => openModal('shop') },
    h('img', { class: 'shop-icon', src: `${assetBase}sprites/ui/cart.png`, alt: '', width: 16, height: 16 }),
    // Wide screens only: the cart says what it is.
    h('span', { class: 'shop-label' }, 'Улучшения'),
  );
  // Wide screens: the reporters are one block «Редакция», as wide as a full newsroom, so nothing
  // after it moves when someone is hired; on phones the wrapper melts away.
  const hudTeam = h('div', { class: 'hud-team' }, h('span', { class: 'hud-team-label' }, 'Редакция'), reporterBar.el);
  const hudControls = h('div', { class: 'hud-controls' }, hudTeam, hudShop, hudMenu);
  const hudGoal = h('div', { class: 'hud-goal' });
  // A narrow track keeps only the names of the city's stage and the goal (CSS `.tight`).
  new ResizeObserver(() => hudGoal.classList.toggle('tight', hudGoal.offsetWidth < 400)).observe(hudGoal);
  const hud = h('header', { class: 'hud' }, hudControls, hudRes, hudGoal, hudActions);
  const cityHost = h('div', { class: 'city-host' });
  const cityEvents = h('div', { class: 'city-events' });
  const loading = h('div', { class: 'city-loading' }, 'Строим город…');
  const tools = h(
    'div',
    { class: 'city-tools' },
    h('button', { class: 'icon-btn', title: 'Приблизить', onclick: () => scene?.zoomBy(1) }, '+'),
    h('button', { class: 'icon-btn', title: 'Отдалить', onclick: () => scene?.zoomBy(-1) }, '−'),
    h('button', { class: 'icon-btn', title: 'Весь город', onclick: () => scene?.resetView() }, '⌂'),
  );
  const issueHead = h('div', { class: 'issue-head' });
  // The issue is a newspaper mock-up: front page, the article, columns of briefs, and a tray for
  // stories left out; stories are dragged between them (CONCEPT.md §7.3).
  type ZoneKey = Placement | 'out';
  const zoneTexts: Record<string, [string, string]> = {
    2: ['Первая полоса', 'главную новость'],
    1: ['Статья', 'статью'],
    0: ['Заметки', 'заметку'],
    out: ['Не печатать', 'новость, чтобы не печатать её'],
  };
  /** The empty place whose «choose a story» list is open. */
  let chooserFor: ZoneKey | null = null;
  const targetTexts: Record<string, string> = { 2: 'На первую полосу', 1: 'Статьёй', 0: 'Заметкой', out: 'Не печатать' };
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
    const target = h('button', { class: 'zone-target', 'data-tut': key === 2 ? 'to-front' : undefined, onclick: () => moveSelected(key) }, h('span', {}, `Сюда: ${targetTexts[key]}`));
    const root = h('section', { class: `zone zone-${key}`, 'data-zone': String(key) }, label, items, empty, chooser, target);
    return { root, items, empty, chooser, label, target };
  };
  const zones: Record<string, ReturnType<typeof makeZone>> = { 2: makeZone(2), 1: makeZone(1), 0: makeZone(0), out: makeZone('out') };
  const issueNo = h('span', { class: 'issue-no' });
  const priceSelect = h('div', { class: 'price-select' });
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
  // Two rows (CONCEPT.md §7.3): the name of the paper, then the cover price on the left, «Сегодня в номере» and the issue number on the right.
  const masthead = h(
    'header',
    { class: 'masthead' },
    h('div', { class: 'stamp-box' }, issueStamp, streakBadge),
    h('h2', {}, 'Городской Вестник'),
    h('button', { class: 'paper-close', title: 'Свернуть — посмотреть на город', onclick: () => closeIssue() }, '—'),
    h('div', { class: 'masthead-row' }, priceSelect, todayLine, issueNo),
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
  // The abilities bought in the upgrades window, as buttons right above the paper (CONCEPT.md §3.5).
  const abilityBar = h('div', { class: 'ability-bar', hidden: true });
  // Save mode: what the rival paper prints today, and which of its stories we answer (CONCEPT.md §8).
  const rivalNotice = h('section', { class: 'notice notice-rival', hidden: true, role: 'status' });
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
    { class: 'issue-fab', title: 'Вернуться к выпуску', 'aria-label': 'Вернуться к выпуску', hidden: true, onclick: () => openIssue() },
    h('img', { src: `${assetBase}sprites/ui/readers.png`, alt: '', width: 16, height: 16 }),
    h('span', {}, 'К выпуску'),
  );
  const issue = h('div', { class: 'issue' }, h('div', { class: 'issue-panel' }, issueHead, guideNote, exposureNotice, digNotice, reconcileNotice, staffNotice, offerNotice, twistNotice, tasksNotice, huntNotice, rivalNotice, abilityBar, paper));
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
    if ((truthMenuFor === null && moveMenuFor === null && chooserFor === null && !priceMenuOpen) || (e.target as Element).closest('.place-menu, .truth-chip, .price-chip, .zone-empty')) return;
    // A tap on the story itself only closes its menu: the click that follows must not open it again.
    if (moveMenuFor !== null && (e.target as Element).closest(`[data-uid="${moveMenuFor}"]`)) menuClosedFor = moveMenuFor;
    truthMenuFor = null;
    moveMenuFor = null;
    chooserFor = null;
    priceMenuOpen = false;
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
  const daySummary = h('section', { class: 'day-summary', hidden: true, role: 'dialog', 'aria-label': 'Итоги дня' });
  // City cutscene before the issue: letterbox bars and a caption of the bright moment (CONCEPT.md §7.3).
  const cutsceneCaption = h('div', { class: 'cutscene-caption' });
  const cutscene = h(
    'div',
    { class: 'cutscene', hidden: true },
    h('div', { class: 'letterbox top' }),
    h('div', { class: 'letterbox bottom' }),
    cutsceneCaption,
    h('button', { class: 'cutscene-skip', onclick: () => scene?.skipCutscene() }, 'Пропустить ▸'),
  );
  const tooltip = h('div', { class: 'tooltip', hidden: true });
  const modalLayer = h('div', { class: 'modal-layer' });
  const outcomeLayer = h('div', { class: 'modal-layer' });
  const titleLayer = h('div', { class: 'title-screen', hidden: true });
  const campaignLayer = h('div', { class: 'campaign-screen', hidden: true });
  root.replaceChildren(
    hud,
    h('main', { class: 'stage' }, cityHost, cityEvents, tools, loading, cutscene, daySummary, issue, issueFab),
    tooltip,
    titleLayer,
    campaignLayer,
    modalLayer,
    outcomeLayer,
  );
  const cardEls = new Map<number, HTMLElement>();

  CityScene.create(cityHost, c, state, showTooltip)
    .then((s) => {
      scene = s;
      loading.remove();
      if (titleOpen) s.startTour();
    })
    .catch((e) => {
      loading.textContent = `Не удалось загрузить графику: ${e instanceof Error ? e.message : e}`;
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

  /**
   * Cover price of the paper (CONCEPT.md §5.4): free reaches even the jobless, a cheap one pensioners
   * and workers, a dear one only those with a job, and even they buy it less willingly.
   */
  function renderPrice(): void {
    const b = c.balance;
    const icon = (i: number) => h('img', { src: `${assetBase}sprites/ui/price_${Math.min(i, 3)}.png`, alt: '', width: 16, height: 16 });
    const label = (i: number) => priceLabels[i] ?? priceLabels[priceLabels.length - 1];
    // Who buys at this price, in words: no numbers in the paper (CONCEPT.md §3.4).
    const who = (i: number) => {
      const classes: Record<WealthClass, string> = { working: 'работающие', pensioner: 'пенсионеры', jobless: 'безработные' };
      const buyers = (Object.keys(classes) as WealthClass[]).filter((k) => (b.priceBuy[k][i] ?? 0) > 0);
      const text =
        buyers.length === 3
          ? 'Берут все, даже безработные.'
          : `Берут ${buyers.map((k) => classes[k] + ((b.priceBuy[k][i] ?? 0) < 0.6 ? ' (неохотно)' : '')).join(' и ')}.`;
      const extra = b.prices[i] === 0 ? ' Доход только с рекламы.' : i === b.prices.length - 1 ? ' Больше денег с каждого.' : '';
      return text + extra;
    };
    const chip = h(
      'button',
      {
        class: `price-chip${priceMenuOpen ? ' on' : ''}`,
        title: `Цена выпуска: ${label(state.price).toLowerCase()}. ${who(state.price)}`,
        'aria-haspopup': 'menu',
        'aria-expanded': String(priceMenuOpen),
        disabled: busy || !!state.outcome,
        onclick: () => {
          priceMenuOpen = !priceMenuOpen;
          render();
        },
      },
      icon(state.price),
      h('span', { class: 'chip-label' }, label(state.price)),
      h('span', { class: 'chip-arrow' }, '▾'),
    );
    const menu = priceMenuOpen
      ? h(
          'div',
          { class: 'place-menu truth-menu price-menu', role: 'menu' },
          ...b.prices.map((_, i) =>
            h(
              'button',
              {
                role: 'menuitem',
                class: state.price === i ? 'current' : '',
                disabled: state.price === i,
                onclick: () => {
                  priceMenuOpen = false;
                  setPrice(state, c, i);
                  render();
                },
              },
              h('span', { class: 'check' }, state.price === i ? '✓' : ''),
              icon(i),
              h('span', { class: 'opt' }, h('span', { class: 'opt-head' }, h('b', {}, label(i))), h('span', { class: 'opt-title' }, who(i))),
            ),
          ),
        )
      : null;
    priceSelect.replaceChildren(h('span', { class: 'price-label' }, 'Цена газеты:'), chip, ...(menu ? [menu] : []));
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
    issueOpen = true;
    render();
    issue.animate(frames, { duration: 320, easing: 'cubic-bezier(0.25, 1, 0.5, 1)' });
  }

  const newGame = (seed = randomSeed(), mode: GameMode = 'destroy', town: string | null = null, tutorialGame = false) => {
    hasGame = true;
    // A campaign town keeps the campaign's difficulty and starts with the reporter brought along;
    // the tutorial is an easy short game of its own (CONCEPT.md §7.3 «Обучение»).
    const difficulty = tutorialGame ? tutorialDifficulty : town && campaign ? campaign.difficulty : settings.difficulty;
    const length: GameLength = tutorialGame ? tutorialLength : town ? 'full' : settings.length;
    c = contentFor(difficulty, mode, town, length, tutorialGame);
    reporterBar.c = c;
    state = createGame(c, seed, mode, difficulty, { ...(town ? { town, ...(campaign?.carry ? { reporters: [campaign.carry] } : {}) } : {}), length });
    tutorial = tutorialGame ? { step: 0, flags: [] } : null;
    newRecord = false;
    drafts = new Map();
    report = null;
    error = '';
    busy = true;
    modal = null;
    scene?.setState(state, false);
    scene?.resetView();
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
    const key = `${state.turn}|${state.price}|${state.money}|${state.upgrades.length}|${state.reporters.join()}|${JSON.stringify(decision)}`;
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
      error = '';
      // The tutorial's steps that are done by printing (CONCEPT.md §7.3 «Обучение»).
      if (tutorial) tutorial.flags = [...new Set([...tutorial.flags, ...issueFlags(hand, c, decision, report)])];
      if (tutorial && state.outcome && !settings.tutorialDone) {
        settings.tutorialDone = true;
        saveSettings(settings);
      }
      // A won game may beat the record of its mode and difficulty.
      // A won single game may beat the record; a won campaign town opens the next one (CONCEPT.md §4.8, §9).
      if (state.outcome?.result === 'win' && !state.town && !tutorial) newRecord = submitRecord(state.mode, state.difficulty, state.length, { stars: scoreOf(state, c).stars, days: report.turn });
      if (state.outcome?.result === 'win' && state.town && campaign) {
        winTown(base, campaign, state.town, { stars: scoreOf(state, c).stars, days: report.turn });
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
    fight: 'Драка',
    clash: 'Столкновения',
    protest: 'Протест',
    exodus: 'Отъезд',
    closed: 'Закрытие',
    reconcile: 'Примирение',
  };

  /** A story's illustration; a conflict story about any pair shows exactly its two groups. */
  const newsArt = (templateId: string, pair?: [string, string]) =>
    `${assetBase}sprites/news/${templateId}${pair && templateOf(c, templateId).conflict === 'any' ? `__${pair[0]}__${pair[1]}` : ''}.png`;

  /** The day's result in a few chips: readers, money and how the town took the issue. */
  function morningChips(r: TurnReport): HTMLElement {
    const chip = (icon: string, text: string, cls = '') => h('span', { class: `morning-chip ${cls}` }, h('img', { src: icon, alt: '', width: 16, height: 16 }), text);
    const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}`;
    const readers = r.readers.after - r.readers.before;
    const chips = [
      chip(`${assetBase}sprites/ui/readers.png`, `${signed(readers)} ${plural(Math.abs(readers), 'читатель', 'читателя', 'читателей')}`, readers > 0 ? 'up' : readers < 0 ? 'down' : ''),
      chip(`${assetBase}sprites/ui/money.png`, `${signed(r.moneyDelta)} ₽`, r.moneyDelta > 0 ? 'up' : r.moneyDelta < 0 ? 'down' : ''),
    ];
    const trust = Math.round(r.trustAfter - r.trustBefore);
    if (trust !== 0) chips.push(chip(`${assetBase}sprites/ui/reputation.png`, `${signed(trust)}% репутации`, trust > 0 ? 'up' : trust < 0 ? 'down' : ''));
    const city = Math.round(r.metricsAfter.cityIndex - r.metricsBefore.cityIndex);
    chips.push(
      chip(
        `${assetBase}sprites/ui/city_state_${cityStateOf(c, r.metricsAfter.cityIndex)}.png`,
        `город: ${stageChange(r.metricsBefore.cityIndex, r.metricsAfter.cityIndex)}${city ? (city > 0 ? ' ▲' : ' ▼') : ''}`,
        // What is good for the town is good for us only when we defend it.
        city === 0 ? '' : (city > 0) === (state.mode === 'save') ? 'up' : 'down',
      ),
    );
    const counts = new Map<Reaction, number>();
    for (const x of Object.values(state.lastReactions)) counts.set(x, (counts.get(x) ?? 0) + 1);
    const ranked = [...counts.entries()].filter(([x]) => x !== 'talk').sort((a, b) => b[1] - a[1]).slice(0, 3);
    // Joy is the other side's win when we attack the town, fear when we defend it.
    const goalOf = (x: Reaction) => (x === 'happy' ? (state.mode === 'destroy' ? ' down' : ' up') : x === 'scared' ? (state.mode === 'destroy' ? ' up' : ' down') : '');
    for (const [x, n] of ranked) chips.push(chip(`${assetBase}sprites/fx/${REACTION_ICON[x]}.png`, `${n} ${morningLabels[x]}`, `react-${x}${goalOf(x)}`));
    return h('span', { class: 'morning-chips' }, ...chips);
  }

  /** The issue's main story: the front page, else the most believed one. */
  const mainStory = (r: TurnReport) => [...r.publications].sort((a, b) => b.placement - a.placement || b.believed - a.believed)[0];

  /** The morning after the issue (CONCEPT.md §7.3): the camera flies to where the main story hit. */
  async function playMorning(r: TurnReport): Promise<void> {
    const main = mainStory(r);
    cutsceneCaption.className = 'cutscene-caption kind-morning';
    cutsceneCaption.replaceChildren(
      h('span', { class: 'cutscene-kicker' }, `Утро · выпуск № ${r.turn} · ${issueLevelLabels[r.issue.level].toLowerCase()}`),
      h('b', {}, main ? main.title : 'Газета не вышла'),
    );
    cutsceneCaption.hidden = false;
    cutscene.hidden = false;
    tooltip.hidden = true;
    cutscene.parentElement!.classList.add('in-cutscene');
    // The crowd acts out how the main story was taken: believed (scared or happy) or doubted.
    const reaction = !main || main.believed + main.doubted === 0 ? null : main.believed >= main.doubted ? (main.mood ?? 'scared') : 'doubted';
    await scene!.playMorning(main?.building ?? null, reaction);
    cutscene.hidden = true;
    cutscene.parentElement!.classList.remove('in-cutscene');
  }

  /** The twist's news for the day's summary: it began, the town elected a mayor, the audit ended. */
  function twistLines(r: TurnReport): string[] {
    const t = state.twist;
    if (!r.twist || !t) return [];
    const def = twistOf(c, t.id);
    if (r.twist.started) return [`Начинается: ${def.title.toLowerCase()}`];
    if (t.result === 'peacemaker' || t.result === 'hardliner') return [`Выборы: новый мэр — ${mayorName()}`];
    if (def.kind === 'governor') return ['Губернатор уехал'];
    return [t.result === 'passed' ? `${def.title} пройдена` : `${def.title} провалена: бюджет урезан`];
  }

  /**
   * The day's summary after the scenes (CONCEPT.md §7.3): the main story, what it brought and what
   * happened in town. It stays until the player presses «Следующий день» (or Enter).
   */
  function showSummary(r: TurnReport): Promise<void> {
    const main = mainStory(r);
    const events: HTMLElement[] = [
      ...r.highlights.map((x) => h('li', {}, x.title)),
      ...r.exposures.map((x) => h('li', { class: 'bad' }, `Разоблачили: «${x.title}»`)),
      ...r.deals.broken.map((x) => h('li', { class: 'bad' }, `Сделка «${x}» сорвана`)),
      ...r.staff.quit.map((id) => h('li', { class: 'bad' }, `${reporterOf(c, id).name} ${reporterOf(c, id).female ? 'уволилась' : 'уволился'}`)),
      ...(r.rival?.cured ? [h('li', {}, `Опровержения разубедили ${r.rival.cured} ${peopleWord(r.rival.cured)}`)] : []),
      ...(r.cleanStreak.bonus ? [h('li', { class: 'good' }, `✓ ${c.balance.cleanStreakDays} выпусков подряд без лжи: +${Math.round(r.cleanStreak.bonus)}% репутации`)] : []),
      ...(r.cleanStreak.broken ? [h('li', { class: 'bad' }, 'Серия выпусков без лжи прервалась')] : []),
      ...(r.moleCaught ? [h('li', { class: 'bad' }, `Крота раскрыли: −${c.balance.molePenalty}% репутации`)] : []),
      ...r.tasks.done.map((id) => h('li', { class: 'good' }, `✓ Задание выполнено: ${taskOf(c, id).title} (${prizeText(taskOf(c, id))})`)),
      ...r.tasks.failed.map((id) => h('li', { class: 'bad' }, `✗ Задание провалено: ${taskOf(c, id).title}`)),
      ...twistLines(r).map((x) => h('li', {}, x)),
      ...(r.hunt?.won ? [h('li', { class: 'good' }, `🎯 Травля удалась: ${lowerFirst(r.hunt.won)}. Город потрясён`)] : []),
    ];
    return new Promise((done) => {
      const finish = () => {
        document.removeEventListener('keydown', onKey);
        daySummary.hidden = true;
        done();
      };
      const onKey = (e: KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        finish();
      };
      const next = h('button', { class: 'primary big summary-next', onclick: finish }, state.outcome ? 'Чем всё кончилось ▸' : 'Следующий день ▸');
      daySummary.replaceChildren(
        h('span', { class: 'summary-kicker' }, `Итоги дня ${r.turn} · выпуск ${issueLevelLabels[r.issue.level].toLowerCase()}`),
        h('b', { class: 'summary-title' }, main ? main.title : 'Газета не вышла'),
        morningChips(r),
        ...(events.length ? [h('ul', { class: 'summary-events' }, ...events)] : []),
        next,
      );
      tooltip.hidden = true;
      daySummary.hidden = false;
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
      cutsceneCaption.className = `cutscene-caption kind-${hl.kind}`;
      cutsceneCaption.replaceChildren(h('span', { class: 'cutscene-kicker' }, `Срочно · ${highlightLabels[hl.kind]}`), h('b', {}, hl.title));
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
        h('span', {}, `Настроение: ${pct(r.mood)} · настрой: ${pct(r.outlook)}`),
        h('span', {}, `Работа: ${r.job === null ? 'нет' : buildingDefOf(c, state.buildings[r.job].type).name}`),
        h('span', {}, `Ваша репутация: ${Math.round(r.trust)}`),
      );
      if (r.status === 'left') lines.push(h('span', { class: 'bad' }, 'Уезжает из города'));
      if (r.protestTurns > 0) lines.push(h('span', { class: 'bad' }, 'Протестует'));
      if (r.beliefs.length) {
        lines.push(h('span', { class: 'muted' }, 'Верит:'), ...r.beliefs.slice(-3).map((b) => h('span', {}, `• ${b.title}`)));
      }
    } else {
      const b = state.buildings[t.id];
      const workers = state.residents.filter((r) => r.status === 'active' && r.job === b.id).length;
      const residents = state.residents.filter((r) => r.status === 'active' && r.home === b.id).length;
      lines.push(h('strong', {}, buildingDefOf(c, b.type).name));
      if (b.type === 'home') lines.push(h('span', {}, residents ? `Жильцов: ${residents}` : 'Дом опустел'));
      else {
        lines.push(h('span', {}, `Работников: ${workers} из ${b.jobs}`));
        lines.push(h('span', { class: b.open ? '' : 'bad' }, b.open ? 'Работает' : 'Закрыто'));
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

  /** Green arrow up / red arrow down next to a resource after a turn; nothing when it did not change. */
  /** A trend arrow; `unit` null hides the number (the city index is never shown). */
  function trend(delta: number | null, unit: string | null = ''): HTMLElement | null {
    if (delta === null || delta === 0) return null;
    const up = delta > 0;
    const title = unit === null ? (up ? 'Городу стало лучше за ход' : 'Городу стало хуже за ход') : `${up ? '+' : ''}${delta}${unit} за ход`;
    return h('span', { class: `trend ${up ? 'up' : 'down'}`, title }, up ? '▲' : '▼');
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
    const text = next !== here ? `≈→ ${c.balance.cityStates[next].name.toLowerCase()}` : `город ≈${worse ? '▼' : '▲'}`;
    return h('small', { class: `res-forecast ${worse ? 'down' : 'up'}`, title: 'Ожидается, если выпустить газету так и никакую ложь не поймают' }, text);
  }

  /** The list of stories that can fill an empty place: every other story of today, best first. */
  function storyChooser(key: Placement, ordered: CardInstance[], whereOf: (card: CardInstance) => Placement | 'out'): HTMLElement {
    const others = ordered.filter((x) => whereOf(x) !== key);
    const placeName = (w: Placement | 'out') => (w === 'out' ? 'не в печати' : `сейчас: ${placementLabels[w].toLowerCase()}`);
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
                h('span', { class: 'opt-head' }, tierMeter(x.tier, tierLabels[x.tier]), h('small', {}, placeName(whereOf(x)))),
              ),
            ),
          )
        : [h('p', { class: 'hint' }, 'Других новостей сегодня нет.')]),
    );
  }

  /** The expected change of a value if the issue goes out as laid out: «≈+37», grey and dotted. */
  function forecastTag(expected: number): HTMLElement | null {
    const n = Math.round(expected);
    if (n === 0) return null;
    return h('small', { class: `res-forecast ${n > 0 ? 'up' : 'down'}`, title: 'Ожидается, если выпустить газету так и никакую ложь не поймают' }, `≈${n > 0 ? '+' : '−'}${Math.abs(n)}`);
  }

  /**
   * The goal track (CONCEPT.md §7.3): the city's five stages from «Процветает» to «Руины», a marker
   * where the city is, a ghost marker where the laid-out issue will move it, and the mode's goal —
   * a flag on the stage to reach (destroy) or a line not to fall past (save).
   */
  function renderGoal(fc: Forecast | null): void {
    const stages = c.balance.cityStates;
    const here = cityStateOf(c, state.metrics.cityIndex);
    const next = fc ? cityStateOf(c, fc.cityIndex) : here;
    const save = state.mode === 'save';
    // The goal stage: the first one below the mode's bound.
    const goal = stages.findIndex((x) => x.min < (save ? c.balance.saveLoseIndex : c.balance.winCityIndex));
    const pos = (i: number) => `${((i + 0.5) / stages.length) * 100}%`;
    hudGoal.replaceChildren(
      h('b', { class: 'goal-title' }, save ? 'Не дать упасть' : 'Цель'),
      h(
        'div',
        { class: 'goal-track' },
        // Stages the city has been through keep their colours; those ahead are greyed out, so the
        // way to the goal reads at a glance. In the save mode the forbidden ones are darker still.
        ...stages.map((_, i) =>
          h('span', { class: `goal-step s${i}${i > here ? ' ahead' : ''}${save && i >= goal ? ' dim' : ''}${!save && i === goal ? ' target' : ''}` }),
        ),
        save
          ? h('i', { class: 'goal-line', style: `left: calc(${(goal / stages.length) * 100}% - 2px)` })
          : h('i', { class: 'goal-flag', style: `left: ${pos(goal)}`, title: 'Цель' }, '🏁'),
        next !== here ? h('i', { class: 'goal-marker ghost', style: `left: ${pos(next)}` }) : null,
        h('i', { class: 'goal-marker', style: `left: ${pos(here)}` }),
      ),
      h('div', { class: 'goal-names' }, ...stages.map((x, i) => h('span', { class: [i === here ? 'here' : '', i === goal ? 'goal' : ''].join(' ').trim() }, x.name))),
    );
    hudGoal.title = `${cityGoal()}.`;
  }

  /** A story's level as a meter (CONCEPT.md §7.3): three bars, the lit ones by tier, and the word. */
  function tierMeter(tier: number, title: string, raised = false): HTMLElement {
    return h(
      'span',
      { class: `tier-meter t${tier}`, title },
      h('span', { class: 'tier-bars', 'aria-hidden': 'true' }, ...[1, 2, 3].map((i) => h('i', { class: i <= tier ? 'on' : '' }))),
      h('b', {}, raised ? `${tierLabels[tier]} ↑` : tierLabels[tier]),
    );
  }

  /** Yesterday's change next to a value: «+28», «−2»; the city only gets an arrow. */
  function deltaTag(delta: number | null, unit: string | null = ''): HTMLElement | null {
    if (delta === null || delta === 0) return null;
    const up = delta > 0;
    const text = unit === null ? (up ? '▲' : '▼') : `${up ? '+' : '−'}${Math.abs(delta)}`;
    return h('small', { class: `res-delta ${up ? 'up' : 'down'}`, title: unit === null ? (up ? 'Городу стало лучше за ход' : 'Городу стало хуже за ход') : `${up ? '+' : '−'}${Math.abs(delta)}${unit} за ход` }, text);
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
    state.mode === 'save'
      ? `Не дайте городу скатиться в «${stageBelow(c.balance.saveLoseIndex)}»`
      : `Цель — довести город до стадии «${stageBelow(c.balance.winCityIndex)}»`;

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

  /** Top panel: four resources with icons (CONCEPT.md §7.3); everything else lives in the debug menu. */
  function renderHud(): void {
    const trust = averageTrust(state, c);
    const r = report;
    const fc = currentForecast();
    renderGoal(fc);
    const items: (HTMLElement | null)[] = [
      resource(
        'money',
        'Деньги',
        `${state.money}`,
        r ? r.moneyDelta : null,
        `Расходы: ${totalUpkeep(state, c)} за ход. Нажмите — доходы и расходы.`,
        state.money < 0 ? 'bad' : '',
        '',
        () => openModal('money'),
        fc?.money ?? null,
      ),
      resource(
        'readers',
        'Читатели',
        `${readerCount(state)}`,
        r ? r.readers.after - r.readers.before : null,
        'Постоянные читатели покупают каждый выпуск и приносят доход. Нажмите — кто пришёл и ушёл.',
        '',
        '',
        () => openModal('readers'),
        fc?.readers ?? null,
      ),
      resource(
        'reputation',
        'Репутация',
        `${Math.round(trust)}%`,
        r ? Math.round(r.trustAfter - r.trustBefore) : null,
        'Чем выше, тем больше верят и реже проверяют. Упадёт до нуля — игра проиграна. Нажмите — подробности.',
        trust < 20 ? 'bad' : '',
        '%',
        () => openModal('reputation'),
        fc?.trust ?? null,
      ),
      resource(
        `city_state_${cityStateOf(c, state.metrics.cityIndex)}`,
        'Город',
        cityStage().name,
        r ? Math.round(r.metricsAfter.cityIndex - r.metricsBefore.cityIndex) : null,
        `${cityGoal()}. Нажмите — подробности.`,
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
    const publishing = issueOpen && !state.outcome;
    hudActions.replaceChildren(
      ...(publishing ? [publishButton()] : []),
    );
    // A folded issue waits as a newspaper icon over the city.
    issueFab.hidden = issueOpen || folding || titleOpen || busy || !!state.outcome;
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
    return h('span', { class: `risk-dot ${stamp}`, title: stamp === 'danger' ? 'Опасный выпуск: ложь могут поймать' : 'В выпуске есть ложь' });
  }

  function publishButton(): HTMLElement {
    const disabled = busy || !!state.outcome;
    if (searching) return h('button', { class: 'primary publish', disabled: true }, 'Репортёры ищут…');
    const b = c.balance;
    const level = currentIssueLevel();
    const hint =
      `${issueLevelLabels[level]} выпуск. ` +
      (b.issueAcquisition[level] > 0 ? `Новых читателей ×${b.issueAcquisition[level]}` : 'Новых читателей не будет') +
      `, равнодушные уходят с шансом ${pct(b.issueChurn[level])}` +
      (b.issueChurnBelievers[level] > 0 ? `, даже поверившие — ${pct(b.issueChurnBelievers[level])}.` : '.') +
      ' Нажмите — опубликовать и завершить ход.';
    return h(
      'button',
      // A novice's first day: the button glows, it is the one thing to press (CONCEPT.md §7.3).
      { class: `publish level-${level}${levelBump ? ` ${levelBump}` : ''}`, title: hint, onclick: endTurn, disabled },
      h('img', { src: `${assetBase}sprites/ui/issue_${level}.png`, alt: '', width: 24, height: 24 }),
      h('span', {}, 'В печать · ', h('b', {}, level === 3 ? 'СЕНСАЦИЯ!' : issueLevelLabels[level])),
      riskDot(),
      h('span', { 'aria-hidden': 'true' }, '▸'),
    );
  }

  function renderCityEvents(): void {
    const rec = state.reconciliation;
    cityEvents.replaceChildren(
      h('div', { class: 'day' }, `${state.town ? `${base.towns.find((t) => t.id === state.town)?.name ?? ''} · ` : ''}День ${state.turn}`),
      // Events no free reporter could write up are greyed (CONCEPT.md §3.3: one story a reporter a day).
      ...state.todayEvents.map((e) =>
        state.missedEvents.includes(e) ? h('div', { class: 'event missed', title: 'Свободного репортёра не нашлось' }, `• ${e} — никто не написал`) : h('div', { class: 'event' }, `• ${e}`),
      ),
      ...state.missedEvents.filter((e) => !state.todayEvents.includes(e)).map((e) => h('div', { class: 'event missed', title: 'Свободного репортёра не нашлось' }, `• ${e} — никто не написал`)),
      ...(rec ? [h('div', { class: 'event peace' }, `☮ Примирение: ${pairNames(rec.pair, ' и ')} · ещё ${rec.turnsLeft} ${turnsWord(rec.turnsLeft)}`)] : []),
      ...(mayorName() ? [h('div', { class: 'event' }, `Мэр: ${mayorName()}`)] : []),
      // Crime (CONCEPT.md §5.6): how ripe the town is, the gang that stayed, a town without police.
      ...crimeLines().map((t) => h('div', { class: 'event crime' }, t)),
      // Investigations under way (CONCEPT.md §3.3а): who digs under whom, and the day before it is ready.
      ...state.investigations.map((x) => {
        const who = reporterOf(c, x.reporterId).name;
        const whom = digWhom(x.target);
        return h('div', { class: 'event digging' }, x.turnsLeft <= 1 ? `⛏ Завтра: эксклюзив про ${whom} (${who})` : `⛏ ${who} копает под ${whom} — ещё ${x.turnsLeft} ${turnsWord(x.turnsLeft)}`);
      }),
    );
  }

  /** «Преступность: неспокойно», «Банда держит улицы», «В городе нет полиции». */
  function crimeLines(): string[] {
    const p = crimePressure(state, c);
    const out: string[] = [];
    if (p >= 0.1) out.push(`🚨 Преступность: ${p >= 0.4 ? 'разгул' : p >= 0.2 ? 'растёт' : 'неспокойно'}`);
    if (state.crimeBoost > 0) out.push('🚨 Банда держит улицы');
    if (policeLost(state)) out.push('🚨 В городе нет полиции');
    return out;
  }

  const pairNames = (key: string, sep: string) =>
    pairOf(key)
      .map((g) => groupOf(c, g).name.toLowerCase())
      .join(sep);
  const turnsWord = (n: number) => (n === 1 ? 'ход' : n < 5 ? 'хода' : 'ходов');
  const peopleWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'человека' : 'человек');

  /** The mayor elected mid-game, if any. */
  const mayorName = () => {
    const t = state.twist;
    if (!t || (t.result !== 'peacemaker' && t.result !== 'hardliner')) return null;
    return twistOf(c, t.id).candidates?.[t.result === 'peacemaker' ? 0 : 1] ?? null;
  };
  const daysWord = (n: number) => plural(n, 'день', 'дня', 'дней');

  /** What a done task gives: money and its prize (CONCEPT.md §4.8). */
  function prizeText(def: TaskDef): string {
    const p = def.prize;
    const parts = def.reward ? [`+${taskReward(c, def)} ₽`] : [];
    if (p?.type === 'voucher') parts.push('бесплатное улучшение');
    if (p?.type === 'trust') parts.push(`+${p.amount}% репутации`);
    if (p?.type === 'xp') parts.push(`+${p.amount} опыта репортёрам`);
    return parts.join(' и ');
  }

  /** Where a task stands, in a few words: «3 из 8», «сейчас 52%», «ещё 4 дня». */
  function taskLine(t: TaskState): string {
    const def = taskOf(c, t.id);
    if (t.status === 'done') return `выполнено · ${prizeText(def)}`;
    if (t.status === 'failed') return def.penalty ? `провалено · бюджет −${def.penalty} ₽ в день` : 'провалено';
    const p = taskProgress(state, c, t);
    const left = t.untilTurn - state.turn + 1;
    const days = `${left > 1 ? `ещё ${left} ${daysWord(left)}` : 'последний день'}`;
    const ch = def.check.type;
    const now =
      ch === 'noExposure' || ch === 'closed'
        ? ''
        : ch === 'cityBelow'
          ? `сейчас: ${cityStage().name.toLowerCase()} · `
        : ch === 'trust' || ch === 'mood'
          ? `сейчас ${p.value}% · `
          : ch === 'income'
            ? `вчера ${p.value} ₽ · `
            : `${Math.max(0, p.value)} из ${p.target} · `;
    return `${now}${days} · ${prizeText(def)}`;
  }

  /** The task whose helpful stories are lit up in the issue (CONCEPT.md §4.8). */
  let taskLight: string | null = null;

  /** Does this story help the lit task: its topic, its effects, its audience? */
  function helpsTask(card: CardInstance): boolean {
    const task = taskLight ? state.tasks.find((t) => t.id === taskLight && t.status === 'active') : null;
    const m = task ? taskOf(c, task.id).match : undefined;
    if (!m) return false;
    const tpl = templateOf(c, card.templateId);
    const effects = [...tpl.effects, ...(tpl.softEffects ?? [])].filter((e): e is CardEffect => !!e);
    return (
      !!m.topics?.includes(tpl.topic) ||
      effects.some((e) => m.effects?.includes(e.type)) ||
      !!(m.audience && (tpl.audience ?? []).some((g) => m.audience!.includes(g))) ||
      (!!m.conflict && !!card.conflict) ||
      (!!m.harmful && effects.some((e) => isHarmful(e))) ||
      (m.minTier !== undefined && card.tier >= m.minTier)
    );
  }

  /** The game's tasks: folded to one line by default, like the rival's plaque (CONCEPT.md §4.8). */
  function renderTasks(): void {
    const list = state.tasks.filter((t) => t.status === 'active' || t.endTurn === state.turn - 1);
    tasksNotice.hidden = !list.length || searching || !!state.outcome;
    if (tasksNotice.hidden) return;
    const own = state.tasks.filter((t) => !taskOf(c, t.id).twist);
    const giver = state.mode === 'save' ? 'Задания редакции' : 'Задания «Медиа-Плюс»';
    const icon = h('img', { src: `${assetBase}sprites/ui/task.png`, alt: '', width: 24, height: 24 });
    const toggle = (open: boolean) => (e: Event) => {
      e.stopPropagation();
      settings.tasksOpen = open;
      saveSettings(settings);
      render();
    };
    const doneCount = `${own.filter((t) => t.status === 'done').length} из ${own.length}`;
    tasksNotice.classList.toggle('folded', !settings.tasksOpen);
    if (!settings.tasksOpen) {
      tasksNotice.replaceChildren(
        h('button', { class: 'rival-toggle', onclick: toggle(true) }, icon, h('span', {}, giver), h('span', { class: 'rival-count task-count' }, doneCount), h('span', { class: 'chip-arrow' }, '▾')),
      );
      return;
    }
    tasksNotice.replaceChildren(
      h('div', { class: 'notice-head' }, icon, h('b', {}, giver), h('span', { class: 'rival-stats' }, `выполнено ${doneCount}`), h('button', { class: 'rival-hide', title: 'Свернуть', 'aria-label': 'Свернуть', onclick: toggle(false) }, '▴')),
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
            // How to do it, and which of today's stories help (CONCEPT.md §4.8).
            ...(t.status === 'active' && taskOf(c, t.id).hint
              ? [
                  h(
                    'span',
                    { class: 'task-hint' },
                    taskOf(c, t.id).hint!,
                    taskOf(c, t.id).match
                      ? h(
                          'button',
                          {
                            class: `task-find${taskLight === t.id ? ' on' : ''}`,
                            title: 'Подсветить в выпуске новости, которые помогут',
                            onclick: (e: Event) => {
                              e.stopPropagation();
                              taskLight = taskLight === t.id ? null : t.id;
                              render();
                            },
                          },
                          taskLight === t.id ? 'Скрыть' : 'Какие новости?',
                        )
                      : null,
                  ),
                ]
              : []),
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
      def.kind === 'election' ? (left > 1 ? `голосование через ${left} ${daysWord(left)}` : 'голосование завтра') : def.kind === 'governor' ? `ещё ${left} ${daysWord(left)}` : 'задание — в списке заданий';
    const lead =
      def.kind === 'election' && def.candidates
        ? h('p', { class: 'notice-note twist-lead' }, `Если бы голосовали сегодня, победил бы ${def.candidates[electionLeader(state, c) === 'peacemaker' ? 0 : 1]}: город ${electionLeader(state, c) === 'peacemaker' ? 'спокоен' : 'напуган'}.`)
        : null;
    twistNotice.replaceChildren(
      h('div', { class: 'notice-head' }, icon, h('b', {}, def.title), h('span', { class: 'rival-stats' }, when)),
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
  function renderTutorial(): void {
    const step = tutorialStep();
    guideNote.hidden = !step || !issueOpen;
    guideNote.classList.add('tutorial-note');
    guideNote.classList.remove('folded');
    if (!step) return;
    const skip = () => {
      skipStep(tutorial!, step.def.id);
      render();
    };
    guideNote.replaceChildren(
      h(
        'div',
        { class: 'guide-text' },
        h('span', { class: 'tut-count' }, `Обучение · шаг ${step.index + 1} из ${tutorialSteps.length}`),
        h('b', { class: 'guide-title' }, step.def.title),
        step.ready ? step.def.text : (step.def.ready ?? step.def.text),
      ),
      ...(step.def.id === 'goal' ? [] : [h('button', { class: 'guide-skip ghost', title: 'Пропустить этот шаг', onclick: skip }, 'Пропустить')]),
    );
  }

  /** Scrolled to once per step and target, so the player sees where to press. */
  let tutorialScrolled = '';

  /** The button to press now glows; over a window, a bar repeats the step in one line. */
  function renderTutorialTargets(): void {
    for (const el of document.querySelectorAll('.tut-target')) el.classList.remove('tut-target');
    const step = tutorialStep();
    tutorialBar.hidden = !step || modal === null || titleOpen;
    if (!step || titleOpen || busy || searching) return;
    if (!tutorialBar.hidden) {
      tutorialBar.replaceChildren(h('span', { class: 'tut-count' }, `Шаг ${step.index + 1}`), step.def.hint);
      // Under the window's title, so it never covers the button to press.
      modalLayer.querySelector('.modal-title')?.after(tutorialBar);
    }
    if (!step.ready) return;
    // Over a window only its buttons count; without one, only the game's.
    const scope: ParentNode = modal !== null ? modalLayer : document;
    for (const sel of stepTargets(step.def.id, tutorialView())) {
      const el = [...scope.querySelectorAll<HTMLElement>(sel)].find((x) => x.getClientRects().length > 0 && (modal !== null || !modalLayer.contains(x)));
      if (!el) continue;
      el.classList.add('tut-target');
      const key = `${step.index}|${sel}`;
      if (key !== tutorialScrolled) {
        tutorialScrolled = key;
        const r = el.getBoundingClientRect();
        if (r.top < 0 || r.bottom > innerHeight) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      return;
    }
    // The step is done elsewhere: the window's «×» glows.
    if (modal !== null) modalLayer.querySelector('.modal-title .icon-btn')?.classList.add('tut-target');
  }

  /** First-encounter notes, one at a time: what is on screen for the first time (CONCEPT.md §7.3 «Подсказки»). */
  function renderGuide(): void {
    if (tutorial) return renderTutorial();
    guideNote.classList.remove('tutorial-note');
    const show = settings.hints && issueOpen && !searching && !busy && !state.outcome;
    const notes = show ? pendingNotes({ state, c, report, rivalShown: !rivalNotice.hidden }, settings.notesSeen) : [];
    guideNote.hidden = !notes.length;
    if (!notes.length) return;
    const n = notes[0];
    const fold = (open: boolean) => (e: Event) => {
      e.stopPropagation();
      settings.guideOpen = open;
      saveSettings(settings);
      render();
    };
    // «Подсказка: подача» — no day numbers, the note says what it is about.
    const head = () => h('b', { class: 'guide-title' }, `Подсказка: ${n.title.charAt(0).toLowerCase()}${n.title.slice(1)}`);
    guideNote.classList.toggle('folded', !settings.guideOpen);
    // Folded (the default): one line with the title; a press unfolds it, and it stays open on later days.
    if (!settings.guideOpen) {
      guideNote.replaceChildren(
        h(
          'button',
          { class: 'guide-toggle', title: 'Показать подсказку', 'aria-expanded': 'false', onclick: fold(true) },
          head(),
          h('span', { class: 'guide-arrow' }, '▾'),
        ),
      );
      return;
    }
    // Some notes lead straight to what they talk about (CONCEPT.md §7.3).
    const act = n.action;
    const go = () => {
      settings.notesSeen = [...settings.notesSeen, n.id];
      if (act?.open === 'rival') settings.rivalOpen = true;
      saveSettings(settings);
      if (act?.open === 'shop' || act?.open === 'team') openModal(act.open);
      else render();
    };
    guideNote.replaceChildren(
      h('div', { class: 'guide-text' }, head(), n.text),
      h('button', { class: 'guide-hide', title: 'Свернуть подсказки', 'aria-expanded': 'true', onclick: fold(false) }, '▴'),
      ...(act ? [h('button', { class: 'guide-go', onclick: go }, act.label)] : []),
      h(
        'button',
        {
          class: 'guide-ok',
          onclick: () => {
            settings.notesSeen = [...settings.notesSeen, n.id];
            saveSettings(settings);
            render();
          },
        },
        notes.length > 1 ? 'Дальше ▸' : 'Понятно',
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
        h('b', {}, `Мэрия объявила примирение: ${pairNames(rec.pair, ' и ')}`),
        h(
          'button',
          {
            class: 'icon-btn',
            title: 'Закрыть',
            onclick: () => {
              reconcileSeen = true;
              render();
            },
          },
          '×',
        ),
      ),
      h('p', { class: 'notice-note' }, `${rec.turnsLeft} ${turnsWord(rec.turnsLeft)} их вражда будет остывать, а фактчекеры проверяют прессу строже.`),
    );
  }

  const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
  const personPortrait = (id: string, cls = 'person-portrait') =>
    h('img', { class: cls, src: `${assetBase}sprites/people/${id}.png`, alt: '', width: 32, height: 32 });

  /** The letters column of today's paper: readers on yesterday's issue, the named residents first. */
  function renderLetters(): void {
    const letters = state.letters ?? [];
    lettersBox.hidden = !letters.length || searching;
    if (lettersBox.hidden) return;
    lettersBox.replaceChildren(
      h('h4', { class: 'zone-label' }, 'Письма читателей'),
      h(
        'div',
        { class: 'letters-list' },
        ...letters.map((l) =>
          h(
            'div',
            { class: `letter letter-${l.kind}` },
            l.from ? personPortrait(l.from) : null,
            h('div', {}, h('p', { class: 'letter-text' }, `«${l.text}»`), h('p', { class: 'letter-sign' }, `— ${l.name}`)),
          ),
        ),
      ),
    );
  }

  /** What happened to a named resident, in words. */
  function fateText(p: PersonDef, e: FateEvent): string {
    const a = p.female ? 'а' : '';
    const place = e.building !== undefined && state.buildings[e.building] ? buildingName(state, c, e.building) : 'работа';
    switch (e.kind) {
      case 'lostJob':
        return state.buildings[e.building ?? -1]?.open === false ? `${closedLine(state, c, e.building!)} — остал${p.female ? 'ась' : 'ся'} без работы` : `потерял${a} работу (${lowerFirst(place)})`;
      case 'gotJob':
        return `${p.female ? 'нашла' : 'нашёл'} работу: ${lowerFirst(place)}`;
      case 'left':
        return `уехал${a} из города`;
      case 'protest':
        return `выш${p.female ? 'ла' : 'ел'} на протест`;
      case 'fear':
        return `боится выходить из дома`;
    }
  }

  /** The named residents (CONCEPT.md §2.2а): who they are, how they live now, what happened to them. */
  function peopleContent(): HTMLElement[] {
    return c.people.flatMap((p) => {
      const r = personResident(state, p.id);
      if (!r) return [];
      const a = p.female ? 'а' : '';
      const now =
        r.status === 'left'
          ? `Уехал${a} из города.`
          : [
              r.job !== null ? `Работает: ${lowerFirst(buildingName(state, c, r.job))}` : groupOf(c, p.group).jobs.length ? 'Без работы' : 'На пенсии',
              r.protestTurns > 0 ? 'протестует' : '',
              r.fearTurns > 0 ? 'боится выходить из дома' : '',
              r.mood < 0.35 ? 'в отчаянии' : r.mood > 0.7 ? (p.female ? 'довольна жизнью' : 'доволен жизнью') : '',
              r.follows.length ? 'читает «Вестник»' : '',
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
            ...log.map((e) => h('p', { class: 'person-log' }, `День ${e.turn}: ${fateText(p, e)}`)),
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
          ...st.levelUps.map((id) => `${reporterOf(c, id).name} ${reporterOf(c, id).female ? 'получила' : 'получил'} повышение: теперь ${levelNames[levelOf(c, staffOf(state, c, id).xp)].toLowerCase()}, пишет лучше и находит больше.`),
          ...st.quit.map((id) => {
            const r = reporterOf(c, id);
            const a = r.female ? 'а' : '';
            return st.leaked.includes(id)
              ? `${r.name} уволил${r.female ? 'ась' : 'ся'} из-за лжи в газете — и рассказал${a} конкурентам, что мы врали.`
              : `${r.name} не выдержал${a} и уволил${r.female ? 'ась' : 'ся'}.`;
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
    // Folded by default: one line with the first news, like the rival's plaque; the choice is remembered.
    if (!settings.staffOpen) {
      staffNotice.replaceChildren(
        h(
          'button',
          { class: 'rival-toggle', onclick: toggle(true) },
          h('b', {}, 'Редакция'),
          h('span', { class: 'staff-first' }, lines[0]),
          lines.length > 1 ? h('span', { class: 'rival-count' }, `ещё ${lines.length - 1}`) : null,
          h('span', { class: 'chip-arrow' }, '▾'),
        ),
      );
      return;
    }
    staffNotice.replaceChildren(
      h(
        'div',
        { class: 'notice-head' },
        h('b', {}, 'Редакция'),
        h('button', { class: 'rival-hide', title: 'Свернуть', 'aria-label': 'Свернуть', onclick: toggle(false) }, '▴'),
        h(
          'button',
          {
            class: 'icon-btn',
            title: 'Закрыть',
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
        offerError = 'Не хватает денег.';
      }
      render();
    };
    const poach = def.kind === 'poach' && offer.reporterId;
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
          { class: 'primary', onclick: answer(true) },
          poach ? `Удержать за ${retainCost(c, offer.reporterId!)}` : def.kind === 'kompromat' ? 'Взять документы' : 'Согласиться',
        ),
        h('button', { onclick: answer(false) }, poach ? 'Отпустить' : 'Отказаться'),
        offerError ? h('span', { class: 'bad' }, offerError) : null,
      ),
    );
  }

  /**
   * Save mode (CONCEPT.md §8): what the rival printed in the last days, which of it we can still
   * answer, its readers and trust, and how our debunks went yesterday.
   */
  function renderRival(): void {
    const rival = state.rival;
    if (!rival) {
      rivalNotice.hidden = true;
      return;
    }
    rivalNotice.classList.toggle('notice-guardian', rival.kind === 'guardian');
    const r = report?.rival;
    const notes: string[] = [];
    if (r?.cured) notes.push(`Вчера опровержения разубедили ${r.cured} ${peopleWord(r.cured)}.`);
    const rn = rivalNames[rival.kind];
    for (const p of r?.publications ?? []) if (p.exposed) notes.push(`«${rn.short}» пойман на лжи: «${p.title}».`);
    // Nothing printed yet and nothing to tell: no notice at all.
    rivalNotice.hidden = !rival || searching || !!state.outcome || (!rival.closed && !rival.printed.length && !notes.length);
    if (!rival || rivalNotice.hidden) return;
    const icon = h('img', { src: `${assetBase}sprites/ui/${rival.kind === 'guardian' ? 'guardian' : 'rival'}.png`, alt: '', width: 24, height: 24 });
    const toggle = (open: boolean) => () => {
      settings.rivalOpen = open;
      saveSettings(settings);
      render();
    };
    rivalNotice.classList.toggle('folded', !settings.rivalOpen);
    // Folded by default: one line with how many stories it printed yesterday (CONCEPT.md §7.3).
    if (!settings.rivalOpen) {
      const fresh = rival.printed.filter((p) => p.turn === state.turn - 1).length;
      rivalNotice.replaceChildren(
        h(
          'button',
          { class: 'rival-toggle', onclick: toggle(true) },
          icon,
          h('span', {}, rival.closed ? `«${rn.name}» закрылся` : `«${rn.name}»`),
          fresh ? h('span', { class: 'rival-count' }, `${fresh} ${fresh === 1 ? 'новая' : fresh < 5 ? 'новые' : 'новых'}`) : null,
          h('span', { class: 'chip-arrow' }, '▾'),
        ),
      );
      return;
    }
    const inIssue = new Set(state.hand.filter((x) => x.debunk && drafts.get(x.uid)?.publish).map((x) => x.debunk!.uid));
    const inHand = new Set(state.hand.filter((x) => x.debunk).map((x) => x.debunk!.uid));
    const status = (uid: number, debunked: boolean, exposed?: boolean) =>
      debunked ? '✓ опровергнуто' : exposed ? '✓ пойман на лжи' : inIssue.has(uid) ? 'опровержение в выпуске' : inHand.has(uid) ? 'опровержение не в выпуске' : '';
    rivalNotice.replaceChildren(
      h(
        'div',
        { class: 'notice-head' },
        icon,
        h('b', {}, rival.closed ? `«${rn.name}» закрылся` : `«${rn.name}»`),
        h('span', { class: 'rival-stats' }, `читателей ${rivalReaders(state)} · доверие ${Math.round(rivalTrust(state))}%`),
        h('button', { class: 'rival-hide', title: 'Свернуть', 'aria-label': 'Свернуть', onclick: toggle(false) }, '▴'),
      ),
      ...(rival.printed.length
        ? [
            h(
              'ul',
              { class: 'rival-list' },
              ...rival.printed.map((p) =>
                h(
                  'li',
                  { class: p.debunked || p.exposed || inIssue.has(p.uid) ? 'answered' : '' },
                  h('span', { class: 'rival-place' }, placementLabels[p.placement].toLowerCase()),
                  h('span', { class: 'rival-title' }, `«${p.title}»`),
                  h('span', { class: 'rival-answer' }, status(p.uid, p.debunked, p.exposed)),
                ),
              ),
            ),
          ]
        : []),
      // The mole at the rival's: what it prints today, with ours (CONCEPT.md §3.5).
      ...(getModifiers(state, c).seeRivalPlan && rival.plan.length
        ? [
            h('p', { class: 'notice-note mole-line' }, '🕵 Крот: сегодня «' + rn.short + '» напечатает:'),
            h(
              'ul',
              { class: 'rival-list mole-list' },
              ...rival.plan.map((x) => h('li', {}, h('span', { class: 'rival-place' }, placementLabels[x.placement].toLowerCase()), h('span', { class: 'rival-title' }, `«${storyTitle(c, x.card, x.distortion)}»`))),
            ),
          ]
        : []),
      ...notes.map((t) => h('p', { class: 'notice-note' }, t)),
      ...(rival.kind === 'guardian' && !rival.closed && rivalStarted(state, c) ? [rivalStrikes()] : []),
    );
  }

  /**
   * Strikes at «Голос города» (CONCEPT.md §8.4): lure its author away, set a reporter digging into its
   * money; a gripping issue of ours takes its readers by itself.
   */
  function rivalStrikes(): HTMLElement {
    const block = lureBlock(state, c);
    const lureWhy: Record<string, string> = { 'nobody left': 'переманивать больше некого', 'no money': 'не хватает денег', 'not yet': 'он ещё не выходит', 'no rival': '' };
    const digging = state.investigations.find((x) => x.target === RIVAL_DIG);
    const free = state.reporters.filter((id) => !state.investigations.some((x) => x.reporterId === id));
    const surname = (id: string) => reporterOf(c, id).name.split(' ').pop()!;
    return h(
      'div',
      { class: 'rival-strikes' },
      h('span', { class: 'strikes-label', title: 'Интересный выпуск сам перехватывает его читателей: кого зацепила наша новость, тот чаще бросает «Голос»' }, 'Ударить по «Голосу»:'),
      h(
        'button',
        {
          class: 'ghost strike',
          'data-tut': 'lure',
          disabled: !!block,
          title: block ? lureWhy[block] : 'Его ведущий автор уходит к нам: «Голос» печатает на одну новость в день меньше, его читатели доверяют ему меньше',
          onclick: actNow(() => lureRivalAuthor(state, c)),
        },
        `Сманить автора · ${lureCost(state, c)} ₽`,
      ),
      digging
        ? h('span', { class: 'strike-note' }, `${surname(digging.reporterId)} копает под «Голос» ${digging.total - digging.turnsLeft}/${digging.total}`)
        : free.length > 1 || (free.length === 1 && state.reporters.length > 1)
          ? h(
              'span',
              { class: 'strike-dig' },
              'Копать компромат:',
              ...free.map((id) =>
                h(
                  'button',
                  {
                    class: 'ghost strike',
                    title: `${surname(id)} несколько дней не ищет новостей и приносит документы о том, кто платит «Голосу». Поверившие перестают ему доверять. ${c.balance.investigationCost} ₽ в день`,
                    onclick: actNow(() => startInvestigation(state, c, id, RIVAL_DIG)),
                  },
                  surname(id),
                ),
              ),
            )
          : null,
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
      { class: 'relations', viewBox: `-70 -10 ${W + 140} ${H + 20}`, role: 'img', 'aria-label': 'Отношения между группами' },
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
      h('h3', { class: 'section' }, 'Отношения между группами'),
      h('div', { class: 'relations-box' }, chart, changes.length ? h('div', { class: 'rel-changes' }, ...changes) : null),
      state.reconciliation ? h('p', { class: 'hint-line' }, `☮ Мэрия мирит: ${pairNames(state.reconciliation.pair, ' и ')}.`) : null,
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
            `⛏ Копать компромат на ${groupOf(c, relFocus).forms.manyGen}`,
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
    const text = ['Мельком в подвале', 'Обычная статья в номере', 'Главный материал номера'][place];
    return `${text}: прочтут ${read} читателей, воздействие ×${impact}, риск ×${risk}.`;
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
    const audience = tpl.audience?.length ? tpl.audience.map((g) => groupOf(c, g).name.toLowerCase()).join(', ') : 'все жители';
    const investigation = tpl.source === 'investigation';
    const target = tpl.target === RIVAL_DIG ? '«Голос города»' : tpl.target ? groupOf(c, tpl.target).name : '';
    const reporter = reporterOf(c, card.reporterId);
    const open = details.has(card.uid);
    // Distortion raises the tier, and the item restyles itself at once (CONCEPT.md §3.1).
    const tier = p.tier;
    const raised = tier > card.tier;
    const act = (f: () => void) => () => {
      f();
      render();
    };

    const sourceLabel = { event: 'событие', fact: 'факт', rumor: 'слух', investigation: `компромат на группу «${target}»`, debunk: 'опровержение', offer: 'документы от анонима' }[tpl.source];
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
                  h('span', { class: 'opt-head' }, h('b', {}, placementLabels[pl]), taken(pl) && where !== pl ? h('small', {}, 'поменяется местами') : null),
                ),
              );
              if (pl === 2) item.dataset.tut = 'to-front';
              return item;
            }),
            menuItem(where === 'out', false, moveTo('out'), h('span', { class: 'move-out' }, '✕'), h('span', { class: 'opt' }, h('span', { class: 'opt-head' }, h('b', {}, 'Не печатать')))),
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
        title: `${toneOf(card, d.distortion)} (${truthLabels[p.truth].toLowerCase()}) — изменить подачу`,
        'aria-haspopup': 'menu',
        'aria-expanded': String(menuOpen),
        disabled: busy,
        onclick: act(() => {
          truthMenuFor = menuOpen ? null : card.uid;
          moveMenuFor = null;
          selected = null;
        }),
      },
      h('span', { class: 'chip-prefix' }, 'Подача:'),
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
        title: out ? 'Вернуть в выпуск заметкой' : 'Не печатать',
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
    const option = (dist: number, icon: Node, blockedHint: string | null) => {
      const preview = previewPublication(state, c, mods, { cardUid: card.uid, placement: d.placement, distortion: dist });
      const steps = preview.tier - card.tier;
      const stats = `${truthLabels[preview.truth]} · ${tierLabels[preview.tier]}${steps > 0 ? ` ${'↑'.repeat(steps)}` : steps < 0 ? ` ${'↓'.repeat(-steps)}` : ''} · риск ${Math.round(preview.exposureRisk * 100)}%`;
      const item = menuItem(
        d.distortion === dist,
        !!blockedHint,
        () => (d.distortion = dist),
        icon,
        h(
          'span',
          { class: 'opt' },
          h('span', { class: 'opt-head' }, h('b', {}, toneOf(card, dist)), h('small', {}, blockedHint ?? stats)),
          h('span', { class: 'opt-title' }, `«${preview.title}»`),
          effectLine(preview, huntBase),
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
            return option(dist, icon, blocked ? 'в выпуске уже есть сенсация' : null);
          }),
        )
      : null;
    // The better the story, the louder its label looks (CONCEPT.md §7.3).
    // The level is not a control: three bars and a word right after the headline.
    const tierLabel = tierMeter(tier, raised ? `Было: ${tierLabels[card.tier].toLowerCase()} — уровень поднят искажением` : `${tierLabels[tier]} новость`, raised);
    const info = open
      ? h(
          'div',
          { class: 'news-info' },
          h('p', {}, h('b', {}, tierLabels[tier]), raised ? ` (было: ${tierLabels[card.tier].toLowerCase()}, поднято искажением)` : ''),
          h('p', {}, `${truthLabels[p.truth]} · ${topicLabels[tpl.topic]} · ${sourceLabel} · ${scopeLabels[card.scope]}`),
          h('p', { class: 'effect' }, effectText(c, p.effect, tpl.target)),
          h('p', {}, `Аудитория: ${audience}`),
          h(
            'div',
            { class: 'card-stat', title: 'Насколько сильно поверившие отреагируют: уровень, место в газете, масштаб, аудитория' },
            h('span', {}, 'Воздействие'),
            meter(p.impact / 2.5, p.impact >= 1.4 ? 'danger' : 'ok'),
            h('em', {}, `×${p.impact.toFixed(1)}`),
          ),
          bar('Охват города', p.reachChance),
          bar('Риск разоблачения', p.exposureRisk, p.exposureRisk > 0.2 ? 'danger' : 'warn'),
          pair && p.tension
            ? h(
                'p',
                { class: p.tension.delta > 0 ? 'bad' : '' },
                `${pairNames[0].toUpperCase()}${pairNames.slice(1)}: ${tensionLabels[tensionLevel(c, state.tension[pair])].toLowerCase()}. ` +
                  `Новость ${p.tension.delta > 0 ? 'разожжёт' : 'остудит'} конфликт ${Math.abs(p.tension.delta) >= 8 ? 'сильно' : Math.abs(p.tension.delta) >= 3 ? 'заметно' : 'чуть-чуть'}.`,
              )
            : null,
          arcLeanNow !== null
            ? h(
                'p',
                { class: arcLeanNow > 0 ? 'bad' : '' },
                `Сюжет «${arc!.name}» идёт к ${arcLeanNow > 0 ? 'плохой' : 'хорошей'} развязке. Раздутая новость тянет его к плохой, успокоенная — к хорошей.`,
              )
            : null,
          where !== 'out' ? h('p', { class: 'hint' }, placementNote(where)) : null,
        )
      : null;

    const withImage = where === 2 || where === 1;
    // The editor's red pencil in the margin of an untrue story that may be caught (CONCEPT.md §7.3 «Риск выпуска»).
    const pencil = where !== 'out' && p.truth > 0 && p.exposureRisk > 0 ? riskStep(p.exposureRisk) : null;
    const cls = ['news', `at-${where}`, `truth-${p.truth}`, `tier-${tier}`, investigation ? 'investigation' : '', selected === card.uid ? 'selected' : '', pencil !== null ? `pencil pencil-${pencil}` : '', helpsTask(card) ? 'task-match' : '']
      .filter(Boolean)
      .join(' ');
    const children: (HTMLElement | null)[] = [
      investigation ? h('div', { class: 'kicker' }, `Расследование · эксклюзив · ${target.toLowerCase()}`) : null,
      card.expert ? h('div', { class: 'kicker expert-kicker', title: 'Событие по специальности репортёра: на уровень сильнее' }, `Эксклюзив · ${reporter.name} знает тему`) : null,
      card.debunk ? h('div', { class: 'kicker debunk-kicker' }, `Опровержение · «${rivalNames[state.rival?.kind ?? 'tabloid'].name}»`) : null,
      pair ? h('div', { class: `kicker conflict-kicker level-${tensionLevel(c, state.tension[pair])}` }, `Конфликт · ${pairNames}`) : null,
      tpl.source === 'offer' ? h('div', { class: 'kicker offer-kicker' }, 'Документы от анонима · подлинность не проверена') : null,
      brokenDeal ? h('div', { class: 'kicker deal-kicker' }, `Нарушит сделку «${offerOf(c, brokenDeal.id).title}»`) : null,
      arc
        ? h(
            'div',
            { class: `kicker arc-kicker${arcLeanNow !== null ? (arcLeanNow > 0 ? ' arc-bad' : ' arc-good') : ''}` },
            `Сюжет · ${arc.name} · ${arc.day < arc.days ? `день ${arc.day} из ${arc.days}` : 'развязка'}`,
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
          pencil !== null ? h('span', { class: 'pencil-note', title: `Риск разоблачения ${Math.round(p.exposureRisk * 100)}%` }, riskNotes[pencil]) : null,
          outButton,
        ),
        h('h3', { class: 'headline' }, p.title, ' ', tierLabel),
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
              title: 'Подробности: эффект, аудитория, воздействие, охват, риск',
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
  /** Whom an investigation digs under, in the genitive: a group or «Голос города» (CONCEPT.md §8.4). */
  const digWhom = (target: string) => (target === RIVAL_DIG ? '«Голос города»' : groupOf(c, target).forms.manyGen);

  const actNow = (f: () => void) => () => {
    f();
    render();
  };

  function placeKicker(card: CardInstance): HTMLElement | null {
    if (card.building === undefined || !state.buildings[card.building]) return null;
    return buildingDefOf(c, state.buildings[card.building].type).names ? h('div', { class: 'kicker place-kicker' }, buildingName(state, c, card.building)) : null;
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
        { class: `hunt-chip on${hits ? '' : ' idle'}`, title: hits ? `Травля: ${name} — эта новость бьёт по цели` : 'В такой подаче новость не страшная и по цели не ударит' },
        '🎯 ',
        hits ? (bonus ? `Травля +${bonus}%` : 'Травля') : 'Не ударит',
      );
    }
    if (!x.open || x.jobs === 0 || state.outcome) return null;
    return h(
      'button',
      {
        class: 'hunt-chip',
        title: `${state.hunt ? 'Травить вместо нынешней цели' : 'Начать травлю'}: ${name}. Бить по этому месту день за днём: каждая страшная новость о нём подряд сильнее прошлой, люди его обходят, работники уходят`,
        onclick: actNow(() => startHunt(state, x.id)),
      },
      '🎯 Травить',
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
      { class: 'help-chip', title: 'Хорошая новость радует горожан — городу станет лучше. Вам нужно наоборот: подайте её страшнее или уберите в «Не печатать».' },
      '⚠ Поможет городу',
    );
  }

  /** «≈12 поверят · боятся выходить» under a framing in the truth menu, in the goal's colours (CONCEPT.md §7.3). */
  function effectLine(p: PublicationPreview, huntBase: number | null = null): HTMLElement {
    const short = effectShort(c, p.effect);
    const helps = p.effect === null ? 0 : p.effect.type === 'moodUp' ? 1 : p.effect.type === 'debunk' ? 0 : -1;
    const toGoal = helps === 0 ? 0 : (helps < 0) === (state.mode === 'destroy') ? 1 : -1;
    const n = Math.round(p.believers);
    // In a hunt: how hard this telling hits the target, next to the story told as it is.
    const hit = huntBase === null ? null : !p.huntHit ? '🎯 по цели не ударит' : huntBase > 0 ? `🎯 удар ×${(p.huntHit / huntBase).toFixed(1)}` : '🎯 ударит по цели';
    return h(
      'span',
      { class: `opt-effect${toGoal > 0 ? ' for' : toGoal < 0 ? ' against' : ''}` },
      p.effect ? `≈${n} ${plural(n, 'поверит', 'поверят', 'поверят')} · ${short}` : short,
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
    const shaky = stain < 0.15 ? 'держится' : stain < 0.4 ? 'люди его обходят' : 'на грани';
    const bonus = Math.round((huntBonus(state, c, getModifiers(state, c)) - 1) * 100);
    const pips = h('span', { class: 'pips hunt-pips' }, ...Array.from({ length: b.huntMaxSteps }, (_, i) => h('span', { class: i < camp.step ? 'on' : '' })));
    huntNotice.replaceChildren(
      h(
        'div',
        { class: 'notice-head' },
        h('span', { class: 'hunt-icon', 'aria-hidden': 'true' }, '🎯'),
        h('b', {}, `Травля: ${name}`),
        pips,
        h('span', { class: 'rival-stats' }, bonus ? `удар +${bonus}%` : 'ударьте сегодня'),
        h('button', { class: 'ghost hunt-stop', title: 'Прекратить травлю', onclick: actNow(() => endHunt(state)) }, 'Прекратить'),
      ),
      h(
        'p',
        { class: 'hunt-line' },
        `${shaky[0].toUpperCase()}${shaky.slice(1)}`,
        x.type === 'shop' || x.type === 'entertainment' ? '' : ` · работников ${staff}`,
        ' · каждый день подряд со страшной новостью о нём бьёт сильнее, пропуск остужает травлю.',
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
        tierMeter(p.tier, `${tierLabels[p.tier]} новость`),
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
    const from = reporterBar.rectOf(card.reporterId);
    const to = el.getBoundingClientRect();
    if (!from) return;
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
      ? 'Репортёры ищут новости… (щёлкните, чтобы пропустить)'
      : !visible.length
        ? digging
          ? 'Сегодня новостей нет: вся редакция копает компромат.'
          : 'Сегодня новостей нет.'
        : '';
    issueHead.replaceChildren(...(note ? [h('p', {}, note)] : []), ...(error ? [h('p', { class: 'bad' }, error)] : []));
    issueNo.textContent = `Выпуск № ${state.turn}`;
    renderPrice();
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
        left ? `Не печатать (${left}) ${trayOpen ? '▴' : '▾'}` : 'Не печатать',
      ),
      left ? '' : h('span', { class: 'tray-hint' }, isPhone() ? 'нажмите ✕ у новости' : 'перетащите сюда новость или нажмите ✕'),
    );
    for (const key of [2, 1, 0, 'out'] as const) {
      const here = ordered.filter((card) => whereOf(card) === key);
      zones[key].empty.hidden = here.length > 0 || key === 'out';
      // Phones tap, wide screens drag or tap (CONCEPT.md §7.3).
      const spare = ordered.some((card) => whereOf(card) === 'out');
      const hire = key !== 'out' && !spare && !searching && state.reporters.length < c.balance.maxReporters && !state.outcome;
      zones[key].empty.classList.toggle('hire', hire);
      zones[key].empty.textContent = hire
        ? `Больше новостей нет: ${state.reporters.length === 1 ? 'репортёр приносит одну' : 'каждый репортёр приносит одну'} в день. ＋ Нанять ещё`
        : isPhone()
          ? `＋ Выбрать ${zoneTexts[key][1]}`
          : `Перетащите сюда ${zoneTexts[key][1]} — или нажмите и выберите`;
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
    const parts: (HTMLElement | string)[] = [printed ? h('b', {}, level === 3 ? 'сенсация' : `${issueLevelLabels[level].toLowerCase()} выпуск`) : h('b', {}, 'газета выйдет пустой')];
    if (printed)
      parts.push(
        !untrue
          ? 'всё правда'
          : risk <= 0
            ? 'есть неправда · пока не проверяют'
            : h('span', {}, 'есть неправда — ', h('b', { class: `risk-word step-${stamp === 'danger' ? 3 : riskStep(risk)}` }, stamp === 'danger' ? 'опасно' : risk < 0.1 ? 'риск небольшой' : 'рискованно')),
      );
    // An untrue story from yesterday may still be caught today: the forecast leaves it out, this says it.
    if (state.pendingLies.length) parts.push(h('span', { class: 'late-risk' }, 'вчерашняя ложь ещё может всплыть'));
    const fc = currentForecast();
    if (fc) {
      const here = cityStateOf(c, state.metrics.cityIndex);
      const next = cityStateOf(c, fc.cityIndex);
      const diff = fc.cityIndex - state.metrics.cityIndex;
      // In the player's colours (CONCEPT.md §7.3): what brings the goal nearer, and a warning when the issue helps the other side.
      const text = next !== here ? `город ≈ → ${c.balance.cityStates[next].name.toLowerCase()}` : Math.abs(diff) < 1 ? 'город почти не заметит' : diff < 0 ? 'город просядет' : 'городу станет лучше';
      const toGoal = Math.abs(diff) < 1 ? 0 : (diff < 0) === (state.mode === 'destroy') ? 1 : -1;
      parts.push(
        toGoal === 0
          ? text
          : h('span', { class: `goal-word ${toGoal > 0 ? 'for' : 'against'}`, title: toGoal > 0 ? 'Это приближает вашу цель' : 'Это уводит от вашей цели' }, toGoal < 0 ? `⚠ ${text}` : text),
      );
    }
    todayLine.replaceChildren('Сегодня в номере: ', ...parts.flatMap((x, i) => (i ? [' · ', x] : [x])));
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
    const about = `${b.cleanStreakDays} выпусков подряд без полуправды и лжи — +${b.cleanStreakBonus}% репутации у всего города. Ложь обнуляет серию, пустой выпуск её не двигает.`;
    streakBadge.title = streakTipOpen ? '' : about;
    streakBadge.replaceChildren(
      h('span', { class: 'streak-label' }, breaks ? 'Серия прервётся' : 'Без лжи'),
      h('span', { class: 'streak-pips', 'aria-label': `${days} из ${b.cleanStreakDays}` }, ...Array.from({ length: b.cleanStreakDays }, (_, i) => h('i', { class: i < days ? 'on' : '' }))),
      h('span', { class: 'streak-prize' }, `→ +${b.cleanStreakBonus}% репутации`),
      ...(streakTipOpen ? [h('span', { class: 'streak-tip' }, `${about} Сейчас: ${days} из ${b.cleanStreakDays}.`)] : []),
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
          `${truthLabels[x.truth]} · выпуск дня ${x.turn}, ${placementLabels[x.placement].toLowerCase()}` +
            (x.setup ? ' · документы оказались фальшивкой' : '') +
            (x.leaked ? ' · слил ушедший репортёр' : ''),
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
        h('b', {}, list.length === 1 ? 'Новость разоблачили!' : `Разоблачили новостей: ${list.length}`),
        h('span', { class: 'notice-loss' }, `репутация −${loss.toFixed(1)}%`),
        h(
          'button',
          {
            class: 'icon-btn',
            title: 'Закрыть',
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
    const max = c.balance.maxReporters;
    const salaries = state.reporters.reduce((sum, id) => sum + reporterOf(c, id).salary, 0);
    // Every reporter here looks like the head of their own window (CONCEPT.md §7.3 «Редакция»).
    const row = (id: string, price: string, action: HTMLElement) => {
      const r = reporterOf(c, id);
      const hired = state.reporters.includes(id);
      return reporterHead(id, {
        key: `team:${id}:`,
        compact: true,
        lines: hired ? [`${topicLine(r)} · ${price}`] : [r.bio, `${topicLine(r)} · ${price}`],
        action,
      });
    };
    return [
      h('p', { class: 'hint' }, `У вас ${state.money}. Зарплаты репортёров: ${salaries} за ход.`),
      ...(error ? [h('p', { class: 'bad' }, error)] : []),
      h('h3', { class: 'section' }, `Штат (${state.reporters.length} / ${max})`),
      ...state.reporters.map((id) =>
        row(
          id,
          `зарплата ${reporterOf(c, id).salary}/ход`,
          h('button', { class: 'ghost', disabled: state.reporters.length <= 1 || !!state.outcome, onclick: () => fire(id) }, 'Уволить'),
        ),
      ),
      ...agencySection(row),
    ];
  }

  /**
   * HR agency (CONCEPT.md §3.3): pay the fee, the agency offers one or two random reporters; hiring
   * costs the reporter's own price, then the salary every turn. The offer lasts until the end of the turn.
   */
  function agencySection(row: (id: string, price: string, action: HTMLElement) => HTMLElement): HTMLElement[] {
    const b = c.balance;
    const full = state.reporters.length >= b.maxReporters;
    const pool = c.reporters.filter((r) => r.weight > 0 && !state.reporters.includes(r.id)).length;
    // The first search a day is free (CONCEPT.md §3.3).
    const fee = agencyCost(state, c);
    const price = fee ? `−${fee}` : 'бесплатно';
    const canCall = !full && pool > 0 && state.money >= fee && !state.outcome;
    const act = (f: () => void) => () => {
      try {
        f();
        error = '';
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      render();
    };
    return [
      h('h3', { class: 'section', id: 'agency' }, 'Кадровое агентство «Перо и Ко»'),
      h(
        'p',
        { class: 'hint' },
        full
          ? `В редакции не больше ${b.maxReporters} репортёров. Чтобы нанять другого, кого-то придётся уволить.`
          : `Агентство подберёт одного или двух случайных репортёров: первый поиск за ход бесплатно, каждый следующий — ${b.agencyFee}. У каждого репортёра своя цена найма и своя зарплата. Предложение действует до конца хода.`,
      ),
      ...state.agencyOffer.map((id) => {
        const r = reporterOf(c, id);
        return row(
          id,
          `найм ${r.hireCost} · зарплата ${r.salary}/ход`,
          h(
            'button',
            { class: state.money >= r.hireCost ? 'primary' : '', 'data-tut': 'hire', disabled: full || state.money < r.hireCost || !!state.outcome, onclick: act(() => hireFromAgency(state, c, id)) },
            `Нанять (−${r.hireCost})`,
          ),
        );
      }),
      h(
        'button',
        { class: state.agencyOffer.length ? '' : 'primary', 'data-tut': 'agency', disabled: !canCall, onclick: act(() => callAgency(state, c)) },
        state.agencyOffer.length ? `Искать других (${price})` : `Найти репортёров (${price})`,
      ),
    ];
  }

  function requirementText(req: Requirement | null): string {
    const parts: string[] = [];
    if (req?.channel) parts.push(channelOf(c, req.channel).name);
    if (req?.upgrade) parts.push(c.upgrades.find((u) => u.id === req.upgrade)?.name ?? req.upgrade);
    return parts.length ? `Нужно: ${parts.join(', ')}` : '';
  }

  /**
   * «Улучшения газеты» (CONCEPT.md §3.5): upgrades by section; a series such as kiosks is one line
   * with its progress and the next step.
   */
  /**
   * What an upgrade would bring now, in the player's own numbers (CONCEPT.md §7.3 «Улучшения»): money
   * a day, readers a day, yesterday's losses or this issue's risk with it, and the days it takes to
   * pay for itself. Counted from the sim's own formulas on today's town, without rolling.
   */
  function upgradeGain(u: UpgradeDef): { parts: string[]; payback: number | null; never: boolean } | null {
    const e = u.effects;
    const mods = getModifiers(state, c);
    const withIt = { ...state, upgrades: [...state.upgrades, u.id] };
    const modsWith = getModifiers(withIt, c);
    const ch = state.ownedChannels[0];
    const level = report?.issue.level ?? 1;
    const parts: string[] = [];
    let money = 0;
    let readers = 0;
    if (e.adRateAdd) money += followersOf(state, ch) * e.adRateAdd;
    if (e.upkeepAdd) money += totalUpkeep(state, c) - totalUpkeep(withIt, c);
    if (e.reachAdd || e.reachMul || e.groupReach || e.trustBonus || e.acquisitionMul) readers += expectedJoins(withIt, c, modsWith, level) - expectedJoins(state, c, mods, level);
    if (money >= 0.5) parts.push(`≈ +${Math.round(money)} ₽ в день`);
    if (readers >= 0.75) parts.push(`≈ +${Math.round(readers)} ${plural(Math.round(readers), 'читатель', 'читателя', 'читателей')} в день`);
    else if (readers >= 0.1) {
      const every = Math.max(2, Math.round(1 / readers));
      parts.push(`≈ +1 читатель за ${every} ${plural(every, 'день', 'дня', 'дней')}`);
    } else if (readers <= -0.75) parts.push(`≈ −${Math.round(-readers)} ${plural(Math.round(-readers), 'новый читатель', 'новых читателя', 'новых читателей')} в день`);
    if (e.churnMul && report) {
      const lost = report.readers.lost - report.readers.lostBy.price;
      const saved = lost * (1 - e.churnMul);
      readers += saved;
      if (lost > 0) parts.push(`вчера ушли ${lost} ${plural(lost, 'читатель', 'читателя', 'читателей')} — ушли бы ≈ ${Math.round(lost - saved)}`);
    }
    if (e.trustBonus) parts.push(`+${e.trustBonus} к репутации`);
    if (e.reporterLuck && state.reporters.length) {
      const luck = (m: typeof mods) => state.reporters.reduce((s, id) => s + searchLuck(state, c, skilledReporter(state, c, reporterOf(c, id)), m), 0) / state.reporters.length;
      parts.push(`удача редакции ${Math.round(luck(mods) * 100)}% → ${Math.round(luck(modsWith) * 100)}%`);
    }
    if (e.exposurePenaltyMul) {
      const loss = report?.exposures.reduce((s, x) => s + x.trustLoss, 0) ?? 0;
      const ratio = modsWith.exposurePenaltyMul / mods.exposurePenaltyMul;
      parts.push(
        loss >= 0.5
          ? `вчерашнее разоблачение стоило бы −${Math.round(loss * ratio)} репутации, а не −${Math.round(loss)}`
          : `разоблачения будут стоить на ${Math.round(Math.abs(1 - ratio) * 100)}% ${ratio < 1 ? 'меньше' : 'больше'} репутации`,
      );
    }
    if (e.checkerMul) {
      const now = issueRisk(mods);
      const after = issueRisk(modsWith);
      parts.push(
        now.untrue && now.risk > 0
          ? `риск этого выпуска ${Math.round(now.risk * 100)}% → ${Math.round(after.risk * 100)}%`
          : `ложь будут ловить на ${Math.round(Math.abs(1 - e.checkerMul) * 100)}% ${e.checkerMul < 1 ? 'реже' : 'чаще'}`,
      );
    }
    if (!parts.length) return null;
    // A reader gained on day k pays every day after it; money comes every day.
    const daysLeft = Math.max(0, c.balance.turnLimit - state.turn + 1);
    const perReader = incomePerReader(state, c, ch);
    let payback: number | null = null;
    if (money > 0 || readers > 0) {
      for (let t = 1, sum = 0; t <= daysLeft; t++) {
        sum += money + readers * t * perReader;
        if (sum >= u.cost) {
          payback = t;
          break;
        }
      }
    }
    return { parts, payback, never: (money > 0 || readers > 0) && payback === null };
  }

  /**
   * The upgrades window (CONCEPT.md §3.5): the paper's style from the forks taken, the open fork (one
   * of two for good), today's deck with plus and minus on every card, and what is owned.
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
    const best = deck.filter((u) => options.get(u.id)?.affordable && options.get(u.id)?.unlocked && gainOf(u)?.payback).sort((a, z) => gainOf(a)!.payback! - gainOf(z)!.payback!)[0]?.id;
    const price = (u: UpgradeDef) => {
      const o = options.get(u.id);
      const free = o?.cost === 0 && u.cost > 0;
      return h('button', { class: o?.affordable ? 'primary' : '', 'data-tut': 'buy', disabled: !o?.affordable || !!state.outcome, onclick: () => buy(u.id) }, free ? 'бесплатно' : `${u.cost}`);
    };
    const icon = (u: UpgradeDef, cls = 'upg-icon') => h('span', { class: cls, 'aria-hidden': 'true' }, u.icon ?? '★');
    const series = (u: UpgradeDef) => (u.series ? c.upgrades.filter((x) => x.series === u.series) : null);
    const pips = (list: UpgradeDef[]) => h('span', { class: 'pips' }, ...list.map((x) => h('span', { class: state.upgrades.includes(x.id) ? 'on' : '' })));
    const nowLine = (u: UpgradeDef) => {
      const g = gainOf(u);
      if (!g) return null;
      return h(
        'p',
        { class: 'gain-line' },
        'Сейчас: ',
        h('b', {}, g.parts.join(', ')),
        g.payback ? h('span', { class: 'payback' }, ` · окупится за ${g.payback} ${plural(g.payback, 'день', 'дня', 'дней')}`) : null,
        g.never ? h('span', { class: 'payback never' }, ' · не окупится до конца партии') : null,
      );
    };
    const minus = (u: UpgradeDef) => (u.drawback ? h('p', { class: 'upg-minus' }, `− ${u.drawback}`) : null);
    // The paper's style: what the forks made of it.
    const taken = c.forks.map((f) => forkChoice(state, f)).filter((x): x is string => !!x).map((id) => c.upgrades.find((u) => u.id === id)!);
    const open = openForks(state, c)[0];
    const next = c.forks.find((f) => f.day > state.turn && !forkChoice(state, f));
    const forkSide = (id: string) => {
      const u = c.upgrades.find((x) => x.id === id)!;
      return h(
        'div',
        { class: 'fork-side' },
        h('div', { class: 'fork-title' }, icon(u), h('b', {}, u.name)),
        h('p', { class: 'upg-plus' }, `+ ${u.description}`),
        minus(u),
        nowLine(u),
        h('div', { class: 'fork-buy' }, price(u)),
      );
    };
    const card = (u: UpgradeDef) => {
      const line = series(u);
      return h(
        'div',
        { class: `deck-card${u.rare ? ' rare' : ''}${u.ability ? ' ability' : ''}` },
        u.ability ? h('span', { class: 'deck-tag tag-ability' }, 'приём') : u.rare ? h('span', { class: 'deck-tag tag-rare' }, 'редкое') : null,
        u.id === best ? h('span', { class: 'best-mark' }, 'выгоднее всего') : null,
        icon(u),
        h('b', {}, line ? `${seriesNames[u.series!] ?? u.name}: ${u.name.toLowerCase()}` : u.name, line ? pips(line) : null),
        h('p', { class: 'upg-plus' }, `+ ${u.description}`),
        minus(u),
        options.get(u.id) && !options.get(u.id)!.unlocked ? h('p', { class: 'req' }, requirementText(u.requires)) : null,
        h('div', { class: 'deck-foot' }, nowLine(u) ?? h('span'), price(u)),
      );
    };
    const owned = c.upgrades.filter((u) => state.upgrades.includes(u.id) && !(u.series && c.upgrades.filter((x) => x.series === u.series && state.upgrades.includes(x.id)).pop() !== u));
    const days = Math.max(0, state.shopRefreshTurn - state.turn);
    return [
      h('p', { class: 'hint' }, `У вас ${state.money} ₽ · расходы ${totalUpkeep(state, c)} ₽ в день. Улучшения оплачиваются сразу и действуют до конца партии.`),
      state.vouchers ? h('p', { class: 'good voucher-line' }, `За задания: ${state.vouchers === 1 ? 'одно улучшение из колоды' : `${state.vouchers} улучшения из колоды`} — бесплатно.`) : null,
      ...(error ? [h('p', { class: 'bad' }, error)] : []),
      taken.length ? h('div', { class: 'paper-style' }, ...taken.map((u) => h('span', { class: 'style-chip' }, icon(u, 'style-icon'), u.name))) : null,
      ...(open
        ? [
            ...infoSection('fork', `Развилка: ${open.title.toLowerCase()}`, 'Можно взять только одно из двух — навсегда. Второй вариант пропадёт. Развилки открываются по дням партии.'),
            h('div', { class: 'fork' }, forkSide(open.options[0]), h('span', { class: 'fork-or' }, 'или'), forkSide(open.options[1])),
          ]
        : []),
      next ? h('p', { class: 'fork-next' }, `Следующая развилка — «${next.title}»: ${next.options.map((id) => c.upgrades.find((u) => u.id === id)!.name.toLowerCase()).join(' или ')} (на ${next.day}-й день)`) : null,
      ...infoSection(
        'deck',
        'Сегодня предлагают',
        `Каждые ${b.shopRefreshDays} дня — ${b.shopOfferSize} новых предложения из колоды; раньше — за ${b.shopRefreshCost} ₽. Купленное уходит из колоды. «Приём» — кнопка над газетой, срабатывает раз в несколько дней. «Редкое» выпадает нечасто.`,
      ),
      h(
        'div',
        { class: 'deck-head' },
        h('span', { class: 'hint' }, days > 0 ? `новые через ${days} ${plural(days, 'день', 'дня', 'дней')}` : 'новые завтра'),
        h(
          'button',
          {
            disabled: state.money < b.shopRefreshCost || !!state.outcome,
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
          `Обновить −${b.shopRefreshCost}`,
        ),
      ),
      deck.length ? h('div', { class: 'deck' }, ...deck.map(card)) : h('p', { class: 'hint' }, 'Сегодня всё раскупили — новые предложения скоро.'),
      ...(owned.length
        ? [
            h('h3', { class: 'section' }, 'Ваша газета'),
            h(
              'div',
              { class: 'owned-list' },
              ...owned.map((u) => {
                const line = series(u);
                return h('span', { class: 'owned-chip', title: `${u.description}${u.drawback ? ` ${u.drawback}` : ''}` }, icon(u, 'style-icon'), line ? seriesNames[u.series!] ?? u.name : u.name, line ? pips(line) : null);
              }),
            ),
          ]
        : []),
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
        h('button', { disabled: !report, onclick: () => openModal('report') }, 'Итоги хода'),
        h('button', { onclick: () => newGame() }, 'Новая игра'),
      ),
      h('h3', { class: 'section' }, 'Игра'),
      row('Ход', `${Math.min(state.turn, b.turnLimit)} / ${b.turnLimit}`),
      row('Сид города', `${state.seed}`),
      row('Индекс города', state.mode === 'save' ? `${Math.round(m.cityIndex)} (поражение < ${b.saveLoseIndex})` : `${Math.round(m.cityIndex)} (победа < ${b.winCityIndex})`),
      row('Каналы', state.ownedChannels.map((ch) => channelOf(c, ch).name).join(', ')),
      row('Расходы за ход', `${totalUpkeep(state, c)}`),
      row('Реклама после скандала', `×${state.scandal.toFixed(2)}`),
      row('Неразоблачённая ложь', `${state.pendingLies.length}`),
      row('Ходов в минусе', `${state.brokeTurns} / ${b.brokeTurnsLimit}`),
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

  function upkeepLabel(x: UpkeepItem): string {
    if (x.kind === 'channel') return `Содержание: ${channelOf(c, x.id).name}`;
    if (x.kind === 'salary') return `Зарплата: ${reporterOf(c, x.id).name}`;
    if (x.kind === 'budget') return 'Урезанный бюджет (проверка провалена)';
    return `Расследование: ${reporterOf(c, x.id).name}`;
  }

  /** Money window: last turn's income and expenses line by line, and what to expect this turn. */
  function moneyContent(): HTMLElement[] {
    const b = c.balance;
    const r = report;
    const scandalNext = Math.min(1, state.scandal + b.scandalRecovery);
    const forecastIncome = state.ownedChannels.map((ch) => ({ ch, buyers: followersOf(state, ch), sum: salesOf(state, c, ch, followersOf(state, ch), scandalNext) }));
    const items = upkeepItems(state, c);
    const subsidies = state.deals.map((x) => ({ ...offerOf(c, x.id), until: x.untilTurn })).filter((x) => x.kind === 'subsidy');
    const net = forecastIncome.reduce((s, x) => s + x.sum, 0) + subsidies.reduce((s, x) => s + (x.amount ?? 0), 0) - items.reduce((s, x) => s + x.amount, 0);
    const out: (HTMLElement | null)[] = [
      h('div', { class: 'city-index' }, h('img', { src: `${assetBase}sprites/ui/money.png`, alt: '', width: 48, height: 48 }), h('div', {}, h('b', {}, `${state.money}`), h('span', {}, 'денег в кассе'))),
      state.brokeTurns > 0 ? h('p', { class: 'bad' }, `Касса в минусе ${state.brokeTurns} ход(а) из ${b.brokeTurnsLimit} допустимых — потом банкротство.`) : null,
      h('h3', { class: 'section' }, 'Ожидается в этом ходу'),
      ...forecastIncome.map((x) => ledgerRow(`Продажи: ${channelOf(c, x.ch).name}`, x.sum, `${x.buyers} чит. × ${incomePerReader(state, c, x.ch)} (цена «${priceLabels[state.price]}» ${c.balance.prices[state.price]} + реклама ${adRateOf(state, c, x.ch)})`)),
      scandalNext < 1 ? h('p', { class: 'hint' }, `После скандала реклама приносит ×${scandalNext.toFixed(1)}, восстанавливается на ${b.scandalRecovery} за ход.`) : null,
      ...subsidies.map((x) => ledgerRow(x.title, x.amount ?? 0, `до дня ${x.until}`)),
      ...items.map((x) => ledgerRow(upkeepLabel(x), -x.amount)),
      ledgerTotal('Итого за ход', net),
      ...(state.deals.length
        ? [
            h('h3', { class: 'section' }, 'Сделки'),
            ...state.deals.map((x) =>
              h(
                'p',
                { class: 'hint' },
                `${offerOf(c, x.id).title}: до дня ${x.untilTurn}. ${offerOf(c, x.id).kind === 'silence' && x.building !== undefined ? `Молчим о: ${buildingName(state, c, x.building)}.` : 'Ни одной плохой новости о власти.'}`,
              ),
            ),
          ]
        : []),
    ];
    if (r) {
      out.push(
        h('h3', { class: 'section' }, `Прошлый ход (${r.turn})`),
        ...Object.entries(r.income).map(([ch, v]) => ledgerRow(`Продажи: ${channelOf(c, ch).name}`, v, `${r.buyers[ch] ?? 0} чит.`)),
        ...(r.deals?.paid ? [ledgerRow('Субсидия мэрии', r.deals.paid)] : []),
        ...r.upkeepItems.map((x) => ledgerRow(upkeepLabel(x), -x.amount)),
        ...(r.deals?.broken ?? []).map((t) => ledgerRow(`Нарушена сделка «${t}»`, -(c.offers.find((o) => o.title === t)?.penalty ?? 0))),
        ledgerTotal('Итого', r.moneyDelta),
      );
    }
    return out.filter((x): x is HTMLElement => x !== null);
  }

  /** Readers window: readers per channel, who left last turn and why, who came. */
  function readersContent(): HTMLElement[] {
    const r = report;
    const reasons: Record<ChurnReason, string> = {
      exposed: 'увидели разоблачённую ложь',
      doubted: 'проигнорировали новость',
      boring: 'выпуск их не зацепил',
      empty: 'выпуска не было',
      price: 'цена им не по карману или кажется высокой',
      style: 'газета стала не для них',
    };
    const out: HTMLElement[] = [
      h('div', { class: 'city-index' }, h('img', { src: `${assetBase}sprites/ui/readers.png`, alt: '', width: 48, height: 48 }), h('div', {}, h('b', {}, `${readerCount(state)}`), h('span', {}, 'постоянных читателей'))),
      h('h3', { class: 'section' }, 'По группам'),
      ...c.groups.map((g) =>
        countRow(g.name, state.residents.filter((x) => x.status === 'active' && x.group === g.id && x.follows.some((ch) => state.ownedChannels.includes(ch))).length),
      ),
    ];
    if (r) {
      const rd = r.readers;
      out.push(
        h('h3', { class: 'section' }, `Прошлый ход (${r.turn})`),
        h('div', { class: 'ledger-row' }, h('span', {}, 'Выпуск'), h('b', {}, `${issueLevelLabels[r.issue.level]} · ${c.balance.issueAcquisition[r.issue.level] ? `новых ×${c.balance.issueAcquisition[r.issue.level]}` : 'новых нет'}`)),
        countRow('Было', rd.before),
        ...(Object.keys(reasons) as ChurnReason[]).filter((k) => rd.lostBy[k] > 0).map((k) => ledgerRow(`Ушли: ${reasons[k]}`, -rd.lostBy[k])),
        ...(rd.movedAway ? [ledgerRow('Уехали из города', -rd.movedAway)] : []),
        ledgerRow('Пришли новые', rd.gained),
        ledgerTotal('Итого', rd.after - rd.before),
      );
    }
    return out;
  }

  /** Reputation window: the average, last turn's change and what changed it, the fact-check shield. */
  function reputationContent(): HTMLElement[] {
    const b = c.balance;
    const r = report;
    const trust = averageTrust(state, c);
    const out: HTMLElement[] = [
      h('div', { class: 'city-index' }, h('img', { src: `${assetBase}sprites/ui/reputation.png`, alt: '', width: 48, height: 48 }), h('div', {}, h('b', {}, `${Math.round(trust)}%`), h('span', {}, 'средняя репутация у жителей'))),
      meter(trust / 100, trust < 20 ? 'danger' : 'ok'),
      h('div', { class: 'ledger-row' }, h('span', {}, 'Фактчекеры проверяют вас реже на'), h('b', {}, `${Math.round(b.trustShield * trust)}%`)),
      h(
        'div',
        { class: 'ledger-row' },
        h('span', {}, `Выпусков подряд без лжи`, h('small', {}, ` за ${b.cleanStreakDays} — +${b.cleanStreakBonus}% всему городу`)),
        h('b', {}, `${state.cleanStreak} из ${b.cleanStreakDays}`),
      ),
      h(
        'p',
        { class: 'hint' },
        `Правда приносит репутацию: на первой полосе больше всего, в заметке меньше; немного достаётся и тем, кто вас не читает. Пойманная ложь отнимает примерно столько, сколько дают 3–4 честных выпуска.`,
      ),
    ];
    if (r) {
      const loss = r.exposures.reduce((s, x) => s + x.trustLoss, 0);
      const delta = r.trustAfter - r.trustBefore;
      out.push(
        h('h3', { class: 'section' }, `Прошлый ход (${r.turn})`),
        ...r.exposures.map((x) => ledgerRow(`Разоблачено: «${x.title}»`, -Math.round(x.trustLoss * 10) / 10, `выпуск дня ${x.turn}`, '%')),
        ...(r.cleanStreak.bonus ? [ledgerRow(`${c.balance.cleanStreakDays} выпусков без лжи`, Math.round(r.cleanStreak.bonus * 10) / 10, '', '%')] : []),
        ledgerRow('Правдивые новости и прочее', Math.round((delta + loss - r.cleanStreak.bonus) * 10) / 10, '', '%'),
        ledgerTotal('Итого', Math.round(delta * 10) / 10, '%'),
      );
    }
    return out;
  }

  /** City window behind the city tile: the city's stage in words and what it is made of; the index itself stays hidden. */
  function cityContent(): HTMLElement[] {
    const m = state.metrics;
    const r = report;
    const stage = cityStateOf(c, m.cityIndex);
    const delta = (after: number, before: number) => trend(Math.round((after - before) * 100), '%');
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
          h('span', {}, `жителей из ${state.initialPopulation}`),
        ),
        r ? trend(r.metricsAfter.activeResidents - r.metricsBefore.activeResidents) : null,
      ),
      h('h3', { class: 'section' }, 'Подробности'),
      metric('Население', 'population'),
      metric('Занятость', 'employment'),
      metric('Экономика', 'economy'),
      metric('Настроение', 'mood'),
      metric('Порядок и безопасность', 'order'),
      h('button', { class: 'primary', onclick: () => openModal('population') }, 'Жители по группам →'),
    ];
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
        ? [...[...jobs].sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name} ${n}`), `без работы ${here.length - working.length}`].join(' · ')
        : `на пенсии · пенсия ${g.pension} в день`;
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
          h('span', {}, `${here.length} · ${active.length ? pct(here.length / active.length) : '0%'} города`),
          left ? h('span', { class: 'bad' }, `уехали ${left}`) : null,
        ),
        bar('Настроение', avg(here, (x) => x.mood), avg(here, (x) => x.mood) < 0.35 ? 'danger' : 'ok'),
        bar('Настрой к городу', avg(here, (x) => x.outlook), avg(here, (x) => x.outlook) < 0.35 ? 'danger' : 'ok'),
        g.jobs.length ? bar('Работают', here.length ? working.length / here.length : 0) : null,
        bar('Ваша репутация', avg(here, (x) => x.trust) / 100, 'warn'),
        h('p', { class: 'group-line' }, `Работа: ${work}`),
        h(
          'p',
          { class: 'group-line' },
          `Читают вас: ${readersHere} · верят вашим новостям: ${believers} · сбережения ≈ ${Math.round(avg(here, (x) => x.money))}`,
          protesting ? h('span', { class: 'bad' }, ` · протестуют: ${protesting}`) : '',
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
          state.investigations.some((x) => x.target === g.id) ? `⛏ Копаем под ${g.forms.manyGen}…` : `⛏ Копать компромат на ${g.forms.manyGen}`,
        ),
      );
    });
    return [
      h(
        'div',
        { class: 'city-index' },
        h('img', { src: `${assetBase}sprites/ui/residents.png`, alt: '', width: 32, height: 32 }),
        h('div', {}, h('b', {}, `${active.length}`), h('span', {}, `жителей сейчас · всего уехали ${all.length - active.length}`)),
      ),
      ...relationsContent(),
      h('h3', { class: 'section' }, 'Горожане'),
      ...peopleContent(),
      h('h3', { class: 'section' }, 'Группы'),
      ...rows,
      h('button', { onclick: () => openModal('city') }, '← Город'),
    ];
  }

  function reportContent(): HTMLElement[] {
    if (!report) return [h('p', { class: 'hint' }, 'Итоги появятся после первого хода.')];
    const r = report;
    return [
      ...r.publications.map((p) =>
        h(
          'div',
          { class: `report-item truth-${p.truth}${p.exposed ? ' exposed' : ''}` },
          h('strong', { class: 'headline' }, `«${p.title}»`),
          h('p', {}, `${truthLabels[p.truth]}, ${placementLabels[p.placement].toLowerCase()}. Увидели ${p.reached}, поверили ${p.believed}, проигнорировали ${p.doubted}, пересказали ${p.wordOfMouth}.`),
          h('p', { class: 'muted' }, Object.entries(p.byChannel).map(([ch, v]) => `${channelOf(c, ch).name}: ${v}`).join(' · ')),
          Object.keys(p.effects).length
            ? h('p', {}, Object.entries(p.effects).map(([k, v]) => `${effectLabels[k as keyof typeof effectLabels]}: ${v}`).join(' · '))
            : null,
          p.stigma
            ? h(
                'p',
                { class: 'bad' },
                `Город ополчился на группу «${groupOf(c, p.stigma.target).name}»: травля ${pct(p.stigma.pressure)}, уехали ${p.stigma.left}.`,
              )
            : null,
          p.exposed ? h('p', { class: 'bad' }, 'Разоблачено! Репутация и реклама упали.') : null,
        ),
      ),
      ...(r.publications.length === 0 ? [h('p', { class: 'hint' }, 'В этот ход ничего не опубликовано.')] : []),
      ...r.exposures
        .filter((x) => x.turn !== r.turn)
        .map((x) => h('div', { class: 'report-item exposed' }, h('p', { class: 'bad' }, `Всплыла старая ложь из выпуска дня ${x.turn}: «${x.title}»`))),
      h(
        'div',
        { class: 'report-item' },
        h(
          'p',
          {},
          `Читатели: было ${r.readers.before}, ушли ${r.readers.lost}, пришли ${r.readers.gained}, теперь ${r.readers.after}.`,
        ),
        h('p', {}, `Продажи: ${Object.entries(r.income).map(([ch, v]) => `${channelOf(c, ch).name} ${v} (${r.buyers[ch] ?? 0} читателей)`).join(', ') || 'нет'}`),
        h('p', {}, `Расходы: −${r.upkeep}. Итого: ${signed(r.moneyDelta)}`),
        h(
          'p',
          {},
          `Город: ${stageChange(r.metricsBefore.cityIndex, r.metricsAfter.cityIndex)}, жителей ${signed(
            r.metricsAfter.activeResidents - r.metricsBefore.activeResidents,
          )}, разоблачено ${r.exposures.length}, репутация ${signed(Math.round(r.trustAfter - r.trustBefore))}`,
        ),
      ),
      ...(r.events.length || r.notes.length
        ? [h('div', { class: 'report-item' }, h('strong', {}, 'Новый день'), ...r.events.map((e) => h('p', {}, `• ${e}`)), ...r.notes.map((n) => h('p', { class: 'muted' }, n)))]
        : []),
    ];
  }

  /** Reporter window: search topics and assigning an investigation (CONCEPT.md §3.3, §3.3а). */
  /** A section heading with an «?» that shows its explanation under it (CONCEPT.md §7.3 «Окно репортёра»). */
  function infoSection(key: string, title: string, ...texts: string[]): HTMLElement[] {
    const open = openInfo.has(key);
    return [
      h(
        'h3',
        { class: 'section' },
        title,
        h(
          'button',
          {
            class: `section-info${open ? ' on' : ''}`,
            title: open ? 'Скрыть пояснение' : 'Что это?',
            'aria-expanded': String(open),
            onclick: () => {
              if (open) openInfo.delete(key);
              else openInfo.add(key);
              render();
            },
          },
          '?',
        ),
      ),
      ...(open ? texts.map((t) => h('p', { class: 'hint info-text' }, t)) : []),
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
    const parts = [`удача +${pct(b.levelLuck[level] ?? 0)}`, `чутьё +${b.levelNose[level] ?? 0}`];
    const check = b.levelCheckMul[level] ?? 1;
    if (check < 1) parts.push(`ложь в его новостях ловят на ${pct(1 - check)} реже`);
    return level === 0 ? `${levelNames[0]}: пока без бонусов` : `${levelNames[level]}: ${parts.join(', ')}`;
  }

  function reporterHead(id: string, opts: { key?: string; lines?: (string | HTMLElement)[]; action?: HTMLElement | null; compact?: boolean } = {}): HTMLElement {
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
      { class: `rep-head${opts.compact ? ' compact' : ''}` },
      portrait(id, 'portrait rep-head-portrait'),
      h(
        'div',
        { class: 'rep-head-body' },
        h(
          'div',
          { class: 'rep-head-name' },
          r.name,
          h('button', { class: `section-info${openInfo.has(`${k}about`) ? ' on' : ''}`, title: 'О репортёре', 'aria-expanded': String(openInfo.has(`${k}about`)), onclick: toggle(`${k}about`) }, '?'),
        ),
        ...(openInfo.has(`${k}about`) ? [h('p', { class: 'hint info-text' }, aboutLine(r))] : []),
        h(
          'div',
          { class: 'rep-level' },
          h('span', { class: 'level-chip', title: levelPerks(level) }, levelNames[level]),
          h('span', { class: 'level-pips', title: `Ступень ${level + 1} из ${steps.length}` }, ...steps.map((_, i) => h('i', { class: i <= level ? 'on' : '' }))),
        ),
        ...(hired
          ? [
              h('div', { class: 'xp-bar', title: next === undefined ? `Опыт ${xp}` : `Опыт ${xp} из ${next}` }, h('b', { style: `width: ${Math.round(share * 100)}%` })),
              h(
                'div',
                { class: 'xp-caption' },
                ...(next === undefined
                  ? ['Высшая ступень — расти больше некуда']
                  : [`До «${levelNamesGen[level + 1]}» ещё `, h('b', {}, `${left} опыта`), ` · ≈ ${fronts} ${plural(fronts, 'первая полоса', 'первые полосы', 'первых полос')}`]),
              ),
            ]
          : []),
        ...(opts.lines ?? []).map((x) => h('p', { class: 'rep-head-line' }, x)),
        opts.action ? h('div', { class: 'rep-head-action' }, opts.action) : null,
      ),
      h(
        'div',
        { class: 'rep-corner' },
        skill(`${k}luck`, `luck_${sk.luckTier}`, `Удача: ${luckNames[sk.luckTier].toLowerCase()}`, `${pct(sk.luck)} — так часто репортёр что-то находит. С опытом подкова становится лучше.`),
        skill(`${k}nose`, `nose_${sk.noseTier}`, `Чутьё: ${noseNames[sk.noseTier].toLowerCase()}`, 'Чем тоньше нюх, тем чаще находки интересные и сенсационные. С опытом нюх становится тоньше.'),
        loyal ? h('span', { class: `loyal loyal-${loyal.level}`, title: 'Лояльность: ложь в газете её подтачивает, ниже предела репортёр уходит' }, loyal.word) : null,
      ),
    );
  }

  /**
   * «Приёмы» (CONCEPT.md §3.5): ready ones are blue with their price, the others say why not or in
   * how many days. A press uses the ability at once; a new story lands in the briefs.
   */
  function renderAbilities(): void {
    const owned = abilitiesOf(state, c);
    abilityBar.hidden = !owned.length || searching || !!state.outcome;
    if (abilityBar.hidden) return;
    const reasons: Record<string, string> = {
      'nobody free': 'все репортёры заняты',
      'nothing to raise': 'нечего усиливать',
      'no money': 'не хватает денег',
    };
    abilityBar.replaceChildren(
      h('span', { class: 'ability-label' }, 'Приёмы'),
      ...owned.map(({ def, readyTurn }) => {
        const block = abilityBlock(state, c, def.id);
        const wait = readyTurn - state.turn;
        const status = !block ? `готово · −${def.ability!.cost} ₽` : block === 'cooling down' ? `через ${wait} ${plural(wait, 'день', 'дня', 'дней')}` : reasons[block] ?? '';
        return h(
          'button',
          {
            class: `ability${!block ? ' ready' : ' wait'}`,
            disabled: !!block || busy,
            title: `${def.name}. ${def.description} ${def.drawback ?? ''}`.trim(),
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
          h('span', { class: 'ability-text' }, h('b', {}, def.name), h('small', {}, status)),
        );
      }),
    );
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
        h('b', {}, done.length > 1 ? `Расследований готово: ${done.length}` : 'Расследование готово'),
        h('button', { class: 'icon-btn', title: 'Закрыть', onclick: () => ((digSeen = true), render()) }, '×'),
      ),
      ...done.map((f) => {
        const card = state.hand.find((x) => x.uid === f.cardUid);
        return h(
          'p',
          { class: 'notice-note' },
          `${reporterOf(c, f.reporterId).name} ${reporterOf(c, f.reporterId).female ? 'принесла' : 'принёс'} эксклюзив: `,
          h('b', {}, card ? `«${storyTitle(c, card, 0)}»` : ''),
          card?.tier === 3 ? ' — сенсация!' : '',
          ' Поставьте его на первую полосу.',
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
      `Настроит остальных против ${g.forms.manyGen}: прочтут ≈ ${others} ваших читателей из других групп.`,
      ...hot.slice(0, 2).map((p) => `С ${p.x.forms.manyIns} и так ${tensionLabels[p.level].toLowerCase()}${p.level >= 2 ? ' — может дойти до драк' : ''}.`),
      `Часть ${g.forms.manyGen} уедет — даже те, кто вас не читает.`,
    ];
    const odds = r
      ? [
          truth! >= 0.6 ? 'скорее правда' : truth! >= 0.4 ? 'правда или слух — как повезёт' : 'скорее слух',
          sensation! >= 0.5 ? 'скорее всего сенсация' : sensation! >= 0.3 ? 'может выйти сенсацией' : 'сенсация — редкость',
        ].join(', ')
      : 'с чутьём репортёра выше шанс правды и сенсации';
    return h(
      'div',
      { class: 'dig-promise' },
      tpl ? h('p', { class: 'dig-headline' }, h('span', {}, 'Выйдет примерно так: '), h('b', {}, `«${tpl.titles[0] ?? ''}»`)) : null,
      h('p', { class: 'dig-when' }, r ? `Через ${days} ${turnsWord(days)} — эксклюзив на первую полосу.` : `Через ${fast === days ? days : `${fast}–${days}`} дня — эксклюзив на первую полосу.`),
      ...effect.map((t) => h('p', { class: 'dig-effect' }, t)),
      h('p', { class: 'dig-cost' }, `${b.investigationCost} ₽ в день${r ? ` · ${days} ${turnsWord(days)} ${r.name.split(' ').pop()} не пишет новостей` : ' · репортёр всё это время не пишет новостей'}`),
      h('p', { class: 'dig-odds' }, `Что выйдет: ${odds}.`),
      state.mode === 'save' ? h('p', { class: 'bad' }, 'Вы спасаете город — травля группы бьёт по нему самому.') : null,
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
      h('h3', { class: 'section' }, under ? `Уже копает: ${reporterOf(c, under.reporterId).name}` : 'Кто будет копать'),
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
                ? `Копает под ${digWhom(inv.target)} · ещё ${inv.turnsLeft} ${turnsWord(inv.turnsLeft)}`
                : `${days} ${turnsWord(days)} · ${truth >= 0.6 ? 'скорее правда' : truth >= 0.4 ? 'правда или слух' : 'скорее слух'} · ${sensation >= 0.5 ? 'скорее сенсация' : sensation >= 0.3 ? 'может выйти сенсацией' : 'сенсация редко'}`,
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
            'Копать',
          ),
        );
      }),
      h('button', { class: 'ghost', onclick: () => openModal('population') }, '← Жители'),
    ];
  }

  function investigateContent(): HTMLElement[] {
    const id = investigator;
    if (!id || !state.reporters.includes(id)) return [h('p', { class: 'hint' }, 'Репортёр больше не работает в редакции.')];
    const r = reporterOf(c, id);
    const b = c.balance;
    const inv = state.investigations.find((x) => x.reporterId === id);
    const act = (f: () => void) => () => {
      try {
        f();
        error = '';
      } catch (e) {
        error = e instanceof Error ? e.message : String(e);
      }
      render();
    };
    const head = reporterHead(id);
    const errorLine = error ? [h('p', { class: 'bad' }, error)] : [];
    // Search topics (CONCEPT.md §3.3): the reporter is sent after them and brings them more often.
    const assigned = state.reporterTopics[id] ?? [];
    const topics = Object.keys(topicLabels) as Topic[];
    const chip = (label: string, on: boolean, pick: () => void, title = '') =>
      h('button', { class: `chip${on ? ' on' : ''}`, 'aria-pressed': String(on), title, disabled: !!state.outcome, onclick: act(pick) }, label);
    const topicSection = [
      ...infoSection(
        'topics',
        'Темы поиска',
        `С шансом ${pct(b.assignFocus)} репортёр приносит новость на выбранные темы. ★ — его специальность: если все выбранные темы из них, удача +${pct(b.specialtyLuck)}.` +
          (onSpecialty(state, r) ? ' Сейчас он работает по специальности.' : ''),
      ),
      h(
        'div',
        { class: 'chips' },
        chip('Любые', assigned.length === 0, () => setReporterTopics(state, c, id, [])),
        ...topics.map((t) => {
          const special = r.skills.topics.includes(t);
          const on = assigned.includes(t);
          const el = chip(
            `${special ? '★ ' : ''}${topicLabels[t]}`,
            on,
            () => setReporterTopics(state, c, id, on ? assigned.filter((x) => x !== t) : [...assigned, t]),
            special ? 'Специальность репортёра' : '',
          );
          el.dataset.tut = `topic-${t}`;
          return el;
        }),
      ),
    ];
    // Save mode: watching the rival paper instead of the topics (CONCEPT.md §8).
    if (state.rival && !state.rival.closed) {
      const watching = state.rivalWatch.includes(id);
      topicSection.push(
        ...infoSection(
          'rival',
          `«${rivalNames[state.rival.kind].name}»`,
          `Следящий репортёр с шансом ${pct(b.assignFocus)} приносит опровержение свежей лжи «${rivalNames[state.rival.kind].gen}» вместо обычной новости; остальные находят его случайно, с шансом ${pct(b.debunkFindChance)}.`,
        ),
        h('div', { class: 'chips' }, chip(`Следить за «${rivalNames[state.rival.kind].ins}»`, watching, () => setRivalWatch(state, id, !watching))),
      );
    }
    if (inv) {
      const done = inv.total - inv.turnsLeft;
      return [
        head,
        ...errorLine,
        ...topicSection,
        ...infoSection('investigation', 'Расследование', `Пока идёт расследование, репортёр не ищет обычные новости, а редакция тратит ${b.investigationCost} за ход.`),
        h('p', {}, `Копает грязь ${inv.target === RIVAL_DIG ? 'на «Голос города»' : `на группу «${groupOf(c, inv.target).name}»`}. Осталось ходов: ${inv.turnsLeft} из ${inv.total}.`),
        meter(done / inv.total, 'warn'),
        h('button', { class: 'ghost', disabled: !!state.outcome, onclick: act(() => cancelInvestigation(state, id)) }, 'Отозвать с расследования'),
      ];
    }
    const turns = investigationTurns(c, r);
    const sensation = Math.min(1, b.investigationSensationBase + b.investigationSensationPerNose * r.skills.nose);
    const truth = Math.min(1, b.investigationTruthBase + b.investigationTruthPerNose * r.skills.nose);
    return [
      head,
      ...errorLine,
      ...topicSection,
      ...infoSection(
        'investigation',
        'Расследование',
        `Займёт ${turns} хода и ${b.investigationCost} денег за каждый ход — всё это время репортёр не приносит обычных новостей. ` +
          `Итог — эксклюзив: сенсация с шансом ${pct(sensation)}, правда с шансом ${pct(truth)} (иначе полуправда).`,
        'Поверившие из других групп злятся и выходят на протест, а сама группа чувствует травлю и уезжает — даже те, кто вас не читает.',
      ),
      h('p', {}, `Компромат на группу — эксклюзив через ${turns} ${turnsWord(turns)}. Под кого копать:`),
      // One line per group; what digging would bring hides behind «?» (CONCEPT.md §3.3а).
      ...c.groups.map((g) => {
        const key = `dig:${id}:${g.id}`;
        const open = openInfo.has(key);
        return h(
          'div',
          { class: 'shop-item dig-option' },
          h(
            'div',
            {},
            h(
              'strong',
              {},
              g.name,
              h(
                'button',
                {
                  class: `section-info${open ? ' on' : ''}`,
                  title: open ? 'Скрыть' : 'Что это даст?',
                  'aria-expanded': String(open),
                  onclick: () => {
                    if (open) openInfo.delete(key);
                    else openInfo.add(key);
                    render();
                  },
                },
                '?',
              ),
            ),
            open ? digPromise(g.id, id) : null,
          ),
          h('button', { class: 'primary', 'data-tut': 'dig', disabled: !!state.outcome, onclick: act(() => startInvestigation(state, c, id, g.id)) }, 'Копать'),
        );
      }),
    ];
  }

  function renderModal(): void {
    if (!modal) {
      modalLayer.replaceChildren();
      return;
    }
    const titles: Record<Exclude<Modal, null>, string> = {
      report: report ? `Итоги хода ${report.turn}` : 'Итоги хода',
      debug: 'Отладка',
      city: 'Город',
      population: 'Жители',
      money: 'Деньги',
      readers: 'Читатели',
      reputation: 'Репутация',
      shop: 'Улучшения газеты',
      team: 'Редакция',
      investigate: 'Репортёр',
      dig: digTarget ? `Компромат на ${groupOf(c, digTarget).forms.manyGen}` : 'Компромат',
      pause: 'Меню',
      howto: 'Как играть',
      settings: 'Настройки',
      about: 'Об игре',
      newgame: 'Новая игра',
      campaignNew: 'Новая кампания',
      carry: 'Кто поедет дальше',
    };
    const body =
      modal === 'report' ? reportContent() : modal === 'debug' ? debugContent() : modal === 'city' ? cityContent() : modal === 'population' ? populationContent() : modal === 'money' ? moneyContent() : modal === 'readers' ? readersContent() : modal === 'reputation' ? reputationContent() : modal === 'investigate' ? investigateContent() : modal === 'dig' ? digContent() : modal === 'pause' ? pauseContent() : modal === 'howto' ? howtoContent() : modal === 'settings' ? settingsContent() : modal === 'about' ? aboutContent() : modal === 'newgame' ? newGameContent() : modal === 'campaignNew' ? campaignNewContent() : modal === 'carry' ? carryContent() : modal === 'team' ? teamContent() : shopContent();
    const scroll = modalLayer.querySelector('.modal-body')?.scrollTop ?? 0;
    const panel = h(
      'div',
      { class: 'modal window' },
      h('div', { class: 'modal-title' }, h('h2', {}, titles[modal]), h('button', { class: 'icon-btn', title: 'Закрыть', onclick: () => openModal(null) }, '×')),
      h('div', { class: 'modal-body' }, ...body),
    );
    modalLayer.replaceChildren(panel);
    modalLayer.onclick = (e) => {
      if (e.target === modalLayer) openModal(null);
    };
    modalLayer.querySelector('.modal-body')!.scrollTop = scroll;
  }

  /** The game's stars and what each was for (CONCEPT.md §4.8), and whether it is a new record. */
  function outcomeStars(): HTMLElement {
    const s = scoreOf(state, c);
    const row = (ok: boolean, text: string) => h('li', { class: ok ? 'ok' : '' }, `${ok ? '★' : '☆'} ${text}`);
    const best = tutorial ? null : recordOf(state.mode, state.difficulty, state.length);
    return h(
      'div',
      { class: 'outcome-stars' },
      h('div', { class: 'stars' }, starLine(s.stars)),
      h('ul', {}, row(s.win, 'Победа'), row(s.tasks, 'Все задания выполнены'), row(s.clean, 'Ни одного разоблачения')),
      newRecord ? h('p', { class: 'record new' }, 'Новый рекорд!') : best ? h('p', { class: 'record' }, `Рекорд: ${starLine(best.stars)} · ${best.days} ${daysWord(best.days)}`) : null,
    );
  }

  /** After a game: a single one goes on to the next town or a new game; a campaign town back to the map. */
  function outcomeButtons(): HTMLElement[] {
    const win = state.outcome?.result === 'win';
    if (state.town && campaign) {
      const i = base.towns.findIndex((t) => t.id === state.town);
      const last = i === base.towns.length - 1;
      return [
        win
          ? h('button', { class: 'primary big', onclick: () => (last ? openCampaign() : openModal('carry')) }, last ? 'Кампания пройдена ▸' : 'Кто поедет дальше ▸')
          : h('button', { class: 'primary big', onclick: () => void startTown(i) }, 'Переиграть город'),
        h('button', { onclick: () => openCampaign() }, 'На карту'),
      ];
    }
    return [
      win
        ? h('button', { class: 'primary big', onclick: () => void startGame(state.mode) }, 'Следующий город ▸')
        : h('button', { class: 'primary big', onclick: () => openModal('newgame') }, 'Новая игра'),
      h('button', { onclick: () => showTitle() }, 'Главное меню'),
    ];
  }

  function renderOutcome(): void {
    // The main menu and the campaign map cover the finished game: its result is not shown over them.
    if (!state.outcome || busy || titleOpen || campaignOpen) {
      outcomeLayer.replaceChildren();
      return;
    }
    outcomeLayer.replaceChildren(
      h(
        'div',
        { class: `modal ${state.outcome.result}` },
        h('h2', {}, state.outcome.result === 'win' ? 'Победа' : 'Поражение'),
        h('p', {}, outcomeText(state.outcome, state.mode)),
        h('p', { class: 'muted' }, `Сыграно ходов: ${Math.min(state.turn - 1, c.balance.turnLimit)}. Город: ${cityStage().name.toLowerCase()}.`),
        tutorial
          ? h('p', { class: 'tutorial-done' }, 'Обучение пройдено. Теперь — настоящая партия: короткая или полная, на любой сложности («Новая игра»).')
          : null,
        outcomeStars(),
        h(
          'div',
          { class: 'outcome-actions' },
          ...outcomeButtons(),
        ),
      ),
    );
  }

  function render(): void {
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
    }
    renderCityEvents();
    renderIssue();
    renderExposures();
    renderReconcile();
    renderDig();
    renderStaff();
    renderLetters();
    renderOffer();
    renderRival();
    renderTwist();
    renderTasks();
    renderHunt();
    renderGuide();
    renderModal();
    renderOutcome();
    renderTitle();
    renderCampaign();
    renderTutorialTargets();
    saveSoon();
  }
  // ---------- Campaign (CONCEPT.md §9) ----------

  const sideNames: Record<GameMode, string> = { destroy: '«Медиа-Плюс»', save: 'Честная газета' };

  /** The map of the campaign; without one, the choice of a side first. */
  function openCampaign(): void {
    if (!campaign) {
      openModal('campaignNew');
      return;
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

  /** Plays a campaign town; the very first one begins with the side's opening story. */
  async function startTown(i: number): Promise<void> {
    if (!campaign) return;
    const t = base.towns[i];
    campaignOpen = false;
    modal = null;
    titleOpen = false;
    render();
    if (i === 0 && !Object.keys(campaign.results).length) await watchIntro(campaign.side);
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
    const key = JSON.stringify([camp, campaignSel, settings.difficulty]);
    if (key === campaignKey) return;
    campaignKey = key;
    const stars = campaignStars(camp);
    const need = base.towns.reduce((m, t) => Math.max(m, t.starsToEnter ?? 0), 0);
    const canvas = h('canvas', { class: 'camp-canvas' });
    drawRegion(canvas, base.towns);
    const pins = base.towns.map((t, i) => {
      const st = townState(base, camp, i);
      const res = camp.results[t.id];
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
        h('span', { class: 'pin' }),
        h('span', { class: 'lbl' }, `${i + 1}. ${t.name}`),
        res ? h('span', { class: 'pin-stars' }, starLine(res.stars)) : null,
      );
    });
    // The pin icons are tiny inline SVGs.
    pins.forEach((p, i) => (p.querySelector('.pin')!.innerHTML = townIcon(townState(base, camp, i), camp.side, !!base.towns[i].starsToEnter)));
    campaignLayer.replaceChildren(
      h(
        'header',
        { class: 'camp-top' },
        h('b', {}, 'Кампания'),
        h('span', { class: `camp-side ${camp.side}` }, sideNames[camp.side]),
        h('span', { class: 'camp-diff' }, base.difficulties.find((d) => d.id === camp.difficulty)?.name ?? ''),
        h('span', { class: 'camp-stars' }, `★ ${stars}`, h('small', {}, camp.finished ? ' · кампания пройдена' : stars < need ? ` · для финала нужно ${need}` : ' · финал открыт')),
        h('button', { class: 'ghost', onclick: () => openModal('campaignNew') }, 'Новая кампания'),
        h(
          'button',
          {
            onclick: () => {
              campaignOpen = false;
              showTitle();
            },
          },
          '← Меню',
        ),
      ),
      h('div', { class: 'camp-wrap' }, h('div', { class: 'camp-map' }, canvas, ...pins), townCard(campaignSel)),
    );
  }

  /** The chosen town: its picture, type, special rule, difficulty, length, the rival, the best result, who comes along. */
  function townCard(i: number): HTMLElement {
    const camp = campaign!;
    const t = base.towns[i];
    const st = townState(base, camp, i);
    const res = camp.results[t.id];
    const art = h('canvas', { class: 'town-art' });
    drawTownArt(art, t);
    const pop = t.balance?.population ?? base.balance.population;
    const rival = rivalNames[camp.side === 'save' ? 'tabloid' : 'guardian'].name;
    const who = camp.carry ?? { id: base.balance.startReporters[0], xp: 0 };
    const rep = reporterOf(base, who.id);
    const action =
      st === 'done'
        ? h('button', { class: 'primary big', onclick: () => void startTown(i) }, 'Переиграть ради звёзд')
        : st === 'now'
          ? h('button', { class: 'primary big', onclick: () => void startTown(i) }, `Ехать в ${t.name} ▸`)
          : st === 'gated'
            ? h('button', { class: 'big', disabled: true }, `Нужно ${t.starsToEnter} ★ (у вас ${campaignStars(camp)})`)
            : h('button', { class: 'big', disabled: true }, 'Сначала пройдите прошлый город');
    return h(
      'aside',
      { class: 'town-card' },
      art,
      h('h2', {}, t.name),
      h('div', { class: 'town-type' }, `${t.type} · жителей ~${pop}`),
      h('div', { class: 'town-rule' }, h('b', {}, t.rule.title), t.rule.text),
      h(
        'div',
        { class: 'town-facts' },
        h('span', {}, 'Сложность'),
        h('span', { class: 'town-bars' }, ...[1, 2, 3, 4, 5].map((k) => h('i', { class: k <= t.stars ? 'on' : '' }))),
        h('span', {}, 'Дней'),
        h('span', {}, String(townDays(t, camp.side))),
        h('span', {}, 'Против вас'),
        h('span', {}, `«${rival}»`),
        ...(res ? [h('span', {}, 'Лучший итог'), h('span', { class: 'town-best' }, `${starLine(res.stars)} · ${res.days} ${daysWord(res.days)}`)] : []),
      ),
      st === 'now' || st === 'done'
        ? h(
            'div',
            { class: 'town-rep' },
            portrait(who.id, 'portrait town-rep-portrait'),
            h('div', {}, h('b', {}, `${camp.carry ? 'С вами едет' : 'Начнёт с вами'}: ${rep.name}`), h('span', { class: 'level-chip' }, levelNames[levelOf(base, who.xp)])),
          )
        : null,
      action,
    );
  }

  /** A new campaign: the side for the whole of it; the difficulty is the one chosen for new games. */
  function campaignNewContent(): HTMLElement[] {
    const card = (side: GameMode, art: string, title: string, text: string) =>
      h(
        'button',
        {
          class: `mode-card mode-${side}`,
          onclick: () => {
            campaign = newCampaign(side, settings.difficulty);
            saveCampaign(campaign);
            openCampaign();
          },
        },
        h('img', { src: `${assetBase}sprites/intro/${art}.png`, alt: '', width: 256, height: 144 }),
        h('b', {}, title),
        h('span', {}, text),
      );
    return [
      ...(campaign ? [h('p', { class: 'bad' }, 'Текущая кампания будет потеряна.')] : []),
      h('p', {}, `Семь городов области подряд.${saveModeShown ? ' Сторона — на всю кампанию.' : ''} Сложность: ${base.difficulties.find((d) => d.id === settings.difficulty)?.name ?? ''} (меняется в окне «Новая игра»).`),
      h(
        'div',
        { class: 'mode-cards' },
        card('destroy', 'goal', '«Медиа-Плюс»', 'Холдинг проверяет теорию «страх продаётся» на целой области: город за городом.'),
        saveModeShown ? card('save', 'defend', 'Честная газета', 'Вы идёте за «Вечерним Набатом» из города в город и не даёте ему их сломать.') : null,
      ),
      h('button', { class: 'ghost', onclick: () => (campaign ? openCampaign() : openModal(null)) }, '← Назад'),
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
      h('p', {}, 'В следующий город едет только один репортёр — со всем своим опытом. Остальные останутся здесь.'),
      ...state.reporters.map((id) => {
        const r = reporterOf(c, id);
        const xp = staffOf(state, c, id).xp;
        return h(
          'div',
          { class: 'shop-item carry-item' },
          portrait(id, 'portrait carry-portrait'),
          h('div', {}, h('strong', {}, r.name), h('span', { class: 'level-chip' }, levelNames[levelOf(c, xp)]), h('p', { class: 'hint' }, `Опыт ${xp}`)),
          h('button', { class: 'primary', onclick: take(id) }, 'Взять'),
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
        h('h1', { class: 'title-logo' }, 'BREAKING TOWN'),
        h(
          'nav',
          { class: 'title-menu' },
          hasGame && !state.outcome
            ? h(
                'button',
                { class: 'title-item primary', onclick: continueGame },
                h('span', {}, 'Продолжить'),
                h('small', {}, `${modeLabels[state.mode]} · день ${Math.min(state.turn, c.balance.turnLimit)} · ${cityStage().name.toLowerCase()} · ${state.money} монет`),
              )
            : null,
          h(
            'button',
            { class: 'title-item', onclick: () => openCampaign() },
            h('span', {}, 'Кампания'),
            campaign ? h('small', {}, `${sideNames[campaign.side]} · ★ ${campaignStars(campaign)} · ${campaign.finished ? 'пройдена' : `город ${campaign.reached + 1} из ${base.towns.length}`}`) : h('small', {}, 'семь городов области'),
          ),
          // The tutorial mission first for a newcomer (CONCEPT.md §7.3 «Обучение»); a running game is not thrown away without asking.
          h(
            'button',
            { class: `title-item${!settings.tutorialDone && !(hasGame && !state.outcome) ? ' primary' : ''}`, onclick: () => (hasGame && !state.outcome ? openModal('newgame') : void startGame('destroy', undefined, true)) },
            h('span', {}, 'Обучение'),
            h('small', {}, settings.tutorialDone ? 'пройдено · можно сыграть ещё раз' : 'короткая лёгкая партия: задание за заданием'),
          ),
          item('Новая игра', () => openModal('newgame'), hasGame && !state.outcome ? '' : settings.tutorialDone ? 'primary' : ''),
          item('Как играть', () => openModal('howto')),
          item('Настройки', () => openModal('settings')),
          item('Об игре', () => openModal('about')),
        ),
      ),
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
    titleOpen = false;
    modal = null;
    scene?.stopTour();
    issueOpen = true;
    busy = true;
    void runSearch();
  }

  /** Starts a new game; before the first one of each mode its opening story plays (CONCEPT.md §1.1, §8). */
  async function startGame(mode: GameMode = 'destroy', seed?: number, tutorialGame = false): Promise<void> {
    modal = null;
    titleOpen = false;
    render();
    // For now the opening story plays before every new game (CONCEPT.md §1.1).
    await watchIntro(mode);
    scene?.stopTour();
    newGame(seed, mode, null, tutorialGame);
  }

  /** The opening story over the drifting city. */
  async function watchIntro(mode: GameMode = state.mode): Promise<void> {
    const wasTitle = titleOpen;
    titleOpen = false;
    modal = null;
    issueOpen = false;
    render();
    scene?.startTour();
    // The game interface hides behind the story as it does behind the title screen.
    root.classList.add('at-title');
    await playIntro(root, c, assetBase, mode);
    root.classList.remove('at-title');
    if (mode === 'save') settings.introSeenSave = true;
    else settings.introSeen = true;
    saveSettings(settings);
    if (wasTitle) showTitle();
  }

  function pauseContent(): HTMLElement[] {
    const item = (label: string, onclick: () => void, cls = '') => h('button', { class: `menu-item ${cls}`, onclick }, label);
    return [
      h(
        'nav',
        { class: 'pause-menu' },
        item('Продолжить', () => openModal(null), 'primary'),
        item('Как играть', () => openModal('howto')),
        item('Настройки', () => openModal('settings')),
        ...(state.town && campaign ? [item('Карта кампании', () => openCampaign())] : []),
        item('Новая игра', () => openModal('newgame')),
        item('Главное меню', () => showTitle()),
        debugMode ? item('Отладка', () => openModal('debug'), 'ghost') : null,
      ),
      hasGame
        ? h(
            'p',
            { class: 'hint pause-difficulty' },
            tutorial ? 'Обучение' : `Сложность: ${base.difficulties.find((d) => d.id === state.difficulty)?.name ?? ''} · ${state.length === 'short' ? 'короткая' : 'полная'} партия`,
          )
        : null,
    ].filter((x): x is HTMLElement => x !== null);
  }

  /** New game: the mode is chosen with a picture card (CONCEPT.md §8); a running game is lost. */
  function newGameContent(): HTMLElement[] {
    const card = (mode: GameMode, art: string, title: string, text: string) =>
      h(
        'button',
        { class: `mode-card mode-${mode}`, onclick: () => void startGame(mode) },
        h('img', { src: `${assetBase}sprites/intro/${art}.png`, alt: '', width: 256, height: 144 }),
        h('b', {}, title),
        h('span', {}, text),
        // The record of this mode at the chosen difficulty (CONCEPT.md §4.8).
        h('small', { class: 'mode-record' }, recordLine(mode)),
      );
    const recordLine = (mode: GameMode) => {
      const r = recordOf(mode, settings.difficulty, settings.length);
      return r ? `Рекорд: ${starLine(r.stars)} · ${r.days} ${daysWord(r.days)}` : 'Рекорда пока нет';
    };
    // Difficulty (CONCEPT.md §4.6): remembered in the settings for the next games.
    const levels = h(
      'div',
      { class: 'difficulty' },
      h('span', { class: 'difficulty-label' }, 'Сложность'),
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
      h('small', { class: 'hint' }, base.difficulties.find((d) => d.id === settings.difficulty)?.text ?? ''),
    );
    // Short or full game (CONCEPT.md §4.6а): remembered for the next games too.
    const lengths = h(
      'div',
      { class: 'difficulty' },
      h('span', { class: 'difficulty-label' }, 'Партия'),
      h(
        'div',
        { class: 'chips' },
        ...base.lengths.map((l) =>
          h(
            'button',
            {
              class: `chip${settings.length === l.id ? ' on' : ''}`,
              'aria-pressed': String(settings.length === l.id),
              title: l.text,
              onclick: () => {
                settings.length = l.id;
                saveSettings(settings);
                render();
              },
            },
            l.name,
          ),
        ),
      ),
      h('small', { class: 'hint' }, base.lengths.find((l) => l.id === settings.length)?.text ?? ''),
    );
    return [
      ...(hasGame && !state.outcome ? [h('p', { class: 'bad' }, 'Текущая партия будет потеряна.')] : []),
      lengths,
      levels,
      // The tutorial mission: an easy short game, one task at a time (CONCEPT.md §7.3 «Обучение»).
      h(
        'button',
        { class: `tutorial-pick${settings.tutorialDone ? '' : ' primary'}`, onclick: () => void startGame('destroy', undefined, true) },
        h('b', {}, 'Обучение'),
        h('span', {}, 'Лёгкая короткая партия: игра шаг за шагом показывает, как нанимать репортёров, приукрашивать новости, копать компромат, стравливать горожан и травить завод. Нужная кнопка подсвечивается.'),
      ),
      h(
        'div',
        { class: 'mode-cards' },
        card('destroy', 'goal', 'Разрушить город', 'Вы — редактор газеты холдинга «Медиа-Плюс». Пугайте, стравливайте и врите, пока город не опустеет. Мешать будет честный «Голос города».'),
        saveModeShown ? card('save', 'defend', 'Спасти город', 'Вы — последняя честная газета. «Вечерний Набат» холдинга пугает город — опровергайте его и не дайте городу пасть.') : null,
      ),
      h('button', { class: 'ghost', onclick: () => openModal(titleOpen ? null : 'pause') }, '← Назад'),
    ];
  }

  function settingsContent(): HTMLElement[] {
    const toggle = (label: string, hint: string, key: 'fastSearch' | 'skipCutscenes' | 'hints') =>
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
    return [
      h('h3', { class: 'section' }, 'Анимации'),
      toggle('Быстрый поиск', 'находки репортёров появляются сразу, без анимации', 'fastSearch'),
      toggle('Без роликов дня', 'не показывать драки, протесты и другие яркие события перед выпуском', 'skipCutscenes'),
      h('h3', { class: 'section' }, 'Подсказки'),
      toggle('Подсказки над газетой', 'короткая записка, когда в игре впервые появляется что-то новое: конфликт, конкурент, разоблачение…', 'hints'),
      h(
        'button',
        {
          onclick: () => {
            settings.notesSeen = [];
            saveSettings(settings);
            render();
          },
        },
        'Показать прочитанные подсказки снова',
      ),
      h('h3', { class: 'section' }, 'Вступление'),
      h('button', { onclick: () => void watchIntro() }, 'Посмотреть вступление ещё раз'),
      h('button', { class: 'ghost', onclick: () => openModal(titleOpen ? null : 'pause') }, '← Назад'),
    ];
  }

  /**
   * The rulebook (CONCEPT.md §7.3): the goal of the mode first — how to win and how to lose —, then
   * one day step by step, what to watch, and first tips. In a game it shows that game's mode; on the
   * title screen both modes.
   */
  function howtoContent(): HTMLElement[] {
    const icon = (src: string) => h('img', { src: `${assetBase}sprites/${src}.png`, alt: '', width: 32, height: 32 });
    const block = (src: string, title: string, ...text: (string | HTMLElement)[]) =>
      h('div', { class: 'howto-block' }, icon(src), h('div', {}, h('b', {}, title), ...text.map((t) => (typeof t === 'string' ? h('p', {}, t) : t))));
    const list = (...items: string[]) => h('ul', { class: 'howto-list' }, ...items.map((x) => h('li', {}, x)));
    const step = (n: number, title: string, text: string) =>
      h('div', { class: 'howto-step' }, h('span', { class: 'howto-num' }, String(n)), h('div', {}, h('b', {}, title), h('p', {}, text)));
    // Each mode's numbers at the chosen difficulty: `c` is adjusted for the current game's mode only.
    const balanceOf = (mode: GameMode) =>
      !titleOpen && mode === state.mode ? c.balance : withLength(withDifficulty(base, settings.difficulty, mode), settings.length, settings.difficulty).balance;
    const lose = (b: typeof c.balance) => `банкротство (деньги в минусе ${b.brokeTurnsLimit} дня подряд) или потеря репутации — вам перестали верить`;
    const goals: Record<GameMode, () => HTMLElement> = {
      destroy: () => {
        const b = balanceOf('destroy');
        return block(
          'ui/city',
          'Цель: разрушить город',
          `Вы — газета холдинга «Медиа-Плюс». За ${b.turnLimit} дней доведите город до стадии «${stageBelow(b.winCityIndex)}»: пугайте жителей, ссорьте их между собой, оставляйте без работы.`,
          list(
            `Победа: город в «${stageBelow(b.winCityIndex)}» — или закрылся «Голос города», честная газета, которая успокаивает людей и опровергает вашу ложь.`,
            `Поражение: ${lose(b)}, или прошли ${b.turnLimit} дней, а город держится.`,
          ),
        );
      },
      save: () => {
        const b = balanceOf('save');
        return block(
          'ui/rival',
          'Цель: спасти город',
          `Вы — «Городской Вестник», последняя честная газета. «Вечерний Набат» каждый день пугает город — не дайте ему скатиться в «${stageBelow(b.saveLoseIndex)}».`,
          list(
            `Победа: продержаться ${b.turnLimit} дней — или раньше закрыть «Набат».`,
            `Поражение: город в «${stageBelow(b.saveLoseIndex)}», ${lose(b)}.`,
          ),
        );
      },
    };
    const save = !titleOpen && state.mode === 'save';
    const modes: GameMode[] = titleOpen ? ['destroy', 'save'] : [state.mode];
    return [
      h('p', { class: 'howto-lead' }, 'Вы — редактор газеты. Один ход — один день и один выпуск. Город читает вас, верит или не верит — и меняется.'),
      ...modes.map((m) => goals[m]()),
      h('p', { class: 'hint-line' }, 'Где сейчас город, видно на шкале «Цель» вверху: пять стадий от «Процветает» до «Руин», 🏁 — куда нужно дойти. Бледная метка показывает, куда сдвинет город разложенный выпуск.'),
      h('h3', { class: 'section' }, 'Один день'),
      step(1, 'Репортёры приносят новости', 'События дня приносят всегда, остальное — как повезёт. Нанимайте репортёров кнопкой «+» у портретов.'),
      step(2, 'Разложите выпуск', 'Первая полоса — главная новость: её прочитают все и сильнее всего ей поверят. Статья — вторая по силе. Остальное выходит заметками. Что не нужно — «Не печатать». Нажмите на новость, чтобы переложить её.'),
      step(3, 'Выберите подачу', 'Кнопка «Подача» над заголовком: «Всё хорошо!», «Без паники», «Как есть», «Это неспроста», «Всё пропало!». Чем дальше от правды, тем сильнее новость — и тем вероятнее, что вас поймают на лжи. В меню виден риск каждого варианта.'),
      step(4, 'В печать', 'Кнопка «В печать» показывает, каким выйдет номер: скучным, обычным, интересным или сенсационным. Пока выпуск открыт, «≈» у показателей наверху — прогноз. После печати город отреагирует: над жителями появятся значки.'),
      // What the icons over residents mean: the city has no legend of its own (CONCEPT.md §7.3).
      h(
        'div',
        { class: 'howto-reactions' },
        ...(Object.keys(REACTION_ICON) as Reaction[]).map((r) =>
          h('span', {}, h('img', { src: `${assetBase}sprites/fx/${REACTION_ICON[r]}.png`, alt: '', width: 16, height: 16 }), reactionLabels[r]),
        ),
        h('span', {}, h('img', { src: `${assetBase}sprites/fx/rival_${save ? 'tabloid' : 'guardian'}.png`, alt: '', width: 16, height: 16 }), `отозвался на «${rivalNames[save ? 'tabloid' : 'guardian'].name}»`),
      ),
      h('h3', { class: 'section' }, 'Что беречь'),
      block('ui/reputation', 'Репутация', 'Правда её поднимает, пойманная ложь обрушивает. Чем выше репутация, тем охотнее вам верят и тем реже проверяют.'),
      block('ui/money', 'Деньги и читатели', 'Читатели покупают газету каждый день. Скучный выпуск их распугивает, интересный приводит новых. Цену газеты меняют в шапке выпуска. На деньги нанимайте репортёров и покупайте улучшения (тележка наверху).'),
      block('groups/workers', save ? 'Мирите группы' : 'Ссорьте группы', save ? 'Конфликтные новости можно успокоить. Вражда групп бьёт по городу сильнее всего.' : 'Конфликтные новости можно подогреть или успокоить. Вражда групп бьёт по городу сильнее всего; когда станет совсем жарко, вмешается мэрия.'),
      h('h3', { class: 'section' }, 'Первые советы'),
      list(
        ...(save
          ? [
              'Что напечатал «Набат», видно над газетой. Отправьте репортёра следить за ним (нажмите на портрет) — он будет приносить опровержения.',
              'Опровержение ставьте повыше: на первой полосе оно разубедит больше людей.',
              'Хорошие новости — на первую полосу. «Без паники» смягчает плохие, но это уже полуправда.',
            ]
          : [
              'Первые дни печатайте правду: репутация — ваш запас на будущую ложь.',
              'Самую громкую новость — на первую полосу. Рискованную ложь дешевле спрятать в заметку.',
              'Не печатайте одну тему подряд: читатели устают, и новость действует слабее.',
              'Нажмите на любой показатель наверху — откроется окно с подробностями.',
            ]),
      ),
      h('button', { onclick: () => void watchIntro() }, 'Посмотреть вступление'),
      h('button', { class: 'ghost', onclick: () => openModal(titleOpen ? null : 'pause') }, '← Назад'),
    ];
  }

  function aboutContent(): HTMLElement[] {
    return [
      h('p', {}, h('b', {}, 'Breaking Town'), ' — пошаговая сатирическая стратегия о газете, которая разрушает город новостями.'),
      h('p', {}, 'Все персонажи, город и медиахолдинг «Медиа-Плюс» вымышлены. Любые совпадения с реальными СМИ — повод задуматься.'),
      h('p', { class: 'hint-line' }, 'Ранняя версия: графика временная, баланс меняется.'),
      h('button', { class: 'ghost', onclick: () => openModal(titleOpen ? null : 'pause') }, '← Назад'),
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
