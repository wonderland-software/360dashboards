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
| `src/anim/bind.ts` | Joins a scope's sampled values to the rendered nodes it animates, and turns a `XuiSoundXAudio.File` keyframe into a cue. |
| `src/render/update.ts` | `NodeRecord` + `updateNode`: re-applies only what changed, and cascades a resize to the children the way the first render laid them out. `setOwnerText` pushes a control's new Text into its visual's presenters; `NodeIndex.removeSubtree` forgets a destroyed scene. |
| `src/input/InputMap.ts` | The 360 pad over the Gamepad API's standard mapping, merged with a keyboard map, d-pad auto-repeat, and an `InputRouter` with a focus stack. |
| `src/audio/AudioBank.ts` | The 16 extracted cues and one `AudioContext` unlocked on the first gesture. `attach(engine)` plays whatever File keyframe the playhead lands on; there is no state→cue table. |
| `src/text/Strings.ts` | `.xus` tables: `applyLocale` patches a parsed scene by (classIndex, propIndex, postorder objectId); `stringsByIndex` for positional tables. |
| `src/ui/ListView.ts` | `XuiList`/`XuiCommonList` row population from the list visual's own template. |
| `src/render/Viewport.ts` | The console's canvas→framebuffer transform, then a uniform fit to the window. |
| `src/telemetry.ts` | `window.__dash`: everything met and everything not honoured. |
| `src/debug/Inspector.ts` | `?debug` — tree, hover highlight, property dump. |

## Coordinates

**The design canvas is 1120×770 for the dashboard root and 184 of the 245 canvases**; 61 scenes declare other sizes (640×480, 720×480, 345×240 for `dashcomm/TitleMetadata` and more, see `canvasSizeOf`), and each scene renders in its own declared canvas.

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

Gradients and textures are laid out against the **element** box, in a unit
space that a leading `scale(w,h)` maps onto it. SVG's `objectBoundingBox` means
the *path's* bbox, and 27 figures carry points outside their stored box, so the
two are not the same and `objectBoundingBox` mis-scales those fills.

A figure with **no `Fill` block at all** (30 of them) takes the SOLID default in
the default colour, because XUR omits a property that equals its default; only
`FillType 0` paints nothing. `FillColor` 0xFF0F0F80 and `StrokeColor` 0xFF0FEB
come from the XuiTool class-extension schema and live in `xuiEnums.ts`.

`StrokeWidth` is scaled with the points (geometric mean of the two axes) —
INFERRED and unresolved: only 62 figures are stroked, 1,333 skin figures have a
point box unlike their element box, and no frame we have shows one big enough
to settle it. `SCALE_STROKE_WITH_FIGURE` is the switch.

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

A zero-extent axis is drawn 1:1; 27 figures carry points outside the box (12 of them with negative coordinates), so
the SVG never clips.

Fill (`FillType`, DOCUMENTED, default SOLID because 372 fills carry a
`FillColor` and no `FillType` while `FillType 0` is written 49 times):
`0` none, `1` solid, `2` linear gradient, `3` radial, `4` texture.
**The fill transform is MEASURED, not inferred** (`GRADIENT_TRANSFORM`, whose
comment carries the whole error table). `Fill.Translation / Scale / Rotation`
become one SVG `gradientTransform` in normalised (0…1) fill space, and the six
choices in that composite were swept as 40 candidates
(`tests/smoke/sweep-gradient.mjs`) against the tab staircases of `f0051` and
`f0034` — the staircase is drawn by `blade_grey_left` / `blade_grey_rt`, whose
edge lines are radial-gradient rings, so nothing else on screen decides it.
The winner, by a wide margin on both blades:

| field | value | what it means |
|---|---|---|
| `direction` | `texture` | the matrix maps the box's own (u,v) INTO gradient space, so the SVG transform is its inverse |
| `origin` | `centre` | scale and rotation act about the box centre |
| `rotation` | `+1` | the standard matrix in y-down uv, so `Rotation 90` runs bottom-to-top |
| `radial` | `axis` | the resting radial is the ellipse inscribed in the box (rx = w/2, ry = h/2) |
| `translation` | `box` | `Translation` is a fraction of the box, not design pixels |
| `order` | `SRT` | scale, then rotate, then translate |

Summed luma MAD over both stacks, lower is better: **40.95** for this model,
42.41 for `rotation -1`, 73.73 for `origin topleft`, 81.93 for
`translation design`, 88.73 for `order TRS`, and **103.33 for the old
`shape/centre/axis` rule** that this replaced. Per blade the change is
`f0051` MAD 51.99 → 19.76 (NCC 0.225 → 0.877) and `f0034` 51.34 → 21.19
(−0.021 → 0.889); the tab-edge valleys land within 3 px of the frame's where
the old rule drew none deeper than 13 luma. The rotation SIGN is settled by
`botd/defaultbanner1` rather than by the sweep, which barely exercises it — see
the source comment for the four border strips that fix it.

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

`PointSize` is **not** a pixel height, and the two axes behave differently.

**Horizontally** an em is `PointSize * 100/72` design px. Fitted by 1-D
normalised cross-correlation of the gradient-magnitude column profile of our
render against `f0060`, reporting the factor our render still needs:

| string | PointSize | kx | ky (before) | ky (after) |
|---|---|---|---|---|
| Console Settings | 22 | 1.003 | 0.9445 | 0.988 |
| Back | 18 | 1.000 | 0.9295 | 0.985 |
| Select | 18 | 0.997 | 0.9535 | 1.000 |
| Current Setting | 20 | 0.991 | 0.9865 | 0.997 |

**Vertically the glyphs are not stretched by the canvas.** The "before" column
is our render with the em applied to both axes: it wants to be 4.65 % shorter,
mean ky 0.9535, against `sy/sx = 21/22 = 0.9545` — a match to 0.1 %, at four
sizes, while kx stays at 1. So the console rasterises glyphs **isotropically at
the canvas's horizontal scale**, and only the layout goes through the
anisotropic view transform. Text nodes therefore carry `scaleY(21/22)`
(`GLYPH_ASPECT`), about the top of the line block when the text is top-aligned
and about its centre when `VALIGN_CENTER` is set. The "after" column is the
residual: within 1.5 % on all four, and the baseline offsets drop to ≤1 px at
1080p.

Reading `100/72` as "a real point size at 100 dpi" is INFERRED; both numbers
are measured.

The line box is the **face's own ascent+descent**, read off the font at
runtime rather than hard-coded, so the first baseline lands where the console
puts it.

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
(−100…100) and EaseScale (0…100). What build 6770 stores, over all 454 Ease
keyframes: `100/100/50` ×237, `100/0/50` ×115, `0/0/50` ×68, `0/100/50` ×19,
`2/100/50` ×6, `100/-100/50` ×5, `-100/100/50` ×3, `-100/0/50` ×1.

The curve is a cubic Bézier through (0,0) and (1,1) with
`P1 = (1/3, 1/3 − k·EaseIn/300)` and `P2 = (2/3, 2/3 + k·EaseOut/300)`,
`k = EaseScale/50`. Because the x control points stay at 1/3 and 2/3, `x(u) = u`
exactly, so the parameter *is* the input fraction and no root-finding is needed.
At 0/0 both points land on the diagonal and the curve is the identity.

**The signs are measured, not chosen for looks.** A positive EaseIn pulls the
first control point *down*, so a `100/0/50` segment starts from a standstill:
`y = 2u² − u³`, `y'(0) = 0`, peak speed at `u = 2/3`. Against the 60 fps
capture, dashmain's blade-open transition (`f2159`…`f2185`, Ease `100/0/50`)
has its per-frame pixel-difference energy rise monotonically from 3.7 to a peak
of 49.6 at `f2179` — **77 % of the span**, firmly in the second half. Our curve
peaks at 67 %; the endpoints of the measured span are fuzzy to ±2 frames
(74–77 %), and the energy mixes many elements with different keyframe spans, so
the sign convention is settled and the exact shape is pinned to about ±10 % of
the span. The opposite convention would peak at 33 %.

**Play once.** `playOnce()` runs a scope's timeline from frame 0 and holds on
the last frame. It exists for one thing: `XuiScene.TransFrom`/`TransTo` name
visuals (`FadeIn`, `FadeOut`) that carry a single timeline and *no named
frames*, so neither `playRange` nor the ambient loop describes them.

**Ambient scopes.** A scope with timelines and no named frames has no `Play`
command to start it, but the console clearly runs those — 12 of dashmain's 43
are like this (`BG_animation/groupBackground1` is 990 frames) and reference
frames 1.33 s apart differ by 1.5–1.9 grey levels in exactly those backgrounds.
They free-run from frame 0 and loop at the last keyframe. That the wrap is a
loop rather than a hold is INFERRED; a hold would freeze the background, which
the frames rule out.

**Control states.** `setState(controlId, state[, underPath])` plays the visual's
`<State>`…`End<State>` range down the documented fallback chain
(`Focus→Normal`, `Press→Focus`, `PressDisable→NormalPress→Press`, and the
INFERRED `Normal→Default`). `underPath` scopes it to one subtree: ids are not
unique in the document (`legend_a`, `legend_b` and `metaPanelScene` are in
dozens of scenes at once), so an unscoped call fires one cue per copy.

**Cues are keyframes, and a keyframe is an EVENT.** `XuiSoundXAudio.File` is an
animated track and the File values are in the files — an earlier note here said
they were empty and hand-mapped states to the five `shrdres` sounds, which was
invented. What the data says: `btn_1line_icon` sets `btn_Focus.xma` on its
Focus frame 15, `btn_Select.xma` on Press 269, `btn_InactiveSelect.xma` on
PressDisable 283 and **nothing on InitFocus 296** — so a page arriving with
focus somewhere is silent and moving focus is not. `legend_B` sets
`btn_Back.xma` on frame 2 of its Press range. `RootScene`'s four emitters carry
every blade and level cue.

The event reading matters: `_2ndLevel_Sounds` writes `dash_2ndLevelClose.xma`
on frames 435, 497, 581, 656, 1020 … with **no keyframe in between**, so
"the sampled value changed" fires the first and swallows the rest — including
the one inside `BootLive`. So `bind.ts` tabulates each sound's File frames at
bind time and `TimelineScope.onFrame` reports the tick the playhead LANDS on
(never a `seek`, so parking a blade at its rest frame is silent).
`AudioBank.attach(engine)` plays the file the cue names.

**Reference footage caveat.** The 6717 60 fps capture is 30 fps
frame-doubled — every even frame duplicates the one before it, 0.03–0.18 units
of pixel-difference energy against 3–50 on the odd ones. Durations off it are
trustworthy; per-60Hz-frame velocities are not.

**Updates.** `updateNode` re-derives the container style always, rebuilds the
element's own paint only when a content key changed (`Fill.*`, `Stroke.*`,
`Points`, text or image properties), and relays out the children only when the
element actually resized. Data attributes stay current: `data-xui-tick` and
`data-xui-range` on the scope's element.

`window.__dash.timeline` reports `{ scopes: [{id, tick, playing, range,
lastCue}], playing, frozenAt, fps }`, where `fps` counts timeline frames
stepped in the last second — 60 on a healthy page.

## Lists

The geometry is read out of the skin, not guessed. The `XuiList` visual is a
TEMPLATE: `control_ListItem` (a `XuiListItem`, 420×**45**, Anchor 15,
`Visual="XuiButton"`) and two `XuiScrollEnd`s (`control_ScrollUp` /
`control_ScrollDown`, 27×27, Anchor 12 = RIGHT|BOTTOM, the down one carrying
`Direction 1`). So the 45 px pitch, the row's look and where the arrows land
are all data. Row *k* top = list y + 3 + 45*k*.

A control with no `Visual` falls back to a visual named after its **class**, and
this is now the general rule in `DomRenderer.defaultVisualFor`, not a
list-only convenience. `dashuisk/skin.xur` says so itself: it carries a literal
separator child `Id="---------------Default-----------------------------"` and
then a block named exactly for the classes — `XuiLabel`, `XuiLabelCenterJustify`,
`XuiLabelRightJustify`, `XuiButton`, `XuiButton_Multiline`, `XuiBackButton`,
`XuiCheckbox`, `XuiEdit`, `XuiList`, `XuiRadioButton`, `XuiRadioGroup`,
`XuiProgressBar`, `XuiGamerCard`, `XuiBOTDContainer`, `XuiScene`. The lookup
walks the registry hierarchy and takes the first name the skin actually defines.
It is invisible on most controls (`XuiScene`'s default is empty) and decisive on
a few: `XuiLabel`'s default is a single `XuiTextPresenter`, and without it a
`XuiLabel` that names no `Visual` had nothing to paint its `Text` with —
`botd/defaultbanner0.xur`'s `label_Body`, the "Games. Tournaments…" paragraph on
the Xbox LIVE blade, drew as an empty box. Lists are excluded because `ListView`
instantiates the `XuiList` default itself (it needs the `control_ListItem`
template), and mounting it twice would paint the template row twice. The rule
also explains the only unresolved visuals in the build: `XuiScrollEnd` and
`XuiScrollEndUp` are class-default names the skin never defines.

**The window is nine rows.** `lstSettings` is 423×435 at a 45 px pitch, so it
holds `floor(435/45) = 9`; rows outside the window are not drawn, and past the
bottom the window slides by one and the selection pins to the last slot. At
System Info (row 10 of 11) the window has moved by two — measured on `f0060` /
`f0066`, whose row-label ink profiles cross-correlate at ncc 0.902 for a shift
of two against 0.371 / 0.326 / 0.291 for 0 / 1 / 3. The metapane is indexed by
the VISIBLE slot, not the table row: `metaScene_1line` authors `1To2`…`8To9` and
nothing beyond, which is the same nine.

**The chevron is a state, not a visibility flag.** `scr_ScrollEndDown`'s
children carry `Show=false` across its `Normal` range (frames 0..1) and
`Show=true` from frame 2, the start of `ScrollMore` (2..3); `Scrolling` is
4..20. So the console drew an arrow by putting the scroll end into `ScrollMore`
and drew none by leaving it in `Normal`. Background-subtracted glyph centroids,
design px, reference vs our render: `f0060` down `(545.62, 572.83)` vs
`(545.56, 573.01)`; `f0066` up `(521.66, 576.61)` vs `(521.88, 577.35)`.

`ItemsText`/`ItemsImage`/`ItemsNavPath` are CRLF-separated (31 lists use them).
`lstSettings` declares none, so its rows come from the positional table the
console indexed, `consoles/dashCSettingsStrings.xus` — see
`dashboards/blades/consoleSettings.ts` for the indices, and
`dashboards/blades/codeLists.ts` for the six other lists now filled the same
way. Those tables are localized like everything else: the row indices are read
out of `consoles/<locale>/dashCSettingsStrings.xus` when a locale is in force,
so `&locale=de-de` translates the code-filled rows too.

**Overlay against `f0060`**, fitted by normalised cross-correlation of
gradient-magnitude row profiles between our 1920×1080 console-view render and
the frame (`dy` in design px; negative means our render sits lower):

| | row text | separator strip |
|---|---|---|
| `LIST_ITEM_TOP = 3` | −3.12 / −3.30 / −2.99 | −2.93 (ncc 0.95) |
| `LIST_ITEM_TOP = 0` | −1.34 / −0.31 / +0.06 | +0.06 (ncc 0.96) |

So **row k's top is list.y + 45k**, with no 3 px inset. The old +3 came from
reading the calibration's "row 0 top edge = design 157" as the row origin, when
157 is the half-intensity crossing of a separator figure 3 design px tall that
starts at the row's y = 0. Both halves of the list move together, which is what
makes it a geometry answer rather than a text one — the header label and the
row labels carry the same `TextStyle` (0x4011, **no** `VALIGN_CENTER` bit) and
go down the same top-aligned path, so no text rule could have moved one without
the other. Residuals now match the header's (+0.61 design px).

The down arrow lands at list-relative (386, 409), i.e. design (532, 560), where
the frame has it; the up arrow is correctly hidden at the top of the list.

**Focus states are edge-triggered.** A state range is motion, not a property:
re-issuing `Focus` restarts it at its opening frame, and XuiButton's Focus runs
frame 15 → 253 with `EndFocus` looping back to `FocusLoop` at 28. `ListView.move`
returns `null` when a clamp absorbs the press and `ListView.focus` is a no-op
when the index has not changed, so a held d-pad at either end of a list no
longer re-enters the range (and fires no cue). `TimelineScope.entries` counts
range starts — a `GoToAndPlay` loop does not increment it — which is what the
unit and smoke assertions watch.

## The Blades shell (M3c)

The glue lives in `dashboards/blades/` and is described by
`reference/glue/BLADES_GLUE_SPEC.md`. The one thing to hold on to: **the
dashboard is one scene.** `dashmain/dashmain.xur` carries 129 objects, 73
timelines and 2,315 keyframes over 1,299 frames, cut into 39 named ranges, and
every blade transition is already in there. The shell animates nothing — it
composes, then plays ranges.

| file | what it holds |
|---|---|
| `tabs.ts` | the six blades, the colour index, rest frames, panel scenes, the switch and level range names |
| `panels.ts` | `PanelSettings`/`PanelStrings`/`PanelScenePaths`, and `MetaPanelScene::GotoIndex` |
| `consoleSettings.ts` | the 11-row Console Settings table from the executable |
| `nav.ts` | the eight System nav ids, the pack each resolves in, IPTV hiding |
| `BladeShell.ts` | mount, `go`, the scene stack (`press`/`back`), focus, the metapane, `boot`, `updateContentPanelVisual` |
| `focus.ts` | `DefaultFocus` and the authored `NavUp`/`NavDown` chain |
| `lists.ts` | which list a code table fills, shared by the shell and the `?scene=` route |
| `transitions.ts` | `TransFrom`/`TransTo`/`TransBackFrom`/`TransBackTo` |
| `boot.ts` | the fifteen boot/return ranges and their 0-based target tabs |

Three things that are easy to get wrong and are each pinned by a test:

- **The colour index is one behind the tab index.** The skins define
  `blade_1..5`; Marketplace (Tab1) wears `blade_5`, the burnt orange. Do not
  derive one from the other.
- **`DefaultTab 2` is 1-based** — the console comes up on Xbox LIVE.
- **The panel-list separator is the two characters `\` `0`, not a NUL byte.**
  Splitting on a real NUL yields one entry and makes the property look like a
  single string.

Only adjacent switches exist: `XuiTabScene` can format `%uTo1` and `1To%u`, but
dashmain sets no `Wrap` and authors no such range, so a jump is impossible
rather than merely unimplemented. Second level and deeper is a **counter** —
`NOpen` once, then `NBlink` for every level below it, in **both** directions.

**Two static-render changes the spec required**, both reported rather than
slipped in:

1. **An animated `Visual` now re-skins its control.** §1.3 is explicit that the
   blade colour is driven by the timeline and must not be hard-coded, and
   dashmain drives `BG_color_1`, `BG_color_2`, `color_highlight_left/rt` and
   `blade_top_jewel` through the palette on every switch. `updateNode` had no
   path for it, so every blade rendered in Marketplace's orange. The palette
   visuals carry no timelines and no named frames, so the swap is a pure
   re-render with no scope to re-bind.
2. **`DataAssociation` now gates a presenter's text.** A non-zero association
   selects a secondary slot only console code could fill, so those presenters
   render empty. `btn_1line_icon` has `txt_line3` (association 0) *and*
   `text_Label_r` (association 1), and both were showing the control's `Text` —
   every System nav caption was drawn twice, overlapping.

### Navigation, boot and the metapane (M3c)

**A press is a scene push.** `press()` reads the focused control's `PressPath`
(or, on a code-table list, the row's destination from the executable's table),
resolves it through the collision-free global basename index, creates the scene
and pushes it into the pressed control's PARENT — which is what
`NavigateToScenePath` (0x921a5c28) does. `RootScene` plays `%uOpen` at level 0
and `%uBlink` deeper, `back()` plays `%uClose` or `%uBlink`, and the level is a
counter, not a per-press choice. Tab switching is locked while a page is open.

`NavigateToScenePath` also copies an x/y onto the new scene (0x9214d430 /
0x9214e7f0). We read that as the source SCENE's x/y, i.e. (0,0): every
second-level target in this build declares the full 1120×770 dashboard canvas,
and offsetting Console Settings by `navSettings`' (297,153) would put its header
off the plate. That is a reading, and it is the only place in the push that is.

**Transitions come out of the skin.** `FadeIn` and `FadeOut` are one-timeline
visuals whose single child is a proxy box carrying `Opacity` and `Show`:
FadeOut 1→0 over 5 frames with Show false at 5, FadeIn 0→1 over frames 13…30.
So the visual is a CURVE and the thing it drives is the scene. Measured on a
push: the System blade goes 1 → 0.4 (frame 3) → 0 (frame 5) and Console
Settings 0 → 1 by frame 30, then back the other way on B.

**Focus** is authored, never searched. `DefaultFocus` when the scene declares
one; otherwise, for a `DashScene`, `PanelSettings[0]` — which is why Games and
Media come up with the metapane on "Create Gamer Profile" no matter which row
you look at. `NavUp`/`NavDown` walk a linked list with no wrap; `NavLeft` and
`NavRight` are unset everywhere in the build because that axis is the blade
switch. A move that the end of the chain absorbs returns null, so it plays no
state and fires no cue.

**The metapane** follows focus exactly as `CDashScene` does: destroy the
previous sub-scene, load `PanelScenePaths[i]` if it is non-empty, write the
description into the placeholder's `Text`, then `GotoIndex` — `%dTo%d` for an
adjacent step and `%dTo%dEnd` alone for a jump, 1-based, resolved through the
`metaScene_1line` VISUAL. Console Settings is the exception the spec calls out:
its text comes from the code table's description index, not `PanelStrings`.

**Boot.** With no `?blade=`, the first load plays a boot range. The dispatcher's
cold-boot default is `BootLive` (frames 462…533, 71 frames = 1.18 s against the
73 presented frames the capture measures) landing on tab index 1 = Tab2 = Xbox
LIVE, and it fires `dash_2ndLevelClose.xma` on frame 497 out of its own
timeline. The Xbox logo sequence before it is not in this archive and is not
faked (PLACEHOLDERS.md); we start on the frame the console hands over,
`BootLive`'s own opening frame. `?boot=<range>` picks another of the fifteen and
`?boot=none` parks on `DefaultTab` instead.

**Five stills** (`tests/smoke/out/blade*.png`) are rendered through the console
view at 1920x1080 so they overlay the reference frames directly.
`smoke-blades.mjs` measures each one against its frame with the same detector
it runs over the frame — page left is the strongest falling luma edge in the
y≈20 band, page right the darkest column one page-width to its right — and that
detector reproduces all ten of §1.3's hand-read landmarks to within 3 px:

| blade | page left ref/ours | page right ref/ours | label dx,dy | body NCC/MAD | stack NCC/MAD | body luma ref→ours |
|---|---|---|---|---|---|---|
| Marketplace | 148 / 148 | 1506 / 1506 | −1, 1 | 0.278 / 19.5 | 0.889 / 21.1 | 150 → 141 |
| Xbox LIVE | 226 / 227 | 1575 / 1578 | −1, 0 | 0.160 / 28.7 | 0.826 / 25.3 | 158 → 161 |
| Games | 292 / 292 | 1644 / 1643 | −1, 1 | 0.492 / 16.8 | 0.886 / 21.0 | 135 → 142 |
| Media | 365 / 367 | 1711 / 1712 | 0, 0 | 0.521 / 13.8 | 0.882 / 20.4 | 117 → 121 |
| System | 435 / 435 | 1758 / 1763 | −1, 0 | 0.578 / 10.8 | 0.875 / 19.7 | 120 → 116 |

Every page edge is within 6 px of the spec's landmark (worst: System's right
edge, 1763 against 1757, and 5 px against what the detector reads on the frame
itself), and every tab label's ink is within 1 px on both axes. This replaces
the earlier top-band fit that reported dx drifting to −33 px on System: that
number came from correlating a band that mixed the staircase with the page and
is superseded, not explained away. The body NCC on Xbox LIVE (0.160) is the
weakest of the five and stays open — its panel is the one with the most
Live-dependent content missing.

## NXE 9199 (M4a)

The same app serves both builds. `?build=9199` is the only switch: it picks the
manifest under `public/assets/9199/`, the class registry generated from that
build's own `dash.xex`, the audio directory, and the canvas -> framebuffer view.
`packages/runtime/src/build.ts` is the one table of what differs, and it is
three things and no more:

| | Blades 6770 | NXE 9199 |
|---|---|---|
| root canvas | 1120x770 | 1280x720 |
| view transform | `x*8/7`, `y*12/11 - 64` (MEASURED) | identity (MEASURED) |
| glyph counter-scale | `scaleY(21/22)` | `scaleY(1)` |

The third follows from the second: the console rasterises glyphs isotropically
at the canvas's horizontal scale, so Blades text has to undo the view
transform's extra vertical stretch and NXE has nothing to undo.

**The 1:1 mapping is measured, not assumed.** The front Moby slot is authored
420x320 at `MobyFrontPosition` (96, 570) and its own edges land at left 95.3,
right 515.6, top 248.0, bottom 568.0 on the default-theme home frame - 420.3 x
320.0 against 420 x 320, and the 2 px in y is the rig's own `-2`
[FRAME `nxe-9199-YrtwSj1f6aY/f0483`]. The 202 scenes whose *canvas* is 1120x770
are Blades-era pages whose canvas is an authoring leftover; their root scene is
880x480 and it is the root scene that gets positioned.

Two shared-module changes are gated on the build, and both gates are backed by
a corpus sweep rather than by caution:

- **`XuiNineGrid` renders** (`border-image` from the four offsets). No scene in
  build 6770 carries one, so Blades cannot reach the branch; 9199's
  `PanelScene` shadow and eleven `firstrun` scenes depend on it. An
  **alpha-only** nine-grid (`ColorWriteFlags & 7 == 0`) draws NOTHING and is
  recorded: every `mobyslot*` visual ends with a `common://CornerMask.png`
  nine-grid at `ColorWriteFlags 8`, which rounds the panel's corners on the
  console and, drawn as a picture, covers the whole slot.
- **`DataAssociation` gates a XuiImagePresenter's picture**, the way it has
  gated a text presenter's text since M3. Build 6770 has 31 image presenters
  with a non-zero association that draw today (30 in `dashuisk/skin.xur`, one
  in `videocha/VideoChatMain.xur`), so the rule is 9199-only; without it
  `TraySlotScene`'s `imgIcon` (association 20) repaints the slot's 420x320
  background stretched into a 208x342 box.

### What renders

`?build=9199` composes the home page the way `CEpixHomePageScene` does.
`homepage/homepage.xur` is three empty groups; everything on screen is put
there by `dashboards/nxe/`:

| file | what it holds |
|---|---|
| `epix.ts` | `emb_homepage.xml` + the three `epix://` files, the `<condition>` evaluator, the Epix-path -> `.xur` table, and the `IDS_` -> `homepage/strings.xus` map |
| `variables.ts` | `controlp/Variables.xur`, read by the 43 names in the code's own table at `.rdata` 0x927f7108 |
| `projection.ts` | `XuiPerspectiveScene` as a CSS `perspective` |
| `panelRig.ts` | `controlp/PanelScene.xur`: the texture surface, the mirror, the shadow |
| `slotArt.ts` | which picture and caption each Moby slot wears |
| `legend.ts` | `controlp/LegendScene.xur` as a shell service |
| `consoleSettings9199.ts` | the eight-row 16-byte table at 0x92016a90 |
| `NxeShell.ts` | mount, compose, the strip at rest, `LegacyControl` hosting, `__dash.nxe` |

`&page=<pack>/<file>` hosts an 880x480 legacy page in the same shell instead of
the strip.

### The projection, and a correction to the spec

`XuiPerspectiveScene` owns `ProjectionScale`, `ProjectionCenterU`,
`ProjectionCenterV` [CODE 0x9217f544]. Their defaults are NOT recovered and the
only scene that sets one sets `ProjectionScale = 0`, so the projection is
measured off the footage. The model is a pinhole,
`s(z) = 1/(1 + z/f)`, `screen = C + (P - C)·s`, which is exactly what CSS
`perspective: f` with `perspective-origin: C` computes for a child at
`translateZ(-z)` - so `PanelLayer` wears those two properties and each panel
wears its own 3D position. Panel *k* sits at `z = k · MobyDefaultSpacing` on
the straight line from `MobyFrontPosition` to `MobyBackPosition`.

**Refitted in M4b, and the M4a numbers were over-fitted.** Ten landmarks on
three panels of ONE frame, three of them the same panel, do not constrain three
free parameters where it matters - far down the strip, where panels are 60 px
apart rather than 200. The fit is now over **thirty-two landmarks on six panels
of two frames** (`Yrt f0483`, default theme; `Kpa f0048`, a themed console),
detected by a rule rather than by hand: the model predicts panel k's box, and
each edge is the strongest luma step across a band that crosses only that panel.

```
f = 1434    Cu = 153.5    Cv = 353.3      rms 0.93 px, worst 2.47 px
```

against **rms 1.59** for M4a's numbers over the same thirty-two. Fitting each
frame alone gives 1428/154.8/353.4 (rms 0.70) and 1443/150.5/353.0 (rms 1.02);
the projection belongs to the console and not to a capture, so the joint fit is
the answer and the spread between two capture chains is the error bar on `f`
(about +-8).

**The anchor carries the rig's own -2.** Panel 0 sits at z = 0, where the
projection is the identity, so its top and bottom are exactly 250 and 570 - and
both frames read 248 and 568. Those two pixels are `ReflectedItems` at the rig's
(0,-2) [SCENE], not a projection error; leaving them out of the fit dragged Cv
3 px down and doubled the rms. **A residual that is the same on the top and the
bottom of one panel is never the projection.**

The M4a fit, for the record:

```
f = 1428    Cu = 154.5    Cv = 356.5      rms 0.46 px on its own ten landmarks
```

| landmark | measured | model | d |
|---|---|---|---|
| panel 1 left / right / top / bottom | 95.3 / 515.6 / 248.0 / 568.0 | 96.0 / 516.0 / 248.0 / 568.0 | +0.70 / +0.40 / 0.00 / 0.00 |
| panel 2 right / top / bottom | 826.6 / 284.0 / 519.8 | 827.5 / 283.8 / 520.2 | +0.86 / −0.19 / +0.41 |
| panel 3 right / top / bottom | 1010.5 / 305.0 / 491.9 | 1009.9 / 304.8 / 492.2 | −0.62 / −0.22 / +0.31 |

Two of the three unknowns are fixed by panel 2 alone, so **panel 3 is the
independent check** the phase asked for: all three of its edges land within
0.62 px.

**This corrects `NXE_GLUE_SPEC` §2.2.** The spec calibrated `f ≈ 1748` from one
number - the second slot's left edge - under the assumption that the projection
is about the FRONT ANCHOR. The same frame refutes it: projecting about the
front anchor puts panel 2's bottom edge at 577.8 where the frame has 519.8, a
58 px error, and `f = 1749` with the centre free still leaves rms 25 px. The
panels do not slide along the floor as they recede; they converge on a point
356.5 px down the screen, which is why the frame's panel bottoms RISE
568 -> 520 -> 492 while the tops fall 248 -> 284 -> 305.

Still INFERRED: that these three numbers are what the console put in
`ProjectionScale` / `ProjectionCenterU` / `ProjectionCenterV`, and in what
units. `Cv = 356.5` is within 3.5 px of the screen's own vertical centre;
`Cu = 154.5` is near nothing obvious. A reader in `.text` near 0x9217f544 would
settle it.

### Composition, offline

`emb_homepage.xml` declares eight channels; seven pass with no Live account.
The predicates are console state the archive cannot answer, so every one is a
switch and `__dash.nxe.conditions` reports its value and whether it is
evidenced:

| channel | condition | offline | name |
|---|---|---|---|
| Games | `EcoInLiveLocale()` | yes | Game Marketplace |
| Video | `EcoVideoMarketplaceAvailable()` | yes | Video & Music Marketplace |
| Friends | `EcoInLiveLocale()` | yes | Friends |
| Inside Xbox | `EcoInsideXboxAvailable()` | yes | Inside Xbox |
| Promotions | `EcoEventsAvailable()` | yes | Events |
| WELCOME | `EcoShowWelcomeChannel()` | yes | Welcome |
| XBOX360 | — | yes | My Xbox |
| COMMUNITY | `!EcoLiveTier(None)` | **no** | Friends |

`EcoLiveTier(None)`, `EcoHdDvdInstalled()` and `EcoMediaroomEnabled()` are
evidenced by the footage - with the last two false and Solutions gated on a Live
tier, My Xbox is **8 slots**, which is what "1 of 8" under the front panel says
[FRAME `Yrt f0483`]. The other five are INFERRED and say so.

`MobyVisiblePanelDistance` (3225) then culls: 3225 / 505 = 6.4, so seven panels
are built and the eighth (Settings, z = 3535) is not - the front slot plus six
receding ones, which is what the frame shows.

**The `IDS_` map.** Channel and slot captions are `%EvResStr(IDS_…)%` against
`homepage/strings.xus` (25 positional entries). The mapping is a pair of
parallel `.rdata` arrays - 25 name pointers at 0x927f26b8 and 25 indices at
0x927f25f0 - read with the name array offset one slot against the index array,
which resolves EIGHTEEN CONSECUTIVE names to exactly the string they are called
("Disc in Tray", "Gamer Card", "Game Library", "Video Library", "Music
Library", "Picture Library", "Windows Media Center", "TV and media from your
PC", "System Settings", "Solutions", "Help, How-to, and Tips", "HD-DVD",
"Events", "Primetime", "Video & Music Marketplace", "Friends", "Game
Marketplace", "Inside Xbox"). **The offset does not hold at both ends and that
is stated, not papered over**: `IDS_CHANNELNAME_WELCOME` comes out "Welcome"
under it but `IDS_CHANNELNAME_XBOX360` and `IDS_CHANNELNAME_FRIENDS` come out
swapped, so those two are settled by the strings themselves and by the frame,
and are tagged `string+frame` in the table. `IDS_SELECT`, `IDS_SELECTSLOT` and
`IDS_TELLMEMORE` resolve outside this table and are not mapped.

### The panel rig

The mirror geometry is the file's, not ours. `Reflection` is 528x512 at
y = 1022 with `Scale = (1,-1,1)`, so its top edge - the mirror line - is at
1022 - 512 = 510, and the hosted scene is LEFT- and BOTTOM-aligned in the
512x512 surface so that its foot sits on that line. Two independent things say
that alignment is right: the reflection then starts exactly at the panel's foot
(which is what the footage shows), and the rig's `Shadow` is authored at
y = 190 with height 320, and 512 − 320 − 2 = 190 is precisely where a
bottom-aligned 320-tall slot starts. The rig's origin therefore goes one full
surface (512) above the strip anchor, and the surface's own −2 is exactly why
the panel's foot lands at 568 against a `MobyFrontPosition` of 570.

`XuiTextureSurface` is a live DOM subtree and the reflection is a second, live
copy of it with a CSS alpha ramp standing in for `reflection.uxfx`. Both are
approximations and both are in PLACEHOLDERS.md.

### `LegacyControl`

An 880x480 Blades-era `DashScene` centred at x = 640 inside the 1280x720 shell,
with its own `legend_a/b/x/y` and `labHeader` parked far outside its own scene
(y = 1111/1139 and y = −467.8) so the shell's `LegendScene` can hoist them.
`consoles/dashSysCslSet.xur` is the worked example: eight rows from the 16-byte
table at 0x92016a90, the metapane on the right, "Console Settings" in `LTitle`
and "Ⓐ Select Ⓑ Back" on the legend row.

Measured against the Console Settings still, with the same detector on both
(`tests/smoke/smoke-nxe.mjs`):

| | frame | ours | d |
|---|---|---|---|
| framed left | 192.3 | 192.5 | +0.17 |
| framed right | 1085.7 | 1082.5 | −3.17 |
| framed top | 109.7 | 110.5 | +0.83 |
| framed bottom | 593.7 | 593.5 | −0.17 |
| **list row pitch** | **45.10** | **44.90** | **−0.20** |

**The border is not the story it looked like, and M4a's placement was an
assumption dressed as a measurement.** What both sides draw is the page's own
`BackgroundPanel` visual, which ends in a 907x500 nine-grid at (-15,-12) - so
the outer edge IS a fair landmark, and the border is not symmetric. Solving for
the page origin from it puts the page at centre x **638.8**, top **114.7**; M4a
read the 4 px of extra height as a symmetric 2 px border and put it at 640/111,
which is 3.7 px high. The remaining −3.17 on the right edge is 3.4 px of
nine-grid border ink, not placement: the other three edges land within 0.9 px.

The row pitch is the landmark no border can shift, and it settles a number the
spec leaves open: the spec reads 46 px off `SystemScene`'s hand-placed nav
buttons (y = 10, 56, 102), but the Console Settings LIST runs at **45**, the
same pitch as Blades - because the pitch comes from the `XuiList` visual's own
`control_ListItem`, not from the scene's. **The detector is a comb, not eight
picks**: scoring every (pitch, origin) pair by the rising-step response at the
eight positions it predicts. Taking the eight strongest steps and averaging
their gaps - which is what M4a did - lets one strong impostor turn the "mean
pitch" into the distance between the first and last thing it happened to pick,
divided by seven.

**Where Blades' machinery is reused, and where it is not.** `ListView`,
`FocusModel`'s arrival rule, the `DashScene` panel tables and the
`MetaPanelScene` visual are unchanged - §4 of the spec is explicit that "the
second-level page machinery is Blades'; only the frame around it is new". What
is NOT the same: the code table is 16 bytes an entry rather than 20 (no
`altHandler`) and has eight rows rather than eleven, and the page's legend and
header are hoisted instead of drawn in place.

**Frame-number correction.** `NXE_GLUE_SPEC` §5 and
`reference/frames/nxe-README.md` both cite `Kpa f0375` for Console Settings.
`f0375` is SYSTEM Settings (seven rows); the eight-row Console Settings page is
`f0381`. The row set and order the spec gives are exactly right.

## NXE 9199, M4b: the strip moves

M4a placed the strip; M4b integrates it. Everything M4a listed as not done is
done, and `__dash.nxe.physics` now names the READINGS the data does not settle
rather than the features that are missing.

### The integrator

`controlp/Variables.xur` gives three constants per axis and no unit. Two of the
three possible units are refuted by arithmetic alone (z units make one step take
25 s; per-frame units make it take 0.9 ms), and the third - **index units per
second** - is confirmed by an exact number: for a triangular accel/decel move of
distance 1, `T = sqrt(2 (a + d) / (a d))`, and the channel axis (50/40) closes at
`sqrt(0.09)` = **0.300 000 s**. Two numbers that are not round producing a round
three tenths of a second is the evidence; it is still INFERRED and says so.

The input is a SERVO to an integer target, not free acceleration. Read
literally, §2.3's "a held direction accelerates the cursor toward a velocity
cap" makes a one-frame tap move 0.007 of a panel; the console moves exactly one.
Holding re-targets as each step completes, which is the same continuous scroll
without a second model.

The braking rule is a **speed ceiling**, `|v| <= sqrt(2 d e)`, not a switch.
Written as a switch - accelerate until the braking distance, then decelerate -
the discrete step overshoots, the arrival clamp eats the tail, and the
integrator disagrees with its own closed form by 12 % (17 frames against 20.5).

**Measured**, on the only two captures that can carry a velocity claim. The
per-frame displacement is a 1-D cross-correlation of a row band between
consecutive frames, so it measures the strip and not a threshold:

| | frames | seconds | screen centroid | peak at |
|---|---|---|---|---|
| model, panel axis 40/30/20 (cursor) | 19 | 0.317 | — | 0.42 |
| model, same, projected onto a panel edge | 19 | 0.317 | 0.428 | 0.42 |
| **measured, 8498 t = 504.0 s** (genuine 60 fps) | 22 | **0.367** | **0.446** | 0.32 |
| **measured, 9199 t = 240.5 s** (30 fps doubled) | 23 enc | **0.383** | **0.410** | 0.23 |
| closed form `stepDuration` | 20.5 | 0.342 | — | — |

Three more 9199 steps in the same run measure 0.383 s each. So the file's own
constants reproduce the console's move to within two to four frames of
twenty-two, and the SHAPE agrees once the projection is applied - which it must
be, because a constant cursor rate is not a constant screen rate. Comparing a
measured screen profile against a cursor profile is meaningless and would have
made the fit look 20 % worse than it is.

The 8498 capture is **build 8498, not 9199**: its own `Variables.xur` was not
extracted and may differ. It is quoted because it is the only genuine 60 fps
material, and the 9199 number is quoted beside it.

### The fold cascade

`FoldSpeed 30 / UnfoldSpeed 10` with `FoldNextRange 0.3 / UnfoldNextRange 0.7 /
UnfoldMinSpeed 0.1`, read as progress per second with panel *k+1* starting when
panel *k* passes `NextRange`: a fold is 33 ms a panel and 11 ms of stagger
(seven panels in 100 ms), an unfold 100 ms and 70 ms (520 ms). At 30 FRAMES a
fold would be slower than an unfold, which is backwards from every capture.
`UnfoldMinSpeed` cannot bind, because `UnfoldEaseRange` is unset in the file and
nothing else varies the rate; it is applied anyway rather than dropped.

**The gate has to be read off the progress at the START of the frame.** Read off
the array being written, panel 0 advances, panel 1 sees the advanced value,
passes its gate and advances in the same pass - and the whole cascade collapses
into two frames. A cascade whose stagger is one frame is not a cascade, and
nothing about the code says so.

Measured: four channel changes on the 9199 home run measure 0.78, 0.92, 0.95 and
0.82 s of continuous motion (a fold, a rebuild and an unfold). The model is
0.62 s. That 25 % is unexplained and is not tuned away: the fold's GEOMETRY is
inferred, so its duration is the only thing worth quoting.

### The cues

The eight `Sound*` entries of the code table at `.rdata` 0x927f7194, played by
the GLUE - the opposite of the Blades rule, where every cue is a
`XuiSoundXAudio.File` keyframe and the engine fires it. `__dash.nxe.cues` logs
each with the 60 Hz tick it fired on and whether the name came from the table or
from an inference. A REFUSED move is silent, exactly as a held d-pad at the end
of a Blades list is.

| event | cue | evidence |
|---|---|---|
| d-pad left / right | `snd_panelleft` / `snd_panelright` | table |
| d-pad up / down | `snd_channelup` / `snd_channeldown` | table |
| A | `snd_buttonselect` | table |
| B | `snd_buttonback` | table |
| strip folds / unfolds | `snd_panelfold` / `snd_panelunfold` | table |
| page pushed / popped | `snd_transitioninto` / `snd_transitionfrom` | **inferred** - `controlp` holds ten `.xma` and the table names eight |

### The transitions, and §2.4's inference measured

The shell writes the chosen curve name into the scene's own `TransTo` /
`TransFrom` / `TransBackTo` / `TransBackFrom` - which is what the code does
(the four property names and the eight visual names are one block at `.text`
0x9249229c) - and then the ordinary Trans machinery plays it. Read out of the
9199 skin: `LegacyFrom` 15 frames, `LegacyTo` hold 5 then 5..20, `LegacyFromEx`
30, `LegacyToEx` hold 45 then 45..60.

§2.4 leaves the choice between the plain and `…Ex` forms as an [INFER], **and it
stays an inference. M4b said the footage settled it and that was an
over-claim** [Judge F round 2, N4]. What the footage supports: a legacy page
replacing another legacy page - System Settings to Console Settings, on a
29.97 fps cut of the primary capture - carries about 1.0 s of continuous change
[FRAME Kpa t = 190.06-191.22 s, between f0375 and f0381], which the plain pair's
0.583 s total cannot fill and the `…Ex` pair's 1.000 s can. What it does NOT
support is the four-part reading M4b printed: the "0.501 s outgoing burst, 0.43 s
quiet, 0.234 s incoming" was one windowing of an interval that divides just as
readily into four 0.25 s segments, and `LegacyToEx` predicts a 0.250 s hold
where that cut shows 0.43 s of quiet. So the DURATION rules the plain pair out
and the assignment of the `…Ex` pair to a page-over-page swap remains [INFER],
which is what `__dash.nxe.physics` says. A cleaner cut - a page swap with no
list redraw inside it - would settle it; there is none in the four captures.

### The Aura background

`dashmain/DashBkgnd.xur` is mounted behind the shell and `controlp/AuraScene.xur`
is mounted as a live DOM subtree where its `Aura` image's
`ImagePath="controlpack://aurascene.xur"` would be - the same approximation
`PanelScene`'s `XuiTextureSurface` already is. `AuraControl`'s four properties
are read and reported; the only one this archive can honour is `SurfaceSphere`,
because `BackgroundImage` and `BannerImage` are unset in all thirteen scenes
that carry one. `themeripple.uxfx` is mounted and animates nothing: both of its
`XuiImagePresenter`s are theme data the archive does not have.

#### A `XuiShader`'s draw surface is not a picture

**M4b painted thirty opaque white plates onto the floor and it is now fixed from
the data** [Judge F round 2, N1]. `AuraScene`'s two ring groups are built out of
PAIRS: `Front/Rings_Constant` is `XuiShader1, XuiImage1, XuiShader2, XuiImage2 …`
for thirty, `Front/Rings_Pulse` the same for three, shader always immediately
before the same-numbered image [SCENE]. Every one of those images is
`white.png` at `SizeMode 4`, 820x820 or 1000x1000, with no Scale, no Opacity and
no timeline of its own, and all thirty of the group's timelines animate the
SHADER instead (`EffectParams1.x` sweeps a ring radius 0 -> 325,
`EffectParams4.x` its intensity 0 -> 0.1 -> 0). `xenonripple.uxfx`, the shader
they all run, has **no texture sampler in its constant table at all** - its
uniforms are `ControlSize` and `EffectParams1..4` and it is entirely
procedural. So the white quad is the surface the ring is drawn ONTO, never a
white plate on screen.

The judge's proposed rule - "a `XuiImage` whose only consumer is a `XuiShader`'s
`TextureSurfaceElement`/`Texture` input" - cannot fire, and that was worth
checking: `XuiShader.TextureSurfaceElement` and `XuiImage.TextureSurfaceElement`
are set on **zero** elements in this scene, and no property anywhere in it names
another element's id. The pairing is the only structural link there is, so the
rule keys off it: `isShaderSurface` in `DomRenderer.ts`. **Swept, not assumed**:
over all 311 scenes of 9199 it fires on 33 elements, every one a `white.png` in
`AuraScene.xur`, and over all 263 scenes of 6770 on none - 6770 has no
`XuiShader` at all. The three shaders it does not fire on are the ones whose
neighbour is not a same-numbered image: `Theme/XuiShader1` (between two
`XuiImagePresenter`s) and `xboxAnimation/XuiShader1` (which names its own
`TextureFileName="xboxLive.png"`, the one texture reference in the scene).

**Measured, over achromatic 16x16 blocks binned by the FRAME's own luma**
[FRAME Yrt f0483], signed `ours - frame`, before and after:

| frame-luma bin | 40 | 60 | 80 | 100 | 120 | 140 | 160 | 180 | 200 | 220 |
|---|---|---|---|---|---|---|---|---|---|---|
| M4b (plates drawn) | +157 | +177 | — | — | — | −39 | −72 | −87 | — | — |
| now | +16.3 | +17.3 | +2.0 | −3.3 | −7.0 | −10.8 | −11.4 | −14.8 | −8.5 | −3.5 |

`tests/smoke/smoke-nxe.mjs` gates every bin at 30 luma. The dark end is still
+16/+17 and the bright end −11/−15: the same few-percent global lightness the
Blades chrome carries, seen on a different surface.

**The floor under the front panel is the one residual that is NOT explained, and
it is not the plates.** At rows 572..710, design x 110..500, the frame reads
184 / 192 / 188 / 173 / 154 / 135 / 120 / 106 and ours reads
115 / 116 / 95 / 94 / 106 / 101 / 104 / 102. Ablated layer by layer inside
`Sphere/Color`, which is the only subtree that paints there:

| ablation | 572 | 590 | 610 | 630 | 650 | 670 | 690 | 710 |
|---|---|---|---|---|---|---|---|---|
| frame | 184 | 192 | 188 | 173 | 154 | 135 | 120 | 106 |
| ours | 115 | 116 | 95 | 94 | 106 | 101 | 104 | 102 |
| hide `Sphere` (the whole floor group) | 137 | 143 | 151 | 159 | 163 | 163 | 165 | 163 |
| hide `SolidBack` only | 155 | 158 | 156 | 159 | 163 | 163 | 165 | 163 |
| `SolidBack` alone | 67 | 78 | 85 | 94 | 106 | 101 | 104 | 102 |
| hide `Color` (the BlendMode 5 figure) | 67 | 78 | 85 | 94 | 106 | 101 | 104 | 102 |
| hide `Horizon` / `LightFront` | 115 | 116 | 95 | 94 | 106 | 101 | 104 | 102 |

So the floor IS `SolidBack` - a 3501x745 radial figure whose authored stops are
rgb(90,90,90), rgb(60,70,80) and alpha 0 - plus the `Color` figure screened over
its top rows. Those stop colours cannot reach 190 at the mirror line however
they are laid out, and the console's floor is brightest exactly there. Nothing
is tuned: the stops are the file's, the residual is the table above, and the
gate holds the binned statistic rather than this band.

**The dark band M4b was accused of is gone with the plates.** Sampling
40x40 blocks along the judge's line - (20,410), (300,450), (600,500) - the frame
reads 137.5 / 161.2 / 100.3 and ours 132.8 / 160.1 / 68.5, and hiding the
`Color` figure moves the third by 3.7 luma, so the `Color` edge is not what
makes it. The sky agrees within 4 (frame 159.8, ours 163.8).

Two earlier statements stand: thirty-five (alpha, fade) pairs for the
reflection were swept over the whole floor and all land between MAD 90.1 and
93.3, so the reflection is not the term that is wrong; and tuning the mirror to
compensate for the background is how a plausible wrong answer survives a phase.

## NXE 9199, M4c: the queue, the integrator, the order of a channel change

Judge F round 2 opened four findings and the phase brief five items. Everything
below is what closed and what did not, with the number.

### The channel queue's layout is a table in `dash.xex`

M4b reported the brightness ramp as MEASURED off the frames and the SIZE ramp as
"measured and not modelled". Both are in the executable, and neither the
perspective nor a per-row `Scale` in the scene is the answer - the scene gives
all eight rows `z = 0`, no `Scale`, and a flat 36 px pitch.

The queue's binder fetches the eight rows by child path into a contiguous array
at object +8..+36, **`Next6` first and `Prev1` last** [CODE 0x9248b8d0-0x9248b980],
and stores `Queue\Current`'s own authored `y` (154) at +72 [CODE 0x9248b988].
The layout routine at 0x9248b548 then builds a **ten-row, three-float table on
the stack** (`stfs` block 0x9248b624-0x9248b680) and, for element *i*, lerps
row `i+1` towards row `i` (progress >= 0) or row `i+2` (progress < 0) by the
absolute channel progress, writing `Position` (0, 154 + dy, 0)
[0x92189cb8 -> 0x921a71d0], `Scale` (s, s, 1) [0x92189da8 -> 0x92197eb8] and
`Opacity` [0x92189e98 -> 0x92194428]:

| slot | dy | scale | opacity | | slot | dy | scale | opacity |
|---|---|---|---|---|---|---|---|---|
| 0 | −140 | 0.35 | 0.00 | | 5 | −70 | 0.55 | 0.35 |
| 1 | −140 | 0.35 | 0.00 | | 6 | −40 | 0.75 | 0.50 |
| 2 | −140 | 0.35 | 0.00 | | 7 | 0 | 1.00 | 1.00 |
| 3 | −120 | 0.40 | 0.10 | | 8 | +40 | 0.75 | 0.00 |
| 4 | −95 | 0.45 | 0.20 | | 9 | +40 | 0.75 | 0.00 |

**The frame checks it and nothing was fitted to the frame.** Cap heights up the
stack on [FRAME Kpa f0048] measure 33 / 25 / 18 / 15 / 14 design px; the table's
scales predict 33.0 / 24.8 / 18.2 / 14.9 / 13.2 from the current row's 33. Five
slots, five agreements within 1.2 px, off numbers read out of a stack block.

Three consequences, all of them corrections:

- **the pitch is not 36 and is not flat.** The gaps going up are 40 / 30 / 25 /
  25 / 20 / 0 / 0, so the rows crowd together with distance as well as shrink.
  `QUEUE_PITCH` is kept as the file's authored number with a comment saying the
  code overwrites it.
- **the brightness ramp M4b measured (1 / 0.75 / 0.55 / 0.35 / 0.2 / 0.12 /
  0.07) was the SIZE ramp read as brightness.** The table's opacities are
  1 / 0.5 / 0.35 / 0.2 / 0.1 / 0 / 0, and its scales are 1 / 0.75 / 0.55 / 0.45
  / 0.4 - the first three of which are exactly the numbers M4b called
  brightness. A smaller, thinner row measures dimmer over a fixed box.
- **`Prev1` is not empty.** M4b left the row's text blank; the console writes a
  name into it and draws it at `Opacity 0`. Same pixel, wrong reason, and the
  difference shows the moment the cursor moves.
- **the group no longer slides.** M4b translated the whole `Queue` group by the
  36 px pitch while the cursor was between two channels, marked [INFER]. Every
  row now carries its own interpolated `Position`, which is what the code does,
  and the inference is gone from `__dash.nxe.physics`.

`Marker1` and the `Description` counter fade with the same progress the code
uses: the markers keep their own opacity times `1 - |progress|`
[CODE 0x9248b868-0x9248b8ac] and `Description` is set to `1 - |progress|`
outright [CODE 0x9248b8b0-0x9248b8bc].

**Found and NOT wired**, because nothing says when it runs: a second routine at
0x9248b7a8 takes its own parameter (fetched separately at 0x92490ea4's caller,
0x9248ca38) and rotates each queue row about Y by
`clamp(p·1.3π − i·0.1π, 0, π/2)` around a pivot 128 units away, fading it by
`1 − min(|θ|·2/π, 1)` [CODE 0x92488480]. That is the queue's own fold, and it is
recorded here rather than fired on a guess.

### The integrator is piecewise-analytic now

`Axis.step` was semi-implicit Euler with a speed ceiling. Judge F round 2 (N2)
measured it landing 2.0-2.5 frames short on every axis, and the cause is that a
frame straddling the accelerate/brake switch was stepped at ONE acceleration and
the arrival clamp then ate the tail. The fix is not a different ceiling - it is
integrating each phase for its exact duration inside the frame, with the switch
time solved in closed form (`a(a+d)t² + 2u(a+d)t + (u² − 2ds) = 0`).

| axis | closed form | M4b (Euler) | now |
|---|---|---|---|
| Moby panel 40/30/20 | 20.494 frames | 18 | **20.494** |
| Moby channel 50/40/10 | 18.000 | 15 | **18.000** |
| Rome 60/40/20 | 17.321 | 15 | **17.321** |

Exact to machine precision (3.6e−15 frames), including the cruise branch that
only a multi-step move reaches. `tests/nxe.test.ts` asserts
`|frames(integrated) − 60·stepDuration| <= 0.5` on all three axes for a
distance-1 and a distance-5 move, and `smoke-nxe.mjs` asserts it again on the
shell's live axes after a real key press.

**What that does to the residual against the console**, one panel move:

| | seconds | against the model |
|---|---|---|
| model, M4b (Euler) | 0.3167 | — |
| **model, now** | **0.3416** | — |
| measured, 8498 t = 504.0 s (genuine 60 fps) | 0.367 | +0.025 s (1.5 frames) |
| measured, 9199 t = 240.5 s (30 fps doubled) | 0.383 | +0.041 s (2.5 frames) |

M4b's numbers were +0.050 and +0.066. The remaining gap is one to two and a half
frames of twenty-two and is not tuned away.

**The SHAPE still disagrees and is stated, not fixed.** The corrected profile's
velocity peaks at 0.450 of the move on the panel axis (the triangular
`d/(a+d)` is 0.4286 and the 60 Hz sampling moves it a frame); the console's
velocity energy peaks at about 0.33, i.e. it is more front-loaded than 40/30 can
produce. Making it match needs `a ≈ 2d`, and the file says 40 and 30. So the
constants stay and the disagreement is this paragraph.

### A channel change is move, then fold, then unfold

M4b fired `SoundChannelUp` and `SoundPanelFold` on the same tick and folded the
strip on the key press. The footage does not [Judge F round 2, N3]: on the 9199
capture's channel change (motion onset t = 238.48 s) the cue onsets are +0.03 s
(the channel cue), +0.47 and +0.57 (two clicks), and the unfold burst at +0.83.
The channel cursor's own move is 0.300 s and `1/FoldSpeed` is 0.100 s, so the
order is the move, then the fold, then the unfold one fold-time later.

`moveChannel` now only cues and re-targets; `stepMotion` starts the fold when
the cursor LANDS, and the rebuild-and-unfold waits for the cascade to reach
`folded`. Measured on the scripted path in `smoke-nxe.mjs`, in 60 Hz ticks:

```
Up (channel):   channel@100  fold@118 (+18)  unfold@127 (+9)
Down (channel): channel@180  fold@198 (+18)  unfold@206 (+8)
```

+18 is `60 × stepDuration(50/40)` exactly. The +8/+9 is the six-frame cascade
plus the two or three frames our fetch of the new channel's scenes costs, which
the console did not pay - the gate allows 5..14 and refuses a fold that is
skipped. There is one harness lesson in it: **a synchronous frame loop cannot
measure an event that waits on a fetch.** Driving 60 frames with no yield piled
the unfold cue up at the end of the block and reported the gap as 42 ticks; the
suite now yields a macrotask between frames and the engine tick numbers are
unchanged.

### Avatars: the silhouette is in the archive

M4b drew nothing and PLACEHOLDERS said the model, the textures and the user's
data are all `xam`/Live. Two of those three are still true; the SIGNED-OUT case
is not a model at all. `dash.xex` loads `AvatarSilhouette.png` (436x730) and
`AvatarShadow.png` (128x128) out of `dashcommon.xzp` at start-up, one straight
after the other, and caches both [CODE 0x921421ec / 0x92142230]. Both files are
in this dump, and the signed-out home frame shows exactly that: a flat dark
figure standing in front of the gamer-card slot and breaking its right edge,
which is what the avatar's deliberate `z = -50` is for [FRAME Kpa f0048, "Sign
In" over "3 Profiles Found"].

The artwork is therefore the build's. What the archive does not carry is the
avatar viewport's CAMERA. The size does not need it - `contain` in the
`XuiAvatar`'s own authored 776x776 box is right to 2 % - but the centre does,
and the two offsets are MEASURED off that one frame and named as such in
`__dash.nxe.avatars`:

| | frame | ours | d |
|---|---|---|---|
| figure top (screen y) | 268 | 270 | +2 |
| figure height (screen px) | 283 | 269 | −14 (−4.9 %) |
| head band, left / right | 760 / 820 | 762 / 821 | +2 / +1 |

The height is short because the console has the figure 50 z units nearer than
the panel and this runtime renders the slot flat, which is worth 2.7 % of it;
the rest is the measurement. `AvatarShadow.png` is loaded by the same code and
is NOT drawn: nothing says where the console puts it, and the floor under the
figure carries the panel's reflection, so a shadow cannot be separated from it.

### Rome shells mount

A Rome panel is not a `LegacyControl` page and is not centred. It sits on the
ROME strip at `RomeFrontPosition` (96, 602) out of `controlp/Variables.xur`,
which is a BOTTOM-LEFT anchor exactly as `MobyFrontPosition` is, so a 460x495
panel's top is 602 − 495 = 107. `pushPage` recognises the size and places it
from those two numbers and nothing else; `controlp/RomeOverlayScene.xur` mounts
into an `OverlayLayer` [CODE 0x92490ea4-0x92490ecc, the `ColumnLayer` /
`OverlayLayer` literals at .rdata 0x920b1208 / 0x920b1220].

Measured with the same detector on both, `?build=9199&page=arcade/CollectionFilterPanel.xur`
against [FRAME Yrt f0396]:

| edge | frame | ours | d |
|---|---|---|---|
| left | 97.0 | 96.5 | −0.50 |
| right | 554.3 | 554.5 | +0.17 |
| top | 105.0 | 106.5 | +1.50 |
| bottom | 598.3 | 599.5 | +1.17 |

The panel titles itself (`labTitle` is inside it) and its parked `legend_a` /
`legend_b` are hoisted into `LegendScene`, which reads "Ⓐ Select Ⓑ Back" - the
same two captions the frame shows. `RomeOverlayScene`'s one child is the
`Description` counter, and it is mounted EMPTY and marked: a Rome counter counts
panels in a Rome CHANNEL, this route pushes one panel with no channel behind it,
and "1 of 1" would be an invention. The list inside the panel is a
`CollectionFilterList` the console fills from code and stays the authored
skeleton, as every runtime-driven list does.

### What M4c still does not do

`__dash.nxe.physics` names all of it on every load:

- **the floor under the front panel is 70-95 luma dark**, and it is
  `SolidBack`'s authored stops rather than a missing layer - the ablation table
  is above.
- **the queue's own fold** (0x9248b7a8) is decoded and not fired.
- **the mirrored caption sits about 10 px low** [Judge F round 2, N5]. Not
  looked into further than this: the REAL caption's ink peaks within 0.3 design
  px of the frame's in the same band, so whatever is wrong is in the mirror
  transform and not in the text - and the mirror is `reflection.uxfx`, a
  compiled `ps_2_0`/`ps_3_0` pair standing in as a CSS alpha ramp. Moving the
  clone by a fitted ten pixels would be tuning a placeholder to a frame, which
  is the thing this project refuses, so it stays open with the number.
- **a Rome CHANNEL**: one Rome panel mounts and is measured; the strip of them,
  its `ColumnLayer` and the counter that goes with it need a Rome channel, and
  the offline archive has no Rome channel to build.
- **`XuiAvatar` when a profile IS signed in** - the model, its textures and its
  animations are `xam`/Live.
- **everything Xbox LIVE served**, as in M4a.

## The mount is disposable (2026-09-03)

`app/main.ts` runs at module scope and a Vite dev server re-executes it on every
hot update. With no teardown, each reload appended a SECOND viewport to `#app`,
attached a SECOND `InputRouter` to the window, and started a second rAF clock and
a second `AudioContext` - so one key press drove two shells, both still in the
document. **The Blades metapane looked as though it were accumulating every
description ever written; it was not accumulating anything, there were N
metapanes.** A leak whose only symptom is "the page looks wrong after an
afternoon of editing" is a leak nobody finds, so it has a teardown and a test:

- `app/main.ts` owns a disposer list; `teardown()` runs it last-in-first-out,
  empties `#app` and drops `__dashApi`. `import.meta.hot.dispose(teardown)` plus
  a self-accept means a hot update rebuilds the app from a clean page instead of
  layering on the last one, and an update to any module the app imports
  propagates up to it.
- `Viewport.dispose()` removes its `resize` listener and its subtree;
  `InputRouter.detach()` removes its key listeners and cancels its pad poll;
  `AudioBank.close()` closes the context and drops the gesture listeners;
  `startFpsMeter` and the timeline clock both return stop handles.
- The live singletons are COUNTED, not asserted about: `Viewport.live`,
  `InputRouter.attached` and `AudioBank.open` are static sets, and
  `__dash.hmr` reports `{ mounts, viewports, inputRouters, audioContexts,
  clocks }`. Every count is 1 on a healthy page however many times the app has
  mounted.
- `__dashApi.remount()` is the same path a hot update takes, and
  `tests/smoke/smoke-nxe.mjs` drives it: after a remount the counts must still
  be 1, the DOM must hold the same number of description, queue and panel
  elements as the first mount, and one synthetic ArrowRight must move the panel
  cursor by exactly one - two attached routers would move it by two.

## What is honestly not implemented

Recorded per scene in `window.__dash`, never faked:

- **`runtimeDrivenClasses`** — `XuiList` / `XuiCommonList` / `XuiListItem`,
  `XuiGamerCard`, `XuiEdit`, `XuiProgressBar`, video and HTML elements. Their
  rows and contents came from PowerPC code and `.xus` tables at run time, not
  from the scene. `ListView` now fills a `XuiCommonList` that declares
  `ItemsText`, and the glue fills Console Settings from the executable's table;
  everything else on the list is still the authored skeleton. Measured row
  pitch: 45 design px, row *k* top at `list.y + 45k` with **no** inset.
- **`sceneTextures`** — an `ImagePath` naming a `.xur` (eleven scenes use
  `common://TitleMetadata.xur`). XUI renders a scene to a texture; M1 has no
  offscreen target. The file is present, so this is not a missing asset.
- **The tab-stack residual is NOT a missing layer and NOT the gradient
  transform.** Our render was too light on the blade stack at the System rest
  frame — +30 luma at x=60, +12 at x=200, +9 at x=340 on `f0051` — and the
  deficit grew with y, which pointed at the `wing` fill's −90° rotation
  (Scale 0.13/1.08, Translation −0.5). It is not that: SRT, the order we
  already render, is the one that reproduces the console's three landmarks
  (plateau, minimum, climb). Down x 3..34 of `f0051` the profile plateaus at
  168.0, breaks at design y 322, bottoms at 144.6 at y 514 and climbs to 169.1
  by y 700; our wing figure alone plateaus, breaks at 314 and bottoms at 506 —
  both within 8 design px, NCC 0.754 over y 430..700 against 0.606 for a
  top-left origin and −0.470 for RST or TRS. RST would make the offset
  `0.13v + 0.43`, monotone over the whole figure, so it cannot produce a
  minimum at all. The wing also independently re-settles `origin=centre`.
  What DOES cause the y-growing part is the `lines` group inside `wing_left`:
  a 225×945 rectangle whose radial fill's first stop is an OPAQUE `0xffebebeb`
  at 0.929412, so half the rectangle paints a flat 0xeb over the wing's
  gradient. Excess down x=60 at 1080p y 300/450/600/750/900 is
  +25.0 +26.6 +34.3 +39.6 +24.1 as it stands and +12.7 +11.1 +12.3 +13.6 +11.3
  with `lines` hidden — the y-dependence is entirely that group. The remaining
  flat ~+12 (and +19.7 at x=200, +18.9 at x=340) is a uniform lightness and is
  still open; the `lines` radial has no model in this fill family that avoids
  the opaque disc, and the obvious escape is refused by `blade_grey_left/back1`,
  whose 0.263→0.886 opaque-ended linear fill `f0051` draws solid. The wing gate
  in `tests/smoke/sweep-gradient.mjs` holds the order of operations, and it is
  on the `npm run smoke` board — **by name**. It was not, for a while, and
  nothing said so: the board listed the file bare, bare ran the 40-candidate
  exploratory sweep, and that program prints a ranking and exits 0 whatever it
  finds, so `wing`, `stack` and `space` never gated while the board reported
  PASS. Each board entry now names its mode and the file refuses to run without
  one.
- **The flat tab-stack residual is the skin CHROME, not a layer under it, and
  not the left of the screen.** Ablated element by element from the live DOM at
  the System rest frame; `sweep-gradient.mjs stack` is the gate, and it prints
  this table (columns are 40×300 rects **centred** on 1080p x = 60 / 200 / 340,
  y 300..600, `lines` hidden throughout, signed against `f0051`):

  | ablation | x=60 | x=200 | x=340 | moved |
  |---|---|---|---|---|
  | baseline | +12.0 | +19.7 | +18.9 | — |
  | hide `white_cover` (BlendMode 5) | +12.0 | +19.7 | +18.9 | 0.0 / 0.0 / 0.0 |
  | hide `black_cover` (BlendMode 2) | +12.0 | +19.7 | +18.9 | 0.0 / 0.0 / 0.0 |
  | hide `BG_color_2` | +12.0 | +19.7 | +18.9 | 0.0 / 0.0 / 0.0 |
  | hide `Background` (BlendMode 3/4) | +12.0 | +19.7 | +18.9 | 0.0 / 0.0 / 0.0 |
  | hide `content_panel_blink` | +12.0 | +19.7 | +18.9 | 0.0 / 0.0 / 0.0 |
  | hide `Tab5` (the page) | +12.0 | +19.7 | +18.9 | 0.0 / 0.0 / 0.0 |
  | remap BlendMode 2/3/4/5, any mode | +12.0 | +19.7 | +18.9 | 0.0 / 0.0 / 0.0 |
  | hide `blade_topshadow_left` | +49.5 | +37.5 | +21.7 | +37.6 / +17.8 / +2.8 |
  | hide `wing_left` | −68.9 | +19.7 | +18.9 | −80.8 / 0.0 / 0.0 |

  The gate now also holds the **right wing** (+9.0, x 1860..1900 y 400..600)
  and the **page interior** (−3.1, x 700..1400 y 300..800). The page is the
  control: it agrees with the frame already, so any rule proposed for the
  chrome has to leave it where it is.

  Only five things paint 1080p x < 350 there — `wing_left`,
  `blade_0..3_grey_Left`, `blade4_top_*`, `blade_topshadow_left` (Opacity 0.3)
  and `color_highlight_left` below y ≈ 700 — plus the rotated tab captions
  `blade_0..4_txt`, which do paint (hiding them lifts x=200 by 9.6). Everything
  else is behind the opaque tab figures. `grey_trans_fade` cannot paint there at
  all: Opacity 0 at rest, box starting at screen x=463.

  So: **(a)** a mis-mapped BlendMode is closed — 2, 3, 4 and 5 remapped to any
  CSS mode move the columns by 0.0, so `f0051`'s stack can never settle 3/4/5.
  **(b)** the backdrop / `grey_trans_fade` / `BG_color_*` is closed by the same
  zeros. **(d)** an unsampled animation of `blade_topshadow_left` is closed: its
  keyframes at 144 / 154 / 169 hold Opacity 0.30, Width 128.98778 and
  Scale.x −1.7598 constant, and its measured contribution (alpha 0.187 / 0.099 /
  0.048 / 0.005 at x = 65 / 222 / 294 / 358) is its authored ramp to three
  decimals; Opacity 0.39 would fix x=60 and leave x=340 at +16. **(e)** gamma or
  a capture-levels mismatch is closed: the frames are full range, not studio
  swing (`f0051` spans 0..255, with 8,311 subpixels below 16 and 37,082 above
  235). A fit over 4,116 flat 16×16 blocks gives `frame = 0.881·ours + 15.32`
  (rms 7.25 against 8.70 for the identity), which resembles studio swing but is
  not one — binned by our own luma the mean error is −2.0 / +3.6 / −0.0 at ours
  80 / 100 / 120 (the page, which agrees) and −12.4 / −10.9 / −8.8 / −8.1 at
  160 / 180 / 200 / 220 (the chrome). One curve cannot be both.

  What the numbers do say: the **right** wing is +9.0 too light
  (x 1860..1900, y 400..600 — frame 204.9, ours 213.9) and the right page margin
  +8.7, while the page interior agrees within 5. The defect belongs to the
  `wing` and `blade_grey_left`/`_rt` visuals wherever they appear, about 4–5%
  too light. As the alpha of a wash of the shadow's own colour (rgb 15) over our
  un-shadowed render, the missing darkening is nearly constant across the stack
  — 0.056, 0.050, 0.042, 0.039 at the four tab bodies — a different shape from
  the shadow's own 0.187 / 0.099 / 0.048 / 0.005, so it is not the shadow being
  weak. Nothing paints in the z band between the chrome and the `Tab` scenes,
  which is exactly why the page hides it and the wings do not. **The FillColor-modulation half of the
  best remaining hypothesis is now CLOSED by measurement, and it is closed
  against.** XUI documents `XuiFigureSetFill`'s `FillColor` as the SOLID
  colour and we only paint it for `FillType` 1, but 365 of the build's 1,801
  gradient fills store one anyway. Census of every fill in 6770:

  | FillType | stores `FillColor` | no `FillColor` |
  |---|---|---|
  | 0 NONE | 19 | 30 |
  | 2 LINEAR_GRADIENT | 174 | 474 |
  | 3 RADIAL_GRADIENT | 191 | 962 |
  | 4 TEXTURE | **0** | 12 |
  | absent (= SOLID) | 372 | — (30 figures store no `Fill` at all) |

  No texture fill in the corpus stores a `FillColor`, so a texture modulation
  cannot change a pixel of this build — and with the switch on it renders
  byte-identically, which is the second row below. On the chrome only
  `blade_grey_left/back1` and `blade_grey_rt/back2` store one (255,150,150,150
  under a 180..223 grey ramp); `wing/wing` (stops 220/220/200/240),
  `wing/lines`, `blade face` (220/240/245/255) and every `blade_top_face`
  figure store none, so no modulation rule can reach the wing at all.
  Implemented behind `MODULATE_TEXTURE_BY_FILLCOLOR` and
  `MODULATE_GRADIENT_BY_FILLCOLOR` in `xuiEnums.ts` (both `'off'`, kept so the
  table can be regenerated) and measured with `lines` hidden, signed against
  the frames:

  | combination | x=60 | x=200 | x=340 | R. wing | page (control) | f0034 wing | f0034 x=1720 | f0034 page |
  |---|---|---|---|---|---|---|---|---|
  | off / off (shipped) | +12.0 | +19.7 | +18.9 | +9.0 | −3.1 | +11.6 | +6.9 | −6.7 |
  | texture `rgba` | +12.0 | +19.7 | +18.9 | +9.0 | −3.1 | +11.6 | +6.9 | −6.7 |
  | gradient `rgb` | +12.0 | −14.8 | −20.2 | +9.0 | **−37.7** | +11.6 | −59.0 | **−80.4** |
  | gradient `rgba` | +12.0 | −14.8 | −20.2 | +9.0 | **−37.7** | +11.6 | −59.0 | **−75.0** |
  | both `rgba` | +12.0 | −14.8 | −20.2 | +9.0 | −37.7 | +11.6 | −59.0 | −75.0 |

  Refused three times over: the 150/255 tint takes 34.5 and 39.1 luma out of
  the two columns it reaches when the defect is 19.7 and 18.9 — about twice
  too much, overshooting to −14.8 / −20.2; it moves **neither wing** by 0.1
  luma, and the wings are half the evidence; and it wrecks the control, taking
  the page interior from −3.1 to −37.7 and f0034's from −6.7 to −80.4 on a page
  that agreed within 5 luma. Multiplying alpha as well is worse again: 33
  gradient fills store a `FillColor` with alpha 0 beside opaque stops, so it
  erases whole figures. The wing family's black `Stroke` with no width is
  untested and stays open. **What is left of the hypothesis**, and it is not
  decidable from this archive: 6717's `dashuisk/skin.xur` — the build the
  frames were shot from, which we do not have, `extracted/6719dev/resources`
  being empty — authors these greys darker than 6770's. **What would settle it:**
  a 6770 reference frame, or a 6717/6719 skin extraction to diff the four stop
  colours of `wing/wing` and `blade face` against 6770's 220/220/200/240 and
  220/240/245/255. Hypothesis **(c)**, an anisotropic radial (circular in screen
  space, 22/21 = 4.8%), stays open only for the seams: at 1 px resolution the
  frame's first tab valley bottoms at x=192 (luma 55) and ours at x=189 (72), a
  2–3 px displacement of the same sign and size as the wing gate's 8-design-px
  knee offset. It cannot explain the flat offset, because every ring in
  `blade_grey_left` ends at alpha 0 and so no ring reaches a tab body at all.
- **Colour-space interpolation is CLOSED as the explanation, and it was the
  best one left.** The hypothesis: the Xenos reads a gamma surface through the
  360's piecewise-linear "PWL" gamma, interpolates and blends in that linear
  light and writes back, while SVG walks the stored bytes and CSS composites in
  sRGB — which would leave our gradients flat in the middle and our page purple
  grey, the shape of both open residuals. Measured against the **same-build**
  6770 capture (blade 5 vs `f0042`, blade 2 vs `f0030`) with
  `sweep-gradient.mjs space`, judged on achromatic flat 16×16 blocks binned by
  luma and on per-channel means for the saturated page. The curve is documented
  — four segments, `L = e`, `2e−64`, `4e−256`, `8e−1024` at e = 64 / 96 / 192,
  then `L += trunc(L·slope)`, from AMD RRG-216M56-03 by way of Xenia's
  `xenos.cc`. Three results:

  | stopSpace | 160 | 170 | 180 | 190 | 200 | 210 | 220 | fit vs `f0042` | rms |
  |---|---|---|---|---|---|---|---|---|---|
  | `sRGB` (shipped) | +9.9 | +8.1 | +7.8 | +6.4 | +5.2 | +3.8 | +3.0 | 1.1186·ours − 29.38 | 0.59 |
  | `linearRGB-attr` | +10.2 | +8.3 | +7.9 | +6.7 | +5.5 | +4.1 | +3.1 | 1.1212·ours − 30.12 | 0.70 |
  | `linear` (sRGB EOTF) | +10.2 | +8.3 | +7.9 | +6.8 | +5.6 | +4.1 | +3.0 | 1.1217·ours − 30.23 | 0.73 |
  | `pwl` (the 360 curve) | +10.1 | +8.3 | +7.9 | +6.5 | +5.5 | +4.1 | +3.0 | 1.1208·ours − 29.96 | 0.68 |

  **(1)** The stop space cannot move the achromatic residual and does not — the
  blocks are flat and every space agrees at the stops, so a colour space bends
  the middle of a ramp and cannot lift a plateau. Every non-sRGB member is
  slightly worse. **(2)** On the page purple (patch x 1450..1650 y 620..740,
  frame R 132.6 / G 91.7 / B 197.8, spread 106.1) it helps a little and not
  enough: `sRGB` 123.4 / 96.1 / 167.2 spread 71.2, `pwl` 126.3 / 97.4 / 172.8
  spread 75.3 — about an eighth of the gap. **(3)** Alpha compositing in linear
  light is worse everywhere. CSS has no switch, so each translucent layer was
  ablated, its alpha recovered per pixel from (backdrop, our result), and the
  same composite redone in linear light offline: mean per-channel error against
  `f0042` goes 11.12 → 16.93 on `white_cover` (screen), 12.83 → 13.73 on
  `Main_Panel`, 9.08 → 10.79 on `black_cover` (multiply), and 10.35 → 10.36 on
  `top` — a multiply of a light grey is near the identity in either space, so
  `f0042` cannot settle BlendMode 2's space at all. And hiding *any* of
  `white_cover`, `Main_Panel`, `color_front`, `thing1/2/3`, `top` or
  `black_cover` leaves the achromatic fit at 1.1186·ours − 29.38, rms 0.59,
  n=809 — unchanged to four decimals. **0.0 of the global residual is
  compositing.** A global transfer curve is refused too: both PWL directions
  triple the rms about the fitted line (0.59 → 2.07 and 1.71), because the
  residual is straight in luma and a gamma curve is not; only the 2.3 % chain
  gain halves it. Shipped value stays `sRGB`; nothing was hacked in.

  One thing the same run *did* find, and it is not a colour-space question:
  our page purple is already ~50 low in blue **before** any translucent layer
  (147.4 with `white_cover` hidden, against a frame that reads 197.8 *with* it),
  and no alpha over our `color_front` backdrop can reach the frame — solving
  `a·C + (1−a)·B = frame` on red wants `a = 2.03`.
- **The page purple is NOT a z-order, a `Show` state, a backdrop or a
  BlendMode, and that is now measured rather than suspected** (2026-09-03,
  `sweep-gradient.mjs purple`, which is on the board). Ten things paint the
  patch at the System rest frame (dashmain 168). Rendered alone, then
  cumulatively back to front, against 6770 `f0042`:

  | # | layer | blend | opacity | alone R/G/B | cumulative R/G/B |
  |---|---|---|---|---|---|
  | 1 | `bg` (BG_animation) | normal | 1.0 | 0/0/0 | 0/0/0 |
  | 2 | `thing2` (BlendMode 4) | plus-lighter | 0.5 | 0/0/0 | 0/0/0 |
  | 3 | `thing1` (BlendMode 3) | difference | 0.8 | 0/0/0 | 0/0/0 |
  | 4 | `thing3` (BlendMode 4) | plus-lighter | 1.0 | 43/43/43 | 43/43/43 |
  | 5 | `color_back` (BlendMode 2) | multiply | 1.0 | 101/52/178 | **17/9/30** |
  | 6 | `color_front` | normal | 0.7 | 80/46/134 | 85/48/143 |
  | 7 | `white_cover` (BlendMode 5) | screen | 0.6 | 49/49/49 | 117/88/165 |
  | 8 | `bottom` (of `black_cover`) | normal | 1.0 | 0/0/0 | 117/88/165 |
  | 9 | `Main_Panel` | normal | 1.0 | 14/14/14 | 123/96/167 |
  | 10 | `grey_trans_fade` | normal | 0.0 | 0/0/0 | 123/96/167 |
  | | frame 6770 `f0042` | | | | **133/92/198** |

  The divergence is row 5 and only row 5: the multiply against a wash of 43
  takes the blade colour from 101/52/178 down to 17/9/30, and rows 6–9 are
  light washes putting grey back. That is why the page lands at the right
  *luma* with the wrong *saturation* — down the whole page band our channel
  spread is 69–74 against the frame's 104–109, at every y from 340 to 740.

  Four findings, none of them a defect we could fix:
  **(a)** `bg` is authored opaque black — a solid `FillColor` (255,0,0,0) with
  no `FillType`, in `dashuisk/skin.xur` — so our black is the file's, not a
  fallback of ours. **(b)** The paint order over the patch *is* dashmain's
  authored child order, `Background` is shown and `BG_color_1` hidden at rest,
  and `bottom` and `grey_trans_fade` are in the stack painting nothing (alpha
  ≈0, `Opacity` 0); the gate holds all ten rows. **(c)** The ambient does
  free-run and does paint under the blade colour, but it is dark over this
  patch for its whole 990-frame cycle: the wash reads 35 (frame 540) to 109
  (frame 315), 43 at frame 0 where `?manual` parks it, and the best phase still
  leaves the purple at −3.4/+7.3/−20.0. The capture's unknown phase is worth
  about ±6 blue here. **(d)** No backdrop of any brightness works. Forcing the
  wash to a flat grey `W`: 128 → −1.8/+8.1/−17.0, 192 → +4.1/+11.1/−7.0, 224 →
  +6.8/+12.6/−1.9, 255 → +9.6/+13.9/+2.7. A multiply by grey scales all three
  channels together and the frame wants **green down** relative to red and
  blue, so green sticks at +11..+14 for every `W` that fixes blue. What is left
  is the same global lightness residual the chrome carries, seen on a saturated
  surface as lost saturation.
- **`unverifiedBlendModes`** — `BlendMode` 1 is alpha (DOCUMENTED); 2–5 are
  guesses. The page purple is the first figure that separates any of them,
  because nothing occludes `white_cover` (5), `color_back` (2) or
  `thing1`/`thing2`/`thing3` (3 and 4) over the page — the tab stack does, which
  is why `stack` reports 0.0 for every remap. Sweeping all fourteen CSS modes
  per value against `f0042` on three regions at once (`purplesweep bm=N`; mean
  per-channel |error| on the purple / the page interior / the top band):
  **2 stays `multiply`** — `difference` (4.9), `hard-light` (6.7) and `normal`
  (8.8) beat it on the purple and each destroys the top band, the figure 2 was
  measured on (−60/+8/−142 and +88/+125/+47), so no mode wins both and the
  purple *closes* the mismapping rather than settling it. **5 loses half its
  candidates**: every darkening mode is refused by 20–27 luma (`multiply` 42.1,
  `darken` 40.8, `soft-light` 31.4, `overlay` 27.5), the first real separation
  any frame has given 5; `screen` stays. **3 and 4 stay unsettled** — every
  candidate for 3 leaves the purple at exactly −9.2/+4.3/−30.6, and where they
  do rank (the page interior) the ranking is monotone in how much light the
  candidate adds, on a surface where we are blue-low everywhere, so it measures
  the residual and not the mode. `plus-lighter` for 4 is already the top of that
  ranking. What would settle 3 and 4 is a frame of a screen where they are not
  under a wash: 2 also appears in `arcade/2500_LiveArcadeHome`,
  `arcade/2502_TwistSelectorScene`, `videos/VideoCategories` and
  `videos/VideoDetails`, and 5 in `gamercar/GamerCard`,
  `messenge/FriendRequestMain` and `messenge/SignupComplete`. The raw value is
  on `data-xui-blendmode`.
- **`blendIsolated`** — CSS isolates a blend inside the nearest stacking
  context and an ancestor `opacity < 1` makes one; the console has no such
  rule. Every blended element under a faded ancestor is listed.
- **`codeDrivenStates`** — visuals whose resolved resting state hides more than
  half their own children, i.e. the chrome only appears once console code plays
  a transition into it. `metaScene_1line` is the clear case.
- **`invisibleAtRest` / `invisibleGroups`** — the whole scene, and which named
  parts of it, draw nothing at rest. This is a snapshot of `dashmain.xur` as
  authored, where 53 named groups (`Tab1..Tab6` among them, all `Opacity 0`)
  draw nothing: it is why the shell has to seek `RootScene` to a rest frame or
  play a boot range before anything appears, and the shell re-takes it after
  mounting and after every push and pop.
- **`unresolvedVisuals` / `missingImages` / `deviceFiles` / `placeholders`** —
  see `tests/smoke/allowlist.json` for the three visuals and three paths the
  build itself cannot supply, each with its reason.
- **Second-level option lists: seven filled, four still empty.** Of the 59
  lists in the corpus that declare `ItemsText=""`, the ones reachable from
  Console Settings offline are now filled from the recovered tables
  (`dashboards/blades/codeLists.ts`, which cites the VA and record layout of
  each): Display's three rows from the 4×16-byte table at 0x927bfff0, the 11
  languages from 0x92016d8c + 0x92016dc0, the 37 locales from 0x92016eb8, the 75
  time zones from 0x927bf680, the five passcode hints from 0x92015320, and the
  two remote-control channels the code computes at 0x921c8d08. `__dash.shell.codeFilled`
  names the table that filled each one. Four are still empty and
  `__dash.shell.codeUnfilled` says why, one reason each: the HDTV mode list
  prepends a row built from the attached display's native mode; the clock
  spinners are `sprintf`'d ranges around the console clock; the family timer is
  computed from a profile setting; and the parental rating list is selected by
  the console's `XC_LOCALE` from 29 tables at 0x920163a0 that are decoded but
  not yet wired to the locale pick. Nothing is invented to fill any of them.
  Note for anyone reading addresses out of this repo: `tools/ppc-dis.ts` prints
  `.text` VAs 0x200 HIGH, because `basefile.exe`'s section headers disagree with
  the image the code was linked for (1,191 of 1,200 sampled `.pdata`
  BeginAddress entries land on a prologue under the flat mapping
  `raw = VA - 0x92000000`, against 82 under the header mapping). Addresses in
  `dashboards/blades/*.ts` are flat-mapped.
- **Hardware state is disclosed, not guessed.** 168 controls across the corpus
  ship a `Text` that is nothing but an angle-bracket token — `<setting>`,
  `<servicename>`, `<free space>`, `<MAC Addr>`. The console filled each from
  device or Live state before the control was shown, so the token was never on
  screen; the shell clears them and lists each one in
  `__dash.shell.hardwareState`. The one place a value is supplied is the
  Console Settings metapane's "Current Setting" block
  (`Pane_txtCurrentSetting`, `DataAssociation` 4, a 383×173 presenter at y=33 in
  `metaScene_1line` — which is what the three-to-six leading CRLFs in every
  description string are for). Three rows have a value, each read off the
  reference console and cited to its frame: Display "1080p / Widescreen /
  Standard" (`6717-60fps/f01580`), Locale "United Kingdom" (`f0060`), System
  Info "Dashboard: 2.0.6717.0" (`f0066`). The other eight rows stay blank and
  are counted.
- **Arrival focus, closed.** `live/liveSignedOutUI.xur` has no `DefaultFocus`
  and no `PanelSettings`, and `DashLiveSignedOut` (registered 0x9228f060, bound
  at 0x9228f478) fetches five children and makes no `SetFocus` call — so focus
  there is the XUI runtime's own default, and the shell now falls back to the
  head of the scene's authored chain, the one focusable control with no
  `NavUp`. That is `fakeGamerCard`, and `f0078` — an arrival frame, with `f0077`
  on Games and `f0079` on Marketplace, one sideways sweep and no vertical input
  — shows the "Create Profile" card wearing the silver focus gradient while
  `btnJoinXbox` and `btnUseExistingTag` are plain. Marketplace needed no
  fallback: `blademp/marketplaceSignedOut.xur` DECLARES
  `DefaultFocus="scnBanner"`, and `marketplace.scb` has four `onpress` handlers
  and nothing else.
- **`TransBackFrom` now runs before the teardown.** `back()` plays the popped
  scene's `TransBackFrom` (`FadeOut`, opacity 1→0 over frames 0..5) and defers
  the destroy until that scope finishes, counted in 60 Hz engine steps so
  `?frame=`, `?manual` and `stepFrames` all agree. Measured on the footage
  (30 fps frame-doubled, so distinct images are two 60 Hz frames apart): the
  page is at full contrast one presented frame after the press lands (f02159,
  list-frame ink sd 21.69, minimum 14.6, identical to f02153, while the focused
  row's highlight has already cleared, 153.5 → 108.5) and entirely gone on the
  next (f02161, sd 5.22, minimum 118.7; metapane sd 8.84, legend sd 3.53). So
  the console's disappearance is bounded at two frames — inside `FadeOut`'s
  five, and all a 30 fps capture can resolve of an 83 ms ramp. The incoming half
  IS resolvable and agrees with `FadeIn`'s 30 frames: the System blade's list
  region is flat at sd 5.3 through f02179, breaks at f02181 (10.48) and settles
  at f02189 (30.49), 33 frames after the press.
- **Offline content the data supplies is drawn, not left blank.** Every
  `XuiBOTDOfflineContainer` loads the scene it names in its own
  `DefaultBanner` property (the Xbox LIVE billboard is `botd/defaultbanner0.xur`,
  the ad tile `defaultbanner1.xur`, Marketplace's
  `defaultbanner_media_large.xur`; each canvas is exactly its container's size).
  Every `TraySceneLoader` loads `dashcomm/TrayScene.xur` — the wide literal
  `L"common://TrayScene.xur"` at 0x92013130, referenced once from 0x921b1e00 —
  and `btn_Tray`'s caption is `dashStrings.xus[203]` "Open Tray", the
  fall-through of the drive-state switch at 0x921b2054. `DashLiveSignedOut`'s
  two labels are `dashStrings.xus[173]` "Create Profile" and `[52]` "No Profiles
  Found". `__dash.shell.containersFilled` lists each.
- **The Y / X legend glyphs really are disabled with no profile.** They were
  painting at full strength because `mountVisual` picks the disabled artwork at
  instantiation time and the caption is drawn by a `XuiTextPresenter` reading
  the OWNER's text; `applySignInState` now calls `setOwnerText` and
  `remountVisual`, and `f0026` shows the glyphs desaturated with no caption.
- **`navSystemSetUp` and the Themes row are code paths, and stay code paths.**
  Neither has a `PressPath`: Initial Setup raises a confirmation dialog
  (0x92114a98) and runs the OOBE, and Themes' alt handler opens
  `Personalization.xur`, which is not in this archive. Both are recorded in
  `__dash.shell.codePaths` and press to nothing.
- The Guide is not implemented and is not in the archive (PLACEHOLDERS.md). The
  button is a no-op that RECORDS itself: pressing it appends one line to
  `__dash.placeholders` naming `xam.xex`/`xshell` as where the panel actually
  lives, once per session rather than once per press.
- **`?locale=` reaches every scene the shell composes**, not just `dashmain`:
  `BladeShell.loadLocalized` patches each `.xur` from its sibling `.xus` before
  it renders, and the positional code tables are read from the locale's own copy.
  `__dash.shell.localePatches` counts them (62 for `de-de` on the walk the smoke
  suite drives) and is 0 for `en`, which is the literal already in the files.

## NXE 9199, M4d: the fold from the file, the channel change from the frames

Judge G round 1 (JUDGE.md) found the strip BEHAVING wrong in twelve ways. What
closed them, with the number.

### `controlp/Variables.xur` choreographs the fold

The scene's `SceneTransitions` group carries the four `Transition*` variables,
a `TransitionSound`, nine named frames and five timelines [SCENE]:

| range | frames | TransitionScene | TransitionChannel | TransitionPanel | SubElements | sound |
|---|---|---|---|---|---|---|
| `To` | 1..75 | 0, then 0→1 over 24..34 | −1 (ease) → 0 over 29..59 | −1 (ease) → 0 over 49..69 | 0 → 1 over 54..74 | `snd_transitioninto` @29 |
| `From` | 76..150 | 1, then 1→0 over 44..54 | 0 → 1 over 9..39 | 0 → 1 over 29..49 | 1 → 0 over 0..19 | `snd_transitionfrom` @9 |
| `BackTo` | 151..225 | 0, then 0→1 over 24..34 | 1 (ease) → 0 over 39..69 | 1 (ease) → 0 over 29..49 | 0 → 1 over 54..74 | `snd_transitioninto` @39 |
| `BackFrom` | 226..300 | 1, then 1→0 over 44..54 | 0 → −1 over 24..49 | 0 → −1 over 19..34 | 1 → 0 over 0..24 | `snd_transitionfrom` @24 |

(frames relative to the range start). The code reads the values every frame
[CODE 0x9248e854 scene → the strip layer's opacity; 0x9248ca28-0x9248ca40
channel → the queue fold routine 0x9248b7a8; 0x9248d95c-0x9248d97c panel →
`TransitionPanel × π/2` on the front slot]. The shell mounts the scene hidden,
plays `From` on A and `BackTo` on B, and reads the four values back off the
nodes (`dashboards/nxe/transitions.ts`); the two transition cues fire from
the range as timeline cues (`__dash.nxe.cues` tags them `timeline`).

The routines the values feed, decoded:

- **queue rows** (0x9248b7a8): `θ_i = clamp(1.3π p − 0.1π i, 0, π/2)` for
  `p ≥ 0` (Next6 = 0 … Prev1 = 7), the negative branch offset by −π/2; then
  the markers' opacity × (1 − |p|) and `Description`'s = 1 − |p|. So a fold is
  top-down and an unfold bottom-up, and the COUNTER fades with the fold, not
  with the channel progress (M4c had that wrong; Judge G finding 12).
- **the hinge** (0x92488480): opacity × (1 − min(|θ|·2/π, 1)),
  `SetRotation(quat(θ about Y))`, `position += v − R(θ)v` with
  `v = (−128, 0, 0)` for θ ≥ 0 and `(0, 0, 128)` for θ < 0 [0x9248852c-
  0x92488558]. A positive angle is a rotation about a vertical axis 128 units
  LEFT of the element, which is what the footage shows the front slot doing
  [FRAME Kpa f05590-05595: the sliver at ~75° sits at design x 32..117; a left
  hinge puts it at 13..122, a hinge behind the panel at 216..283].
- **the strip cascade** (0x9248d6dc-0x9248d988): progress `q` per panel
  (1 = open), forced to 1 at and in front of the cursor; folding back to front
  gated on the NEXT panel < `FoldNextRange` at `FoldSpeed × (visible+1) / 7`
  (the IntegerVariable is the divisor); unfolding front to back gated on the
  PREVIOUS panel > `UnfoldNextRange` at `UnfoldSpeed − (q − E)/(1 − E) ×
  (UnfoldSpeed − UnfoldMinSpeed)` with `E = UnfoldEaseRange` (unset = 0, so
  `dq/dt = 10 − 9.9q` and the floor binds); offset from the panel in front
  `q × spacing`; opacity `min(1, 4q)`; a panel past the cursor faded by
  `1 + z/spacing` (finding 8). `dashboards/nxe/physics.ts`.

### The channel change is measured, and it is not the cascade

Frame by frame on both captures the OLD strip fades together, in place - the
second panel's ghost is still at its rest position two frames in [FRAME Yrt
f07275] - so `q × spacing` is not what happens. `CHANNEL_SWAP`: out over 6
ticks, a 4-tick beat, each new panel in over 12 ticks front to back on the
file's `UnfoldNextRange` gate.

Both sides are read with ONE statistic: the mean absolute luma difference of a
strip region against three frames of its own shot - the REST frame before the
press, the BARE-FLOOR frame in the middle, and the SETTLED frame at the end.
It needs no sign and no threshold on brightness, and it is linear in a fade's
alpha, so half-way is half the distance. Time is counted from the last REST
frame on both sides (the captures are pixel-identical up to it and the next
frame is already 15-30 % into the fade, so the press lands about a quarter of
a frame after it). Seconds after the press, 30 fps frames on the footage,
screenshots every other tick on ours:

| event | Yrt | Kpa | ours |
|---|---|---|---|
| old strip gone | 0.100 s [f07272→07275] | 0.100 s [f00735→00738] | 0.100 s |
| the strip is bare | f07276-07277 | f00739-00741 | ticks 6-10 |
| new front half-way in | 0.244 s | 0.292 s | 0.267 s |
| new front settled | 0.367 s [f07283] | 0.400 s [f00747] | 0.367 s |
| second panel off the floor | 0.367 s [f07283] | - (that channel's slot is empty) | 0.333 s (the file's 0.7 gate on a 12-tick fade) |
| audio onsets | one, `snd_channelup` at 0.97 | | one |

Every row is inside one 30 fps frame. The half-way crossing is interpolated
between samples on both sides, because a linear fade lands exactly on the
threshold and a whole-sample answer would turn on the last pixel. The gate
traces a DOWN, not an Up: the archive's embedded homepage gives Game
Marketplace - the channel an Up lands on, and the one the capture shows - one
slot where the capture's console has two ("Explore Game Content" and a "Game
Library" that needs games on the console), so an Up here has no second panel
to time; the Welcome channel below has four.

### A and B against the frames

Measured with the same region traces Judge G used, one sample per 30 fps frame
on both sides (seconds after the press):

| A on "8 of 8" [Kpa f05576-05622] | footage | ours |
|---|---|---|
| legend leaves | 0.33 | 0.07 (its `Hide` range on the press) |
| current channel row fades | 0.40 | 0.50 |
| front slot starts to rotate | 0.47 | 0.53 |
| front slot gone (the page over it) | 0.93 | 1.03 |
| page begins to show | 0.97 | 1.07 |

| B to home [Yrt f07168-07232] | footage | ours |
|---|---|---|
| front slot starts to rotate in | 0.73 | 0.60 |
| current channel row returns | 0.73 | 0.80 |

| System → Console Settings [Kpa f05630-05652] | footage | ours |
|---|---|---|
| the swap lasts | 0.27 | 0.30 |
| the outgoing page at its faintest | 0.13 | 0.13 |

| a passing panel [Kpa f05539-05550] | footage | ours |
|---|---|---|
| the exit band is clear again | 0.33 | 0.23 |

The ORDER holds on both sides and is gated; the front slot's rotation is
gated to 0.1 s, the page to 0.15 s, B's front slot to 0.25 s; the legend
leads the footage on A by 0.27 s and the queue trails it by 0.1 s, and both
are printed, not gated, because nothing in the file says the `From` range
starts anywhere but on the press. (The same detector on both sides: an onset
is the first 30 fps frame whose region mean has moved a tenth of its whole
excursion.) `tests/smoke/smoke-nxe.mjs`
runs the comparison when `reference/frames/<capture>-30fps/` is present.

### Legacy over legacy

System → Console Settings [FRAME Kpa f05630-05639] is ten 30 fps frames with
the page region's luma 64→75→85→93→98→99→96→88→77→67: `LegacyFrom`'s
fifteen ticks and `LegacyTo`'s five-tick hold plus fifteen-tick ramp started
together, crossing at half strength. The `…Ex` pair would take sixty ticks.
The M4b-M4c window at Kpa 190.06-191.22 s was the list being walked, not a
swap. `curvesFor()` returns the plain pair everywhere.

### Rigs by distance, the queue's sign, the metapane, the tokens

- Rigs are mounted and unmounted every frame as `(k − cursor) × spacing`
  crosses `MobyVisiblePanelDistance`; every slot scene is preloaded, so a
  mount is synchronous. "8 of 8" shows System Settings in front
  [FRAME Kpa f05580]; `__dash.nxe.rigs` counts the mounts.
- The queue routine's caller hands it `−frac(cursor)` while the cursor climbs
  [CODE 0x9248c9cc-0x9248ca18], so an Up lerps every row toward the slot BELOW
  it and the names scroll down. At most N − 1 rows above the current are
  filled (`queueRowChannel`; [FRAME Yv5 f0042]).
- The metapane is driven as `BladeShell.syncMeta` drives it: the code table's
  description index on DataAssociation 0, the six hardware-state values on 4
  (PLACEHOLDERS), `metaScene_1line`'s `NToM` range for the move. System
  Settings' descriptions are its `PanelStrings`.
- `navIPTVSettings` is HIDDEN (`Show=false`) with no IPTV provider, so its
  `<servicename>` token is never painted; the smoke gates on painted text.
- Media Center's `<description2>` (`homepage/strings.xus[13]`) goes to
  `mobyslot`'s `XuiTextPresenter2` on DataAssociation 1 and is painted.
- A refused press is silent; a channel change plays its channel cue only; A
  plays select + fold and the range's `snd_transitionfrom` at +9 ticks; B
  plays back, the range's `snd_transitioninto` at +39 and unfold at +49.
