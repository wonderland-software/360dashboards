// XuiText / XuiTextPresenter / the text half of a labelled control.
//
// PointSize is in design-space pixels, not points: the canvas IS the coordinate
// system, so a PointSize of 22 is a 22px line in the 1120x770 space.
// XuiTextPresenter has no text of its own - it shows the OWNING control's Text,
// which is how one Label_Head visual serves 179 different labels.
import * as E from '../../xuiEnums';
import { PropBag, cssColour } from '../props';
import type { RenderCtx } from '../DomRenderer';
import { noteNum } from '../../telemetry';

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
  const size = ownerSize ?? p.num('PointSize', E.DEFAULT_POINT_SIZE);
  const colour = p.colour('TextColor', E.DEFAULT_TEXT_COLOR);
  const lineAdjust = p.num('LineSpacingAdjust', 0);

  const box = document.createElement('div');
  box.style.cssText = [
    'position:absolute', 'left:0', 'top:0',
    `width:${w}px`, `height:${h}px`,
    'display:flex', 'flex-direction:column',
    `justify-content:${E.textVAlign(style)}`,
    `font-family:${E.FONT_FALLBACK}`,
    `font-size:${size}px`,
    // XUI's line box is the em box; a browser adds leading, so pin it.
    `line-height:${size + lineAdjust}px`,
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
  span.style.cssText = 'width:100%';
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
