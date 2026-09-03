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
//     (variables.ts), and projected by the perspective in projection.ts. A rig
//     is MOUNTED while its slot is inside `MobyVisiblePanelDistance` and
//     unmounted when it leaves, every frame, so the last slot of a long channel
//     gets its rig when the cursor reaches it (M4d; Judge G finding 1).
//  4. `controlpack://LegendScene.xur` hoists the hosted scene's parked
//     `legend_a/b/x/y` captions and its `Label_Head` title (legend.ts).
//  5. `controlp/Variables.xur`'s `SceneTransitions` group is mounted hidden and
//     its `From` / `BackTo` ranges are played when a page comes over the home
//     page and goes again; the strip and the queue read the four variables it
//     animates every frame (transitions.ts).
//
// Motion is a per-frame integrator over the thirty constants (physics.ts),
// stepped on the timeline's own 60 Hz clock; the fold behind a page is the
// executable's own cascade, the change of channel is a measured fade, and
// `__dash.nxe.physics` names every reading the data does not settle.
import { idOf, propByName, type XuObject } from '@xur/index';
import {
  loadScene, renderElement, indexVisuals, VisualScope, Skin,
  bindTimelines, refreshVisibility, updateNode, setOwnerText, setOwnerSlot, walk,
  NO_DELTA, PropBag, NO_OVERRIDES, authoredRect, xuiRegistry, pathOf,
  isNativeLocale, DEFAULT_LOCALE, ListView, FRAMES_PER_SECOND,
  setOwnerImageSlot, note,
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
import {
  LEGEND_SCENE, bindLegend, hoistLegend, relayoutLegend, settleLegend, playLegendRange, pressLegend,
  type LegendReport,
} from './legend';
import { formatCounter, renderHtmlText } from './html';
import { CONSOLE_SETTINGS_CURRENT_9199, LEGACY_CODE_TABLES } from './consoleSettings9199';
import { SLOT_ART, TRAY_CAPTION, TRAY_SCENES } from './slotArt';
import { Axis, ChannelSwap, FoldCascade, passingOpacity, stepDuration, CHANNEL_SWAP } from './physics';
import { mountAura, type AuraReport } from './aura';
import {
  EPIX_COMMANDS, TRANSITION_CUES, curvesFor, resolveScenePath,
  type LegacyCurves, type NavCommand,
} from './navigation';
import {
  SceneTransitions, foldOpacity, hingeTransform, queueRowTheta, yQuaternion, foldHinge,
  type TransitionReport,
} from './transitions';
import { IPTV_ROW } from '@dash/blades/nav';
import { CURRENT_SETTING_ASSOC } from '@dash/blades/consoleSettings';
import { panelEntries, metaRange } from '@dash/blades/panels';
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
/** A Moby slot's SECOND caption line: `mobyslot`'s `XuiTextPresenter2`, a
 *  392x31 presenter at (19,282), PointSize 16, Opacity 0.65, on
 *  DataAssociation 1 [SCENE dashuisk/skin.xur]. The channel XML's
 *  `<description2>` goes there (Media Center: "TV and media from your PC"). */
export const SLOT_LINE2_ASSOCIATION = 1;

export const GAMER_CARD_SCENE = 'slots/GamerCardSlotScene.xur';

/**
 * The signed-out avatar. The FILE is the build's; the three placement numbers
 * are MEASURED off [FRAME Kpa f0048] and are named as such in
 * `__dash.nxe.avatars`. See NxeShell.dressAvatar for the derivation.
 */
export const AVATAR_SILHOUETTE = {
  pack: 'dashcomm',
  file: 'AvatarSilhouette.png',
  /** Loaded by the same code and NOT drawn; recorded, not guessed at. */
  shadow: 'AvatarShadow.png',
  naturalW: 436,
  naturalH: 730,
  /** The ink inside that canvas, so a measurement can be made on the FIGURE
   *  and not on the transparent margin: x 155..285, y 256..600 [FILE]. */
  ink: { x: 155, y: 256, w: 131, h: 345 },
  /** MEASURED [FRAME Kpa f0048]: where the console's camera puts the figure,
   *  in the slot's own 420x320 design space, relative to a `contain` fit of
   *  the authored 776x776 box. The SIZE is not measured - see dressAvatar. */
  cameraOffset: { x: -37.0, y: -193.6 },
} as const;
/** The signed-out gamer card's two captions, out of the build's own table. */
export const GAMER_CARD_STRINGS = {
  pack: 'dashcomm', table: 'dashStrings.xus',
  signIn: 91, noProfiles: 83, someProfiles: 82,
};

/**
 * The channel queue's per-slot appearance, straight out of `dash.xex`.
 *
 * A ten-entry table of three floats built on the stack by the queue's layout
 * routine at `.text` 0x9248b548 - the function whose caller (0x9248ca20) hands
 * it the signed channel-scroll progress. Read off the `stfs` block at
 * 0x9248b624-0x9248b680, each row `(dy, scale, opacity)`:
 *
 * ```
 *   [0] (-140, 0.35, 0.00)      [5] ( -70, 0.55, 0.35)
 *   [1] (-140, 0.35, 0.00)      [6] ( -40, 0.75, 0.50)
 *   [2] (-140, 0.35, 0.00)      [7] (   0, 1.00, 1.00)   <- Current
 *   [3] (-120, 0.40, 0.10)      [8] (  40, 0.75, 0.00)   <- Prev1
 *   [4] ( -95, 0.45, 0.20)      [9] (  40, 0.75, 0.00)
 * ```
 *
 * The routine walks the eight `Queue` elements in the order the binder stored
 * them - `Next6, Next5, Next4, Next3, Next2, Next1, Current, Prev1` at object
 * offsets +8..+36 [CODE 0x9248b8d0-0x9248b980] - and for element *i*:
 *
 *   a = SLOT[i + 1]                      the row's own slot
 *   b = SLOT[i] when the progress is >= 0, SLOT[i + 2] when it is < 0
 *       [CODE 0x9248b6b4-0x9248b6c0: `addi r11, r28, 24` unless `bc lt`]
 *   v = lerp(a, b, |progress|)
 *   Position = (0, Current's authored y + v.dy, 0)   [0x92189cb8 -> 0x921a71d0]
 *   Scale    = (v.scale, v.scale, 1)                 [0x92189da8 -> 0x92197eb8]
 *   Opacity  = v.opacity                             [0x92189e98 -> 0x92194428]
 *
 * THE SIGN. The caller builds the progress at 0x9248c9cc-0x9248ca18: while the
 * channel cursor moves to a HIGHER index the value is `-frac(cursor)` (the
 * `fneg` branch), while it moves lower it is `1 - frac(cursor)`. A higher index
 * is the channel drawn ABOVE (`Next1`), so an Up hands the routine a NEGATIVE
 * progress and every row lerps toward `SLOT[i + 2]`, the row BELOW it: the
 * names scroll DOWN and `Next1` descends into the current slot. M4c had the
 * branch the other way round and scrolled the names up [Judge G finding 2].
 * [FRAME Yrt f07273-07282] agrees: "Game Marketplace" comes down into the
 * bright slot while "My Xbox" drops below it and fades.
 *
 * | slot | scale | cap height at 33 px | measured [FRAME Kpa f0048] |
 * |---|---|---|---|
 * | Current | 1.00 | 33.0 | 33 |
 * | Next1 | 0.75 | 24.8 | 25 |
 * | Next2 | 0.55 | 18.2 | 18 |
 * | Next3 | 0.45 | 14.9 | 15 |
 * | Next4 | 0.40 | 13.2 | 14 |
 */
export interface QueueSlot { dy: number; scale: number; opacity: number }
export const QUEUE_SLOTS: readonly QueueSlot[] = [
  { dy: -140, scale: 0.35, opacity: 0 },
  { dy: -140, scale: 0.35, opacity: 0 },
  { dy: -140, scale: 0.35, opacity: 0 },
  { dy: -120, scale: 0.40, opacity: 0.10 },
  { dy: -95, scale: 0.45, opacity: 0.20 },
  { dy: -70, scale: 0.55, opacity: 0.35 },
  { dy: -40, scale: 0.75, opacity: 0.50 },
  { dy: 0, scale: 1, opacity: 1 },
  { dy: 40, scale: 0.75, opacity: 0 },
  { dy: 40, scale: 0.75, opacity: 0 },
];

/**
 * The order the code's binder stores the eight `Queue` children in, which is
 * also the order the layout routine walks them and the order that indexes
 * `QUEUE_SLOTS` (element *i* rests on `QUEUE_SLOTS[i + 1]`)
 * [CODE 0x9248b8d0..0x9248b980].
 */
export const QUEUE_WALK = ['Next6', 'Next5', 'Next4', 'Next3', 'Next2', 'Next1', 'Current', 'Prev1'] as const;

/**
 * The row an element lerps TOWARDS for a channel progress `frac` (the cursor's
 * displacement from the channel the queue is centred on): the row below it for
 * a move to a higher index (an Up), the row above for a move to a lower one.
 * Pure, so tests/nxe.test.ts can pin the direction [CODE 0x9248c9cc-0x9248ca18,
 * 0x9248b6b4-0x9248b6c0].
 */
export function queueTargetSlot(i: number, frac: number): number {
  return frac > 0 ? i + 2 : i;
}

/**
 * Which channel name each row carries.
 *
 * `Next_n` is the channel n places after the current one in file order and the
 * stack WRAPS past the end of the list [FRAME Kpa f0048: Game Marketplace,
 * Video & Music Marketplace, Friends, Inside Xbox, Events above "My Xbox", the
 * LAST channel in emb_homepage.xml] - but only as far as there are OTHER
 * channels: with N channels at most N - 1 rows above the current one are
 * filled, so a two-channel console shows one name above the current and
 * nothing else [FRAME Yv5 f0042: "Witamy" alone above "Moja konsola Xbox"].
 * `Prev1` carries the channel before the current one (the name the code lays
 * out at opacity 0 below the current row and scrolls up on a Down), and on a
 * one-channel console every other row is empty. The wrap itself - the cursor
 * going past the last channel to the first - is INFERRED from the rows: nothing
 * in the archive says whether an Up on the last channel is refused, and the
 * rows are laid out as if it is not.
 */
export function queueRowChannel(row: string, current: number, n: number): number | null {
  if (n <= 0) return null;
  if (row === 'Current') return current;
  if (row === 'Prev1') return n >= 2 ? (current - 1 + n) % n : null;
  const up = Number(row.slice(4));
  if (up > n - 1) return null;
  return (current + up) % n;
}

/** `%EvResStr(IDS_SELECTSLOT)%` - the A caption on the home page. Both "Select"
 *  strings in homepage/strings.xus ([18] and [22]) are the same word, so which
 *  index the code reads cannot change what is drawn. */
export const SELECT_SLOT_INDEX = 18;

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
   *  (1 = the current channel, 0 = not drawn). `theta` is the row's fold angle. */
  queue: { row: string; text: string; dim: number; scale: number; y: number; theta: number }[];
  /** The current channel's slots, in order, with the scene each mounted.
   *  `z` is the LIVE depth: it moves with the panel cursor every frame. */
  panels: { name: string; epixid: string; path: string; scene: string | null; z: number; mounted: boolean; visible: boolean; fold: number; opacity: number; theta: number; screen: { x: number; y: number; s: number } }[];
  /** Slots dropped by a condition, with the predicate that dropped them. */
  droppedSlots: { name: string; condition: string }[];
  /** The "N of M" counter, as drawn, and the opacity it is drawn at. */
  counter: string;
  counterOpacity: number;
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
    channel: { cursor: number; velocity: number; target: number; moving: boolean; elapsedSeconds: number; lastMoveSeconds: number };
    panel: { cursor: number; velocity: number; target: number; moving: boolean; elapsedSeconds: number; lastMoveSeconds: number };
    fold: { phase: string; progress: number[]; q: number[] };
    /** The measured channel-change fade. */
    swap: { phase: string; out: number; in: number[] };
    /** Frames stepped since the shell attached, so a duration in the report is
     *  countable against the engine's own clock and never a wall clock. */
    frames: number;
    /** The closed-form duration of one step on each axis, in seconds and in
     *  60 Hz frames. dashboards/nxe/physics.ts derives it. */
    stepSeconds: { channel: number; panel: number };
  };
  /** The Variables.xur transition group: which range is playing and the four values. */
  transitions: TransitionReport | null;
  /** Every cue fired, with the 60 Hz tick it fired on. */
  cues: { name: string; file: string; tick: number; evidence: 'table' | 'timeline'; played: boolean }[];
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
  /** Every XuiAvatar the shell reached, and what stands in for it. */
  avatars: { scene: string; element: string; drawn: string; box: { x: number; y: number; w: number; h: number }; shadow: string }[];
  /** What each slot was dressed with, and why (dashboards/nxe/slotArt.ts). */
  slotArt: { scene: string; image: string; icon: string | null; caption: string; line2: string; inferred: string }[];
  /** Rig mounts and unmounts by distance, counted since the shell attached. */
  rigs: { mounted: number; mounts: number; unmounts: number };
  /** Hardware state the metapane shows and this build cannot query. */
  hardwareState: string[];
  errors: string[];
}

export interface LegacyReport {
  scene: string;
  /** `legacy` = an 880x480 Blades-era DashScene in a LegacyControl frame;
   *  `rome` = a 460x495 NXE-native Rome panel on the Rome strip. */
  kind: 'legacy' | 'rome';
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
  /** The metapane: the description drawn on DataAssociation 0, the row it
   *  belongs to, and the "Current Setting" value on association 4. */
  meta: { text: string; index: number; current: string; scope: string | null } | null;
  /** Controls the page authors that console state hides (`navIPTVSettings`). */
  hidden: string[];
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
  opacity: number;
  theta: number;
  rig: NodeRecord | null;
  wrapper: HTMLElement;
  /** Why no rig can be mounted, when a scene is missing. */
  unresolved: string | null;
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
  meta: NodeRecord | null;
  metaIndex: number;
  descriptions: string[];
}

/** A cue the glue fired, with the engine tick it fired on. */
export interface NxeCue {
  name: string;
  file: string;
  tick: number;
  evidence: 'table' | 'timeline';
  played: boolean;
}

/** The sink a fired cue goes to. `AudioBank` is one; the smoke suites read the
 *  log either way, so a muted page still records every cue and its tick. */
export interface CueSink {
  play(cue: string, scope?: string | null, tick?: number): { played: boolean };
}

/**
 * The frame of the `SceneTransitions` timeline at which the page comes in on
 * A: `From` runs 76..150 and `TransitionScene` - the strip layer's opacity -
 * holds 1 to frame 120 and drops to 0 by 130 [SCENE]. The page's own `LegacyTo`
 * (a five-frame hold, then 0 -> 1 over fifteen) is started when the strip
 * begins to go, which on the footage is where the page begins to show
 * [FRAME Kpa f05595-05605: the front slot is gone at f05595, the page is up at
 * f05605]. The reading that the page starts on THIS frame is an inference;
 * the frame is the file's.
 */
export const PAGE_PUSH_FRAME = 120;
/** `BackTo`'s `TransitionPanel` ramp (1 -> 0 over frames 180..200 with an
 *  ease) ends here; the panels behind the front slot begin to emerge once the
 *  front is back [FRAME Yrt f07188-07208]. The point is an inference. */
export const UNFOLD_BEHIND_FRAME = 200;
/** `BackTo`'s `TransitionSubElements` returns 0 -> 1 over 205..225; the
 *  legend is shown with it. */
export const LEGEND_SHOW_FRAME = 205;

export class NxeShell {
  private variables!: Variables;
  private strip!: StripConstants;
  private channels: { channel: Channel; passed: boolean; name: string }[] = [];
  /** The channel the QUEUE is centred on. */
  private current = 0;
  /** The channel the STRIP shows; differs from `current` between a channel
   *  change's rebuild and the cursor landing. */
  private stripChannel = 0;
  private panels: MountedPanel[] = [];
  private queue: NxeReport['queue'] = [];
  private counter = '';
  private counterOpacity = 1;
  private conditions: NxeReport['conditions'] = [];
  private readonly unresolvedEpix: string[] = [];
  private readonly errors: string[] = [];
  private legacy: LegacyReport | null = null;
  private legend: LegendReport | null = null;
  private homeStrings: string[] = [];
  private readonly legendPending: NodeRecord[] = [];
  private readonly slotArt: NxeReport['slotArt'] = [];
  private readonly pending = new Set<Promise<unknown>>();
  private readonly cache = new Map<string, LoadedScene>();
  private readonly tables = new Map<string, string[]>();
  private readonly hardwareState: string[] = [];

  /* --------------------------------------------------------------- motion */

  /** The two servoed cursors and the fold cascade (dashboards/nxe/physics.ts). */
  private channelAxis!: Axis;
  private panelAxis!: Axis;
  private foldCascade!: FoldCascade;
  private swap = new ChannelSwap();
  private panelLayer: NodeRecord | null = null;
  private stopStepper: (() => void) | null = null;
  private cueSink: CueSink | null = null;
  private readonly cueLog: NxeCue[] = [];
  private readonly pages: LegacyPage[] = [];
  private legendRoot: NodeRecord | null = null;
  private aura: AuraReport | null = null;
  private transitions: SceneTransitions | null = null;
  private readonly unboundCommands: string[] = [];
  private counterFormat: string | null = null;
  private counterNode: NodeRecord | null = null;
  private queueNode: NodeRecord | null = null;
  private disposed = false;
  private rigMounts = 0;
  private rigUnmounts = 0;
  /** A page waiting for the fold to reach PAGE_PUSH_FRAME. */
  private pendingPage: string | null = null;
  private pendingUnfold = false;
  private pendingLegendShow = false;
  private prevOnCue: TimelineEngine['onCue'] = null;

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
    // The transition group's TransitionSound is a timeline cue: the bank plays
    // it through the engine's onCue; this hook only LOGS it beside the glue's.
    this.prevOnCue = this.engine.onCue;
    const prev = this.prevOnCue;
    this.engine.onCue = (ev) => {
      prev?.(ev);
      if (this.transitions && ev.scopeId === this.transitions.report().scope) {
        const file = ev.file.replace(/\.xma$/i, '');
        const name = file === TRANSITION_CUES.into ? 'TransitionInto' : file === TRANSITION_CUES.from ? 'TransitionFrom' : file;
        this.cueLog.push({ name, file, tick: this.engine.frames, evidence: 'timeline', played: true });
        this.transitions.cues.push(`${name}@${this.engine.frames}`);
      }
    };
  }

  /** Give up the stepper. The DOM and the engine belong to the caller. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stopStepper?.();
    this.stopStepper = null;
    this.cueSink = null;
    this.engine.onCue = this.prevOnCue;
  }

  /* ------------------------------------------------------------ composition */

  private async compose(): Promise<void> {
    // The strip constants first: everything below is placed with them.
    const vars = await this.load(VARIABLES_SCENE);
    if (!vars) { this.errors.push(`${VARIABLES_SCENE}: not loaded`); return; }
    this.variables = new Variables(vars.root);
    this.strip = this.variables.strip('Moby');
    this.romeStrip = this.variables.strip('Rome');
    // Both cursors and the cascade come out of the same thirty constants.
    this.channelAxis = new Axis('channel', this.strip.channel);
    this.panelAxis = new Axis('panel', this.strip.panel);
    this.foldCascade = new FoldCascade({ ...this.strip, visiblePanels: this.strip.visiblePanelDistance / this.strip.defaultSpacing });

    this.homeStrings = await this.table(HOME_STRINGS.pack, HOME_STRINGS.table);
    // Every table a rig needs is fetched ONCE here, so mounting a rig later is
    // synchronous and lands on the frame the cull rule asks for it.
    await this.table(TRAY_CAPTION.pack, TRAY_CAPTION.table);
    await this.table(GAMER_CARD_STRINGS.pack, GAMER_CARD_STRINGS.table);

    // The background is `dashmain/DashBkgnd.xur` and it goes in first, behind
    // everything the shell composes on top of it (dashboards/nxe/aura.ts).
    this.aura = await mountAura({
      assets: this.assets, skin: this.skin, ctx: this.ctx, nodes: this.nodes,
      strings: this.strings, locale: this.locale, host: this.rootScene(),
      configuredBy: this.home.root,
    });
    for (const e of this.aura.errors) this.errors.push(`aura: ${e}`);

    await this.readChannels();
    this.stripChannel = this.current;
    this.counterChannel = this.current;
    // The channel cursor starts ON the arriving channel, not at zero: `current`
    // is an index into the passing list and the axis measures in the same
    // units, so leaving it at 0 slides the whole queue by `current` row
    // pitches. (It did: the stack came up 216 px high on an 8-channel home.)
    this.channelAxis.set(this.current);
    this.channelAxis.setBounds(0, Math.max(0, this.channels.filter((c) => c.passed).length - 1));

    // Every scene a rig can ever need on any passing channel, so a rebuild on
    // a channel change and a mount at the cull edge are both synchronous and
    // frame-exact - the console's scenes were resident too.
    await this.preloadSlots();

    // The fold choreography: controlp/Variables.xur's SceneTransitions group,
    // mounted hidden so its four ranges can be played by name.
    this.transitions = await SceneTransitions.mount({
      assets: this.assets, skin: this.skin, ctx: this.ctx, nodes: this.nodes,
      engine: this.engine, host: this.rootScene(),
    });
    for (const e of this.transitions.errors) this.errors.push(`transitions: ${e}`);

    // The queue and the strip are built on BOTH routes: a page route is the
    // home page with a page pushed silently over it, so `?page=` and A agree
    // on what is underneath (Judge G finding 3).
    await this.mountChannelScene();
    await this.mountStrip();

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

    if (this.state.page) await this.mountLegacyPage(this.state.page);
  }

  /** Fetch and cache every slot scene of every passing channel, plus the rig. */
  private async preloadSlots(): Promise<void> {
    const ids = new Set<string>([PANEL_SCENE]);
    for (const c of this.channels) {
      if (!c.passed) continue;
      for (const s of this.slotsOf(c.channel)) {
        const path = c.channel.epix.get(s.epixid) ?? '';
        const scene = EPIX_SCENES[path]?.scene;
        if (scene && this.assets.entry(scene.split('/')[0]!, scene.split('/').slice(1).join('/'))) ids.add(scene);
      }
    }
    await Promise.all([...ids].map((id) => this.load(id)));
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
    // The home scene is a XuiPerspectiveScene, so a row rotated about Y by the
    // fold is foreshortened by the same projection the strip wears.
    const queue = this.findIn(node, 'Queue');
    if (queue) queue.el.style.cssText += ';' + perspectiveCss(this.projection);

    // The "N of M" counter. Its format string is dashStrings.xus[27] and the
    // element that draws it is called `Description` in BOTH the Moby channel
    // scene and controlp/RomeOverlayScene.xur [CODE 0x9248b9a4 / 0x92490f2c].
    const table = await this.table(COUNTER_STRINGS.pack, COUNTER_STRINGS.table);
    const fmt = table[COUNTER_STRINGS.index];
    if (fmt === undefined) this.errors.push(`${COUNTER_STRINGS.table}[${COUNTER_STRINGS.index}] is missing`);
    this.counterFormat = fmt ?? null;
    this.counterNode = this.findIn(node, 'Description');
    this.refreshQueue();
  }

  /**
   * Rewrite the eight queue rows and the counter for the current cursors.
   *
   * The queue is a NAME LIST, not a scroller: the code writes a channel name
   * into each of the eight `Queue\*` children by child path [SPEC §1.3], so a
   * channel change rewrites eight strings rather than moving anything. What
   * DOES move is each row's own `Position`, `Scale` and `Opacity`, which the
   * executable lerps between two rows of `QUEUE_SLOTS` by the signed channel
   * progress - so the whole ramp, the size one included, is the file's and not
   * a fit. See QUEUE_SLOTS for the table and the addresses it was read at.
   *
   * On top of the layout the fold routine runs (transitions.ts): each row is
   * rotated about the hinge by its own angle for `TransitionChannel` and faded
   * with it, and the markers and the counter fade by 1 - |p| - which is why
   * the counter stays put through a channel change and goes with the queue
   * when a page comes over the strip [CODE 0x9248b7a8-0x9248b8bc].
   */
  private refreshQueue(): void {
    const node = this.queueNode;
    const passing = this.channels.filter((c) => c.passed);
    const n = passing.length;
    // The signed channel progress the console's layout routine is handed:
    // 0 at rest, and the cursor's displacement from the channel the queue is
    // centred on while it moves. The routine's own sign is applied by
    // queueTargetSlot: a move to a HIGHER index (an Up) scrolls the names DOWN.
    const frac = Math.max(-1, Math.min(1, this.channelAxis.cursor - this.current));
    const t = Math.abs(frac);
    const p = this.transitions?.value('TransitionChannel') ?? 0;
    // Queue\Current's own authored y, read once from the scene exactly as the
    // console reads it at bind time [CODE 0x9248b988].
    if (node && this.queueBaseY === null) {
      const cur = this.findIn(node, 'Current');
      const pos = cur ? propByName(cur.obj, 'Position')?.value : null;
      this.queueBaseY = pos && typeof pos === 'object' && 'y' in pos ? Number((pos as { y: number }).y) : null;
      if (this.queueBaseY === null) this.noteOnce(`${CHANNEL_SCENE}: Queue\\Current has no Position`);
    }
    const baseY = this.queueBaseY ?? 0;
    this.queue = [];
    for (let i = 0; i < QUEUE_WALK.length; i++) {
      const row = QUEUE_WALK[i]!;
      const ch = queueRowChannel(row, this.current, n);
      const text = ch === null ? '' : passing[ch]?.name ?? '';
      const a = QUEUE_SLOTS[i + 1]!;
      const b = QUEUE_SLOTS[queueTargetSlot(i, frac)]!;
      const dy = a.dy + (b.dy - a.dy) * t;
      const scale = a.scale + (b.scale - a.scale) * t;
      const theta = queueRowTheta(p, i);
      const opacity = (a.opacity + (b.opacity - a.opacity) * t) * foldOpacity(theta);
      this.queue.push({ row, text, dim: Number(opacity.toFixed(4)), scale: Number(scale.toFixed(4)), y: Number((baseY + dy).toFixed(2)), theta: Number(theta.toFixed(4)) });
      if (!node) continue;
      const target = this.findIn(node, row);
      if (!target) { this.noteOnce(`${CHANNEL_SCENE}: no Queue\\${row}`); continue; }
      target.overrides.set('Text', text);
      target.overrides.set('Opacity', opacity);
      target.overrides.set('Position', { x: 0, y: baseY + dy, z: 0 });
      target.overrides.set('Scale', { x: scale, y: scale, z: 1 });
      // The fold's rotation about the hinge: the renderer turns Rotation into a
      // rotate3d about Pivot, and the hinge IS the pivot [CODE 0x9248852c].
      if (theta !== 0) {
        target.overrides.set('Rotation', yQuaternion(theta));
        target.overrides.set('Pivot', foldHinge(theta));
      } else {
        target.overrides.delete('Rotation');
        target.overrides.delete('Pivot');
      }
      updateNode(target, ['Text', 'Opacity', 'Position', 'Scale', 'Rotation', 'Pivot']);
    }
    const foldDim = 1 - Math.min(1, Math.abs(p));
    if (node) {
      const marker = this.findIn(node, 'Marker1');
      if (marker) { marker.overrides.set('Opacity', foldDim); updateNode(marker, ['Opacity']); }
      const queue = this.findIn(node, 'Queue');
      if (queue) queue.el.style.removeProperty('translate');
    }

    // The counter counts the STRIP: it changes when the new strip appears, not
    // while the old one fades [FRAME Kpa f00736-00742: "1 of 8" until the new
    // front panel is up].
    const shownChannel = passing[this.counterChannel]?.channel;
    const total = this.slotsOf(shownChannel).length;
    const shown = total ? Math.min(total, Math.max(1, Math.round(this.panelAxis.cursor) + 1)) : 0;
    if (this.counterFormat === null) return;
    const html = formatCounter(this.counterFormat, shown, total);
    const text = html.replace(/<[^>]*>/g, '').trim();
    this.counterOpacity = Number(foldDim.toFixed(4));
    if (!this.counterNode) { this.counter = text; return; }
    if (text !== this.counter) {
      this.counter = text;
      const r = renderHtmlText(html);
      for (const t2 of r.unknownTags) this.noteOnce(`XuiHtmlElement: unimplemented tag <${t2}>`);
      this.counterNode.el.replaceChildren(r.el);
    }
    this.counterNode.overrides.set('Opacity', foldDim);
    updateNode(this.counterNode, ['Opacity']);
  }

  private queueBaseY: number | null = null;

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
   * The panel strip. Slot k sits at depth `k * spacing` on the line from
   * FrontPosition to BackPosition and the whole layer wears the perspective.
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
    this.buildStrip();
  }

  /** The spacing this channel uses: `<spacing>` overrides the default [SCENE]. */
  private get spacing(): number {
    const entry = this.channels.filter((c) => c.passed)[this.stripChannel];
    return entry?.channel.spacing ?? this.strip.defaultSpacing;
  }

  /**
   * Build every panel of the strip's channel: a wrapper each, and a rig for
   * every slot the cull rule reaches on THIS frame. Synchronous, because every
   * scene it needs was preloaded, so a rebuild lands on the tick the channel
   * swap asks for it.
   */
  private buildStrip(): void {
    const layer = this.panelLayer;
    if (!layer) return;
    for (const p of this.panels) { this.unmountRig(p); p.wrapper.remove(); }
    this.panels = [];
    const entry = this.channels.filter((c) => c.passed)[this.stripChannel];
    if (!entry) return;
    const slots = this.slotsOf(entry.channel);
    this.panelAxis.set(0);
    this.panelAxis.setBounds(0, Math.max(0, slots.length - 1));
    this.foldCascade.reset(slots.length, false, 0);

    for (const [k, slot] of slots.entries()) {
      const path = entry.channel.epix.get(slot.epixid) ?? '';
      const bound = EPIX_SCENES[path];
      const scene = bound?.scene ?? null;
      const wrapper = this.newPanelWrapper(layer);
      const mounted: MountedPanel = { slot, path, scene, index: k, z: k * this.spacing, visible: false, opacity: 1, theta: 0, rig: null, wrapper, unresolved: null };
      if (!scene) mounted.unresolved = `${slot.epixid} -> ${path || '(no epix object)'}: no binding`;
      else if (!this.assets.entry(scene.split('/')[0]!, scene.split('/').slice(1).join('/'))) {
        mounted.unresolved = `${path} -> ${scene}: ${bound?.note ?? 'not in the manifest'}`;
      }
      if (mounted.unresolved && !this.unresolvedEpix.includes(mounted.unresolved)) this.unresolvedEpix.push(mounted.unresolved);
      this.panels.push(mounted);
    }
    this.syncRigs();
  }

  /**
   * Mount and unmount rigs by distance, every frame.
   *
   * `MobyVisiblePanelDistance / spacing` = 3225 / 505 = 6.4, so the front slot
   * plus six receding ones carry a rig, which is exactly what the home frame
   * shows [FRAME Yrt f0483] - and because the cursor moves, the reach is
   * measured from the CURSOR on every frame, never from slot 0 at build time.
   * M4a-M4c culled once at build and never remounted, so the eighth slot of
   * My Xbox reached the front as an empty wrapper [Judge G finding 1;
   * FRAME Kpa f05580 shows System Settings in front at "8 of 8"].
   */
  private syncRigs(): void {
    for (const p of this.panels) {
      const want = p.visible && !p.unresolved && p.scene !== null;
      if (want && !p.rig) this.mountRig(p);
      else if (!want && p.rig) this.unmountRig(p);
    }
  }

  private mountRig(p: MountedPanel): void {
    if (!p.scene) return;
    const entry = this.channels.filter((c) => c.passed)[this.stripChannel];
    p.rig = this.buildRig(p.wrapper, p.scene, p.slot, entry?.channel);
    if (p.rig) {
      this.rigMounts++;
      bindTimelines(this.nodes, this.engine);
      // A slot arrives with focus already somewhere (the silent InitFocus, the
      // Blades rule) - and the rig's own Show ranges are parked by the engine.
      refreshVisibility(this.host, this.ctx.report);
    }
  }

  private unmountRig(p: MountedPanel): void {
    if (!p.rig) return;
    for (const id of this.nodes.removeSubtree(p.rig)) this.engine.remove(id);
    p.wrapper.replaceChildren();
    p.rig = null;
    this.rigUnmounts++;
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
   * Put every panel where the cursor, the fold and the transitions say it is.
   * Called once a frame while anything is moving, and once after every rebuild.
   *
   * Slot k sits at depth `(k - cursor) * spacing` while the strip is open; a
   * panel behind the cursor stacks on the one in front of it by its own fold
   * progress (physics.ts, the code's own cascade). The front panel wears the
   * hinge rotation `TransitionPanel x pi/2` and the whole layer wears
   * `TransitionScene` as its opacity (transitions.ts, both from the code).
   * A panel that has passed the cursor fades by `1 + z/spacing` on its way off
   * the left edge [CODE 0x9248d8dc].
   */
  place(): void {
    const spacing = this.spacing;
    const cursor = this.panelAxis.cursor;
    const front = Math.round(cursor);
    const panelV = this.transitions?.value('TransitionPanel') ?? 0;
    const sceneV = this.transitions?.value('TransitionScene') ?? 1;
    for (const p of this.panels) {
      const d = this.foldCascade.depth(p.index, cursor);
      const z = d * spacing;
      p.z = z;
      const behindFront = p.index > front;
      const foldOp = behindFront ? this.foldCascade.opacity(p.index) : 1;
      const theta = p.index === front && cursor === front ? panelV * (Math.PI / 2) : 0;
      p.theta = theta;
      const opacity = foldOp * passingOpacity(z / spacing) * this.swap.opacity(p.index) * foldOpacity(theta);
      p.opacity = Number(opacity.toFixed(4));
      // Culled BEHIND by MobyVisiblePanelDistance, and in FRONT once a panel
      // has passed the cursor by a whole panel (it is faded to 0 by then), and
      // never drawn while its fold or the swap has it at zero.
      const visible = z <= this.strip.visiblePanelDistance && z > -spacing && opacity > 1e-3;
      p.visible = visible;
      p.wrapper.style.display = visible ? '' : 'none';
      if (!visible) continue;
      const pt = pointOnStrip(this.strip.frontPosition, this.strip.backPosition, z);
      let transform = `translate3d(${pt.x}px, ${pt.y - SURFACE_FOOT}px, ${-z}px)`;
      if (theta !== 0) {
        const h = hingeTransform(theta);
        transform += ` ${h.transform}`;
        p.wrapper.style.transformOrigin = h.origin;
      } else if (p.wrapper.style.transformOrigin !== '0px 0px') {
        p.wrapper.style.transformOrigin = '0 0';
      }
      p.wrapper.style.transform = transform;
      p.wrapper.style.opacity = opacity < 1 ? String(opacity) : '';
      p.wrapper.dataset['nxeZ'] = z.toFixed(1);
      p.wrapper.dataset['nxeScale'] = scaleAt(this.projection, z).toFixed(4);
      p.wrapper.dataset['nxeTheta'] = theta.toFixed(4);
      const pr = project(this.projection, { x: pt.x, y: pt.y, z });
      p.wrapper.dataset['nxeScreen'] = `${pr.x.toFixed(1)},${pr.y.toFixed(1)}`;
    }
    if (this.panelLayer) this.panelLayer.el.style.opacity = sceneV < 1 ? String(Math.max(0, sceneV)) : '';
    this.syncRigs();
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
   * Four independent things advance here and nothing else does: the channel
   * cursor, the panel cursor, the fold cascade and the channel swap. The
   * transition ranges advance on the engine's own clock because they ARE
   * timelines; this reads their values back. Each is integrated at the
   * timeline's fixed step, so nothing depends on wall time.
   */
  private stepMotion(dt: number): void {
    const channel = this.channelAxis.step(dt);
    const panel = this.panelAxis.step(dt);
    const fold = this.foldCascade.step(dt);
    const swapWas = this.swap.active;
    const swapPhaseWas = this.swap.phase;
    const swapEvent = this.swap.step();
    // The counter counts the strip on screen: it changes on the tick the new
    // strip begins to show, not while the old one fades [FRAME Kpa
    // f00736-00742: "1 of 8" until the new front panel is up].
    if (swapPhaseWas !== 'in' && this.swap.phase === 'in') this.counterChannel = this.stripChannel;
    const trans = this.transitions?.running ?? false;

    if (swapEvent === 'rebuild') {
      // The old strip has faded: the strip becomes the channel the cursor is
      // heading for, and the new panels wait out the beat before fading in.
      const n = Math.max(1, this.channels.filter((c) => c.passed).length);
      this.stripChannel = ((Math.round(this.channelAxis.target) % n) + n) % n;
      this.buildStrip();
      this.swap.arm(this.panels.length);
      this.refreshLegend();
    }
    if (channel) {
      this.refreshQueue();
    } else if (this.channelWasMoving) {
      // Landed. Normalise the index modulo the channel count (the cursor is
      // allowed to run past either end so a wrap never breaks a move).
      const n = Math.max(1, this.channels.filter((c) => c.passed).length);
      const landed = ((Math.round(this.channelAxis.cursor) % n) + n) % n;
      this.channelAxis.set(landed);
      this.current = landed;
      this.refreshQueue();
    }
    this.channelWasMoving = channel;
    if (panel) {
      this.refreshQueue();
      const landed = Math.round(this.panelAxis.cursor);
      if (this.panelAxis.cursor === landed) this.refreshLegend();
    }
    if (trans || this.transWasRunning) this.refreshQueue();
    if (channel || panel || fold || swapWas || this.swap.active || trans || this.transWasRunning || swapEvent) this.place();
    this.transWasRunning = trans;

    // The fold's own moments, counted on the transition timeline's frame.
    const frame = this.transitions?.frame ?? null;
    if (this.pendingPage && frame !== null && frame >= PAGE_PUSH_FRAME) {
      const scene = this.pendingPage;
      this.pendingPage = null;
      void this.track(this.pushPage(scene));
    }
    if (this.pendingUnfold && frame !== null && frame >= UNFOLD_BEHIND_FRAME) {
      this.pendingUnfold = false;
      this.foldCascade.unfold(Math.round(this.panelAxis.cursor));
      this.cue('SoundPanelUnfold');
    }
    if (this.pendingLegendShow && frame !== null && frame >= LEGEND_SHOW_FRAME) {
      this.pendingLegendShow = false;
      this.refreshLegend();
      playLegendRange(this.engine, this.legendPending, 'Show');
    }
  }
  private channelWasMoving = false;
  private transWasRunning = false;
  /** The channel the counter counts; follows `stripChannel` once the new strip shows. */
  private counterChannel = 0;

  /* --------------------------------------------------------------- the cues */

  /**
   * Play one of the eight cues named in the code's config table at .rdata
   * 0x927f7194.
   *
   * In the file each of the eight is a `XuiSoundXAudio` called `Sound` inside a
   * group named for the table entry (`SoundButtonSelect` ...) in
   * `controlp/Variables.xur`, with a `Sound`..`SoundEnd` range that writes the
   * `.xma` on its first frame [SCENE, M4d] - so the console fires them by
   * playing that range, and the observable (which file, on which tick) is what
   * this plays through the bank directly. The two transition cues are NOT
   * fired here any more: they are keyframes of the `SceneTransitions` group's
   * `TransitionSound` and the engine fires them (transitions.ts).
   */
  private cue(name: keyof typeof SOUND_CUES): void {
    const file = SOUND_CUES[name];
    if (!file) { this.noteOnce(`no cue file for ${name}`); return; }
    const tick = this.engine.frames;
    const ev = this.cueSink?.play(file, `nxe:${name}`, tick) ?? { played: false };
    this.cueLog.push({ name, file, tick, evidence: 'table', played: ev.played });
    if (this.cueLog.length > 200) this.cueLog.shift();
  }

  /* -------------------------------------------------------------- the input */

  /** D-pad left/right: the panel cursor. A refused move is silent, exactly as
   *  a held d-pad at the end of a Blades list is. */
  movePanel(dir: -1 | 1): boolean {
    if (this.pages.length || this.pendingPage || this.transitions?.running) return false;   // the strip is folded away
    // While the old strip fades there is nothing to move; once the new one is
    // fading in it is the strip and moves like any other.
    if (this.swap.phase === 'out' || this.swap.phase === 'hold') return false;
    if (!this.panelAxis.nudge(dir)) return false;
    this.cue(dir > 0 ? 'SoundPanelRight' : 'SoundPanelLeft');
    return true;
  }

  /**
   * D-pad up/down: the channel cursor. Home only [SPEC §2.3].
   *
   * UP is +1, because the row ABOVE the current one is `Next1` and `Next1` is
   * the channel that FOLLOWS it in file order (queueRowChannel). The cursor
   * WRAPS, because the rows do (queueRowChannel's header; INFERRED).
   *
   * A channel change is a MEASURED fade, not the fold: the strip fades out in
   * place on the press, the names scroll for the axis's 0.300 s, and the new
   * strip fades in front to back once the old one is gone (physics.ts,
   * CHANNEL_SWAP). One cue: the channel cue on the press. The footage carries
   * exactly one audible onset per change [AUDIO Yrt 242.500 s, Kpa 24.770 /
   * 25.675 / 26.260 / 26.510 s, each matching snd_channelup/down's spectrum at
   * 0.97] and a second onset 26 dB below it 0.34 s later on Yrt whose spectrum
   * matches snd_panelfold/unfold at 0.99 - a mix level this archive does not
   * carry, so no fold cue is played here and the observation is recorded.
   */
  moveChannel(dir: -1 | 1): boolean {
    if (this.pages.length) return this.movePageFocus(dir === 1 ? -1 : 1);
    if (this.pendingPage || this.transitions?.running) return false;
    const n = this.channels.filter((c) => c.passed).length;
    if (n <= 1) return false;
    this.channelAxis.setBounds(-Infinity, Infinity);
    if (!this.channelAxis.nudge(dir)) return false;
    this.cue(dir > 0 ? 'SoundChannelUp' : 'SoundChannelDown');
    this.swap.start();
    this.place();
    return true;
  }

  /**
   * A. On the home strip this runs the focused slot's `<onclick>`; on a hosted
   * page it presses the focused row.
   *
   * `EpixCmd` looks the `<cmd>` up in the command table (navigation.ts); a
   * command whose destination this archive does not bind is REFUSED and
   * recorded in `__dash.nxe.unboundCommands` rather than pointed somewhere
   * plausible - and a refused press is SILENT, like a refused move. `KeyDown`
   * delivers A to the slot scene, which in this archive has no handler, and
   * is refused the same way. (What the console does on the Welcome slot is
   * Live content and is not in any offline capture.)
   *
   * An accepted press is the sequence the footage shows [FRAME Kpa
   * f05576-05605; AUDIO Kpa 185.870 s]: the select cue and the legend's press
   * flourish at once; the page loaded; then the home scene's `From` range
   * (transitions.ts) - the queue folds and the counter fades, the front slot
   * rotates out about its hinge, the panels behind it fold, the strip layer
   * fades and the page's own `LegacyTo` starts at PAGE_PUSH_FRAME.
   */
  async press(): Promise<boolean> {
    if (this.pages.length) return this.pressPage();
    if (this.pendingPage || this.transitions?.running || this.swap.active) return false;
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
    this.cue('SoundButtonSelect');
    if (this.legendRoot) pressLegend(this.engine, this.legendRoot, 'AButton');
    // The page is fetched BEFORE the fold starts, so the gap between the fold
    // and the page is counted in frames and never in fetch time.
    const loaded = await this.load(cmd.scene);
    if (!loaded) return false;
    this.beginFold(cmd.scene);
    return true;
  }

  /** The home page folds away behind a page: `From`, the cascade, the legend. */
  private beginFold(scene: string): void {
    this.transitions?.play('from');
    this.foldCascade.fold(Math.round(this.panelAxis.cursor));
    this.cue('SoundPanelFold');
    playLegendRange(this.engine, this.legendPending, 'Hide');
    this.pendingPage = scene;
    this.place();
    this.refreshQueue();
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

  /** A PanelScene clone with `scene` mounted into its texture surface. Sync:
   *  every scene and table it needs is in the cache. */
  private buildRig(wrapper: HTMLElement, scene: string, slot?: Slot, channel?: Channel): NodeRecord | null {
    const holder = this.nodes.all[0]!;
    const rigScene = this.cache.get(PANEL_SCENE);
    if (!rigScene) { this.noteOnce(`${PANEL_SCENE}: not preloaded`); return null; }
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

    const hosted = this.cache.get(scene);
    if (!hosted) { this.noteOnce(`${scene}: not preloaded`); return rig; }
    const mounted = this.renderInto(parts.surface, hosted);
    const size = this.sizeOf(hosted.root);
    // Bottom-aligned in the surface (see placePanel). Left-aligned needs no
    // write: the scene's own x is 0.
    if (mounted) {
      mounted.el.style.top = `${PANEL_SURFACE_SIZE - size.h}px`;
      mounted.el.dataset['nxeAlign'] = 'bottom';
    }

    if (mounted && slot) this.dressSlot(mounted, scene, slot, channel);

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
   * and it is device state, exactly as in Blades. A `<description2>` goes to
   * the visual's second presenter on DataAssociation 1 (SLOT_LINE2_ASSOCIATION):
   * Media Center's "TV and media from your PC" [FRAME Kpa f05545].
   */
  private dressSlot(mounted: NodeRecord, scene: string, slot: Slot, channel?: Channel): void {
    const art = SLOT_ART[scene];
    const sceneNode = mounted.children[0] ?? mounted;

    let caption = '';
    const trayIx = TRAY_SCENES[scene];
    if (trayIx !== undefined) {
      const t = this.tables.get(`${TRAY_CAPTION.pack}/${TRAY_CAPTION.table}`) ?? [];
      caption = t[trayIx] ?? '';
      if (!caption) this.noteOnce(`${TRAY_CAPTION.table}[${trayIx}] (tray caption) is missing`);
    } else if (slot.description) {
      const r = resolveResString(slot.description, this.homeStrings);
      caption = r.text ?? '';
    }
    let line2 = '';
    if (slot.description2) {
      const r = resolveResString(slot.description2, this.homeStrings);
      line2 = r.text ?? '';
      if (!line2) this.noteOnce(`${slot.name || slot.epixid}: <description2> ${slot.description2} did not resolve`);
    }

    const pack = scene.split('/')[0]!;
    if (art) {
      const file = this.assets.entry(pack, art.image) ? art.image : '';
      if (!file) this.noteOnce(`${scene}: ${art.image} is not in the ${pack} pack`);
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
      // The big icon is a SECONDARY channel of the same control - imgIcon is a
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
      if (line2) setOwnerSlot(sceneNode, SLOT_LINE2_ASSOCIATION, line2);
      if (!this.slotArt.some((s) => s.scene === scene)) this.slotArt.push({ scene, image: file, icon, caption, line2, inferred: art.inferred });
    } else {
      if (sceneNode.visualOwner) sceneNode.visualOwner.text = caption;
      sceneNode.overrides.set('Text', caption);
      updateNode(sceneNode, ['Text']);
      if (line2) setOwnerSlot(sceneNode, SLOT_LINE2_ASSOCIATION, line2);
      if (!this.slotArt.some((s) => s.scene === scene)) this.slotArt.push({ scene, image: '', icon: null, caption, line2, inferred: 'no art binding recovered for this scene' });
    }
    this.dressGamerCard(mounted, scene);
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
  private dressGamerCard(mounted: NodeRecord, scene: string): void {
    if (scene !== GAMER_CARD_SCENE) return;
    const sceneNode = mounted.children[0] ?? mounted;
    const signedIn = !this.state.liveTierNone && this.state.profiles > 0;
    const user = this.findIn(sceneNode, 'UserGroup');
    const out = this.findIn(sceneNode, 'SignedOutGroup');
    if (user) { user.overrides.set('Show', signedIn); updateNode(user, ['Show']); }
    if (out) { out.overrides.set('Show', !signedIn); updateNode(out, ['Show']); }
    if (signedIn) return;
    const t = this.tables.get(`${GAMER_CARD_STRINGS.pack}/${GAMER_CARD_STRINGS.table}`) ?? [];
    const signin = t[GAMER_CARD_STRINGS.signIn];
    const none = t[GAMER_CARD_STRINGS.noProfiles];
    const some = t[GAMER_CARD_STRINGS.someProfiles];
    if (signin === undefined || none === undefined || some === undefined) {
      this.noteOnce(`${GAMER_CARD_STRINGS.table}: the signed-out gamer-card captions are missing`);
      return;
    }
    setOwnerSlot(sceneNode, 5, signin);
    setOwnerSlot(sceneNode, 6, this.state.profiles > 0 ? some.replace('%d', String(this.state.profiles)) : none);
    this.dressAvatar(sceneNode);
  }

  /**
   * `XuiAvatar` with no profile: the console's own silhouette, which IS in the
   * archive.
   *
   * `dash.xex` loads `AvatarSilhouette.png` (436x730) and `AvatarShadow.png`
   * (128x128) out of `dashcommon.xzp` at start-up, one after the other, and
   * caches them [CODE 0x921421ec / 0x92142230]. Both files are in this dump.
   * And the signed-out home frame shows exactly that: a flat dark figure
   * standing in front of the gamer-card slot, breaking its right edge - which
   * is what the avatar's deliberate `z = -50` is for [FRAME Kpa f0048, "Sign
   * In" over "3 Profiles Found"].
   *
   * What the archive does NOT carry is the avatar viewport's camera: the
   * element is authored 776x776 and the figure on screen is nothing like 776
   * design px tall. The three numbers below are therefore MEASURED off that one
   * frame, the same standing as the projection's f/Cu/Cv, and they are asserted
   * in `tests/smoke/smoke-nxe.mjs` rather than left to drift:
   *
   *   the figure spans screen y 268.0..550.7 and its head x 760..820 on
   *   [FRAME Kpa f0048]; panel 1 is scaled 0.7395 there, so the figure is
   *   382.7 design px tall against the file's 730 - a factor of 0.524 - and its
   *   head centre sits 370.0 design px right of the slot's own left edge.
   *
   * `AvatarShadow.png` is loaded by the same code and is NOT drawn: nothing in
   * the archive says where the console puts it and the frame's floor under the
   * figure carries the panel's reflection, so a shadow cannot be separated from
   * it. It is recorded instead.
   */
  private dressAvatar(sceneNode: NodeRecord): void {
    const node = this.findIn(sceneNode, 'Avatar');
    if (!node) return;
    const res = this.assets.resolveImage(AVATAR_SILHOUETTE.pack, AVATAR_SILHOUETTE.file);
    if (!res.url) { this.noteOnce(`${AVATAR_SILHOUETTE.file} is not in the ${AVATAR_SILHOUETTE.pack} pack`); return; }
    // `contain` in the element's own authored box: the box is square and the
    // file is 436x730, so the height fills and the width follows.
    const box = node.authored;
    const h = box.h;
    const w = (h * AVATAR_SILHOUETTE.naturalW) / AVATAR_SILHOUETTE.naturalH;
    const left = (box.w - w) / 2 + AVATAR_SILHOUETTE.cameraOffset.x;
    const top = AVATAR_SILHOUETTE.cameraOffset.y;
    const img = document.createElement('img');
    img.src = res.url;
    img.draggable = false;
    img.dataset['xuiPlaceholder'] = 'avatar-silhouette';
    img.style.cssText = `position:absolute;left:${left}px;top:${top}px;width:${w}px;height:${h}px;pointer-events:none`;
    node.el.replaceChildren(img);
    if (!this.avatars.length) {
      this.avatars.push({
        scene: GAMER_CARD_SCENE, element: 'Avatar', drawn: AVATAR_SILHOUETTE.file,
        box: { x: Number((left + box.x).toFixed(1)), y: Number((top + box.y).toFixed(1)), w: Number(w.toFixed(1)), h: Number(h.toFixed(1)) },
        shadow: AVATAR_SILHOUETTE.shadow,
      });
    }
    note(this.ctx.report.approximatedClasses, 'XuiAvatar (signed out: dashcomm/AvatarSilhouette.png, camera MEASURED)');
  }

  private readonly avatars: NxeReport['avatars'] = [];

  /* ----------------------------------------------------------- legacy pages */

  private legacyRoot: NodeRecord | null = null;
  private romeStrip: StripConstants | null = null;
  private romeOverlay: NodeRecord | null = null;

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
    // The home page underneath is parked on the END of its `From` range, which
    // is exactly the state A leaves it in: queue folded, counter gone, front
    // slot rotated away, strip layer at 0.
    this.transitions?.settle('from');
    this.foldCascade.reset(this.panels.length, true, Math.round(this.panelAxis.cursor));
    await this.pushPage(sceneId, { silent: true });
    this.place();
    this.refreshQueue();
  }

  /**
   * `controlpack://RomeOverlayScene.xur` into an `OverlayLayer`.
   *
   * A Rome shell puts the strip in a `ColumnLayer` and the overlay in an
   * `OverlayLayer` [CODE 0x92490ea4-0x92490ecc, the two literals at .rdata
   * 0x920b1208 / 0x920b1220]. The overlay scene is ONE `XuiHtmlElement` called
   * `Description` at (96,605) - the same "%d of %d" counter element the Moby
   * channel scene carries, and the code fetches it by the same name from both
   * [CODE 0x9248b9a4 / 0x92490f2c].
   *
   * It is mounted and left EMPTY. A Rome counter counts panels in a Rome
   * CHANNEL, and this route pushes one panel with no channel behind it, so
   * there is no count to write: writing "1 of 1" would be an invention. The
   * element is mounted, marked, and reported.
   */
  private async mountRomeOverlay(): Promise<void> {
    if (this.romeOverlay) return;
    const host = this.rootScene();
    const loaded = await this.load(ROME_OVERLAY_SCENE);
    if (!loaded) { this.noteOnce(`${ROME_OVERLAY_SCENE}: not in the manifest`); return; }
    const wrapper = document.createElement('div');
    wrapper.className = 'nxe-rome-overlay';
    wrapper.dataset['xuiLayer'] = ROME_LAYERS.overlay;
    wrapper.style.cssText = 'position:absolute;left:-96px;top:-54px;width:1280px;height:720px;pointer-events:none';
    host.el.appendChild(wrapper);
    const node = this.renderInto(host, loaded, wrapper);
    if (!node) { wrapper.remove(); return; }
    this.romeOverlay = node;
    const desc = this.findIn(node, 'Description');
    if (desc) desc.el.dataset['xuiPlaceholder'] = 'rome-counter (no Rome channel on this route)';
  }

  /**
   * Push an 880x480 legacy page onto the stack.
   *
   * The curve pair is the PLAIN one over the strip and over a page alike
   * (navigation.ts: MEASURED on the System -> Console Settings swap). The code
   * on the console writes the chosen name into the scene's own
   * `TransTo`/`TransFrom`, so that is what this does too - the property is
   * written and then the ordinary Trans machinery plays it.
   */
  private async pushPage(sceneId: string, opts: { silent?: boolean } = {}): Promise<LegacyPage | null> {
    const anchor = this.layer('AnchorLayer') ?? this.rootScene();
    const loaded = await this.load(sceneId);
    if (!loaded) { this.errors.push(`${sceneId}: not in the manifest`); return null; }
    const size = this.sizeOfScene(loaded.root);
    const under = this.pages[this.pages.length - 1] ?? null;
    const curves = curvesFor(under !== null);

    // 460x495 is the NXE-NATIVE Rome panel and it is not placed like a legacy
    // page. It sits at `RomeFrontPosition` out of `controlp/Variables.xur`
    // (96, 602), which is the panel's own BOTTOM-LEFT anchor exactly as
    // `MobyFrontPosition` is - so its top is 602 - 495 = 107 [SPEC 3, and the
    // frame: the panel reads left 96.0, right 554.7, top 104.7, bottom 598.0
    // on FRAME Yrt f0396]. Nothing here is fitted: both numbers are the file's.
    const rome = size.w === ROME_PANEL.w && size.h === ROME_PANEL.h;
    if (rome) await this.mountRomeOverlay();
    const wrapper = document.createElement('div');
    wrapper.className = rome ? 'nxe-rome' : 'nxe-legacy';
    // AnchorLayer is at (96,54); the page is placed in SCREEN units, so undo it.
    // Not rounded: the placement is measured to a tenth of a pixel and rounding
    // it away was worth 0.5 px of the offset Judge F measured.
    const front = this.romeStrip?.frontPosition ?? { x: 96, y: 602, z: 0 };
    const left = (rome ? front.x : LEGACY_CENTRE_X - size.w / 2) - 96;
    const top = (rome ? front.y - size.h : LEGACY_TOP) - 54;
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
      centreX: rome ? front.x + size.w / 2 : LEGACY_CENTRE_X,
      left: left + 96,
      top: top + 54,
      kind: rome ? 'rome' : 'legacy',
      parked,
      rows: filled.rows,
      focusId: filled.focusId,
      filledFrom: filled.filledFrom,
      meta: null,
      hidden: filled.hidden,
    };
    const page: LegacyPage = {
      scene: sceneId, loaded, node, wrapper, curves, report,
      list: filled.list, navIds: filled.navIds, navFocus: filled.navFocus,
      meta: this.findIn(node, 'metaPanelScene'), metaIndex: -1, descriptions: filled.descriptions,
    };
    this.pages.push(page);
    this.legacy = report;
    this.syncMeta(page);

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
    }
    this.refreshLegend();
    if (!opts.silent && !under) {
      // The page's legend comes up with the page; the home legend's Hide ran at
      // the fold. Its Show range plays now so the captions are on screen with
      // the page [FRAME Kpa f05605].
      playLegendRange(this.engine, this.legendPending, 'Show');
    }
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
    } else {
      // The last page is going: the home scene's `BackTo` range plays now,
      // concurrently with the page's `LegacyBackFrom` (the ordinary XUI pairing
      // of an outgoing and an incoming curve). The strip layer comes back at
      // its frame 24, the front slot rotates in over 29..49, the queue rows
      // unfold 39..69, the legend at 54 - and the panels behind the front slot
      // emerge once it is back (UNFOLD_BEHIND_FRAME) [FRAME Yrt f07172-07227].
      this.transitions?.play('backTo');
      this.pendingUnfold = true;
      this.pendingLegendShow = true;
      playLegendRange(this.engine, this.legendPending, 'Hide');
    }

    // The console tears the popped scene down AFTER its curve, counted in 60 Hz
    // engine steps and never in wall clock, so ?frame= and stepFrames() agree
    // with the browser (the same rule BladeShell.back uses).
    const destroy = (): void => {
      for (const id of this.nodes.removeSubtree(page.node)) this.engine.remove(id);
      page.wrapper.remove();
      if (this.pages.length) this.refreshLegend();
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
      this.syncMeta(page);
      return true;
    }
    const next = page.navFocus + dir;
    if (next < 0 || next >= page.navIds.length) return false;
    page.navFocus = next;
    const id = page.navIds[next]!;
    this.engine.setState(id, 'Focus');
    page.report.focusId = id;
    this.syncMeta(page);
    return true;
  }

  /**
   * The metapane, driven the way `BladeShell.syncMeta` drives it: the focused
   * row's description into the `MetaPanelScene` control's text (DataAssociation
   * 0 in `metaScene_1line`), the "Current Setting" value into association 4,
   * and `metaScene_1line`'s own `NToM` range played for the move
   * [CODE 0x92159140 for the write; Judge G finding 5].
   *
   * Console Settings' descriptions are the code table's second index
   * (`dashCSettingsStrings.xus[325]` "Change your display output settings..."
   * for Display, [327] for Auto-Play [FRAME Kpa f0381]); a nav-button page's are
   * its DashScene `PanelStrings`, index-parallel with `PanelSettings`, which
   * is where System Settings' "Change your Xbox 360 console settings,
   * including display, audio, language, and remote control." comes from
   * [FRAME Kpa f0391].
   */
  private syncMeta(page: LegacyPage): void {
    let index = -1;
    let text = '';
    if (page.list) {
      index = page.list.visibleIndex;
      text = page.descriptions[page.list.focusIndex] ?? '';
    } else if (page.navIds.length) {
      const id = page.navIds[page.navFocus] ?? '';
      const entries = panelEntries(page.loaded.root.children[0] ?? page.loaded.root);
      const entry = entries.find((e) => e.id === id) ?? null;
      index = entry ? entry.index : -1;
      text = entry?.description ?? '';
    }
    const meta = page.meta;
    if (!meta) { page.report.meta = null; return; }
    setOwnerText(meta, text);
    let current = '';
    const spec = LEGACY_CODE_TABLES[page.scene];
    if (spec && page.list) {
      const row = page.list.focusIndex;
      const cur = CONSOLE_SETTINGS_CURRENT_9199.find((c) => c.row === row);
      current = cur?.value ?? '';
      const gap = `${page.scene}: row ${row} "Current Setting" is console state we cannot query`;
      if (!cur && row >= 0 && !this.hardwareState.includes(gap)) this.hardwareState.push(gap);
      if (cur) {
        const read = `${page.scene}: row ${row} "Current Setting" = ${JSON.stringify(cur.value)} read off [FRAME ${cur.frame}]`;
        if (!this.hardwareState.includes(read)) this.hardwareState.push(read);
      }
    }
    setOwnerSlot(meta, CURRENT_SETTING_ASSOC, current);
    const prev = page.metaIndex;
    page.metaIndex = index;
    const scope = this.metaScope(meta);
    page.report.meta = { text, index, current, scope };
    if (!scope) return;
    const r = metaRange(prev, index);
    if (!this.engine.playRange(scope, r.start, r.end)) {
      this.noteOnce(`metapane ${page.scene}: no range ${r.start} on ${scope}`);
    }
  }

  /** The scope of the metapane's VISUAL, the shortest id under the control. */
  private metaScope(meta: NodeRecord): string | null {
    const prefix = pathOf(meta) + '/';
    let best: string | null = null;
    for (const s of this.engine.all()) {
      if (!s.id.startsWith(prefix)) continue;
      if (best === null || s.id.length < best.length) best = s.id;
    }
    return best;
  }

  /** A inside a hosted page: the row's code-table destination, or the focused
   *  nav button's own `PressPath`. Silent when it goes nowhere. */
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
    this.cue('SoundButtonSelect');
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
    list: ListView | null; navIds: string[]; navFocus: number; descriptions: string[]; hidden: string[];
  }> {
    const spec = LEGACY_CODE_TABLES[sceneId];
    const hidden: string[] = [];
    if (spec) {
      const table = await this.table(spec.pack, spec.table);
      const rows: string[] = [];
      const descriptions: string[] = [];
      for (const r of spec.rows) {
        const v = table[r.label];
        if (v === undefined) this.errors.push(`${spec.table}[${r.label}] (row label) is missing`);
        rows.push(v ?? '');
        const d = r.description >= 0 ? table[r.description] : undefined;
        if (r.description >= 0 && d === undefined) this.errors.push(`${spec.table}[${r.description}] (row description) is missing`);
        descriptions.push(d ?? '');
      }
      let list: XuObject | null = null;
      walk(node.obj, (o) => { if (!list && (o.className === 'XuiList' || o.className === 'XuiCommonList')) list = o; });
      if (!list) { this.errors.push(`${sceneId}: no list to fill`); return { rows, focusId: null, filledFrom: spec.va, list: null, navIds: [], navFocus: 0, descriptions, hidden }; }
      const listNode = this.nodes.all.find((n) => n.obj === list);
      if (!listNode) return { rows, focusId: null, filledFrom: spec.va, list: null, navIds: [], navFocus: 0, descriptions, hidden };
      const view = new ListView(list, listNode, { ...this.ctx, pack: sceneId.split('/')[0]! }, this.nodes, this.engine, xuiRegistry());
      view.setItems(rows.map((text) => ({ text })));
      // A page ARRIVES with focus already somewhere, which is the silent case:
      // XuiButton carries btn_Focus.xma on Focus and an EMPTY File on InitFocus.
      const focusId = view.focus(0, 'InitFocus');
      return { rows, focusId, filledFrom: spec.va, list: view, navIds: [], navFocus: 0, descriptions, hidden };
    }

    // No code table: the page's rows are hand-placed XuiNavButtons authored in
    // the scene, each with its own PressPath and NavUp/NavDown chain - the
    // Blades shape, unchanged in 9199 [SPEC §4]. `consoles/SystemScene.xur` is
    // the one this milestone reaches, and the footage shows SEVEN rows, with
    // navIPTVSettings hidden on a console with no IPTV provider [FRAME Kpa
    // f0391] - the same rule dashboards/blades/nav.ts already applies, and the
    // same reason its Text is nothing but the `<servicename>` token. Hidden
    // means HIDDEN: the control's Show is cleared, so the token is never
    // painted [Judge G finding 4].
    const navIds: string[] = [];
    const rows: string[] = [];
    walk(node.obj, (o) => {
      const id = idOf(o);
      if (!id || !id.startsWith('nav') || o.className !== 'XuiNavButton') return;
      const text = String(propByName(o, 'Text')?.value ?? '');
      if (!this.state.iptv && id === IPTV_ROW) {
        const n = this.findIn(node, id);
        if (n) { n.overrides.set('Show', false); updateNode(n, ['Show']); }
        hidden.push(`${id} (Text is the authoring token ${JSON.stringify(text)}; no IPTV provider)`);
        return;
      }
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
      list: null, navIds: order.map((o) => o.id), navFocus: 0, descriptions: [], hidden,
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

  /** A positional string table, fetched once and kept for synchronous reads. */
  private async table(pack: string, file: string): Promise<string[]> {
    const key = `${pack}/${file}`;
    const have = this.tables.get(key);
    if (have) return have;
    const t = await this.strings.stringsByIndex(pack, file, this.locale);
    this.tables.set(key, t);
    return t;
  }

  private async load(sceneId: string): Promise<LoadedScene | null> {
    const have = this.cache.get(sceneId);
    if (have) return have;
    try {
      const scene = await loadScene(this.assets, sceneId);
      if (!isNativeLocale(this.locale)) {
        await this.strings.applyLocale(scene.root, xuiRegistry(), scene.pack, scene.path, this.locale);
      }
      this.cache.set(sceneId, scene);
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
        visible: p.visible, fold: Number((1 - (this.foldCascade.q[p.index] ?? 1)).toFixed(4)),
        opacity: p.opacity, theta: Number(p.theta.toFixed(4)),
        screen: this.screenOf(p),
      })),
      droppedSlots: this.dropped(cur),
      counter: this.counter,
      counterOpacity: this.counterOpacity,
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
        fold: {
          phase: this.foldCascade.phase,
          progress: this.foldCascade.q.map((v) => Number((1 - v).toFixed(4))),
          q: this.foldCascade.q.map((v) => Number(v.toFixed(4))),
        },
        swap: { phase: this.swap.phase, out: Number(this.swap.out.toFixed(4)), in: this.swap.inq.map((v) => Number(v.toFixed(4))) },
        frames: this.engine.frames,
        stepSeconds: {
          channel: Number(stepDuration(this.strip.channel).toFixed(6)),
          panel: Number(stepDuration(this.strip.panel).toFixed(6)),
        },
      },
      transitions: this.transitions?.report() ?? null,
      cues: this.cueLog,
      aura: this.aura,
      sceneTransitions: this.variables?.sceneTransitions() ?? [],
      unboundCommands: this.unboundCommands,
      physics: PHYSICS_NOT_IMPLEMENTED,
      unresolvedEpix: this.unresolvedEpix,
      slotArt: this.slotArt,
      avatars: this.avatars,
      rigs: { mounted: this.panels.filter((p) => p.rig).length, mounts: this.rigMounts, unmounts: this.rigUnmounts },
      hardwareState: this.hardwareState,
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
export const LEGACY_CENTRE_X = 638.8;   // FRAME-SOLVED, not authored: see above.
export const LEGACY_TOP = 114.7;        // FRAME-SOLVED, not authored: see above.

/**
 * The channel queue's AUTHORED row pitch in `controlp/MobyChannelScene.xur`
 * (rows at y 190, 154, 118 ... -62). The console does NOT use it: the layout
 * routine overwrites every row's Position from `QUEUE_SLOTS`, whose gaps are
 * 40 / 30 / 25 / 25 / 20 / 0 / 0 going up the stack. Kept because the number
 * is the file's and the difference between the two is the whole finding.
 */
export const QUEUE_PITCH = 36;

/**
 * The NXE-native page: a 460x495 `RomeRootScene` panel.
 *
 * 40 of the 311 scenes are one [SPEC 3, census]. It is not a `LegacyControl`
 * and is not centred: it sits on the ROME strip, whose front anchor is
 * `RomeFrontPosition` in `controlp/Variables.xur`, and it titles itself
 * (`labTitle` is inside the panel) while its `legend_a`/`legend_b` are parked
 * and hoisted the same way a legacy page's are.
 */
export const ROME_PANEL = { w: 460, h: 495 } as const;
export const ROME_OVERLAY_SCENE = 'controlp/RomeOverlayScene.xur';
/** `.rdata` 0x920b1208 / 0x920b1220, fetched at 0x92490ea4-0x92490ecc [CODE]. */
export const ROME_LAYERS = { column: 'ColumnLayer', overlay: 'OverlayLayer' } as const;

/** The measured channel swap, re-exported so the report and the tests read
 *  one table. */
export { CHANNEL_SWAP };

/**
 * What is INFERRED or MEASURED about the motion, named on every load rather
 * than left to be discovered.
 */
export const PHYSICS_NOT_IMPLEMENTED: readonly string[] = [
  'the unit of Input{Acceleration,Deceleration,MaxVelocity} is INFERRED to be index units per second: z units make one step take 25 s and per-frame units 0.9 ms, and the channel axis (50/40) then closes at exactly 0.300 s. Not a recovered fact.',
  'the input model is a servo to an integer target, not free acceleration: read literally, a one-frame tap would move 0.007 of a panel. INFERRED from the console moving exactly one panel on a tap.',
  'the fold behind a page is the executable\'s own per-panel cascade (dashboards/nxe/physics.ts, .text 0x9248d6dc-0x9248d988): back to front at FoldSpeed x (visible+1)/7 gated on FoldNextRange, front to back at UnfoldSpeed eased to UnfoldMinSpeed gated on UnfoldNextRange, offset q x spacing and opacity min(1, 4q). The front slot itself is TransitionPanel x pi/2 about a hinge 128 units left of it (0x92488480). The channel change is NOT that cascade: it is a fade measured off the frames (CHANNEL_SWAP: out 6 ticks, hold 4, in 12 per panel) because the frames show the strip fading in place with nothing collapsing.',
  'the four SceneTransitions/* variables are ANIMATED by controlp/Variables.xur\'s own To/From/BackTo/BackFrom ranges (75 frames each), not switches; the shell plays From on A and BackTo on B and reads them back. That the home page plays THOSE two of the four is the ordinary XuiScene pairing and is INFERRED; the page comes in at the frame TransitionScene starts to drop (PAGE_PUSH_FRAME) and the panels behind the front slot emerge once TransitionPanel is back to 0 (UNFOLD_BEHIND_FRAME), both inferred points on the file\'s timeline.',
  'MEASURED against the footage and NOT closed: with From started on the press the front slot\'s rotation lands where the footage has it (its ramp opens at frame 29, 14.5 frames at 30 fps; Kpa f05590) but the queue rows and the legend fade 2-4 30 fps frames earlier than the footage\'s f05585; on B the panels behind the front slot emerge about 0.4 s earlier than Yrt f07208. Stated in the runtime README, not tuned.',
  'the eight navigation cues are XuiSoundXAudio elements in controlp/Variables.xur with a Sound..SoundEnd range each; the shell plays the same file on the same tick through the bank. snd_transitioninto/from are keyframes of the SceneTransitions group\'s TransitionSound and fire from the range (tagged timeline in __dash.nxe.cues); a channel change plays only its channel cue - the footage carries one audible onset per change, plus a second 26 dB down matching snd_panelfold/unfold that this archive has no mix level for.',
  'EcNavTo* -> scene is materialised in code, not in a pointer array: only EcNavToSettings is bound, and that INFERRED from the literal cluster and the footage. Every other command is refused and listed in __dash.nxe.unboundCommands; a refused press is silent.',
  'the Aura background is a scene used as an ImagePath and there is no offscreen render target, so it is a live DOM subtree; themeripple.uxfx animates nothing because both of its ImagePresenters are theme data this archive does not carry.',
  "the signed-out avatar's ARTWORK is the build's own dashcomm/AvatarSilhouette.png [CODE 0x921421ec] and its SIZE is the XuiAvatar's authored 776x776 box, but the avatar viewport's CAMERA is not in the archive: the two centring offsets are MEASURED off [FRAME Kpa f0048] and are in __dash.nxe.avatars. AvatarShadow.png is loaded by the same code and is NOT drawn.",
  'a signed-IN XuiAvatar draws nothing: the model, its textures and its animations are xam/Live.',
  'a legacy page over a legacy page takes the plain LegacyFrom + LegacyTo pair, MEASURED at twenty ticks on Kpa f05630-05639; where the console uses the ...Ex pair is not observed.',
  'the queue WRAPS past the end of the channel list (queueRowChannel): the rows are laid out as if an Up on the last channel is not refused, and nothing in the archive says it is. INFERRED from the rows.',
  'ONE Rome panel mounts from RomeFrontPosition and its own size; a Rome CHANNEL (the ColumnLayer strip and the counter that goes with it) needs a Rome channel, and the offline archive has none. A Rome page pops with LegacyBackFrom here; its own BackFrom range (TransitionPanel 0 -> -1, the hinge behind it) is decoded and not wired to a Rome strip.',
  "the Aura floor under the front panel is 70-95 luma dark and it is SolidBack's own authored stops (rgb 90,90,90 -> 60,70,80 -> alpha 0), not a missing layer: the ablation is in the runtime README.",
  'TransitionSubElements (1 -> 0 over From\'s first 19 frames) is read by the strip through 0x9248ad48 and is not bound to anything here: what it dims is not identified.',
  'everything Xbox LIVE serves is absent: PLACEHOLDERS.md.',
];
