// The launcher, mounted for real, checked against window.__dash and
// window.__launcher.
//
// Gates: the page is the Blades chrome (dashmain rendered through the runtime,
// no errors, nothing missing, nothing unresolved); the Xbox 360 logo's src is
// a manifest entry; both rows wear the skin's own visual; the arrival focus
// is silent and a Right is not (btn_Focus fires out of the visual's keyframe);
// Right then Enter navigates to ?build=9199 through the real keyboard path;
// and the compositor stays under the budget smoke-boot holds the dashboards
// to at a Retina laptop window.
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

  /* --------------------------------------------- 1. deterministic: &manual */

  // The clock is the harness's: the boot range is stepped by hand, so every
  // state below is a frame count, never a wait.
  const m = await load(browser, `${BASE}/?launcher&manual&mute`, 1280, 720);
  check(m.pageErrors.length === 0, `page errors: ${m.pageErrors.join(' | ')}`);
  check(m.consoleErrors.length === 0, `console errors: ${m.consoleErrors.join(' | ')}`);
  const d = m.dash;
  check(!!d, 'window.__dash was never created');
  if (d) {
    check(d.scene === 'dashmain/dashmain.xur', `__dash.scene is ${d.scene}, expected the Blades chrome`);
    check(d.canvas.w === 1120 && d.canvas.h === 770, `canvas is ${d.canvas.w}x${d.canvas.h}`);
    check(d.errors.length === 0, `errors: ${d.errors.join(' | ')}`);
    check(d.missingImages.length === 0, `missing images: ${d.missingImages.join(', ')}`);
    check(d.unresolvedVisuals.length === 0, `unresolved visuals: ${d.unresolvedVisuals.join(', ')}`);
    check(d.unknownClasses.length === 0, `unknown classes: ${d.unknownClasses.join(', ')}`);
    check(d.placeholders.length === 0, `placeholders: ${d.placeholders.join(' | ')}`);
  }
  const s0 = await state(m.page);
  check(s0.booted === 'BootLive', `boot range is ${s0.booted}, expected BootLive`);
  check(!s0.armed, 'the rows took input before the boot range landed');
  check(s0.logo?.manifest === 'dashcomm/xboxLogo.png',
    `the logo is ${s0.logo?.manifest ?? 'nothing'} (${s0.logo?.src ?? ''}), expected the manifest's dashcomm/xboxLogo.png`);
  check(s0.choices.length === 2, `${s0.choices.length} rows, expected one per build`);
  check(s0.choices.every((c) => c.visual === 'btn_1line_icon'),
    `rows wear ${s0.choices.map((c) => c.visual).join(', ')}, expected the skin's btn_1line_icon`);
  check(s0.choices.map((c) => c.build).join(',') === '6770,9199', `rows are ${s0.choices.map((c) => c.build).join(',')}`);

  // BootLive is 462..533: 71 frames land it, and its own keyframe fires the
  // console's dash_2ndLevelClose on 497. One more frame arms the rows.
  await m.page.evaluate(() => window.__launcher.stepFrames(72));
  const s1 = await state(m.page);
  const d1 = await m.read();
  check(s1.armed, 'the boot range did not land after 72 frames');
  check(s1.index === 0 && s1.focusId === 'launch6770', `arrival focus is ${s1.focusId}`);
  check(s1.choices[0].state === 'InitFocus', `arrival state is ${s1.choices[0].state}, expected the silent InitFocus`);
  const bootCue = d1.cues.find((c) => c.cue === 'dash_2ndLevelClose');
  check(bootCue?.tick === 497, `dash_2ndLevelClose fired on ${bootCue?.tick ?? 'no'} frame, expected 497 from BootLive's own timeline`);
  check(!d1.cues.some((c) => c.cue === 'btn_Focus'), 'InitFocus fired btn_Focus; the console arrives silently');

  // Right moves to NXE: KillFocus on Blades, Focus on NXE, btn_Focus on frame 15.
  await m.page.evaluate(() => { window.__launcher.press('Right'); window.__launcher.stepFrames(16); });
  const s2 = await state(m.page);
  const d2 = await m.read();
  check(s2.index === 1 && s2.focusId === 'launch9199', `after Right focus is ${s2.focusId}`);
  check(s2.choices[1].state === 'Focus', `NXE row state is ${s2.choices[1].state}`);
  check(s2.choices[0].state === 'KillFocus', `Blades row state is ${s2.choices[0].state}, expected KillFocus`);
  check(d2.cues.some((c) => c.cue === 'btn_Focus'), 'Right did not fire btn_Focus out of btn_1line_icon\'s Focus keyframe');
  // Up wraps back, Down returns; Left/Right and Up/Down are the same axis here.
  await m.page.evaluate(() => { window.__launcher.press('Up'); window.__launcher.stepFrames(2); });
  check((await state(m.page)).index === 0, 'Up did not move focus back to Blades');
  await m.page.evaluate(() => { window.__launcher.press('Down'); window.__launcher.stepFrames(2); });
  check((await state(m.page)).index === 1, 'Down did not move focus to NXE');

  // A: Press on the focused row, btn_Select from its keyframe, and the page
  // leaves for ?build=9199 when the 13-frame Press range has run.
  await m.page.evaluate(() => { window.__launcher.press('A'); window.__launcher.stepFrames(1); });
  const s3 = await state(m.page);
  const d3 = await m.read();
  check(s3.going === '9199', `A committed to ${s3.going}`);
  check(s3.choices[1].state === 'Press', `NXE row state is ${s3.choices[1].state}, expected Press`);
  check(d3.cues.some((c) => c.cue === 'btn_Select'), 'A did not fire btn_Select out of the Press keyframe');
  const nav = m.page.waitForNavigation({ timeout: 20000 }).then(() => true).catch(() => false);
  await m.page.evaluate(() => window.__launcher.stepFrames(13)).catch(() => { /* the page is leaving */ });
  check(await nav, 'the Press range ended and the page did not navigate');
  const url = new URL(m.page.url());
  check(url.searchParams.get('build') === '9199', `navigated to ${url.search}, expected ?build=9199`);
  await m.close();

  /* ------------------------------------- 2. the bare `/`, on the real clock */

  const live = await load(browser, `${BASE}/`, 1280, 720);
  check(live.pageErrors.length === 0, `bare / page errors: ${live.pageErrors.join(' | ')}`);
  await live.page.waitForFunction(() => window.__launcher?.state().armed, { timeout: 20000 })
    .catch(() => check(false, 'bare /: the boot range never landed on the wall clock'));
  await live.shot(`${OUT}/launcher.png`);
  // The real keyboard path: ArrowRight then Enter, through the InputRouter.
  await live.page.keyboard.press('ArrowRight');
  await live.page.waitForFunction(() => window.__launcher?.state().index === 1, { timeout: 5000 })
    .catch(() => check(false, 'bare /: ArrowRight did not move focus'));
  const liveNav = live.page.waitForNavigation({ timeout: 20000 }).then(() => true).catch(() => false);
  await live.page.keyboard.press('Enter');
  check(await liveNav, 'bare /: Enter did not navigate');
  check(new URL(live.page.url()).searchParams.get('build') === '9199', `bare /: landed on ${new URL(live.page.url()).search}`);
  await live.close();

  /* ------------------------------------ 3. the compositor at a Retina window */

  const big = await load(browser, `${BASE}/`, 2000, 1196, 2);
  await big.page.waitForFunction(() => window.__launcher?.state().armed, { timeout: 20000 }).catch(() => {});
  await big.shot(`${OUT}/launcher-2x.png`);
  const layers = await big.layers();
  const mb = layers.reduce((s, l) => s + l.width * l.height, 0) * 4 * 4 / 1e6;
  console.log(`  compositor at 2000x1196@2x: ${layers.length} layers, ~${mb.toFixed(0)} MB of tiles`);
  check(layers.length <= 24, `${layers.length} compositor layers (budget 24)`);
  check(mb <= 260, `~${mb.toFixed(0)} MB of tiles at 2000x1196@2x (budget 260)`);
  await big.close();

  if (d) console.log(`  ${d.objects} objects, ${d.controls} controls, logo ${s0.logo?.manifest}`);
  console.log(`  wrote ${OUT}/launcher.png (1280x720) and ${OUT}/launcher-2x.png (2000x1196@2x)`);
} catch (err) {
  fails.push(`threw: ${err instanceof Error ? err.stack : String(err)}`);
} finally {
  if (browser) await browser.close();
}

if (fails.length) { for (const f of fails) console.error('  FAIL ' + f); console.log('SMOKE_FAIL'); process.exit(1); }
console.log('SMOKE_PASS');

async function state(page) {
  return page.evaluate(() => JSON.parse(JSON.stringify(window.__launcher.state())));
}

async function load(browser, url, width, height, deviceScaleFactor = 1) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor });
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => document.body.dataset.ready === 'true' || !!document.querySelector('.banner'), { timeout: 60000 });
  const read = () => page.evaluate(() => (window.__dash ? JSON.parse(JSON.stringify(window.__dash)) : null));
  const dash = await read();
  return {
    page, dash, pageErrors, consoleErrors, read,
    shot: async (path) => { await page.screenshot({ path }); },
    // The compositor's layer list (CSS px sizes), from the DevTools protocol.
    layers: async () => {
      const client = await page.target().createCDPSession();
      await client.send('LayerTree.enable');
      const layers = await new Promise((res) => client.once('LayerTree.layerTreeDidChange', (e) => res(e.layers)));
      await client.detach();
      return layers;
    },
    close: () => page.close(),
  };
}
