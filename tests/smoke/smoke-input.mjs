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

// MEASURED: row k top = list y (154) + LIST_ITEM_TOP (3) + 45k. The reference
// frame's separators land on the same line to within about one design pixel.
const ROW_PITCH = 45;
const ROW_TOP = 3;

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
      id: el.dataset.xuiId, transform: el.style.transform, text: el.textContent,
    })));
  check(rows.length === 10, `expected 10 Console Settings rows, got ${rows.length}`);
  const LABELS = ['Display', 'Audio', 'Themes', 'Language', 'Clock', 'Locale', 'Startup', 'Shutdown', 'Screen Saver', 'System Info'];
  rows.forEach((r, k) => {
    check(r.text === LABELS[k], `row ${k} is "${r.text}", expected "${LABELS[k]}"`);
    const want = `translate(0px, ${ROW_TOP + ROW_PITCH * k}px)`;
    check(r.transform === want, `row ${k} at ${r.transform}, expected ${want}`);
  });

  const ends = await page.p.evaluate(() =>
    [...document.querySelectorAll('[data-xui-class="XuiScrollEnd"]')].map((el) => ({
      id: el.dataset.xuiId, transform: el.style.transform, visibility: el.style.visibility,
    })));
  check(ends.length === 2, `expected both ScrollEnds from the XuiList template, got ${ends.length}`);
  const down = ends.find((e) => e.id === 'control_ScrollDown');
  const up = ends.find((e) => e.id === 'control_ScrollUp');
  // 10 rows in a 435-tall list shows 9, so there is more below and nothing above.
  check(down?.visibility === 'visible', 'the down arrow must show while rows sit below the fold');
  check(up?.visibility === 'hidden', 'the up arrow must be hidden at the top of the list');
  check(down?.transform === 'translate(386px, 409px)', `down arrow at ${down?.transform} (Anchor 12 from a 420x74 template into a 423x435 list)`);

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
  check(d3.focusId === 'lstSettings_item9', `without Wrap the last row must clamp, got ${d3.focusId}`);

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
    return s ? { id: s.id, tick: s.tick, playing: s.playing, range: s.range ? s.range.join('..') : null } : null;
  }, tail);
}
