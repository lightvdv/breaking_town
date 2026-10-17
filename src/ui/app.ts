import { CityScene, REACTION_ICON, type HoverTarget } from '../render/scene';
import {
  averageTrust,
  buildingDefOf,
  channelOf,
  createGame,
  getModifiers,
  groupOf,
  listPurchases,
  maxDistortion,
  playTurn,
  previewPublication,
  purchase,
  templateOf,
  totalUpkeep,
  type CardInstance,
  type Content,
  type Decision,
  type Framing,
  type GameState,
  type Reaction,
  type Requirement,
  type TurnReport,
} from '../sim';
import { h, pct, select } from './dom';
import {
  distortionLabels,
  effectLabels,
  effectText,
  framingLabels,
  outcomeText,
  reactionLabels,
  topicLabels,
  truthLabels,
} from './text';

interface Draft {
  publish: boolean;
  hold: boolean;
  channel: string;
  target: string;
  framing: Framing;
  distortion: number;
}

type Tab = 'issue' | 'shop' | 'report';

const REACTION_SECONDS = 2.6;
const assetBase = `${import.meta.env.BASE_URL}assets/`;

function seedFromUrl(): number {
  const s = Number(new URLSearchParams(location.search).get('seed'));
  return Number.isFinite(s) && s > 0 ? s : randomSeed();
}

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000) + 1;
}

export function mountApp(root: HTMLElement, c: Content): void {
  let state: GameState = createGame(c, seedFromUrl());
  let drafts = new Map<number, Draft>();
  let report: TurnReport | null = null;
  let tab: Tab = 'issue';
  let error = '';
  let busy = false;
  let scene: CityScene | null = null;

  // Persistent shell: the city canvas is created once and never re-rendered by the DOM.
  const hud = h('header', { class: 'hud' });
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
  const sidebar = h('aside', { class: 'sidebar' });
  const tooltip = h('div', { class: 'tooltip', hidden: true });
  const modal = h('div', { class: 'modal-layer' });
  root.replaceChildren(
    hud,
    h('div', { class: 'layout' }, h('section', { class: 'city' }, cityHost, cityEvents, tools, legend, loading), sidebar),
    tooltip,
    modal,
  );

  CityScene.create(cityHost, c, state, showTooltip)
    .then((s) => {
      scene = s;
      loading.remove();
    })
    .catch((e) => {
      loading.textContent = `Не удалось загрузить графику: ${e instanceof Error ? e.message : e}`;
    });

  // ---------- Actions ----------

  const draftOf = (card: CardInstance): Draft => {
    let d = drafts.get(card.uid);
    if (!d) {
      d = { publish: false, hold: false, channel: state.ownedChannels[0], target: '', framing: 0, distortion: 0 };
      drafts.set(card.uid, d);
    }
    if (!state.ownedChannels.includes(d.channel)) d.channel = state.ownedChannels[0];
    return d;
  };

  const newGame = () => {
    state = createGame(c, randomSeed());
    drafts = new Map();
    report = null;
    tab = 'issue';
    error = '';
    busy = false;
    scene?.setState(state, false);
    scene?.resetView();
    render();
  };

  const endTurn = () => {
    const decision: Decision = { publish: [], hold: [] };
    for (const card of state.hand) {
      const d = draftOf(card);
      if (d.publish) {
        decision.publish.push({
          cardUid: card.uid,
          channel: d.channel,
          targetGroup: d.target || null,
          framing: d.framing,
          distortion: d.distortion,
        });
      } else if (d.hold) decision.hold.push(card.uid);
    }
    try {
      report = playTurn(state, c, decision);
      error = '';
      const kept = new Set(decision.hold);
      for (const uid of [...drafts.keys()]) if (!kept.has(uid)) drafts.delete(uid);
      for (const uid of kept) drafts.get(uid)!.hold = false;
      scene?.setState(state, true);
      busy = true;
      render();
      // Let the city react first (CONCEPT.md §7.3), then show the report.
      window.setTimeout(() => {
        busy = false;
        tab = 'report';
        render();
      }, REACTION_SECONDS * 1000);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      render();
    }
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
        h('span', {}, `Доверие: ${state.ownedChannels.map((ch) => `${channelOf(c, ch).name} ${Math.round(r.trust[ch])}`).join(', ')}`),
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

  // ---------- Rendering ----------

  function meter(value: number, cls = ''): HTMLElement {
    return h('div', { class: `meter ${cls}` }, h('div', { style: `width:${pct(Math.max(0, Math.min(1, value)))}` }));
  }

  function renderHud(): void {
    const b = c.balance;
    const m = state.metrics;
    const exposureShare = state.exposure / b.exposureLimit;
    const upkeep = totalUpkeep(state, c);
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
          h('small', {}, `−${upkeep}/ход`),
        ),
        h(
          'div',
          { class: `stat ${exposureShare > 0.6 ? 'bad' : ''}` },
          h('span', {}, 'Разоблачения'),
          meter(exposureShare, exposureShare > 0.6 ? 'danger' : 'warn'),
          h('small', {}, `${Math.round(state.exposure)} / ${b.exposureLimit}`),
        ),
        h(
          'div',
          { class: 'stat' },
          h('span', {}, 'Индекс города'),
          h('b', {}, `${Math.round(m.cityIndex)}`),
          h('small', {}, `цель < ${b.winCityIndex}`),
        ),
        h(
          'div',
          { class: 'stat trust' },
          h('span', {}, 'Доверие'),
          ...state.ownedChannels.map((ch) =>
            h('div', { class: 'trust-row' }, h('small', {}, channelOf(c, ch).name), meter(averageTrust(state, c, ch) / 100, 'ok')),
          ),
        ),
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

  function cardView(card: CardInstance, mods: ReturnType<typeof getModifiers>, publishedCount: number): HTMLElement {
    const tpl = templateOf(c, card.templateId);
    const d = draftOf(card);
    const p = previewPublication(state, c, mods, {
      cardUid: card.uid,
      channel: d.channel,
      targetGroup: d.target || null,
      framing: d.framing,
      distortion: d.distortion,
    });
    const limitReached = !d.publish && publishedCount >= mods.publishPerTurn;
    const holdCount = state.hand.filter((x) => drafts.get(x.uid)?.hold).length;
    const update = (patch: Partial<Draft>) => {
      Object.assign(d, patch);
      if (patch.publish) d.hold = false;
      if (patch.hold) d.publish = false;
      render();
    };
    const distortions = Array.from({ length: maxDistortion(card) + 1 }, (_, i) => ({
      value: String(i),
      label: `${distortionLabels[i === 0 ? 0 : card.baseTruth + i]} → ${truthLabels[card.baseTruth + i]}`,
    }));
    const stat = (label: string, v: number, cls: string) =>
      h('div', { class: 'card-stat' }, h('span', {}, label), meter(v, cls), h('em', {}, pct(v)));

    return h(
      'article',
      { class: `card truth-${p.truth}${d.publish ? ' selected' : ''}${d.hold ? ' held' : ''}` },
      h(
        'div',
        { class: 'card-band' },
        h('b', {}, truthLabels[p.truth].toUpperCase()),
        h('span', {}, `${topicLabels[tpl.topic]} · ${tpl.source === 'event' ? 'событие' : 'слух'}`),
      ),
      h('h3', {}, p.title),
      h('p', { class: 'effect' }, effectText(c, p.effect)),
      stat('Интерес', p.interest, 'ok'),
      stat('Охват', p.reachChance, 'ok'),
      stat('Риск разоблачения', p.exposureRisk, p.exposureRisk > 0.2 ? 'danger' : 'warn'),
      h(
        'div',
        { class: 'controls' },
        h('label', {}, 'Искажение', select(distortions, String(d.distortion), (v) => update({ distortion: Number(v) }))),
        h(
          'label',
          {},
          'Подача',
          select(
            framingLabels.map((l, i) => ({ value: String(i), label: l })),
            String(d.framing),
            (v) => update({ framing: Number(v) as Framing }),
          ),
        ),
        h(
          'label',
          {},
          'Канал',
          select(
            state.ownedChannels.map((ch) => ({ value: ch, label: channelOf(c, ch).name })),
            d.channel,
            (v) => update({ channel: v }),
          ),
        ),
        h(
          'label',
          {},
          'Аудитория',
          select(
            [{ value: '', label: 'Все' }, ...c.groups.map((g) => ({ value: g.id, label: g.name }))],
            d.target,
            (v) => update({ target: v }),
          ),
        ),
      ),
      h(
        'div',
        { class: 'card-actions' },
        h(
          'button',
          { class: d.publish ? 'primary' : '', disabled: limitReached || busy, onclick: () => update({ publish: !d.publish }) },
          d.publish ? 'В выпуске ✓' : 'В выпуск',
        ),
        h(
          'button',
          {
            class: d.hold ? 'primary' : 'ghost',
            disabled: busy || (!d.hold && (d.publish || holdCount >= c.balance.maxHold)),
            onclick: () => update({ hold: !d.hold }),
          },
          d.hold ? 'Придержана ✓' : 'Придержать',
        ),
      ),
    );
  }

  function issueTab(): HTMLElement[] {
    const mods = getModifiers(state, c);
    const publishedCount = state.hand.filter((x) => drafts.get(x.uid)?.publish).length;
    return [
      h(
        'p',
        { class: 'hint' },
        `Выберите до ${mods.publishPerTurn} новостей для выпуска. Неиспользованные карты сгорят, придержать можно ${c.balance.maxHold}.`,
      ),
      ...state.hand.map((card) => cardView(card, mods, publishedCount)),
    ];
  }

  function requirementText(req: Requirement | null, channel?: string): string {
    const parts: string[] = [];
    if (req?.channel) parts.push(channelOf(c, req.channel).name);
    if (req?.upgrade) parts.push(c.upgrades.find((u) => u.id === req.upgrade)?.name ?? req.upgrade);
    if (channel && !state.ownedChannels.includes(channel)) parts.push(channelOf(c, channel).name);
    return parts.length ? `Нужно: ${parts.join(', ')}` : '';
  }

  function shopTab(): HTMLElement[] {
    const options = listPurchases(state, c);
    const item = (o: (typeof options)[number]) => {
      const def = o.kind === 'channel' ? c.channels.find((x) => x.id === o.id) : c.upgrades.find((x) => x.id === o.id);
      const req =
        o.kind === 'channel'
          ? requirementText(c.channels.find((x) => x.id === o.id)?.requires ?? null)
          : requirementText(c.upgrades.find((x) => x.id === o.id)?.requires ?? null, c.upgrades.find((x) => x.id === o.id)?.effects.channel);
      return h(
        'div',
        { class: `shop-item${o.unlocked ? '' : ' locked'}` },
        h('div', {}, h('strong', {}, o.name), h('p', {}, def?.description ?? ''), !o.unlocked ? h('p', { class: 'req' }, req) : null),
        h(
          'button',
          { class: o.affordable ? 'primary' : '', disabled: !o.affordable || !!state.outcome, onclick: () => buy(o.id) },
          `${o.cost}`,
        ),
      );
    };
    const channels = options.filter((o) => o.kind === 'channel');
    const upgrades = options.filter((o) => o.kind === 'upgrade').sort((a, b) => Number(b.unlocked) - Number(a.unlocked));
    return [
      h('p', { class: 'hint' }, `У вас ${state.money}. Содержание каналов: ${totalUpkeep(state, c)} за ход.`),
      ...(channels.length ? [h('h3', { class: 'section' }, 'Каналы'), ...channels.map(item)] : []),
      h('h3', { class: 'section' }, 'Улучшения'),
      ...upgrades.map(item),
    ];
  }

  function reportTab(): HTMLElement[] {
    const m = state.metrics;
    const bar = (label: string, v: number) => h('div', { class: 'card-stat' }, h('span', {}, label), meter(v, 'ok'), h('em', {}, pct(v)));
    const out: HTMLElement[] = [
      h('h3', { class: 'section' }, 'Состояние города'),
      bar('Население', m.population),
      bar('Занятость', m.employment),
      bar('Экономика', m.economy),
      bar('Настроение', m.mood),
      bar('Порядок', m.order),
    ];
    if (!report) {
      out.push(h('p', { class: 'hint' }, 'Итоги появятся после первого хода.'));
      return out;
    }
    const r = report;
    const delta = (a: number, b: number) => {
      const d = Math.round(b - a);
      return d > 0 ? `+${d}` : `${d}`;
    };
    out.unshift(
      h('h3', { class: 'section' }, `Итоги хода ${r.turn}`),
      ...r.publications.map((p) =>
        h(
          'div',
          { class: `report-item truth-${p.truth}${p.exposed ? ' exposed' : ''}` },
          h('strong', {}, `«${p.title}»`),
          h(
            'p',
            {},
            `${channelOf(c, p.channel).name}, ${truthLabels[p.truth].toLowerCase()}. Увидели ${p.reached}, поверили ${p.believed}, не поверили ${p.doubted}, пересказали ${p.wordOfMouth}.`,
          ),
          Object.keys(p.effects).length
            ? h(
                'p',
                {},
                Object.entries(p.effects)
                  .map(([k, v]) => `${effectLabels[k as keyof typeof effectLabels]}: ${v}`)
                  .join(' · '),
              )
            : null,
          p.exposed ? h('p', { class: 'bad' }, 'Разоблачено! Доверие и реклама упали.') : null,
        ),
      ),
      ...r.lateExposures.map((t) => h('div', { class: 'report-item exposed' }, h('p', { class: 'bad' }, `Всплыла старая ложь: «${t}»`))),
      h(
        'div',
        { class: 'report-item' },
        h(
          'p',
          {},
          `Доход: ${
            Object.entries(r.income)
              .map(([ch, v]) => `${channelOf(c, ch).name} ${v} (${r.views[ch] ?? 0} просм.)`)
              .join(', ') || 'нет'
          }`,
        ),
        h('p', {}, `Содержание: −${r.upkeep}. Итого: ${r.moneyDelta >= 0 ? '+' : ''}${r.moneyDelta}`),
        h(
          'p',
          {},
          `Индекс города ${delta(r.metricsBefore.cityIndex, r.metricsAfter.cityIndex)}, жителей ${delta(
            r.metricsBefore.activeResidents,
            r.metricsAfter.activeResidents,
          )}, разоблачения ${r.exposureDelta >= 0 ? '+' : ''}${Math.round(r.exposureDelta)}`,
        ),
      ),
      ...(r.events.length || r.notes.length
        ? [
            h(
              'div',
              { class: 'report-item' },
              h('strong', {}, 'Новый день'),
              ...r.events.map((e) => h('p', {}, `• ${e}`)),
              ...r.notes.map((n) => h('p', { class: 'muted' }, n)),
            ),
          ]
        : []),
    );
    return out;
  }

  function renderSidebar(): void {
    const mods = getModifiers(state, c);
    const publishedCount = state.hand.filter((x) => drafts.get(x.uid)?.publish).length;
    const tabButton = (id: Tab, label: string) =>
      h('button', { class: `tab${tab === id ? ' active' : ''}`, onclick: () => ((tab = id), render()) }, label);
    const body = tab === 'issue' ? issueTab() : tab === 'shop' ? shopTab() : reportTab();
    const scroll = sidebar.querySelector('.tab-body')?.scrollTop ?? 0;
    sidebar.replaceChildren(
      h('nav', { class: 'tabs' }, tabButton('issue', 'Выпуск'), tabButton('shop', 'Покупки'), tabButton('report', 'Итоги')),
      h('div', { class: 'tab-body' }, error ? h('p', { class: 'bad' }, error) : null, ...body),
      h(
        'footer',
        { class: 'turn-bar' },
        h('span', {}, `В выпуске ${publishedCount} / ${mods.publishPerTurn}`),
        h(
          'button',
          { class: 'primary big', onclick: endTurn, disabled: busy || !!state.outcome },
          busy ? 'Город реагирует…' : 'Опубликовать и завершить ход',
        ),
      ),
    );
    if (tab !== 'report') sidebar.querySelector('.tab-body')!.scrollTop = scroll;
  }

  function renderModal(): void {
    if (!state.outcome || busy) {
      modal.replaceChildren();
      return;
    }
    modal.replaceChildren(
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
    renderCityEvents();
    renderSidebar();
    renderModal();
  }

  render();
}
