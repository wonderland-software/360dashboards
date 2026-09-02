# packages/runtime — the browser XUI runtime

The XUI scene graph, rendered as DOM. Nothing on screen is authored here:
every coordinate, colour, curve and string is read out of the parsed `.xur`
and the PNGs extracted from `dash.xex`. Where a rule is a guess it is marked
INFERRED, both here and in the source.

## Module map

| file | what it does |
|---|---|
| `src/xuiEnums.ts` | **Every** enum, default and magic number, each marked DOCUMENTED / MEASURED / INFERRED. Change numbers here, nowhere else. |
| `src/assets/AssetIndex.ts` | `manifest.json` → which pack holds a file and what URL serves it. Resolves `common://`, `sharedres://`, `file://` and bare paths. |
| `src/scene/SceneLoader.ts` | Fetch a `.xur`, parse it with the build-6770 registry, report classes the registry does not know. |
| `src/scene/Skin.ts` | `dashuisk/skin.xur` indexed by `XuiVisual.Id`; `VisualScope` looks scene-local first, shared skin second. |
| `src/render/props.ts` | One element's properties with class defaults filled in and timeline overrides applied, including inside compounds (`Fill.Gradient.StopColor#2`). |
| `src/render/anchor.ts` | XUI anchoring: how a child absorbs the difference between the size its parent was authored at and the size it actually is. |
| `src/render/timeline.ts` | Parks a control's visual on the frame of its named state (`Normal`, `NormalDisable`, …) and samples every animated property there. |
| `src/render/DomRenderer.ts` | The tree walk: one `<div data-xui-class data-xui-id>` per element, transform/opacity/blend, visual instantiation, class dispatch. |
| `src/render/controls/figure.ts` | `XuiFigure` → inline SVG path, gradients, texture patterns, stroke. |
| `src/render/controls/image.ts` | `XuiImage` / `XuiImagePresenter` → `<img>` with SizeMode. |
| `src/render/controls/text.ts` | `XuiText` / `XuiTextPresenter` → a flex box, PointSize → px, alignment, drop shadow. |
| `src/anim/interp.ts` | Keyframe arithmetic: Linear / None / Ease sampling, colour blending, quaternion slerp. DOM-free, so `tests/timeline.test.ts` drives it directly. |
| `src/anim/TimelineEngine.ts` | The playhead. A scope per timeline-owning object, Flash-style named-frame commands, control states, a 60 Hz fixed-step clock. Also DOM-free. |
| `src/anim/bind.ts` | Joins a scope's sampled values to the rendered nodes it animates. |
| `src/render/update.ts` | `NodeRecord` + `updateNode`: re-applies only what changed, and cascades a resize to the children the way the first render laid them out. |
| `src/render/Viewport.ts` | The console's canvas→framebuffer transform, then a uniform fit to the window. |
| `src/telemetry.ts` | `window.__dash`: everything met and everything not honoured. |
| `src/debug/Inspector.ts` | `?debug` — tree, hover highlight, property dump. |

## Coordinates

**The design canvas is 1120×770** for every one of the 263 scenes.

**Canvas → framebuffer** (MEASURED, 18 landmarks over two 1920×1080 reference
frames, all within 0.48 px; see `reference/calibration/README.md`), in 720p
output terms:

```
screen_x = design_x * 8/7
screen_y = design_y * 12/11 - 64
```

Two things that look like bugs and are not: the mapping is **anisotropic**
(`sx/sy = 22/21`, so an authored circle reaches the TV 4.8 % wider than tall),
and the canvas is **taller than the screen and not centred** — it renders as
1280×840 with design `y=0` sitting 64 px above the frame and `y=770` 56 px
below it. Only `y ∈ [58.667, 718.667]` is ever visible. `Viewport` keeps this
as four numbers (`VIEW_TRANSFORM`) and applies a *separate* uniform fit
afterwards, which is the browser's letterbox, not the console's.

**Element transform.** Each element is absolutely positioned inside its parent
at `left:0; top:0` with `transform: translate(Position) rotate3d(Rotation)
scale(Scale)` and `transform-origin: Pivot`. Children nest, so opacity and
transforms compose as XUI composes them. `Show=false` → `display:none`.

## Figures

`Points` are `(point, control1, control2)` triples; segment *i* is the cubic
from `P_i` via `C1_i, C2_i` to `P_(i+1)`, and a straight segment stores
`C1_i = P_i`, `C2_i = P_(i+1)` — which is why 1,782 of the 2,264 figures are
plain 4-point rectangles. `Closed` is true on every figure in the build.

**Points are scaled from their own bounding box to the element's
Width × Height** (MEASURED — this is the one place where our finding
contradicted a note we were given, so both checks are written out):

1. `legend_A`'s button figure has a 39×40 point box in a 32×32 element,
   texture-filled with `sharedres://A-Button.png` whose coloured disc covers
   25 of its 32 px. Unstretched the disc would be 52 screen px wide at 1080p,
   stretched 43. The frame measures 42.
2. The list row separators are authored with a point box narrower than their
   Width; unstretched they would stop about three quarters of the way across
   the 423-wide list. In `f0060` they run screen x 250…977, i.e. design
   145.8…570.0, against the list's authored x 146…569.

A zero-extent axis is drawn 1:1; 12 figures carry points outside the box, so
the SVG never clips.

Fill (`FillType`, DOCUMENTED, default SOLID because 372 fills carry a
`FillColor` and no `FillType` while `FillType 0` is written 49 times):
`0` none, `1` solid, `2` linear gradient, `3` radial, `4` texture.
`Fill.Translation / Scale / Rotation` become one SVG `gradientTransform` in
normalised (0…1) fill space; `Rotation` is degrees, 90 = top-to-bottom
(DOCUMENTED), and the **origin it rotates about is INFERRED** to be the box
centre (`GRADIENT_ROTATION_ORIGIN`).

Stroke: `StrokeWidth` defaults to **0**, so a `Stroke` block with only a
colour draws nothing. MEASURED: the width appears explicitly as 1–5 (64
figures) and never as 0, so 1 cannot be the default; getting this wrong puts
a black hairline around a third of every scene.

## Anchors and visuals

`XuiControl.Visual` names a `XuiVisual` in the skin, which is instantiated as
the control's child subtree at the **control's** size. `XuiTextPresenter`
inside it shows the control's `Text`, `XuiImagePresenter` its `ImagePath`, and
`XuiControl.PointSize` overrides the visual's when it is not `-1`.

Anchoring only does anything when those two sizes differ — which is exactly
the visual case: `legend_A` is authored 420 wide and `labHeader` is 855, so a
presenter anchored LEFT|RIGHT has to grow by 435. The delta cascades: a child
that absorbs it into its own width hands the new delta to *its* children,
which is how a stretched row visual keeps its separator the full width.

Bits `1=LEFT 2=TOP 4=RIGHT 8=BOTTOM 0x10=HCENTER 0x20=VCENTER 0x40=XSCALE
0x80=YSCALE` are DOCUMENTED and independently MEASURED (average gap to each
parent edge over every element that sets Anchor: `0xc` hugs bottom-right with
9 % of the parent's width, `0x5` is 91 % of it, and so on). How each
combination absorbs the delta is INFERRED and WinForms-shaped.

**Control state.** A visual's states are named-frame pairs (`Normal` …
`EndNormal`). M1 is a still frame, so the playhead is parked on the state's
opening frame and every animated property is sampled there. Not cosmetic:
`legend_Y` and `legend_X` are `Enabled=false`, and only the `NormalDisable`
frame swaps their glyph to `disabled-Button.png` at half opacity — which is
what the reference frame shows. `Normal → Default` is an INFERRED addition to
the documented fallback chain: 17 visuals name their resting frame `Default`
and have no `Normal` at all.

## Text

`PointSize` is **not** a pixel height. MEASURED: em = `PointSize * 100/72`
design px. Derived twice off `f0060`'s 16-glyph "Console Settings"
(PointSize 22): the string's ink is 367 screen px against our 264 at
font-size 22, giving em = 30.57; and the reference 'C' is 35 px tall with
ConvectionUI's capHeight/em = 0.7001 and a 1.636 vertical scale, giving
30.55. The two axes differ by exactly 22/21 — the canvas anisotropy — which
also proves glyphs go through the same view transform as everything else.
Reading `100/72` as "a real point size at 100 dpi" is INFERRED; the 1.389 is
measured to about ±1 %.

The line box is the **face's own ascent+descent**, read off the font at
runtime rather than hard-coded, so the first baseline lands where the console
puts it (`box top + ascent`; measured 30.7 design px below the box top for a
30.56 px em, against an ascent of 1.015 em).

`TextStyle` bits are DOCUMENTED: `0x1` drop shadow, `0x2` italic, `0x4` bold,
`0x8` underline, `0x10` single line (clear = wrap), `0x100/0x200/0x400`
left/right/centre, `0x1000` vertical centre, `0x4000` ellipsis; default 16.
No unknown bit occurs anywhere in the build — the gallery sweep confirms it.
The drop-shadow **offset** (1 design px down-right) is INFERRED.

## Timelines (M2)

**Clock.** 60 timeline frames a second, DOCUMENTED, driven by a fixed-step
accumulator: whole frames only, so a slow animation frame cannot smear an
animation into a different shape, and a backgrounded tab is clamped rather
than fast-forwarded. `?frame=N` pins every scope for a deterministic
screenshot, `?play=<scope>:<from>-<to>` opens a range on load, and `&manual`
hands the clock to `window.__dashApi.stepFrames()` so a test's answer cannot
depend on the machine it runs on.

**Scopes.** One per object that owns named frames or timelines. A timeline
names its target child by Id, and the same skin visual is instantiated by
many controls, so targets are resolved once at bind time inside that scope's
own subtree — six copies of `legend_A` get six scopes, each pointing at its
own `Button1`. Scope ids are the chain of element Ids down to the object.

**Commands** are Flash-shaped and fire when the playhead lands on a frame:
`Play` continue, `Stop` halt, `GoTo`/`GoToAndPlay`/`GoToAndStop` jump to a
named target. A jump is an explicit instruction and outranks `playRange`'s
end-of-range backstop, which is what lets `EndFocus → GoToAndPlay(loop)` cycle
instead of stopping. Chains are bounded at 8 jumps a frame so a cyclic file
cannot wedge the engine.

**Interpolation.** `Linear` blends (numbers, colours per channel, vectors
componentwise, quaternions by shortest-arc slerp; strings, booleans and
figures hold, which is how an animated `TextureFileName` swaps cleanly).
`None` holds the earlier keyframe. `Ease` carries signed EaseIn/EaseOut
(−100…100) and EaseScale (0…100) — **INFERRED**, and the one place the shape
is defined: all 454 Ease keyframes in the build store 0/0/50, so the corpus
cannot distinguish curves. We use a cubic Bézier whose control points start on
the diagonal and are pulled off it by the ease amounts, which reduces exactly
to a straight line at 0/0, whatever EaseScale is.

**Control states.** `setState(controlId, state)` plays the visual's
`<State>`…`End<State>` range down the documented fallback chain
(`Focus→Normal`, `Press→Focus`, `PressDisable→NormalPress→Press`, and the
INFERRED `Normal→Default`). A visual's `XuiSoundXAudio` child is the console's
cue for that state; we record it as `lastCue` and play nothing.

**Updates.** `updateNode` re-derives the container style always, rebuilds the
element's own paint only when a content key changed (`Fill.*`, `Stroke.*`,
`Points`, text or image properties), and relays out the children only when the
element actually resized. Data attributes stay current: `data-xui-tick` and
`data-xui-range` on the scope's element.

`window.__dash.timeline` reports `{ scopes: [{id, tick, playing, range,
lastCue}], playing, frozenAt, fps }`, where `fps` counts timeline frames
stepped in the last second — 60 on a healthy page.

## What is honestly not implemented

Recorded per scene in `window.__dash`, never faked:

- **`runtimeDrivenClasses`** — `XuiList` / `XuiCommonList` / `XuiListItem`,
  `XuiGamerCard`, `XuiEdit`, `XuiProgressBar`, video and HTML elements. Their
  rows and contents came from PowerPC code and `.xus` tables at run time, not
  from the scene. Measured row pitch for when that lands: 45 design px, first
  row at `list.y + 3`.
- **`sceneTextures`** — an `ImagePath` naming a `.xur` (eleven scenes use
  `common://TitleMetadata.xur`). XUI renders a scene to a texture; M1 has no
  offscreen target. The file is present, so this is not a missing asset.
- **`unverifiedBlendModes`** — `BlendMode` 1 is alpha (DOCUMENTED); 2–5 are
  guesses and live only in `dashmain.xur` and the blade skins. The raw value
  is written to `data-xui-blendmode` so a frame can settle it.
- **`unresolvedVisuals` / `missingImages` / `deviceFiles` / `placeholders`** —
  see `tests/smoke/allowlist.json` for the three visuals and three paths the
  build itself cannot supply, each with its reason.
- No input, no audio (state changes record a cue and play nothing), and no
  scene-to-scene transitions: `XuiScene.TransFrom`/`TransTo` are parsed and
  ignored. Nothing yet decides which state a control should be in, so states
  change only through `__dashApi`; that is the shell's job.
