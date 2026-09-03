// The NXE strip's motion: a per-frame velocity integrator and a fold cascade.
//
// NXE has no `1To2`. Where Blades named every movement as a range in one scene,
// NXE ships THIRTY numbers in `controlp/Variables.xur` and integrates
// [NXE_GLUE_SPEC §2.3]. This module is that integration, and nothing in it is
// invented except where it says so.
//
// ---------------------------------------------------------------------------
// THE UNIT, WHICH IS THE WHOLE PROBLEM
//
// The file gives `MobyPanelInputAcceleration 40`, `…Deceleration 30`,
// `…MaxVelocity 20` and no unit at all. Three readings are possible and two of
// them are refuted by arithmetic alone:
//
//   * z units (the 505-unit panel spacing). One step would accelerate to the
//     20-unit cap in 0.5 s and then CRUISE for 24.7 s. Refuted.
//   * per 60 Hz frame. One step would take 0.9 ms - under a single frame.
//     Refuted.
//   * INDEX units (panels for the panel axis, channels for the channel axis)
//     per second. One step is a triangular accel/decel move of distance 1.
//
// The third is the one that survives, and the CHANNEL axis says so exactly. For
// a triangular move of distance 1 the total time closes to
//
//     T = sqrt( 2 * (a + d) / (a * d) )
//
// and the channel constants (a = 50, d = 40) give sqrt(2*90/2000) = sqrt(0.09)
// = **0.300 000 s**, a round three tenths of a second out of two numbers that
// are not round. The panel axis (40/30) gives 0.341 6 s and Rome (60/40) gives
// 0.288 7 s. The measured one-panel move on the 9199 footage is 0.40 s of
// visible motion decaying to 0.57 s [FRAME Yrt, nxe-README "Measurements"], so
// the model lands inside the measurement and the exact 0.3 is the evidence for
// the unit. Recorded as MEASURED-CONSISTENT, not as a recovered fact.
//
// ---------------------------------------------------------------------------
// THE SERVO, AND THE READING IT REPLACES
//
// §2.3 describes the input as "a held direction accelerates the cursor toward a
// velocity cap and releasing it decelerates". Taken literally - free
// acceleration while held, free deceleration on release - a TAP (one frame of
// input) reaches 40/60 = 0.67 panels/s and coasts 0.0074 of a panel before
// stopping. The console moves exactly one panel on a tap. So the cursor is
// servoed to an integer TARGET: it accelerates at `Acceleration`, is capped at
// `MaxVelocity`, and brakes at `Deceleration` as soon as the remaining distance
// is within its own braking distance. Holding the direction re-targets as each
// step completes, which reproduces "held = continuous scroll at the cap"
// without a second model. The braking rule is what makes the two constants
// separate numbers; a single-rate model could not use both.
import type { StripConstants } from './variables';

/** The three constants of one input axis, out of `controlp/Variables.xur`. */
export interface AxisConstants {
  acceleration: number;
  deceleration: number;
  maxVelocity: number;
}

/** How long a distance-1 triangular accel/decel move takes, in seconds.
 *  Closed form, so the smoke suite can check the integrator against it. */
export function stepDuration(c: AxisConstants, distance = 1): number {
  const peak = Math.sqrt((2 * distance * c.acceleration * c.deceleration) / (c.acceleration + c.deceleration));
  if (peak <= c.maxVelocity) return peak / c.acceleration + peak / c.deceleration;
  const accel = c.maxVelocity / c.acceleration;
  const decel = c.maxVelocity / c.deceleration;
  const cruise = (distance - (c.maxVelocity * c.maxVelocity) / (2 * c.acceleration)
    - (c.maxVelocity * c.maxVelocity) / (2 * c.deceleration)) / c.maxVelocity;
  return accel + cruise + decel;
}

/** A cursor's state, sampled once a frame. */
export interface AxisSample {
  cursor: number;
  velocity: number;
  target: number;
  moving: boolean;
}

/**
 * One servoed cursor: the panel cursor within a channel, or the channel cursor.
 *
 * Integrated with semi-implicit Euler at the timeline's own fixed 60 Hz step,
 * never off a wall clock, so `?frame=`, `stepFrames()` and the browser all
 * produce the same position for the same input.
 */
export class Axis {
  cursor = 0;
  velocity = 0;
  target = 0;
  /** Inclusive index bounds; a move past them is REFUSED, and a refused move
   *  is silent (the Blades rule: a held d-pad at the end of a list plays no
   *  cue on the console either). */
  min = 0;
  max = 0;

  constructor(readonly name: string, readonly c: AxisConstants) {}

  get moving(): boolean { return this.velocity !== 0 || this.cursor !== this.target; }

  /** Jump with no motion: arriving on a page is not movement. */
  set(index: number): void {
    this.cursor = index;
    this.target = index;
    this.velocity = 0;
  }

  setBounds(min: number, max: number): void {
    this.min = min;
    this.max = max;
    if (this.target < min) this.target = min;
    if (this.target > max) this.target = max;
  }

  /** Ask for one step. Returns false when the clamp absorbed it. */
  nudge(dir: -1 | 1): boolean {
    const next = this.target + dir;
    if (next < this.min || next > this.max) return false;
    this.target = next;
    return true;
  }

  /**
   * One 60 Hz frame. Returns true while the cursor is still moving.
   *
   * The braking rule is a SPEED CEILING, not a switch: the cursor may never be
   * going faster than it could still stop from in the distance that is left,
   * `sqrt(2 * Deceleration * |e|)`. Written as a switch instead - accelerate
   * until the braking distance is reached, then decelerate - the discrete step
   * overshoots and the arrival clamp eats the tail, which cost 3.5 frames of a
   * 20.5-frame move and made the integrator disagree with its own closed form
   * by 12 %. The ceiling form lands within a frame of `stepDuration`.
   */
  step(dt: number): boolean {
    const e = this.target - this.cursor;
    if (e === 0 && this.velocity === 0) return false;
    const dir: number = Math.sign(e) || Math.sign(this.velocity);
    const remaining = Math.abs(e);
    let v = this.velocity + dir * this.c.acceleration * dt;
    if (Math.abs(v) > this.c.maxVelocity) v = dir * this.c.maxVelocity;
    const stoppable = Math.sqrt(2 * this.c.deceleration * remaining);
    if (Math.abs(v) > stoppable) v = dir * stoppable;
    let x = this.cursor + v * dt;
    // Arrival: within one frame's travel of the target, land on it exactly.
    if ((dir > 0 && x >= this.target) || (dir < 0 && x <= this.target)) { x = this.target; v = 0; }
    this.cursor = x;
    this.velocity = v;
    return this.moving;
  }

  sample(): AxisSample {
    return { cursor: this.cursor, velocity: this.velocity, target: this.target, moving: this.moving };
  }
}

/* --------------------------------------------------------------- the fold */

/**
 * The fold cascade.
 *
 * `FoldSpeed 30 / UnfoldSpeed 10` with `FoldNextRange 0.3 / UnfoldNextRange
 * 0.7 / UnfoldMinSpeed 0.1` [SCENE]. The reading, all of it marked INFERRED in
 * `__dash.nxe.physics`:
 *
 *  * a panel's fold progress runs 0 -> 1 at `Speed` PER SECOND, so a fold takes
 *    1/30 s = 33 ms a panel and an unfold 1/10 s = 100 ms;
 *  * panel k+1 starts when panel k is `NextRange` of the way through, so the
 *    stagger is 0.3/30 = 11 ms folding and 0.7/10 = 70 ms unfolding, and a
 *    seven-panel strip folds in 100 ms and unfolds in 520 ms;
 *  * `UnfoldMinSpeed 0.1` is a floor on that rate. It can only bind if the rate
 *    VARIES, and the only thing that would vary it is `UnfoldEaseRange`, which
 *    is UNSET in the file - so on this build the floor never binds. Applied
 *    anyway, and said out loud rather than dropped.
 *
 * The unit is the same reading as the input axes and rests on the same
 * arithmetic: at 30 FRAMES a fold would take half a second and be SLOWER than
 * the unfold, which is backwards from every capture.
 *
 * What folding DOES to a panel is [INFER] and is the weakest claim in this
 * file: the strip collapses toward the front anchor (spacing scaled by
 * 1 - progress) and fades out. Nothing in the archive states the geometry.
 */
export interface FoldConstants {
  foldSpeed: number;
  foldNextRange: number;
  unfoldSpeed: number;
  unfoldNextRange: number;
  unfoldMinSpeed: number;
}

export type FoldPhase = 'open' | 'folding' | 'folded' | 'unfolding';

export class FoldCascade {
  /** Per-panel progress: 0 = fully open, 1 = fully folded. */
  progress: number[] = [];
  phase: FoldPhase = 'open';

  constructor(readonly c: FoldConstants) {}

  reset(count: number, folded: boolean): void {
    this.progress = new Array<number>(count).fill(folded ? 1 : 0);
    this.phase = folded ? 'folded' : 'open';
  }

  /** A fold always starts from OPEN and an unfold from FOLDED. Keeping the
   *  array as it was let a second channel change find every panel already at
   *  1.0 and "finish" the cascade in one frame. */
  fold(count = this.progress.length): void {
    this.progress = new Array<number>(count).fill(0);
    this.phase = 'folding';
  }

  unfold(count = this.progress.length): void {
    this.progress = new Array<number>(count).fill(1);
    this.phase = 'unfolding';
  }

  /** The rate a panel's progress moves at, per second. */
  private rate(): number {
    const raw = this.phase === 'folding' ? this.c.foldSpeed : this.c.unfoldSpeed;
    // UnfoldMinSpeed floors the unfold rate. With UnfoldEaseRange unset the
    // rate is constant and the floor cannot bind; kept so it is not lost.
    return this.phase === 'unfolding' ? Math.max(raw, this.c.unfoldMinSpeed) : raw;
  }

  /** One 60 Hz frame. Returns true while the cascade is still running. */
  step(dt: number): boolean {
    if (this.phase !== 'folding' && this.phase !== 'unfolding') return false;
    const folding = this.phase === 'folding';
    const gate = folding ? this.c.foldNextRange : this.c.unfoldNextRange;
    const d = this.rate() * dt;
    let running = false;
    // The gate is read off the progress at the START of the frame. Reading it
    // off the array being written collapses the whole cascade into two frames:
    // panel 0 advances, panel 1 sees the ADVANCED value, passes its gate and
    // advances in the same pass, and so on down the strip. A cascade whose
    // stagger is a frame is not a cascade.
    const before = this.progress.slice();
    for (let k = 0; k < this.progress.length; k++) {
      // Panel 0 starts at once; panel k waits for panel k-1 to pass NextRange.
      // The gate is read in the direction the cascade runs, so an unfold's
      // 0.7 means "panel k-1 is 70% of the way BACK to open".
      const ahead = k === 0 ? null : before[k - 1]!;
      const started = ahead === null || (folding ? ahead >= gate : ahead <= 1 - gate);
      if (!started) { running = true; continue; }
      const p = this.progress[k]!;
      const next = folding ? Math.min(1, p + d) : Math.max(0, p - d);
      this.progress[k] = next;
      if (folding ? next < 1 : next > 0) running = true;
    }
    if (!running) this.phase = folding ? 'folded' : 'open';
    return running;
  }
}

/** Both axes and the cascade for one strip, built from the file's constants. */
export function axesOf(strip: StripConstants, s: { channel: AxisConstants; panel: AxisConstants }): {
  channel: Axis; panel: Axis; fold: FoldCascade;
} {
  return {
    channel: new Axis('channel', s.channel),
    panel: new Axis('panel', s.panel),
    fold: new FoldCascade(strip),
  };
}
