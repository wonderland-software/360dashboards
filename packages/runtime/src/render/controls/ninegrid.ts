// XuiNineGrid -> CSS border-image.
//
// The class is `XuiNineGrid : XuiElement` with `TextureFileName, LeftOffset,
// TopOffset, RightOffset, BottomOffset, NoCenter` [registry, both builds]. A
// nine-grid is exactly what `border-image` is: the four offsets cut the source
// bitmap into nine pieces, the corners are drawn at their natural size, the
// four edges stretch along their axis and the middle fills (or, with
// `NoCenter`, does not).
//
// It draws nothing in build 6770 - no scene in that corpus carries one - so
// this renderer is reachable only on 9199, where `controlp/PanelScene.xur`'s
// `Shadow` (32x320, `PanelShadow.png`, Top/BottomOffset 100) is the drop shadow
// down every panel's right edge and eleven `firstrun` scenes carry more. The
// dispatch is gated on the build profile all the same.
import * as E from '../../xuiEnums';
import type { PropBag } from '../props';
import type { RenderCtx } from '../DomRenderer';
import { note } from '../../telemetry';

export function renderNineGrid(p: PropBag, w: number, h: number, ctx: RenderCtx): Element | null {
  const path = p.str('TextureFileName');
  if (!path) return null;
  // ColorWriteFlags is a XuiElement property and it is load-bearing here: the
  // `mobyslot*` visuals end with a nine-grid of `common://CornerMask.png` at
  // ColorWriteFlags 8, i.e. it writes the ALPHA channel only and no colour -
  // it rounds the panel's corners, it does not paint them. Drawing it as a
  // picture covers the whole slot. There is no destination-alpha write in the
  // DOM, so a colour-less nine-grid draws NOTHING and is recorded; the corners
  // stay square, which is a visible approximation and is in PLACEHOLDERS.md.
  const write = p.num('ColorWriteFlags', 15);
  if ((write & 7) === 0) {
    note(ctx.report.approximatedClasses, `XuiNineGrid#ColorWriteFlags=${write} (alpha-only mask, not drawn)`);
    return null;
  }
  const res = ctx.assets.resolveImage(ctx.pack, path);
  if (res.deviceFile) { note(ctx.report.deviceFiles, res.path); return null; }
  if (!res.url) { note(ctx.report.missingImages, res.path); return null; }

  const l = p.num('LeftOffset', 0);
  const t = p.num('TopOffset', 0);
  const r = p.num('RightOffset', 0);
  const b = p.num('BottomOffset', 0);
  const noCentre = p.bool('NoCenter', false);

  const el = document.createElement('div');
  el.dataset['xuiPaint'] = 'ninegrid';
  el.style.cssText = [
    'position:absolute', 'left:0', 'top:0',
    `width:${w}px`, `height:${h}px`,
    // border-width is what the slice is drawn INTO; the console draws each
    // corner at its source size, so the two agree when width == slice.
    `border-style:solid`,
    `border-width:${t}px ${r}px ${b}px ${l}px`,
    `border-image-source:url("${res.url}")`,
    `border-image-slice:${t} ${r} ${b} ${l}${noCentre ? '' : ' fill'}`,
    'border-image-repeat:stretch',
    'box-sizing:border-box',
    'pointer-events:none',
  ].join(';');
  void E.DEFAULT_OPACITY;
  return el;
}
