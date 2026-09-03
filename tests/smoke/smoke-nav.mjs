// One scripted session, end to end, on the real dashboard.
//
//   boot -> RB x3 to System -> A into Console Settings -> down to Locale
//        -> B back out -> LB x4 back to Marketplace
//
// Every assertion is a number the data or the footage supplies: the range each
// press plays and how many timeline frames it is, the exact cue sequence with
// the frame each cue sits on, the scene stack, where focus is, and that nothing
// on screen came from a string the build does not have.
//
// Deterministic: &manual stops the wall clock, &mute builds no AudioContext, so
// a cue is logged rather than heard and stepFrames() is the only clock.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, compare, rowProfile, colProfile, grad, profileFit } from './pixlab.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'out');
const FRAMES = resolve(HERE, '../../reference/frames/6717');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.SMOKE_URL ?? 'http://localhost:5173';

// RootScene's own named frames, from dashmain.xur. len = to - from, and the
// two the console was measured on are 1To2 = 20 and 5To4 = 22 timeline frames.
const RANGES = {
  BootLive: [462, 533], '2To3': [44, 68], '3To4': [94, 118], '4To5': [144, 168],
  '5Open': [408, 434], '5Close': [435, 461],
  '4To3': [119, 143], '3To2': [69, 93], '2To1': [22, 43], '1To2': [1, 21], '5To4': [169, 191],
};

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

mkdirSync(OUT, { recursive: true });
let browser;
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const p = await browser.newPage();
  const pageErrors = [];
  p.on('pageerror', (e) => pageErrors.push(e.message));
  await p.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await p.goto(`${BASE}/?zoom=1.5&mute&manual`, { waitUntil: 'networkidle0', timeout: 90000 });
  await p.waitForFunction(() => document.body.dataset.ready === 'true' || !!document.querySelector('.banner'), { timeout: 90000 });

  const dash = () => p.evaluate(() => JSON.parse(JSON.stringify(window.__dash)));
  const root = () => p.evaluate(() => {
    const s = window.__dashApi.engine.all().find((s) => s.id.endsWith('RootScene'));
    return s ? { tick: s.tick, playing: s.playing, range: s.range ? s.range.join('..') : null } : null;
  });
  const step = (n) => p.evaluate((n) => window.__dashApi.stepFrames(n), n);
  const press = (b) => p.evaluate((b) => window.__dashApi.press(b), b);
  const focus = () => p.evaluate(() => window.__dash.shell.focusId);
  // The cue log lives on the AudioBank, not on the telemetry snapshot: a cue
  // fired inside stepFrames() has no shell action behind it to re-publish.
  const cues = () => p.evaluate(() => window.__dashApi.audio.log.map((c) => ({ cue: c.cue, tick: c.tick, played: c.played })));
  const focusPath = [];
  const noteFocus = async () => { const f = await focus(); if (focusPath[focusPath.length - 1] !== f) focusPath.push(f); };

  /* -------------------------------------------------------------- 1. boot */

  // With no ?blade= the dashboard BOOTS, and the cold-boot default the
  // dispatcher reaches with no launch argument is BootLive onto tab index 1 =
  // Tab2 = Xbox LIVE, which is also DefaultTab 2.
  let d = await dash();
  check(d.shell?.booted === 'BootLive', `first load must play a boot range, got ${d.shell?.booted}`);
  check(d.shell?.tab === 2, `BootLive lands on Xbox LIVE (tab 2), got ${d.shell?.tab}`);
  let r = await root();
  check(r?.tick === RANGES.BootLive[0], `boot starts on frame ${RANGES.BootLive[0]}, got ${r?.tick}`);
  check(r?.range === 'BootLive..EndBootLive', `boot range is ${r?.range}`);
  check(r?.playing === true, 'the boot range must be running, not parked');
  await step(RANGES.BootLive[1] - RANGES.BootLive[0]);
  r = await root();
  check(r?.tick === RANGES.BootLive[1] && r?.playing === false,
    `BootLive is ${RANGES.BootLive[1] - RANGES.BootLive[0]} frames and stops on ${RANGES.BootLive[1]}, got ${r?.tick}/${r?.playing}`);
  const bootCues = (await cues()).filter((c) => c.tick >= 462 && c.tick <= 533);
  check(bootCues.length === 1 && bootCues[0].cue === 'dash_2ndLevelClose' && bootCues[0].tick === 497,
    `BootLive fires dash_2ndLevelClose on frame 497 out of its own timeline, got ${JSON.stringify(bootCues)}`);
  await noteFocus();

  /* ------------------------------------------------- 2. RB x3 to System */

  const SWITCHES = [
    ['2To3', 'dash_BladeSwitch_2', 3],
    ['3To4', 'dash_BladeSwitch_3', 4],
    ['4To5', 'dash_BladeSwitch_4', 5],
  ];
  for (const [name, cue, tab] of SWITCHES) {
    await press('RB');
    const [from, to] = RANGES[name];
    r = await root();
    check(r?.range === `${name}..${name}End`, `RB should play ${name}, got ${r?.range}`);
    check(r?.tick === from, `${name} opens on frame ${from}, got ${r?.tick}`);
    const log = await cues();
    check(log.at(-1)?.cue === cue, `${name} fires ${cue} (the pair, min(from,to)), got ${log.at(-1)?.cue}`);
    check(log.at(-1)?.tick === from, `${cue} sits on frame ${from}, got ${log.at(-1)?.tick}`);
    await step(to - from);
    r = await root();
    check(r?.tick === to && r?.playing === false,
      `${name} is ${to - from} timeline frames and stops on ${to}, got ${r?.tick}/${r?.playing}`);
    check((await dash()).shell?.tab === tab, `after ${name} the shell should be on tab ${tab}`);
  }
  d = await dash();
  check(d.shell?.focusId === 'navSettings',
    `the System blade's DefaultFocus is navSettings (Console Settings), got ${d.shell?.focusId}`);
  check(d.shell?.metaIndex === 0, `and the metapane is on entry 0, got ${d.shell?.metaIndex}`);
  await noteFocus();

  /* ---------------------------------------- 3. A into Console Settings */

  const cuesBefore = (await cues()).length;
  await press('A');
  await p.evaluate(() => window.__dashApi.shell.idle());
  d = await dash();
  check(String(d.shell?.stack) === String(['dashmain/dashmain.xur#System', 'consoles/dashSysCslSet.xur']),
    `the scene stack should be System then Console Settings, got ${JSON.stringify(d.shell?.stack)}`);
  check(d.shell?.level === 1, `Console Settings is panel level 1, got ${d.shell?.level}`);
  check(d.shell?.tabsLocked === true, 'a second-level page locks the blade switch');
  check(await p.evaluate(() => window.__dashApi.shell.go(4)) === false, 'and the lock refuses a switch');
  r = await root();
  check(r?.range === '5Open..5OpenEnd', `A on the System blade plays 5Open, got ${r?.range}`);
  check(r?.tick === RANGES['5Open'][0], `5Open opens on ${RANGES['5Open'][0]}, got ${r?.tick}`);
  const opened = (await cues()).slice(cuesBefore).map((c) => `${c.cue}@${c.tick}`);
  check(String(opened) === String(['btn_Select@269', 'dash_2ndLevelOpen@408']),
    `A fires btn_Select (btn_1line_icon's own Press frame) then dash_2ndLevelOpen (5Open frame 408); got ${opened.join(',')}`);
  check(d.shell?.focusId === 'lstSettings_item0',
    `Console Settings arrives on row 0; nothing in the data picks another. Got ${d.shell?.focusId}`);
  check(d.shell?.metaText?.includes('display'), `row 0's metapane text is ${JSON.stringify(d.shell?.metaText?.slice(0, 50))}`);
  await noteFocus();
  await step(RANGES['5Open'][1] - RANGES['5Open'][0]);

  /* ------------------------------------------------- 4. down to Locale */

  const LABELS = ['Display', 'Audio', 'Themes', 'Language', 'Clock', 'Locale',
    'Startup', 'Shutdown', 'Screen Saver', 'Remote Control', 'System Info'];
  const rows = await p.evaluate(() =>
    [...document.querySelectorAll('[data-xui-class="XuiListItem"]')].map((el) => el.textContent));
  check(String(rows) === String(LABELS), `the 11 code-table rows are ${JSON.stringify(rows)}`);

  for (let i = 1; i <= 5; i++) {
    await press('Down');
    await p.evaluate(() => window.__dashApi.shell.idle());
    d = await dash();
    check(d.shell?.focusId === `lstSettings_item${i}`, `Down ${i} should focus row ${i}, got ${d.shell?.focusId}`);
    check((await cues()).at(-1)?.cue === 'btn_Focus', `each move fires btn_Focus, got ${(await cues()).at(-1)?.cue}`);
    check(d.shell?.metaIndex === i, `and moves the metapane to ${i}, got ${d.shell?.metaIndex}`);
    await step(21);
  }
  await noteFocus();
  d = await dash();
  check(d.shell?.metaText?.startsWith('\r\n\r\n\r\nSpecify the locale you live in'),
    `Locale's metapane text comes from dashCSettingsStrings.xus[299]; got ${JSON.stringify(d.shell?.metaText?.slice(0, 40))}`);
  check(d.shell?.missingStrings?.length === 0,
    `nothing may be shown that the build does not have: ${JSON.stringify(d.shell?.missingStrings)}`);

  // The f0060 moment: Console Settings, Locale focused.
  await step(60);
  const still = `${OUT}/nav-consolesettings-locale.png`;
  await (await p.$('.xui-stage')).screenshot({ path: still });
  compareToF0060(still);

  /* ------------------------------------------------------------ 5. B out */

  const beforeBack = (await cues()).length;
  await press('B');
  d = await dash();
  r = await root();
  check(r?.range === '5Close..5CloseEnd', `B plays 5Close, got ${r?.range}`);
  check(r?.tick === RANGES['5Close'][0], `5Close opens on ${RANGES['5Close'][0]}, got ${r?.tick}`);
  const backCues = (await cues()).slice(beforeBack).map((c) => `${c.cue}@${c.tick}`);
  check(String(backCues) === String(['btn_Back@2', 'dash_2ndLevelClose@435']),
    `B fires btn_Back (legend_B's Press frame 2) then dash_2ndLevelClose (5Close frame 435); got ${backCues.join(',')}`);
  check(String(d.shell?.stack) === String(['dashmain/dashmain.xur#System']),
    `the pushed scene is destroyed on the way out, stack is ${JSON.stringify(d.shell?.stack)}`);
  check(d.shell?.level === 0 && d.shell?.tabsLocked === false, 'back at the blade, unlocked');
  check(d.shell?.focusId === 'navSettings', `focus is restored to navSettings, got ${d.shell?.focusId}`);
  const gone = await p.evaluate(() => document.querySelectorAll('[data-xui-scene="consoles/dashSysCslSet.xur"]').length);
  check(gone === 0, `the popped scene must leave no DOM behind, found ${gone}`);
  await noteFocus();
  await step(RANGES['5Close'][1] - RANGES['5Close'][0]);

  /* -------------------------------------------- 6. LB x4 to Marketplace */

  const BACK = [['5To4', 'dash_BladeSwitch_4', 4], ['4To3', 'dash_BladeSwitch_3', 3],
    ['3To2', 'dash_BladeSwitch_2', 2], ['2To1', 'dash_BladeSwitch_1', 1]];
  for (const [name, cue, tab] of BACK) {
    await press('LB');
    const [from, to] = RANGES[name];
    r = await root();
    check(r?.range === `${name}..${name}End`, `LB should play ${name}, got ${r?.range}`);
    check(r?.tick === from, `${name} opens on ${from}, got ${r?.tick}`);
    check((await cues()).at(-1)?.cue === cue, `${name} fires ${cue}`);
    await step(to - from);
    r = await root();
    check(r?.tick === to && r?.playing === false, `${name} is ${to - from} frames, ends on ${to}, got ${r?.tick}`);
    check((await dash()).shell?.tab === tab, `after ${name} the shell is on tab ${tab}`);
  }
  await noteFocus();
  d = await dash();
  check(d.shell?.tab === 1, `LB x4 ends on Marketplace, got tab ${d.shell?.tab}`);
  check(await p.evaluate(() => window.__dashApi.shell.left()) === false,
    'Marketplace is leftmost: there is no 1To0 range and no wrap');

  /* ------------------------------------------------------------ the ledger */

  check(String(focusPath) === String([null, 'navSettings', 'lstSettings_item0', 'lstSettings_item5', 'navSettings', 'scnBanner']),
    `focus path is ${JSON.stringify(focusPath)}`);
  check(d.errors.length === 0, `__dash.errors: ${d.errors.join(' | ')}`);
  check(pageErrors.length === 0, `page errors: ${pageErrors.join(' | ')}`);
  check(d.shell?.unresolvedPresses?.length === 0,
    `every PressPath taken must resolve: ${JSON.stringify(d.shell?.unresolvedPresses)}`);
  console.log(`  focus path: ${focusPath.join(' -> ')}`);
  const all = await cues();
  check(all.every((c) => c.played === false), '&mute must log every cue without playing it');
  console.log(`  cues: ${all.map((c) => `${c.cue}@${c.tick}`).join(' ')}`);
  console.log(`  still: ${still}`);
  await p.close();
} catch (err) {
  fails.push(`threw: ${err instanceof Error ? err.stack : String(err)}`);
} finally {
  if (browser) await browser.close();
}

if (fails.length) { for (const f of fails) console.error('  FAIL ' + f); console.log('SMOKE_FAIL'); process.exit(1); }
console.log('SMOKE_PASS');

/**
 * The f0060 still: Console Settings with Locale focused. Three landmarks, each
 * fitted by 1-D NCC of gradient-magnitude profiles so the number is a shift in
 * screen pixels rather than an impression - the page title, the eleven list
 * rows, and the legend discs along the footer.
 */
function compareToF0060(shot) {
  const ref = readPng(`${FRAMES}/f0060.png`);
  const ours = readPng(shot);
  const WINDOWS = [
    ['title', { x: 220, y: 120, w: 700, h: 60 }],
    ['list rows', { x: 230, y: 200, w: 640, h: 620 }],
    ['legend discs', { x: 200, y: 880, w: 1300, h: 90 }],
  ];
  for (const [what, w] of WINDOWS) {
    const fx = profileFit(grad(rowProfile(ref, w.x, w.x + w.w, w.y, w.y + w.h)),
      grad(rowProfile(ours, w.x, w.x + w.w, w.y, w.y + w.h)), 24);
    const fy = profileFit(grad(colProfile(ref, w.x, w.x + w.w, w.y, w.y + w.h)),
      grad(colProfile(ours, w.x, w.x + w.w, w.y, w.y + w.h)), 24);
    const c = compare(ref, ours, w);
    console.log(`  f0060 ${what.padEnd(13)} dx ${String(fx.shift).padStart(3)} (ncc ${fx.ncc.toFixed(2)})  `
      + `dy ${String(fy.shift).padStart(3)} (ncc ${fy.ncc.toFixed(2)})  ncc ${c.ncc.toFixed(3)} mad ${c.mad.toFixed(1)}`);
  }
}
