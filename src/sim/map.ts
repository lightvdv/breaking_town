import { int, type RngState } from './rng';
import type { Building, Content } from './types';

/**
 * The city is a square of blocks. Every third row and column of tiles is a road; between roads
 * lie 2×2 lots. A lot holds one 2×2 building or up to `smallPerLot` 1×1 buildings.
 */
export const BLOCK = 3;

export function mapSizeFor(blocks: number): number {
  return blocks * BLOCK + 1;
}

export function isRoadTile(x: number, y: number): boolean {
  return x % BLOCK === 0 || y % BLOCK === 0;
}

function shuffle<T>(rng: RngState, items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = int(rng, i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function createBuildings(c: Content, rng: RngState): { buildings: Building[]; mapSize: number } {
  const blocks = c.balance.mapBlocks;
  const lots: { x: number; y: number }[] = [];
  for (let by = 0; by < blocks; by++) {
    for (let bx = 0; bx < blocks; bx++) lots.push({ x: 1 + BLOCK * bx, y: 1 + BLOCK * by });
  }
  shuffle(rng, lots);

  const takeLot = () => {
    const lot = lots.shift();
    if (!lot) throw new Error('The map has too few lots for all buildings');
    return lot;
  };
  let slots: { x: number; y: number }[] = [];
  const takeSlot = () => {
    if (slots.length === 0) {
      const lot = takeLot();
      const cells = shuffle(rng, [
        { x: lot.x, y: lot.y },
        { x: lot.x + 1, y: lot.y },
        { x: lot.x, y: lot.y + 1 },
        { x: lot.x + 1, y: lot.y + 1 },
      ]);
      slots = cells.slice(0, c.balance.smallPerLot);
    }
    return slots.shift()!;
  };

  const buildings: Building[] = [];
  for (const def of c.buildings) {
    for (let i = 0; i < def.count; i++) {
      const pos = def.size === 2 ? takeLot() : takeSlot();
      buildings.push({
        id: buildings.length,
        type: def.type,
        x: pos.x,
        y: pos.y,
        size: def.size,
        jobs: def.jobs,
        open: true,
        turnover: 0,
      });
    }
  }
  return { buildings, mapSize: mapSizeFor(blocks) };
}

/** Lots needed for the content; used by validateContent. */
export function lotsNeeded(c: Content): number {
  const big = c.buildings.filter((b) => b.size === 2).reduce((s, b) => s + b.count, 0);
  const small = c.buildings.filter((b) => b.size === 1).reduce((s, b) => s + b.count, 0);
  return big + Math.ceil(small / c.balance.smallPerLot);
}
