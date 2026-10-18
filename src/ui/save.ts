import type { Content, GameState, TurnReport } from '../sim';

/**
 * Autosave in the browser (CONCEPT.md §7.3): the game state is plain JSON, so it is kept in
 * localStorage and the game continues after a reload or when the tab comes back.
 */
// The key keeps the old working title so existing saves are not lost.
const KEY = 'news-fights-save-v1';

export interface SaveData<D> {
  state: GameState;
  report: TurnReport | null;
  /** The player's layout of the current issue, by card uid. */
  drafts: [number, D][];
}

/** Returns the saved game, or null when there is none or it does not fit the current content. */
export function loadSave<D>(c: Content): SaveData<D> | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData<D>;
    const s = data?.state;
    if (!s || s.version !== 1 || !Array.isArray(s.residents) || !Array.isArray(s.hand)) return null;
    // A save from before a content change may name stories or reporters that no longer exist.
    const cards = new Set(c.cards.map((t) => t.id));
    const reporters = new Set(c.reporters.map((r) => r.id));
    if (!s.hand.every((x) => cards.has(x.templateId)) || !s.reporters.every((id) => reporters.has(id))) return null;
    // Fields added after the save was made.
    s.lastSeen ??= {};
    s.reporterTopics ??= {};
    s.investigations ??= [];
    s.pendingLies ??= [];
    // Upgrades removed from the content (e.g. the extra front page) are dropped.
    s.upgrades = s.upgrades.filter((id) => c.upgrades.some((u) => u.id === id));
    return { state: s, report: data.report ?? null, drafts: Array.isArray(data.drafts) ? data.drafts : [] };
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
