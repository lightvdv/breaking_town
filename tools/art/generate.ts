/**
 * Generates the temporary pixel art (CONCEPT.md §7.2) into public/assets.
 * File names and sheet layouts follow the concept so a designer can replace any file 1:1.
 *
 *   npm run art
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { illustration, scenes } from './illustrations';
import { portrait, type PortraitSpec } from './portraits';
import { dirname, join } from 'node:path';
import { buildingArts, FRAMES } from './buildings';
import { looks, residentSheet, ROWS } from './characters';
import { gimpPalette, PALETTE, type Color } from './palette';
import { Raster } from './raster';
import { bench, bush, flowers, fountain, fxIcon, fxIcons, grass, lamp, road, tree } from './tiles';

const OUT = join(process.cwd(), 'public', 'assets');

function write(path: string, data: string | Buffer): void {
  const full = join(OUT, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, data);
}

/** PixiJS spritesheet JSON: frames "<row>_<i>", one animation per row. */
function atlas(image: string, fw: number, fh: number, rows: { name: string; frames: number }[], sheetW: number) {
  const frames: Record<string, unknown> = {};
  const animations: Record<string, string[]> = {};
  rows.forEach((row, j) => {
    animations[row.name] = [];
    for (let i = 0; i < row.frames; i++) {
      const name = `${row.name}_${i}`;
      frames[name] = {
        frame: { x: i * fw, y: j * fh, w: fw, h: fh },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: fw, h: fh },
        sourceSize: { w: fw, h: fh },
      };
      animations[row.name].push(name);
    }
  });
  return JSON.stringify(
    { frames, animations, meta: { image, format: 'RGBA8888', size: { w: sheetW, h: rows.length * fh }, scale: '1' } },
    null,
    1,
  );
}

function sheetFromFrames(frames: Raster[][], fw: number, fh: number): Raster {
  const cols = Math.max(...frames.map((r) => r.length));
  const sheet = new Raster(cols * fw, frames.length * fh);
  frames.forEach((row, j) => row.forEach((f, i) => sheet.blit(f, i * fw, j * fh)));
  return sheet;
}

// Palette.
write('palette/palette.gpl', gimpPalette());
const pal = new Raster(256, 8);
(Object.keys(PALETTE) as Color[]).forEach((c, i) => pal.rect(i * 8, 0, 8, 8, c));
write('palette/palette.png', pal.toPng());

// Residents.
for (const [group, variants] of Object.entries(looks)) {
  variants.forEach((look, v) => {
    const name = `${group}_${v + 1}`;
    write(`sprites/residents/${name}.png`, residentSheet(look).toPng());
    write(
      `sprites/residents/${name}.json`,
      atlas(`${name}.png`, 16, 16, ROWS.map((r) => ({ name: r.name, frames: r.frames.length })), 64),
    );
  });
}

// Buildings: frames go right, variants go down; animation "v<variant>".
for (const art of buildingArts) {
  const size = 64 * art.size;
  for (const state of art.states) {
    const frameCount = state === 'active' ? FRAMES : 1;
    const frames: Raster[][] = [];
    for (let v = 0; v < art.variants; v++) {
      frames.push(
        Array.from({ length: frameCount }, (_, f) => {
          const r = new Raster(size, size);
          art.draw(r, state, v, f);
          return r;
        }),
      );
    }
    const name = `${art.type}_${state}`;
    write(`sprites/buildings/${name}.png`, sheetFromFrames(frames, size, size).toPng());
    write(
      `sprites/buildings/${name}.json`,
      atlas(`${name}.png`, size, size, frames.map((_, v) => ({ name: `v${v}`, frames: frameCount })), frameCount * size),
    );
  }
}

// Ground tiles.
[0, 1, 2].forEach((v) => write(`sprites/tiles/grass_${v + 1}.png`, grass(v).toPng()));
for (const kind of ['x', 'y', 'cross'] as const) write(`sprites/tiles/road_${kind}.png`, road(kind).toPng());

// Decor (park objects), each a sheet with one animation "idle".
const decor: Record<string, Raster[]> = {
  tree_1: [tree(0)],
  tree_2: [tree(1)],
  tree_3: [tree(2)],
  bush: [bush()],
  flowers: [flowers()],
  bench: [bench()],
  lamp: [0, 1, 2, 3].map(lamp),
  fountain: [0, 1, 2, 3].map(fountain),
};
for (const [name, frames] of Object.entries(decor)) {
  write(`sprites/decor/${name}.png`, sheetFromFrames([frames], 64, 64).toPng());
  write(`sprites/decor/${name}.json`, atlas(`${name}.png`, 64, 64, [{ name: 'idle', frames: frames.length }], frames.length * 64));
}

// Reaction icons.
for (const name of Object.keys(fxIcons)) write(`sprites/fx/${name}.png`, fxIcon(name).toPng());

// Reporter portraits, described in the content file.
const reporters: { id: string; portrait: PortraitSpec }[] = JSON.parse(
  readFileSync(join(process.cwd(), 'src', 'content', 'reporters.json'), 'utf8'),
);
reporters.forEach((r, i) => write(`sprites/reporters/${r.id}.png`, portrait(r.portrait, i).toPng()));

// News illustrations: every card template needs a scene.
const cards: { id: string }[] = JSON.parse(readFileSync(join(process.cwd(), 'src', 'content', 'cards.json'), 'utf8'));
const missing = cards.filter((c) => !scenes[c.id]).map((c) => c.id);
if (missing.length) throw new Error(`No illustration scene for: ${missing.join(', ')}`);
for (const c of cards) write(`sprites/news/${c.id}.png`, illustration(scenes[c.id]).toPng());

// What exists, so the game does not hard-code variant counts.
write(
  'manifest.json',
  JSON.stringify(
    {
      residents: Object.fromEntries(Object.entries(looks).map(([g, v]) => [g, v.length])),
      buildings: Object.fromEntries(buildingArts.map((a) => [a.type, { states: a.states, variants: a.variants, size: a.size }])),
      grass: 3,
      decor: Object.keys(decor),
      fx: Object.keys(fxIcons),
      reporters: reporters.map((r) => r.id),
      news: cards.map((c) => c.id),
    },
    null,
    2,
  ),
);

console.log(`Art written to ${OUT}`);
