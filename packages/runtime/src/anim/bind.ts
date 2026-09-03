// Wiring the DOM-free engine to the rendered tree.
import { idOf } from '@xur/index';
import { TimelineEngine, TimelineScope, trackKey } from './TimelineEngine';
import { updateNode, type NodeIndex, type NodeRecord } from '../render/update';
import { isA } from '../render/DomRenderer';

/**
 * One scope per object that owns named frames or timelines. A timeline names
 * its target child by Id, so each target is resolved ONCE at bind time against
 * that scope's own subtree - the same skin visual instantiated by six controls
 * has six scopes, each pointing at its own copy of "Button1".
 */
export function bindTimelines(index: NodeIndex, engine = new TimelineEngine()): TimelineEngine {
  for (const { obj, node, id } of index.scopes) {
    if (engine.get(id)) continue;   // already bound: a re-bind after a list filled
    const targets = new Map<string, NodeRecord[]>();
    for (const tl of obj.timelines) {
      if (!targets.has(tl.elementId)) targets.set(tl.elementId, index.targets(node, tl.elementId));
    }
    // XuiSoundXAudio children draw nothing, so they have no node; a File
    // keyframe on one is a CUE, and a cue is an event on its own frame rather
    // than a value that changed. dashmain's _2ndLevel_Sounds writes
    // dash_2ndLevelClose.xma on 435, 497, 581 and 656 with nothing between, so
    // reading the sampled value would fire once and swallow the other three -
    // including the one inside BootLive. So the frames are tabulated here and
    // the scope reports the tick it lands on.
    const sounds = new Set<string>();
    const cueFrames = new Map<string, Map<number, string>>();
    for (const c of obj.children) {
      if (!isA(c.className, 'XuiSound')) continue;
      const sid = idOf(c);
      sounds.add(sid);
      for (const tl of obj.timelines) {
        if (tl.elementId !== sid) continue;
        const fi = tl.tracks.findIndex((t) => trackKey(t) === 'File');
        if (fi < 0) continue;
        const frames = cueFrames.get(sid) ?? new Map<number, string>();
        for (const k of tl.keyframes) {
          const v = k.values[fi];
          if (typeof v === 'string' && v) frames.set(k.keyframe, v);
        }
        cueFrames.set(sid, frames);
      }
    }
    // A visual root knows the control that instantiated it; a control that owns
    // frames directly (a XuiScene's Normal/1to2 pairs) is its own host.
    const host = node.hostControlId ?? (isA(obj.className, 'XuiControl') ? idOf(obj) || null : null);
    const scope = new TimelineScope(id, obj, host);
    if (cueFrames.size) {
      scope.onFrame = (tick) => {
        for (const [elementId, frames] of cueFrames) {
          const file = frames.get(tick);
          if (!file) continue;
          scope.lastCue = file;
          engine.onCue?.({ scopeId: scope.id, elementId, file, tick });
        }
      };
    }
    engine.add(scope, (s, delta) => {
      node.el.dataset['xuiTick'] = String(s.tick);
      if (s.range) node.el.dataset['xuiRange'] = s.range.join('..');
      for (const [elementId, values] of delta) {
        if (sounds.has(elementId)) continue;   // a sound has no node; see above
        for (const t of targets.get(elementId) ?? []) {
          for (const [k, v] of values) t.overrides.set(k, v);
          updateNode(t, values.keys());
        }
      }
    });
  }
  return engine;
}
