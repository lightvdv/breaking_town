import type { Color } from './palette';
import { Raster } from './raster';

/** 16×16 residents (CONCEPT.md §7.2). The figure is drawn facing the camera ("front") or away ("back"). */
export interface Look {
  skin: Color;
  hair: Color;
  hat: null | { kind: 'helmet' | 'cap'; color: Color; dark: Color };
  top: Color;
  topDark: Color;
  shirt: Color | null;
  pants: Color;
  shoes: Color;
  glasses: boolean;
  cane: boolean;
}

type Arms = 'down' | 'swingA' | 'swingB' | 'up' | 'out' | 'work1' | 'work2' | 'talk1' | 'talk2' | 'fist' | 'hold';
type Face = 'normal' | 'blink' | 'open' | 'angry' | 'happy';

interface Pose {
  back?: boolean;
  /** Whole-figure vertical offset (jumps). */
  dy?: number;
  /** Upper-body offset (stomping). */
  bodyDy?: number;
  legs?: 0 | 1 | 2 | 3;
  arms?: Arms;
  face?: Face;
  prop?: 'bag' | 'suitcase' | 'sign';
  steam?: number;
}

export const ROWS: { name: string; frames: Pose[] }[] = [
  { name: 'idle_front', frames: [{}, { face: 'blink' }] },
  { name: 'idle_back', frames: [{ back: true }, { back: true, bodyDy: 1 }] },
  { name: 'walk_front', frames: walk({}) },
  { name: 'walk_back', frames: walk({ back: true }) },
  { name: 'walk_bag_front', frames: walk({ prop: 'bag', arms: 'hold' }) },
  { name: 'walk_bag_back', frames: walk({ back: true, prop: 'bag', arms: 'hold' }) },
  { name: 'work', frames: [{ arms: 'work1' }, { arms: 'work2' }] },
  { name: 'walk_suitcase_front', frames: walk({ prop: 'suitcase', arms: 'hold' }) },
  { name: 'walk_suitcase_back', frames: walk({ back: true, prop: 'suitcase', arms: 'hold' }) },
  {
    name: 'protest',
    frames: [
      { prop: 'sign', arms: 'up', face: 'open' },
      { prop: 'sign', arms: 'up', dy: -1, face: 'angry' },
      { prop: 'sign', arms: 'up', face: 'open' },
      { prop: 'sign', arms: 'up', dy: -1, face: 'angry' },
    ],
  },
  { name: 'walk_angry_front', frames: walk({ face: 'angry' }, true) },
  { name: 'walk_angry_back', frames: walk({ back: true }, true) },
  {
    name: 'react_scared',
    frames: [{ face: 'open' }, { dy: -2, arms: 'up', face: 'open' }, { dy: -3, arms: 'up', face: 'open' }, { arms: 'up', face: 'open' }],
  },
  {
    name: 'react_happy',
    frames: [{ face: 'happy' }, { dy: -2, arms: 'up', face: 'happy' }, { dy: -3, arms: 'up', face: 'happy' }, { arms: 'up', face: 'happy' }],
  },
  { name: 'react_shrug', frames: [{}, { arms: 'out', bodyDy: -1 }, { arms: 'out', bodyDy: -1, face: 'blink' }, { arms: 'out' }] },
  {
    name: 'react_talk',
    frames: [{ arms: 'talk1', face: 'open' }, { arms: 'talk2' }, { arms: 'talk1', face: 'open' }, { arms: 'talk2', face: 'happy' }],
  },
  {
    name: 'react_outraged',
    frames: [
      { arms: 'fist', face: 'angry', steam: 0 },
      { arms: 'fist', face: 'angry', bodyDy: 1, steam: 1 },
      { arms: 'fist', face: 'angry', steam: 2 },
      { arms: 'fist', face: 'angry', bodyDy: 1, steam: 3 },
    ],
  },
];

function walk(base: Pose, steam = false): Pose[] {
  return ([0, 1, 2, 3] as const).map((legs) => ({
    arms: legs === 1 ? 'swingA' : legs === 3 ? 'swingB' : 'down',
    ...base,
    legs,
    dy: legs % 2 === 1 ? -1 : 0,
    steam: steam ? legs : undefined,
  }));
}

function drawFigure(look: Look, p: Pose): Raster {
  const r = new Raster(16, 16);
  const dy = p.dy ?? 0;
  const by = dy + (p.bodyDy ?? 0);
  const set = (x: number, y: number, c: Color) => r.set(x, y, c);
  const legs = p.legs ?? 0;

  // Legs and shoes.
  const leg = (x: number, lift: boolean) => {
    set(x, 12 + dy, look.pants);
    if (lift) {
      set(x, 13 + dy, look.shoes);
    } else {
      set(x, 13 + dy, look.pants);
      set(x, 14 + dy, look.shoes);
      set(x + (x < 7 ? -1 : 1), 14 + dy, look.shoes);
    }
  };
  leg(6, legs === 3);
  leg(8, legs === 1);
  if (look.cane) {
    for (let y = 9; y <= 14; y++) set(11, y + (y > 11 ? dy : by), 'wood');
    set(10, 9 + by, 'brown');
  }

  // Torso.
  for (let y = 7; y <= 11; y++) {
    for (let x = 5; x <= 9; x++) set(x, y + by, x === 9 && !p.back ? look.topDark : look.top);
  }
  if (look.shirt && !p.back) {
    set(7, 7 + by, look.shirt);
    set(7, 8 + by, look.shirt === 'white' ? 'red' : look.shirt);
  }

  // Arms: [x, y] cells of sleeve then hand.
  const arms = p.arms ?? 'down';
  const sleeve = (cells: number[][], hand: number[]) => {
    for (const [x, y] of cells) set(x, y + by, look.top);
    set(hand[0], hand[1] + by, look.skin);
  };
  const down = (x: number, short = false) =>
    sleeve(
      [
        [x, 7],
        [x, 8],
        [x, 9],
        ...(short ? [] : [[x, 10]]),
      ],
      [x, short ? 10 : 11],
    );
  const up = (x: number) =>
    sleeve(
      [
        [x, 7],
        [x, 6],
        [x, 5],
      ],
      [x, 4],
    );
  switch (arms) {
    case 'down':
    case 'hold':
      down(4);
      down(10);
      break;
    case 'swingA':
      down(4, true);
      down(10);
      break;
    case 'swingB':
      down(4);
      down(10, true);
      break;
    case 'up':
      up(4);
      up(10);
      break;
    case 'out':
      sleeve(
        [
          [4, 8],
          [3, 8],
        ],
        [2, 7],
      );
      sleeve(
        [
          [10, 8],
          [11, 8],
        ],
        [12, 7],
      );
      break;
    case 'work1':
      down(4);
      up(10);
      set(11, 3 + by, 'darkGrey');
      set(12, 3 + by, 'darkGrey');
      set(11, 4 + by, 'wood');
      break;
    case 'work2':
      down(4);
      sleeve(
        [
          [10, 7],
          [11, 8],
        ],
        [12, 9],
      );
      set(13, 9 + by, 'wood');
      set(13, 10 + by, 'darkGrey');
      set(14, 10 + by, 'darkGrey');
      break;
    case 'talk1':
      down(4);
      sleeve(
        [
          [10, 7],
          [11, 6],
        ],
        [12, 5],
      );
      break;
    case 'talk2':
      down(4);
      sleeve(
        [
          [10, 7],
          [11, 8],
        ],
        [12, 8],
      );
      break;
    case 'fist':
      down(4);
      up(10);
      set(11, 4 + by, look.skin);
      set(10, 3 + by, look.skin);
      break;
  }

  // Head.
  const hy = by;
  for (let x = 6; x <= 8; x++) set(x, 2 + hy, look.hair);
  for (let x = 5; x <= 9; x++) set(x, 3 + hy, look.hair);
  for (let x = 5; x <= 9; x++) set(x, 4 + hy, x === 5 || x === 9 ? look.hair : look.skin);
  for (let x = 5; x <= 9; x++) set(x, 5 + hy, look.skin);
  for (let x = 6; x <= 8; x++) set(x, 6 + hy, look.skin);
  if (p.back) {
    for (let x = 5; x <= 9; x++) {
      set(x, 4 + hy, look.hair);
      set(x, 5 + hy, look.hair);
    }
    set(6, 6 + hy, look.hair);
    set(8, 6 + hy, look.hair);
  } else {
    const face = p.face ?? 'normal';
    const eye: Color = face === 'blink' ? look.skin : 'ink';
    if (look.glasses) {
      set(6, 5 + hy, 'ink');
      set(7, 5 + hy, 'slate');
      set(8, 5 + hy, 'ink');
    } else {
      set(6, 5 + hy, eye);
      set(8, 5 + hy, eye);
      if (face === 'blink') {
        set(6, 5 + hy, 'skinDark');
        set(8, 5 + hy, 'skinDark');
      }
    }
    if (face === 'open') set(7, 6 + hy, 'ink');
    if (face === 'happy') {
      set(7, 6 + hy, 'darkRed');
      set(5, 5 + hy, 'pink');
      set(9, 5 + hy, 'pink');
    }
    if (face === 'angry') {
      set(6, 4 + hy, 'ink');
      set(8, 4 + hy, 'ink');
      set(5, 5 + hy, 'red');
      set(9, 5 + hy, 'red');
      set(7, 6 + hy, 'darkRed');
    }
  }
  if (look.hat?.kind === 'helmet') {
    for (let x = 6; x <= 8; x++) set(x, 1 + hy, look.hat.color);
    for (let x = 5; x <= 9; x++) set(x, 2 + hy, look.hat.color);
    for (let x = 4; x <= 10; x++) set(x, 3 + hy, look.hat.dark);
  }
  if (look.hat?.kind === 'cap') {
    for (let x = 5; x <= 9; x++) set(x, 2 + hy, look.hat.color);
    for (let x = 5; x <= 9; x++) set(x, 3 + hy, look.hat.color);
    if (!p.back) {
      set(10, 3 + hy, look.hat.dark);
      set(11, 3 + hy, look.hat.dark);
    }
  }

  // Props.
  if (p.prop === 'bag') {
    r.rect(10, 11 + by, 3, 1, 'wood');
    r.rect(10, 12 + by, 3, 2, 'tan');
    set(11, 10 + by, 'wood');
  }
  if (p.prop === 'suitcase') {
    r.rect(10, 11 + by, 4, 3, 'brown');
    r.rect(10, 12 + by, 4, 1, 'tan');
    set(11, 10 + by, 'ink');
    set(12, 10 + by, 'ink');
  }
  if (p.prop === 'sign') {
    for (let y = 2; y <= 6; y++) set(11, y + by, 'wood');
    r.rect(8, by - 1, 7, 4, 'white');
    r.rect(9, by, 5, 1, 'red');
    r.rect(9, 1 + by, 3, 1, 'red');
  }

  r.outline('ink');

  if (p.steam !== undefined) {
    const t = p.steam % 4;
    set(4 + t, 1 - (t % 2) + by, 'white');
    set(10 - t, 0 + (t % 2) + by, 'silver');
  }
  return r;
}

const base = {
  shirt: null,
  glasses: false,
  cane: false,
  hat: null,
  shoes: 'ink' as Color,
};

/** Two palette variants per group (CONCEPT.md §7.2). */
export const looks: Record<string, Look[]> = {
  pensioners: [
    { ...base, skin: 'skin', hair: 'silver', top: 'wood', topDark: 'brown', pants: 'darkGrey', cane: true },
    { ...base, skin: 'skinDark', hair: 'white', top: 'plum', topDark: 'darkBrown', pants: 'slate', cane: true },
  ],
  workers: [
    {
      ...base,
      skin: 'skin',
      hair: 'brown',
      hat: { kind: 'helmet', color: 'yellow', dark: 'amber' },
      top: 'blue',
      topDark: 'navyBlue',
      pants: 'navyBlue',
      shoes: 'darkBrown',
    },
    {
      ...base,
      skin: 'skinDark',
      hair: 'ink',
      hat: { kind: 'helmet', color: 'orange', dark: 'rust' },
      top: 'orange',
      topDark: 'rust',
      pants: 'slate',
      shoes: 'darkBrown',
    },
  ],
  youth: [
    { ...base, skin: 'skin', hair: 'amber', hat: { kind: 'cap', color: 'red', dark: 'darkRed' }, top: 'magenta', topDark: 'plum', pants: 'slate' },
    { ...base, skin: 'skinDark', hair: 'ink', hat: { kind: 'cap', color: 'green', dark: 'forest' }, top: 'cyan', topDark: 'blue', pants: 'navy' },
  ],
  intelligentsia: [
    { ...base, skin: 'skin', hair: 'darkBrown', top: 'darkGrey', topDark: 'slate', shirt: 'white', pants: 'navy', glasses: true },
    { ...base, skin: 'skinDark', hair: 'brown', top: 'wood', topDark: 'brown', shirt: 'white', pants: 'darkBrown', glasses: true },
  ],
};

export function residentSheet(look: Look): Raster {
  const sheet = new Raster(16 * 4, 16 * ROWS.length);
  ROWS.forEach((row, j) => row.frames.forEach((pose, i) => sheet.blit(drawFigure(look, pose), i * 16, j * 16)));
  return sheet;
}
