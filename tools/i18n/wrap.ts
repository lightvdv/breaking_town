/**
 * Codemod (kept for new files): wraps every string literal and template with Russian text (or ₽) in
 * `tr(...)`, templates as `tr('… {0} …', expr)`, and adds the import. Skips import paths, property names,
 * literal types, strings already given to `tr`, and the forms given to `plural` (it translates them).
 * Usage: npx tsx tools/i18n/wrap.ts src/ui/app.ts …
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseAst } from 'rolldown/parseAst';

const RU = /[А-Яа-яЁё₽]/;

// ESTree nodes as the oxc parser gives them (offsets in UTF-16 units).
type Node = { type: string; start: number; end: number; [k: string]: unknown };

export function quote(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')}'`;
}

const isNode = (x: unknown): x is Node => !!x && typeof x === 'object' && typeof (x as Node).type === 'string';

function children(n: Node): Node[] {
  const out: Node[] = [];
  for (const [k, v] of Object.entries(n)) {
    if (k === 'start' || k === 'end' || k === 'type') continue;
    if (Array.isArray(v)) for (const x of v) if (isNode(x)) out.push(x);
    if (isNode(v)) out.push(v);
  }
  return out.sort((a, b) => a.start - b.start);
}

const callee = (n: Node): string | null => (n.type === 'CallExpression' && isNode(n.callee) && n.callee.type === 'Identifier' ? (n.callee.name as string) : null);

function skip(node: Node, parent: Node | null): boolean {
  if (!parent) return true;
  const p = parent;
  if (['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression', 'TSLiteralType', 'TSExternalModuleReference', 'TaggedTemplateExpression'].includes(p.type)) return true;
  if (['Property', 'PropertyDefinition', 'MethodDefinition', 'TSPropertySignature', 'TSEnumMember'].includes(p.type) && p.key === node && !p.computed) return true;
  const fn = callee(p);
  if (fn === 'tr' && (p.arguments as Node[])[0] === node) return true;
  if (fn === 'plural') return true;
  return false;
}

function hasRu(n: Node): boolean {
  if (n.type === 'Literal') return typeof n.value === 'string' && RU.test(n.value);
  if (n.type === 'TemplateLiteral') return (n.quasis as { value: { cooked: string } }[]).some((q) => RU.test(q.value.cooked));
  return false;
}

export function wrapSource(src: string, file: string): { body: string; count: number } {
  const ast = parseAst(src, { lang: 'ts' }) as unknown as Node;
  let count = 0;

  function render(node: Node, parent: Node | null): string {
    if (hasRu(node) && !skip(node, parent)) {
      count++;
      if (node.type === 'TemplateLiteral') {
        const quasis = node.quasis as { value: { cooked: string } }[];
        const exprs = node.expressions as Node[];
        let text = quasis[0].value.cooked;
        exprs.forEach((_e, i) => (text += `{${i}}` + quasis[i + 1].value.cooked));
        return `tr(${[quote(text), ...exprs.map((e) => render(e, node))].join(', ')})`;
      }
      return `tr(${quote(node.value as string)})`;
    }
    let out = '';
    let pos = node.start;
    for (const ch of children(node)) {
      if (ch.start < pos) continue;
      out += src.slice(pos, ch.start) + render(ch, node);
      pos = ch.end;
    }
    return out + src.slice(pos, node.end);
  }

  let body = '';
  let pos = 0;
  for (const ch of children(ast)) {
    body += src.slice(pos, ch.start) + render(ch, ast);
    pos = ch.end;
  }
  body += src.slice(pos);
  if (count && !/import \{[^}]*\btr\b[^}]*\} from '[./]*i18n'/.test(body)) {
    let rel = path.relative(path.dirname(file), 'src/i18n').replace(/\\/g, '/');
    if (!rel.startsWith('.')) rel = `./${rel}`;
    const m = body.match(/^(\s*(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*)/);
    const at = m ? m[0].length : 0;
    body = body.slice(0, at) + `import { tr } from '${rel}';\n` + body.slice(at);
  }
  return { body, count };
}

if (process.argv[1]?.endsWith('wrap.ts')) {
  for (const f of process.argv.slice(2)) {
    const { body, count } = wrapSource(fs.readFileSync(f, 'utf8'), f);
    if (count) fs.writeFileSync(f, body);
    console.log(f, count);
  }
}
