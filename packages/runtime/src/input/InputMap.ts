// The 360 pad, over the Gamepad API and the keyboard.
//
// Nothing here is guessed about the PAD: the Gamepad API's "standard" mapping
// is a published layout and the 360 controller is the layout it was modelled
// on, so the indices below are DOCUMENTED. What IS inferred is the keyboard
// map (there was no keyboard) and the two auto-repeat constants.

export const Button = {
  A: 'A', B: 'B', X: 'X', Y: 'Y',
  LB: 'LB', RB: 'RB', LT: 'LT', RT: 'RT',
  Up: 'Up', Down: 'Down', Left: 'Left', Right: 'Right',
  Start: 'Start', Back: 'Back', Guide: 'Guide',
  LeftStick: 'LeftStick', RightStick: 'RightStick',
} as const;
export type Button = (typeof Button)[keyof typeof Button];

export const DPAD: readonly Button[] = [Button.Up, Button.Down, Button.Left, Button.Right];

/**
 * DOCUMENTED: the W3C Gamepad "standard" button order, which is the 360 pad's
 * own layout. Index -> our name.
 */
export const GAMEPAD_BUTTONS: Readonly<Record<number, Button>> = {
  0: Button.A, 1: Button.B, 2: Button.X, 3: Button.Y,
  4: Button.LB, 5: Button.RB, 6: Button.LT, 7: Button.RT,
  8: Button.Back, 9: Button.Start,
  10: Button.LeftStick, 11: Button.RightStick,
  12: Button.Up, 13: Button.Down, 14: Button.Left, 15: Button.Right,
  16: Button.Guide,
};

/**
 * INFERRED - the console had no keyboard, so this is a convention, not a fact.
 * Enter is A because it is the affirmative key everywhere else; Esc AND
 * Backspace are both B because both read as "back"; Tab is the Guide button.
 */
export const KEYBOARD: Readonly<Record<string, Button>> = {
  Enter: Button.A, NumpadEnter: Button.A,
  Escape: Button.B, Backspace: Button.B,
  KeyX: Button.X, KeyY: Button.Y,
  KeyQ: Button.LB, KeyE: Button.RB,
  BracketLeft: Button.LT, BracketRight: Button.RT,
  ArrowUp: Button.Up, ArrowDown: Button.Down, ArrowLeft: Button.Left, ArrowRight: Button.Right,
  KeyW: Button.Up, KeyS: Button.Down, KeyA: Button.Left, KeyD: Button.Right,
  Tab: Button.Guide,
  Space: Button.Start, ShiftLeft: Button.Back,
};

/**
 * INFERRED, and deliberately two named numbers so a measurement can replace
 * them. Held direction on a 360 dashboard scrolls after a pause and then
 * repeats steadily; these are the usual console values and are NOT taken from
 * the executable.
 */
export const DPAD_REPEAT_DELAY_MS = 400;
export const DPAD_REPEAT_INTERVAL_MS = 100;

/** INFERRED. Past this the left stick counts as a direction; below the lower
 *  figure it releases, so a stick resting near the edge cannot chatter. */
export const STICK_PRESS = 0.5;
export const STICK_RELEASE = 0.35;
/** DOCUMENTED (Gamepad API): a trigger is an analog button; anything past half
 *  travel is a press on the 360. */
export const TRIGGER_PRESS = 0.5;

export type ButtonHandler = (b: Button, repeat: boolean) => void;

/** One layer of the focus stack: the scene or dialog that owns presses. */
export interface InputLayer {
  id: string;
  onButton: ButtonHandler;
  /** A layer that does not consume a button lets it fall to the layer below. */
  consumes?: (b: Button) => boolean;
}

/**
 * Reads the pad and the keyboard, merges them, and hands each press to the
 * TOP layer of the focus stack. Only one scene owns a press, which is what
 * stops a blade behind a dialog from moving.
 */
export class InputRouter {
  private readonly stack: InputLayer[] = [];
  private readonly held = new Map<Button, { since: number; next: number }>();
  private readonly keys = new Set<Button>();
  private readonly pad = new Set<Button>();
  private raf = 0;
  /** Every press seen, newest last. The smoke suites read this. */
  readonly log: { button: Button; repeat: boolean; layer: string | null; t: number }[] = [];

  constructor(private readonly now: () => number = () => performance.now()) {}

  push(layer: InputLayer): void { this.stack.push(layer); }
  pop(id?: string): void {
    if (id === undefined) this.stack.pop();
    else { const i = this.stack.findIndex((l) => l.id === id); if (i >= 0) this.stack.splice(i, 1); }
  }
  get top(): InputLayer | undefined { return this.stack[this.stack.length - 1]; }
  get layers(): string[] { return this.stack.map((l) => l.id); }

  attach(target: EventTarget = window): () => void {
    const down = (e: Event) => {
      const b = KEYBOARD[(e as KeyboardEvent).code];
      if (!b) return;
      e.preventDefault();
      if (!this.keys.has(b)) { this.keys.add(b); this.begin(b); }
    };
    const up = (e: Event) => {
      const b = KEYBOARD[(e as KeyboardEvent).code];
      if (!b) return;
      this.keys.delete(b);
      if (!this.pad.has(b)) this.end(b);
    };
    target.addEventListener('keydown', down);
    target.addEventListener('keyup', up);
    const loop = () => { this.pollPad(); this.pumpRepeats(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
    return () => {
      target.removeEventListener('keydown', down);
      target.removeEventListener('keyup', up);
      cancelAnimationFrame(this.raf);
    };
  }

  /** The test hook: exactly one press, as if the pad had sent it. */
  press(b: Button, repeat = false): boolean {
    return this.dispatch(b, repeat);
  }

  private begin(b: Button): void {
    const t = this.now();
    this.dispatch(b, false);
    // Only a direction auto-repeats: holding A must not fire A twice.
    if (DPAD.includes(b)) this.held.set(b, { since: t, next: t + DPAD_REPEAT_DELAY_MS });
  }
  private end(b: Button): void { this.held.delete(b); }

  private pumpRepeats(): void {
    const t = this.now();
    for (const [b, s] of this.held) {
      while (t >= s.next) { this.dispatch(b, true); s.next += DPAD_REPEAT_INTERVAL_MS; }
    }
  }

  private pollPad(): void {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    const now = new Set<Button>();
    for (const p of pads) {
      if (!p) continue;
      p.buttons.forEach((btn, i) => {
        const name = GAMEPAD_BUTTONS[i];
        if (!name) return;
        const on = name === Button.LT || name === Button.RT ? btn.value >= TRIGGER_PRESS : btn.pressed;
        if (on) now.add(name);
      });
      // The left stick reads as the d-pad, with a release threshold below the
      // press threshold so a stick held near the edge cannot chatter.
      const [ax = 0, ay = 0] = p.axes;
      const axis = (v: number, pos: Button, neg: Button) => {
        if (v >= STICK_PRESS) now.add(pos);
        else if (v <= -STICK_PRESS) now.add(neg);
        else if (Math.abs(v) > STICK_RELEASE) { if (this.pad.has(pos)) now.add(pos); if (this.pad.has(neg)) now.add(neg); }
      };
      axis(ax, Button.Right, Button.Left);
      axis(ay, Button.Down, Button.Up);
    }
    for (const b of now) if (!this.pad.has(b)) { this.pad.add(b); if (!this.keys.has(b)) this.begin(b); }
    for (const b of [...this.pad]) if (!now.has(b)) { this.pad.delete(b); if (!this.keys.has(b)) this.end(b); }
  }

  private dispatch(b: Button, repeat: boolean): boolean {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const l = this.stack[i]!;
      if (l.consumes && !l.consumes(b)) continue;
      this.log.push({ button: b, repeat, layer: l.id, t: this.now() });
      if (this.log.length > 200) this.log.shift();
      l.onButton(b, repeat);
      return true;
    }
    this.log.push({ button: b, repeat, layer: null, t: this.now() });
    if (this.log.length > 200) this.log.shift();
    return false;
  }
}
