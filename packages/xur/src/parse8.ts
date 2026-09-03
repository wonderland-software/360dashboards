// XUR version 8 reader: the Kinect/Metro dashboards (build 17559). A port of
// XUIHelper's XUR8 readers (GPL-3, see NOTICE), cross-checked against the
// 363 scenes of Metro 17559: every section tiles exactly, every count in the
// twelve-field count header is recomputed from the tree (counts.ts), and
// every DATA section ends on its last byte.
//
// What changed from v5 (parse.ts), in one place:
//   - the count header is ALWAYS present (twelve packed uints, no flag bit);
//   - most integers are packed uints (BinaryReader.packed): a byte below
//     0xF0, else a 12-bit value, else 0xFF + u32;
//   - STRN is `u32 charTotal, u16 count, count NUL-terminated UTF-8 strings`
//     (charTotal is the sum of UTF-16 code units + 1 per string, i.e. what
//     the section would have measured in v5, NOT the byte length: two scenes
//     with non-ASCII text prove it);
//   - floats and colours are pooled in FLOT / COLR sections and referenced by
//     index, as vectors and quaternions already were in v5;
//   - a class's property mask is ONE packed uint per class (up to 32 bits),
//     so there is no mask-byte count to check a registry against: the guards
//     are "no bit set beyond the class's definitions" and the object's total;
//   - property lists and compound values are SHARED: an object with flag 0x8
//     reuses the property list of an earlier object by index, and a compound
//     (Fill/Gradient/Stroke) starts with an index that either names an
//     earlier compound or, when it equals the number read so far, introduces
//     a new one;
//   - named frames live in NAME and timelines reference them by base index;
//   - keyframes live in KEYD (frame, flag byte, optional ease, KEYP base) and
//     their values in KEYP, one packed uint per animated track, interpreted
//     by the track's type (an index into FLOT/COLR/VECT/QUAT/STRN, or the
//     integer/unsigned/bool value itself).
//
// KEYD flag byte, from the console's own decoder (dash.xex 17559 .text
// 0x92203930, reached from the section loader at 0x922044f8; LEARNINGS
// "Metro 17559"): the low SIX bits are a keyframe TYPE 0..0xc (anything
// higher is refused with E_FAIL-style 0x8030000d), the top TWO bits are a
// separate field stored beside it. A 13-entry jump table at .rdata
// 0x92011030 gives each type its payload: type 2 carries three inline bytes
// (EaseIn, EaseOut, EaseScale as in v5); types 7, 0xa, 0xb and 0xc carry a
// packed index into the file's VECT pool (checked against the pool's count,
// resolved to a pointer); types 0, 1, 3, 4, 5, 6, 8 and 9 carry nothing.
// Then a packed index into KEYP for the keyframe's values. XUIHelper's
// reader agrees on 0, 1, 2 and 0xa, reads 0xb as ONE BYTE (a packed uint
// below 0xf0 is one byte, so the four 0xb records in the corpus tile either
// way) and never sees 7 or 0xc. The raw byte and the payload stay on the
// keyframe (`flags8`, `extra8`, `curve8`); `interpolation` keeps XUIHelper's
// three-way reading (1 None, 2 Ease, else Linear) so the XUIHelper diff
// measures the rest, and what types 3..0xc MEAN to the animation evaluator
// is an open item, not a claim.
import { BinaryReader } from './reader';
import type { XuRegistry } from './registry';
import type {
  XuObject, XuProperty, XuPropertyDef, XuScalar, XuValue, XuColour, XuVector, XuQuaternion, XuFigure,
  XuNamedFrame, XuTimeline, XuKeyframe, XuClassDef, XuTrack, XuInterpolation,
} from './model';
import { NAMED_FRAME_COMMANDS, idOf } from './model';
import type { XurDocument, XurHeader, XurSection } from './parse';

/** The twelve packed counts every v8 file starts with (XUR8CountHeader in XUIHelper). */
export interface Xur8CountHeader {
  objects: number;
  /** Property values stored inline (objects read with flag 1), compounds counted as one. */
  unsharedProperties: number;
  /** Property lists stored inline = objects read with flag 1. */
  propertyLists: number;
  /** Values inside the shared compound lists (nested compounds counted as one plus their own values). */
  compoundProperties: number;
  /** Compound lists stored inline (Fill, Gradient, Stroke bodies). */
  compoundLists: number;
  keyframePropertyClassDepth: number;
  timelinePropertyClassDepth: number;
  timelines: number;
  /** Entries in KEYP. */
  keyframeProperties: number;
  /** Records in KEYD. */
  keyframeData: number;
  /** Records in NAME. */
  namedFrames: number;
  objectsWithChildren: number;
}

interface KeyRecord { keyframe: number; flags: number; easeIn: number; easeOut: number; easeScale: number; extra: number | null; propIndex: number }

/** Keyframe types whose payload is a packed VECT index (jump table entries 0x48 at .rdata 0x92011030). */
const KEYD_VECTOR_TYPES = new Set([7, 0xa, 0xb, 0xc]);

class Ctx8 {
  strings: string[] = [''];
  vectors: XuVector[] = [];
  quaternions: XuQuaternion[] = [];
  floats: number[] = [];
  colours: XuColour[] = [];
  figures = new Map<number, XuFigure>();
  keyp: number[] = [];
  keyd: KeyRecord[] = [];
  names: XuNamedFrame[] = [];
  propertyLists: XuProperty[][] = [];
  compoundLists: XuProperty[][] = [];
  /** Property values read inline, for the count header. */
  unshared = 0;
  constructor(readonly r: BinaryReader, readonly reg: XuRegistry) {}
  str(i: number): string {
    if (i < 0 || i >= this.strings.length) throw new Error(`string index ${i} out of range (${this.strings.length})`);
    return this.strings[i]!;
  }
  at<T>(what: string, list: T[], i: number): T {
    const v = list[i];
    if (v === undefined) throw new Error(`${what} index ${i} out of range (${list.length})`);
    return v;
  }
}

export function parseXur8(bytes: Uint8Array, reg: XuRegistry, header: XurHeader, r: BinaryReader): XurDocument {
  // Called by parseXur after the 20-byte fixed header; r sits at byte 20.
  const counts8: Xur8CountHeader = {
    objects: r.packed(), unsharedProperties: r.packed(), propertyLists: r.packed(), compoundProperties: r.packed(),
    compoundLists: r.packed(), keyframePropertyClassDepth: r.packed(), timelinePropertyClassDepth: r.packed(),
    timelines: r.packed(), keyframeProperties: r.packed(), keyframeData: r.packed(), namedFrames: r.packed(),
    objectsWithChildren: r.packed(),
  };
  const sections: XurSection[] = [];
  for (let i = 0; i < header.sectionsCount; i++) sections.push({ magic: r.tag(), offset: r.u32(), length: r.u32() });
  // Sections tile the file from the end of the table to EOF, in table order.
  let cursor = r.pos;
  for (const s of sections) {
    if (s.offset !== cursor) throw new Error(`section ${s.magic} at ${s.offset}, expected ${cursor} (sections must tile)`);
    cursor += s.length;
  }
  if (cursor !== bytes.byteLength) throw new Error(`sections end at ${cursor}, file is ${bytes.byteLength} bytes`);
  const find = (m: string) => sections.find((s) => s.magic === m);
  const ctx = new Ctx8(r, reg);

  const strn = find('STRN');
  if (strn) {
    r.seek(strn.offset);
    const end = strn.offset + strn.length;
    const charTotal = r.u32();
    const n = r.u16();
    let measured = 0;
    for (let i = 0; i < n; i++) {
      const s = r.cstringUtf8();
      measured += s.length + 1;
      ctx.strings.push(s);
    }
    if (r.pos !== end) throw new Error(`STRN: ${n} strings end at ${r.pos}, section ends at ${end}`);
    if (measured !== charTotal) throw new Error(`STRN: header says ${charTotal} characters, strings measure ${measured}`);
  }
  const vect = find('VECT');
  if (vect) {
    r.seek(vect.offset);
    if (vect.length % 12) throw new Error(`VECT length ${vect.length} is not a multiple of 12`);
    for (let i = 0; i < vect.length / 12; i++) ctx.vectors.push({ x: r.f32(), y: r.f32(), z: r.f32() });
  }
  const quat = find('QUAT');
  if (quat) {
    r.seek(quat.offset);
    if (quat.length % 16) throw new Error(`QUAT length ${quat.length} is not a multiple of 16`);
    for (let i = 0; i < quat.length / 16; i++) ctx.quaternions.push({ x: r.f32(), y: r.f32(), z: r.f32(), w: r.f32() });
  }
  const flot = find('FLOT');
  if (flot) {
    r.seek(flot.offset);
    if (flot.length % 4) throw new Error(`FLOT length ${flot.length} is not a multiple of 4`);
    for (let i = 0; i < flot.length / 4; i++) ctx.floats.push(r.f32());
  }
  const colr = find('COLR');
  if (colr) {
    r.seek(colr.offset);
    if (colr.length % 4) throw new Error(`COLR length ${colr.length} is not a multiple of 4`);
    for (let i = 0; i < colr.length / 4; i++) ctx.colours.push({ a: r.u8(), r: r.u8(), g: r.u8(), b: r.u8() });
  }
  // CUST is the v5 layout: figures back to back, referenced by byte offset.
  const cust = find('CUST');
  if (cust) {
    r.seek(cust.offset);
    const end = cust.offset + cust.length;
    while (r.pos < end) {
      const at = r.pos - cust.offset;
      const dataLength = r.u32();
      const start = r.pos;
      const boundingBox = { x: r.f32(), y: r.f32() };
      const n = r.u32();
      const points = [];
      for (let i = 0; i < n; i++) {
        points.push({ point: { x: r.f32(), y: r.f32() }, control1: { x: r.f32(), y: r.f32() }, control2: { x: r.f32(), y: r.f32() } });
      }
      if (r.pos - start !== dataLength) throw new Error(`CUST figure at ${at}: declared ${dataLength} bytes, read ${r.pos - start}`);
      ctx.figures.set(at, { boundingBox, points });
    }
    if (r.pos !== end) throw new Error(`CUST overran its section by ${r.pos - end} bytes`);
  }
  const keyp = find('KEYP');
  if (keyp) {
    r.seek(keyp.offset);
    const end = keyp.offset + keyp.length;
    while (r.pos < end) ctx.keyp.push(r.packed());
    if (r.pos !== end) throw new Error(`KEYP overran its section by ${r.pos - end} bytes`);
  }
  const keyd = find('KEYD');
  if (keyd) {
    r.seek(keyd.offset);
    const end = keyd.offset + keyd.length;
    while (r.pos < end) {
      const keyframe = r.packed();
      if (keyframe > 0xffff) throw new Error(`KEYD: frame ${keyframe} does not fit the console's u16`);
      const flags = r.u8();
      const type = flags & 0x3f;
      if (type > 0xc) throw new Error(`KEYD: keyframe type ${type} is beyond the console's 0..0xc`);
      let easeIn = 0, easeOut = 0, easeScale = 0, extra: number | null = null;
      if (type === 2) { easeIn = r.i8(); easeOut = r.i8(); easeScale = r.u8(); }
      else if (KEYD_VECTOR_TYPES.has(type)) {
        extra = r.packed();
        if (extra >= ctx.vectors.length) throw new Error(`KEYD: type ${type} vector index ${extra} beyond VECT's ${ctx.vectors.length}`);
      }
      const propIndex = r.packed();
      ctx.keyd.push({ keyframe, flags, easeIn, easeOut, easeScale, extra, propIndex });
    }
    if (r.pos !== end) throw new Error(`KEYD overran its section by ${r.pos - end} bytes`);
  }
  const name = find('NAME');
  if (name) {
    r.seek(name.offset);
    const end = name.offset + name.length;
    while (r.pos < end) {
      const nm = ctx.str(r.packed());
      const keyframe = r.packed();
      const cmd = r.u8();
      const command = NAMED_FRAME_COMMANDS[cmd];
      if (!command) throw new Error(`named frame "${nm}": command byte ${cmd} is not valid`);
      const target = command === 'Play' || command === 'Stop' ? null : ctx.str(r.packed()) || null;
      ctx.names.push({ name: nm, keyframe, command, target });
    }
    if (r.pos !== end) throw new Error(`NAME overran its section by ${r.pos - end} bytes`);
  }
  if (ctx.keyp.length !== counts8.keyframeProperties) throw new Error(`KEYP holds ${ctx.keyp.length} entries, count header says ${counts8.keyframeProperties}`);
  if (ctx.keyd.length !== counts8.keyframeData) throw new Error(`KEYD holds ${ctx.keyd.length} records, count header says ${counts8.keyframeData}`);
  if (ctx.names.length !== counts8.namedFrames) throw new Error(`NAME holds ${ctx.names.length} records, count header says ${counts8.namedFrames}`);

  const data = find('DATA');
  if (!data) throw new Error('no DATA section');
  r.seek(data.offset);
  const root = readObject(ctx);
  if (r.pos !== data.offset + data.length) throw new Error(`DATA section: read ended at ${r.pos}, section ends at ${data.offset + data.length}`);

  return {
    header, counts: null, counts8, sections, strings: ctx.strings, vectors: ctx.vectors, quaternions: ctx.quaternions,
    floats: ctx.floats, colours: ctx.colours, figures: ctx.figures, root,
    shared8: { propertyLists: ctx.propertyLists.length, compoundLists: ctx.compoundLists.length, unsharedProperties: ctx.unshared, compoundProperties: ctx.compoundLists.reduce((n, l) => n + countCompound(l), 0), namedFrames: ctx.names.length },
  };
}

/** Values in a property list: an indexed list per element, a nested compound as one. */
function valueCount(list: XuProperty[]): number {
  let n = 0;
  for (const p of list) n += Array.isArray(p.value) && p.def.type !== 'object' ? p.value.length : 1;
  return n;
}

/**
 * What the count header's compoundProperties field sums over the shared
 * compound lists. XUIHelper's GetSharedCompoundPropertiesCount (each value,
 * plus a nested list's length + 1 again) is 4 high on every scene with a
 * Gradient; the value count per list (valueCount) matches all 363.
 */
function countCompound(list: XuProperty[]): number {
  return valueCount(list);
}

function readObject(ctx: Ctx8): XuObject {
  const { r } = ctx;
  const className = ctx.str(r.packed());
  const flags = r.u8();
  if (flags & ~0x0f) throw new Error(`${className}: object flag byte 0x${flags.toString(16)} has unknown bits`);
  const obj: XuObject = { className, properties: [], children: [], namedFrames: [], timelines: [] };
  if (flags & 0x1) {
    obj.properties = readProperties(ctx, className);
    ctx.propertyLists.push(obj.properties);
  } else if (flags & 0x8) {
    // Shared: the same property list as an earlier object, by index.
    const i = r.packed();
    obj.properties = [...ctx.at('shared property list', ctx.propertyLists, i)];
  }
  if (flags & 0x2) {
    const n = r.packed();
    for (let i = 0; i < n; i++) obj.children.push(readObject(ctx));
  }
  if (flags & 0x4) {
    const nf = r.packed();
    if (nf > 0) {
      const base = r.packed();
      if (base + nf > ctx.names.length) throw new Error(`${className}: named frames ${base}..${base + nf} beyond NAME's ${ctx.names.length}`);
      for (let i = 0; i < nf; i++) obj.namedFrames.push(ctx.names[base + i]!);
    }
    // As in v5: no children, no timeline count at all.
    if (obj.children.length > 0) {
      const nt = r.packed();
      for (let i = 0; i < nt; i++) obj.timelines.push(readTimeline(ctx, obj));
    }
  }
  return obj;
}

function readProperties(ctx: Ctx8, className: string): XuProperty[] {
  const { r } = ctx;
  const total = r.packed();
  const out: XuProperty[] = [];
  for (const cls of ctx.reg.hierarchy(className)) {
    const mask = r.packed();
    if (mask === 0) continue;
    readMasked(ctx, cls, mask, out, className);
  }
  if (out.length !== total) throw new Error(`${className}: property count ${out.length} != declared ${total}`);
  ctx.unshared += total;
  return out;
}

function readMasked(ctx: Ctx8, cls: XuClassDef, mask: number, out: XuProperty[], owner: string): void {
  for (let i = 0; i < 32; i++) {
    if (!((mask >>> i) & 1)) continue;
    const def = cls.props[i];
    // A set bit beyond the class's definitions means the registry is missing
    // a property for this build; say so instead of silently misaligning.
    if (!def) throw new Error(`${owner}/${cls.name}: mask bit ${i} set but the class declares only ${cls.props.length} properties`);
    out.push(readProperty(ctx, def));
  }
}

function readProperty(ctx: Ctx8, def: XuPropertyDef): XuProperty {
  const { r } = ctx;
  const indexed = def.flags.includes('indexed');
  const count = indexed ? r.u8() : 1;
  const values: XuScalar[] = [];
  for (let i = 0; i < count; i++) values.push(readScalar(ctx, def));
  const value: XuValue = indexed ? values : values[0]!;
  return { def, value };
}

function readScalar(ctx: Ctx8, def: XuPropertyDef): XuScalar {
  const { r } = ctx;
  switch (def.type) {
    case 'bool': return r.u8() > 0;
    case 'integer': return r.packed() | 0;
    case 'unsigned': return r.packed();
    case 'float': return ctx.at(`${def.name}: float`, ctx.floats, r.packed());
    case 'string': return ctx.str(r.packed());
    case 'vector': return ctx.at(`${def.name}: vector`, ctx.vectors, r.packed());
    case 'quaternion': return ctx.at(`${def.name}: quaternion`, ctx.quaternions, r.packed());
    case 'color': return ctx.at(`${def.name}: colour`, ctx.colours, r.packed());
    case 'custom': {
      const off = r.packed();
      const f = ctx.figures.get(off);
      if (!f) throw new Error(`${def.name}: no figure at CUST offset ${off}`);
      return f;
    }
    case 'object': return readCompound(ctx, def);
  }
}

/**
 * XUR8ReadExtensions.TryReadObjectProperty, with the index rule made explicit.
 * Compound lists are numbered in POST-order: a Fill that carries a Gradient is
 * written as (index 2, body containing Gradient index 1), so a new compound's
 * index can only be checked AFTER its body has been read and its nested
 * compounds numbered. XUIHelper pushes after reading and never checks; a
 * pre-order reservation fails 70 scenes, a post-order push with the check
 * before the body fails 3 (the Closed Caption pages, whose first Fill holds
 * a Gradient), and this passes all 363.
 */
function readCompound(ctx: Ctx8, def: XuPropertyDef): XuProperty[] {
  const { r } = ctx;
  const i = r.packed();
  trace8?.(`compound ${def.name} @${r.pos}: index ${i}, ${ctx.compoundLists.length} lists so far`);
  if (i < ctx.compoundLists.length) return [...ctx.compoundLists[i]!];
  const cls = ctx.reg.compoundClassFor(def);
  const count = r.packed();
  const mask = r.packed();
  const out: XuProperty[] = [];
  readMasked(ctx, cls, mask, out, def.name);
  // As in v5 the count is of VALUES: an indexed list counts per element
  // (NumStops + StopColor[2] + StopPos[2] = 5 for three properties, 62 scenes)
  // and a nested compound counts as one.
  if (valueCount(out) !== count) throw new Error(`${def.name}: compound declares ${count} values, mask selected ${valueCount(out)}`);
  // A new compound takes the next index once its nested compounds have taken
  // theirs; anything else would leave a hole a later reference could not name.
  if (i !== ctx.compoundLists.length) throw new Error(`${def.name}: compound index ${i}, but ${ctx.compoundLists.length} lists numbered before it`);
  ctx.compoundLists.push(out);
  return out;
}

function readTimeline(ctx: Ctx8, owner: XuObject): XuTimeline {
  const { r, reg } = ctx;
  const elementId = ctx.str(r.packed());
  const element = owner.children.find((c) => idOf(c) === elementId);
  if (!element) throw new Error(`timeline targets "${elementId}" which is not a direct child of ${owner.className} "${idOf(owner)}"`);
  const classes = [...reg.hierarchy(element.className)].reverse();
  const trackCount = r.packed();
  const tracks: XuTrack[] = [];
  for (let i = 0; i < trackCount; i++) {
    const packed = r.u8();
    const depth = packed & 0x7f;
    const isIndexed = (packed & 0x80) !== 0;
    const classIndex = r.u8();
    let cls = classes[classIndex];
    if (!cls) throw new Error(`timeline "${elementId}": class index ${classIndex} beyond hierarchy of ${classes.length}`);
    const path: XuPropertyDef[] = [];
    for (let j = 0; j < depth; j++) {
      const pi = r.u8();
      const def = cls.props[pi];
      if (!def) throw new Error(`timeline "${elementId}": property index ${pi} beyond ${cls.name}'s ${cls.props.length} properties`);
      path.push(def);
      if (j !== depth - 1) cls = reg.compoundClassFor(def);
    }
    const def = path[path.length - 1];
    if (!def) throw new Error(`timeline "${elementId}": zero-depth track`);
    const index = isIndexed ? r.packed() : null;
    if (def.flags.includes('indexed') !== isIndexed) throw new Error(`timeline "${elementId}": track ${def.name} indexed flag ${isIndexed} disagrees with the registry`);
    tracks.push({ path, def, index });
  }
  const keyframeCount = r.packed();
  const base = r.packed();
  if (base + keyframeCount > ctx.keyd.length) throw new Error(`timeline "${elementId}": keyframes ${base}..${base + keyframeCount} beyond KEYD's ${ctx.keyd.length}`);
  const keyframes: XuKeyframe[] = [];
  for (let k = 0; k < keyframeCount; k++) {
    const kd = ctx.keyd[base + k]!;
    const values: XuScalar[] = [];
    for (let t = 0; t < tracks.length; t++) values.push(keyValue(ctx, tracks[t]!.def, ctx.at(`timeline "${elementId}": KEYP`, ctx.keyp, kd.propIndex + t)));
    keyframes.push({ keyframe: kd.keyframe, interpolation: interpolationOf(kd.flags), easeIn: kd.easeIn, easeOut: kd.easeOut, easeScale: kd.easeScale, values, flags8: kd.flags, extra8: kd.extra, curve8: kd.extra === null ? undefined : ctx.vectors[kd.extra] });
  }
  return { elementId, tracks, keyframes };
}

/** The interpolation XUIHelper reads from the flag byte's low six bits; everything else is Linear to it. */
function interpolationOf(flags: number): XuInterpolation {
  const low = flags & 0x3f;
  return low === 1 ? 'None' : low === 2 ? 'Ease' : 'Linear';
}

/** A KEYP entry interpreted by the animated definition's type. */
function keyValue(ctx: Ctx8, def: XuPropertyDef, raw: number): XuScalar {
  switch (def.type) {
    case 'integer': return raw | 0;
    case 'unsigned': return raw;
    case 'bool': return raw !== 0;
    case 'string': return ctx.str(raw);
    case 'float': return ctx.at(`${def.name}: float`, ctx.floats, raw);
    case 'color': return ctx.at(`${def.name}: colour`, ctx.colours, raw);
    case 'vector': return ctx.at(`${def.name}: vector`, ctx.vectors, raw);
    case 'quaternion': return ctx.at(`${def.name}: quaternion`, ctx.quaternions, raw);
    default: throw new Error(`animated ${def.type} property ${def.name} is not representable in KEYP`);
  }
}

/** Optional trace sink for debugging layout problems (set from a tool). */
export let trace8: ((msg: string) => void) | null = null;
export function setTrace8(fn: ((msg: string) => void) | null): void {
  trace8 = fn;
}
