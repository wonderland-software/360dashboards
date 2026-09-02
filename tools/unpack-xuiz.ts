// Unpack one or more XUIZ packs to disk, with an independent probe that checks
// the table of contents against raw signature scans.
//
//   node --import tsx tools/unpack-xuiz.ts <pack> [...more] --out <dir> [--probe]
//
// What proves the offset rule (0x16 + dataOffset + entry.offset) is
// readXuiz's assert that the TOC ends exactly at the data start, plus
// checkTiling: entries must cover the data region gap-free and overlap-free
// to the last byte. --probe adds one more: every PNG / RIFF / XUIB / XUIS
// signature found anywhere in the data region must sit at an entry start
// (a stray signature would mean an entry boundary is wrong or a file hides
// another). It fails on strays.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, dirname } from 'node:path';
import { readXuiz, entryBytes, entryPath, checkTiling } from '@xuiz/xuiz';

const args = process.argv.slice(2);
const outIx = args.indexOf('--out');
const outDir = outIx >= 0 ? args[outIx + 1]! : null;
const probe = args.includes('--probe');
// Positionals are packs; the one value that follows --out is not.
const files = args.filter((a, i) => !a.startsWith('--') && !(outIx >= 0 && i === outIx + 1));
if (files.length === 0) {
  console.error('usage: unpack-xuiz.ts <pack> [...more] [--out <dir>] [--probe]');
  process.exit(2);
}

const SIGS: Record<string, number[]> = {
  png: [0x89, 0x50, 0x4e, 0x47],
  riff: [0x52, 0x49, 0x46, 0x46],
  xuib: [0x58, 0x55, 0x49, 0x42],
  xuis: [0x58, 0x55, 0x49, 0x53],
};

function scan(bytes: Uint8Array, sig: number[]): Set<number> {
  const hits = new Set<number>();
  outer: for (let i = 0; i + sig.length <= bytes.length; i++) {
    for (let j = 0; j < sig.length; j++) if (bytes[i + j] !== sig[j]) continue outer;
    hits.add(i);
  }
  return hits;
}

function kindOf(bytes: Uint8Array): string {
  for (const [k, sig] of Object.entries(SIGS)) {
    if (sig.every((b, i) => bytes[i] === b)) return k;
  }
  return 'other';
}

let failed = 0;
for (const file of files) {
  const bytes = new Uint8Array(readFileSync(file));
  const pack = readXuiz(bytes);
  const tiling = checkTiling(pack, bytes.byteLength);
  const kinds = new Map<string, number>();
  for (const e of pack.entries) {
    const k = kindOf(entryBytes(bytes, e));
    kinds.set(k, (kinds.get(k) ?? 0) + 1);
  }
  const summary = [...kinds.entries()].map(([k, n]) => `${k}=${n}`).join(' ');
  let verdict = 'OK';
  if (tiling.length) {
    verdict = 'TILING_FAIL';
    failed++;
    for (const p of tiling) console.log(`   ${p}`);
  }
  if (probe) {
    // Every signature hit inside the data region must be the START of an
    // entry of that kind, and every entry of that kind must be a hit. Hits
    // inside a body (a PNG embedded in a XUR would be a false hit) are
    // reported, not hidden.
    for (const [k, sig] of Object.entries(SIGS)) {
      const hits = scan(bytes, sig);
      const starts = new Set(pack.entries.filter((e) => kindOf(entryBytes(bytes, e)) === k).map((e) => e.start));
      const missing = [...starts].filter((s) => !hits.has(s));
      const stray = [...hits].filter((h) => !starts.has(h) && h >= pack.header.dataStart);
      if (missing.length) {
        verdict = 'PROBE_FAIL';
        failed++;
        console.log(`   ${k}: ${missing.length} entries whose start has no signature`);
      }
      if (stray.length) {
        verdict = 'PROBE_FAIL';
        failed++;
        console.log(`   ${k}: ${stray.length} signature hits not at an entry start, e.g. 0x${stray[0]!.toString(16)}`);
      }
    }
  }
  console.log(`${verdict} ${basename(file)} v${pack.header.version} entries=${pack.entries.length} ${summary}`);
  if (outDir) {
    const dir = join(outDir, basename(file).replace(/\.xzp$/, ''));
    for (const e of pack.entries) {
      const p = join(dir, entryPath(e));
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, entryBytes(bytes, e));
    }
  }
}
console.log(failed === 0 ? `XUIZ_PASS (${files.length} packs)` : `XUIZ_FAIL (${failed} problems)`);
process.exit(failed === 0 ? 0 : 1);
