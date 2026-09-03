// Parser unit tests on hand-built bytes (no Microsoft data in git), plus a
// corpus sweep per extracted build (6770, 9199, 17559), each with its own
// registry.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BinaryReader, XuRegistry, parseXur, computeCounts, diffCounts, computeCounts8, diffCounts8, toXui } from '@xur/index';
import type { XuRegistryJson } from '@xur/model';
import { corpusBuilds, expectedCounts } from './builds';

const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const be16 = (n: number) => [(n >>> 8) & 255, n & 255];
const f32 = (v: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setFloat32(0, v); return [...b]; };
const utf16 = (s: string) => [...be16(s.length), ...[...s].flatMap((c) => be16(c.charCodeAt(0)))];

/** A three-class hierarchy with 17 properties on the derived class so the
 *  mask decoder has to cope with three mask bytes and the reversal rule. */
const registry: XuRegistryJson = {
  version: 5, group: 'test',
  classes: [
    { name: 'Base', base: null, source: 't', props: [
      { id: 0, name: 'Id', type: 'string', flags: [], defaultValue: null, owner: 'Base' },
      { id: 1, name: 'Width', type: 'float', flags: [], defaultValue: null, owner: 'Base' },
      { id: 2, name: 'Position', type: 'vector', flags: [], defaultValue: null, owner: 'Base' },
      { id: 3, name: 'Show', type: 'bool', flags: [], defaultValue: null, owner: 'Base' },
    ] },
    { name: 'Mid', base: 'Base', source: 't', props: [] },
    { name: 'Leaf', base: 'Mid', source: 't', props: Array.from({ length: 17 }, (_, i) => ({ id: i, name: `P${i}`, type: i === 16 ? 'unsigned' as const : 'integer' as const, flags: [], defaultValue: null, owner: 'Leaf' })) },
    { name: 'Canvas', base: 'Base', source: 't', props: [] },
  ],
};

function buildXur(): Uint8Array {
  // STRN index 0 is the implicit empty string, so these are indices 1..5.
  const strings = ['Canvas', 'Leaf', 'root', 'kid', 'Enter'];
  const strn = strings.flatMap(utf16);
  const vect = [...f32(1), ...f32(2), ...f32(3)];
  // DATA: Canvas root {Width=10, Position=vect0} with one Leaf child
  // {Id="kid", Show=true, P0=7, P16=0xdeadbeef}, then a named frame and a
  // timeline on the root animating the child's Width.
  const leaf = [
    ...be16(2), 0x01 | 0x00, // class "Leaf", flags: properties
    ...be16(4), // total properties
    // Base: 1 mask byte, count 2 -> packed = (2-1)<<3 | 1
    ((2 - 1) << 3) | 1, 0b00001001, // Id (bit0) + Show (bit3)
    ...be16(4), 1, // Id="kid", Show=true
    0x00, // Mid: nothing
    // Leaf: 3 mask bytes, count 2; masks stored high group first: [m2, m1, m0]
    ((2 - 1) << 3) | 3, 0b00000001, 0b00000000, 0b00000001, // P16 and P0
    ...be32(7), ...be32(0xdeadbeef),
  ];
  const root = [
    ...be16(1), 0x01 | 0x02 | 0x04, // "Canvas", props + children + timeline data
    ...be16(2), ((2 - 1) << 3) | 1, 0b00000110, ...f32(10), ...be32(0), // Width, Position
    0x00, // Canvas class: nothing
    ...be32(1), ...leaf,
    ...be32(1), ...be16(5), ...be32(0), 0x00, ...be16(-1 & 0xffff), // named frame "Enter" @0, Play, no target
    ...be32(1), // one timeline
    ...be16(4), ...be32(1), // targets "kid", one track
    0x01, 0x02, 0x01, // depth 1, class index 2 (reversed hierarchy: Leaf, Mid, Base), property 1 = Width
    ...be32(2), // two keyframes
    ...be32(0), 0, 0, 0, 50, ...f32(0),
    ...be32(30), 2, 10, 20, 50, ...f32(100),
  ];
  const header = 20 + 3 * 12;
  const sections = [['STRN', strn], ['VECT', vect], ['DATA', root]] as const;
  let off = header;
  const table: number[] = [];
  for (const [tag, body] of sections) { table.push(...[...tag].map((c) => c.charCodeAt(0)), ...be32(off), ...be32(body.length)); off += body.length; }
  const total = off;
  return new Uint8Array([...'XUIB'].map((c) => c.charCodeAt(0)).concat(be32(5), be32(0), be16(0x0c), be32(total), be16(3), table, strn, vect, root));
}

test('BinaryReader is big-endian and bounds-checked', () => {
  const r = new BinaryReader(new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x00, 0x41]));
  assert.equal(r.u32(), 0x01020304);
  assert.equal(r.utf16be(1), 'A');
  assert.throws(() => r.u8());
});

test('parses a synthetic XUR: masks, hierarchy, named frame, timeline', () => {
  const doc = parseXur(buildXur(), new XuRegistry(registry));
  assert.equal(doc.root.className, 'Canvas');
  assert.deepEqual(doc.root.properties.map((p) => p.def.name), ['Width', 'Position']);
  const kid = doc.root.children[0]!;
  assert.deepEqual(kid.properties.map((p) => [p.def.name, p.value]), [['Id', 'kid'], ['Show', true], ['P0', 7], ['P16', 0xdeadbeef]]);
  assert.deepEqual(doc.root.namedFrames, [{ name: 'Enter', keyframe: 0, command: 'Play', target: null }]);
  const tl = doc.root.timelines[0]!;
  assert.equal(tl.elementId, 'kid');
  assert.equal(tl.tracks[0]!.def.name, 'Width');
  assert.deepEqual(tl.keyframes.map((k) => [k.keyframe, k.interpolation, k.values[0]]), [[0, 'Linear', 0], [30, 'Ease', 100]]);
  assert.match(toXui(doc.root), /<TimelineProp>Width<\/TimelineProp>/);
});

test('a wrong registry is caught, not silently misread', () => {
  const bad = structuredClone(registry);
  bad.classes[2]!.props.pop(); // Leaf now declares 16 props; P16's bit is beyond it
  // Either guard may fire first: the mask-byte count check or the bit-beyond-table check.
  assert.throws(() => parseXur(buildXur(), new XuRegistry(bad)), /declares/);
});

/**
 * A hand-built XUR v8: the same tree as buildXur() in v8's layout (twelve
 * packed counts, pooled floats, a shared property list, NAME/KEYD/KEYP
 * keyframes) so the v8 path is exercised without Microsoft data.
 */
function buildXur8(): Uint8Array {
  const cstr = (s: string) => [...Buffer.from(s, 'utf8'), 0];
  const strings = ['Canvas', 'Leaf', 'root', 'kid', 'Enter', 'kid2'];
  const strn = [...be32(strings.reduce((n, s) => n + s.length + 1, 0)), ...be16(strings.length), ...strings.flatMap(cstr)];
  const vect = [...f32(1), ...f32(2), ...f32(3)];
  const flot = [...f32(10), ...f32(0), ...f32(100)];
  const name = [5, ...be32(0).slice(3), 0]; // "Enter" @0, Play (no target field)
  // KEYD: frame 0 Linear, frame 30 Ease(10,20,50), frame 40 type 0xa with
  // VECT index 0 as its curve and the top two bits set; KEYP: FLOT 1, 2, 0
  const keyd = [0, 0x00, 0, 30, 0x02, 10, 20, 50, 1, 40, 0xca, 0, 2];
  const keyp = [1, 2, 0];
  // Leaf child: props total 4; Base mask Id|Show = 0b1001; Mid 0; Leaf P0|P16
  const leaf = [2, 0x01, 4, 0b1001, 4, 1, 0, 0xff, 0x00, 0x01, 0x00, 0x01, 7, 0xff, 0xde, 0xad, 0xbe, 0xef];
  // second child shares the first's property list (flag 8) -> index 1 (root's list is 0)
  const leaf2 = [2, 0x08, 1];
  const root = [
    1, 0x01 | 0x02 | 0x04, 2, 0b0110, 0, 0, 0, // Canvas: Width=FLOT[0], Position=VECT[0]; Canvas class mask 0
    2, ...leaf, ...leaf2, // two children
    1, 0, // one named frame, base 0
    1, // one timeline
    4, 1, 0x01, 0x02, 0x01, // "kid", 1 track: depth 1, class 2 (Leaf,Mid,Base reversed), prop 1 = Width
    3, 0, // three keyframes from KEYD base 0
  ];
  const counts = [3, 6, 2, 0, 0, 1, 1, 1, keyp.length, 3, 1, 1];
  const sections = [['STRN', strn], ['VECT', vect], ['FLOT', flot], ['KEYP', keyp], ['KEYD', keyd], ['NAME', name], ['DATA', root]] as const;
  const header = 20 + counts.length + sections.length * 12;
  let off = header;
  const table: number[] = [];
  for (const [tag, body] of sections) { table.push(...[...tag].map((c) => c.charCodeAt(0)), ...be32(off), ...be32(body.length)); off += body.length; }
  return new Uint8Array([...'XUIB'].map((c) => c.charCodeAt(0)).concat(be32(8), be32(0), be16(0x0e), be32(off), be16(sections.length), counts, table, ...sections.map(([, b]) => [...b])));
}

test('parses a synthetic XUR v8: packed masks, pooled floats, shared property list, NAME/KEYD/KEYP', () => {
  const doc = parseXur(buildXur8(), new XuRegistry(registry));
  assert.equal(doc.header.version, 8);
  assert.deepEqual(doc.root.properties.map((p) => [p.def.name, p.value]), [['Width', 10], ['Position', { x: 1, y: 2, z: 3 }]]);
  const kid = doc.root.children[0]!;
  assert.deepEqual(kid.properties.map((p) => [p.def.name, p.value]), [['Id', 'kid'], ['Show', true], ['P0', 7], ['P16', 0xdeadbeef]]);
  assert.deepEqual(doc.root.children[1]!.properties, kid.properties, 'flag 8 shares the earlier list');
  assert.deepEqual(doc.root.namedFrames, [{ name: 'Enter', keyframe: 0, command: 'Play', target: null }]);
  const tl = doc.root.timelines[0]!;
  assert.deepEqual(tl.keyframes.map((k) => [k.keyframe, k.interpolation, k.easeIn, k.easeOut, k.easeScale, k.values[0], k.flags8, k.extra8]), [[0, 'Linear', 0, 0, 0, 0, 0, null], [30, 'Ease', 10, 20, 50, 100, 2, null], [40, 'Linear', 0, 0, 0, 10, 0xca, 0]]);
  assert.deepEqual(tl.keyframes[2]!.curve8, { x: 1, y: 2, z: 3 }, 'a type-0xa record resolves its VECT index');
  assert.deepEqual(diffCounts8(doc.counts8!, computeCounts8(doc)), []);
});

test('a v8 keyframe type beyond the console\'s 0..0xc, or a curve index beyond VECT, is refused', () => {
  const good = buildXur8();
  const findSeq = (hay: Uint8Array, seq: number[]) => { for (let i = 0; i + seq.length <= hay.length; i++) if (seq.every((v, j) => hay[i + j] === v)) return i; return -1; };
  const bad1 = new Uint8Array(good); bad1[findSeq(bad1, [40, 0xca, 0, 2]) + 1] = 0x0d; // type 0xd
  assert.throws(() => parseXur(bad1, new XuRegistry(registry)), /beyond the console's 0\.\.0xc/);
  const bad2 = new Uint8Array(good); bad2[findSeq(bad2, [40, 0xca, 0, 2]) + 2] = 5; // VECT index 5 of 1
  assert.throws(() => parseXur(bad2, new XuRegistry(registry)), /beyond VECT/);
});

test('a v8 mask bit beyond the registry is caught', () => {
  const bad = structuredClone(registry);
  bad.classes[2]!.props.pop();
  assert.throws(() => parseXur(buildXur8(), new XuRegistry(bad)), /declares only/);
});

for (const BUILD of corpusBuilds()) {
const corpus = `extracted/${BUILD}/xuiz`;
test(`${BUILD} corpus: every scene parses and verifies with its own registry`, { skip: !existsSync(corpus) }, () => {
  const reg = new XuRegistry(JSON.parse(readFileSync(`packages/xur/extensions/${BUILD}/registry.json`, 'utf8')));
  const files: string[] = [];
  const walk = (d: string) => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p); else if (/\.xur$/i.test(e)) files.push(p); } };
  walk(corpus);
  assert.equal(files.length, expectedCounts(BUILD)['xur'], `expected the full ${BUILD} corpus`);
  for (const f of files) {
    const bytes = new Uint8Array(readFileSync(f));
    const doc = parseXur(bytes, reg);
    if (doc.counts) assert.deepEqual(diffCounts(doc.counts, computeCounts(doc.root, reg)), [], f);
    // Independent STRN walk (no shared code with the parser): every string,
    // including non-ASCII code units, must match what the parser produced.
    // The XUIHelper diff cannot see high bytes, so this is the only check
    // that a bullet stays a bullet.
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const v8 = dv.getUint32(4) === 8;
    let p = 20;
    if (v8) { for (let i = 0; i < 12; i++) { const b = bytes[p]!; p += b < 0xf0 ? 1 : b !== 0xff ? 2 : 5; } } // twelve packed counts
    else p += (dv.getUint32(8) & 1) ? 40 : 0;
    const n = dv.getUint16(18);
    let so = -1, sl = 0;
    for (let i = 0; i < n; i++, p += 12) if (String.fromCharCode(bytes[p]!, bytes[p + 1]!, bytes[p + 2]!, bytes[p + 3]!) === 'STRN') { so = dv.getUint32(p + 4); sl = dv.getUint32(p + 8); }
    const strings = [''];
    if (v8) {
      // v8: u32 character total, u16 count, NUL-terminated UTF-8 (decoded here
      // with TextDecoder, independently of BinaryReader.cstringUtf8).
      const count = dv.getUint16(so + 4);
      let q = so + 6;
      for (let i = 0; i < count; i++) { const s = q; while (bytes[q] !== 0) q++; strings.push(new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(s, q))); q++; }
      assert.equal(q, so + sl, `${f}: STRN strings do not end on the section end`);
    } else {
      for (let q = so; so >= 0 && q < so + sl;) { const len = dv.getUint16(q); q += 2; let t = ''; for (let k = 0; k < len; k++, q += 2) t += String.fromCharCode(dv.getUint16(q)); strings.push(t); }
    }
    assert.deepEqual(doc.strings, strings, `${f}: STRN mismatch`);
    if (v8) assert.deepEqual(diffCounts8(doc.counts8!, computeCounts8(doc)), [], f);
  }
});
}
