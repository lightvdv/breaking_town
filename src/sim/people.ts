import type { PublishedNews } from './news';
import { chance, pick, type RngState } from './rng';
import type { Content, ExposedStory, FateEvent, GameState, Letter, LetterKind, PersonDef, Resident } from './types';

/**
 * Named residents (CONCEPT.md §2.2а): each person is one real resident of their group, at their
 * kind of work when the game starts if possible. Their fate is the resident's fate.
 */
export function assignPeople(state: GameState, c: Content, rng: RngState): void {
  const taken = new Set<number>();
  for (const p of c.people) {
    const group = state.residents.filter((r) => r.status === 'active' && r.group === p.group && !taken.has(r.id));
    const working = p.job ? group.filter((r) => r.job !== null && state.buildings[r.job].type === p.job) : [];
    const pool = working.length ? working : group;
    if (!pool.length) continue;
    const r = pick(rng, pool);
    taken.add(r.id);
    state.people[p.id] = r.id;
  }
}

export function personResident(state: GameState, id: string): Resident | null {
  const rid = state.people[id];
  return rid === undefined ? null : state.residents[rid] ?? null;
}

/** What the people were like before the day, to tell what changed. */
export interface PeopleSnapshot {
  [id: string]: { job: number | null; status: Resident['status']; protest: boolean; fear: boolean };
}

export function snapshotPeople(state: GameState): PeopleSnapshot {
  const out: PeopleSnapshot = {};
  for (const id of Object.keys(state.people)) {
    const r = personResident(state, id)!;
    out[id] = { job: r.job, status: r.status, protest: r.protestTurns > 0, fear: r.fearTurns > 0 };
  }
  return out;
}

/** Fills {title} and the {женская|мужская} verb forms of a letter template. */
function fillLetter(text: string, title: string, female: boolean): string {
  return text.replace('{title}', title).replace(/\{([^|{}]*)\|([^|{}]*)\}/g, (_, f: string, m: string) => (female ? f : m));
}

/**
 * The day after an issue: what changed in the named residents' lives goes to their fate log, and
 * readers write to the paper — the named ones first, about what our issue did to them
 * («Письма читателей»), then now and then an anonymous reader.
 */
export function updatePeople(
  state: GameState,
  c: Content,
  rng: RngState,
  before: PeopleSnapshot,
  published: PublishedNews[],
  exposures: ExposedStory[],
): void {
  const b = c.balance;
  const fates: FateEvent[] = [];
  const letters: Letter[] = [];
  const turn = state.turn - 1;
  // The story a reader saw in the issue, as they saw it.
  const storyFor = (rid: number) => {
    const believed = state.residents[rid].beliefs.filter((x) => x.turn === turn).pop()?.title;
    if (believed) return believed;
    return published.find((n) => n.viewers.includes(rid))?.report.title ?? null;
  };
  const write = (from: PersonDef | null, kind: LetterKind, title: string | null) => {
    const texts = c.letters[kind].filter((t) => title !== null || !t.includes('{title}'));
    if (!texts.length || letters.length >= b.lettersMax) return;
    letters.push({
      from: from?.id ?? null,
      name: from ? `${from.name}, ${from.role}` : pick(rng, c.letters.anonymous),
      kind,
      text: fillLetter(pick(rng, texts), title ?? '', !!from?.female),
    });
  };

  for (const p of c.people) {
    const r = personResident(state, p.id);
    const was = before[p.id];
    if (!r || !was || was.status === 'left') continue;
    const add = (kind: FateEvent['kind'], building?: number) => fates.push({ person: p.id, turn: state.turn, kind, ...(building !== undefined ? { building } : {}) });
    const reaction = state.lastReactions[r.id];
    const title = storyFor(r.id);
    // A change in life always gets a letter; a reaction to the issue only sometimes.
    if (r.status === 'left') {
      add('left');
      write(p, 'left', title);
      continue;
    }
    if (was.job !== null && r.job === null) {
      add('lostJob', was.job);
      write(p, 'lostJob', title);
      continue;
    }
    if (was.job === null && r.job !== null) add('gotJob', r.job);
    if (!was.protest && r.protestTurns > 0) {
      add('protest');
      write(p, 'protest', title);
      continue;
    }
    if (!was.fear && r.fearTurns > 0) add('fear');
    if (!chance(rng, p.letterChance)) continue;
    if (reaction === 'outraged') write(p, 'outraged', exposures[0]?.title ?? title);
    else if (reaction === 'doubted') write(p, 'doubted', title);
    else if (reaction === 'happy') write(p, 'happy', title);
    else if (reaction === 'scared' || reaction === 'talk') write(p, 'scared', title);
    else if (state.price >= 2 && r.follows.length) write(p, 'price', null);
  }

  // An anonymous reader writes too, about the loudest reaction of the day.
  const named = new Set(Object.values(state.people));
  if (chance(rng, b.anonymousLetterChance)) {
    const readers = Object.entries(state.lastReactions)
      .map(([id, reaction]) => ({ id: Number(id), reaction }))
      .filter((x) => !named.has(x.id) && x.reaction !== 'talk');
    if (readers.length) {
      const x = pick(rng, readers);
      const kind: LetterKind = x.reaction === 'happy' || x.reaction === 'doubted' || x.reaction === 'outraged' ? x.reaction : 'scared';
      write(null, kind, kind === 'outraged' ? (exposures[0]?.title ?? storyFor(x.id)) : storyFor(x.id));
    }
  }
  state.letters = letters;
  state.fates = [...fates, ...state.fates].slice(0, b.fatesKept);
}
