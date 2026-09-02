// One command that turns the two archive files into everything the browser
// runtime needs. Wired to `npm run extract`.
//
//   npm run extract              # skip any step whose output already exists
//   npm run extract -- --force   # redo every step
//
// Order matters: each step reads what the one before it wrote.
//   1. verify   vendor/archive files exist and match fixtures/hashes.json
//   2. listing  xex1tool -l          -> extracted/6770/xex-headers.txt
//   3. basefile xex1tool -b          -> extracted/6770/basefile.exe
//   4. resources xex1tool -d         -> extracted/6770/resources/<29 files>
//   5. unpack   unpack-xuiz --probe  -> extracted/6770/xuiz/<pack>/...
//   6. audio    convert-audio        -> public/assets/6770/audio/...
//   7. manifest build-manifest       -> public/assets/6770/manifest.json
//
// Step 5 feeds it the 28 XUIZ packs from the XEX plus the loose shrdres.xzp.
// The XEX also carries FFFE07D1, an XDBF database rather than a UI pack, so
// it is filtered out by magic instead of by name.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const force = process.argv.includes('--force');

const BUILD = '6770';
const ARCHIVE = `vendor/archive/Blades/Retail/${BUILD}`;
const XEX = join(ARCHIVE, 'dash.xex');
const XZP = join(ARCHIVE, 'shrdres.xzp');
const XEX1TOOL = 'vendor/idaxex/xex1tool/build/xex1tool';
const OUT = `extracted/${BUILD}`;
const HEADERS = join(OUT, 'xex-headers.txt');
const BASEFILE = join(OUT, 'basefile.exe');
const RESOURCES = join(OUT, 'resources');
const UNPACKED = join(OUT, 'xuiz');

const failures: string[] = [];
function step(name: string, detail: string): void {
  console.log(`  ${name.padEnd(9)} ${detail}`);
}
function fail(name: string, detail: string): void {
  failures.push(`${name}: ${detail}`);
  console.log(`  ${name.padEnd(9)} FAIL ${detail}`);
}

function run(name: string, cmd: string, args: string[], opts: { stdoutTo?: string } = {}): boolean {
  const r = opts.stdoutTo
    ? spawnSync('sh', ['-c', `${[cmd, ...args].map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(' ')} > '${opts.stdoutTo}'`], { stdio: 'inherit' })
    : spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    fail(name, `${cmd} exited ${r.status ?? 'on a signal'}`);
    return false;
  }
  return true;
}

// --- 1. verify --------------------------------------------------------------
interface HashFile {
  files: Record<string, { sha256: string; bytes: number; role: string }>;
}
const hashes = JSON.parse(readFileSync('fixtures/hashes.json', 'utf8')) as HashFile;
let verified = 0;
let missingRequired = 0;
for (const [file, meta] of Object.entries(hashes.files)) {
  if (!existsSync(file)) {
    if (meta.role === 'required') {
      fail('verify', `${file} is missing`);
      missingRequired++;
    }
    continue;
  }
  const got = createHash('sha256').update(readFileSync(file)).digest('hex');
  if (got !== meta.sha256) {
    fail('verify', `${file} is sha256 ${got.slice(0, 16)}..., expected ${meta.sha256.slice(0, 16)}...`);
    if (meta.role === 'required') missingRequired++;
    continue;
  }
  verified++;
}
if (missingRequired === 0) step('verify', `${verified}/${Object.keys(hashes.files).length} archive files match fixtures/hashes.json`);

if (missingRequired === 0 && !existsSync(XEX1TOOL)) {
  fail('verify', `${XEX1TOOL} is not built`);
  missingRequired++;
}

if (missingRequired === 0) {
  mkdirSync(OUT, { recursive: true });

  // --- 2. listing -----------------------------------------------------------
  if (force || !existsSync(HEADERS)) {
    if (run('listing', XEX1TOOL, ['-l', XEX], { stdoutTo: HEADERS })) step('listing', `${HEADERS} (${statSync(HEADERS).size} bytes)`);
  } else step('listing', `${HEADERS} already present`);

  // --- 3. basefile ----------------------------------------------------------
  if (force || !existsSync(BASEFILE)) {
    if (run('basefile', XEX1TOOL, ['-b', BASEFILE, XEX])) step('basefile', `${BASEFILE} (${statSync(BASEFILE).size} bytes)`);
  } else step('basefile', `${BASEFILE} already present`);

  // --- 4. resources ---------------------------------------------------------
  const haveResources = existsSync(RESOURCES) && readdirSync(RESOURCES).length > 0;
  if (force || !haveResources) {
    mkdirSync(RESOURCES, { recursive: true });
    if (run('resources', XEX1TOOL, ['-d', RESOURCES, XEX])) step('resources', `${readdirSync(RESOURCES).length} named resources in ${RESOURCES}`);
  } else step('resources', `${readdirSync(RESOURCES).length} resources already present`);

  // --- 5. unpack ------------------------------------------------------------
  const isXuiz = (f: string): boolean => {
    const b = readFileSync(f);
    return b.length >= 4 && b[0] === 0x58 && b[1] === 0x55 && b[2] === 0x49 && b[3] === 0x5a;
  };
  const packs = existsSync(RESOURCES)
    ? readdirSync(RESOURCES).map((f) => join(RESOURCES, f)).filter((f) => statSync(f).isFile() && isXuiz(f)).sort()
    : [];
  const haveUnpacked = existsSync(UNPACKED) && readdirSync(UNPACKED).length > 0;
  if (failures.length === 0) {
    if (force || !haveUnpacked) {
      if (run('unpack', 'node', ['--import', 'tsx', 'tools/unpack-xuiz.ts', ...packs, XZP, '--probe', '--out', UNPACKED])) {
        step('unpack', `${packs.length} XEX packs + shrdres.xzp into ${UNPACKED}`);
      }
    } else step('unpack', `${readdirSync(UNPACKED).length} packs already unpacked`);
  }

  // --- 6. audio -------------------------------------------------------------
  if (failures.length === 0) {
    if (run('audio', 'node', ['--import', 'tsx', 'tools/convert-audio.ts', ...(force ? ['--force'] : [])])) step('audio', 'converted to Ogg Opus');
  }

  // --- 7. manifest ----------------------------------------------------------
  if (failures.length === 0) {
    if (run('manifest', 'node', ['--import', 'tsx', 'tools/build-manifest.ts'])) step('manifest', `public/assets/${BUILD}/manifest.json`);
  }
}

console.log(failures.length === 0 ? 'EXTRACT_PASS' : `EXTRACT_FAIL ${failures.length} step(s): ${failures.join('; ')}`);
process.exit(failures.length === 0 ? 0 : 1);
