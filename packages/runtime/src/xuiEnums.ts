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
 * The fill transform: how XuiFigureFill.Translation / Scale / Rotation place a
 * gradient (or texture) inside the figure's box. MEASURED by
 * tests/smoke/sweep-gradient.mjs against reference/frames/6717/f0051.png
 * (System) and f0034.png (Marketplace): each candidate renders the blade
 * through the console view at 1920x1080 and is scored on the tab stack next
 * to the page (x 0..430 on System, 1515..1920 on Marketplace, y 140..880) -
 * the stack is drawn by blade_grey_left / blade_grey_rt, whose edge lines are
 * radial-gradient rings with Translation (0.40..0.42, 0) and Scale
 * (0.15..0.18, 0.43..0.54), so nothing else on screen decides the answer.
 *
 * The model is six independent choices, each sweepable through ?gradxf=:
 *   direction   'texture' - the transform maps the box's own (u,v) into the
 *                           gradient's space, the way a texture matrix does,
 *                           so Translation +0.5 moves the gradient LEFT/UP.
 *               'shape'   - the transform moves the gradient shape itself, so
 *                           Translation +0.5 moves it RIGHT/DOWN (the old rule).
 *   origin      what Scale and Rotation act about: the box centre or its
 *               top-left corner.
 *   rotation    +1: the standard rotation matrix in y-down uv (Rotation 90
 *               makes a linear gradient run bottom-to-top), -1: the mirror.
 *   radial      the resting radial gradient: 'axis' an ellipse inscribed in the
 *               box (rx = w/2, ry = h/2), or a circle of radius max/min/width/
 *               height of the box over 2.
 *   translation 'box' - fractions of the box; 'design' - design pixels.
 *   order       the order the three are applied to a point in the box
 *               (texture direction): 'SRT' scale, rotate, translate - so Scale
 *               acts along the BOX's axes. 'RST' rotates first, which is what
 *               "the scale acts along the gradient's own axis" means, and
 *               'TRS' translates first. Only a fill that is rotated AND
 *               non-uniformly scaled separates the three; see THE WING below.
 *
 * Stage 1 (40 candidates, translation=box, order=SRT), luma MAD / NCC of the
 * stack against the frame, summed over both blades (lower MAD is better):
 *
 *   MAD    NCC    direction origin  rot radial
 *   40.95  1.766  texture   centre  +1  axis     <- this model
 *   42.41  1.744  texture   centre  -1  axis
 *   73.73  0.700  texture   topleft -1  axis
 *   84.73  0.866  texture   centre  +1  max
 *   94.12  0.433  shape     topleft +1  max/height
 *   103.33 0.204  shape     centre  +1  axis     <- the old rule
 *   108.93 0.260  shape     topleft -1  width/min (worst)
 *
 * Stage 2 around the winner: translation=design 81.93 / order=TRS 88.73 /
 * both 83.01, against 40.95 for box + SRT.
 *
 * Per blade, the winner vs the old rule:
 *   f0051 System      MAD 19.76 (was 51.99)  NCC 0.877 (was 0.225)
 *   f0034 Marketplace MAD 21.19 (was 51.34)  NCC 0.889 (was -0.021)
 * Mean body luma of the stack (x 40..420, y 300..800 on f0051): frame 149.6,
 * old rule 203.4, this model 166.3; Marketplace (x 1530..1910): 176.5 / 232.8
 * / 198.2. Tab-edge valleys in the row profile (x at 1080p, luma): the frame
 * has them at 118, 188, 259, 329, 396 (luma 73..89, 19..21 deep); the old rule
 * drew none deeper than 13; this model puts them at 116, 186, 257, 326, 393
 * (luma 92..105, 18..23 deep) - within 3 px, about 15 luma lighter. The
 * residual 15..20 luma of body lightness is shared by every candidate and is
 * not a transform question (the multiply cover, BlendMode 3/4/5 and the
 * theme-free palette are the open items there).
 *
 * The rotation sign is also fixed by data, not only by the sweep (which the
 * stack barely exercises, +1 vs -1 differ by 1.5 MAD): botd/defaultbanner1's
 * border glow is four 14 px strips, the bottom one Rotation 90 and the top one
 * -90, both with the opaque stop at 1.0 on the INNER edge - so Rotation 90
 * runs bottom-to-top, which is what the standard matrix gives in y-down uv.
 * Its corner squares carry Translation (+-0.5, +-0.5) with the top-left one at
 * (-0.5, -0.5): in the texture direction that puts the ring's centre on the
 * square's inner corner, where a rounded corner's centre is.
 *
 * That reading was re-derived independently from the same file's HORIZONTAL
 * pair, which is sign-free and therefore settles the baseline before the sign
 * is argued: the left strip (x 23.75..37.75, Rotation absent = 0) and the
 * right strip (x 368.75..382.75, Rotation 180) sit either side of bg1
 * (x 37.75..368.75), and both put the opaque stop at 1.0 on the edge TOUCHING
 * bg1. So the frame's glow is dark inside and transparent outside. Apply that
 * to the vertical pair - top strip y 23.5..37.5 Rotation -90, bottom strip
 * y 115.1..129.1 Rotation 90, bg spanning y 30..122 - and rotation +1 puts
 * Rotation 90's opaque end at the TOP of the bottom strip and Rotation -90's
 * at the BOTTOM of the top strip, i.e. both inner. rotation -1 puts both on
 * the outer edges, which would make the frame glow outwards on two sides and
 * inwards on the other two. So +1 is the only self-consistent reading.
 *
 * THE WING: what a ROTATED fill settles, and what it does not.
 *
 * Everything above was fitted on fills whose Rotation is 0 - blade_grey_left's
 * inner2 and outer1 rings, which draw the tab edges, both carry Rotation 0 -
 * and with R = I the three orders collapse (T*R*S and T*S*R are the same
 * matrix). So no measurement here could say whether Scale acts along the BOX's
 * axes or along the GRADIENT's own. Only a fill that is rotated AND scaled
 * can; 166 of build 6770's gradient fills are, and the biggest is the wing.
 *
 * The fill, on the XuiFigure `wing` (117.023 x 770 at x=12) inside the 150x853
 * `wing` visual of dashuisk/skin.xur - the visual dashmain's wing_left
 * (140x853 at design x -15) wears. All three transform values sit on the
 * XuiFigureFill compound, not on its Gradient and not on the element:
 *   FillType 2 (linear), NumStops 4
 *     0xffdcdcdc @ 0.039216    0xffdcdcdc @ 0.376471
 *     0xffc8c8c8 @ 0.674510    0xfff0f0f0 @ 1.000000
 *   Translation (-0.003280, -0.501485, 0)
 *   Scale       ( 0.130000,  1.080000, 1)
 *   Rotation    -90
 * Twelve fills in the build carry those exact numbers (WingCover/wing and the
 * dashskn1/2 copies); the blade faces are the same shape at Scale
 * (0.12831, 1.18413), so this is a family, not one figure.
 *
 * Rotation -90 lays the gradient axis down the box's Y (Rotation 90 runs
 * bottom-to-top, measured above), the box is 770 tall, so the gradient offset
 * is an affine function of v = design_y / 770 and every order predicts a
 * different one - the whole disagreement, in five lines:
 *
 *   order         offset(v)         spans           stop 0.3765  stop 0.6745
 *   SRT           1.08 v - 0.0433   -0.043..1.037    y 299        y 512
 *   RST           0.13 v + 0.4317    0.432..0.562    never        never
 *   TRS           0.13 v + 0.3698    0.370..0.500    y 39         never
 *   SRT topleft   1.08 v - 0.0033   -0.003..1.077    y 271        y 483
 *   shape SRT     0.489 - 7.69 v     0.489..-7.204   y 11         never
 *
 * RST and TRS are the two readings in which Scale acts along the gradient's
 * own axis: both then spend the whole 770-tall figure on 13% of the ramp, so
 * both are MONOTONE over the entire wing - no plateau, no minimum, no climb.
 * The console has all three. On f0051 the mean luma of the column x 3..34 at
 * 1080p (design x 2..20, the wing's left flank), sampled every 2 design px
 * down y 70..700, plateaus at 168.0, first falls 1 luma below that plateau at
 * design y 322, bottoms at 144.6 at y 514 (flat within 1.5 luma over y
 * 512..542) and climbs back to 169.1 by y 700 - flat 0xdc, down to 0xc8, up
 * towards 0xf0, the authored ramp. Our render of the wing figure alone, same
 * column and the same two detectors, plateaus at exactly 220.0 = 0xdc, breaks
 * at y 314 and bottoms at 200.0 = 0xc8 at y 506: both landmarks within 8
 * design px of the console's, with SRT's predicted 299 / 512 between the two.
 *
 * NCC of each order's predicted luma against the frame's profile over design
 * y 430..700, the window that holds the minimum and the climb:
 *   SRT 0.754    SRT topleft 0.606    RST -0.470    TRS -0.470    shape 0.000
 * RST is ANTI-correlated - it keeps darkening where the console brightens. So
 * SRT stands for rotated fills too: Scale is applied along the box's axes and
 * the rotation then carries Scale.y, not Scale.x, onto the gradient axis. The
 * 0.13 in Scale.x lands on the gradient's perpendicular, where a linear ramp
 * cannot see it, and so does Translation.y = -0.501485; both are the tool's
 * handle written out, not values the runtime reads. The wing re-settles
 * origin=centre on its own, too: topleft puts the same two landmarks at y 271
 * and 483, 30-40 design px early.
 *
 * tests/smoke/sweep-gradient.mjs wing is the gate; it re-measures those
 * landmarks against f0051 on every run.
 *
 * THE LEFT-EDGE RESIDUAL IS NOT THE WING'S TRANSFORM. Re-measured on f0051,
 * mean RGB of a 40x300 column at y 300..600: x=60 frame 166.4 / ours 194.1
 * (+27.7), x=200 135.3 / 155.1 (+19.7), x=340 152.8 / 171.7 (+18.9). Only the
 * x=60 column has a y-dependence, and all of it is one figure. Down that
 * column (40 px wide) our excess runs +25.0, +26.6, +34.3, +39.6, +24.1 at
 * 1080p rows y = 300, 450, 600, 750, 900; with the wing visual's `lines` group
 * hidden it runs +12.7, +11.1, +12.3, +13.6, +11.3 - flat within 2.5 luma -
 * and x=200 and x=340 do not move at all, that group's opaque disc ending at
 * screen x 174 (design x 101.5, the last of the 225-wide rectangle it fills
 * before the 0.929412 rim). In the
 * full render that column's landmarks land at y 482 and y 632, 160 and 118
 * design px late; with `lines` hidden they land at y 314 and 522, within 8 of
 * the console's.
 *
 * `lines` is a XuiGroup in the wing visual holding one 225x945 rectangle whose
 * radial fill is Translation (0.49, 0), Scale (1, 0.89), Rotation 0 with stops
 * 0xffebebeb @ 0.929412, 0x00ebebeb @ 0.929412, 0xff505050 @ 0.956863,
 * 0x000f0f0f @ 0.972549 - an OPAQUE interior out to 0.929412. Under every
 * member of this model the disc's centre lands within 0.01 box widths of the
 * box's left edge (texture) or its right edge (shape) while its 0.929412 rim
 * is 0.465 box widths out, so about half the rectangle is filled opaque 0xeb
 * and it covers the wing; that flat wash, not a mis-placed ramp, is what eats
 * the wing's vertical gradient. The obvious escape - that XUI leaves the
 * gradient texture transparent before the first stop instead of padding it -
 * is refused by the same frame: dashuisk's blade_grey_left/back1 is a linear
 * fill with stops from 0.263 to 0.886 and BOTH ends opaque, and f0051 draws
 * that tab body solid top to bottom. 214 of the build's 1,854 gradient fills
 * have an opaque first stop past 0.25, so whatever the rule is, it is not a
 * one-figure special case. UNRESOLVED, and it is a stop-space question, not a
 * transform one.
 *
 * What is left after that is a uniform lightness, +12 at x=60 and +19 at
 * x=200 and x=340: a missing darkening layer - black_cover (BlendMode 2),
 * grey_trans_fade, or the blade-edge shadow. Whole-blade numbers per blade are
 * printed by tests/smoke/smoke-blades.mjs, where the page BODY agrees to
 * within 3-9 luma (frame -> ours: 150->141, 158->161, 135->142, 117->121,
 * 120->116).
 */
export interface GradientTransformModel {
  direction: 'texture' | 'shape';
  origin: 'centre' | 'topleft';
  rotation: 1 | -1;
  radial: 'axis' | 'max' | 'min' | 'width' | 'height';
  translation: 'box' | 'design';
  order: 'SRT' | 'RST' | 'TRS';
}
export const GRADIENT_TRANSFORM: GradientTransformModel = {
  direction: 'texture', origin: 'centre', rotation: 1, radial: 'axis', translation: 'box', order: 'SRT',
};

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
 * XuiElement.BlendMode is an ENUM, not flags. DOCUMENTED: 1 = NORMAL.
 * Corpus: 1 x258, 4 x32, 2 x22, 5 x18, 3 x6.
 *
 * MODE 2 IS MEASURED = multiply. dashmain's black_cover/top is an OPAQUE
 * grey-to-white rectangle (gradient 200,200,200 -> 255,255,255) covering the
 * top 282 design px of the whole canvas at BlendMode 2, so it is a large,
 * high-contrast oracle. Sweeping thirteen CSS blend modes and comparing the
 * top band of our 1920x1080 console-view render against f0051 and f0034:
 *
 *   candidate      f0051 ncc / mad     f0034 ncc / mad
 *   multiply       0.5006 / 37.12      0.3239 / 44.37    <- best colour error, both
 *   darken         0.5014 / 38.50      0.3169 / 45.68
 *   color-burn     0.4909 / 37.72      0.3085 / 45.34
 *   exclusion      0.5007 / 51.14      0.3958 / 64.34    <- correlates, wrong colour
 *   difference     0.4883 / 56.53      0.3734 / 69.18
 *   normal         0.2163 / 64.04      0.0626 / 75.98
 *   screen         0.1484 / 71.68      0.0000 / 83.46
 *   plus-lighter   0.1013 / 75.80     -0.0220 / 88.40    <- the previous guess
 *
 * multiply has the lowest absolute colour error on BOTH blades and is top
 * three on correlation on both; exclusion and difference correlate by
 * inverting structure and are 14-20 MAD worse on colour. darken and
 * color-burn are its near neighbours and a frame with a stronger backdrop
 * could still separate them.
 *
 * 3, 4 and 5 remain UNVERIFIED. 3 and 4 occur only in the blade skins, which
 * the footage never loads (no dash user, so no DashStyle). 5 is only
 * white_cover, a 50-100/255 alpha wash: the same sweep moves its NCC by 0.005
 * on f0051 and the MAD ordering disagrees between the two blades, so nothing
 * separates it.
 *
 * THE ISOLATION TRAP, and why this took a second pass. CSS `mix-blend-mode`
 * blends only within the nearest stacking context, and `transform` creates
 * one. While every element carried a transform, black_cover/top blended
 * against its own group's empty backdrop, so all thirteen candidates rendered
 * IDENTICALLY - the sweep looked like it had settled the question when it had
 * measured nothing. containerCss now places plain containers with left/top and
 * emits a transform only for a real rotation or scale. An element that is
 * rotated, scaled or under an opacity < 1 still isolates, and those are
 * counted in __dash.blendIsolated.
 */
export const BlendMode = {
  NORMAL: 1,
  /** MEASURED = multiply. See the sweep in the comment above. */
  MODULATE: 2,
  SUBTRACT: 3,
  ADD: 4,
  SCREEN: 5,
} as const;
/** 2 is settled; 3 and 4 occur only in the blade skins and 5 only on
 *  white_cover, neither of which any frame we have can separate. */
export const UNVERIFIED_BLEND_MODES: readonly number[] = [3, 4, 5];

/**
 * Set by the app from ?blend=<n>:<css> so a candidate mapping can be swept
 * against the reference frames. Empty in normal operation.
 */
export const BLEND_OVERRIDES = new Map<number, string>();

export function blendModeToCss(mode: number): string | null {
  const o = BLEND_OVERRIDES.get(mode);
  if (o !== undefined) return o === 'normal' ? null : o;
  return blendModeToCssDefault(mode);
}

function blendModeToCssDefault(mode: number): string | null {
  switch (mode) {
    case 0: case BlendMode.NORMAL: return null;
    case BlendMode.MODULATE: return 'multiply';   // MEASURED, see above
    case BlendMode.SUBTRACT: return 'difference'; // UNVERIFIED
    case BlendMode.ADD: return 'plus-lighter';    // UNVERIFIED
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
