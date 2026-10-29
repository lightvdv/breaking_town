import type { Color } from './palette';
import { Raster, noise } from './raster';
import { box, fillDiamond, type Diamond } from './iso';

/** Ground tiles 64×32 (CONCEPT.md §7.2). */
const TILE: Diamond = { cx: 32, bottom: 31, w: 64 };

export function grass(variant: number): Raster {
  const r = new Raster(64, 32);
  fillDiamond(r, TILE, (x, y) => {
    const n = noise(x, y, variant + 10);
    if (n < 0.012) return variant === 2 ? 'pink' : 'yellow';
    if (n < 0.02) return 'white';
    if (n < 0.14) return 'darkGreen';
    if (n > 0.93) return 'green';
    return variant === 1 ? 'green' : noise(x >> 3, y >> 2, variant) > 0.5 ? 'green' : 'darkGreen';
  });
  return r;
}

function asphalt(x: number, y: number): Color {
  const n = noise(x, y, 21);
  return n < 0.07 ? 'navy' : n > 0.95 ? 'darkGrey' : 'slate';
}

/** Road along the map's x axis (screen direction down-right), y axis (down-left), or a crossing. */
export function road(kind: 'x' | 'y' | 'cross'): Raster {
  const r = new Raster(64, 32);
  fillDiamond(r, TILE, asphalt);
  // Kerb stones on the tile edges parallel to the road.
  fillDiamond(r, TILE, (x, y) => {
    const onEdge = (d: (x: number) => number) => Math.abs(y - d(x)) < 1;
    const upLeft = (px: number) => 15 - Math.floor(px / 2);
    const downRight = (px: number) => 16 + Math.floor((63 - px) / 2);
    const upRight = (px: number) => Math.floor((px - 32) / 2);
    const downLeft = (px: number) => 16 + Math.floor(px / 2);
    // Map x runs along screen (+2,+1): an x-road borders lots on its top-right and bottom-left edges.
    if (kind === 'x' && ((x >= 32 && onEdge(upRight)) || (x < 32 && onEdge(downLeft)))) return 'grey';
    if (kind === 'y' && ((x < 32 && onEdge(upLeft)) || (x >= 32 && onEdge(downRight)))) return 'grey';
    return null;
  });
  if (kind === 'cross') return r;
  for (let k = -7; k <= 7; k++) {
    if (Math.floor((k + 20) / 2) % 2 !== 0) continue;
    const x = kind === 'x' ? 32 + 2 * k : 32 - 2 * k;
    r.set(x, 16 + k, 'silver');
    r.set(x + (kind === 'x' ? 1 : -1), 16 + k, 'silver');
  }
  return r;
}

/** Decor stands on a 64×64 canvas like a 1×1 building, anchored at the bottom vertex. */
const DECOR_BASE: Diamond = { cx: 32, bottom: 63, w: 64 };

function blob(r: Raster, cx: number, cy: number, rad: number, c: (dx: number, dy: number) => Color | null): void {
  for (let dy = -rad; dy <= rad; dy++) {
    for (let dx = -rad; dx <= rad; dx++) {
      if (dx * dx + dy * dy * 1.3 <= rad * rad + 1) {
        const color = c(dx, dy);
        if (color) r.set(cx + dx, cy + dy, color);
      }
    }
  }
}

function shadow(r: Raster, cx: number, cy: number, w: number): void {
  for (let dx = -w; dx <= w; dx++) for (let dy = -1; dy <= 1; dy++) if (Math.abs(dx) + Math.abs(dy) * 4 <= w) r.set(cx + dx, cy + dy, 'forest');
}

export function tree(variant: number): Raster {
  const r = new Raster(64, 64);
  const cx = 32 + (variant === 1 ? -6 : 4);
  const ground = DECOR_BASE.bottom - 16 + (variant === 1 ? 3 : -2);
  shadow(r, cx, ground, 9);
  const trunk = new Raster(64, 64);
  trunk.rect(cx - 1, ground - 9, 3, 10, 'brown');
  trunk.rect(cx + 1, ground - 9, 1, 10, 'darkBrown');
  const crown = new Raster(64, 64);
  const dark: Color = variant === 2 ? 'darkRed' : 'forest';
  const mid: Color = variant === 2 ? 'orange' : 'darkGreen';
  const light: Color = variant === 2 ? 'amber' : 'green';
  const top = ground - 18 - (variant === 0 ? 4 : 0);
  blob(crown, cx, top, 10, (dx, dy) => (dy > 3 || dx > 5 ? dark : noise(dx, dy, variant) < 0.2 ? dark : mid));
  blob(crown, cx - 3, top - 3, 5, (dx, dy) => (dx + dy < -3 ? light : noise(dx, dy, 9) < 0.3 ? light : mid));
  crown.outline('ink');
  trunk.outline('ink');
  r.blit(trunk, 0, 0);
  r.blit(crown, 0, 0);
  return r;
}

export function bush(): Raster {
  const r = new Raster(64, 64);
  const g = DECOR_BASE.bottom - 14;
  shadow(r, 28, g, 7);
  const b = new Raster(64, 64);
  blob(b, 26, g - 4, 5, (_dx, dy) => (dy > 1 ? 'forest' : 'darkGreen'));
  blob(b, 32, g - 3, 4, (dx, dy) => (dx + dy < -2 ? 'green' : 'darkGreen'));
  for (const [x, y] of [
    [25, g - 6],
    [31, g - 5],
    [28, g - 2],
  ]) b.set(x, y, 'pink');
  b.outline('ink');
  r.blit(b, 0, 0);
  return r;
}

export function flowers(): Raster {
  const r = new Raster(64, 64);
  const bed: Diamond = { cx: 32, bottom: DECOR_BASE.bottom - 12, w: 28 };
  box(r, bed, 2, { top: 'brown', left: 'wood', right: 'tan' });
  fillDiamond(r, { cx: 32, bottom: bed.bottom - 2, w: 24 }, (x, y) => {
    const n = noise(x, y, 33);
    return n < 0.18 ? 'red' : n < 0.32 ? 'yellow' : n < 0.42 ? 'white' : n < 0.5 ? 'pink' : 'darkGreen';
  });
  return r;
}

export function bench(): Raster {
  const r = new Raster(64, 64);
  const g = DECOR_BASE.bottom - 14;
  const b = new Raster(64, 64);
  for (let i = 0; i < 12; i++) {
    b.set(24 + i, g - 4 + Math.floor(i / 2), 'wood');
    b.set(24 + i, g - 3 + Math.floor(i / 2), 'brown');
    b.set(24 + i, g - 7 + Math.floor(i / 2), 'wood');
  }
  for (const i of [1, 10]) {
    b.set(24 + i, g - 2 + Math.floor(i / 2), 'darkGrey');
    b.set(24 + i, g - 1 + Math.floor(i / 2), 'darkGrey');
  }
  b.outline('ink');
  r.blit(b, 0, 0);
  return r;
}

export function lamp(frame: number): Raster {
  const r = new Raster(64, 64);
  const g = DECOR_BASE.bottom - 15;
  const l = new Raster(64, 64);
  l.rect(32, g - 20, 1, 21, 'darkGrey');
  l.rect(31, g, 3, 1, 'slate');
  l.rect(30, g - 23, 5, 3, frame % 2 === 0 ? 'yellow' : 'amber');
  l.rect(30, g - 24, 5, 1, 'slate');
  l.outline('ink');
  r.blit(l, 0, 0);
  return r;
}

export function fountain(frame: number): Raster {
  const r = new Raster(64, 64);
  const basin: Diamond = { cx: 32, bottom: DECOR_BASE.bottom - 10, w: 40 };
  box(r, basin, 4, { top: 'silver', left: 'grey', right: 'silver' });
  fillDiamond(r, { cx: 32, bottom: basin.bottom - 5, w: 32 }, (x, y) =>
    noise(x, y + frame * 3, 44) < 0.15 ? 'cyan' : 'blue',
  );
  r.rect(31, basin.bottom - 20, 3, 10, 'grey');
  for (let i = 0; i < 4; i++) {
    const t = (frame + i) % 4;
    r.set(29 - t, basin.bottom - 20 + t * 2, 'cyan');
    r.set(35 + t, basin.bottom - 20 + t * 2, 'cyan');
    r.set(32, basin.bottom - 22 - (t % 2), 'white');
  }
  return r;
}

/** 8×8 reaction icons shown above a resident's head. */
export const fxIcons: Record<string, { rows: string[]; key: Record<string, Color> }> = {
  believed_bad: {
    rows: ['.kkkk...', 'kwrrwk..', 'krrrrk..', 'kwrrwk..', 'kkrrkk..', 'krrrrk..', 'kkkkkk..', '........'],
    key: { k: 'ink', r: 'red', w: 'red' },
  },
  believed_good: {
    rows: ['.kk.kk..', 'kppkppk.', 'kpppppk.', 'kpppppk.', '.kpppk..', '..kpk...', '...k....', '........'],
    key: { k: 'ink', p: 'pink' },
  },
  // A plain fact believed: a blue tick — noted, neither fear nor joy.
  noted: {
    rows: ['......kk', '.....kbk', 'k...kbk.', 'kk.kbk..', 'kbkbk...', '.kbk....', '..k.....', '........'],
    key: { k: 'ink', b: 'blue' },
  },
  doubted: {
    rows: ['.kkkkk..', 'kssssk..', 'kkkssk..', '..kssk..', '..kkk...', '..ksk...', '..kkk...', '........'],
    key: { k: 'ink', s: 'silver' },
  },
  talk: {
    rows: ['kkkkkkk.', 'kwwwwwk.', 'kwkwkwk.', 'kwwwwwk.', 'kkwkkkk.', '.kk.....', '.k......', '........'],
    key: { k: 'ink', w: 'white' },
  },
  exposed: {
    rows: ['kkkkkkkk', 'kwwwwwrk', 'kwkkkrwk', 'kwwwrwwk', 'kwkrkkwk', 'kwrwwwwk', 'krkkkkkk', 'r.......'],
    key: { k: 'ink', w: 'white', r: 'hotRed' },
  },
  // A reaction to the rival's issue (CONCEPT.md §8): its paper over the head, in its colour.
  rival_tabloid: {
    rows: ['kkkkkkk.', 'kccccck.', 'kccccck.', 'kwwwwwk.', 'kwkkkwk.', 'kwwwwwk.', 'kwkkwwk.', 'kkkkkkk.'],
    key: { k: 'ink', c: 'red', w: 'white' },
  },
  rival_guardian: {
    rows: ['kkkkkkk.', 'kccccck.', 'kccccck.', 'kwwwwwk.', 'kwkkkwk.', 'kwwwwwk.', 'kwkkwwk.', 'kkkkkkk.'],
    key: { k: 'ink', c: 'blue', w: 'white' },
  },
  // Cutscenes (CONCEPT.md §7.3): a punch star over a fight, a dove over a reconciliation.
  fight: {
    rows: ['k..kk..k', '.kkyyk..', '.kyyyyk.', 'kyyrryyk', 'kyyrryyk', '.kyyyyk.', '..kyykk.', 'k..kk..k'],
    key: { k: 'ink', y: 'yellow', r: 'red' },
  },
  peace: {
    rows: ['....kk..', '...kwwk.', 'kkkwwwk.', 'kwwwwwwk', '.kwwwwk.', '..kkwkg.', '....kgg.', '.....g..'],
    key: { k: 'ink', w: 'white', g: 'green' },
  },
};

export function fxIcon(name: string): Raster {
  const r = new Raster(8, 8);
  r.art(0, 0, fxIcons[name].rows, fxIcons[name].key);
  return r;
}
