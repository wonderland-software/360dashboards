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
import { readPng, rowProfile, colProfile, mean, luma } from './pixlab.mjs';

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
// Panel indices are 0-BASED here and in dashboards/nxe/projection.ts. The
// numbers are the refit's own measurements (32 landmarks over two frames); the
// M4a list carried panel 1's top as 284.0 where this detector reads 281.7.
const HOME_LANDMARKS = [
  { name: 'panel0 left', kind: 'v', at: 95.7, band: [430, 470] },
  { name: 'panel0 right', kind: 'v', at: 515.7, band: [430, 470] },
  { name: 'panel0 top', kind: 'h', at: 247.7, band: [300, 450] },
  { name: 'panel0 bottom', kind: 'h', at: 567.7, band: [150, 450] },
  // Below panel 2's foot (492), so the band crosses panel 1's plain lower
  // body and the floor, and nothing of the gamer card's content.
  { name: 'panel1 right', kind: 'v', at: 827.0, band: [497, 515] },
  // TOP EDGES carry their own tolerance, and the reason is measurable: a Moby
  // slot's top rows are the bright end of the `mobyslot` gradient, so the
  // strongest luma STEP sits a few pixels inside the geometric edge, and it
  // sits further inside on our render than on the console's. The DOM boxes
  // agree with the projection model to 0.1 px (panel 1's top is 282.9 in both),
  // so this is a shading residual and not a placement one - which is why it is
  // given a number here rather than hidden in a wider global tolerance.
  { name: 'panel1 top', kind: 'h', at: 281.7, band: [545, 600], tol: 5 },
  { name: 'panel2 top', kind: 'h', at: 305.0, band: [850, 950], tol: 5 },
  { name: 'panel3 top', kind: 'h', at: 315.7, band: [1015, 1090], tol: 5 },
];

/** The thirty-two landmarks dashboards/nxe/projection.ts was fitted to.
 *  Duplicated here on purpose: a suite that imports the value it is checking
 *  checks nothing. */
const LANDMARKS = [
  { panel: 0, edge: 'right', measured: 515.7 }, { panel: 0, edge: 'top', measured: 247.7 },
  { panel: 0, edge: 'bottom', measured: 567.7 }, { panel: 0, edge: 'left', measured: 95.7 },
  { panel: 1, edge: 'right', measured: 827.0 }, { panel: 1, edge: 'top', measured: 281.7 },
  { panel: 1, edge: 'bottom', measured: 519.7 }, { panel: 2, edge: 'right', measured: 1010.3 },
  { panel: 2, edge: 'top', measured: 305.0 }, { panel: 2, edge: 'bottom', measured: 491.7 },
  { panel: 3, edge: 'top', measured: 315.7 }, { panel: 3, edge: 'bottom', measured: 472.3 },
  { panel: 4, edge: 'top', measured: 327.0 }, { panel: 4, edge: 'bottom', measured: 458.3 },
  { panel: 5, edge: 'top', measured: 333.7 }, { panel: 5, edge: 'bottom', measured: 449.0 },
  { panel: 0, edge: 'right', measured: 515.7 }, { panel: 0, edge: 'top', measured: 247.0 },
  { panel: 0, edge: 'bottom', measured: 568.3 }, { panel: 0, edge: 'left', measured: 93.7 },
  { panel: 1, edge: 'right', measured: 827.7 }, { panel: 1, edge: 'top', measured: 281.7 },
  { panel: 1, edge: 'bottom', measured: 520.3 }, { panel: 2, edge: 'right', measured: 1012.3 },
  { panel: 2, edge: 'top', measured: 304.3 }, { panel: 2, edge: 'bottom', measured: 491.7 },
  { panel: 3, edge: 'top', measured: 314.3 }, { panel: 3, edge: 'bottom', measured: 472.3 },
  { panel: 4, edge: 'top', measured: 327.0 }, { panel: 4, edge: 'bottom', measured: 459.0 },
  { panel: 5, edge: 'top', measured: 333.7 }, { panel: 5, edge: 'bottom', measured: 449.7 },
];

/** The signed-out home frame on the themed console. It is the only capture that
 *  shows the channel queue's SIZE ramp and the avatar silhouette. */
const QUEUE_FRAME = `${FRAMES}/nxe-9199-Kparblu6r14/f0048.png`;
/** The Rome panel, the spec's third 1:1 landmark [SPEC 3]. */
const ROME_FRAME = `${FRAMES}/nxe-9199-YrtwSj1f6aY/f0396.png`;
const ROME_LANDMARKS = [
  { name: 'rome left', kind: 'v', at: 96.0, band: [200, 500] },
  { name: 'rome right', kind: 'v', at: 554.7, band: [200, 500] },
  { name: 'rome top', kind: 'h', at: 104.7, band: [150, 500] },
  { name: 'rome bottom', kind: 'h', at: 598.0, band: [150, 500] },
];

/** The channel queue: which row carries ink, and how bright it is. */
const QUEUE_ROW_Y = { Next4: 24, Next3: 60, Next2: 96, Next1: 132, Current: 168, Prev1: 204 };

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
  { name: 'framed left', kind: 'v', at: 192.3, band: [200, 500] },
  { name: 'framed right', kind: 'v', at: 1085.7, band: [200, 500], win: 6 },
  { name: 'framed top', kind: 'h', at: 109.7, band: [700, 1000] },
  { name: 'framed bottom', kind: 'h', at: 593.7, band: [700, 1000] },
];

/* ------------------------------------------------------------- the detector */

/** Strongest |gradient| of a mean-luma profile, within +-win of `at`. */
function edgeNear(im, kind, at, band, win = 8) {
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

    // The queue runs UPWARD and WRAPS: Next_n is the channel n places after the
    // current one in file order [FRAME Kpa f0048, Yrt f0483 - QUEUE_ROWS'
    // header]. Its per-row Position, Scale and Opacity come out of the ten-row
    // table the executable builds on the stack at .text 0x9248b624; the four
    // numbers checked here are that table's, not a fit.
    console.log(`  queue: ${n.queue.map((q) => `${q.row}="${q.text}"@${q.dim}x${q.scale}y${q.y}`).join(' ')}`);
    const qrow = (r) => n.queue.find((q) => q.row === r);
    ok(qrow('Current')?.text === 'My Xbox', 'Queue\\Current is not "My Xbox"');
    ok(qrow('Next1')?.text === 'Game Marketplace', 'Queue\\Next1 is not "Game Marketplace"');
    ok(qrow('Next2')?.text === 'Video & Music Marketplace', 'Queue\\Next2 is not the second channel after My Xbox');
    ok(qrow('Next6')?.text === 'Welcome', 'the queue does not wrap past the end of the channel list');
    // Prev1 carries a name and is drawn at Opacity 0 - which is what the table
    // says and why the frames show nothing under the current row. M4b left the
    // row EMPTY, which produced the same pixel for the wrong reason.
    ok(qrow('Prev1')?.dim === 0, `Queue\\Prev1 is drawn at ${qrow('Prev1')?.dim}, not 0`);
    ok(qrow('Current')?.dim === 1 && qrow('Current')?.scale === 1 && qrow('Current')?.y === 154,
      `Queue\\Current is not (y 154, scale 1, opacity 1): ${JSON.stringify(qrow('Current'))}`);
    const wantScale = { Next1: 0.75, Next2: 0.55, Next3: 0.45, Next4: 0.4, Next5: 0.35, Next6: 0.35, Prev1: 0.75 };
    for (const [row, sc] of Object.entries(wantScale)) {
      ok(qrow(row)?.scale === sc, `Queue\\${row} scale ${qrow(row)?.scale}, expected ${sc}`);
    }
    const wantY = { Next1: 114, Next2: 84, Next3: 59, Next4: 34, Next5: 14, Next6: 14, Prev1: 194 };
    for (const [row, y] of Object.entries(wantY)) {
      ok(qrow(row)?.y === y, `Queue\\${row} y ${qrow(row)?.y}, expected ${y} (154 + the table's dy)`);
    }
    const dims = ['Current', 'Next1', 'Next2', 'Next3', 'Next4'].map((r) => qrow(r)?.dim);
    ok(dims[0] === 1 && dims.every((d, i) => i === 0 || d < dims[i - 1]), `the queue rows do not fade upward: ${dims.join(',')}`);

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
    ok(n.physics.length > 0, 'the honesty list is empty');
    console.log(`  projection: f=${n.projection.focal} centre=(${n.projection.centreU}, ${n.projection.centreV})`);

    // The three input axes, read out of controlp/Variables.xur.
    console.log(`  axes: channel ${n.strip.channel.acceleration}/${n.strip.channel.deceleration}/${n.strip.channel.maxVelocity}  panel ${n.strip.panel.acceleration}/${n.strip.panel.deceleration}/${n.strip.panel.maxVelocity}`);
    ok(n.strip.panel.acceleration === 40 && n.strip.panel.deceleration === 30 && n.strip.panel.maxVelocity === 20, 'MobyPanelInput* is not 40/30/20');
    ok(n.strip.channel.acceleration === 50 && n.strip.channel.deceleration === 40 && n.strip.channel.maxVelocity === 10, 'MobyChannelInput* is not 50/40/10');
    // The unit's own evidence: the channel axis closes at exactly 0.3 s.
    console.log(`  one step: channel ${n.motion.stepSeconds.channel.toFixed(4)} s, panel ${n.motion.stepSeconds.panel.toFixed(4)} s`);
    ok(Math.abs(n.motion.stepSeconds.channel - 0.3) < 1e-6, `the channel axis closes at ${n.motion.stepSeconds.channel}, not 0.300000 s - the evidence for the unit`);

    // The four SceneTransitions/* entries, which NXE_GLUE_SPEC §10.4 lists as
    // unresolved: they are XuiVariables in the same Variables.xur.
    console.log(`  sceneTransitions: ${n.sceneTransitions.map((t) => `${t.name}=${t.value ?? 'unset'}`).join(' ')}`);
    ok(n.sceneTransitions.length === 4, 'the four SceneTransitions/* entries did not resolve');
    ok(n.sceneTransitions[0].value === 1 && n.sceneTransitions[2].value === null,
      'TransitionScene/TransitionChannel are not 1/unset');

    // The background: DashBkgnd with AuraScene mounted where the ImagePath is.
    ok(n.aura, 'no Aura background');
    if (n.aura) {
      console.log(`  aura: ${n.aura.scene} -> ${n.aura.auraScene} (${n.aura.auraImagePath})`);
      console.log(`    AuraControl: ThemeImageIndex=${n.aura.control?.themeImageIndex} SurfaceSphere=${n.aura.control?.surfaceSphere} BackgroundImage="${n.aura.control?.backgroundImage}"`);
      ok(n.aura.errors.length === 0, `aura errors: ${n.aura.errors.join(' | ')}`);
      ok(n.aura.scene === 'dashmain/DashBkgnd.xur', 'the background is not DashBkgnd.xur');
      ok(n.aura.auraScene === 'controlp/AuraScene.xur', 'AuraScene is not mounted where the ImagePath is');
      ok(n.aura.control?.themeImageIndex === 1, 'homepage.xur AuraControl.ThemeImageIndex is not 1');
      ok(n.aura.control?.backgroundImage === '', 'AuraControl.BackgroundImage is set - a theme would be downloaded content');
      ok(n.aura.placeholders.length >= 4, 'the Aura placeholder list is empty');
    }

    // Judge F round 2, N1: AuraScene pairs a XuiShader with a same-numbered
    // white.png XuiImage thirty-three times, and drawing those images as
    // pictures puts thirty opaque plates on the floor. The rule that stops it
    // fires on exactly 33 elements in the whole build.
    ok(n.avatars, 'no XuiAvatar report');
    console.log(`  avatars: ${n.avatars.map((a) => `${a.element}<-${a.drawn} ${a.box.w.toFixed(0)}x${a.box.h.toFixed(0)}`).join(' ') || '(none reached)'}`);
    ok(n.avatars.length === 1 && n.avatars[0].drawn === 'AvatarSilhouette.png',
      'the signed-out gamer card does not draw dashcomm/AvatarSilhouette.png');

    // The projection, re-derived from its own landmarks rather than trusted.
    checkProjection(n.projection);
  }

  await home.page.screenshot({ path: `${OUT}/nxe-home.png` });
  measure('home', `${OUT}/nxe-home.png`, HOME_FRAME, HOME_LANDMARKS, 2.0);
  const surfaces = await home.page.evaluate(() => document.querySelectorAll('[data-xui-placeholder^="shader-surface"]').length);
  console.log(`  shader draw surfaces suppressed: ${surfaces}`);
  ok(surfaces === 33, `${surfaces} XuiImages recognised as shader draw surfaces, expected 33`);
  auraFloor(`${OUT}/nxe-home.png`, HOME_FRAME);
  // The SIZE ramp, measured on the DOM rather than on pixels: a dimmed row's
  // ink falls below any luma threshold before its glyphs get smaller, so a
  // cap-height detector on our own render measures the OPACITY ramp and not
  // the size one. The rendered row boxes carry the table's scales exactly, and
  // the table's agreement with the frame's 33/25/18/15/14 is asserted in
  // tests/nxe.test.ts, where it is arithmetic and cannot flake.
  const rowScales = await home.page.evaluate(() => {
    const out = {};
    for (const row of ['Current', 'Next1', 'Next2', 'Next3', 'Next4', 'Next5', 'Next6', 'Prev1']) {
      const el = document.querySelector(`[data-xui-scene="controlp/MobyChannelScene.xur"] [data-xui-id="${row}"]`);
      if (el) out[row] = el.getBoundingClientRect().height;
    }
    return out;
  });
  const cur = rowScales.Current ?? 0;
  console.log(`  queue row boxes: ${Object.entries(rowScales).map(([r, h]) => `${r}=${(h / cur).toFixed(2)}`).join(' ')}`);
  const wantRamp = { Next1: 0.75, Next2: 0.55, Next3: 0.45, Next4: 0.4, Next5: 0.35, Next6: 0.35, Prev1: 0.75 };
  for (const [row, want] of Object.entries(wantRamp)) {
    const got = (rowScales[row] ?? 0) / cur;
    ok(Math.abs(got - want) < 0.02, `Queue\\${row} renders at ${got.toFixed(3)} of the current row, expected ${want}`);
  }
  await home.page.close();

  /* ----------------------------------------- 1b. the signed-out avatar */

  // dashcomm/AvatarSilhouette.png is the console's own signed-out figure and it
  // is in the archive [CODE 0x921421ec]. Its SIZE comes from the XuiAvatar's
  // authored 776x776 box; the two offsets are measured off the frame.
  const av = await load(`${BASE}/?build=9199&mute`);
  await av.page.screenshot({ path: `${OUT}/nxe-avatar.png` });
  silhouette(`${OUT}/nxe-avatar.png`, QUEUE_FRAME);
  await av.page.close();

  /* ------------------------------------------------ 1c. a Rome panel */

  // 40 of the 311 scenes are a 460x495 RomeRootScene panel. It is placed from
  // RomeFrontPosition (96, 602) and its own authored size - no fitted number.
  const rome = await load(`${BASE}/?build=9199&mute&page=arcade/CollectionFilterPanel.xur`);
  ok(rome.pageErrors.length === 0, `rome js errors: ${rome.pageErrors.join(' | ')}`);
  const rp = rome.dash.nxe?.legacy;
  ok(rp, 'no Rome panel mounted');
  if (rp) {
    console.log(`  rome: ${rp.scene} ${rp.size.w}x${rp.size.h} at (${rp.left}, ${rp.top}) kind=${rp.kind}`);
    ok(rp.kind === 'rome', `the 460x495 panel was hosted as a ${rp.kind} page`);
    ok(rp.size.w === 460 && rp.size.h === 495, `the Rome panel is ${rp.size.w}x${rp.size.h}`);
    ok(rp.left === 96 && rp.top === 107, `the Rome panel is at (${rp.left}, ${rp.top}), not RomeFrontPosition minus its height`);
    const rl = rome.dash.nxe?.legend;
    ok(rl?.buttons.length === 2 && rl.buttons[0].text === 'Select' && rl.buttons[1].text === 'Back',
      `the Rome panel's parked legend was not hoisted: ${JSON.stringify(rl?.buttons)}`);
  }
  const overlay = await rome.page.evaluate(() => document.querySelectorAll('[data-xui-layer="OverlayLayer"]').length);
  ok(overlay === 1, `${overlay} OverlayLayers; RomeOverlayScene did not mount`);
  await rome.page.screenshot({ path: `${OUT}/nxe-rome.png` });
  measure('rome', `${OUT}/nxe-rome.png`, ROME_FRAME, ROME_LANDMARKS, 2.5);
  await rome.page.close();

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

  /* ------------------------------------------ 3. the scripted navigation */

  // One page, one scripted path, driven a 60 Hz frame at a time so every number
  // below is countable: boot, Right/Left through the My Xbox panels, Up/Down
  // through the channels, A into System Settings, A into Console Settings, B
  // back twice. `&manual` hands the clock to stepFrames(), so the strip's
  // position at tick N is the same in the browser, under ?frame= and here.
  const nav = await load(`${BASE}/?build=9199&mute&manual`);
  ok(nav.pageErrors.length === 0, `nav js errors: ${nav.pageErrors.join(' | ')}`);
  const path = await nav.page.evaluate(async () => {
    const api = window.__dashApi, s = api.nxeShell;
    const steps = [];
    const run = async (label, act, frames) => {
      const before = api.nxe();
      const cues0 = before.cues.length;
      await act();
      const positions = [];
      for (let i = 0; i < frames; i++) {
        // YIELD between frames. The shell's channel change folds, then FETCHES
        // the new channel's scenes, then unfolds; a synchronous frame loop
        // never lets that fetch land, so the unfold cue piled up at the end of
        // the block and the fold-to-unfold gap read 42 ticks instead of the
        // cascade's own. The tick numbers are the engine's and do not move.
        await new Promise((r) => setTimeout(r, 0));
        api.stepFrames(1);
        const r = api.nxe();
        positions.push({ t: r.motion.frames, p: +r.motion.panel.cursor.toFixed(4), c: +r.motion.channel.cursor.toFixed(4), z: +(r.panels[0]?.z ?? 0).toFixed(1) });
      }
      await s.idle();
      for (let i = 0; i < 20; i++) api.stepFrames(1);
      await s.idle();
      const r = api.nxe();
      steps.push({
        label, positions,
        cues: r.cues.slice(cues0).map((c) => ({ name: c.name, tick: c.tick, evidence: c.evidence })),
        panel: +r.motion.panel.cursor.toFixed(3), channel: +r.motion.channel.cursor.toFixed(3),
        fold: r.motion.fold.phase, page: r.legacy?.scene ?? null,
        pages: r.pages.map((q) => `${q.scene} (${q.form}/${q.curve})`),
        legend: r.legend?.buttons.map((b) => `${b.group}="${b.text}"@${Math.round(b.x)}`).join(' ') ?? '',
        rows: r.legacy?.rows ?? [],
        focus: r.legacy?.focusId ?? null,
      });
    };
    await run('Right', () => s.right(), 30);
    await run('Left', () => s.left(), 30);
    await run('Up (channel)', () => s.up(), 60);
    await run('Down (channel)', () => s.down(), 60);
    for (let i = 0; i < 7; i++) { s.right(); for (let j = 0; j < 30; j++) api.stepFrames(1); await s.idle(); }
    await run('A -> System Settings', () => s.press(), 60);
    await run('A -> Console Settings', () => s.press(), 60);
    await run('B', () => s.back(), 60);
    await run('B (home)', () => s.back(), 90);
    const r = api.nxe();
    return { steps, unbound: r.unboundCommands, errors: r.errors, cues: r.cues };
  });
  ok(path.errors.length === 0, `nav shell errors: ${path.errors.join(' | ')}`);
  for (const st of path.steps) {
    const moved = st.positions.filter((p, i) => i === 0 || p.p !== st.positions[i - 1].p || p.c !== st.positions[i - 1].c).length;
    console.log(`  ${st.label.padEnd(22)} panel ${String(st.panel).padStart(5)}  channel ${String(st.channel).padStart(5)}  fold ${st.fold.padEnd(9)} ${st.page ?? '(home)'}`);
    console.log(`      cues: ${st.cues.map((c) => `${c.name}@${c.tick}${c.evidence === 'inferred' ? '*' : ''}`).join(' ') || '(none)'}`);
    console.log(`      panel0 z per tick: ${st.positions.slice(0, 24).map((p) => p.z.toFixed(0)).join(' ')}${st.positions.length > 24 ? ' ...' : ''}  (${moved} ticks moved)`);
  }
  const step = (label) => path.steps.find((x) => x.label === label);
  ok(step('Right').panel === 1, 'Right did not move the panel cursor one place');
  ok(step('Left').panel === 0, 'Left did not move it back');
  ok(step('Right').cues.some((c) => c.name === 'SoundPanelRight'), 'Right played no SoundPanelRight');
  ok(step('Left').cues.some((c) => c.name === 'SoundPanelLeft'), 'Left played no SoundPanelLeft');
  ok(step('Up (channel)').cues.some((c) => c.name === 'SoundChannelUp'), 'Up played no SoundChannelUp');
  ok(step('Up (channel)').cues.some((c) => c.name === 'SoundPanelFold'), 'a channel change did not fold the strip');
  // Judge F round 2, N3: the footage's channel change is MOVE, then FOLD, then
  // UNFOLD, not a fold on the key press. On the 9199 capture the cue onsets sit
  // at +0.03 s (channel), +0.47 and +0.57 (the two clicks) and the unfold burst
  // at +0.83 [FRAME Yrt, motion onset t = 238.48 s]. So the fold cue must land
  // one channel move after the channel cue - 60 x stepDuration(50/40) = exactly
  // 18 ticks - and the unfold after it, never on the same tick.
  for (const label of ['Up (channel)', 'Down (channel)']) {
    const cues = step(label).cues;
    const ch = cues.find((c) => c.name.startsWith('SoundChannel'));
    const fold = cues.find((c) => c.name === 'SoundPanelFold');
    const unfold = cues.find((c) => c.name === 'SoundPanelUnfold');
    ok(ch && fold && unfold, `${label}: expected a channel cue, a fold and an unfold, got ${cues.map((c) => c.name).join(',')}`);
    if (!ch || !fold || !unfold) continue;
    console.log(`      ${label}: channel@${ch.tick} fold@${fold.tick} (+${fold.tick - ch.tick}) unfold@${unfold.tick} (+${unfold.tick - fold.tick})`);
    ok(fold.tick - ch.tick === 18, `${label}: the fold cue is ${fold.tick - ch.tick} ticks after the channel cue, not the move's 18`);
    // 1/FoldSpeed is 0.10 s = 6 ticks, and the footage's two clicks are 0.10 s
    // apart. Ours also waits for the new channel's scenes to be FETCHED, which
    // the console did not have to do, so the gate allows the cascade plus a
    // couple of ticks of that and refuses anything that skips the fold.
    const gap = unfold.tick - fold.tick;
    ok(gap >= 5 && gap <= 14, `${label}: the unfold cue is ${gap} ticks after the fold, not the cascade's 6`);
  }
  ok(step('Down (channel)').channel === 6, `Down did not return to My Xbox (channel ${step('Down (channel)').channel})`);
  const sys = step('A -> System Settings');
  ok(sys.page === 'consoles/SystemScene.xur', `A on the Settings slot opened ${sys.page}`);
  ok(sys.rows.length === 7, `System Settings has ${sys.rows.length} rows, expected 7 (navIPTVSettings hidden)`);
  ok(sys.rows[0] === 'Console Settings' && sys.rows[6] === 'Initial Setup', `System Settings rows: ${sys.rows.join(' | ')}`);
  ok(sys.pages[0]?.includes('plain'), `the first page should take the PLAIN curve (the fold covers it): ${sys.pages.join(', ')}`);
  ok(sys.cues.some((c) => c.name === 'SoundButtonSelect'), 'A played no SoundButtonSelect');
  ok(sys.fold === 'folded', 'the strip did not fold away behind the page');
  const cs = step('A -> Console Settings');
  ok(cs.page === 'consoles/dashSysCslSet.xur', `A on Console Settings opened ${cs.page}`);
  ok(cs.rows.length === 8 && cs.rows[0] === 'Display' && cs.rows[7] === 'System Info', `Console Settings rows: ${cs.rows.join(' | ')}`);
  ok(cs.pages[1]?.includes('ex'), `a legacy page over a legacy page should take the ...Ex curve: ${cs.pages.join(', ')}`);
  ok(cs.legend.includes('AButton="Select"') && cs.legend.includes('BButton="Back"'), `Console Settings legend: ${cs.legend}`);
  const back1 = path.steps.filter((x) => x.label === 'B')[0];
  ok(back1.page === 'consoles/SystemScene.xur', `B did not pop back to System Settings (${back1.page})`);
  ok(back1.cues.some((c) => c.name === 'SoundButtonBack'), 'B played no SoundButtonBack');
  const back2 = step('B (home)');
  ok(back2.page === null, 'the second B did not return to the home strip');
  ok(back2.cues.some((c) => c.name === 'SoundPanelUnfold'), 'returning home did not unfold the strip');
  // The integrator against its own closed form, on the shell's live axes.
  const moved = await nav.page.evaluate(() => {
    const r = window.__dashApi.nxe();
    return { panel: r.motion.panel.lastMoveSeconds, channel: r.motion.channel.lastMoveSeconds, step: r.motion.stepSeconds };
  });
  console.log(`  one move, integrated: panel ${(moved.panel * 60).toFixed(3)} frames (closed ${(moved.step.panel * 60).toFixed(3)}), channel ${(moved.channel * 60).toFixed(3)} (closed ${(moved.step.channel * 60).toFixed(3)})`);
  ok(Math.abs(moved.panel - moved.step.panel) * 60 <= 0.5, `the panel axis integrated ${(moved.panel * 60).toFixed(3)} frames against a closed form of ${(moved.step.panel * 60).toFixed(3)}`);
  ok(Math.abs(moved.channel - moved.step.channel) * 60 <= 0.5, `the channel axis integrated ${(moved.channel * 60).toFixed(3)} frames against a closed form of ${(moved.step.channel * 60).toFixed(3)}`);
  console.log(`  unbound commands: ${path.unbound.length ? path.unbound.join(' | ') : '(none)'}`);
  await nav.page.screenshot({ path: `${OUT}/nxe-nav-home.png` });
  await nav.page.close();

  /* --------------------------------------------- 4. the mount is disposable */

  // The dev-server leak: a hot update re-runs app/main.ts, and without a
  // teardown the page ends up with two viewports, two input routers and two
  // clocks - one key press driving two shells, both still in the document.
  // Mounting twice here is the same path a hot update takes.
  const twice = await load(`${BASE}/?build=9199&mute`);
  const before = await twice.page.evaluate(() => ({
    hmr: window.__dash.hmr,
    viewports: document.querySelectorAll('.xui-viewport').length,
    descriptions: document.querySelectorAll('[data-xui-id="Description"]').length,
    slots: document.querySelectorAll('.nxe-panel').length,
    queue: document.querySelectorAll('[data-xui-id="Current"]').length,
  }));
  const after = await twice.page.evaluate(async () => {
    await window.__dashApi.remount();
    return {
      hmr: window.__dash.hmr,
      viewports: document.querySelectorAll('.xui-viewport').length,
      descriptions: document.querySelectorAll('[data-xui-id="Description"]').length,
      slots: document.querySelectorAll('.nxe-panel').length,
      queue: document.querySelectorAll('[data-xui-id="Current"]').length,
      errors: window.__dash.errors,
    };
  });
  console.log(`  first mount : ${JSON.stringify(before)}`);
  console.log(`  after remount: ${JSON.stringify(after)}`);
  ok(after.hmr.mounts === 2, `remount() did not run main() again (mounts ${after.hmr.mounts})`);
  ok(after.hmr.viewports === 1, `${after.hmr.viewports} live viewports after a remount, expected 1`);
  ok(after.hmr.inputRouters === 1, `${after.hmr.inputRouters} attached input routers after a remount, expected 1`);
  ok(after.hmr.audioContexts === 1, `${after.hmr.audioContexts} audio banks after a remount, expected 1`);
  ok(after.hmr.clocks === 1, `${after.hmr.clocks} timeline clocks after a remount, expected 1`);
  ok(after.viewports === 1, `${after.viewports} .xui-viewport elements in the document`);
  ok(after.descriptions === before.descriptions, `the "%d of %d" description stacked: ${before.descriptions} -> ${after.descriptions}`);
  ok(after.queue === before.queue, `the channel queue stacked: ${before.queue} -> ${after.queue}`);
  ok(after.slots === before.slots, `the panel strip stacked: ${before.slots} -> ${after.slots}`);
  ok(after.errors.length === 0, `errors after a remount: ${after.errors.join(' | ')}`);
  // One press must reach exactly one shell.
  const oneHandler = await twice.page.evaluate(() => {
    const before = window.__dash.nxe.motion.panel.target;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', bubbles: true }));
    return { before, after: window.__dashApi.nxe().motion.panel.target, log: window.__dashApi.input.log.length };
  });
  ok(oneHandler.after - oneHandler.before === 1,
    `one ArrowRight moved the panel target by ${oneHandler.after - oneHandler.before}, not 1 - a second shell is still listening`);
  console.log(`  one ArrowRight moved the panel target ${oneHandler.before} -> ${oneHandler.after}`);
  await twice.page.close();

  /* ------------------------------------------------ 5. Blades is untouched */

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

/**
 * Re-derive the projection's fit from its own thirty-two landmarks.
 *
 * The point is not to re-run the fit but to prove the SHIPPED numbers are the
 * ones the landmarks choose: a grid search around them must not find anything
 * better by more than a tenth of a pixel, and the M4a numbers must be worse.
 */
function checkProjection(p) {
  const FRONT = { x: 96, y: 570 }, BACK = { x: 1184, y: 590, z: 1000 };
  const SPACING = 505, W = 420, H = 320, SURFACE = -2;
  const box = (m, k) => {
    const z = k * SPACING;
    const t = z / BACK.z;
    const px = FRONT.x + (BACK.x - FRONT.x) * t;
    const py = FRONT.y + (BACK.y - FRONT.y) * t + SURFACE;
    const s = 1 / (1 + z / m.f);
    return {
      left: m.cu + (px - m.cu) * s, right: m.cu + (px + W - m.cu) * s,
      bottom: m.cv + (py - m.cv) * s, top: m.cv + (py - H - m.cv) * s,
    };
  };
  const rms = (m) => Math.sqrt(LANDMARKS.reduce((a, l) => a + (box(m, l.panel)[l.edge] - l.measured) ** 2, 0) / LANDMARKS.length);
  const mine = { f: p.focal, cu: p.centreU, cv: p.centreV };
  const ours = rms(mine);
  let best = { ...mine, r: ours };
  for (let df = -40; df <= 40; df += 2) {
    for (let du = -6; du <= 6; du += 0.5) {
      for (let dv = -6; dv <= 6; dv += 0.5) {
        const c = { f: mine.f + df, cu: mine.cu + du, cv: mine.cv + dv };
        const r = rms(c);
        if (r < best.r) best = { ...c, r };
      }
    }
  }
  const worst = Math.max(...LANDMARKS.map((l) => Math.abs(box(mine, l.panel)[l.edge] - l.measured)));
  const m4a = rms({ f: 1428, cu: 154.5, cv: 356.5 });
  console.log(`    fit over ${LANDMARKS.length} landmarks on 2 frames: rms ${ours.toFixed(3)} px, worst ${worst.toFixed(2)} px`);
  console.log(`    best on this grid: f=${best.f} Cu=${best.cu} Cv=${best.cv} rms ${best.r.toFixed(3)}   (M4a 1428/154.5/356.5 -> rms ${m4a.toFixed(3)})`);
  ok(ours - best.r < 0.05, `the shipped projection is not the fit: rms ${ours.toFixed(3)} against ${best.r.toFixed(3)} at ${best.f}/${best.cu}/${best.cv}`);
  ok(ours < m4a - 0.3, `the refit did not beat M4a's numbers (${ours.toFixed(3)} against ${m4a.toFixed(3)})`);
  ok(worst < 3, `worst projection residual ${worst.toFixed(2)} px`);
}


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

/**
 * The list's row pitch, measured the same way in both.
 *
 * The pitch is the landmark no border offset can shift, so it is what settles
 * whether the list runs at Blades' 45 or at the 46 the spec reads off
 * `SystemScene`'s hand-placed nav buttons.
 *
 * THE DETECTOR IS A FIT, NOT EIGHT PICKS. Taking the eight strongest rising
 * steps and averaging their gaps is what M4a did, and Judge F caught it locking
 * onto non-separators for two of the eight - which makes the "mean pitch" the
 * distance between the first and last thing it happened to pick, divided by
 * seven. Instead: score every (pitch, origin) pair by the total rising-step
 * response at the eight positions it predicts, and take the best. A comb of
 * eight teeth cannot be dragged off by one strong impostor.
 */
/**
 * The Aura floor, binned by the FRAME's own luma over achromatic 16x16 blocks.
 *
 * This is the measurement Judge F round 2 made to find the white plates: with
 * them drawn, the dark end of the range read +157/+177 and the light end
 * -39/-72/-87. The gate holds both ends. It is deliberately a WHOLE-SCREEN
 * statistic - the floor under the front panel is a separate, still-open
 * residual and is printed beside it rather than folded into the pass.
 */
function auraFloor(ourPath, framePath) {
  const ours = readPng(ourPath), frame = readPng(framePath);
  const k = frame.w / 1280;
  const bins = new Map();
  for (let y = 8; y < 712; y += 16) {
    for (let x = 8; x < 1272; x += 16) {
      const f = mean(frame, { x: Math.round(x * k), y: Math.round(y * k), w: Math.round(16 * k), h: Math.round(16 * k) });
      const o = mean(ours, { x, y, w: 16, h: 16 });
      const b = Math.floor(f / 20) * 20;
      const e = bins.get(b) ?? { n: 0, s: 0 };
      e.n++; e.s += o - f;
      bins.set(b, e);
    }
  }
  const rows = [...bins.entries()].filter(([, e]) => e.n >= 20).sort((a, b) => a[0] - b[0]);
  console.log(`  aura, ours - frame by frame-luma bin: ${rows.map(([b, e]) => `${b}:${(e.s / e.n).toFixed(1)}`).join(' ')}`);
  for (const [b, e] of rows) {
    ok(Math.abs(e.s / e.n) < 30, `the Aura background is ${(e.s / e.n).toFixed(1)} luma off in the ${b}..${b + 19} bin`);
  }
  // The floor under the front slot, printed with its number and NOT gated:
  // it is the residual the README carries.
  const line = (im, sc, y) => mean(im, { x: Math.round(110 * sc), y: Math.round(y * sc), w: Math.round(390 * sc), h: Math.max(1, Math.round(2 * sc)) });
  const ys = [572, 590, 610, 630, 650, 670, 690, 710];
  console.log(`    floor rows ${ys.join('/')}: frame ${ys.map((y) => line(frame, k, y).toFixed(0)).join('/')}  ours ${ys.map((y) => line(ours, 1, y).toFixed(0)).join('/')}`);
}

/**
 * The signed-out avatar silhouette against the frame it was placed from.
 *
 * Both images are measured the same way: the extent of near-black pixels in
 * the band the gamer-card slot occupies. The console has the figure 50 z units
 * IN FRONT of the panel and this runtime renders the slot flat, which is worth
 * 2.7 % of its height - so the tolerance is a measured number, not a guess.
 */
function silhouette(ourPath, framePath) {
  const box = (im) => {
    const k = im.w / 1280;
    const rows = new Map();
    for (let y = Math.round(150 * k); y < Math.round(650 * k); y++) {
      let n = 0;
      for (let x = Math.round(600 * k); x < Math.round(1050 * k); x++) if (luma(im, x, y) < 55) n++;
      if (n > 3 * k) rows.set(Math.round(y / k), n);
    }
    const ys = [...rows.keys()].sort((a, b) => a - b);
    if (!ys.length) return null;
    return { top: ys[0], bottom: ys[ys.length - 1], h: ys[ys.length - 1] - ys[0] };
  };
  const f = box(readPng(framePath)), o = box(readPng(ourPath));
  ok(f && o, 'no silhouette found on one of the two images');
  if (!f || !o) return;
  console.log(`  avatar silhouette: frame y ${f.top}..${f.bottom} (h ${f.h})   ours y ${o.top}..${o.bottom} (h ${o.h})`);
  ok(Math.abs(o.top - f.top) < 6, `the silhouette's head is ${(o.top - f.top).toFixed(1)} px off`);
  ok(Math.abs(o.h / f.h - 1) < 0.08, `the silhouette is ${((o.h / f.h - 1) * 100).toFixed(1)} % off in height`);
}

function listPitch(ourPath, framePath) {
  if (!existsSync(framePath)) return;
  const rows = (path) => {
    const im = readPng(path);
    const k = im.w / 1280;
    // The list is 420 wide at design x ~218..628; take its middle so the
    // separators are the only thing that spans the band.
    const p = colProfile(im, Math.round(240 * k), Math.round(600 * k), 0, im.h);
    const step = (y) => {
      const i = Math.round(y * k);
      if (i < 1 || i >= p.length) return 0;
      return Math.max(0, p[i] - p[i - 1]);
    };
    let best = { pitch: 0, origin: 0, score: -1 };
    for (let pitch = 40; pitch <= 50; pitch += 0.02) {
      for (let origin = 140; origin <= 200; origin += 0.25) {
        let score = 0;
        for (let n = 0; n < 8; n++) score += step(origin + n * pitch);
        if (score > best.score) best = { pitch, origin, score };
      }
    }
    const picked = [];
    for (let n = 0; n < 8; n++) picked.push(best.origin + n * best.pitch);
    return { picked, mean: best.pitch, origin: best.origin };
  };
  const a = rows(framePath), b = rows(ourPath);
  console.log(`    row pitch: frame ${a.mean.toFixed(2)}  ours ${b.mean.toFixed(2)}  d ${(b.mean - a.mean).toFixed(2)}`);
  console.log(`    row 0 top: frame ${a.origin.toFixed(1)}  ours ${b.origin.toFixed(1)}  d ${(b.origin - a.origin).toFixed(2)}`);
  if (Math.abs(b.mean - a.mean) > 0.75) fails.push(`legacy row pitch ${b.mean.toFixed(2)} against the frame's ${a.mean.toFixed(2)}`);
  if (Math.abs(b.origin - a.origin) > 4) fails.push(`the list's first row is ${(b.origin - a.origin).toFixed(1)} px off the frame's`);
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
    const a = edgeNear(ref, m.kind, m.at, m.band, m.win);
    const b = edgeNear(ours, m.kind, m.at, m.band, m.win);
    if (!a || !b) { fails.push(`${label} ${m.name}: no edge found`); continue; }
    const d = b.at - a.at;
    worst = Math.max(worst, Math.abs(d));
    console.log(`    ${m.name.padEnd(22)} ${a.at.toFixed(1).padStart(7)} ${b.at.toFixed(1).padStart(7)} ${d.toFixed(2).padStart(6)}`);
    const tol = m.tol ?? tolerance;
    if (Math.abs(d) > tol) fails.push(`${label} ${m.name}: ${d.toFixed(2)} px off the frame (tolerance ${tol})`);
  }
  console.log(`    worst |d| = ${worst.toFixed(2)} px`);
}
