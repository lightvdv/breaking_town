import type { Color } from './palette';
import type { Raster } from './raster';

/**
 * A 2:1 isometric diamond: `w` pixels wide (multiple of 4), `w/2` tall,
 * centred on column `cx` with its bottom vertex on row `bottom`.
 */
export interface Diamond {
  cx: number;
  bottom: number;
  w: number;
}

function halfIndex(d: Diamond, x: number): number {
  const t = x - (d.cx - d.w / 2);
  return t < d.w / 2 ? t : d.w - 1 - t;
}

export function columns(d: Diamond): number[] {
  return Array.from({ length: d.w }, (_, i) => d.cx - d.w / 2 + i);
}

export function upperY(d: Diamond, x: number): number {
  return d.bottom - d.w / 4 - Math.floor(halfIndex(d, x) / 2);
}

export function lowerY(d: Diamond, x: number): number {
  return d.bottom - d.w / 4 + 1 + Math.floor(halfIndex(d, x) / 2);
}

export function isLeft(d: Diamond, x: number): boolean {
  return x < d.cx;
}

export function shrink(d: Diamond, by: number, lift = 0): Diamond {
  return { cx: d.cx, bottom: d.bottom - by / 4 - lift, w: d.w - by };
}

export function fillDiamond(r: Raster, d: Diamond, color: (x: number, y: number) => Color | null): void {
  for (const x of columns(d)) {
    for (let y = upperY(d, x); y <= lowerY(d, x); y++) {
      const c = color(x, y);
      if (c) r.set(x, y, c);
    }
  }
}

export interface BoxColors {
  top: Color;
  left: Color;
  right: Color;
  /** Highlight on the top face's outer rim. */
  rim?: Color;
}

/** An isometric box standing on diamond `d`, `h` pixels tall. */
export function box(r: Raster, d: Diamond, h: number, c: BoxColors): void {
  for (const x of columns(d)) {
    const up = upperY(d, x);
    const lo = lowerY(d, x);
    for (let y = lo - h + 1; y <= lo; y++) r.set(x, y, isLeft(d, x) ? c.left : c.right);
    for (let y = up - h; y <= lo - h; y++) r.set(x, y, c.top);
    if (c.rim) {
      r.set(x, up - h, c.rim);
      r.set(x, lo - h, c.rim);
    }
  }
}

/** Top face diamond of a box of height h. */
export function topOf(d: Diamond, h: number): Diamond {
  return { cx: d.cx, bottom: d.bottom - h, w: d.w };
}

/**
 * Paints a rectangle on a wall. `u` is the horizontal offset along the face: on the left face it
 * counts from the left corner, on the right face from the front corner. `v` is height above ground.
 */
export function wallRect(
  r: Raster,
  d: Diamond,
  side: 'left' | 'right',
  u: number,
  v: number,
  w: number,
  h: number,
  color: Color | ((du: number, dv: number) => Color | null),
): void {
  for (let du = 0; du < w; du++) {
    const x = side === 'left' ? d.cx - d.w / 2 + u + du : d.cx + u + du;
    const base = lowerY(d, x);
    for (let dv = 0; dv < h; dv++) {
      const c = typeof color === 'function' ? color(du, dv) : color;
      if (c) r.set(x, base - v - dv, c);
    }
  }
}

/** Hip roof made of shrinking layers, starting on top of a box of height h. */
export function hipRoof(r: Raster, d: Diamond, h: number, layers: number, c: BoxColors, overhang = 4): void {
  for (let i = 0; i < layers; i++) {
    const w = d.w + overhang - i * 8;
    if (w < 8) break;
    // Each layer is 8px narrower (its bottom vertex rises 2px) and stacked 2px higher.
    const layer: Diamond = { cx: d.cx, bottom: d.bottom - h + overhang / 4 - 4 * i, w };
    box(r, layer, 2, c);
  }
}
