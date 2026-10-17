import { describe, expect, it } from 'vitest';
import { content } from '../src/content';
import {
  averageTrust,
  createGame,
  createRng,
  fireReporter,
  isRoadTile,
  listPurchases,
  tierWeights,
  totalUpkeep,
  maxDistortion,
  playTurn,
  purchase,
  validateContent,
  type Content,
  type Decision,
  type GameState,
} from '../src/sim';
import { next } from '../src/sim/rng';

function withBalance(patch: Partial<Content['balance']>): Content {
  return { ...content, balance: { ...content.balance, ...patch } };
}

/** Publishes the first cards of the hand on the newspaper at the given distortion (capped per card). */
function simpleDecision(state: GameState, distortion: 'none' | 'max', framing: 0 | 1 | 2 = 0): Decision {
  const cards = state.hand
    .filter((c) => (distortion === 'none' ? c.baseTruth === 0 : true))
    .slice(0, 2);
  return {
    publish: cards.map((c) => ({
      cardUid: c.uid,
      channel: 'newspaper',
      targetGroup: null,
      framing,
      distortion: distortion === 'max' ? maxDistortion(c) : 0,
    })),
    hold: [],
  };
}

describe('content', () => {
  it('is consistent', () => {
    expect(validateContent(content)).toEqual([]);
  });
});

describe('map', () => {
  it('places every building on lots, inside the map, without overlaps or roads', () => {
    for (const seed of [1, 2, 3]) {
      const s = createGame(content, seed);
      const used = new Set<string>();
      for (const b of s.buildings) {
        for (let dx = 0; dx < b.size; dx++) {
          for (let dy = 0; dy < b.size; dy++) {
            const x = b.x + dx;
            const y = b.y + dy;
            expect(x).toBeLessThan(s.mapSize);
            expect(y).toBeLessThan(s.mapSize);
            expect(isRoadTile(x, y)).toBe(false);
            expect(used.has(`${x},${y}`)).toBe(false);
            used.add(`${x},${y}`);
          }
        }
      }
    }
  });
});

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const xs = Array.from({ length: 5 }, () => next(a));
    expect(Array.from({ length: 5 }, () => next(b))).toEqual(xs);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe('game', () => {
  it('starts on turn 1 with the start reporter, at least one story and only the newspaper', () => {
    const s = createGame(content, 1);
    expect(s.turn).toBe(1);
    expect(s.reporters).toEqual(content.balance.startReporters);
    expect(s.hand.length).toBeGreaterThanOrEqual(1);
    expect(s.lastFinds.length).toBe(s.reporters.length);
    expect(s.ownedChannels).toEqual(['newspaper']);
    expect(s.outcome).toBeNull();
  });

  it('is deterministic: same seed and decisions give the same state', () => {
    const run = () => {
      const s = createGame(content, 7);
      for (let i = 0; i < 8 && !s.outcome; i++) playTurn(s, content, simpleDecision(s, 'max', 1));
      return JSON.stringify(s);
    };
    expect(run()).toEqual(run());
  });

  it('keeps the state JSON-serializable', () => {
    const s = createGame(content, 3);
    playTurn(s, content, simpleDecision(s, 'max'));
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it('rejects publishing more cards than allowed', () => {
    const c0 = withBalance({ publishPerTurn: 0 });
    const s = createGame(c0, 1);
    const d: Decision = {
      publish: s.hand.slice(0, 1).map((c) => ({
        cardUid: c.uid,
        channel: 'newspaper',
        targetGroup: null,
        framing: 0,
        distortion: 0,
      })),
      hold: [],
    };
    expect(() => playTurn(s, c0, d)).toThrow(/at most/);
  });

  it('rejects channels the player does not own', () => {
    const s = createGame(content, 1);
    const d: Decision = {
      publish: [{ cardUid: s.hand[0].uid, channel: 'tv', targetGroup: null, framing: 0, distortion: 0 }],
      hold: [],
    };
    expect(() => playTurn(s, content, d)).toThrow(/not owned/);
  });

  it('keeps held cards for the next turn', () => {
    const s = createGame(content, 5);
    const keep = s.hand[0].uid;
    playTurn(s, content, { publish: [], hold: [keep] });
    expect(s.hand.some((c) => c.uid === keep)).toBe(true);
  });
});

describe('trust', () => {
  it('true news is never exposed and builds trust', () => {
    const s = createGame(content, 11);
    const before = averageTrust(s, content, 'newspaper');
    for (let i = 0; i < 6; i++) {
      const report = playTurn(s, content, simpleDecision(s, 'none'));
      expect(report.publications.every((p) => !p.exposed)).toBe(true);
    }
    expect(averageTrust(s, content, 'newspaper')).toBeGreaterThan(before);
    expect(s.exposure).toBe(0);
  });

  it('caught lies cost trust, ad income and fill the exposure meter', () => {
    const c = withBalance({ checkerBase: 10 });
    const s = createGame(c, 11);
    const before = averageTrust(s, c, 'newspaper');
    const report = playTurn(s, c, simpleDecision(s, 'max', 2));
    const lies = report.publications.filter((p) => p.truth > 0);
    expect(lies.length).toBeGreaterThan(0);
    expect(lies.every((p) => p.exposed)).toBe(true);
    expect(averageTrust(s, c, 'newspaper')).toBeLessThan(before);
    expect(s.exposure).toBeGreaterThan(0);
    expect(s.scandal.newspaper).toBeLessThan(1);
  });
});

describe('reporters', () => {
  it('always bring between minFinds and the number of hired reporters stories', () => {
    const unlucky: Content = {
      ...content,
      reporters: content.reporters.map((r) => ({ ...r, skills: { ...r.skills, luck: 0.01 } })),
    };
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = createGame(unlucky, seed);
      for (let i = 0; i < 5; i++) {
        const found = s.lastFinds.filter((f) => f.cardUid !== null).length;
        expect(found).toBeGreaterThanOrEqual(unlucky.balance.minFinds);
        expect(found).toBeLessThanOrEqual(s.reporters.length);
        playTurn(s, unlucky, { publish: [], hold: [] });
      }
    }
  });

  it('a forced story is boring, and every card names a hired reporter', () => {
    const s = createGame(content, 9);
    s.money = 10_000;
    for (const id of ['gusev', 'volkova', 'kim', 'zaitsev']) purchase(s, content, id);
    expect(s.reporters.length).toBe(content.balance.maxReporters);
    playTurn(s, content, { publish: [], hold: [] });
    for (const f of s.lastFinds.filter((x) => x.forced)) expect(f.tier).toBe(0);
    for (const card of s.hand) expect(s.reporters).toContain(card.reporterId);
    expect(s.hand.length).toBeLessThanOrEqual(content.balance.maxReporters);
  });

  it('cannot hire more than maxReporters or fire the last one', () => {
    const s = createGame(content, 1);
    s.money = 100_000;
    for (const r of content.reporters) {
      if (s.reporters.length < content.balance.maxReporters && !s.reporters.includes(r.id)) purchase(s, content, r.id);
    }
    const spare = content.reporters.find((r) => !s.reporters.includes(r.id))!;
    expect(() => purchase(s, content, spare.id)).toThrow();
    while (s.reporters.length > 1) fireReporter(s, s.reporters[0]);
    expect(() => fireReporter(s, s.reporters[0])).toThrow();
  });

  it('salaries are part of the upkeep', () => {
    const s = createGame(content, 1);
    const before = totalUpkeep(s, content);
    s.money = 1000;
    purchase(s, content, 'kim');
    expect(totalUpkeep(s, content)).toBe(before + content.reporters.find((r) => r.id === 'kim')!.salary);
  });

  it('nose shifts the odds towards sensations', () => {
    const plain = content.reporters.find((r) => r.skills.nose === 0)!;
    const star = content.reporters.find((r) => r.skills.nose === 3)!;
    const share = (w: number[]) => w[3] / w.reduce((a, b) => a + b, 0);
    expect(share(tierWeights(content, star))).toBeGreaterThan(share(tierWeights(content, plain)) * 2);
  });
});

describe('purchases', () => {
  it('requires money and prerequisites', () => {
    const s = createGame(content, 1);
    s.money = 10_000;
    expect(() => purchase(s, content, 'radio')).toThrow();
    purchase(s, content, 'newspaper_quality_1');
    purchase(s, content, 'radio');
    expect(s.ownedChannels).toContain('radio');
    expect(listPurchases(s, content).find((p) => p.id === 'tv')?.unlocked).toBe(true);
  });

  it('cannot buy without enough money', () => {
    const s = createGame(content, 1);
    s.money = 0;
    expect(() => purchase(s, content, 'newspaper_quality_1')).toThrow();
  });
});

describe('outcome', () => {
  it('ends the game at the turn limit', () => {
    const c = withBalance({ turnLimit: 3 });
    const s = createGame(c, 2);
    while (!s.outcome) playTurn(s, c, { publish: [], hold: [] });
    expect(s.turn).toBeLessThanOrEqual(4);
    expect(() => playTurn(s, c, { publish: [], hold: [] })).toThrow(/over/);
  });
});
