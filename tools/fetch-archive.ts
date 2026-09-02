// Sparse-clone the dashboard archive with only the builds we work on.
//
//   node --import tsx tools/fetch-archive.ts [build-dir ...]
//
// Default: Blades/Retail/6770 and its devkit twin. The clone is
// blob-filtered so the 640 MB of other builds never download; add more
// paths later with `git -C vendor/archive sparse-checkout add <path>`.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';

const REPO = 'https://github.com/thedev0ps/Xbox-360-Dashboard-Archive.git';
const DIR = 'vendor/archive';
const paths = process.argv.slice(2).length ? process.argv.slice(2) : ['Blades/Retail/6770', 'Blades/Devkit/6719 (7776.0 XDK)'];

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
