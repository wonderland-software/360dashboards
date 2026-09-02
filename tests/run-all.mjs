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

const SUITES = [
  'tests/smoke/smoke-boot.mjs',
  'tests/smoke/smoke-gallery.mjs',
  'tests/smoke/smoke-timeline.mjs',
  'tests/smoke/smoke-input.mjs',
  'tests/smoke/smoke-blades.mjs',
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
for (const suite of SUITES) {
  console.log(`\n== ${suite}`);
  const r = spawnSync(process.execPath, [suite], { stdio: 'inherit', env: { ...process.env, SMOKE_URL: base } });
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
