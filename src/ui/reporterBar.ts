import { ASSET_BASE } from '../assets';
import { getModifiers, groupOf, levelOf, reporterOf, searchLuck, skilledReporter, staffOf, type Content, type Find, type GameState, type ReporterDef } from '../sim';
import { h, pct } from './dom';
import { rivalNames, scopeLabels, tierLabels, topicLabels } from './text';

/** A reporter's state during the start-of-turn search animation (CONCEPT.md §7.3). */
export type RepStatus = { phase: 'searching' } | { phase: 'done'; find: Find; title: string | null };

const portraitUrl = (id: string) => `${ASSET_BASE}sprites/reporters/${id}.png`;

export function stars(nose: number): string {
  const n = Math.round(nose);
  return '★'.repeat(n) + '☆'.repeat(3 - n);
}

export function skillLine(c: Content, state: GameState, r: ReporterDef): string {
  // Skills as experience has grown them (CONCEPT.md §3.3б).
  const s = state.reporters.includes(r.id) ? skilledReporter(state, c, r) : r;
  const luck = searchLuck(state, c, s, getModifiers(state, c));
  return `Удача ${pct(luck)} · Чутьё ${stars(s.skills.nose)} · ${scopeLabels[s.skills.scope]}`;
}

export const levelNames = ['Новичок', 'Опытный', 'Мастер', 'Легенда'];
/** «До «Мастера» ещё…» */
export const levelNamesGen = ['Новичка', 'Опытного', 'Мастера', 'Легенды'];

/** Luck as a horseshoe, nose for news as a nose: four looks each (CONCEPT.md §3.3б). */
export const luckNames = ['Ржавая подкова', 'Железная подкова', 'Серебряная подкова', 'Золотая подкова'];
export const noseNames = ['Заложенный нос', 'Обычный нос', 'Чуткий нос', 'Нюх ищейки'];
/** Luck from which the horseshoe gets better: iron, silver, golden. */
const LUCK_STEPS = [0.6, 0.75, 0.9];

/** The reporter's skills as experience has grown them, and the look of each icon (0–3). */
export function skillTiers(c: Content, state: GameState, r: ReporterDef): { luck: number; luckTier: number; nose: number; noseTier: number } {
  const s = state.reporters.includes(r.id) ? skilledReporter(state, c, r) : r;
  const luck = searchLuck(state, c, s, getModifiers(state, c));
  const nose = s.skills.nose;
  return { luck, luckTier: LUCK_STEPS.filter((x) => luck >= x).length, nose, noseTier: Math.max(0, Math.min(3, Math.round(nose))) };
}

/** Loyalty in a word and its colour: devoted, wavering, about to leave. */
export function loyaltyOf(c: Content, state: GameState, r: ReporterDef): { word: string; level: 'ok' | 'mid' | 'bad' } {
  const l = staffOf(state, c, r.id).loyalty;
  if (l >= 0.6) return { word: r.female ? 'Предана' : 'Предан', level: 'ok' };
  if (l >= 0.4) return { word: 'Сомневается', level: 'mid' };
  return { word: 'На грани ухода', level: 'bad' };
}

/** What sits behind the «i» by the name: who they are, how they take lies, their personal story, their topics. */
export function aboutLine(r: ReporterDef): string {
  const honest = r.honesty >= 0.7 ? 'Не терпит лжи.' : r.honesty <= 0.2 ? `Ложь ${r.female ? 'её' : 'его'} не смущает.` : '';
  return [r.bio, honest, r.tie?.text ?? '', `${topicLine(r)} · ${scopeLabels[r.skills.scope].toLowerCase()}.`].filter(Boolean).join(' ');
}

/** Experience and loyalty of a hired reporter, and their personal story (CONCEPT.md §3.3б). */
export function characterLine(c: Content, state: GameState, r: ReporterDef): string {
  const s = staffOf(state, c, r.id);
  const level = levelOf(c, s.xp);
  const next = c.balance.reporterLevels[level + 1];
  const loyalty = s.loyalty >= 0.6 ? (r.female ? 'предана газете' : 'предан газете') : s.loyalty >= 0.4 ? 'сомневается' : 'на грани ухода';
  const honest = r.honesty >= 0.7 ? 'Не терпит лжи.' : r.honesty <= 0.2 ? `Ложь ${r.female ? 'её' : 'его'} не смущает.` : '';
  return [`${levelNames[level]}${next !== undefined ? ` (опыт ${s.xp}/${next})` : ''} · ${loyalty}.`, honest, r.tie?.text ?? ''].filter(Boolean).join(' ');
}

export function topicLine(r: ReporterDef): string {
  return r.skills.topics.length ? `Темы: ${r.skills.topics.map((t) => topicLabels[t].toLowerCase()).join(', ')}` : 'Пишет обо всём';
}

export function portrait(id: string, cls = 'portrait'): HTMLImageElement {
  return h('img', {
    class: cls,
    src: portraitUrl(id),
    alt: '',
    width: 64,
    height: 64,
  });
}

/**
 * Hired reporters as small portraits in the top bar (CONCEPT.md §7.3). Card elements persist
 * between renders so that CSS animations of a reporter are not restarted while the next one is
 * searching.
 */
export class ReporterBar {
  readonly el = h('div', { class: 'reporter-bar' });
  private cards = new Map<string, { root: HTMLElement; status: HTMLElement; name: HTMLElement; key: string }>();
  private layoutKey = '';
  /** Reporter whose search result was shown last: only its clipping pops out under the bar. */
  private front: string | null = null;

  private animating = false;
  /** Hiring for a novice opens on its day (CONCEPT.md §7.3): no «+» before, a «Новое» badge that day. */
  hiring: 'closed' | 'open' | 'new' = 'open';

  constructor(
    /** The content of the current game's difficulty; swapped when a new game starts. */
    public c: Content,
    private onHire: () => void,
    private onSkip: () => void,
    private onInvestigate: (id: string) => void,
  ) {
    this.el.addEventListener('click', () => this.onSkip());
  }

  /** A promotion: a golden flash over the portrait and «▲ Повышение» rising from it. */
  celebrate(ids: string[]): void {
    for (const id of ids) {
      const portrait = this.cards.get(id)?.root.querySelector('.rep-portrait');
      if (!portrait) continue;
      const fx = h('span', { class: 'level-up', 'aria-hidden': 'true' }, h('span', { class: 'level-up-ring' }), h('span', { class: 'level-up-tag' }, '▲ Повышение'));
      portrait.append(fx);
      window.setTimeout(() => fx.remove(), 3600);
    }
  }

  /** Screen rectangle of a hired reporter's card (cards fly out of it). */
  rectOf(id: string): DOMRect | null {
    return this.cards.get(id)?.root.getBoundingClientRect() ?? null;
  }

  render(state: GameState, statuses: Map<string, RepStatus>, animating: boolean): void {
    const max = this.c.balance.maxReporters;
    const key = `${state.reporters.join(',')}|${max}|${this.hiring}`;
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      this.cards.clear();
      const slots: HTMLElement[] = [];
      for (const id of state.reporters) {
        const status = h('div', { class: 'rep-status' });
        // The surname and what the reporter is up to, under the portrait.
        const name = h('div', { class: 'rep-name' });
        const root = h(
          'div',
          {
            class: 'rep-card',
            onclick: (e: Event) => {
              // During the search animation a click skips it (handled by the bar).
              if (this.animating) return;
              e.stopPropagation();
              this.onInvestigate(id);
            },
          },
          h('div', { class: 'rep-portrait' }, portrait(id), h('span', { class: 'rep-dot' })),
          status,
          name,
        );
        this.cards.set(id, { root, status, name, key: '' });
        slots.push(root);
      }
      // One "+" for all free places.
      if (state.reporters.length < max && this.hiring !== 'closed') {
        slots.push(
          h(
            'button',
            {
              class: `rep-slot${this.hiring === 'new' ? ' is-new' : ''}`,
              title: `Нанять репортёра (свободно мест: ${max - state.reporters.length})`,
              onclick: (e: Event) => {
                e.stopPropagation();
                this.onHire();
              },
            },
            h('span', { class: 'rep-plus' }, '+'),
            // Like a reporter's surname: what the empty place is for.
            h('span', { class: 'rep-name' }, h('b', {}, 'Нанять')),
          ),
        );
      }
      this.el.replaceChildren(...slots);
    }
    this.el.classList.toggle('animating', animating);
    this.animating = animating;

    for (const [id, card] of this.cards) {
      const r = reporterOf(this.c, id);
      const inv = state.investigations.find((x) => x.reporterId === id);
      const invLine = inv ? `Расследует: ${groupOf(this.c, inv.target).name.toLowerCase()} · ещё ${inv.turnsLeft} ${inv.turnsLeft === 1 ? 'ход' : 'хода'}` : '';
      // Name and skills on hover; the portrait itself only shows a status dot.
      card.root.title = [
        r.name,
        inv ? invLine : skillLine(this.c, state, r),
        `${searchLine(state, r)} · ${r.salary}/ход`,
        r.bio,
        'Щёлкните — темы поиска и расследование.',
      ].join('\n');
      const s = statuses.get(id);
      const found = state.hand.filter((x) => x.reporterId === id).length;
      const doing = s?.phase === 'searching'
        ? 'ищет…'
        : animating && !s
          ? ''
          : inv
            ? 'копает'
            : state.rivalWatch.includes(id)
              ? 'следит'
              : found
                ? `${r.female ? 'нашла' : 'нашёл'} ${found}`
                : 'пусто';
      card.name.replaceChildren(h('b', {}, r.name.split(' ').pop() ?? r.name), h('small', {}, doing));
      const statusKey = !s ? `idle:${invLine}` : s.phase === 'searching' ? 'searching' : `done:${s.find.kind}:${s.find.tier ?? 'empty'}`;
      if (statusKey === card.key) continue;
      card.key = statusKey;
      if (s) this.front = id;
      const result =
        s?.phase === 'done'
          ? s.find.kind === 'investigating'
            ? 'result-digging'
            : s.find.cardUid === null
              ? 'result-empty'
              : `result-${s.find.tier}${s.find.kind === 'investigation' ? ' result-exclusive' : ''}`
          : '';
      card.root.className = `rep-card${s ? ` is-${s.phase}` : ''}${result ? ` ${result}` : ''}${inv ? ' investigating' : ''}`;
      if (!s) card.status.replaceChildren();
      else if (s.phase === 'searching') {
        card.status.replaceChildren(h('span', {}, inv ? 'Копает грязь' : 'Ищет новость'), h('span', { class: 'dots' }, '...'));
      } else if (s.find.kind === 'investigating') {
        card.status.replaceChildren(h('b', {}, 'Расследует'), h('span', {}, invLine.replace(/^Расследует: /, '')));
      } else if (s.find.cardUid === null || s.find.tier === null) {
        card.status.replaceChildren(h('b', {}, 'Пусто'), h('span', {}, 'Ничего не нашёл'));
      } else {
        card.status.replaceChildren(
          s.find.kind === 'investigation'
            ? h('b', { class: 'sensation-banner' }, 'ЭКСКЛЮЗИВ!')
            : s.find.tier === 3
              ? h('b', { class: 'sensation-banner' }, 'СЕНСАЦИЯ!')
              : '',
          h('span', { class: 'clip-tier' }, tierLabels[s.find.tier]),
          h('span', { class: 'clip-title' }, s.title ?? ''),
        );
      }
    }
    for (const [id, card] of this.cards) card.root.classList.toggle('front', id === this.front);
  }
}

/** What the reporter is looking for: the player's topics, or their own specialties. */
export function searchLine(state: GameState, r: ReporterDef): string {
  const assigned = state.reporterTopics[r.id] ?? [];
  if (state.rival && !state.rival.closed && state.rivalWatch.includes(r.id)) return `Следит за «${rivalNames[state.rival.kind].ins}»`;
  return assigned.length ? `Ищет: ${assigned.map((t) => topicLabels[t].toLowerCase()).join(', ')}` : topicLine(r);
}
