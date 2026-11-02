import type { Color } from './palette';
import { Raster, noise } from './raster';
import { box, fillDiamond, lowerY, topOf, upperY, wallRect, type Diamond } from './iso';

/**
 * The look of a town's way of life (CONCEPT.md §9.5, §7.2): ground tiles and landmarks that stand in a
 * strip behind the far edge of the map — the port's quay and cranes, the resort's beach, the plant's
 * chimneys, the institute, the church, the market, the gardens.
 */

const TILE: Diamond = { cx: 32, bottom: 31, w: 64 };

/** Grass of the lots, tinted by the look: dusty in a plant town, autumn in an old one, sandy at the sea. */
export function lookGrass(look: string, variant: number): Raster {
  const r = new Raster(64, 32);
  fillDiamond(r, TILE, (x, y) => {
    const n = noise(x, y, variant + 10);
    const patch = noise(x >> 3, y >> 2, variant) > 0.5;
    switch (look) {
      case 'resort':
        if (n < 0.05) return 'sand';
        if (n < 0.06) return 'white';
        return patch ? 'green' : n < 0.2 ? 'darkGreen' : 'green';
      case 'mono':
        if (n < 0.07) return 'grey';
        if (n < 0.1) return 'darkGrey';
        return patch ? 'darkGreen' : 'forest';
      case 'old':
        if (n < 0.04) return 'amber';
        if (n < 0.07) return 'orange';
        if (n < 0.08) return 'rust';
        return patch ? 'darkGreen' : n < 0.3 ? 'forest' : 'darkGreen';
      case 'port':
        if (n < 0.04) return 'grey';
        return patch ? 'darkGreen' : n < 0.25 ? 'deepTeal' : 'darkGreen';
      case 'center':
        // Mown lawns: stripes.
        if (n < 0.01) return 'white';
        return ((x >> 3) + (y >> 2)) % 2 === 0 ? 'green' : 'darkGreen';
      case 'student':
        if (n < 0.02) return 'pink';
        if (n < 0.035) return 'yellow';
        if (n < 0.045) return 'white';
        return patch ? 'green' : 'darkGreen';
      default:
        if (n < 0.012) return 'yellow';
        if (n < 0.02) return 'white';
        if (n < 0.14) return 'darkGreen';
        return patch ? 'green' : 'darkGreen';
    }
  });
  return r;
}

export function water(variant: number): Raster {
  const r = new Raster(64, 32);
  fillDiamond(r, TILE, (x, y) => {
    const n = noise(x, y, 60 + variant);
    if (n < 0.03) return 'cyan';
    // Short wave crests.
    if (noise(x >> 2, y, 61 + variant) < 0.08) return 'blue';
    return n > 0.8 ? 'navyBlue' : noise(x >> 3, y >> 2, 62) > 0.6 ? 'navyBlue' : 'blue';
  });
  return r;
}

export function sand(): Raster {
  const r = new Raster(64, 32);
  fillDiamond(r, TILE, (x, y) => {
    const n = noise(x, y, 70);
    return n < 0.08 ? 'tan' : n < 0.11 ? 'white' : n < 0.12 ? 'wood' : 'sand';
  });
  return r;
}

export function concrete(): Raster {
  const r = new Raster(64, 32);
  fillDiamond(r, TILE, (x, y) => {
    const n = noise(x, y, 80);
    // Slab seams along both iso axes.
    if ((x + 2 * y) % 32 === 0 || (x - 2 * y + 64) % 32 === 0) return 'grey';
    return n < 0.06 ? 'grey' : n < 0.08 ? 'darkGrey' : 'silver';
  });
  return r;
}

export function soil(): Raster {
  const r = new Raster(64, 32);
  fillDiamond(r, TILE, (x, y) => {
    const n = noise(x, y, 90);
    // Furrows across the bed, rows of greens on the ridges.
    const row = (x + 2 * y) % 8;
    if (row < 2) return 'darkBrown';
    if (row === 4 && n < 0.5) return n < 0.15 ? 'green' : 'darkGreen';
    return n < 0.05 ? 'wood' : 'brown';
  });
  return r;
}

// ---------- Landmarks ----------

/** A canvas `w`×`h` with its footprint's ground diamond at the bottom (`tiles` 1 or 2). */
function canvas(w: number, h: number, tiles: 1 | 2): { r: Raster; d: Diamond; ground: number } {
  const r = new Raster(w, h);
  const tw = 64 * tiles;
  return { r, d: { cx: w / 2, bottom: h - 1 - 4 * tiles, w: tw - 12 * tiles }, ground: h - 1 - 16 * tiles };
}

function smoke(r: Raster, x: number, y: number, frame: number, size: number): void {
  for (let i = 0; i < 3; i++) {
    const t = (frame + i * 4) % 12;
    const py = y - t * 3;
    const px = x + Math.round(Math.sin(t * 0.7 + i) * 2) + (t >> 1);
    const rad = size + (t > 6 ? 1 : 0);
    for (let dy = -rad; dy <= rad; dy++) {
      for (let dx = -rad; dx <= rad; dx++) if (dx * dx + dy * dy <= rad * rad) r.set(px + dx, py + dy, dy < 0 ? 'white' : 'silver');
    }
  }
}

export function palm(): Raster {
  const r = new Raster(64, 64);
  const g = 47;
  const p = new Raster(64, 64);
  let top = { x: 32, y: g };
  for (let i = 0; i < 24; i++) {
    const x = 32 + Math.round(Math.sin(i / 9) * 4);
    p.set(x, g - i, i % 3 === 0 ? 'darkBrown' : 'wood');
    p.set(x + 1, g - i, 'brown');
    top = { x, y: g - i };
  }
  const leaf = (dx: number, dy: number, len: number) => {
    for (let i = 1; i <= len; i++) {
      const x = top.x + Math.round((dx * i) / len);
      const y = top.y + Math.round((dy * i) / len + (i * i) / (len * 2.2));
      p.set(x, y, i < len / 2 ? 'darkGreen' : 'green');
      p.set(x, y + 1, 'forest');
    }
  };
  for (const [dx, dy] of [
    [-12, -2],
    [12, -2],
    [-9, -6],
    [9, -6],
    [-4, -8],
    [5, -8],
  ]) leaf(dx, dy, 11);
  p.set(top.x - 1, top.y + 2, 'amber');
  p.set(top.x + 2, top.y + 2, 'amber');
  p.outline('ink');
  r.blit(p, 0, 0);
  return r;
}

export function umbrella(variant: number): Raster {
  const r = new Raster(64, 64);
  const g = 47;
  fillDiamond(r, { cx: 28, bottom: g + 5, w: 16 }, (x, y) => ((x + y) % 4 < 2 ? (variant ? 'yellow' : 'cyan') : 'white'));
  const u = new Raster(64, 64);
  u.rect(34, g - 16, 1, 17, 'darkGrey');
  const a: Color = variant ? 'blue' : 'red';
  for (let row = 0; row < 6; row++) {
    const half = 3 + row * 2;
    for (let dx = -half; dx <= half; dx++) u.set(34 + dx, g - 21 + row, Math.floor((dx + 20) / 4) % 2 === 0 ? a : 'white');
  }
  u.outline('ink');
  r.blit(u, 0, 0);
  return r;
}

export function boat(): Raster {
  const r = new Raster(64, 64);
  const g = 47;
  const b = new Raster(64, 64);
  box(b, { cx: 32, bottom: g + 3, w: 20 }, 4, { top: 'wood', left: 'white', right: 'silver', rim: 'darkRed' });
  b.rect(32, g - 18, 1, 16, 'brown');
  for (let i = 0; i < 13; i++) for (let j = 0; j <= Math.floor(i * 0.7); j++) b.set(33 + j, g - 17 + i, 'white');
  b.outline('ink');
  r.blit(b, 0, 0);
  return r;
}

export function containers(variant: number): Raster {
  const r = new Raster(64, 64);
  const sets: [Color, Color, Color][] = [
    ['red', 'darkRed', 'rust'],
    ['blue', 'navyBlue', 'slate'],
    ['darkGreen', 'forest', 'deepTeal'],
    ['amber', 'orange', 'rust'],
  ];
  const stack = [sets[variant % 4], sets[(variant + 1) % 4], sets[(variant + 2) % 4]];
  const levels = 2 + (variant % 2);
  for (let i = 0; i < levels; i++) {
    const [top, right, left] = stack[i];
    const d: Diamond = { cx: 32, bottom: 50 - i * 9, w: 36 };
    box(r, d, 9, { top, left, right, rim: 'ink' });
    // Ribs on the walls.
    for (const side of ['left', 'right'] as const) wallRect(r, d, side, 0, i * 0, 18, 9, (du, dv) => (du % 3 === 0 && dv > 0 && dv < 8 ? 'ink' : null));
  }
  return r;
}

export function crane(frame: number): Raster {
  const { r, ground } = canvas(64, 128, 1);
  const c = new Raster(64, 128);
  const top = ground - 70;
  // Two legs of the gantry, braces, the boom over the water and a cab.
  for (const x of [22, 40]) c.rect(x, top, 3, ground - top + 2, 'orange');
  for (let i = 0; i < 18; i++) {
    c.set(22 + i, top + 10 + i, 'amber');
    c.set(40 - i, top + 10 + i, 'amber');
  }
  c.rect(4, top - 4, 58, 4, 'orange');
  c.rect(4, top - 4, 58, 1, 'amber');
  c.rect(42, top - 12, 10, 8, 'yellow');
  c.rect(44, top - 10, 4, 3, 'cyan');
  const hook = 10 + (frame % 4) * 3;
  c.rect(12, top, 1, hook, 'darkGrey');
  c.rect(10, top + hook, 5, 2, 'ink');
  c.outline('ink');
  r.blit(c, 0, 0);
  return r;
}

export function ship(): Raster {
  const { r, ground } = canvas(128, 128, 2);
  const hull: Diamond = { cx: 64, bottom: ground + 22, w: 96 };
  box(r, hull, 12, { top: 'darkGrey', left: 'darkRed', right: 'red', rim: 'ink' });
  wallRect(r, hull, 'left', 0, 0, 48, 2, 'ink');
  wallRect(r, hull, 'right', 0, 0, 48, 2, 'ink');
  const deck = topOf(hull, 12);
  const colors: [Color, Color, Color][] = [
    ['amber', 'orange', 'rust'],
    ['blue', 'navyBlue', 'slate'],
    ['green', 'darkGreen', 'forest'],
  ];
  colors.forEach(([t, rr, l], i) => box(r, { cx: deck.cx - 18 + i * 12, bottom: deck.bottom - 10 + i * 4, w: 20 }, 8, { top: t, left: l, right: rr, rim: 'ink' }));
  // The bridge at the stern and its funnel.
  const bridge: Diamond = { cx: deck.cx + 22, bottom: deck.bottom - 16, w: 20 };
  box(r, bridge, 16, { top: 'silver', left: 'silver', right: 'white', rim: 'grey' });
  wallRect(r, bridge, 'right', 1, 10, 8, 2, 'navy');
  wallRect(r, bridge, 'left', 1, 10, 8, 2, 'navy');
  r.rect(bridge.cx - 2, upperY(bridge, bridge.cx) - 24, 5, 10, 'red');
  r.rect(bridge.cx - 2, upperY(bridge, bridge.cx) - 24, 5, 2, 'ink');
  return r;
}

export function chimney(frame: number): Raster {
  const { r, ground } = canvas(64, 128, 1);
  const d: Diamond = { cx: 32, bottom: ground + 6, w: 16 };
  box(r, { cx: 32, bottom: ground + 8, w: 24 }, 6, { top: 'grey', left: 'darkGrey', right: 'grey', rim: 'slate' });
  const h = 78;
  box(r, d, h, { top: 'ink', left: 'brown', right: 'rust', rim: 'darkBrown' });
  for (const side of ['left', 'right'] as const) {
    wallRect(r, d, side, 0, 0, 8, h, (_du, dv) => (Math.floor(dv / 9) % 2 === 1 ? (side === 'left' ? 'silver' : 'white') : null));
  }
  smoke(r, 32, upperY(d, 32) - h - 6, frame, 3);
  return r;
}

export function coolingTower(frame: number): Raster {
  const { r, ground } = canvas(128, 128, 2);
  const h = 64;
  for (let dv = 0; dv <= h; dv++) {
    const t = dv / h;
    const rad = Math.round(30 - 12 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + (t > 0.85 ? 3 * (t - 0.85) * 10 : 0) * 0.3);
    const y = ground + 10 - dv;
    for (let dx = -rad; dx <= rad; dx++) {
      const edge = Math.abs(dx) >= rad - 1;
      r.set(64 + dx, y, edge ? 'ink' : dx < -rad / 3 ? 'grey' : dx < rad / 3 ? 'silver' : 'white');
    }
  }
  // The open rim at the top and the stains of steam.
  const topY = ground + 10 - h;
  const rim = Math.round(30 - 12 * Math.sin(Math.PI * Math.min(1, 1.15)));
  for (let dx = -rim; dx <= rim; dx++) r.set(64 + dx, topY - 1, 'darkGrey');
  for (let i = 0; i < 4; i++) {
    const t = (frame + i * 3) % 12;
    const px = 58 + i * 4 + (t >> 1);
    const py = topY - 6 - t * 3;
    const rad = 4 + (t >> 2);
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (dx * dx + dy * dy <= rad * rad) r.set(px + dx, py + dy, dy < 0 ? 'white' : 'silver');
  }
  return r;
}

function windows(r: Raster, d: Diamond, side: 'left' | 'right', from: number, to: number, rows: number[], lit: boolean, step = 7): void {
  for (let u = from; u < to; u += step) {
    for (const v of rows) wallRect(r, d, side, u, v, 4, 5, (du, dv) => (dv === 4 ? 'navy' : lit && noise(u, v, 3) > 0.4 ? (du === 0 ? 'white' : 'yellow') : 'navy'));
  }
}

export function institute(frame: number): Raster {
  const { r, d } = canvas(128, 128, 2);
  const h = 30;
  box(r, d, h, { top: 'brown', left: 'rust', right: 'clay', rim: 'darkBrown' });
  windows(r, d, 'left', 4, 54, [5, 14, 22], true);
  windows(r, d, 'right', 26, 54, [5, 14, 22], true);
  // A white portico with columns on the front face.
  wallRect(r, d, 'right', 3, 0, 20, h - 2, (du, dv) => {
    if (dv >= h - 6) return 'silver';
    return du % 5 === 1 || du % 5 === 2 ? 'white' : dv < 2 ? 'silver' : 'darkBrown';
  });
  // A clock tower on the roof with a spire.
  const top = topOf(d, h);
  const tower: Diamond = { cx: top.cx, bottom: Math.round((upperY(top, top.cx) + lowerY(top, top.cx)) / 2) + 6, w: 20 };
  box(r, tower, 22, { top: 'brown', left: 'rust', right: 'clay', rim: 'darkBrown' });
  const cy = lowerY(tower, tower.cx + 5) - 14;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 10) r.set(tower.cx + 5 + dx, cy + dy, 'white');
  r.set(tower.cx + 5, cy - 1, 'ink');
  r.set(tower.cx + 5, cy - 2, 'ink');
  r.set(tower.cx + 5 + (frame % 4 < 2 ? 1 : 2), cy, 'ink');
  const spireBase = upperY(tower, tower.cx) - 22;
  for (let i = 0; i < 14; i++) {
    const half = Math.max(0, 6 - Math.floor(i / 2));
    for (let dx = -half; dx <= half; dx++) r.set(tower.cx + dx, spireBase - i, dx < 0 ? 'navyBlue' : 'blue');
  }
  r.rect(tower.cx, spireBase - 18, 1, 4, 'amber');
  return r;
}

function onion(r: Raster, cx: number, base: number, rad: number, gold: boolean): void {
  const [dark, mid, light]: Color[] = gold ? ['orange', 'amber', 'yellow'] : ['navyBlue', 'blue', 'cyan'];
  for (let dy = -rad * 2; dy <= rad; dy++) {
    // Wide at the bottom, pulled into a point at the top.
    const t = (dy + rad * 2) / (rad * 3);
    const half = dy > 0 ? Math.round(Math.sqrt(Math.max(0, rad * rad - dy * dy))) : Math.round(rad * Math.pow(t, 0.8));
    for (let dx = -half; dx <= half; dx++) r.set(cx + dx, base - rad + dy, dx < -half / 3 ? dark : dx < half / 3 ? mid : light);
  }
  const tip = base - rad * 3;
  r.rect(cx, tip - 7, 1, 7, 'amber');
  r.rect(cx - 2, tip - 5, 5, 1, 'amber');
}

export function church(frame: number): Raster {
  const { r, d } = canvas(128, 128, 2);
  const h = 22;
  box(r, d, h, { top: 'grey', left: 'silver', right: 'white', rim: 'grey' });
  for (const side of ['left', 'right'] as const) {
    wallRect(r, d, side, 6, 4, 46, 12, (du, dv) => (du % 12 < 3 && dv > 1 ? (dv > 9 ? 'navyBlue' : frame % 4 === 0 && du % 24 < 3 ? 'amber' : 'navy') : null));
  }
  wallRect(r, d, 'right', 20, 0, 8, 12, (du, dv) => (dv > 10 && (du === 0 || du === 7) ? null : 'brown'));
  const top = topOf(d, h);
  const mid = Math.round((upperY(top, top.cx) + lowerY(top, top.cx)) / 2);
  const drum: Diamond = { cx: top.cx, bottom: mid + 8, w: 24 };
  box(r, drum, 18, { top: 'silver', left: 'silver', right: 'white', rim: 'grey' });
  onion(r, drum.cx, upperY(drum, drum.cx) - 18, 9, true);
  for (const dx of [-26, 26]) {
    const small: Diamond = { cx: top.cx + dx, bottom: mid + 6 + (dx > 0 ? 0 : 0), w: 12 };
    box(r, small, 10, { top: 'silver', left: 'silver', right: 'white', rim: 'grey' });
    onion(r, small.cx, upperY(small, small.cx) - 10, 5, false);
  }
  return r;
}

export function stall(variant: number): Raster {
  const r = new Raster(64, 64);
  const g = 47;
  const s = new Raster(64, 64);
  const table: Diamond = { cx: 32, bottom: g + 6, w: 28 };
  box(s, table, 7, { top: 'wood', left: 'brown', right: 'wood' });
  const goods: Color[] = ['red', 'amber', 'green', 'orange', 'yellow'];
  for (let i = 0; i < 8; i++) s.set(26 + i * 2, upperY(table, 26 + i * 2) - 7 + (i % 2) + 4, goods[(i + variant) % goods.length]);
  for (const x of [20, 44]) s.rect(x, g - 16, 1, 18, 'darkGrey');
  const a: Color = variant % 2 ? 'blue' : 'red';
  box(s, { cx: 32, bottom: g - 8, w: 32 }, 3, { top: a, left: 'white', right: a });
  s.outline('ink');
  r.blit(s, 0, 0);
  return r;
}

export function monument(): Raster {
  const r = new Raster(64, 64);
  const g = 47;
  const m = new Raster(64, 64);
  const base: Diamond = { cx: 32, bottom: g + 8, w: 28 };
  box(m, base, 4, { top: 'silver', left: 'grey', right: 'silver' });
  const ped: Diamond = { cx: 32, bottom: g + 2, w: 12 };
  box(m, ped, 12, { top: 'grey', left: 'darkGrey', right: 'grey' });
  const y0 = upperY(ped, 32) - 12;
  m.rect(30, y0 - 12, 5, 12, 'slate');
  m.rect(31, y0 - 16, 3, 4, 'darkGrey');
  // The raised arm, pointing the way.
  for (let i = 0; i < 6; i++) m.set(35 + i, y0 - 11 - Math.floor(i / 2), 'slate');
  m.outline('ink');
  r.blit(m, 0, 0);
  return r;
}

export function garages(): Raster {
  const r = new Raster(64, 64);
  const d: Diamond = { cx: 32, bottom: 55, w: 44 };
  box(r, d, 13, { top: 'slate', left: 'darkGrey', right: 'grey', rim: 'navy' });
  for (const u of [2, 12]) wallRect(r, d, 'right', u, 0, 8, 10, (_du, dv) => (dv === 9 ? 'ink' : dv % 2 === 0 ? 'rust' : 'brown'));
  wallRect(r, d, 'left', 4, 0, 14, 10, (du, dv) => (dv === 9 ? 'ink' : du % 3 === 0 ? 'darkGrey' : 'navyBlue'));
  return r;
}

export function shed(): Raster {
  const r = new Raster(64, 64);
  const d: Diamond = { cx: 30, bottom: 53, w: 24 };
  box(r, d, 12, { top: 'wood', left: 'brown', right: 'wood', rim: 'darkBrown' });
  wallRect(r, d, 'right', 3, 0, 4, 8, 'darkBrown');
  box(r, { cx: 30, bottom: 41, w: 28 }, 3, { top: 'darkGreen', left: 'forest', right: 'darkGreen' });
  // A watering can and a fence.
  const f = new Raster(64, 64);
  for (let i = 0; i < 14; i++) f.set(40 + i, 52 - Math.floor(i / 2), i % 3 === 0 ? 'wood' : null);
  for (let i = 0; i < 14; i++) f.set(40 + i, 49 - Math.floor(i / 2), 'wood');
  r.blit(f, 0, 0);
  r.rect(18, 50, 3, 3, 'blue');
  return r;
}

export function beds(): Raster {
  const r = new Raster(64, 64);
  const d: Diamond = { cx: 32, bottom: 57, w: 44 };
  fillDiamond(r, d, (x, y) => {
    const row = (x + 2 * y) % 6;
    if (row === 0) {
      const n = noise(x, y, 95);
      return n < 0.4 ? 'green' : n < 0.8 ? 'darkGreen' : 'red';
    }
    if (row === 1) return 'forest';
    return null;
  });
  return r;
}

/** Decor of the looks, by name: frames of one animation each (sizes vary; anchored at the bottom vertex). */
export const landmarkDecor: Record<string, { size: [number, number]; frames: Raster[] }> = {
  palm: { size: [64, 64], frames: [palm()] },
  umbrella_1: { size: [64, 64], frames: [umbrella(0)] },
  umbrella_2: { size: [64, 64], frames: [umbrella(1)] },
  boat: { size: [64, 64], frames: [boat()] },
  containers_1: { size: [64, 64], frames: [containers(0)] },
  containers_2: { size: [64, 64], frames: [containers(1)] },
  containers_3: { size: [64, 64], frames: [containers(2)] },
  crane: { size: [64, 128], frames: [0, 1, 2, 3].map(crane) },
  ship: { size: [128, 128], frames: [ship()] },
  chimney: { size: [64, 128], frames: Array.from({ length: 12 }, (_, f) => chimney(f)) },
  cooling_tower: { size: [128, 128], frames: Array.from({ length: 12 }, (_, f) => coolingTower(f)) },
  institute: { size: [128, 128], frames: [0, 1, 2, 3].map(institute) },
  church: { size: [128, 128], frames: [0, 1, 2, 3].map(church) },
  stall_1: { size: [64, 64], frames: [stall(0)] },
  stall_2: { size: [64, 64], frames: [stall(1)] },
  monument: { size: [64, 64], frames: [monument()] },
  garages: { size: [64, 64], frames: [garages()] },
  shed: { size: [64, 64], frames: [shed()] },
  beds: { size: [64, 64], frames: [beds()] },
};

export const LOOKS = ['sleepy', 'mono', 'resort', 'student', 'old', 'port', 'center'];

export const lookTiles: Record<string, Raster> = { water_1: water(0), water_2: water(1), sand: sand(), concrete: concrete(), soil: soil() };
for (const look of LOOKS) for (const v of [0, 1, 2]) lookTiles[`grass_${look}_${v + 1}`] = lookGrass(look, v);
