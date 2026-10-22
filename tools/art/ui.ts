import type { Color } from './palette';
import { Raster } from './raster';

/**
 * 16×16 interface icons (CONCEPT.md §7.3): the four top-panel resources and the card controls
 * (truth level for distortion, placement in the paper). Every icon gets a 1-pixel ink outline.
 */

/** Adds an ink outline around everything drawn so far. */
function outline(r: Raster): Raster {
  const edge: [number, number][] = [];
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      if (r.get(x, y)) continue;
      const near = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => {
        const c = r.get(x + dx, y + dy);
        return c !== null && c !== 'ink';
      });
      if (near) edge.push([x, y]);
    }
  }
  for (const [x, y] of edge) r.set(x, y, 'ink');
  return r;
}

function disc(r: Raster, cx: number, cy: number, radius: number, c: Color): void {
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= radius * radius) r.set(x, y, c);
  }
}

function inPolygon(x: number, y: number, pts: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function money(): Raster {
  const r = new Raster(16, 16);
  disc(r, 7.5, 7.5, 6.2, 'amber');
  disc(r, 7.5, 7.5, 4.3, 'yellow');
  disc(r, 7.5, 7.5, 2.4, 'amber');
  r.set(5, 4, 'white');
  r.set(4, 5, 'white');
  return outline(r);
}

function readers(): Raster {
  const r = new Raster(16, 16);
  r.rect(2, 2, 12, 12, 'sand');
  r.rect(3, 3, 10, 2, 'darkBrown');
  r.rect(3, 6, 4, 4, 'blue');
  for (const y of [6, 8, 10, 12]) r.rect(8, y, 5, 1, 'grey');
  r.rect(3, 12, 4, 1, 'grey');
  return outline(r);
}

function reputation(): Raster {
  const r = new Raster(16, 16);
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? 7 : 3;
    pts.push([7.5 + rad * Math.cos(a), 8 + rad * Math.sin(a)]);
  }
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (inPolygon(x + 0.5, y + 0.5, pts)) r.set(x, y, 'yellow');
  r.set(7, 5, 'white');
  r.set(7, 6, 'white');
  return outline(r);
}

function residents(): Raster {
  const r = new Raster(16, 16);
  r.rect(9, 9, 5, 5, 'red');
  disc(r, 11, 6, 2.2, 'skin');
  r.rect(2, 8, 6, 6, 'blue');
  disc(r, 5, 4.5, 2.6, 'skin');
  r.rect(3, 2, 4, 1, 'brown');
  return outline(r);
}

/** City index: a skyline of three buildings with lit windows. */
function city(): Raster {
  const r = new Raster(16, 16);
  r.rect(1, 7, 4, 8, 'grey');
  r.rect(5, 2, 5, 13, 'silver');
  r.rect(10, 5, 5, 10, 'darkGrey');
  r.rect(7, 0, 1, 2, 'silver');
  for (const [x, y] of [
    [2, 9],
    [2, 12],
    [6, 4],
    [8, 4],
    [6, 7],
    [8, 10],
    [6, 13],
    [11, 7],
    [13, 10],
    [11, 12],
  ]) {
    r.set(x, y, 'yellow');
  }
  return outline(r);
}

/**
 * City stages shown instead of the index (CONCEPT.md §2.3, `balance.cityStates`): thriving with a
 * sun and a tree, calm, crisis with smoke and dark windows, decline with a broken tower and boarded
 * windows, ruins on fire.
 */
function cityState(level: 0 | 1 | 2 | 3 | 4): Raster {
  const r = new Raster(16, 16);
  if (level === 4) {
    r.art(0, 4, [
      '.....ssss.......',
      '....sssssss.....',
      '.....sss.sss....',
      '.......ry.......',
      '......ryyr......',
      '.....rryyor.....',
      '..g..roooor..g..',
      '.ggg..rrrr..gdg.',
      'gdgdg.dggd.ggdgg',
      'ggdggdggggdggdgg',
      'gggggggggggggggg',
    ], { s: 'grey', r: 'red', o: 'orange', y: 'yellow', g: 'darkGrey', d: 'slate' });
    return outline(r);
  }
  const dark = level >= 3;
  r.rect(1, 7, 4, 8, dark ? 'darkGrey' : 'grey');
  if (level === 3) {
    // The tall tower broke off: a jagged top.
    r.rect(5, 5, 5, 10, 'grey');
    r.art(5, 3, ['.g...', 'gg.g.'], { g: 'grey' });
  } else {
    r.rect(5, 2, 5, 13, 'silver');
    r.rect(7, 0, 1, 2, 'silver');
  }
  r.rect(10, 5, 5, 10, dark ? 'slate' : 'darkGrey');
  const windows: [number, number][] = [
    [2, 9],
    [2, 12],
    [6, 7],
    [8, 10],
    [6, 13],
    [11, 7],
    [13, 10],
    [11, 12],
    ...(level === 3 ? [] : ([[6, 4], [8, 4]] as [number, number][])),
  ];
  // Fewer lit windows as the city falls; in decline the dark ones are boarded up.
  const lit = [10, 8, 4, 1][level];
  windows.forEach(([x, y], i) => r.set(x, y, i < lit ? 'yellow' : level === 3 ? 'brown' : 'navy'));
  if (level === 0) {
    disc(r, 1.5, 1.5, 1.6, 'yellow');
    r.rect(12, 12, 1, 3, 'brown');
    disc(r, 12.5, 10.5, 2, 'green');
  }
  if (level >= 2) r.art(10, 0, level === 2 ? ['.ss.', 'ss..', '.s..'] : ['.sss', 'sss.', '.ss.', '..s.'], { s: level === 2 ? 'silver' : 'grey' });
  return outline(r);
}

/** World news: a globe with continents. */
function globe(): Raster {
  const r = new Raster(16, 16);
  disc(r, 7.5, 7.5, 6.3, 'blue');
  r.art(0, 0, [
    '................',
    '................',
    '.....gg.........',
    '....gggg...g....',
    '...ggggg..ggg...',
    '...gggg...gggg..',
    '....gg.....ggg..',
    '.....g......g...',
    '..........gg....',
    '.....gg..ggg....',
    '....gggg..g.....',
    '.....ggg........',
    '......g.........',
  ], { g: 'green' });
  r.set(5, 3, 'white');
  return outline(r);
}

/** Issue level: a newspaper that gets louder — grey with "z", plain, with a star, with a red burst. */
function issue(level: 0 | 1 | 2 | 3): Raster {
  const r = new Raster(16, 16);
  const paper: Color = level === 0 ? 'silver' : 'sand';
  r.rect(1, 3, 11, 12, paper);
  r.rect(2, 4, 9, 2, level === 0 ? 'grey' : 'darkBrown');
  for (const y of [8, 10, 12]) r.rect(2, y, 9, 1, 'grey');
  if (level === 0) {
    r.art(9, 0, ['zzzz.', '..z..', '.z...', 'zzzz.'], { z: 'blue' });
  } else if (level === 2) {
    r.art(9, 0, ['..y..', '.yyy.', 'yyyyy', '.yyy.', '.y.y.'], { y: 'cyan' });
  } else if (level === 3) {
    r.art(8, 0, ['..r.r..', 'r.ryr.r', '.ryyyr.', 'rryyyrr', '.ryyyr.', 'r.ryr.r', '..r.r..'], { r: 'red', y: 'yellow' });
  }
  return outline(r);
}

const truthArt: Record<number, string[]> = {
  0: [
    '................',
    '................',
    '................',
    '............gg..',
    '...........ggg..',
    '..........ggg...',
    '.........ggg....',
    '..gg....ggg.....',
    '..ggg..ggg......',
    '...ggggggg......',
    '....ggggg.......',
    '.....ggg........',
    '................',
    '................',
    '................',
    '................',
  ],
  2: [
    '................',
    '................',
    '...rr......rr...',
    '...rrr....rrr...',
    '....rrr..rrr....',
    '.....rrrrrr.....',
    '......rrrr......',
    '......rrrr......',
    '.....rrrrrr.....',
    '....rrr..rrr....',
    '...rrr....rrr...',
    '...rr......rr...',
    '................',
    '................',
    '................',
    '................',
  ],
};

/** Truth levels as distortion buttons: true, half-true, lie. */
function truth(level: 0 | 1 | 2): Raster {
  const r = new Raster(16, 16);
  if (level === 1) {
    disc(r, 7.5, 7, 5.5, 'silver');
    for (let y = 0; y < 16; y++) for (let x = 8; x < 16; x++) if (r.get(x, y)) r.set(x, y, 'amber');
  } else r.art(0, 0, truthArt[level], { g: 'green', r: 'red' });
  return outline(r);
}

/** Placement buttons: a brief, an article, the front page. */
function placement(level: 0 | 1 | 2): Raster {
  const r = new Raster(16, 16);
  if (level === 0) {
    r.rect(4, 6, 8, 6, 'sand');
    for (const y of [8, 10]) r.rect(5, y, 6, 1, 'grey');
  } else if (level === 1) {
    r.rect(3, 2, 10, 12, 'sand');
    r.rect(4, 3, 8, 1, 'darkBrown');
    for (const y of [5, 7, 9, 11]) {
      r.rect(4, y, 3, 1, 'grey');
      r.rect(8, y, 4, 1, 'grey');
    }
  } else {
    r.rect(2, 1, 12, 14, 'sand');
    r.rect(3, 2, 10, 3, 'red');
    r.rect(3, 6, 5, 4, 'blue');
    for (const y of [6, 8, 10]) r.rect(9, y, 4, 1, 'grey');
    for (const y of [12, 13]) r.rect(3, y, 10, 1, 'grey');
  }
  return outline(r);
}

/** A gold coin seen from the side: top face with a glint, then its rim. */
const COIN = [
  '..kkkkkkkk..',
  '.kyyyyyyyyk.',
  'kyywyyyyyyyk',
  'kaayyyyyyaak',
  '.kaaaaaaaak.',
  '..kkkkkkkk..',
];
/** Free: only the outline of a coin, nothing in it. */
const NO_COIN = [
  '..ssssssss..',
  '.s........s.',
  's..........s',
  's..........s',
  '.s........s.',
  '..ssssssss..',
];

/** Cover price of the paper: an empty place (free), then a stack of one, two and three coins (CONCEPT.md §3.4). */
function price(level: 0 | 1 | 2 | 3): Raster {
  const r = new Raster(16, 16);
  if (level === 0) r.art(2, 10, NO_COIN, { s: 'grey' });
  // From the bottom up, each coin a little higher and drawn over the one below.
  for (let i = 0; i < level; i++) r.art(2, 10 - i * 3, COIN, { k: 'ink', y: 'yellow', a: 'amber', w: 'white' });
  return r;
}

/** The rival paper «Вечерний Набат»: a newspaper with a red masthead and a skull on the front page. */
function rival(): Raster {
  const r = new Raster(16, 16);
  r.rect(2, 2, 12, 12, 'sand');
  r.rect(3, 3, 10, 2, 'red');
  r.art(4, 6, ['.www.', 'wkwkw', 'wwwww', '.w.w.'], { w: 'white', k: 'ink' });
  for (const y of [6, 8, 10, 12]) r.rect(10, y, 3, 1, 'grey');
  r.rect(3, 12, 6, 1, 'grey');
  return outline(r);
}

/** The guardian paper «Голос города»: a newspaper with a blue masthead and a heart. */
function guardian(): Raster {
  const r = new Raster(16, 16);
  r.rect(2, 2, 12, 12, 'sand');
  r.rect(3, 3, 10, 2, 'blue');
  r.art(4, 6, ['r.r.', 'rrrr', '.rr.'], { r: 'red' });
  for (const y of [6, 8, 10, 12]) r.rect(10, y, 3, 1, 'grey');
  r.rect(3, 12, 6, 1, 'grey');
  return outline(r);
}

/** Upgrades: a shopping cart with goods in it. */
function cart(): Raster {
  const r = new Raster(16, 16);
  r.art(0, 1, [
    'ss..............',
    '.s..............',
    '.ssssssssssssss.',
    '.saaaaaaaaaaaas.',
    '..saaoaaoaaoas..',
    '..saaaaaaaaaas..',
    '...saaoaaoaas...',
    '...ssssssssss...',
    '...s............',
    '...sssssssssss..',
    '................',
    '....ss.....ss...',
    '...sggs...sggs..',
    '....ss.....ss...',
  ], { s: 'white', a: 'amber', o: 'orange', g: 'grey' });
  return outline(r);
}

/** An offer with a catch: a sealed envelope with a red wax seal. */
function offer(): Raster {
  const r = new Raster(16, 16);
  r.rect(1, 4, 14, 9, 'sand');
  r.art(1, 4, ['g............g', '.g..........g.', '..g........g..', '...g......g...', '....g....g....', '.....gggg.....'], { g: 'grey' });
  r.rect(7, 8, 2, 2, 'red');
  return outline(r);
}

/** A task: a clipboard with a tick (CONCEPT.md §4.8). */
function task(): Raster {
  const r = new Raster(16, 16);
  r.rect(3, 2, 10, 13, 'sand');
  r.rect(6, 1, 4, 3, 'grey');
  r.art(5, 6, ['......g', '.....g.', 'g...g..', '.g.g...', '..g....'], { g: 'darkGreen' });
  r.rect(5, 12, 6, 1, 'grey');
  return outline(r);
}

/** The election: a ballot going into a box (CONCEPT.md §4.9). */
function ballot(): Raster {
  const r = new Raster(16, 16);
  r.rect(4, 2, 8, 6, 'white');
  r.rect(6, 4, 4, 1, 'grey');
  r.rect(2, 8, 12, 7, 'blue');
  r.rect(5, 8, 6, 1, 'ink');
  r.rect(2, 10, 12, 1, 'navyBlue');
  return outline(r);
}

/** The audit: a magnifying glass over a page. */
function audit(): Raster {
  const r = new Raster(16, 16);
  r.rect(2, 2, 9, 11, 'sand');
  r.rect(4, 4, 5, 1, 'grey');
  r.rect(4, 6, 5, 1, 'grey');
  r.art(7, 7, ['.sss.', 's...s', 's...s', 's...s', '.sss.'], { s: 'slate' });
  r.rect(8, 8, 3, 3, 'cyan');
  r.art(11, 11, ['b..', '.b.', '..b'], { b: 'brown' });
  return outline(r);
}

/** The governor's visit: a crown. */
function governor(): Raster {
  const r = new Raster(16, 16);
  r.art(2, 4, ['a....a....a.', 'aa..aaa..aa.', 'aaaaaaaaaaa.', 'aaaaaaaaaaa.', 'aarraaarraa.', 'aaaaaaaaaaa.'], { a: 'amber', r: 'red' });
  r.rect(2, 10, 11, 2, 'orange');
  return outline(r);
}

export const uiIcons: Record<string, () => Raster> = {
  task,
  ballot,
  audit,
  governor,
  rival,
  offer,
  cart,
  guardian,
  money,
  readers,
  reputation,
  residents,
  city,
  city_state_0: () => cityState(0),
  city_state_1: () => cityState(1),
  city_state_2: () => cityState(2),
  city_state_3: () => cityState(3),
  city_state_4: () => cityState(4),
  globe,
  issue_0: () => issue(0),
  issue_1: () => issue(1),
  issue_2: () => issue(2),
  issue_3: () => issue(3),
  truth_0: () => truth(0),
  truth_1: () => truth(1),
  truth_2: () => truth(2),
  place_0: () => placement(0),
  place_1: () => placement(1),
  place_2: () => placement(2),
  price_0: () => price(0),
  price_1: () => price(1),
  price_2: () => price(2),
  price_3: () => price(3),
};
