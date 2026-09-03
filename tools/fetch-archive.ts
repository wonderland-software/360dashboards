// Sparse-clone the dashboard archive with only the builds we work on.
//
//   node --import tsx tools/fetch-archive.ts [build-dir ...]
//
// Default: every build in tools/builds.ts and its twins (Blades 6770 + devkit
// 6719, NXE 9199 + its devkit, Metro 17559). The clone is blob-filtered so
// the ~1 GB of other builds never downloads. `sparse-checkout set` REPLACES
// the pattern list, so a custom list must name every directory wanted; the
// paths are directories (a bare file such as Metro/V2/Retail/dashbigger.txt
// cannot be sparse-checked out by itself; read it with `git show HEAD:path`).
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { BUILDS } from './builds';

const REPO = 'https://github.com/thedev0ps/Xbox-360-Dashboard-Archive.git';
const DIR = 'vendor/archive';
const defaults = Object.values(BUILDS).flatMap((b) => [b.archive.replace(`${DIR}/`, ''), ...b.twins]);
const paths = process.argv.slice(2).length ? process.argv.slice(2) : defaults;

function git(args: string[]): void {
  const r = spawnSync('git', args, { stdio: 'inherit' });
  if (r.status !== 0) { console.error(`FETCH_FAIL git ${args.join(' ')}`); process.exit(1); }
}
if (!existsSync(DIR)) git(['clone', '--filter=blob:none', '--sparse', REPO, DIR]);
git(['-C', DIR, 'sparse-checkout', 'set', ...paths]);
for (const p of paths) {
  const f = `${DIR}/${p}/dash.xex`;
  if (!existsSync(f)) { console.error(`FETCH_FAIL ${f} missing after checkout`); process.exit(1); }
  console.log(`${p}/dash.xex ${statSync(f).size} bytes`);
}
console.log('FETCH_PASS');
