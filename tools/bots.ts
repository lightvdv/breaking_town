/**
 * Headless balance check (CONCEPT.md §4.1): bots with fixed strategies play many games.
 * A strategy that wins more than 60% of games is a balance bug.
 *
 *   npm run bots -- --games 200 --seed 1
 */
import { content } from '../src/content';
import {
  averageTrust,
  createGame,
  createRng,
  getModifiers,
  isHarmful,
  listPurchases,
  reporterOf,
  startInvestigation,
  maxDistortion,
  playTurn,
  previewPublication,
  purchase,
  totalUpkeep,
  type CardInstance,
  type Decision,
  type Placement,
  type GameState,
  type Outcome,
  type Publication,
  type RngState,
} from '../src/sim';
import { next } from '../src/sim/rng';

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
    .filter((c) => c.baseTruth <= 1)
    .map((c) => ({ c, d: 1 - c.baseTruth, score: harm(c, 1 - c.baseTruth) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, lieSlots);
  for (const lie of lies) {
    publish.push({ cardUid: lie.c.uid, placement: trust < 45 ? 0 : 1, distortion: lie.d });
    used.add(lie.c.uid);
  }
  // Every harmful truth goes out; good news only to rebuild trust.
  for (const c of s.hand.filter((x) => !used.has(x.uid) && (harm(x, 0) > 0 || trust < 45))) {
    publish.push({ cardUid: c.uid, placement: 1, distortion: 0 });
  }
  // The strongest harmful story takes the front page.
  const best = publish
    .map((p) => ({ p, impact: harm(s.hand.find((x) => x.uid === p.cardUid)!, p.distortion) }))
    .sort((a, b) => b.impact - a.impact)
    .slice(0, mods.frontPageSlots);
  for (const { p, impact } of best) if (impact > 0) p.placement = 2;
  return { publish };
}

/** The thoughtful bot keeps one reporter digging dirt on the biggest group. */
function manageInvestigations(s: GameState): void {
  if (s.investigations.length || s.reporters.length < 2) return;
  const r = [...s.reporters].sort((a, b) => reporterOf(content, b).skills.nose - reporterOf(content, a).skills.nose)[0];
  startInvestigation(s, content, r, 'workers');
}

const strategies: Record<string, Strategy> = {
  mixed,
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
    let front = 0;
    for (const card of s.hand) {
      if (next(rng) < 0.3) continue;
      const distortion = Math.floor(next(rng) * (maxDistortion(card) + 1));
      let placement = Math.floor(next(rng) * 3) as Placement;
      if (placement === 2 && front >= mods.frontPageSlots) placement = 1;
      if (placement === 2) front++;
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

  // Everything goes out; only the strongest story keeps a front-page placement.
  candidates.forEach((x, i) => publish.push({ ...x.pub, placement: x.pub.placement === 2 && i >= mods.frontPageSlots ? 1 : x.pub.placement }));
  return { publish };
}

/** Buys in priority order and saves up for the next priority item instead of spending on cheap extras. */
const buyOrder = ['gusev', 'newspaper_quality_1', 'radio', 'volkova', 'editorial_1', 'tv', 'sokolov', 'social', 'editorial_2', 'lawyers'];

function shop(s: GameState): void {
  for (;;) {
    const reserve = totalUpkeep(s, content) * 3;
    const options = listPurchases(s, content).filter((p) => p.unlocked);
    const priority = buyOrder.map((id) => options.find((p) => p.id === id)).find((p) => p !== undefined);
    // Extra reporters cost salary every turn, so only planned hires are made.
    const option = priority ?? [...options].filter((p) => p.kind !== 'reporter').sort((a, b) => a.cost - b.cost)[0];
    if (!option || !option.affordable || s.money - option.cost < reserve) return;
    purchase(s, content, option.id);
  }
}

interface Result {
  outcome: Outcome;
  turns: number;
  cityIndex: number;
}

function playGame(seed: number, strategy: Strategy, trace = false): Result {
  const s = createGame(content, seed);
  const rng = createRng(seed ^ 0x5bd1e995);
  while (!s.outcome) {
    if (strategy === mixed && !noInvestigations) manageInvestigations(s);
    const r = playTurn(s, content, decide(s, strategy, rng));
    if (!s.outcome) shop(s);
    if (trace) {
      const m = r.metricsAfter;
      const trust = `${averageTrust(s, content).toFixed(0)} published ${r.publications.length} readers ${r.readers.after} (-${r.readers.lost} +${r.readers.gained}) [${s.ownedChannels.join(',')}]`;
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
// --no-investigations: measure how much investigations add to the thoughtful bot.
const noInvestigations = process.argv.includes('--no-investigations');
const baseSeed = arg('seed', 1);

// --trace <strategy>: print one game turn by turn instead of the summary table.
const traceIndex = process.argv.indexOf('--trace');
if (traceIndex >= 0) {
  const name = process.argv[traceIndex + 1];
  const strategy = strategies[name];
  if (!strategy) throw new Error(`Unknown strategy ${name}; use one of ${Object.keys(strategies).join(', ')}`);
  playGame(baseSeed, strategy, true);
  process.exit(0);
}

const rows = [];
let flagged = false;

for (const [name, strategy] of Object.entries(strategies)) {
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
