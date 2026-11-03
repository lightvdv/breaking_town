import type { TownDef } from '../sim';

/**
 * The region map of the campaign (CONCEPT.md §9.4): one picture drawn in PixelLab — a green summer
 * region with a river, a lake, forests, fields, a rocky coast with a harbour and a road through clearings —
 * and a PixelLab icon of each town set on its clearing. Town positions (`TownDef.map`) are in the
 * picture's pixels, so the pins land on the clearings whatever the map's size on screen.
 */
export const MAP_W = 688;
export const MAP_H = 384;

/** The region picture, relative to the assets folder. */
export const REGION_ART = 'sprites/campaign/region.png';

/** A town's icon on the map and its card (48 × 48). */
export function townArt(t: TownDef): string {
  return `sprites/campaign/${t.id}.png`;
}
