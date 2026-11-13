import { removeReporter } from './staff';
import { onSale } from './shop';
import { averageTrust, clamp } from './lookup';
import type { Content, GameState, Requirement, UpgradeDef } from './types';

/**
 * There is no money in a game (CONCEPT.md §10.3): readers are the paper's strength, reputation its
 * health and the board's cards its growth. This file keeps what is left of buying — taking a card
 * of the board's offer — and paying in reputation.
 */

export interface PurchaseOption {
  id: string;
  kind: 'upgrade';
  name: string;
  description: string;
  /** Requirements are met. */
  unlocked: boolean;
  /** It can be taken now (requirements met, the offer still open). */
  affordable: boolean;
}

export function requirementMet(state: GameState, req: Requirement | null | undefined): boolean {
  if (!req) return true;
  if (req.channel && !state.ownedChannels.includes(req.channel)) return false;
  if (req.upgrade && !state.upgrades.includes(req.upgrade)) return false;
  return true;
}

/** The board's cards on offer today (CONCEPT.md §3.5): one of them is taken for free. */
export function listPurchases(state: GameState, c: Content): PurchaseOption[] {
  const out: PurchaseOption[] = [];
  for (const u of c.upgrades) {
    if (state.upgrades.includes(u.id) || !onSale(state, u)) continue;
    const unlocked = requirementMet(state, u.requires) && (!u.effects.channel || state.ownedChannels.includes(u.effects.channel));
    out.push({ id: u.id, kind: 'upgrade', name: u.name, description: u.description, unlocked, affordable: unlocked });
  }
  return out;
}

/** A task's voucher: one more card of the same offer. */
export function deckFree(state: GameState, _u: UpgradeDef): boolean {
  return state.vouchers > 0;
}

/** Fires a hired reporter; the last one cannot be fired. */
export function fireReporter(state: GameState, id: string): void {
  if (state.outcome) throw new Error('Game is over');
  if (!state.reporters.includes(id)) throw new Error(`Reporter ${id} is not hired`);
  if (state.reporters.length <= 1) throw new Error('The last reporter cannot be fired');
  removeReporter(state, id);
}

export function purchase(state: GameState, c: Content, id: string): void {
  if (state.outcome) throw new Error('Game is over');
  const option = listPurchases(state, c).find((x) => x.id === id);
  if (!option) throw new Error(`Nothing to take with id ${id}`);
  if (!option.affordable) throw new Error(`Cannot take ${id} now`);
  const u = c.upgrades.find((x) => x.id === id)!;
  state.upgrades.push(id);
  // One card of the offer is taken and the offer is spent; a task's voucher keeps it open for one more (CONCEPT.md §3.5б).
  if ((state.shopPicks ?? 0) > 0 && deckFree(state, u)) state.vouchers--;
  state.shopPicks = (state.shopPicks ?? 0) + 1;
  state.shopOffer = state.vouchers > 0 ? state.shopOffer.filter((x) => x !== id) : [];
}

/**
 * Pays in reputation (CONCEPT.md §10.4): every resident in town loses `amount` points. Never
 * below zero.
 */
export function payTrust(state: GameState, amount: number): void {
  if (amount <= 0) return;
  for (const r of state.residents) if (r.status === 'active') r.trust = clamp(r.trust - amount, 0, 100);
}

/**
 * Why a move paid in reputation is refused: it would bring the paper down to its collapse
 * (`trustCollapse`) by itself — a press of a button never loses the game. Null when it can be paid.
 */
export function trustBlock(state: GameState, c: Content, amount: number): string | null {
  if (amount <= 0) return null;
  return averageTrust(state, c) - amount < c.balance.trustCollapse + 1 ? 'no trust' : null;
}
