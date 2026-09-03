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

  /* -------------------- 8. M3e: the option pages, and every page reached */

  // The console's settings pages are driven by console state (settingsModel.ts):
  // each option page ARRIVES on the row of its current value, A writes the
  // value and pops the page (XuiSceneNavigateBack, 0x921b5428), and the parent's
  // "Current Setting" follows. The reference console's values are read off the
  // 6717 stills f0053-f0066, so every Console Settings row is gated against its
  // own frame here, and every page the shell reaches is gated on painted DOM.
  await m3e(browser);
} catch (err) {
  fails.push(`threw: ${err instanceof Error ? err.stack : String(err)}`);
} finally {
  if (browser) await browser.close();
}

async function m3e(browser) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/?blade=5&zoom=1.5&mute&manual`, { waitUntil: 'networkidle0', timeout: 90000 });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', { timeout: 90000 });
  const tag = '[m3e] ';
  const ev = (f, ...a) => page.evaluate(f, ...a);
  const shell = () => ev(() => JSON.parse(JSON.stringify(window.__dash.shell)));
  const at = () => ev(() => window.__dash.shell.stack.at(-1));
  const cues = () => ev(() => window.__dashApi.audio.log.map((c) => `${c.cue}@${c.tick}`));
  const A = async () => { await ev(() => window.__dashApi.shell.press()); await ev(() => window.__dashApi.shell.idle()); await ev(() => window.__dashApi.stepFrames(60)); };
  const B = async () => { await ev(() => window.__dashApi.shell.back()); await ev(() => window.__dashApi.stepFrames(60)); await ev(() => window.__dashApi.shell.idle()); };
  const Down = async (n = 1) => { for (let i = 0; i < n; i++) { await ev(() => window.__dashApi.shell.move('Down')); await ev(() => window.__dashApi.stepFrames(21)); } await ev(() => window.__dashApi.shell.idle()); };
  const Up = async (n = 1) => { for (let i = 0; i < n; i++) { await ev(() => window.__dashApi.shell.move('Up')); await ev(() => window.__dashApi.stepFrames(21)); } await ev(() => window.__dashApi.shell.idle()); };
  const Right = async () => { await ev(() => window.__dashApi.shell.navRight()); await ev(() => window.__dashApi.shell.idle()); await ev(() => window.__dashApi.stepFrames(21)); };
  const home = async () => { for (let i = 0; i < 6; i++) { if ((await shell()).level === 0) break; await B(); } await ev(() => window.__dashApi.shell.seekRest(5)); await ev(() => window.__dashApi.stepFrames(5)); await Up(8); };
  // What the TOP scene paints: its lists' rows (with their resolved state), a
  // control's text, and every angle-bracket token visible anywhere on screen.
  const dom = () => ev(() => {
    const vis = (el) => { try { return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }); } catch { return true; } };
    const id = window.__dash.shell.stack.at(-1);
    const scenes = [...document.querySelectorAll(`[data-xui-scene="${id}"]`)];
    const host = scenes[scenes.length - 1] ?? document;
    const text = (cid) => { const e = host.querySelector(`[data-xui-id="${cid}"]`); return e && vis(e) ? (e.textContent ?? '').replace(/\s+/g, ' ').trim() : null; };
    const items = [...host.querySelectorAll('[data-xui-class="XuiListItem"]')].filter(vis).map((e) => ({ t: e.textContent.trim(), st: e.querySelector('[data-xui-state]')?.dataset.xuiState ?? '' }));
    const tokens = [...document.querySelectorAll('[data-xui-paint="text"]')].filter(vis).map((e) => e.textContent.trim()).filter((t) => /^<[^<>]{1,40}>$/.test(t));
    const shown = (cid) => { const e = host.querySelector(`[data-xui-id="${cid}"]`); return e ? vis(e) : null; };
    return { items, tokens, labS: text('labCurrentSettings'), lab: text('labCurrentSetting'), meta: text('metaPanelScene'), pane: host.querySelector('[data-xui-id="scnCurrentFormat"]')?.children.length ?? 0, shown: { no: shown('NoComputersScene'), wait: shown('WmcConnectingScene'), info: shown('MediaSourceInfoScene'), empty: shown('txt_EmptyList'), iptv: shown('btnIPTV'), noCamera: shown('NoCameraTextField') } };
  });
  const noTokens = async (where) => { const d = await dom(); check(d.tokens.length === 0, `${tag}${where} paints an authoring token: ${JSON.stringify(d.tokens)}`); return d; };

  // ---- 8a. Console Settings: every row's Current Setting, against its still.
  // Value block window on the 1080p frames (design 579..999 x 186..316 through
  // the console view): the two to three lines under "Current Setting".
  await A();
  check(await at() === 'consoles/dashSysCslSet.xur', `${tag}A opens Console Settings`);
  const EXPECT = [
    [0, 'f0053', ['1080p', 'Widescreen', 'Standard']],
    [1, 'f0055', ['Dolby Digital', 'Sound Effects Enabled']],
    [2, 'f0056', ['Xbox 360 (Default)']],
    [3, 'f0057', ['English']],
    [4, null, [null, 'GMT+00 London']],           // the first line is the console clock = the host clock
    [5, 'f0060', ['United Kingdom']],
    [6, 'f0061', ['Xbox Dashboard']],
    [7, 'f0062', ['Auto-Off Disabled', 'Background Downloads Enabled']],
    [8, 'f0063', ['Screen Saver Enabled']],
    [9, 'f0064', ['All Channels']],
    [10, null, ['Dashboard: 2.0.6770.0']],
  ];
  const W = { x: 1020, y: 222, w: 480, h: 130 };
  const stage = await page.$('.xui-stage');
  console.log('  [m3e] Console Settings value block vs the 6717 stills (dy in px, ncc of the block):');
  for (const [row, still, lines] of EXPECT) {
    if (row > 0) await Down();
    const sh = await shell();
    check(sh.focusId === `lstSettings_item${row}`, `${tag}row ${row} focused, got ${sh.focusId}`);
    const painted = (await dom()).meta;
    for (const l of lines) if (l) check(painted.includes(l), `${tag}row ${row} paints ${JSON.stringify(l)}; got ${JSON.stringify(painted.slice(0, 120))}`);
    const beforeCues = (await cues()).length;
    if (!still) continue;
    await ev(() => window.__dashApi.stepFrames(40));
    const shot = `${OUT}/m3e-cs-row${row}.png`;
    await stage.screenshot({ path: shot });
    const ref = readPng(`${FRAMES}/${still}.png`), ours = readPng(shot);
    const fy = profileFit(grad(colProfile(ref, W.x, W.x + W.w, W.y, W.y + W.h)), grad(colProfile(ours, W.x, W.x + W.w, W.y, W.y + W.h)), 24);
    const fx = profileFit(grad(rowProfile(ref, W.x, W.x + W.w, W.y, W.y + W.h)), grad(rowProfile(ours, W.x, W.x + W.w, W.y, W.y + W.h)), 24);
    const c = compare(ref, ours, W);
    console.log(`  [m3e]   row ${row} ${still}: dx ${fx.shift} dy ${fy.shift} ncc ${c.ncc.toFixed(3)} mad ${c.mad.toFixed(1)}`);
    // MEASURED at the commit that added this: dx -1..1, dy -3..-6 (the metapane
    // text sits a few px high on every row, Locale included - the pre-existing
    // offset smoke-nav's f0060 fit already carries), ncc 0.47..0.56. The gate
    // holds each block to that band; a missing or extra line moves dy and ncc.
    check(Math.abs(fx.shift) <= 3 && fy.shift >= -8 && fy.shift <= 2, `${tag}row ${row} value block is ${fx.shift},${fy.shift} px off ${still}`);
    check(c.ncc >= 0.42, `${tag}row ${row} value block ncc ${c.ncc.toFixed(3)} against ${still}`);
    void beforeCues;
  }
  // One btn_Focus per move, never two (COVERAGE B12).
  await Up(); const c0 = (await cues()).length; await Down();
  const oneDown = (await cues()).slice(c0);
  check(String(oneDown) === String(['btn_Focus@15']), `${tag}one Down fires exactly one btn_Focus, got ${JSON.stringify(oneDown)}`);

  // ---- 8b. Startup: arrival on the current row, A writes and pops, no btn_Back.
  await Up(4);   // row 6
  check((await shell()).focusId === 'lstSettings_item6', `${tag}on the Startup row`);
  await A();
  check(await at() === 'consoles/dashSysCslSetStartUp.xur', `${tag}Startup opens`);
  let d = await noTokens('Startup');
  check((await shell()).focusId === 'btnDashboard', `${tag}Startup arrives on btnDashboard (f0061 "Xbox Dashboard"), got ${(await shell()).focusId}`);
  check(d.labS === 'Xbox Dashboard', `${tag}Startup's labCurrentSettings is "Xbox Dashboard", got ${JSON.stringify(d.labS)}`);
  check(d.shown.iptv === false, `${tag}btnIPTV is hidden without an IPTV provider`);
  await Up();
  const c1 = (await cues()).length;
  await A();
  const selectCues = (await cues()).slice(c1);
  check(String(selectCues) === String(['btn_Select@268']), `${tag}selecting Disc fires btn_Select and NO btn_Back (the pop is XuiSceneNavigateBack, not the B button); got ${JSON.stringify(selectCues)}`);
  check(await at() === 'consoles/dashSysCslSet.xur', `${tag}the option page pops on A`);
  let sh = await shell();
  check(sh.settings.startup === 'disc' && sh.selections.includes('consoles/dashSysCslSetStartUp.xur:btnDefault -> 0'), `${tag}the setting was written: ${JSON.stringify(sh.selections)}`);
  check((await dom()).meta.includes('Disc'), `${tag}Console Settings' Startup line now reads Disc`);
  check(sh.focusId === 'lstSettings_item6', `${tag}focus returns to the Startup row`);
  await A();
  check((await shell()).focusId === 'btnDefault' && (await dom()).labS === 'Disc', `${tag}reopened, Startup arrives on Disc`);
  await B();

  // ---- 8c. Shutdown: the parent's label follows focus; Auto-Off and Background Downloads.
  await Down(); await A();
  check(await at() === 'consoles/dashSysCslSetShutdown.xur', `${tag}Shutdown opens`);
  d = await noTokens('Shutdown');
  check(d.lab === 'Auto-Off Disabled', `${tag}Shutdown's label on btnAutoOff is "Auto-Off Disabled" (f0062), got ${JSON.stringify(d.lab)}`);
  await Down();
  check((await dom()).lab === 'Background Downloads Enabled', `${tag}...and follows focus to btnBackgroundDownloads`);
  await A();
  d = await noTokens('Background Downloads');
  check((await shell()).focusId === 'btnOn' && d.labS === 'Background Downloads Enabled', `${tag}Background Downloads arrives on Enable [FRAME 8498 f2170: arrival on the current row]`);
  await Down(); await A();
  check((await dom()).lab === 'Background Downloads Disabled', `${tag}Disable pops and the parent reads Disabled`);
  await A(); await Up();
  const c2 = (await cues()).length; await A();
  sh = await shell();
  check(sh.dialogs.some((x) => x.includes('0x921a63f0') && x.includes('Background Downloads')), `${tag}Enable raises the xam message box (title 42, body 41) and is recorded: ${JSON.stringify(sh.dialogs)}`);
  check(sh.settings.backgroundDownloads === false, `${tag}...and without its answer the code writes nothing`);
  check(await at() === 'consoles/dashSysCslSetShutdown.xur', `${tag}...and still pops`);
  void c2;
  await Up(); await A();
  check((await shell()).focusId === 'btnOff' && (await dom()).labS === 'Auto-Off Disabled', `${tag}Auto-Off arrives on btnOff`);
  await Up(); await A();
  check((await dom()).lab === 'Auto-Off Enabled', `${tag}Enable pops and the parent reads Auto-Off Enabled`);
  await B();
  check((await dom()).meta.includes('Auto-Off Enabled') && (await dom()).meta.includes('Background Downloads Disabled'), `${tag}Console Settings' Shutdown line carries both`);

  // ---- 8d. Audio: a list option page arrives on the current row (XuiListSetCurSel).
  await Up(6); await A();
  d = await noTokens('Audio');
  check(d.labS === 'Dolby Digital', `${tag}Audio's label on btnDigital is "Dolby Digital" (f0055)`);
  await A();
  d = await noTokens('Digital Output');
  check((await shell()).focusId === 'listOptions_item1', `${tag}Digital Output arrives on Dolby Digital 5.1 [FRAME 8498 f2084]`);
  check(String(d.items.map((i) => i.t)) === String(['Digital Stereo', 'Dolby Digital 5.1', 'Dolby Digital with WMA Pro']), `${tag}its rows are its own ItemsText`);
  await Down(); await A();
  check((await dom()).labS === 'Dolby Digital with WMA Pro', `${tag}selecting WMA Pro pops and the Audio page reads it`);
  await B();
  check((await dom()).meta.includes('Dolby Digital with WMA Pro'), `${tag}...and so does Console Settings`);

  // ---- 8e. Display: the disabled row, its PressDisable cue, the pane, the four-provider label.
  await Up(); await A();
  d = await noTokens('Display');
  check(d.items[1]?.t === 'Screen Format' && d.items[1]?.st === 'NormalDisable', `${tag}Screen Format is drawn disabled while the console runs widescreen: ${JSON.stringify(d.items)}`);
  check(d.pane > 0, `${tag}scnCurrentFormat holds the Widescreen metapane scene`);
  check(d.lab === '1080p Widescreen Standard', `${tag}Display's labCurrentSetting is the four providers' join (f0053), got ${JSON.stringify(d.lab)}`);
  sh = await shell();
  check(sh.containersFilled.some((x) => x.startsWith('scnCurrentFormat -> consoles/metaPane_DisplayWidescreen.xur')), `${tag}the pane is metaPane_DisplayWidescreen.xur`);
  await Down();
  const c3 = (await cues()).length; await A();
  const disabledCues = (await cues()).slice(c3);
  check(String(disabledCues) === String(['btn_InactiveSelect@281']), `${tag}A on the disabled row plays PressDisable: btn_InactiveSelect, got ${JSON.stringify(disabledCues)}`);
  check(await at() === 'consoles/dashSysCslSetDisplay.xur', `${tag}...and opens nothing`);
  await Down(); await A();
  check((await shell()).focusId === 'btnStandard' && (await dom()).lab === 'Standard', `${tag}Reference Levels arrives on btnStandard`);
  await B(); await B();

  // ---- 8f. Clock: the spinners are parked on the clock and Right crosses date -> time.
  await Down(4); await A();
  d = await noTokens('Clock');
  check(/\d\d\/\d\d\/\d{4} +\d\d:\d\d/.test(d.labS ?? ''), `${tag}Clock's label is the date and time, got ${JSON.stringify(d.labS)}`);
  await A();
  d = await noTokens('Date and Time');
  check(d.items.length === 6, `${tag}the five spinners and AM/PM each show one row: ${JSON.stringify(d.items)}`);
  const now = new Date();
  check(d.items[3]?.t === String(now.getDate()).padStart(2, '0') && d.items[4]?.t === String(now.getMonth() + 1).padStart(2, '0'), `${tag}day and month are parked on the clock: ${JSON.stringify(d.items)}`);
  check((await shell()).focusId === `lstDay_item${now.getDate() - 1}`, `${tag}focus arrives on the day spinner's parked row, got ${(await shell()).focusId}`);
  await Right(); await Right();
  check((await shell()).focusId?.startsWith('lstYear_item'), `${tag}Right walks lstDay -> lstMonth -> lstYear`);
  await Right();
  check((await shell()).focusId === `lstHour_item${now.getHours()}`, `${tag}Right from the last date spinner crosses scDate.NavRight into scTime's hour, parked on the clock: ${(await shell()).focusId}`);
  await B(); await Down(2); await A();
  check((await shell()).focusId === 'lstTimezone_item' + String(24) && (await dom()).labS === 'GMT+00 London', `${tag}Time Zone arrives on GMT+00 London (f0059)`);
  await B(); await B();

  // ---- 8g. Family Settings: the ratings from the locale, yes/no pages, the timer.
  await home(); await Down(); await A(); await A();
  d = await noTokens('Family Settings');
  check(await at() === 'consoles/dashSysCslSetPControl.xur', `${tag}Console Controls opens`);
  await A();
  d = await noTokens('Game Ratings');
  check(d.items[0]?.t === 'Allow All Games' && d.items[1]?.t === 'PEGI 18+ / BBFC 18' && d.items[3]?.t === 'BBFC 15', `${tag}the UK game table (PEGI + BBFC): ${JSON.stringify(d.items.map((i) => i.t))}`);
  check((await shell()).codeFilled.some((x) => x.startsWith('lstRating x9 from 0x920159a0')), `${tag}nine rows from the system-4 table at 0x920159a0: ${JSON.stringify((await shell()).codeFilled.slice(-2))}`);
  await Down(2); await A();
  check((await dom()).lab === 'PEGI 16+', `${tag}selecting a rating pops and the menu shows it`);
  await Down(); await A(); await Down(); await A();
  d = await noTokens('TV Ratings');
  check(d.items.length === 0 && (await shell()).codeUnfilled.some((x) => x.includes('VideoTV.xur#lstRating')), `${tag}the UK has no TV system: the list stays empty and says why`);
  await B();
  check((await dom()).lab === '<None>', `${tag}the Video menu labels the TV row "<None>" (string 427) - a value, not a token`);
  await Down(); await A();
  check((await shell()).focusId === 'btnNo', `${tag}Explicit Video keeps DefaultFocus with the block unknown`);
  await Down(); await A();
  check((await dom()).lab === 'Blocked', `${tag}Blocked pops and labels the row`);
  await B(); await Down(4); await A();
  d = await noTokens('Family Timer');
  check(d.items.some((i) => i.t === 'Family Timer is off'), `${tag}lstTime is the single "off" row (string 383): ${JSON.stringify(d.items)}`);
  await home();

  // ---- 8h. Memory, Network, Computers, Xbox LIVE Vision, Initial Setup.
  await Down(2); await A();
  d = await noTokens('Storage Devices');
  check(d.items.length === 0 && d.shown.empty === true, `${tag}no storage device: no rows, txt_EmptyList shown`);
  const c4 = (await cues()).length;
  await ev(() => window.__dashApi.shell.pressKey('Y')); await ev(() => window.__dashApi.shell.idle());
  sh = await shell();
  check(sh.codePaths.some((x) => x.includes('DeviceSelector.xur:legend_y (Y')), `${tag}Y on Storage Devices reaches legend_y "Device Options" and is a code path`);
  check((await cues()).slice(c4).some((x) => x.startsWith('btn_Select')), `${tag}...and plays legend_Y's Press`);
  await B(); await Down(); await A();
  d = await noTokens('Network Settings');
  check((await shell()).focusId === 'list_items_item0' && d.items.length === 5, `${tag}Network Settings arrives inside scene_main on its five rows`);
  await B(); await Down(); await A();
  d = await noTokens('Computers');
  check(await at() === 'dashcomm/742_SelectNetworkDevice.xur', `${tag}Computers`);
  await B(); await Down(); await A();
  d = await noTokens('Xbox LIVE Vision');
  check((await shell()).focusId === null && d.items.length === 6 && d.shown.noCamera === true, `${tag}no camera: choosers disabled, no focus, NoCameraTextField shown`);
  await B(); await Down();
  const c5 = (await shell()).stack.length; await A();
  sh = await shell();
  check(sh.stack.length === c5 && sh.dialogs.some((x) => x.includes('0x92114a98') && x.includes('Initial Setup')), `${tag}Initial Setup raises the xam message box and opens nothing: ${JSON.stringify(sh.dialogs)}`);

  // ---- 8i. Games and Media code paths.
  await home(); await ev(() => window.__dashApi.shell.seekRest(3)); await ev(() => window.__dashApi.stepFrames(5));
  await Down(); await A();
  check(await at() === 'oobe/oobeProfileCreation.xur', `${tag}Create Gamer Profile opens the OOBE wait page`);
  await noTokens('oobeProfileCreation');
  await B(); await Down(); await A();
  await noTokens('Games Library');
  await B();
  await ev(() => window.__dashApi.shell.seekRest(4)); await ev(() => window.__dashApi.stepFrames(5));
  await Down(); await A();
  d = await noTokens('Select Source');
  check(await at() === 'dashcomm/MediaSourceSelection.xur', `${tag}Music opens the source picker`);
  check(d.shown.no === true && d.shown.wait === false && d.shown.info === false, `${tag}no computers: only NoComputersScene shows: ${JSON.stringify(d.shown)}`);
  await Right();
  check((await shell()).focusId === 'btnTestConnection', `${tag}NavRight="metaPanelScene\\NoComputersScene" lands on its DefaultFocus`);
  await B();

  sh = await shell();
  const errs2 = await ev(() => window.__dash.errors);
  check(errs2.length === 0, `${tag}__dash.errors: ${errs2.join(' | ')}`);
  check(errs.length === 0, `${tag}page errors: ${errs.join(' | ')}`);
  check(sh.missingStrings.length === 0, `${tag}missing strings: ${JSON.stringify(sh.missingStrings)}`);
  check(sh.unresolvedPresses.length === 0, `${tag}unresolved presses: ${JSON.stringify(sh.unresolvedPresses)}`);
  console.log(`  [m3e] selections: ${sh.selections.length}, dialogs: ${sh.dialogs.length}, code paths: ${sh.codePaths.length}, hardware-state lines: ${sh.hardwareState.length}`);
  await page.close();
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
