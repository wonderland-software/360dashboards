// XuiScene.TransFrom / TransTo / TransBackFrom / TransBackTo.
//
// Every second-level scene in the build declares the same four:
// TransFrom="FadeOut", TransTo="FadeIn", TransBackFrom="FadeOut",
// TransBackTo="FadeIn" [SCENE], and those name XuiVisuals in
// dashuisk/skin.xur. They are NOT skins for a control - nothing wears them.
// Each is a one-child, one-timeline visual whose child is a proxy box:
//
//   FadeIn   box   Opacity/Show   0..13 (0,false->0,true)  13..30 (0->1)
//   FadeOut  box1  Opacity/Show   0..5  (1,true -> 0,false)
//   FadeIn1  box   Opacity/Show   0..29 (0,false->0,true)  29..55 (0->1)
//   FadeOut1 box1  same as FadeOut
//
// So the visual is a CURVE, and the thing it drives is the scene: the proxy's
// Opacity and Show are what XUI writes onto the transitioning scene. That is
// the reading that makes the data mean anything - a 300x300 rectangle nobody
// parents is not artwork - and it is what the durations say too (FadeOut is 5
// frames, 83 ms, which is the "content disappears in one frame with no
// fade-out" the footage shows on a switch, and FadeIn's 30 frames are the
// "content cross-fades back in over ~4 presented frames" tail measured on a
// second-level open).
//
// The visuals carry NO named frames, so neither playRange nor the ambient loop
// describes them: they run once from frame 0 and hold. That is
// TimelineScope.playOnce.
import { idOf, type XuObject } from '@xur/index';
import {
  TimelineScope, updateNode,
  type TimelineEngine, type NodeRecord, type VisualScope,
} from '@runtime/index';

/** The four properties an XuiScene names a transition visual in. */
export const TRANSITION_PROPS = ['TransFrom', 'TransTo', 'TransBackFrom', 'TransBackTo'] as const;
export type TransitionProp = (typeof TRANSITION_PROPS)[number];

export interface RunningTransition {
  /** The scope id, so a second run of the same transition replaces the first. */
  id: string;
  visual: string;
  scope: TimelineScope;
}

/**
 * Play `visualName` onto `target`. The scope id is unique per target and per
 * role so an outgoing fade and an incoming fade never fight over one scope.
 * Returns null (and records nothing) when the skin does not define the visual:
 * a missing transition is reported by the caller, never invented.
 */
export function playTransition(
  engine: TimelineEngine, visuals: VisualScope, visualName: string,
  target: NodeRecord, role: string,
): RunningTransition | null {
  const v = visuals.resolve(visualName);
  if (!v) return null;
  const proxyId = proxyOf(v);
  if (!proxyId) return null;
  const id = transitionId(role, idOf(target.obj) || target.obj.className);
  engine.remove(id);
  const scope = new TimelineScope(id, v, null);
  engine.add(scope, (_s, delta) => {
    const values = delta.get(proxyId);
    if (!values) return;
    for (const [k, val] of values) {
      if (k !== 'Opacity' && k !== 'Show') continue;   // the proxy's box is not art
      target.overrides.set(k, val);
    }
    updateNode(target, values.keys());
  });
  scope.playOnce();
  engine.applyNow(scope);
  return { id, visual: visualName, scope };
}

/** The scope id a transition runs under, so a destroyed scene can take its own
 *  transitions with it instead of leaving them ticking against detached DOM. */
export const transitionId = (role: string, targetId: string) => `(trans)${role}/${targetId}`;

/** The element the visual's single timeline drives: "box" in FadeIn, "box1" in
 *  FadeOut. Read from the file, never assumed. */
function proxyOf(v: XuObject): string | null {
  for (const tl of v.timelines) {
    const names = tl.tracks.map((t) => t.path.map((d) => d.name).join('.'));
    if (names.includes('Opacity') || names.includes('Show')) return tl.elementId;
  }
  return null;
}
