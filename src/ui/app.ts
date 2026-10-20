import { ASSET_BASE } from '../assets';
import { CityScene, REACTION_ICON, type HoverTarget } from '../render/scene';
import {
  averageTrust,
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
  templateOf,
  totalUpkeep,
  rivalReaders,
  rivalTrust,
  cityStateOf,
  setRivalWatch,
  type GameMode,
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
  type Requirement,
  type UpgradeDef,
  type WealthClass,
  type TurnReport,
} from '../sim';
import { h, pct, svg } from './dom';
import { loadSave, writeSave } from './save';
import { loadSettings, saveSettings } from './settings';
import { playIntro } from './intro';
import { characterLine, portrait, ReporterBar, skillLine, topicLine, type RepStatus } from './reporterBar';
import {
  priceLabels,
  modeLabels,
  rivalNames,
  toneOf,
  tensionLabels,
  effectLabels,
  effectText,
  placementLabels,
  issueLevelLabels,
  outcomeText,
  reactionLabels,
  scopeLabels,
  tierLabels,
  topicLabels,
  truthLabels,
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
  | 'pause'
  | 'howto'
  | 'settings'
  | 'about'
  | 'newgame'
  | null;

const REACTION_SECONDS = 2.6;
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
  let hasGame = saved !== null;
  const urlMode: GameMode = params.get('mode') === 'save' ? 'save' : 'destroy';
  // The game runs on the content of its difficulty (CONCEPT.md §4.6); `c` follows the current game.
  let c = withDifficulty(base, saved?.state.difficulty ?? settings.difficulty, saved?.state.mode ?? urlMode);
  let state: GameState = saved?.state ?? createGame(c, seedFromUrl(), urlMode, settings.difficulty);
  let drafts = new Map<number, Draft>(saved?.drafts ?? []);
  // A saved layout that no longer fits the slots (e.g. two front pages from a removed upgrade) is laid out anew.
  {
    const slots = placementSlots(getModifiers(state, c));
    const used = [0, 0, 0];
    for (const d of drafts.values()) if (d.publish) used[d.placement]++;
    if (used.some((n, i) => n > slots[i])) drafts = new Map();
  }
  let report: TurnReport | null = saved?.report ?? null;
  let error = '';
  let busy = false;
  let issueOpen = true;
  let modal: Modal = null;
  /** Reporter whose investigation window is open. */
  let investigator: string | null = null;
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
  let staffSeen = false;
  let offerError = '';
  /** Group picked on the relations circle: its lines stand out, the rest dim. */
  let relFocus: string | null = null;
  /** Story whose truth menu is open next to its headline. */
  let truthMenuFor: number | null = null;
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
  );
  const hudControls = h('div', { class: 'hud-controls' }, reporterBar.el, hudShop, hudMenu);
  const hud = h('header', { class: 'hud' }, hudControls, hudRes, hudActions);
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
  const legend = h(
    'div',
    { class: 'city-legend' },
    ...(Object.keys(REACTION_ICON) as Reaction[]).map((r) =>
      h('span', {}, h('img', { src: `${assetBase}sprites/fx/${REACTION_ICON[r]}.png`, alt: '' }), reactionLabels[r]),
    ),
  );
  const issueHead = h('div', { class: 'issue-head' });
  // The issue is a newspaper mock-up: front page, the article, columns of briefs, and a tray for
  // stories left out; stories are dragged between them (CONCEPT.md §7.3).
  type ZoneKey = Placement | 'out';
  const zoneTexts: Record<string, [string, string]> = {
    2: ['Первая полоса', 'Перетащите сюда главную новость'],
    1: ['Статья', 'Перетащите сюда статью'],
    0: ['Заметки', 'Перетащите сюда заметки'],
    out: ['Не печатать', 'Перетащите сюда новость, чтобы не печатать её'],
  };
  const targetTexts: Record<string, string> = { 2: 'На первую полосу', 1: 'Статьёй', 0: 'Заметкой', out: 'Не печатать' };
  const makeZone = (key: ZoneKey) => {
    const items = h('div', { class: 'zone-items' });
    const empty = h('p', { class: 'zone-empty' }, zoneTexts[key][1]);
    const label = h('h4', { class: 'zone-label' }, zoneTexts[key][0]);
    // While a story is picked, every other place shows a big target; a tap on it moves the story.
    const target = h('button', { class: 'zone-target', onclick: () => moveSelected(key) }, h('span', {}, `Сюда: ${targetTexts[key]}`));
    const root = h('section', { class: `zone zone-${key}`, 'data-zone': String(key) }, label, items, empty, target);
    return { root, items, empty, label, target };
  };
  const zones: Record<string, ReturnType<typeof makeZone>> = { 2: makeZone(2), 1: makeZone(1), 0: makeZone(0), out: makeZone('out') };
  const issueNo = h('span', { class: 'issue-no' });
  const priceSelect = h('div', { class: 'price-select' });
  // Two rows (CONCEPT.md §7.3): the name of the paper, then the cover price on the left and the issue number on the right.
  const masthead = h(
    'header',
    { class: 'masthead' },
    h('h2', {}, 'Городской Вестник'),
    h('button', { class: 'paper-close', title: 'Свернуть — посмотреть на город', onclick: () => closeIssue() }, '—'),
    h('div', { class: 'masthead-row' }, priceSelect, issueNo),
  );
  // The tray of stories left out is the last rubric of the page, folded into one line (CONCEPT.md §7.3).
  // «Письма читателей» (CONCEPT.md §2.2а): what readers wrote about yesterday's issue.
  const lettersBox = h('section', { class: 'letters', hidden: true });
  const paper = h('div', { class: 'paper' }, masthead, h('div', { class: 'paper-grid' }, zones[2].root, zones[1].root, zones[0].root), lettersBox, zones.out.root);
  // Exposures and the mayor's reconciliation are announced by plaques above the paper (CONCEPT.md §7.3).
  const exposureNotice = h('section', { class: 'notice notice-exposed', hidden: true, role: 'status' });
  const reconcileNotice = h('section', { class: 'notice notice-peace', hidden: true, role: 'status' });
  // Save mode: what the rival paper prints today, and which of its stories we answer (CONCEPT.md §8).
  const rivalNotice = h('section', { class: 'notice notice-rival', hidden: true, role: 'status' });
  const staffNotice = h('section', { class: 'notice notice-staff', hidden: true, role: 'status' });
  const offerNotice = h('section', { class: 'notice notice-offer', hidden: true, role: 'status' });
  const issue = h('div', { class: 'issue' }, h('div', { class: 'issue-panel' }, issueHead, exposureNotice, reconcileNotice, staffNotice, offerNotice, rivalNotice, paper));
  issue.addEventListener('click', (e) => {
    if (searching) skip();
    else if (e.target === issue || e.target === issue.firstElementChild) {
      if (selected !== null) pick(null);
      else closeIssue();
    }
  });
  // A press anywhere else closes an open truth menu.
  document.addEventListener('pointerdown', (e) => {
    if ((truthMenuFor === null && !priceMenuOpen) || (e.target as Element).closest('.place-menu, .truth-chip, .price-chip')) return;
    truthMenuFor = null;
    priceMenuOpen = false;
    render();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && selected !== null) pick(null);
  });
  // Start-of-turn notice about exposed stories; hovering it shows the cards (CONCEPT.md §7.3).
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
  root.replaceChildren(
    hud,
    h('main', { class: 'stage' }, cityHost, cityEvents, tools, legend, loading, cutscene, issue),
    tooltip,
    titleLayer,
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

  function closeIssue(): void {
    issueOpen = false;
    render();
  }

  const newGame = (seed = randomSeed(), mode: GameMode = 'destroy') => {
    hasGame = true;
    c = withDifficulty(base, settings.difficulty, mode);
    reporterBar.c = c;
    state = createGame(c, seed, mode, settings.difficulty);
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

  const endTurn = () => {
    const decision: Decision = { publish: [] };
    for (const card of state.hand) {
      const d = draftOf(card);
      if (d.publish) decision.publish.push({ cardUid: card.uid, placement: d.placement, distortion: d.distortion });
    }
    try {
      report = playTurn(state, c, decision);
      error = '';
      drafts = new Map();
      details.clear();
      // The exposure and reconciliation notices wait for the start of the next turn.
      exposuresSeen = true;
      reconcileSeen = true;
      issueOpen = false;
      busy = true;
      scene?.setState(state, true);
      render();
      // Let the city react first (CONCEPT.md §7.3), show the day's bright moments if there were
      // any, then reporters look for the next stories.
      const highlights = report.highlights;
      window.setTimeout(async () => {
        if (highlights.length && scene && !settings.skipCutscenes) await playCutscene(highlights);
        if (state.outcome) {
          busy = false;
          render();
        } else void runSearch();
      }, REACTION_SECONDS * 1000);
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
  ): HTMLElement {
    return h(
      onclick ? 'button' : 'div',
      { class: `res ${cls}${onclick ? ' clickable' : ''}`, title: `${label}. ${hint}`, onclick },
      // Icon, the value with yesterday's change, and a caption under it (CONCEPT.md §7.3).
      h('img', { class: 'res-icon', src: `${assetBase}sprites/ui/${icon}.png`, alt: '', width: 32, height: 32 }),
      h('b', {}, value, deltaTag(delta, unit)),
      h('span', { class: 'res-label' }, label.toLowerCase()),
    );
  }

  /** Top panel: four resources with icons (CONCEPT.md §7.3); everything else lives in the debug menu. */
  function renderHud(): void {
    const trust = averageTrust(state, c);
    const r = report;
    hudRes.replaceChildren(
      resource(
        'money',
        'Деньги',
        `${state.money}`,
        r ? r.moneyDelta : null,
        `Расходы: ${totalUpkeep(state, c)} за ход. Нажмите — доходы и расходы.`,
        state.money < 0 ? 'bad' : '',
        '',
        () => openModal('money'),
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
      ),
    );
    // While the issue is open: its level and «В печать»; folded: «Выпуск» brings it back.
    const publishing = issueOpen && !state.outcome;
    hudActions.replaceChildren(
      publishing ? publishButton() : h('button', { class: 'primary issue-btn', onclick: () => ((issueOpen = true), render()) }, 'Выпуск'),
    );
  }

  /**
   * «В печать» shows what issue is going out: its icon and level, and the button looks duller or
   * louder by level, like story tier labels (CONCEPT.md §7.3). It bumps when the level changes.
   */
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
      { class: `publish level-${level}${levelBump ? ` ${levelBump}` : ''}`, title: hint, onclick: endTurn, disabled },
      h('img', { src: `${assetBase}sprites/ui/issue_${level}.png`, alt: '', width: 24, height: 24 }),
      h('span', {}, 'В печать · ', h('b', {}, level === 3 ? 'СЕНСАЦИЯ!' : issueLevelLabels[level])),
      h('span', { 'aria-hidden': 'true' }, '▸'),
    );
  }

  function renderCityEvents(): void {
    const rec = state.reconciliation;
    cityEvents.replaceChildren(
      h('div', { class: 'day' }, `День ${state.turn}`),
      ...state.todayEvents.map((e) => h('div', { class: 'event' }, `• ${e}`)),
      ...(rec ? [h('div', { class: 'event peace' }, `☮ Примирение: ${pairNames(rec.pair, ' и ')} · ещё ${rec.turnsLeft} ${turnsWord(rec.turnsLeft)}`)] : []),
    );
  }

  const pairNames = (key: string, sep: string) =>
    pairOf(key)
      .map((g) => groupOf(c, g).name.toLowerCase())
      .join(sep);
  const turnsWord = (n: number) => (n === 1 ? 'ход' : n < 5 ? 'хода' : 'ходов');
  const peopleWord = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? 'человека' : 'человек');

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
        return state.buildings[e.building ?? -1]?.open === false ? `${place} закрылся — остал${p.female ? 'ась' : 'ся'} без работы` : `потерял${a} работу (${lowerFirst(place)})`;
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
          ...st.levelUps.map((id) => `${reporterOf(c, id).name} набирается опыта: пишет лучше и находит больше.`),
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
    staffNotice.replaceChildren(
      h(
        'div',
        { class: 'notice-head' },
        h('b', {}, 'Редакция'),
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
      ...notes.map((t) => h('p', { class: 'notice-note' }, t)),
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
            choose();
          }),
        },
        h('span', { class: 'check' }, current ? '✓' : ''),
        ...content,
      );
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
        title: `${toneOf(card, d.distortion)} (${truthLabels[p.truth].toLowerCase()}) — изменить подачу`,
        'aria-haspopup': 'menu',
        'aria-expanded': String(menuOpen),
        disabled: busy,
        onclick: act(() => {
          truthMenuFor = menuOpen ? null : card.uid;
          selected = null;
        }),
      },
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
    const option = (dist: number, icon: Node, blockedHint: string | null) => {
      const preview = previewPublication(state, c, mods, { cardUid: card.uid, placement: d.placement, distortion: dist });
      const steps = preview.tier - card.tier;
      const stats = `${truthLabels[preview.truth]} · ${tierLabels[preview.tier]}${steps > 0 ? ` ${'↑'.repeat(steps)}` : steps < 0 ? ` ${'↓'.repeat(-steps)}` : ''} · риск ${Math.round(preview.exposureRisk * 100)}%`;
      return menuItem(
        d.distortion === dist,
        !!blockedHint,
        () => (d.distortion = dist),
        icon,
        h(
          'span',
          { class: 'opt' },
          h('span', { class: 'opt-head' }, h('b', {}, toneOf(card, dist)), h('small', {}, blockedHint ?? stats)),
          h('span', { class: 'opt-title' }, `«${preview.title}»`),
        ),
      );
    };
    const steps: number[] = [];
    for (let dist = minDistortion(card); dist <= maxDistortion(card); dist++) steps.push(dist);
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
    const tierLabel = h(
      'span',
      { class: `tier-label t${tier}`, title: raised ? `Было: ${tierLabels[card.tier].toLowerCase()} — уровень поднят искажением` : `${tierLabels[tier]} новость` },
      raised ? `${tierLabels[tier]} ↑` : tierLabels[tier],
    );
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
    const cls = ['news', `at-${where}`, `truth-${p.truth}`, `tier-${tier}`, investigation ? 'investigation' : '', selected === card.uid ? 'selected' : '']
      .filter(Boolean)
      .join(' ');
    const children: (HTMLElement | null)[] = [
      investigation ? h('div', { class: 'kicker' }, `Расследование · эксклюзив · ${target.toLowerCase()}`) : null,
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
      // Which of the town's bars or shops the story is about.
      card.building !== undefined && state.buildings[card.building] && buildingDefOf(c, state.buildings[card.building].type).names
        ? h('div', { class: 'kicker place-kicker' }, buildingName(state, c, card.building))
        : null,
      h(
        'div',
        { class: 'news-head' },
        // The controls sit in a row above the headline: level, truth, and «✕» on the right.
        h('div', { class: 'head-tools' }, tierLabel, truthButton, outButton),
        h('h3', { class: 'headline' }, p.title),
        truthMenu,
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
            'i',
          ),
        ),
        info,
      ),
    ];
    return { cls, children: children.filter((x): x is HTMLElement => x !== null) };
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
        h('span', { class: `tier-label t${p.tier}` }, tierLabels[p.tier]),
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

    const note = searching ? 'Репортёры ищут новости… (щёлкните, чтобы пропустить)' : !visible.length ? 'Сегодня новостей нет.' : '';
    issueHead.replaceChildren(...(note ? [h('p', {}, note)] : []), ...(error ? [h('p', { class: 'bad' }, error)] : []));
    issueNo.textContent = `Выпуск № ${state.turn}`;
    renderPrice();

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
      left ? '' : h('span', { class: 'tray-hint' }, 'перетащите сюда новость или нажмите ✕'),
    );
    for (const key of [2, 1, 0, 'out'] as const) {
      const here = ordered.filter((card) => whereOf(card) === key);
      zones[key].empty.hidden = here.length > 0 || key === 'out';
      zones[key].root.classList.toggle('here', !!picked && whereOf(picked) === key);
      for (const card of here) {
        const { cls, children } = newsContent(card, mods, key);
        let el = cardEls.get(card.uid);
        const isNew = !el;
        if (!el) {
          el = h('article', { 'data-uid': String(card.uid), tabindex: '0' });
          const self = el;
          el.addEventListener('pointerdown', (e) => startDrag(e, card, self));
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
    const row = (id: string, price: string, action: HTMLElement) => {
      const r = reporterOf(c, id);
      return h(
        'div',
        { class: 'shop-item reporter-item' },
        portrait(id),
        h(
          'div',
          {},
          h('strong', {}, r.name),
          h('p', {}, r.bio),
          h('p', {}, skillLine(c, state, r)),
          h('p', {}, `${topicLine(r)} · ${price}`),
          state.reporters.includes(id) ? h('p', { class: 'hint' }, characterLine(c, state, r)) : r.tie ? h('p', { class: 'hint' }, r.tie.text) : null,
        ),
        action,
      );
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
    const canCall = !full && pool > 0 && state.money >= b.agencyFee && !state.outcome;
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
          : `За ${b.agencyFee} агентство подберёт одного или двух случайных репортёров. У каждого своя цена найма и своя зарплата. Предложение действует до конца хода.`,
      ),
      ...state.agencyOffer.map((id) => {
        const r = reporterOf(c, id);
        return row(
          id,
          `найм ${r.hireCost} · зарплата ${r.salary}/ход`,
          h(
            'button',
            { class: state.money >= r.hireCost ? 'primary' : '', disabled: full || state.money < r.hireCost || !!state.outcome, onclick: act(() => hireFromAgency(state, c, id)) },
            `Нанять (−${r.hireCost})`,
          ),
        );
      }),
      h(
        'button',
        { class: state.agencyOffer.length ? '' : 'primary', disabled: !canCall, onclick: act(() => callAgency(state, c)) },
        state.agencyOffer.length ? `Искать других (−${b.agencyFee})` : `Найти репортёров (−${b.agencyFee})`,
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
  function shopContent(): HTMLElement[] {
    const options = new Map(listPurchases(state, c).map((o) => [o.id, o]));
    const item = (u: UpgradeDef, series?: UpgradeDef[]) => {
      const o = options.get(u.id);
      const owned = !o;
      const done = series ? series.filter((x) => state.upgrades.includes(x.id)).length : 0;
      const pips = series ? h('span', { class: 'pips' }, ...series.map((x) => h('span', { class: state.upgrades.includes(x.id) ? 'on' : '' }))) : null;
      return h(
        'div',
        { class: `shop-item${o && !o.unlocked ? ' locked' : ''}${owned ? ' owned' : ''}` },
        h(
          'div',
          {},
          h('strong', {}, series ? `${seriesNames[u.series!] ?? u.name} ${done}/${series.length}` : u.name, pips),
          h('p', {}, owned ? (series ? 'Все точки открыты.' : u.description) : series ? `Следующий: ${u.name}. ${u.description}` : u.description),
          o && !o.unlocked ? h('p', { class: 'req' }, requirementText(u.requires)) : null,
        ),
        owned
          ? h('span', { class: 'owned-mark' }, '✓')
          : h('button', { class: o!.affordable ? 'primary' : '', disabled: !o!.affordable || !!state.outcome, onclick: () => buy(u.id) }, `${o!.cost}`),
      );
    };
    const sections = new Map<string, HTMLElement[]>();
    const seen = new Set<string>();
    for (const u of c.upgrades) {
      if (u.series) {
        if (seen.has(u.series)) continue;
        seen.add(u.series);
        const series = c.upgrades.filter((x) => x.series === u.series);
        const next = series.find((x) => !state.upgrades.includes(x.id)) ?? series[series.length - 1];
        sections.set(u.section ?? '', [...(sections.get(u.section ?? '') ?? []), item(next, series)]);
      } else sections.set(u.section ?? '', [...(sections.get(u.section ?? '') ?? []), item(u)]);
    }
    return [
      h('p', { class: 'hint' }, `У вас ${state.money}. Расходы: ${totalUpkeep(state, c)} за ход. Улучшения оплачиваются сразу и действуют до конца партии.`),
      ...(error ? [h('p', { class: 'bad' }, error)] : []),
      ...[...sections].flatMap(([name, items]) => [...(name ? [h('h3', { class: 'section' }, name)] : []), ...items]),
    ];
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
      doubted: 'не поверили новости',
      boring: 'выпуск их не зацепил',
      empty: 'выпуска не было',
      price: 'цена им не по карману или кажется высокой',
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
    ];
    if (r) {
      const loss = r.exposures.reduce((s, x) => s + x.trustLoss, 0);
      const delta = r.trustAfter - r.trustBefore;
      out.push(
        h('h3', { class: 'section' }, `Прошлый ход (${r.turn})`),
        ...r.exposures.map((x) => ledgerRow(`Разоблачено: «${x.title}»`, -Math.round(x.trustLoss * 10) / 10, `выпуск дня ${x.turn}`, '%')),
        ledgerRow('Правдивые новости и прочее', Math.round((delta + loss) * 10) / 10, '', '%'),
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
          h('p', {}, `${truthLabels[p.truth]}, ${placementLabels[p.placement].toLowerCase()}. Увидели ${p.reached}, поверили ${p.believed}, не поверили ${p.doubted}, пересказали ${p.wordOfMouth}.`),
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
    const head = h(
      'div',
      { class: 'shop-item reporter-item' },
      portrait(id),
      h('div', {}, h('strong', {}, r.name), h('p', {}, r.bio), h('p', {}, skillLine(c, state, r)), h('p', { class: 'hint' }, characterLine(c, state, r))),
    );
    const errorLine = error ? [h('p', { class: 'bad' }, error)] : [];
    // Search topics (CONCEPT.md §3.3): the reporter is sent after them and brings them more often.
    const assigned = state.reporterTopics[id] ?? [];
    const topics = Object.keys(topicLabels) as Topic[];
    const chip = (label: string, on: boolean, pick: () => void, title = '') =>
      h('button', { class: `chip${on ? ' on' : ''}`, 'aria-pressed': String(on), title, disabled: !!state.outcome, onclick: act(pick) }, label);
    const topicSection = [
      h('h3', { class: 'section' }, 'Темы поиска'),
      h(
        'div',
        { class: 'chips' },
        chip('Любые', assigned.length === 0, () => setReporterTopics(state, c, id, [])),
        ...topics.map((t) => {
          const special = r.skills.topics.includes(t);
          const on = assigned.includes(t);
          return chip(
            `${special ? '★ ' : ''}${topicLabels[t]}`,
            on,
            () => setReporterTopics(state, c, id, on ? assigned.filter((x) => x !== t) : [...assigned, t]),
            special ? 'Специальность репортёра' : '',
          );
        }),
      ),
      h(
        'p',
        { class: 'hint' },
        `С шансом ${pct(b.assignFocus)} репортёр приносит новость на выбранные темы. ★ — его специальность: если все выбранные темы из них, удача +${pct(b.specialtyLuck)}.` +
          (onSpecialty(state, r) ? ' Сейчас он работает по специальности.' : ''),
      ),
    ];
    // Save mode: watching the rival paper instead of the topics (CONCEPT.md §8).
    if (state.rival && !state.rival.closed) {
      const watching = state.rivalWatch.includes(id);
      topicSection.push(
        h('h3', { class: 'section' }, `«${rivalNames[state.rival.kind].name}»`),
        h('div', { class: 'chips' }, chip(`Следить за «${rivalNames[state.rival.kind].ins}»`, watching, () => setRivalWatch(state, id, !watching))),
        h(
          'p',
          { class: 'hint' },
          `Следящий репортёр с шансом ${pct(b.assignFocus)} приносит опровержение свежей лжи «${rivalNames[state.rival.kind].gen}» вместо обычной новости; остальные находят его случайно, с шансом ${pct(b.debunkFindChance)}.`,
        ),
      );
    }
    if (inv) {
      const done = inv.total - inv.turnsLeft;
      return [
        head,
        ...errorLine,
        ...topicSection,
        h('h3', { class: 'section' }, 'Расследование'),
        h('p', {}, `Копает грязь на группу «${groupOf(c, inv.target).name}». Осталось ходов: ${inv.turnsLeft} из ${inv.total}.`),
        meter(done / inv.total, 'warn'),
        h('p', { class: 'hint' }, `Пока идёт расследование, репортёр не ищет обычные новости, а редакция тратит ${b.investigationCost} за ход.`),
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
      h('h3', { class: 'section' }, 'Расследование'),
      h(
        'p',
        {},
        `Поручите найти компромат на социальную группу. Займёт ${turns} хода и ${b.investigationCost} денег за каждый ход — всё это время репортёр не приносит обычных новостей. ` +
          `Итог — эксклюзив: сенсация с шансом ${pct(sensation)}, правда с шансом ${pct(truth)} (иначе полуправда).`,
      ),
      h('p', { class: 'hint' }, 'Поверившие из других групп злятся и выходят на протест, а сама группа чувствует травлю и уезжает — даже те, кто вас не читает.'),
      h('h3', { class: 'section' }, 'На кого копать'),
      ...c.groups.map((g) => {
        const active = state.residents.filter((x) => x.status === 'active' && x.group === g.id).length;
        return h(
          'div',
          { class: 'shop-item' },
          h('div', {}, h('strong', {}, g.name), h('p', {}, `Жителей: ${active}`)),
          h('button', { class: 'primary', disabled: !!state.outcome, onclick: act(() => startInvestigation(state, c, id, g.id)) }, 'Копать'),
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
      pause: 'Меню',
      howto: 'Как играть',
      settings: 'Настройки',
      about: 'Об игре',
      newgame: 'Новая игра',
    };
    const body =
      modal === 'report' ? reportContent() : modal === 'debug' ? debugContent() : modal === 'city' ? cityContent() : modal === 'population' ? populationContent() : modal === 'money' ? moneyContent() : modal === 'readers' ? readersContent() : modal === 'reputation' ? reputationContent() : modal === 'investigate' ? investigateContent() : modal === 'pause' ? pauseContent() : modal === 'howto' ? howtoContent() : modal === 'settings' ? settingsContent() : modal === 'about' ? aboutContent() : modal === 'newgame' ? newGameContent() : modal === 'team' ? teamContent() : shopContent();
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

  function renderOutcome(): void {
    if (!state.outcome || busy) {
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
        h(
          'div',
          { class: 'outcome-actions' },
          state.outcome.result === 'win'
            ? h('button', { class: 'primary big', onclick: () => void startGame(state.mode) }, 'Следующий город ▸')
            : h('button', { class: 'primary big', onclick: () => openModal('newgame') }, 'Новая игра'),
          h('button', { onclick: () => showTitle() }, 'Главное меню'),
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
    renderCityEvents();
    renderIssue();
    renderExposures();
    renderReconcile();
    renderStaff();
    renderLetters();
    renderOffer();
    renderRival();
    renderModal();
    renderOutcome();
    renderTitle();
    saveSoon();
  }
  // ---------- Menus (CONCEPT.md §7.3 «Меню») ----------

  /** Title screen over the live city: continue, new game, how to play, settings, about. */
  function renderTitle(): void {
    titleLayer.hidden = !titleOpen;
    root.classList.toggle('at-title', titleOpen);
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
          // A running game is not thrown away without asking.
          item('Новая игра', () => openModal('newgame'), hasGame && !state.outcome ? '' : 'primary'),
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
  async function startGame(mode: GameMode = 'destroy', seed?: number): Promise<void> {
    modal = null;
    titleOpen = false;
    render();
    if (!(mode === 'save' ? settings.introSeenSave : settings.introSeen)) await watchIntro(mode);
    scene?.stopTour();
    newGame(seed, mode);
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
        item('Новая игра', () => openModal('newgame')),
        item('Главное меню', () => showTitle()),
        debugMode ? item('Отладка', () => openModal('debug'), 'ghost') : null,
      ),
      hasGame ? h('p', { class: 'hint pause-difficulty' }, `Сложность: ${base.difficulties.find((d) => d.id === state.difficulty)?.name ?? ''}`) : null,
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
      );
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
    return [
      ...(hasGame && !state.outcome ? [h('p', { class: 'bad' }, 'Текущая партия будет потеряна.')] : []),
      levels,
      h(
        'div',
        { class: 'mode-cards' },
        card('destroy', 'goal', 'Разрушить город', 'Вы — редактор газеты холдинга «Медиа-Плюс». Пугайте, стравливайте и врите, пока город не опустеет. Мешать будет честный «Голос города».'),
        card('save', 'defend', 'Спасти город', 'Вы — последняя честная газета. «Вечерний Набат» холдинга пугает город — опровергайте его и не дайте городу пасть.'),
      ),
      h('button', { class: 'ghost', onclick: () => openModal(titleOpen ? null : 'pause') }, '← Назад'),
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
    return [
      h('h3', { class: 'section' }, 'Анимации'),
      toggle('Быстрый поиск', 'находки репортёров появляются сразу, без анимации', 'fastSearch'),
      toggle('Без роликов дня', 'не показывать драки, протесты и другие яркие события перед выпуском', 'skipCutscenes'),
      h('h3', { class: 'section' }, 'Вступление'),
      h('button', { onclick: () => void watchIntro() }, 'Посмотреть вступление ещё раз'),
      h('button', { class: 'ghost', onclick: () => openModal(titleOpen ? null : 'pause') }, '← Назад'),
    ];
  }

  /** A short rulebook with the game's own icons. */
  function howtoContent(): HTMLElement[] {
    const b = c.balance;
    const block = (icon: string, title: string, text: string) =>
      h(
        'div',
        { class: 'howto-block' },
        h('img', { src: `${assetBase}sprites/${icon}.png`, alt: '', width: 32, height: 32 }),
        h('div', {}, h('b', {}, title), h('p', {}, text)),
      );
    return [
      block('ui/city', 'Цель', `«Разрушить город»: за ${b.turnLimit} дней доведите город до стадии «${stageBelow(b.winCityIndex)}». Или закройте «Голос города» — честную газету, которая успокаивает людей и опровергает вашу ложь. Проигрыш — банкротство, потеря репутации или конец срока.`),
      block('ui/rival', 'Спасти город', `Продержитесь ${b.turnLimit} дней, не дав городу скатиться в «${stageBelow(b.saveLoseIndex)}», или закройте «Вечерний Набат». Что он напечатал, видно над газетой; опровержения его свежей лжи приносят репортёры — особенно тот, кого отправили следить за «Набатом».`),
      block('ui/readers', 'Ход', 'Репортёры приносят новости — события дня всегда, остальное как повезёт. Разложите выпуск: первая полоса, статья, заметки — и отправьте в печать.'),
      block('ui/truth_1', 'Правда и ложь', 'Подачу новости выбирают в плашке над заголовком: «Всё хорошо!», «Без паники», «Как есть», «Это неспроста», «Всё пропало!». Чем дальше от правды, тем выше риск разоблачения; вверх — громче, вниз — тише.'),
      block('ui/reputation', 'Репутация', 'Правда её поднимает, разоблачённая ложь обрушивает. Высокая репутация — вам верят и реже проверяют.'),
      block('ui/money', 'Деньги и читатели', 'Читатели покупают газету каждый ход. Скучный выпуск их распугивает, интересный — приводит новых. На деньги нанимайте репортёров и улучшайте газету: киоски, цветная печать, новые рубрики.'),
      block('groups/workers', 'Стравливайте группы', 'Конфликтные новости можно подогреть или успокоить. Вражда групп бьёт по городу сильнее всего; когда станет совсем жарко, вмешается мэрия.'),
      block('ui/issue_3', 'Уровень выпуска', 'Кнопка «В печать» показывает, каким выйдет номер. Сенсация на первой полосе — сенсационный выпуск.'),
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
    writeSave<Draft>({ state, report, drafts: [...drafts] });
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
