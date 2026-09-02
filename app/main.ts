// Routes:
//   /                       the Blades shell: dashmain plus every blade's
//                           panel scene, resting on the current blade
//   /?scene=<pack>/<path>   one scene
//   /?gallery               every scene in the manifest, as a contact sheet
//   &debug                  the inspector panel
//   &console                apply the console's canvas->framebuffer transform
//   &frame=N                freeze every timeline scope at frame N (deterministic)
//   &play=<scope>:<a>-<b>   play a named-frame range on load; <scope> matches
//                           the tail of a scope id, <a>/<b> are frame names
//   &manual                 do not run the wall clock; the range sits on its
//                           opening frame until __dashApi.stepFrames() moves it
//                           (what the smoke suites use to stay deterministic)
//   &locale=de-de           patch the scene's strings from its .xus table
//   &mute                   build no AudioContext; cues are logged, not heard
//   &focus=N                focus list row N instead of the scene's default
//   &gradxf=k=v,...         override GRADIENT_TRANSFORM fields for the sweep
import {
  AssetIndex, loadScene, Skin, VisualScope, indexVisuals, renderScene, Viewport,
  createTelemetry, emptyReport, publish, startFpsMeter, mountInspector,
  NodeIndex, bindTimelines, TimelineEngine, xuiRegistry, walk, refreshVisibility,
  InputRouter, Button, AudioBank, Strings, ListView, authoredItems,
  DEFAULT_LOCALE, isNativeLocale,
  BLEND_OVERRIDES, GRADIENT_TRANSFORM, FONT_FAMILY, type RenderCtx, type SceneReport, type DashTelemetry, type ListItem,
} from '@runtime/index';
import { CODE_TABLE_LISTS } from '@dash/blades/consoleSettings';
import { BladeShell, OFFLINE, type ShellReport } from '@dash/blades/BladeShell';
import { DEFAULT_TAB } from '@dash/blades/tabs';

/** The hook the smoke suites drive; nothing in the runtime depends on it. */
interface DashApi {
  engine: TimelineEngine;
  /** The Blades shell, on the default route only. */
  shell?: {
    go(tab: number): boolean;
    left(): boolean;
    right(): boolean;
    seekRest(tab?: number): void;
    openLevel(): boolean;
    closeLevel(): boolean;
    report(): ShellReport;
  };
  input: InputRouter;
  audio: AudioBank;
  /** Send one button press through the focus stack, as the pad would. */
  press(button: string): boolean;
  lists(): string[];
  focusList(id: string, index: number): string | null;
  setState(controlId: string, state: string): boolean;
  playRange(scopeId: string, from: string, to?: string): boolean;
  /** Step exactly N timeline frames, synchronously, ignoring wall time. */
  stepFrames(n: number): void;
  scopeIds(): string[];
}
declare global { interface Window { __dashApi?: DashApi } }

const params = new URLSearchParams(location.search);
const host = document.getElementById('app')!;

main().catch((err: unknown) => {
  const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
  const b = document.createElement('div');
  b.className = 'banner';
  b.textContent = msg;
  host.appendChild(b);
  const t = window.__dash;
  if (t) t.errors.push(msg);
  console.error(err);
});

async function main(): Promise<void> {
  // ?blend=5:screen - sweep a candidate BlendMode mapping against the frames.
  for (const spec of params.getAll('blend')) {
    const [n, css] = spec.split(':');
    if (n && css) BLEND_OVERRIDES.set(Number(n), css);
  }
  // ?gradxf=direction=texture,rotation=-1,... - sweep the fill-transform model
  // (tests/smoke/sweep-gradient.mjs). Every key is a field of GRADIENT_TRANSFORM.
  for (const kv of (params.get('gradxf') ?? '').split(',').filter(Boolean)) {
    const [k, v] = kv.split('=');
    if (!k || v === undefined || !(k in GRADIENT_TRANSFORM)) continue;
    (GRADIENT_TRANSFORM as unknown as Record<string, unknown>)[k] = k === 'rotation' ? Number(v) : v;
  }
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/';
  const assets = await AssetIndex.load(base);
  const telemetry = createTelemetry(assets.build);
  startFpsMeter(telemetry);
  await loadFont(telemetry.placeholders);

  const skin = await Skin.load(assets);
  if (params.has('gallery')) await gallery(assets, skin, telemetry);
  else if (params.has('scene')) await single(assets, skin, telemetry, params.get('scene')!);
  else await blades(assets, skin, telemetry);
  document.body.dataset['ready'] = 'true';
}

/** The console face is extracted from the ROM, so a miss is a real placeholder. */
async function loadFont(placeholders: string[]): Promise<void> {
  try {
    // check() only answers for a face the page has already asked for, so load
    // it explicitly before gating first paint on it.
    await document.fonts.load(`16px ${FONT_FAMILY}`);
    await document.fonts.ready;
    if (!document.fonts.check(`16px ${FONT_FAMILY}`)) {
      placeholders.push(`font ${FONT_FAMILY}: ConvectionUI.ttf is not in public/assets/6770/fonts, falling back to a system sans`);
    }
  } catch {
    placeholders.push(`font ${FONT_FAMILY}: could not be checked`);
  }
}

/* ------------------------------------------------------------- the shell */

/**
 * The default route: the whole dashboard. dashmain is one scene carrying every
 * blade transition as a named range, so the shell composes (panels parented
 * into each blade's scContainer) and then only ever plays ranges.
 */
async function blades(assets: AssetIndex, skin: Skin, t: DashTelemetry): Promise<void> {
  const viewportHost = document.createElement('div');
  viewportHost.className = 'xui-viewport';
  host.appendChild(viewportHost);
  const zoom = Number(params.get('zoom') ?? '1') || 1;
  const viewport = new Viewport(viewportHost, { consoleView: !params.has('design'), zoom });

  const report = emptyReport('dashmain/dashmain.xur');
  const nodes = new NodeIndex();
  const engine = new TimelineEngine();
  const shell = await BladeShell.mount({
    assets, skin, nodes, engine, report, host: viewport.canvas,
    state: {
      ...OFFLINE,
      signedIn: params.has('signedin'),
      liveConnected: params.has('live'),
      iptv: params.has('iptv'),
      dashStyle: Number(params.get('style') ?? '0') || 0,
    },
    render: (root, ctx) => renderScene(root, ctx),
  });
  viewport.setCanvas({ w: report.canvas.w, h: report.canvas.h });

  const startTab = Number(params.get('blade') ?? String(DEFAULT_TAB));
  shell.seekRest(Number.isFinite(startTab) ? startTab : DEFAULT_TAB);
  // ?hide=a,b - ablation, to find which element paints a region. AFTER the
  // seek: applyNow rewrites cssText wholesale and would wipe an inline hide.
  for (const id of (params.get('hide') ?? '').split(',').filter(Boolean)) {
    for (const n of nodes.byId.get(id) ?? []) n.el.style.setProperty('display', 'none', 'important');
  }
  publish(t, report);

  const audio = AudioBank.index(assets, params.has('mute'));
  if (!params.has('mute')) audio.unlockOnGesture();
  const input = installBladeInput(shell, t, audio);
  installApi(engine, t, input, audio, []);
  window.__dashApi!.shell = {
    go: (tab) => { const ok = shell.go(tab); syncShell(t, shell); return ok; },
    left: () => { const ok = shell.left(); syncShell(t, shell); return ok; },
    right: () => { const ok = shell.right(); syncShell(t, shell); return ok; },
    seekRest: (tab) => { shell.seekRest(tab); syncShell(t, shell); },
    openLevel: () => { const ok = shell.openLevel(); syncShell(t, shell); return ok; },
    closeLevel: () => { const ok = shell.closeLevel(); syncShell(t, shell); return ok; },
    report: () => shell.report(),
  };
  syncShell(t, shell);
  runClock(engine, t);

  if (params.has('debug')) mountInspector(host, shell.dashmain.root, viewport.canvas);
}

/** Left/right switch the blade; A opens a level, B closes one. */
function installBladeInput(shell: BladeShell, t: DashTelemetry, audio: AudioBank): InputRouter {
  const router = new InputRouter();
  router.push({
    id: 'blades',
    onButton: (b) => {
      if (b === Button.Left) shell.left();
      else if (b === Button.Right) shell.right();
      else if (b === Button.A) shell.openLevel();
      else if (b === Button.B) shell.closeLevel();
      else return;
      syncShell(t, shell);
      t.input = router.log.slice(-40).map((e) => ({ button: e.button, repeat: e.repeat, layer: e.layer }));
      t.cues = audio.log.slice(-40).map((e) => ({ cue: e.cue, scope: e.scope, tick: e.tick, played: e.played }));
    },
  });
  router.attach();
  return router;
}

function syncShell(t: DashTelemetry, shell: BladeShell): void {
  t.shell = shell.report();
}

async function single(assets: AssetIndex, skin: Skin, t: DashTelemetry, id: string): Promise<void> {
  const viewportHost = document.createElement('div');
  viewportHost.className = 'xui-viewport';
  host.appendChild(viewportHost);
  const zoom = Number(params.get('zoom') ?? '1') || 1;
  const viewport = new Viewport(viewportHost, { consoleView: !params.has('design'), zoom });

  const scene = await loadScene(assets, id);
  const report = emptyReport(id);
  report.unknownClasses.push(...scene.unknownClasses);

  // Strings are patched into the PARSED tree before it is rendered: en is the
  // literal already in the .xur, so only a real locale changes anything.
  const strings = new Strings(assets);
  const locale = params.get('locale') ?? DEFAULT_LOCALE;
  t.locale = locale;
  if (!isNativeLocale(locale)) {
    const patches = await strings.applyLocale(scene.root, xuiRegistry(), scene.pack, scene.path, locale);
    t.localePatches = patches.length;
    if (patches.length === 0) report.errors.push(`locale ${locale}: no table for ${scene.id}`);
  }

  const nodes = new NodeIndex();
  const ctx: RenderCtx = { assets, pack: scene.pack, visuals: new VisualScope(indexVisuals(scene.root), skin), report, nodes };
  viewport.mount(renderScene(scene.root, ctx));
  // The scene's own XuiCanvas decides the canvas; only the dashboard root is
  // 1120x770, and only that one gets the console's view transform.
  viewport.setCanvas({ w: report.canvas.w, h: report.canvas.h });
  publish(t, report);

  const engine = bindTimelines(nodes);
  const audio = AudioBank.index(assets, params.has('mute'));
  if (!params.has('mute')) audio.unlockOnGesture();
  const lists = await populateLists(scene, ctx, nodes, engine, strings, t);
  // The visibility snapshot inside renderScene measured the scene BEFORE the
  // lists were filled, so an empty lstSettings read as invisible. Retake it.
  refreshVisibility(viewport.canvas.firstElementChild as HTMLElement, report);
  publish(t, report);
  const input = installInput(engine, lists, t, audio);
  installApi(engine, t, input, audio, lists);
  runClock(engine, t);

  if (params.has('debug')) mountInspector(host, scene.root, viewport.canvas);
}

/** ?frame= and ?play= are the deterministic entry points; without either, the
 *  scene stays on the still frame the renderer chose and nothing ticks. */
function runClock(engine: TimelineEngine, t: DashTelemetry): void {
  const frame = params.get('frame');
  if (frame !== null && Number.isFinite(Number(frame))) engine.freeze(Number(frame));

  for (const spec of params.getAll('play')) {
    const m = /^(.*?):([^-]+)(?:-(.+))?$/.exec(spec);
    if (!m) { t.errors.push(`bad ?play= "${spec}"`); continue; }
    const [, wanted, from, to] = m;
    const scope = engine.all().find((s) => s.id === wanted || s.id.endsWith('/' + wanted) || s.obj.className === wanted);
    if (!scope) { t.errors.push(`?play= names no scope: "${wanted}"`); continue; }
    if (!engine.playRange(scope.id, from!, to)) t.errors.push(`?play= no named frame "${from}" in ${scope.id}`);
  }

  // ?frame= pins the engine outright, and ?manual hands the clock to the test
  // harness; either way nothing advances on its own.
  if (params.has('manual') || engine.frozenAt !== null) {
    t.timeline = { ...engine.report(), fps: 0 };
    return;
  }

  let last = performance.now();
  let stepped = 0;
  let window1s = last;
  const loop = (now: number) => {
    stepped += engine.tick(now - last);
    last = now;
    if (now - window1s >= 1000) {
      t.timeline = { ...engine.report(), fps: Math.round((stepped * 1000) / (now - window1s)) };
      stepped = 0; window1s = now;
    } else {
      t.timeline = { ...engine.report(), fps: t.timeline.fps };
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function installApi(engine: TimelineEngine, t: DashTelemetry, input: InputRouter, audio: AudioBank, lists: ListView[]): void {
  window.__dashApi = {
    engine, input, audio,
    press: (b) => { const ok = input.press(b as Button); syncInput(t, input, audio); return ok; },
    lists: () => lists.map((l) => l.id),
    focusList: (id, i) => {
      const l = lists.find((x) => x.id === id);
      const f = l ? l.focus(i) : null;
      t.focusId = f;
      return f;
    },
    setState: (controlId, state) => { const ok = engine.setState(controlId, state); t.timeline = { ...engine.report(), fps: t.timeline.fps }; return ok; },
    playRange: (scopeId, from, to) => { const ok = engine.playRange(scopeId, from, to); t.timeline = { ...engine.report(), fps: t.timeline.fps }; return ok; },
    stepFrames: (n) => { for (let i = 0; i < n; i++) engine.step(); t.timeline = { ...engine.report(), fps: t.timeline.fps }; },
    scopeIds: () => engine.all().map((s) => s.id),
  };
}

/* ------------------------------------------------------------------- lists */

/**
 * Fill every list in the scene. A XuiCommonList that declares ItemsText fills
 * itself (31 scenes do); the Console Settings list does not, so its rows come
 * from the positional table the console indexed - see dashboards/blades.
 */
async function populateLists(
  scene: { id: string; root: import('@xur/index').XuObject; pack: string },
  ctx: RenderCtx, nodes: NodeIndex, engine: TimelineEngine, strings: Strings, t: DashTelemetry,
): Promise<ListView[]> {
  const out: ListView[] = [];
  const positional = CODE_TABLE_LISTS[scene.id];
  let table: string[] = [];
  if (positional) table = await strings.stringsByIndex(positional.pack, positional.table);

  const listObjects: import('@xur/index').XuObject[] = [];
  walk(scene.root, (o) => { if (o.className === 'XuiList' || o.className === 'XuiCommonList') listObjects.push(o); });

  for (const list of listObjects) {
    const node = nodes.all.find((n) => n.obj === list);
    if (!node) continue;
    let items: ListItem[] = authoredItems(list);
    if (items.length === 0 && positional && table.length) {
      items = positional.rows.map((r) => ({ text: table[r.label] ?? `#${r.label}` }));
    }
    if (items.length === 0) continue;
    const view = new ListView(list, node, ctx, nodes, engine, xuiRegistry());
    view.setItems(items);
    out.push(view);
  }

  if (out.length) {
    const first = out[0]!;
    const wanted = Number(params.get('focus') ?? (positional ? positional.focus : 0));
    t.focusId = first.focus(Number.isFinite(wanted) ? wanted : 0, 'InitFocus');
  }
  return out;
}

/* ------------------------------------------------------------------- input */

/** One layer per scene: the top of the stack owns every press. */
function installInput(engine: TimelineEngine, lists: ListView[], t: DashTelemetry, audio: AudioBank): InputRouter {
  const router = new InputRouter();
  router.push({
    id: 'scene',
    onButton: (b) => {
      const list = lists[0];
      if (!list) return;
      if (b === Button.Down || b === Button.Up) {
        // move() returns null when the clamp absorbed it. Nothing happened, so
        // nothing plays: no state re-entry and no cue. A held d-pad at the end
        // of a list is silent on the console too.
        const moved = list.move(b === Button.Down ? 1 : -1);
        if (moved !== null) {
          t.focusId = moved;
          fire(audio, engine, t, 'Focus');
        }
      } else if (b === Button.A) {
        const row = list.focusIndex;
        if (row >= 0) engine.setState(`${list.id}_item${row}`, 'Press');
        fire(audio, engine, t, 'Press');
      } else if (b === Button.B) {
        fire(audio, engine, t, 'Back');
      }
      syncInput(t, router, audio);
    },
  });
  router.attach();
  return router;
}

/** A state change fires the cue the state maps to, tagged with the timeline
 *  frame it happened on. */
function fire(audio: AudioBank, engine: TimelineEngine, t: DashTelemetry, state: string): void {
  const cue = audio.cueForState(state);
  if (!cue) return;
  const tick = engine.all().find((s) => s.playing)?.tick ?? 0;
  const ev = audio.play(cue, null, tick);
  t.lastCue = ev.cue;
}

function syncInput(t: DashTelemetry, input: InputRouter, audio: AudioBank): void {
  t.input = input.log.slice(-40).map((e) => ({ button: e.button, repeat: e.repeat, layer: e.layer }));
  t.cues = audio.log.slice(-40).map((e) => ({ cue: e.cue, scope: e.scope, tick: e.tick, played: e.played }));
  t.lastCue = audio.log.length ? audio.log[audio.log.length - 1]!.cue : t.lastCue;
}

async function gallery(assets: AssetIndex, skin: Skin, t: DashTelemetry): Promise<void> {
  const wrap = document.createElement('div');
  wrap.className = 'gallery';
  const h = document.createElement('h1');
  wrap.appendChild(h);
  host.appendChild(wrap);

  const ids = assets.scenePaths();
  h.textContent = `build ${assets.build} - ${ids.length} scenes`;

  for (const id of ids) {
    const report = emptyReport(id);
    const item = document.createElement('div');
    item.className = 'gallery-item';
    item.dataset['scene'] = id;
    const label = document.createElement('div');
    label.className = 'gallery-label';
    const frame = document.createElement('div');
    frame.className = 'gallery-frame';
    item.append(label, frame);
    wrap.appendChild(item);

    try {
      const scene = await loadScene(assets, id);
      report.unknownClasses.push(...scene.unknownClasses);
      const ctx: RenderCtx = { assets, pack: scene.pack, visuals: new VisualScope(indexVisuals(scene.root), skin), report };
      frame.appendChild(renderScene(scene.root, ctx));
    } catch (err) {
      report.errors.push(err instanceof Error ? err.message : String(err));
    }
    label.innerHTML = '';
    const b = document.createElement('b');
    b.textContent = id;
    label.appendChild(b);
    label.appendChild(summary(report));
    t.gallery.push(report);
  }
  publish(t, { ...emptyReport('(gallery)'), scene: '(gallery)' });
  t.gallery.forEach((r) => { t.objects += r.objects; t.controls += r.controls; });
}

function summary(r: SceneReport): HTMLElement {
  const bad = r.unknownClasses.length + r.unresolvedVisuals.length + r.missingImages.length + r.errors.length;
  const s = document.createElement('span');
  if (bad) s.className = 'bad';
  s.textContent = [
    `${r.objects} objects`,
    r.unknownClasses.length ? `unknown ${r.unknownClasses.join(',')}` : '',
    r.unresolvedVisuals.length ? `no visual ${r.unresolvedVisuals.join(',')}` : '',
    r.missingImages.length ? `missing ${r.missingImages.join(',')}` : '',
    r.errors.length ? `ERROR ${r.errors.join('; ')}` : '',
  ].filter(Boolean).join('  |  ');
  return s;
}
