// The Blades shell.
//
// The dashboard is ONE scene: dashmain/dashmain.xur, root XuiTabScene
// "RootScene", 129 objects, 73 timelines, 2,315 keyframes over 1,299 frames cut
// into 39 named ranges. Everything a blade switch does - blades sliding,
// colours changing, wings moving, the switch sound - is already keyframed in
// there. This shell animates NOTHING. On a switch its whole job is to pick the
// named range, play it on RootScene, and have the incoming panel already
// parented before the range starts.
import { idOf, propByName, type XuObject } from '@xur/index';
import {
  loadScene, renderElement, indexVisuals, VisualScope, Skin, loadBladeSkin,
  bindTimelines, refreshVisibility, updateNode, NO_DELTA, PropBag, NO_OVERRIDES, authoredRect,
  DEFAULT_DASH_STYLE,
  type AssetIndex, type RenderCtx, type NodeIndex, type NodeRecord,
  type TimelineEngine, type SceneReport, type LoadedScene,
} from '@runtime/index';
import { BLADES, DEFAULT_TAB, bladeByTab, panelSceneFor, switchRange, levelRange, type BladeState } from './tabs';
import { IPTV_ROW } from './nav';
import { panelEntries, entryForFocus, metaRange, type PanelEntry } from './panels';

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

export interface ShellReport {
  tab: number;
  level: number;
  panels: { tab: number; scene: string | null; parented: boolean }[];
  contentPanelVisual: string;
  tabsLocked: boolean;
  navRows: string[];
}

export class BladeShell {
  private tab = DEFAULT_TAB;
  private level = 0;
  private tabsLocked = false;
  private readonly parented = new Map<number, LoadedScene>();
  private contentPanelVisual = 'content_panel';
  private metaPrev = new Map<string, number>();

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
  ) {}

  static async mount(opts: {
    assets: AssetIndex; skin: Skin; nodes: NodeIndex; engine: TimelineEngine;
    report: SceneReport; host: HTMLElement; state?: Partial<ShellState>;
    render: (root: XuObject, ctx: RenderCtx) => HTMLElement;
  }): Promise<BladeShell> {
    const state: ShellState = { ...OFFLINE, ...opts.state };
    const dashmain = await loadScene(opts.assets, DASHMAIN);
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
      opts.assets, dashmain, opts.skin, theme, ctx, opts.nodes, opts.engine, el, state,
    );
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
        const panel = await loadScene(this.assets, scene);
        this.renderInto(host, panel);
        this.parented.set(blade.tab, panel);
      } catch (err) {
        this.ctx.report.errors.push(`panel ${scene}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  /**
   * Render a loaded scene as a child of `host`. The panel keeps its OWN pack
   * for image resolution and its own scene-local visuals: a bare ImagePath in
   * live/liveSignedOutUI.xur resolves against `live`, not against `dashmain`.
   */
  private renderInto(host: NodeRecord, scene: LoadedScene): void {
    const ctx: RenderCtx = {
      ...this.ctx,
      pack: scene.pack,
      visuals: new VisualScope(indexVisuals(scene.root), this.skin, this.theme),
    };
    const rect = authoredRect(PropBag.of(scene.root, NO_OVERRIDES));
    const el = renderElement(scene.root, ctx, {
      overrides: new Map(), delta: NO_DELTA, owner: null,
      parent: host.rect, parentNode: host,
    });
    if (el) {
      el.dataset['xuiScene'] = scene.id;
      host.el.appendChild(el);
    }
    // A panel canvas is 700x445 inside a 700x369 container - 76px taller by
    // design, and the container does not clip it.
    void rect;
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
        node.overrides.set('Text', '');
        node.overrides.set('Enabled', false);
        updateNode(node, ['Text', 'Enabled', 'Visual']);
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
  openLevel(): boolean {
    const scope = this.scope;
    if (!scope) return false;
    const r = this.level === 0 ? levelRange.open(this.tab) : levelRange.blink(this.tab);
    if (this.level === 0) this.tabsLocked = true;
    this.level++;
    return this.engine.playRange(scope.id, r.start, r.end);
  }

  closeLevel(): boolean {
    const scope = this.scope;
    if (!scope || this.level === 0) return false;
    const r = this.level === 1 ? levelRange.close(this.tab) : levelRange.blink(this.tab);
    if (this.level === 1) this.tabsLocked = false;
    this.level--;
    return this.engine.playRange(scope.id, r.start, r.end);
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

  /* ------------------------------------------------------------------ metapane */

  /** The DashScene entry table of whichever scene owns this metapane. */
  panelEntriesFor(scene: XuObject): PanelEntry[] { return panelEntries(scene); }

  /**
   * Focus moved to a control: find its row by walking UP the parent chain,
   * then play the metapane's NToM range. A multi-row jump SNAPS to the End
   * frame rather than animating, and index 0 from a jump snaps with "2To1End".
   */
  focusEntry(metaId: string, entries: readonly PanelEntry[], chain: readonly XuObject[]): PanelEntry | null {
    const entry = entryForFocus(entries, chain);
    const scope = this.engine.all().find((s) => s.hostControlId === metaId);
    const prev = this.metaPrev.get(metaId) ?? -1;
    const index = entry ? entry.index : -1;
    if (scope) {
      const r = metaRange(prev, index);
      this.engine.playRange(scope.id, r.start, r.end);
    }
    this.metaPrev.set(metaId, index);
    return entry;
  }

  /* ---------------------------------------------------------------- telemetry */

  report(): ShellReport {
    return {
      tab: this.tab,
      level: this.level,
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
    };
  }

  get currentTab(): number { return this.tab; }
  get panelLevel(): number { return this.level; }
  get locked(): boolean { return this.tabsLocked; }
  panelFor(tab: number): LoadedScene | undefined { return this.parented.get(tab); }
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

export function propString(o: XuObject, name: string): string {
  const v = propByName(o, name)?.value;
  return typeof v === 'string' ? v : '';
}
