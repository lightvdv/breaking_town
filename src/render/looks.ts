/**
 * The look of a town's way of life (CONCEPT.md §9.5): its own grass and park trees, and a strip of
 * landmarks behind the far (upper-right) edge of the map — off the roads, so residents never walk there.
 */

/** Rows of the strip, at y = -1 … -EDGE_DEPTH. */
export const EDGE_DEPTH = 3;

export interface EdgeItem {
  name: string;
  x: number;
  y: number;
  size: 1 | 2;
}

export interface Edge {
  /** The ground tile of a strip cell. */
  ground: (x: number, y: number) => string;
  items: EdgeItem[];
}

type Hash = (x: number, y: number) => number;

export function lotGrass(look: string | null, variant: number): string {
  return look ? `grass_${look}_${variant}` : `grass_${variant}`;
}

/** Park decor of the town's look: palms at the sea, autumn trees in an old town, fewer trees by the plant. */
export function parkDecor(look: string | null, name: string, h: number): string {
  if (!name.startsWith('tree_')) return name;
  if (look === 'resort' && h < 0.3) return 'palm';
  if (look === 'old') return 'tree_3';
  if (look === 'mono' && h < 0.25) return 'bush';
  return name;
}

/**
 * The ground of any tile outside the map, so that the strip and the land around it agree: the sea runs
 * to the horizon along one straight shore, the plant's yard and the gardens are plots of their own,
 * the town's middle roads lead out of it, fields lie on plain land.
 */
export function worldGround(look: string | null, x: number, y: number, n: number, hash: Hash): string {
  const mid = Math.floor(n / 6) * 3;
  const sea = look === 'port' || look === 'resort';
  if ((y === mid && (x < 0 || x >= n)) || (x === mid && y >= n)) return y === mid ? 'road_x' : 'road_y';
  if (sea && y <= -2) return `water_${1 + Math.floor(hash(x + 40, y + 40) * 2)}`;
  if (sea && y === -1) return look === 'resort' ? 'sand' : 'concrete';
  if (look === 'mono' && y < 0 && y >= -7 && x >= -3 && x < n + 3) return 'concrete';
  if (look === 'center' && (y === -1 || y === -2) && x >= 0 && x < n) return 'concrete';
  if (look === 'sleepy' && y <= -2 && y >= -6 && x >= -4 && x < n + 4) return 'soil';
  const nearRoad = Math.abs(y - mid) <= 1 || (y >= n && Math.abs(x - mid) <= 1);
  const outside = x < 0 || x >= n || y >= n || y < -EDGE_DEPTH;
  if (outside && !nearRoad && hash(Math.floor((x + 60) / 4), Math.floor((y + 60) / 3)) < 0.22) return 'soil';
  return lotGrass(look, 1 + Math.floor(hash(x + 7, y + 9) * 3));
}

/** Decor of the land outside the map and the strip: by the ground, and denser woods further from town. */
export function worldDecor(look: string | null, ground: string, d: number, h: number): string | null {
  if (ground.startsWith('road')) return null;
  if (ground.startsWith('water')) return h < 0.015 ? 'boat' : null;
  if (ground === 'sand') return h < 0.3 ? 'palm' : h < 0.42 ? `umbrella_${1 + Math.floor(h * 100) % 2}` : null;
  if (ground === 'concrete') {
    if (look === 'mono') return h < 0.07 ? 'chimney' : h < 0.2 ? `containers_${1 + Math.floor(h * 100) % 3}` : null;
    return h < 0.25 ? `containers_${1 + Math.floor(h * 100) % 3}` : null;
  }
  if (ground === 'soil') return look === 'sleepy' ? (h < 0.06 ? 'shed' : h < 0.5 ? 'beds' : null) : null;
  const forest = Math.min(0.8, 0.06 + d * 0.08);
  if (h < forest) return parkDecor(look, `tree_${1 + Math.floor((h / forest) * 2.99)}`, (h * 7.3) % 1);
  return h < forest + 0.05 ? 'bush' : null;
}

export function edgeOf(look: string | null, n: number, hash: Hash): Edge | null {
  if (!look) return null;
  const items: EdgeItem[] = [];
  const taken = new Set<string>();
  const free = (x: number, y: number, size = 1) => {
    for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) if (x + dx >= n || taken.has(`${x + dx},${y + dy}`)) return false;
    return true;
  };
  const put = (name: string, x: number, y: number, size: 1 | 2 = 1) => {
    if (!free(x, y, size)) return;
    for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) taken.add(`${x + dx},${y + dy}`);
    items.push({ name, x, y, size });
  };
  const cells = (y: number, fill: (x: number, h: number) => string | null) => {
    for (let x = 0; x < n; x++) {
      const name = fill(x, hash(x * 5 + 3, y * 11 + 17));
      if (name) put(name, x, y);
    }
  };
  const mid = Math.floor(n / 2) - 1;
  const ground = (x: number, y: number) => worldGround(look, x, y, n, hash);
  const tree = (h: number) => `tree_${1 + Math.floor(h * 2.9)}`;

  switch (look) {
    case 'port':
      put('ship', mid, -3, 2);
      for (const x of [2, n - 4]) put('crane', x, -1);
      cells(-1, (_x, h) => (h < 0.55 ? `containers_${1 + Math.floor(h * 5.4)}` : null));
      cells(-2, (_x, h) => (h < 0.07 ? 'boat' : null));
      cells(-3, (_x, h) => (h < 0.07 ? 'boat' : null));
      return { ground, items };
    case 'resort':
      cells(-1, (x, h) => (h < 0.75 ? (x % 2 === 0 ? 'palm' : `umbrella_${1 + Math.floor(h * 2.6)}`) : null));
      cells(-2, (_x, h) => (h < 0.1 ? 'boat' : null));
      cells(-3, (_x, h) => (h < 0.08 ? 'boat' : null));
      return { ground, items };
    case 'mono':
      put('cooling_tower', 2, -3, 2);
      put('cooling_tower', n - 6, -3, 2);
      cells(-2, (x) => (x % 3 === 1 ? 'chimney' : null));
      cells(-3, (x) => (x % 4 === 3 ? 'chimney' : null));
      cells(-1, (_x, h) => (h < 0.35 ? `containers_${1 + Math.floor(h * 8.5)}` : null));
      return { ground, items };
    case 'student':
      put('institute', mid, -3, 2);
      cells(-3, (_x, h) => (h < 0.6 ? tree(h / 0.6) : null));
      cells(-2, (_x, h) => (h < 0.35 ? tree(h / 0.35) : h < 0.5 ? 'flowers' : null));
      cells(-1, (x, h) => (h < 0.25 ? 'bench' : x % 3 === 0 ? 'lamp' : null));
      return { ground, items };
    case 'old':
      put('church', mid, -3, 2);
      cells(-3, (_x, h) => (h < 0.65 ? 'tree_3' : null));
      cells(-2, (_x, h) => (h < 0.45 ? 'tree_3' : h < 0.6 ? 'bench' : null));
      cells(-1, (_x, h) => (h < 0.2 ? 'bench' : h < 0.35 ? 'bush' : null));
      return { ground, items };
    case 'center':
      put('monument', mid + 1, -2);
      cells(-1, (x, h) => (h < 0.75 ? `stall_${1 + (x % 2)}` : null));
      cells(-2, (x, h) => (x % 4 === 0 ? 'lamp' : h < 0.3 ? 'flowers' : null));
      cells(-3, (_x, h) => (h < 0.55 ? tree(h / 0.55) : null));
      return { ground, items };
    case 'sleepy':
    default:
      cells(-1, (_x, h) => (h < 0.4 ? 'garages' : h < 0.5 ? 'bush' : null));
      cells(-2, (_x, h) => (h < 0.15 ? 'shed' : h < 0.75 ? 'beds' : null));
      cells(-3, (_x, h) => (h < 0.12 ? 'shed' : h < 0.65 ? 'beds' : h < 0.8 ? tree(h) : null));
      return { ground, items };
  }
}
