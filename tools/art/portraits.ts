import type { Color } from './palette';
import { PALETTE } from './palette';
import { Raster, noise } from './raster';

/** 32×32 reporter portraits (CONCEPT.md §7.2). Appearance comes from src/content/reporters.json. */
export interface PortraitSpec {
  bg: string;
  skin: string;
  hair: string;
  hairStyle: string;
  clothes: string;
  accessory: string;
}

const color = (name: string, fallback: Color): Color => (name in PALETTE ? (name as Color) : fallback);

const shade: Partial<Record<Color, Color>> = {
  skin: 'skinDark',
  skinDark: 'wood',
  white: 'silver',
  blue: 'navyBlue',
  red: 'darkRed',
  orange: 'rust',
  plum: 'darkBrown',
  magenta: 'plum',
  slate: 'navy',
  ink: 'navy',
  navyBlue: 'navy',
  brown: 'darkBrown',
};
const darker = (c: Color): Color => shade[c] ?? 'ink';

export function portrait(spec: PortraitSpec, seed: number): Raster {
  const bg = color(spec.bg, 'blue');
  const skin = color(spec.skin, 'skin');
  const hair = color(spec.hair, 'brown');
  const clothes = color(spec.clothes, 'slate');
  const out = new Raster(32, 32);

  // Background with a subtle diagonal pattern and a frame.
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) out.set(x, y, (x + y) % 6 === 0 ? darker(bg) : bg);
  }

  const f = new Raster(32, 32);
  const ellipse = (cx: number, cy: number, rx: number, ry: number, c: (x: number, y: number) => Color | null) => {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) {
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) {
          const col = c(x, y);
          if (col) f.set(x, y, col);
        }
      }
    }
  };

  // Long hair behind the shoulders.
  if (spec.hairStyle === 'long') f.rect(9, 10, 14, 17, hair);
  // Shoulders and collar.
  ellipse(15.5, 31, 12, 7, (x) => (x > 22 ? darker(clothes) : clothes));
  f.rect(13, 24, 6, 2, clothes === 'white' ? 'silver' : 'white');
  f.set(15, 26, clothes === 'white' ? 'red' : darker(clothes));
  f.set(16, 26, clothes === 'white' ? 'red' : darker(clothes));
  // Neck and head.
  f.rect(14, 20, 4, 4, darker(skin));
  ellipse(15.5, 14.5, 6, 7, (x) => (x > 19 ? darker(skin) : skin));
  f.set(9, 14, skin);
  f.set(22, 14, darker(skin));
  // Face.
  f.rect(12, 14, 2, 2, 'ink');
  f.rect(18, 14, 2, 2, 'ink');
  f.set(12, 14, 'white');
  f.set(18, 14, 'white');
  f.set(16, 17, darker(skin));
  f.rect(14, 19, 4, 1, 'darkRed');
  f.rect(11, 12, 3, 1, hair === 'white' || hair === 'silver' ? 'grey' : hair);
  f.rect(18, 12, 3, 1, hair === 'white' || hair === 'silver' ? 'grey' : hair);

  // Hair.
  const top = () => {
    ellipse(15.5, 9, 7, 4, () => hair);
    f.rect(9, 9, 2, 4, hair);
    f.rect(21, 9, 2, 4, hair);
  };
  switch (spec.hairStyle) {
    case 'short':
      top();
      break;
    case 'slick':
      top();
      for (let x = 11; x <= 19; x++) f.set(x, 7 + (x % 3 === 0 ? 0 : 1), 'white');
      break;
    case 'bob':
      top();
      f.rect(9, 9, 2, 10, hair);
      f.rect(21, 9, 2, 10, hair);
      f.rect(11, 10, 10, 1, hair);
      break;
    case 'long':
      top();
      f.rect(11, 10, 4, 1, hair);
      break;
    case 'bun':
      top();
      ellipse(15.5, 4, 3, 2.5, () => hair);
      break;
    case 'curly':
      ellipse(15.5, 9, 8.5, 5, (x, y) => (noise(x, y, seed) < 0.15 ? darker(hair) : hair));
      f.rect(8, 9, 2, 6, hair);
      f.rect(22, 9, 2, 6, hair);
      break;
    case 'mohawk':
      f.rect(14, 2, 4, 7, hair);
      f.rect(10, 8, 12, 1, darker(skin));
      break;
    case 'bald':
      f.rect(9, 12, 1, 4, hair);
      f.rect(22, 12, 1, 4, hair);
      f.set(13, 8, 'white');
      break;
  }

  // Accessories.
  switch (spec.accessory) {
    case 'glasses':
      for (const x0 of [11, 17]) {
        f.rect(x0, 13, 4, 1, 'ink');
        f.rect(x0, 16, 4, 1, 'ink');
        f.rect(x0, 13, 1, 4, 'ink');
        f.rect(x0 + 3, 13, 1, 4, 'ink');
        f.rect(x0 + 1, 14, 2, 2, 'cyan');
      }
      f.rect(15, 14, 2, 1, 'ink');
      break;
    case 'helmet':
      ellipse(15.5, 8, 8, 4.5, (x) => (x > 20 ? 'amber' : 'yellow'));
      f.rect(6, 10, 20, 2, 'amber');
      break;
    case 'fedora':
      f.rect(10, 3, 12, 6, 'ink');
      f.rect(10, 7, 12, 1, 'red');
      f.rect(6, 9, 20, 2, 'ink');
      f.rect(18, 4, 4, 3, 'white');
      f.rect(19, 5, 2, 1, 'red');
      break;
    case 'headphones':
      f.rect(10, 4, 12, 2, 'ink');
      f.rect(8, 6, 2, 5, 'ink');
      f.rect(22, 6, 2, 5, 'ink');
      f.rect(7, 11, 3, 6, 'darkGrey');
      f.rect(22, 11, 3, 6, 'darkGrey');
      break;
    case 'earrings':
      f.rect(9, 18, 1, 2, 'amber');
      f.rect(22, 18, 1, 2, 'amber');
      break;
    case 'beard':
      ellipse(15.5, 19, 6, 3.5, (x, y) => (y === 19 && x >= 14 && x <= 17 ? 'darkRed' : hair));
      break;
    case 'camera':
      f.rect(19, 24, 9, 6, 'ink');
      f.rect(20, 25, 7, 4, 'darkGrey');
      f.rect(22, 25, 3, 3, 'cyan');
      f.set(23, 26, 'white');
      f.rect(26, 23, 2, 1, 'grey');
      break;
  }

  f.outline('ink');
  out.blit(f, 0, 0);
  for (let i = 0; i < 32; i++) {
    out.set(i, 0, 'ink');
    out.set(i, 31, 'ink');
    out.set(0, i, 'ink');
    out.set(31, i, 'ink');
  }
  return out;
}
