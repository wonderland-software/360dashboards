// ?debug - the scene tree, hover highlighting and a property dump.
// Reads the DOM the renderer produced, so what it shows is what was drawn.
import { idOf, type XuObject, type XuProperty } from '@xur/index';
import { walk } from '../scene/SceneLoader';

export function mountInspector(host: HTMLElement, root: XuObject, canvas: HTMLElement): void {
  const panel = document.createElement('aside');
  panel.className = 'xui-inspector';
  const tree = document.createElement('div');
  tree.className = 'xui-inspector-tree';
  const dump = document.createElement('pre');
  dump.className = 'xui-inspector-props';
  panel.append(tree, dump);
  host.appendChild(panel);

  const hi = document.createElement('div');
  hi.className = 'xui-inspector-highlight';
  canvas.appendChild(hi);

  const rows = new Map<XuObject, HTMLElement>();
  walk(root, (o, depth) => {
    const row = document.createElement('div');
    row.className = 'xui-inspector-row';
    row.style.paddingLeft = `${depth * 12}px`;
    row.textContent = `${o.className}${idOf(o) ? ' #' + idOf(o) : ''}`;
    row.addEventListener('mouseenter', () => highlight(o));
    row.addEventListener('click', () => { dump.textContent = describe(o); highlight(o); });
    rows.set(o, row);
    tree.appendChild(row);
  });

  function highlight(o: XuObject): void {
    const id = idOf(o);
    const el = id
      ? canvas.querySelector<HTMLElement>(`[data-xui-id="${cssEscape(id)}"]`)
      : canvas.querySelector<HTMLElement>(`[data-xui-class="${cssEscape(o.className)}"]`);
    if (!el) { hi.style.display = 'none'; return; }
    const a = el.getBoundingClientRect();
    const b = canvas.getBoundingClientRect();
    const k = a.width && el.offsetWidth ? a.width / el.offsetWidth : 1;
    hi.style.display = 'block';
    hi.style.left = `${(a.left - b.left) / k}px`;
    hi.style.top = `${(a.top - b.top) / k}px`;
    hi.style.width = `${a.width / k}px`;
    hi.style.height = `${a.height / k}px`;
  }
}

function describe(o: XuObject): string {
  const lines = [`${o.className}${idOf(o) ? ' #' + idOf(o) : ''}`, ''];
  for (const p of o.properties) lines.push(`${p.def.owner}.${p.def.name} = ${fmtValue(p)}`);
  if (o.namedFrames.length) {
    lines.push('', 'named frames:');
    for (const f of o.namedFrames) lines.push(`  ${f.name} @${f.keyframe} ${f.command}${f.target ? ' -> ' + f.target : ''}`);
  }
  if (o.timelines.length) {
    lines.push('', 'timelines:');
    for (const t of o.timelines) {
      lines.push(`  ${t.elementId}: ${t.tracks.map((k) => k.path.map((d) => d.name).join('.')).join(', ')} over ${t.keyframes.length} keyframes`);
    }
  }
  return lines.join('\n');
}

function fmtValue(p: XuProperty): string {
  const v = p.value;
  if (v && typeof v === 'object' && 'boundingBox' in v) return `<figure ${(v as { points: unknown[] }).points.length} points>`;
  if (Array.isArray(v)) return JSON.stringify(v.map((x) => (x && typeof x === 'object' && 'def' in x ? (x as XuProperty).def.name : x)));
  return JSON.stringify(v);
}

function cssEscape(s: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&');
}
