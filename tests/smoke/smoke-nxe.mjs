// NXE 9199: the shell boots to a composed home page, and one legacy page.
//
// Two routes, both offline and both measured against the reference stills:
//
//   ?build=9199                        the home page, composed from
//                                      emb_homepage.xml + the epix:// files
//   ?build=9199&page=consoles/...      an 880x480 LegacyControl page in the
//                                      same shell
//
// Every geometry number below is a MEASUREMENT of our render against a frame,
// taken with the same detector on both: a mean-luma profile across a band that
// crosses only the landmark, then the strongest gradient step inside a window
// the model itself predicts (LEARNINGS, "the landmark you measure has to be a
// DETECTOR, not five numbers"). The window is +-12 design px, which is wide
// enough to catch a wrong answer and narrow enough not to lock onto the next
// panel's edge - the panels are 200 px apart at the front and 60 apart at the
// back.
import puppeteer from 'puppeteer-core';
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, rowProfile, colProfile } from './pixlab.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const OUT = resolve(HERE, 'out');
const FRAMES = resolve(ROOT, 'reference/frames');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.SMOKE_URL ?? 'http://localhost:5173';

mkdirSync(OUT, { recursive: true });
const fails = [];
const ok = (cond, msg) => { if (!cond) fails.push(msg); };

/* ------------------------------------------------------------- the frames */

// The home screen: default green theme, My Xbox channel, front slot "Open Tray"
// [FRAME nxe-9199-YrtwSj1f6aY/f0483]. Ten landmarks on three panels, in 1280x720
// units; the same list dashboards/nxe/projection.ts fitted the projection to.
const HOME_FRAME = `${FRAMES}/nxe-9199-YrtwSj1f6aY/f0483.png`;
const HOME_LANDMARKS = [
  { name: 'panel1 left', kind: 'v', at: 95.3, band: [430, 470] },
  { name: 'panel1 right', kind: 'v', at: 515.6, band: [430, 470] },
  { name: 'panel1 top', kind: 'h', at: 248.0, band: [300, 450] },
  { name: 'panel1 bottom', kind: 'h', at: 568.0, band: [150, 450] },
  // Below panel 3's foot (492), so the band crosses panel 2's plain lower
  // body and the floor, and nothing of the gamer card's content.
  { name: 'panel2 right', kind: 'v', at: 826.6, band: [497, 515] },
  { name: 'panel2 top', kind: 'h', at: 284.0, band: [545, 600] },
  { name: 'panel3 top', kind: 'h', at: 305.0, band: [850, 950] },
];

// Console Settings, the eight rows of the 0x92016a90 table, with the metapane
// on the right. NOTE: NXE_GLUE_SPEC §5 and reference/frames/nxe-README.md both
// cite Kpa f0375 for this page; f0375 is SYSTEM Settings (seven rows) and the
// eight-row Console Settings page is f0381. The row set and order the spec
// gives are exactly right - only the frame number is off.
const LEGACY_FRAME = `${FRAMES}/nxe-9199-Kparblu6r14/f0381.png`;
// The page's own edges, after taking off the ~5.4 px / 2 px the rig's frame
// adds around it (measured 890.7 x 484.0 for an authored 880 x 480).
//
// TOLERANCE. These three are the OUTER edge of the framed page - the frame
// measures 890.7 x 484.0 around an authored 880 x 480, i.e. about 5.4 px each
// side and 2 px top and bottom of border that the rig draws around a hosted
// page and this milestone does not. So a few px of signed offset here is that
// border, not a placement error, and the list-pitch measurement below is the
// landmark that is free of it.
const LEGACY_LANDMARKS = [
  { name: 'page left', kind: 'v', at: 192.5, band: [200, 500] },
  { name: 'page top', kind: 'h', at: 109.7, band: [700, 1000] },
  { name: 'page bottom', kind: 'h', at: 593.7, band: [700, 1000] },
];

/* ------------------------------------------------------------- the detector */

/** Strongest |gradient| of a mean-luma profile, within +-win of `at`. */
function edgeNear(im, kind, at, band, win = 12) {
  const k = im.w / 1280;
  const p = kind === 'v'
    ? rowProfile(im, 0, im.w, Math.round(band[0] * k), Math.round(band[1] * k))
    : colProfile(im, Math.round(band[0] * k), Math.round(band[1] * k), 0, im.h);
  const lo = Math.max(1, Math.round((at - win) * k));
  const hi = Math.min(p.length - 1, Math.round((at + win) * k));
  let best = { i: -1, d: 0 };
  for (let i = lo; i <= hi; i++) {
    const d = p[i] - p[i - 1];
    if (Math.abs(d) > Math.abs(best.d)) best = { i, d };
  }
  if (best.i < 0) return null;
  // Sub-pixel: the half-intensity crossing of the step the gradient found.
  const a = p[best.i - 1], b = p[best.i];
  const mid = (a + b) / 2;
  const frac = b === a ? 0 : (mid - a) / (b - a);
  return { at: (best.i - 1 + frac) / k, strength: best.d };
}

/* ------------------------------------------------------------------ driver */

let browser;
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });

  /* ------------------------------------------------------------ 1. the home */

  const home = await load(`${BASE}/?build=9199&mute`);
  ok(home.dash.build === '9199', `build is ${home.dash.build}, not 9199`);
  ok(home.dash.unknownClasses.length === 0, `unknown classes: ${home.dash.unknownClasses.join(',')}`);
  ok(home.dash.errors.length === 0, `page errors: ${home.dash.errors.join(' | ')}`);
  ok(home.dash.canvas.w === 1280 && home.dash.canvas.h === 720, `canvas ${home.dash.canvas.w}x${home.dash.canvas.h}, not 1280x720`);
  ok(home.pageErrors.length === 0, `js errors: ${home.pageErrors.join(' | ')}`);

  const n = home.dash.nxe;
  ok(n, 'no __dash.nxe on the 9199 route');
  if (n) {
    ok(n.errors.length === 0, `nxe errors: ${n.errors.join(' | ')}`);
    ok(n.unresolvedEpix.length === 0, `unresolved epix: ${n.unresolvedEpix.join(' | ')}`);

    const passed = n.channels.filter((c) => c.passed);
    console.log(`  channels: ${n.channels.length} declared, ${passed.length} pass offline`);
    for (const c of n.channels) {
      console.log(`    ${c.passed ? 'yes' : ' no'}  ${String(c.id).padEnd(12)} ${String(c.name).padEnd(26)} ${c.slots} slots  ${c.condition || '(always)'}  ${c.source}`);
    }
    ok(n.channels.length === 8, `${n.channels.length} channels declared, expected 8`);
    ok(passed.length === 7, `${passed.length} channels pass offline, expected 7 (COMMUNITY needs a Live tier)`);
    ok(n.currentChannel === 'XBOX360', `current channel ${n.currentChannel}, expected XBOX360`);
    const byId = Object.fromEntries(n.channels.map((c) => [c.id, c.name]));
    ok(byId.XBOX360 === 'My Xbox', `XBOX360 is named "${byId.XBOX360}"`);
    ok(byId.WELCOME === 'Welcome', `WELCOME is named "${byId.WELCOME}"`);

    console.log(`  queue: ${n.queue.map((q) => `${q.row}="${q.text}"`).join(' ')}`);
    ok(n.queue.find((q) => q.row === 'Current')?.text === 'My Xbox', 'Queue\\Current is not "My Xbox"');
    ok(n.queue.find((q) => q.row === 'Prev1')?.text === 'Welcome', 'Queue\\Prev1 is not "Welcome"');

    console.log(`  panels: ${n.panels.length} slots, ${n.panels.filter((p) => p.mounted).length} mounted, counter "${n.counter}"`);
    for (const p of n.panels) console.log(`    z=${String(p.z).padStart(5)}  ${p.mounted ? 'mounted ' : 'culled  '} ${String(p.name).padEnd(22)} ${p.path} -> ${p.scene ?? '-'}`);
    ok(n.panels.length === 8, `${n.panels.length} slots on My Xbox, expected 8 offline`);
    ok(n.panels.filter((p) => p.mounted).length === 7, 'expected 7 panels inside MobyVisiblePanelDistance');
    ok(n.counter === '1 of 8', `counter is "${n.counter}", expected "1 of 8"`);
    for (const d of n.droppedSlots) console.log(`    dropped: ${d.name} (${d.condition})`);
    ok(n.droppedSlots.length === 3, `${n.droppedSlots.length} slots dropped, expected 3 (Mediaroom, HD-DVD, Solutions)`);

    ok(n.strip.defaultSpacing === 505, `MobyDefaultSpacing ${n.strip.defaultSpacing}`);
    ok(n.strip.frontPosition.x === 96 && n.strip.frontPosition.y === 570, 'MobyFrontPosition is not (96,570,0)');
    ok(n.variablesMissing.length === 0, `Variables.xur is missing ${n.variablesMissing.join(',')}`);
    ok(n.physics.length > 0, 'the physics honesty list is empty');
    console.log(`  projection: f=${n.projection.focal} centre=(${n.projection.centreU}, ${n.projection.centreV})`);
  }

  await home.page.screenshot({ path: `${OUT}/nxe-home.png` });
  measure('home', `${OUT}/nxe-home.png`, HOME_FRAME, HOME_LANDMARKS, 2.0);
  await home.page.close();

  /* ------------------------------------------------------ 2. a legacy page */

  const legacy = await load(`${BASE}/?build=9199&mute&page=consoles/dashSysCslSet.xur`);
  ok(legacy.dash.unknownClasses.length === 0, `legacy unknown classes: ${legacy.dash.unknownClasses.join(',')}`);
  ok(legacy.pageErrors.length === 0, `legacy js errors: ${legacy.pageErrors.join(' | ')}`);
  const l = legacy.dash.nxe;
  ok(l, 'no __dash.nxe on the legacy route');
  if (l) {
    ok(l.errors.length === 0, `legacy nxe errors: ${l.errors.join(' | ')}`);
    const g = l.legacy;
    ok(g, 'no LegacyControl page mounted');
    if (g) {
      console.log(`  legacy: ${g.scene} ${g.size.w}x${g.size.h} at (${g.left}, ${g.top}), centre x ${g.centreX}`);
      console.log(`    rows (${g.filledFrom}): ${g.rows.join(' | ')}`);
      console.log(`    parked off-screen: ${g.parked.join(', ')}`);
      ok(g.size.w === 880 && g.size.h === 480, `legacy page is ${g.size.w}x${g.size.h}, not 880x480`);
      ok(g.rows.length === 8, `${g.rows.length} rows, expected 8`);
      ok(g.rows[0] === 'Display' && g.rows[7] === 'System Info', 'the eight rows are not the 0x92016a90 table');
      ok(g.rows[5] === 'Auto-Play', 'row 6 is not Auto-Play (the row Blades did not have)');
      ok(g.parked.length === 4, `${g.parked.length} parked legend controls, expected 4`);
      ok(g.focusId === 'lstSettings_item0', `arrival focus is ${g.focusId}`);
    }
    const lg = l.legend;
    ok(lg, 'no LegendScene');
    if (lg) {
      console.log(`    legend: ${lg.buttons.map((b) => `${b.group}="${b.text}"@${Math.round(b.x)}`).join(' ')}  title "${lg.title}" -> ${lg.titleGroup}`);
      console.log(`    legend empty: ${lg.empty.join(', ')}`);
      ok(lg.buttons.length === 2, `${lg.buttons.length} legend captions, expected 2 (A Select, B Back)`);
      ok(lg.buttons[0]?.text === 'Select' && lg.buttons[1]?.text === 'Back', 'legend captions are not Select/Back');
      ok(lg.title === 'Console Settings', `legend title is "${lg.title}"`);
      ok(lg.titleGroup === 'LTitle', `title went into ${lg.titleGroup}, not LTitle (Label_Head)`);
      ok(lg.settled.length >= 3, 'the legend groups were not settled on their Show range');
    }
  }
  await legacy.page.screenshot({ path: `${OUT}/nxe-legacy.png` });
  measure('legacy', `${OUT}/nxe-legacy.png`, LEGACY_FRAME, LEGACY_LANDMARKS, 5.0);
  // The list's row pitch, which no border can shift: the eight rows' separator
  // strips, found as the eight strongest rising luma steps down the list's own
  // column band, and their mean spacing. Blades' pitch is 45 and 9199's
  // control_ListItem is authored 46.3768 [SCENE], so this is the number that
  // says which one is on screen.
  listPitch(`${OUT}/nxe-legacy.png`, LEGACY_FRAME);
  await legacy.page.close();

  /* ------------------------------------------------ 3. Blades is untouched */

  const blades = await load(`${BASE}/?blade=4&mute`);
  ok(blades.dash.build === '6770', `default route serves build ${blades.dash.build}`);
  ok(blades.dash.canvas.w === 1120 && blades.dash.canvas.h === 770, 'the default route is not the 1120x770 canvas');
  ok(blades.dash.unknownClasses.length === 0, 'Blades has unknown classes');
  await blades.page.close();
  console.log('  the default route still serves Blades 6770 on its own canvas');
} catch (err) {
  fails.push(`threw: ${err instanceof Error ? err.stack : String(err)}`);
} finally {
  if (browser) await browser.close();
}

if (fails.length) { for (const f of fails) console.error('  FAIL ' + f); console.log('SMOKE_FAIL'); process.exit(1); }
console.log('SMOKE_PASS');

/* ------------------------------------------------------------------ helpers */

async function load(url) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', { timeout: 120000 });
  const dash = await page.evaluate(() => JSON.parse(JSON.stringify(window.__dash)));
  return { page, dash, pageErrors };
}

/** Mean spacing of the eight list rows, measured the same way in both. */
function listPitch(ourPath, framePath) {
  if (!existsSync(framePath)) return;
  const rows = (path) => {
    const im = readPng(path);
    const k = im.w / 1280;
    // The list is 420 wide at design x ~218..628; take its middle so the
    // separators are the only thing that spans the band.
    const p = colProfile(im, Math.round(240 * k), Math.round(600 * k), 0, im.h);
    const lo = Math.round(140 * k), hi = Math.round(500 * k);
    const cands = [];
    for (let i = lo; i <= hi; i++) cands.push({ i, d: p[i] - p[i - 1] });
    // One step per row: take the strongest rising step, then suppress a
    // 20-design-px neighbourhood and repeat, eight times.
    const picked = [];
    const used = new Set();
    for (let n = 0; n < 8; n++) {
      let best = null;
      for (const c of cands) {
        if (used.has(c.i)) continue;
        if (!best || c.d > best.d) best = c;
      }
      if (!best) break;
      picked.push(best.i / k);
      for (let j = best.i - Math.round(20 * k); j <= best.i + Math.round(20 * k); j++) used.add(j);
    }
    picked.sort((a, b) => a - b);
    const gaps = picked.slice(1).map((v, ix) => v - picked[ix]);
    const mean = gaps.reduce((a, b) => a + b, 0) / (gaps.length || 1);
    return { picked, mean };
  };
  const a = rows(framePath), b = rows(ourPath);
  console.log(`    row pitch: frame ${a.mean.toFixed(2)}  ours ${b.mean.toFixed(2)}  d ${(b.mean - a.mean).toFixed(2)}`);
  console.log(`    row tops:  frame ${a.picked.map((v) => v.toFixed(0)).join(' ')}`);
  console.log(`               ours  ${b.picked.map((v) => v.toFixed(0)).join(' ')}`);
  if (Math.abs(b.mean - a.mean) > 0.75) fails.push(`legacy row pitch ${b.mean.toFixed(2)} against the frame's ${a.mean.toFixed(2)}`);
}

/**
 * Run the same detector over our render and over the reference frame, and
 * report both, so a difference cannot hide inside a reading error.
 */
function measure(label, ourPath, framePath, landmarks, tolerance) {
  if (!existsSync(framePath)) {
    console.log(`  (no ${framePath}; reference/ is gitignored, geometry not measured)`);
    return;
  }
  const ours = readPng(ourPath);
  const ref = readPng(framePath);
  console.log(`  ${label}: landmark            frame    ours     d`);
  let worst = 0;
  for (const m of landmarks) {
    const a = edgeNear(ref, m.kind, m.at, m.band);
    const b = edgeNear(ours, m.kind, m.at, m.band);
    if (!a || !b) { fails.push(`${label} ${m.name}: no edge found`); continue; }
    const d = b.at - a.at;
    worst = Math.max(worst, Math.abs(d));
    console.log(`    ${m.name.padEnd(22)} ${a.at.toFixed(1).padStart(7)} ${b.at.toFixed(1).padStart(7)} ${d.toFixed(2).padStart(6)}`);
    if (Math.abs(d) > tolerance) fails.push(`${label} ${m.name}: ${d.toFixed(2)} px off the frame (tolerance ${tolerance})`);
  }
  console.log(`    worst |d| = ${worst.toFixed(2)} px`);
}
