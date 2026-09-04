// Touch, mapped onto the pad.
//
// A dashboard is a pad UI. On a phone there is no pad, so this module turns
// finger gestures into the SAME `Button` values the Gamepad API and the
// keyboard send, and hands them to the same `InputRouter`. Nothing downstream
// knows a finger was involved: the shells, the focus chains, the cues and every
// gate stay exactly as they are, and no on-screen control is invented.
//
// The mapping, and why each one:
//
//   tap on a focusable row/tab   walk the pad's focus to it (the d-pad presses
//                                the walk needs are real presses, so the row's
//                                own Focus range and btn_Focus cue play)
//   tap on the focused row       A. Two taps to commit is deliberate: a finger
//                                is 40 px wide and a mis-tap that fires A is a
//                                page you did not ask for.
//   horizontal swipe             the blade / channel axis
//   vertical swipe               move focus one row
//   two-finger tap               B
//   swipe in from the right edge B
//
// The one thing this module owns beyond the router is the CLICK it must not
// let happen. A browser synthesizes a `click` from a tap, so a tap that this
// module already turned into a press would fire the launcher's own click
// handler a second time. A handled tap therefore calls `preventDefault()` on
// its `touchend` AND swallows any click that arrives in the next
// `CLICK_SUPPRESS_MS`, because the two mechanisms fail on different browsers.
import { Button, type InputRouter } from './InputMap';

/** INFERRED, all four: there is no console measurement for a gesture the
 *  console never received. They are the usual platform values. */
export const TAP_MS = 500;
export const TAP_SLOP_PX = 12;
export const SWIPE_MIN_PX = 44;
/** How close to the right edge a swipe must start to read as B. */
export const EDGE_PX = 32;
/** How long after a handled tap a synthesized click is still swallowed. */
export const CLICK_SUPPRESS_MS = 700;
/** A tap never walks the focus further than this, so a mis-tap on a scene with
 *  no reachable target cannot run away down a list. */
export const WALK_MAX = 24;

/** What a tap did: moved the focus onto what was tapped, pressed what was
 *  already focused, or landed on nothing that takes focus. */
export type TapResult = 'focus' | 'press' | false;

/** One gesture, as it was read. Recorded so a suite can assert on the gesture
 *  and not only on what it happened to move. */
export interface TouchGesture {
  gesture: 'tap-focus' | 'tap-press' | 'two-finger' | 'edge-back' | 'swipe-left' | 'swipe-right' | 'swipe-up' | 'swipe-down';
  button: string | null;
}

export interface TouchOptions {
  /** The element gestures are read from. */
  target: HTMLElement;
  /**
   * A single-finger tap at client coordinates (x, y). Anything but `false`
   * counts as handled, which is also what tells this module to swallow the
   * click the browser would synthesize from that tap.
   */
  tap?: (x: number, y: number) => TapResult;
  /** What a horizontal swipe sends. `left` is a swipe whose finger travels
   *  left, i.e. "show me the next thing". */
  swipeX?: { left: Button; right: Button } | null;
  /** What a vertical swipe sends. `up` is a finger travelling up. */
  swipeY?: { up: Button; down: Button } | null;
  /** The back button, for a two-finger tap and a swipe in from the right edge.
   *  Null on a page with nothing to go back to. */
  back?: Button | null;
  /** Where to record each gesture, newest last. `window.__dash.touch` is what
   *  the app passes, so a suite can assert on the GESTURE and not only on what
   *  it happened to move. */
  log?: { gesture: string; button: string | null }[];
}

/**
 * Read `target`'s touches and drive `router` with them. Returns the detach
 * function, the way `InputRouter.attach()` does; call it from the same disposer
 * that detaches the router.
 */
export function attachTouch(router: InputRouter, opts: TouchOptions): () => void {
  const { target } = opts;
  let startX = 0, startY = 0, startT = 0;
  /** The most fingers that were down at once during this gesture. */
  let fingers = 0;
  /**
   * Where each finger of this gesture went down, by identifier, and the
   * furthest any of them has travelled from its own start.
   *
   * Per finger, because a two-finger tap is two fingers 40 px apart and
   * measuring the SECOND one's release against the FIRST one's start reads as
   * a 40 px drag - which is how the two-finger tap silently stopped working
   * the first time (measured: the gesture was thrown away as "moved").
   */
  const starts = new Map<number, { x: number; y: number }>();
  let maxMove = 0;
  /** A swipe fires once, on the move that crosses the threshold. */
  let fired = false;
  let tracking = false;
  let suppressClicksUntil = 0;

  /** Grow `maxMove` by every touch in the list, against its own start. */
  const measure = (list: { identifier: number; clientX: number; clientY: number }[]) => {
    for (const t of list) {
      const s = starts.get(t.identifier);
      if (s) maxMove = Math.max(maxMove, Math.hypot(t.clientX - s.x, t.clientY - s.y));
    }
  };

  const note = (gesture: TouchGesture['gesture'], button: Button | null) => {
    if (opts.log) {
      opts.log.push({ gesture, button });
      if (opts.log.length > 40) opts.log.shift();
    }
    if (button) router.press(button);
  };

  const onStart = (ev: Event) => {
    const e = ev as globalThis.TouchEvent;
    fingers = Math.max(fingers, e.touches.length);
    for (const t of Array.from(e.changedTouches)) {
      if (!starts.has(t.identifier)) starts.set(t.identifier, { x: t.clientX, y: t.clientY });
    }
    if (tracking) return;
    const t = e.touches[0];
    if (!t) return;
    tracking = true;
    fired = false;
    maxMove = 0;
    startX = t.clientX;
    startY = t.clientY;
    startT = Date.now();
  };

  const onMove = (ev: Event) => {
    const e = ev as globalThis.TouchEvent;
    if (!tracking) return;
    measure(Array.from(e.touches));
    if (fired) return;
    const t = e.touches[0];
    if (!t) return;
    const dx = t.clientX - startX;
    const dy = t.clientY - startY;
    if (Math.abs(dx) < SWIPE_MIN_PX && Math.abs(dy) < SWIPE_MIN_PX) return;
    fired = true;
    // A swipe that STARTED against the right edge and travelled left is the
    // platform's back gesture, not a move along the horizontal axis.
    const rect = target.getBoundingClientRect();
    const fromRightEdge = startX >= rect.right - EDGE_PX;
    if (fromRightEdge && dx <= -SWIPE_MIN_PX && Math.abs(dx) >= Math.abs(dy)) {
      note('edge-back', opts.back ?? null);
      return;
    }
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (!opts.swipeX) return;
      if (dx < 0) note('swipe-left', opts.swipeX.left);
      else note('swipe-right', opts.swipeX.right);
    } else {
      if (!opts.swipeY) return;
      if (dy < 0) note('swipe-up', opts.swipeY.up);
      else note('swipe-down', opts.swipeY.down);
    }
  };

  const onEnd = (ev: Event) => {
    const e = ev as globalThis.TouchEvent;
    measure(Array.from(e.changedTouches));
    // Wait for the last finger: a two-finger tap raises touchend twice.
    if (e.touches.length > 0) return;
    const wasTracking = tracking;
    const many = fingers;
    const moved = maxMove;
    tracking = false;
    fingers = 0;
    starts.clear();
    if (!wasTracking || fired) return;

    const t = e.changedTouches[0];
    if (!t) return;
    if (moved > TAP_SLOP_PX || Date.now() - startT > TAP_MS) return;

    if (many >= 2) {
      note('two-finger', opts.back ?? null);
      swallow(e);
      return;
    }
    if (!opts.tap) return;
    const did = opts.tap(t.clientX, t.clientY);
    if (did) {
      note(did === 'press' ? 'tap-press' : 'tap-focus', null);
      swallow(e);
    }
  };

  /** Stop the click the browser would build out of this tap. */
  const swallow = (e: Event) => {
    if (e.cancelable) e.preventDefault();
    suppressClicksUntil = Date.now() + CLICK_SUPPRESS_MS;
  };

  const onClick = (e: Event) => {
    if (Date.now() > suppressClicksUntil) return;
    suppressClicksUntil = 0;
    e.stopPropagation();
    e.preventDefault();
  };

  const onCancel = () => { tracking = false; fingers = 0; fired = false; maxMove = 0; starts.clear(); };

  target.addEventListener('touchstart', onStart, { passive: true });
  target.addEventListener('touchmove', onMove, { passive: true });
  target.addEventListener('touchend', onEnd, { passive: false });
  target.addEventListener('touchcancel', onCancel, { passive: true });
  // Capture, so it runs before the listener it is protecting.
  target.addEventListener('click', onClick, true);

  return () => {
    target.removeEventListener('touchstart', onStart);
    target.removeEventListener('touchmove', onMove);
    target.removeEventListener('touchend', onEnd);
    target.removeEventListener('touchcancel', onCancel);
    target.removeEventListener('click', onClick, true);
  };
}

/* ---------------------------------------------------------------- hit tests */

/**
 * Every element under a point, topmost first, each followed by its ancestors.
 *
 * `elementFromPoint` (singular) is not enough, and the reason is the scene data
 * itself: a XUI group's box is its authored rectangle whether or not it paints
 * anything there, so the Blades metapane's `highlight1` sits transparently over
 * the nav list and swallows every hit. Measured on the System blade: a tap on
 * `navNetwork` returned `metaPanelScene`, so the row the finger was plainly on
 * was invisible to a single-element hit test. `elementsFromPoint` (plural)
 * returns the whole stack, which contains the row.
 */
export function elementsAt(x: number, y: number): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const hit of document.elementsFromPoint(x, y)) {
    let el = hit as HTMLElement | null;
    while (el && !out.includes(el)) { out.push(el); el = el.parentElement; }
  }
  return out;
}

/** The `data-xui-id` chain under a point, deepest first. Every element the
 *  renderer makes carries one, so this is how a finger names a control. */
export function xuiIdsAt(x: number, y: number): string[] {
  return xuiHitsAt(x, y).map((h) => h.id);
}

/** The same chain, with each element's XUI class, so the caller can keep the
 *  CONTROLS and drop the groups and figures a finger also lands on. */
export function xuiHitsAt(x: number, y: number): { id: string; className: string }[] {
  const out: { id: string; className: string }[] = [];
  for (const el of elementsAt(x, y)) {
    const id = el.dataset?.['xuiId'];
    const className = el.dataset?.['xuiClass'];
    if (id && className && !out.some((h) => h.id === id)) out.push({ id, className });
  }
  return out;
}

/**
 * The element that currently has focus.
 *
 * An Id is NOT unique in the document (LEARNINGS, "Rendering (DOM)"): a dozen
 * scenes carry `legend_a`. Take the LAST drawn copy, which is the one on the
 * scene that was pushed most recently.
 */
export function elementForId(id: string | null): HTMLElement | null {
  if (!id) return null;
  let found: HTMLElement | null = null;
  for (const el of document.querySelectorAll<HTMLElement>(`[data-xui-id="${cssEscape(id)}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) found = el;
  }
  return found;
}

function cssEscape(s: string): string {
  const esc = (globalThis as { CSS?: { escape?: (v: string) => string } }).CSS?.escape;
  return esc ? esc(s) : s.replace(/["\\]/g, '\\$&');
}

/* -------------------------------------------------------------- the focus walk */

export interface WalkOptions {
  /** The tap point, in client coordinates. */
  x: number;
  y: number;
  /** The `data-xui-id` chain the tap landed on, deepest first. */
  ids: string[];
  /** The focused control's Id, read fresh on every step. */
  focusId: () => string | null;
  /** Send one pad button. */
  press: (b: Button) => void;
  /** The Ids this scene can focus, when the shell knows them. A tap on
   *  anything else is not a row and is left alone. */
  rows?: readonly string[];
  max?: number;
}

/**
 * What one tap does about focus.
 *
 * The tap is on the focused row      -> A.
 * The tap is on another focusable row -> walk the pad's focus to it with real
 *                                        Up/Down presses, which is what makes
 *                                        the row's Focus range and its cue play.
 * The tap is on neither               -> nothing.
 *
 * The direction comes from geometry (is the tapped row above or below the
 * focused one), not from a row index: `navRows` is document order over every
 * mounted scene, and the NavUp/NavDown chain is the scene's own.
 */
export function tapFocus(o: WalkOptions): 'pressed' | 'moved' | null {
  const cur = o.focusId();
  if (cur && o.ids.includes(cur)) { o.press(Button.A); return 'pressed'; }
  if (o.rows && !o.ids.some((id) => o.rows!.includes(id))) return null;

  const from = elementForId(cur);
  const dir: Button = from && o.y < from.getBoundingClientRect().top ? Button.Up : Button.Down;
  let last = cur;
  for (let i = 0; i < (o.max ?? WALK_MAX); i++) {
    o.press(dir);
    const now = o.focusId();
    if (now && o.ids.includes(now)) return 'moved';
    // The chain clamped: pressing again would only re-fire the same row.
    if (now === last) return last === cur ? null : 'moved';
    last = now;
  }
  return last === cur ? null : 'moved';
}
