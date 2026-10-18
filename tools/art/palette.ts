/**
 * The game's single shared palette (CONCEPT.md §7.2): ENDESGA 32 by Endesga, published on Lospec.
 * Sprites refer to colors by name so that a designer can swap the palette in one place.
 */
export const PALETTE = {
  rust: '#be4a2f',
  clay: '#d77643',
  sand: '#ead4aa',
  tan: '#e4a672',
  wood: '#b86f50',
  brown: '#733e39',
  darkBrown: '#3e2731',
  darkRed: '#a22633',
  red: '#e43b44',
  orange: '#f77622',
  amber: '#feae34',
  yellow: '#fee761',
  green: '#63c74d',
  darkGreen: '#3e8948',
  forest: '#265c42',
  deepTeal: '#193c3e',
  navyBlue: '#124e89',
  blue: '#0099db',
  cyan: '#2ce8f5',
  white: '#ffffff',
  silver: '#c0cbdc',
  grey: '#8b9bb4',
  darkGrey: '#5a6988',
  slate: '#3a4466',
  navy: '#262b44',
  ink: '#181425',
  hotRed: '#ff0044',
  plum: '#68386c',
  magenta: '#b55088',
  pink: '#f6757a',
  skin: '#e8b796',
  skinDark: '#c28569',
} as const;

export type Color = keyof typeof PALETTE;

export function rgb(color: Color): [number, number, number] {
  const hex = PALETTE[color];
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

export function gimpPalette(): string {
  const lines = ['GIMP Palette', 'Name: Breaking Town (ENDESGA 32)', 'Columns: 8', '#'];
  for (const name of Object.keys(PALETTE) as Color[]) {
    const [r, g, b] = rgb(name);
    lines.push(`${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${name}`);
  }
  return lines.join('\n') + '\n';
}
