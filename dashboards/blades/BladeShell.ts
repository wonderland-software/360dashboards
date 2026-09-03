// The Blades shell.
//
// The dashboard is ONE scene: dashmain/dashmain.xur, root XuiTabScene
// "RootScene", 129 objects, 73 timelines, 2,315 keyframes over 1,299 frames cut
// into 39 named ranges. Everything a blade switch does - blades sliding,
// colours changing, wings moving, the switch sound - is already keyframed in
// there. This shell animates NOTHING. On a switch its whole job is to pick the
// named range, play it on RootScene, and have the incoming panel already
// parented before the range starts.
//
// Second-level navigation is the same discipline. A press does not compose a
// transition: it resolves the nav button's PressPath, creates the scene, plays
// the range the console's SetPanelLevel would have played, and lets the scenes'
// own TransFrom/TransTo visuals carry the fade.
import { idOf, propByName, type XuObject } from '@xur/index';
import {
  loadScene, renderElement, indexVisuals, VisualScope, Skin, loadBladeSkin,
  bindTimelines, refreshVisibility, updateNode, setOwnerText, setOwnerSlot, remountVisual, pathOf,
  NO_DELTA, PropBag, NO_OVERRIDES, authoredRect, DEFAULT_DASH_STYLE,
  isNativeLocale, DEFAULT_LOCALE, xuiRegistry,
  type AssetIndex, type RenderCtx, type NodeIndex, type NodeRecord, type Strings,
  type TimelineEngine, type SceneReport, type LoadedScene, type ListView,
} from '@runtime/index';
import { BLADES, DEFAULT_TAB, bladeByTab, panelSceneFor, switchRange, levelRange, type BladeState } from './tabs';
import { IPTV_ROW, resolvePress } from './nav';
import { panelEntries, entryForFocus, metaRange, metaPressRange, type PanelEntry } from './panels';
import { FocusModel, type NavDirection } from './focus';
import { populateLists } from './lists';
import { AUTHORING_PLACEHOLDER, CONSOLE_SETTINGS_CURRENT, CONSOLE_SETTINGS_SCENE, CURRENT_SETTING_ASSOC } from './consoleSettings';
import { playTransition, transitionId, type TransitionProp, type RunningTransition } from './transitions';
import { BOOT_RANGES, DEFAULT_BOOT } from './boot';
import { fillContainers, DASH_STRINGS_PACK, DASH_STRINGS_TABLE, type FillHost } from './containers';

export const DASHMAIN = 'dashmain/dashmain.xur';
export const ROOT_SCENE = 'RootScene';

export interface ShellState {
  signedIn: boolean;
  liveConnected: boolean;
  iptv: boolean;
  /** DASHUSER:\\DashStyle - 0 is "no custom style", the default and what the
   *  reference footage shows (that console has no dash user at all). */
  dashStyle: number;
}

export const OFFLINE: ShellState = { signedIn: false, liveConnected: false, iptv: false, dashStyle: DEFAULT_DASH_STYLE };

export function bladeState(s: ShellState): BladeState {
  if (!s.signedIn) return 'SignedOut';
  return s.liveConnected ? 'SignedIn' : 'SignedInNL';
}

/**
 * One entry of the scene stack. Level 0 is the blade's own page (the inline
 * System DashScene, or the panel scene parented into a blade's scContainer);
 * every level above it was pushed by a PressPath.
 */
interface Level {
  /** "consoles/dashSysCslSet.xur", or "dashmain/dashmain.xur#System". */
  id: string;
  /** The scene object that owns DefaultFocus and the DashScene panel table. */
  scene: XuObject;
  /** The scene object's own element: what focus, the metapane and the panel
   *  table are searched inside. */
  node: NodeRecord;
  /** What renderInto returned - the loaded scene's XuiCanvas, one level above
   *  `node`. THIS is what a pop destroys; removing `node` would leave the
   *  canvas div (and its data-xui-scene tag) in the document. */
  rootNode: NodeRecord;
  /** Where it was parented, so a pop knows what to reveal. Null for level 0. */
  hostNode: NodeRecord | null;
  loaded: LoadedScene | null;
  pack: string;
  visuals: VisualScope;
  focus: FocusModel;
  entries: PanelEntry[];
  lists: ListView[];
  /** Row descriptions from a code table (Console Settings), index-parallel
   *  with the list's rows. Empty when the scene's own PanelStrings is the
   *  source. */
  descriptions: string[];
  navPaths: (string | null)[];
  /** The metapane placeholder inside this scene, if it has one. */
  meta: NodeRecord | null;
  metaIndex: number;
  metaText: string;
  /** The sub-scene currently loaded into the metapane, so the next focus
   *  change can destroy it the way CDashScene does (0x9214d778). */
  metaSub: NodeRecord | null;
  metaSubId: string | null;
  /** Where focus was when this level pushed a child, restored on the way back. */
  savedFocus: string | null;
  /** A level pushed by __dashApi.openLevel() with no scene behind it: the
   *  smoke suites drive the ranges directly, and a bare level must not try to
   *  destroy the page underneath it on the way out. */
  bare?: boolean;
}

export interface ShellReport {
  tab: number;
  level: number;
  panels: { tab: number; scene: string | null; parented: boolean }[];
  contentPanelVisual: string;
  tabsLocked: boolean;
  navRows: string[];
  /** The scene stack, bottom first. */
  stack: string[];
  focusId: string | null;
  /** The metapane's 0-based row on the top level, or -1. */
  metaIndex: number;
  metaText: string;
  metaScene: string | null;
  /** PressPaths that named no scene in the manifest, and code paths taken. */
  unresolvedPresses: string[];
  codePaths: string[];
  /** The locale in force and how many strings it actually replaced across the
   *  whole composed dashboard - dashmain plus every panel, banner, tray scene,
   *  metapane sub-scene and pushed page. Zero on a real locale is a failure. */
  locale: string;
  localePatches: number;
  /** "botdBillboard -> botd/defaultbanner0.xur" per container the console
   *  filled at runtime, and anything that could not be filled. */
  containersFilled: string[];
  containersMissing: string[];
  /** Authoring-tool captions cleared because the console filled them from
   *  device state ("<setting>", "<servicename>"), one per control. */
  hardwareState: string[];
  /** Lists a scene declared empty that a recovered code table filled, and the
   *  ones that stay empty with the reason. */
  codeFilled: string[];
  codeUnfilled: string[];
  /** Strings a code table named that its .xus does not carry, plus panel
   *  entries with no description. Nothing on screen may be invented, so a
   *  non-empty list is a failure, not a warning. */
  missingStrings: string[];
  booted: string | null;
}

export class BladeShell {
  private tab = DEFAULT_TAB;
  /** Which blade level 0 was built for, so a second seek to the same blade does
   *  not re-enter its InitFocus range (a state range is motion, not a state). */
  private baseTab = -1;
  private tabsLocked = false;
  private readonly parented = new Map<number, LoadedScene>();
  private contentPanelVisual = 'content_panel';
  private levels: Level[] = [];
  private readonly unresolvedPresses: string[] = [];
  private readonly codePaths: string[] = [];
  private readonly missingStrings: string[] = [];
  private readonly containersFilled: string[] = [];
  private readonly containersMissing: string[] = [];
  private readonly hardwareState: string[] = [];
  private readonly codeFilled: string[] = [];
  private readonly codeUnfilled: string[] = [];
  private localePatches = 0;
  private booted: string | null = null;
  /** Loads in flight, so a test can wait for the metapane's sub-scene instead
   *  of sleeping. */
  private readonly pending = new Set<Promise<unknown>>();

  private constructor(
    readonly assets: AssetIndex,
    readonly dashmain: LoadedScene,
    readonly skin: Skin,
    readonly theme: Skin | undefined,
    readonly ctx: RenderCtx,
    readonly nodes: NodeIndex,
    readonly engine: TimelineEngine,
    readonly host: HTMLElement,
    readonly state: ShellState,
    readonly strings: Strings,
    readonly locale: string,
  ) {}

  static async mount(opts: {
    assets: AssetIndex; skin: Skin; nodes: NodeIndex; engine: TimelineEngine;
    report: SceneReport; host: HTMLElement; state?: Partial<ShellState>; strings: Strings;
    /** ?locale=. Applied to EVERY scene the shell composes, not just the first:
     *  the dashboard is a dozen files and a locale that reached only dashmain
     *  would leave the pages it pushes in English. */
    locale?: string;
    render: (root: XuObject, ctx: RenderCtx) => HTMLElement;
  }): Promise<BladeShell> {
    const state: ShellState = { ...OFFLINE, ...opts.state };
    const locale = opts.locale ?? DEFAULT_LOCALE;
    const dashmain = await loadScene(opts.assets, DASHMAIN);
    const rootPatches = isNativeLocale(locale) ? [] : await opts.strings.applyLocale(
      dashmain.root, xuiRegistry(), dashmain.pack, dashmain.path, locale);
    // Three visual layers, resolved in order and never pre-merged: scene-local,
    // then the blade skin (a THEME overlay the console only registers for a
    // signed-in dash user with a non-zero DashStyle), then the base skin.
    const theme = await loadBladeSkin(opts.assets, state.dashStyle);
    const ctx: RenderCtx = {
      assets: opts.assets, pack: dashmain.pack, report: opts.report, nodes: opts.nodes,
      visuals: new VisualScope(indexVisuals(dashmain.root), opts.skin, theme),
    };
    const el = opts.render(dashmain.root, ctx);
    opts.host.replaceChildren(el);

    const shell = new BladeShell(
      opts.assets, dashmain, opts.skin, theme, ctx, opts.nodes, opts.engine, el, state, opts.strings, locale,
    );
    shell.localePatches += rootPatches.length;
    await shell.parentPanels();
    shell.applyIptv();
    shell.applySignInState();
    bindTimelines(opts.nodes, opts.engine);
    shell.seekRest();
    shell.updateContentPanelVisual();
    // The visibility snapshot has to be retaken now: renderScene measured an
    // empty dashboard, and the panels only just arrived.
    refreshVisibility(el, opts.report);
    return shell;
  }

  /* ------------------------------------------------------------- composition */

  /**
   * Every blade's panel scene, loaded and parented BEFORE any range runs.
   * Loading one mid-switch would show an empty plate for the first half of the
   * move: a switch hides the outgoing content in a single frame and fades the
   * incoming content back in at the end, with nothing to cover a late load.
   */
  private async parentPanels(): Promise<void> {
    for (const blade of BLADES) {
      if (!blade.container) continue;
      const scene = panelSceneFor(blade.tab, bladeState(this.state), this.state.iptv);
      if (!scene) continue;
      const host = this.nodeByPath(blade.container);
      if (!host) { this.ctx.report.errors.push(`no container ${blade.container} in dashmain`); continue; }
      try {
        const panel = await this.loadLocalized(scene);
        const node = this.renderInto(host, panel);
        this.parented.set(blade.tab, panel);
        if (node) await this.fill(node);
      } catch (err) {
        this.ctx.report.errors.push(`panel ${scene}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  /**
   * Load a scene and patch its strings from its own sibling .xus BEFORE it is
   * rendered, which is the only order that works: a locale table addresses
   * objects by their postorder position in the PARSED tree, and English is the
   * literal already in the .xur, so a rendered scene has nothing to patch.
   */
  private async loadLocalized(sceneId: string): Promise<LoadedScene> {
    const scene = await loadScene(this.assets, sceneId);
    if (isNativeLocale(this.locale)) return scene;
    const patches = await this.strings.applyLocale(
      scene.root, xuiRegistry(), scene.pack, scene.path, this.locale);
    this.localePatches += patches.length;
    return scene;
  }

  /**
   * Fill the containers the console filled at runtime - the offline banners,
   * the tray strip and DashLiveSignedOut's two labels. See containers.ts: every
   * one of them names its own content in the scene data or in the executable.
   */
  private async fill(node: NodeRecord): Promise<void> {
    const host: FillHost = {
      load: async (parent, sceneId) => {
        try {
          const sub = await this.loadLocalized(sceneId);
          const rec = this.renderInto(parent, sub);
          bindTimelines(this.nodes, this.engine);
          return rec;
        } catch (err) {
          this.ctx.report.errors.push(`container ${sceneId}: ${err instanceof Error ? err.message : String(err)}`);
          return null;
        }
      },
      resolve: (basename) => this.assets.findByBasename(basename) ?? null,
      dashStrings: () => this.strings.stringsByIndex(DASH_STRINGS_PACK, DASH_STRINGS_TABLE, this.locale),
      signedIn: this.state.signedIn,
    };
    const out = await fillContainers(node, host);
    for (const f of out.filled) if (!this.containersFilled.includes(f)) this.containersFilled.push(f);
    for (const m of out.missing) if (!this.containersMissing.includes(m)) this.containersMissing.push(m);
  }

  /**
   * Clear the authoring tool's angle-bracket captions - "<setting>",
   * "<servicename>", "<free space>". See AUTHORING_PLACEHOLDER: each is a slot
   * the console filled from device or Live state before the control was shown,
   * so the token itself was never on screen. Cleared, counted in
   * `hardwareState`, and never replaced with a guess.
   */
  private discloseHardwareState(level: Level): void {
    const walk = (n: NodeRecord) => {
      const text = propString(n.obj, 'Text');
      if (text && AUTHORING_PLACEHOLDER.test(text)) {
        setOwnerText(n, '');
        const entry = `${level.id}:${idOf(n.obj) || n.obj.className} ${text.trim()}`;
        if (!this.hardwareState.includes(entry)) this.hardwareState.push(entry);
      }
      n.children.forEach(walk);
    };
    walk(level.node);
  }

  /**
   * Render a loaded scene as a child of `host`. The scene keeps its OWN pack
   * for image resolution and its own scene-local visuals: a bare ImagePath in
   * live/liveSignedOutUI.xur resolves against `live`, not against `dashmain`.
   *
   * The console's NavigateToScenePath (0x921a5c28) does the same thing:
   * XuiSceneCreate on the source control's root, then push into the pressed
   * control's PARENT. Its x/y copy (0x9214d430 / 0x9214e7f0) is read here as
   * the source SCENE's x/y, not the pressed control's: every second-level
   * target in this build declares the full 1120x770 dashboard canvas, and
   * offsetting Console Settings by navSettings' (297,153) would put its header
   * off the plate. Recorded as a reading, not a fact.
   */
  private renderInto(host: NodeRecord, scene: LoadedScene, visuals?: VisualScope): NodeRecord | null {
    const ctx: RenderCtx = {
      ...this.ctx,
      pack: scene.pack,
      visuals: visuals ?? new VisualScope(indexVisuals(scene.root), this.skin, this.theme),
    };
    const before = this.nodes.all.length;
    const el = renderElement(scene.root, ctx, {
      overrides: new Map(), delta: NO_DELTA, owner: null,
      parent: host.rect, parentNode: host,
    });
    if (!el) return null;
    el.dataset['xuiScene'] = scene.id;
    host.el.appendChild(el);
    // A panel canvas is 700x445 inside a 700x369 container - 76px taller by
    // design, and the container does not clip it.
    void authoredRect(PropBag.of(scene.root, NO_OVERRIDES));
    return this.nodes.all[before] ?? null;
  }

  /**
   * The footage shows SEVEN System rows, ending at Initial Setup: the console
   * hides navIPTVSettings when no IPTV provider is present, and otherwise fills
   * its text and icon from the provider - which is where the placeholder
   * "<servicename>" caption in the scene comes from. Hiding it also has to
   * repair the nav chain, because the chain is a plain linked list with no wrap
   * and navSystemSetUp.NavDown points at the row that just disappeared.
   */
  applyIptv(): void {
    if (this.state.iptv) return;
    for (const node of this.nodes.byId.get(IPTV_ROW) ?? []) {
      node.overrides.set('Show', false);
      updateNode(node, ['Show']);
    }
    for (const node of this.nodes.byId.get('navSystemSetUp') ?? []) {
      node.overrides.set('NavDown', '');
    }
  }

  /**
   * With no profile the console draws the Y and X legend glyphs desaturated
   * and with NO caption: "Sign Out" only means anything once someone is signed
   * in, and sign-in state is code-driven, not in the scene. The scene ships the
   * caption because the signed-in case is the common one, so we clear it in the
   * state the footage is actually in. Recorded in PLACEHOLDERS as Live/profile
   * dependent.
   */
  applySignInState(): void {
    if (this.state.signedIn) return;
    for (const id of ['legend_x', 'legend_y']) {
      for (const node of this.nodes.byId.get(id) ?? []) {
        node.overrides.set('Enabled', false);
        // Two writes, and BOTH are needed. The caption is painted by a
        // XuiTextPresenter inside legend_Y, which reads the OWNER's text, not
        // the control's property, so a bare override left "Sign Out" on screen;
        // and mountVisual picks the disabled artwork when it INSTANTIATES the
        // visual, so a control disabled after its first render kept the enabled
        // glyph. setOwnerText fixes the first, remountVisual the second.
        setOwnerText(node, '');
        remountVisual(node);
      }
    }
  }

  /** Walk a "Tab2/scBlade/scContainer" path through the rendered tree. */
  nodeByPath(path: string): NodeRecord | undefined {
    const parts = path.split('/');
    let cur: NodeRecord | undefined = this.nodes.all[0];
    for (const want of parts) {
      cur = cur?.children.find((c) => idOf(c.obj) === want)
        ?? this.nodes.all.find((n) => idOf(n.obj) === want);
      if (!cur) return undefined;
    }
    return cur;
  }

  /* ---------------------------------------------------------------- switching */

  get scope() {
    return this.engine.all().find((s) => s.id.endsWith(ROOT_SCENE));
  }

  /** Jump to a blade's rest state without animating: seek, do not play. */
  seekRest(tab = this.tab): void {
    const blade = bladeByTab(tab);
    const scope = this.scope;
    if (!blade || !scope) return;
    this.tab = tab;
    scope.seek(blade.restFrame);
    scope.playing = false;
    scope.invalidate();
    this.engine.applyNow(scope);
    this.updateContentPanelVisual();
    this.rebaseLevel();
  }

  /**
   * One blade left or right. There is no jump and no wrap: XuiTabScene can
   * format "%uTo1" and "1To%u", but dashmain sets no Wrap and authors no such
   * range, so a two-blade move has nothing to play.
   */
  go(to: number): boolean {
    if (this.tabsLocked) return false;
    const range = switchRange(this.tab, to);
    const scope = this.scope;
    if (!range || !scope) return false;
    this.engine.playRange(scope.id, range.start, range.end);
    this.tab = to;
    this.updateContentPanelVisual();
    this.rebaseLevel();
    return true;   // the range fires its own switch sound; the glue plays none
  }

  left(): boolean { return this.go(this.tab - 1); }
  right(): boolean { return this.go(this.tab + 1); }

  /**
   * Second level and deeper is a COUNTER, not a per-press choice, and NBlink is
   * the third-and-deeper transition in BOTH directions - it is what plays going
   * from Console Settings into Audio and back out again. It fires no sound
   * because the second-level cue already played on the way in.
   */
  private playOpen(): boolean {
    const scope = this.scope;
    if (!scope) return false;
    const depth = this.levels.length - 1;   // levels above the blade's own page
    const r = depth === 0 ? levelRange.open(this.tab) : levelRange.blink(this.tab);
    if (depth === 0) this.tabsLocked = true;
    return this.engine.playRange(scope.id, r.start, r.end);
  }

  private playClose(): boolean {
    const scope = this.scope;
    if (!scope) return false;
    const depth = this.levels.length - 1;
    const r = depth === 1 ? levelRange.close(this.tab) : levelRange.blink(this.tab);
    if (depth === 1) this.tabsLocked = false;
    return this.engine.playRange(scope.id, r.start, r.end);
  }

  /** The __dashApi hooks the smoke suites drive directly, without a scene. */
  openLevel(): boolean {
    const top = this.top;
    if (!top) return false;
    const ok = this.playOpen();
    if (ok) this.levels.push({ ...top, bare: true });
    return ok;
  }
  closeLevel(): boolean {
    if (this.levels.length <= 1) return false;
    const ok = this.playClose();
    if (ok) this.levels.pop();
    return ok;
  }

  /* ------------------------------------------------------------- content plate */

  /**
   * content_panel_blink is ONE control that wears one of two visuals:
   * content_panel_2 when a wallpaper is showing behind it, content_panel
   * otherwise. No scene names content_panel_2 - code assigns it on every tab
   * change. With no theme package installed, which is the footage's state and
   * ours, the wallpaper list is empty and it is always content_panel.
   */
  updateContentPanelVisual(): void {
    const wallpapers = 0;      // XContent theme enumeration; none without a theme
    const hasBackground = false;
    const want = wallpapers > 0 || hasBackground ? 'content_panel_2' : 'content_panel';
    if (want === this.contentPanelVisual) return;
    this.contentPanelVisual = want;
    const node = this.nodes.byId.get('content_panel_blink')?.[0];
    if (node) node.overrides.set('Visual', want);
  }

  /* ------------------------------------------------------------------- levels */

  /** The blade page that is level 0 right now. */
  private rebaseLevel(): void {
    if (this.levels.length > 1) return;   // a page is open; the blade cannot change
    if (this.baseTab === this.tab && this.levels.length === 1) return;
    this.baseTab = this.tab;
    const base = this.baseLevel(this.tab);
    this.levels = base ? [base] : [];
    if (base) {
      const first = this.arrivalFocus(base);
      if (first) this.focusTo(base, first, 'InitFocus');
      else this.syncMeta(base);
    }
  }

  private baseLevel(tab: number): Level | null {
    if (tab === 5) {
      const node = this.nodeByPath('Tab5/System');
      const obj = node ? node.obj : systemScene(this.dashmain.root);
      if (!node || !obj) return null;
      return this.makeLevel(`${DASHMAIN}#System`, obj, node, null, null, this.dashmain.pack, this.ctx.visuals, [], []);
    }
    const loaded = this.parented.get(tab);
    const container = bladeByTab(tab)?.container;
    if (!loaded || !container) return null;
    const host = this.nodeByPath(container);
    const node = host?.children[host.children.length - 1];
    if (!node) return null;
    const scene = sceneRootOf(node.obj);
    const sceneNode = findById(node, idOf(scene)) ?? node;
    return this.makeLevel(loaded.id, scene, sceneNode, null, loaded, loaded.pack,
      new VisualScope(indexVisuals(loaded.root), this.skin, this.theme), [], [], [], node);
  }

  private makeLevel(
    id: string, scene: XuObject, node: NodeRecord, hostNode: NodeRecord | null,
    loaded: LoadedScene | null, pack: string, visuals: VisualScope,
    descriptions: string[], navPaths: (string | null)[], lists: ListView[] = [],
    rootNode: NodeRecord = node,
  ): Level {
    const focus = new FocusModel(scene, {
      object: (fid) => findObject(scene, fid),
      focusable: (fid) => {
        const n = findById(node, fid);
        return !!n && n.el.style.display !== 'none';
      },
      override: (fid, prop) => {
        const n = findById(node, fid);
        const v = n?.overrides.get(prop);
        return typeof v === 'string' ? v : null;
      },
    });
    const meta = findById(node, 'metaPanelScene');
    return {
      id, scene, node, rootNode, hostNode, loaded, pack, visuals, focus,
      entries: panelEntries(scene), lists, descriptions, navPaths,
      meta, metaIndex: -1, metaText: '', metaSub: null, metaSubId: null, savedFocus: null,
    };
  }

  private get top(): Level | undefined { return this.levels[this.levels.length - 1]; }

  /**
   * Where focus lands when a page arrives. DefaultFocus when the scene declares
   * one (dashmain's System says navSettings, Console Settings says lstSettings).
   * The three blade panels declare none, and the console still comes up on
   * their first panel row: the footage shows Games and Media with the metapane
   * on "Create Gamer Profile" no matter which row you look at, which is
   * PanelSettings[0] = fakeGamerCard focused by default [SCENE + FRAME hi
   * f0042, f0047]. So a DashScene with no DefaultFocus falls back to entry 0.
   * A scene with NEITHER falls back to the head of its own authored
   * NavUp/NavDown chain - the one focusable control with no NavUp. That is not
   * a convenience: it is what the two blades that have neither actually show.
   *
   *  - Xbox LIVE, live/liveSignedOutUI.xur (a plain XuiScene,
   *    ClassOverride="DashLiveSignedOut"): the chain is fakeGamerCard ->
   *    btnJoinXbox -> btnUseExistingTag -> btn_AdBanner -> TrayScene, so the
   *    head is fakeGamerCard, and f0078 - an ARRIVAL frame, with f0077 on Games
   *    and f0079 on Marketplace, so a continuous sideways sweep with no vertical
   *    input - shows the "Create Profile" card wearing the silver-to-transparent
   *    focus gradient while btnJoinXbox and btnUseExistingTag are plain [FRAME].
   *    Confirmed at 60 fps on f02310, where the panel is still fading in and the
   *    card is already lit. The class itself (registered 0x9228f060, bound at
   *    0x9228f478) fetches five children and calls the string helper; it makes
   *    no SetFocus call, so focus here is the XUI runtime's own default [CODE].
   *  - Marketplace, blademp/marketplaceSignedOut.xur, needs no fallback at all:
   *    its ScriptScene root DECLARES DefaultFocus="scnBanner" [SCENE], and
   *    blademp/marketplace.scb has only four onpress handlers and never touches
   *    focus [CODE]. f00920 and f02352, both arrival frames, show the banner
   *    tile filled white/silver and the rows plain [FRAME].
   */
  private arrivalFocus(level: Level): string | null {
    const declared = level.focus.defaultFocus;
    if (declared) return declared;
    const first = level.entries[0];
    if (first && findById(level.node, first.id)) return first.id;
    return this.chainHead(level);
  }

  /** The one focusable control in the scene with no NavUp: where a plain
   *  XuiScene's authored chain starts. Null when the scene has no chain. */
  private chainHead(level: Level): string | null {
    let head: string | null = null;
    const walk = (o: XuObject) => {
      const id = idOf(o);
      if (head === null && id && propByName(o, 'NavDown') && !propByName(o, 'NavUp')
        && findById(level.node, id)) head = id;
      o.children.forEach(walk);
    };
    walk(level.scene);
    return head;
  }

  /**
   * Put a control into a state, but only the copy inside THIS level. Ids are
   * not unique across the document - legend_a, legend_b, legend_x and legend_y
   * are on every blade and every page, and metaPanelScene is in forty scenes -
   * so an unscoped setState fires one cue per copy.
   */
  private setState(level: Level, id: string, state: string): boolean {
    const node = findById(level.node, id);
    if (!node) return false;
    return this.engine.setState(id, state, pathOf(node));
  }

  /* -------------------------------------------------------------------- focus */

  /**
   * A focus change is EDGE-TRIGGERED: the state range is motion, and re-issuing
   * it restarts it. Only a real move plays KillFocus on the old row and Focus
   * on the new one, which is also the only thing that fires btn_Focus - the cue
   * is a File keyframe inside the visual's own Focus range, not a table.
   */
  private focusTo(level: Level, id: string, state: 'Focus' | 'InitFocus' = 'Focus'): string | null {
    const prev = level.focus.current;
    if (prev === id) return null;
    level.focus.set(id);
    if (prev) this.setState(level, prev, 'KillFocus');
    this.setState(level, id, state);
    this.syncMeta(level);
    return id;
  }

  /**
   * Up/Down inside a list move the list's rows; everywhere else they walk the
   * authored NavUp/NavDown chain. Left/Right are never a focus move: no control
   * in the build sets NavLeft or NavRight, because left and right are the blade
   * switch and XuiTabScene owns them.
   */
  moveFocus(dir: NavDirection): string | null {
    const level = this.top;
    if (!level) return null;
    const list = this.listFor(level);
    if (list && (dir === 'Up' || dir === 'Down')) {
      const moved = list.move(dir === 'Down' ? 1 : -1);
      if (moved !== null) this.syncMeta(level);
      return moved;
    }
    const before = level.focus.current;
    const next = level.focus.move(dir);
    if (next === null) return null;
    if (before) this.setState(level, before, 'KillFocus');
    this.setState(level, next, 'Focus');
    this.syncMeta(level);
    return next;
  }

  /** The list a level's focus is sitting in, if its DefaultFocus named one. */
  private listFor(level: Level): ListView | undefined {
    const want = level.focus.current;
    return level.lists.find((l) => l.id === want) ?? (level.focus.current === null ? level.lists[0] : undefined);
  }

  get focusId(): string | null {
    const level = this.top;
    if (!level) return null;
    const list = this.listFor(level);
    return list?.focusId ?? level.focus.current;
  }

  /* ----------------------------------------------------------------- metapane */

  /**
   * §3.2/§3.3, verbatim: on a focus change the console destroys the previous
   * entry's sub-scene, creates PanelScenePaths[i] under the metapane, writes
   * PanelStrings[i] into the metapane's text, and calls
   * MetaPanelScene::GotoIndex, which plays "%dTo%d" for an adjacent step and
   * snaps with "%dTo%dEnd" for a jump. Indices are 1-based on the wire.
   *
   * Console Settings is the one place the text does NOT come from
   * PanelStrings: its rows are the executable's 11-entry table and the metapane
   * reads that table's description index (the Audio row proves it - the scene
   * says "Change your audio output settings." and the screen says "...output
   * and sound effect settings").
   */
  private syncMeta(level: Level): void {
    const list = this.listFor(level);
    let index = -1;
    let text = '';
    let scenePath = '';
    if (list && level.descriptions.length) {
      // TWO different indices, and mixing them up is what filled __dash.errors
      // with "no range 9To10". The metapane is driven by the VISIBLE row, the
      // slot inside the list's nine-row window: metaScene_1line authors only
      // 1To2 .. 8To9 and their End frames, and a list of eleven rows scrolled
      // to the bottom is on visible slot 8, not on row 10 [SCENE, and f0066
      // shows the System Info highlight in the bottom slot with the window
      // scrolled by two]. The TEXT is still the table row: row 10's description
      // is xus [305] wherever it happens to be sitting.
      index = list.visibleIndex;
      text = level.descriptions[list.focusIndex] ?? '';
    } else {
      const entry = entryForFocus(level.entries, level.focus.chain());
      index = entry ? entry.index : -1;
      text = entry?.description ?? '';
      scenePath = entry?.scenePath ?? '';
      // A row with neither a description nor a scene has nothing to show - but
      // only when the SCENE uses the per-row mechanism at all. Some DashScenes
      // declare PanelSettings and leave every PanelStrings entry empty because
      // their metapane body is a static authored label instead:
      // dashSysCslSetAudio.xur names btnDigital and btnSoundEffects, ships
      // PanelStrings "\0" (two empty entries), and draws labMetaBody with the
      // whole "Select Digital Output to change..." paragraph in the file. That
      // is not a missing string, so only a scene with SOME per-row text and a
      // hole in it is reported.
      const perRow = level.entries.some((e) => e.description || e.scenePath);
      if (entry && perRow && !text && !scenePath) {
        const m = `${level.id}: PanelStrings[${entry.index}] (${entry.id}) is empty`;
        if (!this.missingStrings.includes(m)) this.missingStrings.push(m);
      }
    }
    level.metaText = text;
    if (!level.meta) { level.metaIndex = index; return; }

    // Destroy the previous sub-scene before anything else, as 0x921b48f4 does.
    if (level.metaSub) {
      for (const id of this.nodes.removeSubtree(level.metaSub)) this.engine.remove(id);
      level.metaSub = null;
      level.metaSubId = null;
    }
    if (scenePath) this.track(this.loadMetaScene(level, scenePath));

    setOwnerText(level.meta, text);
    // The "Current Setting" block, DataAssociation 4 (Pane_txtCurrentSetting in
    // metaScene_1line). Console state, not scene data: only the rows the
    // reference console was actually focused on have a value, the rest stay
    // empty rather than invented. PLACEHOLDERS.md carries the reason.
    if (level.id === CONSOLE_SETTINGS_SCENE) {
      // The TABLE row, not the visible slot: which setting the value describes
      // does not change when the window scrolls.
      const row = list ? list.focusIndex : index;
      const cur = CONSOLE_SETTINGS_CURRENT.find((c) => c.row === row);
      setOwnerSlot(level.meta, CURRENT_SETTING_ASSOC, cur?.value ?? '');
      const gap = `${level.id}: row ${row} "Current Setting" is console state we cannot query`;
      if (!cur && row >= 0 && !this.hardwareState.includes(gap)) this.hardwareState.push(gap);
    }

    const prev = level.metaIndex;
    level.metaIndex = index;
    const scope = this.metaScope(level);
    if (!scope) return;
    const r = metaRange(prev, index);
    if (!this.engine.playRange(scope, r.start, r.end)) {
      // metaScene_1line only authors 1..9; a tenth row has no range to play and
      // says so rather than snapping to something that was never authored.
      this.ctx.report.errors.push(`metapane ${level.id}: no range ${r.start} on ${scope}`);
    }
  }

  private async loadMetaScene(level: Level, path: string): Promise<void> {
    if (!level.meta) return;
    const found = this.assets.findByBasename(path) ?? `${level.pack}/${path}`;
    try {
      const sub = await loadScene(this.assets, found);
      level.metaSub = this.renderInto(level.meta, sub);
      level.metaSubId = sub.id;
      bindTimelines(this.nodes, this.engine);
    } catch (err) {
      this.ctx.report.errors.push(`metapane scene ${path}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** The scope of the metapane's VISUAL (metaScene_1line), which is where the
   *  upper-case NToM ranges live; the placeholder's own lower-case 1to2/2to1
   *  frames carry no timelines anywhere in the corpus. */
  private metaScope(level: Level): string | null {
    if (!level.meta) return null;
    const prefix = pathOf(level.meta) + '/';
    // The SHORTEST id under the metapane is the visual's own root
    // (metaScene_1line and its variants); anything longer is a scope nested
    // inside it, such as metaScene_1line_GamesMid/labDots/Loading_Large, which
    // has none of the NToM ranges.
    let best: string | null = null;
    for (const s of this.engine.all()) {
      if (!s.id.startsWith(prefix)) continue;
      if (best === null || s.id.length < best.length) best = s.id;
    }
    return best;
  }

  /* ------------------------------------------------------------- press / back */

  /**
   * A on a nav button. The console's DashSystemScene dispatch names the PACK
   * and the XUR names the FILE; because every .xur basename in the build is
   * unique across all 30 packs, one global basename index gets the same answer
   * and the code table is kept as a cross-check.
   */
  press(): Promise<boolean> { return this.track(this.doPress()); }

  private async doPress(): Promise<boolean> {
    const level = this.top;
    if (!level) return false;
    const list = this.listFor(level);
    const focused = list?.focusId ?? level.focus.current;
    if (!focused) return false;

    // The press flourish and its cue are the visual's own Press range.
    this.setState(level, focused, 'Press');
    const metaScope = this.metaScope(level);
    if (metaScope && level.metaIndex >= 0) {
      const r = metaPressRange(level.metaIndex);
      this.engine.playRange(metaScope, r.start, r.end);
    }

    const target = this.pressTarget(level, list);
    if (!target) {
      this.codePaths.push(`${level.id}:${focused}`);
      return false;
    }
    const resolved = resolvePress(this.assets, target, focused);
    if (resolved.mismatch) this.ctx.report.errors.push(resolved.mismatch);
    if (!resolved.resolved) {
      this.unresolvedPresses.push(`${focused} -> ${target}`);
      return false;
    }
    level.savedFocus = list ? null : level.focus.current;
    await this.push(resolved.resolved.scene, level);
    return true;
  }

  /** Where a press goes: a list row's code-table destination, or the focused
   *  nav button's PressPath. Null means the console took a code path. */
  private pressTarget(level: Level, list: ListView | undefined): string | null {
    if (list && level.navPaths.length) return level.navPaths[list.focusIndex] ?? null;
    const id = level.focus.current;
    const obj = id ? findObject(level.scene, id) : undefined;
    const v = obj ? propByName(obj, 'PressPath')?.value : undefined;
    return typeof v === 'string' && v ? v : null;
  }

  /**
   * Push a scene at the next panel level. The outgoing scene plays the
   * incoming scene's TransFrom and the incoming plays its TransTo - the
   * properties live on the scene being navigated TO, and the second-level
   * scenes in this build all declare FadeOut / FadeIn.
   */
  async push(sceneId: string, from = this.top): Promise<Level | null> {
    if (!from) return null;
    // A second press while a pop's fade is still running would leave two scenes
    // in the document at once. The console cannot get into that state - it is
    // single-threaded through the scene manager - so flush the pending teardown
    // rather than let ours diverge.
    this.engine.flushWaiters();
    let loaded: LoadedScene;
    try {
      loaded = await this.loadLocalized(sceneId);
    } catch (err) {
      this.ctx.report.errors.push(`push ${sceneId}: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
    const host = from.hostNode ?? from.node.parentNode ?? from.node;
    const visuals = new VisualScope(indexVisuals(loaded.root), this.skin, this.theme);
    const node = this.renderInto(host, loaded, visuals);
    if (!node) return null;
    const scene = sceneRootOf(loaded.root);
    const sceneNode = findById(node, idOf(scene)) ?? node;

    const ctx: RenderCtx = { ...this.ctx, pack: loaded.pack, visuals };
    bindTimelines(this.nodes, this.engine);
    const filled = await populateLists(loaded, ctx, this.nodes, this.engine, this.strings, this.locale);
    for (const m of filled.missingStrings) if (!this.missingStrings.includes(m)) this.missingStrings.push(m);
    for (const c of filled.codeFilled) if (!this.codeFilled.includes(c)) this.codeFilled.push(c);
    for (const c of filled.codeUnfilled) if (!this.codeUnfilled.includes(c)) this.codeUnfilled.push(c);
    const level = this.makeLevel(loaded.id, scene, sceneNode, host, loaded, loaded.pack, visuals,
      filled.descriptions, filled.navPaths, filled.lists, node);
    await this.fill(node);
    this.discloseHardwareState(level);

    // The range first: the console plays it from SetPanelLevel before the new
    // scene has focus, and the incoming fade rides on top of it.
    this.playOpen();
    this.levels.push(level);
    this.transition(from, level, 'TransFrom', 'TransTo');

    // DefaultFocus lands on the incoming scene. InitFocus, not Focus: the
    // visual's InitFocus range carries an EMPTY File keyframe, so arriving on a
    // page is silent while moving inside it is not.
    const first = this.arrivalFocus(level);
    if (first) {
      level.focus.set(first);
      const list = this.listFor(level);
      if (list) list.focus(filled.initialFocus, 'InitFocus');
      else this.setState(level, first, 'InitFocus');
    }
    this.syncMeta(level);
    refreshVisibility(this.host, this.ctx.report);
    return level;
  }

  /** B. Pop the top scene, play NClose (or NBlink), and restore focus. */
  back(): boolean {
    if (this.levels.length <= 1) return false;
    if (this.top?.bare) return this.closeLevel();
    const level = this.levels[this.levels.length - 1]!;
    const under = this.levels[this.levels.length - 2]!;
    // legend_b's Press range carries btn_Back.xma on its own frame 2.
    if (findById(level.node, 'legend_b')) this.setState(level, 'legend_b', 'Press');
    else if (findById(under.node, 'legend_b')) this.setState(under, 'legend_b', 'Press');

    this.playClose();
    const back = this.transition(level, under, 'TransBackFrom', 'TransBackTo');
    this.levels.pop();
    if (level.rootNode !== under.rootNode) {
      // The console runs the popped scene's TransBackFrom and tears the scene
      // down AFTER it, so the teardown waits for that curve to finish instead
      // of removing the node under a running fade. The wait is counted in 60 Hz
      // engine steps, never in wall clock: ?frame=, ?manual and the smoke
      // suites' stepFrames all drive the same clock, and a setTimeout would
      // make the three disagree.
      const destroy = () => {
        for (const id of this.nodes.removeSubtree(level.rootNode)) this.engine.remove(id);
        // A transition scope holds a NodeRecord, so it has to go with the node.
        const sceneId = idOf(level.scene) || level.scene.className;
        for (const role of ['out', 'in']) this.engine.remove(transitionId(role, sceneId));
        refreshVisibility(this.host, this.ctx.report);
      };
      if (back.out) this.engine.whenFinished(back.out.id, destroy);
      else destroy();
    }
    if (under.savedFocus) {
      // InitFocus, not Focus: btn_1line_icon's Focus frame carries
      // btn_Focus.xma and its InitFocus frame carries an empty File, so the
      // console makes a sound when focus MOVES and none when a page arrives
      // with focus already somewhere. Coming back is an arrival.
      under.focus.set(null);
      this.focusTo(under, under.savedFocus, 'InitFocus');
      under.savedFocus = null;
    } else {
      this.syncMeta(under);
    }
    refreshVisibility(this.host, this.ctx.report);
    return true;
  }

  /**
   * Play the pair of transition visuals the scene that OWNS them names.
   *
   * The four properties sit on the second-level scene, not on the blade: going
   * in, the incoming scene's TransFrom names what the OUTGOING scene plays and
   * its TransTo what the incoming plays; coming back, the popped scene's
   * TransBackFrom and TransBackTo do the same job. Every second-level scene in
   * this build names FadeOut / FadeIn / FadeOut / FadeIn.
   *
   * BOTH halves run in BOTH directions. On the way back the outgoing scene is
   * the one being destroyed, so the caller holds the returned scope and only
   * tears the node down when that curve ends.
   *
   * Measured against the console, on the settings pages [FRAME, 6717-60fps;
   * the capture is 30 fps frame-doubled, so distinct images are two indices
   * apart and one step is two 60 Hz frames]:
   *  - Back out of Console Settings. f02157 is the page; f02159 has the System
   *    Info row's highlight cleared (list-frame mean 153.5 -> 108.5, sd 46.3 ->
   *    26.4) while the row labels, the metapane and the legend are untouched to
   *    a hundredth (label sd 21.69, ink minimum 14.6, both identical to f02153);
   *    f02161 has ALL of it gone at once (label sd 5.22 / min 118.7, metapane sd
   *    8.84, legend sd 3.53). So the page is at full opacity for at least one
   *    presented frame after the press lands and is entirely gone on the next:
   *    the disappearance is bounded at two 60 Hz frames, which is inside
   *    FadeOut's five and is all a 30 fps capture can resolve of an 83 ms ramp.
   *  - Coming back in. The System blade's own content returns on the same
   *    curve as TransBackTo=FadeIn (13 frames hidden, then 0 -> 1 over 17):
   *    its list region is flat at sd 5.3 through f02179, breaks at f02181
   *    (10.48), and settles at f02189 (30.49, unchanged thereafter) - 33 frames
   *    after the press, against FadeIn's 30 [FRAME f02161-f02189].
   *  - The same pair on the way IN is resolvable and agrees: on the push into
   *    Console Settings the System panel's metapane goes sd 24.02 -> 6.42 in one
   *    presented frame (f01546 -> f01548), and the incoming page ramps sd 6.79
   *    -> 12.33 -> 19.28 -> 26.90 -> 29.94 -> 31.69 over f01568-f01578 and then
   *    holds, a visible cross-fade, not a cut [FRAME].
   */
  private transition(
    outgoing: Level, incoming: Level, fromProp: TransitionProp, toProp: TransitionProp,
  ): { out: RunningTransition | null; in: RunningTransition | null } {
    // The properties belong to the scene being navigated to on the way in and
    // to the scene being left on the way back, and each resolves its visual
    // through its OWN scope. FadeIn/FadeOut live in dashuisk/skin.xur, so both
    // scopes find them; naming the right one is what makes the read checkable.
    const forward = fromProp === 'TransFrom';
    const owner = forward ? incoming : outgoing;
    const named = (prop: TransitionProp): string => {
      const v = propByName(owner.scene, prop)?.value;
      return typeof v === 'string' ? v : '';
    };
    const play = (name: string, target: Level, role: 'out' | 'in'): RunningTransition | null => {
      if (!name) return null;
      const run = playTransition(this.engine, owner.visuals, name, target.node, role);
      if (!run) {
        this.ctx.report.errors.push(`transition visual "${name}" (${idOf(owner.scene)}.${role}) is not in the skin`);
      }
      return run;
    };
    return { out: play(named(fromProp), outgoing, 'out'), in: play(named(toProp), incoming, 'in') };
  }

  /* --------------------------------------------------------------------- boot */

  /**
   * §6. The Xbox logo sequence is NOT in this archive (no video container of
   * any kind is; the .XBMOVIE section is a Media Foundation property table) -
   * it is played by the console's boot chain before dash.xex runs, and it is in
   * PLACEHOLDERS.md. The dashboard's own boot-in IS in dashmain: BootLive runs
   * frames 462..533, 71 frames = 1.18 s against the 73 presented frames the
   * capture measures, and it fires dash_2ndLevelClose.xma on frame 497 out of
   * its own timeline.
   *
   * So we start where the console handed over: frame 462, the first frame of
   * the range, with the logo declared missing rather than faked.
   */
  boot(range = DEFAULT_BOOT): boolean {
    const spec = BOOT_RANGES.find((r) => r.name === range);
    const scope = this.scope;
    if (!spec || !scope) return false;
    this.tab = spec.tab + 1;                 // the dispatcher's tab index is 0-based
    this.updateContentPanelVisual();
    this.rebaseLevel();
    const ok = this.engine.playRange(scope.id, spec.name, spec.end);
    if (ok) this.booted = spec.name;
    return ok;
  }

  /* ---------------------------------------------------------------- telemetry */

  report(): ShellReport {
    return {
      tab: this.tab,
      level: this.levels.length - 1,
      panels: BLADES.filter((b) => b.container).map((b) => ({
        tab: b.tab,
        scene: panelSceneFor(b.tab, bladeState(this.state), this.state.iptv),
        parented: this.parented.has(b.tab),
      })),
      contentPanelVisual: this.contentPanelVisual,
      tabsLocked: this.tabsLocked,
      navRows: this.nodes.all
        .filter((n) => n.obj.className === 'XuiNavButton' && idOf(n.obj).startsWith('nav'))
        .map((n) => idOf(n.obj)),
      stack: this.levels.map((l) => l.id),
      focusId: this.focusId,
      metaIndex: this.top?.metaIndex ?? -1,
      metaText: this.top?.metaText ?? '',
      metaScene: this.top?.metaSubId ?? null,
      unresolvedPresses: [...this.unresolvedPresses],
      codePaths: [...this.codePaths],
      locale: this.locale,
      localePatches: this.localePatches,
      containersFilled: [...this.containersFilled],
      containersMissing: [...this.containersMissing],
      hardwareState: [...this.hardwareState],
      codeFilled: [...this.codeFilled],
      codeUnfilled: [...this.codeUnfilled],
      missingStrings: [...this.missingStrings],
      booted: this.booted,
    };
  }

  /** Wait for every load the shell has started (a metapane sub-scene, a pushed
   *  page). A test asserts on a settled dashboard rather than on a sleep. */
  async idle(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending]);
  }
  private track<T>(p: Promise<T>): Promise<T> {
    this.pending.add(p);
    void p.finally(() => this.pending.delete(p));
    return p;
  }

  get currentTab(): number { return this.tab; }
  get panelLevel(): number { return this.levels.length - 1; }
  get locked(): boolean { return this.tabsLocked; }
  panelFor(tab: number): LoadedScene | undefined { return this.parented.get(tab); }
  get lists(): ListView[] { return this.top?.lists ?? []; }
}

/** The System blade's panel is authored inline; find its DashScene. */
export function systemScene(dashmainRoot: XuObject): XuObject | undefined {
  let found: XuObject | undefined;
  const walk = (o: XuObject) => {
    if (!found && o.className === 'DashScene' && idOf(o) === 'System') found = o;
    o.children.forEach(walk);
  };
  walk(dashmainRoot);
  return found;
}

/** A loaded scene's root is its XuiCanvas; the scene that owns DefaultFocus and
 *  the DashScene panel table is its single child. */
export function sceneRootOf(root: XuObject): XuObject {
  return root.className === 'XuiCanvas' && root.children.length === 1 ? root.children[0]! : root;
}

function findObject(root: XuObject, id: string): XuObject | undefined {
  let found: XuObject | undefined;
  const walk = (o: XuObject) => { if (!found) { if (idOf(o) === id) found = o; else o.children.forEach(walk); } };
  walk(root);
  return found;
}

/** The nearest node with that Id INSIDE one level's subtree - never
 *  nodes.byId, which answers with every copy in the document. */
function findById(root: NodeRecord, id: string): NodeRecord | null {
  if (!id) return null;
  let found: NodeRecord | null = null;
  const walk = (n: NodeRecord) => { if (!found) { if (idOf(n.obj) === id) found = n; else n.children.forEach(walk); } };
  walk(root);
  return found;
}

export function propString(o: XuObject, name: string): string {
  const v = propByName(o, name)?.value;
  return typeof v === 'string' ? v : '';
}
