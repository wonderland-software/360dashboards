// Parser unit tests on hand-built bytes (no Microsoft data in git), plus a
// corpus sweep that runs only when extracted/6770 exists locally.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BinaryReader, XuRegistry, parseXur, computeCounts, diffCounts, toXui } from '@xur/index';
import type { XuRegistryJson } from '@xur/model';

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
  assert.throws(() => parseXur(buildXur(), new XuRegistry(bad)), /declares only 16/);
});

const corpus = 'extracted/6770/xuiz';
test('Blades 6770 corpus: every scene parses and verifies', { skip: !existsSync(corpus) }, () => {
  const reg = new XuRegistry(JSON.parse(readFileSync('packages/xur/extensions/6770/registry.json', 'utf8')));
  const files: string[] = [];
  const walk = (d: string) => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p); else if (/\.xur$/i.test(e)) files.push(p); } };
  walk(corpus);
  assert.ok(files.length >= 263, `expected the full corpus, found ${files.length}`);
  for (const f of files) {
    const doc = parseXur(new Uint8Array(readFileSync(f)), reg);
    if (doc.counts) assert.deepEqual(diffCounts(doc.counts, computeCounts(doc.root, reg)), [], f);
  }
});
