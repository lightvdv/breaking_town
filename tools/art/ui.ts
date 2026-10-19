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

/** One gold coin with a rim and a glint. */
function coin(r: Raster, cx: number, cy: number, radius: number): void {
  // Its own ink rim, so overlapping coins stay apart.
  disc(r, cx, cy, radius + 1, 'ink');
  disc(r, cx, cy, radius, 'amber');
  disc(r, cx, cy, radius - 1.3, 'yellow');
  r.set(Math.round(cx - radius / 2), Math.round(cy - radius / 2), 'white');
}

/** Cover price of the paper: an empty ring (free), then one, two and three coins (CONCEPT.md §3.4). */
function price(level: 0 | 1 | 2 | 3): Raster {
  const r = new Raster(16, 16);
  if (level === 0) {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        if (d >= 4.3 && d <= 5.8) r.set(x, y, 'silver');
      }
    }
  } else if (level === 1) coin(r, 7.5, 7.5, 5);
  else if (level === 2) {
    coin(r, 5, 9.5, 4);
    coin(r, 10.5, 6, 4);
  } else {
    coin(r, 4.5, 10.5, 3.6);
    coin(r, 11, 10.5, 3.6);
    coin(r, 7.75, 4.5, 3.6);
  }
  return outline(r);
}

export const uiIcons: Record<string, () => Raster> = {
  money,
  readers,
  reputation,
  residents,
  city,
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
