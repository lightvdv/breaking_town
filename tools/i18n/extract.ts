/**
 * Lists every text the code asks to translate: the first argument of `tr(...)` and the first and last
 * form given to `plural(...)` (CONCEPT.md §7.5). `--write` merges them into `src/i18n/en.json` (new keys
 * get an empty value, keys no longer used are dropped); `--missing` prints the keys without a translation.
 * Usage: npx tsx tools/i18n/extract.ts [--write | --missing]
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseAst } from 'rolldown/parseAst';

type Node = { type: string; start: number; end: number; [k: string]: unknown };
const isNode = (x: unknown): x is Node => !!x && typeof x === 'object' && typeof (x as Node).type === 'string';

function walk(n: Node, f: (n: Node) => void): void {
  f(n);
  for (const [k, v] of Object.entries(n)) {
    if (k === 'start' || k === 'end') continue;
    if (Array.isArray(v)) for (const x of v) if (isNode(x)) walk(x, f);
    if (isNode(v)) walk(v, f);
  }
}

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return /\.ts$/.test(e.name) && !/\.d\.ts$/.test(e.name) ? [p] : [];
  });
}

const str = (n: unknown): string | null => (isNode(n) && n.type === 'Literal' && typeof n.value === 'string' ? n.value : null);

/** Every key the code passes to `tr` or `plural`, with the files it is in. */
export function codeKeys(root = 'src'): Map<string, string[]> {
  const keys = new Map<string, string[]>();
  const add = (k: string | null, f: string) => {
    if (k === null) return;
    keys.set(k, [...(keys.get(k) ?? []), f]);
  };
  for (const f of files(root)) {
    const src = fs.readFileSync(f, 'utf8');
    if (!/\btr\(|\bplural\(/.test(src)) continue;
    const ast = parseAst(src, { lang: 'ts' }) as unknown as Node;
    walk(ast, (n) => {
      if (n.type !== 'CallExpression' || !isNode(n.callee) || n.callee.type !== 'Identifier') return;
      const args = n.arguments as Node[];
      if (n.callee.name === 'tr') add(str(args[0]), f);
      if (n.callee.name === 'plural' && args.length === 4) {
        add(str(args[1]), f);
        add(str(args[3]), f);
      }
    });
  }
  return keys;
}

if (process.argv[1]?.endsWith('extract.ts')) {
  const keys = codeKeys();
  const file = 'src/i18n/en.json';
  const en = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, string>;
  if (process.argv.includes('--write')) {
    const out: Record<string, string> = {};
    for (const k of [...keys.keys()].sort()) out[k] = en[k] ?? '';
    fs.writeFileSync(file, JSON.stringify(out, null, 1) + '\n');
    console.log(`${keys.size} keys, ${Object.values(out).filter((v) => !v).length} without a translation`);
  } else if (process.argv.includes('--missing')) {
    for (const k of keys.keys()) if (!en[k]) console.log(JSON.stringify(k));
  } else console.log(`${keys.size} keys`);
}
