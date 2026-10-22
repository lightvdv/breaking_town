/**
 * Headless balance check (CONCEPT.md §4.1): bots with fixed strategies play many games.
 * A strategy that wins more than 60% of games is a balance bug.
 *
 *   npm run bots -- --games 200 --seed 1
 */
import { content as baseContent } from '../src/content';
import {
  averageTrust,
  callAgency,
  agencyCost,
  hireFromAgency,
  createGame,
  createRng,
  getModifiers,
  isHarmful,
  limitSensations,
  listPurchases,
  reporterOf,
  startInvestigation,
  maxDistortion,
  placementSlots,
  playTurn,
  previewPublication,
  purchase,
  rankedPlacements,
  totalUpkeep,
  pairKey,
  rivalReaders,
  rivalTrust,
  setRivalWatch,
  withDifficulty,
  type Difficulty,
  answerOffer,
  offerOf,
  retainCost,
  templateOf,
  type CardInstance,
  type Decision,
  type Placement,
  type GameState,
  type Outcome,
  type Publication,
  type RngState,
} from '../src/sim';
import { next } from '../src/sim/rng';

// --difficulty easy|normal|hard (CONCEPT.md §4.6): every game runs on that level's balance.
const difficultyIndex = process.argv.indexOf('--difficulty');
const difficulty = (difficultyIndex >= 0 ? process.argv[difficultyIndex + 1] : 'normal') as Difficulty;
if (!baseContent.difficulties.some((d) => d.id === difficulty)) throw new Error(`Unknown difficulty ${difficulty}`);
const content = withDifficulty(baseContent, difficulty, process.argv.includes('save') && process.argv.includes('--mode') ? 'save' : 'destroy');
// --twist id: every game gets only this mid-game twist (to see what one twist does to the balance).
const twistIndex = process.argv.indexOf('--twist');
if (twistIndex >= 0) content.twists = content.twists.filter((t) => t.id === process.argv[twistIndex + 1]);
// --set key=json (any number): tries a balance value without editing balance.json.
process.argv.forEach((a, i) => {
  if (a !== '--set') return;
  const [key, value] = process.argv[i + 1].split(/=(.*)/s);
  if (!(key in content.balance)) throw new Error(`Unknown balance key ${key}`);
  (content.balance as unknown as Record<string, unknown>)[key] = JSON.parse(value);
});

interface Choice {
  distortion: 'none' | 'half' | 'max';
  placement: Placement;
  harmfulOnly: boolean;
}

type Strategy = (state: GameState, rng: RngState) => Choice | 'random' | Decision;

/**
 * Closest to a thoughtful player: targeted half-truths backed by true news. The number of
 * half-truths depends on reputation; good news is published only to rebuild it.
 */
function mixed(s: GameState): Decision {
  const mods = getModifiers(s, content);
  const preview = (card: CardInstance, distortion: number, placement: Placement = 1) =>
    previewPublication(s, content, mods, { cardUid: card.uid, placement, distortion });
  const harm = (card: CardInstance, distortion: number) => {
    const p = preview(card, distortion);
    return isHarmful(p.effect) ? p.impact : -1;
  };
  const trust = averageTrust(s, content);
  const lieSlots = trust < 35 ? 0 : trust < 45 ? 1 : 2;
  const publish: Publication[] = [];
  const used = new Set<number>();

  // A few half-truths pushed one step further; risky ones go in as briefs.
  const lies = s.hand
    .filter((c) => c.baseTruth <= 1 && !c.conflict)
    .map((c) => ({ c, d: 1 - c.baseTruth, score: harm(c, 1 - c.baseTruth) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, lieSlots);
  for (const lie of lies) {
    publish.push({ cardUid: lie.c.uid, placement: 0, distortion: lie.d });
    used.add(lie.c.uid);
  }
  // Every harmful truth goes out; good news only to rebuild trust. Conflict stories did not exist
  // in the original concept, so this bot leaves them out (see agitator).
  for (const c of s.hand.filter((x) => !used.has(x.uid) && !x.conflict && (harm(x, 0) > 0 || trust < 45))) {
    publish.push({ cardUid: c.uid, placement: 0, distortion: 0 });
  }
  // The strongest harmful stories take the front page and the article slots; risky lies stay briefs.
  const ranked = publish
    .map((p) => ({ p, impact: harm(s.hand.find((x) => x.uid === p.cardUid)!, p.distortion), lie: p.distortion > 0 }))
    .filter((x) => x.impact > 0 && !(x.lie && trust < 45))
    .sort((a, b) => b.impact - a.impact);
  const places = rankedPlacements(ranked.length, mods);
  ranked.forEach((x, i) => (x.p.placement = places[i]));
  return { publish };
}

/**
 * The thoughtful bot that also stirs up conflicts (CONCEPT.md §5.5): every story about two groups
 * is heated (half-truth) and put first; when reputation is low it calms them instead to win it back.
 */
function agitator(s: GameState): Decision {
  const d = mixed(s);
  const trust = averageTrust(s, content);
  // Same layout as the thoughtful bot; conflict stories are framed hot (or calm to win back
  // reputation) and the tensest one swaps onto the front page.
  const conflicts = s.hand.filter((c) => c.conflict).sort((x, y) => (s.tension[pairKeyOf(y)] ?? 0) - (s.tension[pairKeyOf(x)] ?? 0));
  for (const c of conflicts) {
    const distortion = trust < 35 ? -1 : Math.max(0, 1 - c.baseTruth);
    const p = d.publish.find((x) => x.cardUid === c.uid);
    if (p) p.distortion = distortion;
    else d.publish.push({ cardUid: c.uid, placement: 0, distortion });
  }
  // Story arcs are fanned one step towards the bad ending (CONCEPT.md §3.1а).
  for (const c of s.hand.filter((x) => templateOf(content, x.templateId).arc && trust >= 35)) {
    const distortion = Math.min(maxDistortion(c), 1);
    const p = d.publish.find((x) => x.cardUid === c.uid);
    if (p) p.distortion = Math.max(p.distortion, distortion);
    else d.publish.push({ cardUid: c.uid, placement: 0, distortion });
  }
  const top = conflicts[0] && d.publish.find((x) => x.cardUid === conflicts[0].uid);
  const front = d.publish.find((x) => x.placement === 2);
  if (top && top !== front) {
    if (front) front.placement = top.placement;
    top.placement = 2;
  }
  return d;
}

// ---------- Save mode (CONCEPT.md §8): defend the town from the rival paper ----------

/**
 * Lays out a defending issue: debunks of the rival first (the loudest rival story's on the front
 * page), then harmless true stories; conflict stories are calmed, frightening ones left out.
 */
function defend(s: GameState, debunkDistortion: (c: CardInstance) => number): Decision {
  const mods = getModifiers(s, content);
  const impact = (c: CardInstance, distortion: number) => previewPublication(s, content, mods, { cardUid: c.uid, placement: 2, distortion }).impact;
  const out: { p: Publication; score: number }[] = [];
  for (const c of s.hand) {
    if (c.debunk) {
      const d = debunkDistortion(c);
      out.push({ p: { cardUid: c.uid, placement: 0, distortion: d }, score: 10 + impact(c, d) });
    } else if (c.conflict) out.push({ p: { cardUid: c.uid, placement: 0, distortion: -1 }, score: impact(c, -1) });
    // A running story arc is calmed down «Без паники» to steer it to the good ending (CONCEPT.md §3.1а).
    else if (c.soft && templateOf(content, c.templateId).arc && averageTrust(s, content) >= 35) {
      out.push({ p: { cardUid: c.uid, placement: 0, distortion: -1 }, score: 6 + impact(c, -1) });
    }
    else if (c.baseTruth === 0) {
      const p = previewPublication(s, content, mods, { cardUid: c.uid, placement: 0, distortion: 0 });
      if (!isHarmful(p.effect)) out.push({ p: { cardUid: c.uid, placement: 0, distortion: 0 }, score: p.effect ? 5 + p.impact : p.impact });
    }
  }
  out.sort((a, b) => b.score - a.score);
  const places = rankedPlacements(out.length, mods);
  out.forEach((x, i) => (x.p.placement = places[i]));
  return { publish: out.map((x) => x.p) };
}

/** One reporter watches the rival (two once the newsroom has four) and brings debunks of its lies. */
function watchRival(s: GameState): void {
  const watchers = s.reporters.length >= 4 ? 2 : 1;
  s.reporters.forEach((id, i) => setRivalWatch(s, id, i < watchers));
}

/** Debunks the rival's lies with the plain truth. */
const defender: Strategy = (s) => {
  watchRival(s);
  return defend(s, () => 0);
};
/** The same, but blows the debunks up («„…“ — «Набат» врёт по заказу») while it is trusted. */
const liarDefender: Strategy = (s) => {
  watchRival(s);
  return defend(s, (c) => (averageTrust(s, content) >= 40 ? maxDistortion(c) : 0));
};
/**
 * The defender that also soothes bad true news («Без паники», a half-truth) while it is trusted,
 * and goes all the way («Всё хорошо!») only when very trusted.
 */
const soother: Strategy = (s) => {
  watchRival(s);
  const d = defend(s, () => 0);
  const trust = averageTrust(s, content);
  for (const c of s.hand) {
    if (!c.soft || c.baseTruth !== 0 || trust < 40 || d.publish.some((p) => p.cardUid === c.uid)) continue;
    d.publish.push({ cardUid: c.uid, placement: 0, distortion: trust >= 55 ? -2 : -1 });
  }
  return d;
};

/** Prints only harmless truth and never answers the rival. */
const bystander: Strategy = (s) => {
  const d = defend(s, () => 0);
  d.publish = d.publish.filter((p) => !s.hand.find((x) => x.uid === p.cardUid)!.debunk);
  return d;
};

const saveStrategies: Record<string, Strategy> = { defender, liarDefender, soother, bystander, destroyer: mixed };

const pairKeyOf = (c: CardInstance) => pairKey(content, c.conflict![0], c.conflict![1]);

/** The thoughtful bot keeps one reporter digging dirt on the biggest group. */
function manageInvestigations(s: GameState): void {
  if (s.investigations.length || s.reporters.length < 2) return;
  const r = [...s.reporters].sort((a, b) => reporterOf(content, b).skills.nose - reporterOf(content, a).skills.nose)[0];
  startInvestigation(s, content, r, 'workers');
}

const strategies: Record<string, Strategy> = {
  mixed,
  agitator,
  honest: () => ({ distortion: 'none', placement: 0, harmfulOnly: false }),
  liar: () => ({ distortion: 'max', placement: 2, harmfulOnly: true }),
  moderate: () => ({ distortion: 'half', placement: 1, harmfulOnly: true }),
  trustThenLie: (s) =>
    averageTrust(s, content) >= 50
      ? { distortion: 'max', placement: 2, harmfulOnly: true }
      : { distortion: 'none', placement: 0, harmfulOnly: false },
  random: () => 'random',
};

function distortionFor(card: CardInstance, mode: Choice['distortion']): number {
  if (mode === 'none') return 0;
  if (mode === 'half') return Math.min(1, maxDistortion(card));
  return maxDistortion(card);
}

function decide(s: GameState, strategy: Strategy, rng: RngState): Decision {
  const mods = getModifiers(s, content);
  const choice = strategy(s, rng);
  if (typeof choice === 'object' && 'publish' in choice) return choice;
  const publish: Publication[] = [];

  if (choice === 'random') {
    const slots = placementSlots(mods);
    const used = [0, 0, 0];
    for (const card of s.hand) {
      if (next(rng) < 0.3) continue;
      const distortion = Math.floor(next(rng) * (maxDistortion(card) + 1));
      let placement = Math.floor(next(rng) * 3) as Placement;
      if (used[placement] >= slots[placement]) placement = 0;
      used[placement]++;
      publish.push({ cardUid: card.uid, placement, distortion });
    }
    return { publish };
  }

  const candidates = s.hand
    .filter((card) => choice.distortion !== 'none' || card.baseTruth === 0)
    .map((card) => {
      const pub: Publication = { cardUid: card.uid, placement: choice.placement, distortion: distortionFor(card, choice.distortion) };
      return { pub, preview: previewPublication(s, content, mods, pub) };
    })
    .filter((x) => !choice.harmfulOnly || isHarmful(x.preview.effect))
    .sort((a, b) => b.preview.impact - a.preview.impact);

  // Everything goes out; the strongest stories take the slots up to the strategy's placement.
  const places =
    choice.placement === 0
      ? candidates.map(() => 0 as Placement)
      : rankedPlacements(candidates.length, choice.placement === 2 ? mods : { ...mods, frontPageSlots: 0 });
  candidates.forEach((x, i) => publish.push({ ...x.pub, placement: places[i] }));
  return { publish };
}

/**
 * Buys in priority order and saves up for the next priority item instead of spending on cheap extras.
 * A number in the plan means "have this many reporters": the bot pays the HR agency and hires the
 * best candidate it offers.
 */
const buyOrder: (string | number)[] = [2, 'kiosk_1', 'sports_page', 'newspaper_quality_1', 3, 'kiosk_2', 'editorial_1', 'youth_insert', 4, 'kiosk_3', 'subscription', 5, 'lawyers', 'kiosk_4'];

function shop(s: GameState): void {
  for (;;) {
    const reserve = totalUpkeep(s, content) * 3;
    const options = listPurchases(s, content).filter((p) => p.unlocked);
    const step = buyOrder.find((x) => (typeof x === 'number' ? s.reporters.length < x : options.some((p) => p.id === x)));
    if (typeof step === 'number') {
      // Enough for the fee and a typical hire on top of the reserve.
      if (s.money - agencyCost(s, content) - 200 < reserve) return;
      const offer = callAgency(s, content);
      const best = offer.filter((id) => reporterOf(content, id).hireCost <= s.money).sort((a, b) => score(b) - score(a))[0];
      if (best) hireFromAgency(s, content, best);
      continue;
    }
    const option = step !== undefined ? options.find((p) => p.id === step) : [...options].sort((a, b) => a.cost - b.cost)[0];
    if (!option || !option.affordable || s.money - option.cost < reserve) return;
    purchase(s, content, option.id);
  }
}

/** How good a candidate looks to the bot: luck and nose. */
const score = (id: string) => reporterOf(content, id).skills.luck + 0.1 * reporterOf(content, id).skills.nose;

interface Result {
  outcome: Outcome;
  turns: number;
  cityIndex: number;
}

/**
 * Offers with a catch (CONCEPT.md §3.5а): the thoughtful bots take the kompromat while trusted, the
 * defenders take the mayor's subsidy (they print no bad news about power anyway); the rest say no.
 */
function answerOffers(s: GameState, strategy: Strategy): void {
  if (!s.offer) return;
  const kind = offerOf(content, s.offer.id).kind;
  const trust = averageTrust(s, content);
  const thoughtful = strategy === mixed || strategy === agitator;
  const defending = strategy === defender || strategy === liarDefender || strategy === soother;
  // A lured reporter is kept when the money allows.
  if (kind === 'poach') return void answerOffer(s, content, (thoughtful || defending) && s.money >= 2 * retainCost(content, s.offer.reporterId!));
  answerOffer(s, content, (thoughtful && kind === 'kompromat' && trust >= 45) || (defending && ((kind === 'subsidy' && trust >= 45) || kind === 'kompromat')));
}

function playGame(seed: number, strategy: Strategy, trace = false): Result {
  const s = createGame(content, seed, saveMode ? 'save' : 'destroy', difficulty);
  const rng = createRng(seed ^ 0x5bd1e995);
  while (!s.outcome) {
    if ((strategy === mixed || strategy === agitator) && !noInvestigations) manageInvestigations(s);
    // The thoughtful bots keep an eye on the rival with one reporter not digging dirt.
    if ((strategy === mixed || strategy === agitator) && s.rival && !s.rival.closed) {
      const free = s.reporters.filter((id) => !s.investigations.some((x) => x.reporterId === id));
      s.reporters.forEach((id) => setRivalWatch(s, id, id === free[free.length - 1] && s.reporters.length >= 2));
    }
    answerOffers(s, strategy);
    const d = decide(s, strategy, rng);
    limitSensations(s, content, d.publish);
    const r = playTurn(s, content, d);
    if (!s.outcome) shop(s);
    if (trace) {
      const m = r.metricsAfter;
      const rivalInfo = s.rival ? ` | rival readers ${rivalReaders(s)} trust ${rivalTrust(s).toFixed(0)}${s.rival.closed ? ' CLOSED' : ''}` : '';
      const trust = `${averageTrust(s, content).toFixed(0)}${rivalInfo} published ${r.publications.length} readers ${r.readers.after} (-${r.readers.lost} +${r.readers.gained}) [${s.ownedChannels.join(',')}]`;
      console.log(
        `T${r.turn} index ${m.cityIndex.toFixed(0)} | pop ${m.activeResidents} emp ${m.employment.toFixed(2)} ` +
          `eco ${m.economy.toFixed(2)} mood ${m.mood.toFixed(2)} order ${m.order.toFixed(2)} | ` +
          `money ${s.money} | trust ${trust}`,
      );
      for (const p of r.publications) {
        console.log(
          `    ${p.title} (truth ${p.truth}, placement ${p.placement}) reached ${p.reached} believed ${p.believed} ` +
            `${JSON.stringify(p.effects)}${p.exposed ? ' EXPOSED' : ''}`,
        );
      }
      for (const n of [...r.notes, ...r.exposures.map((x) => `exposed (turn ${x.turn}): ${x.title} -${x.trustLoss.toFixed(1)} trust`)]) console.log(`    * ${n}`);
    }
  }
  if (trace) console.log(s.outcome, 'upgrades:', s.upgrades.join(', '));
  return { outcome: s.outcome, turns: s.turn, cityIndex: s.metrics.cityIndex };
}

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

const games = arg('games', 200);
// --mode save: the save mode and its strategies (CONCEPT.md §8).
const saveMode = process.argv.includes('save') && process.argv.includes('--mode');
// --no-investigations: measure how much investigations add to the thoughtful bot.
const noInvestigations = process.argv.includes('--no-investigations');
const baseSeed = arg('seed', 1);

// --trace <strategy>: print one game turn by turn instead of the summary table.
const traceIndex = process.argv.indexOf('--trace');
if (traceIndex >= 0) {
  const name = process.argv[traceIndex + 1];
  const strategy = (saveMode ? saveStrategies : strategies)[name];
  if (!strategy) throw new Error(`Unknown strategy ${name}; use one of ${Object.keys(saveMode ? saveStrategies : strategies).join(', ')}`);
  playGame(baseSeed, strategy, true);
  process.exit(0);
}

const rows = [];
let flagged = false;

for (const [name, strategy] of Object.entries(saveMode ? saveStrategies : strategies)) {
  const results = Array.from({ length: games }, (_, i) => playGame(baseSeed + i, strategy));
  const wins = results.filter((r) => r.outcome.result === 'win').length;
  const reasons: Record<string, number> = {};
  for (const r of results) reasons[r.outcome.reason] = (reasons[r.outcome.reason] ?? 0) + 1;
  const winRate = wins / games;
  if (winRate > 0.6) flagged = true;
  rows.push({
    strategy: name,
    'win %': (winRate * 100).toFixed(0),
    'avg turns': (results.reduce((s, r) => s + r.turns, 0) / games).toFixed(1),
    'avg city index': (results.reduce((s, r) => s + r.cityIndex, 0) / games).toFixed(0),
    outcomes: Object.entries(reasons)
      .map(([k, v]) => `${k} ${v}`)
      .join(', '),
  });
}

console.table(rows);
if (flagged) {
  console.log('\nWARNING: a strategy wins more than 60% of games — balance bug (CONCEPT.md §4.1).');
  process.exitCode = 1;
}
