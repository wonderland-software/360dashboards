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

test('Ease at 0/0/50 is exactly Linear (68 of the 454 Ease keyframes)', () => {
  const flat = [kf(0, [0], 'Ease'), kf(10, [100])];
  for (const f of [0, 2, 5, 7, 10]) {
    assert.equal(sampleKeyframes(flat, f)[0], f * 10, `frame ${f}`);
  }
  assert.equal(easeCurve(0.5, 0, 0, 50), 0.5);
  assert.equal(easeCurve(0, 90, 90, 50), 0);
  assert.equal(easeCurve(1, 90, 90, 50), 1);
});

test('every ease pair the corpus stores is monotonic and lands on 0 and 1', () => {
  // The real distribution over build 6770's 454 Ease keyframes.
  const CORPUS: [number, number, number, number][] = [
    [100, 100, 50, 237], [100, 0, 50, 115], [0, 0, 50, 68], [0, 100, 50, 19],
    [2, 100, 50, 6], [100, -100, 50, 5], [-100, 100, 50, 3], [-100, 0, 50, 1],
  ];
  for (const [ein, eout, scale] of CORPUS) {
    assert.equal(easeCurve(0, ein, eout, scale), 0, `${ein}/${eout} at 0`);
    assert.equal(easeCurve(1, ein, eout, scale), 1, `${ein}/${eout} at 1`);
    let prev = -1;
    for (let i = 0; i <= 200; i++) {
      const v = easeCurve(i / 200, ein, eout, scale);
      assert.ok(v >= prev - 1e-9, `${ein}/${eout} went backwards at ${i / 200}`);
      prev = v;
    }
  }
});

test('EaseIn 100 starts from a standstill: y = 2u^2 - u^3, peak speed at u = 2/3', () => {
  // The console's 26-frame nOpen ranges (Ease 100/0/50) accelerate into their
  // motion; the opposite sign convention would start them at double speed.
  for (const u of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    assert.ok(Math.abs(easeCurve(u, 100, 0, 50) - (2 * u * u - u * u * u)) < 1e-12, `at u=${u}`);
  }
  assert.ok(easeCurve(1e-4, 100, 0, 50) / 1e-4 < 0.01, "y'(0) must be ~0");
  let peak = 0, peakAt = 0, prev = 0;
  for (let i = 1; i <= 1000; i++) {
    const y = easeCurve(i / 1000, 100, 0, 50);
    if (y - prev > peak) { peak = y - prev; peakAt = i / 1000; }
    prev = y;
  }
  assert.ok(Math.abs(peakAt - 2 / 3) < 0.01, `peak speed at ${peakAt}, expected 2/3`);
});

test("visual_ChatAlert's -100/100 fade is exactly three quarters through at its midpoint", () => {
  // dashuisk/skin.xur, imgChatOrangeAnimated Opacity: Ease(-100,100,50) from
  // frame 0 value 1 to frame 100 value 0.
  assert.equal(easeCurve(0.5, -100, 100, 50), 0.75);
  const fade = [kf(0, [1], 'Ease', [-100, 100, 50]), kf(100, [0], 'None')];
  assert.equal(sampleKeyframes(fade, 50)[0], 0.25);
  // and its mirror, the 100/-100 fade back in on frames 130..230
  assert.equal(easeCurve(0.5, 100, -100, 50), 0.25);
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
  // No XuiSoundXAudio child, so no File keyframe ever fired: a cue is a
  // keyframe on a sound element (bind.ts), never a state name.
  assert.equal(rep.lastCue, null);
});

test('a sound element\'s File keyframes are cues, fired on the frame they sit on', () => {
  const o = obj([nf('Focus', 0, 'Play'), nf('EndFocus', 4, 'Stop')],
    [timeline('Xaudio_Sound01', [def('File')], [kf(0, ['']), kf(2, ['sharedres://btn_Focus.xma']), kf(3, [''])])]);
  const scope = new TimelineScope('v', o, 'row');
  scope.playRange('Focus', 'EndFocus');
  const seen: string[] = [];
  // sampleChanged reports the File track like any other; bind.ts routes a
  // sound element's File to TimelineEngine.onCue instead of to a node.
  for (let i = 0; i < 4; i++) {
    const d = scope.sampleChanged();
    const f = d.get('Xaudio_Sound01')?.get('File');
    if (typeof f === 'string' && f) seen.push(`${scope.tick}:${f}`);
    scope.step();
  }
  assert.deepEqual(seen, ['2:sharedres://btn_Focus.xma']);
});

test('playOnce runs a frame-less timeline through once and holds, where autoplay would loop', () => {
  const o = obj([], [timeline('box', [def('Opacity')], [kf(0, [1]), kf(5, [0])])]);
  const looping = new TimelineScope('loop', o);
  looping.autoplay();
  for (let i = 0; i < 7; i++) looping.step();
  assert.equal(looping.tick, 1, 'an ambient scope wraps past its last keyframe');
  const once = new TimelineScope('once', o);
  once.playOnce();
  for (let i = 0; i < 7; i++) once.step();
  assert.equal(once.tick, 5);
  assert.equal(once.playing, false);
  assert.equal(once.finished, true);
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

test('a scope with timelines and no named frames free-runs and loops', () => {
  // 12 of dashmain's 43 scopes are like this; nothing would ever start them.
  const o = obj([], [timeline('BG', [def('Opacity')], [kf(0, [0]), kf(4, [1])])]);
  const engine = new TimelineEngine();
  const scope = new TimelineScope('bg', o);
  assert.equal(scope.isAmbient, true);
  engine.add(scope, () => {});
  assert.equal(scope.playing, true, 'add() must start an ambient scope');
  for (let i = 0; i < 4; i++) engine.step();
  assert.equal(scope.tick, 4);
  engine.step();
  assert.equal(scope.tick, 0, 'past the last keyframe it wraps, it does not stop');
  assert.equal(scope.playing, true);
  // a scope WITH named frames is not ambient and stays put
  const named = new TimelineScope('v', obj([nf('Normal', 0, 'Stop')], [timeline('X', [def('Opacity')], [kf(0, [0])])]));
  assert.equal(named.isAmbient, false);
});

test('a range is labelled with the End frame that actually resolved', () => {
  // The skin writes all three shapes.
  const suffix = new TimelineScope('v', obj([nf('1To2', 1, 'Play'), nf('1To2End', 21, 'Stop')], []));
  suffix.playRange('1To2');
  assert.deepEqual(suffix.range, ['1To2', '1To2End']);
  assert.equal(suffix.stopAt, 21);

  const infix = new TimelineScope('v', obj([nf('1Press', 2, 'Play'), nf('1EndPress', 9, 'Stop')], []));
  infix.playRange('1Press');
  assert.deepEqual(infix.range, ['1Press', '1EndPress']);
  assert.equal(infix.stopAt, 9);

  const prefix = new TimelineScope('v', obj([nf('Focus', 0, 'Play'), nf('EndFocus', 5, 'Stop')], []));
  prefix.playRange('Focus');
  assert.deepEqual(prefix.range, ['Focus', 'EndFocus']);

  const orphan = new TimelineScope('v', obj([nf('Blink', 3, 'Play')], []));
  orphan.playRange('Blink');
  assert.deepEqual(orphan.range, ['Blink', '(none)'], 'a range with no End frame must say so');
  assert.equal(orphan.stopAt, null);
});

test('re-entering a range restarts it, which is why focus must be edge-triggered', () => {
  // XuiButton's shape: Focus at 15, FocusLoop at 28, EndFocus at 253 looping
  // back. Re-issuing Focus mid-range throws the playhead back to 15, so a
  // caller that plays a state on every tick (or on every d-pad auto-repeat at
  // the clamped end of a list) never lets the loop run.
  const o = obj(
    [nf('Focus', 15, 'Play'), nf('FocusLoop', 28, 'Play'), nf('EndFocus', 253, 'GoToAndPlay', 'FocusLoop')],
    [timeline('shineLoop', [def('Opacity')], [kf(15, [0]), kf(253, [1])])],
  );
  const s = new TimelineScope('v', o);
  s.playRange('Focus');
  assert.equal(s.entries, 1);
  for (let i = 0; i < 78; i++) s.step();
  assert.equal(s.tick, 93, 'left alone the playhead just advances');

  // the bug: a second playRange while nothing changed
  s.playRange('Focus');
  assert.equal(s.tick, 15, 'a re-entry restarts the range from its opening frame');
  assert.equal(s.entries, 2, 'and entries counts it, which is what the tests assert on');

  // left alone it reaches EndFocus and loops back to FocusLoop, without
  // counting as a new entry
  for (let i = 0; i < 238; i++) s.step();
  assert.equal(s.tick, 28, 'EndFocus GoToAndPlay must land on FocusLoop');
  assert.equal(s.playing, true);
  assert.equal(s.entries, 2, 'a GoToAndPlay loop is not a re-entry');
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
