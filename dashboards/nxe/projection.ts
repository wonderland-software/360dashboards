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
// THE MEASUREMENT (and a correction to the spec)
//
// Ten landmarks on three panels of one frame - the home screen, default green
// theme, My Xbox channel, front slot "Open Tray"
// [FRAME nxe-9199-YrtwSj1f6aY/f0483, 1920x1080, all numbers in 1280x720 units].
// Each edge is the strongest luma step of a mean-luma profile across a band
// that crosses only that panel, taken as a rule and not hand-picked:
//
//   panel  left    right    top     bottom
//     1     95.3   515.6   248.0   568.0     (authored 420x320 at (96,568))
//     2      -     826.6   284.0   519.8     (left occluded by panel 1's shadow)
//     3      -    1010.5   305.0   491.9
//
// Panel 1 measures 420.3 x 320.0 against an authored 420 x 320: that is the
// 1:1 mapping, independently of the projection. Fitting (f, Cu, Cv) to all ten
// by least squares over a 1 px / 0.5 px grid gives
//
//     f = 1428, Cu = 154.5, Cv = 356.5      rms 0.46 px, worst 0.86 px
//
// with the per-landmark residuals in PROJECTION_RESIDUALS below. Panel 3 was
// not used to choose the numbers in any meaningful sense - two of the three
// unknowns are fixed by panel 2 alone - and it lands within 0.6 px on all
// three of its edges, which is the second landmark the phase asked for.
//
// **This corrects NXE_GLUE_SPEC §2.2.** The spec calibrated f from ONE number,
// the second slot's left edge at 520, under the assumption that the projection
// is about the FRONT ANCHOR ("s = 0.776 at z = 505 gives f ~= 1748"). That
// model is refuted by the same frame: projecting about the front anchor puts
// panel 2's bottom edge at 577.8 where the frame has 519.8, a 58 px error, and
// f = 1749 with the centre fitted still leaves rms 25 px. The panels do not
// slide along the floor as they recede, they converge on a point 356.5 px down
// the screen - which is what the frame shows, panel bottoms rising 568 -> 520
// -> 492 and panel tops falling 248 -> 284 -> 305.
//
// What is still INFERRED: that ProjectionScale/CenterU/CenterV are where these
// three numbers came from on the console, and in what units. Cv = 356.5 is
// within 3.5 px of the screen's own vertical centre (360); Cu = 154.5 is not
// near anything obvious. A reader in .text near 0x9217f544 would settle it.
export interface Projection {
  /** Focal length in design px: CSS `perspective`. */
  focal: number;
  /** Projection centre in design px: CSS `perspective-origin`. */
  centreU: number;
  centreV: number;
}

/** MEASURED (see the header). Not a default recovered from the binary. */
export const NXE_PROJECTION: Projection = { focal: 1428, centreU: 154.5, centreV: 356.5 };

/** The spec's one-edge calibration, kept so the smoke suite can show it fails. */
export const SPEC_FOCAL_FROM_ONE_EDGE = 1749;

export interface Landmark {
  panel: number;
  edge: 'left' | 'right' | 'top' | 'bottom';
  measured: number;
}

/**
 * The ten measurements, so the smoke suite can re-derive the residuals rather
 * than trusting a number in a comment.
 * [FRAME nxe-9199-YrtwSj1f6aY/f0483], 1280x720 units.
 */
export const PROJECTION_LANDMARKS: readonly Landmark[] = [
  { panel: 0, edge: 'left', measured: 95.3 },
  { panel: 0, edge: 'right', measured: 515.6 },
  { panel: 0, edge: 'top', measured: 248.0 },
  { panel: 0, edge: 'bottom', measured: 568.0 },
  { panel: 1, edge: 'right', measured: 826.6 },
  { panel: 1, edge: 'top', measured: 284.0 },
  { panel: 1, edge: 'bottom', measured: 519.8 },
  { panel: 2, edge: 'right', measured: 1010.5 },
  { panel: 2, edge: 'top', measured: 305.0 },
  { panel: 2, edge: 'bottom', measured: 491.9 },
];

/** The residuals the fit leaves, in design px, in landmark order. */
export const PROJECTION_RESIDUALS: readonly number[] =
  [0.70, 0.40, 0.00, 0.00, 0.86, -0.19, 0.41, -0.62, -0.22, 0.31];

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
