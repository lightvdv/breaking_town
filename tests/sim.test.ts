import { describe, expect, it } from 'vitest';
import { content } from '../src/content';
import {
  averageTrust,
  cardTruth,
  createGame,
  createRng,
  fireReporter,
  followersOf,
  isHarmful,
  previewPublication,
  getModifiers,
  templateOf,
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
    publish: cards.map((c) => {
      const d = distortion === 'max' ? maxDistortion(c) : 0;
      // Panic is only allowed for harmful stories.
      const harmful = isHarmful(templateOf(content, c.templateId).effects[cardTruth(c, d)]);
      return { cardUid: c.uid, framing: framing === 2 && !harmful ? 1 : framing, distortion: d };
    }),
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
        framing: 0,
        distortion: 0,
      })),
    };
    expect(() => playTurn(s, c0, d)).toThrow(/at most/);
  });

  it('discards cards that were not published', () => {
    const s = createGame(content, 5);
    const old = new Set(s.hand.map((c) => c.uid));
    playTurn(s, content, { publish: [] });
    expect(s.hand.some((c) => old.has(c.uid))).toBe(false);
  });
});

describe('reach vs impact', () => {
  it('reach depends on the outlet and trust, not on the story or framing; impact does the opposite', () => {
    const s = createGame(content, 8);
    const mods = getModifiers(s, content);
    const tpl = templateOf(content, 'factory_sold');
    s.hand = [0, 3].map((tier, i) => ({ uid: 900 + i, templateId: tpl.id, baseTruth: tpl.baseTruth, createdTurn: s.turn, tier: tier as 0 | 3, scope: 'local' as const, reporterId: s.reporters[0] }));
    const dull = previewPublication(s, content, mods, { cardUid: 900, framing: 0, distortion: 0 });
    const loud = previewPublication(s, content, mods, { cardUid: 901, framing: 2, distortion: 0 });
    expect(loud.reachChance).toBe(dull.reachChance);
    expect(loud.impact).toBeGreaterThan(dull.impact * 2);
  });
});

describe('readers', () => {
  it('the newspaper starts with readers and a new channel builds its audience over turns', () => {
    const s = createGame(content, 6);
    expect(followersOf(s, 'newspaper')).toBeGreaterThan(0);
    s.money = 10_000;
    purchase(s, content, 'newspaper_quality_1');
    purchase(s, content, 'radio');
    expect(followersOf(s, 'radio')).toBe(0);
    for (let i = 0; i < 3; i++) playTurn(s, content, simpleDecision(s, 'none'));
    expect(followersOf(s, 'radio')).toBeGreaterThan(0);
    const report = playTurn(s, content, simpleDecision(s, 'none'));
    expect(report.buyers.radio).toBeGreaterThan(0);
    expect(report.income.radio).toBe(Math.round(report.buyers.radio * content.channels.find((x) => x.id === 'radio')!.adRate * 1));
  });

  it('an empty issue drives readers away, and exposed lies drive away even more', () => {
    const lost = (c: Content, decide: (s: GameState) => Decision) => {
      let total = 0;
      for (const seed of [1, 2, 3, 4, 5]) {
        const s = createGame(c, seed);
        total += playTurn(s, c, decide(s)).readers.lost;
      }
      return total;
    };
    const quiet = withBalance({ acquisitionRate: 0 });
    expect(lost(quiet, () => ({ publish: [] }))).toBeGreaterThan(0);
    const harsh = withBalance({ acquisitionRate: 0, checkerBase: 10, churnEmpty: 0 });
    expect(lost(harsh, (s) => simpleDecision(s, 'max'))).toBeGreaterThan(lost(quiet, (s) => simpleDecision(s, 'none')));
  });
});

describe('trust', () => {
  it('true news is never exposed and builds trust', () => {
    const s = createGame(content, 11);
    const before = averageTrust(s, content);
    for (let i = 0; i < 6; i++) {
      const report = playTurn(s, content, simpleDecision(s, 'none'));
      expect(report.publications.every((p) => !p.exposed)).toBe(true);
    }
    expect(averageTrust(s, content)).toBeGreaterThan(before);
    expect(s.exposure).toBe(0);
  });

  it('caught lies cost trust, ad income and fill the exposure meter', () => {
    const c = withBalance({ checkerBase: 10 });
    // Fact-check chance is capped at 95%, so look at the first game where a lie got caught.
    for (let seed = 11; seed < 31; seed++) {
      const s = createGame(c, seed);
      const before = averageTrust(s, c);
      const report = playTurn(s, c, simpleDecision(s, 'max', 2));
      if (!report.publications.some((p) => p.exposed)) continue;
      expect(averageTrust(s, c)).toBeLessThan(before);
      expect(s.exposure).toBeGreaterThan(0);
      expect(s.scandal).toBeLessThan(1);
      return;
    }
    throw new Error('no lie was ever exposed');
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
        playTurn(s, unlucky, { publish: [] });
      }
    }
  });

  it('a forced story is boring, and every card names a hired reporter', () => {
    const s = createGame(content, 9);
    s.money = 10_000;
    for (const id of ['gusev', 'volkova', 'kim', 'zaitsev']) purchase(s, content, id);
    expect(s.reporters.length).toBe(content.balance.maxReporters);
    playTurn(s, content, { publish: [] });
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

describe('framing', () => {
  /** A game whose hand holds the given template at the given tier. */
  function gameWith(templateId: string): GameState {
    const s = createGame(content, 4);
    const tpl = templateOf(content, templateId);
    s.hand = [{ uid: 999, templateId, baseTruth: tpl.baseTruth, createdTurn: s.turn, tier: 1, scope: 'local', reporterId: s.reporters[0] }];
    return s;
  }

  it('rejects panic for a story without a harmful effect', () => {
    const s = gameWith('celebrity');
    expect(() => playTurn(s, content, { publish: [{ cardUid: 999, framing: 2, distortion: 0 }] })).toThrow(
      /Panic/,
    );
  });

  it('loud framing raises hype, and hype fades', () => {
    const s = gameWith('factory_sold');
    playTurn(s, content, { publish: [{ cardUid: 999, framing: 2, distortion: 0 }] });
    const { hypeGain, hypeDecay } = content.balance;
    expect(s.hype).toBe(hypeGain[2] - hypeDecay);
    playTurn(s, content, { publish: [] });
    expect(s.hype).toBe(hypeGain[2] - 2 * hypeDecay);
  });

  it('hype weakens loud framing and belief', () => {
    const s = gameWith('factory_sold');
    const pub = { cardUid: 999, framing: 2 as const, distortion: 0 };
    const calm = previewPublication(s, content, getModifiers(s, content), pub);
    s.hype = 100;
    const hyped = previewPublication(s, content, getModifiers(s, content), pub);
    expect(hyped.impact).toBeLessThan(calm.impact);
    expect(hyped.credibility).toBeLessThan(calm.credibility);
    expect(calm.credibility).toBe(1);
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
    while (!s.outcome) playTurn(s, c, { publish: [] });
    expect(s.turn).toBeLessThanOrEqual(4);
    expect(() => playTurn(s, c, { publish: [] })).toThrow(/over/);
  });
});
