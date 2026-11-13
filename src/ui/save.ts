import { createTension, type Content, type GameState, type TurnReport } from '../sim';
import { STORAGE_SUFFIX } from '../assets';
import type { TutorialProgress } from './tutorial';

/**
 * Autosave in the browser (CONCEPT.md §7.3): the game state is plain JSON, so it is kept in
 * localStorage and the game continues after a reload or when the tab comes back.
 */
// The key keeps the old working title; v2 is the game without money (CONCEPT.md §10.4), so a save
// of the money version (v1, the beta) and one of this version never read each other.
const KEY = `news-fights-save-v2${STORAGE_SUFFIX}`;

export interface SaveData<D> {
  state: GameState;
  report: TurnReport | null;
  /** The player's layout of the current issue, by card uid. */
  drafts: [number, D][];
  /** The tutorial mission's progress (CONCEPT.md §7.3 «Обучение»); null in an ordinary game. */
  tutorial: TutorialProgress | null;
}

/** Returns the saved game, or null when there is none or it does not fit the current content. */
export function loadSave<D>(c: Content): SaveData<D> | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData<D>;
    const s = data?.state;
    if (!s || s.version !== 1 || !Array.isArray(s.residents) || !Array.isArray(s.hand)) return null;
    // A game of the removed save mode cannot go on.
    if ((s.mode as string) === 'save') return null;
    // A save from before a content change may name stories or reporters that no longer exist.
    const cards = new Set(c.cards.map((t) => t.id));
    const reporters = new Set(c.reporters.map((r) => r.id));
    if (!s.hand.every((x) => cards.has(x.templateId)) || !s.reporters.every((id) => reporters.has(id))) return null;
    // Fields added after the save was made.
    s.lastSeen ??= {};
    s.reporterTopics ??= {};
    s.agencyOffer ??= [];
    s.agencyCalls ??= 0;
    // «Голос города» left the game (CONCEPT.md §10.4б): what it kept in a save is dropped.
    const old = s as unknown as Record<string, unknown>;
    for (const key of ['rival', 'rivalWatch', 'ourPrinted', 'rivalReactions']) delete old[key];
    for (const r of s.residents) {
      r.fearTurns ??= 0;
      delete (r as unknown as Record<string, unknown>).rivalReader;
      delete (r as unknown as Record<string, unknown>).rivalTrust;
    }
    s.mode ??= 'destroy';
    s.arcs ??= [];
    s.arcsDone ??= [];
    s.offer ??= null;
    if (s.offer && !c.offers.some((o) => o.id === s.offer!.id)) s.offer = null;
    s.deals ??= [];
    s.lastOfferTurn ??= 0;
    s.staff ??= {};
    s.people ??= {};
    s.letters ??= [];
    s.fates ??= [];
    s.difficulty ??= 'normal';
    s.length ??= 'full';
    s.collection ??= null;
    s.cashReady ??= {};
    s.cashEffects ??= {};
    s.shopPicks ??= 0;
    s.shopExtras ??= 0;
    s.clashDays ??= 0;
    s.seats ??= Math.max(c.balance.startSeats, s.reporters.length);
    // Channels and upgrades that left the game (radio, TV, social networks) are dropped; the rest stays.
    s.ownedChannels = s.ownedChannels.filter((id) => c.channels.some((x) => x.id === id));
    s.upgrades = s.upgrades.filter((id) => c.upgrades.some((x) => x.id === id));
    for (const r of s.residents) r.follows = r.follows.filter((id) => s.ownedChannels.includes(id));
    s.investigations = (s.investigations ?? []).filter((x) => c.groups.some((g) => g.id === x.target));
    s.pendingLies ??= [];
    s.tension ??= createTension(c);
    s.reconciliation ??= null;
    s.reconcileReadyTurn ??= 0;
    s.todayIncidents ??= [];
    s.tasks ??= [];
    s.exposedTotal ??= 0;
    s.cleanStreak ??= 0;
    s.shopOffer ??= [];
    s.shopRefreshTurn ??= 0;
    s.abilityReady ??= {};
    s.twist ??= null;
    s.hunt ??= null;
    s.crimeBoost ??= 0;
    s.crimeHeat ??= 0;
    s.stains ??= {};
    s.vouchers ??= 0;
    s.town ??= null;
    s.missedEvents ??= [];
    // Tasks and twists removed from the content are dropped.
    s.tasks = s.tasks.filter((t) => c.tasks.some((x) => x.id === t.id));
    if (s.twist && !c.twists.some((x) => x.id === s.twist!.id)) s.twist = null;
    // Upgrades removed from the content (e.g. the extra front page) are dropped.
    s.upgrades = s.upgrades.filter((id) => c.upgrades.some((u) => u.id === id));
    return { state: s, report: data.report ?? null, drafts: Array.isArray(data.drafts) ? data.drafts : [], tutorial: data.tutorial && typeof data.tutorial.step === 'number' ? data.tutorial : null };
  } catch {
    return null;
  }
}

export function writeSave<D>(data: SaveData<D>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Private mode or full storage: the game still works, it just is not kept.
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear.
  }
}
