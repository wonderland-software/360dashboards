// Input, cues, locale and list population, driven in a real browser.
//
// Deterministic on purpose: &manual stops the wall clock and &mute builds no
// AudioContext (a headless Chrome has no output device), so a cue is logged
// rather than heard and the log is what we assert on.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'out');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.SMOKE_URL ?? 'http://localhost:5173';
const SCENE = 'consoles/dashSysCslSet.xur';

// MEASURED: row k top = list y (154) + 45k, LIST_ITEM_TOP being 0. The reference
// frame's separators land on the same line to within about one design pixel.
const ROW_PITCH = 45;
const ROW_TOP = 0;

const XY_HELPER = `window.__xy = ${xyOf.toString()}`;

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

mkdirSync(OUT, { recursive: true });
let browser;
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });

  /* ------------------------------------------------------- list population */

  const page = await open(browser, `${BASE}/?scene=${SCENE}&manual&mute`);
  check(page.errors.length === 0, `page errors: ${page.errors.join(' | ')}`);
  const d0 = await dash(page.p);
  check(d0.errors.length === 0, `__dash.errors: ${d0.errors.join(' | ')}`);

  const rows = await page.p.evaluate(() =>
    [...document.querySelectorAll('[data-xui-class="XuiListItem"]')].map((el) => ({
      id: el.dataset.xuiId, xy: window.__xy(el), text: el.textContent,
      shown: el.style.display !== 'none',
    })));
  // Eleven rows, in the order of the 11-entry code table at VA 0x920143d0 -
  // NOT the scene's own 9-entry PanelSettings, which names no control that
  // exists in the file. All eleven exist; only nine are inside the window the
  // list frame can hold (435 / 45), and the two outside it are not drawn.
  check(rows.length === 11, `expected 11 Console Settings rows, got ${rows.length}`);
  check(rows.filter((r) => r.shown).length === 9,
    `the window holds 9 of them, got ${rows.filter((r) => r.shown).length}`);
  const LABELS = ['Display', 'Audio', 'Themes', 'Language', 'Clock', 'Locale',
    'Startup', 'Shutdown', 'Screen Saver', 'Remote Control', 'System Info'];
  // Focus is on row 5 (the f0060 moment), so the window has not scrolled and
  // row k sits in slot k for the nine that are drawn.
  rows.forEach((r, k) => {
    check(r.text === LABELS[k], `row ${k} is "${r.text}", expected "${LABELS[k]}"`);
    if (!r.shown) return;
    const want = `0,${ROW_TOP + ROW_PITCH * k}`;
    check(r.xy === want, `row ${k} at ${r.xy}, expected ${want}`);
  });

  const ends = await page.p.evaluate(() =>
    [...document.querySelectorAll('[data-xui-class="XuiScrollEnd"]')].map((el) => ({
      id: el.dataset.xuiId, xy: window.__xy(el),
      range: el.querySelector('[data-xui-range]')?.dataset.xuiRange ?? null,
    })));
  check(ends.length === 2, `expected both ScrollEnds from the XuiList template, got ${ends.length}`);
  const down = ends.find((e) => e.id === 'control_ScrollDown');
  const up = ends.find((e) => e.id === 'control_ScrollUp');
  // A chevron is a STATE, not a visibility flag. scr_ScrollEndDown's children
  // carry Show=false across its Normal range (frames 0..1) and Show=true from
  // frame 2, which is the start of ScrollMore (2..3) - so the console drew an
  // arrow by putting the scroll end into ScrollMore, and drew none by leaving it
  // in Normal [SCENE dashuisk/skin.xur]. Eleven rows in a 435-tall list show
  // nine, so at the top there is more below and nothing above.
  check(down?.range === 'ScrollMore..EndScrollMore', `the down arrow must be in ScrollMore while rows sit below, got ${down?.range}`);
  check(up?.range === null || up?.range === 'Normal..EndNormal', `the up arrow must be off at the top, got ${up?.range}`);
  check(down?.xy === '386,409', `down arrow at ${down?.xy} (Anchor 12 from a 420x74 template into a 423x435 list)`);

  /* --------------------------------------------------------- focus and cues */

  check(d0.focusId === 'lstSettings_item5', `initial focus is ${d0.focusId} (Locale, as in f0060)`);
  const initFocus = await scope(page.p, 'lstSettings_item5');
  check(initFocus?.range === 'InitFocus..EndInitFocus', `initial focus should play InitFocus, got ${initFocus?.range}`);
  await page.p.evaluate(() => window.__dashApi.stepFrames(40));
  const settled = await scope(page.p, 'lstSettings_item5');
  check(settled?.tick === 310 && settled?.playing === false, `InitFocus must settle on frame 310, got ${settled?.tick}/${settled?.playing}`);

  await page.p.evaluate(() => window.__dashApi.press('Down'));
  const d1 = await dash(page.p);
  check(d1.focusId === 'lstSettings_item6', `dpad Down should focus Startup, got ${d1.focusId}`);
  check(d1.lastCue === 'btn_Focus', `moving focus fires btn_Focus, got ${d1.lastCue}`);
  check(d1.input.at(-1)?.button === 'Down' && d1.input.at(-1)?.layer === 'scene',
    `the scene layer must own the press, got ${JSON.stringify(d1.input.at(-1))}`);

  await page.p.evaluate(() => window.__dashApi.press('Up'));
  await page.p.evaluate(() => window.__dashApi.press('A'));
  await page.p.evaluate(() => window.__dashApi.press('B'));
  const d2 = await dash(page.p);
  check(d2.focusId === 'lstSettings_item5', `Up should return to Locale, got ${d2.focusId}`);
  const cues = d2.cues.map((c) => c.cue);
  check(String(cues.slice(-4)) === String(['btn_Focus', 'btn_Focus', 'btn_Select', 'btn_Back']),
    `cue order should be Focus, Focus, Select, Back; got ${cues.slice(-4).join(',')}`);
  check(d2.cues.every((c) => c.played === false), '?mute must log cues without playing them');
  check(d2.cues.at(-1)?.tick >= 0, 'every cue records the timeline frame it fired on');
  check(d2.input.map((e) => e.button).slice(-4).join(',') === 'Down,Up,A,B', `input log is ${d2.input.map((e) => e.button).join(',')}`);

  // Wrap: XuiCommonList.Wrap is unset on lstSettings, so the ends must clamp.
  for (let i = 0; i < 12; i++) await page.p.evaluate(() => window.__dashApi.press('Down'));
  const d3 = await dash(page.p);
  check(d3.focusId === 'lstSettings_item10', `without Wrap the last row must clamp, got ${d3.focusId}`);

  /* --------------------------------- focus states are edge-triggered ------- */

  // A state range is motion, not a property: re-issuing Focus restarts it at
  // its opening frame. Held against a clamped end, the 100ms d-pad auto-repeat
  // used to re-enter XuiButton's Focus range ten times a second, so its
  // playhead never got past the first third of the 15..253 loop.
  // entries counts every range START on the scope (its Normal at build time and
  // its Focus when focus arrived), and a GoToAndPlay loop does not add to it -
  // so an accidental re-entry is the only thing that can move this number.
  const before = await scope(page.p, 'lstSettings_item10');
  check(before?.state === 'Focus', `the last row should be in Focus, got ${before?.state}`);
  await page.p.evaluate(() => window.__dashApi.stepFrames(78));
  const mid = await scope(page.p, 'lstSettings_item10');
  for (let i = 0; i < 8; i++) await page.p.evaluate(() => window.__dashApi.press('Down'));
  await page.p.evaluate(() => window.__dashApi.stepFrames(40));
  const after = await scope(page.p, 'lstSettings_item10');
  check(after?.entries === before?.entries,
    `8 clamped Down presses must not re-enter the Focus range; entries went ${before?.entries} -> ${after?.entries}`);
  check(after.tick > mid.tick,
    `the playhead must keep advancing through the clamped presses (${mid?.tick} -> ${after?.tick})`);
  check(after.state === 'Focus' && after.range?.startsWith('Focus'),
    `the last row should still be in its Focus range, got ${after?.state}/${after?.range}`);
  // and the clamp is silent: no cue for a move that did not happen
  const dClamp = await dash(page.p);
  const focusCues = dClamp.cues.filter((c) => c.cue === 'btn_Focus').length;
  await page.p.evaluate(() => window.__dashApi.press('Down'));
  const dClamp2 = await dash(page.p);
  check(dClamp2.cues.filter((c) => c.cue === 'btn_Focus').length === focusCues,
    'a clamped press must not fire btn_Focus');

  // A real move still does play the range: leave row 9 and come back.
  await page.p.evaluate(() => window.__dashApi.press('Up'));
  await page.p.evaluate(() => window.__dashApi.press('Down'));
  const back = await scope(page.p, 'lstSettings_item10');
  // +2: KillFocus on the way out, Focus on the way back. Both are real edges.
  check(back?.entries === (after?.entries ?? 0) + 2,
    `leaving and re-entering the last row is two state changes, ${after?.entries} -> ${back?.entries}`);
  check(back?.state === 'Focus', `and it ends in Focus, got ${back?.state}`);

  /* ------------------------------- visible text is not "invisible" --------- */

  // renderText builds div > div, so a paint walk that only counts non-DIV
  // children calls every text-only control invisible. The paint boxes carry
  // data-xui-paint so they are counted.
  check(d3.invisibleAtRest === false, 'a scene with visible text must not be invisibleAtRest');
  for (const id of ['labHeader', 'labMetaHeader', 'legend_a', 'legend_b']) {
    check(!d3.invisibleGroups.includes(id), `${id} paints text and must not be in invisibleGroups`);
  }
  const painted = await page.p.evaluate(() =>
    document.querySelectorAll('[data-xui-paint="text"]').length);
  check(painted > 10, `expected the text paint boxes to be tagged, found ${painted}`);

  await page.p.evaluate(() => window.__dashApi.stepFrames(40));
  await (await page.p.$('.xui-canvas')).screenshot({ path: `${OUT}/list.png` });
  await page.close();

  /* ---------------------------------------------------------------- locale */

  const en = await open(browser, `${BASE}/?scene=${SCENE}&manual&mute`);
  const enTitle = await title(en.p);
  check(enTitle === 'Console Settings', `en title is "${enTitle}"`);
  const enDash = await dash(en.p);
  check(enDash.locale === 'en' && enDash.localePatches === 0, 'en ships inside the .xur, so nothing is patched');
  await en.close();

  const de = await open(browser, `${BASE}/?scene=${SCENE}&manual&mute&locale=de-de`);
  check(de.errors.length === 0, `de-de page errors: ${de.errors.join(' | ')}`);
  const deTitle = await title(de.p);
  check(deTitle === 'Konsoleneinstellungen', `de-de title is "${deTitle}", expected Konsoleneinstellungen`);
  const deDash = await dash(de.p);
  check(deDash.localePatches === 5, `de-de/dashSysCslSet.xus has 5 keyed entries, patched ${deDash.localePatches}`);
  const deLegend = await de.p.evaluate(() => document.querySelector('[data-xui-id="legend_b"]')?.textContent ?? '');
  check(deLegend.includes('Zurück'), `the Back legend should read Zurück, got "${deLegend}"`);
  await (await de.p.$('.xui-canvas')).screenshot({ path: `${OUT}/list-de.png` });
  await de.close();

  console.log(`  ${OUT}/list.png and ${OUT}/list-de.png written`);
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
  await p.setViewport({ width: 1120, height: 770, deviceScaleFactor: 1 });
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await p.waitForFunction(() => document.body.dataset.ready === 'true' || !!document.querySelector('.banner'), { timeout: 60000 });
  return { p, errors, close: () => p.close() };
}
function dash(p) { return p.evaluate(() => JSON.parse(JSON.stringify(window.__dash))); }
function title(p) { return p.evaluate(() => document.querySelector('[data-xui-id="labHeader"]')?.textContent ?? ''); }
function scope(p, tail) {
  return p.evaluate((tail) => {
    const s = window.__dashApi.engine.all().find((s) => s.id.includes(tail));
    return s ? {
      id: s.id, tick: s.tick, playing: s.playing, state: s.state, entries: s.entries,
      range: s.range ? s.range.join('..') : null,
    } : null;
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
