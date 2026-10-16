import { buildingDefOf, channelOf, groupOf, type Building, type Content, type GameState, type Resident } from '../sim';
import { svg } from './dom';

const CELL_W = 120;
const CELL_H = 100;
const BOX_W = 104;
const BOX_H = 76;
const TOP = 28;

function hash(n: number): number {
  return Math.imul(n + 1, 2654435761) >>> 0;
}

function boxOf(b: Building): { x: number; y: number } {
  return { x: b.x * CELL_W + (CELL_W - BOX_W) / 2, y: TOP + b.y * CELL_H + (CELL_H - BOX_H) / 2 };
}

/** Where a resident is drawn: protest at the city hall, otherwise at work or at home. */
function placeOf(state: GameState, r: Resident): Building {
  if (r.protestTurns > 0) {
    const hall = state.buildings.find((b) => b.type === 'cityHall');
    if (hall) return hall;
  }
  return state.buildings[r.job ?? r.home];
}

function tooltip(state: GameState, c: Content, r: Resident): string {
  const lines = [
    groupOf(c, r.group).name,
    `Настроение: ${Math.round(r.mood * 100)}%, настрой: ${Math.round(r.outlook * 100)}%`,
    `Работа: ${r.job === null ? 'нет' : buildingDefOf(c, state.buildings[r.job].type).name}`,
    `Доверие: ${state.ownedChannels.map((ch) => `${channelOf(c, ch).name} ${Math.round(r.trust[ch])}`).join(', ')}`,
  ];
  if (r.protestTurns > 0) lines.push('Протестует');
  if (r.beliefs.length) lines.push('Верит:', ...r.beliefs.map((b) => `• ${b.title}`));
  return lines.join('\n');
}

export function renderCity(state: GameState, c: Content): SVGSVGElement {
  const cols = c.balance.gridColumns;
  const rows = Math.ceil(state.buildings.length / cols);
  const root = svg('svg', {
    viewBox: `0 0 ${cols * CELL_W} ${TOP + rows * CELL_H}`,
    class: 'city',
    role: 'img',
    'aria-label': 'Город',
  });

  const left = state.residents.filter((r) => r.status === 'left').length;
  const protesting = state.residents.filter((r) => r.status === 'active' && r.protestTurns > 0).length;
  root.append(
    svg(
      'text',
      { x: 8, y: 18, class: 'city-caption' },
      `Жителей: ${state.metrics.activeResidents} · уехали: ${left} · протестуют: ${protesting}`,
    ),
  );

  for (const b of state.buildings) {
    const def = buildingDefOf(c, b.type);
    const { x, y } = boxOf(b);
    const g = svg('g', { class: b.open ? 'building' : 'building closed' });
    g.append(
      svg('rect', { x, y, width: BOX_W, height: BOX_H, rx: 8, fill: def.color }),
      svg('text', { x: x + 6, y: y + 14, class: 'building-label' }, def.name),
    );
    if (!b.open) g.append(svg('text', { x: x + BOX_W / 2, y: y + BOX_H / 2 + 5, class: 'closed-label' }, 'ЗАКРЫТ'));
    root.append(g);
  }

  for (const r of state.residents) {
    if (r.status !== 'active') continue;
    const { x, y } = boxOf(placeOf(state, r));
    const hv = hash(r.id);
    const reaction = state.lastReactions[r.id];
    const dot = svg('circle', {
      cx: x + 7 + (hv % (BOX_W - 14)),
      cy: y + 22 + ((hv >>> 8) % (BOX_H - 28)),
      r: 3.2,
      fill: groupOf(c, r.group).color,
      class: `resident${reaction ? ` ${reaction}` : ''}${r.protestTurns > 0 ? ' protesting' : ''}`,
    });
    dot.append(svg('title', {}, tooltip(state, c, r)));
    root.append(dot);
  }
  return root;
}
