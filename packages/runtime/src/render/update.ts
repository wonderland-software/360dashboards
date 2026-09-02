// Re-applying animated properties to DOM that is already on screen.
//
// The first render builds a NodeRecord per element; the timeline engine writes
// new values into that record's live override map and calls updateNode, which
// re-derives only what those keys can affect. The DOM stays the source of truth
// for the judge, so data attributes are kept current too.
import { idOf, type XuObject, type XuScalar } from '@xur/index';
import * as E from '../xuiEnums';
import { applyAnchor, childDelta, NO_DELTA, type Delta } from './anchor';
import { authoredRect, PropBag, type Rect } from './props';
import { containerCss, contentFor, type Kind, type Owner, type RenderCtx } from './DomRenderer';

export interface NodeRecord {
  obj: XuObject;
  el: HTMLElement;
  kind: Kind;
  ctx: RenderCtx;
  /** The map the engine writes into; PropBag holds this same reference. */
  overrides: Map<string, XuScalar>;
  rect: Rect;
  authored: Rect;
  delta: Delta;
  parent: Rect;
  /** A visual root takes its host control's size instead of its own. */
  size?: { w: number; h: number };
  owner: Owner | null;
  content: Element | null;
  children: NodeRecord[];
  parentNode?: NodeRecord;
  /** Set on every element inside a control's instantiated visual. */
  hostControlId: string | null;
}

/** What DomRenderer calls while building the tree. */
export interface NodeSink {
  node(rec: NodeRecord): NodeRecord;
  scope(obj: XuObject, rec: NodeRecord): void;
}

/**
 * Property keys whose change means the element's own paint has to be rebuilt
 * rather than just restyled. Everything else - Position, Scale, Rotation,
 * Opacity, Show, Pivot - is a container-style write.
 */
const CONTENT_KEYS = /^(Fill|Stroke|Points|Text|TextColor|DropShadowColor|PointSize|TextStyle|Font|LineSpacingAdjust|ImagePath|SizeMode|File)\b/;
/** Keys that resize the element, so the children have to be laid out again. */
const LAYOUT_KEYS = /^(Width|Height|Anchor|Position)$/;

/** Re-apply one node after its overrides changed. */
export function updateNode(node: NodeRecord, keys?: Iterable<string>): void {
  const touched = keys ? [...keys] : null;
  const wantsContent = !touched || touched.some((k) => CONTENT_KEYS.test(k));
  const wantsLayout = !touched || touched.some((k) => LAYOUT_KEYS.test(k));

  const p = PropBag.of(node.obj, node.overrides);
  node.authored = authoredRect(p);
  let rect = applyAnchor(node.authored, p.num('Anchor', E.Anchor.NONE), node.delta, node.parent);
  if (node.size) rect = { ...rect, w: node.size.w, h: node.size.h };
  const resized = rect.w !== node.rect.w || rect.h !== node.rect.h;
  node.rect = rect;

  const blend = p.num('BlendMode', 0);
  const css = containerCss(p, rect, blend);
  if (node.el.style.cssText !== css) node.el.style.cssText = css;

  if (wantsContent || resized) {
    const next = contentFor(node.kind, p, rect, node.ctx, node.owner);
    if (node.content) node.content.remove();
    node.content = next;
    if (next) node.el.insertBefore(next, node.el.firstChild);
  }

  if (wantsLayout || resized) relayout(node);
}

/** A resized element hands a new delta to its children, exactly as the first
 *  render does; a visual root instead takes its host control's new size. */
function relayout(node: NodeRecord): void {
  if (node.children.length === 0) return;
  const delta = childDelta(node.authored, node.rect);
  for (const c of node.children) {
    if (c.size) { c.size = { w: node.rect.w, h: node.rect.h }; c.delta = NO_DELTA; }
    else c.delta = delta;
    c.parent = node.rect;
    updateNode(c, ['Position']);
  }
}

/** Collects the tree while it renders, and indexes it for the engine. */
export class NodeIndex implements NodeSink {
  readonly all: NodeRecord[] = [];
  /** Id -> every node with that Id (a visual is instantiated many times). */
  readonly byId = new Map<string, NodeRecord[]>();
  /** The objects that own timelines or named frames, with their element. */
  readonly scopes: { obj: XuObject; node: NodeRecord; id: string }[] = [];

  node(rec: NodeRecord): NodeRecord {
    this.all.push(rec);
    rec.parentNode?.children.push(rec);
    const id = idOf(rec.obj);
    if (id) {
      const list = this.byId.get(id) ?? [];
      list.push(rec);
      this.byId.set(id, list);
    }
    return rec;
  }

  scope(obj: XuObject, node: NodeRecord): void {
    this.scopes.push({ obj, node, id: pathOf(node) });
  }

  /** Every descendant of `node` that carries `elementId`, nearest first. A
   *  timeline names its target by Id, and the same Id can exist in more than
   *  one instantiated visual, so the search is scoped to the owner. */
  targets(node: NodeRecord, elementId: string): NodeRecord[] {
    const out: NodeRecord[] = [];
    const walk = (n: NodeRecord) => {
      if (idOf(n.obj) === elementId && n !== node) out.push(n);
      n.children.forEach(walk);
    };
    walk(node);
    return out;
  }
}

/** A stable, readable id for a scope: the chain of element Ids down to it, so
 *  the same skin visual instantiated by six controls gets six distinct ids. */
export function pathOf(node: NodeRecord): string {
  const parts: string[] = [];
  let cur: NodeRecord | undefined = node;
  while (cur) {
    parts.unshift(idOf(cur.obj) || cur.obj.className);
    cur = cur.parentNode;
  }
  return parts.join('/');
}
