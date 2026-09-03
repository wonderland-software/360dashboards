// The Blades shell: composition, switching, panel levels, navigation, and five
// stills measured against the reference frames.
//
// Deterministic (&manual stops the wall clock, &mute builds no AudioContext).
// The five stills are the rest state of each blade, rendered through the
// console's own view transform at the reference frames' 1920x1080 so they
// overlay reference/frames/6717/* directly.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, compare, mean, rowProfile, colProfile, grad, profileFit } from './pixlab.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'out');
const FRAMES = resolve(HERE, '../../reference/frames/6717');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.SMOKE_URL ?? 'http://localhost:5173';

// tab -> rest frame on RootScene, blade_N palette, the 0-based tab label, the
// reference still, and the page edges §1.3 measures on it at y=20, 1080p.
const BLADES = [
  { tab: 1, name: 'Marketplace', rest: 43, colour: 5, label: 'blade_0_txt', ref: 'f0034', left: 148, right: 1507 },
  { tab: 2, name: 'Xbox LIVE', rest: 21, colour: 1, label: 'blade_1_txt', ref: 'f0026', left: 228, right: 1577 },
  { tab: 3, name: 'Games', rest: 68, colour: 2, label: 'blade_2_txt', ref: 'f0042', left: 292, right: 1643 },
  { tab: 4, name: 'Media', rest: 118, colour: 3, label: 'blade_3_txt', ref: 'f0047', left: 368, right: 1713 },
  { tab: 5, name: 'System', rest: 168, colour: 4, label: 'blade_4_txt', ref: 'f0051', left: 436, right: 1757 },
];

const PANELS = {
  1: 'blademp/marketplaceSignedOut.xur',
  2: 'live/liveSignedOutUI.xur',
  3: 'gamesbla/gamesSignedOut.xur',
  4: 'mediabla/mediaSignedOut.xur',
};

/**
 * The page-edge landmarks, as a detector rather than as five hand-read numbers,
 * so the same rule runs over the frame and over our render.
 *
 * In the five-row band centred on y=20 (the header band the spec measures in):
 *   page left  = the strongest FALLING luma edge in x 100..960
 *   page right = the DARKEST column of the seam outside the page, searched in
 *                x = left+1250 .. left+1400
 *
 * The page-width window matters. The seam right of the page is one of a row of
 * near-identical tab seams (on Xbox LIVE they sit at 1575, 1653, 1725 and 1796
 * and the frame's three deepest are within 3 luma of each other), so a global
 * minimum picks a different one on a render whose seams are a few luma lighter.
 * Every published pair has right - left in 1321..1359, so the window is data.
 *
 * Checked against the five published pairs the rule reproduces all ten to
 * within 3 px: L 148/226/292/365/435 for 148/228/292/368/436 and R
 * 1506/1575/1644/1711/1758 for 1507/1577/1643/1713/1757. The spec's table and
 * this detector are the same measurement.
 */
const BAND = { y0: 18, y1: 23 };
function pageEdges(im) {
  const p = rowProfile(im, 0, im.w, BAND.y0, BAND.y1);
  const s = p.map((_, i) => (p[Math.max(0, i - 1)] + p[i] + p[Math.min(p.length - 1, i + 1)]) / 3);
  let fall = { x: 0, d: 0 };
  for (let x = 100; x < 960; x++) { const d = s[x] - s[x - 1]; if (d < fall.d) fall = { x, d }; }
  let dark = { x: 0, v: Infinity };
  for (let x = Math.max(1000, fall.x + 1250); x < Math.min(im.w - 10, fall.x + 1400); x++) {
    if (p[x] < dark.v) dark = { x, v: p[x] };
  }
  return { left: fall.x, right: dark.x };
}

/** Where a rendered element's ink sits against the frame's, by 1-D NCC of the
 *  gradient-magnitude profiles inside a window around it. */
function inkShift(ref, ours, box, maxShift = 20) {
  const x0 = Math.max(0, Math.round(box.x) - maxShift), x1 = Math.min(ref.w, Math.round(box.x + box.w) + maxShift);
  const y0 = Math.max(0, Math.round(box.y) - maxShift), y1 = Math.min(ref.h, Math.round(box.y + box.h) + maxShift);
  if (x1 - x0 < 8 || y1 - y0 < 8) return { dx: null, dy: null, nccX: 0, nccY: 0 };
  const fx = profileFit(grad(rowProfile(ref, x0, x1, y0, y1)), grad(rowProfile(ours, x0, x1, y0, y1)), maxShift);
  const fy = profileFit(grad(colProfile(ref, x0, x1, y0, y1)), grad(colProfile(ours, x0, x1, y0, y1)), maxShift);
  return { dx: fx.shift, dy: fy.shift, nccX: fx.ncc, nccY: fy.ncc };
}

const XY_HELPER = `window.__xy = ${xyOf.toString()}`;

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

mkdirSync(OUT, { recursive: true });
let browser;
const measured = [];
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });

  /* ------------------------------------------------- the five rest states */

  for (const blade of BLADES) {
    const page = await open(browser, `${BASE}/?zoom=1.5&mute&manual&blade=${blade.tab}`);
    check(page.errors.length === 0, `blade ${blade.tab} page errors: ${page.errors.join(' | ')}`);
    const d = await dash(page.p);
    check(d.errors.length === 0, `blade ${blade.tab} __dash.errors: ${d.errors.join(' | ')}`);
    check(d.canvas.w === 1120 && d.canvas.h === 770, `dashmain canvas is ${d.canvas.w}x${d.canvas.h}`);

    const root = await scope(page.p, 'RootScene');
    check(root?.tick === blade.rest,
      `${blade.name} rests on frame ${blade.rest}, got ${root?.tick}`);
    check(root?.playing === false, `${blade.name} must be at rest, not playing`);

    // The blade palette is driven by the timeline, not hard-coded: the skins
    // define blade_1..5 and they sit ONE BEHIND the tab index, so Marketplace
    // wears blade_5. Both BG_color controls carry an animated Visual.
    const bg = await page.p.evaluate(() => ({
      one: document.querySelector('[data-xui-id="BG_color_1"] [data-xui-visual]')?.dataset.xuiVisual ?? null,
      two: document.querySelector('[data-xui-id="BG_color_2"] [data-xui-visual]')?.dataset.xuiVisual ?? null,
    }));
    const want = `blade_${blade.colour}_bgcolor`;
    check(bg.one === want || bg.two === want,
      `${blade.name} should wear ${want}; BG_color_1=${bg.one} BG_color_2=${bg.two}`);

    // Every panel is parented BEFORE any range runs - a switch hides the
    // outgoing content in one frame and has nothing to cover a late load.
    check(d.shell?.tab === blade.tab, `__dash.shell.tab is ${d.shell?.tab}`);
    check(d.shell?.level === 0, `a blade at rest is panel level 0, got ${d.shell?.level}`);
    check(d.shell?.contentPanelVisual === 'content_panel',
      `with no theme installed the plate is content_panel, got ${d.shell?.contentPanelVisual}`);
    for (const p of d.shell?.panels ?? []) {
      check(p.parented, `panel for tab ${p.tab} was not parented`);
      check(p.scene === PANELS[p.tab], `tab ${p.tab} loaded ${p.scene}, expected ${PANELS[p.tab]}`);
    }

    const labelBox = await page.p.evaluate((id) => {
      const el = document.querySelector(`[data-xui-id="${id}"]`);
      const stage = document.querySelector('.xui-stage');
      if (!el || !stage) return null;
      const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
      return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
    }, blade.label);

    const shot = `${OUT}/blade${blade.tab}-${blade.name.replace(/\W+/g, '')}.png`;
    await (await page.p.$('.xui-stage')).screenshot({ path: shot });
    measured.push({ blade, shot, labelBox });
    await page.close();
  }

  /* ------------------------------------ the stills against the frames ---- */

  console.log('  blade         page left (ref/ours)  page right (ref/ours)   label dx,dy   body NCC/MAD   stack NCC/MAD');
  for (const m of measured) {
    const ref = readPng(`${FRAMES}/${m.blade.ref}.png`);
    const ours = readPng(m.shot);
    check(ours.w === 1920 && ours.h === 1080, `${m.blade.name} still is ${ours.w}x${ours.h}, not 1920x1080`);
    const re = pageEdges(ref), oe = pageEdges(ours);

    // The page body, inside the edges and below the header band; and the tab
    // stack, which is the staircase the gradient model decides.
    const body = { x: re.left + 60, y: 200, w: Math.max(40, re.right - re.left - 120), h: 650 };
    const stack = m.blade.tab === 1
      ? { x: re.right + 10, y: 140, w: Math.min(400, 1918 - re.right), h: 740 }
      : { x: Math.max(0, re.left - 430), y: 140, w: Math.min(430, re.left - 6), h: 740 };
    const b = compare(ref, ours, body);
    const s = compare(ref, ours, stack);
    const ink = m.labelBox ? inkShift(ref, ours, m.labelBox) : { dx: null, dy: null };
    const row = {
      name: m.blade.name, refL: re.left, ourL: oe.left, refR: re.right, ourR: oe.right,
      pubL: m.blade.left, pubR: m.blade.right,
      dx: ink.dx, dy: ink.dy, bodyNcc: b.ncc, bodyMad: b.mad, stackNcc: s.ncc, stackMad: s.mad,
      bodyRef: mean(ref, body), bodyOurs: mean(ours, body),
    };
    console.log(`  ${row.name.padEnd(12)}  ${String(row.refL).padStart(4)} / ${String(row.ourL).padEnd(6)}      `
      + `${String(row.refR).padStart(5)} / ${String(row.ourR).padEnd(6)}   `
      + `${String(row.dx).padStart(3)},${String(row.dy).padEnd(4)}  `
      + `${row.bodyNcc.toFixed(3)}/${row.bodyMad.toFixed(1).padStart(5)}  `
      + `${row.stackNcc.toFixed(3)}/${row.stackMad.toFixed(1).padStart(5)}  `
      + `luma ${row.bodyRef.toFixed(0)}->${row.bodyOurs.toFixed(0)}`);

    // The detector reproduces the spec's own five pairs to within 3 px, so a
    // 6 px gate on our render is a gate on the composition, not on the reading.
    check(Math.abs(row.ourL - row.pubL) <= 6,
      `${row.name} page left is ${row.ourL}, spec landmark ${row.pubL} (detector reads ${row.refL} on the frame)`);
    check(Math.abs(row.ourR - row.pubR) <= 6,
      `${row.name} page right is ${row.ourR}, spec landmark ${row.pubR} (detector reads ${row.refR} on the frame)`);
    check(row.dx !== null && Math.abs(row.dx) <= 8 && Math.abs(row.dy) <= 8,
      `${row.name} tab label is ${row.dx},${row.dy} px off the frame`);
  }
  // Page left must advance blade by blade - the stack really is a staircase.
  for (let i = 1; i < measured.length; i++) {
    const a = pageEdges(readPng(measured[i - 1].shot)).left;
    const b = pageEdges(readPng(measured[i].shot)).left;
    check(b > a, `${measured[i].blade.name}'s page starts at ${b}, not right of ${measured[i - 1].blade.name}'s ${a}`);
  }

  /* ---------------------------------------------------- the System blade */

  const sys = await open(browser, `${BASE}/?mute&manual&blade=5`);
  const rows = await sys.p.evaluate(() =>
    [...document.querySelectorAll('[data-xui-class="XuiNavButton"]')]
      .filter((e) => e.dataset.xuiId?.startsWith('nav') && e.closest('[data-xui-id="System"]'))
      .map((e) => ({ id: e.dataset.xuiId, hidden: e.style.display === 'none', xy: window.__xy(e) })));
  check(rows.length === 8, `the System blade authors 8 nav buttons, found ${rows.length}`);
  const shown = rows.filter((r) => !r.hidden);
  check(shown.length === 7, `offline the footage shows 7 rows, got ${shown.length}`);
  check(rows.find((r) => r.id === 'navIPTVSettings')?.hidden === true,
    'navIPTVSettings is hidden without an IPTV provider');
  // x=297, y = 153 + 45k - the same 45px list pitch as everywhere else
  for (const r of rows) {
    const k = ['navSettings', 'navPControls', 'navMemory', 'navNetwork', 'navWindowMediaConnect',
      'navLiveVision', 'navSystemSetUp', 'navIPTVSettings'].indexOf(r.id);
    check(r.xy === `297,${153 + 45 * k}`, `${r.id} at ${r.xy}, expected 297,${153 + 45 * k}`);
  }

  /* ------------------------------ the metapane focus handler, live ------- */

  // DefaultFocus="navSettings" and PanelSettings[0] is navSettings, so the
  // blade comes up on entry 0 with its description already in the metapane.
  const m0 = await dash(sys.p);
  check(m0.shell?.focusId === 'navSettings', `System comes up on navSettings, got ${m0.shell?.focusId}`);
  check(m0.shell?.metaIndex === 0, `metapane starts at entry 0, got ${m0.shell?.metaIndex}`);
  check(m0.shell?.metaText?.startsWith('Edit your Xbox 360 system settings'),
    `metapane text is ${JSON.stringify(m0.shell?.metaText?.slice(0, 40))}`);
  // GotoIndex: adjacent steps animate "%dTo%d", 1-based on the wire.
  const META_STEPS = [
    ['navPControls', 1, '1To2..1To2End', 'Protect younger family members'],
    ['navMemory', 2, '2To3..2To3End', 'Move or delete saved games'],
    ['navNetwork', 3, '3To4..3To4End', 'Connect your console to your home network'],
  ];
  for (const [id, index, range, text] of META_STEPS) {
    await sys.p.evaluate(() => window.__dashApi.shell.move('Down'));
    await sys.p.evaluate(() => window.__dashApi.stepFrames(25));
    const d = await dash(sys.p);
    check(d.shell?.focusId === id, `Down should focus ${id}, got ${d.shell?.focusId}`);
    check(d.shell?.metaIndex === index, `metapane index should be ${index}, got ${d.shell?.metaIndex}`);
    check(d.shell?.metaText?.startsWith(text), `metapane text is ${JSON.stringify(d.shell?.metaText?.slice(0, 40))}`);
    check(d.lastCue === 'btn_Focus', `a focus move fires btn_Focus out of the visual's File track, got ${d.lastCue}`);
    const meta = await scope(sys.p, 'metaScene_1line');
    check(meta?.range === range, `metapane should play ${range}, got ${meta?.range}`);
  }
  // Back up one: the reverse segment, not a snap.
  await sys.p.evaluate(() => window.__dashApi.shell.move('Up'));
  const up = await scope(sys.p, 'metaScene_1line');
  check(up?.range === '4To3..4To3End', `Up plays 4To3, got ${up?.range}`);
  // And the text really is on screen, not just in telemetry.
  const painted = await sys.p.evaluate(() =>
    document.querySelector('[data-xui-id="metaPanelScene"]')?.textContent ?? '');
  check(painted.startsWith('Move or delete saved games'), `the metapane paints ${JSON.stringify(painted.slice(0, 40))}`);
  await sys.close();

  /* --------------------------------------------------------- switching */

  const sw = await open(browser, `${BASE}/?mute&manual&blade=2`);
  const jumped = await sw.p.evaluate(() => window.__dashApi.shell.go(5));
  check(jumped === false, 'a two-blade jump has no authored range and must be refused');
  const moved = await sw.p.evaluate(() => window.__dashApi.shell.go(3));
  check(moved === true, 'Xbox LIVE to Games is an authored range');
  const mid = await scope(sw.p, 'RootScene');
  check(mid?.range === '2To3..2To3End', `expected the 2To3 range, got ${mid?.range}`);
  check(mid?.tick === 44, `2To3 opens on frame 44, got ${mid?.tick}`);
  const swCue = await dash(sw.p);
  check(swCue.lastCue === 'dash_BladeSwitch_2',
    `the switch sound is chosen by the PAIR (min(from,to)=2), got ${swCue.lastCue}`);
  await sw.p.evaluate(() => window.__dashApi.stepFrames(30));
  const done = await scope(sw.p, 'RootScene');
  check(done?.tick === 68 && done?.playing === false,
    `2To3End is frame 68 and stops, got ${done?.tick}/${done?.playing}`);
  check((await dash(sw.p)).shell?.tab === 3, 'the shell should now be on Games');

  /* ------------------------------------------------------ panel levels */

  // Second level and deeper is a COUNTER: Open once, then Blink for every
  // level below that, in BOTH directions.
  await sw.p.evaluate(() => window.__dashApi.shell.openLevel());
  const lvl1 = await scope(sw.p, 'RootScene');
  check(lvl1?.range === '3Open..3OpenEnd', `first level plays 3Open, got ${lvl1?.range}`);
  check((await dash(sw.p)).shell?.tabsLocked === true, 'opening a level locks tab switching');
  check(await sw.p.evaluate(() => window.__dashApi.shell.go(4)) === false,
    'tab switching is locked while a panel is open');

  await sw.p.evaluate(() => window.__dashApi.stepFrames(40));
  await sw.p.evaluate(() => window.__dashApi.shell.openLevel());
  const lvl2 = await scope(sw.p, 'RootScene');
  check(lvl2?.range === '3Blink..3BlinkEnd', `the third level plays 3Blink, got ${lvl2?.range}`);
  check((await dash(sw.p)).shell?.level === 2, 'level should be 2');

  await sw.p.evaluate(() => window.__dashApi.stepFrames(40));
  await sw.p.evaluate(() => window.__dashApi.shell.closeLevel());
  const back2 = await scope(sw.p, 'RootScene');
  check(back2?.range === '3Blink..3BlinkEnd', `coming back up also plays 3Blink, got ${back2?.range}`);

  await sw.p.evaluate(() => window.__dashApi.stepFrames(40));
  await sw.p.evaluate(() => window.__dashApi.shell.closeLevel());
  const closed = await scope(sw.p, 'RootScene');
  check(closed?.range === '3Close..3CloseEnd', `the last level plays 3Close, got ${closed?.range}`);
  const after = await dash(sw.p);
  check(after.shell?.level === 0 && after.shell?.tabsLocked === false,
    `back at home, unlocked; got level ${after.shell?.level} locked ${after.shell?.tabsLocked}`);
  await sw.close();

  console.log(`  five stills written to ${OUT}/blade*.png`);
} catch (err) {
  fails.push(`threw: ${err instanceof Error ? err.stack : String(err)}`);
} finally {
  if (browser) await browser.close();
}

if (fails.length) { for (const f of fails) console.error('  FAIL ' + f); console.log('SMOKE_FAIL'); process.exit(1); }
console.log('SMOKE_PASS');

async function open(browser, url) {
  const p = await browser.newPage();
  await p.evaluateOnNewDocument(XY_HELPER);
  await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(url, { waitUntil: 'networkidle0', timeout: 90000 });
  await p.waitForFunction(() => document.body.dataset.ready === 'true' || !!document.querySelector('.banner'), { timeout: 90000 });
  return { p, errors, close: () => p.close() };
}
function dash(p) { return p.evaluate(() => JSON.parse(JSON.stringify(window.__dash))); }
function scope(p, tail) {
  return p.evaluate((tail) => {
    const all = window.__dashApi.engine.all().filter((s) => s.id.endsWith(tail));
    const s = all.sort((a, b) => a.id.length - b.id.length)[0];
    return s ? { tick: s.tick, playing: s.playing, range: s.range ? s.range.join('..') : null } : null;
  }, tail);
}

/**
 * An element's position in design units, whichever CSS property carries it:
 * a plain container is placed with left/top so it does not create a stacking
 * context (which would isolate mix-blend-mode), and only a rotated or scaled
 * element gets a transform.
 */
function xyOf(el) {
  const t = el.style.transform;
  const m = /translate\(([-\d.]+)px,\s*([-\d.]+)px\)/.exec(t);
  if (m) return `${Math.round(+m[1])},${Math.round(+m[2])}`;
  return `${Math.round(parseFloat(el.style.left) || 0)},${Math.round(parseFloat(el.style.top) || 0)}`;
}
