// The launcher: what a bare `/` shows.
//
// It is the Blades dashboard's own chrome. dashmain/dashmain.xur is rendered
// by the runtime exactly as the Blades shell renders it, BootLive (the range
// the console's cold boot plays) unfurls it onto the Xbox LIVE blade, and the
// two choices sit inside that blade's panel container where the console
// parented its own panel scene. Nothing on screen is drawn by hand:
//
//   background, wings, blade tabs   dashmain/dashmain.xur + dashuisk/skin.xur
//   the two rows                    the System page's navSettings, a
//                                   XuiNavButton wearing btn_1line_icon, on
//                                   that page's own row grid, re-labelled the
//                                   way console code labels a control (Id,
//                                   Text, ImagePath)
//   the row icons                   dashmain/ico_32x_console.png and
//                                   dashmain/ico_32x_systemSet.png
//   the description pane            the System page's metaPanelScene, a
//                                   XuiScene wearing metaScene_1line, at its
//                                   own place (its row highlight and divider
//                                   are drawn for exactly that grid)
//   the Xbox 360 logo               oobe/oobeCountry.xur's XuiImage1, which
//                                   authors common://xboxLogo.png
//   the header and the A legend     Tab2's own txt_Header and legend_a
//   the sounds                      the skin's keyframed cues (btn_Focus on
//                                   Focus, btn_Select on Press) and dashmain's
//                                   dash_2ndLevelClose inside BootLive
//   the face                        ConvectionUI, decoded from the console
//
// Choosing is the console's own state machine: KillFocus / Focus / Press on
// the row's visual, the metapane's NToM slide and NPress flourish, and the
// page navigates to `/?build=<id>` when the Press range has run its 13 frames.
// That URL is the whole contract: the dashboards never know the launcher exists.
import {
  AssetIndex, Skin, VisualScope, indexVisuals, renderScene, renderElement, Viewport,
  NodeIndex, bindTimelines, TimelineEngine, AudioBank, loadScene, setOwnerText, setOwnerSlot,
  createTelemetry, emptyReport, publish, startFpsMeter, refreshVisibility, pathOf,
  InputRouter, Button, NO_DELTA, FONT_FAMILY, setActiveBuild, activeBuild,
  type NodeRecord, type RenderCtx, type DashTelemetry, type TimelineScope,
} from '@runtime/index';
import { BUILDS, BUILD_PROFILES, type BuildId } from '@runtime/build';
import { idOf, type XuObject, type XuScalar } from '@xur/index';
import { metaRange, metaPressRange } from '@dash/blades/panels';
import { bladeByTab, DEFAULT_TAB } from '@dash/blades/tabs';

/** The scenes the launcher is built from. */
const DASHMAIN = 'dashmain/dashmain.xur';
const LOGO_SCENE = 'oobe/oobeCountry.xur';
/** The range the console's cold boot plays, landing on Xbox LIVE. */
const BOOT = { start: 'BootLive', end: 'EndBootLive' };
const ROOT_SCENE = 'RootScene';
/** Where the console parents Xbox LIVE's panel scene. */
const CONTAINER = 'RootScene/Tab2/scBlade/scContainer';
/** Tab2 controls that belong to the Live page, not to a launcher. */
const PRUNE_IN_TAB2 = ['legend_x', 'legend_y', 'legend_b'];

interface Choice {
  build: BuildId;
  name: string;
  icon: string;
  blurb: string;
}

/** What each row says. Copy is ours; everything drawing it is the console's. */
const CHOICES: readonly Choice[] = [
  {
    build: '6770', name: 'Blades', icon: 'ico_32x_console.png',
    blurb: 'Blades, build 6770. The dashboard the Xbox 360 launched with, in its last release from 2008.',
  },
  {
    build: '9199', name: 'NXE', icon: 'ico_32x_systemSet.png',
    blurb: 'NXE, build 9199. The New Xbox Experience of November 2008: channels, panels and a queue.',
  },
];
const HINT = 'Up and Down choose, A or Enter starts. A controller works too.';
const HEADER = 'Choose a dashboard';

/**
 * Layout inside Tab2's 700x369 panel container, in its design units: the
 * System page's own grid (rows 342 wide on a 45 px pitch, the metapane 356 px
 * to their right), started where the Live page starts its own rows (x=7..15)
 * rather than at the System page's x=115, because Xbox LIVE's page has the
 * three right-hand tabs over its last 90 px and System's does not. The pane's
 * row highlight and Shadow are authored 359 px to its left, so the rows have
 * to sit exactly there for its 2To1End / 1To2 slides to land on them.
 */
const ROW = { x: 15, y: 1, pitch: 45, w: 342, h: 47 };
const META = { x: 371, y: 1, w: 342, h: 360 };
const LOGO = { x: 452, y: 232 };

/** What the smoke suite drives and reads. */
export interface LauncherApi {
  engine: TimelineEngine;
  input: InputRouter;
  audio: AudioBank;
  /** One press, as the pad would send it. */
  press(button: string): boolean;
  stepFrames(n: number): void;
  state(): LauncherState;
}
export interface LauncherState {
  /** The boot range has landed and the rows take input. */
  armed: boolean;
  index: number;
  focusId: string | null;
  /** The build a press committed to, once the Press range is running. */
  going: BuildId | null;
  choices: { id: string; build: BuildId; visual: string | null; state: string | null; range: string | null }[];
  logo: { src: string; manifest: string | null } | null;
  booted: string | null;
}
declare global { interface Window { __launcher?: LauncherApi } }

export async function launcher(host: HTMLElement, onDispose: (fn: () => void) => void, params: URLSearchParams): Promise<void> {
  // The launcher is Blades chrome, so it is parsed with Blades' registry and
  // seen through Blades' view transform, whichever build the user then picks.
  setActiveBuild('6770');
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + '/';
  const assets = await AssetIndex.load(base, '6770');
  const t = createTelemetry(assets.build);
  onDispose(startFpsMeter(t));
  await loadFont(assets.base + 'assets/6770/fonts/', t.placeholders);

  const skin = await Skin.load(assets, activeBuild().skin);
  const [dashmain, logoScene] = await Promise.all([loadScene(assets, DASHMAIN), loadScene(assets, LOGO_SCENE)]);

  const viewportHost = document.createElement('div');
  viewportHost.className = 'xui-viewport';
  host.appendChild(viewportHost);
  const viewport = new Viewport(viewportHost, { consoleView: !params.has('design') });

  const report = emptyReport(DASHMAIN);
  const nodes = new NodeIndex();
  const engine = new TimelineEngine();
  const ctx: RenderCtx = {
    assets, pack: dashmain.pack, report, nodes,
    visuals: new VisualScope(indexVisuals(dashmain.root), skin),
  };
  const root = renderScene(dashmain.root, ctx);
  viewport.mount(root);
  viewport.setCanvas({ w: report.canvas.w, h: report.canvas.h });

  // The other blades' pages and the Live page's own legends are not part of a
  // launcher. Dropped from the index BEFORE the timelines bind, so no range
  // ever looks for them; the blade tabs themselves live outside Tab1..Tab6.
  for (const n of nodes.all.filter((n) => /^Tab[13456]$/.test(idOf(n.obj)))) nodes.removeSubtree(n);
  for (const n of nodes.all.filter((n) => PRUNE_IN_TAB2.includes(idOf(n.obj)) && pathOf(n).includes('/Tab2/'))) nodes.removeSubtree(n);

  const container = nodes.all.find((n) => pathOf(n).endsWith(CONTAINER));
  if (!container) throw new Error(`launcher: no ${CONTAINER} in ${DASHMAIN}`);
  const header = nodes.all.find((n) => idOf(n.obj) === 'txt_Header' && pathOf(n).includes('/Tab2/'));
  if (header) setOwnerText(header, HEADER);

  /* ------------------------------------------------------------ the rows */

  // A real control from the System page, wearing its real visual, with the
  // three properties console code writes onto a control (Id, Text, ImagePath)
  // and its place in the container. `into` renders it as the console's panel
  // was rendered: parented under scContainer, so Tab2's own boot fade carries
  // it. The objects are read before Tab5's DOM is pruned; the tree is separate.
  const template = findObject(dashmain.root, 'navSettings');
  const metaTemplate = findObject(dashmain.root, 'metaPanelScene');
  const logoTemplate = findObject(logoScene.root, 'XuiImage1');
  if (!template || !metaTemplate || !logoTemplate) throw new Error('launcher: a template control is missing from the archive');

  const into = (obj: XuObject, overrides: Record<string, XuScalar>, pack = ctx.pack): NodeRecord | null => {
    const before = nodes.all.length;
    const el = renderElement(obj, { ...ctx, pack }, {
      overrides: new Map(Object.entries(overrides)), delta: NO_DELTA, owner: null,
      parent: container.rect, parentNode: container,
    });
    if (!el) return null;
    container.el.appendChild(el);
    return nodes.all[before] ?? null;
  };

  const rows = CHOICES.map((c, i) => {
    const id = `launch${c.build}`;
    const node = into(withId(template, id), {
      Text: c.name, ImagePath: c.icon,
      Position: { x: ROW.x, y: ROW.y + i * ROW.pitch, z: 0 }, Width: ROW.w, Height: ROW.h,
    });
    if (!node) throw new Error(`launcher: ${id} did not render`);
    // The right-hand text channel (DataAssociation 1) carries the build number.
    setOwnerSlot(node, 1, BUILD_PROFILES[c.build].id);
    node.el.style.cursor = 'pointer';
    return { id, choice: c, node };
  });

  const meta = into(withId(metaTemplate, 'launchMeta'), {
    Position: { x: META.x, y: META.y, z: 0 }, Width: META.w, Height: META.h, Text: '',
  });
  const logo = into(logoTemplate, { Position: { x: LOGO.x, y: LOGO.y, z: 0 } }, logoScene.pack);
  const logoImg = logo?.el.querySelector('img') ?? null;

  bindTimelines(nodes, engine);
  refreshVisibility(root, report);
  publish(t, report);

  /* ----------------------------------------------------------- the machine */

  const rootScope = engine.all().find((s) => s.id.endsWith('/' + ROOT_SCENE) || s.id === ROOT_SCENE);
  if (!rootScope) throw new Error(`launcher: no ${ROOT_SCENE} scope`);
  const metaScope = meta ? engine.forControl('launchMeta')[0] ?? null : null;

  const audio = AudioBank.index(assets, params.has('mute'));
  if (!params.has('mute')) audio.unlockOnGesture();
  audio.attach(engine);

  let armed = false;
  let index = 0;
  let going: BuildId | null = null;
  let booted: string | null = null;
  /** Frames left before the press commits, counted on the engine's own clock. */
  let countdown = -1;

  const scopeOf = (id: string): TimelineScope | undefined => engine.forControl(id)[0];
  const under = (n: NodeRecord) => pathOf(n);
  const setState = (row: typeof rows[number], state: string) => engine.setState(row.id, state, under(row.node));

  const describe = (i: number) => { if (meta) setOwnerText(meta, `${CHOICES[i]!.blurb}\n\n${HINT}`); };

  const select = (next: number, init = false) => {
    if (!armed || going) return;
    const prev = index;
    index = (next + rows.length) % rows.length;
    if (!init && index === prev) return;
    if (!init) setState(rows[prev]!, 'KillFocus');
    // InitFocus is what a page arriving with focus somewhere plays, and it is
    // silent; Focus fires btn_Focus on its own frame 15.
    setState(rows[index]!, init ? 'InitFocus' : 'Focus');
    describe(index);
    if (metaScope) {
      const r = metaRange(init ? -1 : prev, index);
      if (!init || r.start !== 'Default') engine.playRange(metaScope.id, r.start, r.end);
    }
    rows.forEach((r, k) => r.node.el.setAttribute('aria-selected', k === index ? 'true' : 'false'));
    sync();
  };

  const press = () => {
    if (!armed || going) return false;
    const row = rows[index]!;
    going = row.choice.build;
    setState(row, 'Press');
    if (metaScope) { const r = metaPressRange(index); engine.playRange(metaScope.id, r.start, r.end); }
    // Navigate when the Press range ends, measured off the visual's own frames.
    const s = scopeOf(row.id);
    const from = s?.stateFrame('Press')?.frame ?? null;
    const to = from !== null ? s?.frameOf('EndPress') ?? null : null;
    countdown = from !== null && to !== null && to > from ? to - from : 1;
    sync();
    return true;
  };

  const go = (id: BuildId) => {
    const url = new URL(location.href);
    url.search = `?build=${id}`;
    location.assign(url.toString());
  };

  const arm = () => {
    if (armed) return;
    armed = true;
    select(0, true);
  };

  // Everything timed is timed on the 60 Hz timeline clock, never on wall time,
  // so ?manual + stepFrames() reproduces it exactly.
  const unstep = engine.addStepper(() => {
    if (!armed && !rootScope.playing) arm();
    if (countdown > 0 && --countdown === 0 && going) go(going);
  });
  onDispose(unstep);

  for (const [i, row] of rows.entries()) {
    row.node.el.addEventListener('click', () => { select(i); press(); });
  }

  const router = new InputRouter();
  router.push({
    id: 'launcher',
    onButton: (b) => {
      if (b === Button.Up || b === Button.Left || b === Button.LB) select(index - 1);
      else if (b === Button.Down || b === Button.Right || b === Button.RB) select(index + 1);
      else if (b === Button.A || b === Button.Start) press();
    },
  });
  router.attach();

  // Boot the way the console does: BootLive, out of dashmain's own timeline,
  // fires dash_2ndLevelClose on frame 497 and lands on Xbox LIVE. ?boot=none
  // parks on the blade's rest frame instead (the shell's seekRest).
  if (params.get('boot') === 'none') {
    rootScope.seek(bladeByTab(DEFAULT_TAB)?.restFrame ?? 0);
    rootScope.playing = false;
    rootScope.invalidate();
    engine.applyNow(rootScope);
    arm();
  } else if (engine.playRange(rootScope.id, BOOT.start, BOOT.end)) {
    booted = BOOT.start;
  }

  const frame = params.get('frame');
  if (frame !== null && Number.isFinite(Number(frame))) engine.freeze(Number(frame));

  let raf = 0;
  if (!params.has('manual') && engine.frozenAt === null) {
    let last = performance.now();
    const loop = (now: number) => {
      engine.tick(now - last);
      last = now;
      t.timeline = { ...engine.report(), fps: t.timeline.fps };
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  function sync(): void {
    t.focusId = armed ? rows[index]!.id : null;
    t.timeline = { ...engine.report(), fps: t.timeline.fps };
    t.input = router.log.slice(-40).map((e) => ({ button: e.button, repeat: e.repeat, layer: e.layer }));
    t.cues = audio.log.slice(-40).map((e) => ({ cue: e.cue, scope: e.scope, tick: e.tick, played: e.played }));
    t.lastCue = audio.log.length ? audio.log[audio.log.length - 1]!.cue : t.lastCue;
    host.dataset['launcher'] = armed ? 'armed' : 'booting';
  }
  sync();

  const api: LauncherApi = {
    engine, input: router, audio,
    press: (b) => { const ok = router.press(b as Button); sync(); return ok; },
    stepFrames: (n) => { for (let i = 0; i < n; i++) engine.step(); sync(); },
    state: () => ({
      armed, index, going, booted,
      focusId: armed ? rows[index]!.id : null,
      choices: rows.map((r) => {
        const s = scopeOf(r.id);
        return {
          id: r.id, build: r.choice.build,
          visual: r.node.visualWrap?.dataset['xuiVisual'] ?? null,
          state: s?.state ?? null, range: s?.range ? s.range.join('..') : null,
        };
      }),
      logo: logoImg ? { src: logoImg.src, manifest: manifestPathOf(assets, logoImg.src) } : null,
    }),
  };
  window.__launcher = api;

  onDispose(() => {
    cancelAnimationFrame(raf);
    router.detach();
    audio.close();
    viewport.dispose();
    delete window.__launcher;
    delete host.dataset['launcher'];
  });
}

/* ------------------------------------------------------------------ helpers */

/** The same object with one property, Id, rewritten: what CXuiControl::SetId
 *  does to a control the code instantiates twice. Everything else is shared. */
function withId(o: XuObject, id: string): XuObject {
  return { ...o, properties: o.properties.map((p) => (p.def.name === 'Id' ? { ...p, value: id } : p)) };
}

function findObject(root: XuObject, id: string): XuObject | undefined {
  if (idOf(root) === id) return root;
  for (const c of root.children) { const f = findObject(c, id); if (f) return f; }
  return undefined;
}

/** "<pack>/<path>" of the manifest entry a served URL came from, or null. */
function manifestPathOf(assets: AssetIndex, url: string): string | null {
  const prefix = new URL(assets.base + 'assets/', location.href).toString();
  if (!url.startsWith(prefix)) return null;
  const out = url.slice(prefix.length);
  for (const pack of assets.manifest.packs) {
    for (const e of pack.entries) if (e.out === out) return `${pack.name}/${e.path}`;
  }
  return null;
}

/** The console face is extracted from the ROM, so a miss is a real placeholder. */
async function loadFont(fontDir: string, placeholders: string[]): Promise<void> {
  try {
    await document.fonts.load(`16px ${FONT_FAMILY}`);
    await document.fonts.ready;
    if (!document.fonts.check(`16px ${FONT_FAMILY}`)) {
      placeholders.push(`font ${FONT_FAMILY}: ConvectionUI.ttf is not in ${fontDir}, falling back to a system sans`);
    }
  } catch {
    placeholders.push(`font ${FONT_FAMILY}: could not be checked`);
  }
}

// The builds table is what the rows are made from; anything not in it is not
// offered, and anything in it must have a row.
if (CHOICES.length !== BUILDS.length || !BUILDS.every((b) => CHOICES.some((c) => c.build === b))) {
  throw new Error(`launcher: CHOICES do not match BUILDS (${BUILDS.join(', ')})`);
}
