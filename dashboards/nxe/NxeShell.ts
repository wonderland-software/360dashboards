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
  isNativeLocale, DEFAULT_LOCALE, ListView, FRAMES_PER_SECOND,
  setOwnerSlot, setOwnerImageSlot,
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
import { LEGEND_SCENE, bindLegend, hoistLegend, relayoutLegend, settleLegend, type LegendReport } from './legend';
import { formatCounter, renderHtmlText } from './html';
import { LEGACY_CODE_TABLES } from './consoleSettings9199';
import { SLOT_ART, TRAY_CAPTION, TRAY_SCENES } from './slotArt';
import { Axis, FoldCascade, stepDuration } from './physics';
import { mountAura, type AuraReport } from './aura';
import {
  EPIX_COMMANDS, TRANSITION_CUES, curvesFor, resolveScenePath,
  type LegacyCurves, type NavCommand,
} from './navigation';
import { IPTV_ROW } from '@dash/blades/nav';
import { SOUND_CUES } from './variables';
import { playTransition } from '@dash/blades/transitions';

export const HOME_SCENE = 'homepage/homepage.xur';
export const CHANNEL_SCENE = 'controlp/MobyChannelScene.xur';
export const HOME_STRINGS = { pack: HOMEPAGE_PACK, table: 'strings.xus' };
/** dashcomm/dashStrings.xus[27] is the "%d of %d" counter, as HTML [SCENE]. */
export const COUNTER_STRINGS = { pack: 'dashcomm', table: 'dashStrings.xus', index: 27 };

/** A Moby slot's icon channel: `imgIcon` is a XuiImagePresenter on this
 *  DataAssociation in every slot scene that has one [SCENE]. */
export const SLOT_ICON_ASSOCIATION = 20;

export const GAMER_CARD_SCENE = 'slots/GamerCardSlotScene.xur';
/** The signed-out gamer card's two captions, out of the build's own table. */
export const GAMER_CARD_STRINGS = {
  pack: 'dashcomm', table: 'dashStrings.xus',
  signIn: 91, noProfiles: 83, someProfiles: 82,
};

/**
 * How much of full strength each queue row above the current one is drawn at.
 *
 * The rows recede: the current channel's name is white and the ones above it
 * fade out with distance. MEASURED off the default-theme home frame
 * [FRAME Yrt f0483] and confirmed in shape on [FRAME Kpa f0048], where the
 * stack reads My Xbox (full), Game Marketplace, Video & Music Marketplace,
 * Friends, Inside Xbox in falling brightness. Rows past the fifth continue the
 * ramp and are effectively invisible, which is what the frames show.
 *
 * MEASURED, not authored: the file gives all nine rows the same colour.
 */
export const QUEUE_DIM: readonly number[] = [1, 0.75, 0.55, 0.35, 0.2, 0.12, 0.07];

/** `%EvResStr(IDS_SELECTSLOT)%` - the A caption on the home page. Both "Select"
 *  strings in homepage/strings.xus ([18] and [22]) are the same word, so which
 *  index the code reads cannot change what is drawn. */
export const SELECT_SLOT_INDEX = 18;

/**
 * The eight `Queue` rows, in the order the code addresses them by child path
 * (`Queue\Prev1`, `Queue\Current`, `Queue\Next1`.. [CODE 0x920b0e44]).
 *
 * WHICH WAY THE STACK RUNS is a fact of the frames, and M4a had it backwards.
 * `Prev1` is authored BELOW `Current` (y = 190 against 154, on a 36 px pitch
 * falling to Next6 at -62) [SCENE], so the rows above the current channel are
 * `Next1..Next6` - and they carry the channels that FOLLOW it in file order,
 * wrapping past the end of the list:
 *
 *   [FRAME Kpa f0048] stacks, upward from the highlighted "My Xbox": Game
 *   Marketplace, Video & Music Marketplace, Friends, Inside Xbox, Events -
 *   emb_homepage.xml's five inline channels in file order, and My Xbox is the
 *   LAST channel in that file. So Next_n = passing[(current + n) mod N].
 *   [FRAME Yv5 f0040] agrees on a two-channel offline console: "Witamy" alone,
 *   above "Moja konsola Xbox".
 *
 * NOTHING IS DRAWN BELOW THE CURRENT ROW at rest: `Prev1`'s band on both home
 * frames is a smooth floor gradient with no ink in it. The row exists for the
 * name that slides in from below during a scroll; at rest it is empty, and it
 * is left empty here rather than filled with the previous channel.
 */
export const QUEUE_ROWS = ['Prev1', 'Current', 'Next1', 'Next2', 'Next3', 'Next4', 'Next5', 'Next6'] as const;

export interface ChannelRow { id: string; name: string; slots: number }

export interface NxeReport {
  build: string;
  home: string;
  /** Every channel the XML declares, and whether it passed offline. */
  channels: { id: string; name: string; passed: boolean; condition: string; slots: number; source: string }[];
  /** The channel the queue is centred on. */
  currentChannel: string;
  /** What the queue actually shows, with the strength each row is drawn at
   *  (1 = the current channel, 0 = not drawn). */
  queue: { row: string; text: string; dim: number }[];
  /** The current channel's slots, in order, with the scene each mounted.
   *  `z` is the LIVE depth: it moves with the panel cursor every frame. */
  panels: { name: string; epixid: string; path: string; scene: string | null; z: number; mounted: boolean; visible: boolean; fold: number; screen: { x: number; y: number; s: number } }[];
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
  /** The LegacyControl page hosted inside the shell, if any: the TOP of the
   *  page stack. `pages` is the whole stack, deepest first. */
  legacy: LegacyReport | null;
  pages: { scene: string; curve: string; form: string; rows: number; focusId: string | null }[];
  legend: LegendReport | null;
  /** The live state of the two servoed cursors and the fold cascade. */
  motion: {
    channel: { cursor: number; velocity: number; target: number; moving: boolean };
    panel: { cursor: number; velocity: number; target: number; moving: boolean };
    fold: { phase: string; progress: number[] };
    /** Frames stepped since the shell attached, so a duration in the report is
     *  countable against the engine's own clock and never a wall clock. */
    frames: number;
    /** The closed-form duration of one step on each axis, in seconds and in
     *  60 Hz frames. dashboards/nxe/physics.ts derives it. */
    stepSeconds: { channel: number; panel: number };
  };
  /** Every cue fired, with the 60 Hz tick it fired on. */
  cues: { name: string; file: string; tick: number; evidence: 'table' | 'inferred'; played: boolean }[];
  /** The background, and what stands in for the parts that need a GPU. */
  aura: AuraReport | null;
  /** The four `SceneTransitions/*` entries, read out of Variables.xur. */
  sceneTransitions: { name: string; value: number | null }[];
  /** `<cmd>` values a slot names that this archive does not bind to a scene. */
  unboundCommands: string[];
  /** Things this milestone does not do, named rather than left to be noticed. */
  physics: readonly string[];
  /** Epix paths that named a scene the archive does not carry. */
  unresolvedEpix: string[];
  /** What each slot was dressed with, and why (dashboards/nxe/slotArt.ts). */
  slotArt: { scene: string; image: string; icon: string | null; caption: string; inferred: string }[];
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
  /** An IPTV provider is configured. FALSE is the footage's state: the System
   *  Settings page shows SEVEN rows with `navIPTVSettings` hidden, and that
   *  row's authored Text is nothing but the `<servicename>` token
   *  [FRAME Kpa f0391]. */
  iptv: boolean;
  /** How many LOCAL profiles the console has. Device state, exactly as in
   *  Blades: the gamer card slot's signed-out caption is "%d Profiles Found"
   *  with some and "No Profiles Found" with none. ZERO is the shell's default
   *  and the state the offline capture is in. */
  profiles: number;
}

export const NXE_OFFLINE: NxeState = { ...OFFLINE_STATE, channel: null, page: null, iptv: false, profiles: 0 };

interface MountedPanel {
  slot: Slot;
  path: string;
  scene: string | null;
  /** The slot's INDEX on the strip. Its depth is (index - cursor) * spacing and
   *  changes every frame; `z` in the report is that live depth. */
  index: number;
  z: number;
  visible: boolean;
  rig: NodeRecord | null;
  wrapper: HTMLElement;
}

/** One page on the LegacyControl stack. */
interface LegacyPage {
  scene: string;
  loaded: LoadedScene;
  node: NodeRecord;
  wrapper: HTMLElement;
  curves: LegacyCurves;
  report: LegacyReport;
  /** The focusable rows: a filled list, or the scene's own nav buttons. */
  list: ListView | null;
  navIds: string[];
  navFocus: number;
}

/** A cue the glue fired, with the engine tick it fired on. */
export interface NxeCue {
  name: string;
  file: string;
  tick: number;
  evidence: 'table' | 'inferred';
  played: boolean;
}

/** The sink a fired cue goes to. `AudioBank` is one; the smoke suites read the
 *  log either way, so a muted page still records every cue and its tick. */
export interface CueSink {
  play(cue: string, scope?: string | null, tick?: number): { played: boolean };
}

export class NxeShell {
  private variables!: Variables;
  private strip!: StripConstants;
  private channels: { channel: Channel; passed: boolean; name: string }[] = [];
  private current = 0;
  private panels: MountedPanel[] = [];
  private queue: { row: string; text: string; dim: number }[] = [];
  private counter = '';
  private conditions: NxeReport['conditions'] = [];
  private readonly unresolvedEpix: string[] = [];
  private readonly errors: string[] = [];
  private legacy: LegacyReport | null = null;
  private legend: LegendReport | null = null;
  private homeStrings: string[] = [];
  private readonly legendPending: NodeRecord[] = [];
  private readonly slotArt: { scene: string; image: string; icon: string | null; caption: string; inferred: string }[] = [];
  private readonly pending = new Set<Promise<unknown>>();

  /* --------------------------------------------------------------- motion */

  /** The two servoed cursors and the fold cascade (dashboards/nxe/physics.ts). */
  private channelAxis!: Axis;
  private panelAxis!: Axis;
  private foldCascade!: FoldCascade;
  private panelLayer: NodeRecord | null = null;
  private stopStepper: (() => void) | null = null;
  private cueSink: CueSink | null = null;
  private readonly cueLog: NxeCue[] = [];
  private readonly pages: LegacyPage[] = [];
  private legendRoot: NodeRecord | null = null;
  private aura: AuraReport | null = null;
  private readonly unboundCommands: string[] = [];
  private counterFormat: string | null = null;
  private counterNode: NodeRecord | null = null;
  private queueNode: NodeRecord | null = null;
  private disposed = false;

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
    shell.settle();
    shell.place();
    refreshVisibility(el, opts.report);
    return shell;
  }

  /* ------------------------------------------------------------- lifecycle */

  /**
   * Wire the cue sink and start integrating.
   *
   * The stepper runs on the ENGINE's fixed 60 Hz step, not on a clock of its
   * own: `?frame=`, `?manual` + `stepFrames()` and the browser then all produce
   * the same strip position for the same input, which is the only way a
   * measured duration in the smoke suite means anything.
   */
  attach(audio: CueSink | null): void {
    this.cueSink = audio;
    this.stopStepper?.();
    this.stopStepper = this.engine.addStepper(() => this.stepMotion(1 / FRAMES_PER_SECOND));
  }

  /** Give up the stepper. The DOM and the engine belong to the caller. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopStepper?.();
    this.stopStepper = null;
    this.cueSink = null;
  }

  /* ------------------------------------------------------------ composition */

  private async compose(): Promise<void> {
    // The strip constants first: everything below is placed with them.
    const vars = await loadScene(this.assets, VARIABLES_SCENE);
    this.variables = new Variables(vars.root);
    this.strip = this.variables.strip('Moby');
    // Both cursors and the cascade come out of the same thirty constants.
    this.channelAxis = new Axis('channel', this.strip.channel);
    this.panelAxis = new Axis('panel', this.strip.panel);
    this.foldCascade = new FoldCascade(this.strip);

    this.homeStrings = await this.strings.stringsByIndex(HOME_STRINGS.pack, HOME_STRINGS.table, this.locale);

    // The background is `dashmain/DashBkgnd.xur` and it goes in first, behind
    // everything the shell composes on top of it (dashboards/nxe/aura.ts).
    this.aura = await mountAura({
      assets: this.assets, skin: this.skin, ctx: this.ctx, nodes: this.nodes,
      strings: this.strings, locale: this.locale, host: this.rootScene(),
      configuredBy: this.home.root,
    });
    for (const e of this.aura.errors) this.errors.push(`aura: ${e}`);

    await this.readChannels();
    // The channel cursor starts ON the arriving channel, not at zero: `current`
    // is an index into the passing list and the axis measures in the same
    // units, so leaving it at 0 slides the whole queue by `current` row
    // pitches. (It did: the stack came up 216 px high on an 8-channel home.)
    this.channelAxis.set(this.current);
    this.channelAxis.setBounds(0, Math.max(0, this.channels.filter((c) => c.passed).length - 1));
    // The channel queue belongs to the HOME page. Leaving the home page folds
    // the strip away and swaps to a Rome shell whose overlay is
    // controlp/RomeOverlayScene.xur - one XuiHtmlElement called `Description`
    // and nothing else [SCENE]. The fold is not implemented (see PHYSICS_NOT_
    // IMPLEMENTED), so a hosted page simply does not build the queue.
    if (!this.state.page) await this.mountChannelScene();

    if (this.state.page) await this.mountLegacyPage(this.state.page);
    else await this.mountStrip();

    // The legend is a shell service on both paths: the page it frames parks its
    // own legend buttons off-screen and expects the shell to hoist them.
    this.legend = await hoistLegend({
      assets: this.assets, skin: this.skin, ctx: this.ctx, nodes: this.nodes,
      engine: this.engine, host: this.rootScene(), strings: this.strings,
      locale: this.locale, source: this.legacySource(),
      pending: this.legendPending,
      supplied: this.suppliedCaptions(),
      mounted: (root) => { this.legendRoot = root; },
    });
  }

  /**
   * The legend captions the SHELL supplies rather than hoisting.
   *
   * On the home page there is no hosted page to park a `legend_a`, and every
   * capture shows "(A) Select" under the strip anyway. It comes from the
   * focused slot's own `<onclick><helptext>` in the channel XML - every My Xbox
   * slot writes `%EvResStr(IDS_SELECTSLOT)%` - resolved through
   * `homepage/strings.xus`. Not invented: it is the slot's own token and the
   * build's own string.
   */
  private suppliedCaptions(): { group: string; from: string; text: string }[] {
    if (this.pages.length) return [];
    const slot = this.panels[Math.round(this.panelAxis?.cursor ?? 0)]?.slot;
    const help = slot?.onclick?.helptext ?? '';
    if (!help) return [];
    const r = resolveResString(help, this.homeStrings);
    // IDS_SELECTSLOT is one of the three IDS_ names the .rdata pair does not
    // resolve, so it falls back to the index the two "Select" entries share.
    const text = r.text ?? this.homeStrings[SELECT_SLOT_INDEX] ?? '';
    if (!text) return [];
    return [{ group: 'AButton', from: `${slot?.name || slot?.epixid}: <helptext>${help}`, text }];
  }

  /** The scene the legend hoists its captions from: the top page, or the slot
   *  the panel cursor is on. */
  private legacySource(): NodeRecord | null {
    const top = this.pages[this.pages.length - 1];
    if (top) return top.node;
    return this.frontSlotRoot();
  }

  /** Re-read the legend from whatever is on screen now, and park the groups it
   *  brought back on the end of their Show range. */
  private refreshLegend(): void {
    if (!this.legendRoot) return;
    this.legend = bindLegend(this.legendRoot, this.legacySource(), this.legendPending, this.suppliedCaptions());
    this.settle();
  }

  /** Park the legend's bound groups on the last frame of their Show range;
   *  see settleLegend. Runs after bindTimelines, because there is no scope to
   *  seek until the timelines are bound. */
  settle(): void {
    if (!this.legend) return;
    this.legend.settled = settleLegend(this.engine, this.legendPending);
    // Only now are the captions on screen and measurable; see relayoutLegend.
    if (this.legendRoot) relayoutLegend(this.legendRoot, this.legend);
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
    this.queueNode = node;

    // The "N of M" counter. Its format string is dashStrings.xus[27] and the
    // element that draws it is called `Description` in BOTH the Moby channel
    // scene and controlp/RomeOverlayScene.xur [CODE 0x9248b9a4 / 0x92490f2c].
    const table = await this.strings.stringsByIndex(COUNTER_STRINGS.pack, COUNTER_STRINGS.table, this.locale);
    const fmt = table[COUNTER_STRINGS.index];
    if (fmt === undefined) this.errors.push(`${COUNTER_STRINGS.table}[${COUNTER_STRINGS.index}] is missing`);
    this.counterFormat = fmt ?? null;
    this.counterNode = this.findIn(node, 'Description');
    this.refreshQueue();
  }

  /**
   * Rewrite the nine queue rows and the counter for the current cursors.
   *
   * The queue is a NAME LIST, not a scroller: the code writes a channel name
   * into each of the nine `Queue\*` children by child path [SPEC §1.3], so a
   * channel change rewrites nine strings rather than moving anything. The
   * fractional part of the channel cursor slides the whole `Queue` group by the
   * scene's own 36 px pitch while the cursor is between two channels, which is
   * the one [INFER] here and is named in `__dash.nxe.physics`.
   */
  private refreshQueue(): void {
    const node = this.queueNode;
    const passing = this.channels.filter((c) => c.passed);
    const n = passing.length;
    this.queue = [];
    for (const row of QUEUE_ROWS) {
      // Next1..Next6 are the FOLLOWING channels in file order, wrapping past
      // the end of the list; Prev1 is empty at rest. See QUEUE_ROWS' header for
      // the frames that settle both.
      const up = row === 'Current' ? 0 : row === 'Prev1' ? -1 : Number(row.slice(4));
      const text = up < 0 || !n ? '' : passing[(this.current + up) % n]?.name ?? '';
      const dim = up < 0 ? 0 : QUEUE_DIM[Math.min(up, QUEUE_DIM.length - 1)] ?? 0;
      this.queue.push({ row, text, dim });
      if (!node) continue;
      const target = this.findIn(node, row);
      if (!target) { this.noteOnce(`${CHANNEL_SCENE}: no Queue\\${row}`); continue; }
      target.overrides.set('Text', text);
      target.overrides.set('Opacity', dim);
      updateNode(target, ['Text', 'Opacity']);
    }
    // The bullet beside the current name. `Marker1` and `Marker2` are two 16x64
    // groups authored at the Current row's own y with Opacity 0 and
    // Scale (-1,1,1) - the file parks them and the code lays them out, exactly
    // as it does the legend buttons. ONE is raised here, because one bullet is
    // what the frames show; the second is recorded as unresolved rather than
    // drawn on top of the first.
    if (node) {
      const marker = this.findIn(node, 'Marker1');
      if (marker) { marker.overrides.set('Opacity', 1); updateNode(marker, ['Opacity']); }
    }
    if (node) {
      const queue = this.findIn(node, 'Queue');
      // A channel cursor between two rows slides the group by the pitch. At
      // rest the offset is exactly 0, so a still frame is unaffected.
      const frac = this.channelAxis.cursor - this.current;
      if (queue) queue.el.style.setProperty('translate', `0 ${(frac * QUEUE_PITCH).toFixed(2)}px`);
    }

    const total = this.slotsOf(passing[this.current]?.channel).length;
    const shown = total ? Math.min(total, Math.max(1, Math.round(this.panelAxis.cursor) + 1)) : 0;
    if (this.counterFormat === null) return;
    const html = formatCounter(this.counterFormat, shown, total);
    this.counter = html.replace(/<[^>]*>/g, '').trim();
    if (!this.counterNode) return;
    const r = renderHtmlText(html);
    for (const t of r.unknownTags) this.noteOnce(`XuiHtmlElement: unimplemented tag <${t}>`);
    this.counterNode.el.replaceChildren(r.el);
  }

  private noteOnce(msg: string): void {
    if (!this.errors.includes(msg)) this.errors.push(msg);
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
    this.panelLayer = layer;
    await this.buildStrip();
  }

  /** The spacing this channel uses: `<spacing>` overrides the default [SCENE]. */
  private get spacing(): number {
    const entry = this.channels.filter((c) => c.passed)[this.current];
    return entry?.channel.spacing ?? this.strip.defaultSpacing;
  }

  /**
   * Build every panel of the current channel and hand each its own wrapper.
   *
   * Every slot gets a wrapper; only slots the cull rule can reach get a RIG.
   * `MobyVisiblePanelDistance / spacing` = 3225 / 505 = 6.4, so the front slot
   * plus six receding ones are built, which is exactly what the home frame
   * shows [FRAME Yrt f0483] - and because the cursor moves, the reach is
   * measured from the cursor, not from slot 0.
   */
  private async buildStrip(): Promise<void> {
    const layer = this.panelLayer;
    if (!layer) return;
    for (const p of this.panels) p.wrapper.remove();
    this.panels = [];
    const entry = this.channels.filter((c) => c.passed)[this.current];
    if (!entry) return;
    const slots = this.slotsOf(entry.channel);
    this.panelAxis.set(0);
    this.panelAxis.setBounds(0, Math.max(0, slots.length - 1));
    this.foldCascade.reset(slots.length, false);

    for (const [k, slot] of slots.entries()) {
      const path = entry.channel.epix.get(slot.epixid) ?? '';
      const bound = EPIX_SCENES[path];
      const scene = bound?.scene ?? null;
      const wrapper = this.newPanelWrapper(layer);
      const mounted: MountedPanel = { slot, path, scene, index: k, z: k * this.spacing, visible: false, rig: null, wrapper };
      this.panels.push(mounted);
      if (k * this.spacing > this.strip.visiblePanelDistance) continue;
      if (!scene) { this.unresolvedEpix.push(`${slot.epixid} -> ${path || '(no epix object)'}: no binding`); continue; }
      if (!this.assets.entry(scene.split('/')[0]!, scene.split('/').slice(1).join('/'))) {
        this.unresolvedEpix.push(`${path} -> ${scene}: ${bound?.note ?? 'not in the manifest'}`);
        continue;
      }
      mounted.rig = await this.buildRig(wrapper, scene, slot, entry.channel);
    }
  }

  /**
   * One panel's place on the strip.
   *
   * `FrontPosition` is the front panel's BOTTOM-LEFT anchor in screen units at
   * z = 0, and the hosted scene is LEFT- and BOTTOM-aligned inside the rig's
   * 512x512 texture surface. That alignment is not a choice: the surface sits
   * at the rig's (0,-2), so its own foot is at rig y = 510, and the rig's
   * `Reflection` mirrors about exactly that line - which is why the footage
   * shows the reflection starting at the PANEL's foot and not 192 px below it.
   * The rig's `Shadow` agrees independently: it is authored at y = 190 with
   * height 320, and 512 - 320 - 2 = 190 is precisely where a bottom-aligned
   * 320-tall slot starts.
   *
   * So the wrapper's origin is (anchor.x, anchor.y - 510), and the front slot's
   * own edges then land at (96, 248) top-left and (516, 568) bottom-right
   * against the frame's (95.3, 248.0) and (515.6, 568.0) [FRAME Yrt f0483].
   */
  private newPanelWrapper(layer: NodeRecord): HTMLElement {
    const w = document.createElement('div');
    w.className = 'nxe-panel';
    w.style.cssText = [
      'position:absolute', 'left:0', 'top:0',
      `width:${PANEL_SURFACE_SIZE}px`, `height:${PANEL_SURFACE_SIZE}px`,
      'transform-origin:0 0',
    ].join(';');
    // Nearer panels paint OVER further ones, so the strip is inserted deepest
    // first: each new (deeper) panel goes to the front of the layer's children
    // and the front panel ends up last. The layer is `transform-style: flat`,
    // so paint order is document order and z alone does not sort it.
    layer.el.insertBefore(w, layer.el.firstChild);
    return w;
  }

  /**
   * Put every panel where the cursor and the fold say it is. Called once a
   * frame while anything is moving, and once after every rebuild.
   *
   * Slot k sits at depth `(k - cursor) * spacing`, so the cursor IS the front
   * anchor: at rest on slot 0 the front panel's own edges land at (96, 248) to
   * (516, 568) against the frame's (95.3, 248.0) to (515.6, 568.0)
   * [FRAME Yrt f0483], which is the M4a measurement unchanged.
   *
   * The FOLD is the [INFER] here and is named as one in `__dash.nxe.physics`:
   * a folding panel's depth is scaled toward the front anchor by `1 - progress`
   * and its opacity goes with it, so the strip collapses into the front slot
   * and fades. Nothing in the archive states the geometry of a fold.
   */
  place(): void {
    const spacing = this.spacing;
    for (const p of this.panels) {
      const fold = this.foldCascade.progress[p.index] ?? 0;
      const z = (p.index - this.panelAxis.cursor) * spacing * (1 - fold);
      p.z = z;
      // Culled BEHIND by MobyVisiblePanelDistance, and in FRONT once a panel
      // has passed the cursor by a whole panel: at z = -spacing the strip line
      // has already carried it off the left edge of the screen (x = -453 for
      // the Moby line) and it is scaled up 1.55x, which is the console's own
      // "the front slot flies past you" look.
      const visible = fold < 1 && z <= this.strip.visiblePanelDistance && z > -spacing;
      p.visible = visible;
      p.wrapper.style.display = visible ? '' : 'none';
      if (!visible) continue;
      const pt = pointOnStrip(this.strip.frontPosition, this.strip.backPosition, z);
      p.wrapper.style.transform = `translate3d(${pt.x}px, ${pt.y - SURFACE_FOOT}px, ${-z}px)`;
      p.wrapper.style.opacity = fold > 0 ? String(1 - fold) : '';
      p.wrapper.dataset['nxeZ'] = z.toFixed(1);
      p.wrapper.dataset['nxeScale'] = scaleAt(this.projection, z).toFixed(4);
      const pr = project(this.projection, { x: pt.x, y: pt.y, z });
      p.wrapper.dataset['nxeScreen'] = `${pr.x.toFixed(1)},${pr.y.toFixed(1)}`;
    }
  }

  /** Where a panel's anchor lands on screen, for the report. */
  private screenOf(p: MountedPanel): { x: number; y: number; s: number } {
    const pt = pointOnStrip(this.strip.frontPosition, this.strip.backPosition, p.z);
    const pr = project(this.projection, { x: pt.x, y: pt.y, z: p.z });
    return { x: Number(pr.x.toFixed(2)), y: Number(pr.y.toFixed(2)), s: Number(pr.s.toFixed(4)) };
  }

  /* --------------------------------------------------------- the integrator */

  /**
   * One 60 Hz frame of the shell's own motion.
   *
   * Three independent things advance here and nothing else does: the channel
   * cursor, the panel cursor and the fold cascade. Each is integrated at the
   * timeline's fixed step, so nothing depends on wall time.
   */
  private stepMotion(dt: number): void {
    const channel = this.channelAxis.step(dt);
    const panel = this.panelAxis.step(dt);
    const fold = this.foldCascade.step(dt);
    if (channel) {
      this.refreshQueue();
    } else if (this.channelWasMoving) {
      // Landed. Normalise the index modulo the channel count (the cursor is
      // allowed to run past either end so a wrap never breaks a move) and
      // rebuild the strip for the channel it arrived on.
      const n = Math.max(1, this.channels.filter((c) => c.passed).length);
      const landed = ((Math.round(this.channelAxis.cursor) % n) + n) % n;
      this.channelAxis.set(landed);
      if (landed !== this.current) { this.current = landed; void this.track(this.onChannelLanded()); }
      this.refreshQueue();
    }
    this.channelWasMoving = channel;
    if (panel) {
      this.refreshQueue();
      const landed = Math.round(this.panelAxis.cursor);
      if (this.panelAxis.cursor === landed) this.refreshLegend();
    }
    if (channel || panel || fold) this.place();
    // The unfold that follows a fold is a separate cascade, started only once
    // the fold has finished - so a channel change is fold, swap, unfold, never
    // two cascades at once.
    if (!fold && this.pendingUnfold) { this.pendingUnfold = false; this.startUnfold(); }
  }
  private pendingUnfold = false;
  private channelWasMoving = false;

  /* --------------------------------------------------------------- the cues */

  /**
   * Play one of the eight cues named in the code's config table at .rdata
   * 0x927f7194 - or one of the two page-transition cues, which are tagged
   * `inferred` because the table does not name them.
   *
   * This is the opposite of the Blades rule and the easiest thing to get wrong:
   * in Blades every cue is a `XuiSoundXAudio.File` keyframe and the engine
   * fires it; NONE of the NXE navigation cues is on any timeline, so the glue
   * plays them or nothing does.
   */
  private cue(name: keyof typeof SOUND_CUES | 'TransitionInto' | 'TransitionFrom'): void {
    const file = name === 'TransitionInto' ? TRANSITION_CUES.into
      : name === 'TransitionFrom' ? TRANSITION_CUES.from
        : SOUND_CUES[name];
    if (!file) { this.noteOnce(`no cue file for ${name}`); return; }
    const evidence = name === 'TransitionInto' || name === 'TransitionFrom' ? 'inferred' : 'table';
    const tick = this.engine.frames;
    const ev = this.cueSink?.play(file, `nxe:${name}`, tick) ?? { played: false };
    this.cueLog.push({ name, file, tick, evidence, played: ev.played });
    if (this.cueLog.length > 200) this.cueLog.shift();
  }

  /* -------------------------------------------------------------- the input */

  /** D-pad left/right: the panel cursor. A refused move is silent, exactly as
   *  a held d-pad at the end of a Blades list is. */
  movePanel(dir: -1 | 1): boolean {
    if (this.pages.length) return false;   // the strip is folded away
    if (!this.panelAxis.nudge(dir)) return false;
    this.cue(dir > 0 ? 'SoundPanelRight' : 'SoundPanelLeft');
    return true;
  }

  /**
   * D-pad up/down: the channel cursor. Home only [SPEC §2.3].
   *
   * UP is +1, because the row ABOVE the current one is `Next1` and `Next1` is
   * the channel that FOLLOWS it in file order (QUEUE_ROWS' header). And the
   * cursor WRAPS, because the queue does: with My Xbox current and last, the
   * frame draws the first channel directly above it, so there is somewhere for
   * Up to go. The axis is left unbounded and the index is normalised modulo the
   * channel count when the cursor lands, so a wrap never interrupts a move
   * half-way.
   */
  moveChannel(dir: -1 | 1): boolean {
    if (this.pages.length) return this.movePageFocus(dir === 1 ? -1 : 1);
    const n = this.channels.filter((c) => c.passed).length;
    if (n <= 1) return false;
    this.channelAxis.setBounds(-Infinity, Infinity);
    if (!this.channelAxis.nudge(dir)) return false;
    this.cue(dir > 0 ? 'SoundChannelUp' : 'SoundChannelDown');
    // Leaving a channel folds its panels away; the UNFOLD waits for the rebuild
    // (onChannelLanded sets pendingUnfold), because the new channel's scenes
    // are fetched and the console's were already in memory.
    this.startFold(false);
    return true;
  }

  /** `thenUnfold` is what tells a CHANNEL change from a page push: the channel
   *  change folds one set away and unfolds another, and the page push folds the
   *  strip away and leaves it folded until B brings it back. */
  private startFold(thenUnfold: boolean): void {
    this.foldCascade.fold(this.panels.length);
    this.pendingUnfold = thenUnfold;
    this.cue('SoundPanelFold');
  }

  private startUnfold(): void {
    this.foldCascade.unfold(this.panels.length);
    this.cue('SoundPanelUnfold');
  }

  /** Rebuild the strip for the channel the cursor landed on, then unfold it. */
  private async onChannelLanded(): Promise<void> {
    await this.buildStrip();
    this.foldCascade.reset(this.panels.length, true);
    this.refreshQueue();
    this.place();
    this.refreshLegend();
    this.pendingUnfold = true;
  }

  /**
   * A. On the home strip this runs the focused slot's `<onclick>`; on a hosted
   * page it presses the focused row.
   *
   * `EpixCmd` looks the `<cmd>` up in the command table (navigation.ts); a
   * command whose destination this archive does not bind is REFUSED and
   * recorded in `__dash.nxe.unboundCommands` rather than pointed somewhere
   * plausible. `KeyDown` delivers A to the slot scene, which in this archive
   * has no handler, and is recorded the same way.
   */
  async press(): Promise<boolean> {
    this.cue('SoundButtonSelect');
    if (this.pages.length) return this.pressPage();
    const slot = this.panels[Math.round(this.panelAxis.cursor)]?.slot;
    if (!slot) return false;
    const click = slot.onclick;
    if (!click || click.button !== 'A') return false;
    if (click.action !== 'EpixCmd') {
      this.noteUnbound(`${slot.name || slot.epixid}: <action>${click.action}</action> is delivered to the slot scene, which has no handler in this archive`);
      return false;
    }
    const cmd = EPIX_COMMANDS[click.cmd] as NavCommand | undefined;
    if (!cmd || !cmd.scene) {
      this.noteUnbound(`${click.cmd}${cmd ? ` (id ${cmd.id})` : ''}: ${cmd?.evidence ?? 'not in the command table at 0x920288a0'}`);
      return false;
    }
    await this.pushPage(cmd.scene);
    return true;
  }

  /** B. Pop the page stack; on the home page it does nothing. */
  back(): boolean {
    if (!this.pages.length) return false;
    this.cue('SoundButtonBack');
    void this.track(this.popPage());
    return true;
  }

  private noteUnbound(msg: string): void {
    if (!this.unboundCommands.includes(msg)) this.unboundCommands.push(msg);
  }

  /** A PanelScene clone with `scene` mounted into its texture surface. */
  private async buildRig(wrapper: HTMLElement, scene: string, slot?: Slot, channel?: Channel): Promise<NodeRecord | null> {
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
    const mounted = this.renderInto(parts.surface, hosted);
    const size = this.sizeOf(hosted.root);
    // Bottom-aligned in the surface (see placePanel). Left-aligned needs no
    // write: the scene's own x is 0.
    if (mounted) {
      mounted.el.style.top = `${PANEL_SURFACE_SIZE - size.h}px`;
      mounted.el.dataset['nxeAlign'] = 'bottom';
    }

    if (mounted && slot) await this.dressSlot(mounted, scene, slot, channel);

    // The reflection is built AFTER the slot is dressed: it is a copy of the
    // surface's DOM, so it has to be taken once the surface is finished.
    if (parts.reflection) mountReflection(parts.surface, parts.reflection);

    // The shadow keeps its AUTHORED geometry, (465,190) 32x320. Nothing is
    // repositioned: y = 190 is exactly 512 - 320 - 2, the top of a
    // bottom-aligned 320-tall slot, so the rig is already authored for a Moby
    // slot. A hosted scene of another size would need the console's own SHADOW
    // parameter (.rdata 0x920b0f48) and that rule is not recovered - which is
    // recorded rather than guessed at.
    if (parts.shadow && size.h !== SLOT_HEIGHT) {
      parts.shadow.el.dataset['nxeApprox'] = `shadow authored for a ${SLOT_HEIGHT}-tall slot, hosting ${size.h}`;
    }
    return rig;
  }


  /**
   * Fill a Moby slot's owner properties, which is what its visual draws.
   *
   * The slot scene declares neither: the console's slot class sets the picture
   * and the caption. The picture comes from slotArt.ts (files in the archive,
   * bound by the .rdata literal cluster); the caption is the slot's own
   * `<description>` out of the channel XML, resolved through
   * `homepage/strings.xus` - so "Gamer Card", "Game Library", "Video Library"
   * are the build's own strings, not ours. The disc tray is the one exception
   * and it is device state, exactly as in Blades.
   */
  private async dressSlot(mounted: NodeRecord, scene: string, slot: Slot, channel?: Channel): Promise<void> {
    const art = SLOT_ART[scene];
    const sceneNode = mounted.children[0] ?? mounted;

    let caption = '';
    const trayIx = TRAY_SCENES[scene];
    if (trayIx !== undefined) {
      const t = await this.strings.stringsByIndex(TRAY_CAPTION.pack, TRAY_CAPTION.table, this.locale);
      caption = t[trayIx] ?? '';
      if (!caption) this.errors.push(`${TRAY_CAPTION.table}[${trayIx}] (tray caption) is missing`);
    } else if (slot.description) {
      const r = resolveResString(slot.description, this.homeStrings);
      caption = r.text ?? '';
    }

    const pack = scene.split('/')[0]!;
    if (art) {
      const file = this.assets.entry(pack, art.image) ? art.image : '';
      if (!file) this.errors.push(`${scene}: ${art.image} is not in the ${pack} pack`);
      if (sceneNode.visualOwner) {
        sceneNode.visualOwner.imagePath = file;
        sceneNode.visualOwner.text = caption;
      }
      sceneNode.overrides.set('ImagePath', file);
      sceneNode.overrides.set('Text', caption);
      updateNode(sceneNode, ['ImagePath', 'Text']);
      const repaint = (n: NodeRecord): void => {
        if (n !== sceneNode && (n.kind === 'imagePresenter' || n.kind === 'textPresenter')) updateNode(n, ['ImagePath', 'Text']);
        n.children.forEach(repaint);
      };
      repaint(sceneNode);
      // The big icon is the scene's OWN `imgIcon` presenter, on a secondary
      // DataAssociation, so it is drawn as a plain image rather than left to
      // repeat the background.
      // The icon is a SECONDARY channel of the same control - imgIcon is a
      // XuiImagePresenter on DataAssociation 20 - so it is handed to the
      // presenter and drawn by the presenter's own SizeMode rules. It sets
      // none, so the default NORMAL applies: natural size, top-left in the
      // 208x342 box. Drawing it by hand `contain`-fitted to that box put
      // icon_disc.png's opaque top ~30 design px low against the frame.
      const icon = art.icon && this.assets.entry(pack, art.icon) ? art.icon : null;
      const iconNode = this.findIn(sceneNode, 'imgIcon');
      if (icon && iconNode) {
        setOwnerImageSlot(sceneNode, SLOT_ICON_ASSOCIATION, icon);
        updateNode(iconNode, ['ImagePath']);
      }
      this.slotArt.push({ scene, image: file, icon, caption, inferred: art.inferred });
    } else {
      if (sceneNode.visualOwner) sceneNode.visualOwner.text = caption;
      sceneNode.overrides.set('Text', caption);
      updateNode(sceneNode, ['Text']);
      this.slotArt.push({ scene, image: '', icon: null, caption, inferred: 'no art binding recovered for this scene' });
    }
    await this.dressGamerCard(mounted, scene);
    void channel;
  }

  /**
   * The gamer card slot with no profile signed in.
   *
   * `slots/GamerCardSlotScene.xur` authors BOTH states and expects the console
   * to pick one [SCENE]: `UserGroup` (gamertag on DataAssociation 7, gamerscore
   * on 1, the `GImage` G, four `imgGame*` boxart slots and a "Latest Games"
   * label) and `SignedOutGroup` (`Signin` on association 5, `ProfilesAvailable`
   * on 6). Drawing `UserGroup` on a console with nobody signed in paints
   * "Latest Games" and a G over empty boxes, which no capture shows: the
   * offline frames show the SignedOutGroup pair [FRAME Kpa f0048, "Sign In" over
   * "3 Profiles Found"].
   *
   * This is the same rule the Blades shell already applies to
   * `DashLiveSignedOut`, and the strings are the build's own. 9199's
   * `dashcomm/dashStrings.xus` has no "Create Profile" - the string does not
   * exist anywhere in the 9199 dump - so with no profile the pair is [91]
   * "Sign In" and [83] "No Profiles Found". ([98] is a second "Sign In"; the two
   * are the same string, so which index the code reads cannot change the pixel.)
   */
  private async dressGamerCard(mounted: NodeRecord, scene: string): Promise<void> {
    if (scene !== GAMER_CARD_SCENE) return;
    const sceneNode = mounted.children[0] ?? mounted;
    const signedIn = !this.state.liveTierNone && this.state.profiles > 0;
    const user = this.findIn(sceneNode, 'UserGroup');
    const out = this.findIn(sceneNode, 'SignedOutGroup');
    if (user) { user.overrides.set('Show', signedIn); updateNode(user, ['Show']); }
    if (out) { out.overrides.set('Show', !signedIn); updateNode(out, ['Show']); }
    if (signedIn) return;
    const t = await this.strings.stringsByIndex(GAMER_CARD_STRINGS.pack, GAMER_CARD_STRINGS.table, this.locale);
    const signin = t[GAMER_CARD_STRINGS.signIn];
    const none = t[GAMER_CARD_STRINGS.noProfiles];
    const some = t[GAMER_CARD_STRINGS.someProfiles];
    if (signin === undefined || none === undefined || some === undefined) {
      this.noteOnce(`${GAMER_CARD_STRINGS.table}: the signed-out gamer-card captions are missing`);
      return;
    }
    setOwnerSlot(sceneNode, 5, signin);
    setOwnerSlot(sceneNode, 6, this.state.profiles > 0 ? some.replace('%d', String(this.state.profiles)) : none);
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
    // `?page=` is the same push the A button takes, minus the transition and
    // the cue: it is an ARRIVAL, and arriving is not motion (the Blades rule).
    await this.pushPage(sceneId, { silent: true });
  }

  /**
   * Push an 880x480 legacy page onto the stack.
   *
   * The curve pair is chosen by whether a page is already on screen
   * (navigation.ts): the plain `LegacyFrom`/`LegacyTo` when the strip's fold
   * covers the swap, the longer `…Ex` pair when a legacy page replaces another
   * and nothing covers it [INFER, SPEC §2.4]. The code on the console writes
   * the chosen name into the scene's own `TransTo`/`TransFrom`, so that is what
   * this does too - the property is written and then the ordinary Trans
   * machinery plays it.
   */
  private async pushPage(sceneId: string, opts: { silent?: boolean } = {}): Promise<LegacyPage | null> {
    const anchor = this.layer('AnchorLayer') ?? this.rootScene();
    const loaded = await this.load(sceneId);
    if (!loaded) { this.errors.push(`${sceneId}: not in the manifest`); return null; }
    const size = this.sizeOfScene(loaded.root);
    const under = this.pages[this.pages.length - 1] ?? null;
    const curves = curvesFor(under !== null);

    // Leaving the home page folds the strip away [SPEC §2.3]. Only the FIRST
    // page does it; a page over a page has no strip left to fold.
    if (!under && !opts.silent) this.startFold(false);
    else if (!under) { this.foldCascade.reset(this.panels.length, true); this.place(); }

    const wrapper = document.createElement('div');
    wrapper.className = 'nxe-legacy';
    // AnchorLayer is at (96,54); the page is placed in SCREEN units, so undo it.
    // Not rounded: the placement is measured to a tenth of a pixel and rounding
    // it away was worth 0.5 px of the offset Judge F measured.
    const left = (LEGACY_CENTRE_X - size.w / 2) - 96;
    const top = LEGACY_TOP - 54;
    wrapper.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${size.w}px;height:${size.h}px`;
    anchor.el.appendChild(wrapper);

    const node = this.renderInto(anchor, loaded, wrapper);
    if (!node) { wrapper.remove(); return null; }
    this.legacyRoot = node;

    const parked: string[] = [];
    walk(loaded.root, (o) => {
      const r = authoredRect(PropBag.of(o, NO_OVERRIDES));
      const id = idOf(o);
      if (!id) return;
      if (r.y < -size.h || r.y > size.h) parked.push(`${id} @ y=${r.y}`);
    });

    bindTimelines(this.nodes, this.engine);
    const filled = await this.fillLegacyPage(sceneId, node);
    const report: LegacyReport = {
      scene: sceneId,
      size: { w: size.w, h: size.h },
      centreX: LEGACY_CENTRE_X,
      left: left + 96,
      top: top + 54,
      parked,
      rows: filled.rows,
      focusId: filled.focusId,
      filledFrom: filled.filledFrom,
    };
    const page: LegacyPage = {
      scene: sceneId, loaded, node, wrapper, curves, report,
      list: filled.list, navIds: filled.navIds, navFocus: filled.navFocus,
    };
    this.pages.push(page);
    this.legacy = report;

    if (!opts.silent) {
      // The scene's own Trans* properties are what the console writes, so write
      // them and let the ordinary machinery read them back.
      node.overrides.set('TransTo', curves.to);
      node.overrides.set('TransBackFrom', curves.backFrom);
      if (under) {
        under.node.overrides.set('TransFrom', curves.from);
        playTransition(this.engine, this.ctx.visuals, curves.from, under.node, 'out');
      }
      playTransition(this.engine, this.ctx.visuals, curves.to, node, 'in');
      this.cue('TransitionInto');
    }
    this.refreshLegend();
    refreshVisibility(this.host, this.ctx.report);
    return page;
  }

  /** B: pop the top page, and tear it down after its own back-out curve ends. */
  private async popPage(): Promise<void> {
    const page = this.pages.pop();
    if (!page) return;
    this.legacyRoot = this.pages[this.pages.length - 1]?.node ?? null;
    this.legacy = this.pages[this.pages.length - 1]?.report ?? null;
    const under = this.pages[this.pages.length - 1] ?? null;

    page.node.overrides.set('TransBackFrom', page.curves.backFrom);
    const out = playTransition(this.engine, this.ctx.visuals, page.curves.backFrom, page.node, 'out');
    if (under) {
      under.node.overrides.set('TransBackTo', page.curves.backTo);
      playTransition(this.engine, this.ctx.visuals, page.curves.backTo, under.node, 'in');
    }
    this.cue('TransitionFrom');

    // The console tears the popped scene down AFTER its curve, counted in 60 Hz
    // engine steps and never in wall clock, so ?frame= and stepFrames() agree
    // with the browser (the same rule BladeShell.back uses).
    const destroy = (): void => {
      for (const id of this.nodes.removeSubtree(page.node)) this.engine.remove(id);
      page.wrapper.remove();
      if (!this.pages.length) this.startUnfold();
      this.refreshLegend();
      refreshVisibility(this.host, this.ctx.report);
    };
    if (out) this.engine.whenFinished(out.id, destroy);
    else destroy();
  }

  /** Up/Down inside a hosted page: the list's rows, or the nav-button chain. */
  private movePageFocus(dir: -1 | 1): boolean {
    const page = this.pages[this.pages.length - 1];
    if (!page) return false;
    if (page.list) {
      const moved = page.list.move(dir);
      if (moved === null) return false;
      page.report.focusId = moved;
      return true;
    }
    const next = page.navFocus + dir;
    if (next < 0 || next >= page.navIds.length) return false;
    page.navFocus = next;
    const id = page.navIds[next]!;
    this.engine.setState(id, 'Focus');
    page.report.focusId = id;
    return true;
  }

  /** A inside a hosted page: the row's code-table destination, or the focused
   *  nav button's own `PressPath`. */
  private async pressPage(): Promise<boolean> {
    const page = this.pages[this.pages.length - 1];
    if (!page) return false;
    const spec = LEGACY_CODE_TABLES[page.scene];
    let target: string | null = null;
    if (page.list && spec) {
      target = spec.rows[page.list.focusIndex]?.scene ?? null;
      if (target) target = `${spec.pack}/${target}`;
    } else if (page.navIds.length) {
      const id = page.navIds[page.navFocus]!;
      let obj: XuObject | null = null;
      walk(page.loaded.root, (o) => { if (!obj && idOf(o) === id) obj = o; });
      const raw = obj ? propByName(obj, 'PressPath')?.value : undefined;
      if (typeof raw === 'string' && raw) target = resolveScenePath(this.assets, raw);
      if (!target) this.noteUnbound(`${page.scene}: ${id} takes a code path, not a PressPath`);
    }
    if (!target) return false;
    await this.pushPage(target);
    return true;
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
  private async fillLegacyPage(sceneId: string, node: NodeRecord): Promise<{
    rows: string[]; focusId: string | null; filledFrom: string | null;
    list: ListView | null; navIds: string[]; navFocus: number;
  }> {
    const spec = LEGACY_CODE_TABLES[sceneId];
    if (spec) {
      const table = await this.strings.stringsByIndex(spec.pack, spec.table, this.locale);
      const rows: string[] = [];
      for (const r of spec.rows) {
        const v = table[r.label];
        if (v === undefined) this.errors.push(`${spec.table}[${r.label}] (row label) is missing`);
        rows.push(v ?? '');
      }
      let list: XuObject | null = null;
      walk(node.obj, (o) => { if (!list && (o.className === 'XuiList' || o.className === 'XuiCommonList')) list = o; });
      if (!list) { this.errors.push(`${sceneId}: no list to fill`); return { rows, focusId: null, filledFrom: spec.va, list: null, navIds: [], navFocus: 0 }; }
      const listNode = this.nodes.all.find((n) => n.obj === list);
      if (!listNode) return { rows, focusId: null, filledFrom: spec.va, list: null, navIds: [], navFocus: 0 };
      const view = new ListView(list, listNode, { ...this.ctx, pack: sceneId.split('/')[0]! }, this.nodes, this.engine, xuiRegistry());
      view.setItems(rows.map((text) => ({ text })));
      // A page ARRIVES with focus already somewhere, which is the silent case:
      // XuiButton carries btn_Focus.xma on Focus and an EMPTY File on InitFocus.
      const focusId = view.focus(0, 'InitFocus');
      return { rows, focusId, filledFrom: spec.va, list: view, navIds: [], navFocus: 0 };
    }

    // No code table: the page's rows are hand-placed XuiNavButtons authored in
    // the scene, each with its own PressPath and NavUp/NavDown chain - the
    // Blades shape, unchanged in 9199 [SPEC §4]. `consoles/SystemScene.xur` is
    // the one this milestone reaches, and the footage shows SEVEN rows, with
    // navIPTVSettings hidden on a console with no IPTV provider [FRAME Kpa
    // f0391] - the same rule dashboards/blades/nav.ts already applies, and the
    // same reason its Text is nothing but the `<servicename>` token.
    const navIds: string[] = [];
    const rows: string[] = [];
    walk(node.obj, (o) => {
      const id = idOf(o);
      if (!id || !id.startsWith('nav') || o.className !== 'XuiNavButton') return;
      const text = String(propByName(o, 'Text')?.value ?? '');
      if (!this.state.iptv && id === IPTV_ROW) return;
      navIds.push(id);
      rows.push(text);
    });
    // Document order is not screen order here - the scene lists navLiveVision,
    // navIPTVSettings and navNetwork last - so sort by authored y.
    const yOf = (id: string): number => {
      let y = 0;
      walk(node.obj, (o) => { if (idOf(o) === id) y = authoredRect(PropBag.of(o, NO_OVERRIDES)).y; });
      return y;
    };
    const order = navIds.map((id, i) => ({ id, text: rows[i]!, y: yOf(id) })).sort((a, b) => a.y - b.y);
    const focusId = order[0]?.id ?? null;
    if (focusId) this.engine.setState(focusId, 'InitFocus');
    return {
      rows: order.map((o) => o.text), focusId, filledFrom: null,
      list: null, navIds: order.map((o) => o.id), navFocus: 0,
    };
  }

  /** The front slot's rendered scene, which is what the legend hoists from on
   *  the home page (its `legend_a` is the parked "Select"). */
  private frontSlotRoot(): NodeRecord | null {
    const rig = this.panels[Math.round(this.panelAxis?.cursor ?? 0)]?.rig;
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

  /** Keep a promise the shell started, so `idle()` can wait for it. Navigation
   *  is fired from a button and awaited by the test harness, never by the pad. */
  private track<T>(p: Promise<T>): Promise<T> {
    this.pending.add(p);
    void p.finally(() => this.pending.delete(p));
    return p;
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
        scene: p.scene, z: Number(p.z.toFixed(2)), mounted: p.rig !== null,
        visible: p.visible, fold: Number((this.foldCascade.progress[p.index] ?? 0).toFixed(4)),
        screen: this.screenOf(p),
      })),
      droppedSlots: this.dropped(cur),
      counter: this.counter,
      conditions: this.conditions,
      projection: this.projection,
      strip: this.strip,
      variablesMissing: this.variables?.missing ?? [],
      legacy: this.legacy,
      pages: this.pages.map((p) => ({
        scene: p.scene, curve: p.curves.to, form: p.curves.form,
        rows: p.report.rows.length, focusId: p.report.focusId,
      })),
      legend: this.legend,
      motion: {
        channel: this.channelAxis.sample(),
        panel: this.panelAxis.sample(),
        fold: { phase: this.foldCascade.phase, progress: this.foldCascade.progress.map((v) => Number(v.toFixed(4))) },
        frames: this.engine.frames,
        stepSeconds: {
          channel: Number(stepDuration(this.strip.channel).toFixed(6)),
          panel: Number(stepDuration(this.strip.panel).toFixed(6)),
        },
      },
      cues: this.cueLog,
      aura: this.aura,
      sceneTransitions: this.variables?.sceneTransitions() ?? [],
      unboundCommands: this.unboundCommands,
      physics: PHYSICS_NOT_IMPLEMENTED,
      unresolvedEpix: this.unresolvedEpix,
      slotArt: this.slotArt,
      errors: this.errors,
    };
  }
}

/** A Moby slot's authored size; every one of the 31 is 420x320 [SCENE]. */
export const SLOT_WIDTH = 420;
export const SLOT_HEIGHT = 320;

/**
 * Where the rig's origin goes relative to the strip anchor.
 *
 * The rig mirrors about rig y = 510 (the `Reflection` element is 512 tall at
 * y = 1022 with Scale.y = -1, so its top edge - the mirror line - is at
 * 1022 - 512), and the hosted scene's foot has to sit on that line. Putting
 * the rig's origin one full surface (512) above the anchor does it, and the
 * surface's own -2 is then exactly why the panel's foot lands at 568 against a
 * FrontPosition of 570: measured 568.0 [FRAME Yrt f0483].
 */
export const SURFACE_FOOT = PANEL_SURFACE_SIZE;

/**
 * Where an 880x480 legacy page lands.
 *
 * What a frame can measure is not the page but the FRAME AROUND it: the page's
 * own `BackgroundPanel` visual ends in a 907x500 nine-grid at (-15,-12), which
 * this runtime draws too, so the outer edge is a landmark both sides have.
 * Measured with one detector on both, on the Console Settings still
 * [FRAME nxe-9199-Kparblu6r14/f0381]:
 *
 *   outer edge    frame     ours (at 640 / 111)   implies page origin
 *   left          192.3     193.5                 638.8 centre
 *   top           109.7     106.5                 114.2
 *   bottom        593.7     589.5                 115.2
 *
 * so the page sits at centre x 638.8 and top 114.7, not the 640 / 111 M4a
 * assumed from "890.7 x 484.0 about centre 638.7" on the Storage Devices still
 * [FRAME Yrt f0437]. **The old numbers were an assumption dressed as a
 * measurement**: 111 came from taking the 4 px of extra height as a symmetric
 * 2 px border, and the border is not symmetric - the nine-grid is authored 12
 * px above the page and 8 px below it.
 */
export const LEGACY_CENTRE_X = 638.8;
export const LEGACY_TOP = 114.7;

/** The channel queue's row pitch, out of `controlp/MobyChannelScene.xur`. */
export const QUEUE_PITCH = 36;

/**
 * What is INFERRED about the motion, named on every load rather than left to be
 * discovered. Everything M4a listed here as "not implemented" is now
 * integrated; what is left is the readings the data does not settle.
 */
export const PHYSICS_NOT_IMPLEMENTED: readonly string[] = [
  'the unit of Input{Acceleration,Deceleration,MaxVelocity} is INFERRED to be index units per second: z units make one step take 25 s and per-frame units 0.9 ms, and the channel axis (50/40) then closes at exactly 0.300 s. Not a recovered fact.',
  'the input model is a servo to an integer target, not free acceleration: read literally, a one-frame tap would move 0.007 of a panel. INFERRED from the console moving exactly one panel on a tap.',
  'the fold GEOMETRY is INFERRED: progress scales a panel toward the front anchor and fades it. The archive gives the fold RATES and the cascade gate, never what a fold looks like.',
  'MobyUnfoldEaseRange is UNSET in the file, so UnfoldMinSpeed (0.1) can never bind; it is applied anyway rather than dropped.',
  "the channel queue slides by the scene's own 36 px pitch while the cursor is between two channels - INFERRED; the file gives the pitch and the nine row names, not the interpolation.",
  'snd_transitioninto / snd_transitionfrom are NOT in the eight-name table at 0x927f7194; firing them with a page push and pop is INFERRED from their names and tagged `inferred` in __dash.nxe.cues.',
  'EcNavTo* -> scene is materialised in code, not in a pointer array: only EcNavToSettings is bound, and that INFERRED from the literal cluster and the footage. Every other command is refused and listed in __dash.nxe.unboundCommands.',
  'the Aura background is a scene used as an ImagePath and there is no offscreen render target, so it is a live DOM subtree; themeripple.uxfx animates nothing because both of its ImagePresenters are theme data this archive does not carry.',
  'avatars, the Rome shells (RomeRootScene / RomeOverlayScene and the 460x495 panels) and everything Xbox LIVE serves are not implemented: PLACEHOLDERS.md.',
];

void setOwnerText;
