/**
 * Headless balance check (CONCEPT.md §4.1): bots with fixed strategies play many games.
 * A strategy that wins more than 60% of games is a balance bug.
 *
 *   npm run bots -- --games 200 --seed 1
 */
import { content } from '../src/content';
import {
  averageTrust,
  cardTruth,
  createGame,
  createRng,
  getModifiers,
  isHarmful,
  listPurchases,
  templateOf,
  maxDistortion,
  playTurn,
  previewPublication,
  purchase,
  totalUpkeep,
  type CardInstance,
  type Decision,
  type Framing,
  type GameState,
  type Outcome,
  type Publication,
  type RngState,
} from '../src/sim';
import { next } from '../src/sim/rng';

interface Choice {
  distortion: 'none' | 'half' | 'max';
  framing: Framing;
  harmfulOnly: boolean;
}

type Strategy = (state: GameState, rng: RngState) => Choice | 'random' | Decision;

/**
 * Closest to a thoughtful player: targeted half-truths backed by true news. The number of
 * half-truths depends on the exposure meter; good news is published only to rebuild trust.
 */
function mixed(s: GameState): Decision {
  const mods = getModifiers(s, content);
  const preview = (card: CardInstance, distortion: number) =>
    previewPublication(s, content, mods, { cardUid: card.uid, framing: 1, distortion });
  const harm = (card: CardInstance, distortion: number) => {
    const p = preview(card, distortion);
    return isHarmful(p.effect) ? p.impact : -1;
  };
  const trust = averageTrust(s, content);
  const lieSlots =
    trust < 35 || s.exposure > 60 ? 0 : s.exposure > 30 ? 1 : Math.max(1, mods.publishPerTurn - 1);
  const publish: Publication[] = [];
  const used = new Set<number>();

  const lies = s.hand
    .filter((c) => c.baseTruth <= 1)
    .map((c) => ({ c, d: 1 - c.baseTruth, score: harm(c, 1 - c.baseTruth) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, lieSlots);
  // Loud framing only for stories worth it, so the outlet does not "cry wolf".
  const framingFor = (card: CardInstance, distortion: number): Framing => {
    if (s.hype > 40) return 0;
    const harmful = isHarmful(preview(card, distortion).effect);
    return card.tier >= 3 && harmful ? 2 : card.tier >= 2 ? 1 : 0;
  };
  for (const lie of lies) {
    publish.push({ cardUid: lie.c.uid, framing: framingFor(lie.c, lie.d), distortion: lie.d });
    used.add(lie.c.uid);
  }

  const truths = s.hand
    .filter((c) => c.baseTruth === 0 && !used.has(c.uid))
    .filter((c) => harm(c, 0) > 0 || trust < 45)
    .sort((a, b) => harm(b, 0) - harm(a, 0));
  for (const c of truths) {
    if (publish.length >= mods.publishPerTurn) break;
    publish.push({ cardUid: c.uid, framing: framingFor(c, 0), distortion: 0 });
  }
  return { publish };
}

const strategies: Record<string, Strategy> = {
  mixed,
  honest: () => ({ distortion: 'none', framing: 0, harmfulOnly: false }),
  liar: () => ({ distortion: 'max', framing: 2, harmfulOnly: true }),
  moderate: () => ({ distortion: 'half', framing: 1, harmfulOnly: true }),
  trustThenLie: (s) =>
    averageTrust(s, content) >= 50
      ? { distortion: 'max', framing: 2, harmfulOnly: true }
      : { distortion: 'none', framing: 0, harmfulOnly: false },
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
    const cards = [...s.hand].sort(() => next(rng) - 0.5).slice(0, mods.publishPerTurn);
    for (const card of cards) {
      const distortion = Math.floor(next(rng) * (maxDistortion(card) + 1));
      const harmful = isHarmful(templateOf(content, card.templateId).effects[cardTruth(card, distortion)]);
      publish.push({ cardUid: card.uid, framing: Math.floor(next(rng) * (harmful ? 3 : 2)) as Framing, distortion });
    }
    return { publish };
  }

  const candidates = s.hand
    .filter((card) => choice.distortion !== 'none' || card.baseTruth === 0)
    .map((card) => {
      const pub: Publication = { cardUid: card.uid, framing: choice.framing, distortion: distortionFor(card, choice.distortion) };
      return { pub, preview: previewPublication(s, content, mods, pub) };
    })
    .filter((x) => !choice.harmfulOnly || isHarmful(x.preview.effect))
    .sort((a, b) => b.preview.impact - a.preview.impact);

  for (const x of candidates.slice(0, mods.publishPerTurn)) publish.push(x.pub);
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
    const r = playTurn(s, content, decide(s, strategy, rng));
    if (!s.outcome) shop(s);
    if (trace) {
      const m = r.metricsAfter;
      const trust = `${averageTrust(s, content).toFixed(0)} hype ${s.hype.toFixed(0)} readers ${r.readers.after} (-${r.readers.lost} +${r.readers.gained}) [${s.ownedChannels.join(',')}]`;
      console.log(
        `T${r.turn} index ${m.cityIndex.toFixed(0)} | pop ${m.activeResidents} emp ${m.employment.toFixed(2)} ` +
          `eco ${m.economy.toFixed(2)} mood ${m.mood.toFixed(2)} order ${m.order.toFixed(2)} | ` +
          `money ${s.money} exposure ${s.exposure.toFixed(0)} | trust ${trust}`,
      );
      for (const p of r.publications) {
        console.log(
          `    ${p.title} (truth ${p.truth}, framing ${p.framing}) reached ${p.reached} believed ${p.believed} ` +
            `${JSON.stringify(p.effects)}${p.exposed ? ' EXPOSED' : ''}`,
        );
      }
      for (const n of [...r.notes, ...r.lateExposures.map((t) => `late exposure: ${t}`)]) console.log(`    * ${n}`);
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
