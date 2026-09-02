// Routes:
//   /                       dashmain/dashmain.xur with the shared skin
//   /?scene=<pack>/<path>   one scene
//   /?gallery               every scene in the manifest, as a contact sheet
//   &debug                  the inspector panel
//   &console                apply the console's canvas->framebuffer transform
import {
  AssetIndex, loadScene, Skin, VisualScope, indexVisuals, renderScene, Viewport,
  createTelemetry, emptyReport, publish, startFpsMeter, mountInspector,
  FONT_FAMILY, type RenderCtx, type SceneReport,
} from '@runtime/index';

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

async function single(assets: AssetIndex, skin: Skin, t: ReturnType<typeof createTelemetry>, id: string): Promise<void> {
  const viewportHost = document.createElement('div');
  viewportHost.className = 'xui-viewport';
  host.appendChild(viewportHost);
  const zoom = Number(params.get('zoom') ?? '1') || 1;
  const viewport = new Viewport(viewportHost, { consoleView: params.has('console'), zoom });

  const scene = await loadScene(assets, id);
  const report = emptyReport(id);
  report.unknownClasses.push(...scene.unknownClasses);
  const ctx: RenderCtx = { assets, pack: scene.pack, visuals: new VisualScope(indexVisuals(scene.root), skin), report };
  viewport.mount(renderScene(scene.root, ctx));
  publish(t, report);

  if (params.has('debug')) mountInspector(host, scene.root, viewport.canvas);
}

async function gallery(assets: AssetIndex, skin: Skin, t: ReturnType<typeof createTelemetry>): Promise<void> {
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
