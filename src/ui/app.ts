import {
  averageTrust,
  channelOf,
  createGame,
  getModifiers,
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
  type TurnReport,
} from '../sim';
import { renderCity } from './cityView';
import { h, pct, select } from './dom';
import {
  distortionLabels,
  effectLabels,
  effectText,
  framingLabels,
  outcomeText,
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

function seedFromUrl(): number {
  const s = Number(new URLSearchParams(location.search).get('seed'));
  return Number.isFinite(s) && s > 0 ? s : Math.floor(Math.random() * 1_000_000) + 1;
}

export function mountApp(root: HTMLElement, c: Content): void {
  let state: GameState = createGame(c, seedFromUrl());
  let drafts = new Map<number, Draft>();
  let report: TurnReport | null = null;
  let error = '';

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
    state = createGame(c, Math.floor(Math.random() * 1_000_000) + 1);
    drafts = new Map();
    report = null;
    error = '';
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
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    render();
  };

  const buy = (id: string) => {
    try {
      purchase(state, c, id);
      error = '';
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    render();
  };

  function header(): HTMLElement {
    const b = c.balance;
    const m = state.metrics;
    const stat = (label: string, value: string, warn = false) =>
      h('div', { class: `stat${warn ? ' warn' : ''}` }, h('span', {}, label), h('strong', {}, value));
    return h(
      'header',
      {},
      h('h1', {}, 'News Fights'),
      h(
        'div',
        { class: 'stats' },
        stat('Ход', `${Math.min(state.turn, b.turnLimit)} / ${b.turnLimit}`),
        stat('Деньги', `${state.money}`, state.money < 0),
        stat('Расходы за ход', `${totalUpkeep(state, c)}`),
        stat('Разоблачения', `${Math.round(state.exposure)} / ${b.exposureLimit}`, state.exposure > b.exposureLimit * 0.6),
        stat('Индекс города', `${Math.round(m.cityIndex)} (цель < ${b.winCityIndex})`),
      ),
      h('button', { class: 'ghost', onclick: newGame }, 'Новая игра'),
    );
  }

  function cityPanel(): HTMLElement {
    const m = state.metrics;
    const bar = (label: string, v: number) =>
      h('div', { class: 'bar' }, h('span', {}, label), h('div', { class: 'track' }, h('div', { class: 'fill', style: `width:${pct(v)}` })), h('em', {}, pct(v)));
    const trust = state.ownedChannels.map((ch) => bar(`Доверие: ${channelOf(c, ch).name}`, averageTrust(state, c, ch) / 100));
    return h(
      'section',
      { class: 'panel city-panel' },
      renderCity(state, c),
      h(
        'div',
        { class: 'legend' },
        ...c.groups.map((g) => h('span', {}, h('i', { style: `background:${g.color}` }), g.name)),
        h('span', {}, h('i', { class: 'ring believed' }), 'поверил'),
        h('span', {}, h('i', { class: 'ring doubted' }), 'не поверил'),
      ),
      h(
        'div',
        { class: 'bars' },
        bar('Население', m.population),
        bar('Занятость', m.employment),
        bar('Экономика', m.economy),
        bar('Настроение', m.mood),
        bar('Порядок', m.order),
        ...trust,
      ),
      state.todayEvents.length
        ? h('div', { class: 'events' }, h('h3', {}, 'События дня'), h('ul', {}, ...state.todayEvents.map((e) => h('li', {}, e))))
        : null,
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

    return h(
      'article',
      { class: `card truth-${p.truth}${d.publish ? ' selected' : ''}` },
      h(
        'div',
        { class: 'card-top' },
        h('span', { class: 'badge' }, truthLabels[p.truth]),
        h('span', { class: 'topic' }, topicLabels[tpl.topic]),
        tpl.source === 'event' ? h('span', { class: 'topic' }, 'событие') : h('span', { class: 'topic' }, 'слух'),
      ),
      h('h3', {}, p.title),
      h('p', { class: 'effect' }, effectText(c, p.effect)),
      h(
        'dl',
        {},
        h('dt', {}, 'Интерес'),
        h('dd', {}, pct(p.interest)),
        h('dt', {}, 'Охват'),
        h('dd', {}, pct(p.reachChance)),
        h('dt', {}, 'Риск разоблачения'),
        h('dd', {}, pct(p.exposureRisk)),
      ),
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
          { class: d.publish ? 'primary' : '', disabled: limitReached, onclick: () => update({ publish: !d.publish }) },
          d.publish ? 'В выпуске ✓' : 'В выпуск',
        ),
        h(
          'button',
          {
            class: d.hold ? 'primary' : 'ghost',
            disabled: !d.hold && (d.publish || holdCount >= c.balance.maxHold),
            onclick: () => update({ hold: !d.hold }),
          },
          d.hold ? 'Придержана ✓' : 'Придержать',
        ),
      ),
    );
  }

  function handPanel(): HTMLElement {
    const mods = getModifiers(state, c);
    const publishedCount = state.hand.filter((x) => drafts.get(x.uid)?.publish).length;
    return h(
      'section',
      { class: 'panel' },
      h(
        'div',
        { class: 'panel-head' },
        h('h2', {}, 'Новости хода'),
        h('span', { class: 'muted' }, `В выпуске ${publishedCount} / ${mods.publishPerTurn} · придержать можно ${c.balance.maxHold}`),
        h('button', { class: 'primary', onclick: endTurn, disabled: !!state.outcome }, 'Опубликовать и завершить ход'),
      ),
      error ? h('p', { class: 'error' }, error) : null,
      h('div', { class: 'cards' }, ...state.hand.map((card) => cardView(card, mods, publishedCount))),
    );
  }

  function shopPanel(): HTMLElement {
    const options = listPurchases(state, c).filter((p) => p.unlocked);
    return h(
      'section',
      { class: 'panel' },
      h('h2', {}, 'Покупки'),
      h(
        'div',
        { class: 'shop' },
        ...options.map((p) =>
          h(
            'div',
            { class: 'shop-item' },
            h('div', {}, h('strong', {}, `${p.kind === 'channel' ? 'Канал: ' : ''}${p.name}`), h('p', { class: 'muted' }, p.description)),
            h('button', { disabled: !p.affordable || !!state.outcome, onclick: () => buy(p.id) }, `${p.cost}`),
          ),
        ),
      ),
    );
  }

  function reportPanel(): HTMLElement | null {
    if (!report) return null;
    const r = report;
    const delta = (a: number, b: number) => {
      const d = Math.round(b - a);
      return d === 0 ? '0' : d > 0 ? `+${d}` : `${d}`;
    };
    const income = Object.entries(r.income)
      .map(([ch, v]) => `${channelOf(c, ch).name}: ${v} (${r.views[ch] ?? 0} просм.)`)
      .join(', ');
    return h(
      'section',
      { class: 'panel report' },
      h('h2', {}, `Итоги хода ${r.turn}`),
      h(
        'ul',
        {},
        ...r.publications.map((p) =>
          h(
            'li',
            { class: p.exposed ? 'exposed' : '' },
            h('strong', {}, `«${p.title}»`),
            ` — ${channelOf(c, p.channel).name}, ${truthLabels[p.truth].toLowerCase()}: увидели ${p.reached}, поверили ${p.believed}, не поверили ${p.doubted}, пересказали ${p.wordOfMouth}. `,
            Object.entries(p.effects)
              .map(([k, v]) => `${effectLabels[k as keyof typeof effectLabels]}: ${v}`)
              .join(', '),
            p.exposed ? h('b', {}, ' РАЗОБЛАЧЕНО') : null,
          ),
        ),
        ...r.lateExposures.map((t) => h('li', { class: 'exposed' }, `Всплыла старая ложь: «${t}»`)),
        h('li', {}, `Доход: ${income || 'нет'}; содержание: −${r.upkeep}; итого ${r.moneyDelta >= 0 ? '+' : ''}${r.moneyDelta}`),
        h(
          'li',
          {},
          `Город: индекс ${delta(r.metricsBefore.cityIndex, r.metricsAfter.cityIndex)}, ` +
            `жителей ${delta(r.metricsBefore.activeResidents, r.metricsAfter.activeResidents)}, ` +
            `разоблачения ${r.exposureDelta >= 0 ? '+' : ''}${Math.round(r.exposureDelta)}`,
        ),
        ...r.notes.map((n) => h('li', { class: 'note' }, n)),
      ),
    );
  }

  function outcomeBanner(): HTMLElement | null {
    if (!state.outcome) return null;
    return h(
      'div',
      { class: `outcome ${state.outcome.result}` },
      h('strong', {}, outcomeText(state.outcome)),
      h('button', { class: 'primary', onclick: newGame }, 'Новая игра'),
    );
  }

  function render(): void {
    const scroll = window.scrollY;
    root.replaceChildren(
      header(),
      outcomeBanner() ?? '',
      h('main', {}, cityPanel(), h('div', { class: 'side' }, reportPanel() ?? '', handPanel(), shopPanel())),
    );
    window.scrollTo(0, scroll);
  }

  render();
}
