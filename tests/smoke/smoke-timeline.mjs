// The timeline engine driving real scenes in a real browser.
//
// The wall clock is off (&manual): every step below is an explicit
// __dashApi.stepFrames call, so a slow machine cannot change the answer.
//
// Two things are checked: that a control's state change plays the range the
// skin defines and lands the parsed keyframe values in the DOM, and that a
// scene-level range (dashmain's blade slide) moves the elements it animates and
// settles on its End frame.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'out');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.SMOKE_URL ?? 'http://localhost:5173';

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

mkdirSync(OUT, { recursive: true });
let browser;
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });

  /* ---------------------------------------------------------- control states */

  const page = await open(browser, `${BASE}/?scene=consoles/dashSysCslSet.xur&manual`);
  check(page.errors.length === 0, `page errors: ${page.errors.join(' | ')}`);

  const hasApi = await page.p.evaluate(() => !!window.__dashApi);
  check(hasApi, 'window.__dashApi was never installed');

  // legend_a wears the legend_A visual: Normal@0, Press@2, NormalDisable@4.
  // Its Button1 figure is texture-filled, and the NormalDisable keyframe swaps
  // the glyph and halves the opacity - the values the reference frame shows.
  const normal = await readLegend(page.p);
  check(/A-Button\.png/.test(normal.texture ?? ''), `Normal glyph is ${normal.texture}`);
  check(normal.buttonOpacity === '', `Normal Button1 opacity should be the default, got "${normal.buttonOpacity}"`);
  check(normal.presenterShown, 'Normal must show the text presenter');

  const setFocus = await page.p.evaluate(() => window.__dashApi.setState('legend_a', 'Focus'));
  check(setFocus, 'setState(legend_a, Focus) found no scope');
  const focus = await scope(page.p, 'legend_A');
  // legend_A defines no Focus frame, so the documented chain lands on Normal.
  check(focus?.range?.startsWith('Normal'), `Focus should fall back to Normal, range is ${focus?.range}`);
  check(focus?.lastCue === 'legend_a:Normal', `lastCue is ${focus?.lastCue}`);

  await page.p.evaluate(() => window.__dashApi.setState('legend_a', 'Press'));
  const pressAt0 = await scope(page.p, 'legend_A');
  check(pressAt0?.tick === 2, `Press opens on frame 2, got ${pressAt0?.tick}`);
  check(pressAt0?.playing === true, 'Press must start playing');
  await page.p.evaluate(() => window.__dashApi.stepFrames(30));
  const pressSettled = await scope(page.p, 'legend_A');
  check(pressSettled?.tick === 3, `EndPress is frame 3, settled at ${pressSettled?.tick}`);
  check(pressSettled?.playing === false, 'EndPress carries Stop, so the scope must halt');

  await page.p.evaluate(() => window.__dashApi.setState('legend_a', 'NormalDisable'));
  await page.p.evaluate(() => window.__dashApi.stepFrames(4));
  const disabled = await readLegend(page.p);
  check(/disabled-Button\.png/.test(disabled.texture ?? ''), `NormalDisable glyph is ${disabled.texture}`);
  check(disabled.buttonOpacity === '0.5', `NormalDisable Button1 opacity is "${disabled.buttonOpacity}", expected 0.5`);
  check(!disabled.presenterShown, 'NormalDisable hides the text presenter (Show=false at frame 4)');

  // The meta panel visual carries a 51-keyframe range, 1To2 at frame 1 to
  // 1To2End at 21. Sampled at 0 / 15 / 30 / 60 timeline frames.
  const scopes = await page.p.evaluate(() => window.__dashApi.scopeIds());
  const meta = scopes.find((s) => s.endsWith('metaScene_1line'));
  check(!!meta, `no metaScene_1line scope among ${scopes.length} scopes`);
  if (meta) {
    const samples = [];
    await page.p.evaluate((id) => window.__dashApi.playRange(id, '1To2', '1To2End'), meta);
    samples.push(await metaSample(page.p, meta));
    for (const step of [15, 15, 30]) {
      await page.p.evaluate((n) => window.__dashApi.stepFrames(n), step);
      samples.push(await metaSample(page.p, meta));
    }
    const [t0, t15, t30, t60] = samples;
    check(t0.tick === 1, `1To2 opens on frame 1, got ${t0.tick}`);
    check(t15.tick === 16, `15 steps from frame 1 is 16, got ${t15.tick}`);
    check(t15.transform !== t0.transform || t15.opacity !== t0.opacity,
      `highlight1 must move between frame 1 and 16 (was "${t0.transform}" / "${t0.opacity}")`);
    check(t30.tick === 21 && t30.playing === false, `must settle on 1To2End (21), got ${t30.tick} playing=${t30.playing}`);
    check(t60.tick === 21 && t60.transform === t30.transform, 'a settled scope must not drift');
    check(t30.shown, 'highlight1 is Show=true across the 1To2 range');
  }
  await page.close();

  /* ------------------------------------------------------- a scene-wide range */

  const dm = await open(browser, `${BASE}/?scene=dashmain/dashmain.xur&manual&play=RootScene:1To2-1To2End`);
  check(dm.errors.length === 0, `dashmain page errors: ${dm.errors.join(' | ')}`);
  // RootScene's 1To2 is "open blade 2": of its 73 timelines, 29 carry more than
  // one keyframe inside frames 1..21, and the tab groups that do NOT move are
  // meant not to - Tab1's keyframes at 1 and 22 are both None, so it holds.
  const ANIMATED = ['Tab2', 'imgLogo', 'color_highlight_rt', 'blade_1_txt', 'wing_left'];
  const ALL = ['Tab1', 'Tab2', 'Tab3', 'Tab4', 'Tab5', ...ANIMATED];
  const before = await styles(dm.p, ALL);
  check(Object.keys(before).length >= 6, `expected the blade elements, found ${Object.keys(before).length}`);
  const rootAt0 = await scope(dm.p, 'RootScene');
  check(rootAt0?.tick === 1, `?play= must open 1To2 on frame 1, got ${rootAt0?.tick}`);
  check(rootAt0?.playing === true, '?play= must leave the scope playing');

  await dm.p.evaluate(() => window.__dashApi.stepFrames(20));
  const after = await styles(dm.p, ALL);
  const moved = Object.keys(before).filter((id) =>
    after[id] && (after[id].transform !== before[id].transform || after[id].opacity !== before[id].opacity || after[id].display !== before[id].display));
  check(moved.length >= 3, `only ${moved.length} elements moved over the 20 frames of 1To2: ${moved.join(',')}`);
  check(moved.includes('Tab2'), `Tab2 is the blade 1To2 opens (Opacity keyframes at 1/12/17); it did not move. Moved: ${moved.join(',')}`);
  check(!moved.includes('Tab1'), 'Tab1 holds across 1To2 (both keyframes are None) and must not move');
  const rootAt20 = await scope(dm.p, 'RootScene');
  check(rootAt20?.tick === 21, `1To2End is frame 21, got ${rootAt20?.tick}`);
  check(rootAt20?.playing === false, '1To2End carries Stop');
  const dash = await dm.p.evaluate(() => JSON.parse(JSON.stringify(window.__dash.timeline)));
  check(Array.isArray(dash.scopes) && dash.scopes.length > 0, '__dash.timeline.scopes is empty');
  check(dash.frozenAt === null, `__dash.timeline.frozenAt should be null, got ${dash.frozenAt}`);
  await dm.p.screenshot({ path: `${OUT}/timeline-dashmain-f21.png` });
  await dm.close();

  /* ------------------------------------------------------------- ?frame= pins */

  const frozen = await open(browser, `${BASE}/?scene=dashmain/dashmain.xur&frame=10`);
  const f = await frozen.p.evaluate(() => JSON.parse(JSON.stringify(window.__dash.timeline)));
  check(f.frozenAt === 10, `?frame=10 must freeze the engine, frozenAt=${f.frozenAt}`);
  check(f.playing === 0, `?frame= must leave nothing playing, ${f.playing} are`);
  check(f.scopes.every((s) => s.tick === 10), '?frame= must pin every scope to the same frame');
  await frozen.close();

  console.log(`  ${OUT}/timeline-dashmain-f21.png written`);
} catch (err) {
  fails.push(`threw: ${err instanceof Error ? err.stack : String(err)}`);
} finally {
  if (browser) await browser.close();
}

if (fails.length) { for (const f of fails) console.error('  FAIL ' + f); console.log('SMOKE_FAIL'); process.exit(1); }
console.log('SMOKE_PASS');

async function open(browser, url) {
  const p = await browser.newPage();
  await p.setViewport({ width: 1120, height: 770, deviceScaleFactor: 1 });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await p.waitForFunction(() => document.body.dataset.ready === 'true' || !!document.querySelector('.banner'), { timeout: 60000 });
  return { p, errors, close: () => p.close() };
}

function scope(p, tail) { return p.evaluate((tail) => {
  const s = window.__dashApi.engine.all().find((s) => s.id.endsWith(tail));
  return s ? { id: s.id, tick: s.tick, playing: s.playing, range: s.range ? s.range.join('..') : null, lastCue: s.lastCue } : null;
}, tail); }

function readLegend(p) { return p.evaluate(() => {
  const btn = document.querySelector('[data-xui-id="legend_a"] [data-xui-id="Button1"]');
  const pres = document.querySelector('[data-xui-id="legend_a"] [data-xui-id="XuiTextPresenter1"]');
  return {
    texture: btn?.querySelector('image')?.getAttribute('href') ?? null,
    buttonOpacity: btn?.style.opacity ?? null,
    presenterShown: !!pres && pres.style.display !== 'none',
  };
}); }

function metaSample(p, id) { return p.evaluate((id) => {
  const s = window.__dashApi.engine.all().find((s) => s.id === id);
  const hl = document.querySelector('[data-xui-id="metaPanelScene"] [data-xui-id="highlight1"]');
  return {
    tick: s?.tick ?? -1, playing: s?.playing ?? false,
    transform: hl?.style.transform ?? null,
    opacity: hl?.style.opacity ?? null,
    shown: !!hl && hl.style.display !== 'none',
  };
}, id); }

function styles(p, ids) { return p.evaluate((ids) => {
  const out = {};
  for (const id of ids) {
    const el = document.querySelector(`[data-xui-id="${id}"]`);
    if (el) out[id] = { transform: el.style.transform, opacity: el.style.opacity, display: el.style.display };
  }
  return out;
}, ids); }
