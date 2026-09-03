// Every scene in EVERY build, mounted one after another, with a per-scene
// table. PASS only when nothing is unknown, unresolved or missing except what
// tests/smoke/allowlist.json justifies.
//
// Both builds run here because that is the only place a class the registry does
// not know can show up: NXE 9199 adds XuiPerspectiveScene, XuiTextureSurface,
// XuiShader, XuiAvatar, AuraControl, XuiHtmlElement, LegacyControl,
// MobyChannelScene and the rest, and each of the 311 scenes has to mount with
// zero unknown classes and every child rendered.
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'out');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.SMOKE_URL ?? 'http://localhost:5173';
const allow = JSON.parse(readFileSync(resolve(HERE, 'allowlist.json'), 'utf8'));

mkdirSync(OUT, { recursive: true });
const BUILDS = (process.env.SMOKE_BUILDS ?? '6770,9199').split(',').filter(Boolean);
const fails = [];
let browser;
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  for (const build of BUILDS) await sweep(build);
} catch (err) {
  fails.push(`threw: ${err instanceof Error ? err.stack : String(err)}`);
} finally {
  if (browser) await browser.close();
}

if (fails.length) { for (const f of fails) console.error('  FAIL ' + f); console.log('SMOKE_FAIL'); process.exit(1); }
console.log('SMOKE_PASS');

async function sweep(build) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(`${BASE}/?gallery&build=${build}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction(() => document.body.dataset.ready === 'true', { timeout: 600000 });
  const gallery = await page.evaluate(() => JSON.parse(JSON.stringify(window.__dash.gallery)));
  const served = await page.evaluate(() => window.__dash.build);
  writeFileSync(`${OUT}/gallery-${build}.json`, JSON.stringify(gallery, null, 1));
  if (build === '6770') writeFileSync(`${OUT}/gallery.json`, JSON.stringify(gallery, null, 1));

  console.log(`\n== build ${build}`);
  if (served !== build) fails.push(`asked for build ${build}, got ${served}`);
  if (pageErrors.length) fails.push(`build ${build} page errors: ${pageErrors.join(' | ')}`);
  if (gallery.length === 0) fails.push(`build ${build}: no scenes in the gallery`);

  const rows = [];
  for (const r of gallery) {
    const unknown = r.unknownClasses;
    const visuals = r.unresolvedVisuals.filter((v) => !(v in allow.unresolvedVisuals));
    const images = r.missingImages.filter((v) => !(v in allow.missingImages));
    const bad = unknown.length + visuals.length + images.length + r.errors.length;
    if (bad) {
      fails.push(`build ${build} ${r.scene}: ${[
        unknown.length ? `unknown classes ${unknown.join(',')}` : '',
        visuals.length ? `unresolved visuals ${visuals.join(',')}` : '',
        images.length ? `missing images ${images.join(',')}` : '',
        r.errors.length ? `errors ${r.errors.join('; ')}` : '',
      ].filter(Boolean).join('; ')}`);
    }
    if (bad || r.unresolvedVisuals.length || r.missingImages.length || r.sceneTextures.length) rows.push(r);
  }

  const total = gallery.reduce((a, r) => a + r.objects, 0);
  const approx = [...new Set(gallery.flatMap((r) => r.approximatedClasses))].sort();
  console.log(`  ${gallery.length} scenes, ${total} objects`);
  if (approx.length) console.log(`  approximated classes: ${approx.join(', ')}`);
  console.log(`  ${'scene'.padEnd(44)} obj  unknown / unresolved visual / missing image / scene-texture`);
  for (const r of rows) {
    console.log(`  ${r.scene.padEnd(44)} ${String(r.objects).padStart(4)}  ${[
      r.unknownClasses.join(',') || '-',
      r.unresolvedVisuals.join(',') || '-',
      r.missingImages.join(',') || '-',
      r.sceneTextures.join(',') || '-',
    ].join(' / ')}`);
  }
  if (rows.length === 0) console.log('  (every scene clean)');
  console.log(`  wrote ${OUT}/gallery-${build}.json`);
  await page.close();
}
