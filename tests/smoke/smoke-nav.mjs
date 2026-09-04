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
import { mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readPng, compare, luma, rowProfile, colProfile, grad, profileFit } from './pixlab.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'out');
const FRAMES = resolve(HERE, '../../reference/frames/6717');
/** The 8498 capture: the only footage of an option page being opened, written
 *  and popped (its host is NXE, so it is read for WHAT the console does on a
 *  pop, never for our pixels; §9c). */
const FRAMES_8498 = resolve(HERE, '../../reference/frames/nxe-8498-ucJoSC29UL8');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.SMOKE_URL ?? 'http://localhost:5173';

// RootScene's own named frames, from dashmain.xur. len = to - from, and the
// two the console was measured on are 1To2 = 20 and 5To4 = 22 timeline frames.
const RANGES = {
  BootLive: [462, 533], '2To3': [44, 68], '3To4': [94, 118], '4To5': [144, 168],
  '5Open': [408, 434], '5Close': [435, 461],
  '4To3': [119, 143], '3To2': [69, 93], '2To1': [22, 43], '1To2': [1, 21], '5To4': [169, 191],
};

const REACHED_PAGES = [
  'arcade/2500_LiveArcadeHome.xur', 'arcade/2502_TwistSelectorScene.xur',
  'arcade/2504_TitleOptionsScene.xur', 'arcade/250x_EZPassScene.xur',
  'arcade/250x_FriendsPlayingNowScene.xur', 'blademp/marketplaceSignedOut.xur',
  'consoles/dashSysCslSet.xur', 'consoles/dashSysCslSetAudio.xur',
  'consoles/dashSysCslSetAudioDigital.xur', 'consoles/dashSysCslSetAudioSoundEffects.xur',
  'consoles/dashSysCslSetAutoOff.xur', 'consoles/dashSysCslSetBackgroundDownloads.xur',
  'consoles/dashSysCslSetClock.xur', 'consoles/dashSysCslSetClockDaylightSavings.xur',
  'consoles/dashSysCslSetClockFormat.xur', 'consoles/dashSysCslSetClockTime.xur',
  'consoles/dashSysCslSetClockTimeZone.xur', 'consoles/dashSysCslSetCountry.xur',
  'consoles/dashSysCslSetDisplay.xur', 'consoles/dashSysCslSetDisplayHiDef.xur',
  'consoles/dashSysCslSetLanguage.xur', 'consoles/dashSysCslSetOutputLevels.xur',
  'consoles/dashSysCslSetPControl.xur', 'consoles/dashSysCslSetPControlContent.xur',
  'consoles/dashSysCslSetPControlFamilyTimer.xur', 'consoles/dashSysCslSetPControlGame.xur',
  'consoles/dashSysCslSetPControlLiveA.xur', 'consoles/dashSysCslSetPControlLiveC.xur',
  'consoles/dashSysCslSetPControlPasscode.xur', 'consoles/dashSysCslSetPControlPasscodeHint.xur',
  'consoles/dashSysCslSetPControlSelect.xur', 'consoles/dashSysCslSetPControlVideo.xur',
  'consoles/dashSysCslSetPControlVideoExplicit.xur', 'consoles/dashSysCslSetPControlVideoMovie.xur',
  'consoles/dashSysCslSetPControlVideoTV.xur', 'consoles/dashSysCslSetPControlVideoUnrated.xur',
  'consoles/dashSysCslSetPolicyInfo_System.xur', 'consoles/dashSysCslSetRemoteC.xur',
  'consoles/dashSysCslSetScreensaver.xur', 'consoles/dashSysCslSetShutdown.xur',
  'consoles/dashSysCslSetStartUp.xur', 'consoles/dashSysLiveVision.xur',
  'dashcomm/742_SelectNetworkDevice.xur', 'dashcomm/MediaSourceSelection.xur',
  'gamesbla/gamesSignedOut.xur', 'live/liveSignedOutUI.xur', 'mediabla/mediaSignedOut.xur',
  'memory/DeviceSelector.xur', 'network/ConnStatus.xur', 'oobe/oobeProfileCreation.xur',
];

/** Pairs the CONSOLE draws on top of each other, each with the code that does. */
const STACKED_BY_THE_CONSOLE = {
  'arcade/2502_TwistSelectorScene.xur': [
    'XuiNavButton#btnX | XuiNavButton#btnX',
  ],
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

  /* --------- 9. M3f: Judge E round 3's seven findings, each with its measure */

  await m3f(browser);

  /* --------- 10. M3g: Judge E round 4's four findings, each with its measure */

  await m3g(browser);

  /* --------- 11. M3h: the token and stacking sweep over EVERY reached page */

  await m3h(browser);
} catch (err) {
  fails.push(`threw: ${err instanceof Error ? err.stack : String(err)}`);
} finally {
  if (browser) await browser.close();
}

if (fails.length) { for (const f of fails) console.error('  FAIL ' + f); console.log('SMOKE_FAIL'); process.exit(1); }
console.log('SMOKE_PASS');

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
  // What the top scene's own root is doing: on screen at all, and how much of
  // it is painted. Four clock pages share the scene Id `scClockSettings` and
  // the two pass-code pages share `scRating`, and every scope id in this
  // runtime is `pathOf` - a chain of element Ids - so a second copy mounted
  // under the same TabN used to take the first page's ids outright and pop
  // them with itself, leaving the page underneath at FadeOut's Show=false
  // [Judge E round 3, finding 2]. Every pop below is gated on this.
  const topRoot = () => ev(() => {
    const vis = (el) => { try { return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }); } catch { return true; } };
    const id = window.__dash.shell.stack.at(-1);
    // Level 0 of the System blade is `dashmain/dashmain.xur#System`: a DashScene
    // inside dashmain, not a mounted scene, so it is found by its fragment Id.
    const frag = id.includes('#') ? id.split('#')[1] : null;
    const host = frag
      ? document.querySelector(`[data-xui-id="${frag}"]`)
      : [...document.querySelectorAll(`[data-xui-scene="${id}"]`)].at(-1);
    if (!host) return { id, host: false, shown: false, painted: 0 };
    const root = frag ? host : host.firstElementChild;
    return { id, host: true, shown: root ? vis(root) : false,
      painted: [...host.querySelectorAll('[data-xui-paint="text"]')].filter(vis).filter((e) => (e.textContent ?? '').trim()).length };
  });
  const depth = () => ev(() => window.__dash.shell.stack.length);
  const afterPop = async (what, was) => {
    if (await depth() >= was) return;
    const st = await topRoot();
    check(st.shown && st.painted > 0,
      `${tag}after ${what} the page underneath must be on screen and painted: ${JSON.stringify(st)}`);
  };
  const A = async () => {
    const was = await depth();
    await ev(() => window.__dashApi.shell.press()); await ev(() => window.__dashApi.shell.idle()); await ev(() => window.__dashApi.stepFrames(60));
    await afterPop('an option page writes and pops (XuiSceneNavigateBack)', was);
  };
  const B = async () => {
    // The B carrier is whatever control binds XuiBackButton's PressKey 0x5841 -
    // `legend_b` on the settings pages, `navB` on the media source picker,
    // `btnB` on the Arcade pages, System Info and the Family Timer - and its
    // Press range carries btn_Back.xma on frame 2. 176 scenes in the build
    // carry one and 87 do not (16 of the 187 full-canvas scenes); an unkeyed
    // XuiBackButton binds A, not B, because that is XuiButton.PressKey's
    // default [Judge E round 3, finding 6; the survey corrected in round 4,
    // finding 4 - see keyCarrierOf].
    const was = await depth(); const c0 = (await cues()).length;
    const left = await at(); const carrier = (await shell()).backCarrier;
    await ev(() => window.__dashApi.shell.back()); await ev(() => window.__dashApi.stepFrames(60)); await ev(() => window.__dashApi.shell.idle());
    if (await depth() < was) {
      const played = (await cues()).slice(c0).some((c) => c.startsWith('btn_Back@'));
      check(played === !!carrier,
        `${tag}B plays btn_Back exactly when the page binds PressKey 0x5841: ${left} carrier ${JSON.stringify(carrier)}, btn_Back ${played}`);
    }
    await afterPop('B', was);
  };
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
    // A SEARCH, not a match: 19 of the corpus's 211 token controls carry the
    // token inside other text ("<#> of <Total #>"), and an anchored test read
    // "0 painted tokens" over all of them [Judge E round 5].
    const tokens = [...document.querySelectorAll('[data-xui-paint="text"]')].filter(vis)
      .flatMap((e) => (e.textContent ?? '').match(/<[^<>\r\n]{1,40}>/g) ?? []);
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
  // FIVE rows, not six: the console runs 24-hour time here and dashCTime's init
  // hides lstAMPM in that branch (0x921cc8b4-0x921cc8bc), so the AM/PM list
  // shows nothing at all [Judge E round 3, finding 3; gated in §9d].
  const spun = await ev(() => Object.fromEntries(['lstDay', 'lstMonth', 'lstYear', 'lstHour', 'lstMin', 'lstAMPM'].map((id) => {
    const list = document.querySelector(`[data-xui-id="${id}"]`);
    const vis = (el) => { try { return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }); } catch { return true; } };
    const rows = list ? [...list.querySelectorAll('[data-xui-class="XuiListItem"]')].filter(vis).map((e) => e.textContent.trim()) : [];
    return [id, rows];
  })));
  check(d.items.length === 5, `${tag}the five spinners each show one row and lstAMPM is hidden in 24-hour mode: ${JSON.stringify(d.items)}`);
  check(spun.lstAMPM.length === 0, `${tag}lstAMPM paints nothing: ${JSON.stringify(spun.lstAMPM)}`);
  const now = new Date();
  check(spun.lstDay[0] === String(now.getDate()).padStart(2, '0') && spun.lstMonth[0] === String(now.getMonth() + 1).padStart(2, '0'), `${tag}day and month are parked on the clock: ${JSON.stringify(spun)}`);
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
  // THREE rows, one per chooser: each is a XuiListChooser, a horizontal
  // control that shows one value between two arrows. It read 6 until M3g,
  // because the window arithmetic counted rows down a 74-tall list at the
  // template's 33 pitch [Judge E round 4, finding 3; gated in 10d].
  check((await shell()).focusId === null && d.items.length === 3 && d.shown.noCamera === true, `${tag}no camera: three choosers each showing ONE value, no focus, NoCameraTextField shown: ${JSON.stringify(d.items.map((i) => i.t))}`);
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

/**
 * §9. M3f: the seven findings of Judge E round 3, each closed with the
 * measurement that would have caught it.
 *
 *  1 (HIGH) a page pushed from the Games or Media blade was drawn offset by the
 *    blade container it was hosted in; every pushed page now lands on the
 *    canvas origin, so its header authored at (156,96) is AT (156,96).
 *  2 (HIGH) four clock pages share the scene Id `scClockSettings` and the two
 *    pass-code pages share `scRating`; scope ids are `pathOf`, so the second
 *    copy took the first page's ids and popped them with itself, leaving the
 *    page underneath blank. Every pop in §8 and §9 is now gated on the page
 *    underneath being on screen and painted (the A/B helpers), and the three
 *    clock option pages and the pass-code pair are walked here.
 *  3 (MED) 24-hour mode hides lstAMPM (0x921cc8b4-0x921cc8bc) and the year
 *    spinner has to fit four digits.
 *  4 (MED) the Display page's SwitchImage is hidden except on an AV pack 0.
 *  5 (MED) MediaSourceSelection authors TWO labelPleaseWaitText; both are down.
 *  6 (MED) B presses whatever control binds PressKey 0x5841, not the name
 *    `legend_b`: gated on every pop by the B helper, and here on the four
 *    pages that call it something else.
 *  7 (LOW) dashSysCslSetPControl's empty PanelStrings[8] (btnDone) carries its
 *    CODE_FILLED reason instead of counting as a missing string.
 *
 * Plus the four things the judge could not verify: the Time Zone list's
 * per-row writes (it wraps, so it is driven by index), PControlContent's two
 * rows, the Family Timer's single off row, and the pass-code blank page.
 */
async function m3f(browser) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/?blade=5&zoom=1.5&mute&manual`, { waitUntil: 'networkidle0', timeout: 90000 });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', { timeout: 90000 });
  const tag = '[m3f] ';
  const ev = (f, ...a) => page.evaluate(f, ...a);
  const shell = () => ev(() => JSON.parse(JSON.stringify(window.__dash.shell)));
  const at = () => ev(() => window.__dash.shell.stack.at(-1));
  const cues = () => ev(() => window.__dashApi.audio.log.map((c) => `${c.cue}@${c.tick}`));
  const depth = () => ev(() => window.__dash.shell.stack.length);
  const stage = await page.$('.xui-stage');
  const topRoot = () => ev(() => {
    const vis = (el) => { try { return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }); } catch { return true; } };
    const id = window.__dash.shell.stack.at(-1);
    // Level 0 of the System blade is `dashmain/dashmain.xur#System`: a DashScene
    // inside dashmain, not a mounted scene, so it is found by its fragment Id.
    const frag = id.includes('#') ? id.split('#')[1] : null;
    const host = frag
      ? document.querySelector(`[data-xui-id="${frag}"]`)
      : [...document.querySelectorAll(`[data-xui-scene="${id}"]`)].at(-1);
    if (!host) return { id, host: false, shown: false, painted: 0 };
    const root = frag ? host : host.firstElementChild;
    return { id, host: true, shown: root ? vis(root) : false,
      painted: [...host.querySelectorAll('[data-xui-paint="text"]')].filter(vis).filter((e) => (e.textContent ?? '').trim()).length };
  });
  const afterPop = async (what, was) => {
    if (await depth() >= was) return null;
    const st = await topRoot();
    check(st.host && st.shown && st.painted > 0,
      `${tag}after ${what} the page underneath must be on screen and painted: ${JSON.stringify(st)}`);
    return st;
  };
  const A = async () => {
    const was = await depth();
    await ev(() => window.__dashApi.shell.press()); await ev(() => window.__dashApi.shell.idle()); await ev(() => window.__dashApi.stepFrames(60));
    return afterPop('a write-and-pop (XuiSceneNavigateBack)', was);
  };
  const B = async () => {
    const was = await depth(); const c0 = (await cues()).length;
    const left = await at(); const carrier = (await shell()).backCarrier;
    await ev(() => window.__dashApi.shell.back()); await ev(() => window.__dashApi.stepFrames(60)); await ev(() => window.__dashApi.shell.idle());
    const popped = await depth() < was;
    const played = (await cues()).slice(c0);
    if (popped) {
      check(played.some((c) => c.startsWith('btn_Back@')) === !!carrier,
        `${tag}B plays btn_Back exactly when the page binds PressKey 0x5841: ${left} carrier ${JSON.stringify(carrier)}, cues ${JSON.stringify(played)}`);
    }
    await afterPop('B', was);
    return { played, carrier };
  };
  const Down = async (n = 1) => { for (let i = 0; i < n; i++) { await ev(() => window.__dashApi.shell.move('Down')); await ev(() => window.__dashApi.stepFrames(21)); } await ev(() => window.__dashApi.shell.idle()); };
  const Up = async (n = 1) => { for (let i = 0; i < n; i++) { await ev(() => window.__dashApi.shell.move('Up')); await ev(() => window.__dashApi.stepFrames(21)); } await ev(() => window.__dashApi.shell.idle()); };
  const blade = async (t) => { while ((await shell()).level > 0) await B(); await ev((t) => window.__dashApi.shell.seekRest(t), t); await ev(() => window.__dashApi.stepFrames(5)); await ev(() => window.__dashApi.shell.idle()); await Up(8); };
  // A control's rect in DESIGN pixels: its offset chain up to the 1120x770
  // `.xui-canvas`, which is where the .xur's own numbers live. The view
  // transform is on the canvas element, so this is the authored frame, not a
  // screen measurement scaled back.
  const design = (id) => ev((id) => {
    const canvas = document.querySelector('.xui-canvas');
    const vis = (el) => { try { return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }); } catch { return true; } };
    return [...document.querySelectorAll(`[data-xui-id="${id}"]`)].map((e) => {
      let x = 0, y = 0, n = e;
      while (n && n !== canvas) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
      return { x, y, w: e.offsetWidth, h: e.offsetHeight, vis: vis(e),
        scene: e.closest('[data-xui-scene]')?.dataset.xuiScene ?? null, text: (e.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30) };
    });
  }, id);
  const shownDesign = async (id) => (await design(id)).filter((r) => r.vis);
  const shot = async (name) => { const p = `${OUT}/m3f-${name}.png`; await stage.screenshot({ path: p }); return p; };

  /* ---- 9a. Finding 1: a pushed page is hosted at the CANVAS ORIGIN. */

  // The console's NavigateToScenePath pushes into the pressed control's parent
  // and copies the SOURCE SCENE's x/y; every second-level target in this build
  // declares the full 1120x770 canvas, so its own (156,96) header is the
  // dashboard's (156,96). Hosting the page beside the panel scene inside
  // `TabN/scBlade/scContainer` (221,151 on Games, 258,151 on Media) offset
  // every Arcade and media page by the container [Judge E round 3, finding 1].
  await A();
  check(await at() === 'consoles/dashSysCslSet.xur', `${tag}A opens Console Settings, got ${await at()}`);
  const csHeader = await shownDesign('labHeader');
  check(csHeader.length === 1 && csHeader[0].x === 156 && csHeader[0].y === 96,
    `${tag}the System blade's page header is the reference: (156,96); got ${JSON.stringify(csHeader)}`);
  await B();

  await blade(4);
  await Down(); await A();
  check(await at() === 'dashcomm/MediaSourceSelection.xur', `${tag}Music opens the source picker, got ${await at()}`);
  const mssHeader = await shownDesign('labelHeader');
  check(mssHeader.length === 1 && mssHeader[0].x === 156 && mssHeader[0].y === 96,
    `${tag}MediaSourceSelection's labelHeader is authored at (156,96) and must paint there, not at the Media container's (258,151) + (156,96) = (414,247); got ${JSON.stringify(mssHeader)}`);

  /* ---- 9b. Finding 5: ONE "Please wait", and it is down. */

  // The page binds three metapane sub-scenes at 0x921a9e7c-0x921a9e94 and shows
  // exactly one (0x921aac44-0x921aac58); it ALSO authors its own "Please wait"
  // pair at (350,250)/(508,342), the enumeration's wait state, bound at
  // 0x921a9de0. `findById` hid only the first labelPleaseWaitText - the copy
  // inside the already-hidden WmcConnectingScene - and left the page's own on
  // screen beside "No computers found." [Judge E round 3, finding 5].
  const wait = await design('labelPleaseWaitText');
  check(wait.length === 2, `${tag}the scene authors TWO labelPleaseWaitText (one in WmcConnectingScene, one on the page); found ${wait.length}`);
  check(wait.every((w) => !w.vis), `${tag}both copies must be down: ${JSON.stringify(wait)}`);
  check((await design('labelPleaseWaitAnimation')).every((w) => !w.vis), `${tag}and so must the animation beside it`);
  const mssShown = await ev(() => {
    const vis = (el) => { try { return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }); } catch { return true; } };
    const q = (id) => { const e = document.querySelector(`[data-xui-id="${id}"]`); return e ? vis(e) : null; };
    return { no: q('NoComputersScene'), info: q('MediaSourceInfoScene'), wait: q('WmcConnectingScene') };
  });
  check(mssShown.no === true && mssShown.info === false && mssShown.wait === false,
    `${tag}the metapane rests on NoComputersScene alone: ${JSON.stringify(mssShown)}`);
  let sh = await shell();
  check(sh.codeUnfilled.some((x) => x.includes('MediaSourceSelection.xur: no media source') && x.includes('0x921a9de0')),
    `${tag}and the disclosure names the pair and where the code binds it: ${JSON.stringify(sh.codeUnfilled.filter((x) => x.includes('MediaSource')))}`);

  /* ---- 9c. Finding 6: B on the pages that do not call it legend_b. */

  // MediaSourceSelection's back button is `navB`, the Arcade pages' and System
  // Info's is `btnB`; all three wear the skin's legend_B, whose Press range
  // carries btn_Back.xma on frame 2. The B helper gates the cue on every pop.
  const mssBack = await B();
  check(mssBack.carrier === 'navB' && mssBack.played.some((c) => c.startsWith('btn_Back@')),
    `${tag}navB is the B carrier on MediaSourceSelection and its Press is what plays: ${JSON.stringify(mssBack)}`);

  await blade(3);
  await Down(2); await A();
  check(await at() === 'arcade/2500_LiveArcadeHome.xur', `${tag}Games Library opens the Arcade home, got ${await at()}`);
  const arcHeader = (await shownDesign('txt_Header')).filter((r) => r.scene);
  check(arcHeader.length === 1 && arcHeader[0].x === 156 && arcHeader[0].y === 96,
    `${tag}the Arcade home's txt_Header must paint at (156,96), not at the Games container's (221,151) + (156,96); got ${JSON.stringify(arcHeader)}`);
  await A();
  check(await at() === 'arcade/2502_TwistSelectorScene.xur', `${tag}A opens the twist selector, got ${await at()}`);
  const twistBack = await B();
  check(twistBack.carrier === 'btnB' && twistBack.played.some((c) => c.startsWith('btn_Back@')),
    `${tag}btnB is the B carrier on 2502_TwistSelectorScene: ${JSON.stringify(twistBack)}`);
  const homeBack = await B();
  check(homeBack.carrier === 'btnB' && homeBack.played.some((c) => c.startsWith('btn_Back@')),
    `${tag}and on the Arcade home itself: ${JSON.stringify(homeBack)}`);

  // System Info is the fourth page that calls its back button something else.
  await blade(5); await A(); await Down(10);
  check((await shell()).focusId === 'lstSettings_item10', `${tag}the System Info row, got ${(await shell()).focusId}`);
  await A();
  check(await at() === 'consoles/dashSysCslSetPolicyInfo_System.xur', `${tag}System Info opens, got ${await at()}`);
  const infoBack = await B();
  check(infoBack.carrier === 'btnB' && infoBack.played.some((c) => c.startsWith('btn_Back@')),
    `${tag}btnB is the B carrier on System Info: ${JSON.stringify(infoBack)}`);
  await B();

  /* ---- 9d. Finding 3: 24-hour mode, and the year spinner. */

  await blade(5); await A(); await Down(4); await A();
  check(await at() === 'consoles/dashSysCslSetClock.xur', `${tag}the Clock menu opens, got ${await at()}`);
  await A();
  check(await at() === 'consoles/dashSysCslSetClockTime.xur', `${tag}Date and Time opens, got ${await at()}`);
  sh = await shell();
  check(sh.settings.clock24h === true, `${tag}the reference console is in 24-hour mode (f0058)`);
  const ampm = await design('lstAMPM');
  check(ampm.length === 1 && ampm[0].vis === false,
    `${tag}dashCTime's init hides lstAMPM in 24-hour mode (0x921cc8b4-0x921cc8bc: Show(this+0xc, 0)); got ${JSON.stringify(ampm)}`);
  const hours = await ev(() => [...document.querySelectorAll('[data-xui-id^="lstHour_item"]')].map((e) => e.textContent.trim()));
  check(hours.length === 24 && hours[0] === '00' && hours[23] === '23',
    `${tag}and the hour spinner runs 00..23, not 1..12: ${JSON.stringify(hours.slice(0, 3))}..${JSON.stringify(hours.slice(-1))} (${hours.length})`);
  const year = await ev(() => [...document.querySelectorAll('[data-xui-id^="lstYear_item"]')]
    .filter((e) => e.style.display !== 'none')
    .map((e) => { const t = e.querySelector('[data-xui-paint="text"]'); return { row: e.dataset.xuiId, rowW: e.offsetWidth, text: t?.textContent ?? '', tw: t?.offsetWidth ?? 0, scroll: t?.scrollWidth ?? 0 }; }));
  check(year.length === 1 && /^\d{4}$/.test(year[0].text),
    `${tag}the year spinner parks one four-digit row: ${JSON.stringify(year)}`);
  // List_VerticalSpin's row is 83 wide, LEFT|RIGHT, in a 53-wide visual; on the
  // 75-wide lstYear that is 83 + 22 = 105. Taking the LIST's width gave 75 and
  // the presenter ellipsized "2025" to "2..." [Judge E round 3, finding 3].
  check(year[0].rowW === 105, `${tag}the year row spans its template's 83 + (75 - 53) = 105 px, got ${year[0].rowW}`);
  check(year[0].scroll <= year[0].tw + 0.5, `${tag}and the four digits are not clipped: ${JSON.stringify(year[0])}`);
  console.log(`  ${tag}year row ${year[0].text} in ${year[0].rowW}px (text ${year[0].tw}px, content ${year[0].scroll}px), lstAMPM hidden, hours ${hours.length}`);
  await B();

  /* ---- 9e. Finding 2: the four scClockSettings pages, and the pop. */

  // The Clock menu's own body (design 146..1010 x 150..640 through the view
  // transform), measured with `ink` before the push and after the pop. The
  // detector is calibrated here against the failure state itself: with the
  // page's root hidden - which is exactly what the popped sibling's teardown
  // left behind, FadeOut's Show=false with no FadeIn to undo it - the window
  // reads 0.00.
  const BODY = { x: 250, y: 150, w: 1480, h: 700 };
  const beforeInk = ink(readPng(await shot('clock-before')), BODY);
  const blanked = await ev(() => {
    const e = [...document.querySelectorAll('[data-xui-scene="consoles/dashSysCslSetClock.xur"]')].at(-1).firstElementChild;
    e.dataset.m3f = e.style.display; e.style.display = 'none'; return true;
  });
  const floor = ink(readPng(await shot('clock-blank')), BODY);
  await ev(() => { const e = [...document.querySelectorAll('[data-xui-scene="consoles/dashSysCslSetClock.xur"]')].at(-1).firstElementChild; e.style.display = e.dataset.m3f ?? ''; delete e.dataset.m3f; });
  const restored = ink(readPng(await shot('clock-restored')), BODY);
  check(blanked && floor < 1 && restored === beforeInk,
    `${tag}the detector's floor: the page's own body reads ${floor}% ink with the root hidden and ${restored}% with it back (was ${beforeInk}%)`);
  console.log(`  ${tag}Clock menu body ink ${beforeInk}% painted, ${floor}% with the root hidden (the round-3 failure state)`);
  const CLOCK_PAGES = [[1, 'Time Format', 'consoles/dashSysCslSetClockFormat.xur'],
    [2, 'Time Zone', 'consoles/dashSysCslSetClockTimeZone.xur'],
    [3, 'Daylight Saving', 'consoles/dashSysCslSetClockDaylightSavings.xur']];
  for (const [row, name, scene] of CLOCK_PAGES) {
    await Down(row); await A();
    check(await at() === scene, `${tag}${name} opens ${scene}, got ${await at()}`);
    check((await topRoot()).painted > 0, `${tag}${name} itself must paint`);
    const st = await A();                                  // select: writes and pops
    check(await at() === 'consoles/dashSysCslSetClock.xur', `${tag}${name} pops back to the Clock menu, got ${await at()}`);
    const after = ink(readPng(await shot(`clock-after-${row}`)), BODY);
    check(after >= 0.9 * beforeInk,
      `${tag}the Clock menu comes back painted after ${name}: ${after}% body ink against ${beforeInk}% before the push and ${floor}% blank - both pages carry the scene Id scClockSettings [${JSON.stringify(st)}]`);
    console.log(`  ${tag}${name}: pop leaves ${after}% body ink (before ${beforeInk}%, blank ${floor}%), root painted ${st?.painted}`);
    await Up(row);
  }
  // The console's own answer to the same question with the same detector, from
  // the only capture that has an option page opened, written and popped: while
  // the option page is up its two rows carry 2.5% of the row column, and after
  // the press the PARENT page's four rows bring it to 5.5% and then 7.6%.
  if (existsSync(`${FRAMES_8498}/f2181.png`)) {
    const W8498 = { x: 206, y: 130, w: 430, h: 300 };
    const on = ink(readPng(`${FRAMES_8498}/f2173.png`), W8498);
    const mid = ink(readPng(`${FRAMES_8498}/f2179.png`), W8498);
    const back = ink(readPng(`${FRAMES_8498}/f2181.png`), W8498);
    check(back > on * 2 && mid > on,
      `${tag}[FRAME 8498 f2173 -> f2179 -> f2181] the console's parent page comes BACK after the pop: row-column ink ${on}% -> ${mid}% -> ${back}%`);
    console.log(`  ${tag}console pop [8498 f2173 -> f2179 -> f2181]: row-column ink ${on}% -> ${mid}% -> ${back}%`);
  } else {
    console.log(`  ${tag}(no reference/frames/nxe-8498-ucJoSC29UL8: the console side of the pop is not measured here)`);
  }
  await B();

  /* ---- 9f. Finding 4: the Display page's switch art. */

  await Up(4); await A();
  check(await at() === 'consoles/dashSysCslSetDisplay.xur', `${tag}the Display page opens, got ${await at()}`);
  const sw = await design('SwitchImage');
  check(sw.length === 1 && sw[0].vis === false,
    `${tag}UpdateCurrentSetting hides SwitchImage (0x921c6f30-0x921c6f40) and only the AV-pack-0 branch (0x921c6ffc-0x921c7004) re-shows it; the reference console is an HD pack: ${JSON.stringify(sw)}`);
  sh = await shell();
  check(sh.hardwareState.some((x) => x.includes('SwitchImage hidden') && x.includes('0x921c6f30')),
    `${tag}and the state says which AV pack that is: ${JSON.stringify(sh.hardwareState.filter((x) => x.includes('SwitchImage')))}`);
  await B(); await B();

  /* ---- 9g. Finding 7, and the Family Settings pages the judge could not reach. */

  await blade(5); await Down(); await A(); await A();
  check(await at() === 'consoles/dashSysCslSetPControl.xur', `${tag}Console Controls opens, got ${await at()}`);
  await Down(8);
  sh = await shell();
  check(sh.focusId === 'btnDone', `${tag}the ninth row is btnDone, got ${sh.focusId}`);
  check(sh.missingStrings.length === 0,
    `${tag}PanelStrings[8] is empty because the CODE writes labDoneSummary, so it is not a missing string: ${JSON.stringify(sh.missingStrings)}`);
  check(sh.hardwareState.some((x) => x.includes('btnDone PanelStrings[8]') && x.includes('0x921bd0b0')),
    `${tag}and it says so with the address: ${JSON.stringify(sh.hardwareState.filter((x) => x.includes('btnDone')))}`);

  // PControlContent: two rows, btnYes ABOVE btnNo, each writing its own value.
  await Up(4); await A();
  check(await at() === 'consoles/dashSysCslSetPControlContent.xur', `${tag}the Content page opens, got ${await at()}`);
  const rowsC = await ev(() => ['btnYes', 'btnNo'].map((id) => { const e = document.querySelector(`[data-xui-id="${id}"]`); return { id, y: e?.offsetTop ?? null, text: (e?.textContent ?? '').trim() }; }));
  check(rowsC[0].y === 153 && rowsC[1].y === 198 && rowsC[0].text && rowsC[1].text,
    `${tag}the page authors btnYes at y 153 and btnNo at y 198: ${JSON.stringify(rowsC)}`);
  check((await shell()).focusId === 'btnNo', `${tag}with the block unknown it keeps DefaultFocus btnNo`);
  await A();
  sh = await shell();
  check(sh.settings.parental.content === 0xff && sh.selections.at(-1) === 'consoles/dashSysCslSetPControlContent.xur:btnNo -> 255',
    `${tag}btnNo stores 0xff [0x921bd710]: ${JSON.stringify(sh.selections.at(-1))}`);
  const labNo = await ev(() => document.querySelector('[data-xui-id="labCurrentSetting"]')?.textContent.trim() ?? null);
  await A(); await Up(); await A();
  sh = await shell();
  const labYes = await ev(() => document.querySelector('[data-xui-id="labCurrentSetting"]')?.textContent.trim() ?? null);
  check(sh.settings.parental.content === 0 && sh.selections.at(-1) === 'consoles/dashSysCslSetPControlContent.xur:btnYes -> 0',
    `${tag}btnYes stores 0: ${JSON.stringify(sh.selections.at(-1))}`);
  check(labNo && labYes && labNo !== labYes,
    `${tag}and the menu's Current Setting follows the pair at 0x92013adc (408/409): ${JSON.stringify([labNo, labYes])}`);
  console.log(`  ${tag}Content rows: ${JSON.stringify(rowsC.map((r) => r.text))} -> ${JSON.stringify([labNo, labYes])}`);

  // The Family Timer: one "off" row (string 383), three frequency radios, and
  // its own btnB.
  await Down(); await A();
  check(await at() === 'consoles/dashSysCslSetPControlFamilyTimer.xur', `${tag}the Family Timer opens, got ${await at()}`);
  const timer = await ev(() => {
    const vis = (el) => { try { return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }); } catch { return true; } };
    const host = [...document.querySelectorAll('[data-xui-scene="consoles/dashSysCslSetPControlFamilyTimer.xur"]')].at(-1);
    return { rows: [...host.querySelectorAll('[data-xui-class="XuiListItem"]')].filter(vis).map((e) => e.textContent.trim()),
      radios: ['radbtnDaily', 'radbtnWeekly', 'radbtnDisabled'].map((id) => (host.querySelector(`[data-xui-id="${id}"]`)?.textContent ?? '').trim()) };
  });
  check(timer.rows.length === 1 && timer.rows[0] === 'Family Timer is off',
    `${tag}lstTime is the single off row the code computes (count 1 at 0x921cb5e0, string 383 at 0x921cb4b0): ${JSON.stringify(timer.rows)}`);
  check(timer.radios.every((t) => t.length > 0), `${tag}and the three frequency radios carry their captions: ${JSON.stringify(timer.radios)}`);
  check((await shell()).codeFilled.some((x) => x.startsWith('lstTime x1 from computed')), `${tag}and the list says which code filled it`);
  await B();

  // The pass code pair: both scenes are `scRating`, which is the other half of
  // finding 2. Pushing the hint page used to take the pass-code page's scopes
  // with it and leave it blank on the way back.
  await Down(); await A();
  check(await at() === 'consoles/dashSysCslSetPControlPasscode.xur', `${tag}Set Pass Code opens, got ${await at()}`);
  const passBefore = ink(readPng(await shot('passcode-before')), BODY);
  await Down();                                            // btnPasscode -> navHintQ
  check((await shell()).focusId === 'navHintQ', `${tag}the chain is btnPasscode -> navHintQ, got ${(await shell()).focusId}`);
  await A();
  check(await at() === 'consoles/dashSysCslSetPControlPasscodeHint.xur', `${tag}navHintQ's PressPath opens the hint page, got ${await at()}`);
  const hints = await ev(() => document.querySelectorAll('[data-xui-id^="lstHintQ_item"]').length);
  check(hints === 5, `${tag}the hint list is the five questions from 0x92015320, got ${hints}`);
  await shot('passcode-hint');
  const popped = await A();
  check(await at() === 'consoles/dashSysCslSetPControlPasscode.xur', `${tag}A on a hint writes and pops, got ${await at()}`);
  sh = await shell();
  check(sh.settings.parental.passcodeHint === 0 && sh.selections.at(-1)?.includes('lstHintQ_item0 -> 0'),
    `${tag}the row index is the value: ${JSON.stringify(sh.selections.at(-1))}`);
  const passAfter = ink(readPng(await shot('passcode-after')), BODY);
  check(passAfter >= 0.9 * passBefore,
    `${tag}the pass-code page comes back painted after the hint page pops - both scenes are scRating: ${passAfter}% body ink against ${passBefore}% before the push, root ${JSON.stringify(popped)}`);
  console.log(`  ${tag}passcode pop: ${passAfter}% body ink (before ${passBefore}%), hint rows ${hints}`);
  await B();

  /* ---- 9h. The Time Zone list, driven by INDEX (it wraps). */

  await blade(5); await A(); await Down(4); await A(); await Down(2); await A();
  check(await at() === 'consoles/dashSysCslSetClockTimeZone.xur', `${tag}Time Zone opens, got ${await at()}`);
  const tz = await ev(() => [...document.querySelectorAll('[data-xui-id^="lstTimezone_item"]')].map((e) => e.textContent.trim()));
  check(tz.length === 75, `${tag}the list is the 75 records at 0x927bf680, got ${tz.length}`);
  const ixOf = (f) => Number(String(f).replace('lstTimezone_item', ''));
  check(ixOf((await shell()).focusId) === 24 && tz[24] === 'GMT+00 London',
    `${tag}it arrives on the console's own zone (f0059): ${(await shell()).focusId} = ${tz[ixOf((await shell()).focusId)]}`);
  await B();
  const wrote = [];
  for (const target of [0, 1, 74, 37]) {
    await A();
    const from = ixOf((await shell()).focusId);
    await Down((target - from + tz.length) % tz.length);    // the list wraps: drive it by index
    check(ixOf((await shell()).focusId) === target, `${tag}Down lands on row ${target}, got ${(await shell()).focusId}`);
    await A();
    sh = await shell();
    const lab = await ev(() => document.querySelector('[data-xui-id="labCurrentSettings"]')?.textContent.trim() ?? null);
    check(sh.settings.timeZone === target && sh.selections.at(-1) === `consoles/dashSysCslSetClockTimeZone.xur:lstTimezone_item${target} -> ${target}`,
      `${tag}row ${target} writes ${target}: ${JSON.stringify(sh.selections.at(-1))}`);
    check(lab === tz[target], `${tag}and the Clock menu's line is that row's own string: ${JSON.stringify(lab)} against ${JSON.stringify(tz[target])}`);
    wrote.push(`${target}=${lab}`);
  }
  console.log(`  ${tag}Time Zone by index: ${wrote.join(', ')} (of ${tz.length} rows)`);

  sh = await shell();
  const errs2 = await ev(() => window.__dash.errors);
  check(errs2.length === 0, `${tag}__dash.errors: ${errs2.join(' | ')}`);
  check(errs.length === 0, `${tag}page errors: ${errs.join(' | ')}`);
  check(sh.missingStrings.length === 0, `${tag}missing strings: ${JSON.stringify(sh.missingStrings)}`);
  check(sh.unresolvedPresses.length === 0, `${tag}unresolved presses: ${JSON.stringify(sh.unresolvedPresses)}`);
  await page.close();
}

/**
 * How much INK a window carries: the share of pixels (%) that stand more than
 * `t` luma off their own row's median. Polarity-free, so the same question can
 * be asked of the console's light text on a dark plate and of Blades' dark text
 * on a light one, and blind to which row is highlighted. Calibrated in §9e
 * against the failure state itself: with the page's root hidden - which is what
 * a popped sibling's teardown used to leave behind - this reads 0.00.
 */
function ink(im, w, t = 20) {
  let hit = 0, n = 0;
  for (let y = w.y; y < w.y + w.h; y++) {
    const row = [];
    for (let x = w.x; x < w.x + w.w; x++) row.push(luma(im, x, y));
    const med = [...row].sort((a, b) => a - b)[row.length >> 1];
    for (const v of row) { if (Math.abs(v - med) > t) hit++; n++; }
  }
  return Number((hit / n * 100).toFixed(2));
}

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

/**
 * §10. M3g: Judge E round 4's four findings, each closed with the measurement
 * that would have caught it.
 *
 *  1 (HIGH) the blade's own header and legends painted THROUGH every page the
 *    Games and Media blades pushed - the arcade home read "GamesGaLibrrary"
 *    with two X/Y disc pairs. `XuiSceneNavigateForward` (0x921534e8) puts the
 *    scene it came from into state !bStayVisible (0x9215369c-0x921536b0) and
 *    nothing in the build authors StayVisible, so the source scene always goes
 *    away; the source scene is the BLADE scene (`TabN/scBlade`,
 *    `Tab1/scMarketplace`, `Tab5/System`, `Tab6/scOOBE` - the five that author
 *    transition properties, where the panels author none), not the panel inside
 *    scContainer. Gated below on EVERY blade that pushes: exactly one header
 *    text and one legend set.
 *  2 (HIGH) System Info painted the factory-reset screen's authored prose where
 *    `dashSystemReset`'s init writes dashCSettingsStrings[545]. Gated on the
 *    painted body, and swept: no reachable page paints prose the code replaces.
 *  3 (MED) LiveVision's three choosers drew two rows stacked. A list windows on
 *    the axis its template's scroll ends point along; the chooser's are
 *    ScrollLeft / ScrollRight. Gated on the row boxes.
 *  4 (LOW) the B-carrier survey was wrong in both halves. Gated in the unit
 *    tests over the whole corpus; the reachable half is the backCarrier gate
 *    the B helper already runs on every pop.
 *
 * Plus the two things the judge could not verify: the origin sweep of every
 * System-blade page (its Chrome died after 12), and whether the doubled chrome
 * reached `oobe/oobeProfileCreation`, which authors no header of its own.
 */
async function m3g(browser) {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
  const tag = '[m3g] ';
  const ev = (f, ...a) => page.evaluate(f, ...a);
  const shell = () => ev(() => JSON.parse(JSON.stringify(window.__dash.shell)));
  const at = () => ev(() => window.__dash.shell.stack.at(-1));
  const depth = () => ev(() => window.__dash.shell.stack.length);
  const step = (n) => ev((n) => window.__dashApi.stepFrames(n), n);
  const idle = () => ev(() => window.__dashApi.shell.idle());
  const A = async () => { await ev(() => window.__dashApi.shell.press()); await idle(); await step(60); await idle(); };
  const B = async () => { await ev(() => window.__dashApi.shell.back()); await step(60); await idle(); };
  const Down = async (n = 1) => { for (let i = 0; i < n; i++) { await ev(() => window.__dashApi.shell.move('Down')); await step(21); } await idle(); };
  const seek = async (t) => { await ev((t) => window.__dashApi.shell.seekRest(t), t); await step(5); await idle(); };

  /**
   * The chrome census, in DESIGN pixels: every painted text leaf in the header
   * band (y 85..150, where all 187 full-canvas pages and all five blades author
   * theirs) and in the legend band (y 600..700), wherever in the tree it lives,
   * plus the legend GLYPH art (the discs are <svg>/<img>, not text). Deliberately
   * not scoped to the top scene: the whole point of the finding is a second
   * scene painting into the same band.
   */
  const census = () => ev(() => {
    const canvas = document.querySelector('.xui-canvas');
    const cr = canvas.getBoundingClientRect();
    const sx = cr.width / 1120, sy = cr.height / 770;
    const vis = (el) => { try { return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }); } catch { return true; } };
    const box = (e) => { const r = e.getBoundingClientRect(); return { x: +((r.left - cr.left) / sx).toFixed(1), y: +((r.top - cr.top) / sy).toFixed(1), w: +(r.width / sx).toFixed(1), h: +(r.height / sy).toFixed(1) }; };
    const paints = [], art = [];
    for (const e of document.querySelectorAll('[data-xui-paint]')) {
      if (!vis(e)) continue;
      const b = box(e); if (b.w <= 0 || b.h <= 0) continue;
      const owner = e.closest('[data-xui-id]');
      const chain = [];
      for (let n = owner; n; n = n.parentElement && n.parentElement.closest('[data-xui-id]')) chain.push(n.dataset.xuiId);
      paints.push({ ...b, id: owner ? owner.dataset.xuiId : null, chain, text: (e.textContent ?? '').replace(/\s+/g, ' ').trim() });
    }
    for (const e of document.querySelectorAll('[data-xui-id]')) {
      if (!vis(e) || !e.querySelector(':scope > svg, :scope > img')) continue;
      const b = box(e); if (b.w <= 0 || b.h <= 0) continue;
      art.push({ ...b, id: e.dataset.xuiId });
    }
    const body = (document.body.innerText ?? '').replace(/\s+/g, ' ');
    return { paints, art, body };
  });
  // A header is a paint leaf under the skin's `Label_Head` visual: the five
  // blade headers and all 187 full-canvas pages' own headers wear exactly that,
  // and nothing else does.
  const header = (c) => c.paints.filter((p) => p.text && p.chain.includes('Label_Head'));
  const legendGlyphs = (c) => c.art.filter((a) => a.y >= 600 && a.y <= 700);
  const legendText = (c) => c.paints.filter((p) => p.y >= 600 && p.y <= 700 && p.text);

  /* ---- 10a. Finding 1: one header, one legend set, on every blade that pushes. */

  // The console's reference for this is [FRAME 6717 f0053], the Console
  // Settings page: ONE header ("Console Settings") and ONE legend set. Every
  // blade has to look like that.
  const pushes = [
    { tab: 3, rows: 2, want: 'arcade/2500_LiveArcadeHome.xur', headerText: 'Games Library', bladeHeader: 'Games' },
    // oobeProfileCreation authors NO header of its own, which is the case the
    // judge could not check: before this it drew the Games blade's "Games" and
    // a second set of legend discs over its own four.
    { tab: 3, rows: 1, want: 'oobe/oobeProfileCreation.xur', headerText: null, bladeHeader: 'Games' },
    { tab: 4, rows: 1, want: 'dashcomm/MediaSourceSelection.xur', headerText: 'Select Source', bladeHeader: 'Media' },
    { tab: 5, rows: 0, want: 'consoles/dashSysCslSet.xur', headerText: 'Console Settings', bladeHeader: 'System' },
  ];
  for (const p of pushes) {
    await page.goto(`${BASE}/?blade=${p.tab}&zoom=1.5&boot=none&mute&manual`, { waitUntil: 'networkidle0', timeout: 90000 });
    await page.waitForFunction(() => document.body.dataset.ready === 'true', { timeout: 90000 });
    const before = await census();
    check(header(before).length === 1 && header(before)[0].text === p.bladeHeader,
      `${tag}tab${p.tab} at rest paints its own header once: ${JSON.stringify(header(before).map((h) => h.text))}`);
    const gBefore = legendGlyphs(before).length;
    check(gBefore === 4, `${tag}tab${p.tab} at rest paints four legend glyphs, got ${gBefore}`);
    if (p.rows) await Down(p.rows);
    await A();
    check(await at() === p.want, `${tag}tab${p.tab} pushes ${p.want}, got ${await at()}`);
    const c = await census();
    const h = header(c), g = legendGlyphs(c), lt = legendText(c);
    check(h.length === (p.headerText ? 1 : 0),
      `${tag}${p.want}: exactly ${p.headerText ? 'one' : 'no'} header is painted, got ${JSON.stringify(h.map((x) => `${x.text}@(${x.x},${x.y})`))}`);
    if (p.headerText) {
      // The authored frame is (156,96) and §9a gates it exactly, through the
      // offset chain; this is a client rect on a 1.5x canvas, so it is the same
      // number within a rounded pixel.
      check(h[0].text === p.headerText && Math.abs(h[0].x - 156) <= 1.5 && Math.abs(h[0].y - 96) <= 1.5,
        `${tag}${p.want}: the header is the PAGE's, at its authored (156,96): ${JSON.stringify(h[0])}`);
    }
    check(g.length === 4, `${tag}${p.want}: exactly four legend glyphs, got ${g.length} - ${JSON.stringify(g.map((x) => `${x.id}@(${x.x},${x.y})`))}`);
    // and the blade's own header is gone, not merely covered
    check(!h.some((x) => x.text === p.bladeHeader) || p.headerText === p.bladeHeader,
      `${tag}${p.want}: the blade header "${p.bladeHeader}" must not still be painted`);
    const selects = lt.filter((x) => x.text === 'Select').length;
    check(selects <= 1, `${tag}${p.want}: "Select" appears once in the legend band, got ${selects}`);
    console.log(`  ${tag}tab${p.tab} + ${p.want}: headers ${JSON.stringify(h.map((x) => x.text))}, glyphs ${g.length}, legend text ${JSON.stringify(lt.map((x) => x.text))}`);
    // B restores the blade: its header and its four glyphs come back.
    await B();
    const after = await census();
    check(header(after).length === 1 && header(after)[0].text === p.bladeHeader && legendGlyphs(after).length === 4,
      `${tag}tab${p.tab}: B brings the blade's own chrome back (TransBackTo=FadeIn): ${JSON.stringify(header(after).map((x) => x.text))} / ${legendGlyphs(after).length} glyphs`);
  }

  /* ---- 10b. Finding 2 + the origin sweep: every page the System blade reaches. */

  await page.goto(`${BASE}/?blade=5&zoom=1.5&boot=none&mute&manual`, { waitUntil: 'networkidle0', timeout: 90000 });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', { timeout: 90000 });

  // The one authored Text in the build that the console's code replaces. A
  // sweep of every authored Text of 40+ characters over all 263 scenes found no
  // other whose prose belongs to a different screen (dashboards/blades/
  // systemInfo.ts, CODE_WRITTEN_TEXT), so this list is the gate.
  const CODE_WRITTEN = [
    'Do you want to reset your console? This will restore all console settings to factory defaults. Data on storage devices will not be affected.',
  ];
  // Where a pushed page is MOUNTED, in design pixels: the `[data-xui-scene]`
  // element renderInto makes, which is the page's own XuiCanvas. The scene
  // INSIDE it is not always at (0,0) of its canvas - four of these pages author
  // `Position` (-1,-1) or (0,-1) on their scene root - so the canvas is what
  // "hosted at the origin" means, and the scene's own offset is reported with
  // it rather than asserted away.
  const rootOrigin = () => ev(() => {
    const canvas = document.querySelector('.xui-canvas');
    const id = window.__dash.shell.stack.at(-1);
    if (id.includes('#')) return null;                 // level 0 is inside dashmain
    const host = [...document.querySelectorAll(`[data-xui-scene="${id}"]`)].at(-1);
    if (!host) return null;
    let x = 0, y = 0, n = host;
    while (n && n !== canvas) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    const root = host.firstElementChild;
    return { id, x, y, w: host.offsetWidth, h: host.offsetHeight,
      scene: root ? { x: root.offsetLeft, y: root.offsetTop, w: root.offsetWidth, h: root.offsetHeight } : null };
  });
  const seen = new Map();
  const visit = async (budget) => {
    const id = await at();
    const c = await census();
    for (const prose of CODE_WRITTEN) {
      check(!c.body.includes(prose),
        `${tag}${id}: paints prose the console's code replaces: "${prose.slice(0, 48)}..."`);
    }
    const h = header(c), g = legendGlyphs(c);
    check(h.length <= 1, `${tag}${id}: at most one header is painted, got ${JSON.stringify(h.map((x) => x.text))}`);
    check(g.length <= 4, `${tag}${id}: at most one legend set is painted, got ${g.length} glyphs`);
    const o = await rootOrigin();
    if (!seen.has(id)) seen.set(id, o);
    if (o) {
      check(o.x === 0 && o.y === 0 && o.w === 1120 && o.h === 770,
        `${tag}${id}: a pushed page is hosted on the whole canvas at its origin, got ${JSON.stringify(o)}`);
    }
    if (budget <= 0) return;
    const base = await depth();
    let last = null;
    for (let k = 0; k < 24; k++) {
      const f = (await shell()).focusId;
      if (f !== null && f === last) break;              // the nav chain clamped
      last = f;
      await A();
      const d = await depth();
      if (d > base) {
        await visit(budget - 1);
        while ((await depth()) > base) await B();
      } else if (d < base) {
        return;                 // an option row wrote and popped this page
      }
      await Down();
    }
  };
  await visit(5);
  const pages = [...seen.keys()];
  check(pages.length >= 40,
    `${tag}the System blade reaches ${pages.length} pages (Judge E round 4 measured 12 of 40 before its Chrome died): ${JSON.stringify(pages)}`);
  const offset = [...seen.entries()].filter(([, v]) => v && !(v.x === 0 && v.y === 0 && v.w === 1120 && v.h === 770));
  check(offset.length === 0, `${tag}every pushed page is at (0,0): offenders ${JSON.stringify(offset)}`);
  const authored = [...seen.entries()].filter(([, v]) => v && v.scene && (v.scene.x !== 0 || v.scene.y !== 0));
  console.log(`  ${tag}origin sweep: ${pages.length} System-blade pages, every mount at (0,0) 1120x770; ${authored.length} author a scene Position of their own (${JSON.stringify(authored.map(([k, v]) => `${k.split('/').pop()} (${v.scene.x},${v.scene.y})`))})`);

  /* ---- 10c. Finding 2: what System Info paints instead. */

  await page.goto(`${BASE}/?blade=5&zoom=1.5&boot=none&mute&manual`, { waitUntil: 'networkidle0', timeout: 90000 });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', { timeout: 90000 });
  await A();                                     // Console Settings
  await Down(10);                                // row 10: System Info
  await A();
  check(await at() === 'consoles/dashSysCslSetPolicyInfo_System.xur', `${tag}row 10 opens System Info, got ${await at()}`);
  const info = await ev(() => {
    const e = [...document.querySelectorAll('[data-xui-id="edInfo"]')].pop();
    return e ? (e.textContent ?? '') : null;
  });
  check(info !== null, `${tag}System Info paints edInfo`);
  if (info === null) { await page.close(); return; }
  check(!info.includes('Do you want to reset your console'),
    `${tag}edInfo must not paint the factory-reset screen's authored prose`);
  check(info.startsWith('Console Serial Number:'),
    `${tag}edInfo is dashCSettingsStrings[545], which opens "Console Serial Number:": ${JSON.stringify(info.slice(0, 40))}`);
  check(info.includes('Console ID:') && info.includes('© 2008 Microsoft Corporation')
    && info.includes('Xbox 360') && info.includes('Warning: This computer program is protected by copyright law')
    && info.includes('D:'),
    `${tag}edInfo carries every field of string 545, with the code's own 2008: ${JSON.stringify(info.slice(0, 120))}`);
  const sh10 = await shell();
  const gaps = sh10.hardwareState.filter((x) => x.includes(':edInfo'));
  check(gaps.length === 3,
    `${tag}the three fields the archive cannot supply are disclosed, got ${JSON.stringify(gaps)}`);
  check(sh10.codeFilled.some((x) => x.includes('dashCSettingsStrings[545]')),
    `${tag}codeFilled names the string and the branch: ${JSON.stringify(sh10.codeFilled.filter((x) => x.includes('edInfo')))}`);
  check(sh10.missingStrings.length === 0, `${tag}missing strings: ${JSON.stringify(sh10.missingStrings)}`);
  console.log(`  ${tag}System Info edInfo: ${JSON.stringify(info.replace(/\s+/g, ' ').slice(0, 90))}...`);
  await B(); await B();

  /* ---- 10d. Finding 3: LiveVision's three choosers draw ONE row each. */

  await page.goto(`${BASE}/?scene=consoles/dashSysLiveVision.xur&zoom=1.5&mute&manual&design`, { waitUntil: 'networkidle0', timeout: 90000 });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', { timeout: 90000 });
  const chooser = (id) => ev((id) => {
    const canvas = document.querySelector('.xui-canvas');
    const cr = canvas.getBoundingClientRect(); const sx = cr.width / 1120, sy = cr.height / 770;
    const vis = (el) => { try { return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }); } catch { return true; } };
    const host = document.querySelector(`[data-xui-id="${id}"]`);
    if (!host) return null;
    const rows = [...host.querySelectorAll(`[data-xui-id^="${id}_item"]`)].map((e) => {
      const r = e.getBoundingClientRect();
      return { id: e.dataset.xuiId, vis: vis(e), x: +((r.left - cr.left) / sx).toFixed(1), y: +((r.top - cr.top) / sy).toFixed(1), w: +(r.width / sx).toFixed(1), h: +(r.height / sy).toFixed(1), text: (e.textContent ?? '').trim() };
    });
    return { rows, shown: rows.filter((r) => r.vis) };
  }, id);
  for (const [id, first, second] of [
    ['BrightnessSetting', 'Auto (Default)', 'Dark Wall'],
    ['LightingSetting', 'Auto (Default)', 'Incandescent'],
    ['FlickerSetting', 'Auto (Default)', 'On'],
  ]) {
    const c = await chooser(id);
    check(c !== null, `${tag}${id} is on the LiveVision page`);
    check(c.shown.length === 1,
      `${tag}${id} draws ONE value, not a stack: ${JSON.stringify(c.shown.map((r) => `${r.text}@(${r.x},${r.y})`))}`);
    check(c.shown[0].text === first && c.shown[0].w === 419,
      `${tag}${id}'s row is the template's 419-wide span carrying "${first}": ${JSON.stringify(c.shown[0])}`);
    check(!c.rows.some((r) => r.vis && r.text === second),
      `${tag}${id} must not paint "${second}" under "${first}"`);
    console.log(`  ${tag}${id}: ${JSON.stringify(c.shown.map((r) => `${r.text} ${r.w}x${r.h}@(${r.x},${r.y})`))}`);
  }
  // The Family Timer's spinner is the build's other horizontal list and it must
  // not move: one 373-wide row, the number Judge E round 4 verified.
  await page.goto(`${BASE}/?scene=consoles/dashSysCslSetPControlFamilyTimer.xur&zoom=1.5&mute&manual&design`, { waitUntil: 'networkidle0', timeout: 90000 });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', { timeout: 90000 });
  const timer = await chooser('lstTime');
  check(timer.shown.length === 1 && timer.shown[0].w === 373,
    `${tag}the Family Timer spinner is unchanged - one row, 373 wide: ${JSON.stringify(timer.shown)}`);

  const errs2 = await page.evaluate(() => window.__dash.errors);
  check(errs2.length === 0, `${tag}__dash.errors: ${errs2.join(' | ')}`);
  check(errs.length === 0, `${tag}page errors: ${errs.join(' | ')}`);
  await page.close();
}

/**
 * §11. M3h: the two gates Judge E round 5 asked for, run over EVERY page the
 * drive reaches, not over the handful §8 walks by input.
 *
 * 11a. NO PAINTED AUTHORING TOKEN, searched anywhere inside a caption. The old
 *      detector - here, in the walk and in the shell - was the anchored
 *      `/^<...>$/`, which reads "0 painted tokens" over
 *      `memory/DeviceSelector#labTotal` ("<#> of <Total #>") and
 *      `arcade/2504_TitleOptionsScene#lblRatingText`. Both were on screen.
 * 11b. NO TWO VISIBLE CONTROLS PAINTING AT ONE DESIGN POINT, unless the
 *      console draws them that way. `2504` stacked its MUA and MUB
 *      memory-unit glyphs at (940.679, 95.802) with no memory unit attached;
 *      that is now the code's own answer (all five indicators down). The one
 *      pair that survives is `2502_TwistSelectorScene`'s two `btnX` legend
 *      discs, and they are the console's: `Arcade::CTwistSelectorScene` shows
 *      the SCENE's btnX (this+2224, 0x922243a4-0x922243b4, hidden at
 *      0x92224478) while `Arcade::CTitleSelectorScene` owns Tab1's own btnX
 *      (this+2212) and only ever enables and captions it
 *      (0x9221e4e4 Enable, 0x9221e520 SetText) - it never hides it.
 *
 * 11c. HIDDEN WHERE THE CONSOLE HIDES, PAINTED-AND-EMPTY WHERE IT BLANKS
 *      [Judge E round 6, residual 2]. Same pixels, different instruction, and
 *      the DOM has to say which one ran: `memory/DeviceSelector#labTotal` and
 *      `2504`'s `grfxBackground` are `Show(x, FALSE)` in the code, so they end
 *      display:none with their authored text still in them, while
 *      `lblRatingText` is a `SetText(L"")` and ends visible and empty.
 *
 * The pages are pushed rather than walked to: `push` is the same code path a
 * press resolves to (`fill` -> `hideWhatTheConsoleHides` ->
 * `discloseHardwareState` -> `arrive`), so the clear and the hides run exactly
 * as they do under input, and 50 pages cost
 * one browser instead of a 447-screen tree walk.
 */
async function m3h(browser) {
  const tag = '[m3h] ';
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/?mute&manual&blade=5`, { waitUntil: 'networkidle0', timeout: 90000 });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', { timeout: 90000 });

  const settle = async () => {
    await page.evaluate(() => window.__dashApi.stepFrames(30));
    await page.evaluate(() => window.__dashApi.shell.idle());
  };
  const scan = () => page.evaluate(() => {
    const vis = (el) => { try { return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }); } catch { return true; } };
    const canvas = document.querySelector('.xui-canvas');
    const cr = canvas.getBoundingClientRect();
    const sx = cr.width / 1120, sy = cr.height / 770;
    const inked = (p) => vis(p) && (p.dataset.xuiPaint !== 'text' || !!(p.textContent ?? '').trim());
    // (a) every angle-bracket token painted anywhere on screen
    const tokens = [];
    for (const p of document.querySelectorAll('[data-xui-paint]')) {
      if (!inked(p)) continue;
      const owner = p.closest('[data-xui-id]');
      if (!owner || !vis(owner)) continue;
      const hit = (p.textContent ?? '').match(/<[^<>\r\n]{1,40}>/g);
      if (hit) tokens.push(`${owner.dataset.xuiId}: ${hit.join(' ')}`);
    }
    // (b) two visible controls at ONE authored box. The key is the control's
    // own design box to the unit, not its ink: 2504's MUA and MUB are authored
    // at the same (940.679, 95.802) and their glyphs land a pixel apart, so a
    // gate on painted ink alone walks straight past them.
    const at = new Map();
    for (const e of document.querySelectorAll('[data-xui-id]')) {
      if (!vis(e)) continue;
      // A visual template's internals repeat by design (every list row is the
      // same figure at the same local offset); only page controls count.
      if (e.parentElement?.closest('[data-xui-visual]')) continue;
      if (![...e.querySelectorAll('[data-xui-paint]')].some(inked)) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const k = `${Math.round((r.left - cr.left) / sx)},${Math.round((r.top - cr.top) / sy)} `
        + `${Math.round(r.width / sx)}x${Math.round(r.height / sy)}`;
      const bag = at.get(k) ?? at.set(k, []).get(k);
      bag.push({ n: `${e.dataset.xuiClass}#${e.dataset.xuiId}`, e });
    }
    const stacked = [];
    for (const [k, v] of at) {
      // A control nested inside another is not "stacked on" it.
      const outer = v.filter((a) => !v.some((b) => b.e !== a.e && b.e.contains(a.e)));
      if (outer.length > 1) stacked.push({ where: k, who: outer.map((x) => x.n).join(' | ') });
    }
    return { tokens, stacked, top: window.__dash.shell.stack.at(-1) };
  });

  let swept = 0, stacks = 0, tokensSeen = 0;
  for (const id of REACHED_PAGES) {
    const ok = await page.evaluate((id) => window.__dashApi.shell.push(id), id);
    await settle();
    check(ok === true, `${tag}${id} did not mount`);
    if (ok) {
      const d = await scan();
      swept++;
      check(d.top === id, `${tag}pushed ${id}, top is ${d.top}`);
      tokensSeen += d.tokens.length;
      check(d.tokens.length === 0, `${tag}${id} paints an authoring token: ${JSON.stringify(d.tokens)}`);
      const allowed = STACKED_BY_THE_CONSOLE[id] ?? [];
      for (const s of d.stacked) {
        stacks++;
        check(allowed.includes(s.who),
          `${tag}${id} paints two controls at one design point ${s.where}: ${s.who}`);
      }
      await page.evaluate(() => window.__dashApi.shell.back());
      await page.evaluate(() => window.__dashApi.stepFrames(60));
      await page.evaluate(() => window.__dashApi.shell.idle());
    }
  }
  check(swept === REACHED_PAGES.length, `${tag}swept ${swept} of ${REACHED_PAGES.length} pages`);
  console.log(`  ${tag}${swept} pages swept, ${tokensSeen} painted token(s), ${stacks} stacked pair(s), all of them the console's own`);

  // 11c. The two the judge caught, disclosed with the address that fills or
  // hides each - a blank caption has to say WHY it is blank - and the DOM
  // saying WHICH instruction ran [Judge E round 6, residual 2].
  const sh = await page.evaluate(() => window.__dash.shell);
  for (const [key, addr] of [
    // The HIDES read "<scene>: <ids> hidden - ...", the BLANK reads "<scene>:<id> <text>".
    ['memory/DeviceSelector.xur: labTotal / labDots hidden', '0x9225ad08'],
    ['arcade/2504_TitleOptionsScene.xur:lblRatingText', '0x9221ccd0'],
    ['arcade/2504_TitleOptionsScene.xur: grfxBackground hidden', '0x9221ca3c'],
    ['consoles/dashSysCslSetStartUp.xur: btnIPTV hidden', '0x921c9308'],
  ]) {
    const line = sh.hardwareState.find((x) => x.startsWith(key));
    check(!!line && line.includes(addr),
      `${tag}${key} is disclosed with the console rule (${addr}): ${JSON.stringify(line ?? null)}`);
  }
  // and none of the four hidden ones is disclosed as a CLEAR as well: a hide
  // and a blank are different instructions and only one of them ran.
  for (const key of ['memory/DeviceSelector.xur:labTotal', 'consoles/dashSysCslSetStartUp.xur:btnIPTV']) {
    check(!sh.hardwareState.some((x) => x.startsWith(`${key} `)),
      `${tag}${key} is not ALSO reported as a cleared token: ${JSON.stringify(sh.hardwareState.filter((x) => x.startsWith(key)))}`);
  }
  // The measurement itself, on the pages that own the three controls.
  const probe = async (id, sel) => {
    await page.evaluate((s) => window.__dashApi.shell.push(s), id);
    await settle();
    const got = await page.evaluate((s) => {
      const vis = (el) => { try { return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }); } catch { return true; } };
      const scenes = [...document.querySelectorAll(`[data-xui-scene="${s.scene}"]`)];
      const host = scenes[scenes.length - 1] ?? document;
      // A hidden control has NO client rect (display:none), so its identity is
      // read off the design box the renderer wrote into the style.
      return [...host.querySelectorAll(`[data-xui-id="${s.id}"]`)].map((e) => ({
        shown: vis(e), text: (e.textContent ?? '').replace(/\s+/g, ' ').trim(),
        box: `${parseFloat(e.style.left)},${parseFloat(e.style.top)} ${parseFloat(e.style.width)}x${parseFloat(e.style.height)}`,
        parent: e.parentElement?.closest('[data-xui-id]')?.dataset.xuiId ?? '(scene)',
      }));
    }, sel);
    await page.evaluate(() => window.__dashApi.shell.back());
    await page.evaluate(() => window.__dashApi.stepFrames(60));
    await page.evaluate(() => window.__dashApi.shell.idle());
    return got;
  };
  const total = await probe('memory/DeviceSelector.xur', { scene: 'memory/DeviceSelector.xur', id: 'labTotal' });
  check(total.length === 1 && total[0].shown === false && total[0].text === '<#> of <Total #>' && total[0].box === '155,573 420x40',
    `${tag}labTotal is HIDDEN with its authored caption intact, not blanked in place at (155, 573) 420x40 (0x9225ad08): ${JSON.stringify(total)}`);
  const rating = await probe('arcade/2504_TitleOptionsScene.xur', { scene: 'arcade/2504_TitleOptionsScene.xur', id: 'lblRatingText' });
  check(rating.length === 1 && rating[0].shown === true && rating[0].text === '',
    `${tag}lblRatingText is PAINTED AND EMPTY, which is what SetText(L"") at 0x92001cd4 leaves: ${JSON.stringify(rating)}`);
  const frame = await probe('arcade/2504_TitleOptionsScene.xur', { scene: 'arcade/2504_TitleOptionsScene.xur', id: 'grfxBackground' });
  check(frame.length === 2 && frame.filter((f) => f.shown).length === 1,
    `${tag}2504 authors two grfxBackground and exactly one is down - the rating pane's frame the no-rating arm hides at 0x9221ccd0, not scnTitle's: ${JSON.stringify(frame)}`);
  const down = frame.find((f) => !f.shown);
  check(down?.box === '144,428 405x165' && down?.parent === 'Scene_Main',
    `${tag}and the hidden one is the scene's own 405x165 frame at (144, 428), not scnTitle's: ${JSON.stringify(frame)}`);
  // 11d. 2504's five storage-device indicators, all down with no title.
  await page.evaluate(() => window.__dashApi.shell.push('arcade/2504_TitleOptionsScene.xur'));
  await settle();
  const mu = await page.evaluate(() => {
    const vis = (el) => { try { return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }); } catch { return true; } };
    return ['HD', 'MUA', 'MUB', 'OD', 'BuiltInMU'].map((id) => {
      const els = [...document.querySelectorAll(`[data-xui-id="${id}"]`)];
      return { id, n: els.length, shown: els.filter(vis).length };
    });
  });
  check(mu.every((m) => m.n > 0), `${tag}2504 authors all five storage-device indicators: ${JSON.stringify(mu)}`);
  check(mu.every((m) => m.shown === 0),
    `${tag}with no title selected the console shows none of HD/MUA/MUB/OD/BuiltInMU (0x9221c558, 0x9221c5e8): ${JSON.stringify(mu)}`);
  const sh2 = await page.evaluate(() => window.__dash.shell);
  check(sh2.hardwareState.some((x) => x.includes('2504_TitleOptionsScene.xur: HD / MUA / MUB / OD / BuiltInMU hidden')),
    `${tag}the hide is disclosed: ${JSON.stringify(sh2.hardwareState.filter((x) => x.includes('2504')).slice(0, 2))}`);
  await page.evaluate(() => window.__dashApi.shell.back());
  await page.evaluate(() => window.__dashApi.stepFrames(60));

  const errs2 = await page.evaluate(() => window.__dash.errors);
  check(errs2.length === 0, `${tag}__dash.errors: ${errs2.join(' | ')}`);
  check(errs.length === 0, `${tag}page errors: ${errs.join(' | ')}`);
  await page.close();
}
