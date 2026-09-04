// The phone and tablet gate.
//
// Everything else in this repo is measured against a console. This suite is
// measured against a DEVICE: the launcher and both dashboards are opened at
// four real screen sizes with touch emulation on, and asked four questions.
//
//   1. Does it fit? No horizontal scroll, and the 16:9 stage inside the visual
//      viewport. (The stage used to be flex-SHRUNK on any window narrower than
//      1280, so the sides of the console's picture were cut off. `flex: none`
//      in app/styles.css is that fix and this is its gate.)
//   2. Does the rotate ask appear when it should and only then? Portrait on a
//      handheld: yes. Landscape on the same handheld: no. A tall DESKTOP
//      window: no, and that one is the whole point of the coarse-pointer test.
//   3. Do the gestures reach the pad? A tap focuses, a second tap presses, a
//      horizontal swipe moves the blade or the panel cursor, a vertical swipe
//      moves focus, and a two-finger tap is B. Every assertion is made through
//      `window.__dash` - the shell's own report and the router's own log - and
//      never against pixels, so it is measuring the console's state machine and
//      not a screenshot.
//   4. Is it inside the compositor budget at phone sizes? Same reading as
//      smoke-boot's, same budget (24 layers / 260 MB): tiles evicted on a
//      phone are the same black rectangles they are on a laptop.
//
// The devices are the real CSS-pixel sizes and device pixel ratios, not round
// numbers: iPhone 15 Pro 852x393@3, iPhone SE 667x375@2, iPad 1024x768@2.
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'out');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.SMOKE_URL ?? 'http://localhost:5173';

/** The three landscape devices, and the portrait case that proves the overlay. */
const LANDSCAPE = [
  { name: 'iPhone 15 Pro landscape', width: 852, height: 393, dpr: 3 },
  { name: 'iPhone SE landscape', width: 667, height: 375, dpr: 2 },
  { name: 'iPad landscape', width: 1024, height: 768, dpr: 2 },
];
const PORTRAIT = { name: 'iPhone 15 Pro portrait', width: 393, height: 852, dpr: 3 };

/** The three routes: our page, and the two dashboards. */
const ROUTES = [
  { id: 'launcher', url: '/?launcher&boot=none&mute' },
  { id: 'blades', url: '/?build=6770&blade=5&mute' },
  { id: 'nxe', url: '/?build=9199&mute' },
];

/** The compositor budget, the same two numbers smoke-boot holds. */
const MAX_LAYERS = 24;
const MAX_TILE_MB = 260;

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };
const fmt = (n) => (Math.round(n * 10) / 10).toString();

mkdirSync(OUT, { recursive: true });
let browser;
try {
  browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });

  /* ------------------------------------------------ 1 + 2. fit, and the ask */

  for (const route of ROUTES) {
    for (const d of [...LANDSCAPE, PORTRAIT]) {
      const p = await open(browser, route.url, d);
      const where = `${route.id} @ ${d.name}`;
      check(p.pageErrors.length === 0, `${where}: page errors: ${p.pageErrors.join(' | ')}`);
      const m = await p.page.evaluate(() => {
        const se = document.scrollingElement;
        const stage = document.querySelector('.xui-stage');
        const r = stage ? stage.getBoundingClientRect() : null;
        const vv = window.visualViewport;
        const rotate = document.querySelector('.rotate');
        return {
          scrollWidth: se.scrollWidth, clientWidth: se.clientWidth,
          scrollHeight: se.scrollHeight, clientHeight: se.clientHeight,
          stage: r ? {
          left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height,
          // What layout() asked for, so the drawn box can be checked against
          // it: the stage is `styleW x styleH` scaled uniformly, and any
          // difference in the two ratios is the stage being RESIZED instead.
          styleW: parseFloat(stage.style.width), styleH: parseFloat(stage.style.height),
        } : null,
          vv: vv ? { width: vv.width, height: vv.height } : null,
          rotate: rotate ? { text: rotate.textContent, buttons: rotate.querySelectorAll('button').length } : null,
          orientation: window.__dash ? window.__dash.orientation : null,
          canvas: window.__dash ? window.__dash.canvas : null,
        };
      });

      // 1. Nothing scrolls. A horizontal scrollbar on a phone is the whole
      //    "it does not fit" failure in one number.
      check(m.scrollWidth <= m.clientWidth, `${where}: horizontal scroll ${m.scrollWidth} > ${m.clientWidth}`);
      check(m.scrollHeight <= m.clientHeight, `${where}: vertical scroll ${m.scrollHeight} > ${m.clientHeight}`);

      // 2. The stage is inside the visual viewport, and it kept its shape.
      //    Half a pixel of tolerance: the fit scale is a float.
      const vv = m.vv ?? { width: d.width, height: d.height };
      check(!!m.stage, `${where}: no .xui-stage`);
      if (m.stage) {
        const s = m.stage;
        check(s.left >= -0.5 && s.top >= -0.5 && s.right <= vv.width + 0.5 && s.bottom <= vv.height + 0.5,
          `${where}: stage ${fmt(s.left)},${fmt(s.top)} ${fmt(s.width)}x${fmt(s.height)} is outside the ${fmt(vv.width)}x${fmt(vv.height)} visual viewport`);
        check(s.width > 1 && s.height > 1, `${where}: stage collapsed to ${fmt(s.width)}x${fmt(s.height)}`);
        // The stage's OWN aspect, not the window's. A stage that was shrunk to
        // the window instead of scaled into it is exactly what this catches,
        // and it is what a flex row did to it before `flex: none`.
        if (s.styleW > 0 && s.styleH > 0) {
          const want = s.styleW / s.styleH;
          const got = s.width / s.height;
          check(Math.abs(got - want) < 0.02,
            `${where}: the stage is drawn ${fmt(s.width)}x${fmt(s.height)} (aspect ${got.toFixed(3)}) for a ${s.styleW}x${s.styleH} output (aspect ${want.toFixed(3)}) - it was resized, not scaled`);
          // ...and it is scaled DOWN to fit, never cropped.
          const fit = s.width / s.styleW;
          check(fit <= 1.001 || (s.width <= vv.width + 0.5 && s.height <= vv.height + 0.5),
            `${where}: stage fit ${fit.toFixed(3)} overflows the viewport`);
        }
      }

      // 3. The rotate ask: present in portrait, absent in landscape.
      const portrait = d === PORTRAIT;
      check(!!m.rotate === portrait, `${where}: rotate overlay ${m.rotate ? 'present' : 'absent'} (expected ${portrait ? 'present' : 'absent'})`);
      check(!!m.orientation, `${where}: __dash.orientation missing`);
      if (m.orientation) {
        check(m.orientation.portrait === portrait, `${where}: __dash.orientation.portrait is ${m.orientation.portrait}`);
        check(m.orientation.handheld === true, `${where}: __dash.orientation.handheld is false on a touch device ${d.width}x${d.height}`);
        check(m.orientation.overlay === portrait, `${where}: __dash.orientation.overlay is ${m.orientation.overlay}`);
      }
      if (portrait && m.rotate) {
        check(/landscape|sideways/i.test(m.rotate.text), `${where}: the overlay does not ask for landscape: "${m.rotate.text.slice(0, 80)}"`);
        check(!m.rotate.text.includes('—'), `${where}: the overlay copy has an em dash`);
      }

      // The screenshots the report shows.
      if (d === LANDSCAPE[0]) await p.shot(`${OUT}/mobile-${route.id}.png`);
      if (portrait && route.id === 'launcher') await p.shot(`${OUT}/mobile-portrait.png`);
      await p.close();
    }
  }

  // A DESKTOP window that merely happens to be tall must never see the ask.
  {
    const p = await open(browser, ROUTES[0].url, { name: 'tall desktop', width: 900, height: 1200, dpr: 1 }, false);
    const m = await p.page.evaluate(() => ({
      rotate: !!document.querySelector('.rotate'),
      o: window.__dash ? window.__dash.orientation : null,
    }));
    check(m.o && m.o.portrait === true, 'tall desktop: the window is not portrait, so the case proves nothing');
    check(m.o && m.o.handheld === false, `tall desktop: handheld is ${m.o && m.o.handheld} on a 900x1200 fine-pointer window`);
    check(!m.rotate, 'tall desktop: the rotate overlay covered a desktop window');
    await p.close();
  }

  /* ------------------------------------------------------------ 3. gestures */

  const D = LANDSCAPE[0];

  // The launcher. One tap focuses a card and does NOT start it, which is also
  // the double-fire check: if the browser's synthesized click had reached the
  // card's own handler the phase would be 'going' after a single tap.
  {
    const p = await open(browser, '/?launcher&boot=none&mute&manual', D);
    const cards = await p.page.evaluate(() => [...document.querySelectorAll('.launcher-card')].map((e) => {
      const r = e.getBoundingClientRect();
      return { id: e.id, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }));
    check(cards.length === 2, `launcher: ${cards.length} cards`);
    const start = await p.page.evaluate(() => window.__launcher.state().index);
    check(start === 0, `launcher: starts on index ${start}`);
    await p.tap(cards[1].x, cards[1].y);
    const one = await p.page.evaluate(() => ({ s: window.__launcher.state(), touch: window.__dash.touch.slice(-1)[0] }));
    check(one.s.index === 1, `launcher: one tap left the index at ${one.s.index}`);
    check(one.s.phase === 'ready', `launcher: one tap put the page in "${one.s.phase}" - the tap double-fired as a click`);
    check(one.touch && one.touch.gesture === 'tap-focus', `launcher: first tap logged ${JSON.stringify(one.touch)}`);
    await p.tap(cards[1].x, cards[1].y);
    const two = await p.page.evaluate(() => ({ s: window.__launcher.state(), touch: window.__dash.touch.slice(-1)[0] }));
    check(two.s.phase === 'going' && two.s.going === '9199', `launcher: second tap gave phase ${two.s.phase} / going ${two.s.going}`);
    check(two.touch && two.touch.gesture === 'tap-press', `launcher: second tap logged ${JSON.stringify(two.touch)}`);
    await p.close();
  }

  // Blades. A row, then the same row again, then B by two fingers, then the
  // blade switch by swipe.
  {
    const p = await open(browser, '/?build=6770&blade=5&mute', D);
    const before = await p.page.evaluate(() => window.__dash.shell.focusId);
    const row = await p.page.evaluate((focus) => {
      const rows = [...document.querySelectorAll('[data-xui-class="XuiNavButton"]')]
        .map((e) => ({ id: e.dataset.xuiId, r: e.getBoundingClientRect() }))
        .filter((e) => e.id && e.id.startsWith('nav') && e.id !== focus
          && e.r.width > 4 && e.r.height > 4 && e.r.top >= 0 && e.r.bottom <= innerHeight);
      const e = rows[2] ?? rows[0];
      return e ? { id: e.id, x: e.r.left + e.r.width / 2, y: e.r.top + e.r.height / 2 } : null;
    }, before);
    check(!!row, 'blades: no reachable nav row to tap');
    if (row) {
      await p.tap(row.x, row.y);
      const one = await p.page.evaluate(() => ({ focus: window.__dash.shell.focusId, touch: window.__dash.touch.slice(-1)[0], input: window.__dash.input.map((e) => e.button) }));
      check(one.focus === row.id, `blades: a tap on ${row.id} left focus on ${one.focus}`);
      check(one.touch && one.touch.gesture === 'tap-focus', `blades: first tap logged ${JSON.stringify(one.touch)}`);
      check(one.input.includes('Down') || one.input.includes('Up'), 'blades: the focus walk sent no d-pad press');
      check(!one.input.includes('A'), 'blades: the FIRST tap pressed A');

      const depth = await p.page.evaluate(() => window.__dash.shell.stack.length);
      await p.tap(row.x, row.y);
      await p.settle();
      const two = await p.page.evaluate(() => ({ stack: window.__dash.shell.stack, touch: window.__dash.touch.slice(-1)[0], last: window.__dash.input.slice(-1)[0] }));
      check(two.touch && two.touch.gesture === 'tap-press', `blades: second tap logged ${JSON.stringify(two.touch)}`);
      check(two.last && two.last.button === 'A', `blades: second tap sent ${two.last && two.last.button}, not A`);
      check(two.stack.length > depth, `blades: A on ${row.id} pushed nothing (stack ${two.stack.join(' > ')})`);

      // Two fingers are B: the page it just opened goes away again.
      await p.twoFingerTap(D.width / 2, D.height / 2);
      await p.settle();
      const back = await p.page.evaluate(() => ({ stack: window.__dash.shell.stack, touch: window.__dash.touch.slice(-1)[0] }));
      check(back.touch && back.touch.gesture === 'two-finger' && back.touch.button === 'B', `blades: the two-finger tap logged ${JSON.stringify(back.touch)}`);
      check(back.stack.length === depth, `blades: B left the stack at ${back.stack.join(' > ')}`);
    }

    // A horizontal swipe is the blade switch. Right, because blade 5 is the
    // last one and RB has nowhere to go.
    const tabBefore = await p.page.evaluate(() => window.__dash.shell.tab);
    await p.swipe(200, 200, 640, 200);
    await p.settle();
    const swiped = await p.page.evaluate(() => ({ tab: window.__dash.shell.tab, touch: window.__dash.touch.slice(-1)[0] }));
    check(swiped.touch && swiped.touch.gesture === 'swipe-right' && swiped.touch.button === 'LB', `blades: the swipe logged ${JSON.stringify(swiped.touch)}`);
    check(swiped.tab === tabBefore - 1, `blades: a swipe took the blade from ${tabBefore} to ${swiped.tab}`);

    // A vertical swipe moves focus, and does not move the blade.
    const focusBefore = await p.page.evaluate(() => window.__dash.shell.focusId);
    await p.swipe(D.width / 2, 300, D.width / 2, 140);
    await p.settle();
    const vert = await p.page.evaluate(() => ({ focus: window.__dash.shell.focusId, tab: window.__dash.shell.tab, touch: window.__dash.touch.slice(-1)[0] }));
    check(vert.touch && vert.touch.gesture === 'swipe-up' && vert.touch.button === 'Down', `blades: the vertical swipe logged ${JSON.stringify(vert.touch)}`);
    check(vert.focus !== focusBefore, `blades: a vertical swipe left focus on ${vert.focus}`);
    check(vert.tab === swiped.tab, `blades: a vertical swipe moved the blade to ${vert.tab}`);
    await p.close();
  }

  // NXE. The home strip has a panel CURSOR, not a focus chain: a tap on a panel
  // that is not at the front walks the cursor to it, and a tap on the front
  // panel is A.
  {
    const p = await open(browser, '/?build=9199&mute', D);
    await p.settle(700);
    const first = await p.page.evaluate(() => {
      const n = window.__dash.nxe;
      const front = Math.round(n.motion.panel.target);
      const key = `${n.panels[front].screen.x.toFixed(1)},${n.panels[front].screen.y.toFixed(1)}`;
      const back = [...document.querySelectorAll('[data-nxe-screen]')]
        .map((e) => ({ k: e.dataset.nxeScreen, r: e.getBoundingClientRect() }))
        .filter((e) => e.k !== key && e.r.width > 20)
        .sort((a, b) => b.r.width - a.r.width)[0];
      return { front, target: n.motion.panel.target, back: back ? { x: back.r.left + back.r.width / 2, y: back.r.top + back.r.height / 2 } : null };
    });
    check(!!first.back, 'nxe: no panel behind the front one to tap');
    if (first.back) {
      await p.tap(first.back.x, first.back.y);
      await p.settle();
      const moved = await p.page.evaluate(() => ({ target: window.__dash.nxe.motion.panel.target, touch: window.__dash.touch.slice(-1)[0], input: window.__dash.input.slice(-1)[0] }));
      check(moved.touch && moved.touch.gesture === 'tap-focus', `nxe: the tap logged ${JSON.stringify(moved.touch)}`);
      check(moved.target !== first.target, `nxe: a tap on another panel left the cursor at ${moved.target}`);
      check(moved.input && (moved.input.button === 'Right' || moved.input.button === 'Left'), `nxe: the tap sent ${moved.input && moved.input.button}`);
    }
    // The FRONT panel now: a tap on it is A, and A opens a page.
    const front = await p.page.evaluate(() => {
      const n = window.__dash.nxe;
      const i = Math.round(n.motion.panel.target);
      const want = n.panels[i].screen;
      // NEAREST, not equal: the wrapper's data-nxe-screen was written on the
      // last painted frame and the report is read on this one, so the two can
      // be a fraction of a panel apart while the strip is still settling.
      const el = [...document.querySelectorAll('[data-nxe-screen]')]
        .map((e) => {
          const [x, y] = e.dataset.nxeScreen.split(',').map(Number);
          return { e, d: Math.hypot(x - want.x, y - want.y) };
        })
        .sort((a, b) => a.d - b.d)[0];
      if (!el) return null;
      const r = el.e.getBoundingClientRect();
      return { name: n.panels[i].name, x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    check(!!front, 'nxe: the front panel has no wrapper on screen');
    if (front) {
      await p.tap(front.x, front.y);
      await p.settle();
      const pressed = await p.page.evaluate(() => ({ touch: window.__dash.touch.slice(-1)[0], last: window.__dash.input.slice(-1)[0] }));
      check(pressed.touch && pressed.touch.gesture === 'tap-press', `nxe: the front-panel tap logged ${JSON.stringify(pressed.touch)}`);
      check(pressed.last && pressed.last.button === 'A', `nxe: the front-panel tap sent ${pressed.last && pressed.last.button}`);
    }
    await p.close();
  }

  // NXE, clean page: the two swipe axes. Horizontal is the panel cursor and
  // vertical is the channel cursor, which is the opposite assignment to Blades
  // and is the file's own (MobyPanelInput* is the horizontal axis).
  {
    const p = await open(browser, '/?build=9199&mute', D);
    await p.settle(700);
    const a = await p.page.evaluate(() => ({ panel: window.__dash.nxe.motion.panel.target, channel: window.__dash.nxe.motion.channel.target }));
    await p.swipe(640, 200, 200, 200);
    await p.settle();
    const b = await p.page.evaluate(() => ({ panel: window.__dash.nxe.motion.panel.target, touch: window.__dash.touch.slice(-1)[0] }));
    check(b.touch && b.touch.gesture === 'swipe-left' && b.touch.button === 'Right', `nxe: the horizontal swipe logged ${JSON.stringify(b.touch)}`);
    check(b.panel === a.panel + 1, `nxe: a swipe took the panel cursor from ${a.panel} to ${b.panel}`);
    await p.swipe(D.width / 2, 300, D.width / 2, 140);
    await p.settle();
    const c = await p.page.evaluate(() => ({ channel: window.__dash.nxe.motion.channel.target, touch: window.__dash.touch.slice(-1)[0] }));
    check(c.touch && c.touch.gesture === 'swipe-up' && c.touch.button === 'Down', `nxe: the vertical swipe logged ${JSON.stringify(c.touch)}`);
    check(c.channel === a.channel - 1, `nxe: a vertical swipe took the channel cursor from ${a.channel} to ${c.channel}`);
    await p.close();
  }

  /* ------------------------------------------------- 4. the layer budget */

  // TILE MEMORY, and the one place this suite does NOT copy smoke-boot's sum.
  //
  // smoke-boot multiplies each layer's LAYOUT area by the device pixel ratio
  // squared, which is right on its 2000x1196 window because the stage there is
  // near 1:1. On a phone it is not: the console's 1280x720 output is drawn
  // through a 0.55 fit, and Chrome rasters a layer at its SCREEN scale (the
  // device ratio times every ancestor scale), so counting dpr alone bills the
  // GPU for pixels it never allocates - 397 MB claimed against 118 MB real for
  // NXE at 852x393@3x. Both numbers are printed; the budget is held against
  // the raster one, and the layer COUNT (which no scale affects) is held
  // against smoke-boot's 24 either way.
  console.log('  compositor (layers, tiles at the raster scale, and smoke-boot\'s dpr-only figure):');
  for (const route of ROUTES) {
    for (const d of LANDSCAPE) {
      const p = await open(browser, route.url, d);
      await p.settle(400);
      const fit = await p.page.evaluate(() => {
        const st = document.querySelector('.xui-stage');
        if (!st) return 1;
        const w = parseFloat(st.style.width);
        return w > 0 ? st.getBoundingClientRect().width / w : 1;
      });
      const layers = await p.layers();
      const px = layers.reduce((s, l) => s + l.width * l.height, 0);
      const raster = d.dpr * Math.min(fit, 1);
      const mb = px * 4 * raster * raster / 1e6;
      const naive = px * 4 * d.dpr * d.dpr / 1e6;
      console.log(`    ${route.id.padEnd(9)} ${String(d.width + 'x' + d.height + '@' + d.dpr + 'x').padEnd(14)} ${String(layers.length).padStart(3)} layers  ~${mb.toFixed(0)} MB  (fit ${fit.toFixed(3)}; dpr-only ${naive.toFixed(0)} MB)`);
      check(layers.length <= MAX_LAYERS, `${route.id} @ ${d.name}: ${layers.length} compositor layers (budget ${MAX_LAYERS})`);
      check(mb <= MAX_TILE_MB, `${route.id} @ ${d.name}: ~${mb.toFixed(0)} MB of tiles (budget ${MAX_TILE_MB})`);
      await p.close();
    }
  }

  console.log(`  wrote ${OUT}/mobile-launcher.png, mobile-blades.png, mobile-nxe.png, mobile-portrait.png`);
} catch (err) {
  fails.push(`threw: ${err instanceof Error ? err.stack : String(err)}`);
} finally {
  if (browser) await browser.close();
}

if (fails.length) { for (const f of fails) console.error('  FAIL ' + f); console.log('SMOKE_FAIL'); process.exit(1); }
console.log('SMOKE_PASS');

/* --------------------------------------------------------------- the harness */

/**
 * One page at one device size.
 *
 * `touch` is what makes the whole suite meaningful: puppeteer's viewport flag
 * turns on touch emulation, and `Emulation.setTouchEmulationEnabled` raises
 * `maxTouchPoints` past the default 1 so a TWO-finger tap can be dispatched at
 * all. Gestures go through the DevTools protocol directly rather than
 * `page.touchscreen`, because Chrome throttles synthesized touchmove and a
 * swipe that loses its moves is not a swipe.
 */
async function open(browser, url, device, touch = true) {
  const page = await browser.newPage();
  await page.setViewport({
    width: device.width, height: device.height, deviceScaleFactor: device.dpr,
    isMobile: touch, hasTouch: touch,
  });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await page.goto(BASE + url, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.waitForFunction(() => document.body.dataset.ready === 'true' || !!document.querySelector('.banner'), { timeout: 60000 });
  const client = await page.target().createCDPSession();
  if (touch) await client.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const settle = (ms = 350) => page.evaluate((n) => new Promise((r) => setTimeout(r, n)), ms);
  return {
    page, pageErrors, settle,
    tap: async (x, y) => {
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await settle(120);
    },
    twoFingerTap: async (x, y) => {
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }, { x: x + 40, y }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await settle(120);
    },
    swipe: async (x0, y0, x1, y1, steps = 8) => {
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
      for (let i = 1; i <= steps; i++) {
        await client.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: x0 + (x1 - x0) * i / steps, y: y0 + (y1 - y0) * i / steps }],
        });
      }
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await settle(120);
    },
    shot: (path) => page.screenshot({ path }),
    // The compositor's layer list, read exactly the way smoke-boot reads it.
    layers: async () => {
      const c = await page.target().createCDPSession();
      await c.send('LayerTree.enable');
      const layers = await new Promise((res) => c.once('LayerTree.layerTreeDidChange', (e) => res(e.layers ?? [])));
      await c.detach();
      return layers;
    },
    close: () => page.close(),
  };
}
