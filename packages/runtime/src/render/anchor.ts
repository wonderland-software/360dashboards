// XUI anchoring.
//
// The only time it does anything is when an element's parent is a different
// size than the element was authored against - which happens exactly when a
// XuiControl instantiates a skin visual: legend_A is authored 420 wide, and
// scCslSettings' labHeader is 855 wide, so a XuiTextPresenter anchored
// LEFT|RIGHT inside it has to grow by 435.
//
// The delta cascades: a child that absorbs the delta into its own width hands
// that new delta to ITS children, which is how a stretched button visual keeps
// its separator lines the full width of the row.
import { Anchor } from '../xuiEnums';
import type { Rect } from './props';

export interface Delta { dw: number; dh: number }
export const NO_DELTA: Delta = { dw: 0, dh: 0 };

interface Span { pos: number; size: number }

/**
 * Bit meanings are DOCUMENTED (and independently measured, see xuiEnums.ts);
 * how each combination absorbs the delta is INFERRED, WinForms-shaped:
 *   LEFT|RIGHT   position fixed, size takes the whole delta
 *   RIGHT only   position shifts by the whole delta, size fixed
 *   LEFT only    nothing moves
 *   HCENTER      position shifts by half the delta
 *   XSCALE       position and size scale proportionally
 *   none set     treated as LEFT|TOP, i.e. nothing moves
 */
export function applyAnchor(r: Rect, anchor: number, d: Delta, parent: Rect): Rect {
  const x = axis({ pos: r.x, size: r.w }, d.dw, parent.w,
    anchor & Anchor.LEFT, anchor & Anchor.RIGHT, anchor & Anchor.HCENTER, anchor & Anchor.XSCALE);
  const y = axis({ pos: r.y, size: r.h }, d.dh, parent.h,
    anchor & Anchor.TOP, anchor & Anchor.BOTTOM, anchor & Anchor.VCENTER, anchor & Anchor.YSCALE);
  return { x: x.pos, y: y.pos, w: x.size, h: y.size };
}

function axis(s: Span, delta: number, parentSize: number, near: number, far: number, centre: number, scale: number): Span {
  if (delta === 0) return s;
  if (scale) {
    const authored = parentSize - delta;
    const k = authored === 0 ? 1 : parentSize / authored;
    return { pos: s.pos * k, size: s.size * k };
  }
  if (near && far) return { pos: s.pos, size: s.size + delta };
  if (far) return { pos: s.pos + delta, size: s.size };
  if (centre) return { pos: s.pos + delta / 2, size: s.size };
  return s;
}

/** The delta an element hands to its own children. */
export function childDelta(authored: Rect, actual: Rect): Delta {
  return { dw: actual.w - authored.w, dh: actual.h - authored.h };
}
