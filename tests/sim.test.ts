import { describe, expect, it } from 'vitest';
import { content } from '../src/content';
import {
  averageTrust,
  createGame,
  createRng,
  fireReporter,
  followersOf,
  investigationTurns,
  reporterOf,
  startInvestigation,
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

/** Publishes the first two cards at the given distortion; only the first may take the front page. */
function simpleDecision(state: GameState, distortion: 'none' | 'max', placement: 0 | 1 | 2 = 1): Decision {
  const cards = state.hand
    .filter((c) => (distortion === 'none' ? c.baseTruth === 0 : true))
    .slice(0, 2);
  return {
    publish: cards.map((c, i) => ({
      cardUid: c.uid,
      // The first card gets the placement; the second takes the next free slot below it.
      placement: (i === 0 ? placement : Math.max(0, Math.min(1, placement - 1))) as 0 | 1 | 2,
      distortion: distortion === 'max' ? maxDistortion(c) : 0,
    })),
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

  it('allows any number of stories but limits the front page and articles', () => {
    const s = createGame(content, 1);
    const tpl = templateOf(content, 'factory_sold');
    s.hand = [0, 1, 2, 3].map((i) => ({ uid: 700 + i, templateId: tpl.id, baseTruth: 1, createdTurn: s.turn, tier: 1, scope: 'local', reporterId: s.reporters[0] }));
    const two = { publish: [0, 1].map((i) => ({ cardUid: 700 + i, placement: 2 as const, distortion: 0 })) };
    expect(() => playTurn(s, content, two)).toThrow(/front page/);
    const articles = { publish: [0, 1].map((i) => ({ cardUid: 700 + i, placement: 1 as const, distortion: 0 })) };
    expect(() => playTurn(s, content, articles)).toThrow(/article/);
    const all = { publish: [0, 1, 2, 3].map((i) => ({ cardUid: 700 + i, placement: (i === 0 ? 2 : i === 1 ? 1 : 0) as 0 | 1 | 2, distortion: 0 })) };
    expect(playTurn(s, content, all).publications.length).toBe(4);
  });

  it('discards cards that were not published', () => {
    const s = createGame(content, 5);
    const old = new Set(s.hand.map((c) => c.uid));
    playTurn(s, content, { publish: [] });
    expect(s.hand.some((c) => old.has(c.uid))).toBe(false);
  });
});

describe('reach vs impact', () => {
  it('reach depends on the outlet and trust, not on the story or placement; impact does the opposite', () => {
    const s = createGame(content, 8);
    const mods = getModifiers(s, content);
    const tpl = templateOf(content, 'factory_sold');
    s.hand = [0, 3].map((tier, i) => ({ uid: 900 + i, templateId: tpl.id, baseTruth: tpl.baseTruth, createdTurn: s.turn, tier: tier as 0 | 3, scope: 'local' as const, reporterId: s.reporters[0] }));
    const dull = previewPublication(s, content, mods, { cardUid: 900, placement: 1, distortion: 0 });
    const loud = previewPublication(s, content, mods, { cardUid: 901, placement: 1, distortion: 0 });
    expect(loud.reachChance).toBe(dull.reachChance);
    expect(loud.impact).toBeGreaterThan(dull.impact * 2);
  });
});

describe('distortion', () => {
  it('raises the tier one step per level, up to a sensation, and with it the impact', () => {
    const s = createGame(content, 8);
    const tpl = templateOf(content, 'factory_accident');
    s.hand = [{ uid: 950, templateId: tpl.id, baseTruth: 0, createdTurn: s.turn, tier: 0, scope: 'local', reporterId: s.reporters[0] }];
    const mods = getModifiers(s, content);
    const at = (distortion: number) => previewPublication(s, content, mods, { cardUid: 950, placement: 0, distortion });
    expect([0, 1, 2].map((d) => at(d).tier)).toEqual([0, 1, 2]);
    expect(at(2).impact).toBeGreaterThan(at(0).impact);
    s.hand[0].tier = 3;
    expect(at(2).tier).toBe(3);
  });

  it('reporters never bring outright lies', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = createGame(content, seed);
      s.money = 10_000;
      for (const id of ['gusev', 'volkova', 'kim', 'zaitsev']) purchase(s, content, id);
      for (let i = 0; i < 4; i++) {
        playTurn(s, content, { publish: [] });
        for (const card of s.hand) expect(card.baseTruth).toBeLessThanOrEqual(1);
      }
    }
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
  });

  it('high reputation lowers the fact-check risk', () => {
    const s = createGame(content, 11);
    const mods = getModifiers(s, content);
    const pub = { cardUid: s.hand[0].uid, placement: 1 as const, distortion: maxDistortion(s.hand[0]) };
    for (const r of s.residents) r.trust = 10;
    const distrusted = previewPublication(s, content, mods, pub).exposureRisk;
    for (const r of s.residents) r.trust = 90;
    const trusted = previewPublication(s, content, mods, pub).exposureRisk;
    expect(trusted).toBeLessThan(distrusted);
  });

  it('the game is lost when reputation falls to zero', () => {
    const s = createGame(content, 11);
    for (const r of s.residents) r.trust = 0;
    playTurn(s, content, { publish: [] });
    expect(s.outcome).toEqual({ result: 'lose', reason: 'trustCollapse' });
  });

  it('caught lies cost reputation and ad income and are reported', () => {
    const c = withBalance({ checkerBase: 10 });
    // Fact-check chance is capped at 95%, so look at the first game where a lie got caught.
    for (let seed = 11; seed < 31; seed++) {
      const s = createGame(c, seed);
      const before = averageTrust(s, c);
      const report = playTurn(s, c, simpleDecision(s, 'max', 2));
      if (!report.publications.some((p) => p.exposed)) continue;
      expect(averageTrust(s, c)).toBeLessThan(before);
      expect(report.exposures.length).toBeGreaterThan(0);
      expect(report.exposures[0].turn).toBe(report.turn);
      expect(s.scandal).toBeLessThan(1);
      return;
    }
    throw new Error('no lie was ever exposed');
  });
});

describe('news variety', () => {
  it('reporters mostly bring true stories', () => {
    let truths = 0;
    let total = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = createGame(content, seed);
      for (let i = 0; i < 10 && !s.outcome; i++) {
        for (const card of s.hand) {
          total++;
          if (card.baseTruth === 0) truths++;
        }
        playTurn(s, content, { publish: [] });
      }
    }
    expect(truths / total).toBeGreaterThan(0.65);
  });

  it('a story does not come back within the repeat cooldown', () => {
    const s = createGame(content, 9);
    const seen = new Map<string, number>();
    for (let i = 0; i < 25 && !s.outcome; i++) {
      for (const card of s.hand) {
        const last = seen.get(card.templateId);
        if (last !== undefined) expect(s.turn - last).toBeGreaterThanOrEqual(content.balance.repeatCooldown);
        seen.set(card.templateId, s.turn);
      }
      playTurn(s, content, { publish: [] });
    }
  });
});

describe('turn report breakdowns', () => {
  it('money and readers breakdowns add up to the totals', () => {
    const s = createGame(content, 4);
    for (let i = 0; i < 6; i++) {
      const r = playTurn(s, content, simpleDecision(s, i % 2 ? 'max' : 'none'));
      expect(r.upkeepItems.reduce((sum, x) => sum + x.amount, 0)).toBe(r.upkeep);
      const income = Object.values(r.income).reduce((sum, x) => sum + x, 0);
      expect(income - r.upkeep).toBe(r.moneyDelta);
      expect(Object.values(r.readers.lostBy).reduce((sum, x) => sum + x, 0)).toBe(r.readers.lost);
      expect(r.readers.before - r.readers.lost - r.readers.movedAway + r.readers.gained).toBe(r.readers.after);
    }
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

describe('placement', () => {
  /** A game whose hand holds the given template at the given tier. */
  function gameWith(templateId: string): GameState {
    const s = createGame(content, 4);
    const tpl = templateOf(content, templateId);
    s.hand = [{ uid: 999, templateId, baseTruth: tpl.baseTruth, createdTurn: s.turn, tier: 1, scope: 'local', reporterId: s.reporters[0] }];
    return s;
  }

  it('front page hits harder and is noticed by more readers than a brief, at a higher risk', () => {
    const s = gameWith('factory_sold');
    const mods = getModifiers(s, content);
    const brief = previewPublication(s, content, mods, { cardUid: 999, placement: 0, distortion: 0 });
    const front = previewPublication(s, content, mods, { cardUid: 999, placement: 2, distortion: 0 });
    expect(front.impact).toBeGreaterThan(brief.impact * 2);
    expect(front.reachChance).toBeGreaterThan(brief.reachChance);
    expect(front.exposureRisk).toBeGreaterThan(brief.exposureRisk);
  });
});

describe('investigations', () => {
  it('an assigned reporter skips the search and brings dirt on the group after a few turns', () => {
    const s = createGame(content, 12);
    const id = s.reporters[0];
    startInvestigation(s, content, id, 'workers');
    expect(() => startInvestigation(s, content, id, 'youth')).toThrow(/already/);
    const turns = investigationTurns(content, reporterOf(content, id));
    for (let i = 1; i < turns; i++) {
      playTurn(s, content, { publish: [] });
      expect(s.lastFinds.find((f) => f.reporterId === id)?.kind).toBe('investigating');
    }
    playTurn(s, content, { publish: [] });
    const find = s.lastFinds.find((f) => f.reporterId === id)!;
    expect(find.kind).toBe('investigation');
    const card = s.hand.find((x) => x.uid === find.cardUid)!;
    expect(templateOf(content, card.templateId).target).toBe('workers');
    expect(card.tier).toBeGreaterThanOrEqual(2);
    expect(card.baseTruth).toBeLessThanOrEqual(1);
    expect(s.investigations.length).toBe(0);
  });

  it('published dirt makes the target group feel hunted', () => {
    const s = createGame(content, 13);
    const tpl = templateOf(content, 'investigation_youth');
    for (const r of s.residents) {
      r.trust = 100;
      r.follows = ['newspaper'];
    }
    s.hand = [{ uid: 990, templateId: tpl.id, baseTruth: 0, createdTurn: s.turn, tier: 3, scope: 'local', reporterId: s.reporters[0] }];
    const youth = s.residents.filter((r) => r.group === 'youth');
    const before = youth.reduce((sum, r) => sum + r.outlook, 0);
    const report = playTurn(s, content, { publish: [{ cardUid: 990, placement: 2, distortion: 2 }] });
    expect(report.publications[0].stigma?.target).toBe('youth');
    expect(report.publications[0].stigma!.pressure).toBeGreaterThan(0);
    const after = youth.reduce((sum, r) => sum + r.outlook, 0);
    expect(after).toBeLessThan(before);
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
