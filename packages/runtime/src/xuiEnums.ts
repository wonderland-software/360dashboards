// EVERY XUI enum interpretation lives here, so that one file changes when the
// numbers are corrected. Each entry is marked:
//
//   DOCUMENTED - from a shipped schema (reference/xzp-tool/XuiElements.xml,
//                the XuiTool class extension) or from the leaked XDK headers
//                XamXuiElement.h / XamXuiApp.h, cross-checked against 6770.
//   MEASURED   - proven here against the 263-scene corpus or against a
//                1920x1080 reference frame; the measurement is written down.
//   INFERRED   - our reading. Correct me.
//
// Corpus test used repeatedly below: XUR omits a property whose value equals
// the class default, so a value that appears EXPLICITLY cannot be the default.

/* ------------------------------------------------------------------ defaults */

/**
 * DOCUMENTED (XuiElements.xml) and MEASURED: Width 60 / Height 30. Across all
 * 7,125 objects NO element stores Width==60 or Height==30, which is only
 * possible if the compiler omits exactly those values.
 */
export const DEFAULT_WIDTH = 60;
export const DEFAULT_HEIGHT = 30;

/** DOCUMENTED (XuiElements.xml). */
export const DEFAULT_PIVOT = { x: 0, y: 0, z: 0 } as const;
export const DEFAULT_SCALE = { x: 1, y: 1, z: 1 } as const;

/**
 * INFERRED. XuiElements.xml writes `<DefaultVal>false</DefaultVal>` for
 * Opacity, which is a schema typo; a transparent default would hide every
 * unstyled element. 1.0 is the only value that renders the corpus.
 */
export const DEFAULT_OPACITY = 1;

/** DOCUMENTED (XuiElements.xml): XuiText / XuiTextPresenter. */
export const DEFAULT_POINT_SIZE = 14;

/**
 * MEASURED. PointSize is NOT an em size in design pixels: a design pixel is
 * bigger than that. Setting font-size to PointSize directly renders every
 * string about 72% of the width the console does.
 *
 * Derivation, against f0060's "Console Settings" (Label_Head, PointSize 22),
 * which is 16 glyphs wide so the horizontal fit averages out per-glyph error:
 *   our ink run at font-size 22px            264 px at 1080p
 *   the same string in the reference frame   367 px at 1080p
 *   => em must be 22 * 367/264 = 30.6 design px
 * and the cap height agrees on the other axis: the reference 'C' is 35 px tall
 * at 1080p, our ConvectionUI face has capHeight/em = 0.7001 and the canvas's
 * vertical scale is 12/11 * 1.5, so em = 35 / 0.7001 / 1.6364 = 30.5 design px.
 * The two axes give 30.57 and 30.55 for the same PointSize 22, i.e. the ratio
 * between them is 22/21 - exactly the canvas anisotropy - which confirms that
 * glyphs go through the same view transform as everything else rather than
 * being drawn at a uniform size.
 *
 * 30.56/22 = 1.389 = 100/72, i.e. PointSize behaves as a true point size
 * rasterised at 100 dpi. That reading is INFERRED; the 1.389 itself is
 * measured, to about +-1%.
 */
export const POINT_SIZE_TO_DESIGN_PX = 100 / 72;
export const DEFAULT_TEXT_COLOR = { a: 0xff, r: 0, g: 0, b: 0 } as const;
export const DEFAULT_DROP_SHADOW_COLOR = { a: 0x80, r: 0, g: 0, b: 0 } as const;
/** DOCUMENTED: 16 = TS_SINGLE_LINE. */
export const DEFAULT_TEXT_STYLE = 16;

/** DOCUMENTED (XuiElements.xml): XuiControl.PointSize -1 = inherit the visual's. */
export const POINT_SIZE_INHERIT = -1;

/**
 * MEASURED. StrokeWidth appears explicitly as 1,2,3,4,5 (64 figures) and never
 * as 0, while 427 Stroke blocks carry a colour and no width. A default of 1 is
 * impossible (1 is written explicitly), so the default is 0 and those 427
 * figures draw no outline. Getting this wrong puts a black hairline around a
 * third of every scene.
 */
export const DEFAULT_STROKE_WIDTH = 0;

/* ------------------------------------------------------------------ FillType */

/** DOCUMENTED (XDK headers). Default SOLID: 372 fills carry a FillColor and no
 *  FillType, and FillType 0 is written explicitly 49 times so 0 is not it. */
export const FillType = {
  NONE: 0,
  SOLID: 1,
  LINEAR_GRADIENT: 2,
  RADIAL_GRADIENT: 3,
  TEXTURE: 4,
} as const;
export const DEFAULT_FILL_TYPE = FillType.SOLID;

/**
 * INFERRED, single constant on purpose. Fill.Rotation is the gradient angle in
 * degrees (90 = top-to-bottom, DOCUMENTED); the ORIGIN it rotates about is not
 * documented. The natural reading, and what we use, is the centre of the
 * figure's box in normalised (0..1) fill space.
 */
export const GRADIENT_ROTATION_ORIGIN = { x: 0.5, y: 0.5 } as const;

/* -------------------------------------------------------------------- Anchor */

/**
 * DOCUMENTED (XDK headers) and independently MEASURED here. The measurement:
 * average gap from each parent edge, over every element that sets Anchor.
 *   0xc (n=131) gapR=19  gapB=-3   width 9% of parent  -> RIGHT|BOTTOM
 *   0xe (n=60)  gapR=6   gapT=17 gapB=20              -> TOP|RIGHT|BOTTOM
 *   0xb (n=56)  gapL=13  gapT=17 gapB=21              -> LEFT|TOP|BOTTOM
 *   0x9 (n=43)  gapL=0.5 gapB=0.4                     -> LEFT|BOTTOM
 *   0x5 (n=310) width 91% of parent                   -> LEFT|RIGHT
 * consistent with 1=LEFT 2=TOP 4=RIGHT 8=BOTTOM and nothing else.
 */
export const Anchor = {
  NONE: 0x00,
  LEFT: 0x01,
  TOP: 0x02,
  RIGHT: 0x04,
  BOTTOM: 0x08,
  HCENTER: 0x10,
  VCENTER: 0x20,
  XSCALE: 0x40,
  YSCALE: 0x80,
} as const;

/* ----------------------------------------------------------------- TextStyle */

/**
 * DOCUMENTED (XDK headers), and the two justify bits are confirmed by the skin
 * itself, which ships one visual per justification: XuiLabelRightJustify is
 * 0x211 and XuiLabelCenterJustify is 0x401 - the only difference is 0x200 vs
 * 0x400 - and the 6717 reference frame shows "Select"/"Back" (0x211) pushed
 * right against their button glyph.
 * Default 16 = SINGLE_LINE (word wrap OFF unless the bit is clear).
 */
export const TextStyle = {
  /** paint DropShadowColor behind the glyphs */
  DROP_SHADOW: 0x0001,
  ITALIC: 0x0002,
  BOLD: 0x0004,
  UNDERLINE: 0x0008,
  /** set = one line, no word wrap; clear = wrap to the element width */
  SINGLE_LINE: 0x0010,
  HALIGN_LEFT: 0x0100,
  HALIGN_RIGHT: 0x0200,
  HALIGN_CENTER: 0x0400,
  /** set = centre the text block vertically in the element; clear = top */
  VALIGN_CENTER: 0x1000,
  /** clip with an ellipsis instead of overflowing */
  ELLIPSIS: 0x4000,
} as const;

/** Every bit we know. Anything else is counted, never silently eaten. */
export const KNOWN_TEXT_STYLE_BITS =
  TextStyle.DROP_SHADOW | TextStyle.ITALIC | TextStyle.BOLD | TextStyle.UNDERLINE |
  TextStyle.SINGLE_LINE | TextStyle.HALIGN_LEFT | TextStyle.HALIGN_RIGHT |
  TextStyle.HALIGN_CENTER | TextStyle.VALIGN_CENTER | TextStyle.ELLIPSIS;

export function textAlign(style: number): 'left' | 'center' | 'right' {
  if (style & TextStyle.HALIGN_CENTER) return 'center';
  if (style & TextStyle.HALIGN_RIGHT) return 'right';
  return 'left';
}
export function textVAlign(style: number): 'flex-start' | 'center' {
  return style & TextStyle.VALIGN_CENTER ? 'center' : 'flex-start';
}

/* ------------------------------------------------------------------ SizeMode */

/** DOCUMENTED (XDK headers). Default 0 = NORMAL, i.e. 1:1 at the top-left, NOT
 *  stretched. In 6770 that is unobservable for 72 of the 73 images that set it
 *  (the element already matches the PNG's pixel size); the exception is
 *  sharedres://livelogo.png, 160x100 inside a 400x110 element at SizeMode 2. */
export const SizeMode = {
  NORMAL: 0,
  AUTOSIZE: 1,
  CENTER: 2,
  STRETCH: 4,
  STRETCH_MAINTAIN_ASPECT: 8,
  STRETCH_CENTER_MAINTAIN_ASPECT: 16,
} as const;
export const DEFAULT_SIZE_MODE = SizeMode.NORMAL;

/** How a SizeMode maps onto CSS object-fit / object-position for an <img>
 *  that fills the element box. AUTOSIZE resizes the ELEMENT to the image and
 *  is handled by the caller, not here. */
export function sizeModeToCss(mode: number): { fit: string; position: string } {
  switch (mode) {
    case SizeMode.NORMAL: return { fit: 'none', position: 'left top' };
    case SizeMode.CENTER: return { fit: 'none', position: 'center' };
    case SizeMode.STRETCH: return { fit: 'fill', position: 'center' };
    case SizeMode.STRETCH_MAINTAIN_ASPECT: return { fit: 'contain', position: 'left top' };
    case SizeMode.STRETCH_CENTER_MAINTAIN_ASPECT: return { fit: 'contain', position: 'center' };
    default: return { fit: 'none', position: 'left top' };
  }
}
export const KNOWN_SIZE_MODES: readonly number[] = [0, 1, 2, 4, 8, 16];

/* ----------------------------------------------------------------- BlendMode */

/**
 * XuiElement.BlendMode is an ENUM, not flags. DOCUMENTED: 1 = NORMAL (ordinary
 * alpha). 2..5 are UNVERIFIED best guesses; every one of them lives in
 * dashmain.xur or dashskn1/2 BladeSkin.xur (boot bursts, blade jewels, the
 * glass sheen) and never in a content scene, so nothing in the settings scenes
 * depends on them. The raw value is always written to data-xui-blendmode so a
 * frame comparison can settle it.
 */
export const BlendMode = {
  NORMAL: 1,
  ADD: 2,
  SUBTRACT: 3,
  MODULATE: 4,
  SCREEN: 5,
} as const;
export const UNVERIFIED_BLEND_MODES: readonly number[] = [2, 3, 4, 5];

export function blendModeToCss(mode: number): string | null {
  switch (mode) {
    case 0: case BlendMode.NORMAL: return null;
    case BlendMode.ADD: return 'plus-lighter';   // UNVERIFIED
    case BlendMode.SUBTRACT: return 'difference'; // UNVERIFIED
    case BlendMode.MODULATE: return 'multiply';   // UNVERIFIED
    case BlendMode.SCREEN: return 'screen';       // UNVERIFIED
    default: return null;
  }
}

/* ------------------------------------------------------------ DataAssociation */

/** DOCUMENTED: 0 = the owning control's own Text / ImagePath. Non-zero picks a
 *  secondary slot only the runtime can fill (a list item's second line, a
 *  gamercard field); we render the primary slot and count the value. */
export const DATA_ASSOCIATION_PRIMARY = 0;

/* ------------------------------------------------------- control visual state */

/**
 * DOCUMENTED: a visual's states are named-frame PAIRS on its own timeline,
 * <State> .. End<State>. This is the fallback chain when a visual does not
 * define the state a control is in.
 */
export const VISUAL_STATE_FALLBACK: Readonly<Record<string, string>> = {
  /** INFERRED: 17 visuals (metaScene_1line among them) name their resting
   *  frame "Default" and have no "Normal" at all. */
  Normal: 'Default',
  Focus: 'Normal',
  InitFocus: 'Focus',
  KillFocus: 'Normal',
  Press: 'Focus',
  NormalPress: 'Press',
  PressDisable: 'NormalPress',
  NormalDisable: 'Normal',
  FocusDisable: 'Focus',
  InitFocusDisable: 'FocusDisable',
};

/* -------------------------------------------------------------- figure points */

/**
 * MEASURED, and it contradicts the "points are absolute, do not stretch" note
 * we were handed - so here is the evidence.
 *
 * A XuiFigure's Points are in their own space whose extent is the stored
 * bounding box; the figure is drawn scaled by (Width/bbox.x, Height/bbox.y).
 * Two independent checks against reference/frames/6717/f0060.png, which has a
 * horizontal design->screen scale of exactly 1920/1120 = 1.7143 (pinned by two
 * elements 18 design units apart, both landing within 1px):
 *
 * 1. legend_A's "Button1" figure: bbox 39x40, element 32x32, texture-filled
 *    with sharedres://A-Button.png whose coloured disc spans 25 of its 32
 *    pixels (78%). Unstretched the disc would be 0.78*39*1.7143 = 52 screen px;
 *    stretched, 0.78*32*1.7143 = 43. The frame measures 42.
 * 2. The list row separators: the row visual's separator figure is authored
 *    with a point bbox narrower than its Width (the sibling XuiButton visual
 *    stores bbox 319 in a 421-wide figure). Unstretched the separators would
 *    stop about three quarters of the way across the 423-wide list. The frame
 *    has them running the full width, screen x 250..977 = design 145.8..570.0,
 *    against the list's authored x 146..569.
 *
 * A figure with a zero-extent bounding box on an axis is drawn 1:1 on it.
 */
export const FIGURE_POINTS_ARE_SCALED_TO_BOX = true;

/* ---------------------------------------------------------------- the viewport */

/**
 * How the 1120x770 design canvas reaches the framebuffer. MEASURED, in 720p
 * output terms, over 18 landmarks across two 1920x1080 reference frames
 * (reference/calibration/README.md); every landmark fits within 0.48px at
 * 1080p:
 *
 *   screen_x = design_x * 8/7
 *   screen_y = design_y * 12/11 - 64
 *
 * Two things that a uniform letterbox would get wrong, so do not "fix" them:
 *  - the mapping is ANISOTROPIC, sx/sy = 22/21. A circle authored in design
 *    space reaches the TV 4.8% wider than tall. The A button really is an
 *    ellipse on a 360.
 *  - the canvas is TALLER than the screen and is NOT centred: it renders as
 *    1280x840, of which the middle 720 rows show. Design y=0 is 64px above the
 *    top of the frame and y=770 is 56px below the bottom. That is the console's
 *    TV-safe bleed, and it is why the whole 770-row canvas is never visible.
 */
export const CANVAS_WIDTH = 1120;
export const CANVAS_HEIGHT = 770;
export const VIEW_TRANSFORM = { sx: 8 / 7, sy: 12 / 11, ox: 0, oy: -64 } as const;
export const FRAMEBUFFER = { width: 1280, height: 720 } as const;
/** The slice of the canvas the TV shows, in design units. */
export const VISIBLE_DESIGN_RECT = {
  x: 0, y: -VIEW_TRANSFORM.oy / VIEW_TRANSFORM.sy,
  w: CANVAS_WIDTH, h: FRAMEBUFFER.height / VIEW_TRANSFORM.sy,
} as const;

/* ---------------------------------------------------------------------- lists */

/**
 * MEASURED: XuiCommonList / XuiList stack their rows on a 45 design-px pitch
 * (row k top = list.y + LIST_ITEM_TOP + 45k), not on the 47px height of the
 * row visual nor the 74px of the XuiList template. Confirmed against
 * dashmain's hand-placed nav buttons at y = 153,198,243..468 and against the
 * ten row edges measured in f0060.
 */
export const LIST_ITEM_PITCH = 45;
export const LIST_ITEM_TOP = 3;

/* ---------------------------------------------------------------------- fonts */

/** DOCUMENTED: ConvectionUI is the only font any 6770 scene names (26 uses). */
export const FONT_FAMILY = 'ConvectionUI';
export const FONT_FALLBACK = 'ConvectionUI, "Segoe UI", system-ui, sans-serif';
