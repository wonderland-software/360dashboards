// One scripted session, end to end, on the real dashboard.
//
//   boot -> RB x3 to System -> A into Console Settings -> down to Locale
//        -> on to System Info (the list scrolls) -> B back out
//        -> LB x4 back to Marketplace
//   then a SECOND path on a fresh page: System -> Console Settings -> Display
//        -> B -> Audio -> Digital Output -> B -> B, reading the rows at each
//        level, and the same walk once more under &locale=de-de.
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

  /* ------------------------------- 4b. on to System Info: the list scrolls */

  // f0060 and f0066 are the same page nine rows apart. The list frame is 423x435
  // at a 45 px pitch, so it holds floor(435/45) = 9 rows; past row 8 the console
  // scrolls by one and pins the selection to the bottom visible slot, and at
  // System Info (row 10 of 11) the window has moved by two [FRAME hi f0060,
  // f0066]. metaScene_1line authors only 1To2..8To9, which is the same nine, so
  // the metapane index has to be the VISIBLE slot and not the table row.
  for (let i = 6; i <= 10; i++) {
    await press('Down');
    await p.evaluate(() => window.__dashApi.shell.idle());
    d = await dash();
    check(d.shell?.focusId === `lstSettings_item${i}`, `Down should reach row ${i}, got ${d.shell?.focusId}`);
    check(d.shell?.metaIndex === Math.min(i, 8),
      `row ${i} sits in visible slot ${Math.min(i, 8)}, got ${d.shell?.metaIndex}`);
    await step(21);
  }
  const window9 = await p.evaluate(() =>
    [...document.querySelectorAll('[data-xui-class="XuiListItem"]')]
      .filter((el) => el.style.display !== 'none').map((el) => el.textContent));
  check(String(window9) === String(['Themes', 'Language', 'Clock', 'Locale', 'Startup',
    'Shutdown', 'Screen Saver', 'Remote Control', 'System Info']),
    `at System Info the nine-row window starts at Themes (scrolled by two); got ${JSON.stringify(window9)}`);
  d = await dash();
  check(d.shell?.metaText?.startsWith('\r\n\r\n\r\nView your console'),
    `row 10's metapane text is still the TABLE row's, xus[305]; got ${JSON.stringify(d.shell?.metaText?.slice(0, 30))}`);
  check(d.errors.length === 0, `scrolling past row 8 must not ask for a range that is not authored: ${d.errors.join(' | ')}`);
  await noteFocus();

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
  // The popped scene is NOT destroyed on the press. Its own TransBackFrom
  // ("FadeOut" in dashuisk/skin.xur, Opacity 1 -> 0 and Show true -> false over
  // frames 0..5) runs first and the teardown waits for it, which is the order
  // the console used. Measured on the footage: the page is still at full
  // contrast one presented frame after the press lands (f02159, list-frame ink
  // sd 21.69, minimum 14.6, unchanged from f02153) and entirely gone on the next
  // (f02161, sd 5.22, minimum 118.7) - a disappearance bounded at two 60 Hz
  // frames, inside FadeOut's five [FRAME 6717-60fps].
  const during = await p.evaluate(() => document.querySelectorAll('[data-xui-scene="consoles/dashSysCslSet.xur"]').length);
  check(during === 1, `the popped scene must still be in the document while its TransBackFrom runs, found ${during}`);
  await step(5);
  const gone = await p.evaluate(() => document.querySelectorAll('[data-xui-scene="consoles/dashSysCslSet.xur"]').length);
  check(gone === 0, `and must be destroyed when FadeOut ends 5 frames later, found ${gone}`);
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

  // The first entry is Xbox LIVE's arrival focus. live/liveSignedOutUI.xur has
  // no DefaultFocus and no PanelSettings, so it falls back to the head of its
  // own authored chain - fakeGamerCard, the only focusable control with no
  // NavUp - which is the control wearing the silver focus gradient in f0078, an
  // arrival frame (f0077 is Games, f0079 Marketplace: one sideways sweep, no
  // vertical input). The last is Marketplace's, and that one IS authored:
  // blademp/marketplaceSignedOut.xur declares DefaultFocus="scnBanner".
  check(String(focusPath) === String(['fakeGamerCard', 'navSettings', 'lstSettings_item0',
    'lstSettings_item5', 'lstSettings_item10', 'navSettings', 'scnBanner']),
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

  /* ------------------------- 7. a second path: Display, then Audio, en and de */

  for (const locale of ['en', 'de-de']) {
    const q = locale === 'en' ? '' : `&locale=${locale}`;
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push(e.message));
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.goto(`${BASE}/?blade=5&zoom=1.5&mute&manual${q}`, { waitUntil: 'networkidle0', timeout: 90000 });
    await page.waitForFunction(() => document.body.dataset.ready === 'true', { timeout: 90000 });

    const A = async () => {
      await page.evaluate(() => window.__dashApi.shell.press());
      await page.evaluate(() => window.__dashApi.shell.idle());
      await page.evaluate(() => window.__dashApi.stepFrames(60));
    };
    const B = async () => {
      await page.evaluate(() => window.__dashApi.shell.back());
      await page.evaluate(() => window.__dashApi.stepFrames(60));
    };
    const Down = async () => {
      await page.evaluate(() => window.__dashApi.shell.move('Down'));
      await page.evaluate(() => window.__dashApi.shell.idle());
      await page.evaluate(() => window.__dashApi.stepFrames(21));
    };
    // Scoped to the TOP scene: a pushed page sits inside the same document as
    // the one it covers, so an unscoped query reads Console Settings' own rows
    // as well as the page's.
    const rowsOf = () => page.evaluate(() => {
      const id = window.__dash.shell.stack.at(-1);
      const scenes = [...document.querySelectorAll(`[data-xui-scene="${id}"]`)];
      const host = scenes[scenes.length - 1] ?? document;
      return [...host.querySelectorAll('[data-xui-class="XuiListItem"]')]
        .filter((el) => el.style.display !== 'none').map((el) => el.textContent);
    });
    const shell = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__dash.shell)));
    const at = () => page.evaluate(() => window.__dash.shell.stack.at(-1));
    const tag = `[${locale}] `;

    // ---- Display. dashSysCslSetDisplay.xur's lstSettings carries ItemsText="",
    // and the console filled it from a 4 x 16-byte table in .data at 0x927bfff0
    // - (u32 label, u32 wide scene, u32 present, u32 enabled) - rewritten on
    // every visit by 0x921c6650 because two of the four rows are gated on
    // hardware. On an NTSC console with an HD AV pack, which is the state
    // f01580 shows ("1080p / Widescreen / Standard"), PAL Settings is absent and
    // three rows remain [CODE].
    await A();
    check(await at() === 'consoles/dashSysCslSet.xur', `${tag}A on navSettings opens Console Settings, got ${await at()}`);
    await A();
    check(await at() === 'consoles/dashSysCslSetDisplay.xur', `${tag}row 0 opens the Display page, got ${await at()}`);
    const display = await rowsOf();
    const DISPLAY_EN = ['HDTV Settings', 'Screen Format', 'Reference Levels'];
    if (locale === 'en') {
      check(String(display) === String(DISPLAY_EN),
        `${tag}Display's three code-table rows are ${JSON.stringify(display)}`);
    } else {
      check(display.length === 3 && String(display) !== String(DISPLAY_EN),
        `${tag}the same three rows must arrive translated, got ${JSON.stringify(display)}`);
    }
    let sh = await shell();
    check(sh.codeFilled.some((c) => c.startsWith('lstSettings x3 from 0x927bfff0')),
      `${tag}the Display list must say which table filled it: ${JSON.stringify(sh.codeFilled)}`);
    check(sh.missingStrings.length === 0, `${tag}Display: ${JSON.stringify(sh.missingStrings)}`);
    await B();
    check(await at() === 'consoles/dashSysCslSet.xur', `${tag}B returns to Console Settings, got ${await at()}`);

    // ---- Audio. This page is NOT a code list: it authors two XuiNavButtons
    // with PressPaths, and its child dashSysCslSetAudioDigital.xur authors its
    // three options in ItemsText. So the assertion is that we read the DATA and
    // add nothing to it.
    await Down();
    check((await shell()).focusId === 'lstSettings_item1', `${tag}Down reaches Audio`);
    await A();
    check(await at() === 'consoles/dashSysCslSetAudio.xur', `${tag}row 1 opens the Audio page, got ${await at()}`);
    sh = await shell();
    check(sh.focusId === 'btnDigital',
      `${tag}Audio has no DefaultFocus and no list; PanelSettings[0] is btnDigital, got ${sh.focusId}`);
    check(await rowsOf().then((x) => x.length) === 0, `${tag}the Audio page has no list at all`);
    await A();
    check(await at() === 'consoles/dashSysCslSetAudioDigital.xur', `${tag}btnDigital's PressPath opens Digital Output, got ${await at()}`);
    const digital = await rowsOf();
    const DIGITAL_EN = ['Digital Stereo', 'Dolby Digital 5.1', 'Dolby Digital with WMA Pro'];
    if (locale === 'en') {
      check(String(digital) === String(DIGITAL_EN),
        `${tag}Digital Output's rows are its own ItemsText: ${JSON.stringify(digital)}`);
    } else {
      check(digital.length === 3, `${tag}Digital Output still has three rows, got ${JSON.stringify(digital)}`);
    }
    await B(); await B();
    check(await at() === 'consoles/dashSysCslSet.xur', `${tag}two Bs land back on Console Settings, got ${await at()}`);

    sh = await shell();
    check(sh.locale === locale, `${tag}the shell reports locale ${sh.locale}`);
    if (locale === 'en') {
      check(sh.localePatches === 0, `${tag}en is the literal in the .xur, so nothing is patched; got ${sh.localePatches}`);
    } else {
      // Every scene the shell composes is patched, not just dashmain: the
      // panels, the offline banners, the tray strip and every pushed page.
      check(sh.localePatches > 40, `${tag}a real locale must reach every composed scene; only ${sh.localePatches} patches`);
    }
    check(sh.containersMissing.length === 0, `${tag}containers: ${JSON.stringify(sh.containersMissing)}`);
    check(sh.missingStrings.length === 0, `${tag}missing strings: ${JSON.stringify(sh.missingStrings)}`);
    const errs2 = await page.evaluate(() => window.__dash.errors);
    check(errs2.length === 0, `${tag}__dash.errors: ${errs2.join(' | ')}`);
    check(errs.length === 0, `${tag}page errors: ${errs.join(' | ')}`);
    console.log(`  ${tag}display rows: ${JSON.stringify(display)}`);
    console.log(`  ${tag}digital rows: ${JSON.stringify(digital)}  localePatches ${sh.localePatches}`);
    await page.close();
  }
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
