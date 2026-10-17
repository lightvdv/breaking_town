import { getModifiers, groupOf, reporterLuck, reporterOf, type Content, type Find, type GameState, type ReporterDef } from '../sim';
import { h, pct } from './dom';
import { scopeLabels, tierLabels, topicLabels } from './text';

/** A reporter's state during the start-of-turn search animation (CONCEPT.md §7.3). */
export type RepStatus = { phase: 'searching' } | { phase: 'done'; find: Find; title: string | null };

const portraitUrl = (id: string) => `${import.meta.env.BASE_URL}assets/sprites/reporters/${id}.png`;

export function stars(nose: number): string {
  return '★'.repeat(nose) + '☆'.repeat(3 - nose);
}

export function skillLine(c: Content, state: GameState, r: ReporterDef): string {
  const luck = reporterLuck(r, getModifiers(state, c));
  return `Удача ${pct(luck)} · Чутьё ${stars(r.skills.nose)} · ${scopeLabels[r.skills.scope]}`;
}

export function topicLine(r: ReporterDef): string {
  return r.skills.topics.length ? `Темы: ${r.skills.topics.map((t) => topicLabels[t].toLowerCase()).join(', ')}` : 'Пишет обо всём';
}

export function portrait(id: string, cls = 'portrait'): HTMLImageElement {
  return h('img', { class: cls, src: portraitUrl(id), alt: '', width: 64, height: 64 });
}

/**
 * Row of hired reporters under the top bar. Card elements persist between renders so that CSS
 * animations of a reporter are not restarted while the next one is searching.
 */
export class ReporterBar {
  readonly el = h('div', { class: 'reporter-bar' });
  private cards = new Map<string, { root: HTMLElement; info: HTMLElement; status: HTMLElement; key: string }>();
  private layoutKey = '';

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
        const r = reporterOf(this.c, id);
        const info = h('div', { class: 'rep-info' });
        const status = h('div', { class: 'rep-status' });
        const root = h(
          'div',
          {
            class: 'rep-card',
            title: `${r.name}. ${r.bio} Щёлкните, чтобы поручить расследование.`,
            onclick: (e: Event) => {
              // During the search animation a click skips it (handled by the bar).
              if (this.animating) return;
              e.stopPropagation();
              this.onInvestigate(id);
            },
          },
          h('div', { class: 'rep-portrait' }, portrait(id)),
          info,
          status,
        );
        this.cards.set(id, { root, info, status, key: '' });
        slots.push(root);
      }
      for (let i = state.reporters.length; i < max; i++) {
        slots.push(
          h(
            'button',
            {
              class: 'rep-slot',
              onclick: (e: Event) => {
                e.stopPropagation();
                this.onHire();
              },
            },
            '+ Нанять репортёра',
          ),
        );
      }
      this.el.replaceChildren(h('div', { class: 'rep-title' }, 'Редакция'), ...slots);
    }
    this.el.classList.toggle('animating', animating);
    this.animating = animating;

    for (const [id, card] of this.cards) {
      const r = reporterOf(this.c, id);
      const inv = state.investigations.find((x) => x.reporterId === id);
      const invLine = inv
        ? `Расследует: ${groupOf(this.c, inv.target).name.toLowerCase()} · ещё ${inv.turnsLeft} ${inv.turnsLeft === 1 ? 'ход' : 'хода'}`
        : '';
      card.info.replaceChildren(
        h('b', {}, r.name),
        inv ? h('span', { class: 'rep-inv' }, invLine) : h('span', {}, skillLine(this.c, state, r)),
        h('span', { class: 'muted' }, `${topicLine(r)} · ${r.salary}/ход`),
      );
      const s = statuses.get(id);
      const statusKey = !s ? `idle:${invLine}` : s.phase === 'searching' ? 'searching' : `done:${s.find.kind}:${s.find.tier ?? 'empty'}`;
      if (statusKey === card.key) continue;
      card.key = statusKey;
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
  }
}
