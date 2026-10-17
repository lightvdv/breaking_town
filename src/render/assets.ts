import { Assets, Spritesheet, Texture, TextureStyle } from 'pixi.js';

/** Written by tools/art/generate.ts next to the sprites. */
export interface ArtManifest {
  residents: Record<string, number>;
  buildings: Record<string, { states: string[]; variants: number; size: number }>;
  grass: number;
  decor: string[];
  fx: string[];
}

export interface ArtAssets {
  manifest: ArtManifest;
  /** Sheets per group, one per variant. */
  residents: Record<string, Spritesheet[]>;
  /** Sheets per building type and state. */
  buildings: Record<string, Record<string, Spritesheet>>;
  tiles: Record<string, Texture>;
  decor: Record<string, Spritesheet>;
  fx: Record<string, Texture>;
}

export async function loadArt(base: string): Promise<ArtAssets> {
  TextureStyle.defaultOptions.scaleMode = 'nearest';
  const manifest: ArtManifest = await (await fetch(`${base}manifest.json`)).json();
  const url = (path: string) => `${base}sprites/${path}`;

  const urls: string[] = [];
  for (const [group, n] of Object.entries(manifest.residents)) {
    for (let v = 1; v <= n; v++) urls.push(url(`residents/${group}_${v}.json`));
  }
  for (const [type, b] of Object.entries(manifest.buildings)) {
    for (const s of b.states) urls.push(url(`buildings/${type}_${s}.json`));
  }
  const tileNames = [...Array.from({ length: manifest.grass }, (_, i) => `grass_${i + 1}`), 'road_x', 'road_y', 'road_cross'];
  for (const t of tileNames) urls.push(url(`tiles/${t}.png`));
  for (const d of manifest.decor) urls.push(url(`decor/${d}.json`));
  for (const f of manifest.fx) urls.push(url(`fx/${f}.png`));

  const loaded: Record<string, Spritesheet | Texture> = await Assets.load(urls);
  const sheet = (path: string) => loaded[url(path)] as Spritesheet;
  const texture = (path: string) => loaded[url(path)] as Texture;

  return {
    manifest,
    residents: Object.fromEntries(
      Object.entries(manifest.residents).map(([g, n]) => [g, Array.from({ length: n }, (_, i) => sheet(`residents/${g}_${i + 1}.json`))]),
    ),
    buildings: Object.fromEntries(
      Object.entries(manifest.buildings).map(([type, b]) => [
        type,
        Object.fromEntries(b.states.map((s) => [s, sheet(`buildings/${type}_${s}.json`)])),
      ]),
    ),
    tiles: Object.fromEntries(tileNames.map((t) => [t, texture(`tiles/${t}.png`)])),
    decor: Object.fromEntries(manifest.decor.map((d) => [d, sheet(`decor/${d}.json`)])),
    fx: Object.fromEntries(manifest.fx.map((f) => [f, texture(`fx/${f}.png`)])),
  };
}
