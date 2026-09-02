// Keyframe interpolation. No DOM here: this file is the arithmetic, so the
// node test runner can exercise it directly.
import type { XuScalar, XuColour, XuVector, XuQuaternion, XuInterpolation } from '@xur/index';

export const isColour = (v: unknown): v is XuColour =>
  !!v && typeof v === 'object' && 'a' in v && 'r' in v && 'g' in v && 'b' in v;
export const isVector = (v: unknown): v is XuVector =>
  !!v && typeof v === 'object' && 'x' in v && 'z' in v && !('w' in v);
export const isQuaternion = (v: unknown): v is XuQuaternion =>
  !!v && typeof v === 'object' && 'w' in v && 'x' in v && 'y' in v && 'z' in v;

/**
 * XUI_KEYFRAME_INTERPOLATION, as the parser names it:
 *   Linear  blend to the next keyframe
 *   None    hold this keyframe's value until the next one
 *   Ease    blend along an ease curve (see easeCurve)
 * The corpus: Linear 9,771, None 5,035, Ease 454.
 */
export type Interp = XuInterpolation;

/**
 * INFERRED, and the ONLY place the ease shape is defined.
 *
 * A keyframe carries EaseIn and EaseOut (signed, -100..100) and EaseScale
 * (0..100). Every one of the 454 Ease keyframes in Blades 6770 stores
 * 0 / 0 / 50, so the corpus cannot distinguish one curve from another and the
 * real formula is unverified. What is required of any candidate is that it
 * reduce to a straight line at 0/0 - otherwise those 454 keyframes would move
 * differently from the 9,771 Linear ones for no reason.
 *
 * We use a cubic Bezier through (0,0) and (1,1) whose control points start at
 * the linear positions and are pulled off the diagonal by the ease amounts:
 *
 *   P1 = (1/3, 1/3 + k*easeIn/300)      P2 = (2/3, 2/3 - k*easeOut/300)
 *   k  = EaseScale / 50                 (50 is the corpus value, so k = 1)
 *
 * At EaseIn = EaseOut = 0 the control points sit exactly on the diagonal and
 * the curve IS the identity, whatever EaseScale is.
 */
export function easeCurve(t: number, easeIn: number, easeOut: number, easeScale: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const k = easeScale / 50;
  const y1 = 1 / 3 + (k * easeIn) / 300;
  const y2 = 2 / 3 - (k * easeOut) / 300;
  if (y1 === 1 / 3 && y2 === 2 / 3) return t;
  // x(u) has control points fixed at 1/3 and 2/3, so it is strictly increasing
  // and a bisection on u is both exact enough and impossible to diverge.
  let lo = 0;
  let hi = 1;
  let u = t;
  for (let i = 0; i < 24; i++) {
    u = (lo + hi) / 2;
    const x = bezier(u, 1 / 3, 2 / 3);
    if (x < t) lo = u; else hi = u;
  }
  return clamp01(bezier(u, y1, y2));
}
const bezier = (u: number, c1: number, c2: number): number => {
  const v = 1 - u;
  return 3 * v * v * u * c1 + 3 * v * u * u * c2 + u * u * u;
};
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Blend two values of the same type. Anything without a meaningful midpoint -
 *  strings, booleans, figures - holds the earlier value, which is what a
 *  TextureFileName or a Show flag has to do. */
export function blend(a: XuScalar | undefined, b: XuScalar | undefined, t: number): XuScalar | undefined {
  if (a === undefined) return b;
  if (b === undefined || t <= 0) return a;
  if (t >= 1 && typeof a === typeof b) return b;
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * t;
  if (isColour(a) && isColour(b)) {
    return { a: mix(a.a, b.a, t), r: mix(a.r, b.r, t), g: mix(a.g, b.g, t), b: mix(a.b, b.b, t) };
  }
  if (isQuaternion(a) && isQuaternion(b)) return slerp(a, b, t);
  if (isVector(a) && isVector(b)) {
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
  }
  return a;
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const mix = (a: number, b: number, t: number) => Math.round(lerp(a, b, t));

/** Shortest-arc spherical interpolation, with a linear fallback when the two
 *  rotations are close enough that sin(theta) stops being usable. */
export function slerp(a: XuQuaternion, b: XuQuaternion, t: number): XuQuaternion {
  let bx = b.x, by = b.y, bz = b.z, bw = b.w;
  let dot = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  if (dot < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; dot = -dot; }
  if (dot > 0.9995) {
    return normalise({ x: lerp(a.x, bx, t), y: lerp(a.y, by, t), z: lerp(a.z, bz, t), w: lerp(a.w, bw, t) });
  }
  const theta = Math.acos(dot > 1 ? 1 : dot);
  const sin = Math.sin(theta);
  const ka = Math.sin((1 - t) * theta) / sin;
  const kb = Math.sin(t * theta) / sin;
  return { x: a.x * ka + bx * kb, y: a.y * ka + by * kb, z: a.z * ka + bz * kb, w: a.w * ka + bw * kb };
}
function normalise(q: XuQuaternion): XuQuaternion {
  const n = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
}

export interface KeyframeLike {
  keyframe: number;
  interpolation: Interp;
  easeIn: number;
  easeOut: number;
  easeScale: number;
  values: (XuScalar | undefined)[];
}

/**
 * The value of every track at `frame`. The interpolation stored on the EARLIER
 * keyframe governs the segment that leaves it, which is why None reads as
 * "hold": the segment out of a None keyframe never blends.
 */
export function sampleKeyframes(kfs: readonly KeyframeLike[], frame: number): (XuScalar | undefined)[] {
  if (kfs.length === 0) return [];
  let lo = kfs[0]!;
  let hi: KeyframeLike | undefined;
  for (const k of kfs) {
    if (k.keyframe <= frame) lo = k;
    else { hi = k; break; }
  }
  if (!hi || frame <= lo.keyframe || lo.interpolation === 'None') return lo.values.slice();
  const span = hi.keyframe - lo.keyframe;
  let t = span === 0 ? 1 : (frame - lo.keyframe) / span;
  if (lo.interpolation === 'Ease') t = easeCurve(t, lo.easeIn, lo.easeOut, lo.easeScale);
  return lo.values.map((v, i) => blend(v, hi!.values[i], t));
}

/** Two sampled values differ enough to be worth a DOM write. */
export function changed(a: XuScalar | undefined, b: XuScalar | undefined): boolean {
  if (a === b) return false;
  if (a === undefined || b === undefined) return true;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) > 1e-4;
  if (typeof a !== 'object' || typeof b !== 'object') return a !== b;
  if (isColour(a) && isColour(b)) return a.a !== b.a || a.r !== b.r || a.g !== b.g || a.b !== b.b;
  if (isQuaternion(a) && isQuaternion(b)) {
    return Math.abs(a.x - b.x) > 1e-5 || Math.abs(a.y - b.y) > 1e-5 || Math.abs(a.z - b.z) > 1e-5 || Math.abs(a.w - b.w) > 1e-5;
  }
  if (isVector(a) && isVector(b)) {
    return Math.abs(a.x - b.x) > 1e-4 || Math.abs(a.y - b.y) > 1e-4 || Math.abs(a.z - b.z) > 1e-4;
  }
  return true;
}
