import type { Content, Difficulty, GameLength, Rarity, UpgradeDef } from '../sim';
import { STORAGE_SUFFIX } from '../assets';

/**
 * The player's collection of cards between games (CONCEPT.md §3.5б): which cards they have and at
 * what level, and the «связи» earned in games that buy packs and level-ups in the editor's office.
 * Kept in the browser apart from the save; reads and writes never throw.
 */
export interface Collection {
  /** «Связи холдинга»: earned in every game, spent in the office. */
  currency: number;
  /** Card id → level 1..3. */
  cards: Record<string, number>;
  /** Cards opened in packs since the office was last visited: they wear a «Новая» badge. */
  fresh: string[];
}

const KEY = `breaking-town-collection${STORAGE_SUFFIX}`;

/** Highest level of a card. */
export const MAX_LEVEL = 3;

/** Cards that can be collected: the draft's cards (forks are taken in a game), not of a hidden mode. */
export function collectable(c: Content, hiddenModes: string[] = ['save']): UpgradeDef[] {
  return c.upgrades.filter((u) => !u.fork && !!u.rarity && !(u.mode && hiddenModes.includes(u.mode)));
}

export function loadCollection(c: Content): Collection {
  let data: Partial<Collection> = {};
  try {
    data = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Collection>;
  } catch {
    data = {};
  }
  const cards: Record<string, number> = {};
  // The starter cards are always there; cards that left the game are dropped.
  for (const u of c.upgrades) if (u.starter) cards[u.id] = 1;
  for (const [id, level] of Object.entries(data.cards ?? {})) if (c.upgrades.some((u) => u.id === id && !u.fork)) cards[id] = Math.min(MAX_LEVEL, Math.max(1, Math.round(level)));
  return { currency: Math.max(0, Math.round(data.currency ?? 0)), cards, fresh: (data.fresh ?? []).filter((id) => cards[id]) };
}

export function saveCollection(col: Collection): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(col));
  } catch {
    // Private mode: the collection is not kept.
  }
}

/**
 * «Связи» for a finished game (CONCEPT.md §3.5б): more for a win and each star, a little even for a
 * loss; harder and longer games pay more. The tutorial pays a fixed sum once it is over.
 */
export function rewardFor(result: { win: boolean; stars: number; difficulty: Difficulty; length: GameLength; tutorial: boolean }): number {
  if (result.tutorial) return 60;
  const base = result.win ? 40 + 15 * result.stars : 15;
  const level = { easy: 0.8, normal: 1, hard: 1.4 }[result.difficulty];
  const length = result.length === 'short' ? 0.6 : 1;
  return Math.round(base * level * length);
}

/** A pack of the office: what it costs and the odds of each rarity. */
export interface PackDef {
  id: 'envelope' | 'safe';
  name: string;
  text: string;
  cost: number;
  odds: Record<Rarity, number>;
}

export const packs: PackDef[] = [
  { id: 'envelope', name: 'Конверт с досье', text: 'Одна случайная карта: чаще обычная, иногда редкая, изредка легендарная.', cost: 60, odds: { common: 0.7, rare: 0.25, legendary: 0.05 } },
  { id: 'safe', name: 'Сейф из мэрии', text: 'Одна случайная карта: редкая или легендарная.', cost: 200, odds: { common: 0, rare: 0.75, legendary: 0.25 } },
];

/** What a pack gave: a new card, or — when there is nothing left to find — «связи» back. */
export type PackResult = { card: UpgradeDef; rarity: Rarity } | { refund: number };

const RARITY_ORDER: Rarity[] = ['legendary', 'rare', 'common'];

/**
 * Opens a pack: draws a rarity by its odds, then a card of that rarity the player does not have yet;
 * if they have them all, the next rarity down (then up). With the whole collection, half the price back.
 */
export function openPack(col: Collection, c: Content, pack: PackDef, random: () => number = Math.random): PackResult {
  if (col.currency < pack.cost) throw new Error('Не хватает связей');
  col.currency -= pack.cost;
  let roll = random();
  let rarity: Rarity = 'common';
  for (const r of RARITY_ORDER) {
    if (roll < pack.odds[r]) {
      rarity = r;
      break;
    }
    roll -= pack.odds[r];
  }
  const missing = (r: Rarity) => collectable(c).filter((u) => u.rarity === r && !col.cards[u.id]);
  const order = [rarity, ...RARITY_ORDER.slice(RARITY_ORDER.indexOf(rarity) + 1), ...RARITY_ORDER.slice(0, RARITY_ORDER.indexOf(rarity)).reverse()];
  for (const r of order) {
    const pool = missing(r);
    if (!pool.length) continue;
    const card = pool[Math.floor(random() * pool.length)];
    col.cards[card.id] = 1;
    col.fresh = [...col.fresh, card.id];
    return { card, rarity: r };
  }
  const refund = Math.round(pack.cost / 2);
  col.currency += refund;
  return { refund };
}

/** The price of the next level of a card, or null at the top. */
export function levelCost(u: UpgradeDef, level: number): number | null {
  if (level >= MAX_LEVEL) return null;
  const price: Record<Rarity, [number, number]> = { common: [40, 90], rare: [80, 180], legendary: [150, 320] };
  return price[u.rarity ?? 'common'][level - 1];
}

/** Levels a card up for its price. */
export function levelUp(col: Collection, u: UpgradeDef): void {
  const level = col.cards[u.id];
  const cost = level ? levelCost(u, level) : null;
  if (cost === null || col.currency < cost) throw new Error('Нельзя улучшить');
  col.currency -= cost;
  col.cards[u.id] = level + 1;
}

/** Rarity in words, for the card's ribbon. */
export const rarityNames: Record<Rarity, string> = { common: 'обычная', rare: 'редкая', legendary: 'легендарная' };

/** Directions of the cards in words (the tags of `synergies.json`). */
export const tagNames: Record<string, string> = {
  yellow: 'жёлтая пресса',
  crime: 'криминал',
  hunt: 'травля',
  split: 'раскол',
  money: 'деньги',
  trust: 'честное лицо',
  rival: 'против «Голоса»',
  staff: 'редакция',
};
