/**
 * Headless balance check (CONCEPT.md §4.1): bots with fixed strategies play many games.
 * A strategy that wins more than 60% of games is a balance bug.
 *
 *   npm run bots -- --games 200 --seed 1
 */
import { content as baseContent } from '../src/content';
import {
  averageTrust,
  startHunt,
  callAgency,
  agencyBlock,
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
  setReporterTopics,
  rankedPlacements,
  pairKey,
  withDifficulty,
  withLength,
  withTown,
  powerMul,
  type Difficulty,
  type GameLength,
  answerOffer,
  offerOf,
  retainBlock,
  retainCost,
  templateOf,
  type CardInstance,
  type Decision,
  type Placement,
  type GameState,
  type Outcome,
  type Publication,
  type RngState,
  cashBlock,
  cashMoves,
  useCash,
  goalOf,
  refreshShop,
  refreshBlock,
} from '../src/sim';
import { next } from '../src/sim/rng';

// --difficulty easy|normal|hard (CONCEPT.md §4.6): every game runs on that level's balance.
const difficultyIndex = process.argv.indexOf('--difficulty');
const difficulty = (difficultyIndex >= 0 ? process.argv[difficultyIndex + 1] : 'normal') as Difficulty;
if (!baseContent.difficulties.some((d) => d.id === difficulty)) throw new Error(`Unknown difficulty ${difficulty}`);
const content = withDifficulty(baseContent, difficulty, 'destroy');
// --town id: every game is played in this campaign town (CONCEPT.md §9).
const townIndex = process.argv.indexOf('--town');
const town = townIndex >= 0 ? process.argv[townIndex + 1] : null;
// --length short (CONCEPT.md §4.6а): every game is a short one.
const lengthIndex = process.argv.indexOf('--length');
const length = (lengthIndex >= 0 ? process.argv[lengthIndex + 1] : 'full') as GameLength;
if (!baseContent.lengths.some((x) => x.id === length)) throw new Error(`Unknown length ${length}`);
Object.assign(content, withLength(content, length, difficulty));
// --town random: every game in its own generated town `gen-<seed>` (CONCEPT.md §9.5); a town's pass is the difficulty.
// The content before the town is taken at the first game, after --set.
let passContent: typeof content | null = null;
const sideMode = 'destroy';
// --raw: a generated town without its calibration; --power x: its news stronger or weaker (tools/calibrate.ts).
if (process.argv.includes('--raw')) content.townCalibration = { size: {}, way: {}, rule: {}, goal: {}, combos: {} };
if (town && town !== 'random') Object.assign(content, withTown(content, town, sideMode, difficulty));
const powerIndex = process.argv.indexOf('--power');
if (powerIndex >= 0) {
  const b = content.balance as unknown as Record<string, number>;
  for (const [key, mul] of Object.entries(powerMul(Number(process.argv[powerIndex + 1])))) b[key] *= mul!;
}
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

// --upgrade id.effect=json (any number): tries an upgrade's effect without editing upgrades.json.
process.argv.forEach((a, i) => {
  if (a !== '--upgrade') return;
  const [path, value] = process.argv[i + 1].split(/=(.*)/s);
  const [id, key] = path.split('.');
  const u = content.upgrades.find((x) => x.id === id);
  if (!u) throw new Error(`Unknown upgrade ${id}`);
  (u.effects as unknown as Record<string, unknown>)[key] = JSON.parse(value);
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

const pairKeyOf = (c: CardInstance) => pairKey(content, c.conflict![0], c.conflict![1]);

/** The thoughtful bot keeps one reporter digging dirt on the biggest group. */
/**
 * The thoughtful bots' attack beyond the issue (CONCEPT.md §3.6а): they hound the biggest
 * workplace from the third day.
 */
function attack(s: GameState): void {
  if (!s.hunt && s.turn >= 3) {
    // The town's goal picks the target (CONCEPT.md §9.2): the building to close, the police for a gang.
    const goal = goalOf(content);
    const wanted = goal.type === 'close' ? goal.building : goal.type === 'gang' ? 'police' : null;
    const open = s.buildings.filter((x) => x.open && x.jobs > 0 && x.type !== 'factCheckers');
    const target = (wanted ? open.filter((x) => x.type === wanted) : []).concat(open.sort((a, b) => b.jobs - a.jobs))[0];
    if (target) startHunt(s, target.id);
  }
}

function manageInvestigations(s: GameState): void {
  if (s.investigations.length || s.reporters.length < 2) return;
  const r = [...s.reporters].sort((a, b) => reporterOf(content, b).skills.nose - reporterOf(content, a).skills.nose)[0];
  const goal = goalOf(content);
  // The strongest defender first (CONCEPT.md §5.7): dirt on them takes their brake off the paper.
  const defender = [...s.defenders].sort((a, b) => b.level - a.level)[0];
  startInvestigation(s, content, r, defender ? defender.id : goal.type === 'drive' ? goal.group : 'workers');
}

/**
 * The crime path (CONCEPT.md §5.6): the thoughtful bot whose reporters chase crime, which buys the
 * crime desk first and hounds the police station; it prints everything else the way `mixed` does.
 */
function criminal(s: GameState): Decision {
  for (const id of s.reporters) if (!(s.reporterTopics[id] ?? []).includes('crime')) setReporterTopics(s, content, id, ['crime']);
  const desk = listPurchases(s, content).find((p) => p.id === 'crime_desk' && p.affordable && p.unlocked);
  if (desk) purchase(s, content, desk.id);
  if (!s.hunt && s.turn >= 3) {
    const police = s.buildings.find((x) => x.type === 'police' && x.open);
    if (police) startHunt(s, police.id);
  }
  return mixed(s);
}

const strategies: Record<string, Strategy> = {
  mixed,
  agitator,
  criminal,
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
 * Takes the board's cards in priority order (CONCEPT.md §3.5б: one card of three, for free) and fills
 * every free seat of the newsroom with the best candidate of the day's agency search (CONCEPT.md §3.3).
 */
const buyOrder: string[] = ['kiosk_1', 'sports_page', 'newspaper_quality_1', 'kiosk_2', 'editorial_1', 'youth_insert', 'kiosk_3', 'subscription', 'kiosk_4'];
// Cards that work against the bot's play; abilities it would not use.
const avoid: Record<GameState['mode'], string[]> = {
  destroy: ['paid_subscription', 'mole'],
};
// --avoid id,id: the bots never buy these (to measure what an upgrade adds).
// --no-cash: the thoughtful bots leave the dirty tricks alone.
const noCash = process.argv.includes('--no-cash');
const avoidIndex = process.argv.indexOf('--avoid');
if (avoidIndex >= 0) for (const id of process.argv[avoidIndex + 1].split(',')) avoid.destroy.push(id);

// Directions a strategy plays for: their cards are taken first.
const onPath = (strategy: Strategy): string[] => (strategy === mixed ? ['trust', 'yellow', 'staff'] : strategy === agitator ? ['yellow', 'hunt', 'split'] : strategy === criminal ? ['crime', 'hunt'] : []);
// Directions a strategy has no use for: a thoughtful player would not take their cards for free either.
const offPath = (strategy: Strategy): string[] => (strategy === mixed ? ['hunt', 'split', 'crime'] : strategy === agitator ? ['crime'] : strategy === criminal ? ['split'] : []);

function shop(s: GameState, strategy: Strategy): void {
  const skip = offPath(strategy);
  const useful = (id: string) => {
    const tags = content.upgrades.find((u) => u.id === id)?.tags ?? [];
    return !tags.length || tags.some((t) => !skip.includes(t));
  };
  // Every free seat gets the best candidate of the day's search.
  if (!agencyBlock(s, content)) {
    const best = callAgency(s, content).sort((a, b) => score(b) - score(a))[0];
    if (best) hireFromAgency(s, content, best);
  }
  for (;;) {
    const options = listPurchases(s, content).filter((p) => p.unlocked && !avoid[s.mode].includes(p.id) && !content.upgrades.find((u) => u.id === p.id)?.ability && !content.upgrades.find((u) => u.id === p.id)?.cash && useful(p.id));
    const step = buyOrder.find((x) => options.some((p) => p.id === x));
    // Nothing of its plan among the board's three: it asks for three more — the first request is free,
    // a second only while well trusted (CONCEPT.md §3.5б «Запрос вне срока»).
    const wanted = buyOrder.some((x) => !s.upgrades.includes(x));
    const extras = s.shopExtras ?? 0;
    if (step === undefined && wanted && s.shopOffer.length && !s.shopPicks && extras < 2 && !refreshBlock(s, content) && (extras === 0 || averageTrust(s, content) >= 55)) {
      refreshShop(s, content);
      continue;
    }
    // One card of the board's three is taken (CONCEPT.md §3.5б): the rarest — they are the strongest.
    const rank = (id: string) => ['common', 'rare', 'legendary'].indexOf(content.upgrades.find((u) => u.id === id)?.rarity ?? 'common');
    // Without a planned card the bot takes one of its own path first, then the rarest.
    const mine = (id: string) => ((content.upgrades.find((u) => u.id === id)?.tags ?? []).some((t) => onPath(strategy).includes(t)) ? 1 : 0);
    const option = step !== undefined ? options.find((p) => p.id === step) : [...options].filter((p) => p.affordable).sort((a, b) => mine(b.id) - mine(a.id) || rank(b.id) - rank(a.id))[0];
    if (!option || !option.affordable) return;
    purchase(s, content, option.id);
  }
}

/**
 * «Грязные приёмы» (CONCEPT.md §3.5в): the thoughtful bots use the tricks that need no judgement —
 * today only the ad campaign, which costs nothing but its wait (the bots take no trick cards).
 */
function spendCash(s: GameState): void {
  for (const def of cashMoves(s, content)) if (def.id === 'ads' && !cashBlock(s, content, def.id)) useCash(s, content, def.id);
}

/** How good a candidate looks to the bot: luck and nose. */
const score = (id: string) => reporterOf(content, id).skills.luck + 0.1 * reporterOf(content, id).skills.nose;

interface Result {
  outcome: Outcome;
  turns: number;
  cityIndex: number;
  /** The town's goal, «close:factory», «stage:30»… */
  goal: string;
}

/**
 * Offers with a catch (CONCEPT.md §3.5а): the thoughtful bots take the kompromat while trusted; the rest say no.
 */
function answerOffers(s: GameState, strategy: Strategy): void {
  if (!s.offer) return;
  const kind = offerOf(content, s.offer.id).kind;
  const trust = averageTrust(s, content);
  const thoughtful = strategy === mixed || strategy === agitator;
  // A lured reporter is kept with a voucher, or for reputation while well trusted.
  if (kind === 'poach') return void answerOffer(s, content, thoughtful && !retainBlock(s, content) && ('voucher' in retainCost(s, content) || trust >= 45));
  answerOffer(s, content, thoughtful && kind === 'kompromat' && trust >= 45);
}

// --collection starter|all|max (CONCEPT.md §3.5б): the player's cards — a newcomer's starter set (the
// default, which the balance targets are for), every card at level 1, or every card at the top level.
const collectionIndex = process.argv.indexOf('--collection');
const collectionKind = collectionIndex >= 0 ? process.argv[collectionIndex + 1] : 'starter';
if (!['starter', 'all', 'max'].includes(collectionKind)) throw new Error(`Unknown collection ${collectionKind}`);
const botCollection: Record<string, number> = Object.fromEntries(
  baseContent.upgrades.filter((u) => u.rarity && (collectionKind !== 'starter' || u.starter)).map((u) => [u.id, collectionKind === 'max' ? 3 : 1]),
);

function playGame(seed: number, strategy: Strategy, trace = false): Result {
  const townId = town === 'random' ? `gen-${seed}` : town;
  if (town === 'random') {
    passContent ??= { ...content };
    Object.assign(content, withTown(passContent, townId!, sideMode, difficulty));
  }
  const s = createGame(content, seed, 'destroy', difficulty, { ...(townId ? { town: townId } : {}), length, collection: botCollection });
  const rng = createRng(seed ^ 0x5bd1e995);
  while (!s.outcome) {
    if ((strategy === mixed || strategy === agitator) && !noInvestigations) manageInvestigations(s);
    answerOffers(s, strategy);
    // The hunt is the agitator's: `mixed` plays the original concept.
    if (strategy === agitator && !noAttack) attack(s);
    if ((strategy === mixed || strategy === agitator) && !noCash) spendCash(s);
    const d = decide(s, strategy, rng);
    limitSensations(s, content, d.publish);
    const r = playTurn(s, content, d);
    if (!s.outcome) shop(s, strategy);
    if (trace) {
      const m = r.metricsAfter;
      const trust = `${averageTrust(s, content).toFixed(0)} published ${r.publications.length} readers ${r.readers.after} (-${r.readers.lost} +${r.readers.gained}) [${s.ownedChannels.join(',')}]`;
      console.log(
        `T${r.turn} index ${m.cityIndex.toFixed(0)} | pop ${m.activeResidents} emp ${m.employment.toFixed(2)} ` +
          `eco ${m.economy.toFixed(2)} mood ${m.mood.toFixed(2)} order ${m.order.toFixed(2)} | ` +
          `seats ${s.reporters.length}/${s.seats} | trust ${trust}`,
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
  if (process.env.BOT_STATS) console.error('STAT', strategy.name, s.buildings.filter((x) => !x.open && x.jobs > 0).map((x) => x.type).join(','), s.arcsDone.includes('street_gang') ? 'gang' : '', s.crimeBoost > 0 ? 'gangStayed' : '');
  const g = goalOf(content);
  const goal = `${g.type}${g.type === 'stage' ? `:${g.index}` : g.type === 'close' ? `:${g.building}` : g.type === 'drive' ? `:${g.group}` : ''}`;
  return { outcome: s.outcome, turns: s.turn, cityIndex: s.metrics.cityIndex, goal };
}

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

const games = arg('games', 200);
// --no-investigations: measure how much investigations add to the thoughtful bot.
const noInvestigations = process.argv.includes('--no-investigations');
const noAttack = process.argv.includes('--no-attack');
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

// --only name: one strategy; --json: its wins as one JSON line (tools/calibrate.ts).
const onlyIndex = process.argv.indexOf('--only');
const only = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null;
for (const [name, strategy] of Object.entries(strategies)) {
  if (only && name !== only) continue;
  const results = Array.from({ length: games }, (_, i) => playGame(baseSeed + i, strategy));
  const wins = results.filter((r) => r.outcome.result === 'win').length;
  const reasons: Record<string, number> = {};
  for (const r of results) reasons[r.outcome.reason] = (reasons[r.outcome.reason] ?? 0) + 1;
  const winRate = wins / games;
  if (winRate > 0.6) flagged = true;
  // BOT_GOALS=1: wins by the town's goal (CONCEPT.md §9.2), for the campaign and the generator.
  if (process.env.BOT_GOALS) {
    const by: Record<string, [number, number]> = {};
    for (const r of results) {
      by[r.goal] ??= [0, 0];
      by[r.goal][1]++;
      if (r.outcome.result === 'win') by[r.goal][0]++;
    }
    console.log(name, Object.entries(by).map(([k, [w, n]]) => `${k} ${w}/${n}`).join(', '));
  }
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

if (process.argv.includes('--json')) console.log(JSON.stringify(rows.map((r) => ({ strategy: r.strategy, win: Number(r['win %']) }))));
else console.table(rows);
if (flagged) {
  console.log('\nWARNING: a strategy wins more than 60% of games — balance bug (CONCEPT.md §4.1).');
  process.exitCode = 1;
}
