// The smoke board, run serially against a dev server this script owns.
//
//   npm run smoke                 start vite, run every suite, stop vite
//   SMOKE_URL=http://... npm run smoke   use a server that is already up
//
// SERIAL on purpose: two headless Chromes on one machine fight for the GPU and
// fake failures in whichever suite loses. It also refuses to leave anything
// behind - the server it starts is killed on every exit path, including Ctrl-C.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';

// A suite is a COMMAND LINE, not a path. sweep-gradient.mjs is four programs
// behind one file and only its gates belong on a board.
//
// The bug that shape fixes (2026-09-03): the board listed `sweep-gradient.mjs`
// bare, and bare is the 40-candidate EXPLORATORY sweep - forty renders that
// print a ranking and exit 0 whatever they find. So `wing`, `stack` and
// `space` never ran and the board reported PASS on a file whose whole point is
// its gates. The file now REFUSES to run with no mode named, so the same
// mistake fails loudly instead of passing quietly.
const SUITES = [
  ['tests/smoke/smoke-boot.mjs'],
  ['tests/smoke/smoke-gallery.mjs'],
  ['tests/smoke/smoke-timeline.mjs'],
  ['tests/smoke/smoke-input.mjs'],
  ['tests/smoke/smoke-blades.mjs'],
  ['tests/smoke/smoke-nav.mjs'],
  // NXE 9199: the composed home page and one LegacyControl page, both measured
  // against the reference stills. It also re-checks that the DEFAULT route
  // still serves Blades 6770 on its own 1120x770 canvas.
  ['tests/smoke/smoke-nxe.mjs'],
  // The launcher: the Blades chrome on a bare `/`, the logo from the manifest,
  // the skin's rows, Right+Enter to ?build=9199, and the same layer budget.
  ['tests/smoke/smoke-launcher.mjs'],
  // The fill-transform gate: the only thing standing between the gradient
  // transform's order of operations and a silent regression.
  ['tests/smoke/sweep-gradient.mjs', 'wing'],
  // The tab-stack gate: the flat lightness residual, and the three hypotheses
  // ablation closed for it.
  ['tests/smoke/sweep-gradient.mjs', 'stack'],
  // The page-purple gate: the layer stack over the System page at rest, and
  // the BlendMode hypotheses the purple closed.
  ['tests/smoke/sweep-gradient.mjs', 'purple'],
];

let server = null;
let base = process.env.SMOKE_URL ?? null;

const stopServer = () => {
  if (server && server.exitCode === null) { try { server.kill('SIGTERM'); } catch { /* already gone */ } }
  server = null;
};
process.on('exit', stopServer);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stopServer(); process.exit(130); });

if (!base) {
  const port = await freePort();
  base = `http://localhost:${port}`;
  console.log(`starting vite on ${base}`);
  server = spawn('npx', ['vite', '--port', String(port), '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', () => {});
  server.stderr.on('data', (b) => process.stderr.write(b));
  if (!(await waitFor(base, 30000))) { console.error(`dev server never answered on ${base}`); stopServer(); process.exit(1); }
}

const results = [];
for (const cmd of SUITES) {
  const suite = cmd.join(' ');
  console.log(`\n== ${suite}`);
  const r = spawnSync(process.execPath, cmd, { stdio: 'inherit', env: { ...process.env, SMOKE_URL: base } });
  // A suite that dies on a signal has no status; that is a failure, not a pass.
  results.push({ suite, ok: r.status === 0 });
}
stopServer();

console.log('');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.suite}`);
const failed = results.filter((r) => !r.ok);
console.log(failed.length ? `SMOKE_ALL_FAIL (${failed.length}/${results.length})` : `SMOKE_ALL_PASS (${results.length}/${results.length})`);
process.exit(failed.length ? 1 : 0);

async function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
  });
}

async function waitFor(url, ms) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { const r = await fetch(url); if (r.ok) return true; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}
