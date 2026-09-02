// XuiText / XuiTextPresenter / the text half of a labelled control.
//
// PointSize is a point size, not a pixel height: one design pixel is smaller
// than one point, and the measured conversion is POINT_SIZE_TO_DESIGN_PX
// (see xuiEnums.ts for the two-axis derivation off the reference frame).
// XuiTextPresenter has no text of its own - it shows the OWNING control's Text,
// which is how one Label_Head visual serves 179 different labels.
import * as E from '../../xuiEnums';
import { PropBag, cssColour } from '../props';
import type { RenderCtx } from '../DomRenderer';
import { noteNum } from '../../telemetry';

/**
 * The line box XUI uses is the FONT's own ascent+descent, not the em box.
 * MEASURED: in f0060 the "Console Settings" baseline sits 30.7 design px below
 * the top of its 47px box; ConvectionUI's ascent is 1.015 em and its em there
 * is 30.56 design px, so baseline = box top + ascent to within 1%. Reading the
 * numbers off the face itself rather than hard-coding 1.215 keeps this true
 * when the JK face or a later build's font is used.
 */
let metrics: { ascent: number; descent: number } | null = null;
function lineBox(): { ascent: number; descent: number } {
  if (metrics) return metrics;
  const c = document.createElement('canvas').getContext('2d');
  if (!c) return (metrics = { ascent: 1, descent: 0.25 });
  c.font = `1000px ${E.FONT_FALLBACK}`;
  const m = c.measureText('Hg');
  metrics = { ascent: m.fontBoundingBoxAscent / 1000, descent: m.fontBoundingBoxDescent / 1000 };
  return metrics;
}

export interface TextOwner {
  text: string;
  /** XuiControl.PointSize, -1 when the control defers to the visual. */
  pointSize: number;
}

export function renderText(
  p: PropBag, w: number, h: number, ctx: RenderCtx, owner: TextOwner | null, ownText: boolean,
): HTMLElement {
  const style = p.num('TextStyle', E.DEFAULT_TEXT_STYLE);
  const unknownBits = style & ~E.KNOWN_TEXT_STYLE_BITS;
  if (unknownBits) noteNum(ctx.report.unknownTextStyleBits, unknownBits);

  if (!ownText && owner) {
    const assoc = p.num('DataAssociation', E.DATA_ASSOCIATION_PRIMARY);
    noteNum(ctx.report.dataAssociationsSeen, assoc);
  }

  const text = ownText ? p.str('Text') : (owner?.text ?? '');
  // XuiControl.PointSize wins over the visual's when the control sets it.
  const ownerSize = owner && owner.pointSize !== E.POINT_SIZE_INHERIT ? owner.pointSize : null;
  const points = ownerSize ?? p.num('PointSize', E.DEFAULT_POINT_SIZE);
  const size = points * E.POINT_SIZE_TO_DESIGN_PX;
  const colour = p.colour('TextColor', E.DEFAULT_TEXT_COLOR);
  const lineAdjust = p.num('LineSpacingAdjust', 0);

  const lb = lineBox();
  const lh = size * (lb.ascent + lb.descent) + lineAdjust;

  const box = document.createElement('div');
  // Tag it: a text paint box is a DIV whose children are DIVs, so a
  // "does this subtree paint anything" walk has no other way to tell it apart
  // from an empty container.
  box.dataset['xuiPaint'] = 'text';
  box.style.cssText = [
    'position:absolute', 'left:0', 'top:0',
    `width:${w}px`, `height:${h}px`,
    'display:flex', 'flex-direction:column',
    `justify-content:${E.textVAlign(style)}`,
    `font-family:${E.FONT_FALLBACK}`,
    `font-size:${size}px`,
    // Pinned to the face's own ascent+descent (see lineBox above) so the first
    // baseline lands where the console puts it; LineSpacingAdjust is in the
    // same design pixels.
    `line-height:${lh}px`,
    `color:${cssColour(colour)}`,
    `text-align:${E.textAlign(style)}`,
    style & E.TextStyle.SINGLE_LINE ? 'white-space:pre' : 'white-space:pre-wrap',
    style & E.TextStyle.ITALIC ? 'font-style:italic' : 'font-style:normal',
    style & E.TextStyle.BOLD ? 'font-weight:700' : 'font-weight:400',
    style & E.TextStyle.UNDERLINE ? 'text-decoration:underline' : '',
    'overflow:hidden',
  ].filter(Boolean).join(';');

  const span = document.createElement('div');
  span.textContent = text;
  // MEASURED: the console rasterises glyphs isotropically at the canvas's
  // HORIZONTAL scale, so inside our anisotropic canvas they need a vertical
  // counter-scale of sy/sx. Scaling about the TOP of the line block keeps a
  // top-aligned baseline where it belongs; about the block's CENTRE keeps a
  // vertically centred block centred, since the browser centres the unscaled
  // box and the scale is symmetric about that centre.
  const vcentre = (style & E.TextStyle.VALIGN_CENTER) !== 0;
  span.style.cssText = [
    'width:100%',
    `transform:scaleY(${E.GLYPH_ASPECT})`,
    `transform-origin:0 ${vcentre ? '50%' : '0'}`,
  ].join(';');
  if (style & E.TextStyle.ELLIPSIS) {
    span.style.overflow = 'hidden';
    span.style.textOverflow = 'ellipsis';
    if (style & E.TextStyle.SINGLE_LINE) span.style.whiteSpace = 'nowrap';
  }
  if (style & E.TextStyle.DROP_SHADOW) {
    // INFERRED offset. The bit and the colour are documented; XUI's shadow
    // displacement is not, and one design-space pixel down-right is what the
    // 6717 frames look like at 1.7x.
    const s = p.colour('DropShadowColor', E.DEFAULT_DROP_SHADOW_COLOR);
    span.style.textShadow = `1px 1px 0 ${cssColour(s)}`;
  }
  box.appendChild(span);
  return box;
}
