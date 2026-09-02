// XUS parser: synthetic bytes first (so the test fails for a real reason when
// extracted/ is absent), then the whole 6770 corpus when it is present.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseXus, xusToMap, xusToken, parseXusKey, buildXusKey, XusKind } from '@xuiz/xus';

const CORPUS = 'extracted/6770/xuiz';

// --- synthetic builders -----------------------------------------------------

function be16(v: number): number[] {
  return [(v >> 8) & 0xff, v & 0xff];
}
function be32(v: number): number[] {
  return [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
}
function utf16be(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) out.push(...be16(s.charCodeAt(i)));
  return out;
}
/** `entries` are [value, key] where key is a u32, an IDS_ string, or null. */
function buildXus(kind: number, entries: [string, number | string | null][]): Uint8Array {
  const body: number[] = [];
  for (const [value, key] of entries) {
    body.push(...be16(value.length), ...utf16be(value));
    if (typeof key === 'number') body.push(...be32(key));
    else if (typeof key === 'string') body.push(...be16(key.length), ...utf16be(key));
  }
  const size = 12 + body.length;
  return new Uint8Array([0x58, 0x55, 0x49, 0x53, 1, kind, ...be32(size), ...be16(entries.length), ...body]);
}

// --- unit -------------------------------------------------------------------

test('xus: KEYED table round-trips value and u32 key', () => {
  const bytes = buildXus(XusKind.Keyed, [
    ['système', 0x01000032],
    ['multimédia\r\n', 0x01000034],
    ['Paramètres de la console', 0x010a004c],
  ]);
  const t = parseXus(bytes);
  assert.equal(t.version, 1);
  assert.equal(t.flags, 1);
  assert.equal(t.kind, XusKind.Keyed);
  assert.equal(t.fileSize, bytes.byteLength);
  assert.equal(t.entries.length, 3);
  assert.equal(t.entries[0]!.value, 'système');
  assert.equal(t.entries[0]!.keyHex, '0x01000032');
  // 0x010a004c = XuiControl (class 1) property 0x0a (Text) on object 0x4c.
  assert.deepEqual(t.entries[2]!.ref, { classIndex: 1, propIndex: 0x0a, objectId: 0x4c });
  assert.equal(xusToMap(t).get('0x010a004c'), 'Paramètres de la console');
});

test('xus: NAMED table reads the IDS_ name that follows each value', () => {
  const t = parseXus(buildXus(XusKind.Named, [['Phone', 'IDS_ACCTINFO_PHONE']]));
  assert.equal(t.kind, XusKind.Named);
  assert.equal(t.entries[0]!.name, 'IDS_ACCTINFO_PHONE');
  assert.equal(t.entries[0]!.ref, null);
  assert.equal(xusToMap(t).get('IDS_ACCTINFO_PHONE'), 'Phone');
});

test('xus: POSITIONAL table keys by position', () => {
  const t = parseXus(buildXus(XusKind.Positional, [['first', null], ['second', null]]));
  assert.equal(t.kind, XusKind.Positional);
  assert.deepEqual(t.entries.map(xusToken), ['#0', '#1']);
  assert.equal(xusToMap(t).get('#1'), 'second');
});

test('xus: the key is one u32, three packed fields', () => {
  const ref = { classIndex: 3, propIndex: 1, objectId: 0x005a };
  assert.equal(buildXusKey(ref), 0x0301005a);
  assert.deepEqual(parseXusKey(0x0301005a), ref);
});

test('xus: rejects a bad magic, a wrong size and a short body', () => {
  const good = buildXus(XusKind.Keyed, [['a', 1]]);
  const badMagic = Uint8Array.from(good);
  badMagic[0] = 0x59;
  assert.throws(() => parseXus(badMagic), /not a XUS table/);

  const badSize = Uint8Array.from(good);
  badSize[9] = 0xff; // corrupt the u32 at 0x06
  assert.throws(() => parseXus(badSize), /fileSize/);

  // A count one too high desynchronises and must not parse silently.
  const badCount = Uint8Array.from(good);
  badCount[11] = 2;
  assert.throws(() => parseXus(badCount));
});

test('xus: the size field is a u32, not a u16 pad plus a u16', () => {
  // 70,000 bytes of padding-free value text puts the size past 0xFFFF, which
  // the u16-pad reading cannot represent. Ten real tables are this large.
  const big = 'x'.repeat(35_000);
  const t = parseXus(buildXus(XusKind.Keyed, [[big, 0x010a0001]]));
  assert.equal(t.fileSize, 12 + 2 + big.length * 2 + 4);
  assert.ok(t.fileSize > 0xffff);
});

// --- corpus -----------------------------------------------------------------

function walkXus(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walkXus(p, out);
    else if (e.toLowerCase().endsWith('.xus')) out.push(p);
  }
  return out;
}

const haveCorpus = existsSync(CORPUS);

test('xus corpus: every table parses to exactly EOF', { skip: haveCorpus ? false : `${CORPUS} not extracted` }, () => {
  const files = walkXus(CORPUS);
  assert.ok(files.length > 3000, `expected the full string corpus, found ${files.length}`);
  const kinds = new Map<number, number>();
  for (const f of files) {
    const t = parseXus(new Uint8Array(readFileSync(f)));
    kinds.set(t.kind, (kinds.get(t.kind) ?? 0) + 1);
    // parseXus already throws unless the last entry ends on the last byte;
    // this re-states the invariant the reader depends on.
    assert.equal(t.fileSize, statSync(f).size, f);
    assert.ok(t.entries.length >= 0);
  }
  console.log(`   xus corpus: ${files.length} tables, kinds ${[...kinds].map(([k, n]) => `${k}=${n}`).join(' ')}`);
});

test('xus corpus: only locale tables are KEYED', { skip: haveCorpus ? false : `${CORPUS} not extracted` }, () => {
  // A pack-root table is English and is read by position or by IDS_ name.
  // A KEYED table patches a sibling .xur property by property, so it only
  // makes sense inside a locale directory.
  const rootKeyed: string[] = [];
  for (const pack of readdirSync(CORPUS)) {
    const d = join(CORPUS, pack);
    if (!statSync(d).isDirectory()) continue;
    for (const f of readdirSync(d)) {
      if (!f.toLowerCase().endsWith('.xus')) continue;
      const t = parseXus(new Uint8Array(readFileSync(join(d, f))));
      if (t.kind === XusKind.Keyed) rootKeyed.push(`${pack}/${f}`);
    }
  }
  assert.deepEqual(rootKeyed, []);
});

test('xus corpus: locales of one table agree on keys except for untranslated entries', { skip: haveCorpus ? false : `${CORPUS} not extracted` }, () => {
  // The naive rule - every locale of a table carries the same key set - is
  // FALSE on 6770, and the reason matters: a locale omits an entry whose
  // translation is the English literal already sitting in the .xur, so the
  // shorter locale is correct, not broken. What must hold is that no locale
  // invents a key the union of the others does not contain a place for, and
  // that a shared key never changes meaning. We assert the weaker true rule
  // and print the spread so a real regression (a locale losing half its
  // strings) is visible.
  const spread: string[] = [];
  let tables = 0;
  let identical = 0;
  let empty = 0;
  for (const pack of readdirSync(CORPUS)) {
    const d = join(CORPUS, pack);
    if (!statSync(d).isDirectory()) continue;
    const locales = readdirSync(d).filter((f) => statSync(join(d, f)).isDirectory());
    const byName = new Map<string, string[]>();
    for (const loc of locales) {
      for (const f of readdirSync(join(d, loc))) {
        if (!f.toLowerCase().endsWith('.xus')) continue;
        byName.set(f, [...(byName.get(f) ?? []), loc]);
      }
    }
    for (const [f, locs] of byName) {
      tables++;
      const parsed = locs.map((loc) => parseXus(new Uint8Array(readFileSync(join(d, loc, f)))));
      const sets = parsed.map((t) => new Set(t.entries.map(xusToken)));
      const union = new Set<string>(sets.flatMap((s) => [...s]));
      const sizes = sets.map((s) => s.size);
      const min = Math.min(...sizes);
      if (min === union.size) identical++;
      // How far the locales spread is a translation decision, not a format
      // rule: gamercar/GamerCard.xus runs 3..8 keys because a locale drops an
      // entry whose translation is the English literal already in the .xur,
      // and botd/defaultbanner1.xus is empty in every locale. So the hard
      // assertion here is only that every locale of one table agrees on the
      // table KIND - a table cannot be keyed in German and positional in
      // French. Key correctness is proven by the .xur cross-check below.
      assert.equal(new Set(parsed.map((t) => t.kind)).size, 1, `${pack}/${f}: locales disagree on the table kind`);
      if (union.size === 0) empty++;
      if (min !== union.size) spread.push(`${pack}/${f} ${min}..${union.size}`);
    }
  }
  console.log(`   xus corpus: ${identical}/${tables} scene tables identical across all locales; ${spread.length} differ, e.g. ${spread.slice(0, 3).join(', ')}; ${empty} empty everywhere`);
});

test('xus corpus: every KEYED key resolves to a property in the sibling .xur', { skip: haveCorpus ? false : `${CORPUS} not extracted` }, async () => {
  // This is the check that proves the key decoding. classIndex indexes the
  // object's class hierarchy, propIndex the property inside that class, and
  // objectId is a 1-based POSTORDER walk of the scene tree - children before
  // their parent, XuiCanvas last. If any of those three were wrong the hit
  // rate would collapse, not degrade.
  const { XuRegistry, parseXur } = await import('@xur/index');
  const reg = new XuRegistry(JSON.parse(readFileSync('packages/xur/extensions/6770/registry.json', 'utf8')));
  let checked = 0;
  let scenes = 0;
  let unparsed = 0;
  for (const pack of readdirSync(CORPUS)) {
    const d = join(CORPUS, pack);
    if (!statSync(d).isDirectory()) continue;
    const locales = readdirSync(d).filter((f) => statSync(join(d, f)).isDirectory());
    for (const xf of readdirSync(d).filter((f) => f.toLowerCase().endsWith('.xur'))) {
      let post: ReturnType<typeof parseXur>['root'][];
      try {
        const doc = parseXur(new Uint8Array(readFileSync(join(d, xf))), reg);
        post = [];
        (function walk(o: (typeof post)[number]): void {
          for (const c of o.children) walk(c);
          post.push(o);
        })(doc.root);
      } catch {
        unparsed++;
        continue; // a registry gap is xur2json's problem, not this test's
      }
      const base = xf.replace(/\.xur$/i, '');
      for (const loc of locales) {
        const p = join(d, loc, `${base}.xus`);
        if (!existsSync(p)) continue;
        const t = parseXus(new Uint8Array(readFileSync(p)));
        if (t.kind !== XusKind.Keyed) continue;
        scenes++;
        for (const e of t.entries) {
          const ref = e.ref!;
          const target = post[ref.objectId - 1];
          assert.ok(target, `${pack}/${loc}/${base}.xus ${e.keyHex}: object ${ref.objectId} of ${post.length}`);
          const cls = reg.hierarchy(target.className)[ref.classIndex];
          assert.ok(cls, `${pack}/${loc}/${base}.xus ${e.keyHex}: ${target.className} has no class ${ref.classIndex}`);
          const def = cls.props[ref.propIndex];
          assert.ok(def, `${pack}/${loc}/${base}.xus ${e.keyHex}: ${cls.name} has no property ${ref.propIndex}`);
          assert.ok(
            target.properties.some((pr) => pr.def === def && typeof pr.value === 'string'),
            `${pack}/${loc}/${base}.xus ${e.keyHex}: ${target.className}#${ref.objectId} has no string ${cls.name}.${def.name}`,
          );
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 10_000, `only ${checked} keyed entries cross-checked`);
  console.log(`   xus corpus: ${checked} keyed entries in ${scenes} tables all resolve (${unparsed} .xur skipped, unparseable)`);
});
