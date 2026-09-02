// XUR version 5 reader: Blades and NXE dashboards (builds 1888-9199).
// A port of XUIHelper's XUR5 readers (GPL-3, see NOTICE). Every layout fact
// below was cross-checked against the C# source; comments name the original
// where the rule is non-obvious.
import { BinaryReader } from './reader';
import type { XuRegistry } from './registry';
import type {
  XuObject, XuProperty, XuPropertyDef, XuScalar, XuValue, XuVector, XuQuaternion, XuFigure,
  XuNamedFrame, XuTimeline, XuKeyframe, XuClassDef, XuTrack,
} from './model';
import { NAMED_FRAME_COMMANDS, INTERPOLATIONS, idOf } from './model';

export interface XurHeader {
  version: number;
  flags: number;
  toolVersion: number;
  fileSize: number;
  sectionsCount: number;
}

/** Ten u32 counts present when `flags & 1`; XUR5CountHeader in XUIHelper. */
export interface XurCountHeader {
  objects: number;
  properties: number;
  propertiesArray: number;
  keyframeProperties: number;
  keyframePropertyClassDepth: number;
  keyframePropertyDefinitions: number;
  keyframes: number;
  timelines: number;
  namedFrames: number;
  objectsWithChildren: number;
}

export interface XurSection { magic: string; offset: number; length: number }

export interface XurDocument {
  header: XurHeader;
  counts: XurCountHeader | null;
  sections: XurSection[];
  strings: string[];
  vectors: XuVector[];
  quaternions: XuQuaternion[];
  figures: Map<number, XuFigure>;
  root: XuObject;
}

class Ctx {
  strings: string[] = [''];
  vectors: XuVector[] = [];
  quaternions: XuQuaternion[] = [];
  figures = new Map<number, XuFigure>();
  constructor(readonly r: BinaryReader, readonly reg: XuRegistry) {}

  str(i: number): string {
    if (i < 0 || i >= this.strings.length) throw new Error(`string index ${i} out of range (${this.strings.length})`);
    return this.strings[i]!;
  }
}

export function parseXur(bytes: Uint8Array, reg: XuRegistry): XurDocument {
  const r = new BinaryReader(bytes);
  const magic = r.tag();
  if (magic !== 'XUIB') throw new Error(`not a XUR (magic "${magic}")`);
  const version = r.u32();
  if (version !== 5) throw new Error(`XUR version ${version}; only v5 is implemented`);
  const flags = r.u32();
  const toolVersion = r.u16();
  const fileSize = r.u32();
  if (fileSize !== bytes.byteLength) throw new Error(`fileSize ${fileSize} != actual ${bytes.byteLength}`);
  const sectionsCount = r.u16();
  const header: XurHeader = { version, flags, toolVersion, fileSize, sectionsCount };

  let counts: XurCountHeader | null = null;
  if (flags & 1) {
    counts = {
      objects: r.u32(), properties: r.u32(), propertiesArray: r.u32(), keyframeProperties: r.u32(),
      keyframePropertyClassDepth: r.u32(), keyframePropertyDefinitions: r.u32(), keyframes: r.u32(),
      timelines: r.u32(), namedFrames: r.u32(), objectsWithChildren: r.u32(),
    };
  }

  const sections: XurSection[] = [];
  for (let i = 0; i < sectionsCount; i++) sections.push({ magic: r.tag(), offset: r.u32(), length: r.u32() });
  const find = (m: string) => sections.find((s) => s.magic === m);

  const ctx = new Ctx(r, reg);

  // STRN: index 0 is the implicit empty string and is NOT stored.
  const strn = find('STRN');
  if (strn) {
    r.seek(strn.offset);
    const end = strn.offset + strn.length;
    while (r.pos < end) {
      const n = r.u16();
      ctx.strings.push(r.utf16be(n));
    }
    if (r.pos !== end) throw new Error(`STRN overran its section by ${r.pos - end} bytes`);
  }

  const vect = find('VECT');
  if (vect) {
    r.seek(vect.offset);
    for (let i = 0; i < vect.length / 12; i++) ctx.vectors.push({ x: r.f32(), y: r.f32(), z: r.f32() });
  }

  const quat = find('QUAT');
  if (quat) {
    r.seek(quat.offset);
    for (let i = 0; i < quat.length / 16; i++) ctx.quaternions.push({ x: r.f32(), y: r.f32(), z: r.f32(), w: r.f32() });
  }

  // CUST: figures back to back; a "custom" property references one by its
  // byte offset from the section start (XUIHelper recomputes 0x10 + n*0x18
  // per figure; keying by offset is the same thing without the arithmetic).
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
        points.push({
          point: { x: r.f32(), y: r.f32() },
          control1: { x: r.f32(), y: r.f32() },
          control2: { x: r.f32(), y: r.f32() },
        });
      }
      if (r.pos - start !== dataLength) throw new Error(`CUST figure at ${at}: declared ${dataLength} bytes, read ${r.pos - start}`);
      ctx.figures.set(at, { boundingBox, points });
    }
  }

  const data = find('DATA');
  if (!data) throw new Error('no DATA section');
  r.seek(data.offset);
  const root = readObject(ctx);
  if (r.pos !== data.offset + data.length) {
    throw new Error(`DATA section: read ended at ${r.pos}, section ends at ${data.offset + data.length}`);
  }

  return { header, counts, sections, strings: ctx.strings, vectors: ctx.vectors, quaternions: ctx.quaternions, figures: ctx.figures, root };
}

function readObject(ctx: Ctx): XuObject {
  const { r } = ctx;
  const className = ctx.str(r.i16());
  const flags = r.u8();
  const obj: XuObject = { className, properties: [], children: [], namedFrames: [], timelines: [] };
  if (flags & 0x1) obj.properties = readProperties(ctx, className);
  if (flags & 0x2) {
    const n = r.u32();
    for (let i = 0; i < n; i++) obj.children.push(readObject(ctx));
  }
  if (flags & 0x4) {
    const nf = r.u32();
    for (let i = 0; i < nf; i++) obj.namedFrames.push(readNamedFrame(ctx));
    // DATA5Section.TryReadObject: an object with no children has no timeline
    // count at all, not a zero count.
    if (obj.children.length > 0) {
      const nt = r.u32();
      for (let i = 0; i < nt; i++) obj.timelines.push(readTimeline(ctx, obj));
    }
  }
  return obj;
}

/**
 * Property block: i16 total, then one packed byte per class in the
 * hierarchy (root first). packed & 7 = number of mask bytes that follow;
 * masks are stored most-significant group first, so they are reversed
 * before mask[i] bit j selects propDefs[i*8 + j].
 */
function readProperties(ctx: Ctx, className: string): XuProperty[] {
  const { r } = ctx;
  const total = r.i16();
  const out: XuProperty[] = [];
  trace?.(`object ${className} @${r.pos - 2}: ${total} properties`);
  for (const cls of ctx.reg.hierarchy(className)) {
    const packed = r.u8();
    trace?.(`  ${cls.name}: packed=${packed.toString(2).padStart(8, '0')}`);
    if (packed === 0) continue;
    const maskCount = packed & 0x7;
    const masks: number[] = [];
    for (let i = 0; i < maskCount; i++) masks.push(r.u8());
    masks.reverse();
    const before = out.length;
    readMasked(ctx, cls, masks, out);
    // The upper five bits of the packed byte hold (properties in this class - 1).
    // XUIHelper only writes this; reading it back is a per-class check that
    // every Blades file carries, count header or not.
    const declared = (packed >> 3) + 1;
    if (out.length - before !== declared) {
      throw new Error(`${className}/${cls.name}: packed byte declares ${declared} properties, masks selected ${out.length - before}`);
    }
  }
  if (out.length !== total) throw new Error(`${className}: property count ${out.length} != declared ${total}`);
  return out;
}

function readMasked(ctx: Ctx, cls: XuClassDef, masks: number[], out: XuProperty[]): void {
  for (let i = 0; i < masks.length; i++) {
    const mask = masks[i]!;
    if (mask === 0) continue;
    const defs = cls.props.slice(i * 8, i * 8 + 8);
    for (let j = 0; j < defs.length; j++) {
      if (mask & (1 << j)) out.push(readProperty(ctx, defs[j]!, true));
    }
    // A set bit beyond the class's definitions means the registry is missing
    // a property for this build; say so instead of silently misaligning.
    for (let j = defs.length; j < 8; j++) {
      if (mask & (1 << j)) throw new Error(`${cls.name}: mask bit ${i * 8 + j} set but the class declares only ${cls.props.length} properties`);
    }
  }
}

function readProperty(ctx: Ctx, def: XuPropertyDef, readIndex: boolean): XuProperty {
  const { r } = ctx;
  const indexed = def.flags.includes('indexed');
  let count = 1;
  if (readIndex && indexed) count = r.u8();
  const values: XuScalar[] = [];
  for (let i = 0; i < count; i++) values.push(readScalar(ctx, def));
  const value: XuValue = indexed ? values : values[0]!;
  return { def, value };
}

function readScalar(ctx: Ctx, def: XuPropertyDef): XuScalar {
  const { r } = ctx;
  switch (def.type) {
    case 'bool': return r.u8() > 0;
    case 'integer': return r.i32();
    case 'unsigned': return r.u32();
    case 'float': return r.f32();
    case 'string': return ctx.str(r.i16());
    case 'vector': {
      const i = r.i32();
      const v = ctx.vectors[i];
      if (!v) throw new Error(`${def.name}: vector index ${i} out of range (${ctx.vectors.length})`);
      return v;
    }
    case 'quaternion': {
      const i = r.i32();
      const q = ctx.quaternions[i];
      if (!q) throw new Error(`${def.name}: quaternion index ${i} out of range (${ctx.quaternions.length})`);
      return q;
    }
    case 'color': return { a: r.u8(), r: r.u8(), g: r.u8(), b: r.u8() };
    case 'custom': {
      const off = r.i32();
      const f = ctx.figures.get(off);
      if (!f) throw new Error(`${def.name}: no figure at CUST offset ${off}`);
      return f;
    }
    case 'object': return readCompound(ctx, def);
  }
}

/** XUR5ReadExtensions.TryReadObjectProperty. */
function readCompound(ctx: Ctx, def: XuPropertyDef): XuProperty[] {
  const { r } = ctx;
  const at = r.pos;
  const declaredValues = r.i16();
  const cls = ctx.reg.compoundClassFor(def);
  const depth = r.u8(); // hierarchical depth; informational
  const maskCount = Math.max(Math.ceil(cls.props.length / 8), 1);
  const masks: number[] = [];
  for (let i = 0; i < maskCount; i++) masks.push(r.u8());
  masks.reverse();
  const out: XuProperty[] = [];
  readMasked(ctx, cls, masks, out);
  trace?.(`compound ${def.name} @${at}: declared=${declaredValues} depth=${depth} masks=[${masks.map((m) => m.toString(2).padStart(8, '0'))}] read=${out.map((p) => p.def.name + '=' + JSON.stringify(p.value)).join(' ')} bytes=${Array.from(ctx.r.bytes.subarray(at, at + 24)).map((b) => b.toString(16).padStart(2, '0')).join(' ')}`);
  // A nested compound (Gradient inside Fill) counts as ONE value here; only
  // indexed lists count per element. (XUIHelper gets the same result by
  // accident: its `is List<object>` test never matches a List<XUProperty>.)
  let actual = 0;
  for (const p of out) actual += Array.isArray(p.value) && p.def.type !== 'object' ? p.value.length : 1;
  if (actual !== declaredValues) throw new Error(`${def.name}: compound value count ${actual} != declared ${declaredValues}`);
  return out;
}

function readNamedFrame(ctx: Ctx): XuNamedFrame {
  const { r } = ctx;
  const name = ctx.str(r.i16());
  const keyframe = r.i32();
  const cmd = r.u8();
  const command = NAMED_FRAME_COMMANDS[cmd];
  if (!command) throw new Error(`named frame "${name}": command byte ${cmd} is not valid`);
  const targetIx = r.i16();
  // Non-goto commands still carry the index field; -1 or the empty string
  // both mean "no target" (XUIHelper stores string.Empty for either).
  const target = targetIx === -1 ? null : ctx.str(targetIx) || null;
  return { name, keyframe, command, target };
}

/** XUR5ReadExtensions.TryReadTimeline, but kept as per-track values. */
function readTimeline(ctx: Ctx, owner: XuObject): XuTimeline {
  const { r, reg } = ctx;
  const elementId = ctx.str(r.i16());
  const element = owner.children.find((c) => idOf(c) === elementId);
  if (!element) throw new Error(`timeline targets "${elementId}" which is not a direct child of ${owner.className} "${idOf(owner)}"`);
  // Derived class first for the classIndex byte (the property block above
  // walks root first; the timeline block walks the other way).
  const classes = [...reg.hierarchy(element.className)].reverse();
  const trackCount = r.u32();
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
    const index = isIndexed ? r.i32() : null;
    if (def.flags.includes('indexed') !== isIndexed) {
      throw new Error(`timeline "${elementId}": track ${def.name} indexed flag ${isIndexed} disagrees with the registry`);
    }
    tracks.push({ path, def, index });
  }

  const keyframeCount = r.u32();
  const keyframes: XuKeyframe[] = [];
  for (let k = 0; k < keyframeCount; k++) {
    const keyframe = r.i32();
    const interp = r.u8();
    const easeIn = r.u8();
    const easeOut = r.u8();
    const easeScale = r.u8();
    const interpolation = INTERPOLATIONS[interp];
    if (!interpolation) throw new Error(`timeline "${elementId}" frame ${keyframe}: interpolation byte ${interp} is not valid`);
    const values: XuScalar[] = [];
    for (const t of tracks) values.push(readScalar(ctx, t.def));
    keyframes.push({ keyframe, interpolation, easeIn, easeOut, easeScale, values });
  }
  return { elementId, tracks, keyframes };
}

/** Optional trace sink for debugging layout problems (set from a tool). */
export let trace: ((msg: string) => void) | null = null;
export function setTrace(fn: ((msg: string) => void) | null): void {
  trace = fn;
}
