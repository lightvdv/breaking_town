/**
 * The content texts to translate (CONCEPT.md §7.5): `--list <file…>` prints the paths with Russian text
 * that the English overlay (`src/content/en.json`) lacks, as JSON; `--stale` prints overlay paths that no
 * longer exist. Usage: npx tsx tools/i18n/content.ts --list cards groups
 */
import fs from 'node:fs';
import { textPaths } from '../../src/i18n';

const names = fs.readdirSync('src/content').filter((f) => f.endsWith('.json') && f !== 'en.json').map((f) => f.slice(0, -5));
const overlay = JSON.parse(fs.readFileSync('src/content/en.json', 'utf8')) as Record<string, Record<string, string>>;

export function missing(name: string): Record<string, string> {
  const paths = textPaths(JSON.parse(fs.readFileSync(`src/content/${name}.json`, 'utf8')));
  return Object.fromEntries(Object.entries(paths).filter(([p]) => !overlay[name]?.[p]));
}

if (process.argv[1]?.endsWith('content.ts')) {
  const args = process.argv.slice(3);
  if (process.argv[2] === '--list') {
    const out: Record<string, Record<string, string>> = {};
    for (const n of args.length ? args : names) {
      const m = missing(n);
      if (Object.keys(m).length) out[n] = m;
    }
    console.log(JSON.stringify(out, null, 1));
  } else if (process.argv[2] === '--stale') {
    for (const [n, paths] of Object.entries(overlay)) {
      const live = textPaths(JSON.parse(fs.readFileSync(`src/content/${n}.json`, 'utf8')));
      for (const p of Object.keys(paths)) if (!(p in live)) console.log(n, p);
    }
  } else for (const n of names) console.log(n, Object.keys(missing(n)).length);
}
