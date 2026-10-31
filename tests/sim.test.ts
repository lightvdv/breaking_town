import { describe, expect, it } from 'vitest';
import { content as realContent } from '../src/content';
import { effectShort, framingScale } from '../src/ui/text';

// Most tests look at the mechanics themselves: everything starts on day 1 there (the gentle first days are tested apart).
const content = {
  ...realContent,
  balance: { ...realContent.balance, conflictStartTurn: 1, rivalStartTurn: { destroy: 1, save: 1 }, factCheckStartTurn: 1 },
};
import { snapshotPeople, updatePeople } from '../src/sim/people';
import { giveTask, scoreOf, taskOf, updateTasks } from '../src/sim/tasks';
import { twistMods } from '../src/sim/twists';
import { withTown } from '../src/sim/town';
import { settleHunt } from '../src/sim/hunt';
import { crimeEvents, crimePressure, gangDue } from '../src/sim/crime';
import {
  averageTrust,
  bribeMul,
  cashActive,
  cashBlock,
  cashCost,
  cashMoves,
  readerCount,
  useCash,
  createGame,
  createRng,
  fireReporter,
  followersOf,
  investigationTurns,
  issueLevel,
  issueScore,
  setReporterTopics,
  reporterOf,
  startInvestigation,
  useAbility,
  abilityBlock,
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
  callAgency,
  hireFromAgency,
  limitSensations,
  rivalReaders,
  rivalTrust,
  setRivalWatch,
  answerOffer,
  withDifficulty,
  withLength,
  forecastTurn,
  levelOf,
  skilledReporter,
  staffOf,
  cardTruth,
  minDistortion,
  salesOf,
  setPrice,
  buyWillingness,
  wealthOf,
  effectiveTier,
  validateContent,
  pairKey,
  pairKeys,
  fillTitle,
  storyTitle,
  startHunt,
  storyEffect,
  modifiersOf,
  levelEffects,
  dealShop,
  refreshShop,
  lureCost,
  tipConflict,
  huntBonus,
  lureBlock,
  lureRivalAuthor,
  RIVAL_DIG,
  type CardInstance,
  type Content,
  type Decision,
  type GameState,
  type NewsTier,
} from '../src/sim';
import { next } from '../src/sim/rng';

/** Puts a reporter on the staff directly (the game hires through the HR agency). */
function hire(s: GameState, id: string): void {
  if (!s.reporters.includes(id)) s.reporters.push(id);
}

function withBalance(patch: Partial<Content['balance']>): Content {
  return { ...content, balance: { ...content.balance, ...patch } };
}

/** Publishes the first two cards at the given distortion; only the first may take the front page. */
function simpleDecision(state: GameState, distortion: 'none' | 'max', placement: 0 | 1 | 2 = 1): Decision {
  const cards = state.hand
    .filter((c) => (distortion === 'none' ? c.baseTruth === 0 : true))
    .slice(0, 2);
  const publish = cards.map((c, i) => ({
    cardUid: c.uid,
    // The first card gets the placement; the second takes the next free slot below it.
    placement: (i === 0 ? placement : Math.max(0, Math.min(1, placement - 1))) as 0 | 1 | 2,
    distortion: distortion === 'max' ? maxDistortion(c) : 0,
  }));
  // Only one sensation per issue: a second blown-up story is toned down.
  limitSensations(state, content, publish);
  return { publish };
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
    // One find per reporter: a write-up of an event of the day or a search of their own.
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
      for (const id of ['gusev', 'volkova', 'kim', 'zaitsev']) hire(s, id);
      for (let i = 0; i < 4; i++) {
        playTurn(s, content, { publish: [] });
        for (const card of s.hand) expect(card.baseTruth).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('readers', () => {
  it('the newspaper starts with readers; a group page brings in a new group over turns', () => {
    const s = createGame(content, 6);
    expect(followersOf(s, 'newspaper')).toBeGreaterThan(0);
    const workers = () => s.residents.filter((r) => r.status === 'active' && r.group === 'workers' && r.follows.length > 0).length;
    const before = workers();
    s.money = 10_000;
    s.shopOffer.push('sports_page');
    purchase(s, content, 'sports_page');
    // Boring issues attract nobody, so publish interesting stories.
    for (let i = 0; i < 4; i++) {
      for (const card of s.hand) card.tier = 2;
      playTurn(s, content, simpleDecision(s, 'none'));
    }
    expect(workers()).toBeGreaterThan(before);
    const report = playTurn(s, content, simpleDecision(s, 'none'));
    expect(report.income.newspaper).toBe(Math.round(report.buyers.newspaper * (content.balance.prices[s.price] + content.channels[0].adRate) * s.scandal));
  });

  it('the cover price decides who can buy the paper: the jobless only take it free', () => {
    const s = createGame(content, 3);
    const jobless = s.residents.find((r) => r.status === 'active' && wealthOf(content, r) === 'jobless') ?? Object.assign(s.residents.find((r) => r.group === 'workers')!, { job: null });
    const worker = s.residents.find((r) => r.status === 'active' && r.job !== null)!;
    setPrice(s, content, 0);
    expect(buyWillingness(s, content, jobless)).toBeGreaterThan(0);
    setPrice(s, content, content.balance.prices.length - 1);
    expect(buyWillingness(s, content, jobless)).toBe(0);
    expect(buyWillingness(s, content, worker)).toBeGreaterThan(0);
    // A dear paper is bought less willingly even by those who can pay.
    expect(buyWillingness(s, content, worker)).toBeLessThan(content.balance.priceBuy.working[1]);
    expect(() => setPrice(s, content, 99)).toThrow();
    // Readers who cannot afford it stop buying.
    jobless.follows = ['newspaper'];
    playTurn(s, content, { publish: [] });
    expect(jobless.follows).toEqual([]);
  });

  it('crime stories scare believers: they stay at home and order falls', () => {
    const s = createGame(content, 4);
    const before = s.metrics.order;
    for (const r of s.residents.slice(0, 60)) r.fearTurns = 3;
    playTurn(s, content, { publish: [] });
    expect(s.metrics.order).toBeLessThan(before);
    const crime = content.cards.filter((t) => t.topic === 'crime' && t.effects.some((e) => e?.type === 'fear'));
    expect(crime.length).toBeGreaterThanOrEqual(5);
  });

  it('every kiosk adds to the sales per reader', () => {
    const s = createGame(content, 6);
    s.money = 10_000;
    const base = salesOf(s, content, 'newspaper', 100);
    s.shopOffer.push('kiosk_1', 'kiosk_2');
    expect(() => purchase(s, content, 'kiosk_2')).toThrow();
    purchase(s, content, 'kiosk_1');
    const one = salesOf(s, content, 'newspaper', 100);
    s.shopOffer.push('kiosk_2');
    purchase(s, content, 'kiosk_2');
    expect(one).toBeGreaterThan(base);
    expect(salesOf(s, content, 'newspaper', 100)).toBeGreaterThan(one);
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

describe('issue level', () => {
  it('sums story points by tier and placement', () => {
    const front = (tier: NewsTier) => ({ tier, placement: 2 as const });
    const article = (tier: NewsTier) => ({ tier, placement: 1 as const });
    const brief = (tier: NewsTier) => ({ tier, placement: 0 as const });
    expect(issueLevel(content, [front(0)])).toBe(0);
    expect(issueLevel(content, [front(1)])).toBe(1);
    expect(issueLevel(content, [front(2), article(1)])).toBe(2);
    // A sensation on the front page makes a sensational issue...
    expect(issueLevel(content, [front(3)])).toBe(3);
    expect(issueLevel(content, [front(3), brief(0)])).toBe(3);
    // ...swapped into the briefs it does not, and the issue gets duller.
    expect(issueLevel(content, [front(0), brief(3)])).toBeLessThan(2);
    expect(issueLevel(content, [brief(3)])).toBeLessThan(issueLevel(content, [front(3)]));
    // Enough points but no sensation on the front page: interesting, not sensational.
    const strong = [front(2), article(3), brief(2), brief(2)];
    expect(issueScore(content, strong)).toBeGreaterThanOrEqual(content.balance.issueThresholds[2]);
    expect(issueLevel(content, strong)).toBe(2);
  });

  it('a boring issue keeps fewer readers than a sensational one', () => {
    const net = (tier: 0 | 3) => {
      let sum = 0;
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const s = createGame(content, seed);
        s.hand = s.hand.slice(0, 1).map((card) => ({ ...card, tier }));
        const r = playTurn(s, content, { publish: [{ cardUid: s.hand[0].uid, placement: 2, distortion: 0 }] });
        expect(r.issue.level).toBe(tier === 0 ? 0 : 3);
        sum += r.readers.after - r.readers.before;
      }
      return sum;
    };
    expect(net(3)).toBeGreaterThan(net(0));
  });
});

describe('boring issues and fading lies', () => {
  it('a boring issue slightly shrinks the readership', () => {
    let net = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = createGame(content, seed);
      s.hand = s.hand.slice(0, 1).map((card) => ({ ...card, tier: 0 }));
      const r = playTurn(s, content, { publish: [{ cardUid: s.hand[0].uid, placement: 0, distortion: 0 }] });
      expect(r.issue.level).toBe(0);
      expect(r.readers.gained).toBe(0);
      net += r.readers.after - r.readers.before;
    }
    expect(net).toBeLessThan(0);
  });

  it('an old lie surfaces with fading odds and is forgotten after lateExposureTurns issues', () => {
    const b = content.balance;
    const s = createGame(content, 3);
    const story = { cardUid: 1, templateId: 'shop_rats', title: 'x', truth: 2 as const, tier: 1 as const, placement: 1 as const, turn: s.turn };
    s.pendingLies = [{ story, viewers: [], risk: 0, turnsLeft: b.lateExposureTurns }];
    const risks: number[] = [];
    for (let i = 0; i < b.lateExposureTurns + 1; i++) {
      risks.push(s.pendingLies[0]?.risk ?? -1);
      playTurn(s, content, { publish: [] });
    }
    expect(s.pendingLies.length).toBe(0);
    s.pendingLies = [{ story, viewers: [], risk: 0.4, turnsLeft: b.lateExposureTurns }];
    playTurn(s, content, { publish: [] });
    if (s.pendingLies.length) expect(s.pendingLies[0].risk).toBeCloseTo(0.4 * b.lateExposureDecay);
    expect(risks.filter((x) => x >= 0).length).toBe(b.lateExposureTurns);
  });
});

describe('reporter topics', () => {
  it('a reporter sent after a topic brings it more often', () => {
    const share = (assign: boolean) => {
      let hits = 0;
      let total = 0;
      for (let seed = 1; seed <= 24; seed++) {
        const s = createGame(content, seed);
        for (let i = 0; i < 12 && !s.outcome; i++) {
          if (assign) setReporterTopics(s, content, s.reporters[0], ['crime']);
          playTurn(s, content, { publish: [] });
          for (const card of s.hand) {
            // Today's events and arc stages come whatever reporters look for.
            const tpl = templateOf(content, card.templateId);
            if (tpl.arc || (tpl.source === 'event' && tpl.scope !== 'global')) continue;
            total++;
            if (templateOf(content, card.templateId).topic === 'crime') hits++;
          }
        }
      }
      return hits / total;
    };
    expect(share(true)).toBeGreaterThan(share(false) * 1.5);
  });

  it('rejects unknown topics', () => {
    const s = createGame(content, 2);
    expect(() => setReporterTopics(s, content, s.reporters[0], ['space' as never])).toThrow(/topic/);
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
      for (const card of s.hand.filter((x) => !x.debunk)) {
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
        // Rumor stages of a story arc come like events, though nothing has happened yet.
        const arcRumors = s.hand.filter((x) => templateOf(unlucky, x.templateId).arc && templateOf(unlucky, x.templateId).source === 'rumor').length;
        expect(found).toBeLessThanOrEqual(s.reporters.length + s.todayEvents.length + arcRumors);
        playTurn(s, unlucky, { publish: [] });
      }
    }
  });

  it('one story a reporter a day: events come first, the rest go unwritten', () => {
    const c = withBalance({ incidentChance: 1 });
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = createGame(c, seed);
      for (const k of pairKeys(c)) s.tension[k] = 70;
      for (let i = 0; i < 4 && !s.outcome; i++) {
        playTurn(s, c, { publish: [] });
        // Every event of the day is written up or listed as missed.
        const titles = s.hand.map((x) => storyTitle(c, x, 0));
        for (const e of s.todayEvents) expect(titles.includes(e) || s.missedEvents.includes(e)).toBe(true);
        // One reporter writes one story: an event if there is one.
        expect(s.hand.length).toBeLessThanOrEqual(Math.max(s.reporters.length, c.balance.minFinds));
        // Whatever the reporter wrote today, a missed event means nobody was free for it.
        if (s.missedEvents.length) expect(s.hand.filter((x) => x.createdTurn === s.turn).length).toBeGreaterThanOrEqual(s.reporters.length);
      }
    }
  });

  it('a specialist writes an event on their topic a level stronger; an investigating reporter writes nothing', () => {
    let experts = 0;
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = createGame(content, seed);
      s.reporters = ['sokolov', 'volkova', 'kim', 'lebedev', 'orlova'];
      for (let i = 0; i < 6 && !s.outcome; i++) {
        playTurn(s, content, { publish: [] });
        for (const card of s.hand.filter((x) => x.createdTurn === s.turn && x.expert)) {
          experts++;
          expect(reporterOf(content, card.reporterId).skills.topics).toContain(templateOf(content, card.templateId).topic);
        }
      }
    }
    expect(experts).toBeGreaterThan(0);
    const s = createGame(content, 2);
    startInvestigation(s, content, s.reporters[0], 'workers');
    playTurn(s, content, { publish: [] });
    expect(s.hand.filter((x) => x.createdTurn === s.turn)).toHaveLength(0);
    expect(s.missedEvents).toEqual(s.todayEvents.filter((e) => s.missedEvents.includes(e)));
  });

  it('a forced story is boring, and every card names a hired reporter', () => {
    const s = createGame(content, 9);
    s.money = 10_000;
    for (const r of content.reporters) if (s.reporters.length < content.balance.maxReporters) hire(s, r.id);
    expect(s.reporters.length).toBe(content.balance.maxReporters);
    playTurn(s, content, { publish: [] });
    for (const f of s.lastFinds.filter((x) => x.forced)) expect(f.tier).toBe(0);
    for (const card of s.hand) expect(s.reporters).toContain(card.reporterId);
    expect(s.hand.length).toBeLessThanOrEqual(content.balance.maxReporters);
  });

  it('the HR agency offers one or two new reporters, the first search a day free; only they can be hired', () => {
    const b = content.balance;
    const sizes = new Set<number>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = createGame(content, seed);
      s.money = 1000;
      const offer = callAgency(s, content);
      sizes.add(offer.length);
      expect(s.money).toBe(1000);
      expect(offer.length).toBeGreaterThanOrEqual(1);
      expect(offer.length).toBeLessThanOrEqual(b.agencyMaxOffer);
      for (const id of offer) expect(s.reporters).not.toContain(id);
      const spare = content.reporters.find((r) => !offer.includes(r.id) && !s.reporters.includes(r.id))!;
      expect(() => hireFromAgency(s, content, spare.id)).toThrow();
      hireFromAgency(s, content, offer[0]);
      expect(s.reporters).toContain(offer[0]);
      // The reporter's own price on top of the fee; the salary goes into the upkeep.
      expect(s.money).toBe(1000 - reporterOf(content, offer[0]).hireCost);
      // A second search the same day costs the fee.
      const before = s.money;
      callAgency(s, content);
      expect(s.money).toBe(before - b.agencyFee);
      expect(totalUpkeep(s, content)).toBeGreaterThanOrEqual(reporterOf(content, offer[0]).salary);
      // The offer lapses at the end of the turn.
      playTurn(s, content, { publish: [] });
      expect(s.agencyOffer).toEqual([]);
      expect(s.agencyCalls).toBe(0);
    }
    expect([...sizes].sort()).toEqual([1, 2]);
  });

  it('a day brings at most one sensation, and an issue carries at most one', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = createGame(content, seed);
      for (let t = 0; t < 8; t++) {
        expect(s.hand.filter((x) => x.tier === 3).length).toBeLessThanOrEqual(content.balance.maxSensations);
        playTurn(s, content, { publish: [] });
      }
    }
    const s = createGame(content, 2);
    s.hand = s.hand.slice(0, 1);
    while (s.hand.length < 3) s.hand.push({ ...s.hand[0], uid: s.nextUid++ });
    for (const card of s.hand) Object.assign(card, { tier: 2, baseTruth: 0, conflict: undefined });
    const publish = s.hand.map((card, i) => ({ cardUid: card.uid, placement: (i === 0 ? 2 : 0) as 0 | 2, distortion: 1 }));
    expect(() => playTurn(s, content, { publish: publish.map((p) => ({ ...p })) })).toThrow(/sensation/);
    limitSensations(s, content, publish);
    expect(publish.filter((p) => effectiveTier(s.hand.find((x) => x.uid === p.cardUid)!, p.distortion) === 3)).toHaveLength(1);
    expect(publish[0].distortion).toBe(1);
    expect(() => playTurn(s, content, { publish })).not.toThrow();
  });

  it('found stories stay within their template tiers and are about an open place', () => {
    for (const seed of [1, 2, 3, 4]) {
      const s = createGame(content, seed);
      // Close one bar: no story may be about it any more.
      const bar = s.buildings.find((x) => x.type === 'entertainment')!;
      bar.open = false;
      playTurn(s, content, { publish: [] });
      for (let t = 0; t < 10 && !s.outcome; t++) {
        for (const card of s.hand) {
          const tpl = templateOf(content, card.templateId);
          if (tpl.tiers && tpl.source !== 'investigation') {
            expect(card.tier).toBeGreaterThanOrEqual(tpl.tiers[0]);
            expect(card.tier).toBeLessThanOrEqual(tpl.tiers[1]);
          }
          if (tpl.requires) {
            expect(card.building).toBeDefined();
            expect(s.buildings[card.building!].open).toBe(true);
            expect(s.buildings[card.building!].type).toBe(tpl.requires);
          }
        }
        playTurn(s, content, { publish: [] });
      }
    }
    expect(templateOf(content, 'bus_schedule').tiers![1]).toBeLessThan(2);
  });

  it('dirt on a group visibly worsens its relations with every other group', () => {
    const s = createGame(content, 1);
    const tpl = content.cards.find((t) => t.source === 'investigation' && t.target === 'workers')!;
    s.hand = [{ uid: s.nextUid++, templateId: tpl.id, baseTruth: 0, createdTurn: s.turn, tier: 3, scope: 'local', reporterId: s.reporters[0] }];
    const r = playTurn(s, content, { publish: [{ cardUid: s.hand[0].uid, placement: 2, distortion: 0 }] });
    const shifts = r.publications[0].tension!;
    for (const g of content.groups.filter((x) => x.id !== 'workers')) expect(shifts[pairKey(content, 'workers', g.id)]).toBeGreaterThan(5);
  });

  it('cannot hire more than maxReporters or fire the last one', () => {
    const s = createGame(content, 1);
    s.money = 100_000;
    expect(content.balance.maxReporters).toBe(5);
    expect(content.reporters.length).toBeGreaterThan(content.balance.maxReporters);
    while (s.reporters.length < content.balance.maxReporters) {
      for (const id of callAgency(s, content)) if (s.reporters.length < content.balance.maxReporters) hireFromAgency(s, content, id);
    }
    expect(() => callAgency(s, content)).toThrow();
    while (s.reporters.length > 1) fireReporter(s, s.reporters[0]);
    expect(() => fireReporter(s, s.reporters[0])).toThrow();
  });

  it('salaries are part of the upkeep', () => {
    const s = createGame(content, 1);
    const before = totalUpkeep(s, content);
    hire(s, 'kim');
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
    s.shopOffer.push('newspaper_quality_1', 'newspaper_quality_2');
    expect(() => purchase(s, content, 'newspaper_quality_2')).toThrow();
    expect(listPurchases(s, content).find((p) => p.id === 'newspaper_quality_2')?.unlocked).toBe(false);
    purchase(s, content, 'newspaper_quality_1');
    s.shopOffer.push('newspaper_quality_2');
    purchase(s, content, 'newspaper_quality_2');
    expect(s.upgrades).toContain('newspaper_quality_2');
  });

  it('cannot buy without enough money', () => {
    // The board's cards are free; a fork's option costs money.
    const s = createGame(content, 1);
    s.money = 0;
    s.turn = content.forks[0].day;
    expect(() => purchase(s, content, content.forks[0].options[0])).toThrow();
  });
});

describe('the upgrades deck, forks and abilities (CONCEPT.md §3.5)', () => {
  it('the deck offers a few cards of the mode, deals again every few days, and only what is on offer can be bought', () => {
    const b = content.balance;
    const s = createGame(content, 3);
    // The board's first offer comes on its day.
    expect(s.shopOffer).toEqual([]);
    while (s.turn < b.shopFirstTurn) playTurn(s, content, { publish: [] });
    expect(s.shopOffer.length).toBe(b.shopOfferSize);
    for (const id of s.shopOffer) {
      const u = content.upgrades.find((x) => x.id === id)!;
      expect(u.fork).toBeUndefined();
      expect(!u.mode || u.mode === s.mode).toBe(true);
    }
    const off = content.upgrades.find((u) => !u.fork && !s.shopOffer.includes(u.id))!;
    s.money = 10_000;
    expect(() => purchase(s, content, off.id)).toThrow();
    const first = [...s.shopOffer];
    purchase(s, content, first[0]);
    expect(s.shopOffer).not.toContain(first[0]);
    for (let i = 0; i < b.shopRefreshDays; i++) playTurn(s, content, { publish: [] });
    expect(s.shopOffer.length).toBe(b.shopOfferSize);
    expect(s.shopOffer).not.toContain(first[0]);
  });

  it('a fork opens on its day and taking one option closes the other', () => {
    const s = createGame(content, 4);
    const fork = content.forks[0];
    s.money = 10_000;
    expect(() => purchase(s, content, fork.options[0])).toThrow();
    while (s.turn < fork.day && !s.outcome) playTurn(s, content, { publish: [] });
    purchase(s, content, fork.options[0]);
    expect(() => purchase(s, content, fork.options[1])).toThrow();
  });

  it('an ability costs money, works once and waits its cooldown', () => {
    const s = createGame(content, 5);
    s.money = 10_000;
    s.upgrades.push('night_shift');
    const hand = s.hand.length;
    const added = useAbility(s, content, 'night_shift');
    expect(added.length).toBe(1);
    expect(s.hand.length).toBe(hand + 1);
    expect(abilityBlock(s, content, 'night_shift')).toBe('cooling down');
    expect(() => useAbility(s, content, 'night_shift')).toThrow();
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

describe('group relations', () => {
  const conflictCard = (s: GameState, templateId: string, pair: [string, string], tier: NewsTier = 1): CardInstance => {
    const tpl = templateOf(content, templateId);
    const card: CardInstance = { uid: s.nextUid++, templateId, baseTruth: tpl.baseTruth, createdTurn: s.turn, tier, scope: 'local', reporterId: s.reporters[0], conflict: pair };
    s.hand = [card];
    return card;
  };
  // Many readers among the pair, so the story is actually believed.
  const allRead = (s: GameState) => {
    for (const r of s.residents) if (r.status === 'active') r.follows = [...s.ownedChannels];
  };

  it('starts every one of the six pairs at its start tension', () => {
    const s = createGame(content, 1);
    expect(pairKeys(content)).toHaveLength(6);
    expect(Object.keys(s.tension).sort()).toEqual([...pairKeys(content)].sort());
    expect(s.tension[pairKey(content, 'youth', 'pensioners')]).toBe(content.balance.tensionStart['pensioners|youth']);
  });

  it('fills the pair into titles with the right word forms', () => {
    expect(fillTitle(content, '{a.one} ударил {b.oneAcc}', ['workers', 'intelligentsia'])).toBe('Рабочий ударил интеллигента');
    expect(fillTitle(content, '{a.many} против {b.manyGen}', ['youth', 'pensioners'])).toBe('Молодые против пенсионеров');
  });

  it('heating a conflict story raises the pair tension, calming lowers it', () => {
    const key = pairKey(content, 'workers', 'intelligentsia');
    const shift = (distortion: number) => {
      const s = createGame(content, 4);
      allRead(s);
      const card = conflictCard(s, 'conflict_shop_fight', ['workers', 'intelligentsia']);
      s.tension[key] = 50;
      const r = playTurn(s, content, { publish: [{ cardUid: card.uid, placement: 2, distortion }] });
      return r.publications[0].tension![key];
    };
    expect(shift(-1)).toBeLessThan(0);
    // Telling it as it is leaves the pair alone; heating and inflating stir it, inflating more.
    expect(shift(0)).toBe(0);
    expect(shift(1)).toBeGreaterThan(0);
    expect(shift(2)).toBeGreaterThan(shift(1));
  });

  it('calm framing is true, duller and only allowed on conflict stories', () => {
    const s = createGame(content, 2);
    const card = conflictCard(s, 'rumor_gangs', ['youth', 'pensioners'], 2);
    const calm = previewPublication(s, content, getModifiers(s, content), { cardUid: card.uid, placement: 1, distortion: -1 });
    expect(calm.truth).toBe(0);
    expect(calm.tier).toBe(1);
    expect(calm.title).toBe(storyTitle(content, card, -1));
    expect(calm.effect).toBeNull();
    const plain = createGame(content, 2);
    const other = plain.hand.find((x) => !x.conflict && !x.soft)!;
    expect(() => playTurn(plain, content, { publish: [{ cardUid: other.uid, placement: 1, distortion: -1 }] })).toThrow();
  });

  it('tension fades towards its start value', () => {
    const s = createGame(content, 3);
    const key = pairKey(content, 'workers', 'youth');
    s.tension[key] = 70;
    playTurn(s, content, { publish: [] });
    expect(s.tension[key]).toBeLessThan(70);
    expect(s.tension[key]).toBeGreaterThan(content.balance.tensionStart[key]);
  });

  it('tense pairs breed incidents that become true conflict stories and cutscene highlights', () => {
    const c = withBalance({ incidentChance: 1 });
    let incidents = 0;
    let stories = 0;
    let fights = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = createGame(c, seed);
      for (const k of pairKeys(c)) s.tension[k] = 70;
      // Enough hands for the day's crime and the incidents both (CONCEPT.md §5.6).
      for (const id of c.reporters.slice(0, 4).map((x) => x.id)) hire(s, id);
      const r = playTurn(s, c, { publish: [] });
      incidents += s.todayIncidents.length;
      fights += r.highlights.filter((h) => h.kind === 'fight').length;
      stories += s.hand.filter((x) => x.conflict && templateOf(c, x.templateId).source === 'event').length;
      for (const i of s.todayIncidents) expect(r.events).toContain(i.title);
    }
    expect(incidents).toBeGreaterThan(0);
    expect(fights).toBe(incidents);
    expect(stories).toBeGreaterThan(0);
  });

  it('clashes bring the pair out to protest, but nobody leaves because of relations', () => {
    const c = withBalance({ clashProtest: 1, reconcileThreshold: 101, despairLeaveChance: 0 });
    const s = createGame(c, 6);
    const key = pairKey(c, 'workers', 'intelligentsia');
    s.tension[key] = 100;
    const active = s.residents.filter((r) => r.status === 'active').length;
    playTurn(s, c, { publish: [] });
    const protesting = s.residents.filter((r) => r.protestTurns > 0 && (r.group === 'workers' || r.group === 'intelligentsia')).length;
    expect(protesting).toBeGreaterThan(0);
    expect(s.residents.filter((r) => r.status === 'active').length).toBeGreaterThanOrEqual(active);
  });

  it('the mayor reconciles the tensest pair, shows it and waits before the next time', () => {
    const s = createGame(content, 7);
    const key = pairKey(content, 'youth', 'pensioners');
    s.tension[key] = 95;
    const r = playTurn(s, content, { publish: [] });
    expect(r.reconciliationStarted?.pair).toBe(key);
    expect(r.highlights.some((h) => h.kind === 'reconcile')).toBe(true);
    expect(s.tension[key]).toBeLessThan(95 - content.balance.reconcileDrop);
    // While it runs and during the cooldown, no new reconciliation starts.
    s.tension[pairKey(content, 'workers', 'intelligentsia')] = 99;
    const again = playTurn(s, content, { publish: [] });
    expect(again.reconciliationStarted).toBeNull();
  });

  it('dirt on a group sets the other groups against it', () => {
    const s = createGame(content, 8);
    allRead(s);
    const tpl = content.cards.find((t) => t.source === 'investigation' && t.target === 'youth')!;
    const card: CardInstance = { uid: s.nextUid++, templateId: tpl.id, baseTruth: 0, createdTurn: s.turn, tier: 3, scope: 'local', reporterId: s.reporters[0] };
    s.hand = [card];
    const before = s.tension[pairKey(content, 'youth', 'workers')];
    const r = playTurn(s, content, { publish: [{ cardUid: card.uid, placement: 2, distortion: 0 }] });
    expect(r.publications[0].tension![pairKey(content, 'youth', 'workers')]).toBeGreaterThan(0);
    expect(r.tensionBefore[pairKey(content, 'youth', 'workers')]).toBe(before);
  });
});

describe('soothing (CONCEPT.md §3.1)', () => {
  it('a bad true story can be told «Без паники» (half-truth) or «Всё хорошо!» (lie); it calms instead of scaring', () => {
    const s = createGame(content, 4);
    const tpl = templateOf(content, 'salary_delay');
    const card = { uid: s.nextUid++, templateId: tpl.id, baseTruth: 0 as const, createdTurn: s.turn, tier: 2 as const, scope: 'local' as const, reporterId: s.reporters[0], soft: true };
    s.hand = [card];
    expect(minDistortion(card)).toBe(-2);
    expect(cardTruth(card, -1)).toBe(1);
    expect(cardTruth(card, -2)).toBe(2);
    expect(storyTitle(content, card, -2)).toBe(tpl.softTitles![1]);
    const mods = getModifiers(s, content);
    expect(previewPublication(s, content, mods, { cardUid: card.uid, placement: 2, distortion: -2 }).effect?.type).toBe('moodUp');
    expect(previewPublication(s, content, mods, { cardUid: card.uid, placement: 2, distortion: -1 }).effect).toBeNull();
    expect(previewPublication(s, content, mods, { cardUid: card.uid, placement: 2, distortion: -1 }).tier).toBe(1);
    // A rumor or good news has nothing to soothe.
    expect(minDistortion({ ...card, soft: undefined })).toBe(0);
    expect(() => playTurn(s, content, { publish: [{ cardUid: card.uid, placement: 2, distortion: -2 }] })).not.toThrow();
  });
});

describe('save mode (CONCEPT.md §8)', () => {
  it('the rival prints with us; its lies can be debunked for two days, found by a reporter who watches it', () => {
    const s = createGame(content, 3, 'save');
    expect(s.mode).toBe('save');
    expect(rivalReaders(s)).toBeGreaterThan(0);
    // Nothing is known of its issue before it comes out.
    expect(s.hand.some((x) => x.debunk)).toBe(false);
    expect(createGame(content, 3).rival!.kind).toBe('guardian');
    expect(s.rival!.kind).toBe('tabloid');
    setRivalWatch(s, s.reporters[0], true);
    let found = 0;
    for (let t = 0; t < 8 && !s.outcome; t++) {
      playTurn(s, content, { publish: [] });
      for (const p of s.rival!.printed) expect(s.turn - p.turn).toBeLessThanOrEqual(content.balance.debunkWindow);
      for (const card of s.hand.filter((x) => x.debunk)) {
        found++;
        const story = s.rival!.printed.find((p) => p.uid === card.debunk!.uid)!;
        // Only half-truths and lies are debunked, and the debunk tells the truth about them.
        expect(story.truth).toBeGreaterThan(0);
        expect(card.baseTruth).toBe(2 - story.truth);
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('a believed debunk talks people out of the rival story and costs the rival trust', () => {
    let cured = 0;
    let trustDrop = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = createGame(content, seed, 'save');
      for (const r of s.residents) if (r.rivalReader) r.follows = ['newspaper'];
      setRivalWatch(s, s.reporters[0], true);
      for (let t = 0; t < 4 && !s.outcome; t++) {
        const debunks = s.hand.filter((x) => x.debunk);
        const before = rivalTrust(s);
        const report = playTurn(s, content, { publish: debunks.map((x, i) => ({ cardUid: x.uid, placement: (i === 0 ? 2 : 0) as 0 | 2, distortion: 0 })) });
        cured += report.rival!.cured;
        if (debunks.length) trustDrop += before - rivalTrust(s);
      }
    }
    expect(cured).toBeGreaterThan(0);
    expect(trustDrop).toBeGreaterThan(0);
  });

  it('wins when the rival closes or the town holds out, loses when the town falls', () => {
    const s = createGame(content, 2, 'save');
    for (const r of s.residents) r.rivalTrust = 1;
    playTurn(s, content, { publish: [] });
    expect(rivalTrust(s)).toBe(0);
    expect(s.outcome).toEqual({ result: 'win', reason: 'rivalClosed' });

    const t = createGame(content, 2, 'save');
    for (const r of t.residents) r.job = null;
    for (const r of t.residents) r.protestTurns = 5;
    playTurn(t, content, { publish: [] });
    expect(t.outcome).toEqual({ result: 'lose', reason: 'cityFallen' });
  });
});

describe('the guardian of the destroy mode (CONCEPT.md §8)', () => {
  it('reassures the town and answers our fresh lies the next day', () => {
    // A lie that was not caught at once (a caught one needs no answer).
    let s = createGame(content, 6);
    let lie = s.hand[0];
    for (let seed = 6; seed < 40; seed++) {
      s = createGame(content, seed);
      lie = s.hand.find((x) => maxDistortion(x) > 0)!;
      if (!lie) continue;
      const r = playTurn(s, content, { publish: [{ cardUid: lie.uid, placement: 2, distortion: maxDistortion(lie) }] });
      if (!r.exposures.length) break;
    }
    expect(s.rival!.kind).toBe('guardian');
    const answer = s.rival!.plan.find((x) => x.card.debunk?.uid === lie.uid);
    expect(answer).toBeDefined();
    expect(answer!.card.templateId).toBe('guardian_debunk');
    // Its own stories are good news, soothed bad news or calm ones, never frightening.
    for (const story of s.rival!.plan.filter((x) => !x.card.debunk)) expect(story.distortion).toBeLessThanOrEqual(0);
  });
});

describe('story arcs', () => {
  // A full newsroom, so the arc's stage always has a free reporter.
  const c = { ...content, balance: { ...content.balance, arcChance: 1, arcStartTurn: 1, rivalArcChance: 0, startReporters: ['petrova', 'sokolov', 'volkova', 'kim', 'lebedev'] } };
  /** Plays an arc to its end, framing every stage with `frame` (max = inflame, min = soothe). */
  const run = (seed: number, frame: (card: CardInstance) => number) => {
    const s = createGame(c, seed);
    const arc = s.arcs[0];
    const def = c.arcs.find((a) => a.id === arc.id)!;
    const seen: string[] = [];
    for (let day = 0; day < 4; day++) {
      const card = s.hand.find((x) => templateOf(c, x.templateId).arc === def.id)!;
      seen.push(card.templateId);
      if (day < 3) playTurn(s, c, { publish: [{ cardUid: card.uid, placement: 2, distortion: frame(card) }] });
    }
    return { def, seen, s };
  };
  it('an arc runs three stages, then ends by how the press told it', () => {
    const hot = run(5, (card) => maxDistortion(card));
    expect(hot.seen.slice(0, 3)).toEqual(hot.def.stages);
    expect(hot.seen[3]).toBe(hot.def.bad);
    const calm = run(5, (card) => minDistortion(card));
    expect(calm.seen[3]).toBe(calm.def.good);
    // Each arc happens once a game.
    expect(calm.s.arcsDone).toContain(calm.def.id);
    expect(calm.s.arcs.some((a) => a.id === calm.def.id)).toBe(false);
  });
  it('arc stages are never found by ordinary search', () => {
    const s = createGame(content, 3);
    for (let i = 0; i < 15 && !s.outcome; i++) {
      for (const card of s.hand) {
        const tpl = templateOf(content, card.templateId);
        if (tpl.arc) expect(s.arcsDone).toContain(tpl.arc);
      }
      playTurn(s, content, { publish: [] });
    }
  });
});

describe('offers with a catch', () => {
  const card = (s: GameState, templateId: string, building?: number): CardInstance => {
    const tpl = templateOf(content, templateId);
    const x: CardInstance = { uid: s.nextUid++, templateId, baseTruth: tpl.baseTruth, createdTurn: s.turn, tier: 1, scope: 'local', reporterId: s.reporters[0], ...(building !== undefined ? { building } : {}) };
    s.hand.push(x);
    return x;
  };
  it('a silence deal pays at once and costs double when broken', () => {
    const s = createGame(content, 4);
    const shop = s.buildings.find((x) => x.type === 'shop' && x.open)!.id;
    s.offer = { id: 'silence_shop', building: shop };
    const money = s.money;
    answerOffer(s, content, true);
    expect(s.money).toBe(money + 60);
    expect(s.deals).toHaveLength(1);
    const robbery = card(s, 'shop_robbery', shop);
    const trust = averageTrust(s, content);
    const report = playTurn(s, content, { publish: [{ cardUid: robbery.uid, placement: 0, distortion: 0 }] });
    expect(report.deals.broken).toEqual(['Реклама за молчание']);
    expect(s.deals).toHaveLength(0);
    expect(averageTrust(s, content)).toBeLessThan(trust);
  });
  it('declining or ignoring an offer changes nothing; it lapses with the turn', () => {
    const s = createGame(content, 4);
    s.offer = { id: 'subsidy' };
    const money = s.money;
    answerOffer(s, content, false);
    expect(s.money).toBe(money);
    expect(s.deals).toHaveLength(0);
    expect(s.offer).toBeNull();
  });
  it('a fake kompromat looks true but the fact-checkers catch it as a lie', () => {
    const c = { ...content, offers: content.offers.map((o) => ({ ...o, setupChance: 1 })), balance: { ...content.balance, checkerBase: 100 } };
    let caught = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const s = createGame(c, seed);
      s.offer = { id: 'kompromat_mayor' };
      const k = answerOffer(s, c, true)!;
      expect(k.setup).toBe(true);
      expect(previewPublication(s, c, getModifiers(s, c), { cardUid: k.uid, placement: 2, distortion: 0 }).truth).toBe(0);
      const report = playTurn(s, c, { publish: [{ cardUid: k.uid, placement: 2, distortion: 0 }] });
      caught += report.exposures.filter((x) => x.setup && x.truth === 2).length;
    }
    expect(caught).toBeGreaterThan(0);
  });
});

describe('reporters with character', () => {
  const story = (s: GameState, reporterId: string, templateId: string): CardInstance => {
    const tpl = templateOf(content, templateId);
    const x: CardInstance = { uid: s.nextUid++, templateId, baseTruth: tpl.baseTruth, createdTurn: s.turn, tier: 1, scope: 'local', reporterId };
    s.hand = [x];
    return x;
  };
  it('printed stories give experience; a level makes the reporter better', () => {
    const s = createGame(content, 2);
    const id = s.reporters[0];
    const before = skilledReporter(s, content, reporterOf(content, id)).skills.luck;
    staffOf(s, content, id).xp = content.balance.reporterLevels[1] - 1;
    const card = story(s, id, 'bakery_award');
    const report = playTurn(s, content, { publish: [{ cardUid: card.uid, placement: 2, distortion: 0 }] });
    expect(report.staff.levelUps).toContain(id);
    expect(levelOf(content, staffOf(s, content, id).xp)).toBe(1);
    expect(skilledReporter(s, content, reporterOf(content, id)).skills.luck).toBeGreaterThan(before);
  });
  it('an honest reporter forced to lie quits; the last one stays', () => {
    const s = createGame(content, 2);
    s.reporters = ['petrova', 'nikitina'];
    s.staff.nikitina = { xp: 0, loyalty: content.balance.quitLoyalty + 0.05 };
    const card = story(s, 'nikitina', 'bakery_award');
    const report = playTurn(s, content, { publish: [{ cardUid: card.uid, placement: 0, distortion: 2 }] });
    expect(report.staff.quit).toEqual(['nikitina']);
    expect(s.reporters).toEqual(['petrova']);
    s.staff.petrova.loyalty = 0;
    const own = story(s, 'petrova', 'bakery_award');
    playTurn(s, content, { publish: [{ cardUid: own.uid, placement: 0, distortion: 2 }] });
    expect(s.reporters).toEqual(['petrova']);
  });
  it('scary untruth on a personal tie hurts the reporter', () => {
    const s = createGame(content, 2);
    const tie = reporterOf(content, 'petrova').tie!;
    const tpl = content.cards.find((t) => t.topic === tie.topic && t.source === 'event' && !t.arc && t.effects[0] && !['moodUp'].includes(t.effects[0]!.type))!;
    const before = staffOf(s, content, 'petrova').loyalty;
    const card = story(s, 'petrova', tpl.id);
    playTurn(s, content, { publish: [{ cardUid: card.uid, placement: 0, distortion: 1 }] });
    expect(staffOf(s, content, 'petrova').loyalty).toBeLessThan(before);
  });
  it('the rival lures a reporter: keep them for a bonus or lose them', () => {
    const s = createGame(content, 2);
    s.reporters = ['petrova', 'kim'];
    s.offer = { id: 'poach_guardian', reporterId: 'kim' };
    answerOffer(s, content, false);
    expect(s.reporters).toEqual(['petrova']);
    s.reporters.push('kim');
    s.offer = { id: 'poach_guardian', reporterId: 'kim' };
    const money = s.money;
    answerOffer(s, content, true);
    expect(s.reporters).toContain('kim');
    expect(s.money).toBe(money - reporterOf(content, 'kim').salary * content.balance.poachRetain);
  });
});

describe('named residents and letters', () => {
  it('every named resident is a real resident of their group, at their work when possible', () => {
    const s = createGame(content, 6);
    for (const p of content.people) {
      const r = s.residents[s.people[p.id]];
      expect(r.group).toBe(p.group);
    }
    expect(new Set(Object.values(s.people)).size).toBe(Object.keys(s.people).length);
    const grisha = s.residents[s.people.grisha];
    if (grisha.job !== null) expect(s.buildings[grisha.job].type).toBe('entertainment');
  });
  it('readers write letters about the issue, and a lost job goes to the fate log', () => {
    const s = createGame(content, 6);
    let letters = 0;
    for (let i = 0; i < 8 && !s.outcome; i++) {
      playTurn(s, content, { publish: s.hand.slice(0, 2).map((x, j) => ({ cardUid: x.uid, placement: (j ? 0 : 2) as 0 | 2, distortion: 0 })) });
      letters += s.letters.length;
      for (const l of s.letters) expect(l.text).not.toMatch(/[{}]/);
      expect(s.letters.length).toBeLessThanOrEqual(content.balance.lettersMax);
    }
    expect(letters).toBeGreaterThan(0);
    // Losing a job shows in the fate log and brings a letter.
    const nikolay = s.residents[s.people.nikolay];
    nikolay.status = 'active';
    nikolay.job = s.buildings.findIndex((x) => x.type === 'factory');
    const before = snapshotPeople(s);
    nikolay.job = null;
    updatePeople(s, content, s.rng, before, [], []);
    expect(s.fates[0]).toMatchObject({ person: 'nikolay', kind: 'lostJob' });
    expect(s.letters.some((l) => l.from === 'nikolay' && l.kind === 'lostJob')).toBe(true);
  });
});

describe('difficulty', () => {
  it('a level overrides balance numbers, some only in one mode; normal changes nothing', () => {
    expect(withDifficulty(content, 'normal', 'destroy').balance).toEqual(content.balance);
    const hard = withDifficulty(content, 'hard', 'destroy');
    expect(hard.balance.checkerBase).toBeGreaterThan(content.balance.checkerBase);
    expect(hard.balance.turnLimit).toBeLessThan(content.balance.turnLimit);
    expect(withDifficulty(content, 'hard', 'save').balance.turnLimit).toBeGreaterThan(content.balance.turnLimit);
    const s = createGame(hard, 3, 'destroy', 'hard');
    expect(s.difficulty).toBe('hard');
    expect(s.money).toBe(hard.balance.startMoney);
  });
});

describe('forecast', () => {
  it('rehearses the turn without touching the game, the same layout always forecasts the same', () => {
    const s = createGame(content, 4);
    const before = JSON.stringify(s);
    const d = { publish: s.hand.slice(0, 1).map((x) => ({ cardUid: x.uid, placement: 2 as const, distortion: 0 })) };
    const a = forecastTurn(s, content, d)!;
    expect(JSON.stringify(s)).toBe(before);
    expect(forecastTurn(s, content, d)).toEqual(a);
    expect(Number.isFinite(a.cityIndex)).toBe(true);
    // A layout the rules forbid has no forecast.
    expect(forecastTurn(s, content, { publish: [{ cardUid: -1, placement: 0, distortion: 0 }] })).toBeNull();
  });
});

describe('gentle first days (CONCEPT.md §4.7)', () => {
  it('no fact-checks, rival or conflicts before their days, for every seed and mode', () => {
    const b = realContent.balance;
    for (const mode of ['destroy', 'save'] as const) {
      for (let seed = 1; seed <= 6; seed++) {
        const s = createGame(realContent, seed, mode);
        while (s.turn < Math.max(b.conflictStartTurn, b.rivalStartTurn[mode], b.factCheckStartTurn) && !s.outcome) {
          const turn = s.turn;
          if (turn < b.conflictStartTurn) expect(s.hand.some((x) => templateOf(realContent, x.templateId).conflict)).toBe(false);
          const r = playTurn(s, realContent, simpleDecision(s, 'max'));
          if (turn < b.factCheckStartTurn) expect(r.exposures).toEqual([]);
          if (turn < b.rivalStartTurn[mode]) expect(r.rival?.publications ?? []).toEqual([]);
        }
      }
    }
  });
});

describe('tasks and stars (CONCEPT.md §4.8)', () => {
  it('gives the mode its tasks on their day, pays done ones and fails broken ones', () => {
    const b = content.balance;
    for (const mode of ['destroy', 'save'] as const) {
      const s = createGame(content, 11, mode);
      while (s.turn < b.taskStartTurn) playTurn(s, content, simpleDecision(s, 'none'));
      const own = s.tasks.filter((t) => !taskOf(content, t.id).twist);
      expect(own).toHaveLength(b.taskCount);
      expect(new Set(own.map((t) => t.id)).size).toBe(b.taskCount);
      for (const t of own) expect([undefined, mode]).toContain(taskOf(content, t.id).mode);
    }
    // A reach task is done the day its check holds and pays its reward.
    const s = createGame(content, 12);
    s.tasks = [];
    giveTask(s, content, 'upgrades_destroy');
    s.turn++;
    s.upgrades.push('kiosk_1', 'kiosk_2', 'kiosk_3');
    const money = s.money;
    const r = updateTasks(s, content, []);
    expect(r.done).toEqual(['upgrades_destroy']);
    expect(s.money).toBe(money + Math.round(taskOf(content, 'upgrades_destroy').reward * content.balance.taskRewardMul));
    // A prize instead of money: the voucher makes one deck card free, never a fork option.
    giveTask(s, content, 'income_destroy');
    s.turn++;
    s.lastProfit = 1000;
    expect(updateTasks(s, content, []).done).toEqual(['income_destroy']);
    expect(s.vouchers).toBe(1);
    s.money = 0;
    s.shopOffer = ['photographer'];
    s.shopPicks = 1;
    expect(listPurchases(s, content).find((p) => p.id === 'photographer')).toMatchObject({ cost: 0, affordable: true });
    purchase(s, content, 'photographer');
    expect(s.vouchers).toBe(0);
    expect(s.money).toBe(0);
    // Experience for the whole newsroom.
    giveTask(s, content, 'team_destroy');
    s.turn++;
    s.reporters = content.reporters.slice(0, 4).map((x) => x.id);
    const xp = staffOf(s, content, s.reporters[3]).xp;
    updateTasks(s, content, []);
    expect(staffOf(s, content, s.reporters[3]).xp).toBe(xp + 40);
    // A keep task fails on the first exposure.
    giveTask(s, content, 'clean_destroy');
    s.turn++;
    expect(updateTasks(s, content, [{ title: 'x' } as never]).failed).toEqual(['clean_destroy']);
  });

  it('stars: a win, all tasks, a clean game; a lost game has none', () => {
    const s = createGame(content, 13);
    s.tasks = [{ id: 'upgrades_destroy', startTurn: 1, untilTurn: 5, status: 'done', base: 0 }];
    s.exposedTotal = 0;
    s.outcome = { result: 'win', reason: 'cityDestroyed' };
    expect(scoreOf(s, content).stars).toBe(3);
    s.exposedTotal = 2;
    expect(scoreOf(s, content).stars).toBe(2);
    s.outcome = { result: 'lose', reason: 'bankrupt' };
    expect(scoreOf(s, content).stars).toBe(0);
  });
});

describe('reactions follow the story', () => {
  it('a plain fact neither scares nor cheers: its believers just take note', () => {
    const s = createGame(content, 21);
    s.hand = [];
    const card: CardInstance = { uid: s.nextUid++, templateId: 'cityhall_meeting', baseTruth: 0, createdTurn: s.turn, tier: 1, scope: 'local', reporterId: s.reporters[0] };
    s.hand.push(card);
    const report = playTurn(s, content, { publish: [{ cardUid: card.uid, placement: 2, distortion: 0 }] });
    const pub = report.publications[0];
    expect(pub.believed).toBeGreaterThan(0);
    expect(pub.mood).toBe('calm');
    const reactions = Object.values(s.lastReactions);
    expect(reactions).toContain('calm');
    expect(reactions).not.toContain('scared');
    expect(reactions).not.toContain('happy');
  });
});

describe('attacking the town (CONCEPT.md §3.5, §3.6а, §8.4)', () => {
  it('a hunt makes stories about its target hit harder day after day, stains it and is won when it closes', () => {
    const s = createGame(content, 21);
    const factory = s.buildings.find((x) => x.type === 'factory')!;
    s.hand = [];
    const card: CardInstance = { uid: s.nextUid++, templateId: 'factory_sold', baseTruth: 1, createdTurn: s.turn, tier: 2, scope: 'local', reporterId: s.reporters[0], building: factory.id };
    s.hand.push(card);
    const mods = getModifiers(s, content);
    const pub = { cardUid: card.uid, placement: 2 as const, distortion: 0 };
    const before = previewPublication(s, content, mods, pub).impact;
    startHunt(s, factory.id);
    s.hunt!.step = 2;
    expect(huntBonus(s, content, mods)).toBeCloseTo(1 + 2 * content.balance.huntStep);
    expect(previewPublication(s, content, mods, pub).impact).toBeGreaterThan(before);
    playTurn(s, content, { publish: [pub] });
    expect(s.hunt?.step).toBe(3);
    expect(s.stains[factory.id] ?? 0).toBeGreaterThan(0);
    // A day without a hit cools it down a step.
    playTurn(s, content, { publish: [] });
    expect(s.hunt?.step).toBe(2);
    s.buildings[factory.id].open = false;
    expect(settleHunt(s, content)).toBeTruthy();
    expect(s.hunt).toBeNull();
  });

  it('the yellow press: youth believe it whatever its reputation, pensioners drift away', () => {
    const m = getModifiers({ ...createGame(content, 3), upgrades: ['yellow_layout'] }, content);
    expect(m.sensationTrust).toBeGreaterThan(0);
    expect(m.groupChurn.pensioners).toBeGreaterThan(0);
    expect(m.channels.newspaper.groupReach.youth).toBeGreaterThan(0);
  });

  it('strikes at the guardian: luring its author and digging into its money', () => {
    const s = createGame(content, 22, 'destroy');
    s.money = 5000;
    const trust = rivalTrust(s);
    lureRivalAuthor(s, content);
    expect(s.rival!.lured).toBe(1);
    expect(rivalTrust(s)).toBeLessThan(trust);
    while (!lureBlock(s, content)) lureRivalAuthor(s, content);
    expect(lureBlock(s, content)).toBe('nobody left');
    // A reporter digging into it brings documents about who pays it.
    startInvestigation(s, content, s.reporters[0], RIVAL_DIG);
    for (let i = 0; i < 6 && !s.hand.some((x) => x.templateId === 'kompromat_guardian'); i++) playTurn(s, content, { publish: [] });
    expect(s.hand.some((x) => x.templateId === 'kompromat_guardian')).toBe(true);
  });
});

describe('crime (CONCEPT.md §5.6)', () => {
  it('heat breeds real crime, the police hold it back, a lost police costs order, a broken order brings the gang', () => {
    const s = createGame(content, 31);
    const calm = crimePressure(s, content);
    s.crimeHeat = 0.5;
    const hot = crimePressure(s, content);
    expect(hot).toBeGreaterThan(calm);
    const police = s.buildings.find((x) => x.type === 'police')!;
    police.open = false;
    expect(crimePressure(s, content)).toBeGreaterThan(hot);
    // A hot town without police has real crime nearly every day.
    let crimes = 0;
    for (let i = 0; i < 20; i++) crimes += crimeEvents(s, content, s.rng, []).length, s.lastSeen = {};
    expect(crimes).toBeGreaterThan(10);
    // Order is lower without the police.
    const order = s.metrics.order;
    playTurn(s, content, { publish: [] });
    expect(s.metrics.order).toBeLessThan(Math.max(order, 1));
    s.arcsDone = s.arcsDone.filter((x) => x !== 'street_gang');
    s.metrics.order = content.balance.gangOrder - 0.1;
    expect(gangDue(s, content)).toBe(true);
  });
});

describe('the mid-game twist (CONCEPT.md §4.9)', () => {
  it('begins on its day; the election picks a mayor by mood, the audit gives a task with a penalty', () => {
    const b = content.balance;
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const s = createGame(content, seed);
      while (s.turn < b.twistTurn && !s.outcome) playTurn(s, content, simpleDecision(s, 'none'));
      if (s.outcome) continue;
      expect(s.twist?.startTurn).toBe(b.twistTurn);
      kinds.add(content.twists.find((t) => t.id === s.twist!.id)!.kind);
    }
    expect(kinds.size).toBeGreaterThan(1);
    // A gloomy town elects the hardliner: tension fades slower and nobody reconciles.
    const s = createGame(content, 3);
    s.twist = { id: 'election', startTurn: s.turn, untilTurn: s.turn, result: null };
    for (const r of s.residents) r.mood = 0.1;
    s.metrics.mood = 0.1;
    playTurn(s, content, simpleDecision(s, 'none'));
    expect(s.twist.result).toBe('hardliner');
    expect(twistMods(s, content).reconcileDrop).toBeLessThan(0);
    // A failed audit cuts the budget for the rest of the game.
    const a = createGame(content, 4);
    giveTask(a, content, 'audit_city');
    a.tasks[a.tasks.length - 1].untilTurn = a.turn;
    a.turn++;
    updateTasks(a, content, []);
    expect(a.budgetCut).toBe(taskOf(content, 'audit_city').penalty);
  });
});

describe('campaign towns (CONCEPT.md §9)', () => {
  it('every town makes a playable game of its own character and length', () => {
    for (const t of realContent.towns) {
      const c = withTown(realContent, t.id, 'destroy');
      const s = createGame(c, 5, 'destroy', 'normal', { town: t.id });
      expect(s.town).toBe(t.id);
      expect(c.balance.turnLimit).toBe(t.modes?.destroy?.days ?? t.days);
      for (const [type, patch] of Object.entries(t.buildings ?? {})) {
        if (patch?.count !== undefined) expect(s.buildings.filter((x) => x.type === type)).toHaveLength(patch.count);
      }
      for (let i = 0; i < 3 && !s.outcome; i++) playTurn(s, c, simpleDecision(s, 'none'));
    }
    // Shares change who lives there: Заводск is mostly workers.
    const z = createGame(withTown(realContent, 'zavodsk', 'destroy'), 5, 'destroy', 'normal', { town: 'zavodsk' });
    expect(z.residents.filter((r) => r.group === 'workers').length).toBeGreaterThan(z.residents.length * 0.45);
  });

  it('a carried reporter starts the next town with their experience', () => {
    const s = createGame(realContent, 6, 'save', 'normal', { reporters: [{ id: 'nikitina', xp: 200 }] });
    expect(s.reporters).toEqual(['nikitina']);
    expect(levelOf(realContent, staffOf(s, realContent, 'nikitina').xp)).toBe(2);
  });
});

describe('campaign progress', () => {
  it('opens towns in a row and gates the final by stars', async () => {
    const { newCampaign, townState, winTown, campaignStars } = await import('../src/ui/campaign');
    const camp = newCampaign('destroy', 'normal');
    const last = realContent.towns.length - 1;
    expect(townState(realContent, camp, 0)).toBe('now');
    expect(townState(realContent, camp, 1)).toBe('locked');
    for (let i = 0; i < last; i++) winTown(realContent, camp, realContent.towns[i].id, { stars: 1, days: 30 });
    expect(camp.reached).toBe(last);
    expect(campaignStars(camp)).toBe(last);
    expect(townState(realContent, camp, last)).toBe('gated');
    // A replay keeps the better result.
    winTown(realContent, camp, realContent.towns[0].id, { stars: 3, days: 40 });
    winTown(realContent, camp, realContent.towns[1].id, { stars: 3, days: 40 });
    winTown(realContent, camp, realContent.towns[2].id, { stars: 0, days: 10 });
    expect(campaignStars(camp)).toBe(last + 4);
    expect(townState(realContent, camp, last)).toBe('now');
    winTown(realContent, camp, realContent.towns[last].id, { stars: 2, days: 35 });
    expect(camp.finished).toBe(true);
  });
});

describe('reputation (CONCEPT.md §5.3)', () => {
  it('five clean issues in a row pay the bonus; a lie breaks the streak', () => {
    const b = content.balance;
    const s = createGame(content, 5);
    const honest = () => {
      const card = s.hand.find((x) => x.baseTruth === 0);
      return card ? [{ cardUid: card.uid, placement: 0 as const, distortion: 0 }] : [];
    };
    let bonus = 0;
    for (let i = 0; i < b.cleanStreakDays * 2 && !s.outcome && !bonus; i++) {
      const publish = honest();
      const r = playTurn(s, content, { publish });
      bonus = r.cleanStreak.bonus;
    }
    expect(bonus).toBeGreaterThan(0);
    expect(s.cleanStreak).toBe(0);
    // Two clean days, then a lie.
    for (let i = 0; i < 2; i++) playTurn(s, content, { publish: honest() });
    const before = s.cleanStreak;
    const lie = s.hand.find((x) => maxDistortion(x) > 0)!;
    const r = playTurn(s, content, { publish: [{ cardUid: lie.uid, placement: 0, distortion: maxDistortion(lie) }] });
    expect(before).toBeGreaterThan(0);
    expect(r.cleanStreak.broken).toBe(true);
    expect(s.cleanStreak).toBe(0);
  });

  it('true news on the front page builds more trust than a brief, and reaches non-readers a little', () => {
    const gainAt = (placement: 0 | 2) => {
      const s = createGame(content, 8);
      const card = s.hand.find((x) => x.baseTruth === 0)!;
      const readers = new Set(s.residents.filter((r) => r.follows.length).map((r) => r.id));
      const outsider = s.residents.find((r) => !readers.has(r.id) && r.status === 'active')!;
      const before = outsider.trust;
      const r = playTurn(s, content, { publish: [{ cardUid: card.uid, placement, distortion: 0 }] });
      return { all: r.trustAfter - r.trustBefore, outsider: s.residents[outsider.id].trust - before };
    };
    const front = gainAt(2);
    expect(front.all).toBeGreaterThan(gainAt(0).all);
    expect(front.outsider).toBeGreaterThan(0);
  });
});

describe('short game (CONCEPT.md §4.6а)', () => {
  it('a short game has its own days by difficulty, a nearer goal and a quicker start', () => {
    const full = withLength(withDifficulty(realContent, 'hard', 'destroy'), 'full', 'hard');
    expect(full.balance).toEqual(withDifficulty(realContent, 'hard', 'destroy').balance);
    const short = withLength(withDifficulty(realContent, 'hard', 'destroy'), 'short', 'hard');
    const def = realContent.lengths.find((x) => x.id === 'short')!;
    expect(short.balance.turnLimit).toBe(def.days!.hard);
    expect(short.balance.winCityIndex).toBeGreaterThan(realContent.balance.winCityIndex);
    expect(short.balance.impactNorm).toBeCloseTo(withDifficulty(realContent, 'hard', 'destroy').balance.impactNorm * def.balanceMul!.impactNorm!);
    const s = createGame(short, 3, 'destroy', 'hard', { length: 'short' });
    expect(s.length).toBe('short');
    expect(s.reporters.length).toBe(short.balance.startReporters.length);
  });
});

describe('a riskier telling always hits harder (CONCEPT.md §5.2а)', () => {
  it('every louder step gives more believers × strength, and in a hunt a harder hit', () => {
    const c = withDifficulty(realContent, 'normal', 'destroy');
    let checked = 0;
    let capped = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = createGame(c, seed);
      for (let t = 0; t < 10 && !s.outcome; t++) {
        const hunted = s.hand.find((x) => x.building !== undefined && s.buildings[x.building].open && s.buildings[x.building].jobs > 0);
        if (t === 4 && hunted) startHunt(s, hunted.building!);
        const mods = getModifiers(s, c);
        for (const card of s.hand) {
          for (const placement of [0, 1, 2] as const) {
            const result = (d: number) => {
              const p = previewPublication(s, c, mods, { cardUid: card.uid, placement, distortion: d });
              return { p, value: p.believers * p.impact * (storyEffect(c, card, d)?.strength ?? 0) };
            };
            for (let d = Math.max(1, minDistortion(card) + 1); d <= maxDistortion(card); d++) {
              const prev = result(d - 1);
              const now = result(d);
              if (!prev.p.effect || !now.p.effect || prev.value === 0) continue;
              checked++;
              if (effectiveTier(card, d) === effectiveTier(card, d - 1)) capped++;
              expect(now.value).toBeGreaterThan(prev.value);
              if (prev.p.huntHit && now.p.huntHit !== null) expect(now.p.huntHit).toBeGreaterThan(prev.p.huntHit);
            }
          }
        }
        playTurn(s, c, { publish: s.hand.map((x, i) => ({ cardUid: x.uid, placement: (i === 0 ? 2 : i === 1 ? 1 : 0) as 0 | 1 | 2, distortion: 0 })) });
      }
    }
    expect(checked).toBeGreaterThan(50);
    // The case that used to fail: the level already a sensation, a lie believed by fewer.
    expect(capped).toBeGreaterThan(0);
  });
});

describe('the truth menu reads a louder telling as stronger (CONCEPT.md §7.3)', () => {
  it('two frightening tellings with the same strength band still read differently', () => {
    const avoid = { type: 'avoid' as const, strength: 0.2, building: 'entertainment' as const };
    const scale = framingScale([
      { dist: 0, effect: { type: 'moodUp', strength: 0.02 }, believers: 63, impact: 0.5 },
      { dist: 1, effect: avoid, believers: 47, impact: 0.62 },
      { dist: 2, effect: avoid, believers: 31, impact: 0.95 },
    ]);
    expect(scale.get(2)!.step).toBeGreaterThan(scale.get(1)!.step);
    expect(effectShort(realContent, avoid, 0.95, scale.get(2)!.step)).not.toBe(effectShort(realContent, avoid, 0.62, scale.get(1)!.step));
    // The good «как есть» is not the yardstick; the louder lie says it hits harder than the half-truth.
    expect(scale.get(1)!.ratio).toBeNull();
    expect(scale.get(2)!.ratio!).toBeGreaterThan(1);
  });

  it('on real stories every louder step of the same effect reads stronger and hits harder', () => {
    const c = withDifficulty(realContent, 'normal', 'destroy');
    let pairs = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = createGame(c, seed);
      for (let t = 0; t < 8 && !s.outcome; t++) {
        const mods = getModifiers(s, c);
        for (const card of s.hand) {
          for (const placement of [0, 1, 2] as const) {
            const options = [];
            for (let d = minDistortion(card); d <= maxDistortion(card); d++) {
              const p = previewPublication(s, c, mods, { cardUid: card.uid, placement, distortion: d });
              options.push({ dist: d, effect: p.effect, believers: p.believers, impact: p.impact });
            }
            const scale = framingScale(options);
            for (const o of options) {
              const prev = options.find((x) => x.dist === o.dist - 1);
              if (!prev || o.dist <= 0 || !prev.effect || !o.effect || prev.effect.type !== o.effect.type) continue;
              pairs++;
              const a = scale.get(prev.dist)!;
              const b = scale.get(o.dist)!;
              if (a.step < 2) expect(b.step).toBeGreaterThan(a.step);
              else expect(b.step).toBe(2);
              if (a.ratio !== null) expect(b.ratio!).toBeGreaterThan(a.ratio);
              else if (b.ratio !== null) expect(b.ratio).toBeGreaterThan(1);
            }
          }
        }
        playTurn(s, c, { publish: s.hand.map((x, i) => ({ cardUid: x.uid, placement: (i === 0 ? 2 : i === 1 ? 1 : 0) as 0 | 1 | 2, distortion: 0 })) });
      }
    }
    expect(pairs).toBeGreaterThan(30);
  });
});

describe('tutorial quarrel tip (CONCEPT.md §7.3 «Обучение»)', () => {
  it('a reporter brings a true quarrel story about the tensest pair into the hand', () => {
    const c = withDifficulty(realContent, 'easy', 'destroy');
    const s = createGame(c, 4);
    const before = s.hand.length;
    const card = tipConflict(s, c)!;
    expect(card).not.toBeNull();
    expect(s.hand.length).toBe(before + 1);
    expect(card.conflict).toBeDefined();
    expect(card.baseTruth).toBe(0);
    const tensest = [...pairKeys(c)].sort((a, b) => s.tension[b] - s.tension[a])[0];
    expect(pairKey(c, ...card.conflict!)).toBe(tensest);
    // It can be heated like any quarrel and the issue is valid.
    const pub = s.hand.map((x, i) => ({ cardUid: x.uid, placement: (x.uid === card.uid ? 0 : i === 0 ? 2 : 1) as 0 | 1 | 2, distortion: x.uid === card.uid ? maxDistortion(card) : 0 }));
    const used = [0, 0, 0];
    const fitted = pub.map((p) => (p.placement > 0 && used[p.placement]++ > 0 ? { ...p, placement: 0 as const } : p));
    expect(() => playTurn(s, c, { publish: fitted })).not.toThrow();
  });
});

describe('the collection: draft, levels, sets (CONCEPT.md §3.5б)', () => {
  it('the draft offers only cards of the collection: one card is taken for free and the offer closes', () => {
    const collection = { photographer: 1, cartoonist: 1, gossip_column: 1, tabloid_king: 2 };
    const s = createGame(realContent, 3, 'destroy', 'normal', { collection });
    s.money = 10_000;
    dealShop(s, realContent, s.rng);
    expect(s.shopOffer.length).toBe(3);
    for (const id of s.shopOffer) expect(Object.keys(collection)).toContain(id);
    const money = s.money;
    const [first, second] = s.shopOffer;
    purchase(s, realContent, first);
    expect(s.money).toBe(money);
    expect(s.shopOffer).toEqual([]);
    // Nothing more to buy from it, and no reroll for a second free card.
    expect(() => purchase(s, realContent, second)).toThrow();
    expect(() => refreshShop(s, realContent)).toThrow();
  });

  it('a level grows a card\'s benefits and leaves its drawbacks', () => {
    const e = { scaryImpactMul: 1.3, trustGainMul: 0.8, checkerMul: 0.9, upkeepAdd: 15, groupReach: { youth: 0.2, pensioners: -0.3 } };
    const up = levelEffects(e, 2);
    expect(up.scaryImpactMul).toBeCloseTo(1.6);
    expect(up.trustGainMul).toBe(0.8);
    expect(up.checkerMul).toBeCloseTo(0.8);
    expect(up.upkeepAdd).toBe(15);
    expect(up.groupReach).toEqual({ youth: 0.4, pensioners: -0.3 });
    const m1 = modifiersOf(realContent, ['tabloid_king'], { tabloid_king: 1 });
    const m3 = modifiersOf(realContent, ['tabloid_king'], { tabloid_king: 3 });
    expect(m3.scaryImpactMul).toBeGreaterThan(m1.scaryImpactMul);
    expect(m3.trustGainMul).toBe(m1.trustGainMul);
  });

  it('three cards of one direction make a set', () => {
    const two = modifiersOf(realContent, ['photographer', 'cartoonist']);
    const three = modifiersOf(realContent, ['photographer', 'cartoonist', 'gossip_column']);
    expect(two.synergies).not.toContain('yellow');
    expect(three.synergies).toContain('yellow');
    expect(three.scaryImpactMul).toBeGreaterThan(two.scaryImpactMul);
  });

  it('the new cards change their mechanics', () => {
    const s = createGame(realContent, 5, 'destroy', 'normal');
    const salary = totalUpkeep(s, realContent);
    const turns = investigationTurns(realContent, reporterOf(realContent, s.reporters[0]), getModifiers(s, realContent));
    const lure = lureCost(s, realContent);
    s.upgrades.push('interns', 'smear_lab', 'defectors');
    expect(totalUpkeep(s, realContent)).toBeLessThan(salary);
    expect(investigationTurns(realContent, reporterOf(realContent, s.reporters[0]), getModifiers(s, realContent))).toBe(turns - 1);
    expect(lureCost(s, realContent)).toBeLessThan(lure);
    const money = s.money;
    s.upgrades.push('media_baron');
    playTurn(s, realContent, { publish: [] });
    expect(s.money).toBeGreaterThan(money - totalUpkeep(s, realContent) + 60);
  });
});

describe('the black cash (CONCEPT.md §3.5в)', () => {
  it('only the base move is open; cards open the rest, and a card\'s level makes its move cheaper', () => {
    const s = createGame(content, 5, 'destroy', 'normal', { collection: { informant: 3 } });
    s.money = 10_000;
    expect(cashMoves(s, content).map((x) => x.id)).toEqual(content.cash.filter((x) => x.base).map((x) => x.id));
    expect(cashBlock(s, content, 'leak')).toBe('нужна карта');
    s.upgrades.push('informant');
    expect(cashBlock(s, content, 'leak')).toBeNull();
    const leak = content.cash.find((x) => x.id === 'leak')!;
    expect(cashCost(s, content, 'leak')).toBe(Math.round(leak.cost / content.balance.cardLevelPower[2]));
  });

  it('a move costs money, waits its cooldown and acts on its day', () => {
    const s = createGame(content, 5);
    s.upgrades.push('fact_friend', 'hired_crowd', 'paparazzi_team');
    s.money = 10_000;
    const bribe = content.cash.find((x) => x.id === 'bribe')!;
    expect(cashBlock(s, content, 'bribe')).toBeNull();
    useCash(s, content, 'bribe');
    expect(s.money).toBe(10_000 - bribe.cost);
    expect(cashActive(s, 'bribe')).toBe(true);
    expect(bribeMul(s, content)).toBe(bribe.checkerMul);
    expect(cashBlock(s, content, 'bribe')).toMatch(/через/);
    expect(() => useCash(s, content, 'bribe')).toThrow();
    // Provocateurs act tomorrow, paparazzi need a hunt.
    useCash(s, content, 'provoke');
    expect(cashActive(s, 'provoke')).toBe(false);
    expect(cashActive(s, 'provoke', s.turn + 1)).toBe(true);
    expect(cashBlock(s, content, 'paparazzi')).toBe('нет травли');
    s.money = 0;
    expect(cashBlock(s, content, 'ads')).toBe('не хватает денег');
  });

  it('a leak puts a loud rumor into today\'s hand; ads bring readers', () => {
    const s = createGame(content, 6);
    s.upgrades.push('informant');
    s.money = 10_000;
    const hand = s.hand.length;
    const card = useCash(s, content, 'leak')!;
    expect(s.hand.length).toBe(hand + 1);
    expect(card.tier).toBeGreaterThanOrEqual(2);
    expect(content.cards.find((t) => t.id === card.templateId)!.source).toBe('rumor');
    const readers = readerCount(s);
    useCash(s, content, 'ads');
    expect(readerCount(s)).toBeGreaterThan(readers);
  });
});
