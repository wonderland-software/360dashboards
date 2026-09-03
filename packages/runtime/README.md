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
  in `tests/smoke/sweep-gradient.mjs` holds the order of operations, and that
  suite is now on the `npm run smoke` board.
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
  which is exactly why the page hides it and the wings do not. **Best remaining
  hypothesis**, and it has two halves, neither decidable from this archive: the
  chrome fills carry a modulation we do not apply (`back1` stores
  `FillColor` 150,150,150 *alongside* its gradient; the wing family stores a
  black `Stroke` with no width), or 6717's `dashuisk/skin.xur` — the build the
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
- **`unverifiedBlendModes`** — `BlendMode` 1 is alpha (DOCUMENTED); 2–5 are
  guesses. They are **not** confined to `dashmain.xur` and the blade skins, as
  an earlier note here claimed: 2 is in `arcade/2500_LiveArcadeHome`,
  `arcade/2502_TwistSelectorScene`, `videos/VideoCategories` and
  `videos/VideoDetails`, and 5 is in `gamercar/GamerCard`,
  `messenge/FriendRequestMain` and `messenge/SignupComplete`. Settling them
  needs a frame showing one of those screens, or the blade composition (the
  elements carrying 2 and 4 in dashmain sit on tabs that are `Opacity 0` at
  rest). The raw value is on `data-xui-blendmode`.
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
