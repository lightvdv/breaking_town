import { describe, expect, it } from 'vitest';
import { content } from '../src/content';
import {
  averageTrust,
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
    // One search per reporter plus one write-up per event of the day.
    expect(s.lastFinds.length).toBe(s.reporters.length + s.todayEvents.length);
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
    expect(() => purchase(s, content, 'kiosk_2')).toThrow();
    purchase(s, content, 'kiosk_1');
    const one = salesOf(s, content, 'newspaper', 100);
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

  it('everything that happened in the city today reaches the issue', () => {
    const c = withBalance({ incidentChance: 1 });
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = createGame(c, seed);
      for (const k of pairKeys(c)) s.tension[k] = 70;
      for (let i = 0; i < 4 && !s.outcome; i++) {
        playTurn(s, c, { publish: [] });
        const titles = s.hand.map((x) => storyTitle(c, x, 0));
        for (const e of s.todayEvents) expect(titles).toContain(e);
      }
    }
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

  it('the HR agency offers one or two new reporters for a fee; only they can be hired', () => {
    const b = content.balance;
    const sizes = new Set<number>();
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = createGame(content, seed);
      s.money = 1000;
      const offer = callAgency(s, content);
      sizes.add(offer.length);
      expect(s.money).toBe(1000 - b.agencyFee);
      expect(offer.length).toBeGreaterThanOrEqual(1);
      expect(offer.length).toBeLessThanOrEqual(b.agencyMaxOffer);
      for (const id of offer) expect(s.reporters).not.toContain(id);
      const spare = content.reporters.find((r) => !offer.includes(r.id) && !s.reporters.includes(r.id))!;
      expect(() => hireFromAgency(s, content, spare.id)).toThrow();
      hireFromAgency(s, content, offer[0]);
      expect(s.reporters).toContain(offer[0]);
      // The reporter's own price on top of the fee; the salary goes into the upkeep.
      expect(s.money).toBe(1000 - b.agencyFee - reporterOf(content, offer[0]).hireCost);
      expect(totalUpkeep(s, content)).toBeGreaterThanOrEqual(reporterOf(content, offer[0]).salary);
      // The offer lapses at the end of the turn.
      playTurn(s, content, { publish: [] });
      expect(s.agencyOffer).toEqual([]);
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
    expect(() => purchase(s, content, 'newspaper_quality_2')).toThrow();
    expect(listPurchases(s, content).find((p) => p.id === 'newspaper_quality_2')?.unlocked).toBe(false);
    purchase(s, content, 'newspaper_quality_1');
    purchase(s, content, 'newspaper_quality_2');
    expect(s.upgrades).toContain('newspaper_quality_2');
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
    const other = plain.hand.find((x) => !x.conflict)!;
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
    const s = createGame(content, 6);
    expect(s.rival!.kind).toBe('guardian');
    const lie = s.hand.find((x) => maxDistortion(x) > 0)!;
    playTurn(s, content, { publish: [{ cardUid: lie.uid, placement: 2, distortion: maxDistortion(lie) }] });
    const answer = s.rival!.plan.find((x) => x.card.debunk?.uid === lie.uid);
    expect(answer).toBeDefined();
    expect(answer!.card.templateId).toBe('guardian_debunk');
    // Its own stories are good news, soothed bad news or calm ones, never frightening.
    for (const story of s.rival!.plan.filter((x) => !x.card.debunk)) expect(story.distortion).toBeLessThanOrEqual(0);
  });
});

describe('story arcs', () => {
  const c = { ...content, balance: { ...content.balance, arcChance: 1, arcStartTurn: 1, rivalArcChance: 0 } };
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
