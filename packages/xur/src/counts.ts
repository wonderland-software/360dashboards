// Recompute the ten count-header fields from a parsed tree. Every one of
// them must match the values stored in the file: a mismatch means the
// registry misdescribes a class for this build and properties were assigned
// to the wrong definitions somewhere. Ports XUObject's Get*Count methods.
import type { XuObject, XuProperty } from './model';
import type { XuRegistry } from './registry';
import type { XurCountHeader, XurDocument } from './parse';
import type { Xur8CountHeader } from './parse8';

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

/**
 * The v8 count header recomputed from the tree plus what the reader counted
 * while it shared lists. Empirical, like the v5 formulas (XUIHelper's v8
 * verifier is also `return true;`): established on all 363 Metro 17559
 * scenes, every field, every file (tools/xur2json.ts --strict).
 *   objects, timelines, objectsWithChildren: as in v5
 *   namedFrames: NAME records, NOT the tree's references (a range of named
 *     frames is shared by every object that names its base index: LegendScene
 *     has 13 records and 52 references)
 *   unsharedProperties: property values (compounds count one) of objects
 *     whose list is stored inline (flag 1), not of flag-8 sharers
 *   propertyLists / compoundLists: inline lists the reader met
 *   compoundProperties: XUR8.GetSharedCompoundPropertiesCount over those lists
 *   keyframePropertyClassDepth: per timeline, per track, its path length
 *   timelinePropertyClassDepth: per timeline, its track count
 *   keyframeProperties / keyframeData: the KEYP and KEYD entry counts (the
 *     reader already refuses a file where the sections disagree with them)
 */
export function computeCounts8(doc: XurDocument): Xur8CountHeader {
  const s = doc.shared8;
  if (!s || !doc.counts8) throw new Error('not a v8 document');
  const c: Xur8CountHeader = {
    objects: 0, unsharedProperties: s.unsharedProperties, propertyLists: s.propertyLists, compoundProperties: s.compoundProperties,
    compoundLists: s.compoundLists, keyframePropertyClassDepth: 0, timelinePropertyClassDepth: 0, timelines: 0,
    keyframeProperties: doc.counts8.keyframeProperties, keyframeData: doc.counts8.keyframeData, namedFrames: s.namedFrames, objectsWithChildren: 0,
  };
  const walk = (o: XuObject) => {
    c.objects++;
    c.timelines += o.timelines.length;
    if (o.children.length > 0) c.objectsWithChildren++;
    for (const t of o.timelines) {
      c.timelinePropertyClassDepth += t.tracks.length;
      for (const tr of t.tracks) c.keyframePropertyClassDepth += tr.path.length;
    }
    for (const ch of o.children) walk(ch);
  };
  walk(doc.root);
  return c;
}

export function diffCounts8(stored: Xur8CountHeader, computed: Xur8CountHeader): string[] {
  const out: string[] = [];
  for (const k of Object.keys(stored) as (keyof Xur8CountHeader)[]) {
    if (stored[k] !== computed[k]) out.push(`${k}: file says ${stored[k]}, tree has ${computed[k]}`);
  }
  return out;
}
