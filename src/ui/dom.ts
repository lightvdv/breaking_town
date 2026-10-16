type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>;

function apply(e: Element, attrs: Attrs, children: Child[]): void {
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    e.append(typeof c === 'number' ? String(c) : c);
  }
}

/** Creates an HTML element. Attributes starting with "on" become event listeners. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  apply(e, attrs, children);
  return e;
}

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): SVGElementTagNameMap[K] {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  apply(e, attrs, children);
  return e;
}

export function select(
  options: { value: string; label: string }[],
  value: string,
  onChange: (v: string) => void,
  disabled = false,
): HTMLSelectElement {
  const s = h(
    'select',
    { disabled },
    ...options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)),
  );
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
