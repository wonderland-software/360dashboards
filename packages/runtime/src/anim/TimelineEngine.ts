// The timeline clock. DOM-free on purpose: a scope is a playhead over one
// XuObject's named frames and timelines, and the engine only calls back with
// the values that changed. Binding those values to DOM lives in render/update.ts.
import type { XuObject, XuScalar, XuTimeline, XuNamedFrame } from '@xur/index';
import { VISUAL_STATE_FALLBACK } from '../xuiEnums';
import { sampleKeyframes, changed } from './interp';

/** DOCUMENTED: XUI timelines are keyed in frames and the dashboard runs its
 *  animation clock at 60 of them a second. */
export const FRAMES_PER_SECOND = 60;
export const FRAME_MS = 1000 / FRAMES_PER_SECOND;

/** A named-frame command can chain (End<state> -> GoToAndPlay(loop)). Bound so
 *  a cycle of jumps inside one frame cannot wedge the engine. */
const MAX_JUMPS_PER_STEP = 8;

export type TrackValues = Map<string, XuScalar>;
/** elementId -> the properties of that child that changed this step. */
export type ScopeDelta = Map<string, TrackValues>;

/** Dotted path for a track: "Opacity", "Fill.Gradient.StopPos#2". Matches the
 *  override keys PropBag reads, so nothing has to translate between them. */
export function trackKey(t: XuTimeline['tracks'][number]): string {
  const name = t.path.map((d) => d.name).join('.');
  return t.index === null ? name : `${name}#${t.index}`;
}

export class TimelineScope {
  /** frame number -> the named frames sitting on it, in file order */
  private readonly byFrame = new Map<number, XuNamedFrame[]>();
  private readonly byName = new Map<string, XuNamedFrame>();
  private readonly last = new Map<string, TrackValues>();

  tick = 0;
  playing = false;
  /** Guard so playRange cannot run past its End frame if the file forgot the
   *  Stop command; the End frame's own command normally does the stopping. */
  stopAt: number | null = null;
  range: [string, string] | null = null;
  /** The last XuiSoundXAudio.File keyframe this scope fired (bind.ts sets it). */
  lastCue: string | null = null;
  /** The state name currently playing, for telemetry and for asserting that a
   *  range is not re-entered while nothing has changed. */
  state: string | null = null;
  /**
   * Called with the tick every time the playhead LANDS on a frame while
   * playing - not on a seek, which is a jump the console never makes with the
   * clock running. bind.ts uses it for XuiSoundXAudio cues, because a File
   * keyframe is an EVENT and not a value: dashmain's _2ndLevel_Sounds writes
   * dash_2ndLevelClose.xma on frames 435, 497, 581, 656 ... with nothing in
   * between, so "the sampled value changed" would fire the first of those and
   * silence the rest, including the one BootLive depends on.
   */
  onFrame: ((tick: number) => void) | null = null;

  /** How many times a range has been STARTED on this scope. A range that is
   *  looping via GoToAndPlay does not increment it; only a fresh playRange
   *  does, which is what makes an accidental re-entry visible. */
  entries = 0;

  constructor(readonly id: string, readonly obj: XuObject, readonly hostControlId: string | null = null) {
    for (const f of obj.namedFrames) {
      const list = this.byFrame.get(f.keyframe) ?? [];
      list.push(f);
      this.byFrame.set(f.keyframe, list);
      if (!this.byName.has(f.name)) this.byName.set(f.name, f);
    }
  }

  get lastFrame(): number {
    let max = 0;
    for (const t of this.obj.timelines) for (const k of t.keyframes) if (k.keyframe > max) max = k.keyframe;
    for (const f of this.obj.namedFrames) if (f.keyframe > max) max = f.keyframe;
    return max;
  }

  frameOf(name: string): number | null {
    return this.byName.get(name)?.keyframe ?? null;
  }

  /** The frame a state opens on, down the documented fallback chain. */
  stateFrame(state: string): { name: string; frame: number } | null {
    const seen = new Set<string>();
    let s: string | undefined = state;
    while (s && !seen.has(s)) {
      seen.add(s);
      const f = this.byName.get(s);
      if (f) return { name: s, frame: f.keyframe };
      s = VISUAL_STATE_FALLBACK[s];
    }
    return null;
  }

  seek(frame: number): void {
    this.tick = frame;
  }

  stop(): void {
    this.playing = false;
    this.stopAt = null;
  }

  /**
   * Play from `startName` and let the file stop it. XUI writes states as pairs,
   * <State> with command Play and End<State> with command Stop, so the End
   * frame halts the playhead by itself; `stopAt` is only a backstop, and a
   * GoToAndPlay that jumps backwards (a Focus loop) survives it because the
   * check runs after the jump.
   */
  playRange(startName: string, endName?: string): boolean {
    const start = this.stateFrame(startName);
    if (!start) return false;
    const end = endName ? { name: endName, frame: this.frameOf(endName) } : this.endFor(start.name);
    // Label the range with the name that RESOLVED, never with a guess: the
    // skin writes all three of End<State>, <State>End and <n>End<State>
    // (metaScene_1line's is 1To2End, legend visuals use 1EndPress), and a range
    // whose end simply does not exist says so.
    this.range = [start.name, end?.frame !== null && end ? end.name : '(none)'];
    this.once = false;
    this.state = startName;
    this.entries += 1;
    this.tick = start.frame;
    this.stopAt = end?.frame ?? null;
    this.playing = true;      // the start frame's own Play command confirms it
    this.dispatch(start.frame);
    this.onFrame?.(this.tick);
    return true;
  }

  /** The three shapes a state's End frame is written in, in the order the skin
   *  uses them: End<State>, <State>End, and the infix <digits>End<rest>. */
  private endFor(start: string): { name: string; frame: number | null } | null {
    const infix = /^(\d+)(.+)$/.exec(start);
    const guesses = ['End' + start, start + 'End'];
    if (infix) guesses.push(`${infix[1]}End${infix[2]}`);
    for (const g of guesses) {
      const f = this.frameOf(g);
      if (f !== null) return { name: g, frame: f };
    }
    return null;
  }

  /**
   * A scope with timelines and NO named frames has no Play command to start it,
   * but the console clearly runs those: 12 of dashmain's 43 scopes are like this
   * (BG_animation/groupBackground1 is 990 frames, BG_Animation_OOBE/Ripple 801),
   * and reference frames 1.33s apart differ by 1.5-1.9 grey levels in exactly
   * those backgrounds. So they free-run from frame 0 and wrap at the last
   * keyframe. INFERRED: that the wrap is a loop rather than a hold - a hold
   * would leave the background frozen, which the frames rule out.
   */
  get isAmbient(): boolean {
    return this.obj.namedFrames.length === 0 && this.obj.timelines.length > 0;
  }
  autoplay(): void {
    if (!this.isAmbient) return;
    this.once = false;
    this.tick = 0;
    this.playing = true;
    this.range = ['(ambient)', '(loop)'];
    this.stopAt = null;
  }

  /**
   * Play the whole timeline from frame 0 exactly once and hold on the last
   * frame. This is how XuiScene.TransFrom/TransTo run: FadeIn/FadeOut in the
   * skin are one-timeline visuals with no named frames at all, so neither the
   * named-range path nor the ambient loop describes them.
   */
  playOnce(from = 0): void {
    this.once = true;
    this.tick = from;
    this.playing = true;
    this.range = ['(once)', '(end)'];
    this.state = null;
    this.entries += 1;
    this.stopAt = this.lastFrame;
    this.invalidate();
  }
  private once = false;
  get finished(): boolean { return !this.playing && this.tick >= this.lastFrame; }

  /** One 60 Hz step. */
  step(): void {
    if (!this.playing) return;
    this.tick += 1;
    this.jumped = false;
    this.dispatch(this.tick);
    // The backstop only applies when the file did NOT take control: a GoTo of
    // any kind is an explicit instruction and outranks the range's end.
    if (this.playing && !this.jumped && this.stopAt !== null && this.tick >= this.stopAt) this.playing = false;
    if (this.tick > this.lastFrame) {
      // An ambient scope loops; a named range, or a play-once, holds on its
      // last frame.
      if (this.isAmbient && !this.once) { this.tick = 0; this.invalidate(); }
      else { this.tick = this.lastFrame; this.playing = false; }
    }
    this.onFrame?.(this.tick);
  }

  private jumped = false;

  /** Flash-style: the commands on a frame fire when the playhead lands on it. */
  private dispatch(frame: number, depth = 0): void {
    const frames = this.byFrame.get(frame);
    if (!frames) return;
    for (const f of frames) {
      switch (f.command) {
        case 'Play': this.playing = true; break;
        case 'Stop': this.playing = false; break;
        case 'GoTo': case 'GoToAndPlay': case 'GoToAndStop': {
          if (f.command === 'GoToAndPlay') this.playing = true;
          if (f.command === 'GoToAndStop') this.playing = false;
          const to = f.target ? this.frameOf(f.target) : null;
          if (to === null || to === frame) break;
          this.tick = to;
          this.jumped = true;
          if (depth < MAX_JUMPS_PER_STEP) this.dispatch(to, depth + 1);
          return; // the jump replaced the playhead; later frames here are stale
        }
      }
    }
  }

  /** Every animated property at the current tick, keyed by target element. */
  sample(): ScopeDelta {
    const out: ScopeDelta = new Map();
    for (const tl of this.obj.timelines) {
      if (tl.keyframes.length === 0) continue;
      const at = sampleKeyframes(tl.keyframes, this.tick);
      let bag = out.get(tl.elementId);
      if (!bag) { bag = new Map(); out.set(tl.elementId, bag); }
      tl.tracks.forEach((t, i) => {
        const v = at[i];
        if (v !== undefined) bag!.set(trackKey(t), v);
      });
    }
    return out;
  }

  /** Only what moved since the previous apply, so a still scope costs nothing. */
  sampleChanged(): ScopeDelta {
    const now = this.sample();
    const delta: ScopeDelta = new Map();
    for (const [id, values] of now) {
      const prev = this.last.get(id);
      const diff: TrackValues = new Map();
      for (const [k, v] of values) if (!prev || changed(prev.get(k), v)) diff.set(k, v);
      if (diff.size) delta.set(id, diff);
      this.last.set(id, values);
    }
    return delta;
  }

  /** Forget the diff cache so the next apply writes everything. */
  invalidate(): void { this.last.clear(); }
}

export type ScopeApply = (scope: TimelineScope, delta: ScopeDelta) => void;

/** A XuiSoundXAudio.File keyframe the playhead just landed on. */
export interface TimelineCue { scopeId: string; elementId: string; file: string; tick: number }

export class TimelineEngine {
  private readonly scopes = new Map<string, TimelineScope>();
  private readonly applies = new Map<string, ScopeApply>();
  private accumulator = 0;
  /** ?frame=N: every scope is pinned here and step() does nothing. */
  frozenAt: number | null = null;
  /**
   * Every sound in build 6770 is a keyframe: XuiSoundXAudio.File is an
   * animated track (btn_1line_icon sets sharedres://btn_Focus.xma on its Focus
   * frame and btn_Select.xma on Press; dashmain's four emitters carry the blade
   * and level cues). bind.ts reports each File keyframe here and the app's
   * AudioBank plays it. Nothing decides a cue by state name.
   */
  onCue: ((ev: TimelineCue) => void) | null = null;

  remove(id: string): void {
    this.scopes.delete(id);
    this.applies.delete(id);
  }

  /**
   * Run `fn` on the frame a play-once scope finishes on, and not before.
   *
   * The console tears a popped scene down AFTER its TransBackFrom visual has
   * run (§2/§3: Trans* name FadeOut/FadeIn in dashuisk/skin.xur, and FadeOut is
   * a five-frame curve), so the shell needs a deterministic "when that curve
   * ends" - deterministic meaning counted in 60 Hz steps, never in wall clock,
   * or ?frame= and the smoke suites' stepFrames would disagree with the browser.
   *
   * A scope that is not registered has already finished, so the callback fires
   * at once rather than being lost. `flush` runs every waiter immediately: the
   * shell calls it when a second press would otherwise leave two scenes in the
   * document at the same time.
   */
  whenFinished(scopeId: string, fn: () => void): void {
    const s = this.scopes.get(scopeId);
    if (!s || s.finished) { fn(); return; }
    this.waiters.push({ scopeId, fn });
  }
  flushWaiters(): void {
    const pending = this.waiters.splice(0, this.waiters.length);
    for (const w of pending) w.fn();
  }
  private readonly waiters: { scopeId: string; fn: () => void }[] = [];
  private drainWaiters(): void {
    if (!this.waiters.length) return;
    const ready: (() => void)[] = [];
    for (let i = this.waiters.length - 1; i >= 0; i--) {
      const w = this.waiters[i]!;
      const s = this.scopes.get(w.scopeId);
      if (s && !s.finished) continue;
      ready.push(w.fn);
      this.waiters.splice(i, 1);
    }
    for (const fn of ready.reverse()) fn();
  }

  add(scope: TimelineScope, apply: ScopeApply): TimelineScope {
    this.scopes.set(scope.id, scope);
    this.applies.set(scope.id, apply);
    // Nothing else will ever start an ambient scope, so start it here.
    if (scope.isAmbient) { scope.autoplay(); this.applyNow(scope); }
    return scope;
  }

  get(id: string): TimelineScope | undefined { return this.scopes.get(id); }
  all(): TimelineScope[] { return [...this.scopes.values()]; }

  /** Scopes belonging to a control's instantiated visual. */
  forControl(controlId: string): TimelineScope[] {
    return this.all().filter((s) => s.hostControlId === controlId);
  }

  /**
   * Put a control into a state: play its visual's <State>..End<State> range,
   * following the documented fallback chain when the visual does not define it.
   * A XuiSoundXAudio child of the visual is the console's cue for that state;
   * we record it and play nothing.
   */
  setState(controlId: string, state: string, underPath?: string): boolean {
    let any = false;
    for (const s of this.forControl(controlId)) {
      // Scope ids are the chain of element Ids, so a path prefix is how one
      // scene's legend_b is told apart from the four other legend_b controls
      // on screen. Without it, pressing B fires btn_Back once per copy.
      if (underPath !== undefined && !s.id.startsWith(underPath)) continue;
      const opened = s.stateFrame(state);
      if (!opened) continue;
      s.playRange(opened.name);
      this.applyNow(s);
      any = true;
    }
    return any;
  }

  playRange(scopeId: string, startName: string, endName?: string): boolean {
    const s = this.scopes.get(scopeId);
    if (!s || !s.playRange(startName, endName)) return false;
    this.applyNow(s);
    return true;
  }

  /** ?frame=N - pin the whole engine for a deterministic screenshot. */
  freeze(frame: number): void {
    this.frozenAt = frame;
    for (const s of this.scopes.values()) {
      s.seek(frame);
      s.playing = false;
      s.invalidate();
      this.applyNow(s);
    }
  }

  /** A fixed-step accumulator: the DOM sees whole frames only, so a slow
   *  animation frame cannot smear an animation into a different shape. */
  tick(dtMs: number): number {
    if (this.frozenAt !== null) return 0;
    this.accumulator += Math.min(dtMs, 250); // a backgrounded tab must not fast-forward minutes
    let steps = 0;
    // FRAME_MS is 16.666..., so an exact multiple such as 100ms lands a hair
    // under six frames in binary floating point; the epsilon keeps whole
    // numbers of frames whole.
    while (this.accumulator + 1e-9 >= FRAME_MS) {
      this.accumulator -= FRAME_MS;
      this.step();
      steps++;
    }
    return steps;
  }

  /** Exactly one 60 Hz frame, for tests and for ?play. */
  step(): void {
    for (const s of this.scopes.values()) {
      if (!s.playing) continue;
      s.step();
      this.applyNow(s);
    }
    this.drainWaiters();
  }

  applyNow(s: TimelineScope): void {
    const delta = s.sampleChanged();
    if (delta.size) this.applies.get(s.id)?.(s, delta);
  }

  report(): {
    scopes: { id: string; tick: number; playing: boolean; range: string | null; state: string | null; entries: number; lastCue: string | null }[];
    playing: number; frozenAt: number | null;
  } {
    const scopes = this.all()
      .filter((s) => s.playing || s.tick !== 0 || s.range !== null)
      .map((s) => ({
        id: s.id, tick: s.tick, playing: s.playing,
        range: s.range ? s.range.join('..') : null,
        state: s.state, entries: s.entries, lastCue: s.lastCue,
      }));
    return { scopes, playing: this.all().filter((s) => s.playing).length, frozenAt: this.frozenAt };
  }
}
