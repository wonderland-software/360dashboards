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

/* ------------------------------------------------------- the view transform */

/**
 * MEASURED (reference/calibration/README.md, 18 landmarks over two 1920x1080
 * frames, every one within 0.48px): in 720p output terms
 *     screen_x = design_x * 8/7        screen_y = design_y * 12/11 - 64
 * Declared here, above everything, because the glyph rule below is expressed
 * in terms of these two numbers.
 */
export const VIEW_TRANSFORM_SX = 8 / 7;
export const VIEW_TRANSFORM_SY = 12 / 11;

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
 * MEASURED, on two axes that behave differently.
 *
 * HORIZONTAL. PointSize is not a pixel height; an em is
 * PointSize * 100/72 design px wide. Fitted by 1-D normalised cross-correlation
 * of the gradient-magnitude column profile of our render against
 * reference/frames/6717/f0060.png, which reports the factor our render needs to
 * match the console:
 *     "Console Settings"  (PointSize 22)   kx = 1.003
 *     "Back"              (PointSize 18)   kx = 1.000
 *     "Select"            (PointSize 18)   kx = 0.997
 *     "Current Setting"   (PointSize 20)   kx = 0.991
 * i.e. 100/72 is right to within 0.9% at four sizes.
 *
 * VERTICAL. Glyphs are NOT stretched by the canvas's vertical scale. The same
 * fit on the row profiles wants our text SHORTER:
 *     title kx 1.003 / ky 0.9445 (ncc 0.93)   Back  ky 0.9295 (ncc 0.97)
 *     Select      ky 0.9535 (ncc 0.97)        "Current Setting" ky 0.9865 (0.93)
 * mean ky = 0.9535, against sy/sx = 21/22 = 0.9545 - a match to 0.1%, at four
 * sizes, while kx stays at 1. So the console rasterises glyphs ISOTROPICALLY at
 * the canvas's HORIZONTAL scale, and only the layout goes through the
 * anisotropic view transform. Inside our anisotropic canvas that means text
 * carries a counter-scale of 21/22 on Y (GLYPH_ASPECT below).
 *
 * Reading 100/72 as "a real point size at 100 dpi" is INFERRED; both numbers
 * themselves are measured.
 */
export const POINT_SIZE_TO_DESIGN_PX = 100 / 72;

/**
 * MEASURED (see above): the vertical counter-scale a text node needs so its
 * glyphs come out isotropic after the canvas's (8/7, 12/11) view transform.
 * Exactly sy/sx. If the view transform ever becomes uniform this is 1.
 */
export const GLYPH_ASPECT = (VIEW_TRANSFORM_SY * 1) / VIEW_TRANSFORM_SX;
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

/** DOCUMENTED (packages/xur/extensions/v5/registry.json, from the XuiTool
 *  class-extension XML): XuiFigureFill.FillColor 0xFF0F0F80 and
 *  XuiFigureStroke.StrokeColor 0xFF0F0FEB. The 6770 registry is generated from
 *  the executable and carries no default values, so these live here.
 *  30 figures store no Fill block at all; they take the SOLID default and this
 *  colour, exactly as a figure that stores only a FillColor does. */
export const DEFAULT_FILL_COLOR = { a: 0xff, r: 0x0f, g: 0x0f, b: 0x80 } as const;
export const DEFAULT_STROKE_COLOR = { a: 0xff, r: 0x0f, g: 0x0f, b: 0xeb } as const;

/**
 * INFERRED, and unresolved. A figure's Points are scaled from their bounding
 * box to the element box (MEASURED, see FIGURE_POINTS_ARE_SCALED_TO_BOX), and a
 * StrokeWidth is authored in that same point space, so the consistent reading
 * is that it scales with them. 1,333 skin figures have a point box that differs
 * from their element box, but only 62 figures are stroked at all, and no
 * reference frame we have shows one large enough to settle it: the worst case,
 * BG_Animation_OOBE/Circle, has a 956-unit point box in a 77px element, so a
 * scaled stroke is 0.4px and an unscaled one is 5px.
 * Scaling is anisotropic, and SVG has one stroke width, so we use the geometric
 * mean of the two axes. Set this false to go back to unscaled px.
 */
export const SCALE_STROKE_WITH_FIGURE = true;

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
  /** Never used in build 6770: no element sets 0x40 or 0x80. Implemented from
   *  the documented meaning, not from anything the corpus proves. */
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
  /** ITALIC and UNDERLINE never occur in build 6770; BOLD occurs once
   *  (TextStyle 0x1415). Implemented from the documented bit meanings. */
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
    // AUTOSIZE resizes the ELEMENT to the image; it never occurs in build 6770
    // (the corpus uses only 0, 2, 4, 8 and 16) and the caller, not this
    // function, would have to change the element box, so say so rather than
    // falling through to NORMAL silently.
    case SizeMode.AUTOSIZE: return { fit: 'none', position: 'left top' };
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
 * alpha). Corpus: 1 x258, 4 x32, 2 x22, 5 x18, 3 x6.
 *
 * 2..5 are UNVERIFIED. An earlier note here claimed they only occur in
 * dashmain.xur and the blade skins; that was WRONG and the gallery sweep shows
 * it - BlendMode 2 is in arcade/2500_LiveArcadeHome, arcade/2502_TwistSelector
 * Scene, videos/VideoCategories and videos/VideoDetails, and BlendMode 5 is in
 * gamercar/GamerCard, messenge/FriendRequestMain and messenge/SignupComplete.
 *
 * Settling them needs a reference frame showing one of those screens, or the
 * blade composition (the elements that carry 2 and 4 in dashmain sit on tabs
 * that are Opacity 0 at rest, so nothing to compare against yet). Until then
 * the mapping below is a guess, the raw value goes to data-xui-blendmode, and
 * every use is counted in __dash.unverifiedBlendModes.
 *
 * One difference from the console that no mapping fixes: CSS ISOLATES a blend
 * inside the nearest ancestor that creates a stacking context, and an
 * opacity < 1 does exactly that, so a blended element under a faded parent
 * blends with its siblings only, while the console blends it with the whole
 * frame. Where that happens is counted in __dash.blendIsolated.
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
/**
 * The DASHBOARD ROOT's canvas, and only that. A scene's canvas is its own
 * XuiCanvas Width/Height: 184 of the 245 canvases in build 6770 are 1120x770
 * and 61 are not (640x480, 720x480, 345x240, 345x300, 700x445, 420x450,
 * 1024x768, 1123x772, 723x73, 100x770, 162x25, 64x64, 405x88/125/179/260).
 * Use canvasSizeOf(root); these two are the fallback and the size the view
 * transform below was measured against.
 */
export const DASHBOARD_CANVAS = { width: 1120, height: 770 } as const;
export const CANVAS_WIDTH = DASHBOARD_CANVAS.width;
export const CANVAS_HEIGHT = DASHBOARD_CANVAS.height;
export const VIEW_TRANSFORM = { sx: VIEW_TRANSFORM_SX, sy: VIEW_TRANSFORM_SY, ox: 0, oy: -64 } as const;
export const FRAMEBUFFER = { width: 1280, height: 720 } as const;
/** The slice of the canvas the TV shows, in design units. */
export const VISIBLE_DESIGN_RECT = {
  x: 0, y: -VIEW_TRANSFORM.oy / VIEW_TRANSFORM.sy,
  w: CANVAS_WIDTH, h: FRAMEBUFFER.height / VIEW_TRANSFORM.sy,
} as const;

/* ---------------------------------------------------------------------- lists */

/**
 * MEASURED. Row k's top = list.y + LIST_ITEM_PITCH * k. The pitch is not
 * inferred: the XuiList visual's own row template, control_ListItem, is
 * authored 420x45, and the ten row edges in f0060 sit 45 design px apart.
 *
 * LIST_ITEM_TOP was 3 and that was WRONG. It came from reading the
 * calibration's "list row 0 top edge = design 157" as the row's origin, when
 * 157 is the half-intensity crossing of a separator FIGURE that is 3 design px
 * tall and starts at the row's y=0. Fitting our 1920x1080 console-view render
 * against f0060 by normalised cross-correlation settles it, and both halves of
 * the list move together:
 *
 *                        row text (dy, design px)   separator strip (dy)
 *   LIST_ITEM_TOP = 3    -3.12 / -3.30 / -2.99      -2.93 (ncc 0.95)
 *   LIST_ITEM_TOP = 0    -1.34 / -0.31 / +0.06      +0.06 (ncc 0.96)
 *
 * i.e. at 0 the rows land within 0.3 design px, the same quality as the header
 * label (+0.61). A text-placement rule could never have fixed this: the header
 * and the row labels carry the SAME TextStyle (0x4011, no VALIGN_CENTER bit),
 * so they go down the same top-aligned path, and only the row's origin differs.
 */
export const LIST_ITEM_PITCH = 45;
export const LIST_ITEM_TOP = 0;

/* ---------------------------------------------------------------------- fonts */

/** DOCUMENTED: ConvectionUI is the only font any 6770 scene names (26 uses). */
export const FONT_FAMILY = 'ConvectionUI';
export const FONT_FALLBACK = 'ConvectionUI, "Segoe UI", system-ui, sans-serif';
