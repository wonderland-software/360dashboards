// Routes:
//   /                       the launcher: pick Blades or NXE (app/launcher.ts)
//   /?build=6770            the Blades shell: dashmain plus every blade's
//                           panel scene, resting on the current blade
//   /?scene=<pack>/<path>   one scene
//   /?gallery               every scene in the manifest, as a contact sheet
//   &debug                  the inspector panel
//   &blade=N                drop onto blade N's rest state instead of booting
//   &boot=<range>           play a named boot range (default BootLive);
//                           &boot=none parks on DefaultTab without one
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
//   ?build=9199             serve NXE 9199 instead of Blades 6770. The same
//                           app serves both: the manifest, the class registry,
//                           the skin, the string tables, the audio bank and the
//                           viewport all take the build. The default is 6770
//                           and every route above behaves exactly as before.
//   &page=<pack>/<file>     (9199) host that 880x480 legacy page in the shell
//                           instead of the home strip
//   &channel=<id>           (9199) come up on that channel instead of the XML's
//                           own <defaultchannelid>
//   &iptv                   (9199 too) an IPTV provider is configured, so
//                           System Settings shows its eighth row
//
// On ?build=9199 the pad drives the strip: left/right move the PANEL cursor,
// up/down the CHANNEL cursor (the opposite axis assignment to Blades), A runs
// the focused slot's <onclick> and B pops the page stack. All of it is a
// per-frame integrator on the timeline's own 60 Hz clock, so &manual +
// __dashApi.stepFrames() reproduces any position exactly.
import {
  AssetIndex, loadScene, Skin, VisualScope, indexVisuals, renderScene, Viewport,
  createTelemetry, emptyReport, publish, startFpsMeter, mountInspector,
  NodeIndex, bindTimelines, TimelineEngine, xuiRegistry, refreshVisibility,
  InputRouter, Button, AudioBank, Strings, ListView,
  DEFAULT_LOCALE, isNativeLocale,
  BLEND_OVERRIDES, GRADIENT_TRANSFORM, FONT_FAMILY, parseBuild, setActiveBuild, activeBuild,
  type RenderCtx, type SceneReport, type DashTelemetry,
} from '@runtime/index';
import { NxeShell, type NxeReport } from '@dash/nxe/NxeShell';
import { BladeShell, OFFLINE, type ShellReport } from '@dash/blades/BladeShell';
import { DEFAULT_TAB } from '@dash/blades/tabs';
import { populateLists } from '@dash/blades/lists';
import { DEFAULT_BOOT } from '@dash/blades/boot';
import { launcher } from './launcher';
import type { NavDirection } from '@dash/blades/focus';

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
    /** A on the focused control: resolve its PressPath and push the scene. */
    press(): Promise<boolean>;
    /** B: pop the top scene. */
    back(): boolean;
    move(dir: NavDirection): string | null;
    boot(range?: string): boolean;
    /** Resolve once every load the shell started has finished. */
    idle(): Promise<void>;
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
  /** The NXE shell's report, on ?build=9199 only. */
  nxe?: () => NxeReport;
  /** The NXE shell's navigation, on ?build=9199 only. */
  nxeShell?: {
    /** The panel cursor, within the current channel. */
    left(): boolean;
    right(): boolean;
    /** The channel cursor. */
    up(): boolean;
    down(): boolean;
    /** A: the focused slot's <onclick>, or the focused row of a hosted page. */
    press(): Promise<boolean>;
    /** B: pop the page stack. */
    back(): boolean;
    idle(): Promise<void>;
    report(): NxeReport;
  };
  /** Step exactly N timeline frames, synchronously, ignoring wall time. */
  stepFrames(n: number): void;
  scopeIds(): string[];
  /** Tear this mount down and build it again, the way a hot update does.
   *  The smoke suite drives it to prove nothing is left behind. */
  remount(): Promise<void>;
}
declare global { interface Window { __dashApi?: DashApi } }

const params = new URLSearchParams(location.search);
const host = document.getElementById('app')!;

/* ------------------------------------------------------------- the mount */

/**
 * Everything ONE run of main() created that a second run must not inherit.
 *
 * main() runs at module scope, and a Vite dev server re-executes this module on
 * every hot update. Without a teardown, each reload appended a SECOND viewport
 * to `#app`, attached a SECOND InputRouter to the window, and started a second
 * rAF clock and a second AudioContext - so one key press drove two shells, both
 * of which were still in the document. That is what stacked the Blades
 * metapane's descriptions on a dev server that had been up for hours: the
 * descriptions were not accumulating in one pane, there were N panes.
 *
 * So the module owns a disposer list, `teardown()` runs it, and
 * `import.meta.hot` is wired to it. `__dashApi.remount()` is the same path, and
 * it is what the smoke suite drives - a leak that only a human notices after an
 * afternoon of editing is not a leak anyone will find, so it has a test.
 */
const disposers: (() => void)[] = [];
function onDispose(fn: () => void): void { disposers.push(fn); }

export function teardown(): void {
  // Last in, first out: the clock stops before the shell it drives goes away.
  while (disposers.length) {
    const fn = disposers.pop()!;
    try { fn(); } catch (err) { console.error(err); }
  }
  host.replaceChildren();
  delete (window as { __dashApi?: DashApi }).__dashApi;
  delete document.body.dataset['ready'];
}

/** How many times main() has run in this page. Reported, so a suite can prove
 *  it really did remount rather than measure the first mount twice. */
let mounts = 0;

function boot(): void {
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
}
boot();

// A hot update replaces this module: tear the old mount down first, then let
// the new copy of main() run. Every module the app imports propagates its
// update up to this one, so the whole app is rebuilt from a clean page rather
// than layered on top of the last one.
if (import.meta.hot) {
  import.meta.hot.dispose(() => teardown());
  import.meta.hot.accept();
}

async function main(): Promise<void> {
  // A bare `/` is the launcher: pick Blades or NXE. Every dashboard route
  // carries at least ?build= (or a scene/gallery switch), so nothing that the
  // suites or the judges open goes through here.
  if (!location.search) {
    launcher(host, onDispose);
    document.body.dataset['ready'] = 'true';
    return;
  }
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
  // The build is chosen BEFORE anything loads: it picks the manifest, the class
  // registry every .xur is parsed with, and the canvas -> framebuffer view.
  const { build, error } = parseBuild(params.get('build'));
  setActiveBuild(build);
  const assets = await AssetIndex.load(base, build);
  const telemetry = createTelemetry(assets.build);
  mounts += 1;
  onDispose(startFpsMeter(telemetry));
  await loadFont(assets.base + `assets/${build}/fonts/`, telemetry.placeholders);

  const skin = await Skin.load(assets, activeBuild().skin);
  if (params.has('gallery')) await gallery(assets, skin, telemetry);
  else if (params.has('scene')) await single(assets, skin, telemetry, params.get('scene')!);
  else if (build === '9199') await nxe(assets, skin, telemetry);
  else await blades(assets, skin, telemetry);
  // AFTER the route: publish() replaces the telemetry's errors with the
  // scene report's, so a message pushed before it would vanish.
  if (error) telemetry.errors.push(error);
  syncHmr(telemetry);
  document.body.dataset['ready'] = 'true';
}

/** The live-singleton census. Every count is 1 on a healthy page, however many
 *  times the app has been mounted. */
function syncHmr(t: DashTelemetry): void {
  t.hmr = {
    mounts,
    viewports: Viewport.live.size,
    inputRouters: InputRouter.attached.size,
    audioContexts: AudioBank.open.size,
    clocks: liveClocks,
  };
}
let liveClocks = 0;

/** The console face is extracted from the ROM, so a miss is a real placeholder. */
async function loadFont(fontDir: string, placeholders: string[]): Promise<void> {
  try {
    // check() only answers for a face the page has already asked for, so load
    // it explicitly before gating first paint on it.
    await document.fonts.load(`16px ${FONT_FAMILY}`);
    await document.fonts.ready;
    if (!document.fonts.check(`16px ${FONT_FAMILY}`)) {
      placeholders.push(`font ${FONT_FAMILY}: ConvectionUI.ttf is not in ${fontDir}, falling back to a system sans`);
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
  const strings = new Strings(assets);
  // ?locale= belongs to the SHELL, not to one scene: the driven dashboard is a
  // dozen files (dashmain, five blade panels, the banners, the tray strip and
  // every page a press opens) and a locale applied only to the first would
  // leave the rest in English. BladeShell.loadLocalized patches each one before
  // it renders and counts the patches, so `localePatches` is assertable.
  const locale = params.get('locale') ?? DEFAULT_LOCALE;
  t.locale = locale;
  const shell = await BladeShell.mount({
    assets, skin, nodes, engine, report, host: viewport.canvas, strings, locale,
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

  // ?blade=N drops straight onto a blade's rest state (what the stills and
  // most of the smoke suites want). With no blade named, the console boots:
  // the dispatcher's cold-boot default is BootLive, landing on Xbox LIVE.
  // ?boot=<range> picks another of the fifteen; ?boot=none skips it.
  const blade = params.get('blade');
  const bootParam = params.get('boot');
  if (blade !== null) {
    const startTab = Number(blade);
    shell.seekRest(Number.isFinite(startTab) ? startTab : DEFAULT_TAB);
  } else if (bootParam === 'none') {
    shell.seekRest(DEFAULT_TAB);
  } else {
    shell.boot(bootParam || DEFAULT_BOOT);
  }
  // ?hide=a,b - ablation, to find which element paints a region. AFTER the
  // seek: applyNow rewrites cssText wholesale and would wipe an inline hide.
  // Every later seek does the same, so this re-runs after runClock too -
  // ?frame=N with ?hide= used to render with nothing hidden at all.
  const applyHides = () => {
    for (const id of (params.get('hide') ?? '').split(',').filter(Boolean)) {
      for (const n of nodes.byId.get(id) ?? []) n.el.style.setProperty('display', 'none', 'important');
    }
  };
  applyHides();
  publish(t, report);

  const audio = AudioBank.index(assets, params.has('mute'));
  if (!params.has('mute')) audio.unlockOnGesture();
  audio.attach(engine);
  const input = installBladeInput(shell, t, audio);
  onDispose(() => { input.detach(); audio.close(); viewport.dispose(); });
  installApi(engine, t, input, audio, []);
  window.__dashApi!.shell = {
    go: (tab) => { const ok = shell.go(tab); syncShell(t, shell, audio); return ok; },
    left: () => { const ok = shell.left(); syncShell(t, shell, audio); return ok; },
    right: () => { const ok = shell.right(); syncShell(t, shell, audio); return ok; },
    seekRest: (tab) => { shell.seekRest(tab); syncShell(t, shell, audio); },
    openLevel: () => { const ok = shell.openLevel(); syncShell(t, shell, audio); return ok; },
    closeLevel: () => { const ok = shell.closeLevel(); syncShell(t, shell, audio); return ok; },
    press: async () => { const ok = await shell.press(); await shell.idle(); syncShell(t, shell, audio); return ok; },
    back: () => { const ok = shell.back(); syncShell(t, shell, audio); return ok; },
    move: (dir) => { const id = shell.moveFocus(dir); syncShell(t, shell, audio); void shell.idle().then(() => syncShell(t, shell, audio)); return id; },
    boot: (range) => { const ok = shell.boot(range); syncShell(t, shell, audio); return ok; },
    idle: async () => { await shell.idle(); syncShell(t, shell, audio); },
    report: () => shell.report(),
  };
  // A metapane sub-scene is fetched, so the first report has to wait for it or
  // it would say "no scene" about one that is already on screen.
  await shell.idle();
  syncShell(t, shell, audio);
  runClock(engine, t);
  applyHides();

  if (params.has('debug')) mountInspector(host, shell.dashmain.root, viewport.canvas);
}

/**
 * Left/right and the shoulder buttons switch the blade; up/down walk the
 * scene's own NavUp/NavDown chain; A presses the focused control and B goes
 * back. Left/right are the blade switch because no control in the build sets
 * NavLeft or NavRight - XuiTabScene owns that axis - and both LB/RB and the
 * d-pad reach it. A locked tab (a page is open) simply refuses.
 */
function installBladeInput(shell: BladeShell, t: DashTelemetry, audio: AudioBank): InputRouter {
  const router = new InputRouter();
  router.push({
    id: 'blades',
    onButton: (b) => {
      if (b === Button.Left || b === Button.LB) shell.left();
      else if (b === Button.Right || b === Button.RB) shell.right();
      else if (b === Button.Up) { shell.moveFocus('Up'); void shell.idle().then(() => syncShell(t, shell, audio)); }
      else if (b === Button.Down) { shell.moveFocus('Down'); void shell.idle().then(() => syncShell(t, shell, audio)); }
      else if (b === Button.A) void shell.press().then(() => shell.idle()).then(() => syncShell(t, shell, audio));
      else if (b === Button.B) shell.back();
      else if (b === Button.Guide) noteGuide(t);
      else return;
      syncShell(t, shell, audio);
    },
  });
  router.attach();
  return router;
}

/**
 * The Guide button. PLACEHOLDERS.md says it is a no-op that records itself, so
 * it has to actually record itself: the guide panel is drawn by the console's
 * system software (xam.xex / xshell, in system flash) and no scene in the 29
 * packs or shrdres names it, so there is nothing in this archive to show.
 * Recorded once, not once per press, so a held button cannot flood the list.
 */
const GUIDE_PLACEHOLDER = 'Guide button: the guide panel is xam.xex/xshell, not in the dashboard archive - no-op';
function noteGuide(t: DashTelemetry): void {
  if (!t.placeholders.includes(GUIDE_PLACEHOLDER)) t.placeholders.push(GUIDE_PLACEHOLDER);
}

function syncShell(t: DashTelemetry, shell: BladeShell, audio: AudioBank): void {
  const r = shell.report();
  t.shell = r;
  t.focusId = r.focusId;
  t.locale = r.locale;
  t.localePatches = r.localePatches;
  t.input = window.__dashApi?.input.log.slice(-40).map((e) => ({ button: e.button, repeat: e.repeat, layer: e.layer })) ?? t.input;
  t.cues = audio.log.slice(-40).map((e) => ({ cue: e.cue, scope: e.scope, tick: e.tick, played: e.played }));
  t.lastCue = audio.log.length ? audio.log[audio.log.length - 1]!.cue : t.lastCue;
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
  audio.attach(engine);
  const filled = await populateLists(scene, ctx, nodes, engine, strings, locale);
  const lists = filled.lists;
  if (lists.length) {
    // The still route reproduces f0060, where the operator had scrolled to
    // Locale; the shell arrives on row 0 the way a fresh list does.
    const wanted = Number(params.get('focus') ?? String(filled.stillFocus));
    t.focusId = lists[0]!.focus(Number.isFinite(wanted) ? wanted : 0, 'InitFocus');
  }
  // The visibility snapshot inside renderScene measured the scene BEFORE the
  // lists were filled, so an empty lstSettings read as invisible. Retake it.
  refreshVisibility(viewport.canvas.firstElementChild as HTMLElement, report);
  publish(t, report);
  const input = installInput(engine, lists, t, audio);
  onDispose(() => { input.detach(); audio.close(); viewport.dispose(); });
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
  let raf = 0;
  liveClocks += 1;
  const loop = (now: number) => {
    stepped += engine.tick(now - last);
    last = now;
    if (now - window1s >= 1000) {
      t.timeline = { ...engine.report(), fps: Math.round((stepped * 1000) / (now - window1s)) };
      stepped = 0; window1s = now;
    } else {
      t.timeline = { ...engine.report(), fps: t.timeline.fps };
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  // A clock that outlives its engine keeps a whole shell alive and stepping in
  // a page the user cannot see - the second half of the dev-server leak.
  onDispose(() => { cancelAnimationFrame(raf); liveClocks -= 1; });
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
    remount: async () => { teardown(); await main(); },
  };
}

/* ------------------------------------------------------------- the NXE shell */

/**
 * ?build=9199. The NXE home page is not a scene: homepage/homepage.xur is three
 * empty groups, and NxeShell composes the channel queue and the panel strip out
 * of homepage/emb_homepage.xml, the epix:// channel files and
 * controlp/Variables.xur. &page=<pack>/<file> hosts a legacy 880x480 page in the
 * same shell instead.
 */
async function nxe(assets: AssetIndex, skin: Skin, t: DashTelemetry): Promise<void> {
  const viewportHost = document.createElement('div');
  viewportHost.className = 'xui-viewport';
  host.appendChild(viewportHost);
  const zoom = Number(params.get('zoom') ?? '1') || 1;
  // consoleView is still the right flag: it just resolves to the IDENTITY view
  // transform on 9199, whose scenes are 1280x720 and land 1:1 (build.ts).
  const viewport = new Viewport(viewportHost, { consoleView: !params.has('design'), zoom });

  const report = emptyReport('homepage/homepage.xur');
  const nodes = new NodeIndex();
  const engine = new TimelineEngine();
  const strings = new Strings(assets);
  const locale = params.get('locale') ?? DEFAULT_LOCALE;
  t.locale = locale;

  const shell = await NxeShell.mount({
    assets, skin, nodes, engine, report, host: viewport.canvas, strings, locale,
    state: {
      page: params.get('page'),
      channel: params.get('channel'),
      iptv: params.has('iptv'),
      // Every console-state predicate is a switch, because none of them can be
      // answered from this archive; the defaults are the offline/no-profile
      // state the 8955 capture is in (dashboards/nxe/epix.ts).
      liveTierNone: !params.has('live'),
      hdDvdInstalled: params.has('hddvd'),
      mediaroomEnabled: params.has('mediaroom'),
      showWelcomeChannel: !params.has('nowelcome'),
    },
    render: (root, ctx) => renderScene(root, ctx),
  });
  viewport.setCanvas({ w: report.canvas.w, h: report.canvas.h });
  await shell.idle();
  publish(t, report);
  t.nxe = shell.report();

  const audio = AudioBank.index(assets, params.has('mute'));
  if (!params.has('mute')) audio.unlockOnGesture();
  audio.attach(engine);
  // The eight navigation cues are named in a CODE table and played by the GLUE
  // (NXE_GLUE_SPEC §2.3), the opposite of the Blades rule where every cue is a
  // XuiSoundXAudio.File keyframe. So the shell gets the bank, not the engine.
  shell.attach(audio);
  const input = installNxeInput(shell, t, audio);
  onDispose(() => { input.detach(); audio.close(); shell.dispose(); viewport.dispose(); });
  installApi(engine, t, input, audio, []);
  const api = window.__dashApi!;
  api.nxe = () => shell.report();
  api.nxeShell = {
    left: () => nxeStep(shell, t, audio, () => shell.movePanel(-1)),
    right: () => nxeStep(shell, t, audio, () => shell.movePanel(1)),
    up: () => nxeStep(shell, t, audio, () => shell.moveChannel(1)),
    down: () => nxeStep(shell, t, audio, () => shell.moveChannel(-1)),
    press: async () => { const ok = await shell.press(); await shell.idle(); syncNxe(t, shell, audio); return ok; },
    back: () => nxeStep(shell, t, audio, () => shell.back()),
    idle: async () => { await shell.idle(); syncNxe(t, shell, audio); },
    report: () => shell.report(),
  };
  syncNxe(t, shell, audio);
  runClock(engine, t);

  if (params.has('debug')) mountInspector(host, shell.home.root, viewport.canvas);
}

/**
 * NXE's pad. Left/right move the PANEL cursor and up/down the CHANNEL cursor -
 * the opposite axis assignment to Blades, where left/right switch the blade,
 * and it is the file's: `MobyPanelInput*` is named for the d-pad's horizontal
 * axis and `MobyChannelInput*` for the vertical [SPEC §2.3]. A is the focused
 * slot's `<onclick>`, B pops the page stack.
 */
function installNxeInput(shell: NxeShell, t: DashTelemetry, audio: AudioBank): InputRouter {
  const router = new InputRouter();
  router.push({
    id: 'nxe',
    onButton: (b) => {
      if (b === Button.Left) shell.movePanel(-1);
      else if (b === Button.Right) shell.movePanel(1);
      // UP moves to the channel drawn ABOVE the current one, which is the NEXT
      // channel in file order (NxeShell's QUEUE_ROWS header).
      else if (b === Button.Up) shell.moveChannel(1);
      else if (b === Button.Down) shell.moveChannel(-1);
      else if (b === Button.A) { void shell.press().then(() => shell.idle()).then(() => syncNxe(t, shell, audio)); }
      else if (b === Button.B) shell.back();
      else if (b === Button.Guide) noteGuide(t);
      else return;
      syncNxe(t, shell, audio);
    },
  });
  router.attach();
  return router;
}

function nxeStep(shell: NxeShell, t: DashTelemetry, audio: AudioBank, fn: () => boolean): boolean {
  const ok = fn();
  syncNxe(t, shell, audio);
  void shell.idle().then(() => syncNxe(t, shell, audio));
  return ok;
}

function syncNxe(t: DashTelemetry, shell: NxeShell, audio: AudioBank): void {
  t.nxe = shell.report();
  t.input = window.__dashApi?.input.log.slice(-40).map((e) => ({ button: e.button, repeat: e.repeat, layer: e.layer })) ?? t.input;
  t.cues = audio.log.slice(-60).map((e) => ({ cue: e.cue, scope: e.scope, tick: e.tick, played: e.played }));
  t.lastCue = audio.log.length ? audio.log[audio.log.length - 1]!.cue : t.lastCue;
}

/* ------------------------------------------------------------------- input */

/** One layer per scene: the top of the stack owns every press. */
function installInput(engine: TimelineEngine, lists: ListView[], t: DashTelemetry, audio: AudioBank): InputRouter {
  const router = new InputRouter();
  router.push({
    id: 'scene',
    onButton: (b) => {
      if (b === Button.Guide) { noteGuide(t); return; }
      const list = lists[0];
      if (!list) return;
      // Every cue below comes out of a visual's own File track: the row's
      // Focus frame carries btn_Focus.xma, its Press frame btn_Select.xma and
      // legend_B's Press frame btn_Back.xma. move() returns null when the
      // clamp absorbed it: nothing happened, so nothing plays, no state
      // re-entry and no cue. A held d-pad at the end of a list is silent on
      // the console too.
      if (b === Button.Down || b === Button.Up) {
        const moved = list.move(b === Button.Down ? 1 : -1);
        if (moved !== null) t.focusId = moved;
      } else if (b === Button.A) {
        const row = list.focusIndex;
        if (row >= 0) engine.setState(`${list.id}_item${row}`, 'Press');
      } else if (b === Button.B) {
        engine.setState('legend_b', 'Press');
      }
      syncInput(t, router, audio);
    },
  });
  router.attach();
  return router;
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
