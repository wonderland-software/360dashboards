// The home page's fold and unfold: FOUR RANGES IN `controlp/Variables.xur`, and
// the two code routines that turn their values into geometry.
//
// ---------------------------------------------------------------------------
// 1. THE RANGES ARE DATA
//
// The group in `controlp/Variables.xur` that holds `TransitionScene`,
// `TransitionSubElements`, `TransitionChannel` and `TransitionPanel` (the four
// `SceneTransitions/*` names of the code's 43-entry table, .rdata 0x927f7108)
// also carries five timelines and nine named frames [SCENE, M4d]:
//
//   Bind 0 | To 1 .. ToEnd 75 | From 76 .. FromEnd 150 |
//   BackTo 151 .. BackToEnd 225 | BackFrom 226 .. BackFromEnd 300
//
// and inside each 75-frame range the four variables are keyframed (values in
// 60 Hz frames, relative to the range start):
//
//   range    | TransitionScene    | TransitionChannel     | TransitionPanel      | SubElements     | TransitionSound
//   To       | 0 .. 24, 0->1 24-34| -1 .. 29 (ease) -> 0 @59 | -1 .. 49 (ease) -> 0 @69 | 0 .. 54 -> 1 @74 | snd_transitioninto @29
//   From     | 1 .. 44, 1->0 44-54| 0 .. 9 -> 1 @39       | 0 .. 29 -> 1 @49     | 1 -> 0 @19      | snd_transitionfrom @9
//   BackTo   | 0 .. 24, 0->1 24-34| 1 .. 39 (ease) -> 0 @69 | 1 .. 29 (ease) -> 0 @49 | 0 .. 54 -> 1 @74 | snd_transitioninto @39
//   BackFrom | 1 .. 44, 1->0 44-54| 0 .. 24 -> -1 @49     | 0 .. 19 -> -1 @34    | 1 -> 0 @24      | snd_transitionfrom @24
//
// The names are XuiScene's own four Trans* slots (To/From/BackTo/BackFrom), so
// the reading is the ordinary one: the home scene plays `From` when a page is
// pushed over it and `BackTo` when that page pops; a page of its own plays
// `BackFrom` when it pops. `TransitionSound` is a sound element with a `File`
// track, i.e. the two cues the eight-name table does not carry are TIMELINE
// cues here, fired by the range and not by the glue - PLACEHOLDERS' "inferred"
// row for them is closed by this file.
//
// The shell renders the scene into a hidden holder so the timeline engine binds
// the group like any other scope, plays the range by name, and reads the four
// `FloatVariable` values back off the nodes every frame. Nothing is sampled by
// hand: the ease keyframes go through the same interpolator every scene uses.
//
// ---------------------------------------------------------------------------
// 2. WHAT THE VALUES DO, FROM THE CODE
//
// The queue's frame function (0x9248c8a0) lays the rows out from the channel
// progress (NxeShell.QUEUE_SLOTS) and then calls 0x9248b7a8 with
// `TransitionChannel` [CODE 0x9248ca28-0x9248ca40]. That routine, for row i in
// the binder's order Next6 .. Prev1:
//
//   p >= 0:  theta_i = clamp(1.3 pi p - 0.1 pi i, 0, pi/2)
//   p <  0:  theta_i = clamp(1.3 pi (p + 1) - 0.1 pi i, 0, pi/2) - pi/2
//
// (constants 4.084 = 1.3 pi at 0x920b0e3c, 0.31416 = 0.1 pi at 0x920b0e38, pi/2
// at 0x92060044, -pi/2 at 0x920b0e40) and then, after the loop, multiplies the
// two markers' opacity by 1 - |p| and sets `Description`'s to 1 - |p|
// [CODE 0x9248b868-0x9248b8bc]. M4c attributed those two fades to the channel
// progress; they belong to the FOLD, which is why the counter stays "1 of 8"
// through a channel change and goes with the queue on A [Judge G finding 12].
//
// Each row and the front panel then go through 0x92488480(element, theta):
//
//   opacity  = opacity x (1 - min(|theta| x 2/pi, 1))       [0x924884ac-0x924884f8]
//   rotation = quaternion(theta about Y)                     [0x924884fc-0x92488518]
//   position = position + v - R(theta) v                     [0x9248851c-0x924885e4]
//     with v = (-128, 0, 0) for theta >= 0 and (0, 0, 128) for theta < 0
//     [0x9248852c-0x92488558]
//
// i.e. a rotation about a vertical axis 128 units to the LEFT of the element
// for a positive angle, 128 units BEHIND it for a negative one, and a fade that
// reaches zero at a quarter turn. The strip's frame function feeds the front
// panel `TransitionPanel x pi/2` [CODE 0x9248d94c-0x9248d97c] and nothing else
// (every other panel goes through the q cascade, physics.ts). So on A the front
// slot rotates out about a hinge 128 px left of its left edge and fades over
// the twenty-frame ramp - which is what the footage shows [FRAME Kpa
// f05590-05595: the sliver at ~75 degrees sits at design x 32..117, where this
// hinge puts it at 13..122 and a hinge behind the panel would put it at
// 216..283].
//
// What is MEASURED and does not close: the footage's queue and legend fade
// begin about nine 30 fps frames after A and its panel about fourteen [FRAME
// Kpa f05585 -> f05590 after the press at f05576]; with `From` started on the
// press the panel matches (its ramp opens at frame 29 = 14.5 frames) and the
// rows run 2-4 frames early. The offset is reported, not tuned - see the
// runtime README.
import { idOf, propByName, type XuObject } from '@xur/index';
import {
  loadScene, renderElement, indexVisuals, VisualScope, Skin, walk, pathOf,
  NO_DELTA, bindTimelines, updateNode,
  type AssetIndex, type RenderCtx, type NodeIndex, type NodeRecord, type TimelineEngine,
} from '@runtime/index';
import { VARIABLES_SCENE } from './variables';

/** The four ranges, by the named frames in the file [SCENE]. */
export const TRANSITION_RANGES = {
  to: { start: 'To', end: 'ToEnd' },
  from: { start: 'From', end: 'FromEnd' },
  backTo: { start: 'BackTo', end: 'BackToEnd' },
  backFrom: { start: 'BackFrom', end: 'BackFromEnd' },
} as const;
export type TransitionRange = keyof typeof TRANSITION_RANGES;

/** The four animated variables, in the code table's order [.rdata 0x927f7108]. */
export const TRANSITION_VARIABLES = ['TransitionScene', 'TransitionSubElements', 'TransitionChannel', 'TransitionPanel'] as const;
export type TransitionVariable = (typeof TRANSITION_VARIABLES)[number];

/** The constants the queue fold routine reads [CODE 0x9248b7c0-0x9248b810]. */
export const QUEUE_FOLD = { sweep: 1.3 * Math.PI, perRow: 0.1 * Math.PI, quarter: Math.PI / 2 } as const;
/** The hinge distance both branches use [.rdata 0x920b03e0 / 0x920b03e4]. */
export const FOLD_HINGE = 128;

/** Row i's fold angle for progress p [CODE 0x9248b7d8-0x9248b850]. */
export function queueRowTheta(p: number, i: number): number {
  if (p === 0) return 0;
  const base = p < 0 ? p + 1 : p;
  let theta = QUEUE_FOLD.sweep * base - QUEUE_FOLD.perRow * i;
  theta = Math.min(QUEUE_FOLD.quarter, Math.max(0, theta));
  return p < 0 ? theta - QUEUE_FOLD.quarter : theta;
}

/** The fade 0x92488480 applies for an angle: gone at a quarter turn. */
export function foldOpacity(theta: number): number {
  return 1 - Math.min(1, (Math.abs(theta) * 2) / Math.PI);
}

/** The hinge vector for an angle [CODE 0x9248852c-0x92488558]. */
export function foldHinge(theta: number): { x: number; y: number; z: number } {
  return theta >= 0 ? { x: -FOLD_HINGE, y: 0, z: 0 } : { x: 0, y: 0, z: FOLD_HINGE };
}

/** A quaternion for `theta` about Y, as SetRotation is handed [CODE 0x924dc488]. */
export function yQuaternion(theta: number): { x: number; y: number; z: number; w: number } {
  return { x: 0, y: Math.sin(theta / 2), z: 0, w: Math.cos(theta / 2) };
}

/**
 * The CSS for a wrapper the strip places itself: the rig's own translate, then
 * the rotation about the hinge. `position + v - R v` with a rotation about the
 * element's origin is exactly a rotation about the axis through `v`, so the
 * hinge is a transform-origin and needs no arithmetic here.
 */
export function hingeTransform(theta: number): { transform: string; origin: string } {
  const v = foldHinge(theta);
  return {
    transform: `rotateY(${((theta * 180) / Math.PI).toFixed(3)}deg)`,
    origin: `${v.x}px 0px ${v.z}px`,
  };
}

export interface TransitionReport {
  scene: string;
  group: string | null;
  scope: string | null;
  ranges: Record<string, { start: number; end: number } | null>;
  /** The live values, read back off the nodes. */
  values: Record<TransitionVariable, number>;
  playing: string | null;
  frame: number | null;
  cues: string[];
}

/**
 * The transition group of `controlp/Variables.xur`, mounted hidden so the
 * engine can play it.
 */
export class SceneTransitions {
  private nodes = new Map<TransitionVariable, NodeRecord>();
  private group: NodeRecord | null = null;
  private scopeId: string | null = null;
  private root: NodeRecord | null = null;
  private playing: TransitionRange | null = null;
  readonly cues: string[] = [];
  readonly errors: string[] = [];

  private constructor(readonly engine: TimelineEngine, readonly index: NodeIndex) {}

  static async mount(o: {
    assets: AssetIndex; skin: Skin; ctx: RenderCtx; nodes: NodeIndex; engine: TimelineEngine;
    host: NodeRecord;
  }): Promise<SceneTransitions> {
    const t = new SceneTransitions(o.engine, o.nodes);
    const scene = await loadScene(o.assets, VARIABLES_SCENE);
    // The group that carries the four variables: found by content, not by an
    // assumed id, and reported.
    let groupObj: XuObject | null = null;
    walk(scene.root, (ob) => {
      if (groupObj) return;
      const ids = ob.children.map((c) => idOf(c));
      if (TRANSITION_VARIABLES.every((n) => ids.includes(n))) groupObj = ob;
    });
    if (!groupObj) { t.errors.push(`${VARIABLES_SCENE}: no group holds the four Transition* variables`); return t; }
    const ctx: RenderCtx = { ...o.ctx, pack: scene.pack, visuals: new VisualScope(indexVisuals(scene.root), o.skin) };
    const holder = document.createElement('div');
    holder.className = 'nxe-transitions';
    holder.dataset['xuiScene'] = scene.id;
    holder.dataset['xuiPlaceholder'] = 'transition-variables (hidden host for the Variables.xur timelines)';
    holder.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
    o.host.el.appendChild(holder);
    const before = o.nodes.all.length;
    const el = renderElement(scene.root, ctx, { overrides: new Map(), delta: NO_DELTA, owner: null, parent: o.host.rect, parentNode: o.host });
    if (!el) { t.errors.push(`${VARIABLES_SCENE}: did not render`); return t; }
    holder.appendChild(el);
    t.root = o.nodes.all[before] ?? null;
    if (!t.root) return t;
    const find = (n: NodeRecord, ob: XuObject): NodeRecord | null => {
      if (n.obj === ob) return n;
      for (const c of n.children) { const f = find(c, ob); if (f) return f; }
      return null;
    };
    t.group = find(t.root, groupObj);
    if (!t.group) { t.errors.push(`${VARIABLES_SCENE}: the transition group has no node`); return t; }
    for (const c of t.group.children) {
      const id = idOf(c.obj) as TransitionVariable;
      if ((TRANSITION_VARIABLES as readonly string[]).includes(id)) t.nodes.set(id, c);
    }
    bindTimelines(o.nodes, o.engine);
    t.scopeId = pathOf(t.group);
    if (!o.engine.get(t.scopeId)) { t.errors.push(`${VARIABLES_SCENE}: no timeline scope at ${t.scopeId}`); t.scopeId = null; }
    return t;
  }

  /** Play one of the four ranges from its first frame. */
  play(range: TransitionRange): boolean {
    if (!this.scopeId) return false;
    const r = TRANSITION_RANGES[range];
    const ok = this.engine.playRange(this.scopeId, r.start, r.end);
    if (ok) this.playing = range;
    return ok;
  }

  /** Park the group on a range's LAST frame: the resting state after it. */
  settle(range: TransitionRange): void {
    if (!this.scopeId) return;
    const s = this.engine.get(this.scopeId);
    const end = s?.frameOf(TRANSITION_RANGES[range].end);
    if (!s || end === null || end === undefined) return;
    s.playRange(TRANSITION_RANGES[range].start, TRANSITION_RANGES[range].end);
    s.seek(end);
    s.playing = false;
    this.engine.applyNow(s);
    this.playing = null;
  }

  /** Is the range still running? Frame-counted by the engine, never wall time. */
  get running(): boolean {
    if (!this.scopeId) return false;
    const s = this.engine.get(this.scopeId);
    return !!s && s.playing;
  }

  get frame(): number | null {
    if (!this.scopeId) return null;
    return this.engine.get(this.scopeId)?.tick ?? null;
  }

  /** The value a variable holds NOW: the timeline's override if it has written
   *  one, the authored FloatVariable otherwise (unset reads as 0, as the code
   *  reads it). */
  value(name: TransitionVariable): number {
    const n = this.nodes.get(name);
    if (!n) return name === 'TransitionScene' || name === 'TransitionSubElements' ? 1 : 0;
    const o = n.overrides.get('FloatVariable');
    if (typeof o === 'number') return o;
    const a = propByName(n.obj, 'FloatVariable')?.value;
    return typeof a === 'number' ? a : 0;
  }

  /** Write a resting value outright (a route that starts on a page is folded). */
  set(name: TransitionVariable, v: number): void {
    const n = this.nodes.get(name);
    if (!n) return;
    n.overrides.set('FloatVariable', v);
    updateNode(n, ['FloatVariable']);
  }

  report(): TransitionReport {
    const s = this.scopeId ? this.engine.get(this.scopeId) : undefined;
    const ranges: TransitionReport['ranges'] = {};
    for (const [k, r] of Object.entries(TRANSITION_RANGES)) {
      const a = s?.frameOf(r.start), b = s?.frameOf(r.end);
      ranges[k] = a !== null && a !== undefined && b !== null && b !== undefined ? { start: a, end: b } : null;
    }
    const values = {} as Record<TransitionVariable, number>;
    for (const n of TRANSITION_VARIABLES) values[n] = Number(this.value(n).toFixed(4));
    return {
      scene: VARIABLES_SCENE, group: this.group ? idOf(this.group.obj) || this.group.obj.className : null,
      scope: this.scopeId, ranges, values,
      playing: this.running ? this.playing : null, frame: this.frame, cues: this.cues,
    };
  }
}
