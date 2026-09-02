// XuiFigure -> inline SVG. 2,264 of the 7,125 objects in build 6770 are
// figures; they are the dashboard's entire vector look.
//
// Geometry. Points are (point, control1, control2) triples: segment i is the
// cubic from P_i with handles C1_i and C2_i to P_(i+1), and a straight segment
// stores C1_i = P_i and C2_i = P_(i+1) (which is why 1,782 of the figures are
// plain 4-point rectangles). Closed is true on every figure in this build.
//
// The points live in their own space whose extent is the stored bounding box,
// and the figure is drawn scaled to the element's Width x Height. See
// FIGURE_POINTS_ARE_SCALED_TO_BOX in xuiEnums.ts for the two measurements
// against reference/frames/6717/f0060.png that establish it. A few figures
// carry points outside the bounding box (12 with negative coordinates), so the
// SVG never clips.
import type { XuFigure } from '@xur/index';
import * as E from '../../xuiEnums';
import { PropBag, cssColour } from '../props';
import type { RenderCtx } from '../DomRenderer';
import { note } from '../../telemetry';

const SVG = 'http://www.w3.org/2000/svg';
let uid = 0;

export function renderFigure(p: PropBag, w: number, h: number, ctx: RenderCtx): SVGSVGElement | null {
  const fig = p.figure('Points');
  if (!fig || fig.points.length === 0) return null;

  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('width', String(w));
  svg.setAttribute('height', String(h));
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.style.cssText = 'position:absolute;left:0;top:0;overflow:visible;display:block';

  const path = document.createElementNS(SVG, 'path');
  path.setAttribute('d', pathData(fig, w, h, p.bool('Closed', false)));
  path.setAttribute('shape-rendering', 'geometricPrecision');

  const defs = document.createElementNS(SVG, 'defs');
  const { sx, sy } = figureScale(fig, w, h);
  applyFill(path, defs, p, ctx, w, h);
  applyStroke(path, p, sx, sy);
  if (defs.childNodes.length) svg.appendChild(defs);
  svg.appendChild(path);
  return svg;
}

/** Scale from figure-point space to the element box. A zero-extent axis is
 *  drawn 1:1 rather than divided by zero (19 figures in the corpus). */
export function figureScale(fig: XuFigure, w: number, h: number): { sx: number; sy: number } {
  return {
    sx: fig.boundingBox.x ? w / fig.boundingBox.x : 1,
    sy: fig.boundingBox.y ? h / fig.boundingBox.y : 1,
  };
}

function pathData(fig: XuFigure, w: number, h: number, closed: boolean): string {
  const { sx, sy } = figureScale(fig, w, h);
  const X = (v: number) => round(v * sx);
  const Y = (v: number) => round(v * sy);
  const pts = fig.points;
  let d = `M ${X(pts[0]!.point.x)} ${Y(pts[0]!.point.y)}`;
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i]!;
    const next = pts[(i + 1) % pts.length];
    if (i === pts.length - 1 && !closed) break;
    if (!next) break;
    d += ` C ${X(cur.control1.x)} ${Y(cur.control1.y)} ${X(cur.control2.x)} ${Y(cur.control2.y)} ${X(next.point.x)} ${Y(next.point.y)}`;
  }
  if (closed) d += ' Z';
  return d;
}
const round = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Gradients and textures are laid out against the ELEMENT box, not the path's
 * own bounding box. SVG's objectBoundingBox units mean the PATH's bbox, and 27
 * figures carry points outside their stored box (12 of them with negative
 * coordinates), so those two boxes are not the same and objectBoundingBox
 * mis-scales the fill. Everything below therefore works in a unit space that a
 * scale(w,h) maps onto the element box - the same normalised 0..1 space the
 * Fill.Translation / Scale / Rotation transform is written in.
 */
function applyFill(path: SVGPathElement, defs: SVGDefsElement, p: PropBag, ctx: RenderCtx, w: number, h: number): void {
  // 30 figures store no Fill block at all. XUR omits a property that equals its
  // default, so "absent" means the DEFAULT fill - solid, in the default colour -
  // not "no fill". Only FillType 0 means nothing is painted.
  const fill = p.compound('Fill');
  if (!fill) { path.setAttribute('fill', cssColour(E.DEFAULT_FILL_COLOR)); return; }
  const type = fill.num('FillType', E.DEFAULT_FILL_TYPE);

  if (type === E.FillType.NONE) { path.setAttribute('fill', 'none'); return; }

  if (type === E.FillType.SOLID) {
    const c = fill.colour('FillColor', E.DEFAULT_FILL_COLOR);
    path.setAttribute('fill', cssColour(c));
    return;
  }

  if (type === E.FillType.TEXTURE) {
    const file = fill.str('TextureFileName');
    const res = ctx.assets.resolveImage(ctx.pack, file);
    if (res.deviceFile) { note(ctx.report.deviceFiles, res.path); path.setAttribute('fill', 'none'); return; }
    if (!res.url) { note(ctx.report.missingImages, file); path.setAttribute('fill', 'none'); return; }
    const id = `tex${uid++}`;
    const pat = document.createElementNS(SVG, 'pattern');
    pat.setAttribute('id', id);
    // The texture covers the figure's box; UVs run 0..1 over it, so the fill
    // transform below is expressed in the same normalised space.
    pat.setAttribute('patternUnits', 'userSpaceOnUse');
    pat.setAttribute('x', '0'); pat.setAttribute('y', '0');
    pat.setAttribute('width', String(round(w)));
    pat.setAttribute('height', String(round(h)));
    const t = unitTransformInUserSpace(fillTransform(fill), w, h);
    if (t) pat.setAttribute('patternTransform', t);
    const img = document.createElementNS(SVG, 'image');
    img.setAttribute('href', res.url);
    img.setAttribute('x', '0'); img.setAttribute('y', '0');
    img.setAttribute('width', String(round(w))); img.setAttribute('height', String(round(h)));
    img.setAttribute('preserveAspectRatio', 'none');
    pat.appendChild(img);
    defs.appendChild(pat);
    path.setAttribute('fill', `url(#${id})`);
    return;
  }

  if (type === E.FillType.LINEAR_GRADIENT || type === E.FillType.RADIAL_GRADIENT) {
    const grad = fill.compound('Gradient');
    if (!grad) { path.setAttribute('fill', 'none'); return; }
    const radial = grad.bool('Radial', false) || type === E.FillType.RADIAL_GRADIENT;
    const colours = (grad.indexed('StopColor') ?? []) as { a: number; r: number; g: number; b: number }[];
    const stops = (grad.indexed('StopPos') ?? []) as number[];
    const n = Math.max(grad.num('NumStops', colours.length), colours.length);
    const id = `grd${uid++}`;
    const g = document.createElementNS(SVG, radial ? 'radialGradient' : 'linearGradient');
    g.setAttribute('id', id);
    // Unit coordinates, mapped onto the element box by the leading scale(w,h).
    g.setAttribute('gradientUnits', 'userSpaceOnUse');
    if (radial) {
      g.setAttribute('cx', '0.5'); g.setAttribute('cy', '0.5'); g.setAttribute('r', '0.5');
    } else {
      // Rotation 0 runs left to right; 90 runs top to bottom (DOCUMENTED).
      g.setAttribute('x1', '0'); g.setAttribute('y1', '0.5');
      g.setAttribute('x2', '1'); g.setAttribute('y2', '0.5');
    }
    g.setAttribute('gradientTransform', `scale(${round(w)} ${round(h)}) ${fillTransform(fill) ?? ''}`.trim());
    for (let i = 0; i < n; i++) {
      const c = colours[i]; if (!c) continue;
      const s = document.createElementNS(SVG, 'stop');
      s.setAttribute('offset', String(clamp01(stops[i] ?? (n > 1 ? i / (n - 1) : 0))));
      s.setAttribute('stop-color', `rgb(${c.r},${c.g},${c.b})`);
      s.setAttribute('stop-opacity', (c.a / 255).toFixed(4));
      g.appendChild(s);
    }
    defs.appendChild(g);
    path.setAttribute('fill', `url(#${id})`);
    return;
  }

  // A FillType we have never seen. Draw nothing and say so.
  note(ctx.report.unknownClasses, `XuiFigureFill.FillType=${type}`);
  path.setAttribute('fill', 'none');
}

/**
 * Fill.Translation / Fill.Scale / Fill.Rotation as one SVG transform in the
 * normalised (0..1) fill space. Rotation is in degrees about the centre of the
 * box (GRADIENT_ROTATION_ORIGIN); translation is a fraction of the box.
 * Scale defaults to 1,1 (DOCUMENTED) and may be negative, which mirrors.
 */
function fillTransform(fill: PropBag): string | null {
  const t = fill.vec('Translation', { x: 0, y: 0, z: 0 });
  const s = fill.vec('Scale', { x: 1, y: 1, z: 1 });
  const r = fill.num('Rotation', 0);
  if (t.x === 0 && t.y === 0 && s.x === 1 && s.y === 1 && r === 0) return null;
  const o = E.GRADIENT_ROTATION_ORIGIN;
  return `translate(${round(t.x)} ${round(t.y)}) translate(${o.x} ${o.y}) rotate(${round(r)}) scale(${round(s.x)} ${round(s.y)}) translate(${-o.x} ${-o.y})`;
}

function applyStroke(path: SVGPathElement, p: PropBag, sx: number, sy: number): void {
  const st = p.compound('Stroke');
  if (!st) { path.setAttribute('stroke', 'none'); return; }
  const w = st.num('StrokeWidth', E.DEFAULT_STROKE_WIDTH);
  if (w <= 0) { path.setAttribute('stroke', 'none'); return; }
  path.setAttribute('stroke', cssColour(st.colour('StrokeColor', E.DEFAULT_STROKE_COLOR)));
  // The width is authored in point space alongside the points, so it scales
  // with them; SVG has one width, so use the geometric mean of the two axes.
  // INFERRED - see SCALE_STROKE_WITH_FIGURE.
  path.setAttribute('stroke-width', String(round(E.SCALE_STROKE_WITH_FIGURE ? w * Math.sqrt(Math.abs(sx * sy)) : w)));
}

/** A unit-space transform T, conjugated into user space: S T S-1 with S = scale(w,h). */
function unitTransformInUserSpace(t: string | null, w: number, h: number): string | null {
  if (!t) return null;
  const iw = w ? 1 / w : 1;
  const ih = h ? 1 / h : 1;
  return `scale(${round(w)} ${round(h)}) ${t} scale(${round6(iw)} ${round6(ih)})`;
}
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }
