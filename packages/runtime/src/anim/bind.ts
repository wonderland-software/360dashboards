// Wiring the DOM-free engine to the rendered tree.
import { idOf } from '@xur/index';
import { TimelineEngine, TimelineScope } from './TimelineEngine';
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
    const targets = new Map<string, NodeRecord[]>();
    for (const tl of obj.timelines) {
      if (!targets.has(tl.elementId)) targets.set(tl.elementId, index.targets(node, tl.elementId));
    }
    // A visual root knows the control that instantiated it; a control that owns
    // frames directly (a XuiScene's Normal/1to2 pairs) is its own host.
    const host = node.hostControlId ?? (isA(obj.className, 'XuiControl') ? idOf(obj) || null : null);
    const scope = new TimelineScope(id, obj, host);
    engine.add(scope, (s, delta) => {
      node.el.dataset['xuiTick'] = String(s.tick);
      if (s.range) node.el.dataset['xuiRange'] = s.range.join('..');
      for (const [elementId, values] of delta) {
        for (const t of targets.get(elementId) ?? []) {
          for (const [k, v] of values) t.overrides.set(k, v);
          updateNode(t, values.keys());
        }
      }
    });
  }
  return engine;
}
