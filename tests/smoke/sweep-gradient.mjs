// Sweep the fill-transform model (GRADIENT_TRANSFORM in xuiEnums.ts) against
// the reference frames. Not part of npm run smoke: it is the experiment whose
// result is recorded in xuiEnums.ts, kept so the table can be regenerated.
//
//   SMOKE_URL=http://localhost:5231 node tests/smoke/sweep-gradient.mjs [stage2]
//   SMOKE_URL=http://localhost:5231 node tests/smoke/sweep-gradient.mjs wing
//
// Each candidate renders the System blade (f0051) and the Marketplace blade
// (f0034) through the console view at 1920x1080 and is scored on the tab stack
// the blade shows on its left (System) or right (Marketplace): luma NCC and
// MAD against the frame, the mean body luma, and the tab-edge valleys of the
// row profile (position and depth) - the edges are the radial-gradient rings
// of blade_grey_left / blade_grey_rt, so they are the thing the model decides.
//
// `wing` is not a sweep but a GATE, and it is here rather than in
// smoke-blades.mjs because the thing it holds still is the fill-transform
// model: those rings are all Rotation 0, so nothing the sweep scores can tell
// a rotated fill's Scale.x from its Scale.y. The wing can. It exits non-zero.
import puppeteer from 'puppeteer-core';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, compare, mean, rowProfile, colProfile, grad, profileFit, valleys } from './pixlab.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'out/sweep');
const FRAMES = resolve(HERE, '../../reference/frames/6717');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.SMOKE_URL ?? 'http://localhost:5173';

// Regions at 1080p. The tab stack sits left of the page on System and right of
// it on Marketplace (page edges from the glue spec §1.3); the body band avoids
// the header staircase and the footer.
const CASES = [
  { blade: 5, ref: 'f0051', stack: { x: 0, y: 140, w: 430, h: 740 }, body: { x: 40, y: 300, w: 380, h: 500 } },
  { blade: 1, ref: 'f0034', stack: { x: 1515, y: 140, w: 405, h: 740 }, body: { x: 1530, y: 300, w: 380, h: 500 } },
];

const stage2 = process.argv.includes('stage2');
const only = process.argv.find((a) => a.startsWith('only='))?.slice(5);

const candidates = [];
if (only) {
  candidates.push(Object.fromEntries(only.split(',').map((kv) => kv.split('='))));
} else if (!stage2) {
  for (const direction of ['shape', 'texture'])
    for (const origin of ['centre', 'topleft'])
      for (const rotation of [1, -1])
        for (const radial of ['axis', 'max', 'min', 'width', 'height'])
          candidates.push({ direction, origin, rotation, radial, translation: 'box', order: 'SRT' });
} else {
  // Refine around the stage-1 winner: translation units and the order.
  const best = { direction: process.env.DIR ?? 'texture', origin: process.env.ORIGIN ?? 'centre', rotation: Number(process.env.ROT ?? -1), radial: process.env.RADIAL ?? 'axis' };
  for (const translation of ['box', 'design'])
    for (const order of ['SRT', 'RST', 'TRS'])
      candidates.push({ ...best, translation, order });
}

mkdirSync(OUT, { recursive: true });
let browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
// A fresh page per render, and a fresh browser when one dies: eight or so
// full-dashboard renders in one renderer process were enough to crash it.
async function render(url, shot, before = null) {
  for (let attempt = 0; attempt < 3; attempt++) {
    let page = null;
    try {
      page = await browser.newPage();
      await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 90000 });
      await page.waitForFunction(() => document.body.dataset.ready === 'true' || !!document.querySelector('.banner'), { timeout: 90000 });
      if (before) await page.evaluate(before);
      await (await page.$('.xui-stage')).screenshot({ path: shot });
      await page.close();
      return;
    } catch (err) {
      console.error(`  render attempt ${attempt + 1} failed: ${err.message}`);
      try { await browser.close(); } catch { /* already gone */ }
      browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
    }
  }
  throw new Error(`could not render ${url}`);
}

/**
 * THE WING GATE. The one fill in the System rest frame that is both rotated
 * and non-uniformly scaled, so the one that decides whether Scale acts along
 * the box's axes (order SRT, what we render) or along the gradient's own
 * (RST/TRS). See GRADIENT_TRANSFORM in xuiEnums.ts for the authored numbers.
 *
 * The column is design x 2..20 = screen 3..34 at 1080p, the wing's left flank,
 * profiled down design y 70..700 every 2 px. Rotation -90 lays the gradient
 * axis down the box's 770-tall Y, so the authored ramp - 0xdc flat to stop
 * 0.376471, down to 0xc8 at 0.674510, up towards 0xf0 - appears as a plateau,
 * a knee, a minimum and a climb. Two landmarks carry it: the first sample a
 * full luma below the plateau, and the minimum. RST and TRS spend the whole
 * figure on 13% of the ramp and are monotone, so they have neither.
 *
 * The wing visual's `lines` group is hidden first. It holds a radial fill
 * whose interior is opaque 0xeb and which our model paints over the whole
 * wing; that is a real defect, recorded in xuiEnums.ts as UNRESOLVED, but it
 * is a stop-space question and it would otherwise hide the transform this
 * gate is here to hold still.
 */
const WING = { x0: 3, x1: 34, y0: 70, y1: 700, step: 2 };
function wingLandmarks(im) {
  const sy = (12 / 11) * 1.5, oy = -96;              // design y -> 1080p row
  const p = colProfile(im, WING.x0, WING.x1, 0, im.h);
  const ys = [], v = [];
  for (let dy = WING.y0; dy <= WING.y1; dy += WING.step) { ys.push(dy); v.push(p[Math.round(dy * sy + oy)]); }
  const flat = v.filter((_, i) => ys[i] >= 100 && ys[i] <= 250);
  const plateau = flat.reduce((a, b) => a + b, 0) / flat.length;
  let knee = 0;
  for (let i = 0; i < v.length; i++) if (ys[i] > 260 && v[i] < plateau - 1) { knee = ys[i]; break; }
  let mi = 0;
  for (let i = 0; i < v.length; i++) if (v[i] < v[mi]) mi = i;
  return { plateau, knee, min: v[mi], minY: ys[mi], end: v[v.length - 1] };
}

if (process.argv.includes('wing')) {
  const shot = `${OUT}/f0051-wing.png`;
  const hideLines = () => {
    document.querySelectorAll('[data-xui-id="wing_left"] [data-xui-id="lines"]')
      .forEach((e) => { e.style.visibility = 'hidden'; });
  };
  try {
    await render(`${BASE}/?zoom=1.5&mute&manual&blade=5`, shot, hideLines);
  } finally {
    await browser.close();
  }
  const want = wingLandmarks(readPng(`${FRAMES}/f0051.png`));
  const got = wingLandmarks(readPng(shot));
  const fails = [];
  const say = (n, a, b, tol) => {
    const ok = Math.abs(a - b) <= tol;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}: frame ${a.toFixed(1)}, ours ${b.toFixed(1)} (tolerance ${tol})`);
    if (!ok) fails.push(`${n}: frame ${a.toFixed(1)}, ours ${b.toFixed(1)}`);
  };
  console.log(`wing column x ${WING.x0}..${WING.x1}, design y ${WING.y0}..${WING.y1} (f0051, System rest frame)`);
  // 20 design px is two and a half times the 8 px the two profiles differ by,
  // and a quarter of the 80 px the topleft origin would move the knee.
  say('knee, design y', want.knee, got.knee, 20);
  say('minimum, design y', want.minY, got.minY, 20);
  // The feature no gradient-frame scale can produce: a minimum with a climb
  // after it. The frame's is 24.5 luma; ours must be at least half of that.
  const climb = (im) => { const l = wingLandmarks(im); return l.end - l.min; };
  const wantClimb = climb(readPng(`${FRAMES}/f0051.png`)), gotClimb = climb(readPng(shot));
  const ok = gotClimb >= wantClimb / 2;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} climb after the minimum: frame ${wantClimb.toFixed(1)} luma, ours ${gotClimb.toFixed(1)}`);
  if (!ok) fails.push(`climb after the minimum: frame ${wantClimb.toFixed(1)}, ours ${gotClimb.toFixed(1)}`);
  console.log(`  (plateau: frame ${want.plateau.toFixed(1)}, ours ${got.plateau.toFixed(1)} - lightness is the residual, not this gate)`);
  if (fails.length) { console.log('SWEEP_FAIL'); process.exit(1); }
  console.log('SWEEP_PASS');
  process.exit(0);
}

const refs = {};
const refStats = {};
for (const c of CASES) {
  const im = readPng(`${FRAMES}/${c.ref}.png`);
  refs[c.ref] = im;
  const prof = rowProfile(im, c.stack.x, c.stack.x + c.stack.w, c.body.y, c.body.y + c.body.h);
  refStats[c.ref] = { body: mean(im, c.body), prof, valleys: valleys(prof, 6, 6).map((v) => ({ x: v.x + c.stack.x, v: Math.round(v.v), depth: Math.round(v.depth) })) };
  console.log(`${c.ref}: body luma ${refStats[c.ref].body.toFixed(1)}; edge valleys ${refStats[c.ref].valleys.map((v) => `${v.x}(${v.v},-${v.depth})`).join(' ')}`);
}

const rows = [];
try {
  for (const cand of candidates) {
    const q = Object.entries(cand).map(([k, v]) => `${k}=${v}`).join(',');
    const tag = q.replace(/[^a-z0-9-]+/gi, '_');
    const scores = [];
    for (const c of CASES) {
      const shot = `${OUT}/${c.ref}-${tag}.png`;
      // Resumable: a candidate already rendered is only re-measured.
      if (!existsSync(shot)) await render(`${BASE}/?zoom=1.5&mute&manual&blade=${c.blade}&gradxf=${q}`, shot);
      const a = refs[c.ref], b = readPng(shot);
      const cmp = compare(a, b, c.stack);
      const pb = rowProfile(b, c.stack.x, c.stack.x + c.stack.w, c.body.y, c.body.y + c.body.h);
      const edge = profileFit(grad(refStats[c.ref].prof), grad(pb), 12);
      scores.push({
        ref: c.ref, ncc: cmp.ncc, mad: cmp.mad, body: mean(b, c.body), edgeNcc: edge.ncc, edgeShift: edge.shift,
        valleys: valleys(pb, 6, 6).map((v) => ({ x: v.x + c.stack.x, v: Math.round(v.v), depth: Math.round(v.depth) })),
      });
    }
    rows.push({ cand: q, scores });
    console.log(`${q}`);
    for (const s of scores) {
      console.log(`   ${s.ref}: ncc ${s.ncc.toFixed(4)} mad ${s.mad.toFixed(2)} body ${s.body.toFixed(1)} (ref ${refStats[s.ref].body.toFixed(1)}) edgeNcc ${s.edgeNcc.toFixed(3)}@${s.edgeShift} valleys ${s.valleys.map((v) => `${v.x}(${v.v},-${v.depth})`).join(' ')}`);
    }
  }
} finally {
  await browser.close();
}

// Rank by the sum over both blades of MAD (lower is better), then NCC.
rows.sort((p, q) => sum(p, 'mad') - sum(q, 'mad'));
console.log('\nranked by MAD over both stacks:');
for (const r of rows) console.log(`  ${sum(r, 'mad').toFixed(2)}  ncc ${sum(r, 'ncc').toFixed(3)}  edge ${sum(r, 'edgeNcc').toFixed(3)}  ${r.cand}`);
function sum(r, k) { return r.scores.reduce((a, s) => a + s[k], 0); }
