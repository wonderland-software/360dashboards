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
import { renderFigure } from './controls/figure';
import { renderImage } from './controls/image';
import { renderText, type TextOwner } from './controls/text';

export interface RenderCtx {
  assets: AssetIndex;
  /** The pack the scene came from; bare image paths resolve against it. */
  pack: string;
  visuals: VisualScope;
  report: SceneReport;
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
}

export function renderScene(root: XuObject, ctx: RenderCtx): HTMLElement {
  const host = document.createElement('div');
  host.className = 'xui-root';
  host.style.cssText = `position:relative;width:${E.CANVAS_WIDTH}px;height:${E.CANVAS_HEIGHT}px;overflow:hidden`;
  const el = renderElement(root, ctx, {
    overrides: NO_OVERRIDES, delta: NO_DELTA, owner: null,
    parent: { x: 0, y: 0, w: E.CANVAS_WIDTH, h: E.CANVAS_HEIGHT },
  });
  if (el) host.appendChild(el);
  return host;
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

  const p = PropBag.of(o, opts.overrides);
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
  }

  const pivot = p.vec('Pivot', E.DEFAULT_PIVOT);
  const scale = p.vec('Scale', E.DEFAULT_SCALE);
  const opacity = p.num('Opacity', E.DEFAULT_OPACITY);
  el.style.cssText = [
    'position:absolute', 'left:0', 'top:0',
    `width:${fmt(rect.w)}px`, `height:${fmt(rect.h)}px`,
    `transform-origin:${fmt(pivot.x)}px ${fmt(pivot.y)}px`,
    `transform:${transform(rect, p, scale)}`,
    opacity === 1 ? '' : `opacity:${opacity}`,
    p.bool('Show', true) ? '' : 'display:none',
    p.bool('ClipChildren', false) ? 'overflow:hidden' : '',
    blendCss(blend),
  ].filter(Boolean).join(';');

  // The element's own paint.
  const owner = opts.owner;
  switch (kind) {
    case 'figure': {
      const svg = renderFigure(p, rect.w, rect.h, ctx);
      if (svg) el.appendChild(svg);
      break;
    }
    case 'image': case 'imagePresenter': {
      const img = renderImage(p, rect.w, rect.h, ctx, owner?.imagePath ?? null, kind === 'image');
      if (img) el.appendChild(img);
      break;
    }
    case 'text': case 'textPresenter': {
      const t: TextOwner | null = owner ? { text: owner.text, pointSize: owner.pointSize } : null;
      el.appendChild(renderText(p, rect.w, rect.h, ctx, t, kind === 'text'));
      break;
    }
    default: break;
  }

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
      const v = ctx.visuals.resolve(visualName);
      if (!v) note(ctx.report.unresolvedVisuals, visualName);
      else el.appendChild(instantiateVisual(v, ctx, rect, childOwner, !p.bool('Enabled', true)));
    }
  }

  // Authored children draw on top of the visual.
  appendChildren(el, o, ctx, rect, authored, childOwner, opts.frame ?? 0);
  return el;
}

/** A control's visual, parked on the frame of the state the control is in. */
function instantiateVisual(v: XuObject, ctx: RenderCtx, host: Rect, owner: Owner, disabled: boolean): HTMLElement {
  const wanted = disabled ? 'NormalDisable' : 'Normal';
  const frame = stateFrame(v, wanted) ?? 0;
  const wrap = document.createElement('div');
  wrap.dataset['xuiVisual'] = idOf(v);
  wrap.dataset['xuiState'] = wanted;
  wrap.dataset['xuiFrame'] = String(frame);
  wrap.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%';
  const el = renderElement(v, ctx, {
    overrides: NO_OVERRIDES, delta: NO_DELTA, owner,
    parent: host, size: { w: host.w, h: host.h }, frame,
  });
  if (el) wrap.appendChild(el);
  return wrap;
}

function appendChildren(
  el: HTMLElement, o: XuObject, ctx: RenderCtx, rect: Rect, authored: Rect, owner: Owner | null, frame: number,
): void {
  if (o.children.length === 0) return;
  const sampled: Sampled = o.timelines.length ? sampleTimelines(o, frame) : new Map();
  const delta = childDelta(authored, rect);
  for (const c of o.children) {
    const child = renderElement(c, ctx, {
      overrides: sampled.get(idOf(c)) ?? NO_OVERRIDES,
      delta, parent: rect, owner,
    });
    if (child) el.appendChild(child);
  }
}

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
