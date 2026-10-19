import { getModifiers, groupOf, levelOf, reporterOf, searchLuck, skilledReporter, staffOf, type Content, type Find, type GameState, type ReporterDef } from '../sim';
import { h, pct } from './dom';
import { rivalNames, scopeLabels, tierLabels, topicLabels } from './text';

/** A reporter's state during the start-of-turn search animation (CONCEPT.md §7.3). */
export type RepStatus = { phase: 'searching' } | { phase: 'done'; find: Find; title: string | null };

const portraitUrl = (id: string) => `${import.meta.env.BASE_URL}assets/sprites/reporters/${id}.png`;

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

const levelNames = ['Новичок', 'Опытный', 'Мастер', 'Легенда'];

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
  private cards = new Map<string, { root: HTMLElement; status: HTMLElement; key: string }>();
  private layoutKey = '';
  /** Reporter whose search result was shown last: only its clipping pops out under the bar. */
  private front: string | null = null;

  private animating = false;

  constructor(
    private c: Content,
    private onHire: () => void,
    private onSkip: () => void,
    private onInvestigate: (id: string) => void,
  ) {
    this.el.addEventListener('click', () => this.onSkip());
  }

  /** Screen rectangle of a hired reporter's card (cards fly out of it). */
  rectOf(id: string): DOMRect | null {
    return this.cards.get(id)?.root.getBoundingClientRect() ?? null;
  }

  render(state: GameState, statuses: Map<string, RepStatus>, animating: boolean): void {
    const max = this.c.balance.maxReporters;
    const key = `${state.reporters.join(',')}|${max}`;
    if (key !== this.layoutKey) {
      this.layoutKey = key;
      this.cards.clear();
      const slots: HTMLElement[] = [];
      for (const id of state.reporters) {
        const status = h('div', { class: 'rep-status' });
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
        );
        this.cards.set(id, { root, status, key: '' });
        slots.push(root);
      }
      // One "+" for all free places.
      if (state.reporters.length < max) {
        slots.push(
          h(
            'button',
            {
              class: 'rep-slot',
              title: `Нанять репортёра (свободно мест: ${max - state.reporters.length})`,
              onclick: (e: Event) => {
                e.stopPropagation();
                this.onHire();
              },
            },
            '+',
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
