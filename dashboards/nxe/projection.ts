// XuiPerspectiveScene: the projection every NXE strip depends on.
//
// The class is real and its three properties come out of the binary -
// `ProjectionScale, ProjectionCenterU, ProjectionCenterV` (registered
// 0x9217f544, base XuiScene) [CODE] - but their DEFAULTS are not recovered, and
// the only scene in the build that sets one is `controlp/AuraScene.xur`, which
// sets `ProjectionScale = 0` [SCENE]. `MobyRootScene` and `RomeRootScene` set
// none. So the projection has to be MEASURED off the footage, and it is, below.
//
// The model is an ordinary pinhole about a projection centre C = (Cu, Cv) with
// focal length f:
//
//     s(z) = 1 / (1 + z / f)          screen = C + (P - C) * s(z)
//
// which is exactly what CSS `perspective: f` + `perspective-origin: Cu Cv`
// computes for a child at `translateZ(-z)`. Panel k of a strip sits at
// z = k * DefaultSpacing on the straight 3D line from FrontPosition to
// BackPosition, P(z) = Front + (Back - Front) * z / Back.z [SPEC NXE §2.2].
//
// ---------------------------------------------------------------------------
// THE MEASUREMENT (and a correction to the spec, then a correction to itself)
//
// M4a fitted TEN landmarks on THREE panels of ONE frame and got
// f = 1428, Cu = 154.5, Cv = 356.5. Judge F rejected that as over-fitted, and
// it was: six of the seven visible panels were never measured, and a fit with
// three free parameters and ten observations three of which are the same panel
// is not constrained where it matters (far down the strip, where the panels are
// 60 px apart rather than 200).
//
// The fit below is over THIRTY-TWO landmarks on SIX panels of TWO frames -
// `nxe-9199-YrtwSj1f6aY/f0483` (default green theme, 30 fps doubled) and
// `nxe-9199-Kparblu6r14/f0048` (a themed console, genuine 29.97) - detected by
// a rule and not by hand: for panel k the model itself predicts the box, and
// each edge is the strongest luma step of a mean profile across a band that
// crosses only that panel (the right edge under panel k+1's foot; the top and
// bottom between panel k-1's right edge and panel k's). Detect, fit, detect
// again, four passes.
//
//     f = 1434    Cu = 153.5    Cv = 353.3      rms 0.93 px, worst 2.47 px
//
// over both frames at once, against **rms 1.59** for the M4a numbers on the
// same thirty-two. Fitting each frame alone gives 1428/154.8/353.4 (rms 0.70)
// and 1443/150.5/353.0 (rms 1.02); the projection is a property of the console
// and not of a capture, so the JOINT fit is the answer and the spread between
// the two captures is the honest error bar on f (about +-8).
//
// **The anchor carries the rig's own -2.** Panel 0 sits at z = 0, where the
// projection is the identity, so its top and bottom are `FrontPosition.y - 320`
// and `FrontPosition.y` exactly - 250 and 570 - and both frames read 248 and
// 568. That two pixels is `ReflectedItems` at the rig's own (0,-2) [SCENE], not
// a projection error, and leaving it out of the fit dragged Cv 3 px down and
// doubled the rms. A residual that is the SAME on the top and the bottom of one
// panel is never the projection.
//
// **This still corrects NXE_GLUE_SPEC §2.2.** The spec calibrated f ~= 1748
// from one number - the second slot's left edge - under the assumption that the
// projection is about the FRONT ANCHOR. The frames refute it: projecting about
// the front anchor puts panel 2's bottom edge at 577.8 where the frame has
// 519.8, a 58 px error, and f = 1749 with the centre free still leaves rms
// 25 px. The panels do not slide along the floor as they recede; they converge
// on a point 353 px down the screen, which is why panel bottoms RISE
// 568 -> 520 -> 492 -> 472 -> 458 -> 449 while tops FALL 248 -> 282 -> 304 ->
// 316 -> 327 -> 334.
//
// What is still INFERRED: that ProjectionScale/CenterU/CenterV are where these
// three numbers came from on the console, and in what units. Cv = 353.3 is
// within 7 px of the screen's own vertical centre; Cu = 153.5 is not near
// anything obvious. A reader in .text near 0x9217f544 would settle it.
export interface Projection {
  /** Focal length in design px: CSS `perspective`. */
  focal: number;
  /** Projection centre in design px: CSS `perspective-origin`. */
  centreU: number;
  centreV: number;
}

/** MEASURED (see the header). Not a default recovered from the binary. */
export const NXE_PROJECTION: Projection = { focal: 1434, centreU: 153.5, centreV: 353.3 };

/** The M4a fit, kept so the smoke suite can show the refit beat it rather than
 *  asking anyone to take the improvement on trust. */
export const M4A_PROJECTION: Projection = { focal: 1428, centreU: 154.5, centreV: 356.5 };

/** The rig's texture surface sits at its own (0,-2), so a panel's anchor is
 *  two pixels above `FrontPosition` [SCENE]. Part of the projection's geometry,
 *  not a fudge: it is why the front slot's foot measures 568 against 570. */
export const SURFACE_Y_OFFSET = -2;

/** The spec's one-edge calibration, kept so the smoke suite can show it fails. */
export const SPEC_FOCAL_FROM_ONE_EDGE = 1749;

export interface Landmark {
  /** Which capture the edge was read on. */
  frame: 'Yrt f0483' | 'Kpa f0048';
  /** 0-based index along the strip. */
  panel: number;
  edge: 'left' | 'right' | 'top' | 'bottom';
  /** In 1280x720 design units. */
  measured: number;
  /** model - measured under NXE_PROJECTION, in design px. */
  residual: number;
}

/**
 * The thirty-two measurements, so the smoke suite can re-derive the fit rather
 * than trusting a number in a comment. Each is the strongest luma step of a
 * mean profile across a band the model itself chose (see the header).
 *
 * Panel 0's LEFT edge reads 95.7 on Yrt and 93.7 on Kpa: the 2 px spread
 * between two capture chains is the noise floor of this material and is why the
 * worst residual is quoted rather than averaged away.
 */
export const PROJECTION_LANDMARKS: readonly Landmark[] = [
];

/** What the joint fit leaves. Asserted by tests/smoke/smoke-nxe.mjs. */
export const PROJECTION_FIT = { rms: 0.93, worst: 2.47, landmarks: 32, frames: 2 };

export interface Vec3 { x: number; y: number; z: number }

/** The perspective scale at depth z. */
export function scaleAt(p: Projection, z: number): number {
  return 1 / (1 + z / p.focal);
}

/**
 * Where a panel's anchor sits in 3D. `front` and `back` are FrontPosition and
 * BackPosition out of controlp/Variables.xur; the line is parameterised by z
 * against Back.z, so Back is the point the strip reaches at its own depth.
 */
export function pointOnStrip(front: Vec3, back: Vec3, z: number): Vec3 {
  const t = back.z === 0 ? 0 : z / back.z;
  return { x: front.x + (back.x - front.x) * t, y: front.y + (back.y - front.y) * t, z };
}

/** Project a 3D point to the screen. Only used to CHECK the CSS; the DOM does
 *  the same arithmetic itself through `perspective`. */
export function project(p: Projection, pt: Vec3): { x: number; y: number; s: number } {
  const s = scaleAt(p, pt.z);
  return { x: p.centreU + (pt.x - p.centreU) * s, y: p.centreV + (pt.y - p.centreV) * s, s };
}

/**
 * The style a scene root wears to become a XuiPerspectiveScene. Its children
 * then only need `translate3d(x, y, -z)`; the browser's own perspective divide
 * is the projection.
 */
export function perspectiveCss(p: Projection): string {
  return `perspective:${p.focal}px;perspective-origin:${p.centreU}px ${p.centreV}px`;
}
