# Merges translation chunks (JSON objects Russian → English) into src/i18n/en.json, or, with --content,
# content overlays ({file: {path: text}}) into src/content/en.json. Unknown UI keys are reported.
import json, sys
content = '--content' in sys.argv
target = 'src/content/en.json' if content else 'src/i18n/en.json'
d = json.load(open(target, encoding='utf-8'))
for f in [a for a in sys.argv[1:] if not a.startswith('--')]:
    chunk = json.load(open(f, encoding='utf-8'))
    if content:
        for name, paths in chunk.items():
            d.setdefault(name, {}).update(paths)
    else:
        for k, v in chunk.items():
            if k not in d: print('unknown key:', json.dumps(k, ensure_ascii=False))
            else: d[k] = v
json.dump(d, open(target, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
open(target, 'a', encoding='utf-8').write('\n')
print(target, sum(1 for v in d.values() if v) if not content else sum(len(x) for x in d.values()))
