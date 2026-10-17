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
  listPurchases,
  maxDistortion,
  playTurn,
  previewPublication,
  purchase,
  readerCount,
  reporterOf,
  startInvestigation,
  templateOf,
  totalUpkeep,
  type CardInstance,
  type Content,
  type Decision,
  type Placement,
  type GameState,
  type NewsTier,
  type Reaction,
  type Requirement,
  type TurnReport,
} from '../sim';
import { h, pct, select } from './dom';
import { portrait, ReporterBar, skillLine, topicLine, type RepStatus } from './reporterBar';
import {
  distortionLabels,
  effectLabels,
  effectText,
  placementLabels,
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

type Modal = 'report' | 'city' | 'shop' | 'investigate' | null;

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
  // Investigations are set apart above ordinary news (CONCEPT.md §7.3).
  const invCards = h('div', { class: 'issue-cards' });
  const invBlock = h('section', { class: 'investigations', hidden: true }, h('h3', {}, 'Расследования редакции'), invCards);
  const issueCards = h('div', { class: 'issue-cards' });
  const issueFoot = h('div', { class: 'issue-foot' });
  const issue = h('div', { class: 'issue' }, h('div', { class: 'issue-panel' }, issueHead, invBlock, issueCards, issueFoot));
  issue.addEventListener('click', (e) => {
    if (searching) skip();
    else if (e.target === issue) closeIssue();
  });
  const bottomBar = h('footer', { class: 'bottom-bar' });
  const tooltip = h('div', { class: 'tooltip', hidden: true });
  const modalLayer = h('div', { class: 'modal-layer' });
  const outcomeLayer = h('div', { class: 'modal-layer' });
  root.replaceChildren(
    hud,
    reporterBar.el,
    h('main', { class: 'stage' }, cityHost, cityEvents, tools, legend, loading, issue),
    bottomBar,
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

  const draftOf = (card: CardInstance): Draft => {
    let d = drafts.get(card.uid);
    if (!d) {
      d = { publish: false, placement: 1, distortion: 0 };
      drafts.set(card.uid, d);
    }
    return d;
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
        h('span', {}, `Доверие к вам: ${Math.round(r.trust)}`),
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

  function renderHud(): void {
    const b = c.balance;
    const m = state.metrics;
    const exposureShare = state.exposure / b.exposureLimit;
    const trust = averageTrust(state, c);
    hud.replaceChildren(
      h('div', { class: 'brand' }, 'NEWS FIGHTS'),
      h(
        'div',
        { class: 'stats' },
        h('div', { class: 'stat' }, h('span', {}, 'Ход'), h('b', {}, `${Math.min(state.turn, b.turnLimit)} / ${b.turnLimit}`)),
        h(
          'div',
          { class: `stat ${state.money < 0 ? 'bad' : ''}` },
          h('span', {}, 'Деньги'),
          h('b', {}, `${state.money}`),
          h('small', {}, `−${totalUpkeep(state, c)}/ход`),
        ),
        h(
          'div',
          { class: `stat ${exposureShare > 0.6 ? 'bad' : ''}` },
          h('span', {}, 'Разоблачения'),
          meter(exposureShare, exposureShare > 0.6 ? 'danger' : 'warn'),
          h('small', {}, `${Math.round(state.exposure)} / ${b.exposureLimit}`),
        ),
        h('div', { class: 'stat' }, h('span', {}, 'Индекс города'), h('b', {}, `${Math.round(m.cityIndex)}`), h('small', {}, `цель < ${b.winCityIndex}`)),
        h(
          'div',
          { class: 'stat', title: 'Постоянные читатели: покупают каждый выпуск и приносят доход' },
          h('span', {}, 'Читатели'),
          h('b', {}, `${readerCount(state)}`),
          report ? h('small', {}, `−${report.readers.lost} / +${report.readers.gained}`) : null,
        ),
        h(
          'div',
          { class: 'stat trust' },
          h('div', { class: 'trust-row' }, h('small', {}, 'Доверие'), meter(trust / 100, 'ok'), h('small', {}, `${Math.round(trust)}%`)),
        ),
        h('div', { class: 'stat channels' }, h('span', {}, 'Каналы'), h('small', {}, state.ownedChannels.map((ch) => channelOf(c, ch).name).join(', '))),
      ),
      h('button', { class: 'ghost small', onclick: newGame }, 'Новая игра'),
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
  function cardContent(card: CardInstance, mods: ReturnType<typeof getModifiers>, frontTaken: number): { cls: string; children: Node[] } {
    const tpl = templateOf(c, card.templateId);
    const d = draftOf(card);
    const p = previewPublication(state, c, mods, { cardUid: card.uid, placement: d.placement, distortion: d.distortion });
    const audience = tpl.audience?.length ? tpl.audience.map((g) => groupOf(c, g).name.toLowerCase()).join(', ') : 'все жители';
    // The front page has limited room; other published stories already hold it.
    const frontFull = d.placement !== 2 && frontTaken >= mods.frontPageSlots;
    const investigation = tpl.source === 'investigation';
    const target = tpl.target ? groupOf(c, tpl.target).name : '';
    const update = (patch: Partial<Draft>) => {
      Object.assign(d, patch);
      render();
    };
    const distortions = Array.from({ length: maxDistortion(card) + 1 }, (_, i) => ({
      value: String(i),
      label: `${distortionLabels[i === 0 ? 0 : card.baseTruth + i]} → ${truthLabels[card.baseTruth + i]}`,
    }));
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
    const sourceLabel = tpl.source === 'event' ? 'событие' : tpl.source === 'rumor' ? 'слух' : `о группе: ${target.toLowerCase()}`;
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
      ),
      h('h3', { class: 'headline' }, p.title),
      h('p', { class: 'effect' }, `${effectText(c, p.effect, tpl.target)}. Аудитория: ${audience}.`),
      h(
        'div',
        { class: 'card-stat', title: 'Насколько сильно поверившие отреагируют: уровень, место в газете, масштаб, аудитория' },
        h('span', {}, 'Воздействие'),
        meter(p.impact / 2.5, p.impact >= 1.4 ? 'danger' : 'ok'),
        h('em', {}, `×${p.impact.toFixed(1)}`),
      ),
      bar('Охват города', p.reachChance),
      bar('Риск разоблачения', p.exposureRisk, p.exposureRisk > 0.2 ? 'danger' : 'warn'),
      h(
        'div',
        { class: 'controls' },
        h('label', {}, 'Искажение', select(distortions, String(d.distortion), (v) => update({ distortion: Number(v) }))),
        h(
          'label',
          {},
          'Подача',
          select(
            placementLabels.map((l, i) => ({
              value: String(i),
              label: i === 2 && frontFull ? `${l} (занята)` : l,
              disabled: i === 2 && frontFull,
            })),
            String(d.placement),
            (v) => update({ placement: Number(v) as Placement }),
          ),
        ),
      ),
      h('p', { class: 'place-note' }, placementNote(d.placement)),
      h(
        'button',
        { class: `pick${d.publish ? ' primary' : ''}`, disabled: busy, onclick: () => update({ publish: !d.publish }) },
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
    const publishedCount = state.hand.filter((x) => drafts.get(x.uid)?.publish).length;
    const frontTaken = state.hand.filter((x) => drafts.get(x.uid)?.placement === 2).length;
    const visible = state.hand.filter((card) => revealed.has(card.uid));
    const found = state.lastFinds.filter((f) => f.cardUid !== null).length;
    const isInvestigation = (card: CardInstance) => templateOf(c, card.templateId).source === 'investigation';

    issueHead.replaceChildren(
      h('h2', {}, `Выпуск дня ${state.turn}`),
      h(
        'p',
        {},
        searching
          ? 'Репортёры ищут новости… (щёлкните, чтобы пропустить)'
          : `Репортёры принесли новостей: ${found}. Печатайте сколько угодно: главное — на первую полосу (мест: ${mods.frontPageSlots}), остальное статьями или заметками. Неопубликованное сгорит. Скучный или неубедительный выпуск распугивает читателей.`,
      ),
    );
    invBlock.hidden = !visible.some(isInvestigation);

    for (const [uid, el] of cardEls) {
      if (!visible.some((x) => x.uid === uid)) {
        el.remove();
        cardEls.delete(uid);
      }
    }
    for (const card of visible) {
      const { cls, children } = cardContent(card, mods, frontTaken);
      let el = cardEls.get(card.uid);
      const isNew = !el;
      if (!el) {
        el = h('article', {});
        cardEls.set(card.uid, el);
        (isInvestigation(card) ? invCards : issueCards).append(el);
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
      error ? h('span', { class: 'bad' }, error) : h(
            'span',
            { class: 'counter' },
            `В выпуске ${publishedCount} · первая полоса ${state.hand.filter((x) => drafts.get(x.uid)?.publish && drafts.get(x.uid)?.placement === 2).length} / ${mods.frontPageSlots}`,
          ),
      h('button', { class: 'ghost', onclick: closeIssue }, 'Свернуть'),
      h('button', { class: 'primary big', onclick: endTurn, disabled: busy || !!state.outcome }, searching ? 'Репортёры ищут…' : 'Опубликовать и завершить ход'),
    );
  }

  function summaryText(): string {
    if (!report) return `Ход ${state.turn}. Выберите новости для выпуска и опубликуйте их.`;
    const r = report;
    const parts = [
      `Индекс ${signed(Math.round(r.metricsAfter.cityIndex - r.metricsBefore.cityIndex))}`,
      `жителей ${signed(r.metricsAfter.activeResidents - r.metricsBefore.activeResidents)}`,
      `читателей ${signed(r.readers.after - r.readers.before)}`,
      `деньги ${signed(r.moneyDelta)}`,
      `доверие ${signed(Math.round(r.trustAfter - r.trustBefore))}`,
    ];
    const exposed = r.publications.filter((p) => p.exposed).length + r.lateExposures.length;
    if (exposed) parts.push(`разоблачено: ${exposed}`);
    const believed = r.publications.reduce((s, p) => s + p.believed, 0);
    return `Итоги хода ${r.turn}: поверили ${believed} · ${parts.join(' · ')}`;
  }

  function renderBottom(): void {
    const publishedCount = state.hand.filter((x) => drafts.get(x.uid)?.publish).length;
    bottomBar.replaceChildren(
      h('div', { class: 'summary' }, summaryText()),
      h(
        'div',
        { class: 'bottom-buttons' },
        h('button', { class: issueOpen ? 'primary' : '', onclick: () => ((issueOpen = !issueOpen), render()) }, `Выпуск (${publishedCount}/${state.hand.length})`),
        h('button', { disabled: !report, onclick: () => openModal('report') }, 'Итоги хода'),
        h('button', { onclick: () => openModal('city') }, 'Состояние города'),
        h('button', { onclick: () => openModal('shop') }, 'Покупки'),
      ),
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

  function cityContent(): HTMLElement[] {
    const m = state.metrics;
    return [
      bar('Население', m.population),
      bar('Занятость', m.employment),
      bar('Экономика', m.economy),
      bar('Настроение', m.mood),
      bar('Порядок', m.order),
      h('p', { class: 'hint' }, `Жителей: ${m.activeResidents}. Индекс города ${Math.round(m.cityIndex)}, для победы нужно меньше ${c.balance.winCityIndex}.`),
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
          p.exposed ? h('p', { class: 'bad' }, 'Разоблачено! Доверие и реклама упали.') : null,
        ),
      ),
      ...(r.publications.length === 0 ? [h('p', { class: 'hint' }, 'В этот ход ничего не опубликовано.')] : []),
      ...r.lateExposures.map((t) => h('div', { class: 'report-item exposed' }, h('p', { class: 'bad' }, `Всплыла старая ложь: «${t}»`))),
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
          )}, разоблачения ${signed(Math.round(r.exposureDelta))}, доверие ${signed(Math.round(r.trustAfter - r.trustBefore))}`,
        ),
      ),
      ...(r.events.length || r.notes.length
        ? [h('div', { class: 'report-item' }, h('strong', {}, 'Новый день'), ...r.events.map((e) => h('p', {}, `• ${e}`)), ...r.notes.map((n) => h('p', { class: 'muted' }, n)))]
        : []),
    ];
  }

  /** Assigning a reporter to dig dirt on a social group (CONCEPT.md §3.3а). */
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
    if (inv) {
      const done = inv.total - inv.turnsLeft;
      return [
        head,
        ...errorLine,
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
      city: 'Состояние города',
      shop: 'Покупки',
      investigate: 'Расследование',
    };
    const body =
      modal === 'report' ? reportContent() : modal === 'city' ? cityContent() : modal === 'investigate' ? investigateContent() : shopContent();
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
    renderHud();
    reporterBar.render(state, repStatus, searching);
    renderCityEvents();
    renderIssue();
    renderBottom();
    renderModal();
    renderOutcome();
  }

  busy = true;
  void runSearch();
}
