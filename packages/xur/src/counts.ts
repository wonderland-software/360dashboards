// Recompute the ten count-header fields from a parsed tree. Every one of
// them must match the values stored in the file: a mismatch means the
// registry misdescribes a class for this build and properties were assigned
// to the wrong definitions somewhere. Ports XUObject's Get*Count methods.
import type { XuObject, XuProperty } from './model';
import type { XuRegistry } from './registry';
import type { XurCountHeader } from './parse';

function valuesOf(p: XuProperty): number {
  if (!Array.isArray(p.value)) return 1;
  if (p.def.type === 'object') return 1 + (p.value as XuProperty[]).reduce((n, c) => n + valuesOf(c), 0);
  return p.value.length;
}

function compoundsOf(p: XuProperty): number {
  if (p.def.type !== 'object') return 0;
  return 1 + (p.value as XuProperty[]).reduce((n, c) => n + compoundsOf(c), 0);
}

export function computeCounts(root: XuObject, reg: XuRegistry): XurCountHeader {
  const c: XurCountHeader = {
    objects: 0, properties: 0, propertiesArray: 0, keyframeProperties: 0, keyframePropertyClassDepth: 0,
    keyframePropertyDefinitions: 0, keyframes: 0, timelines: 0, namedFrames: 0, objectsWithChildren: 0,
  };
  const walk = (o: XuObject) => {
    c.objects++;
    c.propertiesArray++;
    for (const p of o.properties) {
      c.properties += valuesOf(p);
      c.propertiesArray += compoundsOf(p);
    }
    c.namedFrames += o.namedFrames.length;
    c.timelines += o.timelines.length;
    if (o.children.length > 0) c.objectsWithChildren++;
    for (const t of o.timelines) {
      // Empirical (XUIHelper's verifier is disabled, so its formulas were
      // never tested): each track counts once per keyframe, once as a
      // definition, and its path length as class depth. Confirmed on every
      // Blades 6770 scene that carries a count header.
      c.keyframes += t.keyframes.length;
      c.keyframeProperties += t.keyframes.length * t.tracks.length;
      c.keyframePropertyDefinitions += t.tracks.length;
      for (const tr of t.tracks) c.keyframePropertyClassDepth += tr.path.length;
    }
    for (const ch of o.children) walk(ch);
  };
  walk(root);
  return c;
}

export function diffCounts(stored: XurCountHeader, computed: XurCountHeader): string[] {
  const out: string[] = [];
  for (const k of Object.keys(stored) as (keyof XurCountHeader)[]) {
    if (stored[k] !== computed[k]) out.push(`${k}: file says ${stored[k]}, tree has ${computed[k]}`);
  }
  return out;
}
