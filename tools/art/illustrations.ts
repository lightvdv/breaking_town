import type { Color } from './palette';
import { Raster, noise } from './raster';
import { buildingArts, type BuildingState } from './buildings';
import { looks, residentSheet, ROWS } from './characters';
import { fountain, tree } from './tiles';

/** News illustrations, 128×72 (CONCEPT.md §7.2), assembled from city sprites and big icons. */
export const W = 128;
export const H = 72;
const GROUND = 58;

type Sky = 'day' | 'dusk' | 'night' | 'alarm';

interface Person {
  group: keyof typeof looks;
  row: string;
  frame?: number;
  x: number;
  variant?: number;
  mirror?: boolean;
}

interface Scene {
  sky: Sky;
  ground: 'grass' | 'road' | 'plaza';
  building?: { type: string; state?: BuildingState; x: number };
  trees?: number[];
  fountain?: number;
  people?: Person[];
  icons?: { name: keyof typeof ICONS; x: number; y: number; color?: Color }[];
}

// ---------- Icons (12×12, outlined) ----------

const ICONS = {
  fire: [
    '.....r......',
    '....rr......',
    '...rrar.....',
    '...raar..r..',
    '..raaaar.rr.',
    '..raayaarrr.',
    '.rraayyaaar.',
    '.raayyyyaar.',
    '.raayyyyyar.',
    '.raayyyyar..',
    '..raayyar...',
    '...rrrrr....',
  ],
  warning: [
    '.....kk.....',
    '....kyyk....',
    '....kyyk....',
    '...kyyyyk...',
    '...kykkyk...',
    '..kyykkyyk..',
    '..kyykkyyk..',
    '.kyyykkyyyk.',
    '.kyyyyyyyyk.',
    'kyyyykkyyyyk',
    'kyyyyyyyyyyk',
    'kkkkkkkkkkkk',
  ],
  skull: [
    '...wwwwww...',
    '..wwwwwwww..',
    '.wwwwwwwwww.',
    '.wwkkwwkkww.',
    '.wwkkwwkkww.',
    '.wwwwwwwwww.',
    '..wwwkkwww..',
    '...wwwwww...',
    '...wkwkwk...',
    '...wwwwww...',
  ],
  money: [
    '....kkkk....',
    '.....yy.....',
    '....kkkk....',
    '...yyyyyy...',
    '..yyyyyyyy..',
    '.yyyyddyyyy.',
    '.yyyddyyyyy.',
    '.yyyyddyyyy.',
    '.yyyyyddyyy.',
    '.yyyddddyyy.',
    '..yyyyyyyy..',
    '...yyyyyy...',
  ],
  up: [
    '.....rr.....',
    '....rrrr....',
    '...rrrrrr...',
    '..rrrrrrrr..',
    '.rrrrrrrrrr.',
    '....rrrr....',
    '....rrrr....',
    '....rrrr....',
    '....rrrr....',
    '....rrrr....',
  ],
  down: [
    '....rrrr....',
    '....rrrr....',
    '....rrrr....',
    '....rrrr....',
    '....rrrr....',
    '.rrrrrrrrrr.',
    '..rrrrrrrr..',
    '...rrrrrr...',
    '....rrrr....',
    '.....rr.....',
  ],
  heart: [
    '.pp....pp...',
    'pppp..pppp..',
    'pppppppppp..',
    'pwpppppppp..',
    '.pppppppp...',
    '..pppppp....',
    '...pppp.....',
    '....pp......',
  ],
  star: [
    '.....y......',
    '.....y......',
    '....yyy.....',
    'yyyyyyyyyyy.',
    '.yyyyyyyyy..',
    '..yyyyyyy...',
    '..yyyyyyy...',
    '.yyyy.yyyy..',
    '.yyy...yyy..',
    'yy.......yy.',
  ],
  virus: [
    '....g..g....',
    '..g.gggg.g..',
    '...gggggg...',
    '.ggggdgggg..',
    '..gggggdgg..',
    'ggggdggggg.g',
    '..gggggggg..',
    '.gggggdggg..',
    '...gggggg...',
    '..g.gggg.g..',
    '....g..g....',
  ],
  cross: [
    '...wwwwww...',
    '..wwwrrwww..',
    '.wwwwrrwwww.',
    '.wwwwrrwwww.',
    '.wrrrrrrrrw.',
    '.wrrrrrrrrw.',
    '.wwwwrrwwww.',
    '.wwwwrrwwww.',
    '..wwwrrwww..',
    '...wwwwww...',
  ],
  trophy: [
    '.yyyyyyyyy..',
    'yyyyyyyyyyy.',
    'y.yyyyyyy.y.',
    'y.yyyyyyy.y.',
    '.yyyyyyyyy..',
    '..yyyyyyy...',
    '....yyy.....',
    '....yyy.....',
    '...yyyyy....',
    '..ddddddd...',
    '..ddddddd...',
  ],
  ball: [
    '...kkkkk....',
    '..kwwkwwk...',
    '.kwwkkkwwk..',
    '.kwkkkkkwk..',
    '.kwwkkkwwk..',
    '.kwwwkwwwk..',
    '..kwwwwwk...',
    '...kkkkk....',
  ],
  note: [
    '.....kkkk...',
    '.....kkkkk..',
    '.....k..kk..',
    '.....k...k..',
    '.....k...k..',
    '.....k..kk..',
    '..kkkk.kkk..',
    '.kkkkk.kk...',
    '.kkkk.......',
    '..kk........',
  ],
  alien: [
    '...gggggg...',
    '..gggggggg..',
    '.gggggggggg.',
    '.gkkgggkkgg.',
    '.gkkkgkkkgg.',
    '.gggggggggg.',
    '..ggggggg...',
    '...gg.gg....',
  ],
  ufo: [
    '....cccc....',
    '...cccccc...',
    '.ssssssssss.',
    'ssyssyssyss.',
    '.ssssssssss.',
    '...y..y..y..',
    '..y...y...y.',
  ],
  poison: [
    '....kk......',
    '....ww......',
    '...wwww.....',
    '...wggw.....',
    '..wggggw....',
    '..gggggg....',
    '..gwgwgg....',
    '..ggwggg....',
    '..gwgwgg....',
    '..gggggg....',
  ],
  rat: [
    '............',
    '.kk.........',
    'kddd........',
    '.dddd.......',
    '..dddddd...p',
    '...ddddddpp.',
    '...k...k....',
  ],
  megaphone: [
    '.......kk...',
    '.....kkyk...',
    '...kkyyyk...',
    'kkkyyyyyk...',
    'kyyyyyyyk.w.',
    'kkkyyyyyk..w',
    '...kkyyyk.w.',
    '.....kkyk...',
    '.......kk...',
  ],
  document: [
    '.wwwwwwww...',
    '.wkkkkkkw...',
    '.wwwwwwww...',
    '.wkkkkkww...',
    '.wwwwwwww...',
    '.wkkkkkkw...',
    '.wwwwwwww...',
    '.wkkkwwrw...',
    '.wwwwwrrw...',
    '.wwwwwwww...',
  ],
  globe: [
    '...bbbbbb...',
    '..bbggbbbb..',
    '.bbgggbbggb.',
    '.bggggbbggb.',
    '.bbggbbbbgb.',
    '.bbbgbbbbbb.',
    '.bbbbbggbbb.',
    '.bbbbggggbb.',
    '..bbbbggbb..',
    '...bbbbbb...',
  ],
  wheat: [
    '..y...y...y.',
    '.yay.yay.yay',
    '..y...y...y.',
    '.yay.yay.yay',
    '..y...y...y.',
    '..g...g...g.',
    '...g..g..g..',
    '....g.g.g...',
    '.....ggg....',
    '......g.....',
  ],
  eyes: ['rr..rr', 'rr..rr'],
  camera: [
    '..kkk.......',
    'kkkkkkkkkk..',
    'kssssssssk..',
    'ksskkkkssk..',
    'kskcwwkcsk..',
    'kskwcckcsk..',
    'ksskkkkssk..',
    'kkkkkkkkkk..',
  ],
} as const;

const ICON_KEY: Record<string, Color> = {
  r: 'red',
  a: 'orange',
  y: 'yellow',
  k: 'ink',
  w: 'white',
  d: 'brown',
  p: 'pink',
  g: 'green',
  c: 'cyan',
  s: 'silver',
  b: 'blue',
};

function icon(name: keyof typeof ICONS, color?: Color): Raster {
  const r = new Raster(14, 14);
  const key = color ? { ...ICON_KEY, r: color } : ICON_KEY;
  r.art(1, 1, [...ICONS[name]], key);
  if (name !== 'eyes') r.outline('ink');
  return r;
}

// ---------- Scene parts ----------

const SKIES: Record<Sky, [Color, Color]> = {
  day: ['blue', 'cyan'],
  dusk: ['plum', 'orange'],
  night: ['navy', 'slate'],
  alarm: ['darkRed', 'orange'],
};

const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

function sky(r: Raster, kind: Sky): void {
  const [top, bottom] = SKIES[kind];
  for (let y = 0; y < GROUND; y++) {
    const t = (y / GROUND) * 16;
    for (let x = 0; x < W; x++) r.set(x, y, t > BAYER[y % 4][x % 4] ? bottom : top);
  }
  if (kind === 'night') {
    for (let i = 0; i < 40; i++) {
      const x = Math.floor(noise(i, 1, 5) * W);
      const y = Math.floor(noise(i, 2, 5) * (GROUND - 20));
      r.set(x, y, noise(i, 3, 5) > 0.5 ? 'white' : 'silver');
    }
    r.rect(108, 6, 8, 8, 'sand');
    r.rect(110, 6, 6, 6, 'navy');
  }
  if (kind === 'day') {
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) if (dx * dx + dy * dy <= 25) r.set(112 + dx, 12 + dy, 'yellow');
  }
}

function ground(r: Raster, kind: Scene['ground']): void {
  for (let y = GROUND; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const n = noise(x, y, 77);
      const c: Color =
        kind === 'grass'
          ? n < 0.15
            ? 'darkGreen'
            : 'green'
          : kind === 'road'
            ? n < 0.08
              ? 'navy'
              : 'slate'
            : n < 0.1
              ? 'grey'
              : 'silver';
      r.set(x, y, c);
    }
  }
  if (kind === 'road') for (let x = 4; x < W; x += 12) r.rect(x, 65, 6, 1, 'silver');
  for (let x = 0; x < W; x++) r.set(x, GROUND, kind === 'grass' ? 'forest' : 'darkGrey');
}

/** Halves a sprite, keeping the most common opaque color of each 2×2 block. */
function half(src: Raster): Raster {
  const out = new Raster(src.w / 2, src.h / 2);
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      const counts = new Map<Color, number>();
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ]) {
        const c = src.get(x * 2 + dx, y * 2 + dy);
        if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
      }
      let best: Color | null = null;
      let n = 0;
      for (const [c, k] of counts) if (k > n) [best, n] = [c, k];
      if (best && n >= 2) out.set(x, y, best);
    }
  }
  return out;
}

function building(type: string, state: BuildingState): Raster {
  const art = buildingArts.find((a) => a.type === type);
  if (!art) throw new Error(`No art for ${type}`);
  const r = new Raster(64 * art.size, 64 * art.size);
  art.draw(r, art.states.includes(state) ? state : 'active', 0, 1);
  return art.size === 2 ? half(r) : r;
}

const sheets = new Map<string, Raster>();
function person(p: Person): Raster {
  const key = `${p.group}:${p.variant ?? 0}`;
  if (!sheets.has(key)) sheets.set(key, residentSheet(looks[p.group][p.variant ?? 0]));
  const sheet = sheets.get(key)!;
  const row = ROWS.findIndex((x) => x.name === p.row);
  const out = new Raster(16, 16);
  out.blit(sheet.crop((p.frame ?? 1) * 16, row * 16, 16, 16), 0, 0, p.mirror);
  return out;
}

/** Nearest-neighbour ×2, so people and icons read well on a card. */
function double(src: Raster): Raster {
  const out = new Raster(src.w * 2, src.h * 2);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const c = src.get(x, y);
      if (c) out.rect(x * 2, y * 2, 2, 2, c);
    }
  }
  return out;
}

export function illustration(s: Scene): Raster {
  const r = new Raster(W, H);
  sky(r, s.sky);
  ground(r, s.ground);
  for (const x of s.trees ?? []) r.blit(tree(Math.floor(x) % 3), x - 32, GROUND - 52);
  if (s.fountain !== undefined) r.blit(fountain(0), s.fountain - 32, GROUND - 50);
  if (s.building) r.blit(building(s.building.type, s.building.state ?? 'active'), s.building.x, GROUND + 6 - 64);
  // Big icons behind the people, kept inside the frame.
  for (const i of s.icons ?? []) {
    const img = double(icon(i.name, i.color));
    r.blit(img, Math.min(i.x, W - img.w - 2), Math.min(i.y, GROUND - img.h + 6));
  }
  // People at double size, spread evenly from the leftmost given position.
  const people = [...(s.people ?? [])].sort((a, b) => a.x - b.x);
  if (people.length) {
    const start = Math.min(people[0].x - 6, W - 6 - people.length * 22 - 10);
    people.forEach((p, i) => r.blit(double(person(p)), start + i * 22, H - 33));
  }
  // Frame.
  for (let x = 0; x < W; x++) {
    r.set(x, 0, 'ink');
    r.set(x, H - 1, 'ink');
  }
  for (let y = 0; y < H; y++) {
    r.set(0, y, 'ink');
    r.set(W - 1, y, 'ink');
  }
  return r;
}

// ---------- Scenes per news template (ids from src/content/cards.json) ----------

const p = (group: Person['group'], row: string, x: number, extra: Partial<Person> = {}): Person => ({ group, row, x, ...extra });

export const scenes: Record<string, Scene> = {
  factory_accident: {
    sky: 'alarm',
    ground: 'road',
    building: { type: 'factory', x: 24 },
    people: [p('workers', 'react_scared', 92, { frame: 2 }), p('workers', 'react_scared', 104, { variant: 1, frame: 1 })],
    icons: [
      { name: 'fire', x: 40, y: 18 },
      { name: 'warning', x: 100, y: 22 },
    ],
  },
  price_rise: {
    sky: 'day',
    ground: 'plaza',
    building: { type: 'shop', x: 8 },
    people: [p('pensioners', 'react_shrug', 80, { frame: 1 }), p('workers', 'idle_front', 98)],
    icons: [
      { name: 'up', x: 74, y: 12 },
      { name: 'money', x: 92, y: 18 },
    ],
  },
  new_bar: {
    sky: 'dusk',
    ground: 'road',
    building: { type: 'entertainment', x: 10 },
    people: [p('youth', 'react_happy', 82, { frame: 2 }), p('youth', 'react_happy', 98, { variant: 1, frame: 1 })],
    icons: [
      { name: 'note', x: 80, y: 14 },
      { name: 'star', x: 100, y: 10 },
    ],
  },
  hospital_queue: {
    sky: 'day',
    ground: 'plaza',
    building: { type: 'hospital', x: 4 },
    people: [70, 82, 94, 106].map((x, i) => p('pensioners', 'idle_back', x, { variant: i % 2 })),
    icons: [{ name: 'cross', x: 96, y: 14 }],
  },
  mayor_promise: {
    sky: 'day',
    ground: 'plaza',
    building: { type: 'cityHall', x: 4 },
    people: [p('workers', 'react_happy', 84, { frame: 2 }), p('intelligentsia', 'idle_front', 100)],
    icons: [{ name: 'megaphone', x: 76, y: 16 }],
  },
  factory_bonus: {
    sky: 'day',
    ground: 'road',
    building: { type: 'factory', x: 4 },
    people: [p('workers', 'react_happy', 84, { frame: 2 }), p('workers', 'react_happy', 100, { variant: 1, frame: 1 })],
    icons: [{ name: 'money', x: 90, y: 14 }],
  },
  festival: {
    sky: 'day',
    ground: 'grass',
    trees: [20, 108],
    fountain: 64,
    people: [p('youth', 'react_happy', 30, { frame: 2 }), p('youth', 'react_happy', 82, { variant: 1, frame: 1 }), p('pensioners', 'idle_front', 96)],
    icons: [
      { name: 'note', x: 40, y: 10 },
      { name: 'star', x: 86, y: 8 },
    ],
  },
  shop_layoff: {
    sky: 'dusk',
    ground: 'plaza',
    building: { type: 'shop', state: 'closed', x: 8 },
    people: [p('youth', 'walk_suitcase_front', 84), p('workers', 'react_shrug', 100, { frame: 1 })],
    icons: [{ name: 'down', x: 92, y: 14 }],
  },
  sports_win: {
    sky: 'day',
    ground: 'grass',
    trees: [112],
    people: [p('youth', 'react_happy', 30, { frame: 2 }), p('workers', 'react_happy', 50, { frame: 1 }), p('youth', 'react_happy', 70, { variant: 1, frame: 2 })],
    icons: [
      { name: 'trophy', x: 48, y: 12 },
      { name: 'ball', x: 92, y: 40 },
    ],
  },
  water_poison: {
    sky: 'alarm',
    ground: 'plaza',
    fountain: 40,
    people: [p('pensioners', 'react_scared', 84, { frame: 2 }), p('workers', 'react_scared', 100, { frame: 1 })],
    icons: [
      { name: 'poison', x: 30, y: 6 },
      { name: 'skull', x: 92, y: 16 },
    ],
  },
  factory_sold: {
    sky: 'dusk',
    ground: 'road',
    building: { type: 'factory', x: 4 },
    people: [p('workers', 'react_shrug', 96, { frame: 1 })],
    icons: [
      { name: 'money', x: 78, y: 12 },
      { name: 'globe', x: 98, y: 16 },
    ],
  },
  shop_rats: {
    sky: 'dusk',
    ground: 'plaza',
    building: { type: 'shop', x: 8 },
    people: [p('pensioners', 'react_scared', 96, { frame: 2 })],
    icons: [
      { name: 'rat', x: 74, y: 52 },
      { name: 'rat', x: 52, y: 54 },
    ],
  },
  mayor_flee: {
    sky: 'night',
    ground: 'plaza',
    building: { type: 'cityHall', x: 4 },
    people: [p('intelligentsia', 'walk_suitcase_front', 84, { variant: 1 }), p('workers', 'react_outraged', 104, { frame: 1 })],
    icons: [{ name: 'money', x: 84, y: 22 }],
  },
  crime_wave: {
    sky: 'night',
    ground: 'road',
    building: { type: 'home', x: 6 },
    people: [p('pensioners', 'react_scared', 96, { frame: 2 })],
    icons: [
      { name: 'eyes', x: 76, y: 40 },
      { name: 'eyes', x: 60, y: 46 },
      { name: 'warning', x: 100, y: 22 },
    ],
  },
  bar_drugs: {
    sky: 'night',
    ground: 'road',
    building: { type: 'entertainment', x: 10 },
    people: [p('youth', 'react_scared', 94, { frame: 2 })],
    icons: [{ name: 'poison', x: 80, y: 18 }],
  },
  doctors_strike: {
    sky: 'dusk',
    ground: 'plaza',
    building: { type: 'hospital', x: 4 },
    people: [p('intelligentsia', 'protest', 78, { frame: 1 }), p('intelligentsia', 'protest', 98, { variant: 1, frame: 3 })],
    icons: [{ name: 'cross', x: 108, y: 14 }],
  },
  layoffs_coming: {
    sky: 'dusk',
    ground: 'road',
    building: { type: 'factory', x: 4 },
    people: [p('workers', 'react_scared', 84, { frame: 2 }), p('workers', 'react_shrug', 100, { variant: 1, frame: 1 })],
    icons: [{ name: 'down', x: 94, y: 12 }],
  },
  tax_rise: {
    sky: 'day',
    ground: 'plaza',
    building: { type: 'cityHall', x: 4 },
    people: [p('intelligentsia', 'react_outraged', 90, { frame: 1 })],
    icons: [
      { name: 'document', x: 78, y: 14 },
      { name: 'up', x: 100, y: 12 },
    ],
  },
  celebrity: {
    sky: 'dusk',
    ground: 'road',
    people: [p('youth', 'react_happy', 30, { frame: 2 }), p('youth', 'react_happy', 50, { variant: 1, frame: 1 }), p('intelligentsia', 'idle_front', 90)],
    icons: [
      { name: 'star', x: 60, y: 12 },
      { name: 'camera', x: 86, y: 30 },
    ],
  },
  global_recession: {
    sky: 'dusk',
    ground: 'plaza',
    people: [p('workers', 'react_shrug', 80, { frame: 1 }), p('pensioners', 'react_scared', 98, { frame: 2 })],
    icons: [
      { name: 'globe', x: 20, y: 14 },
      { name: 'down', x: 40, y: 14 },
      { name: 'money', x: 58, y: 24 },
    ],
  },
  global_grain: {
    sky: 'day',
    ground: 'grass',
    people: [p('pensioners', 'react_shrug', 96, { frame: 1 })],
    icons: [
      { name: 'wheat', x: 20, y: 40 },
      { name: 'wheat', x: 36, y: 42 },
      { name: 'wheat', x: 52, y: 40 },
      { name: 'up', x: 72, y: 12 },
    ],
  },
  global_star: {
    sky: 'night',
    ground: 'plaza',
    people: [p('youth', 'react_happy', 70, { frame: 2 }), p('pensioners', 'idle_front', 92)],
    icons: [
      { name: 'star', x: 30, y: 12 },
      { name: 'note', x: 48, y: 24 },
      { name: 'heart', x: 82, y: 14 },
    ],
  },
  global_cup: {
    sky: 'day',
    ground: 'grass',
    people: [p('youth', 'react_happy', 70, { frame: 2 }), p('workers', 'react_happy', 90, { variant: 1, frame: 1 })],
    icons: [
      { name: 'globe', x: 14, y: 14 },
      { name: 'trophy', x: 36, y: 12 },
      { name: 'ball', x: 104, y: 42 },
    ],
  },
  global_flu: {
    sky: 'alarm',
    ground: 'plaza',
    people: [p('pensioners', 'react_scared', 84, { frame: 2 }), p('intelligentsia', 'react_scared', 102, { frame: 1 })],
    icons: [
      { name: 'globe', x: 18, y: 18 },
      { name: 'virus', x: 40, y: 10 },
      { name: 'virus', x: 58, y: 24 },
    ],
  },
  global_plants: {
    sky: 'dusk',
    ground: 'road',
    building: { type: 'factory', state: 'closed', x: 4 },
    people: [p('workers', 'walk_suitcase_front', 96)],
    icons: [{ name: 'globe', x: 80, y: 14 }],
  },
  global_taxes: {
    sky: 'day',
    ground: 'plaza',
    people: [p('workers', 'react_outraged', 80, { frame: 1 }), p('intelligentsia', 'react_outraged', 98, { frame: 3 })],
    icons: [
      { name: 'globe', x: 14, y: 16 },
      { name: 'document', x: 34, y: 14 },
      { name: 'up', x: 52, y: 12 },
    ],
  },
  investigation_pensioners: {
    sky: 'night',
    ground: 'plaza',
    building: { type: 'cityHall', x: 2 },
    people: [p('pensioners', 'idle_front', 72), p('workers', 'react_outraged', 90, { frame: 1 }), p('youth', 'react_outraged', 108, { frame: 3 })],
    icons: [
      { name: 'money', x: 74, y: 8 },
      { name: 'document', x: 98, y: 10 },
    ],
  },
  investigation_workers: {
    sky: 'night',
    ground: 'road',
    building: { type: 'factory', x: 2 },
    people: [p('workers', 'walk_bag_front', 72), p('intelligentsia', 'react_outraged', 92, { frame: 1 }), p('pensioners', 'react_outraged', 110, { frame: 3 })],
    icons: [{ name: 'warning', x: 82, y: 10 }],
  },
  investigation_youth: {
    sky: 'night',
    ground: 'road',
    building: { type: 'entertainment', x: 6 },
    people: [p('youth', 'react_happy', 70, { frame: 2 }), p('pensioners', 'react_scared', 92, { frame: 2 }), p('workers', 'react_outraged', 110, { frame: 1 })],
    icons: [
      { name: 'skull', x: 70, y: 8 },
      { name: 'warning', x: 96, y: 12 },
    ],
  },
  investigation_intelligentsia: {
    sky: 'night',
    ground: 'plaza',
    building: { type: 'hospital', x: 2 },
    people: [p('intelligentsia', 'idle_front', 72, { variant: 1 }), p('workers', 'react_outraged', 92, { frame: 1 }), p('pensioners', 'react_outraged', 110, { frame: 3 })],
    icons: [
      { name: 'money', x: 72, y: 8 },
      { name: 'eyes', x: 104, y: 24 },
    ],
  },
  global_aliens: {
    sky: 'night',
    ground: 'grass',
    trees: [20],
    people: [p('pensioners', 'react_scared', 96, { frame: 2 })],
    icons: [
      { name: 'ufo', x: 56, y: 10 },
      { name: 'alien', x: 64, y: 40 },
    ],
  },
};
