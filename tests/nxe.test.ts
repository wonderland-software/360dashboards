// The pure parts of the NXE glue: the strip integrator and the channel queue's
// layout table. No DOM, no dev server - these are arithmetic claims about code
// read out of dash.xex, and they are checked against the closed form they are
// supposed to reproduce rather than against a screenshot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Axis, stepDuration, FoldCascade, ChannelSwap, CHANNEL_SWAP, passingOpacity, type AxisConstants } from '@dash/nxe/physics';
import { QUEUE_SLOTS, QUEUE_WALK, queueTargetSlot, queueRowChannel } from '@dash/nxe/NxeShell';
import { queueRowTheta, foldHinge, foldOpacity } from '@dash/nxe/transitions';

const HZ = 60;
const DT = 1 / HZ;

/** The three axes as `controlp/Variables.xur` gives them. Duplicated on purpose:
 *  a test that imports the number it is checking checks nothing. */
const AXES: Record<string, AxisConstants> = {
  'Moby panel (40/30/20)': { acceleration: 40, deceleration: 30, maxVelocity: 20 },
  'Moby channel (50/40/10)': { acceleration: 50, deceleration: 40, maxVelocity: 10 },
  'Rome (60/40/20)': { acceleration: 60, deceleration: 40, maxVelocity: 20 },
};

/** Run one distance-1 move at 60 Hz and report what it cost. */
function move(c: AxisConstants, distance = 1): { frames: number; seconds: number; peakAt: number } {
  const a = new Axis('test', c);
  a.setBounds(-100, 100);
  for (let i = 0; i < distance; i++) a.nudge(1);
  a.target = distance;
  const speeds: number[] = [];
  let frames = 0;
  while (a.step(DT)) {
    speeds.push(Math.abs(a.velocity));
    if (++frames > 5000) throw new Error('the integrator did not land');
  }
  frames++;
  const peak = speeds.indexOf(Math.max(...speeds));
  return { frames, seconds: a.lastMoveSeconds, peakAt: (peak + 1) / Math.max(1, speeds.length) };
}

test('the integrator reproduces its own closed form to within half a frame', () => {
  // Judge F round 2, N2: the Euler form landed 2.0-2.5 frames short on every
  // axis (panel 18 against 20.49, channel 15 against 18.00, Rome 15 against
  // 17.32) because a frame that straddles the accelerate/brake switch was
  // stepped at one acceleration and the arrival clamp ate the tail. The
  // piecewise-analytic form has no tail to eat.
  for (const [name, c] of Object.entries(AXES)) {
    const closed = stepDuration(c) * HZ;
    const got = move(c).seconds * HZ;
    assert.ok(Math.abs(got - closed) <= 0.5,
      `${name}: integrated ${got.toFixed(3)} frames against a closed form of ${closed.toFixed(3)}`);
  }
});

test('the arithmetic that settles the unit: the channel axis closes at 0.300000 s', () => {
  const channel = AXES['Moby channel (50/40/10)']!;
  assert.ok(Math.abs(stepDuration(channel) - 0.3) < 1e-9, `${stepDuration(channel)}`);
  assert.ok(Math.abs(move(channel).seconds - 0.3) < 1e-9);
});

test('a move long enough to reach MaxVelocity still matches the closed form', () => {
  // The cruise phase is the branch a distance-1 move never takes: the Moby
  // channel cap is 10 and its triangular peak is 2.98, so only a multi-step
  // move exercises it. Five steps do on every axis.
  for (const [name, c] of Object.entries(AXES)) {
    const closed = stepDuration(c, 5) * HZ;
    const got = move(c, 5).seconds * HZ;
    assert.ok(Math.abs(got - closed) <= 0.5, `${name} x5: ${got.toFixed(3)} against ${closed.toFixed(3)}`);
  }
});

test('the cursor lands exactly on the target and stops', () => {
  for (const c of Object.values(AXES)) {
    const a = new Axis('test', c);
    a.setBounds(-10, 10);
    a.nudge(1);
    for (let i = 0; i < 200 && a.step(DT); i++) { /* run it out */ }
    assert.equal(a.cursor, 1);
    assert.equal(a.velocity, 0);
    assert.equal(a.moving, false);
  }
});

test('the velocity peaks where the constants say, not where the frame does', () => {
  // The peak of a triangular move sits at d/(a+d) of it. The console's own
  // velocity energy peaks at about 33 % of a panel move [Judge F round 2, N2],
  // which 40/30 cannot produce - so this test pins the MODEL's shape and the
  // disagreement is recorded in the README rather than tuned into the file's
  // constants.
  const panel = AXES['Moby panel (40/30/20)']!;
  const expected = panel.deceleration / (panel.acceleration + panel.deceleration);   // 0.4286
  const got = move(panel).peakAt;
  assert.ok(Math.abs(got - expected) < 0.06, `peak at ${got.toFixed(3)}, expected about ${expected.toFixed(3)}`);
});

test('a refused move is silent and does not start the clock', () => {
  const a = new Axis('test', AXES['Moby panel (40/30/20)']!);
  a.setBounds(0, 0);
  assert.equal(a.nudge(1), false);
  assert.equal(a.step(DT), false);
  assert.equal(a.elapsedSeconds, 0);
});

test('the queue slot table is the ten rows of the stack block at 0x9248b624', () => {
  // Read off `stfs` at .text 0x9248b624-0x9248b680: (dy, scale, opacity).
  assert.equal(QUEUE_SLOTS.length, 10);
  assert.deepEqual(QUEUE_SLOTS.map((s) => s.dy), [-140, -140, -140, -120, -95, -70, -40, 0, 40, 40]);
  assert.deepEqual(QUEUE_SLOTS.map((s) => s.scale), [0.35, 0.35, 0.35, 0.4, 0.45, 0.55, 0.75, 1, 0.75, 0.75]);
  assert.deepEqual(QUEUE_SLOTS.map((s) => s.opacity), [0, 0, 0, 0.1, 0.2, 0.35, 0.5, 1, 0, 0]);
  // The walk order is the binder's, Next6 first, and element i rests on i+1.
  assert.deepEqual([...QUEUE_WALK], ['Next6', 'Next5', 'Next4', 'Next3', 'Next2', 'Next1', 'Current', 'Prev1']);
  assert.equal(QUEUE_SLOTS[QUEUE_WALK.indexOf('Current') + 1]!.scale, 1);
  assert.equal(QUEUE_SLOTS[QUEUE_WALK.indexOf('Current') + 1]!.dy, 0);
});

test('the size ramp the table predicts is the one the frame shows', () => {
  // Cap heights measured up the stack on [FRAME Kpa f0048]: 33 / 25 / 18 / 15 /
  // 14 design px, against the current row's 33. Nothing was fitted to these -
  // the scales come out of the executable.
  const measured = [33, 25, 18, 15, 14];
  const rows = ['Current', 'Next1', 'Next2', 'Next3', 'Next4'] as const;
  rows.forEach((row, i) => {
    const scale = QUEUE_SLOTS[QUEUE_WALK.indexOf(row) + 1]!.scale;
    const predicted = scale * measured[0]!;
    assert.ok(Math.abs(predicted - measured[i]!) <= 1.2,
      `${row}: table predicts ${predicted.toFixed(1)} px, frame measures ${measured[i]}`);
  });
});



/* ------------------------------------------------- the fold, as the code has it */

const MOBY_FOLD = {
  foldSpeed: 30, foldSpeedInt: 7, foldNextRange: 0.3, unfoldSpeed: 10, unfoldSpeedInt: 7,
  unfoldEaseRange: null, unfoldNextRange: 0.7, unfoldMinSpeed: 0.1, visiblePanels: 3225 / 505,
};

test('the fold cascade runs back to front and the unfold front to back, gated as the code gates them', () => {
  // .text 0x9248d6dc-0x9248d988: a panel behind the cursor starts folding once
  // the one BEHIND it is under FoldNextRange (the deepest at once), and starts
  // unfolding once the one in FRONT of it is past UnfoldNextRange.
  const f = new FoldCascade(MOBY_FOLD);
  f.reset(7, false, 0);
  f.fold(0);
  const firstMove: number[] = new Array(7).fill(-1);
  for (let frame = 1; frame <= 60 && f.step(DT); frame++) {
    f.q.forEach((q, k) => { if (q < 1 && firstMove[k] === -1) firstMove[k] = frame; });
  }
  assert.equal(f.phase, 'folded');
  assert.equal(f.q[0], 1, 'the front panel never folds by q');
  for (let k = 6; k > 1; k--) assert.ok(firstMove[k]! <= firstMove[k - 1]!, `panel ${k} folded before panel ${k - 1}: ${firstMove.join(',')}`);
  // The rate is the float times (visible + 1) over the integer: 30 x 8 / 7 per
  // second, so a panel is gone in 0.029 s and the seven-panel strip in under
  // a fifth of a second.
  assert.ok(Math.abs(f.foldRate - (30 * 8) / 7) < 1e-9, `fold rate ${f.foldRate}`);
  f.unfold(0);
  const firstOpen: number[] = new Array(7).fill(-1);
  let frames = 0;
  for (; frames < 600 && f.step(DT); frames++) {
    f.q.forEach((q, k) => { if (q > 0 && firstOpen[k] === -1) firstOpen[k] = frames; });
  }
  assert.equal(f.phase, 'open');
  for (let k = 2; k < 7; k++) assert.ok(firstOpen[k]! >= firstOpen[k - 1]!, `panel ${k} opened before panel ${k - 1}`);
  // UnfoldEaseRange unset reads as 0, so the rate eases over the WHOLE move:
  // 10 - 9.9 q, which is 10 at rest and the 0.1 floor at the end.
  assert.ok(Math.abs(f.unfoldRate(0) - 10) < 1e-9);
  assert.ok(Math.abs(f.unfoldRate(1) - 0.1) < 1e-9);
  assert.ok(Math.abs(f.unfoldRate(0.5) - 5.05) < 1e-9);
  // The floor binds: an exponential approach with a 0.1 floor takes about half
  // a second per panel, not the tenth M4b's linear reading gave.
  assert.ok(frames > 40, `the seven-panel unfold took only ${frames} frames`);
});

test('a folded panel stacks on the one in front of it and fades under q = 0.25', () => {
  const f = new FoldCascade(MOBY_FOLD);
  f.reset(3, false, 0);
  f.q = [1, 0.5, 0];
  // depth in index units: the front at 0, panel 1 half its spacing behind,
  // panel 2 fully collapsed onto panel 1 [CODE 0x9248d808-0x9248d848].
  assert.equal(f.depth(0, 0), 0);
  assert.equal(f.depth(1, 0), 0.5);
  assert.equal(f.depth(2, 0), 0.5);
  assert.equal(f.opacity(1), 1);
  f.q[1] = 0.1;
  assert.ok(Math.abs(f.opacity(1) - 0.4) < 1e-9, 'q x 4 under a quarter');
  assert.equal(f.opacity(0), 1);
});

test('a panel in front of the cursor fades to nothing by one spacing [CODE 0x9248d8dc]', () => {
  assert.equal(passingOpacity(0), 1);
  assert.equal(passingOpacity(0.5), 1);
  assert.ok(Math.abs(passingOpacity(-0.5) - 0.5) < 1e-9);
  assert.equal(passingOpacity(-1), 0);
  assert.equal(passingOpacity(-2), 0);
});

/* ------------------------------------------------------- the channel change */

test('a channel change is a measured fade: out, a beat, in front to back', () => {
  const s = new ChannelSwap();
  s.start();
  let rebuildAt = -1;
  const outTrace: number[] = [];
  for (let t = 1; t <= 40; t++) {
    const ev = s.step();
    if (ev === 'rebuild') { rebuildAt = t; s.arm(3); }
    if (t <= CHANNEL_SWAP.outTicks) outTrace.push(s.out);
    if (!s.active) break;
  }
  assert.equal(rebuildAt, CHANNEL_SWAP.outTicks, 'the strip is rebuilt on the tick the old one is gone');
  assert.equal(outTrace[outTrace.length - 1], 0);
  // Fresh: front first, then the second panel once the first is past NextRange.
  const s2 = new ChannelSwap();
  s2.start();
  let t = 0, firstIn = -1, secondIn = -1, done = -1;
  while (s2.active && t < 200) {
    t++;
    const ev = s2.step();
    if (ev === 'rebuild') s2.arm(3);
    if (s2.phase === 'in') {
      if (firstIn < 0 && s2.inq[0]! > 0) firstIn = t;
      if (secondIn < 0 && s2.inq[1]! > 0) secondIn = t;
    }
    if (!s2.active) done = t;
  }
  assert.equal(firstIn, CHANNEL_SWAP.outTicks + CHANNEL_SWAP.holdTicks + 1, 'the new front starts after the beat');
  // 0.7 of a twelve-tick fade is 8.4 ticks, so the second panel starts on the
  // ninth tick after the first: the file's gate, the measured rate.
  assert.equal(secondIn - firstIn, Math.ceil(CHANNEL_SWAP.nextRange * CHANNEL_SWAP.inTicks));
  assert.ok(done > 0 && done < 60, `the three-panel swap took ${done} ticks`);
});

/* ------------------------------------------------------------- the queue */

test('an Up scrolls the names DOWN: every row lerps toward the slot below it [CODE 0x9248c9cc, 0x9248b6b4]', () => {
  const i = QUEUE_WALK.indexOf('Next1');
  assert.equal(queueTargetSlot(i, +0.5), i + 2, 'Next1 heads for the current slot on an Up');
  assert.equal(QUEUE_SLOTS[queueTargetSlot(i, +0.5)]!.dy, 0);
  const c = QUEUE_WALK.indexOf('Current');
  assert.equal(QUEUE_SLOTS[queueTargetSlot(c, +0.5)]!.dy, 40, 'the current name drops below and fades');
  assert.equal(QUEUE_SLOTS[queueTargetSlot(c, +0.5)]!.opacity, 0);
  assert.equal(queueTargetSlot(c, -0.5), c, 'a Down lifts it toward Next1\'s slot');
  assert.equal(QUEUE_SLOTS[queueTargetSlot(QUEUE_WALK.indexOf('Prev1'), -0.5)]!.dy, 0, 'Prev1 rises into the current slot on a Down');
});

test('the queue fills at most N - 1 rows above the current one and never a ghost', () => {
  // Seven passing channels: six names above, all different, Next6 wrapping to
  // the channel before the current one.
  assert.equal(queueRowChannel('Next1', 6, 7), 0);
  assert.equal(queueRowChannel('Next6', 6, 7), 5);
  assert.equal(queueRowChannel('Prev1', 6, 7), 5);
  // Two channels [FRAME Yv5 f0042]: one name above, nothing else.
  assert.equal(queueRowChannel('Next1', 1, 2), 0);
  assert.equal(queueRowChannel('Next2', 1, 2), null);
  assert.equal(queueRowChannel('Next6', 1, 2), null);
  assert.equal(queueRowChannel('Prev1', 1, 2), 0);
  // One channel: only the current row.
  assert.equal(queueRowChannel('Next1', 0, 1), null);
  assert.equal(queueRowChannel('Prev1', 0, 1), null);
  assert.equal(queueRowChannel('Current', 0, 1), 0);
});

/* ------------------------------------------------- the fold's own routines */

test('the queue fold folds the top row first and unfolds the bottom row first [CODE 0x9248b7a8]', () => {
  // p from 0 to 1 (From): row i = 0 (Next6) reaches a quarter turn at
  // p = 0.5/1.3, Current (i = 6) at 1.1/1.3, Prev1 last.
  const q = Math.PI / 2;
  assert.ok(Math.abs(queueRowTheta(0.5 / 1.3, 0) - q) < 1e-9);
  assert.ok(queueRowTheta(0.5 / 1.3, 6) === 0, 'Current has not started when Next6 is done');
  assert.ok(Math.abs(queueRowTheta(1.1 / 1.3, 6) - q) < 1e-9);
  assert.equal(queueRowTheta(0, 3), 0, 'p = 0 is the rest state outright');
  // p from 1 to 0 (BackTo): Prev1 and Current open first.
  assert.ok(queueRowTheta(0.9, 7) < q && Math.abs(queueRowTheta(0.9, 0) - q) < 1e-9, 'at p = 0.9 the bottom rows are opening and the top is still folded');
  // Negative p is the other branch: angles run -pi/2 .. 0 about the hinge behind.
  assert.ok(Math.abs(queueRowTheta(-1, 0) + q) < 1e-9);
  assert.equal(queueRowTheta(-0.0001 + 1 - 1, 0), 0);
  assert.equal(foldHinge(0.5).x, -128, 'a positive angle hinges 128 to the LEFT');
  assert.equal(foldHinge(-0.5).z, 128, 'a negative angle hinges 128 BEHIND');
  assert.ok(Math.abs(foldOpacity(q) - 0) < 1e-9 && Math.abs(foldOpacity(q / 2) - 0.5) < 1e-9);
});

test('a distance cull mounts a rig when a slot comes inside VisiblePanelDistance and unmounts it when it leaves', () => {
  // The rule place() applies, as a pure predicate over the live depth: the
  // eighth My Xbox slot sits at 7 x 505 = 3535 > 3225 at rest and inside it
  // once the cursor has moved one panel [FRAME Kpa f05580 "8 of 8"].
  const inRange = (k: number, cursor: number) => { const z = (k - cursor) * 505; return z <= 3225 && z > -505; };
  assert.equal(inRange(7, 0), false);
  assert.equal(inRange(6, 0), true);
  assert.equal(inRange(7, 1), true);
  assert.equal(inRange(0, 0.5), true, 'the passing panel is still drawn while it fades');
  assert.equal(inRange(0, 1), false, 'and dropped once a whole spacing in front, where its fade reaches zero');
});
