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
import { containerCss, contentFor, mountVisual, type Kind, type Owner, type RenderCtx } from './DomRenderer';

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
  /** A control's instantiated visual subtree, so an animated Visual can swap it. */
  visualWrap?: HTMLElement | null;
  visualOwner?: Owner;
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

  // An animated Visual re-skins a control outright: dashmain drives
  // BG_color_1/2, color_highlight_left/rt and blade_top_jewel through
  // blade_1..5_bgcolor / _highlight / _jewel as the blades switch, and §1.3 of
  // the glue spec is explicit that the timeline decides which - so the DOM has
  // to follow. Those palette visuals carry no timelines and no named frames,
  // so the swap is a pure re-render with no scope to re-bind.
  if ((!touched || touched.includes('Visual')) && node.visualWrap !== undefined) {
    const name = p.str('Visual');
    const shown = node.visualWrap?.dataset['xuiVisual'];
    if (name && name !== shown) {
      node.visualWrap?.remove();
      const owner = node.visualOwner ?? { text: p.str('Text'), pointSize: p.num('PointSize', E.POINT_SIZE_INHERIT), imagePath: p.str('ImagePath') };
      const wrap = mountVisual(name, node.ctx, rect, owner, !p.bool('Enabled', true), node, idOf(node.obj));
      node.visualWrap = wrap ?? null;
      if (wrap) node.el.insertBefore(wrap, node.el.firstChild);
    }
  }

  if (wantsContent || resized) {
    const next = contentFor(node.kind, p, rect, node.ctx, node.owner);
    if (node.content) node.content.remove();
    node.content = next;
    if (next) node.el.insertBefore(next, node.el.firstChild);
  }

  if (wantsLayout || resized) relayout(node);
}

/**
 * Change a control's Text and let its visual's presenters follow.
 *
 * A XuiTextPresenter shows its OWNER's text, and the owner is one object shared
 * by reference with every node in the instantiated visual (DomRenderer builds
 * it once per control and hands the same reference down). So the text lives in
 * two places that must not drift: the control's own property, which is what
 * anything reading the scene sees, and that shared owner, which is what the
 * presenters render. Both are written here, then every presenter under the
 * control re-derives its paint.
 *
 * This is how the metapane text arrives: CDashScene writes PanelStrings[i] onto
 * the MetaPanelScene control (0x92159140) and metaScene_1line's Pane_txt, which
 * has DataAssociation 0, is what draws it.
 */
export function setOwnerText(node: NodeRecord, text: string): void {
  node.overrides.set('Text', text);
  if (node.visualOwner) node.visualOwner.text = text;
  updateNode(node, ['Text']);
  const walk = (n: NodeRecord) => {
    if (n !== node && (n.kind === 'text' || n.kind === 'textPresenter')) updateNode(n, ['Text']);
    n.children.forEach(walk);
  };
  walk(node);
}

/**
 * Write one of a control's SECONDARY text channels - the slots a
 * XuiTextPresenter selects with DataAssociation.
 *
 * metaScene_1line, the metapane's visual, carries two: Pane_txt
 * (DataAssociation 0, the description, written by setOwnerText above) and
 * Pane_txtCurrentSetting (DataAssociation 4, a 383x173 block at y=33). That
 * second channel is the "Current Setting" value the footage shows above every
 * Console Settings description - "United Kingdom" on Locale [FRAME hi f0060],
 * "Dashboard: 2.0.6717.0" on System Info [FRAME hi f0066], "1080p /
 * Widescreen / Standard" on Display [FRAME 6717-60fps f01580] - and it is why
 * those description strings are padded with leading CRLFs.
 */
export function setOwnerSlot(node: NodeRecord, assoc: number, text: string): void {
  const owner = node.visualOwner;
  if (!owner) return;
  (owner.slots ??= new Map()).set(assoc, text);
  const walk = (n: NodeRecord) => {
    if (n !== node && n.kind === 'textPresenter') updateNode(n, ['Text']);
    n.children.forEach(walk);
  };
  walk(node);
}

/**
 * The same thing for a secondary IMAGE channel.
 *
 * A Moby slot's icon is `imgIcon`, a XuiImagePresenter on DataAssociation 20,
 * and the slot's background is the control's primary `ImagePath` - two
 * channels, which is why the presenter has to be given the icon rather than
 * left to repeat the background. Routing it through the presenter is not
 * tidiness: `imgIcon` sets no `SizeMode`, so the default NORMAL applies and the
 * icon is drawn at its NATURAL size top-left in the 208x342 box. Drawn
 * `contain`-fitted to that box instead, `icon_disc.png`'s opaque top lands
 * about 30 design px low against the frame.
 */
export function setOwnerImageSlot(node: NodeRecord, assoc: number, path: string): void {
  // The owner may live on this node or, for a scene mounted into a rig, on the
  // node that instantiated the visual - the presenter walk below finds either.
  const owner = node.visualOwner;
  if (!owner) return;
  (owner.imageSlots ??= new Map()).set(assoc, path);
  const walk = (n: NodeRecord) => {
    if (n !== node && n.kind === 'imagePresenter') updateNode(n, ['ImagePath']);
    n.children.forEach(walk);
  };
  walk(node);
}

/**
 * Re-instantiate a control's visual against its CURRENT properties.
 *
 * `updateNode` swaps a visual only when the Visual NAME changes, because that
 * is the only swap a timeline ever asks for (dashmain drives blade_1..5_bgcolor
 * through one control). Enabled is different: `mountVisual` picks the disabled
 * variant at instantiation time from the flag it is handed, so a control that
 * becomes disabled AFTER its first render keeps the enabled artwork forever.
 * That is what left the Y and X legend glyphs painting at full strength with no
 * profile signed in, where f0026 shows them desaturated [FRAME].
 *
 * The owner is rebuilt from the live overrides too, so text cleared by the same
 * state change does not come back with the new visual.
 */
export function remountVisual(node: NodeRecord): void {
  if (node.visualWrap === undefined) return;
  const p = PropBag.of(node.obj, node.overrides);
  const name = p.str('Visual');
  if (!name) return;
  node.visualWrap?.remove();
  const owner: Owner = node.visualOwner
    ?? { text: p.str('Text'), pointSize: p.num('PointSize', E.POINT_SIZE_INHERIT), imagePath: p.str('ImagePath') };
  owner.text = p.str('Text');
  node.visualOwner = owner;
  const wrap = mountVisual(name, node.ctx, node.rect, owner, !p.bool('Enabled', true), node, idOf(node.obj));
  node.visualWrap = wrap ?? null;
  if (wrap) node.el.insertBefore(wrap, node.el.firstChild);
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

  /**
   * Forget a whole subtree: the console's XuiSceneDestroy (0x9214d778) is
   * called on every pop, and an index that kept the dead nodes would answer
   * `byId` lookups with elements no longer in the document - which is exactly
   * how a stale metapane or a stale focus target survives a back press.
   * Returns the scope ids that went with it so the caller can drop them from
   * the timeline engine too.
   */
  removeSubtree(root: NodeRecord): string[] {
    const dead = new Set<NodeRecord>();
    const collect = (n: NodeRecord) => { dead.add(n); n.children.forEach(collect); };
    collect(root);
    for (let i = this.all.length - 1; i >= 0; i--) if (dead.has(this.all[i]!)) this.all.splice(i, 1);
    for (const [id, list] of this.byId) {
      const kept = list.filter((n) => !dead.has(n));
      if (kept.length === 0) this.byId.delete(id); else this.byId.set(id, kept);
    }
    const scopeIds: string[] = [];
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const s = this.scopes[i]!;
      if (dead.has(s.node)) { scopeIds.push(s.id); this.scopes.splice(i, 1); }
    }
    const parent = root.parentNode;
    if (parent) {
      const at = parent.children.indexOf(root);
      if (at >= 0) parent.children.splice(at, 1);
    }
    root.el.remove();
    return scopeIds;
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
