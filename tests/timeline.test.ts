// The timeline engine on synthetic scenes: sampling, easing, slerp, and the
// Flash-style named-frame commands. No DOM, no dev server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  XuObject, XuTimeline, XuKeyframe, XuNamedFrame, XuPropertyDef, XuScalar, XuQuaternion,
} from '@xur/index';
import { sampleKeyframes, easeCurve, slerp, blend, changed } from '@runtime/anim/interp';
import { TimelineScope, TimelineEngine, trackKey } from '@runtime/anim/TimelineEngine';

const def = (name: string, type: XuPropertyDef['type'] = 'float'): XuPropertyDef =>
  ({ id: 0, name, type, flags: [], defaultValue: null, owner: 'XuiElement' });

const kf = (
  keyframe: number, values: XuScalar[], interpolation: XuKeyframe['interpolation'] = 'Linear',
  ease: [number, number, number] = [0, 0, 50],
): XuKeyframe => ({ keyframe, interpolation, easeIn: ease[0], easeOut: ease[1], easeScale: ease[2], values });

const timeline = (elementId: string, defs: XuPropertyDef[], keyframes: XuKeyframe[]): XuTimeline => ({
  elementId,
  tracks: defs.map((d) => ({ path: [d], def: d, index: null })),
  keyframes,
});

const obj = (namedFrames: XuNamedFrame[], timelines: XuTimeline[]): XuObject =>
  ({ className: 'XuiVisual', properties: [], children: [], namedFrames, timelines });

const nf = (name: string, keyframe: number, command: XuNamedFrame['command'], target: string | null = null): XuNamedFrame =>
  ({ name, keyframe, command, target });

/* -------------------------------------------------------------- sampling */

test('Linear blends between the surrounding keyframes', () => {
  const kfs = [kf(0, [0]), kf(10, [100])];
  assert.equal(sampleKeyframes(kfs, 0)[0], 0);
  assert.equal(sampleKeyframes(kfs, 5)[0], 50);
  assert.equal(sampleKeyframes(kfs, 10)[0], 100);
  // outside the range the nearest keyframe holds
  assert.equal(sampleKeyframes(kfs, 40)[0], 100);
  assert.equal(sampleKeyframes(kfs, -3)[0], 0);
});

test('None holds the earlier keyframe until the next one lands', () => {
  const kfs = [kf(0, [0], 'None'), kf(10, [100])];
  assert.equal(sampleKeyframes(kfs, 9)[0], 0);
  assert.equal(sampleKeyframes(kfs, 10)[0], 100);
});

test('Ease at 0/0/50 is exactly Linear, and a non-zero ease bends but stays monotonic', () => {
  const flat = [kf(0, [0], 'Ease'), kf(10, [100])];
  for (const f of [0, 2, 5, 7, 10]) {
    assert.equal(sampleKeyframes(flat, f)[0], f * 10, `frame ${f}`);
  }
  assert.equal(easeCurve(0.5, 0, 0, 50), 0.5);
  const bent = easeCurve(0.5, 100, 100, 50);
  assert.ok(bent > 0 && bent < 1);
  let prev = -1;
  for (let i = 0; i <= 20; i++) {
    const v = easeCurve(i / 20, 80, -40, 50);
    assert.ok(v >= prev - 1e-9, 'ease must not go backwards');
    prev = v;
  }
  assert.equal(easeCurve(0, 90, 90, 50), 0);
  assert.equal(easeCurve(1, 90, 90, 50), 1);
});

test('colours blend per channel and strings hold', () => {
  const c = blend({ a: 0, r: 0, g: 0, b: 0 }, { a: 255, r: 100, g: 200, b: 50 }, 0.5);
  assert.deepEqual(c, { a: 128, r: 50, g: 100, b: 25 });
  assert.equal(blend('A-Button.png', 'disabled-Button.png', 0.5), 'A-Button.png');
  assert.equal(blend(true, false, 0.5), true);
});

test('quaternions slerp along the shortest arc and stay unit length', () => {
  const a: XuQuaternion = { x: 0, y: 0, z: 0, w: 1 };
  const half = Math.SQRT1_2;
  const b: XuQuaternion = { x: 0, y: 0, z: half, w: half }; // 90 degrees about Z
  const mid = slerp(a, b, 0.5) as XuQuaternion;
  const angle = 2 * Math.atan2(Math.hypot(mid.x, mid.y, mid.z), mid.w);
  assert.ok(Math.abs(angle - Math.PI / 4) < 1e-9, `expected 45 degrees, got ${(angle * 180) / Math.PI}`);
  assert.ok(Math.abs(Math.hypot(mid.x, mid.y, mid.z, mid.w) - 1) < 1e-9);
  // the shortest arc: negating b must give the same rotation, not the long way
  const neg = slerp(a, { x: 0, y: 0, z: -half, w: -half }, 0.5) as XuQuaternion;
  assert.ok(Math.abs(Math.abs(neg.z) - Math.abs(mid.z)) < 1e-9);
});

test('changed() ignores float noise but sees a real move', () => {
  assert.equal(changed(1, 1 + 1e-9), false);
  assert.equal(changed(1, 1.5), true);
  assert.equal(changed('a', 'b'), true);
});

/* ------------------------------------------------- scopes and commands */

test('trackKey matches the override keys PropBag reads', () => {
  const fill = def('Fill', 'object');
  const grad = def('Gradient', 'object');
  const stop = def('StopPos');
  assert.equal(trackKey({ path: [def('Opacity')], def: def('Opacity'), index: null }), 'Opacity');
  assert.equal(trackKey({ path: [fill, grad, stop], def: stop, index: 2 }), 'Fill.Gradient.StopPos#2');
});

test('playRange opens on the state frame and the End frame stops it', () => {
  const o = obj(
    [nf('Normal', 0, 'Play'), nf('EndNormal', 4, 'Stop')],
    [timeline('Button', [def('Opacity')], [kf(0, [0]), kf(4, [1])])],
  );
  const s = new TimelineScope('v', o);
  assert.equal(s.playRange('Normal'), true);
  assert.equal(s.tick, 0);
  assert.equal(s.playing, true);
  s.step(); s.step();
  assert.equal(s.tick, 2);
  assert.equal(s.sample().get('Button')?.get('Opacity'), 0.5);
  s.step(); s.step();
  assert.equal(s.tick, 4);
  assert.equal(s.playing, false, 'the End frame Stop must halt the playhead');
  s.step();
  assert.equal(s.tick, 4, 'a stopped scope does not advance');
});

test('the documented fallback chain finds a state the visual does not define', () => {
  const s = new TimelineScope('v', obj([nf('Normal', 0, 'Play'), nf('EndNormal', 1, 'Stop')], []));
  assert.deepEqual(s.stateFrame('Focus'), { name: 'Normal', frame: 0 });   // Focus -> Normal
  assert.deepEqual(s.stateFrame('Press'), { name: 'Normal', frame: 0 });   // Press -> Focus -> Normal
  assert.equal(s.stateFrame('Nonsense'), null);
  // and a visual whose resting frame is called Default (17 of them in 6770)
  const d = new TimelineScope('v', obj([nf('Default', 0, 'Stop')], []));
  assert.deepEqual(d.stateFrame('Normal'), { name: 'Default', frame: 0 });
});

test('GoToAndPlay loops a focus range instead of running off the end', () => {
  const o = obj(
    [nf('Focus', 0, 'Play'), nf('loop', 2, 'Play'), nf('EndFocus', 5, 'GoToAndPlay', 'loop')],
    [timeline('Glow', [def('Opacity')], [kf(0, [0]), kf(5, [1])])],
  );
  const s = new TimelineScope('v', o);
  s.playRange('Focus', 'EndFocus');
  for (let i = 0; i < 5; i++) s.step();
  assert.equal(s.tick, 2, 'EndFocus must jump the playhead back to loop');
  assert.equal(s.playing, true, 'a backwards GoToAndPlay survives the stopAt guard');
  for (let i = 0; i < 3; i++) s.step();
  assert.equal(s.tick, 2, 'and keeps looping');
});

test('GoToAndStop jumps and halts; GoTo jumps and keeps the current state', () => {
  const stop = new TimelineScope('v', obj([nf('a', 0, 'Play'), nf('b', 3, 'GoToAndStop', 'home'), nf('home', 9, 'Stop')], []));
  stop.playRange('a', 'b');
  for (let i = 0; i < 3; i++) stop.step();
  assert.equal(stop.tick, 9);
  assert.equal(stop.playing, false);

  const go = new TimelineScope('v', obj([nf('a', 0, 'Play'), nf('b', 2, 'GoTo', 'home'), nf('home', 7, 'Play')], []));
  go.playRange('a', 'b');
  for (let i = 0; i < 2; i++) go.step();
  assert.equal(go.tick, 7);
  assert.equal(go.playing, true);
});

test('an engine steps every playing scope and reports only what moved', () => {
  const o = obj([nf('Normal', 0, 'Play'), nf('EndNormal', 2, 'Stop')],
    [timeline('Button', [def('Opacity')], [kf(0, [0]), kf(2, [1])])]);
  const engine = new TimelineEngine();
  const seen: (XuScalar | undefined)[] = [];
  engine.add(new TimelineScope('v', o, 'legend_a'), (_s, delta) => seen.push(delta.get('Button')?.get('Opacity')));
  assert.equal(engine.setState('legend_a', 'Normal'), true);
  engine.step();
  engine.step();
  assert.deepEqual(seen, [0, 0.5, 1]);
  engine.step();
  assert.equal(seen.length, 3, 'a stopped scope produces no further deltas');
  const rep = engine.report().scopes[0]!;
  assert.equal(rep.range, 'Normal..EndNormal');
  assert.equal(rep.lastCue, 'legend_a:Normal');
});

test('freeze pins every scope and blocks the wall clock', () => {
  const o = obj([nf('Normal', 0, 'Play'), nf('EndNormal', 10, 'Stop')],
    [timeline('Button', [def('Opacity')], [kf(0, [0]), kf(10, [1])])]);
  const engine = new TimelineEngine();
  let last: XuScalar | undefined;
  engine.add(new TimelineScope('v', o), (_s, delta) => { last = delta.get('Button')?.get('Opacity'); });
  engine.freeze(7);
  assert.equal(last, 0.7);
  assert.equal(engine.tick(1000), 0, 'a frozen engine steps nothing');
  assert.equal(engine.get('v')?.tick, 7);
});

test('the clock is a fixed-step accumulator at 60 frames a second', () => {
  const o = obj([nf('Normal', 0, 'Play')], [timeline('X', [def('Opacity')], [kf(0, [0]), kf(600, [1])])]);
  const engine = new TimelineEngine();
  engine.add(new TimelineScope('v', o), () => {});
  engine.get('v')!.playRange('Normal');
  assert.equal(engine.tick(100), 6, '100ms is six frames');
  assert.equal(engine.tick(8), 0, 'a part-frame is banked, not dropped');
  assert.equal(engine.tick(9), 1, 'and spends once it adds up');
  assert.equal(engine.tick(10000), 15, 'a backgrounded tab is clamped, not fast-forwarded');
});
