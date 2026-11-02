/**
 * Town calibration (CONCEPT.md §9.5). Measures with the `agitator` bot how much each choice of a
 * generated town changes its chances against the default town, and writes the strength of the news
 * that brings it back to `src/content/townCalibration.json`. Rerun after balance or content changes:
 *
 *   npx tsx tools/calibrate.ts          # measure and write
 *   npx tsx tools/calibrate.ts --combos # then correct every whole town (about an hour, in the background)
 *   npx tsx tools/calibrate.ts --check  # only compare sample towns with the default one
 */
import { spawn } from 'node:child_process';
import { buildSync } from 'esbuild';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { content } from '../src/content';
import type { Difficulty, TownChoice } from '../src/sim';

const GAMES = 300;
const PARALLEL = 8;
// The bots as one prebuilt file: a process per job through tsx ran the machine out of memory.
const BUNDLE = join(tmpdir(), 'breaking-town-bots.mjs');
const PROGRESS = join(tmpdir(), 'breaking-town-calibration.json');
// Through esbuild's own API: its bin is a JS shim on Windows but a native binary on Linux.
buildSync({ entryPoints: ['tools/bots.ts'], bundle: true, platform: 'node', format: 'esm', outfile: BUNDLE, logLevel: 'error' });
const g = content.townGen;
const base = g.defaults;
const parts = {
  size: g.sizes.map((x) => x.id),
  way: g.archetypes.map((x) => x.id),
  rule: g.rules.map((x) => x.id),
  goal: g.goals.map((x) => x.id),
} as const;
type Part = keyof typeof parts;
const idOf = (x: TownChoice) => `gen-${x.size}.${x.way}.${x.rule}.${x.goal}`;

interface Job {
  town: TownChoice;
  difficulty?: Difficulty;
  raw?: boolean;
  power?: number;
  games?: number;
  strategy?: string;
}

async function play(job: Job): Promise<number> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await playOnce(job);
    } catch (e) {
      if (attempt >= 4) throw e;
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}

function playOnce(job: Job): Promise<number> {
  const args = [BUNDLE, '--games', String(job.games ?? GAMES), '--seed', '1', '--town', idOf(job.town), '--difficulty', job.difficulty ?? 'normal', '--only', job.strategy ?? 'agitator', '--json'];
  if (job.raw) args.push('--raw');
  if (job.power) args.push('--power', String(job.power));
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'ignore'] });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    // A strategy past 60% only sets the exit code: the numbers are still good.
    child.on('close', () => {
      const line = out.split('\n').find((x) => x.startsWith('[')) ?? '';
      try {
        resolve(JSON.parse(line)[0].win / 100);
      } catch {
        reject(new Error(`bots failed on ${idOf(job.town)}: ${out.slice(-200)}`));
      }
    });
  });
}

async function all(jobs: Job[]): Promise<number[]> {
  const out: number[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (next < jobs.length) {
        const i = next++;
        out[i] = await play(jobs[i]);
      }
    }),
  );
  return out;
}

const logit = (p: number, n = GAMES) => {
  const q = Math.min(1 - 0.5 / n, Math.max(0.5 / n, p));
  return Math.log(q / (1 - q));
};

const pct = (p: number) => `${Math.round(p * 100)}%`.padStart(4);

/** Random towns, the same ones every time. */
function sample(n: number): TownChoice[] {
  let seed = 12345;
  const rnd = (m: number) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed >>> 12) % m;
  };
  const one = (list: readonly string[]) => list[rnd(list.length)];
  return Array.from({ length: n }, () => ({ size: one(parts.size), way: one(parts.way), rule: one(parts.rule), goal: one(parts.goal) }));
}

async function check(): Promise<void> {
  const towns = sample(24);
  const only = process.argv.indexOf('--level');
  for (const difficulty of (only >= 0 ? [process.argv[only + 1]] : ['easy', 'normal', 'hard']) as Difficulty[]) {
    const [baseWin] = await all([{ town: base, difficulty, games: 400 }]);
    const wins = await all(towns.map((town) => ({ town, difficulty, games: 200 })));
    const off = wins.map((w) => Math.abs(w - baseWin)).sort((a, b) => a - b);
    console.log(`${difficulty}: default ${pct(baseWin)}; samples ${pct(Math.min(...wins))}..${pct(Math.max(...wins))}, mean ${pct(wins.reduce((a, b) => a + b, 0) / wins.length)}, median miss ${pct(off[Math.floor(off.length / 2)])}, worst miss ${pct(off[off.length - 1])}`);
    if (process.argv.includes('--verbose')) towns.forEach((t, i) => console.log(`  ${pct(wins[i])} ${idOf(t)}`));
  }
}

async function measure(): Promise<void> {
  // How much stronger news change the chances of the default town.
  const powers = [0.7, 0.85, 1, 1.2, 1.45];
  const curve = await all(powers.map((power) => ({ town: base, raw: true, power, games: 600 })));
  const xs = powers.map(Math.log);
  const ys = curve.map((p) => logit(p, 600));
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
  const my = ys.reduce((a, b) => a + b, 0) / ys.length;
  const slope = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  console.log(`news strength: ${powers.map((p, i) => `×${p} ${pct(curve[i])}`).join(', ')}; slope ${slope.toFixed(2)}`);

  const baseWin = curve[powers.indexOf(1)];
  const out = { size: {}, way: {}, rule: {}, goal: {}, combos: {} } as Record<Part | 'combos', Record<string, number>>;
  const list = (Object.keys(parts) as Part[]).flatMap((part) => parts[part].filter((id) => id !== base[part]).map((id) => ({ part, id, town: { ...base, [part]: id } as TownChoice })));
  // First the raw difference, then one correction with the found strength on: the curve is not a line.
  const raw = await all(list.map((x) => ({ town: x.town, raw: true })));
  const first = raw.map((w) => (logit(baseWin, 600) - logit(w)) / slope);
  const clampLog = (v: number) => Math.min(Math.log(g.powerRange[1]), Math.max(Math.log(g.powerRange[0]), v));
  const second = await all(list.map((x, i) => ({ town: x.town, raw: true, power: Math.exp(clampLog(first[i])) })));
  console.log('\nchoice                 raw   strength   after');
  list.forEach((x, i) => {
    const value = clampLog(first[i]) + (logit(baseWin, 600) - logit(second[i])) / slope / 2;
    out[x.part][x.id] = Math.round(clampLog(value) * 1000) / 1000;
    console.log(`${`${x.part} ${x.id}`.padEnd(22)}${pct(raw[i])}   ×${Math.exp(out[x.part][x.id]).toFixed(2).padEnd(7)}${pct(second[i])}`);
  });
  const path = 'src/content/townCalibration.json';
  const eol = readFileSync(path, 'utf8').includes('\r\n') ? '\r\n' : '\n';
  writeFileSync(path, (JSON.stringify(out, null, 2) + '\n').replace(/\n/g, eol));
  console.log(`\nwritten to ${path}; default town: ${pct(baseWin)}`);
}

/** Every whole town with its parts' corrections on: what they miss goes to `combos`. */
async function combos(): Promise<void> {
  const SLOPE = 3.1;
  const GAMES_EACH = 150;
  const [baseWin] = await all([{ town: base, games: 1000 }]);
  const key = (x: TownChoice) => `${x.size}.${x.way}.${x.rule}.${x.goal}`;
  const towns: TownChoice[] = [];
  for (const size of parts.size) for (const way of parts.way) for (const rule of parts.rule) for (const goal of parts.goal) towns.push({ size, way, rule, goal });
  const list = towns.filter((t) => key(t) !== key(base));
  const path = 'src/content/townCalibration.json';
  const raw = readFileSync(path, 'utf8');
  const data = JSON.parse(raw);
  // What was measured stays on disk: a crash continues from there.
  const done: Record<string, number> = existsSync(PROGRESS) ? JSON.parse(readFileSync(PROGRESS, 'utf8')) : {};
  const todo = list.filter((t) => done[key(t)] === undefined);
  console.log(`${todo.length} towns to measure, ${list.length - todo.length} already done`);
  for (let i = 0; i < todo.length; i += PARALLEL * 5) {
    const part = todo.slice(i, i + PARALLEL * 5);
    const got = await all(part.map((town) => ({ town, games: GAMES_EACH })));
    part.forEach((t, j) => (done[key(t)] = got[j]));
    writeFileSync(PROGRESS, JSON.stringify(done));
  }
  const wins = list.map((t) => done[key(t)]);
  list.forEach((t, i) => {
    // Most of the way: one measure is noisy.
    const delta = ((logit(baseWin, 1000) - logit(wins[i], GAMES_EACH)) / SLOPE) * 0.8;
    data.combos[key(t)] = Math.round(((data.combos[key(t)] ?? 0) + delta) * 1000) / 1000;
  });
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  writeFileSync(path, (JSON.stringify(data, null, 2) + '\n').replace(/\n/g, eol));
  const off = wins.map((w) => Math.abs(w - baseWin)).sort((a, b) => a - b);
  rmSync(PROGRESS);
  console.log(`default ${pct(baseWin)}; before the correction: median miss ${pct(off[off.length >> 1])}, worst ${pct(off[off.length - 1])}`);
}

await (process.argv.includes('--check') ? check() : process.argv.includes('--combos') ? combos() : measure());
