// XUIZ pack reader: a hand-built v1 pack proves the header and TOC arithmetic,
// then each extracted build's packs (6770, 9199) prove it against the real thing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { readXuiz, readXuizHeader, entryBytes, entryPath, checkTiling, XUIZ_HEADER_SIZE } from '@xuiz/xuiz';
import { parseXus } from '@xuiz/xus';
import { corpusBuilds, expectedCounts } from './builds';

function be32(v: number): number[] {
  return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
}
function be16(v: number): number[] {
  return [(v >> 8) & 0xff, v & 0xff];
}
function utf16be(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) out.push((s.charCodeAt(i) >> 8) & 0xff, s.charCodeAt(i) & 0xff);
  return out;
}

/** Build a valid XUIZ v1 pack from [name, body] pairs, laid out in order. */
function buildXuiz(files: [string, number[]][]): Uint8Array {
  const toc: number[] = [];
  let offset = 0;
  for (const [name, body] of files) {
    toc.push(...be32(body.length), ...be32(offset), name.length, ...utf16be(name));
    offset += body.length;
  }
  const data = files.flatMap(([, body]) => body);
  const size = XUIZ_HEADER_SIZE + toc.length + data.length;
  return new Uint8Array([
    0x58, 0x55, 0x49, 0x5a, // "XUIZ"
    ...be32(1), // version
    ...be32(size),
    ...be32(0),
    ...be32(toc.length), // dataOffset: the TOC's own length
    ...be16(files.length),
    ...toc,
    ...data,
  ]);
}

test('xuiz: header and TOC of a hand-built v1 pack', () => {
  const pack = buildXuiz([
    ['scene.xur', [0x58, 0x55, 0x49, 0x42, 1, 2, 3]],
    ['fr-fr\\scene.xus', [9, 9]],
  ]);
  const h = readXuizHeader(pack);
  assert.equal(h.version, 1);
  assert.equal(h.fileSize, pack.byteLength);
  assert.equal(h.entryCount, 2);
  assert.equal(h.dataStart, XUIZ_HEADER_SIZE + h.dataOffset);

  const p = readXuiz(pack);
  assert.deepEqual(p.entries.map((e) => e.name), ['scene.xur', 'fr-fr\\scene.xus']);
  assert.deepEqual([...entryBytes(pack, p.entries[0]!)], [0x58, 0x55, 0x49, 0x42, 1, 2, 3]);
  assert.deepEqual([...entryBytes(pack, p.entries[1]!)], [9, 9]);
  // The last body must end on the pack's last byte.
  assert.deepEqual(checkTiling(p, pack.byteLength), []);
});

test('xuiz: entryPath normalises separators and refuses traversal', () => {
  assert.equal(entryPath({ name: 'fr-fr\\scene.xus', size: 0, offset: 0, start: 0 }), 'fr-fr/scene.xus');
  assert.throws(() => entryPath({ name: '..\\evil', size: 0, offset: 0, start: 0 }), /unsafe/);
  assert.throws(() => entryPath({ name: '\\abs', size: 0, offset: 0, start: 0 }), /unsafe/);
});

test('xuiz: a wrong fileSize, a wrong magic and a short body all throw', () => {
  const good = buildXuiz([['a.bin', [1, 2, 3, 4]]]);

  const badMagic = Uint8Array.from(good);
  badMagic[3] = 0x59;
  assert.throws(() => readXuiz(badMagic), /not a XUIZ pack/);

  const badSize = Uint8Array.from(good);
  badSize[11] = (badSize[11]! + 1) & 0xff; // noUncheckedIndexedAccess
  assert.throws(() => readXuiz(badSize), /fileSize/);

  // Truncating the body leaves the TOC promising bytes that are not there.
  assert.throws(() => readXuiz(good.subarray(0, good.byteLength - 2)), /fileSize|overruns/);
});

test('xuiz: a gap in the data region is reported by checkTiling', () => {
  const pack = buildXuiz([['a', [1, 2]], ['b', [3, 4]]]);
  const p = readXuiz(pack);
  p.entries[1]!.start += 1; // pretend the second body starts one byte late
  const problems = checkTiling(p, pack.byteLength);
  assert.equal(problems.length, 2, problems.join('; '));
  assert.match(problems[0]!, /gap of 1 bytes before "b"/);
});

// --- corpus -----------------------------------------------------------------

for (const BUILD of corpusBuilds()) {
const RESOURCES = `extracted/${BUILD}/resources`;
const haveResources = existsSync(RESOURCES);

test(`xuiz corpus ${BUILD}: every extracted resource pack reads and tiles`, { skip: haveResources ? false : `${RESOURCES} not extracted` }, () => {
  const files = readdirSync(RESOURCES)
    .map((f) => join(RESOURCES, f))
    .filter((f) => statSync(f).isFile());
  let packs = 0;
  let entries = 0;
  let notXuiz = 0;
  for (const f of files) {
    const bytes = new Uint8Array(readFileSync(f));
    if (String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!) !== 'XUIZ') {
      notXuiz++; // FFFE07D1 is an XDBF database, not a UI pack
      continue;
    }
    const p = readXuiz(bytes);
    assert.deepEqual(checkTiling(p, bytes.byteLength), [], f);
    assert.equal(p.entries.length, p.header.entryCount);
    for (const e of p.entries) {
      entryPath(e); // throws on a name that would escape the output directory
      assert.equal(entryBytes(bytes, e).byteLength, e.size);
    }
    packs++;
    entries += p.entries.length;
  }
  // The XEX holds all packs but shrdres.xzp, which sits loose beside it.
  assert.equal(packs, expectedCounts(BUILD)['packs']! - 1, `expected ${expectedCounts(BUILD)['packs']! - 1} XUIZ packs in the XEX, read ${packs}`);
  console.log(`   xuiz corpus ${BUILD}: ${packs} packs, ${entries} entries (${notXuiz} non-XUIZ resource skipped)`);
});

test(`xuiz corpus ${BUILD}: .xus entries read straight out of a pack`, { skip: haveResources ? false : `${RESOURCES} not extracted` }, () => {
  // The unpacker writes files to disk; the browser runtime will not. Parsing
  // in place is the path that has to work, so exercise it here.
  let tables = 0;
  for (const f of readdirSync(RESOURCES).map((n) => join(RESOURCES, n))) {
    if (!statSync(f).isFile()) continue;
    const bytes = new Uint8Array(readFileSync(f));
    if (String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!) !== 'XUIZ') continue;
    for (const e of readXuiz(bytes).entries) {
      if (!entryPath(e).toLowerCase().endsWith('.xus')) continue;
      const t = parseXus(entryBytes(bytes, e));
      assert.equal(t.fileSize, e.size, `${f}:${e.name}`);
      tables++;
    }
  }
  assert.ok(tables > 3000, `expected the full string corpus, parsed ${tables}`);
  console.log(`   xuiz corpus ${BUILD}: ${tables} .xus tables parsed in place`);
});
}
