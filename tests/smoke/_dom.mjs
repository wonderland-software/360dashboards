import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720 });
await p.goto(process.argv[2], { waitUntil: 'load', timeout: 60000 });
await p.waitForFunction(() => document.body.dataset.ready === 'true', { timeout: 60000 });
const out = await p.evaluate((sel, depth) => {
  const root = document.querySelector(sel);
  if (!root) return 'no ' + sel;
  const lines = [];
  const go = (el, d) => {
    if (d > depth) return;
    const r = el.getBoundingClientRect();
    lines.push('  '.repeat(d) + `${el.tagName} ${el.dataset.xuiClass||el.dataset.xuiVisual||el.className||''} id=${el.dataset.xuiId||''} ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)} ${el.style.display==='none'?'HIDDEN':''} op=${el.style.opacity||''}`);
    for (const c of el.children) go(c, d+1);
  };
  go(root, 0);
  return lines.join('\n');
}, process.argv[3], Number(process.argv[4] ?? 6));
console.log(out);
await b.close();
