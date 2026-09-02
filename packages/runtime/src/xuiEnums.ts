// EVERY XUI enum interpretation lives here, one place to correct when the
// enum-research agent lands the real XUI_* constants.
//
// Each entry is marked:
//   DOCUMENTED  - taken from a schema that shipped with the tools
//                 (reference/xzp-tool/XuiElements.xml, the XuiTool class
//                 extension) or proven by the corpus itself.
//   INFERRED    - our reading of what the 263 scenes do. Correct me.
//
// The corpus test that proves a default: XUR omits a property whose value
// equals the class default, so a value that appears EXPLICITLY cannot be the
// default. Counts below come from tools/class-census.ts over all 7,125 objects.

/* ------------------------------------------------------------------ defaults */

/**
 * DOCUMENTED (XuiElements.xml + corpus). Width 60 / Height 30 are the
 * authoring defaults, and the corpus agrees: across 7,125 objects NO element
 * stores Width==60 or Height==30, which is only possible if the compiler
 * omits exactly those values.
 */
export const DEFAULT_WIDTH = 60;
export const DEFAULT_HEIGHT = 30;

/** DOCUMENTED (XuiElements.xml): Pivot 0,0,0; Scale 1,1,1; Show true; Anchor 0. */
export const DEFAULT_PIVOT = { x: 0, y: 0, z: 0 } as const;
export const DEFAULT_SCALE = { x: 1, y: 1, z: 1 } as const;

/**
 * INFERRED. XuiElements.xml writes `<DefaultVal>false</DefaultVal>` for
 * Opacity, which is a schema typo: a fully transparent default would make
 * every unstyled element invisible. 1.0 is the only value that renders the
 * corpus.
 */
export const DEFAULT_OPACITY = 1;

/** DOCUMENTED (XuiElements.xml): XuiText/XuiTextPresenter defaults. */
export const DEFAULT_POINT_SIZE = 14;
export const DEFAULT_TEXT_COLOR = { a: 0xff, r: 0, g: 0, b: 0 } as const;
export const DEFAULT_DROP_SHADOW_COLOR = { a: 0x80, r: 0, g: 0, b: 0 } as const;
export const DEFAULT_TEXT_STYLE = 16;

/**
 * INFERRED from the corpus. StrokeWidth appears explicitly as 1,2,3,4,5
 * (64 figures) and never as 0, while 427 Stroke blocks carry a colour and no
 * width at all. A default of 1 is impossible (1 is written explicitly), so
 * the default is 0 and those 427 figures draw no outline. Getting this wrong
 * puts a black hairline around a third of every scene.
 */
export const DEFAULT_STROKE_WIDTH = 0;

/* ------------------------------------------------------------------ FillType */

/**
 * XuiFigureFill.FillType. INFERRED from the corpus (3=1153, 2=648, 0=49,
 * 4=12) plus the shape of the sibling properties each value comes with.
 * The default is SOLID: FillType 0 is written explicitly 49 times, so 0 is
 * not the default, and 756 figures carry a FillColor with no FillType.
 */
export const FillType = {
  /** stroke only; the Fill block is present but paints nothing */
  NONE: 0,
  /** FillColor */
  SOLID: 1,
  /** Gradient block, Gradient.Radial false */
  LINEAR_GRADIENT: 2,
  /** Gradient block, Gradient.Radial true */
  RADIAL_GRADIENT: 3,
  /** TextureFileName */
  TEXTURE: 4,
} as const;
export const DEFAULT_FILL_TYPE = FillType.SOLID;

/* -------------------------------------------------------------------- Anchor */

/**
 * XuiElement.Anchor bit flags: which edges of a child keep their distance to
 * the parent when the parent is a different size than the child was authored
 * against (a control instantiating a skin visual).
 *
 * DOCUMENTED by measurement, not by a schema. tools-style sweep over every
 * element that sets Anchor, averaging its gap to each parent edge:
 *   0xc (n=131) gapR=19  gapB=-3   width 9% of parent -> RIGHT|BOTTOM
 *   0xe (n=60)  gapR=6   gapT=17 gapB=20             -> TOP|RIGHT|BOTTOM
 *   0xb (n=56)  gapL=13  gapT=17 gapB=21             -> LEFT|TOP|BOTTOM
 *   0x3 (n=53)  gapL=4   gapT=7                      -> LEFT|TOP
 *   0x9 (n=43)  gapL=0.5 gapB=0.4                    -> LEFT|BOTTOM
 *   0x5 (n=310) width 91% of parent                  -> LEFT|RIGHT
 * Every one of those is consistent with 1=LEFT 2=TOP 4=RIGHT 8=BOTTOM and
 * with nothing else.
 */
export const Anchor = {
  LEFT: 0x1,
  TOP: 0x2,
  RIGHT: 0x4,
  BOTTOM: 0x8,
  /** INFERRED. 0x10 and 0x20 appear on 9 elements in the whole corpus
   *  (0x10, 0x21, 0x24, 0x25) always paired with an edge bit of the OTHER
   *  axis, which is what a "stay centred on this axis" flag looks like. */
  HCENTER: 0x10,
  VCENTER: 0x20,
} as const;

/* ----------------------------------------------------------------- TextStyle */

/**
 * XuiText/XuiTextPresenter.TextStyle bit field. DOCUMENTED default is 16
 * (XuiElements.xml).
 *
 * Two bits are pinned by the skin itself, which ships one visual per
 * justification:
 *   XuiLabelRightJustify  -> 0x211   \  the only bit that separates them
 *   XuiLabelCenterJustify -> 0x401   /  is 0x200 vs 0x400
 *   XuiLabel (plain)      -> 0x4001
 * and the reference frame confirms it: legend_A/legend_B use 0x211 and
 * "Select"/"Back" are right-aligned against the button glyph.
 *
 * 0x4000 is INFERRED as vertical centring: it is on almost every one-line
 * label in a 47px row, and measuring "Current Setting" in the 6717 reference
 * frame puts its ink centred in the presenter's 47px box, not at its top.
 *
 * Bits 0x1, 0x4, 0x10, 0x100, 0x1000 are UNKNOWN. Observed values in full:
 * 0x4011 41, 0x4001 33, 0x5011 24, 0x4211 18, 0x1 12, 0x1415 12, 0x11 10,
 * 0x4411 8, 0x211 6, 0x4010 6, 0x401 5, 0x201 5, 0x4401 5, 0x5001 4,
 * 0x4111 4, 0x0 3, 0x4101 3, 0x5211 3, 0x100 3, and 12 more below 3.
 * Unknown bits are counted in window.__dash.unknownTextStyleBits.
 */
export const TextStyle = {
  HALIGN_RIGHT: 0x0200,
  HALIGN_CENTER: 0x0400,
  VALIGN_CENTER: 0x4000,
} as const;
/** Bits we claim to understand; everything else is reported, not silently eaten. */
export const KNOWN_TEXT_STYLE_BITS = TextStyle.HALIGN_RIGHT | TextStyle.HALIGN_CENTER | TextStyle.VALIGN_CENTER;

export function textAlign(style: number): 'left' | 'center' | 'right' {
  if (style & TextStyle.HALIGN_CENTER) return 'center';
  if (style & TextStyle.HALIGN_RIGHT) return 'right';
  return 'left';
}
export function textVAlign(style: number): 'flex-start' | 'center' {
  return style & TextStyle.VALIGN_CENTER ? 'center' : 'flex-start';
}

/* ------------------------------------------------------------------ SizeMode */

/**
 * XuiImage/XuiImagePresenter.SizeMode. DOCUMENTED default 0.
 * INFERRED beyond that, and honestly unobservable in this build: 73 images
 * set it (16 x37, 8 x33, 4 x2, 2 x1) and in 72 of the 73 the element's
 * Width/Height already equal the PNG's own pixel size, so stretch, centre and
 * fit all draw the same thing. The one case that differs is
 * `sharedres://livelogo.png` (160x100 source in a 400x110 element, SizeMode 2).
 * Until the enum research lands we stretch for every value and count each
 * SizeMode we see in window.__dash.sizeModesSeen.
 */
export const DEFAULT_SIZE_MODE = 0;
export function sizeModeToObjectFit(_mode: number): string {
  return 'fill';
}

/* ----------------------------------------------------------------- BlendMode */

/**
 * XuiElement.BlendMode. DOCUMENTED default 0. Corpus: 1 x258, 4 x32, 2 x22,
 * 5 x18, 3 x6 - and every value other than 1 lives in dashmain.xur or
 * dashskn1/2 BladeSkin.xur (boot bursts, blade jewels, the glass sheen), never
 * in a content scene.
 *
 * INFERRED and NOT verified: only 1 (ordinary alpha blending) is safe. The
 * rest render as normal and are counted in window.__dash.unknownBlendModes so
 * a wrong guess cannot quietly discolour the blades. Do not add guesses here
 * without a frame to check them against.
 */
export const BLEND_NORMAL = 1;
export function blendModeToCss(mode: number): string | null {
  return mode === 0 || mode === BLEND_NORMAL ? null : null;
}

/* ------------------------------------------------------------ DataAssociation */

/**
 * XuiTextPresenter/XuiImagePresenter.DataAssociation. DOCUMENTED default 0.
 * INFERRED: 0 means "the owning control's own Text / ImagePath". Non-zero
 * values select a secondary slot (a list item's second line, a gamercard
 * field) that only the runtime can fill; we render the primary slot and count
 * the value in window.__dash.dataAssociationsSeen.
 */
export const DATA_ASSOCIATION_PRIMARY = 0;
