// The XUI element tree as DOM.
//
// One <div data-xui-class data-xui-id> per XuiElement, absolutely positioned in
// the 1120x770 design space, children nested inside their parent so opacity and
// transforms compose the way XUI's scene graph composes them. Vector figures
// become inline SVG, images <img>, text a flex box. Nothing is drawn by hand:
// every number below is read out of the parsed scene.
import { idOf, type XuObject } from '@xur/index';
import * as E from '../xuiEnums';
import type { AssetIndex } from '../assets/AssetIndex';
import type { VisualScope } from '../scene/Skin';
import { xuiRegistry } from '../scene/SceneLoader';
import { note, type SceneReport } from '../telemetry';
import { applyAnchor, childDelta, NO_DELTA, type Delta } from './anchor';
import { authoredRect, PropBag, NO_OVERRIDES, type Overrides, type Rect } from './props';
import { sampleTimelines, stateFrame, type Sampled } from './timeline';
import type { NodeSink, NodeRecord } from './update';
import { renderFigure } from './controls/figure';
import { renderImage } from './controls/image';
import { renderText, type TextOwner } from './controls/text';

export interface RenderCtx {
  assets: AssetIndex;
  /** The pack the scene came from; bare image paths resolve against it. */
  pack: string;
  visuals: VisualScope;
  report: SceneReport;
  /** M2: when present, every element and every timeline-owning object is
   *  registered so the timeline engine can drive them. Absent = the static
   *  render, byte-identical to M1. */
  nodes?: NodeSink;
}

/** Classes whose CONTENT the console filled at runtime (list rows, video,
 *  gamercard, HTML). We draw their authored skeleton and say so. */
const RUNTIME_DRIVEN = new Set([
  'XuiList', 'XuiCommonList', 'XuiListItem', 'XuiGamerCard', 'XuiEdit', 'XuiCaret',
  'XuiProgressBar', 'XuiSlider', 'XuiScrollBar', 'XuiHtmlPresenter', 'XuiHtmlElement',
  'DashVideo', 'VideoData', 'LiveVisionControl', 'ScriptList', 'ScriptData', 'ScriptImage',
  'XuiBOTDOfflineContainer', 'XuiBOTDOfflineScene', 'XuiFall07BOTDScene',
]);

interface Owner { text: string; pointSize: number; imagePath: string }

interface Opts {
  overrides: Overrides;
  delta: Delta;
  parent: Rect;
  owner: Owner | null;
  /** Force the element's size (a visual root takes its control's size). */
  size?: { w: number; h: number };
  /** Playhead for THIS element's own timelines. A visual root is parked on the
   *  frame of the control's state; everything else sits at frame 0. */
  frame?: number;
  /** M2: the record this element hangs under, so relayout can cascade. */
  parentNode?: NodeRecord;
  /** M2: the control whose visual this subtree is, if any. */
  hostControlId?: string | null;
  /** Id of the nearest ancestor with opacity < 1, if any. */
  fadedAncestor?: string | null;
}

/**
 * The scene's canvas is its own XuiCanvas Width/Height, NOT a constant. 184 of
 * the 245 canvases in build 6770 are 1120x770, and 61 are not: 640x480,
 * 720x480, 345x240 (dashcomm/TitleMetadata.xur, used as a scene texture by 11
 * scenes), 345x300, 700x445, 420x450, 1024x768, 1123x772, 723x73, 100x770,
 * 162x25, 64x64 and 405x{88,125,179,260}. 1120x770 is only the DASHBOARD ROOT's
 * size, and only that one goes through the console's view transform.
 */
export function canvasSizeOf(root: XuObject): { w: number; h: number } {
  const p = PropBag.of(root, NO_OVERRIDES);
  return { w: p.num('Width', E.DASHBOARD_CANVAS.width), h: p.num('Height', E.DASHBOARD_CANVAS.height) };
}

export function renderScene(root: XuObject, ctx: RenderCtx): HTMLElement {
  const size = canvasSizeOf(root);
  ctx.report.canvas = size;
  const host = document.createElement('div');
  host.className = 'xui-root';
  host.style.cssText = `position:relative;width:${size.w}px;height:${size.h}px;overflow:hidden`;
  const el = renderElement(root, ctx, {
    overrides: NO_OVERRIDES, delta: NO_DELTA, owner: null,
    parent: { x: 0, y: 0, w: size.w, h: size.h },
  });
  if (el) host.appendChild(el);
  refreshVisibility(host, ctx.report);
  return host;
}

/**
 * Re-measure what is actually visible, and REPLACE the previous answer.
 *
 * This is a snapshot, so it has to be retaken after anything that adds
 * content: renderScene runs before the glue populates lists, and an empty
 * lstSettings really is invisible at that moment, so leaving the first
 * snapshot in place would report a list holding ten rows as invisible.
 * The app calls this again once the shell has mounted.
 */
export function refreshVisibility(host: HTMLElement, report: SceneReport): void {
  const el = host.firstElementChild instanceof HTMLElement ? host.firstElementChild : null;
  report.invisibleAtRest = el ? isInvisible(el) : true;
  report.invisibleGroups.length = 0;
  // The scene root's own child (the DashScene / XuiTabScene) is transparent
  // for this purpose, so look one level further in: that is where Tab1..Tab6
  // live.
  const top = el?.firstElementChild instanceof HTMLElement ? el.firstElementChild : el;
  for (const c of Array.from(top?.children ?? [])) {
    if (!(c instanceof HTMLElement) || c.tagName !== 'DIV') continue;
    const cid = c.dataset['xuiId'];
    if (cid && isInvisible(c)) note(report.invisibleGroups, cid);
  }
}

/**
 * Everything a scene draws can be hidden at rest: dashmain's Tab1..Tab6 all
 * carry Opacity 0 until console code opens a blade, so the default route shows
 * only the blade-skin background. Reported rather than papered over.
 *
 * "Paints something" means an <svg> or <img> child, or a text paint box. Text
 * is the trap: renderText builds div > div, so a walk that only treats
 * non-DIV children as paint calls every text-only control invisible - that
 * mistake flagged 39 scenes, 1,324 groups, and labHeader/labMetaHeader in the
 * Console Settings scene. Hence data-xui-paint on the box renderText makes.
 */
function isInvisible(el: HTMLElement): boolean {
  const visible = (n: HTMLElement, opacity: number): boolean => {
    if (n.style.display === 'none') return false;
    const o = n.style.opacity === '' ? 1 : Number(n.style.opacity);
    const acc = opacity * (Number.isFinite(o) ? o : 1);
    if (acc <= 0.001) return false;
    if (n.dataset['xuiPaint']) return true;               // a text paint box
    for (const c of Array.from(n.children)) {
      if (!(c instanceof HTMLElement)) return true;       // <svg>: a figure
      if (c.tagName !== 'DIV') return true;               // <img>, <svg>
      if (c.dataset['xuiPaint']) return true;
      if (visible(c, acc)) return true;
    }
    return false;
  };
  return !visible(el, 1);
}

export function renderElement(o: XuObject, ctx: RenderCtx, opts: Opts): HTMLElement | null {
  const reg = xuiRegistry();
  if (!reg.has(o.className)) {
    note(ctx.report.unknownClasses, o.className);
    return fallbackBox(o, opts);
  }
  const kind = classify(o.className);
  if (kind === 'sound') return null; // XuiSoundXAudio plays, it does not draw

  ctx.report.objects++;
  if (isA(o.className, 'XuiControl')) ctx.report.controls++;
  if (RUNTIME_DRIVEN.has(o.className)) note(ctx.report.runtimeDrivenClasses, o.className);

  // A live copy: the timeline engine writes animated values into this map and
  // the PropBag reads them back. Cloning keeps the shared empty map safe.
  const live = new Map(opts.overrides);
  const p = PropBag.of(o, live);
  const authored = authoredRect(p);
  let rect = applyAnchor(authored, p.num('Anchor', E.Anchor.NONE), opts.delta, opts.parent);
  if (opts.size) rect = { ...rect, w: opts.size.w, h: opts.size.h };

  const el = document.createElement('div');
  el.dataset['xuiClass'] = o.className;
  const id = idOf(o);
  if (id) el.dataset['xuiId'] = id;

  const blend = p.num('BlendMode', 0);
  if (E.UNVERIFIED_BLEND_MODES.includes(blend)) {
    el.dataset['xuiBlendmode'] = String(blend);
    if (!ctx.report.unverifiedBlendModes.includes(blend)) ctx.report.unverifiedBlendModes.push(blend);
    // CSS isolates a blend inside the nearest stacking context, and an
    // ancestor opacity < 1 makes one; the console has no such rule.
    if (opts.fadedAncestor) note(ctx.report.blendIsolated, `${id || o.className} under ${opts.fadedAncestor}`);
  }

  el.style.cssText = containerCss(p, rect, blend);

  // The element's own paint.
  const owner = opts.owner;
  const content = contentFor(kind, p, rect, ctx, owner);
  if (content) el.appendChild(content);

  const record = ctx.nodes?.node({
    obj: o, el, kind, ctx, overrides: live, rect, authored,
    delta: opts.delta, parent: opts.parent, size: opts.size,
    owner, content, children: [], parentNode: opts.parentNode,
    hostControlId: opts.hostControlId ?? null,
  });

  // A control instantiates its skin visual as its first child subtree.
  let childOwner = owner;
  if (kind === 'control') {
    childOwner = {
      text: p.str('Text'),
      pointSize: p.num('PointSize', E.POINT_SIZE_INHERIT),
      imagePath: p.str('ImagePath'),
    };
    const visualName = p.str('Visual');
    if (visualName) {
      const wrap = mountVisual(visualName, ctx, rect, childOwner, !p.bool('Enabled', true), record, id);
      if (wrap) el.appendChild(wrap);
      if (record) { record.visualWrap = wrap ?? null; record.visualOwner = childOwner; }
    }
  }

  // Authored children draw on top of the visual.
  const faded = p.num('Opacity', E.DEFAULT_OPACITY) < 1 ? (id || o.className) : (opts.fadedAncestor ?? null);
  appendChildren(el, o, ctx, rect, authored, childOwner, opts.frame ?? 0, record, opts.hostControlId ?? null, faded);
  if (record && (o.timelines.length || o.namedFrames.length)) ctx.nodes?.scope(o, record);
  return el;
}

/**
 * Resolve a visual by name and instantiate it. Exported because a control's
 * Visual is an ANIMATED property - dashmain drives BG_color_1, BG_color_2,
 * color_highlight_left/rt and blade_top_jewel through the blade palette as the
 * blades switch - so update.ts has to be able to swap one at runtime. The
 * palette visuals carry no timelines and no named frames of their own, so a
 * swap is a pure re-render with nothing to re-bind.
 */
export function mountVisual(
  name: string, ctx: RenderCtx, rect: Rect, owner: Owner, disabled: boolean,
  hostNode: NodeRecord | undefined, hostControlId: string,
): HTMLElement | null {
  const v = ctx.visuals.resolve(name);
  if (!v) { note(ctx.report.unresolvedVisuals, name); return null; }
  return instantiateVisual(v, ctx, rect, owner, disabled, hostNode, hostControlId);
}

/** A control's visual, parked on the frame of the state the control is in. */
function instantiateVisual(
  v: XuObject, ctx: RenderCtx, host: Rect, owner: Owner, disabled: boolean,
  hostNode: NodeRecord | undefined, hostControlId: string,
): HTMLElement {
  const wanted = disabled ? 'NormalDisable' : 'Normal';
  // Record the RESOLVED state, not the requested one: metaScene_1line has no
  // Normal and resolves down the fallback chain to Default, and a data
  // attribute that said "Normal" there would be a lie to anyone reading the DOM.
  const resolved = resolveState(v, wanted);
  const frame = resolved?.frame ?? 0;
  const wrap = document.createElement('div');
  wrap.dataset['xuiVisual'] = idOf(v);
  wrap.dataset['xuiState'] = resolved?.name ?? '(none)';
  wrap.dataset['xuiStateRequested'] = wanted;
  wrap.dataset['xuiFrame'] = String(frame);
  noteCodeDriven(v, ctx, resolved?.name ?? wanted, frame);
  wrap.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
  const el = renderElement(v, ctx, {
    overrides: NO_OVERRIDES, delta: NO_DELTA, owner,
    parent: host, size: { w: host.w, h: host.h }, frame,
    parentNode: hostNode, hostControlId,
  });
  if (el) wrap.appendChild(el);
  return wrap;
}

function appendChildren(
  el: HTMLElement, o: XuObject, ctx: RenderCtx, rect: Rect, authored: Rect, owner: Owner | null, frame: number,
  parentNode?: NodeRecord, hostControlId?: string | null, fadedAncestor?: string | null,
): void {
  if (o.children.length === 0) return;
  const sampled: Sampled = o.timelines.length ? sampleTimelines(o, frame) : new Map();
  const delta = childDelta(authored, rect);
  for (const c of o.children) {
    const child = renderElement(c, ctx, {
      overrides: sampled.get(idOf(c)) ?? NO_OVERRIDES,
      delta, parent: rect, owner, parentNode, hostControlId, fadedAncestor,
    });
    if (child) el.appendChild(child);
  }
}

/** The element container's whole style string. Shared by the first render and
 *  by update.ts so an animated element cannot drift from a static one. */
export function containerCss(p: PropBag, rect: Rect, blend: number): string {
  const pivot = p.vec('Pivot', E.DEFAULT_PIVOT);
  const scale = p.vec('Scale', E.DEFAULT_SCALE);
  const opacity = p.num('Opacity', E.DEFAULT_OPACITY);
  return [
    'position:absolute', 'left:0', 'top:0',
    `width:${fmt(rect.w)}px`, `height:${fmt(rect.h)}px`,
    `transform-origin:${fmt(pivot.x)}px ${fmt(pivot.y)}px`,
    `transform:${transform(rect, p, scale)}`,
    opacity === 1 ? '' : `opacity:${opacity}`,
    p.bool('Show', true) ? '' : 'display:none',
    p.bool('ClipChildren', false) ? 'overflow:hidden' : '',
    blendCss(blend),
  ].filter(Boolean).join(';');
}

/** The element's own paint: figure, image or text. Null for containers. */
export function contentFor(
  kind: Kind, p: PropBag, rect: Rect, ctx: RenderCtx, owner: Owner | null,
): Element | null {
  switch (kind) {
    case 'figure': return renderFigure(p, rect.w, rect.h, ctx);
    case 'image': case 'imagePresenter':
      return renderImage(p, rect.w, rect.h, ctx, owner?.imagePath ?? null, kind === 'image');
    case 'text': case 'textPresenter': {
      const t: TextOwner | null = owner ? { text: owner.text, pointSize: owner.pointSize } : null;
      return renderText(p, rect.w, rect.h, ctx, t, kind === 'text');
    }
    default: return null;
  }
}

export type { Owner };

function transform(rect: Rect, p: PropBag, scale: { x: number; y: number; z: number }): string {
  const parts = [`translate(${fmt(rect.x)}px, ${fmt(rect.y)}px)`];
  const q = p.quat('Rotation');
  if (q) {
    // A quaternion in a y-down screen space maps straight onto CSS rotate3d,
    // which is also y-down and clockwise-positive. 390 of the 403 rotations in
    // the corpus are about Z alone; 13 carry a real 3D tilt.
    const len = Math.hypot(q.x, q.y, q.z);
    const angle = 2 * Math.atan2(len, q.w);
    if (len > 1e-6 && Math.abs(angle) > 1e-6) {
      parts.push(`rotate3d(${fmt(q.x / len)}, ${fmt(q.y / len)}, ${fmt(q.z / len)}, ${fmt((angle * 180) / Math.PI)}deg)`);
    }
  }
  if (scale.x !== 1 || scale.y !== 1) parts.push(`scale(${fmt(scale.x)}, ${fmt(scale.y)})`);
  return parts.join(' ');
}

function blendCss(mode: number): string {
  const css = E.blendModeToCss(mode);
  return css ? `mix-blend-mode:${css}` : '';
}

function fallbackBox(o: XuObject, opts: Opts): HTMLElement {
  const p = PropBag.of(o, opts.overrides);
  const r = authoredRect(p);
  const el = document.createElement('div');
  el.dataset['xuiClass'] = o.className;
  el.dataset['xuiUnknown'] = 'true';
  el.style.cssText = [
    'position:absolute', 'left:0', 'top:0',
    `width:${fmt(r.w)}px`, `height:${fmt(r.h)}px`,
    `transform:translate(${fmt(r.x)}px, ${fmt(r.y)}px)`,
    'outline:1px dashed rgba(255,0,0,.9)',
  ].join(';');
  return el;
}

export type Kind = 'figure' | 'image' | 'imagePresenter' | 'text' | 'textPresenter' | 'sound' | 'control' | 'element';

/** The state a visual actually lands on, down the documented fallback chain. */
function resolveState(v: XuObject, wanted: string): { name: string; frame: number } | null {
  const seen = new Set<string>();
  let s: string | undefined = wanted;
  while (s && !seen.has(s)) {
    seen.add(s);
    const f = v.namedFrames.find((n) => n.name === s);
    if (f) return { name: s, frame: f.keyframe };
    s = E.VISUAL_STATE_FALLBACK[s];
  }
  return null;
}

/**
 * A visual whose resting state hides most of its own children is not finished
 * being drawn: console code plays a transition into the state you actually see.
 * metaScene_1line is the clear case - its resting frame is Default, where all
 * ten of its figures are Show=false, so the meta panel has no chrome until the
 * dashboard slides it in. Reported, never faked.
 */
function noteCodeDriven(v: XuObject, ctx: RenderCtx, state: string, frame: number): void {
  const total = v.children.length;
  if (total === 0) return;
  const sampled = frame === 0 && v.timelines.length === 0 ? new Map() : sampleTimelines(v, frame);
  let hidden = 0;
  for (const c of v.children) {
    const over = sampled.get(idOf(c));
    const show = over?.get('Show');
    const shown = typeof show === 'boolean' ? show : PropBag.of(c, NO_OVERRIDES).bool('Show', true);
    if (!shown) hidden++;
  }
  if (hidden * 2 > total) {
    const id = idOf(v);
    if (!ctx.report.codeDrivenStates.some((e) => e.visual === id && e.state === state)) {
      ctx.report.codeDrivenStates.push({ visual: id, state, frame, hidden, total });
    }
  }
}

export function classify(className: string): Kind {
  if (isA(className, 'XuiFigure')) return 'figure';
  if (isA(className, 'XuiImagePresenter')) return 'imagePresenter';
  if (isA(className, 'XuiImage')) return 'image';
  if (isA(className, 'XuiTextPresenter')) return 'textPresenter';
  if (isA(className, 'XuiText')) return 'text';
  if (isA(className, 'XuiSound')) return 'sound';
  if (isA(className, 'XuiControl')) return 'control';
  return 'element';
}

export function isA(className: string, base: string): boolean {
  const reg = xuiRegistry();
  if (!reg.has(className)) return false;
  return reg.hierarchy(className).some((c) => c.name === base);
}

const fmt = (v: number) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : 0);
