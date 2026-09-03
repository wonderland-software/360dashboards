// The NXE 9199 shell.
//
// Blades is one scene with 39 named ranges; NXE is a scene GRAPH the console
// assembles at runtime, and this module is that assembly. `homepage/homepage.xur`
// is a 1280x720 scene with three EMPTY groups (`PanelLayer`, `ChannelLayer`,
// `AnchorLayer`), four parked legend buttons and an AuraControl [SCENE]. Every
// visible thing on the home page is put there by code:
//
//  1. `homepage/emb_homepage.xml` names the channels; three of them are
//     `epix://*.xml` files; each `<condition>` is evaluated against console
//     state (epix.ts).
//  2. `controlpack://MobyChannelScene.xur` goes into `ChannelLayer` and its
//     nine-row `Queue` is filled with channel names from `homepage/strings.xus`.
//  3. Each passing slot of the current channel becomes a clone of
//     `controlpack://PanelScene.xur` in `PanelLayer`, hung on the 3D line from
//     `MobyFrontPosition` to `MobyBackPosition` at `k * MobyDefaultSpacing`
//     (variables.ts), and projected by the perspective in projection.ts.
//  4. `controlpack://LegendScene.xur` hoists the hosted scene's parked
//     `legend_a/b/x/y` captions and its `Label_Head` title (legend.ts).
//
// WHAT THIS MILESTONE DOES NOT DO, and does not pretend to: the strip does not
// MOVE. Navigation in NXE is a per-frame velocity integrator over
// `*InputAcceleration/Deceleration/MaxVelocity` with a separate fold/unfold
// cascade [SPEC §2.3]; M4a places panels at their RESTING positions only, and
// `__dash.nxe.physics` says so out loud.
import { idOf, propByName, type XuObject } from '@xur/index';
import {
  loadScene, renderElement, indexVisuals, VisualScope, Skin,
  bindTimelines, refreshVisibility, updateNode, setOwnerText, walk,
  NO_DELTA, PropBag, NO_OVERRIDES, authoredRect, xuiRegistry,
  isNativeLocale, DEFAULT_LOCALE, ListView,
  type AssetIndex, type RenderCtx, type NodeIndex, type NodeRecord, type Strings,
  type TimelineEngine, type SceneReport, type LoadedScene,
} from '@runtime/index';
import { NXE_PROJECTION, perspectiveCss, pointOnStrip, project, scaleAt, type Projection } from './projection';
import { Variables, VARIABLES_SCENE, type StripConstants } from './variables';
import {
  EPIX_SCENES, EPIX_SCHEME, HOMEPAGE_MANIFEST, HOMEPAGE_PACK, INFERRED_CONDITIONS,
  OFFLINE_STATE, evalCondition, parseChannelFile, parseHomeManifest, resolveResString,
  type Channel, type ConsoleState, type Slot,
} from './epix';
import { PANEL_SCENE, PANEL_SURFACE_SIZE, RIG_IDS, mountReflection, rigParts } from './panelRig';
import { LEGEND_SCENE, hoistLegend, type LegendReport } from './legend';
import { formatCounter, renderHtmlText } from './html';
import { LEGACY_CODE_TABLES } from './consoleSettings9199';

export const HOME_SCENE = 'homepage/homepage.xur';
export const CHANNEL_SCENE = 'controlp/MobyChannelScene.xur';
export const HOME_STRINGS = { pack: HOMEPAGE_PACK, table: 'strings.xus' };
/** dashcomm/dashStrings.xus[27] is the "%d of %d" counter, as HTML [SCENE]. */
export const COUNTER_STRINGS = { pack: 'dashcomm', table: 'dashStrings.xus', index: 27 };

/** The nine `Queue` rows, in the order the code addresses them by child path
 *  (`Queue\Prev1`, `Queue\Current`, `Queue\Next1`.. [CODE 0x920b0e44]). */
export const QUEUE_ROWS = ['Prev1', 'Current', 'Next1', 'Next2', 'Next3', 'Next4', 'Next5', 'Next6'] as const;

export interface ChannelRow { id: string; name: string; slots: number }

export interface NxeReport {
  build: string;
  home: string;
  /** Every channel the XML declares, and whether it passed offline. */
  channels: { id: string; name: string; passed: boolean; condition: string; slots: number; source: string }[];
  /** The channel the queue is centred on. */
  currentChannel: string;
  /** What the nine-row queue actually shows, bottom row first. */
  queue: { row: string; text: string }[];
  /** The current channel's slots, in order, with the scene each mounted. */
  panels: { name: string; epixid: string; path: string; scene: string | null; z: number; mounted: boolean }[];
  /** Slots dropped by a condition, with the predicate that dropped them. */
  droppedSlots: { name: string; condition: string }[];
  /** The "N of M" counter, as drawn. */
  counter: string;
  /** Every predicate evaluated, with its value and whether it is evidenced. */
  conditions: { expr: string; value: boolean; known: boolean; inferred: boolean }[];
  /** The projection actually applied. */
  projection: Projection;
  /** The strip constants read out of controlp/Variables.xur. */
  strip: StripConstants;
  variablesMissing: string[];
  /** The LegacyControl page hosted inside the shell, if any. */
  legacy: LegacyReport | null;
  legend: LegendReport | null;
  /** Things this milestone does not do, named rather than left to be noticed. */
  physics: readonly string[];
  /** Epix paths that named a scene the archive does not carry. */
  unresolvedEpix: string[];
  errors: string[];
}

export interface LegacyReport {
  scene: string;
  /** The DashScene's own size and where it was placed. */
  size: { w: number; h: number };
  centreX: number;
  left: number;
  top: number;
  /** Controls parked off-screen by the author and therefore not drawn. */
  parked: string[];
  rows: string[];
  focusId: string | null;
  /** Which code table filled the list, with its VA. */
  filledFrom: string | null;
}

export interface NxeState extends ConsoleState {
  /** Which channel the home page comes up on. Defaults to the XML's own
   *  `<defaultchannelid>`; `?channel=` picks another. */
  channel: string | null;
  /** A `LegacyControl` page to host instead of the home strip. */
  page: string | null;
}

export const NXE_OFFLINE: NxeState = { ...OFFLINE_STATE, channel: null, page: null };

interface MountedPanel {
  slot: Slot;
  path: string;
  scene: string | null;
  z: number;
  rig: NodeRecord | null;
  wrapper: HTMLElement;
}

export class NxeShell {
  private variables!: Variables;
  private strip!: StripConstants;
  private channels: { channel: Channel; passed: boolean; name: string }[] = [];
  private current = 0;
  private panels: MountedPanel[] = [];
  private queue: { row: string; text: string }[] = [];
  private counter = '';
  private conditions: NxeReport['conditions'] = [];
  private readonly unresolvedEpix: string[] = [];
  private readonly errors: string[] = [];
  private legacy: LegacyReport | null = null;
  private legend: LegendReport | null = null;
  private homeStrings: string[] = [];
  private readonly pending = new Set<Promise<unknown>>();

  private constructor(
    readonly assets: AssetIndex,
    readonly home: LoadedScene,
    readonly skin: Skin,
    readonly ctx: RenderCtx,
    readonly nodes: NodeIndex,
    readonly engine: TimelineEngine,
    readonly host: HTMLElement,
    readonly state: NxeState,
    readonly strings: Strings,
    readonly locale: string,
    readonly projection: Projection,
  ) {}

  static async mount(opts: {
    assets: AssetIndex; skin: Skin; nodes: NodeIndex; engine: TimelineEngine;
    report: SceneReport; host: HTMLElement; strings: Strings; locale?: string;
    state?: Partial<NxeState>;
    projection?: Projection;
    render: (root: XuObject, ctx: RenderCtx) => HTMLElement;
  }): Promise<NxeShell> {
    const state: NxeState = { ...NXE_OFFLINE, ...opts.state };
    const locale = opts.locale ?? DEFAULT_LOCALE;
    const home = await loadScene(opts.assets, HOME_SCENE);
    if (!isNativeLocale(locale)) {
      await opts.strings.applyLocale(home.root, xuiRegistry(), home.pack, home.path, locale);
    }
    const ctx: RenderCtx = {
      assets: opts.assets, pack: home.pack, report: opts.report, nodes: opts.nodes,
      visuals: new VisualScope(indexVisuals(home.root), opts.skin),
    };
    const el = opts.render(home.root, ctx);
    opts.host.replaceChildren(el);

    const shell = new NxeShell(
      opts.assets, home, opts.skin, ctx, opts.nodes, opts.engine, el, state,
      opts.strings, locale, opts.projection ?? NXE_PROJECTION,
    );
    await shell.compose();
    bindTimelines(opts.nodes, opts.engine);
    refreshVisibility(el, opts.report);
    return shell;
  }

  /* ------------------------------------------------------------ composition */

  private async compose(): Promise<void> {
    // The strip constants first: everything below is placed with them.
    const vars = await loadScene(this.assets, VARIABLES_SCENE);
    this.variables = new Variables(vars.root);
    this.strip = this.variables.strip('Moby');

    this.homeStrings = await this.strings.stringsByIndex(HOME_STRINGS.pack, HOME_STRINGS.table, this.locale);

    await this.readChannels();
    await this.mountChannelScene();

    if (this.state.page) await this.mountLegacyPage(this.state.page);
    else await this.mountStrip();

    // The legend is a shell service on both paths: the page it frames parks its
    // own legend buttons off-screen and expects the shell to hoist them.
    this.legend = await hoistLegend({
      assets: this.assets, skin: this.skin, ctx: this.ctx, nodes: this.nodes,
      engine: this.engine, host: this.rootScene(), strings: this.strings,
      locale: this.locale, source: this.legacyRoot ?? this.frontSlotRoot(),
    });
  }

  /** The homepage's own XuiScene node (CEpixHomePageScene), not the canvas. */
  private rootScene(): NodeRecord {
    const canvas = this.nodes.all[0]!;
    return canvas.children[0] ?? canvas;
  }

  private layer(id: string): NodeRecord | null {
    return this.nodes.byId.get(id)?.[0] ?? null;
  }

  /**
   * Read emb_homepage.xml and the epix:// files it names, evaluate every
   * condition, and keep the passing channels IN FILE ORDER - which is the
   * order the queue walks: the channel after the current one is drawn ABOVE it
   * (`Next1`), the one before it below (`Prev1`) [SPEC §1.3].
   */
  private async readChannels(): Promise<void> {
    const manifestXml = await this.text(HOMEPAGE_PACK, HOMEPAGE_MANIFEST);
    if (manifestXml === null) { this.errors.push(`no ${HOMEPAGE_MANIFEST} in the manifest`); return; }
    const man = parseHomeManifest(manifestXml);

    for (const mc of man.channels) {
      let channel = mc.inline;
      if (!channel) {
        const file = mc.definitionPath.startsWith(EPIX_SCHEME)
          ? mc.definitionPath.slice(EPIX_SCHEME.length) : mc.definitionPath;
        const xml = await this.text(HOMEPAGE_PACK, file);
        if (xml === null) { this.errors.push(`channel ${mc.id}: no ${file}`); continue; }
        channel = parseChannelFile(xml, mc.id, file);
      }
      const cond = evalCondition(channel.condition, this.state);
      this.note(cond);
      this.channels.push({ channel, passed: cond.value, name: this.channelName(channel) });
    }

    const wanted = this.state.channel ?? man.defaultChannelId;
    const passing = this.channels.filter((c) => c.passed);
    const ix = passing.findIndex((c) => c.channel.id === wanted);
    this.current = ix >= 0 ? ix : Math.max(0, passing.length - 1);
    if (ix < 0 && wanted) this.errors.push(`?channel=${wanted} is not a channel that passes offline`);
  }

  private channelName(c: Channel): string {
    const r = resolveResString(c.description, this.homeStrings);
    if (r.text === null && r.ids) this.errors.push(`channel ${c.id}: ${r.ids} resolves outside homepage/strings.xus`);
    return r.text ?? '';
  }

  private note(r: { expr: string; value: boolean; known: boolean }): void {
    if (!r.expr) return;
    if (this.conditions.some((c) => c.expr === r.expr)) return;
    const name = /([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(r.expr)?.[1] ?? '';
    this.conditions.push({ ...r, inferred: INFERRED_CONDITIONS.includes(name) });
    if (!r.known) this.errors.push(`condition "${r.expr}" is not implemented; the slot was kept`);
  }

  /**
   * `controlpack://MobyChannelScene.xur` into `ChannelLayer`, then the nine
   * `Queue` rows. The scene is authored at (96,48) inside a 1280x720 canvas and
   * `ChannelLayer` is a 64x64 group at (0,0), so mounting the scene's own root
   * into the layer keeps its authored position - no arithmetic here.
   */
  private async mountChannelScene(): Promise<void> {
    const layer = this.layer('ChannelLayer');
    if (!layer) { this.errors.push('homepage.xur has no ChannelLayer'); return; }
    const node = await this.renderScene(layer, CHANNEL_SCENE);
    if (!node) return;

    const passing = this.channels.filter((c) => c.passed);
    const rowText = (row: string): string => {
      if (row === 'Current') return passing[this.current]?.name ?? '';
      if (row === 'Prev1') return passing[this.current - 1]?.name ?? '';
      const n = Number(row.slice(4));
      return passing[this.current + n]?.name ?? '';
    };
    for (const row of QUEUE_ROWS) {
      const text = rowText(row);
      this.queue.push({ row, text });
      const target = this.findIn(node, row);
      if (!target) { this.errors.push(`${CHANNEL_SCENE}: no Queue\\${row}`); continue; }
      target.overrides.set('Text', text);
      updateNode(target, ['Text']);
    }

    // The "N of M" counter. Its format string is dashStrings.xus[27] and the
    // element that draws it is called `Description` in BOTH the Moby channel
    // scene and controlp/RomeOverlayScene.xur [CODE 0x9248b9a4 / 0x92490f2c].
    const table = await this.strings.stringsByIndex(COUNTER_STRINGS.pack, COUNTER_STRINGS.table, this.locale);
    const fmt = table[COUNTER_STRINGS.index];
    const desc = this.findIn(node, 'Description');
    if (fmt === undefined) this.errors.push(`${COUNTER_STRINGS.table}[${COUNTER_STRINGS.index}] is missing`);
    else if (desc) {
      const total = this.slotsOf(passing[this.current]?.channel).length;
      const html = formatCounter(fmt, total ? 1 : 0, total);
      this.counter = html.replace(/<[^>]*>/g, '').trim();
      const r = renderHtmlText(html);
      for (const t of r.unknownTags) this.errors.push(`XuiHtmlElement: unimplemented tag <${t}>`);
      desc.el.replaceChildren(r.el);
    }
  }

  /** The slots of a channel that pass their own `<condition>`. */
  private slotsOf(c: Channel | undefined): Slot[] {
    if (!c) return [];
    const out: Slot[] = [];
    for (const s of c.slots) {
      const r = evalCondition(s.condition, this.state);
      this.note(r);
      if (r.value) out.push(s);
    }
    return out;
  }

  private dropped(c: Channel | undefined): { name: string; condition: string }[] {
    if (!c) return [];
    return c.slots
      .filter((s) => s.condition && !evalCondition(s.condition, this.state).value)
      .map((s) => ({ name: s.name || s.epixid, condition: s.condition }));
  }

  /**
   * The panel strip at REST. Slot k sits at depth `k * spacing` on the line
   * from FrontPosition to BackPosition, the whole layer wears the perspective,
   * and nothing moves (see the module header).
   */
  private async mountStrip(): Promise<void> {
    const layer = this.layer('PanelLayer');
    if (!layer) { this.errors.push('homepage.xur has no PanelLayer'); return; }
    // XuiPerspectiveScene, as a CSS perspective. The origin is measured from
    // the layer's own border box, and PanelLayer sits at (0,0) of the 1280x720
    // scene, so the two coordinate systems are the same one.
    layer.el.style.cssText += ';' + perspectiveCss(this.projection);
    layer.el.dataset['xuiProjection'] = `${this.projection.focal}/${this.projection.centreU}/${this.projection.centreV}`;

    const entry = this.channels.filter((c) => c.passed)[this.current];
    if (!entry) return;
    const spacing = entry.channel.spacing ?? this.strip.defaultSpacing;
    const slots = this.slotsOf(entry.channel);

    for (const [k, slot] of slots.entries()) {
      const z = k * spacing;
      if (z > this.strip.visiblePanelDistance) break; // VisiblePanelDistance culls
      const path = entry.channel.epix.get(slot.epixid) ?? '';
      const bound = EPIX_SCENES[path];
      const scene = bound?.scene ?? null;
      const wrapper = this.placePanel(layer, z);
      const mounted: MountedPanel = { slot, path, scene, z, rig: null, wrapper };
      this.panels.push(mounted);
      if (!scene) { this.unresolvedEpix.push(`${slot.epixid} -> ${path || '(no epix object)'}: no binding`); continue; }
      if (!this.assets.entry(scene.split('/')[0]!, scene.split('/').slice(1).join('/'))) {
        this.unresolvedEpix.push(`${path} -> ${scene}: ${bound?.note ?? 'not in the manifest'}`);
        continue;
      }
      mounted.rig = await this.buildRig(wrapper, scene);
    }
  }

  /**
   * One panel's place on the strip.
   *
   * `FrontPosition` is the front panel's BOTTOM-LEFT anchor in screen units at
   * z = 0 [SPEC §2.2, and re-measured: the front slot's own edges land at
   * (96, 568) against an authored (96, 570) with the rig's own -2, within
   * 0.7 px]. The wrapper carries the rig's 512x512 box with its ORIGIN at
   * (anchor.x, anchor.y - 320), because the hosted 420x320 scene sits at the
   * rig's (0,-2) and must reach the anchor at its foot.
   */
  private placePanel(layer: NodeRecord, z: number): HTMLElement {
    const p = pointOnStrip(this.strip.frontPosition, this.strip.backPosition, z);
    const w = document.createElement('div');
    w.className = 'nxe-panel';
    w.dataset['nxeZ'] = String(z);
    w.dataset['nxeScale'] = scaleAt(this.projection, z).toFixed(4);
    const pr = project(this.projection, { x: p.x, y: p.y, z });
    w.dataset['nxeScreen'] = `${pr.x.toFixed(1)},${pr.y.toFixed(1)}`;
    w.style.cssText = [
      'position:absolute', 'left:0', 'top:0',
      `width:${PANEL_SURFACE_SIZE}px`, `height:${PANEL_SURFACE_SIZE}px`,
      'transform-origin:0 0',
      `transform:translate3d(${p.x}px, ${p.y - SLOT_HEIGHT}px, ${-z}px)`,
    ].join(';');
    layer.el.appendChild(w);
    return w;
  }

  /** A PanelScene clone with `scene` mounted into its texture surface. */
  private async buildRig(wrapper: HTMLElement, scene: string): Promise<NodeRecord | null> {
    const holder = this.nodes.all[0]!;
    const rigScene = await this.load(PANEL_SCENE);
    if (!rigScene) return null;
    const rig = this.renderInto(holder, rigScene, wrapper);
    if (!rig) return null;
    const parts = rigParts(rig);
    if (!parts.surface) { this.errors.push(`${PANEL_SCENE}: no ${RIG_IDS.surface}`); return rig; }

    // The rig ships every child Show=false until the code binds it [SCENE].
    for (const n of [parts.panel, parts.surface, parts.reflection, parts.nonReflected, parts.shadow]) {
      if (!n) continue;
      n.overrides.set('Show', true);
      updateNode(n, ['Show']);
    }

    const hosted = await this.load(scene);
    if (!hosted) return rig;
    this.renderInto(parts.surface, hosted);
    const size = this.sizeOf(hosted.root);

    if (parts.reflection) mountReflection(parts.surface, parts.reflection);

    // The shadow. The rig authors it at (465,190) 32x320 for a 512x512
    // surface; the console re-places it per hosted scene through the rig's own
    // SHADOW parameter (.rdata 0x920b0f48) and that rule is NOT recovered. It
    // is anchored to the hosted scene's right edge at its authored width, which
    // is where the frame puts it - a dark band from x 516 to about 528 against
    // the front panel's right edge at 515.6 [FRAME Yrt f0483] - and its
    // vertical extent is the hosted scene's, not the authored 320 of 512.
    if (parts.shadow) {
      parts.shadow.overrides.set('Position', { x: size.w, y: 0, z: 0 });
      parts.shadow.overrides.set('Height', size.h);
      updateNode(parts.shadow, ['Position', 'Height']);
      parts.shadow.el.dataset['nxeApprox'] = 'shadow placement';
    }
    return rig;
  }

  /* ----------------------------------------------------------- legacy pages */

  private legacyRoot: NodeRecord | null = null;

  /**
   * `LegacyControl`: an 880x480 Blades-era DashScene inside the 1280x720 shell.
   *
   * 172 of the 311 scenes are one, and everything inside them is Blades'
   * machinery unchanged - `DashScene`'s three `\0`-separated token lists, the
   * `MetaPanelScene` visual, the 45/46 px list pitch [SPEC §4]. What is new is
   * only the frame: the page is CENTRED horizontally (measured 890.7 x 484.0
   * about x = 638.7 on an authored 880x480, i.e. left 200 top 120
   * [FRAME Yrt f0437]), and its own `legend_*` buttons and `txt_Header` are
   * parked at y = 1058..1139 and y = -467.8 - far outside an 880x480 scene, so
   * they are NOT drawn and the shell's LegendScene hoists their text.
   */
  private async mountLegacyPage(sceneId: string): Promise<void> {
    const anchor = this.layer('AnchorLayer') ?? this.rootScene();
    const loaded = await this.load(sceneId);
    if (!loaded) { this.errors.push(`?page=${sceneId}: not in the manifest`); return; }
    const size = this.sizeOfScene(loaded.root);

    const wrapper = document.createElement('div');
    wrapper.className = 'nxe-legacy';
    // AnchorLayer is at (96,54); the page is placed in SCREEN units, so undo it.
    const left = Math.round((LEGACY_CENTRE_X - size.w / 2) - 96);
    const top = Math.round(LEGACY_TOP - 54);
    wrapper.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${size.w}px;height:${size.h}px`;
    anchor.el.appendChild(wrapper);

    const node = this.renderInto(anchor, loaded, wrapper);
    this.legacyRoot = node;
    if (!node) return;

    const parked: string[] = [];
    walk(loaded.root, (o) => {
      const r = authoredRect(PropBag.of(o, NO_OVERRIDES));
      const id = idOf(o);
      if (!id) return;
      if (r.y < -size.h || r.y > size.h) parked.push(`${id} @ y=${r.y}`);
    });

    const rows = await this.fillLegacyList(sceneId, node);
    this.legacy = {
      scene: sceneId,
      size: { w: size.w, h: size.h },
      centreX: LEGACY_CENTRE_X,
      left: left + 96,
      top: top + 54,
      parked,
      rows: rows.rows,
      focusId: rows.focusId,
      filledFrom: rows.filledFrom,
    };
  }

  /**
   * Reuse the Blades list machinery, because the behaviour IS Blades': the row
   * pitch comes from the list visual's own `control_ListItem` (46.38 px here
   * against 6770's 45), the window is `floor(height / pitch)`, focus is a
   * state range on the row's visual, and the scroll ends are the skin's.
   *
   * WHERE IT IS NOT THE SAME: the 9199 table is 16 bytes an entry, not 20 (no
   * `altHandler`), and it has eight rows, not eleven
   * (dashboards/nxe/consoleSettings9199.ts). And `dashSysCslSet.xur` declares
   * its `control_ListItem` templates in the SCENE, not only in the skin visual.
   */
  private async fillLegacyList(sceneId: string, node: NodeRecord): Promise<{ rows: string[]; focusId: string | null; filledFrom: string | null }> {
    const spec = LEGACY_CODE_TABLES[sceneId];
    if (!spec) return { rows: [], focusId: null, filledFrom: null };
    const table = await this.strings.stringsByIndex(spec.pack, spec.table, this.locale);
    const rows: string[] = [];
    for (const r of spec.rows) {
      const v = table[r.label];
      if (v === undefined) this.errors.push(`${spec.table}[${r.label}] (row label) is missing`);
      rows.push(v ?? '');
    }
    let list: XuObject | null = null;
    walk(node.obj, (o) => { if (!list && (o.className === 'XuiList' || o.className === 'XuiCommonList')) list = o; });
    if (!list) { this.errors.push(`${sceneId}: no list to fill`); return { rows, focusId: null, filledFrom: spec.va }; }
    const listNode = this.nodes.all.find((n) => n.obj === list);
    if (!listNode) return { rows, focusId: null, filledFrom: spec.va };
    const view = new ListView(list, listNode, { ...this.ctx, pack: sceneId.split('/')[0]! }, this.nodes, this.engine, xuiRegistry());
    view.setItems(rows.map((text) => ({ text })));
    // A page ARRIVES with focus already somewhere, which is the silent case:
    // XuiButton carries btn_Focus.xma on Focus and an EMPTY File on InitFocus.
    const focusId = view.focus(0, 'InitFocus');
    return { rows, focusId, filledFrom: spec.va };
  }

  /** The front slot's rendered scene, which is what the legend hoists from on
   *  the home page (its `legend_a` is the parked "Select"). */
  private frontSlotRoot(): NodeRecord | null {
    const rig = this.panels[0]?.rig;
    if (!rig) return null;
    const parts = rigParts(rig);
    return parts.surface?.children[0] ?? null;
  }

  /* ------------------------------------------------------------- primitives */

  private async text(pack: string, path: string): Promise<string | null> {
    const url = this.assets.url(pack, path);
    if (!url) return null;
    const res = await fetch(url);
    if (!res.ok) { this.errors.push(`${pack}/${path}: HTTP ${res.status}`); return null; }
    return res.text();
  }

  private async load(sceneId: string): Promise<LoadedScene | null> {
    try {
      const scene = await loadScene(this.assets, sceneId);
      if (!isNativeLocale(this.locale)) {
        await this.strings.applyLocale(scene.root, xuiRegistry(), scene.pack, scene.path, this.locale);
      }
      return scene;
    } catch (err) {
      this.errors.push(`${sceneId}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  private async renderScene(host: NodeRecord, sceneId: string): Promise<NodeRecord | null> {
    const s = await this.load(sceneId);
    return s ? this.renderInto(host, s) : null;
  }

  /**
   * Render a loaded scene under `host`, keeping its OWN pack for image
   * resolution and its own scene-local visuals. `into` overrides where the
   * element is appended (the panel wrappers are plain divs, not NodeRecords).
   */
  private renderInto(host: NodeRecord, scene: LoadedScene, into?: HTMLElement): NodeRecord | null {
    const ctx: RenderCtx = {
      ...this.ctx, pack: scene.pack,
      visuals: new VisualScope(indexVisuals(scene.root), this.skin),
    };
    const before = this.nodes.all.length;
    const el = renderElement(scene.root, ctx, {
      overrides: new Map(), delta: NO_DELTA, owner: null,
      parent: host.rect, parentNode: host,
    });
    if (!el) return null;
    el.dataset['xuiScene'] = scene.id;
    (into ?? host.el).appendChild(el);
    return this.nodes.all[before] ?? null;
  }

  private findIn(root: NodeRecord, id: string): NodeRecord | null {
    let found: NodeRecord | null = null;
    const go = (n: NodeRecord): void => {
      if (found) return;
      if (idOf(n.obj) === id) { found = n; return; }
      n.children.forEach(go);
    };
    go(root);
    return found;
  }

  /** A hosted scene's own size: the XuiScene inside the canvas, not the canvas.
   *  The 202 Blades-era files declare a 1120x770 canvas as an authoring
   *  leftover and a root scene of 880x480; it is the scene that is placed. */
  private sizeOf(root: XuObject): { w: number; h: number } { return this.sizeOfScene(root); }

  private sizeOfScene(root: XuObject): { w: number; h: number } {
    const scene = root.children[0] ?? root;
    const p = PropBag.of(scene, NO_OVERRIDES);
    return { w: p.num('Width', SLOT_WIDTH), h: p.num('Height', SLOT_HEIGHT) };
  }

  async idle(): Promise<void> {
    while (this.pending.size) await Promise.all([...this.pending]);
  }

  report(): NxeReport {
    const passing = this.channels.filter((c) => c.passed);
    const cur = passing[this.current]?.channel;
    return {
      build: this.assets.build,
      home: HOME_SCENE,
      channels: this.channels.map((c) => ({
        id: c.channel.id, name: c.name, passed: c.passed,
        condition: c.channel.condition, slots: c.channel.slots.length, source: c.channel.source,
      })),
      currentChannel: cur?.id ?? '',
      queue: this.queue,
      panels: this.panels.map((p) => ({
        name: p.slot.name || p.slot.epixid, epixid: p.slot.epixid, path: p.path,
        scene: p.scene, z: p.z, mounted: p.rig !== null,
      })),
      droppedSlots: this.dropped(cur),
      counter: this.counter,
      conditions: this.conditions,
      projection: this.projection,
      strip: this.strip,
      variablesMissing: this.variables?.missing ?? [],
      legacy: this.legacy,
      legend: this.legend,
      physics: PHYSICS_NOT_IMPLEMENTED,
      unresolvedEpix: this.unresolvedEpix,
      errors: this.errors,
    };
  }
}

/** A Moby slot's authored size; every one of the 31 is 420x320 [SCENE]. */
export const SLOT_WIDTH = 420;
export const SLOT_HEIGHT = 320;

/**
 * Where an 880x480 legacy page lands. MEASURED: the "Storage Devices" page
 * spans x 193.3..1084.0 and y 109.3..593.3, i.e. 890.7 x 484.0 about centre
 * x = 638.7 [FRAME nxe-9199-YrtwSj1f6aY/f0437]. The ~10 px of extra width and
 * 4 px of extra height are the panel frame the rig draws around the page, so
 * the PAGE itself is 880x480 at left 200, top 111.3, centred on x = 640.
 */
export const LEGACY_CENTRE_X = 640;
export const LEGACY_TOP = 111;

/** Named rather than left to be discovered. */
export const PHYSICS_NOT_IMPLEMENTED: readonly string[] = [
  'strip motion: the console integrates a velocity per frame over Moby{Channel,Panel}Input{Acceleration,Deceleration,MaxVelocity}; panels here sit at their resting depths and do not move',
  'fold/unfold: Moby{Fold,Unfold}Speed / {Fold,Unfold}NextRange / UnfoldMinSpeed describe a cascade that is not integrated here',
  'navigation cues: the eight controlp/snd_*.xma named at .rdata 0x927f7194 are played by the glue on the console; nothing plays them here because nothing moves yet',
  'scene transitions: LegacyTo/LegacyFrom and their ...Ex forms are in the skin and are not driven',
];

void propByName;
void setOwnerText;
