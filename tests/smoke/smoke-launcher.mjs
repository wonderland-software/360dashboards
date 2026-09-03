// The launcher, mounted for real, checked against window.__dash and
// window.__launcher.
//
// The launcher is not a dashboard: it is our own 1280x720 page (app/launcher.ts
// plus the `.launcher` block of app/styles.css), so nothing here asserts a XUR
// scene or a skin visual. What it DOES assert is provenance and behaviour:
//
//   - every image on the page resolves back to a manifest entry by path, and
//     both cue names are held by the AudioBank, which indexes the manifest;
//   - both builds are offered, with the copy the page actually shows;
//   - Right and Down move, Enter commits, and the page leaves for ?build=9199
//     through the real keyboard path;
//   - the move plays btn_Focus and the commit plays btn_Select, while the
//     arrival is silent;
//   - and the compositor stays under the budget smoke-boot holds the
//     dashboards to at a Retina laptop window.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'out');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.SMOKE_URL ?? 'http://localhost:5173';

/** What app/launcher.ts says each image is, and what the manifest must agree. */
const ART = {
  logo: 'dashcomm/xboxLogo.png',
  aButton: 'shrdres/A-Button.png',
};

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

mkdirSync(OUT, { recursive: true });
let browser;
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });

  /* --------------------------------------------- 1. deterministic: &manual */

  // The clock is the harness's: the launcher's own 60 Hz clock is stepped by
  // hand, so every state below is a frame count, never a wait.
  const m = await load(browser, `${BASE}/?launcher&manual&mute`, 1280, 720);
  check(m.pageErrors.length === 0, `page errors: ${m.pageErrors.join(' | ')}`);
  check(m.consoleErrors.length === 0, `console errors: ${m.consoleErrors.join(' | ')}`);
  check(m.ready, 'document.body.dataset.ready was never set');
  const d = m.dash;
  check(!!d, 'window.__dash was never created');
  if (d) {
    check(d.scene === 'launcher', `__dash.scene is ${d.scene}, expected the launcher's own page`);
    check(d.canvas.w === 1280 && d.canvas.h === 720, `canvas is ${d.canvas.w}x${d.canvas.h}, expected the console's 1280x720 output`);
    check(d.build === '6770', `__dash.build is ${d.build}; the launcher's materials come from the 6770 dump`);
    check(d.errors.length === 0, `errors: ${d.errors.join(' | ')}`);
    check(d.missingImages.length === 0, `missing images: ${d.missingImages.join(', ')}`);
    check(d.placeholders.length === 0, `placeholders: ${d.placeholders.join(' | ')}`);
  }

  /* -------------------------------------- every asset resolves through the
                                            manifest, by its own path */

  const s0 = await state(m.page);
  for (const [key, path] of Object.entries(ART)) {
    const got = s0.art[key];
    check(got?.manifest === path,
      `${key} is ${got?.manifest ?? 'nothing'} (${got?.src ?? ''}), expected the manifest's ${path}`);
  }
  check(s0.cues.focus === 'btn_Focus' && s0.cues.haveFocus,
    `the move cue is ${s0.cues.focus} and the bank ${s0.cues.haveFocus ? 'holds' : 'does NOT hold'} it`);
  check(s0.cues.select === 'btn_Select' && s0.cues.haveSelect,
    `the commit cue is ${s0.cues.select} and the bank ${s0.cues.haveSelect ? 'holds' : 'does NOT hold'} it`);

  /* ------------------------------------------------- both builds are offered */

  check(s0.choices.length === 2, `${s0.choices.length} cards, expected one per build`);
  check(s0.choices.map((c) => c.build).join(',') === '6770,9199', `cards are ${s0.choices.map((c) => c.build).join(',')}`);
  check(s0.choices.map((c) => c.name).join(',') === 'Blades,NXE', `names are ${s0.choices.map((c) => c.name).join(',')}`);
  check(s0.choices.map((c) => c.label).join(',') === 'Build 6770,Build 9199', `labels are ${s0.choices.map((c) => c.label).join(',')}`);
  for (const c of s0.choices) {
    check(c.blurb.length > 40 && c.blurb.length < 140, `${c.name}'s description is ${c.blurb.length} characters: "${c.blurb}"`);
    check(!c.blurb.includes('—'), `${c.name}'s description has an em dash: "${c.blurb}"`);
  }
  const labels = await m.page.$$eval('.launcher-card', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  for (const c of s0.choices) {
    check(labels.some((l) => l.includes(c.name) && l.includes(c.label) && l.includes(c.blurb)),
      `${c.name}'s card does not show its label and description on the page`);
  }

  /* ------------------------------------------------------- arrival is silent */

  check(s0.phase === 'intro' && !s0.armed, `the page arrived as ${s0.phase}; it should settle before it takes input`);
  await m.page.evaluate(() => window.__launcher.stepFrames(30));
  const s1 = await state(m.page);
  const d1 = await m.read();
  check(s1.armed && s1.phase === 'ready', `after 30 frames the page is ${s1.phase}, expected ready`);
  check(s1.index === 0 && s1.focusId === 'build-6770', `arrival focus is ${s1.focusId}`);
  check(s1.choices[0].focused && !s1.choices[1].focused, 'the Blades card does not carry the arrival focus');
  check(d1.cues.length === 0, `the arrival played ${d1.cues.map((c) => c.cue).join(', ')}; it should be silent`);

  /* ------------------------------------- Right and Down move, A commits */

  await m.page.evaluate(() => window.__launcher.press('Right'));
  const s2 = await state(m.page);
  const d2 = await m.read();
  check(s2.index === 1 && s2.focusId === 'build-9199', `after Right focus is ${s2.focusId}`);
  check(s2.choices[1].focused && !s2.choices[0].focused, 'the NXE card did not take focus');
  check(d2.cues.some((c) => c.cue === 'btn_Focus'), 'Right did not fire btn_Focus');

  await m.page.evaluate(() => window.__launcher.press('Up'));
  check((await state(m.page)).index === 0, 'Up did not move focus back to Blades');
  await m.page.evaluate(() => window.__launcher.press('Down'));
  const s3 = await state(m.page);
  check(s3.index === 1 && s3.focusId === 'build-9199', `after Down focus is ${s3.focusId}`);

  await m.page.evaluate(() => window.__launcher.press('A'));
  const s4 = await state(m.page);
  const d4 = await m.read();
  check(s4.going === '9199', `A committed to ${s4.going}`);
  check(s4.phase === 'going', `after A the page is ${s4.phase}, expected going`);
  check(d4.cues.some((c) => c.cue === 'btn_Select'), 'A did not fire btn_Select');
  check(d4.cues.filter((c) => c.cue === 'btn_Focus').length === 3, `${d4.cues.filter((c) => c.cue === 'btn_Focus').length} focus cues for three moves`);

  const nav = m.page.waitForNavigation({ timeout: 20000 }).then(() => true).catch(() => false);
  await m.page.evaluate(() => window.__launcher.stepFrames(18)).catch(() => { /* the page is leaving */ });
  check(await nav, 'the commit flash ended and the page did not navigate');
  check(new URL(m.page.url()).searchParams.get('build') === '9199',
    `navigated to ${new URL(m.page.url()).search}, expected ?build=9199`);
  await m.close();

  /* ---------------------------------------- 2. &boot=none arrives settled */

  const none = await load(browser, `${BASE}/?launcher&boot=none&manual&mute`, 1280, 720);
  const sn = await state(none.page);
  check(none.pageErrors.length === 0, `boot=none page errors: ${none.pageErrors.join(' | ')}`);
  check(sn.armed && sn.phase === 'ready' && sn.frame === 0,
    `boot=none arrived ${sn.phase} on frame ${sn.frame}; it should be ready on frame 0`);
  await none.close();

  /* ------------------------------------- 3. the bare `/`, on the real clock */

  const live = await load(browser, `${BASE}/`, 1280, 720);
  check(live.pageErrors.length === 0, `bare / page errors: ${live.pageErrors.join(' | ')}`);
  check(live.consoleErrors.length === 0, `bare / console errors: ${live.consoleErrors.join(' | ')}`);
  await live.page.waitForFunction(() => window.__launcher?.state().armed, { timeout: 20000 })
    .catch(() => check(false, 'bare /: the page never armed on the wall clock'));
  await settle();
  await live.shot(`${OUT}/launcher.png`);
  // The real keyboard path: ArrowDown then Enter, through the InputRouter.
  await live.page.keyboard.press('ArrowDown');
  await live.page.waitForFunction(() => window.__launcher?.state().index === 1, { timeout: 5000 })
    .catch(() => check(false, 'bare /: ArrowDown did not move focus'));
  const liveNav = live.page.waitForNavigation({ timeout: 20000 }).then(() => true).catch(() => false);
  await live.page.keyboard.press('Enter');
  check(await liveNav, 'bare /: Enter did not navigate');
  check(new URL(live.page.url()).searchParams.get('build') === '9199', `bare /: landed on ${new URL(live.page.url()).search}`);
  await live.close();

  /* --------------------------- 3b. coming BACK from a dashboard and choosing
   *
   * The launcher leaves with location.assign, so the browser may keep this
   * document in its back/forward cache and restore it with `phase` still on
   * 'going' - which refuses every press and freezes the page on the card that
   * was chosen (Tag, 2026-09-03). A restore fires pageshow with persisted
   * true; the launcher re-arms on it. Both choices are driven here because the
   * failure only shows on the SECOND one. */

  const back = await load(browser, `${BASE}/`, 1280, 720);
  await back.page.waitForFunction(() => window.__launcher?.state().armed, { timeout: 20000 })
    .catch(() => check(false, 'back: the page never armed'));
  const firstNav = back.page.waitForNavigation({ timeout: 20000 }).then(() => true).catch(() => false);
  await back.page.keyboard.press('ArrowRight');
  await back.page.keyboard.press('Enter');
  check(await firstNav, 'back: the first choice did not navigate');
  check(new URL(back.page.url()).searchParams.get('build') === '9199', `back: first choice landed on ${new URL(back.page.url()).search}`);
  // No waitUntil: a bfcache restore issues no requests at all, so a network
  // condition can never resolve. The state the gate wants is the signal.
  await back.page.goBack().catch(() => {});
  await back.page.waitForFunction(() => window.__launcher?.state().armed === true, { timeout: 20000 })
    .catch(() => check(false, 'back: the restored launcher never armed, so nothing can be chosen'));
  await settle();
  const restored = await back.page.evaluate(() => ({
    phase: document.querySelector('.launcher')?.dataset.phase ?? null,
    armed: window.__launcher?.state().armed ?? null,
  }));
  check(restored.phase === 'ready' && restored.armed === true,
    `back: the restored launcher is phase=${restored.phase} armed=${restored.armed}, so nothing can be chosen`);
  const secondNav = back.page.waitForNavigation({ timeout: 20000 }).then(() => true).catch(() => false);
  await back.page.keyboard.press('ArrowLeft');
  await back.page.keyboard.press('Enter');
  check(await secondNav, 'back: the second choice did not navigate');
  check(new URL(back.page.url()).searchParams.get('build') === '6770', `back: second choice landed on ${new URL(back.page.url()).search}, expected the OTHER build`);
  await back.close();

  /* ------------------------------------ 4. the compositor at a Retina window */

  const big = await load(browser, `${BASE}/`, 2000, 1196, 2);
  await big.page.waitForFunction(() => window.__launcher?.state().armed, { timeout: 20000 }).catch(() => {});
  await settle();
  await big.shot(`${OUT}/launcher-2x.png`);
  const layers = await big.layers();
  const mb = layers.reduce((s, l) => s + l.width * l.height, 0) * 4 * 4 / 1e6;
  console.log(`  compositor at 2000x1196@2x: ${layers.length} layers, ~${mb.toFixed(0)} MB of tiles`);
  check(layers.length <= 24, `${layers.length} compositor layers (budget 24)`);
  check(mb <= 260, `~${mb.toFixed(0)} MB of tiles at 2000x1196@2x (budget 260)`);
  await big.close();

  console.log(`  logo ${s0.art.logo.manifest}, legend ${s0.art.aButton.manifest}, cues ${s0.cues.focus} + ${s0.cues.select}`);
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

/** The intro is a CSS transition, and a transition holds its own compositor
 *  layer while it runs. Let it finish before a screenshot or a layer count. */
async function settle() {
  await new Promise((r) => setTimeout(r, 900));
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
  const ready = await page.evaluate(() => document.body.dataset.ready === 'true');
  return {
    page, dash, ready, pageErrors, consoleErrors, read,
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
