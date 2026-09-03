// One scene, mounted for real, checked against window.__dash.
//
// consoles/dashSysCslSet.xur is the scene in reference/frames/6717/f0060.png,
// so the screenshots this writes are the ones the fidelity judge compares.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'out');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.SMOKE_URL ?? 'http://localhost:5173';
const SCENE = 'consoles/dashSysCslSet.xur';

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };

mkdirSync(OUT, { recursive: true });
let browser;
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });

  // 1. The design canvas, 1120x770, one screenshot pixel per design unit.
  const design = await load(browser, `${BASE}/?scene=${SCENE}&design`, 1120, 770);
  check(design.pageErrors.length === 0, `page errors: ${design.pageErrors.join(' | ')}`);
  check(design.consoleErrors.length === 0, `console errors: ${design.consoleErrors.join(' | ')}`);
  const d = design.dash;
  check(!!d, 'window.__dash was never created');
  if (d) {
    check(d.scene === SCENE, `__dash.scene is ${d.scene}`);
    check(d.controls > 0, `__dash.controls is ${d.controls}`);
    check(d.objects > 0, `__dash.objects is ${d.objects}`);
    check(d.unknownClasses.length === 0, `unknown classes: ${d.unknownClasses.join(', ')}`);
    check(d.unresolvedVisuals.length === 0, `unresolved visuals: ${d.unresolvedVisuals.join(', ')}`);
    check(d.missingImages.length === 0, `missing images: ${d.missingImages.join(', ')}`);
    check(d.errors.length === 0, `errors: ${d.errors.join(' | ')}`);
    check(d.placeholders.length === 0, `placeholders: ${d.placeholders.join(' | ')}`);
  }
  await design.shot('.xui-canvas', `${OUT}/boot.png`);
  await design.close();

  // 2. What the TV saw: the console's view transform at the reference frames'
  //    1920x1080, so it overlays reference/frames/6717/f0060.png directly.
  const tv = await load(browser, `${BASE}/?scene=${SCENE}&console&zoom=1.5`, 1920, 1080);
  check(tv.pageErrors.length === 0, `console-view page errors: ${tv.pageErrors.join(' | ')}`);
  await tv.shot('.xui-stage', `${OUT}/boot-1080.png`);
  await tv.close();

  // 3. The compositor budget at a Retina laptop window. The driven dashboard
  //    once put 99 GPU layers (522 MB of tiles at 2000x1196@2x) on screen: every
  //    Z rotation was a rotate3d, which Chrome promotes to its own layer, and
  //    the overlaps cascaded. Over the tile budget Chrome evicts tiles and
  //    paints black where they were - the "black boxes flickering" Tag saw on
  //    2026-09-03. Headless never shows it (a screenshot waits for raster), so
  //    the gate is the layer tree itself, read over CDP.
  const home = await load(browser, `${BASE}/?boot=none`, 2000, 1196, 2);
  const layers = await home.layers();
  const mb = layers.reduce((s, l) => s + l.width * l.height, 0) * 4 * 4 / 1e6;
  console.log(`  compositor at 2000x1196@2x: ${layers.length} layers, ~${mb.toFixed(0)} MB of tiles`);
  check(layers.length <= 24, `${layers.length} compositor layers at the home blade (budget 24; was 99 when the tiles went black)`);
  check(mb <= 260, `~${mb.toFixed(0)} MB of tiles at 2000x1196@2x (budget 260; was 522 when the tiles went black)`);
  await home.close();

  if (d) console.log(`  ${d.objects} objects, ${d.controls} controls, build ${d.build}`);
  console.log(`  wrote ${OUT}/boot.png (1120x770 design) and ${OUT}/boot-1080.png (1920x1080 console view)`);
} catch (err) {
  fails.push(`threw: ${err instanceof Error ? err.stack : String(err)}`);
} finally {
  if (browser) await browser.close();
}

if (fails.length) { for (const f of fails) console.error('  FAIL ' + f); console.log('SMOKE_FAIL'); process.exit(1); }
console.log('SMOKE_PASS');

async function load(browser, url, width, height, deviceScaleFactor = 1) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor });
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => document.body.dataset.ready === 'true' || !!document.querySelector('.banner'), { timeout: 60000 });
  const dash = await page.evaluate(() => (window.__dash ? JSON.parse(JSON.stringify(window.__dash)) : null));
  return {
    dash, pageErrors, consoleErrors,
    shot: async (sel, path) => { const el = await page.$(sel); if (el) await el.screenshot({ path }); },
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
