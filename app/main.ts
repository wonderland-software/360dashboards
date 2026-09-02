// Routes:
//   /                       dashmain/dashmain.xur with the shared skin
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
import {
  AssetIndex, loadScene, Skin, VisualScope, indexVisuals, renderScene, Viewport,
  createTelemetry, emptyReport, publish, startFpsMeter, mountInspector,
  NodeIndex, bindTimelines, TimelineEngine,
  FONT_FAMILY, type RenderCtx, type SceneReport, type DashTelemetry,
} from '@runtime/index';

/** The hook the smoke suites drive; nothing in the runtime depends on it. */
interface DashApi {
  engine: TimelineEngine;
  setState(controlId: string, state: string): boolean;
  playRange(scopeId: string, from: string, to?: string): boolean;
  /** Step exactly N timeline frames, synchronously, ignoring wall time. */
  stepFrames(n: number): void;
  scopeIds(): string[];
}
declare global { interface Window { __dashApi?: DashApi } }

const DEFAULT_SCENE = 'dashmain/dashmain.xur';

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
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/';
  const assets = await AssetIndex.load(base);
  const telemetry = createTelemetry(assets.build);
  startFpsMeter(telemetry);
  await loadFont(telemetry.placeholders);

  const skin = await Skin.load(assets);
  if (params.has('gallery')) await gallery(assets, skin, telemetry);
  else await single(assets, skin, telemetry, params.get('scene') ?? DEFAULT_SCENE);
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

async function single(assets: AssetIndex, skin: Skin, t: DashTelemetry, id: string): Promise<void> {
  const viewportHost = document.createElement('div');
  viewportHost.className = 'xui-viewport';
  host.appendChild(viewportHost);
  const zoom = Number(params.get('zoom') ?? '1') || 1;
  const viewport = new Viewport(viewportHost, { consoleView: params.has('console'), zoom });

  const scene = await loadScene(assets, id);
  const report = emptyReport(id);
  report.unknownClasses.push(...scene.unknownClasses);
  const nodes = new NodeIndex();
  const ctx: RenderCtx = { assets, pack: scene.pack, visuals: new VisualScope(indexVisuals(scene.root), skin), report, nodes };
  viewport.mount(renderScene(scene.root, ctx));
  publish(t, report);

  const engine = bindTimelines(nodes);
  installApi(engine, t);
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

function installApi(engine: TimelineEngine, t: DashTelemetry): void {
  window.__dashApi = {
    engine,
    setState: (controlId, state) => { const ok = engine.setState(controlId, state); t.timeline = { ...engine.report(), fps: t.timeline.fps }; return ok; },
    playRange: (scopeId, from, to) => { const ok = engine.playRange(scopeId, from, to); t.timeline = { ...engine.report(), fps: t.timeline.fps }; return ok; },
    stepFrames: (n) => { for (let i = 0; i < n; i++) engine.step(); t.timeline = { ...engine.report(), fps: t.timeline.fps }; },
    scopeIds: () => engine.all().map((s) => s.id),
  };
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
