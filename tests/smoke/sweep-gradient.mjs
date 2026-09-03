// Sweep the fill-transform model (GRADIENT_TRANSFORM in xuiEnums.ts) against
// the reference frames. Not part of npm run smoke: it is the experiment whose
// result is recorded in xuiEnums.ts, kept so the table can be regenerated.
//
//   SMOKE_URL=http://localhost:5231 node tests/smoke/sweep-gradient.mjs [stage2]
//   SMOKE_URL=http://localhost:5231 node tests/smoke/sweep-gradient.mjs wing
//   SMOKE_URL=http://localhost:5231 node tests/smoke/sweep-gradient.mjs stack
//   SMOKE_URL=http://localhost:5231 node tests/smoke/sweep-gradient.mjs space
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
//
// `stack` is the second gate. It holds still what is LEFT after the transform
// is right - the flat lightness of the tab stack on f0051 - and the three
// hypotheses ablation CLOSED for it, so nobody re-opens them by hand. It also
// exits non-zero.
//
// `space` is the COLOUR-SPACE experiment, not a gate: it regenerates every
// table in the GradientStopSpace block of xuiEnums.ts. It is the only part of
// this file that measures against the SAME-BUILD 6770 capture rather than the
// 6717 one, and it never reads a region mean - achromatic flat blocks binned
// by luma for the chrome, per-channel means for the saturated page.
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

/**
 * THE STACK ABLATION GATE (`stack`). The wing gate holds the fill transform
 * still; this one holds still what is LEFT after it - the flat lightness of
 * the System blade's tab stack on f0051 - and, more usefully, the three
 * hypotheses that ablation CLOSED, so that nobody re-opens them by hand.
 *
 * The columns are the ones xuiEnums.ts and the README quote: a 40x300 rect
 * CENTRED on 1080p x = 60 / 200 / 340 over y 300..600, plus five 40x6 samples
 * down each of them. `lines` (the wing visual's opaque radial disc, still
 * UNRESOLVED) is hidden throughout, because with it in the picture the x=60
 * column carries a y-dependence that swamps everything else.
 *
 * Three assertions, one per closed hypothesis:
 *   OCCLUDED  hiding white_cover / black_cover / BG_color_2 / Background /
 *             content_panel_blink / Tab5 must move all three columns by less
 *             than 0.5 luma. They are behind the opaque wing and tab figures,
 *             so nothing about THEM can be the residual.
 *   BLEND     remapping BlendMode 2/3/4/5 to any CSS mode must likewise move
 *             the three columns by less than 0.5 luma - which is why f0051's
 *             stack can never settle 3/4/5, whatever the sweep in xuiEnums.ts
 *             says about the top band.
 *   RESIDUAL  the residual itself, +12.0 / +19.7 / +18.9, within 2 luma, plus
 *             the right wing (+9.0) and the page interior (-3.1). The page is
 *             the CONTROL: it already agrees, so a rule that darkens the
 *             chrome must leave it alone. FillColor modulation of gradient
 *             fills fails exactly there (page interior -37.7 with it on); the
 *             table is in xuiEnums.ts under MODULATE_GRADIENT_BY_FILLCOLOR.
 * It exits non-zero.
 *
 * Its numbers are unchanged by the colour-space work of 2026-09-03: the
 * shipped stop space is still 'sRGB', and `space` section 2 shows that hiding
 * any translucent page layer moves the achromatic fit by nothing at all. If a
 * future change moves these three, re-baseline them only with the measurement
 * that justifies it in the commit message.
 */
const STACK_COLS = [60, 200, 340];
const STACK_ROWS = [300, 450, 600, 750, 900];
// The RIGHT wing (the same `wing` visual, mirrored) and the page interior. The
// wing carries the residual with no tab stack over it, and the page is the
// CONTROL: it agrees with the frame already, so anything that moves it is
// wrong however much it helps the chrome. Both were added when FillColor
// modulation was tested and refused (see xuiEnums.ts).
const RWING = { x: 1860, y: 400, w: 40, h: 200 };
const PAGE = { x: 700, y: 300, w: 700, h: 500 };
function stackProfile(im) {
  return {
    col: STACK_COLS.map((x) => mean(im, { x: x - 20, y: 300, w: 40, h: 300 })),
    dots: STACK_COLS.map((x) => STACK_ROWS.map((y) => mean(im, { x: x - 20, y: y - 3, w: 40, h: 6 }))),
    wing: mean(im, RWING),
    page: mean(im, PAGE),
  };
}

if (process.argv.includes('stack')) {
  // Ablations that must do nothing (occluded), then blend remaps that must do
  // nothing, then the two that DO paint there - the whole list of what covers
  // 1080p x < 350 at the System rest frame.
  const cases = [
    { tag: 'baseline (lines hidden)', q: 'hide=lines', expect: 'residual' },
    { tag: 'hide white_cover   (BlendMode 5)', q: 'hide=lines,white_cover', expect: 'occluded' },
    { tag: 'hide black_cover   (BlendMode 2)', q: 'hide=lines,black_cover', expect: 'occluded' },
    { tag: 'hide BG_color_2', q: 'hide=lines,BG_color_2', expect: 'occluded' },
    { tag: 'hide Background    (BlendMode 3/4)', q: 'hide=lines,Background', expect: 'occluded' },
    { tag: 'hide content_panel_blink', q: 'hide=lines,content_panel_blink', expect: 'occluded' },
    { tag: 'hide Tab5          (the page)', q: 'hide=lines,Tab5', expect: 'occluded' },
    { tag: 'blend 2 -> normal', q: 'hide=lines&blend=2:normal', expect: 'blend' },
    { tag: 'blend 3 -> multiply', q: 'hide=lines&blend=3:multiply', expect: 'blend' },
    { tag: 'blend 4 -> multiply', q: 'hide=lines&blend=4:multiply', expect: 'blend' },
    { tag: 'blend 5 -> multiply', q: 'hide=lines&blend=5:multiply', expect: 'blend' },
    { tag: 'hide blade_topshadow_left', q: 'hide=lines,blade_topshadow_left', expect: 'paints' },
    { tag: 'hide wing_left', q: 'hide=lines,wing_left', expect: 'paints' },
  ];
  const ref = stackProfile(readPng(`${FRAMES}/f0051.png`));
  const got = {};
  try {
    for (const c of cases) {
      const shot = `${OUT}/f0051-stack-${c.q.replace(/[^a-z0-9]+/gi, '_')}.png`;
      if (!existsSync(shot)) await render(`${BASE}/?zoom=1.5&mute&manual&blade=5&${c.q}`, shot);
      got[c.tag] = stackProfile(readPng(shot));
    }
  } finally {
    await browser.close();
  }
  const base = got['baseline (lines hidden)'];
  const d = (p) => p.col.map((v, i) => v - ref.col[i]);
  const sign = (v) => (v >= 0 ? '+' : '') + v.toFixed(1);
  const fails = [];
  console.log('f0051 System rest, 1080p columns centred on x=60/200/340, y 300..600');
  console.log(`  frame                              ${ref.col.map((v) => v.toFixed(1).padStart(7)).join('')}`);
  for (const c of cases) {
    const p = got[c.tag];
    const moved = p.col.map((v, i) => v - base.col[i]);
    console.log(`  ${c.tag.padEnd(34)}${d(p).map((v) => sign(v).padStart(7)).join('')}   moved ${moved.map((v) => sign(v)).join(' / ')}`);
    if ((c.expect === 'occluded' || c.expect === 'blend') && moved.some((v) => Math.abs(v) > 0.5)) {
      fails.push(`${c.tag} was expected to be inert (${c.expect}) and moved ${moved.map(sign).join('/')}`);
    }
  }
  // The residual itself. 2 luma is a quarter of the smallest of the three and
  // twice the run-to-run spread of a headless render.
  const RESIDUAL = [12.0, 19.7, 18.9];
  d(base).forEach((v, i) => {
    const ok = Math.abs(v - RESIDUAL[i]) <= 2;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} residual at x=${STACK_COLS[i]}: recorded ${sign(RESIDUAL[i])}, now ${sign(v)}`);
    if (!ok) fails.push(`residual at x=${STACK_COLS[i]}: recorded ${sign(RESIDUAL[i])}, now ${sign(v)}`);
  });
  // The right wing carries the same residual with no stack over it, and the
  // page interior is the control: a rule that darkens the chrome must move the
  // first and not the second.
  for (const [name, key, want] of [['right wing', 'wing', 9.0], ['page interior (CONTROL)', 'page', -3.1]]) {
    const v = base[key] - ref[key];
    const ok = Math.abs(v - want) <= 2;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}: recorded ${sign(want)}, now ${sign(v)} (frame ${ref[key].toFixed(1)}, ours ${base[key].toFixed(1)})`);
    if (!ok) fails.push(`${name}: recorded ${sign(want)}, now ${sign(v)}`);
  }
  console.log(`  (down x=60: ${base.dots[0].map((v, i) => sign(v - ref.dots[0][i])).join(' ')} at y 300/450/600/750/900 - flat, so no layer with a y ramp is missing)`);
  if (fails.length) { for (const f of fails) console.log(`  FAIL ${f}`); console.log('SWEEP_FAIL'); process.exit(1); }
  console.log('SWEEP_PASS');
  process.exit(0);
}

/**
 * THE COLOUR-SPACE EXPERIMENT (`space`). Not a gate - the record behind the
 * GradientStopSpace block in xuiEnums.ts, kept so the tables can be
 * regenerated. It measures against the SAME-BUILD 6770 capture (blade 5 vs
 * f0042, blade 2 vs f0030), because an absolute colour question needs the
 * build we render, and it judges the way README-6770 says to: achromatic flat
 * 16x16 blocks binned by luma for the chrome, per-channel means for the
 * saturated page. Three sections:
 *   1  stop space - sRGB / linearRGB-attr / linear / pwl through ?gradxf=
 *   2  compositing - ablate each translucent layer, then redo it in linear
 *      light offline from (backdrop, our result) and score both
 *   3  a GLOBAL transfer curve on our finished output
 * Blade 2's page is deliberately not read per channel: 6770's console is
 * signed in, so its Xbox LIVE page is different CONTENT.
 */
const F70 = resolve(HERE, '../../reference/frames/6770-boot');
const SPACE_CASES = [
  { blade: 5, ref: `${F70}/f0042.png`, name: '6770 f0042', purple: { x: 1450, y: 620, w: 200, h: 120 } },
  { blade: 2, ref: `${F70}/f0030.png`, name: '6770 f0030', purple: null },
];
const SPACES = ['sRGB', 'linearRGB-attr', 'linear', 'pwl'];
// Every translucent or blended layer over the System page, with the blend and
// the source colour its stops carry (from the live DOM).
const LAYERS = [
  { id: 'white_cover', mode: 'screen', src: 235 },
  { id: 'Main_Panel', mode: 'screen', src: 205 },
  { id: 'top', mode: 'multiply', src: null },
  { id: 'black_cover', mode: 'multiply', src: null },
  { id: 'color_front', mode: null, src: null },
  { id: 'thing1,thing2,thing3', mode: null, src: null },
];

const px = (im, x, y) => { const i = (y * im.w + x) * im.ch; return [im.data[i], im.data[i + 1], im.data[i + 2]]; };
const LUM = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const SAT = (c) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
const linS = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const encS = (l) => { const c = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055; return Math.max(0, Math.min(255, c * 255)); };
// The 360's PWL gamma, the same four segments as figure.ts (see xuiEnums.ts).
const linP = (e) => {
  const v = Math.max(0, Math.min(255, e));
  const [k, o, s] = v < 64 ? [1, 0, 1 / 1024] : v < 96 ? [2, -64, 2 / 1024] : v < 192 ? [4, -256, 4 / 1024] : [8, -1024, 8 / 1024];
  let l = k * v + o; l += Math.trunc(l * s); return l / 1023;
};
const encP = (l) => {
  const v = Math.max(0, Math.min(1, l));
  const [s, o] = v < 64 / 1023 ? [1023, 0] : v < 128 / 1023 ? [1023 / 2, 32] : v < 512 / 1023 ? [1023 / 4, 64] : [1023 / 8, 128];
  return Math.max(0, Math.min(255, Math.trunc(v * s) + o));
};

/** Locally flat achromatic 16x16 blocks common to both images, with an
 *  optional LUT applied to ours. Flat is luma std < 3 and mean channel spread
 *  < 10 in BOTH, which is what makes a luma comparison mean anything. */
function achromaticBlocks(ours, ref, lut = null) {
  const out = [];
  for (let by = 0; by + 16 <= ours.h; by += 16) for (let bx = 0; bx + 16 <= ours.w; bx += 16) {
    let sa = 0, sa2 = 0, sb = 0, sb2 = 0, qa = 0, qb = 0, n = 0;
    for (let y = by; y < by + 16; y++) for (let x = bx; x < bx + 16; x++) {
      let a = px(ours, x, y); if (lut) a = [lut[a[0]], lut[a[1]], lut[a[2]]];
      const b = px(ref, x, y);
      const la = LUM(a), lb = LUM(b);
      sa += la; sa2 += la * la; sb += lb; sb2 += lb * lb; qa += SAT(a); qb += SAT(b); n++;
    }
    const ma = sa / n, mb = sb / n;
    if (Math.sqrt(Math.max(0, sa2 / n - ma * ma)) < 3 && Math.sqrt(Math.max(0, sb2 / n - mb * mb)) < 3 && qa / n < 10 && qb / n < 10) out.push({ ma, mb });
  }
  return out;
}
function binLine(bs) {
  const cells = [];
  for (let v = 160; v < 230; v += 10) {
    const s = bs.filter((b) => b.ma >= v && b.ma < v + 10);
    cells.push(s.length < 4 ? '        .' : `${(s.reduce((q, b) => q + (b.ma - b.mb), 0) / s.length).toFixed(1)}[${s.length}]`.padStart(9));
  }
  const n = bs.length, mx = bs.reduce((s, b) => s + b.ma, 0) / n, my = bs.reduce((s, b) => s + b.mb, 0) / n;
  let sxx = 0, sxy = 0; for (const b of bs) { sxx += (b.ma - mx) ** 2; sxy += (b.ma - mx) * (b.mb - my); }
  const a = sxy / sxx, c = my - a * mx;
  let r = 0, r0 = 0; for (const b of bs) { r += (b.mb - (a * b.ma + c)) ** 2; r0 += (b.mb - b.ma) ** 2; }
  return `${cells.join('')}   ${a.toFixed(4)}x ${c >= 0 ? '+' : '-'} ${Math.abs(c).toFixed(2)} rms ${Math.sqrt(r / n).toFixed(2)} (id ${Math.sqrt(r0 / n).toFixed(2)}) n=${n}`;
}
const meanRgbOf = (im, r) => {
  const s = [0, 0, 0]; let n = 0;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { const c = px(im, x, y); s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; n++; }
  return s.map((v) => v / n);
};
const rgbCell = (c) => `${c[0].toFixed(1).padStart(6)}${c[1].toFixed(1).padStart(7)}${c[2].toFixed(1).padStart(7)}${(Math.max(...c) - Math.min(...c)).toFixed(1).padStart(9)}`;

/**
 * One translucent layer redone in linear light, from (backdrop, our result).
 * A screen at alpha a over backdrop B with source S is B + a*S*(1-B) and a
 * multiply is B*(1 + a*(S-1)), both in whatever space the compositor works in.
 * With the source colour known, a is recovered per pixel by least squares over
 * the three channels; a multiply layer here has alpha 1, so S itself comes out
 * of our result directly. Only pixels the layer changes, and only where the
 * backdrop is locally flat, so text and edges never enter.
 */
function recomposite(base, off, ref, mode, src) {
  const flat = (im, x, y, b) => [[-2, 0], [2, 0], [0, -2], [0, 2]].every(([dx, dy]) => {
    const q = px(im, Math.max(0, Math.min(im.w - 1, x + dx)), Math.max(0, Math.min(im.h - 1, y + dy)));
    return Math.abs(q[0] - b[0]) + Math.abs(q[1] - b[1]) + Math.abs(q[2] - b[2]) <= 6;
  });
  const sums = [0, 0, 0], suml = [0, 0, 0], sumf = [0, 0, 0], sumb = [0, 0, 0];
  let errS = 0, errL = 0, m = 0, changed = 0;
  const Ssrgb = src === null ? 0 : src / 255, Slin = src === null ? 0 : linS(src);
  for (let y = 0; y < base.h; y++) for (let x = 0; x < base.w; x++) {
    const a = px(base, x, y), b = px(off, x, y), f = px(ref, x, y);
    if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) <= 6) continue;
    changed++;
    if (!flat(off, x, y, b)) continue;
    let pred;
    if (mode === 'multiply') {
      pred = [0, 1, 2].map((k) => (b[k] < 8 ? a[k] : encS(linS(b[k]) * linS(Math.min(1, a[k] / b[k]) * 255))));
    } else {
      let num = 0, den = 0;
      for (const k of [0, 1, 2]) { const head = Ssrgb * (255 - b[k]); num += head * (a[k] - b[k]); den += head * head; }
      const alpha = den ? Math.max(0, Math.min(1, num / den)) : 0;
      pred = [0, 1, 2].map((k) => { const bl = linS(b[k]); return encS(bl + alpha * Slin * (1 - bl)); });
    }
    for (const k of [0, 1, 2]) { sums[k] += a[k]; suml[k] += pred[k]; sumf[k] += f[k]; sumb[k] += b[k]; }
    errS += (Math.abs(a[0] - f[0]) + Math.abs(a[1] - f[1]) + Math.abs(a[2] - f[2])) / 3;
    errL += (Math.abs(pred[0] - f[0]) + Math.abs(pred[1] - f[1]) + Math.abs(pred[2] - f[2])) / 3;
    m++;
  }
  const fm = (s) => s.map((v) => (v / m).toFixed(0).padStart(4)).join('/');
  return { changed, m, b: fm(sumb), s: fm(sums), l: fm(suml), f: fm(sumf), errS: errS / m, errL: errL / m };
}

if (process.argv.includes('space')) {
  const shot = (blade, tag) => `${OUT}/6770-blade${blade}-${tag.replace(/[^a-z0-9]+/gi, '_')}.png`;
  const url = (blade, hide, sp) => `${BASE}/?zoom=1.5&mute&manual&blade=${blade}&hide=lines${hide ? ',' + hide : ''}${sp && sp !== 'sRGB' ? `&gradxf=stopSpace=${sp}` : ''}`;
  const jobs = [];
  for (const c of SPACE_CASES) for (const sp of SPACES) jobs.push([c.blade, sp, '', sp]);
  for (const l of LAYERS) jobs.push([5, `hide-${l.id}`, l.id, 'sRGB']);
  try {
    for (const [blade, tag, hide, sp] of jobs) {
      if (!existsSync(shot(blade, tag))) await render(url(blade, hide, sp), shot(blade, tag));
    }
  } finally {
    await browser.close();
  }

  console.log('\n=== 1. gradient stop space (?gradxf=stopSpace=), achromatic flat blocks by OUR luma bin');
  for (const c of SPACE_CASES) {
    const ref = readPng(c.ref);
    console.log(`\n  blade ${c.blade} vs ${c.name}` + '\n  stopSpace'.padEnd(20) + [160, 170, 180, 190, 200, 210, 220].map((v) => String(v).padStart(9)).join('') + '   fit frame = a*ours + c');
    for (const sp of SPACES) console.log(('  ' + sp).padEnd(20) + binLine(achromaticBlocks(readPng(shot(c.blade, sp)), ref)));
  }
  const pc = SPACE_CASES[0];
  const pref = readPng(pc.ref);
  console.log(`\n  page purple patch x ${pc.purple.x}..${pc.purple.x + pc.purple.w} y ${pc.purple.y}..${pc.purple.y + pc.purple.h}, per channel`);
  console.log('  stopSpace'.padEnd(20) + '     R      G      B   spread');
  console.log(`  ${('frame ' + pc.name).padEnd(18)}${rgbCell(meanRgbOf(pref, pc.purple))}`);
  for (const sp of SPACES) console.log(`  ${sp.padEnd(18)}${rgbCell(meanRgbOf(readPng(shot(5, sp)), pc.purple))}`);

  console.log('\n=== 2. compositing. The same patch with one layer ABLATED, then that layer redone in linear light');
  const base5 = readPng(shot(5, 'sRGB'));
  console.log('  hidden'.padEnd(30) + '     R      G      B   spread');
  console.log(`  ${'nothing (ship)'.padEnd(28)}${rgbCell(meanRgbOf(base5, pc.purple))}`);
  for (const l of LAYERS) console.log(`  ${l.id.padEnd(28)}${rgbCell(meanRgbOf(readPng(shot(5, `hide-${l.id}`)), pc.purple))}`);
  console.log(`  ${('frame ' + pc.name).padEnd(28)}${rgbCell(meanRgbOf(pref, pc.purple))}`);
  console.log('\n  layer (blend, source)          backdrop     ours,sRGB  err    linear light err     frame');
  for (const l of LAYERS) {
    if (!l.mode) continue;
    const r = recomposite(base5, readPng(shot(5, `hide-${l.id}`)), pref, l.mode, l.src);
    console.log(`  ${`${l.id} (${l.mode}${l.src ? ', ' + l.src : ''})`.padEnd(30)}${r.b}  ${r.s} ${r.errS.toFixed(2).padStart(6)}  ${r.l} ${r.errL.toFixed(2).padStart(6)}  ${r.f}`);
  }
  console.log('\n  and the achromatic bins under each ablation - compositing cannot be the global residual if these do not move');
  console.log('  hidden'.padEnd(30) + [160, 170, 180, 190, 200, 210, 220].map((v) => String(v).padStart(9)).join('') + '   fit');
  console.log('  ' + 'nothing (ship)'.padEnd(28) + binLine(achromaticBlocks(base5, pref)));
  for (const l of LAYERS) console.log('  ' + l.id.padEnd(28) + binLine(achromaticBlocks(readPng(shot(5, `hide-${l.id}`)), pref)));

  console.log('\n=== 3. a GLOBAL transfer curve on our finished output');
  const CURVES = [
    ['identity (ship)', (v) => v],
    ['sRGB->PWL (we author sRGB)', (v) => encP(linS(v))],
    ['PWL->sRGB (console authors PWL)', (v) => encS(linP(v))],
    ['gain 1/1.0228 (the chain)', (v) => v / 1.0228],
  ];
  for (const c of SPACE_CASES) {
    const ref = readPng(c.ref), ours = readPng(shot(c.blade, 'sRGB'));
    console.log(`\n  blade ${c.blade} vs ${c.name}` + '\n  curve'.padEnd(37) + [160, 170, 180, 190, 200, 210, 220].map((v) => String(v).padStart(9)).join('') + '   fit');
    for (const [name, fn] of CURVES) {
      const lut = Array.from({ length: 256 }, (_, i) => fn(i));
      console.log(('  ' + name).padEnd(37) + binLine(achromaticBlocks(ours, ref, lut)));
    }
  }
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
