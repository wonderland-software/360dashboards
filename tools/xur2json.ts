// Parse XUR files and either dump one as JSON or sweep a corpus.
//
//   node --import tsx tools/xur2json.ts <file.xur> [--strict]      # JSON to stdout
//   node --import tsx tools/xur2json.ts --corpus <dir> [--strict]  # sweep every .xur under dir
//   --registry 6770|9199|v5   which class registry to parse with (default 6770,
//                             or DASH_BUILD); 6770 and 9199 are generated from
//                             their own executables (tools/build-registry.ts),
//                             v5 is XUIHelper's hand-written 9199 XML.
//
// --strict fails a file whose recomputed count header differs from the one
// stored in it. In corpus mode failures are grouped by message so a registry
// gap shows up as one line, not two hundred.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { XuRegistry, parseXur, computeCounts, diffCounts, type XurDocument } from '@xur/index';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const corpusIx = args.indexOf('--corpus');
const regIx = args.indexOf('--registry');
const regName = regIx >= 0 ? args[regIx + 1]! : process.env['DASH_BUILD'] || '6770';
const reg = new XuRegistry(JSON.parse(readFileSync(`packages/xur/extensions/${regName}/registry.json`, 'utf8')));

// Files without a count header (most Blades scenes; the flag is only set on
// large scenes) are still verified structurally by the parser itself: every
// object's declared property count, every class's packed-byte count, every
// compound's value count, and the DATA section ending on its last byte.
function check(doc: XurDocument): string[] {
  if (!doc.counts) return [];
  return diffCounts(doc.counts, computeCounts(doc.root, reg));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.toLowerCase().endsWith('.xur')) out.push(p);
  }
  return out;
}

if (corpusIx >= 0) {
  const dir = args[corpusIx + 1]!;
  const files = walk(dir);
  const failures = new Map<string, string[]>();
  let ok = 0;
  let noCounts = 0;
  for (const f of files) {
    try {
      const doc = parseXur(new Uint8Array(readFileSync(f)), reg);
      if (!doc.counts) noCounts++;
      const problems = check(doc);
      if (problems.length === 0) ok++;
      else for (const p of problems) failures.set(p, [...(failures.get(p) ?? []), relative(dir, f)]);
    } catch (err) {
      const msg = (err as Error).message.replace(/\d+/g, '#');
      failures.set(msg, [...(failures.get(msg) ?? []), relative(dir, f)]);
    }
  }
  for (const [msg, fs] of [...failures.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`${String(fs.length).padStart(4)}  ${msg}\n        e.g. ${fs.slice(0, 3).join(', ')}`);
  }
  console.log(`${ok === files.length ? 'XUR_PASS' : 'XUR_FAIL'} ${ok}/${files.length} scenes parse and verify (${files.length - noCounts} also match their stored count header; ${noCounts} carry none)`);
  process.exit(ok === files.length ? 0 : 1);
} else {
  // A bare positional is the file; skip the value that follows --registry.
  const file = args.find((a, i) => !a.startsWith('--') && !(regIx >= 0 && i === regIx + 1))!;
  const doc = parseXur(new Uint8Array(readFileSync(file)), reg);
  const problems = check(doc);
  const json = JSON.stringify(
    { header: doc.header, counts: doc.counts, computed: doc.counts ? computeCounts(doc.root, reg) : null, root: doc.root },
    (k, v) => (k === 'def' ? `${v.owner}.${v.name}` : v),
    2,
  );
  console.log(json);
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
}
