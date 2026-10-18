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
  const issueCards = h('div', { class: 'issue-cards' });
  const issueFoot = h('div', { class: 'issue-foot' });
  const issue = h('div', { class: 'issue' }, h('div', { class: 'issue-panel' }, issueHead, issueCards, issueFoot));
  issue.addEventListener('click', (e) => {
    if (searching) skip();
    else if (e.target === issue) closeIssue();
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
   * Puts a card at a placement. When that placement is full, the card holding it (the weakest one
   * if there are several) moves to this card's old place.
   */
  function place(card: CardInstance, to: Placement): void {
    const d = draftOf(card);
    if (d.placement === to) return;
    const mods = getModifiers(state, c);
    const holders = state.hand.filter((x) => x.uid !== card.uid && drafts.get(x.uid)?.publish && drafts.get(x.uid)!.placement === to);
    if (holders.length >= placementSlots(mods)[to]) {
      const weakest = holders.sort((a, b) => impactOf(a, mods) - impactOf(b, mods))[0];
      drafts.get(weakest.uid)!.placement = d.placement;
    }
    d.placement = to;
    d.publish = true;
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
    if (!t) {
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

  /** Builds the content of a news card; the root element is reused between renders. */
  function cardContent(card: CardInstance, mods: Modifiers): { cls: string; children: Node[] } {
    const tpl = templateOf(c, card.templateId);
    const d = draftOf(card);
    const p = previewPublication(state, c, mods, { cardUid: card.uid, placement: d.placement, distortion: d.distortion });
    const audience = tpl.audience?.length ? tpl.audience.map((g) => groupOf(c, g).name.toLowerCase()).join(', ') : 'все жители';
    // Who holds the limited places now: picking one moves that story to this card's old place.
    const holderOf = (to: Placement) =>
      state.hand.find((x) => x.uid !== card.uid && drafts.get(x.uid)?.publish && drafts.get(x.uid)!.placement === to);
    const investigation = tpl.source === 'investigation';
    const target = tpl.target ? groupOf(c, tpl.target).name : '';
    const update = (patch: Partial<Draft>) => {
      Object.assign(d, patch);
      render();
    };
    const open = details.has(card.uid);
    /** Row of three icon buttons; the chosen one is pressed. */
    const iconRow = (label: string, buttons: { icon: string; title: string; on: boolean; disabled: boolean; pick: () => void }[]) =>
      h(
        'div',
        { class: 'icon-row', role: 'group', 'aria-label': label },
        ...buttons.map((x) =>
          h(
            'button',
            {
              class: `icon-choice${x.on ? ' on' : ''}`,
              title: x.title,
              'aria-pressed': String(x.on),
              disabled: x.disabled || busy,
              onclick: x.pick,
            },
            h('img', { src: `${assetBase}sprites/ui/${x.icon}.png`, alt: x.title, width: 32, height: 32 }),
          ),
        ),
      );
    // Distortion as the truth level it leads to: a story can only be made less true.
    const truthButtons = ([0, 1, 2] as const).map((t) => {
      const dist = t - card.baseTruth;
      return {
        icon: `truth_${t}`,
        title: `${truthLabels[t]} — ${dist <= 0 ? distortionLabels[0].toLowerCase() : distortionLabels[t].toLowerCase()}`,
        on: d.distortion === dist,
        disabled: dist < 0 || dist > maxDistortion(card),
        pick: () => update({ distortion: dist }),
      };
    });
    const placeButtons = ([0, 1, 2] as const).map((i) => {
      const holder = i > 0 && d.placement !== i ? holderOf(i) : undefined;
      const moved = holder ? ` Сейчас там «${templateOf(c, holder.templateId).titles[holder.baseTruth]}» — она перейдёт на место этой.` : '';
      return {
        icon: `place_${i}`,
        title: `${placementLabels[i]}. ${placementNote(i)}${moved}`,
        on: d.placement === i,
        disabled: false,
        pick: () => {
          place(card, i);
          render();
        },
      };
    });
    const reporter = reporterOf(c, card.reporterId);
    // Distortion raises the tier, and the card restyles itself at once (CONCEPT.md §3.1).
    const tier = p.tier;
    const raised = tier > card.tier;
    const cls = [
      'card',
      `truth-${p.truth}`,
      `tier-${tier}`,
      `scope-${card.scope}`,
      `place-${d.placement}`,
      investigation ? 'investigation' : '',
      d.publish ? 'selected' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const sourceLabel = { event: 'событие', fact: 'факт', rumor: 'слух', investigation: `о группе: ${target.toLowerCase()}` }[tpl.source];
    const children: (HTMLElement | null)[] = [
      tier === 3 && !investigation ? h('div', { class: 'ribbon' }, 'СЕНСАЦИЯ') : null,
      investigation ? h('div', { class: 'inv-band' }, 'РАССЛЕДОВАНИЕ', h('span', {}, truthLabels[p.truth].toLowerCase())) : null,
      h(
        'div',
        { class: 'card-band' },
        h('b', {}, investigation ? `ГРЯЗЬ: ${target.toUpperCase()}` : truthLabels[p.truth].toUpperCase()),
        h('span', {}, `${topicLabels[tpl.topic]} · ${sourceLabel}`),
      ),
      h(
        'div',
        { class: 'card-art' },
        h('img', { src: `${assetBase}sprites/news/${tpl.id}.png`, alt: '', width: 256, height: 144 }),
        investigation ? h('div', { class: 'stamp exclusive' }, 'ЭКСКЛЮЗИВ') : tier === 2 ? h('div', { class: 'stamp' }, 'Интересно') : null,
        // Details cover the illustration so the card keeps its size (CONCEPT.md §7.3).
        open
          ? h(
              'div',
              { class: 'card-details' },
              h('p', { class: 'audience' }, `Аудитория: ${audience}`),
              h(
                'div',
                { class: 'card-stat', title: 'Насколько сильно поверившие отреагируют: уровень, место в газете, масштаб, аудитория' },
                h('span', {}, 'Воздействие'),
                meter(p.impact / 2.5, p.impact >= 1.4 ? 'danger' : 'ok'),
                h('em', {}, `×${p.impact.toFixed(1)}`),
              ),
              bar('Охват города', p.reachChance),
              bar('Риск разоблачения', p.exposureRisk, p.exposureRisk > 0.2 ? 'danger' : 'warn'),
            )
          : null,
      ),
      h(
        'div',
        { class: 'card-meta' },
        h(
          'span',
          { class: `tier-tag t${tier}`, title: raised ? `Было: ${tierLabels[card.tier].toLowerCase()} — уровень поднят искажением` : '' },
          raised ? `${tierLabels[tier]} ↑` : tierLabels[tier],
        ),
        h('span', { class: `scope-tag ${card.scope}` }, scopeLabels[card.scope]),
        h('span', { class: 'by' }, portrait(reporter.id, 'mini-portrait'), reporter.name),
        h(
          'button',
          {
            class: `info-btn${open ? ' on' : ''}`,
            title: 'Воздействие, охват и риск разоблачения',
            'aria-expanded': String(open),
            onclick: () => {
              if (open) details.delete(card.uid);
              else details.add(card.uid);
              render();
            },
          },
          'i',
        ),
      ),
      h('h3', { class: 'headline' }, p.title),
      h('p', { class: 'effect' }, effectText(c, p.effect, tpl.target)),
      h('div', { class: 'controls' }, iconRow('Искажение', truthButtons), iconRow('Подача', placeButtons)),
      h(
        'button',
        {
          class: `pick${d.publish ? ' primary' : ''}`,
          disabled: busy,
          onclick: () => {
            // A story taken back into the issue does not push anyone out: if its place is taken, it becomes a brief.
            const taken = !d.publish && d.placement > 0 && holderOf(d.placement) !== undefined;
            update({ publish: !d.publish, ...(taken ? { placement: 0 as Placement } : {}) });
          },
        },
        d.publish ? 'В выпуске ✓' : 'В выпуск',
      ),
    ];
    return { cls, children: children.filter((x): x is HTMLElement => x !== null) };
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
    issueHead.replaceChildren(h('h2', {}, `Выпуск дня ${state.turn}`), ...(note ? [h('p', {}, note)] : []));

    for (const [uid, el] of cardEls) {
      if (!visible.some((x) => x.uid === uid)) {
        el.remove();
        cardEls.delete(uid);
      }
    }
    for (const card of visible) {
      const { cls, children } = cardContent(card, mods);
      let el = cardEls.get(card.uid);
      const isNew = !el;
      if (!el) {
        el = h('article', {});
        cardEls.set(card.uid, el);
        issueCards.append(el);
      }
      const extra = [...el.classList].filter((x) => x === 'flying' || x === 'landed');
      el.className = [cls, ...extra].join(' ');
      el.replaceChildren(...children);
      if (isNew) {
        if (flyQueue.delete(card.uid) && issueOpen) fly(el, card);
        else el.classList.add('landed');
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
