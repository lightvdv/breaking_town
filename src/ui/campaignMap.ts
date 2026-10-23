import type { TownDef } from '../sim';

/**
 * The region map of the campaign (CONCEPT.md §9): fields, farmland, forests, a lake, a river and hills
 * drawn pixel by pixel at 200 × 120 and scaled up crisp; the road runs from town to town. The same
 * every time (a fixed seed), so the region looks like one real place.
 */
export const MAP_W = 200;
export const MAP_H = 120;

const C = {
  grass: '#63c74d',
  grass2: '#3e8948',
  forest: '#265c42',
  forest2: '#193c3e',
  water: '#0099db',
  water2: '#124e89',
  field: '#feae34',
  field2: '#d77643',
  rock: '#8b9bb4',
  snow: '#ffffff',
  road: '#e4a672',
  road2: '#b86f50',
  roof: '#e43b44',
  wall: '#ead4aa',
};

export function drawRegion(canvas: HTMLCanvasElement, towns: TownDef[]): void {
  canvas.width = MAP_W;
  canvas.height = MAP_H;
  const g = canvas.getContext('2d');
  if (!g) return;
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const px = (x: number, y: number, c: string) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), 1, 1);
  };
  // Meadows with darker patches.
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) px(x, y, Math.sin(x * 0.13) + Math.cos(y * 0.17) + Math.sin((x + y) * 0.05) > 1.2 ? C.grass2 : C.grass);
  // Farmland: striped fields.
  for (let i = 0; i < 26; i++) {
    const x = rnd() * MAP_W;
    const y = rnd() * MAP_H;
    const w = 8 + rnd() * 14;
    const hh = 5 + rnd() * 8;
    for (let yy = 0; yy < hh; yy++) for (let xx = 0; xx < w; xx++) px(x + xx, y + yy, yy % 2 ? C.field : C.field2);
  }
  // The river from north to south.
  let rx = 150;
  for (let y = 0; y < MAP_H; y++) {
    rx += Math.sin(y * 0.12) * 1.6 + (rnd() - 0.5);
    for (let k = -3; k <= 3; k++) px(rx + k, y, Math.abs(k) > 2 ? C.water2 : C.water);
  }
  // The lake by Светлоозёрск.
  for (let y = -9; y <= 9; y++) for (let x = -15; x <= 15; x++) {
    const d = (x * x) / 225 + (y * y) / 81;
    if (d < 1) px(62 + x, 30 + y, d > 0.8 ? C.water2 : C.water);
  }
  // Forests.
  for (let i = 0; i < 34; i++) {
    const cx = rnd() * MAP_W;
    const cy = rnd() * MAP_H;
    const r = 3 + rnd() * 7;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y < r * r && rnd() > 0.15) px(cx + x, cy + y, rnd() > 0.5 ? C.forest : C.forest2);
  }
  // Hills in the south-west.
  for (let i = 0; i < 5; i++) {
    const cx = 20 + rnd() * 60;
    const cy = 85 + rnd() * 25;
    for (let y = 0; y < 7; y++) for (let x = -y; x <= y; x++) px(cx + x, cy - 7 + y, y < 2 ? C.snow : C.rock);
  }
  // The road, bending a little between towns.
  for (let i = 0; i < towns.length - 1; i++) {
    const a = towns[i].map;
    const b = towns[i + 1].map;
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * 2;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = Math.round(a.x + (b.x - a.x) * t + Math.sin(t * Math.PI) * 3);
      const y = Math.round(a.y + (b.y - a.y) * t);
      px(x, y, C.road);
      px(x + 1, y, C.road2);
    }
  }
  // Houses around each town, more around the regional centre.
  for (const t of towns) {
    const big = (t.starsToEnter ?? 0) > 0;
    for (let i = 0; i < (big ? 14 : 7); i++) {
      const x = t.map.x + (rnd() - 0.5) * (big ? 18 : 11);
      const y = t.map.y + (rnd() - 0.3) * (big ? 12 : 8);
      px(x, y, C.roof);
      px(x + 1, y, C.roof);
      px(x, y + 1, C.wall);
      px(x + 1, y + 1, C.wall);
    }
  }
}

/** A town's pin on the map: houses; ruins with smoke or a flag and lights once passed, by side. */
export function townIcon(state: 'done' | 'now' | 'gated' | 'locked', side: 'destroy' | 'save', final: boolean): string {
  const ruined = state === 'done' && side === 'destroy';
  const col = state === 'done' ? (ruined ? '#5a6988' : '#fee761') : state === 'now' ? '#ead4aa' : '#8b9bb4';
  let r = '';
  const rect = (x: number, y: number, w: number, hh: number, c: string) => (r += `<rect x="${x}" y="${y}" width="${w}" height="${hh}" fill="${c}"/>`);
  rect(3, 8, 4, 6, col);
  rect(8, 5, 5, 9, col);
  rect(2, 7, 6, 1, ruined ? '#3a4466' : '#e43b44');
  rect(7, 4, 7, 1, ruined ? '#3a4466' : '#be4a2f');
  if (ruined) {
    rect(9, 1, 2, 2, '#5a6988');
    rect(10, 0, 2, 1, '#8b9bb4');
    rect(4, 6, 1, 1, '#f77622');
    rect(5, 5, 1, 1, '#feae34');
  }
  if (state === 'done' && side === 'save') {
    rect(13, 0, 1, 5, '#ead4aa');
    rect(14, 0, 2, 2, '#63c74d');
    rect(4, 10, 1, 1, '#fee761');
    rect(10, 7, 1, 1, '#fee761');
  }
  if (final) {
    rect(6, 1, 4, 13, col);
    rect(7, 0, 2, 1, '#feae34');
  }
  const size = final ? 38 : 30;
  return `<svg viewBox="0 0 16 16" width="${size}" height="${size}" shape-rendering="crispEdges">${r}</svg>`;
}

/** A small skyline for the town card: houses in the town's colours, the final with a tower. */
export function drawTownArt(canvas: HTMLCanvasElement, t: TownDef): void {
  canvas.width = 128;
  canvas.height = 72;
  const g = canvas.getContext('2d');
  if (!g) return;
  let seed = [...t.id].reduce((s, ch) => s + ch.charCodeAt(0), 1);
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  g.fillStyle = '#2ce8f5';
  g.fillRect(0, 0, 128, 20);
  g.fillStyle = '#0099db';
  g.fillRect(0, 20, 128, 20);
  g.fillStyle = '#3e8948';
  g.fillRect(0, 40, 128, 4);
  g.fillStyle = '#63c74d';
  g.fillRect(0, 44, 128, 28);
  const walls = ['#ead4aa', '#c0cbdc', '#e4a672'];
  for (let i = 0; i < 9; i++) {
    const x = 4 + i * 14;
    const hh = 10 + Math.floor(rnd() * 18);
    g.fillStyle = walls[i % 3];
    g.fillRect(x, 44 - hh, 11, hh);
    g.fillStyle = '#e43b44';
    g.fillRect(x - 1, 44 - hh - 3, 13, 3);
    g.fillStyle = '#3e2731';
    for (let w = 0; w < 3; w++) g.fillRect(x + 2 + w * 3, 44 - hh + 3, 2, 2);
  }
  // A landmark by the town's type.
  if (t.type.includes('моногород')) {
    g.fillStyle = '#8b9bb4';
    g.fillRect(48, 18, 34, 26);
    g.fillStyle = '#5a6988';
    g.fillRect(74, 4, 5, 14);
  } else if (t.type.includes('курорт')) {
    g.fillStyle = '#0099db';
    g.fillRect(0, 52, 128, 20);
    g.fillStyle = '#fee761';
    g.fillRect(100, 6, 10, 10);
  } else if (t.type.includes('студен')) {
    g.fillStyle = '#c0cbdc';
    g.fillRect(48, 14, 32, 30);
    g.fillStyle = '#feae34';
    g.fillRect(60, 6, 8, 8);
  } else if (t.type.includes('порт')) {
    g.fillStyle = '#124e89';
    g.fillRect(0, 52, 128, 20);
    g.fillStyle = '#e43b44';
    g.fillRect(92, 10, 4, 34);
    g.fillRect(84, 10, 20, 3);
  } else if ((t.starsToEnter ?? 0) > 0) {
    g.fillStyle = '#c0cbdc';
    g.fillRect(56, 2, 16, 42);
    g.fillStyle = '#feae34';
    g.fillRect(60, 0, 8, 4);
  }
}
