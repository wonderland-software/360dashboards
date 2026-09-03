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
    const t = unitTransformInUserSpace(fillMatrix(fill, w, h), w, h);
    if (t) pat.setAttribute('patternTransform', t);
    const img = document.createElementNS(SVG, 'image');
    img.setAttribute('href', res.url);
    img.setAttribute('x', '0'); img.setAttribute('y', '0');
    img.setAttribute('width', String(round(w))); img.setAttribute('height', String(round(h)));
    img.setAttribute('preserveAspectRatio', 'none');
    const mod = modulation(fill, E.MODULATE_TEXTURE_BY_FILLCOLOR);
    if (mod) img.setAttribute('filter', `url(#${tintFilter(defs, mod, w, h)})`);
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
      // Rotation 0 runs left to right (DOCUMENTED); the sign of a rotation is
      // part of the measured model, see GRADIENT_TRANSFORM.
      g.setAttribute('x1', '0'); g.setAttribute('y1', '0.5');
      g.setAttribute('x2', '1'); g.setAttribute('y2', '0.5');
    }
    g.setAttribute('gradientTransform', matrixCss(mul(scaleM(w, h), radial ? mul(fillMatrix(fill, w, h), radialBase(w, h)) : fillMatrix(fill, w, h))));
    const mod = modulation(fill, E.MODULATE_GRADIENT_BY_FILLCOLOR);
    const authored: Stop[] = [];
    for (let i = 0; i < n; i++) {
      const c = colours[i]; if (!c) continue;
      authored.push({
        off: clamp01(stops[i] ?? (n > 1 ? i / (n - 1) : 0)),
        r: mod ? Math.round(c.r * mod.r) : c.r,
        g: mod ? Math.round(c.g * mod.g) : c.g,
        b: mod ? Math.round(c.b * mod.b) : c.b,
        a: (c.a / 255) * (mod ? mod.a : 1),
      });
    }
    for (const st of resample(authored, E.GRADIENT_TRANSFORM.stopSpace)) {
      const s = document.createElementNS(SVG, 'stop');
      s.setAttribute('offset', String(st.off));
      s.setAttribute('stop-color', `rgb(${st.r},${st.g},${st.b})`);
      s.setAttribute('stop-opacity', st.a.toFixed(4));
      g.appendChild(s);
    }
    if (E.GRADIENT_TRANSFORM.stopSpace === 'linearRGB-attr') g.setAttribute('color-interpolation', 'linearRGB');
    defs.appendChild(g);
    path.setAttribute('fill', `url(#${id})`);
    return;
  }

  // A FillType we have never seen. Draw nothing and say so.
  note(ctx.report.unknownClasses, `XuiFigureFill.FillType=${type}`);
  path.setAttribute('fill', 'none');
}

/* ------------------------------------------------ gradient stop colour space
 *
 * SVG interpolates a gradient's stops in sRGB - it walks the stored BYTES.
 * The console's GPU did not: the Xenos reads a gamma surface through its
 * piecewise-linear "PWL" curve, interpolates and blends in that linear light,
 * and writes back through the inverse. GRADIENT_STOP_SPACE in xuiEnums.ts
 * says which space we interpolate in and carries the measurement.
 *
 * Rather than trust `color-interpolation` (which no engine implements for
 * gradients - the 'linearRGB-attr' member is here to MEASURE that, and it
 * renders identically to 'sRGB'), the two real members subdivide: each
 * authored segment gets STEPS-1 extra stops whose colours are mixed in the
 * chosen space and re-encoded to bytes. That works in every browser and it is
 * exact to a byte at 8 subdivisions, because the encoded curve is smooth
 * between stops and the browser's own sRGB lerp closes each 1/8 gap.
 *
 * Alpha is always mixed linearly in alpha, in both spaces; only the colour
 * moves. (Chrome premultiplies gradient stops, so a segment whose alpha AND
 * colour both change is still approximate at the sub-byte level.)
 */
type Stop = { off: number; r: number; g: number; b: number; a: number };
const STEPS = 8;

/** sRGB byte -> linear light, and back (IEC 61966-2-1). */
function srgbToLinear(v: number): number {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
function linearToSrgb(l: number): number {
  const c = l <= 0.0031308 ? l * 12.92 : 1.055 * l ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(c * 255)));
}

/**
 * The Xbox 360's PWL gamma, four segments, DOCUMENTED (AMD RRG-216M56-03
 * via Xenia's xenos.cc PWLGammaToLinear / LinearToPWLGamma, which reproduce
 * the Direct3D 9 disassembly and the Source Engine's X360 helpers). In 8-bit
 * code units e and 10-bit linear units L:
 *     e <   64   L = 1*e            e >= 128*... (inverse below)
 *    64 <= e < 96   L = 2*e -   64
 *    96 <= e < 192  L = 4*e -  256
 *   192 <= e        L = 8*e - 1024
 * then L += trunc(L * slope) with slope 1/1024, 2/1024, 4/1024, 8/1024, which
 * is what makes e=255 land on exactly L=1023. It is a gamma-2.0-ish curve with
 * NO linear toe, so it is much brighter than sRGB near black (e=32 gives
 * 0.031 against sRGB's 0.016) and slightly darker at the top (e=192 gives
 * 0.502 against 0.527).
 */
function pwlToLinear(e: number): number {
  const v = Math.max(0, Math.min(255, e));
  const [k, off, slope] = v < 64 ? [1, 0, 1 / 1024]
    : v < 96 ? [2, -64, 2 / 1024]
      : v < 192 ? [4, -256, 4 / 1024]
        : [8, -1024, 8 / 1024];
  let l = k * v + off;
  l += Math.trunc(l * slope);
  return l / 1023;
}
function linearToPwl(l: number): number {
  const v = Math.max(0, Math.min(1, l));
  const [scale, off] = v < 64 / 1023 ? [1023, 0]
    : v < 128 / 1023 ? [1023 / 2, 32]
      : v < 512 / 1023 ? [1023 / 4, 64]
        : [1023 / 8, 128];
  return Math.max(0, Math.min(255, Math.trunc(v * scale) + off));
}

/** Authored stops -> the stops we emit, subdividing when the space is not sRGB. */
function resample(src: Stop[], space: E.GradientStopSpace): Stop[] {
  if (space !== 'linear' && space !== 'pwl') return src;
  const dec = space === 'pwl' ? pwlToLinear : srgbToLinear;
  const enc = space === 'pwl' ? (l: number) => linearToPwl(l) : linearToSrgb;
  const out: Stop[] = [];
  for (let i = 0; i < src.length; i++) {
    const a = src[i]!;
    out.push(a);
    const b = src[i + 1];
    // A hard stop (two stops at one offset) and a constant segment need no
    // intermediate stops, and inserting any into a hard stop would erase it.
    if (!b || b.off <= a.off) continue;
    if (a.r === b.r && a.g === b.g && a.b === b.b) continue;
    const [ar, ag, ab] = [dec(a.r), dec(a.g), dec(a.b)];
    const [br, bg, bb] = [dec(b.r), dec(b.g), dec(b.b)];
    for (let k = 1; k < STEPS; k++) {
      const t = k / STEPS;
      out.push({
        off: a.off + (b.off - a.off) * t,
        r: enc(ar + (br - ar) * t), g: enc(ag + (bg - ag) * t), b: enc(ab + (bb - ab) * t),
        a: a.a + (b.a - a.a) * t,
      });
    }
  }
  return out;
}

/**
 * A FillColor stored ALONGSIDE a texture or gradient fill, read as a
 * modulation. Both switches are 'off' and the measurement that refuses them is
 * in xuiEnums.ts; the code stays so the table can be regenerated. Only an
 * EXPLICIT FillColor modulates - the SOLID default 15,15,128 would otherwise
 * tint every fill in the build - and an opaque white is no modulation at all.
 */
function modulation(fill: PropBag, mode: E.FillColorModulation): { r: number; g: number; b: number; a: number } | null {
  if (mode === 'off' || !fill.has('FillColor')) return null;
  const c = fill.colour('FillColor', E.DEFAULT_FILL_COLOR);
  const a = mode === 'rgba' ? c.a / 255 : 1;
  if (c.r === 255 && c.g === 255 && c.b === 255 && a === 1) return null;
  return { r: c.r / 255, g: c.g / 255, b: c.b / 255, a };
}

/** A multiply-by-constant as a filter, in sRGB (the default is linearRGB, which
 *  would not be a multiply of the stored bytes). Returns the filter's id. */
function tintFilter(defs: SVGDefsElement, m: { r: number; g: number; b: number; a: number }, w: number, h: number): string {
  const id = `mod${uid++}`;
  const f = document.createElementNS(SVG, 'filter');
  f.setAttribute('id', id);
  f.setAttribute('filterUnits', 'userSpaceOnUse');
  f.setAttribute('x', '0'); f.setAttribute('y', '0');
  f.setAttribute('width', String(round(w))); f.setAttribute('height', String(round(h)));
  f.setAttribute('color-interpolation-filters', 'sRGB');
  const cm = document.createElementNS(SVG, 'feColorMatrix');
  cm.setAttribute('type', 'matrix');
  cm.setAttribute('values', `${m.r} 0 0 0 0  0 ${m.g} 0 0 0  0 0 ${m.b} 0 0  0 0 0 ${m.a} 0`);
  f.appendChild(cm);
  defs.appendChild(f);
  return id;
}

/** A 2x3 affine matrix [a b c d e f] in SVG's column convention. */
type M = [number, number, number, number, number, number];
const I: M = [1, 0, 0, 1, 0, 0];
const mul = (p: M, q: M): M => [
  p[0] * q[0] + p[2] * q[1], p[1] * q[0] + p[3] * q[1],
  p[0] * q[2] + p[2] * q[3], p[1] * q[2] + p[3] * q[3],
  p[0] * q[4] + p[2] * q[5] + p[4], p[1] * q[4] + p[3] * q[5] + p[5],
];
const translateM = (x: number, y: number): M => [1, 0, 0, 1, x, y];
const scaleM = (x: number, y: number): M => [x, 0, 0, y, 0, 0];
function rotateM(deg: number): M {
  const a = (deg * Math.PI) / 180;
  return [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
}
function invert(m: M): M {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det) return I;
  const a = m[3] / det, b = -m[1] / det, c = -m[2] / det, d = m[0] / det;
  return [a, b, c, d, -(a * m[4] + c * m[5]), -(b * m[4] + d * m[5])];
}
const matrixCss = (m: M) => `matrix(${m.map(round6).join(' ')})`;

/**
 * Fill.Translation / Fill.Scale / Fill.Rotation as one matrix in the
 * normalised (0..1) fill space, mapping GRADIENT space onto the box (the sense
 * SVG's gradientTransform wants). Every choice in here is a field of
 * GRADIENT_TRANSFORM, measured by tests/smoke/sweep-gradient.mjs; Scale
 * defaults to 1,1 (DOCUMENTED) and may be negative, which mirrors.
 */
export function fillMatrix(fill: PropBag, w: number, h: number): M {
  const model = E.GRADIENT_TRANSFORM;
  const t = fill.vec('Translation', { x: 0, y: 0, z: 0 });
  const s = fill.vec('Scale', { x: 1, y: 1, z: 1 });
  const r = fill.num('Rotation', 0);
  if (t.x === 0 && t.y === 0 && s.x === 1 && s.y === 1 && r === 0) return I;
  const tx = model.translation === 'box' ? t.x : (w ? t.x / w : 0);
  const ty = model.translation === 'box' ? t.y : (h ? t.y / h : 0);
  const T = translateM(tx, ty);
  const R = rotateM(model.rotation * r);
  const S = scaleM(s.x || 1e-6, s.y || 1e-6);
  // The composite applied to a point of the box, in the texture direction:
  // 'SRT' scales first, then rotates, then translates - so Scale acts along
  // the BOX's axes and a rotation carries the scaled box into gradient space.
  // 'RST' rotates first, which is what "the scale acts along the gradient's
  // own axis" would mean; 'TRS' translates first. Only SRT survives the wing
  // measurement in GRADIENT_TRANSFORM, and only a rotated, non-uniformly
  // scaled fill can tell the three apart.
  const applied =
    model.order === 'SRT' ? mul(T, mul(R, S)) :
    model.order === 'RST' ? mul(T, mul(S, R)) :
    mul(S, mul(R, T));
  const about = model.origin === 'centre' ? translateM(0.5, 0.5) : I;
  const m = mul(about, mul(applied, invert(about)));
  // Texture direction maps box -> gradient; SVG wants gradient -> box.
  return model.direction === 'texture' ? invert(m) : m;
}

/** The resting radial gradient's shape, as a matrix on the unit circle of
 *  radius 0.5 about (0.5,0.5): an inscribed ellipse ('axis') is the identity
 *  under the leading scale(w,h); a circle of R px needs the aspect undone. */
function radialBase(w: number, h: number): M {
  const kind = E.GRADIENT_TRANSFORM.radial;
  if (kind === 'axis' || !w || !h) return I;
  const R = kind === 'max' ? Math.max(w, h) : kind === 'min' ? Math.min(w, h) : kind === 'width' ? w : h;
  return mul(translateM(0.5, 0.5), mul(scaleM(R / w, R / h), translateM(-0.5, -0.5)));
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
function unitTransformInUserSpace(t: M, w: number, h: number): string | null {
  if (t === I) return null;
  const iw = w ? 1 / w : 1;
  const ih = h ? 1 / h : 1;
  return matrixCss(mul(scaleM(w, h), mul(t, scaleM(iw, ih))));
}
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }
