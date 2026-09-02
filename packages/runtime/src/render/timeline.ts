// Putting a control's visual into one named state.
//
// DOCUMENTED: a visual's states are named-frame PAIRS on the visual's own
// timeline - Normal..EndNormal, Focus..EndFocus, Press..EndPress. M0/M1 is a
// still frame, so we park the playhead on the state's OPENING frame and read
// every animated property there. That is not cosmetic: legend_Y and legend_X in
// the Console Settings scene are Enabled=false, and only the NormalDisable
// frame swaps their glyph to sharedres://disabled-Button.png at half opacity,
// which is exactly what the 6717 reference frame shows.
import type { XuObject, XuScalar, XuTimeline, XuKeyframe } from '@xur/index';
import { VISUAL_STATE_FALLBACK } from '../xuiEnums';
import type { Overrides } from './props';

/** Dotted path for a track, e.g. "Fill.Gradient.StopColor#2". */
export function trackKey(t: XuTimeline['tracks'][number]): string {
  const name = t.path.map((d) => d.name).join('.');
  return t.index === null ? name : `${name}#${t.index}`;
}

/** The frame a state opens on, following the documented fallback chain. */
export function stateFrame(o: XuObject, state: string): number | null {
  const seen = new Set<string>();
  let s: string | undefined = state;
  while (s && !seen.has(s)) {
    seen.add(s);
    const f = o.namedFrames.find((n) => n.name === s);
    if (f) return f.keyframe;
    s = VISUAL_STATE_FALLBACK[s];
  }
  return null;
}

/**
 * Values of every animated property of `o`'s descendants at `frame`, keyed by
 * the target element's Id. Interpolation between keyframes: Linear blends
 * numbers and colours, None holds the earlier keyframe. Ease is DOCUMENTED as
 * signed EaseIn/EaseOut with an EaseScale, but the whole 6770 corpus stores
 * 0/0/50 and the curve formula is unverified, so Ease is blended linearly and
 * counted by the caller.
 */
export function sampleTimelines(o: XuObject, frame: number): Map<string, Map<string, XuScalar>> {
  const out = new Map<string, Map<string, XuScalar>>();
  for (const tl of o.timelines) {
    if (tl.keyframes.length === 0) continue;
    const at = sampleKeyframes(tl.keyframes, frame);
    let bag = out.get(tl.elementId);
    if (!bag) { bag = new Map(); out.set(tl.elementId, bag); }
    tl.tracks.forEach((t, i) => {
      const v = at[i];
      if (v !== undefined) bag!.set(trackKey(t), v);
    });
  }
  return out;
}

function sampleKeyframes(kfs: readonly XuKeyframe[], frame: number): (XuScalar | undefined)[] {
  let lo = kfs[0]!;
  let hi: XuKeyframe | undefined;
  for (const k of kfs) {
    if (k.keyframe <= frame) lo = k;
    else { hi = k; break; }
  }
  if (!hi || lo.keyframe === frame || lo.interpolation === 'None') return lo.values.slice();
  const t = (frame - lo.keyframe) / (hi.keyframe - lo.keyframe);
  return lo.values.map((v, i) => lerp(v, hi!.values[i], t));
}

function lerp(a: XuScalar | undefined, b: XuScalar | undefined, t: number): XuScalar | undefined {
  if (a === undefined || b === undefined) return a;
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
  if (isColour(a) && isColour(b)) {
    return { a: mix(a.a, b.a, t), r: mix(a.r, b.r, t), g: mix(a.g, b.g, t), b: mix(a.b, b.b, t) };
  }
  if (isVec(a) && isVec(b)) return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
  if (isQuat(a) && isQuat(b)) {
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t, w: a.w + (b.w - a.w) * t };
  }
  return a; // strings, booleans and figures hold until the next keyframe
}
const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
const isColour = (v: unknown): v is { a: number; r: number; g: number; b: number } =>
  !!v && typeof v === 'object' && 'a' in v && 'r' in v && 'g' in v && 'b' in v;
const isVec = (v: unknown): v is { x: number; y: number; z: number } =>
  !!v && typeof v === 'object' && 'x' in v && 'z' in v && !('w' in v);
const isQuat = (v: unknown): v is { x: number; y: number; z: number; w: number } =>
  !!v && typeof v === 'object' && 'w' in v && 'x' in v;

export const NO_SAMPLE: ReadonlyMap<string, Map<string, XuScalar>> = new Map();
export type Sampled = ReadonlyMap<string, Map<string, XuScalar>>;
export function overridesFor(s: Sampled, id: string): Overrides {
  return s.get(id) ?? new Map();
}
