// The Blades shell: composition, switching, panel levels, and five stills.
//
// Deterministic (&manual stops the wall clock, &mute builds no AudioContext).
// The five stills are the rest state of each blade, rendered through the
// console's own view transform at the reference frames' 1920x1080 so they
// overlay reference/frames/6717/* directly.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'out');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.SMOKE_URL ?? 'http://localhost:5173';

// tab -> { name, rest frame on RootScene, blade_N palette, reference still }
const BLADES = [
  { tab: 1, name: 'Marketplace', rest: 43, colour: 5, ref: 'f0034' },
  { tab: 2, name: 'Xbox LIVE', rest: 21, colour: 1, ref: 'f0026' },
  { tab: 3, name: 'Games', rest: 68, colour: 2, ref: 'f0042' },
  { tab: 4, name: 'Media', rest: 118, colour: 3, ref: 'f0047' },
  { tab: 5, name: 'System', rest: 168, colour: 4, ref: 'f0051' },
];

const PANELS = {
  1: 'blademp/marketplaceSignedOut.xur',
  2: 'live/liveSignedOutUI.xur',
  3: 'gamesbla/gamesSignedOut.xur',
  4: 'mediabla/mediaSignedOut.xur',
};

const XY_HELPER = `window.__xy = ${xyOf.toString()}`;

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

mkdirSync(OUT, { recursive: true });
let browser;
const edges = [];
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });

  /* ------------------------------------------------- the five rest states */

  for (const blade of BLADES) {
    const page = await open(browser, `${BASE}/?console&zoom=1.5&mute&manual&blade=${blade.tab}`);
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

    edges.push({ blade, left: await pageLeft(page.p) });
    await (await page.p.$('.xui-stage')).screenshot({ path: `${OUT}/blade${blade.tab}-${blade.name.replace(/\W+/g, '')}.png` });
    await page.close();
  }

  // Page left must advance blade by blade - the stack really is a staircase.
  for (let i = 1; i < edges.length; i++) {
    check(edges[i].left > edges[i - 1].left,
      `${edges[i].blade.name}'s page starts at ${edges[i].left}, not right of ${edges[i - 1].blade.name}'s ${edges[i - 1].left}`);
  }
  console.log(`  page left edge, 1080p: ${edges.map((e) => `${e.blade.name} ${e.left}`).join(' / ')}`);

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
    const s = window.__dashApi.engine.all().find((s) => s.id.endsWith(tail));
    return s ? { tick: s.tick, playing: s.playing, range: s.range ? s.range.join('..') : null } : null;
  }, tail);
}
/** The strongest rising luma edge across the top of the frame: the blade page. */
function pageLeft(p) {
  return p.evaluate(async () => {
    const stage = document.querySelector('.xui-stage');
    const r = stage.getBoundingClientRect();
    void r;
    // measure from the rendered DOM instead of pixels: the page plate is
    // content_panel_blink, whose box is what the landmark table describes
    const el = document.querySelector('[data-xui-id="content_panel_blink"]');
    return el ? Math.round(el.getBoundingClientRect().left) : -1;
  });
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
