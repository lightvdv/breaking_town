import type { Color } from './palette';
import { Raster, noise } from './raster';
import { box, columns, fillDiamond, hipRoof, lowerY, topOf, upperY, wallRect, type Diamond } from './iso';

export type BuildingState = 'active' | 'closed' | 'abandoned';

export interface BuildingArt {
  type: string;
  size: 1 | 2;
  states: BuildingState[];
  variants: number;
  /** Draws one frame of one state/variant into a fresh raster of size 64·size. */
  draw(r: Raster, state: BuildingState, variant: number, frame: number): void;
}

export const FRAMES = 4;

function pad(r: Raster, size: number): Diamond {
  const W = 64 * size;
  const ground: Diamond = { cx: W / 2, bottom: W - 2, w: W - 8 };
  fillDiamond(r, ground, (x, y) => (noise(x, y, 7) < 0.08 ? 'grey' : 'silver'));
  return { cx: W / 2, bottom: W - 5, w: W - 20 };
}

function window(
  r: Raster,
  d: Diamond,
  side: 'left' | 'right',
  u: number,
  v: number,
  lit: boolean,
  boarded = false,
  w = 3,
  h = 4,
): void {
  wallRect(r, d, side, u, v, w, h, (du, dv) => {
    if (boarded) return (du + dv) % 3 === 0 ? 'brown' : 'wood';
    if (dv === h - 1) return 'navy';
    if (!lit) return dv === h - 2 && du === 0 ? 'slate' : 'navy';
    return du === 0 && dv === h - 2 ? 'white' : 'yellow';
  });
}

function door(r: Raster, d: Diamond, side: 'left' | 'right', u: number, color: Color, boarded = false): void {
  wallRect(r, d, side, u, 0, 4, 7, (du, dv) => {
    if (boarded) return dv % 2 === 0 ? 'brown' : 'wood';
    if (dv === 6) return 'darkBrown';
    return du === 3 && dv === 3 ? 'amber' : color;
  });
}

/** Rising smoke puffs above (x, y); offset by animation frame. */
function smoke(r: Raster, x: number, y: number, frame: number, big = false): void {
  for (let i = 0; i < 3; i++) {
    const t = (frame + i * (FRAMES / 3)) % FRAMES;
    const py = y - t * (big ? 5 : 3) - i;
    const px = x + Math.round(Math.sin((t + i) * 1.3) * 2) + t;
    const rad = (big ? 2 : 1) + (t > 1 ? 1 : 0);
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) {
        if (dx * dx + dy * dy <= rad * rad) r.set(px + dx, py + dy, dy < 0 ? 'white' : 'silver');
      }
    }
  }
}

const homeColors: { left: Color; right: Color; roof: [Color, Color, Color] }[] = [
  { left: 'tan', right: 'sand', roof: ['red', 'darkRed', 'rust'] },
  { left: 'pink', right: 'skin', roof: ['blue', 'navyBlue', 'slate'] },
  { left: 'silver', right: 'white', roof: ['darkGreen', 'forest', 'deepTeal'] },
];

const home: BuildingArt = {
  type: 'home',
  size: 1,
  states: ['active', 'abandoned'],
  variants: homeColors.length,
  draw(r, state, variant, frame) {
    const d = pad(r, 1);
    const c = homeColors[variant];
    const empty = state === 'abandoned';
    const h = 16;
    box(r, d, h, { top: c.right, left: c.left, right: c.right });
    // Two floors of windows; lights flicker between frames.
    for (const [side, u] of [
      ['left', 4],
      ['left', 11],
      ['right', 9],
    ] as const) {
      for (const v of [3, 10]) {
        const lit = !empty && noise(u + v, frame >> 1, variant) > 0.45;
        window(r, d, side, u, v, lit, empty && v === 3);
      }
    }
    door(r, d, 'right', 3, empty ? 'darkBrown' : 'wood', empty);
    hipRoof(r, d, h, 5, { top: c.roof[0], left: c.roof[1], right: c.roof[2] });
    // Chimney with smoke while someone lives here.
    const cx = d.cx + 8;
    const cy = upperY(d, cx) - h - 4;
    r.rect(cx, cy - 6, 3, 7, empty ? 'darkGrey' : 'brown');
    r.rect(cx, cy - 7, 3, 1, 'darkBrown');
    if (!empty) smoke(r, cx + 1, cy - 10, frame);
    if (empty) r.set(d.cx - 6, lowerY(d, d.cx - 6) - 12, 'ink');
  },
};

const shop: BuildingArt = {
  type: 'shop',
  size: 1,
  states: ['active', 'closed'],
  variants: 1,
  draw(r, state, _variant, frame) {
    const d = pad(r, 1);
    const closed = state === 'closed';
    const h = 18;
    box(r, d, h, { top: 'grey', left: 'silver', right: 'white', rim: 'darkGrey' });
    // Shop window with a glint that travels across it.
    wallRect(r, d, 'left', 3, 2, 14, 8, (du, dv) => {
      if (closed) return (du + dv) % 4 === 0 ? 'brown' : 'wood';
      if (dv === 0 || dv === 7) return 'darkGrey';
      return du === (frame * 4) % 14 || du === ((frame * 4) % 14) + 1 ? 'white' : dv > 4 ? 'cyan' : 'blue';
    });
    door(r, d, 'right', 4, 'blue', closed);
    window(r, d, 'right', 11, 4, !closed, closed);
    // Striped awning.
    for (const side of ['left', 'right'] as const) {
      wallRect(r, d, side, 0, h - 6, 20, 3, (du, dv) => {
        if (closed) return dv === 2 ? 'darkGrey' : 'grey';
        return dv === 2 ? 'darkRed' : Math.floor(du / 2) % 2 === 0 ? 'red' : 'white';
      });
    }
    // Rooftop sign.
    const top = topOf(d, h);
    r.rect(top.cx - 7, upperY(top, top.cx) + 1, 14, 6, closed ? 'darkGrey' : 'amber');
    r.rect(top.cx - 7, upperY(top, top.cx) + 7, 14, 1, 'brown');
    if (!closed) {
      // A shopping-cart pictogram.
      r.art(top.cx - 4, upperY(top, top.cx) + 2, ['x.....', '.xxxxx', '.xxxx.', '..x.x.'], { x: 'darkBrown' });
    }
  },
};

const bar: BuildingArt = {
  type: 'entertainment',
  size: 1,
  states: ['active', 'closed'],
  variants: 1,
  draw(r, state, _variant, frame) {
    const d = pad(r, 1);
    const closed = state === 'closed';
    const h = 17;
    box(r, d, h, { top: 'darkBrown', left: 'plum', right: 'magenta', rim: 'brown' });
    for (const u of [3, 10]) window(r, d, 'left', u, 5, !closed, closed, 4, 5);
    door(r, d, 'right', 4, 'darkBrown', closed);
    window(r, d, 'right', 11, 5, !closed, closed, 4, 5);
    // Neon heart that blinks and changes color.
    const top = topOf(d, h);
    const on = !closed && frame !== 2;
    const neon: Color = frame % 2 === 0 ? 'pink' : 'cyan';
    r.rect(top.cx - 1, upperY(top, top.cx) - 2, 1, 4, 'darkGrey');
    r.art(top.cx - 4, upperY(top, top.cx) - 9, ['.xx.xx.', 'xxxxxxx', 'xxxxxxx', '.xxxxx.', '..xxx..', '...x...'], {
      x: on ? neon : 'darkGrey',
    });
  },
};

const factCheckers: BuildingArt = {
  type: 'factCheckers',
  size: 1,
  states: ['active', 'closed'],
  variants: 1,
  draw(r, state, _variant, frame) {
    const d = pad(r, 1);
    const closed = state === 'closed';
    const h = 20;
    box(r, d, h, { top: 'forest', left: 'darkGreen', right: 'green', rim: 'deepTeal' });
    for (const v of [4, 12]) {
      window(r, d, 'left', 4, v, !closed, closed);
      window(r, d, 'left', 11, v, !closed, closed);
      window(r, d, 'right', 10, v, !closed, closed);
    }
    door(r, d, 'right', 3, 'deepTeal', closed);
    // Magnifying glass sign and an antenna with a blinking light.
    const top = topOf(d, h);
    const y0 = upperY(top, top.cx) - 6;
    r.art(top.cx - 6, y0, ['.xxx..', 'xccdx.', 'xcccx.', 'xdccx.', '.xxxx.', '....xx', '.....x'], {
      x: closed ? 'darkGrey' : 'white',
      c: closed ? 'slate' : 'cyan',
      d: closed ? 'slate' : 'blue',
    });
    r.rect(top.cx + 6, y0 - 4, 1, 9, 'grey');
    r.set(top.cx + 6, y0 - 5, !closed && frame % 2 === 0 ? 'hotRed' : 'darkRed');
  },
};

const factory: BuildingArt = {
  type: 'factory',
  size: 2,
  states: ['active', 'closed'],
  variants: 1,
  draw(r, state, _variant, frame) {
    const d = pad(r, 2);
    const closed = state === 'closed';
    const h = 26;
    box(r, d, h, { top: 'darkGrey', left: 'grey', right: 'silver', rim: 'slate' });
    // Rust stains on a closed factory.
    if (closed) {
      wallRect(r, d, 'left', 0, 0, 54, h, (du, dv) => (noise(du, dv, 3) < 0.06 ? 'rust' : null));
      wallRect(r, d, 'right', 0, 0, 54, h, (du, dv) => (noise(du, dv, 4) < 0.06 ? 'rust' : null));
    }
    for (let u = 4; u < 50; u += 8) {
      window(r, d, 'left', u, 13, !closed && noise(u, frame >> 1, 1) > 0.25, closed, 5, 6);
      window(r, d, 'left', u, 4, !closed, false, 5, 5);
    }
    for (let u = 22; u < 50; u += 8) window(r, d, 'right', u, 13, !closed, closed, 5, 6);
    // Loading gate with hazard stripes.
    wallRect(r, d, 'right', 5, 0, 12, 11, (du, dv) => {
      if (dv >= 9) return (du + dv) % 4 < 2 ? 'amber' : 'ink';
      if (closed) return dv % 2 === 0 ? 'brown' : 'wood';
      return dv % 3 === 0 ? 'slate' : 'darkGrey';
    });
    // Skylight strips on the roof.
    const top = topOf(d, h);
    for (const off of [-16, 0, 16]) {
      for (const x of columns(top)) {
        const y = Math.round((upperY(top, x) + lowerY(top, x)) / 2) + Math.round((x - top.cx) / 2) + off / 2;
        if (y > upperY(top, x) + 1 && y < lowerY(top, x) - 1 && Math.abs(x - top.cx - off) < 30) {
          r.set(x, y, closed ? 'slate' : 'cyan');
          r.set(x, y + 1, closed ? 'navy' : 'blue');
        }
      }
    }
    // Chimney at the back with thick smoke.
    const chimney: Diamond = { cx: d.cx + 20, bottom: upperY(top, d.cx + 20) + 14, w: 12 };
    box(r, chimney, 36, { top: 'ink', left: 'brown', right: 'rust', rim: 'darkBrown' });
    wallRect(r, chimney, 'left', 0, 26, 6, 2, 'silver');
    wallRect(r, chimney, 'right', 0, 26, 6, 2, 'white');
    if (!closed) smoke(r, chimney.cx, chimney.bottom - 44, frame, true);
  },
};

const hospital: BuildingArt = {
  type: 'hospital',
  size: 2,
  states: ['active', 'closed'],
  variants: 1,
  draw(r, state, _variant, frame) {
    const d = pad(r, 2);
    const closed = state === 'closed';
    const h = 30;
    box(r, d, h, { top: 'silver', left: 'silver', right: 'white', rim: 'grey' });
    for (let u = 4; u < 52; u += 7) {
      for (const v of [5, 14, 22]) {
        window(r, d, 'left', u, v, !closed && noise(u, v + (frame >> 1), 2) > 0.3, closed && v === 5, 4, 5);
      }
    }
    for (let u = 22; u < 52; u += 7) for (const v of [14, 22]) window(r, d, 'right', u, v, !closed, false, 4, 5);
    // Entrance with a red band and cross sign.
    wallRect(r, d, 'right', 4, 0, 14, 10, (du, dv) => {
      if (dv === 9) return 'red';
      if (closed) return (du + dv) % 3 === 0 ? 'brown' : 'wood';
      return du > 3 && du < 10 ? (dv % 4 === 0 ? 'blue' : 'cyan') : 'silver';
    });
    const cross = closed ? 'grey' : 'red';
    wallRect(r, d, 'right', 8, 15, 6, 6, (du, dv) => ((du >= 2 && du <= 3) || (dv >= 2 && dv <= 3) ? cross : null));
    // Big cross on the roof and a blinking light.
    const top = topOf(d, h);
    const cy = Math.round((upperY(top, top.cx) + lowerY(top, top.cx)) / 2);
    r.art(top.cx - 6, cy - 3, ['....xxxx....', 'xxxxxxxxxxxx', 'xxxxxxxxxxxx', '....xxxx....'], { x: cross });
    r.rect(top.cx + 18, cy - 8, 2, 4, 'darkGrey');
    r.rect(top.cx + 18, cy - 10, 2, 2, !closed && frame % 2 === 0 ? 'hotRed' : 'darkRed');
  },
};

const cityHall: BuildingArt = {
  type: 'cityHall',
  size: 2,
  states: ['active', 'closed'],
  variants: 1,
  draw(r, state, _variant, frame) {
    const d = pad(r, 2);
    const closed = state === 'closed';
    const h = 24;
    // Steps in front.
    fillDiamond(r, { cx: d.cx, bottom: d.bottom + 2, w: d.w + 4 }, (_x, y) => (y % 2 === 0 ? 'silver' : 'white'));
    box(r, d, h, { top: 'tan', left: 'tan', right: 'sand', rim: 'wood' });
    // Colonnade.
    for (const side of ['left', 'right'] as const) {
      wallRect(r, d, side, 0, 0, 54, h - 4, (du, dv) => {
        if (dv >= h - 6) return 'wood';
        if (du % 6 === 1 || du % 6 === 2) return 'white';
        if (du % 6 === 3) return 'silver';
        return dv > 2 && dv < h - 8 ? (closed ? 'navy' : noise(du, frame, 5) > 0.7 ? 'yellow' : 'slate') : 'tan';
      });
    }
    // Upper floor and dome.
    const top = topOf(d, h);
    const upper: Diamond = { cx: d.cx, bottom: top.bottom - 10, w: 48 };
    box(r, upper, 10, { top: 'sand', left: 'tan', right: 'sand', rim: 'wood' });
    // Dome: stacked layers, each centred on the one below.
    const upperTop = upper.bottom - 10;
    let domeTop = upperTop;
    for (let i = 0; i < 6; i++) {
      const w = 36 - i * 6 - ((36 - i * 6) % 4);
      if (w < 4) break;
      const bottom = upperTop - (upper.w - w) / 4 - 3 * i;
      box(r, { cx: d.cx, bottom, w }, 3, { top: 'cyan', left: 'navyBlue', right: 'blue', rim: i === 0 ? 'navy' : undefined });
      domeTop = bottom - w / 2 - 3;
    }
    // Flag waving on the pole.
    const poleX = d.cx;
    const poleTop = domeTop - 12;
    r.rect(poleX, poleTop, 1, 14, 'grey');
    if (!closed) {
      const wave = ['xxxxxx', 'xxxxxx', 'yyyyyy', 'yyyyyy'];
      for (let row = 0; row < wave.length; row++) {
        for (let i = 0; i < 6; i++) {
          const dy = Math.round(Math.sin((i + frame * 1.5) * 0.9));
          r.set(poleX + 1 + i, poleTop + row + dy, wave[row][i] === 'x' ? 'red' : 'white');
        }
      }
    }
  },
};

export const buildingArts: BuildingArt[] = [home, shop, bar, factCheckers, factory, hospital, cityHall];
