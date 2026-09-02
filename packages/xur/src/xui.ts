// Serialise a parsed XUR as XUIHelper's "XUI version 000c" XML, byte for byte
// (CRLF, no indentation, six-decimal floats, 0xAARRGGBB colours). Its only
// purpose is diffing our parse against XUIHelper's on the same file, so it
// reproduces XUIHelper's conventions exactly, including one quirk: for an
// animated indexed property (a gradient stop) XUIHelper lists EVERY stop of
// the element as a TimelineProp and writes every stop's value per keyframe,
// not just the animated one. That is emulated here so the diff stays clean;
// the runtime uses the per-track model in model.ts instead.
import type { XuObject, XuProperty, XuPropertyDef, XuScalar, XuValue, XuVector, XuQuaternion, XuColour, XuFigure, XuTimeline } from './model';
import { propByName, idOf } from './model';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r\n|\r|\n/g, '\r\n');
}

export function f6(v: number): string {
  // .NET prints negative zero as "-0.000000"; JS toFixed does not.
  if (Object.is(v, -0)) return '-0.000000';
  const s = v.toFixed(6);
  return s === '-0.000000' ? '-0.000000' : s;
}

function scalar(def: XuPropertyDef, v: XuScalar): string {
  switch (def.type) {
    case 'bool': return v ? 'true' : 'false';
    case 'integer':
    case 'unsigned': return String(v);
    case 'string': return esc(v as string);
    case 'float': return f6(v as number);
    case 'vector': { const p = v as XuVector; return `${f6(p.x)},${f6(p.y)},${f6(p.z)}`; }
    case 'quaternion': { const q = v as XuQuaternion; return `${f6(q.x)},${f6(q.y)},${f6(q.z)},${f6(q.w)}`; }
    case 'color': { const c = v as XuColour; return '0x' + [c.a, c.r, c.g, c.b].map((n) => n.toString(16).padStart(2, '0')).join(''); }
    case 'custom': {
      const f = v as XuFigure;
      let s = `${f.points.length},`;
      for (const p of f.points) s += `${f6(p.point.x)},${f6(p.point.y)},${f6(p.control1.x)},${f6(p.control1.y)},${f6(p.control2.x)},${f6(p.control2.y)},0,`;
      return s;
    }
    case 'object': throw new Error('compound handled by caller');
  }
}

function writeProperty(out: string[], p: XuProperty): void {
  if (p.def.type === 'object') {
    out.push(`<${p.def.name}>`, '<Properties>');
    for (const c of p.value as XuProperty[]) writeProperty(out, c);
    out.push('</Properties>', `</${p.def.name}>`);
    return;
  }
  if (Array.isArray(p.value)) {
    (p.value as XuScalar[]).forEach((v, i) => out.push(`<${p.def.name} index="${i}">${scalar(p.def, v)}</${p.def.name}>`));
  } else {
    out.push(`<${p.def.name}>${scalar(p.def, p.value)}</${p.def.name}>`);
  }
}

function findValue(props: XuProperty[], def: XuPropertyDef): XuValue | undefined {
  for (const p of props) {
    if (p.def === def) return p.value;
    if (p.def.type === 'object') {
      const v = findValue(p.value as XuProperty[], def);
      if (v !== undefined) return v;
    }
  }
  return undefined;
}

function timelinePropName(t: { path: XuPropertyDef[]; def: XuPropertyDef }): string {
  const owner = t.def.owner;
  if (owner === 'XuiFigureFill') return `Fill.${t.def.name}`;
  if (owner === 'XuiFigureFillGradient') return `Fill.Gradient.${t.def.name}`;
  if (owner === 'XuiFigureStroke') return `Stroke.${t.def.name}`;
  return t.def.name;
}

function writeTimeline(out: string[], tl: XuTimeline, owner: XuObject): void {
  const element = owner.children.find((c) => idOf(c) === tl.elementId);
  out.push('<Timeline>', `<Id>${esc(tl.elementId)}</Id>`);
  // Merge tracks by definition, first appearance wins (XUIHelper's order).
  const defs: XuPropertyDef[] = [];
  for (const t of tl.tracks) if (!defs.includes(t.def)) defs.push(t.def);
  const baseList = (def: XuPropertyDef): XuScalar[] => {
    const v = element ? findValue(element.properties, def) : undefined;
    if (!Array.isArray(v)) throw new Error(`timeline "${tl.elementId}": element has no indexed value for ${def.name}`);
    return v as XuScalar[];
  };
  for (const def of defs) {
    const t = tl.tracks.find((x) => x.def === def)!;
    const name = timelinePropName(t);
    if (!def.flags.includes('indexed')) out.push(`<TimelineProp>${name}</TimelineProp>`);
    else baseList(def).forEach((_, i) => out.push(`<TimelineProp index="${i}">${name}</TimelineProp>`));
  }
  for (const k of tl.keyframes) {
    out.push('<KeyFrame>', `<Time>${k.keyframe}</Time>`, `<Interpolation>${['Linear', 'None', 'Ease'].indexOf(k.interpolation)}</Interpolation>`);
    if (k.easeIn !== 0 || k.easeOut !== 0 || k.easeScale !== 50) {
      out.push(`<EaseIn>${k.easeIn}</EaseIn>`, `<EaseOut>${k.easeOut}</EaseOut>`, `<EaseScale>${k.easeScale}</EaseScale>`);
    }
    for (const def of defs) {
      if (!def.flags.includes('indexed')) {
        const ti = tl.tracks.findIndex((x) => x.def === def);
        out.push(`<Prop>${scalar(def, k.values[ti]!)}</Prop>`);
      } else {
        const list = [...baseList(def)];
        tl.tracks.forEach((x, ti) => { if (x.def === def && x.index !== null) list[x.index] = k.values[ti]!; });
        for (const v of list) out.push(`<Prop>${scalar(def, v)}</Prop>`);
      }
    }
    out.push('</KeyFrame>');
  }
  out.push('</Timeline>');
}

function writeObject(out: string[], o: XuObject, root: boolean): void {
  out.push(root ? `<${o.className} version="000c">` : `<${o.className}>`);
  if (o.properties.length) {
    out.push('<Properties>');
    for (const p of o.properties) writeProperty(out, p);
    out.push('</Properties>');
  }
  for (const c of o.children) writeObject(out, c, false);
  if (o.timelines.length || o.namedFrames.length) {
    out.push('<Timelines>');
    if (o.namedFrames.length) {
      out.push('<NamedFrames>');
      for (const nf of o.namedFrames) {
        out.push('<NamedFrame>', `<Name>${esc(nf.name)}</Name>`, `<Time>${nf.keyframe}</Time>`);
        if (nf.command !== 'Play') {
          out.push(`<Command>${nf.command.toLowerCase()}</Command>`);
          if (nf.command !== 'Stop') out.push(`<CommandParams>${esc(nf.target ?? '')}</CommandParams>`);
        }
        out.push('</NamedFrame>');
      }
      out.push('</NamedFrames>');
    }
    for (const tl of o.timelines) writeTimeline(out, tl, o);
    out.push('</Timelines>');
  }
  out.push(`</${o.className}>`);
}

/** XUIHelper-compatible XUI 000c text (no BOM; CRLF line ends, no trailing newline). */
export function toXui(root: XuObject): string {
  const out: string[] = [];
  writeObject(out, root, true);
  return out.join('\r\n');
}

export { propByName };
