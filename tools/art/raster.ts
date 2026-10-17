import { encodePng } from './png';
import { PALETTE, rgb, type Color } from './palette';

const colorNames = Object.keys(PALETTE) as Color[];
const rgbCache = colorNames.map(rgb);

/** A palette-indexed pixel canvas. Every pixel is a palette color or transparent. */
export class Raster {
  readonly px: Int16Array;

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = new Int16Array(w * h).fill(-1);
  }

  set(x: number, y: number, c: Color | null): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c === null ? -1 : colorNames.indexOf(c);
  }

  get(x: number, y: number): Color | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    const i = this.px[y * this.w + x];
    return i < 0 ? null : colorNames[i];
  }

  rect(x: number, y: number, w: number, h: number, c: Color): void {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }

  /** Draws ASCII art: each char maps to a color via `key`; '.' and ' ' are skipped. */
  art(x: number, y: number, rows: string[], key: Record<string, Color>): void {
    rows.forEach((row, j) => {
      [...row].forEach((ch, i) => {
        if (ch !== '.' && ch !== ' ' && key[ch]) this.set(x + i, y + j, key[ch]);
      });
    });
  }

  blit(src: Raster, dx: number, dy: number, mirror = false): void {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const c = src.get(mirror ? src.w - 1 - x : x, y);
        if (c) this.set(dx + x, dy + y, c);
      }
    }
  }

  /** Adds a 1px outline around opaque pixels (4-neighbourhood). */
  outline(c: Color): void {
    const add: number[] = [];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.get(x, y)) continue;
        if (this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1) || this.get(x, y + 1)) add.push(x, y);
      }
    }
    for (let i = 0; i < add.length; i += 2) this.set(add[i], add[i + 1], c);
  }

  /** Replaces colors, e.g. for palette-swapped variants. */
  recolor(map: Partial<Record<Color, Color>>): Raster {
    const out = new Raster(this.w, this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.get(x, y);
        if (c) out.set(x, y, map[c] ?? c);
      }
    }
    return out;
  }

  toPng(): Buffer {
    const rgba = new Uint8Array(this.w * this.h * 4);
    for (let i = 0; i < this.px.length; i++) {
      const c = this.px[i];
      if (c < 0) continue;
      const [r, g, b] = rgbCache[c];
      rgba.set([r, g, b, 255], i * 4);
    }
    return encodePng(this.w, this.h, rgba);
  }
}

/** Deterministic pseudo-random noise for texture details. */
export function noise(x: number, y: number, seed = 0): number {
  let h = Math.imul(x * 374761393 + y * 668265263 + seed * 2147483647, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
