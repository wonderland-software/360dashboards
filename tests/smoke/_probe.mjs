import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const url = process.argv[2];
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type()==='error') errs.push('console: '+m.text()); });
await p.goto(url, { waitUntil: 'load', timeout: 60000 });
try { await p.waitForFunction(() => document.body.dataset.ready === 'true', { timeout: 60000 }); }
catch { console.log('NOT READY'); }
const d = await p.evaluate(() => window.__dash ? JSON.parse(JSON.stringify({
  build: window.__dash.build, errors: window.__dash.errors,
  unknown: window.__dash.unknownClasses, approx: window.__dash.approximatedClasses,
  unresolvedVisuals: window.__dash.unresolvedVisuals, missing: window.__dash.missingImages,
  canvas: window.__dash.canvas, placeholders: window.__dash.placeholders,
  nxe: window.__dash.nxe,
})) : { none: true });
console.log(JSON.stringify(d, null, 1));
if (errs.length) console.log('PAGE ERRORS:', errs.slice(0,5));
if (process.argv[3]) await p.screenshot({ path: process.argv[3] });
await b.close();
