import { tr } from '../i18n';
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

/** Cards that can be collected: the draft's cards (forks are taken in a game). */
export function collectable(c: Content): UpgradeDef[] {
  return c.upgrades.filter((u) => !u.fork && !!u.rarity);
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
 * loss; harder and longer games pay more. The tutorial pays a fixed sum once it is over. A campaign
 * town pays half as much again: one run of the campaign with two stars a town on average buys the
 * whole deck; the free games then pay for the levels.
 */
export function rewardFor(result: { win: boolean; stars: number; difficulty: Difficulty; length: GameLength; tutorial: boolean; campaign: boolean }): number {
  if (result.tutorial) return 60;
  const base = result.win ? 40 + 15 * result.stars : 15;
  const level = { easy: 0.8, normal: 1, hard: 1.4 }[result.difficulty];
  const length = result.length === 'short' ? 0.6 : 1;
  return Math.round(base * level * length * (result.campaign ? 1.5 : 1));
}

/** A pack of the office: what it costs and the odds of each rarity. */
export interface PackDef {
  id: 'envelope' | 'safe';
  name: string;
  text: string;
  cost: number;
  /** New cards in one pack. */
  count: number;
  odds: Record<Rarity, number>;
}

export const packs: PackDef[] = [
  { id: 'envelope', name: tr('Конверт с досье'), text: tr('Одна новая карта: чаще обычная, иногда редкая, изредка легендарная.'), cost: 60, count: 1, odds: { common: 0.7, rare: 0.25, legendary: 0.05 } },
  // Three cards for the price of less than three envelopes: the bulk buy for a collector.
  { id: 'safe', name: tr('Сейф из мэрии'), text: tr('Три новые карты: редкие или легендарные.'), cost: 160, count: 3, odds: { common: 0, rare: 0.75, legendary: 0.25 } },
];

/** What a pack gave: its new cards, and «связи» back for each card there was nothing left to find. */
export type PackResult = { cards: { card: UpgradeDef; rarity: Rarity }[]; refund: number };

const RARITY_ORDER: Rarity[] = ['legendary', 'rare', 'common'];

/**
 * Opens a pack: for each of its cards draws a rarity by its odds, then a card of that rarity the player
 * does not have yet; if they have them all, the next rarity down (then up). A card there is nothing
 * left to find for gives half its share of the price back.
 */
export function openPack(col: Collection, c: Content, pack: PackDef, random: () => number = Math.random): PackResult {
  if (col.currency < pack.cost) throw new Error(tr('Не хватает связей'));
  col.currency -= pack.cost;
  const result: PackResult = { cards: [], refund: 0 };
  const missing = (r: Rarity) => collectable(c).filter((u) => u.rarity === r && !col.cards[u.id]);
  for (let i = 0; i < pack.count; i++) {
    let roll = random();
    let rarity: Rarity = 'common';
    for (const r of RARITY_ORDER) {
      if (roll < pack.odds[r]) {
        rarity = r;
        break;
      }
      roll -= pack.odds[r];
    }
    const order = [rarity, ...RARITY_ORDER.slice(RARITY_ORDER.indexOf(rarity) + 1), ...RARITY_ORDER.slice(0, RARITY_ORDER.indexOf(rarity)).reverse()];
    const r = order.find((x) => missing(x).length > 0);
    if (!r) {
      result.refund += Math.round(pack.cost / pack.count / 2);
      continue;
    }
    const pool = missing(r);
    const card = pool[Math.floor(random() * pool.length)];
    col.cards[card.id] = 1;
    col.fresh = [...col.fresh, card.id];
    result.cards.push({ card, rarity: r });
  }
  col.currency += result.refund;
  return result;
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
  if (cost === null || col.currency < cost) throw new Error(tr('Нельзя улучшить'));
  col.currency -= cost;
  col.cards[u.id] = level + 1;
}

/** Rarity in words, for the card's ribbon. */
export const rarityNames: Record<Rarity, string> = { common: tr('обычная'), rare: tr('редкая'), legendary: tr('легендарная') };

/** Directions of the cards in words (the tags of `synergies.json`). */
export const tagNames: Record<string, string> = {
  yellow: tr('жёлтая пресса'),
  crime: tr('криминал'),
  hunt: tr('травля'),
  split: tr('раскол'),
  money: tr('деньги'),
  trust: tr('честное лицо'),
  rival: tr('против «Голоса»'),
  staff: tr('редакция'),
};
