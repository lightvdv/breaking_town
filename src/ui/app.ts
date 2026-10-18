import { CityScene, REACTION_ICON, type HoverTarget } from '../render/scene';
import {
  averageTrust,
  buildingDefOf,
  cancelInvestigation,
  channelOf,
  createGame,
  fireReporter,
  getModifiers,
  groupOf,
  investigationTurns,
  issueLevel,
  issueScore,
  effectiveTier,
  setReporterTopics,
  onSpecialty,
  listPurchases,
  maxDistortion,
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
  type NewsTier,
  type Reaction,
  type Requirement,
  type TurnReport,
} from '../sim';
import { h, pct } from './dom';
import { portrait, ReporterBar, skillLine, topicLine, type RepStatus } from './reporterBar';
import {
  distortionLabels,
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

type MenuKind = 'place' | 'truth';

type Modal = 'report' | 'debug' | 'city' | 'money' | 'readers' | 'reputation' | 'shop' | 'investigate' | null;

const REACTION_SECONDS = 2.6;
const assetBase = `${import.meta.env.BASE_URL}assets/`;

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

export function mountApp(root: HTMLElement, c: Content): void {
  let state: GameState = createGame(c, seedFromUrl());
  let drafts = new Map<number, Draft>();
  let report: TurnReport | null = null;
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
  /** Story and menu (placement or truth) that is open next to its headline. */
  let menuFor: { uid: number; kind: MenuKind } | null = null;

  // ---------- Persistent shell ----------
  const hud = h('header', { class: 'hud' });
  const reporterBar = new ReporterBar(
    c,
    () => openModal('shop', 'hire'),
    () => skip(),
    (id) => {
      investigator = id;
      error = '';
      openModal('investigate');
    },
  );
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
    out: ['Не войдёт в выпуск', 'Перетащите сюда новость, чтобы не печатать её — она сгорит'],
  };
  const makeZone = (key: ZoneKey) => {
    const items = h('div', { class: 'zone-items' });
    const empty = h('p', { class: 'zone-empty' }, zoneTexts[key][1]);
    const root = h('section', { class: `zone zone-${key}`, 'data-zone': String(key) }, h('h4', { class: 'zone-label' }, zoneTexts[key][0]), items, empty);
    return { root, items, empty };
  };
  const zones: Record<string, ReturnType<typeof makeZone>> = { 2: makeZone(2), 1: makeZone(1), 0: makeZone(0), out: makeZone('out') };
  const masthead = h('header', { class: 'masthead' });
  const paper = h('div', { class: 'paper' }, masthead, h('div', { class: 'paper-grid' }, zones[2].root, zones[1].root, zones[0].root));
  const issueFoot = h('div', { class: 'issue-foot' });
  const issue = h('div', { class: 'issue' }, h('div', { class: 'issue-panel' }, issueHead, paper, zones.out.root, issueFoot));
  issue.addEventListener('click', (e) => {
    if (searching) skip();
    else if (e.target === issue) closeIssue();
  });
  // A press anywhere else closes an open story menu.
  document.addEventListener('pointerdown', (e) => {
    if (menuFor === null || (e.target as Element).closest('.place-menu, .place-btn')) return;
    menuFor = null;
    render();
  });
  // Start-of-turn notice about exposed stories; hovering it shows the cards (CONCEPT.md §7.3).
  const exposureToast = h('div', { class: 'exposure-toast', hidden: true });
  const tooltip = h('div', { class: 'tooltip', hidden: true });
  const modalLayer = h('div', { class: 'modal-layer' });
  const outcomeLayer = h('div', { class: 'modal-layer' });
  root.replaceChildren(
    hud,
    reporterBar.el,
    h('main', { class: 'stage' }, cityHost, cityEvents, tools, legend, loading, issue, exposureToast),
    tooltip,
    modalLayer,
    outcomeLayer,
  );
  const cardEls = new Map<number, HTMLElement>();

  CityScene.create(cityHost, c, state, showTooltip)
    .then((s) => {
      scene = s;
      loading.remove();
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
    return card ? templateOf(c, card.templateId).titles[card.baseTruth] : null;
  };

  /** Reporters show one by one what they found; each found card flies from its reporter into the issue. */
  async function runSearch(): Promise<void> {
    const run = ++searchRun;
    const finds = [...state.lastFinds];
    searching = true;
    skipSearch = false;
    issueOpen = true;
    exposuresSeen = false;
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

  const newGame = () => {
    state = createGame(c, randomSeed());
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
      // The exposure notice waits for the start of the next turn.
      exposuresSeen = true;
      issueOpen = false;
      busy = true;
      scene?.setState(state, true);
      render();
      // Let the city react first (CONCEPT.md §7.3), then reporters look for the next stories.
      window.setTimeout(() => {
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

  // ---------- Tooltip ----------

  function showTooltip(t: HoverTarget | null): void {
    // The city is under the issue or a window: no hints over it then (CONCEPT.md §7.3).
    if (!t || issueOpen || modal) {
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
  function trend(delta: number | null, unit = ''): HTMLElement | null {
    if (delta === null || delta === 0) return null;
    const up = delta > 0;
    return h('span', { class: `trend ${up ? 'up' : 'down'}`, title: `${up ? '+' : ''}${delta}${unit} за ход` }, up ? '▲' : '▼');
  }

  function resource(
    icon: string,
    label: string,
    value: string,
    delta: number | null,
    hint: string,
    cls = '',
    unit = '',
    onclick?: () => void,
  ): HTMLElement {
    return h(
      onclick ? 'button' : 'div',
      { class: `res ${cls}${onclick ? ' clickable' : ''}`, title: `${label}. ${hint}`, onclick },
      h('img', { class: 'res-icon', src: `${assetBase}sprites/ui/${icon}.png`, alt: label, width: 32, height: 32 }),
      h('b', {}, value),
      trend(delta, unit),
    );
  }

  /** Top panel: four resources with icons (CONCEPT.md §7.3); everything else lives in the debug menu. */
  function renderHud(): void {
    const trust = averageTrust(state, c);
    const r = report;
    hud.replaceChildren(
      h('div', { class: 'brand' }, 'NEWS FIGHTS'),
      h(
        'div',
        { class: 'resources' },
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
          'city',
          'Индекс города',
          `${Math.round(state.metrics.cityIndex)}`,
          r ? Math.round(r.metricsAfter.cityIndex - r.metricsBefore.cityIndex) : null,
          `Насколько город жив. Для победы опустите ниже ${c.balance.winCityIndex}. Нажмите — подробности.`,
          '',
          '',
          () => openModal('city'),
        ),
      ),
      h(
        'div',
        { class: 'hud-buttons' },
        !issueOpen ? h('button', { class: 'primary', onclick: () => ((issueOpen = true), render()) }, 'Выпуск') : null,
        h('button', { onclick: () => openModal('shop') }, 'Покупки'),
        h('button', { class: 'icon-btn', title: 'Меню отладки', onclick: () => openModal('debug') }, '☰'),
      ),
    );
  }

  function renderCityEvents(): void {
    cityEvents.replaceChildren(
      h('div', { class: 'day' }, `День ${state.turn}`),
      ...state.todayEvents.map((e) => h('div', { class: 'event' }, `• ${e}`)),
    );
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

    const sourceLabel = { event: 'событие', fact: 'факт', rumor: 'слух', investigation: `компромат на группу «${target}»` }[tpl.source];
    // Two menu buttons next to the headline: placement (same moves as dragging) and truth (CONCEPT.md §7.3).
    const isOpen = (kind: MenuKind) => menuFor?.uid === card.uid && menuFor.kind === kind;
    const menuButton = (kind: MenuKind, cls: string, title: string, content: Node | string) =>
      h(
        'button',
        {
          class: `${cls}${isOpen(kind) ? ' on' : ''}`,
          title,
          'aria-haspopup': 'menu',
          'aria-expanded': String(isOpen(kind)),
          disabled: busy,
          onclick: act(() => (menuFor = isOpen(kind) ? null : { uid: card.uid, kind })),
        },
        content,
      );
    const menuItem = (current: boolean, disabled: boolean, pick: () => void, ...content: (Node | string)[]) =>
      h(
        'button',
        {
          role: 'menuitem',
          class: current ? 'current' : '',
          disabled: current || disabled,
          onclick: act(() => {
            menuFor = null;
            pick();
          }),
        },
        h('span', { class: 'check' }, current ? '✓' : ''),
        ...content,
      );
    const places: [Placement | 'out', string][] = [
      [2, 'На первую полосу'],
      [1, 'Статьёй'],
      [0, 'Заметкой'],
      ['out', 'Не печатать'],
    ];
    const placeButton = menuButton('place', 'place-btn', 'Куда поставить новость', '⇄');
    const placeMenu = isOpen('place')
      ? h(
          'div',
          { class: 'place-menu', role: 'menu' },
          ...places.map(([key, label]) => menuItem(where === key, false, () => (key === 'out' ? unpublish(card) : place(card, key)), label)),
        )
      : null;
    // Truth: the icon shows the current level; a story can only be made less true.
    const truthIcon = (t: number) => h('img', { src: `${assetBase}sprites/ui/truth_${t}.png`, alt: '', width: 16, height: 16 });
    const truthButton = menuButton('truth', 'place-btn truth-btn', `${truthLabels[p.truth]} — изменить правдивость`, truthIcon(p.truth));
    const truthMenu = isOpen('truth')
      ? h(
          'div',
          { class: 'place-menu truth-menu', role: 'menu' },
          ...([0, 1, 2] as const).map((t) => {
            const dist = t - card.baseTruth;
            const how = dist <= 0 ? distortionLabels[0] : distortionLabels[t];
            return menuItem(
              d.distortion === dist,
              dist < 0 || dist > maxDistortion(card),
              () => (d.distortion = dist),
              truthIcon(t),
              h('span', {}, truthLabels[t]),
              h('small', {}, dist < 0 ? 'правдивее не сделать' : how.toLowerCase()),
            );
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
          where !== 'out' ? h('p', { class: 'hint' }, placementNote(where)) : null,
        )
      : null;

    const withImage = where === 2 || where === 1;
    const cls = ['news', `at-${where}`, `truth-${p.truth}`, `tier-${tier}`, investigation ? 'investigation' : ''].filter(Boolean).join(' ');
    const children: (HTMLElement | null)[] = [
      investigation ? h('div', { class: 'kicker' }, `Расследование · эксклюзив · ${target.toLowerCase()}`) : null,
      h(
        'div',
        { class: 'news-head' },
        // The buttons float at the start of the headline, and its text wraps around them.
        h('span', { class: 'head-tools' }, placeButton, truthButton, tierLabel),
        h('h3', { class: 'headline' }, p.title),
        placeMenu,
        truthMenu,
      ),
      h(
        'div',
        { class: 'news-body' },
        withImage ? h('img', { class: 'news-art', src: `${assetBase}sprites/news/${tpl.id}.png`, alt: '', width: 256, height: 144 }) : null,
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
    // Near the top or bottom edge the issue scrolls by itself, so the tray is reachable.
    const autoScroll = () => {
      const box = issue.getBoundingClientRect();
      const edge = 70;
      const dy = last.y < box.top + edge ? -14 : last.y > box.bottom - edge ? 14 : 0;
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
      menuFor = null;
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
      if (!ghost) return;
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
    issueHead.replaceChildren(...(note ? [h('p', {}, note)] : []));
    masthead.replaceChildren(
      h('span', { 'aria-hidden': 'true' }),
      h('h2', {}, 'Городской Вестник'),
      h('span', { class: 'masthead-side' }, `Выпуск № ${state.turn}`),
    );

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
    for (const key of [2, 1, 0, 'out'] as const) {
      const here = ordered.filter((card) => whereOf(card) === key);
      zones[key].empty.hidden = here.length > 0;
      for (const card of here) {
        const { cls, children } = newsContent(card, mods, key);
        let el = cardEls.get(card.uid);
        const isNew = !el;
        if (!el) {
          el = h('article', { 'data-uid': String(card.uid) });
          const self = el;
          el.addEventListener('pointerdown', (e) => startDrag(e, card, self));
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

    issueFoot.replaceChildren(
      ...(error ? [h('span', { class: 'bad' }, error)] : []),
      ...(searching ? [] : [issueBadge()]),
      h('button', { class: 'ghost', onclick: closeIssue }, 'Свернуть'),
      h('button', { class: 'primary big', onclick: endTurn, disabled: busy || !!state.outcome }, searching ? 'Репортёры ищут…' : 'Опубликовать и завершить ход'),
    );
  }

  /** How interesting the issue being composed is: points of published stories against the thresholds (CONCEPT.md §4.2а). */
  function issueBadge(): HTMLElement {
    const b = c.balance;
    const tiers = state.hand.filter((x) => drafts.get(x.uid)?.publish).map((x) => effectiveTier(x, drafts.get(x.uid)!.distortion));
    const score = issueScore(c, tiers);
    const level = issueLevel(c, score);
    const next = (b.issueThresholds as number[])[level] as number | undefined;
    const hint =
      `${issueLevelLabels[level]} выпуск: ${score} очк. (скучная новость ${b.issueTierPoints[0]}, обычная ${b.issueTierPoints[1]}, ` +
      `интересная ${b.issueTierPoints[2]}, сенсация ${b.issueTierPoints[3]}).` +
      (next !== undefined ? ` До уровня «${issueLevelLabels[level + 1].toLowerCase()}» — ${next} очк.` : '') +
      (b.issueAcquisition[level] > 0 ? ` Новых читателей ×${b.issueAcquisition[level]}` : ' Новых читателей не будет') +
      `, равнодушные уходят с шансом ${pct(b.issueChurn[level])}` +
      (b.issueChurnBelievers[level] > 0 ? `, даже поверившие — ${pct(b.issueChurnBelievers[level])}.` : '.');
    return h(
      'span',
      { class: `issue-badge level-${level}`, title: hint },
      h('img', { src: `${assetBase}sprites/ui/issue_${level}.png`, alt: '', width: 32, height: 32 }),
      h('b', {}, issueLevelLabels[level]),
    );
  }

  /** Mini clipping of an exposed story: which issue it was in and what it cost. */
  function exposedCard(x: ExposedStory): HTMLElement {
    return h(
      'div',
      { class: `exposed-card truth-${x.truth}` },
      h('img', { src: `${assetBase}sprites/news/${x.templateId}.png`, alt: '', width: 128, height: 72 }),
      h(
        'div',
        {},
        h('b', { class: 'headline' }, x.title),
        h('span', {}, `${truthLabels[x.truth]} · Выпуск дня ${x.turn}, ${placementLabels[x.placement].toLowerCase()}`),
        h('span', { class: 'bad' }, `Репутация −${x.trustLoss.toFixed(1)}%`),
      ),
    );
  }

  function renderExposures(): void {
    const list = report?.exposures ?? [];
    exposureToast.hidden = !list.length || exposuresSeen;
    if (exposureToast.hidden) return;
    const loss = list.reduce((s, x) => s + x.trustLoss, 0);
    exposureToast.replaceChildren(
      h(
        'div',
        { class: 'toast-head' },
        h('img', { src: `${assetBase}sprites/fx/exposed.png`, alt: '', width: 24, height: 24 }),
        h('b', {}, list.length === 1 ? 'Новость разоблачили!' : `Разоблачили новостей: ${list.length}`),
        h('span', { class: 'bad' }, `−${loss.toFixed(1)}%`),
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
      h('div', { class: 'toast-cards' }, ...list.map(exposedCard)),
    );
  }

  // ---------- Modals ----------

  function reportersSection(): HTMLElement[] {
    const max = c.balance.maxReporters;
    const options = listPurchases(state, c).filter((o) => o.kind === 'reporter');
    const row = (id: string, action: HTMLElement) => {
      const r = reporterOf(c, id);
      return h(
        'div',
        { class: 'shop-item reporter-item' },
        portrait(id),
        h('div', {}, h('strong', {}, r.name), h('p', {}, r.bio), h('p', {}, skillLine(c, state, r)), h('p', {}, `${topicLine(r)} · зарплата ${r.salary}/ход`)),
        action,
      );
    };
    return [
      h('h3', { class: 'section', id: 'hire' }, `Репортёры (${state.reporters.length} / ${max})`),
      ...state.reporters.map((id) =>
        row(id, h('button', { class: 'ghost', disabled: state.reporters.length <= 1 || !!state.outcome, onclick: () => fire(id) }, 'Уволить')),
      ),
      ...(state.reporters.length >= max ? [h('p', { class: 'hint' }, 'Редакция полная. Чтобы нанять другого, кого-то придётся уволить.')] : []),
      ...options.map((o) =>
        row(o.id, h('button', { class: o.affordable ? 'primary' : '', disabled: !o.affordable || !!state.outcome, onclick: () => buy(o.id) }, `${o.cost}`)),
      ),
    ];
  }

  function requirementText(req: Requirement | null, channel?: string): string {
    const parts: string[] = [];
    if (req?.channel) parts.push(channelOf(c, req.channel).name);
    if (req?.upgrade) parts.push(c.upgrades.find((u) => u.id === req.upgrade)?.name ?? req.upgrade);
    if (channel && !state.ownedChannels.includes(channel)) parts.push(channelOf(c, channel).name);
    return parts.length ? `Нужно: ${parts.join(', ')}` : '';
  }

  function shopContent(): HTMLElement[] {
    const options = listPurchases(state, c);
    const item = (o: (typeof options)[number]) => {
      const channel = c.channels.find((x) => x.id === o.id);
      const upgrade = c.upgrades.find((x) => x.id === o.id);
      const req = channel ? requirementText(channel.requires) : requirementText(upgrade?.requires ?? null, upgrade?.effects.channel);
      return h(
        'div',
        { class: `shop-item${o.unlocked ? '' : ' locked'}` },
        h('div', {}, h('strong', {}, o.name), h('p', {}, o.description), !o.unlocked ? h('p', { class: 'req' }, req) : null),
        h('button', { class: o.affordable ? 'primary' : '', disabled: !o.affordable || !!state.outcome, onclick: () => buy(o.id) }, `${o.cost}`),
      );
    };
    const channels = options.filter((o) => o.kind === 'channel');
    const upgrades = options.filter((o) => o.kind === 'upgrade').sort((a, b) => Number(b.unlocked) - Number(a.unlocked));
    return [
      h('p', { class: 'hint' }, `У вас ${state.money}. Расходы (каналы и зарплаты): ${totalUpkeep(state, c)} за ход.`),
      ...(error ? [h('p', { class: 'bad' }, error)] : []),
      h('h3', { class: 'section' }, 'Улучшения'),
      ...upgrades.map(item),
      ...(channels.length ? [h('h3', { class: 'section' }, 'Каналы'), ...channels.map(item)] : []),
      ...reportersSection(),
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
        h('button', { onclick: newGame }, 'Новая игра'),
      ),
      h('h3', { class: 'section' }, 'Игра'),
      row('Ход', `${Math.min(state.turn, b.turnLimit)} / ${b.turnLimit}`),
      row('Сид города', `${state.seed}`),
      row('Индекс города', `${Math.round(m.cityIndex)} (победа < ${b.winCityIndex})`),
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
    const net = forecastIncome.reduce((s, x) => s + x.sum, 0) - items.reduce((s, x) => s + x.amount, 0);
    const out: (HTMLElement | null)[] = [
      h('div', { class: 'city-index' }, h('img', { src: `${assetBase}sprites/ui/money.png`, alt: '', width: 48, height: 48 }), h('div', {}, h('b', {}, `${state.money}`), h('span', {}, 'денег в кассе'))),
      state.brokeTurns > 0 ? h('p', { class: 'bad' }, `Касса в минусе ${state.brokeTurns} ход(а) из ${b.brokeTurnsLimit} допустимых — потом банкротство.`) : null,
      h('h3', { class: 'section' }, 'Ожидается в этом ходу'),
      ...forecastIncome.map((x) => ledgerRow(`Продажи: ${channelOf(c, x.ch).name}`, x.sum, `${x.buyers} чит. × ${channelOf(c, x.ch).adRate}`)),
      scandalNext < 1 ? h('p', { class: 'hint' }, `После скандала реклама приносит ×${scandalNext.toFixed(1)}, восстанавливается на ${b.scandalRecovery} за ход.`) : null,
      ...items.map((x) => ledgerRow(upkeepLabel(x), -x.amount)),
      ledgerTotal('Итого за ход', net),
    ];
    if (r) {
      out.push(
        h('h3', { class: 'section' }, `Прошлый ход (${r.turn})`),
        ...Object.entries(r.income).map(([ch, v]) => ledgerRow(`Продажи: ${channelOf(c, ch).name}`, v, `${r.buyers[ch] ?? 0} чит.`)),
        ...r.upkeepItems.map((x) => ledgerRow(upkeepLabel(x), -x.amount)),
        ledgerTotal('Итого', r.moneyDelta),
      );
    }
    out.push(h('p', { class: 'hint' }, 'Доход приносят постоянные читатели: каждый покупает выпуск. Покупки в магазине оплачиваются сразу.'));
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
    };
    const out: HTMLElement[] = [
      h('div', { class: 'city-index' }, h('img', { src: `${assetBase}sprites/ui/readers.png`, alt: '', width: 48, height: 48 }), h('div', {}, h('b', {}, `${readerCount(state)}`), h('span', {}, 'постоянных читателей'))),
      h('h3', { class: 'section' }, 'По каналам'),
      ...state.ownedChannels.map((ch) => countRow(channelOf(c, ch).name, followersOf(state, ch), `· ${channelOf(c, ch).adRate} денег с читателя`)),
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
        ...Object.entries(rd.gainedBy)
          .filter(([, v]) => v > 0)
          .map(([ch, v]) => h('div', { class: 'ledger-row sub' }, h('span', {}, `подписались: ${channelOf(c, ch).name}`), h('b', {}, `${v}`))),
        ledgerTotal('Итого', rd.after - rd.before),
      );
    }
    out.push(
      h(
        'p',
        { class: 'hint' },
        'Поверившие новости остаются. Уходят не поверившие и увидевшие разоблачение, а равнодушные — если выпуск скучный. Новых приводят каналы, улучшения охвата, репутация и интересный выпуск.',
      ),
    );
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
    out.push(h('p', { class: 'hint' }, 'Правда понемногу поднимает репутацию у тех, кто её видел; разоблачённая ложь резко роняет. Ноль — поражение.'));
    return out;
  }

  /** City window behind the city index tile: what the index is made of. */
  function cityContent(): HTMLElement[] {
    const m = state.metrics;
    const b = c.balance;
    const r = report;
    const delta = (after: number, before: number) => trend(Math.round((after - before) * 100), '%');
    const metric = (label: string, key: 'population' | 'employment' | 'economy' | 'mood' | 'order') =>
      h('div', { class: 'city-metric' }, bar(label, m[key]), r ? delta(r.metricsAfter[key], r.metricsBefore[key]) : null);
    return [
      h(
        'div',
        { class: 'city-index' },
        h('img', { src: `${assetBase}sprites/ui/city.png`, alt: '', width: 48, height: 48 }),
        h('div', {}, h('b', {}, `${Math.round(m.cityIndex)}`), h('span', {}, `Индекс города · победа ниже ${b.winCityIndex}`)),
      ),
      meter(m.cityIndex / 100, m.cityIndex < b.winCityIndex + 10 ? 'danger' : 'warn'),
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
      h('h3', { class: 'section' }, 'Из чего складывается индекс'),
      metric('Население', 'population'),
      metric('Занятость', 'employment'),
      metric('Экономика', 'economy'),
      metric('Настроение', 'mood'),
      metric('Порядок', 'order'),
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
          `Индекс города ${signed(Math.round(r.metricsAfter.cityIndex - r.metricsBefore.cityIndex))}, жителей ${signed(
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
      h('div', {}, h('strong', {}, r.name), h('p', {}, r.bio), h('p', {}, skillLine(c, state, r))),
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
      money: 'Деньги',
      readers: 'Читатели',
      reputation: 'Репутация',
      shop: 'Покупки',
      investigate: 'Репортёр',
    };
    const body =
      modal === 'report' ? reportContent() : modal === 'debug' ? debugContent() : modal === 'city' ? cityContent() : modal === 'money' ? moneyContent() : modal === 'readers' ? readersContent() : modal === 'reputation' ? reputationContent() : modal === 'investigate' ? investigateContent() : shopContent();
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
        h('p', {}, outcomeText(state.outcome)),
        h('p', { class: 'muted' }, `Сыграно ходов: ${Math.min(state.turn - 1, c.balance.turnLimit)}. Индекс города: ${Math.round(state.metrics.cityIndex)}.`),
        h('button', { class: 'primary big', onclick: newGame }, 'Новая игра'),
      ),
    );
  }

  function render(): void {
    layOutIssue();
    renderHud();
    reporterBar.render(state, repStatus, searching);
    renderCityEvents();
    renderIssue();
    renderExposures();
    renderModal();
    renderOutcome();
  }

  busy = true;
  void runSearch();
}
