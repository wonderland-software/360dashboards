// The pure parts of the NXE glue: the strip integrator and the channel queue's
// layout table. No DOM, no dev server - these are arithmetic claims about code
// read out of dash.xex, and they are checked against the closed form they are
// supposed to reproduce rather than against a screenshot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Axis, stepDuration, FoldCascade, ChannelSwap, CHANNEL_SWAP, passingOpacity, type AxisConstants } from '@dash/nxe/physics';
import { QUEUE_SLOTS, QUEUE_WALK, queueTargetSlot, queueRowChannel, LEGEND_HIDE_FRAME, LEGEND_SHOW_FRAME } from '@dash/nxe/NxeShell';
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

/* ------------------------------------------- M4e: the 9199 code lists */

import { existsSync, readFileSync } from 'node:fs';
import {
  LANGUAGE_LABELS_9199, LANGUAGE_LABELS_VA_9199, LANGUAGE_GROUPS_9199, LANGUAGE_GROUPS_VA_9199, LANGUAGE_GROUP_STRIDE_9199, LANGUAGE_ROWS_9199,
  COUNTRY_ROWS_9199, COUNTRY_TABLE_VA_9199, COUNTRY_COUNT_VA_9199,
  TIMEZONE_LABELS_9199, TIMEZONE_TABLE_VA_9199, TIMEZONE_RECORD_SIZE_9199,
  REMOTE_ROWS_9199, REMOTE_BASE_9199, REMOTE_COUNT_9199, HINT_ROWS_9199, HINT_TABLE_VA_9199,
  DISPLAY_ROWS_9199, DISPLAY_TABLE_VA_9199, CODE_LISTS_9199,
  AV_PACK_9199, CODE_VISIBILITY_9199, CODE_LINES_9199,
} from '@dash/nxe/codeLists9199';
import { EPIX_COMMANDS, ROOT_STRIPS, resolveScenePath, SIGNIN_LEGEND } from '@dash/nxe/navigation';
import { collectPageRows, isAuthoringToken, findPressKey, PRESS_KEYS } from '@dash/nxe/pageFocus';
import type { XuObject } from '@xur/index';

const IMAGE = 'extracted/9199/basefile.exe';
const BASE = 0x92000000;
const image = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const u32 = (va: number) => image!.readUInt32BE(va - BASE);
const u16 = (va: number) => image!.readUInt16BE(va - BASE);

test('the 9199 code lists have the shape the image gives them', () => {
  assert.equal(LANGUAGE_LABELS_9199.length, 13);
  assert.equal(LANGUAGE_GROUPS_9199.length, 5);
  assert.ok(LANGUAGE_GROUPS_9199.every((g) => g.length <= LANGUAGE_GROUP_STRIDE_9199 - 1));
  assert.equal(LANGUAGE_ROWS_9199.length, 12);
  assert.equal(LANGUAGE_ROWS_9199[0]!.label, 168, 'group 0 starts on English');
  assert.equal(COUNTRY_ROWS_9199.length, 37);
  assert.equal(TIMEZONE_LABELS_9199.length, 65);
  assert.deepEqual(REMOTE_ROWS_9199.map((r) => r.label), [273, 274]);
  assert.deepEqual(HINT_ROWS_9199, [433, 434, 435, 436, 437]);
  assert.equal(DISPLAY_ROWS_9199.length, 7);
  // Every 9199 index is inside the 621-entry table, and no two rows share one.
  const all = [...LANGUAGE_LABELS_9199, ...COUNTRY_ROWS_9199.map((r) => r.label), ...TIMEZONE_LABELS_9199, ...HINT_ROWS_9199, ...DISPLAY_ROWS_9199.map((r) => r.label)];
  assert.ok(all.every((i) => i >= 0 && i < 621));
  assert.equal(new Set(COUNTRY_ROWS_9199.map((r) => r.label)).size, 37);
  assert.equal(new Set(TIMEZONE_LABELS_9199).size, 65);
  // The lists the shell fills, keyed the way lists.ts reads them.
  assert.ok(CODE_LISTS_9199['consoles/dashSysCslSetCountry.xur']![0]!.list === 'lstCountries');
  assert.ok(CODE_LISTS_9199['network/dashSysCslSetCountry.xur'], 'the network pack\'s copy of the Locale page is filled from the same table');
  assert.equal(CODE_LISTS_9199['consoles/dashSysCslSetRemoteC.xur']![0]!.rows.length, REMOTE_COUNT_9199);
});

test('the 9199 code lists are the bytes of the image (skipped without extracted/9199)', { skip: !image }, () => {
  // Language: 13 labels at 0x92018bfc by 0-based id, then the groups at
  // 0x92018c30, stride 13, the count (5) after them.
  for (let i = 0; i < 13; i++) assert.equal(u32(LANGUAGE_LABELS_VA_9199 + 4 * i), LANGUAGE_LABELS_9199[i], `language label ${i}`);
  for (const [g, ids] of LANGUAGE_GROUPS_9199.entries()) {
    for (let k = 0; k < LANGUAGE_GROUP_STRIDE_9199; k++) {
      const v = u32(LANGUAGE_GROUPS_VA_9199 + 4 * (g * LANGUAGE_GROUP_STRIDE_9199 + k));
      assert.equal(v, ids[k] ?? 0, `language group ${g} entry ${k}`);
    }
  }
  assert.equal(u32(LANGUAGE_GROUPS_VA_9199 + 4 * 5 * LANGUAGE_GROUP_STRIDE_9199), 5, 'the group count follows the groups');
  // Country: the count, then 37 x (u32 label, u16 locale, u16 0).
  assert.equal(u32(COUNTRY_COUNT_VA_9199), 37);
  for (const [i, r] of COUNTRY_ROWS_9199.entries()) {
    assert.equal(u32(COUNTRY_TABLE_VA_9199 + 8 * i), r.label, `country ${i} label`);
    assert.equal(u16(COUNTRY_TABLE_VA_9199 + 8 * i + 4), r.locale, `country ${i} locale`);
    assert.equal(u16(COUNTRY_TABLE_VA_9199 + 8 * i + 6), 0);
  }
  // Time zone: 65 x 32-byte records, label first, then a record that is not one.
  for (const [i, label] of TIMEZONE_LABELS_9199.entries()) assert.equal(u32(TIMEZONE_TABLE_VA_9199 + TIMEZONE_RECORD_SIZE_9199 * i), label, `time zone ${i}`);
  const after = u32(TIMEZONE_TABLE_VA_9199 + TIMEZONE_RECORD_SIZE_9199 * 65);
  assert.ok(after === 0 || after >= 621, 'the table ends after 65 records');
  // Hints: u16[5] and the count.
  for (const [i, label] of HINT_ROWS_9199.entries()) assert.equal(u16(HINT_TABLE_VA_9199 + 2 * i), label);
  assert.equal(u32(HINT_TABLE_VA_9199 + 12), 5);
  // Display: (label, wide scene, present, enabled) x 7.
  for (const [i, r] of DISPLAY_ROWS_9199.entries()) {
    const rec = DISPLAY_TABLE_VA_9199 + 16 * i;
    assert.equal(u32(rec), r.label, `display row ${i} label`);
    const ptr = u32(rec + 4);
    let name = '';
    for (let p = ptr - BASE; image!.readUInt16BE(p) !== 0; p += 2) name += String.fromCharCode(image!.readUInt16BE(p));
    assert.equal(name, r.scene, `display row ${i} scene`);
    assert.equal(u32(rec + 8), 1); assert.equal(u32(rec + 12), 1);
  }
  // Remote control: `addi r11, r11, 273` in the item-text routine and `li r11, 2`
  // in the count routine (true VAs; the file offset of .text is VA - 0x92000200).
  const text = (va: number) => image!.readUInt32BE(va - 0x92000200);
  assert.equal(text(0x9221a68c), 0x396b0000 | REMOTE_BASE_9199, 'addi r11, r11, 273 at 0x9221a68c');
  assert.equal(text(0x9221a6c0), 0x39600000 | REMOTE_COUNT_9199, 'li r11, 2 at 0x9221a6c0');
});

test('the EcNavTo jump table binds what navigation.ts says it binds (skipped without extracted/9199)', { skip: !image }, () => {
  // .rdata 0x920288a0: 35 x { char* name, u32 id }; 0x92028ad0: u16 offsets
  // from the dispatcher base 0x922d312c, indexed by id.
  const names = new Map<string, number>();
  for (let i = 0; i < 35; i++) {
    const ptr = u32(0x920288a0 + 8 * i), id = u32(0x920288a4 + 8 * i);
    let name = '';
    for (let p = ptr - BASE; image![p] !== 0; p++) name += String.fromCharCode(image![p]!);
    names.set(name, id);
  }
  const caseOf = (id: number) => 0x922d312c + u16(0x92028ad0 + 2 * id);
  const wideAt = (va: number) => { let s = ''; for (let p = va - BASE; image!.readUInt16BE(p) !== 0; p += 2) s += String.fromCharCode(image!.readUInt16BE(p)); return s; };
  // The literal a case materialises: `lis rX, hi` then `addi r5, rX, lo` within the case.
  const literalOf = (caseVa: number): string | null => {
    const hi = new Map<number, number>();
    // The jump table holds TRUE .text VAs; the image is flat, so the file
    // offset is VA - 0x92000000 (the 0x200 is only on ppc-dis's printout).
    for (let va = caseVa; va < caseVa + 0x40; va += 4) {
      const ins = image!.readUInt32BE(va - BASE);
      const op = ins >>> 26, rD = (ins >>> 21) & 31, rA = (ins >>> 16) & 31, imm = ins & 0xffff;
      if (op === 15 && rA === 0) hi.set(rD, imm << 16);
      else if (op === 14 && rD === 5 && hi.has(rA)) { const s = imm >= 0x8000 ? imm - 0x10000 : imm; return wideAt(((hi.get(rA)! + s) >>> 0)); }
      else if (op === 18 && !(ins & 1)) break;   // an unconditional branch ends the case; a `bl` does not
    }
    return null;
  };
  for (const [name, cmd] of Object.entries(EPIX_COMMANDS)) {
    assert.equal(names.get(name), cmd.id, `${name} id`);
    if (cmd.scene) assert.equal(literalOf(caseOf(cmd.id)), cmd.scene.replace(/^.*\//, ''), `${name} scene literal`);
  }
  assert.equal(names.get('EcNavToSettings'), 4);
  assert.equal(literalOf(caseOf(4)), 'SystemScene.xur');
  assert.equal(literalOf(caseOf(3)), 'ArcadeFilterScene.xur');
});

test('the root strips carry the archive\'s scenes in the order the image gives', () => {
  assert.equal(ROOT_STRIPS['firstrun/WhatsNewRootScene.xur']!.panels.length, 8);
  assert.equal(ROOT_STRIPS['firstrun/XboxBasicsRootScene.xur']!.panels.length, 8);
  assert.equal(ROOT_STRIPS['homepage/LiveUpsellRootScene.xur']!.panels.length, 5);
  assert.equal(ROOT_STRIPS['arcade/ArcadeFilterScene.xur']!.panels.length, 2);
  assert.equal(ROOT_STRIPS['signin/SigninScene.xur']!.panels.length, 2);
  assert.equal(ROOT_STRIPS['signin/SigninScene.xur']!.channel?.index, 91);
  assert.equal(SIGNIN_LEGEND.select, 97);
});

test('the What\'s New table at 0x9202b63c is eight (flag, id, scene) rows in that order (skipped without extracted/9199)', { skip: !image }, () => {
  const wideAt = (va: number) => { let s = ''; for (let p = va - BASE; image!.readUInt16BE(p) !== 0; p += 2) s += String.fromCharCode(image!.readUInt16BE(p)); return s; };
  const rows = ROOT_STRIPS['firstrun/WhatsNewRootScene.xur']!.panels;
  const ids: number[] = [];
  for (let i = 0; i < 8; i++) {
    const rec = 0x9202b63c + 12 * i;
    ids.push(u32(rec + 4));
    assert.equal(wideAt(u32(rec + 8)), rows[i]!.replace(/^.*\//, ''), `What's New row ${i}`);
  }
  assert.deepEqual(ids, [7, 0, 1, 2, 3, 4, 5, 6]);
});

test('a PressPath resolves in the pressing page\'s own pack before the global index', () => {
  const fake = {
    entry: (pack: string, path: string) => (pack === 'consoles' && path === 'dashSysCslSetCountry.xur') || (pack === 'network' && path === 'dashSysCslSetCountry.xur') ? {} : undefined,
    findByBasename: (name: string) => (name === 'dashSysCslSetCountry.xur' ? null : name === 'dashSysCslSetLanguage.xur' ? 'consoles/dashSysCslSetLanguage.xur' : null),
    collisions: ['dashsyscslsetcountry.xur'],
  } as unknown as Parameters<typeof resolveScenePath>[0];
  assert.equal(resolveScenePath(fake, 'dashSysCslSetCountry.xur', 'consoles'), 'consoles/dashSysCslSetCountry.xur');
  assert.equal(resolveScenePath(fake, 'dashSysCslSetCountry.xur', 'network'), 'network/dashSysCslSetCountry.xur');
  assert.equal(resolveScenePath(fake, 'dashSysCslSetCountry.xur'), null, 'a collision with no pack named is refused, not guessed');
  assert.equal(resolveScenePath(fake, 'dashSysCslSetLanguage.xur', 'dashmain'), 'consoles/dashSysCslSetLanguage.xur');
});

test('a hosted page\'s rows are its button controls on the plate, and a parked legend carrier never is', () => {
  const obj = (className: string, props: Record<string, unknown>, children: XuObject[] = []): XuObject =>
    ({ className, properties: Object.entries(props).map(([name, value]) => ({ def: { name }, value })), children, namedFrames: [], timelines: [] } as unknown as XuObject);
  // dashSysCslSetAudio.xur, abridged: two btn* rows, four parked legend carriers.
  const scene = obj('DashScene', { Id: 'scAudioSettings', Width: 880, Height: 480 }, [
    obj('XuiNavButton', { Id: 'btnDigital', Position: { x: 10, y: 15, z: 0 }, Width: 420, Height: 47, NavDown: 'btnSoundEffects', Text: 'Digital Output', PressPath: 'dashSysCslSetAudioDigital.xur' }),
    obj('XuiNavButton', { Id: 'legend_y', Position: { x: 165, y: 1035.6, z: 0 }, Width: 420, Height: 47, Visual: 'legend_Y', Enabled: false, NavUp: 'btnTest', PressKey: 22531 }),
    obj('XuiNavButton', { Id: 'legend_a', Position: { x: 573, y: 1063.6, z: 0 }, Width: 420, Height: 47, Visual: 'legend_A', Text: 'Select' }),
    obj('XuiBackButton', { Id: 'legend_b', Position: { x: 555, y: 1035.6, z: 0 }, Width: 420, Height: 47, Visual: 'legend_B', Text: 'Back', PressKey: 22593 }),
    obj('XuiNavButton', { Id: 'btnSoundEffects', Position: { x: 10, y: 60, z: 0 }, Width: 420, Height: 47, NavUp: 'btnDigital', Text: 'Sound Effects', PressPath: 'dashSysCslSetAudioSoundEffects.xur' }),
  ]);
  const r = collectPageRows(scene);
  assert.deepEqual(r.rows.map((x) => x.id), ['btnDigital', 'btnSoundEffects']);
  assert.equal(r.arrival, 'btnDigital');
  assert.equal(r.arrivalBy, 'chain head');
  assert.equal(findPressKey(scene, PRESS_KEYS.B) && (findPressKey(scene, PRESS_KEYS.B) as XuObject).className, 'XuiBackButton');
  assert.equal(findPressKey(scene, PRESS_KEYS.X), null);
  // A DefaultFocus that names a list lands on the list; a nested scene's wins
  // when the root has none (2004_NetworkDetails' Tab1 names btn_IP).
  const tabbed = obj('XuiScene', { Id: 'Scene_Main', Width: 880, Height: 480 }, [
    obj('XuiScene', { Id: 'Tab2', Show: false, DefaultFocus: 'btn_PPPoE', Position: { x: 137, y: 196, z: 0 } }, [obj('XuiNavButton', { Id: 'btn_PPPoE', Position: { x: 30, y: 30, z: 0 }, Height: 144, PressPath: 'x.xur' })]),
    obj('XuiScene', { Id: 'Tab1', DefaultFocus: 'btn_IP', Position: { x: 137, y: 196, z: 0 } }, [
      obj('XuiNavButton', { Id: 'btn_DNS', Position: { x: 30, y: 162, z: 0 }, Height: 119, NavUp: 'btn_IP' }),
      obj('XuiNavButton', { Id: 'btn_IP', Position: { x: 30, y: 30, z: 0 }, Height: 144, NavUp: 'btn_Wireless', NavDown: 'btn_DNS' }),
    ]),
  ]);
  const t = collectPageRows(tabbed);
  assert.deepEqual(t.rows.map((x) => x.id), ['btn_IP', 'btn_DNS'], 'the hidden tab is not on screen; rows sort by authored y');
  assert.equal(t.arrival, 'btn_IP');
  assert.equal(t.arrivalBy, 'DefaultFocus');
  const listed = obj('XuiScene', { Id: 'sc', DefaultFocus: 'lstSettings' }, [obj('XuiCommonList', { Id: 'lstSettings' })]);
  assert.equal(collectPageRows(listed).arrivalList, 'lstSettings');
});

test('an authoring token is nothing but tokens, digits and "of"', () => {
  for (const t of ['<setting>', '<servicename>', '<#> of <Total #>', '<current settings>\r\n2\r\n3', '<help text>', '  <MAC Addr> ']) assert.ok(isAuthoringToken(t), t);
  for (const t of ['Uninstall <servicename> now please', '<font size="16" color="#FFFFFF">Make your profile a little more personal</font>', 'Digital Output', '']) assert.ok(!isAuthoringToken(t), t);
});

/**
 * The two frames the shell hides and shows the legend on are the two edges of
 * one plateau in the FILE, not two tuned numbers.
 *
 * `SceneTransitions/TransitionSubElements` holds a zero across the middle of
 * every range, and the sub-elements (legend, counter, queue captions) are
 * absent exactly while it is 0. `LEGEND_HIDE_FRAME` is the near edge on `From`
 * and `LEGEND_SHOW_FRAME` the far edge on `BackTo`; this re-reads both out of
 * `controlp/Variables.xur` so a scene change cannot move them silently.
 */
test('the legend frames are the edges of TransitionSubElements\' zero plateau (skipped without extracted/9199)', { skip: !existsSync('extracted/9199/xuiz/controlp/Variables.xur') }, async () => {
  const { XuRegistry, parseXur } = await import('@xur/index');
  const reg = new XuRegistry(JSON.parse(readFileSync('packages/xur/extensions/9199/registry.json', 'utf8')));
  const doc = parseXur(new Uint8Array(readFileSync('extracted/9199/xuiz/controlp/Variables.xur')), reg);
  const idOfObj = (o: XuObject): string | null => {
    const p = o.properties.find((x) => x.def.name === 'Id');
    return typeof p?.value === 'string' ? p.value : null;
  };
  const findGroup = (o: XuObject): XuObject | null => {
    if (idOfObj(o) === 'SceneTransitions') return o;
    for (const c of o.children) { const r = findGroup(c); if (r) return r; }
    return null;
  };
  const group = findGroup(doc.root);
  assert.ok(group, 'controlp/Variables.xur has no SceneTransitions group');
  const named = new Map(group.namedFrames.map((f) => [f.name, f.keyframe]));
  assert.equal(named.get('From'), 76);
  assert.equal(named.get('FromEnd'), 150);
  assert.equal(named.get('BackTo'), 151);
  assert.equal(named.get('BackToEnd'), 225);
  const tl = group.timelines.find((t) => t.elementId === 'TransitionSubElements');
  assert.ok(tl, 'no TransitionSubElements timeline');
  // FloatVariable is the first track, so values[0] is the variable.
  assert.equal(tl.tracks[0]?.def.name, 'FloatVariable');
  const at = (frame: number): number | undefined => tl.keyframes.find((k) => k.keyframe === frame)?.values[0] as number | undefined;
  // `From`: 1 at the range's first frame, 0 from LEGEND_HIDE_FRAME to the end.
  assert.equal(at(76), 1);
  assert.equal(at(LEGEND_HIDE_FRAME), 0, 'the From plateau does not start where the legend hides');
  assert.equal(at(150), 0);
  assert.ok(!tl.keyframes.some((k) => k.keyframe > LEGEND_HIDE_FRAME && k.keyframe < 150 && k.values[0] !== 0), 'the From plateau is not flat');
  // `BackTo`: 0 from the range's first frame to LEGEND_SHOW_FRAME, then back.
  assert.equal(at(151), 0);
  assert.equal(at(LEGEND_SHOW_FRAME), 0, 'the BackTo plateau does not end where the legend shows');
  assert.equal(at(225), 1);
  assert.ok(!tl.keyframes.some((k) => k.keyframe > 151 && k.keyframe < LEGEND_SHOW_FRAME && k.values[0] !== 0), 'the BackTo plateau is not flat');
});

/*
 * M4f (Judge G round 3). The addresses in codeLists9199.ts's AV_PACK_9199,
 * CODE_VISIBILITY_9199 and CODE_LINES_9199 are TRUE (flat) VAs: file offset =
 * VA - 0x92000000. Each test re-reads the instruction words the tables cite,
 * so a wrong address fails here rather than in a screenshot. The PowerPC
 * encodings: `li rD, imm` = 0x38000000 | rD<<21 | imm; `lwz rD, d(rA)` =
 * 0x80000000 | rD<<21 | rA<<16 | d; `bl target` = 0x48000001 | (target - pc).
 */
const flat = (va: number) => image!.readUInt32BE(va - BASE);
const LI = (rd: number, imm: number) => (0x38000000 | (rd << 21) | (imm & 0xffff)) >>> 0;
const LWZ = (rd: number, ra: number, d: number) => (0x80000000 | (rd << 21) | (ra << 16) | (d & 0xffff)) >>> 0;
const BL = (pc: number, target: number) => (0x48000001 | ((target - pc) & 0x03fffffc)) >>> 0;
const SET_SHOW = 0x922df968;

test('the Display page hides its switch art first and shows it only on the AV-pack-0 branch (skipped without extracted/9199)', { skip: !image }, () => {
  // dashVideoSettings::UpdateCurrentSetting 0x92219790 opens with
  // SetShow(this+0x68 = SwitchImage, 0); the branch at 0x92219874 sets it 1.
  // The hide site is SCHEDULED: an unrelated `stw r24, 0x50(r1)` sits between
  // the argument and the handle load, so the call is at +0, +8, +12 while the
  // show site (below) is contiguous. Reading the three words as consecutive is
  // what a hand-copied address gets wrong, so both shapes are spelled out.
  assert.equal(flat(AV_PACK_9199.displayHide), LI(4, 0), 'li r4, 0');
  assert.equal(flat(AV_PACK_9199.displayHide + 8), LWZ(3, 27, 0x68), 'lwz r3, 0x68(r27)');
  assert.equal(flat(AV_PACK_9199.displayHide + 12), BL(AV_PACK_9199.displayHide + 12, SET_SHOW), 'bl SetShow');
  assert.equal(flat(AV_PACK_9199.displayShow), LI(4, 1), 'li r4, 1');
  assert.equal(flat(AV_PACK_9199.displayShow + 4), LWZ(3, 27, 0x68), 'lwz r3, 0x68(r27)');
  assert.equal(flat(AV_PACK_9199.displayShow + 8), BL(AV_PACK_9199.displayShow + 8, SET_SHOW), 'bl SetShow');
  // The resolution provider's AV-pack-0 branch names string 571 for labAVPackInfo.
  assert.equal(flat(AV_PACK_9199.providerAvPackInfo), LI(4, AV_PACK_9199.avPackInfo), 'li r4, 0x23b');
  // OnInit resolves "SwitchImage" (BE wide literal at 0x92018160) into this+0x68:
  // `addi r5, r31, 0x68` then `lis r11 / addi r4 = 0x92018160`.
  assert.equal(flat(0x92219c00), (0x38000000 | (5 << 21) | (31 << 16) | 0x68) >>> 0, 'addi r5, r31, 0x68');
  assert.equal(flat(0x92219c08), (0x38000000 | (4 << 21) | (11 << 16) | ((0x8160 - 0x10000) & 0xffff)) >>> 0, 'addi r4, r11, -0x7ea0');
  let name = '';
  for (let p = 0x92018160 - BASE; image!.readUInt16BE(p) !== 0; p += 2) name += String.fromCharCode(image!.readUInt16BE(p));
  assert.equal(name, 'SwitchImage');
  // The HDTV Settings page: SetShow(0) right after resolving its own SwitchImage, SetShow(1) on its branch.
  assert.equal(flat(AV_PACK_9199.hidefHide), LI(4, 0));
  assert.equal(flat(AV_PACK_9199.hidefHide + 8), BL(AV_PACK_9199.hidefHide + 8, SET_SHOW));
  assert.equal(flat(AV_PACK_9199.hidefShow), LI(4, 1));
  assert.equal(flat(AV_PACK_9199.hidefShow + 8), BL(AV_PACK_9199.hidefShow + 8, SET_SHOW));
  // The whole Display class (0x92218c00-0x92219c50) loads this+0x68 exactly twice: the two SetShow calls.
  let loads = 0;
  for (let va = 0x92218c00; va < 0x92219c50; va += 4) if (flat(va) === LWZ(3, 27, 0x68)) loads++;
  assert.equal(loads, 2, 'no other read of the SwitchImage handle - no SetPosition on it');
});

test('the switch art is authored on the Display scene root, not under scnCurrentFormat (skipped without extracted/9199)', { skip: !existsSync('extracted/9199/xuiz/consoles/dashSysCslSetDisplay.xur') }, async () => {
  const { XuRegistry, parseXur } = await import('@xur/index');
  const reg = new XuRegistry(JSON.parse(readFileSync('packages/xur/extensions/9199/registry.json', 'utf8')));
  const idOfObj = (o: XuObject): string => { const p = o.properties.find((x) => x.def.name === 'Id'); return typeof p?.value === 'string' ? p.value : ''; };
  const pos = (o: XuObject): { x: number; y: number } => { const p = o.properties.find((x) => x.def.name === 'Position')?.value as { x: number; y: number } | undefined; return { x: p?.x ?? 0, y: p?.y ?? 0 }; };
  for (const [file, gx] of [['consoles/dashSysCslSetDisplay.xur', 35], ['consoles/dashSysCslSetDisplayHiDef.xur', 37]] as const) {
    const doc = parseXur(new Uint8Array(readFileSync(`extracted/9199/xuiz/${file}`)), reg);
    const scene = doc.root.children[0]!;
    const group = scene.children.find((c) => idOfObj(c) === 'SwitchImage');
    assert.ok(group, `${file}: SwitchImage is a direct child of the scene root`);
    assert.deepEqual(pos(group), { x: gx, y: 170 });
    const img = group.children.find((c) => idOfObj(c) === 'XuiImage1');
    assert.ok(img);
    assert.equal(Math.round(pos(img).x), 99); assert.equal(Math.round(pos(img).y), 66);
    const pane = scene.children.find((c) => idOfObj(c) === 'scnCurrentFormat');
    if (pane) assert.equal(pane.children.length, 0, `${file}: scnCurrentFormat authors no children`);
    assert.equal(CODE_VISIBILITY_9199[file]?.[0]?.id, 'SwitchImage');
  }
});

test('the Recent Games panel raises labEmpty on an empty enumeration and disables A and Y (skipped without extracted/9199)', { skip: !image }, () => {
  // 0x92271ef8: `cmplwi cr6, r28, 0; bne` on the row count; the empty path
  // disables legend_y (+0xcac) and legend_a (+0xca8) through 0x92270ed8 and
  // ends in SetShow(labEmpty = this+0xca0, 1); the filled path SetShow(.., 0).
  const SET_ENABLE = 0x92270ed8;
  assert.equal(flat(0x92271f00), LI(4, 0)); assert.equal(flat(0x92271f04), LWZ(3, 31, 0xcac)); assert.equal(flat(0x92271f08), BL(0x92271f08, SET_ENABLE));
  assert.equal(flat(0x92271f0c), LI(4, 0)); assert.equal(flat(0x92271f10), LWZ(3, 31, 0xca8)); assert.equal(flat(0x92271f14), BL(0x92271f14, SET_ENABLE));
  assert.equal(flat(0x92271f48), LI(4, 1), 'li r4, 1 - the empty state shows the label');
  assert.equal(flat(0x92271fc8), LI(4, 0), 'li r4, 0 - the filled state hides it');
  assert.equal(flat(0x92271fcc), LWZ(3, 31, 0xca0), 'lwz r3, 0xca0(r31) - labEmpty');
  assert.equal(flat(0x92271fd0), BL(0x92271fd0, SET_SHOW));
  // The init resolves "labEmpty" (BE wide literal at 0x9201eec0) into +0xca0.
  assert.equal(flat(0x922710f0), (0x38000000 | (5 << 21) | (31 << 16) | 0xca0) >>> 0, 'addi r5, r31, 0xca0');
  let name = '';
  for (let p = 0x9201eec0 - BASE; image!.readUInt16BE(p) !== 0; p += 2) name += String.fromCharCode(image!.readUInt16BE(p));
  assert.equal(name, 'labEmpty');
  const v = CODE_VISIBILITY_9199['arcade/RecentGamesFilterPanel.xur']![0]!;
  assert.equal(v.id, 'labEmpty'); assert.equal(v.show, true); assert.equal(v.list, 'lstRecentGames');
});

test('Network Details writes its button captions from network/Strings.xus (skipped without extracted/9199)', { skip: !image }, async () => {
  // 0x92291338: `li r3, 0x2d..0x30` for btn_IP's four lines, `li r3, 0x29..0x2c`
  // for btn_DNS's, each followed by `bl 0x92287060` (the string fetch) and the
  // C4LineBtn setter for that line.
  const [ip, dns] = CODE_LINES_9199['network/2004_NetworkDetails.xur']!;
  assert.equal(ip!.id, 'btn_IP'); assert.equal(dns!.id, 'btn_DNS');
  const ipIdx = [ip!.text, ip!.slots[1], ip!.slots[2], ip!.slots[3]];
  const dnsIdx = [dns!.text, dns!.slots[1], dns!.slots[2], 44];
  const setters = [0x92290be0, 0x92290c20, 0x92290c60, 0x92290ca0];
  for (const [k, va] of [0x922913a8, 0x922913bc, 0x922913d0, 0x922913e4].entries()) {
    assert.equal(flat(va), LI(3, ipIdx[k]!), `btn_IP line ${k + 1}: li r3, ${ipIdx[k]}`);
    assert.equal(flat(va + 4), BL(va + 4, 0x92287060), 'the string fetch');
    assert.equal(flat(va + 16), BL(va + 16, setters[k]!), `the l${k + 1} setter`);
  }
  for (const [k, va] of [0x9229154c, 0x92291560, 0x92291574, 0x92291588].entries()) {
    assert.equal(flat(va), LI(3, dnsIdx[k]!), `btn_DNS line ${k + 1}: li r3, ${dnsIdx[k]}`);
    assert.equal(flat(va + 16), BL(va + 16, setters[k]!), `the l${k + 1} setter`);
  }
  // And the strings are what the table says they are.
  const { parseXus } = await import('@xuiz/index');
  const t = parseXus(new Uint8Array(readFileSync('extracted/9199/xuiz/network/Strings.xus')));
  const s = (i: number | undefined): string => t.entries[i!]!.value;
  assert.deepEqual(ipIdx.map(s), ['IP Settings', 'IP Address', 'Subnet Mask', 'Gateway']);
  assert.deepEqual(dnsIdx.map(s), ['DNS Settings', 'Primary DNS Server', 'Secondary DNS Server', '']);
  assert.equal(s(266), 'Not set', 'the only "no ..." caption on the page is the wireless block\'s');
});
