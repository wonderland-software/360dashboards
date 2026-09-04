# LEARNINGS

Append-only. Stable headers; dated entries; the transferable rule in bold.

## Formats

- **XEX resources are the scene packs.** (2026-09-02) `dash.xex`'s
  `0x2FF` resource-info header lists 29 named blobs; `xex1tool -d` dumps
  them already VA-resolved. 28 are `XUIZ` v1 packs, one (`FFFE07D1`) is an
  XDBF database. `shrdres.xzp` is only the shared pack.
- **XUIZ layout, verified by hand** (`xxd` on `dashmain`): 22-byte header
  (magic, u32 version, u32 fileSize, u32 zero, u32 tocLength, u16 count);
  entries = u32 size, u32 cumulative offset, u8 nameLen, name (v1 UTF-16BE,
  v3 ASCII); data starts at `0x16 + tocLength`. What proves the rule on
  every pack: the TOC must end exactly at the data start and the entries
  must tile the data region gap-free to the last byte (`readXuiz`,
  `checkTiling`); `--probe` adds that no PNG/RIFF/XUIB/XUIS signature sits
  anywhere but at an entry start (an earlier version of that check could
  not fail; Judge A caught it). All 3,820 unpacked files hash-match their
  byte range in the packs.
- **All 263 Blades 6770 scenes are XUR v5.** Only 10 carry the optional
  count header (`flags & 1`); the rest are verified structurally.
- **The packed byte's upper five bits are a per-class property count.**
  XUIHelper only writes `(count-1) << 3`; reading it back gives a check that
  every file carries even without a count header.
- **A nested compound counts as ONE value** in a compound's declared count
  (Fill's Gradient is 1, not its four children). XUIHelper gets this right by
  accident (`is List<object>` never matches `List<XUProperty>`).
- **A compound's second byte is the same packed byte as an object's** (low
  3 bits = mask bytes, upper 5 = properties - 1), not a "depth"; XUIHelper
  ignores it and derives the mask count from its XML. 4,579/4,579 compounds
  in Blades 6770 agree (Judge B). Reading it from the file is what makes a
  wrong registry fail loudly instead of misaligning.
- **The mask-byte count is evidence of XuiTool's definition count**
  (`ceil(definitions / 8)`). Every object writes FOUR bytes for XuiElement
  although dash.xex registers 17 properties: XuiTool knew 25-32 (the
  GripTarget..CenterPivot tail). The parser now asserts the count per class.
- **Count-header formulas from XUIHelper are wrong for animated indexed
  properties** (its verifier is `return true;` so nobody noticed). What the
  files actually store: keyframeProperties = Σ keyframes × tracks,
  keyframePropertyDefinitions = Σ tracks, classDepth = Σ track path length.
  Confirmed on all ten scenes that carry the header.
- **XUS string tables** (2026-09-02, 3,234 files): header `XUIS`, u8
  version 1, u8 KIND (not flags), u32 fileSize, u16 count. Kind 1 = keyed:
  value (u16 len + UTF-16BE) then a u32 key; kind 0 = named: value then a
  second string (only `LiveAddressStrings.xus`, root + 11 locales); kind 2
  = positional (`Strings.xus`, `dashStrings.xus`, `LiveAll.xus`...: 21 in
  the pack roots and 231 in locale directories, each locale copy with the
  same entry count as its root twin). So positional and named tables are
  full parallel translations read by index, and only KEYED tables are
  patches on a `.xur`; a locale directory holds all three kinds. The keyed
  u32 is `(u8 classIndex, u8 propIndex, u16 objectId)` where objectId is
  the 1-based POSTORDER index of the object in the sibling `.xur` (children
  before parent, XuiCanvas last): the table patches that scene's string
  properties one by one. English is the literal text already inside the
  `.xur`; there is no reference syntax.
  Locale key sets legitimately differ (a locale omits entries equal to the
  English), so tests assert keys ⊆ union, not equality. The keyed
  cross-check (every entry resolves to a string property of the sibling
  scene) covers 14,407 entries in the 2,860 tables that have a sibling
  `.xur`; 110 keyed tables (95 entries: `iptv/*/hdd.xus`,
  `music/*/1003_metaPaneList.xus`) have no sibling scene in their pack and
  are unverified.
- **XUR strings are UTF-16BE, and XUIHelper drops the high byte.** Bullets
  (U+2022) become `"`, curly apostrophes (U+2019) become 0x19 and break its
  XML writer. Ours keeps them.

- **Audio:** 16 `.xma` (XMA1, RIFF-wrapped) decode directly with ffmpeg;
  PCM durations of the Ogg Opus outputs match the sources to 0.0 ms and
  channel counts are preserved. One file, `shrdres/btn_InactiveFocus.xma`,
  is 44.1 kHz and comes out at 48 kHz because Opus has no 44.1 k mode (in
  NXE 9199 it is 16 of 17 sources; only `dashcomm/tab_Switch.xma` is 48 kHz,
  so nearly the whole NXE set is resampled; `convert-audio` asserts source
  and output durations agree within 5 ms and channels match); the
  manifest records the source XMA's size/sha256 for audio entries, not the
  transcoded file's (there is no byte-identical target to hash).
- **The devkit twin (6719) is an independent witness.** Decrypted with the
  devkit key, its resource table is address-for-address identical and all
  29 resources plus `shrdres.xzp` are byte-identical to retail 6770; only
  key, entry point, checksum, filetime and version differ. Two builds signed
  with two keys vouching for every asset byte (Judge A).
- **`.scb` scene scripts are decoded** (2026-09-02, `tools/scb-decode.py`,
  all five files byte-exact; the interpreter's readers live at
  0x9258f6b8 ParseScript / 0x9258f2b8 ReadNode in dash.xex). Layout: u8
  version 2, string table (varint count, varint len + ASCII), varint
  statement count, statements. varint = one byte below 0x80, else two
  bytes big-endian masked to 15 bits. Statement = u8 kind (1 then, 2 else,
  3 else-if, 4 proc, 5 onload, 6 onselect, 7 onpress, 0x0b ontimer, 0x0c
  onchanged with $Value, 0x0e/0x0f transition begin/end with $TransType),
  name index unless kind 0-3, varint argc, nodes. Node tags: 1 if, 2
  value (vtype 0 none, 1/2 i32, 4 string index, 5 i64; kind 0 literal, 1
  $variable, 3 dotted path), 3 call (native/proc/script + named args), 4
  assignment elem.prop = value, 5 read elem.prop, 6 navigate (page,
  native, back...), 7 return, 8 binary op (0 ==, 1 !=, 6 &&, 7 ||), 9
  block over value, 10 format(fmt, args). Builtins: GetFocus, SetFocus,
  SetTimer, KillTimer, DataSet_GetItemCount, PlayTimeline, wcsicmp. The
  marketplace script binds four buttons to native scenes; the video
  scripts drive a ScriptData query/state machine ($Value 1 querying, 3
  complete, -1 error). Decoded pseudo-code: reference/scb/decoded.txt.
  `neon/modules.ox` (373 KB, mostly zero then binary) is a module blob for
  the "neon" background effect, not UI data. `FFFE07D1` is an XDBF title
  database (XACH/XCXT/XITB/XMAT sections, localized "Interfaz Xbox 360"
  strings): the dashboard's own title record, not needed for rendering.

## Motion

- **Ease keyframes carry real parameters:** of 454 Ease keyframes, 237 are
  100/100/50, 115 are 100/0/50, only 68 are 0/0/50; nine store -100 (byte
  0x9c) so EaseIn/EaseOut are SIGNED int8. Judge D measured the console's
  blade open (26-frame nOpen, Ease 100/0/50) as accelerating with peak
  speed at ~77% of the span: a cubic-bezier whose first control point sits
  BELOW the diagonal for positive EaseIn (y1 = 1/3 - k*easeIn/300, y2 =
  2/3 + k*easeOut/300). Scopes with timelines and no named frames (12 in
  dashmain: the background animations, 800-990 frames) run continuously
  and wrap.
- **The "1080p60" reference capture is 30 fps frame-doubled** (every even
  frame is a near duplicate); durations survive that, per-60Hz-frame
  velocity claims do not. Blade switches measured on the console: 20
  timeline frames for 1To2, 22 for 2To1/5To4, matching the parsed ranges.
- **A sound keyframe is an EVENT, not a value.** (2026-09-02)
  `XuiSoundXAudio.File` tracks are animated like any other property, so the
  obvious implementation fires a cue when the sampled value CHANGES. That is
  wrong and it fails silently: dashmain's `_2ndLevel_Sounds` writes
  `dash_2ndLevelClose.xma` on frames 435, 497, 581, 656, 1020 ... with no
  keyframe in between, so the change reading fires the first and swallows the
  rest - including the only cue inside `BootLive`. Button visuals hide the bug
  because they DO write `""` after each cue (`btn_1line_icon`: 15
  btn_Focus, 16 empty, 269 btn_Select, 282 empty). **Fire on the frame the
  playhead lands on, and only while it is playing** - a seek (parking a blade
  at its rest frame, `?frame=N`) must stay silent.
- **A visual's InitFocus frame is deliberately silent.** `btn_1line_icon` and
  `XuiButton` both carry `btn_Focus.xma` on Focus and an EMPTY File on
  InitFocus, so the console distinguishes "focus moved" (audible) from "a page
  arrived with focus already somewhere" (silent). Arriving on a pushed page,
  and returning to the page underneath, are both the second kind.
- **`XuiScene.TransFrom`/`TransTo` name a CURVE, not a skin.** `FadeIn` and
  `FadeOut` in `dashuisk/skin.xur` are visuals with one timeline over a single
  300x300 proxy box nobody parents: the box's `Opacity`/`Show` track is what
  XUI applies to the scene being transitioned (FadeOut 1->0 over 5 frames,
  FadeIn 0->1 over 13..30). They carry no named frames, so neither `playRange`
  nor the ambient-loop rule describes them - they run once and hold.

## Rendering (DOM)

- **A CSS transform creates a stacking context, and mix-blend-mode blends
  only inside one.** With a transform on every element, dashmain's opaque
  black_cover/top (BlendMode 2) blended against its own group's empty
  backdrop and painted the upper blade white, and a 13-candidate blend
  sweep rendered byte-identically (it measured nothing). Containers now
  position with left/top; only real rotation/scale emits a transform.
  Check for isolation before trusting any blend measurement.
- **BlendMode 2 = multiply**, measured after that fix on f0051 and f0034
  (lowest colour error on both blades). 3 and 4 occur only in blade skins
  the footage never loads; 5 is a faint wash the frames cannot separate.
  The table and its errors live in xuiEnums.ts.
- **The XUI fill transform is a TEXTURE matrix about the box centre**
  (2026-09-02, `GRADIENT_TRANSFORM`). `Fill.Translation/Scale/Rotation` map the
  box's own (u,v) INTO gradient space - so the SVG `gradientTransform` is its
  INVERSE, and `Translation +0.5` moves the gradient left, not right. Scale and
  rotation act about the centre, translation is a fraction of the box, the
  order is scale-rotate-translate, and a resting radial is the ellipse
  inscribed in the box. Swept as 40 candidates against the tab staircases of
  f0051 and f0034: summed luma MAD 40.95 for this model against 103.33 for the
  shape-direction reading it replaced (per blade, NCC 0.225 -> 0.877 and
  -0.021 -> 0.889). **Getting the DIRECTION backwards looks like a plausible
  render**, which is why it survived a phase: the edges are in roughly the
  right place and only the darkness is wrong.
- **Settle a rotation sign on a figure whose geometry cannot lie.**
  The staircase sweep separates +1 from -1 by 1.5 MAD, which decides nothing.
  `botd/defaultbanner1`'s frame does: four 14 px border strips around one
  rectangle, the horizontal pair at Rotation 0 and 180 (sign-free) proving the
  opaque stop sits on the INNER edge, then the vertical pair at -90 and +90
  forced to agree with it. Only one sign makes all four glow inward.
- **An element Id is not unique in the document.** `legend_a`, `legend_b` and
  `metaPanelScene` exist in dozens of scenes at once, so `setState(id, state)`
  over the whole tree plays the range on every copy - which fires one cue per
  copy. Scope a state change to the subtree of the scene that owns it.
- **The devkit twin 6719's 29 resources are byte-identical to 6770's**
  (dumped and hashed 2026-09-02 night), so the reference footage's 6717
  skin cannot plausibly differ from ours: the 4-5% light chrome is a
  rendering rule, not authoring. Candidate: FillColor stored beside a
  texture/gradient fill modulating it.
- **A same-build capture exists:** the 2160p60 "boot to blades" video
  (YouTube RUlH_f9GIJY) shows Console Settings with "Dashboard:
  2.0.6770.0", i.e. build 6770 itself, from a different capture chain than
  the 6717 footage; it is the arbiter for absolute-luma questions
  (reference/frames/6770-boot).
- **Rendered screenshots are Microsoft artwork too:** tests/smoke/out is
  gitignored like the assets.

### Compositor layers are the budget, not raster speed (2026-09-03)

Tag saw the Blades page flicker with black rectangles in a 2000x1196 Retina
window - whole menu rows and the legend vanishing and returning - while
headless Chrome, at the same size and on the same Apple GPU, rendered every
frame clean. A screenshot waits for the raster; a live window does not. The
DevTools `LayerTree` domain explained it: 99 compositor layers, 522 MB of
tiles at 2x, which is Chrome's tile budget, so tiles were being evicted and
painted as the page's black background until they came back.

- **`rotate3d` is a 3D transform even about Z.** Every one of the corpus's
  403 rotations was emitted as `rotate3d`; Chrome promotes each to its own GPU
  layer (`Trivial3DTransform`, 55 of them) and then promotes everything that
  overlaps one (`Overlap`, 27 more). 390 of those rotations are about Z alone:
  they are now `rotate()`, the same matrix, no layer.
- **The 13 real tilts are affine outside a perspective.** With no perspective
  ancestor a 3D rotate projects orthographically, so its screen mapping is
  exactly `matrix(R00, R10, R01, R11)` from the quaternion's rotation matrix
  (checked against `DOMMatrix` to 1e-6). Blades has no perspective anywhere,
  so `BuildProfile.flatten3d` emits that matrix there; NXE keeps `rotate3d`
  because its home is a XuiPerspectiveScene under a CSS perspective.
- **`position: fixed` on the app shell** was one more full-window layer
  (`FixedPosition` + `UndoOverscroll`); absolute is the same box.
- Result 99 → 13 layers, 522 → 159 MB, pixels unchanged (boot, gallery,
  blades and nav suites green). `smoke-boot` now reads the layer tree at
  2000x1196@2x and holds the page under 24 layers / 260 MB.
- Related, found on the way: the skin's ambient swirl figures (`thing1..3`)
  animate their gradient `StopPos` every frame, and `updateNode` rebuilt the
  whole SVG each tick. `updateGradientStops` now rewrites the `<stop>`s in
  place (falling back to a rebuild when the resampled stop count changes).
  The repaint itself is real - the console repainted them too - but the DOM
  churn was ours.

## Screen mapping

- **The 1120x770 canvas maps anisotropically onto 1280x720** (2026-09-02,
  measured on 18 landmarks in two 1080p60 frames of build 6717, all within
  0.48 px): `screen_x = x * 8/7`, `screen_y = y * 12/11 - 64` in 720p
  terms. The canvas renders as 1280x840 placed 64 px above the frame top;
  visible design rows are 58.67..718.67 (a deliberate, off-centre TV-safe
  bleed). sx/sy = 22/21, so circles are 4.8% wider than tall on the console
  and a uniform scale is tens of pixels wrong. Fit landed on exactly
  1920/1120 with 0.12 px offset, ruling out a capture crop.
- **Confirmed on a same-build capture** (build 6770, genuine 1080p60,
  reference/calibration/README-6770.md): sx agrees to 0.0005%, sy to
  0.022%, offsets within half a pixel. The rule is the console's.
- **Two captures of one console output differ by a pure gain of 2.3%**
  (6770 = 1.0228 x 6717 + 0.13 over 791 achromatic blocks), so an absolute
  luma read off one capture is worth about +-5 on the chrome. Judge with
  achromatic flat 16x16 blocks binned by luma, never with region means over
  gradients and never by luma on a saturated surface (the page "agreed"
  only because it was purple). Check a capture's motion map before
  trusting a still: 6770-boot f0041 and f0048 look at rest and are not.
- **The Blades residual is global, not the chrome:** at matched luma the
  page and the chrome are both light by the same few percent in the
  160-200 band (frame = 1.119 x ours - 29.4, rms 0.6), and our page
  purple's channel spread is 71 against 97/106 in the two captures. Wing
  stroke, FillColor modulation, blend modes and skin authoring are all
  closed against; the open question is colour-space interpolation of
  gradients and blends (the console blended in its piecewise-linear gamma
  space).
- **List item pitch is 45 design px and row k's top is list y + 45k with
  NO inset.** The calibration's "row 0 top = 157" was the half-intensity
  crossing of a 3 px separator figure that starts at the row's own y (154);
  reading it as the row origin put every row label 3 design px low (Judge
  C). dashmain's hand-placed nav buttons sit at y = 153, 198, 243, ... 468.
- **The landmark you measure has to be a DETECTOR, not five numbers.**
  (2026-09-02) Comparing a render to a frame by hand-read landmarks cannot tell
  a composition error from a reading error. Writing the rule instead - page
  left = the strongest falling luma edge in the y=20 band, page right = the
  darkest column one page-width to its right - and checking it reproduces the
  spec's own ten hand-read landmarks to within 3 px turns the gate into a
  measurement of the render. **Window the search by an invariant of the
  subject**: a global minimum picked the wrong one of four near-identical tab
  seams (within 3 luma of each other) as soon as the render's seams got a few
  luma lighter; right - left is 1321..1359 on all five blades, so that window
  is data.
- **Focus transitions must be edge-triggered.** A clamped d-pad press that
  re-issued setState('Focus') re-entered the button's Focus range ten times
  a second under auto-repeat, so the FocusLoop never got past its first
  third (Judge D). focus() is a no-op when the index is unchanged.
- **Figure Points ARE scaled from their bounding box to Width x Height**
  (runtime agent, measured on the A-button disc: 42 px on screen, stretched
  predicts 43, unstretched 52; and the list separators run the full 423-unit
  list width). The research note that said "render points as-is" was wrong.
- **PointSize is not a pixel height: em = PointSize x 100/72 design px**,
  derived on both axes (string width and cap height agree to 22/21, the
  canvas anisotropy). Width 60 / Height 30 are the compiler's omitted
  defaults (no element in 7,125 stores either).
- **Label_Head at PointSize 22:** cap height 20.2 design units, baseline at
  box y + 29.2, left bearing about 2.2 design px (for font checks).

## Registry

- **The property tables are built in code, not stored as data.** No pointer
  to any property-name string exists in the image; the XUI runtime fills
  0x30-byte `XUIElementPropDef` records on the stack (`+4` index, `+8` data
  offset, `+0x10` name, `+0x14` type) then registers the class. So
  `tools/ppc-strings.ts` (lis/addi resolver) and `tools/xui-propdefs.ts`
  (a store-tracking mini-simulator) recover them. Type codes match the XUI
  enum: 1 bool 2 int 3 uint 4 float 5 string 6 color 7 vector 8 quat 9
  object 10 custom.
- **The type immediate can be stored a few instructions BEFORE the name**
  (compiler hoisting), and the index immediate up to 0x100 bytes earlier:
  windows must allow both, or one entry in five tables silently vanishes.
- **9199 XML vs 6770 binary:** 16 of 67 shared classes differ. Most are
  later additions at the tail (XuiElement +10, XuiButton +6, XuiListItem +4,
  XuiImage +2, XuiLabel, XuiImagePresenter, XuiTextPresenter, XuiHtmlElement,
  XuiScene.RecurseTransitions, XuiText.TextScale); three are not:
  XuiEdit.TextLimit is unsigned in the binary (integer in the XML),
  XuiHtmlPresenter.DataAssociation unsigned (integer), XuiHtmlControl has
  LineHeight where the XML has TeletypeCount. DashScene's three strings are
  PanelSettings, PanelStrings, PanelScenePaths in the binary (XUIHelper's
  hand-written names differ). ScriptScene = Script, Visible. Banner classes:
  XuiBOTDOfflineScene owns ButtonVisual; XuiBOTDOfflineContainer owns Area,
  DefaultBanner. XuiFall07BOTDScene is registered by something outside
  dash.xex: the one scene using it writes two mask bytes (9-16 definitions)
  and sets only bit 6 (a string); the other eight entries are placeholders
  and say so.
- **Registration heuristics need a sanity filter.** "Two wide strings at
  +0/+4" also matches a font-path pair and a named-frame command chain;
  keep only registrations whose base chain reaches XuiElement. And a
  shared-shape table must be bound by its `bl` target, not by guessing:
  the Id table belongs to XuiEffect (XuiTransition's pointer is NULL).
- **A regex that only knows `<PropDef ...></PropDef>` swallows the
  self-closing `<PropDef .../>` AND the definition after it.** That is how
  DashScene and ScriptScene first came out empty from the 9199 XML.

## Fonts

- **`.xtt` is paged zlib, not encryption** (2026-09-02): `xttf` magic, a
  252-byte signature blob, then a zlib "shell" (an sfnt with cmap/head/hhea/
  hmtx/name plus Xbox tables xttf/xchk/xloc/xglf) and one independently
  deflated 4096-byte page per glyph page. `xloc` entries are paged addresses
  `(page << 16) | offset`; flatten the pages and it is ordinary TrueType
  `glyf` data. The console cmap maps missing characters to gid 0xFFFF
  ("use the fallback font", which is what ConvectionUIFallback is); OTS
  rejects that, so `tools/xtt2ttf.py` re-emits a clean format-4 cmap. Family
  names inside are "Xbox TC" / "Xbox JK", 2048 upm.

## Tooling

- **The shell cwd drifts between tool calls.** Every command starts with
  `cd <repo root>`; two files were written into `vendor/` before that rule.
- **macOS `strings` has no `-e` (encoding) flag.** `tools/pe-strings.ts`
  scans UTF-16BE itself and prints virtual addresses.
- **XUIHelper's CLI on macOS:** retarget both csproj files to `net10.0`,
  change `Assets\Extensions` to a forward slash in `Program.cs`, pass
  absolute paths, and `-g V5` (the group is the directory name, not 9199).
- **idaxex builds on Apple Silicon first try** with `cmake -S xex1tool -B
  xex1tool/build -G Ninja`; the compiled-in retail key decrypts retail
  builds, so the devkit twin was not needed.

## Reference footage

- **The 6717 capture is 30 fps frame-doubled.** (2026-09-02) In
  `reference/frames/6717-60fps`, every even frame duplicates the one before it:
  across a blade transition the odd frames carry 3-50 units of pixel-difference
  energy and the even ones 0.03-0.18. **Durations measured off it are
  trustworthy; per-60Hz-frame velocities are not** - the smallest honest time
  step the footage supports is 1/30 s.

## Process

- **Judges are not the implementer.** Every phase ends with an independent
  review against the original bytes and reference footage (see JUDGE.md).

## NXE 9199

Second build through the same pipeline (2026-09-02): `npm run extract --
--build 9199` prints EXTRACT_PASS, `xur2json --strict --registry 9199` is
XUR_PASS 311/311, `xur2xui --diff` is XUIDIFF_PASS 308 identical, and every
6770 output is unchanged (EXTRACT_PASS with the same counts, XUR_PASS
263/263, XUIDIFF_PASS, 58/58 tests).

- **Same containers, more of them.** 29 resources again (28 `XUIZ` v1 + the
  `FFFE07D1` XDBF), 4,344 TOC entries in 29 packs: 311 `.xur` (all XUR v5,
  6 with the count header), 296 png, 28 jpg, 3,658 `.xus`, 17 xma, 7 scb,
  20 `.uxfx` (compiled shader effects: reflection, texturemask, ripple,
  blur, colour ops), 5 `.xml` (homepage channel/config), `neon/modules.ox`.
  Nine packs are new (controlp, firstrun, gamer, homepage, noobe, parental,
  signin, slots, thermal) and nine Blades packs are gone (blademp, botd,
  dashskn1, dashskn2, gamesbla, live, mediabla, oobe, videocha); dashuisk
  exists in both. The devkit 9199 signs the SAME image: its resource table
  and all 29 resources are byte-identical to retail (a second witness for
  4,262 of the 4,344 pack entries), but its loose `shrdres.xzp` is a
  different file (120,922 vs 193,336 bytes, sharing only 5 of retail's 82
  paths), so those 77 entries have no second witness.
- **A TOC can list the same path twice.** `slots` names `TraySlotScene.xur`
  twice with identical bytes, so 4,344 entries become 4,343 files.
  `unpack-xuiz` now reports duplicates (a differing duplicate fails), and
  `fixtures/expected-<build>.json` pins both `entries` and `packEntries`.
- **XUS is unchanged:** kinds 1=3,388 keyed, 2=258 positional, 0=12 named;
  all 3,658 parse to EOF. Of 13,714 keyed entries, the 13,577 in the 3,324
  tables that have a sibling scene all resolve to a string property with
  the 9199 registry; 64 tables (137 entries, e.g.
  `firstrun/<locale>/OfflinePrimetimeSlotScene.xus`) have no sibling scene
  and are unverified.
- **9199 builds its property tables in `.data`, not on the stack, and
  stores the index AFTER the name** (Id's index lands 12 bytes past its
  name at 0x921871a8; XuiFigure's Stroke type 0x34 bytes past). The
  simulator now keys a store by its absolute address whenever the base
  register holds a known address (no aliasing, whole-function window) and
  falls back to the tight stack-slot windows otherwise; the 6770 tables
  came out identical. **`addi r1,r1,N; b _restgprlr` is a function end**:
  without that boundary the XuiElement and XuiControl builders read as one
  function and XuiControl's registration would claim both tables.
- **Binding is mechanical now.** A registration `bl`s the function that
  builds its table and stores r3 at +0x18; `xui-propdefs` records the call
  targets and `build-registry.ts` binds by call graph. On 6770 that
  reproduces Judge B's hand-checked map exactly (kept as an assertion);
  the only 6770 registry change is 35 zero-property classes' `source`
  addresses moving to their function's own start.
- **9199 binary vs XUIHelper's 9199 XML (binary wins):** XuiShader's first
  property is `Id`, not `ShaderId`; XuiList = Wrap, WrapBump; XuiComboBox
  MaxVisibleVertItems is unsigned; XuiTextureSurface = ShowSurface only
  (XML: Offscreen, DepthStencil, PreRender, Buffered); AuraControl adds
  BannerImage; XuiHtmlControl = LineHeight, TeletypeCount; ScriptScene =
  Script, Visible; DashScene = PanelSettings/PanelStrings/PanelScenePaths
  again; XuiEdit.TextLimit and XuiHtmlPresenter.DataAssociation are
  unsigned; LoadType (XuiImage, XuiImagePresenter), TextScale (XuiText,
  XuiTextPresenter), RecurseTransitions (XuiScene) and XuiLabel.MaxFlowLines
  are NOT registered by this binary either. New in 9199's binary and absent
  from the XML: Xui3DScene, Xui3DElement, Xui3DCamera, Xui3DMesh, Xui3DBone
  (unused by the scenes). XuiMessageBoxButton, XuiGridPanel, the HUD/Guide
  classes and LiveData/MediaData are not in dash.xex at all.
- **6770 vs 9199 binaries:** XuiButton grew 1 -> 7 (press/focus anim
  hooks), XuiListItem 5 -> 9 (smooth scroll), XuiImage +
  TextureSurfaceElement, XuiHtmlElement + TeletypeCount, XuiList +
  WrapBump; XuiComboBox, XuiPerspectiveScene, XuiShader, XuiVariable,
  XuiTextureSurface, XuiAvatar, AuraControl and the Xui3D* classes are new;
  the whole XuiEffect family (Id, blur/grayscale/recolor/brightpass/texture
  effects) is gone, replaced by `.uxfx` shaders through XuiShader. XuiElement
  and XuiControl are identical, and XuiElement's XuiTool tail (17-26) is
  still never set by any of the 311 scenes.
- **Two classes are registered outside dash.xex 9199:** `XuiVideo`
  (homepage/VideoScene: one mask byte, bits 1 and 3 = SizeMode 16, Loop
  true, matching XuiTool's order and types) and `MediaScene`
  (dashcomm/OfflineMarketplace, sets nothing of its own). Neither name is a
  string in the image; the registry carries XuiTool's definitions tagged
  `origin: xuitool-xml` with that evidence in `source`.
- **XUIHelper on 9199:** 310/311 convert; `consoles/dashSysLiveVision`
  is refused because LiveVisionControl is not in its XML. Two outputs are
  truncated by the low-byte bug (U+2014 in OfflineMarketplace, U+2013 in
  WhatsNewFacebookTwitterScene), and 9199's DeleteMusic is fine, so the
  defect list is per build. Its `9199.xhe` lists `<IgnoreProperties>`
  (XuiElement 17-26, XuiImage TextureSurfaceElement/LoadType, TextScale):
  its reader consumes them and its writer drops them, so the diff strips
  TextureSurfaceElement from our side (controlp/PanelScene sets it).
- **What the NXE scenes use that Blades never did** (class census): no
  scene sets `Font` (26 did in 6770), so every text takes the skin default;
  canvases are 1120x770 (202), 420x320 (30), 1280x720 (29), 720x480 (12),
  640x480 (11), 880x480 (9), and singletons 512x512, 1024x720, 1024x768,
  460x495, 420x450, 280x450, 270x360, 320x320, 405x88, 162x25, 64x64; Anchor carries bits 6-7 (0xc0-0xcf, 325 uses);
  BlendMode 4/5 stay rare (13); image paths add `controlpack://`;
  LegacyControl in 172 scenes, XuiHtmlElement 25, AuraControl 13,
  XuiGamerCard 9, ScriptScene 8, XuiTextureSurface 7, XuiAvatar 5,
  XuiPerspectiveScene 3 (AuraScene, DashBkgnd, DashWaiting), XuiShader 2
  (AuraScene, PanelScene: reflection.uxfx with EffectParams animated),
  XuiVariable, XuiVideo, MediaScene, XuiTabScene one each; 3D rotation
  with an X/Y component on 19 elements; 15,856 keyframes with 570 Ease.

## The extracted `basefile.exe` is flat-mapped, and its section headers lie

`tools/ppc-dis.ts` prints `.text` VAs **0x200 too high**. `basefile.exe` is a
rebuilt PE whose section headers disagree with the image the code was linked
for: the code, the relocations and `.pdata` all use the flat mapping
`raw = VA - 0x92000000`, while the headers put `.text` +0x200 and `.data`
+0x1200 off that. The check that settles it is `.pdata`: of 1,200 sampled
`BeginAddress` entries, **1,191 land on a function prologue under the flat
mapping and 82 under the header mapping**. The same skew is why a `.data` table
read at its header-mapped offset comes back all zeroes — the time-zone table's
code-materialised base 0x927bf680 is file offset 0x7bf680, not 0x7be480.

So: `.rdata` addresses printed by the tools are right (the two mappings agree
below `.pdata`), `.text` addresses printed by `ppc-dis` are 0x200 high, and
every address written into `dashboards/blades/*.ts` is flat-mapped. Cross-check
a suspicious address by disassembling both and seeing which one starts on a
prologue.

## A control with no `Visual` wears the visual named after its class

Not a convention we assumed — `dashuisk/skin.xur` is explicit about it. The file
carries a literal separator child
`Id="---------------Default-----------------------------"`, and immediately
after it a block of visuals named exactly for the classes: `XuiLabel`,
`XuiLabelCenterJustify`, `XuiLabelRightJustify`, `XuiButton`,
`XuiButton_Multiline`, `XuiBackButton`, `XuiCheckbox`, `XuiEdit`, `XuiList`,
`XuiRadioButton`, `XuiRadioGroup`, `XuiProgressBar`, `XuiGamerCard`,
`XuiBOTDContainer`, `XuiScene`.

The rule is invisible on most controls, because `XuiScene`'s default is an empty
300x300 visual and most controls name a visual of their own. It is decisive on
`XuiLabel`, whose default is a single `XuiTextPresenter`: a `XuiLabel` derives
from `XuiControl`, NOT from `XuiText`, so it paints nothing itself and the
presenter inside its visual is the only thing that draws its `Text`. Without the
fallback, every `XuiLabel` in the build that named no `Visual` rendered as an
empty box — including `botd/defaultbanner0.xur`'s `label_Body`, the whole
"Games. Tournaments. Entertainment…" paragraph on the Xbox LIVE blade. Lists are
the one exclusion: `ListView` instantiates the `XuiList` default itself because
it needs that visual's `control_ListItem` template and its two `XuiScrollEnd`s.

## Enabled is chosen when a visual is instantiated, not when it is drawn

`mountVisual` picks the disabled artwork from the flag it is handed at
instantiation, and a `XuiTextPresenter` draws its OWNER's text, captured at the
same moment. So a control that becomes disabled or loses its caption AFTER its
first render keeps both until the visual is re-instantiated. That is why the Y
and X legend glyphs painted at full strength with a "Sign Out" caption on a
console with no profile, where the frames show them desaturated and blank. Two
writes are needed, not one: `setOwnerText` for the caption and `remountVisual`
for the artwork.


## NXE 9199 shell (from reference/glue-nxe/NXE_GLUE_SPEC.md, 2026-09-03)

- **The root is `homepage/homepage.xur`, 1280x720 native, 1:1 on screen**
  (`CEpixHomePageScene : MobyRootScene : XuiPerspectiveScene`); the Blades
  8/7 x 12/11 mapping does not apply (three landmarks within ~2 px of
  authored size). It is empty: PanelLayer/ChannelLayer/AnchorLayer groups,
  four parked legend buttons, an AuraControl. Composition comes from
  `emb_homepage.xml` + three `epix://*.xml` files with `<condition>`
  predicates (the offline My Xbox channel: 11 slots, 8 pass offline).
- **Channels are vertical** (`MobyChannelScene`, a 9-row name queue
  `Queue\Prev1`, `Queue\Next1..6`, 36 px pitch, backslash child paths);
  **panels go horizontally into depth**: every page is a
  `controlpack://PanelScene.xur` clone (XuiTextureSurface render target,
  `reflection.uxfx`, a Scale (1,-1,1) mirror, nine-grid shadow) on a 3D line
  from FrontPosition to BackPosition.
- **Navigation is a physics integrator**, not named ranges: thirty
  constants in `controlp/Variables.xur` (spacing 505/480, accel/decel/max
  velocity, fold/unfold speeds, visible distance 3225/1850) via a 43-name
  table at .rdata 0x927f7108 that also names the eight cues, so the glue
  plays the cues (the inverse of the Blades rule).
- **LegacyControl (172 scenes) hosts the Blades dashboard inside the
  shell**: an 880x480 DashScene centred at x=640 with legend/header parked
  off-screen so the shell's LegendScene (1088x32 @ 96,632) hoists captions;
  DashScene's Panel* and MetaPanelScene are unchanged from 6770. Console
  Settings is 8 rows in a 16-byte table at 0x92016a90.
- `.uxfx` = UXFX header + ps_2_0 PC blob + ps_3_0 Xbox blob with uniforms
  ColorFactor/ControlSize/EffectParams1..5/Texture1-2: XuiShader's
  EffectParamsN are shader constants.
- Footage: Kparblu6r14 (9199 devkit tour, 1080p 29.97), YrtwSj1f6aY (9199
  default theme, 30 fps doubled), ucJoSC29UL8 (8498, genuine 60 fps),
  Yv5A4DFHAAE (8955, the only offline/no-profile capture). The installed
  yt-dlp silently falls back to 360p on DASH 403s; use a current binary.
- Open: the archive's "9199" XEX was built 2010-02-18 and ships What's-New
  slides from late 2009/2010, so its label may be wrong; perspective
  defaults, fold curve, SceneTransitions resolution, missing
  SolutionsSlotScene.xur.

## NXE 9199 shell, M4a (2026-09-03)

The home page composes offline and one legacy page is hosted inside it;
`?build=9199` serves both from the same app, and Blades 6770 is byte-identical
in behaviour (64 tests, 8 smoke suites, all green).

- **The NXE projection is NOT about the front anchor, and the spec's one-edge
  focal length is refuted.** `NXE_GLUE_SPEC` §2.2 calibrated `f ≈ 1748` from a
  single measured edge under that assumption. On the same frame the assumption
  puts panel 2's bottom at 577.8 where the frame has 519.8 — a 58 px error —
  and `f = 1749` with the centre free still leaves rms 25 px. Fitting a plain
  pinhole `s(z) = 1/(1+z/f)` about a centre `C` to **ten** landmarks on three
  panels gives `f = 1428, Cu = 154.5, Cv = 356.5`, rms **0.46 px**, worst
  0.86 px, with panel 3 (which fixes nothing) landing within 0.62 px on all
  three edges. **The tell is in the frame and is free**: as panels recede their
  bottoms RISE (568 → 520 → 492) and their tops FALL (248 → 284 → 305), so they
  converge on a point, and any model that slides them along the floor is wrong
  before you measure anything. CSS `perspective: f` + `perspective-origin: C`
  computes exactly that projection for a child at `translateZ(-z)`, so the DOM
  needs no arithmetic of ours.
- **A one-landmark calibration cannot be checked, so it will be wrong in a way
  that looks right.** The spec's `f` reproduced the edge it was fitted to, to
  2 px. The cheapest guard is a landmark of a different KIND (an edge on the
  other axis), not another of the same kind.
- **`PanelScene` is authored for a bottom-aligned 320-tall slot, and two
  independent numbers say so.** The rig's `Reflection` is 512 tall at y = 1022
  with `Scale.y = -1`, so the mirror line is at 1022 − 512 = 510; and the rig's
  `Shadow` is authored at y = 190 with height 320, where 512 − 320 − 2 = 190.
  Put the rig's origin one full surface (512) above the strip anchor and the
  slot's foot lands on the mirror line, the reflection starts at the panel's
  foot, and the surface's own `-2` is exactly why the panel's foot measures 568
  against a `MobyFrontPosition` of 570. Reading "bottom-aligned" as the
  surface's local bottom instead of the mirror line puts everything 2 px low.
- **A nine-grid with `ColorWriteFlags 8` is a MASK, not a picture.** Every
  `mobyslot*` visual ends with a `common://CornerMask.png` nine-grid that
  writes the alpha channel only, to round the panel's corners. Rendered as a
  picture it covers the whole slot — the first NXE home page came out black,
  and the black looked like a missing background image. **Check
  `ColorWriteFlags` before blaming an asset.**
- **`DataAssociation` gates a XuiImagePresenter's picture too**, not just a
  text presenter's text — but only on 9199: build 6770 has 31 image presenters
  with a non-zero association that draw today (30 in `dashuisk/skin.xur`), so
  the rule has to be gated by build or Blades changes.
- **The `IDS_` → `homepage/strings.xus` map is two parallel `.rdata` arrays,
  read with a one-slot offset**: 25 name pointers at 0x927f26b8 and 25 indices
  at 0x927f25f0. The offset is not a guess — it resolves eighteen consecutive
  names to exactly the string they are called ("Disc in Tray", "Gamer Card",
  "Game Library", …). It does NOT hold at both ends:
  `IDS_CHANNELNAME_XBOX360` and `IDS_CHANNELNAME_FRIENDS` come out swapped, so
  those two are settled by the strings and the frame and are tagged as such.
  **An offset that works for eighteen entries and fails for two is still worth
  shipping, provided the two are named.**
- **A slot's picture is code, its caption is data.** The eleven `slots` scenes
  declare neither `ImagePath` nor `Text`. The captions turn out to be each
  slot's own `<description>` in the channel XML resolved through
  `homepage/strings.xus` (no inference at all); the pictures are all in the
  archive but their binding to a class is materialised in code, not stored as a
  pointer array, so it is inferred from one `.rdata` literal cluster
  (0x9202a064–0x9202a2bc) laid out in the emission order of the slot classes,
  and every row is tagged `inferred` in the telemetry.
- **The Console Settings LIST pitch is 45, not the 46 the spec reads off
  `SystemScene`'s hand-placed nav buttons.** Measured on both the frame and our
  render with the same detector: 45.14 vs 45.00. The pitch comes from the
  `XuiList` visual's `control_ListItem`, not from the scene's own copies.
- **Frame-number correction:** `NXE_GLUE_SPEC` §5 and `nxe-README.md` cite
  `Kparblu6r14 f0375` for Console Settings. `f0375` is SYSTEM Settings (seven
  rows); the eight-row Console Settings page is `f0381`. The row set and order
  the spec gives are exactly right.
- **Four images and five visuals the 9199 build names and the 9199 dump does
  not have:** `common://updis.png`, `sharedres://GScore.png` (the pack carries
  `GScore_white.png`), `sharedres://ico_96x_MSPoints.png`,
  `sharedres://splash_360.png`; `prgbr_VideoPreload`, `box_green`,
  `box_orange`, `tab_active_glow_2`, `tab_active_glow_3`. All nine are real
  absences, each named by exactly one scene, and all nine are allowlisted with
  the reason rather than substituted.
- **zsh does not word-split an unquoted variable.** `set -- $b` inside a loop
  hands the whole string to `$1`, which silently turned two measurement
  arguments into `NaN` and printed a table of NaNs rather than failing.

## NXE 9199 shell, M4b: the strip moves (2026-09-03)

The home strip navigates, folds, plays its cues and hosts a page stack; the
background is drawn. Blades 6770 is byte-identical in behaviour (64 tests, all
10 smoke suites green).

- **A constant with no unit has to be refuted, not chosen.**
  `MobyPanelInputAcceleration 40` is 40 of something the file never says. In z
  units one panel step takes 25 seconds; per 60 Hz frame it takes 0.9 ms. Only
  INDEX UNITS PER SECOND survives - and the channel axis then closes at
  `sqrt(2(50+40)/(50*40))` = **exactly 0.300 000 s**. Two numbers that are not
  round producing a round three tenths is the evidence for the unit; the two
  refutations are what make it more than a preference.
- **"A held direction accelerates toward a cap" cannot be the whole model.**
  Read literally, a one-frame tap reaches 0.67 panels/s and coasts 0.007 of a
  panel. The console moves exactly one panel on a tap, so the cursor is servoed
  to an integer TARGET and holding re-targets. The spec's sentence describes the
  feel, not the mechanism.
- **A braking rule written as a switch loses the tail.** "Accelerate until the
  braking distance, then decelerate" overshoots on a discrete step and the
  arrival clamp eats what is left: 17 frames against a closed form of 20.5, a
  12 % error with no visible symptom. Written as a SPEED CEILING -
  `|v| <= sqrt(2 d e)` - the integrator lands within a frame of its own closed
  form.
- **A cascade gate must be read off the previous frame's progress.** Read off
  the array being written, panel 0 advances, panel 1 sees the advanced value,
  passes its `NextRange` gate and advances in the same pass, and a seven-panel
  fold finishes in two frames. A stagger of one frame is not a stagger, and
  nothing in the code says so - the only tell is the cue log, where
  `SoundPanelFold` and `SoundPanelUnfold` land two ticks apart.
- **Screen displacement is not cursor displacement, and comparing them makes a
  good fit look bad.** The strip is projected, so a constant cursor rate is an
  accelerating screen rate near the front and a crawl at the back. The model's
  velocity centroid is 0.48 in cursor units and 0.428 once projected onto a
  panel edge; the two captures measure 0.446 and 0.410. Push the model through
  the same projection before comparing, or the skew looks like an error.
- **`SceneTransitions/*` is not a fifth namespace** (NXE_GLUE_SPEC §10.4 lists
  it open). All four entries of the code's 43-name table resolve by their TAIL
  as ordinary `XuiVariable`s in the same `controlp/Variables.xur`:
  `TransitionScene` 1, `TransitionSubElements` 1, `TransitionChannel` and
  `TransitionPanel` unset. Read as switches that says a Trans* curve runs on a
  scene change and not on a cursor move - which is what the strip physics needs.
- **The `…Ex` transition pair is measured, not inferred any more.** §2.4 leaves
  the choice open. A legacy page replacing another legacy page measures a
  0.501 s burst, a quiet 0.43 s and a 0.234 s burst [FRAME Kpa t = 190.1 s];
  `LegacyFromEx` is 0.500 s, its hold 0.250 s and its fade 0.250 s. The plain
  pair cannot make a half-second outgoing fade.
- **An `EcNavTo*` command's destination is code, not a table.** The 35 command
  NAMES are a real `{char*, u32}` array at `.rdata` 0x920288a0
  (`EcNavToSettings` = 4), but nothing in the image references the
  `SystemScene.xur` literal at 0x920291a4 - same shape as the slot artwork.
  One row is bound and marked inferred; the rest are refused and listed.
- **The channel queue runs UPWARD and WRAPS.** `Prev1` is authored BELOW
  `Current` (y 190 against 154), so the stack above the current channel is
  `Next1..Next6`, carrying the channels that FOLLOW it in file order and
  wrapping past the end - which is what [FRAME Kpa f0048] shows above "My Xbox",
  the last channel in `emb_homepage.xml`. Nothing is drawn below the current row
  at rest. Getting this backwards drew one name in the wrong place at full
  brightness and looked like a spacing bug.
- **A mask inside a `Scale.y = -1` element runs the other way.** The
  reflection's ramp is applied in LOCAL coordinates, before the flip, so local
  v = 100 % is the floor line and v = 0 is 512 px below it. Written `to bottom`
  the mirror is absent where it belongs (a column mean of 0 at every row under
  the panel) and present as detached slabs far below - a failure that reads as
  a missing asset, not as an inverted gradient.
- **Sweeping a parameter that does not move the number is the finding.** 35
  (alpha, fade) pairs for the reflection all land within 3 MAD of each other
  against the frame's floor. With the reflection off entirely the same rows are
  still 30-90 luma dark, so the Aura's own floor is the error and the mirror is
  not. Tuning the mirror to close it would have hidden the real gap.
- **A per-character caption width is not a layout.** The legend row was laid out
  with `LEGEND_CHAR_W = 8.6` against a proportional face, which put the B icon
  7 px out. The renderer has already drawn the glyphs, so a `Range` over the
  paint box's TEXT NODES gives the real ink width ("Select" 51.9 against the
  frame's 50) - but a Range over the BOX gives the box (512 px), and the
  measurement has to happen after the legend groups are settled onto the last
  frame of their `Show` range, because an invisible element measures zero.
- **The dev-server leak was N shells, not one shell accumulating.** `main()`
  runs at module scope; a hot update re-ran it and left the old viewport, input
  router, clock and AudioContext alive. The metapane was not stacking
  descriptions - there were several metapanes. Fixed with a disposer list wired
  to `import.meta.hot.dispose`, static live-counts on `Viewport`, `InputRouter`
  and `AudioBank`, and a smoke check that mounts twice and asserts one of each.
- **`?page=` and A are the same push.** Making the `?page=` route call the same
  `pushPage` the A button takes, with the transition and the cue suppressed,
  is what keeps a debugging route from drifting away from the real one.

## Metro 17559

Third build through the same pipeline (2026-09-03), and the first XUR v8 one:
`npm run extract -- --build 17559` prints EXTRACT_PASS (packs=36 entries=5186
packEntries=5187 xur=363 png=676 xus=3857 xma=22 jpg=9 scb=7 other=252
audio=22), `xur2json --strict --registry 17559` is XUR_PASS 363/363 with all
twelve count-header fields recomputed on every file, `xur2xui --diff` is
XUIDIFF_PASS 363 identical against XUIHelper's V8 output, and every 6770 and
9199 result is unchanged (EXTRACT_PASS with the same counts, XUR_PASS
263/263 and 311/311, XUIDIFF_PASS 243 and 308, 83/83 tests where there were
73). The pipeline changes are: `tools/builds.ts` gains the build and each
build's twins, `packages/xur/src/parse8.ts` reads v8 behind the same
`parseXur`, `packages/xuiz` reads XUS version 2 and XUIZ names that start
with `..`, and `build-registry --build 17559` compares against XUIHelper's
17559 XML (`packages/xur/extensions/v8`, a second `build-registry-xml.ts v8`
output).

- **The archive's 17559 folder has three files and no devkit.** `Metro/V2/
  Retail/17559/` holds `dash.xex` (5,971,968 bytes, XEX2, retail-signed,
  LZX-compressed, NOT encrypted, bound to `\Device\Flash\dash.xex`),
  `dashbigger.xex` (15,880,192 bytes: the same image UNCOMPRESSED, bound to
  `\SEP\20449700\dash.xex`; the archive's `dashbigger.txt` says the loose
  15 MB files sat beside the 5 MB ones inside `su20076000`) and
  `shrdres.xzp`. `xex1tool` handles the late XEX2 unchanged: both XEXs
  decrypt to a 16,941,056-byte basefile with the same SHA-256
  (c7c5f9b5...), the same resource table and 36 byte-identical resources,
  so the SEP copy is the second witness the devkit was elsewhere
  (`fixtures/hashes.json`, role `reference`; there is no second
  `shrdres.xzp`). `git sparse-checkout` cannot add a bare file
  (`dashbigger.txt`): read it with `git show HEAD:<path>`.
- **36 resources, 35 XUIZ v3 packs.** v3 is the ASCII-name TOC the container
  code already knew; the tiling and `--probe` checks pass on all 36 packs
  (35 + shrdres). 5,187 TOC entries become 5,186 files (dashcomm lists
  `ico_64x_AddFriends.png` twice, identical). Kinds: 363 `.xur`, 676 png (+1
  duplicate), 9 jpg, 3,857 `.xus`, 22 `.xma`, 7 `.scb`, and 252 "other": 204
  `.lub` (Lua 5.1 bytecode, `\x1bLuaQ`, big-endian, 4-byte int/size_t, 8-byte
  number: the packs `luaxbox`, `dashlua`, `hubapp`, `contapp`, `soclua` are
  Lua applications, the Metro dashboard's hubs and the social channel), 8
  `.xml`, 20 `.uxfx` shaders, an XACT set (`dashcomm/dash.xgs`, `dash.xsb`,
  `dash.xwb` 286,720 bytes: the 44 `XuiSoundXACT` cues play from this wave
  bank and are NOT converted; the 22 loose `.xma` are), 12 `.bin` + 2
  `.MsLiveAvatarAsset` (`STRB` avatar assets in `friendsc`),
  `controlp/Wavatar.AvatarAnimation` + `.AvatarMetadata`, and
  `neon/modules.ox`. Against 9199: 22 packs are common; gone are accountm,
  firstrun, games, homepage, messenge, noobe, signin; new are SharedUI,
  contapp, contui, dashlua, epix, friendsc, hubapp, hubui, luaxbox,
  mediasit, oobe, signinpr, soclua, socxzp.
- **A TOC name can start with `..`.** `controlp` names thirty entries
  `..\handles\*` (nine `.xur`, six `.xma`, fifteen png) and `dash.xex`
  addresses them exactly so: `controlpack://../handles/VScrollHandle.xur`
  at .rdata 0x920fc4a0, `../handles/NuiButtonHandle.xur`, `BackHandle`,
  `NuiSwipeNavLeft/Right`. `entryPath` keeps the name (it is the runtime's
  key); `entryDiskPath` writes it as `controlp/__parent__/handles/...` so the
  dump cannot leave its directory, and `build-manifest` puts the TOC name
  back in `path` while `out` stays the served file. A traversal anywhere
  else in a name is still refused.
- **All 22 sounds are XMA1 at 44.1 kHz** (13 mono, 9 stereo: the page,
  channel, panel and transition cues), so every one is resampled to 48 kHz
  Opus with its channel count kept (`convert-audio` asserts source and output durations within
  5 ms; AUDIO_PASS 22).
- **XUS version 2 is UTF-8.** Byte 0x04 is 2 in all 3,857 tables; the value
  is a NUL-terminated UTF-8 string (23,686 of the 47,599 entries carry
  non-ASCII bytes, all strict UTF-8), a NAMED table's key is another such
  string, a KEYED key is still the u32 `(classIndex, propIndex, objectId)`,
  and every table parses to exactly EOF (`parseXus`). Kinds: 3,550 keyed
  (11,101 entries), 276 positional, 31 named. Of the keyed entries, 11,001
  in the 3,480 tables with a sibling scene resolve to a string property with
  the 17559 registry; 70 tables (100 entries) have no sibling scene and are
  unverified.
- **XUR v8, every layout fact from XUIHelper's V8 reader (its port source)
  or the 17559 binary, all cross-checked on the 363 scenes.** Header as v5
  (version 8, flags 0, tool 14 everywhere) then a count header that is
  ALWAYS present: twelve packed uints (a byte below 0xF0; 0xF0-0xFE plus a
  byte for 12 bits; 0xFF plus a u32). Sections tile the file in table order.
  STRN is `u32 charTotal, u16 count, NUL-terminated UTF-8`; charTotal is
  the sum of UTF-16 units + 1 per string, not bytes (`oobeControllerNoLanguage`
  1204 vs 1248 bytes, `ThermalPostScene` 875 vs 883). FLOT and COLR pool
  floats and ARGB colours the way VECT/QUAT already did; CUST is v5's.
  Objects: packed class-name index, u8 flags (1 inline properties, 8 SHARED
  properties = the packed index of an earlier object's list, 2 children, 4
  named frames + timelines); a property block is a packed count then ONE
  packed mask per class of the hierarchy, root first. 666 of the 7,158
  objects share a list. Named frames live in NAME and an object names a base
  index into it; the count header's namedFrames is the NAME record count,
  not the tree's references (LegendScene: 13 records, 52 references).
- **Compound lists are numbered in POST-order, and the index of a new one
  can only be checked after its body.** A Fill carrying a Gradient is
  written as index 2 with the Gradient inside it as index 1. A pre-order
  reservation fails 70 scenes; a post-order push with the check before the
  body fails the three Closed Caption pages (whose first Fill holds a
  Gradient); reading the body, then asserting the index equals the count,
  passes all 363. XUIHelper pushes after reading and never checks (it would
  hand a later reuse the wrong list if the order were otherwise). A
  compound's declared count is a VALUE count as in v5 (indexed lists per
  element, 40 scenes with two-stop gradients) and the count header's
  compoundProperties is the value count over the shared lists (XUIHelper's
  own formula is four high on every scene with a Gradient).
- **KEYD/KEYP, from the console's decoder, not from XUIHelper.** A KEYD
  record is a packed frame, a flag byte, an optional payload and a packed
  KEYP index; a keyframe's values are KEYP[index + track] read by the
  track's type (a pool index, or the integer/unsigned/bool itself).
  `dash.xex` decodes KEYD at .text 0x92203930 (reached from the section
  loader's magic switch at 0x92204224-0x92204318, KEYD case 0x9220427c): the
  frame must fit a u16, the flag byte's low SIX bits are a keyframe TYPE
  0..0xc (0x8030000d otherwise) and its top TWO bits a separate field, and a
  13-entry jump table at .rdata 0x92011030 gives the payload: type 2 has
  three inline bytes (EaseIn, EaseOut, EaseScale in v5's order), types 7,
  0xa, 0xb, 0xc have a packed VECT index (bounds-checked against the pool,
  stored as a pointer to the vector), the rest nothing. The 10,676 keyframes
  use types 0:3353 1:5397 2:80 3:731 4:183 5:16 6:4 8:4 a:904 b:4, top bits
  0:8870 1:1023 2:783; the 904 type-0xa vectors are (5,0,0) x626, (3,0,0),
  (4,0,0), (2,0,0), (7,0,0), (6,0,0), (25,0,0), (1,0,0), (8,0,0). XUIHelper
  reads 0xb as ONE byte (its four records carry 7, which a packed uint also
  spells in one byte, so its KEYD still tiles) and its "6 unreversed bits"
  are these two fields. The parser keeps the raw byte, the index and the
  vector on the keyframe (`flags8`, `extra8`, `curve8`).
- **What the types MEAN: the curve evaluator at .text 0x921e9788** takes
  (type, p1, p2, t), clamps nothing, and switches on the type through a
  second 13-entry table at .rdata 0x920108d0: 0 = t; 1 = handled by the
  caller as a step (0 until t >= 0.9999, .rdata 0x9201090c); 2 = the cubic
  Bezier 3(1-t)t((1-t)p1 + t p2) + t^3 (v5's Ease); 3 = t^2; 4 = t^3; 5 =
  t^4; 6 = t^5; 7 = pow(t, p1); 8 = 1 - sin((1-t) pi/2); 9 = 1 - sqrt(1 -
  t^2); 0xa = (e^(p1 t) - 1)/(e^p1 - 1) (the vector's x is the exponent:
  5, 3, 4...); 0xb = sin((2 pi p2 + pi/2) t) x that exponential (elastic;
  p1 within 1e-4 of 0 falls back to t); 0xc = a bounce built from pow, log
  and floor with p1, p2 clamped to > 1.0001. Its caller at 0x921e9aa8 clamps
  t to [0,1] and applies the TOP TWO BITS as the direction: 0 = f(t), 1 =
  1 - f(1 - t), 2 = f(2t)/2 below one half else 1 - f(2(1-t))/2, 3 unused
  (never set in the corpus). The runtime keyframe (0x18 bytes: +4 type, +8
  direction, +0xc p1, +0x10 p2) is built from the KEYD record by code not
  traced here, so which of type 2's three bytes becomes p1/p2 and where the
  third goes rests on v5's convention; the model's `interpolation` keeps
  XUIHelper's three-way reading (1 None, 2 Ease, else Linear) so the diff
  measures the rest, and a v8 runtime must read `flags8` instead.
- **XUIHelper on 17559 (`-g V8`): 363/363 convert; four defects normalised
  in the diff, each named in `tools/xur2xui.ts`.** (4) Its `17559.xhe`
  ignores XuiElement's Column/Row/ColorFactor/... tail, XuiControl's
  AutoId/QuickInput/UseNuiAsMouse, LoadType, WrapBump and TextScale: read,
  never written, so `toXui` takes an omit list (properties AND timeline
  tracks: gamercar/gamercard animates Hittable, slots/CarouselSlotScene
  Column). (5) Its XML gives XuiHtmlElement only TeletypeCount where the
  binary registers Text then TeletypeCount, so it prints the string index as
  a count on three scenes. (6) `XUKeyframe(XURKeyframe)` does `EaseScale *=`
  on a field that starts at 0, so every v8 EaseScale it writes is 0 (11
  scenes carry 50/60/85). And its quaternion writer formats the FLOAT under
  a custom format, which .NET rounds to seven significant digits first
  (0.03489949554 prints "0.034900", not "0.034899"); `f6single` reproduces
  that, `f6` stays the double path floats and vectors take.
- **The 17559 registry comes from its own binary and needs no XML tail.**
  `xui-propdefs` finds 71 tables and 395 "registrations" (70 name pairs are
  roman numerals, font paths and HTTP strings the base-chain filter drops)
  in `.data`-built tables like 9199's; the call-graph binding gives 313
  classes, 70 with property tables, and the corpus's 69 classes are all
  among them (54 with tables, 15 zero-property). XuiElement now REGISTERS
  27 properties (the GripTarget..CenterPivot tail XuiTool alone knew in
  6770/9199 is in the runtime, and the scenes set Column 444, Row 366,
  ColorFactor 260, CenterPivot 110 times), XuiControl 19 (UseNuiAsMouse,
  AutoId, HoverSelectTimer, QuickInput), XuiListItem 9, XuiScene 8, XuiText
  8 (TextScale), XuiImage 5 (LoadType), XuiList Wrap + WrapBump. v8 has no
  mask bytes to measure, so the XuiElement check is the highest bit any
  root object sets (2) against the registered count, and the strict sweep's
  "bit beyond the class" guard covers every object. Binary vs XUIHelper's
  17559 XML (binary wins): XuiEdit.TextLimit and XuiHtmlPresenter.
  DataAssociation unsigned; XuiShader's first property Id, not ShaderId;
  XuiSoundXACT = Cue, SoundBank, WaveBank, DopplerScale, AudioPosition (XML
  stops at three); XuiHtmlElement = Text, TeletypeCount; XuiHtmlControl =
  LineHeight, TeletypeCount; XuiFlowPanel (StretchToFit) is not in the XML;
  286 classes identical; 115 XML classes (Xam*, XuiDataBound*, the music and
  video scenes, HUD buttons...) are not registered by this dash.xex.
- **Fonts: Metro asks for Segoe.** `.rdata` 0x9201cd30 is
  `file://media:/SegoeXbox-Light.xtt` beside "Segoe Light", ConvectionUI and
  ConvectionUIFallback, and 30 scene elements set `Font` to "Segoe Light".
  That `.xtt` is not in the archive; the fonts step decodes the Convection
  pair from `reference/fonts/xtt` when present, which is the fallback face
  only.
- **Canvases** 1120x770 (152), 1280x720 (84), 320x320 (13), 720x480 (13),
  992x384 (10), 640x480 (6), 880x480 (5) and 33 other sizes; 1,329 timelines,
  maxFrame 1751; `ControlPackLegacyControl` in 151 scenes, `DashScene` 40,
  `ControlPackVuiBling` 23, `ControlPackAuraControl` 19, `XuiGridPanel` 86,
  `XuiSoundXACT` 44, `XuiVariable` 34, `XuiAvatar` 5.
- **Traps:** `zsh` hands an unquoted `$var` of newline-separated paths to a
  tool as ONE argument (the first unpack died with ENAMETOOLONG on a 35-line
  "file name"; use an array); a `&`-backgrounded job inside a
  background-run shell is killed with the shell (the first XUIHelper batch
  wrote an empty log and "finished" in a second); `pip` under the Homebrew
  Python is broken here, the Xcode `/usr/bin/python3 -m pip install --user
  capstone` works and Capstone's PPC mode reads the flat-mapped basefile
  (`skipdata` on, or it stops at the first VMX128 word); a scratch script
  named `dis.py` shadows the stdlib `dis` that Capstone imports.

## Metro 17559 shell (from reference/glue-metro/METRO_GLUE_SPEC.md, 2026-09-03)

- **Metro is a scene graph assembled from XML by C++ and driven by Lua, four
  layers deep.** `hubui/hubhomepage.xur` (1280x720; the same 1088x612 @
  (96,54) safe box as NXE) holds one `ControlPackHubScene` whose
  `TemplatePath` is `controlpack://HubSceneHomepage.xur` (title, the
  `XuiTwist` hub strip 937x84 @ (153,97), a `ControlPackHorizonControl`
  with `_PanelsContainer` 1280x400 @ (0,181), `ScenePadding 100`); the
  offline home is `epix/dashhome-offline.xml` (id `nuihub`, channels HOME ·
  social · GAMES · VIDEO (conditional) · APPS · SETTINGS, in that order);
  each channel names a layout template (`epix/TemplateOffline1HD.xur`:
  three 174x130 tiles at x=0 plus a 640x398 hero at x=178 in 818x398;
  `Template6HD.xur`: eight 197x197 in 4x2, 4 px gutters everywhere) whose
  children `"1".."n"` are empty XuiScenes the slots are mounted into; and
  every tile is `slots/LiveTileSlot.xur`, one object wearing the skin's
  `LiveTile` visual (#008a00 glass, 48 px icon, caption). The only Epix
  scene format left is `EsLiveTile` (table 0x92032510 → `slots.xzp` +
  `LiveTileSlot.xur` at 0x92330798); `slot://DiscInTray` is a built-in
  provider (0x92102e2c) loading `DvdTraySlotScene.xur`.
- **The Lua needs no VM.** 204 Lua 5.1 chunks (big-endian, debug info kept
  - a 150-line lister reads them). `hubapp` contains no channel names, no
  coordinates, no timeline or cue calls and no string lookups: it asks the
  native Epix root (`Xbox.PamDash.CreateDashRoot("Epix","")`) for
  ChannelCount/GetChannel/LayoutTemplate/GetUI and only sets the title,
  legend captions (B disabled on the boot app), aura attributes, focus and
  the mini gamercard. Reimplement the ~15 rules by hand; the provider
  contract is the data model. `dashlua` is pins/rules/EDS plumbing that
  draws nothing; `soclua` is the social channel; `contapp` the libraries.
- **Boot is hard-wired in code**: `dashuiskin#skin.xur` → `dashmain#
  DashLoading.xur` → `DashBkgnd.xur` (a `XuiPerspectiveScene`, the runtime
  root, sized by 0x9225e050 to 1280x720 on widescreen else 960x720) →
  `LaunchPamApp("BuiltIn.Hub.xzp", "Provider=Epix;IsBootApp=true;")`
  (strings 0x9200396c / 0x9200394c, built-in app table 0x9295b850) →
  `DashAppHost.xur` hosts the app → `UI#hubhomepage.xur` = `section://%X,
  hubui#hubhomepage.xur`. With no profile at all the boot app redirects to
  `SigninOnBoot` first; "no profile" on hardware means the sign-in page,
  then the home with an empty gamercard corner.
- **Animation is all in the scenes**: `HostScene` `TransTo` 90 frames (hub
  rises 90 px with an exponential ease-out, cue `control_kinect` at f1);
  tile `Focus` = scale 1.08 over 16 frames (KEYD type 3, direction 1) with
  `slot_roll_on`, `Press` dips to 1.0 with `snd_buttonselect`; the twist
  buttons cross-fade Segoe Light 24 pt text into bold; templates carry only
  `RangePeek` (dim to 0.4). Hub switching has NO named range: the horizon
  control computes it (unrecovered). Home-path KEYD types: 0, 1, 2, 3 (d0/1/2),
  4 (d1/2), 5, 0xa with exponents 1..8.
- **Sound**: 44 `XuiSoundXACT`s, all on `common://dash.xsb` / `dash.xwb`,
  cues only via timelines. `dash.xsb` = 51 simple cues over `dash.xwb` =
  36 unnamed XMA entries (bank `UI_sounds`); the cue→entry table is in the
  spec. Nine cues duplicate the loose `.xma`; `slot_roll_on`, `roll_on`,
  `control_kinect`, `btn_Inactive*` exist only in the bank.
- **Fonts**: registration is 0x922655d8: ConvectionUI (the `xam` per-language
  file) is the default, "Segoe Light" → `file://media:/SegoeXbox-Light.xtt`
  (absent from the archive) with fallback ConvectionUI; a face whose file
  fails to load is not registered, and the layout path retries with the
  default. Only 30 elements ask for Segoe (the unselected twist names, the
  32 pt titles, OOBE).
- **Settings survive as legacy**: all 57 `consoles/` pages are 880x480
  `LegacyControl` hosts; the Console Settings table grew to 11 rows at
  0x9201edb8 (Display sub-table 10 rows at 0x9294b950); `EcNavToSettings` →
  `consolesettings.xzp#SystemScene.xur`; `LegacyControl` places a page at
  x = 96 + (1088 − w)/2, y = 114.
- **No Metro footage in reference/ yet**; candidates with ids and formats
  are in the spec (§15). `tools/scb-decode.py` (6770 grammar) fails on all
  seven 17559 `videos/*.scb`.

## NXE 9199 shell, M4d: the fold is in the file, the channel change is not (2026-09-03)

Judge G's twelve findings closed (JUDGE.md). What the work taught:

- **A "variable" scene can be a choreography.** `controlp/Variables.xur` was
  read for its thirty constants and the four `SceneTransitions/*` names were
  filed as switches. The group that holds them is CALLED `SceneTransitions`
  (the spec's "no object of that name" was wrong), it carries nine named
  frames - `To` 1-75, `From` 76-150, `BackTo` 151-225, `BackFrom` 226-300,
  XuiScene's own four transition slots - and five timelines that animate the
  variables' `FloatVariable`. The strip's frame function reads them back
  through the same block it fetches the constants into (`[block+0x08]`
  TransitionScene -> the layer's opacity, `+0x10` TransitionChannel -> the
  queue's fold routine 0x9248b7a8, `+0x14` TransitionPanel -> the front
  panel's rotation, `+0x18` DefaultSpacing, ... `+0x58` PanelInputMaxVelocity,
  in the table's order). **When a code table names `A/B` and no `A` exists,
  look for a GROUP called `A` before calling it a fifth namespace.**
- **The fold geometry was inferred for three milestones and was one
  disassembly away the whole time.** The per-panel record's progress at
  +2016, the back-to-front gate on the NEXT record (+4036), the front-to-back
  gate on the PREVIOUS (-4), the `q x spacing` offset and the `min(1, 4q)`
  opacity are all in 0x9248d6dc-0x9248d988, and the rotate-about-a-hinge
  routine both the queue rows and the front panel go through is 0x92488480
  (`opacity x (1 - |theta| 2/pi)`, `SetRotation(quat(theta))`, `position + v -
  R v` with `v = (-128, 0, 0)` for `theta >= 0`). The two things that stopped
  the earlier reads were VMX opcodes the little disassembler printed as `op4`/
  `op6` (they are the quaternion and matrix helpers, and their MEANING is
  recoverable from what is stored around the call) and a float compare whose
  branch sense I first read backwards: `bc !lt` after `fcmpu theta, 0` goes to
  the `theta >= 0` case, which is the LEFT hinge - and the footage's sliver at
  design x 32..117 is where a left hinge puts it (13..122), not where a hinge
  behind the panel would (216..283). **Project the candidate geometry onto the
  frame before deciding which branch is which.**
- **`FoldSpeed`'s IntegerVariable is a divisor, not decoration.** The float is
  quoted for the integer's panel count: the rate is
  `FoldSpeed x (visible + 1) / 7` (0x9248d5c4-0x9248d61c reads the integer
  through the same getter family as the float, at +24 of the variable's
  data). `UnfoldEaseRange` unset reads as 0, so the unfold ease runs over the
  whole move (`dq/dt = 10 - 9.9 q`) and `UnfoldMinSpeed` DOES bind - M4b said
  it could not.
- **The channel change is the one motion the file does not choreograph, and
  the frames refuse the cascade.** Two frames into a change the second panel's
  ghost is still at its rest position [FRAME Yrt f07275], so nothing
  collapses; the whole strip fades together in three 30 fps frames, the new
  front fades in over five to six, the second panel starts as the front
  finishes. `FoldSpeed 30` would fade in two ticks and `min(1, 4q)` would show
  a panel in two; both are measured at two to three times that. So the swap is
  a MEASURED tween in ticks (`CHANNEL_SWAP`) and says so, beside the decoded
  cascade that A and B use. **When the file's mechanism and the frames
  disagree by 3x, keep both and label which is which; do not tune one into
  the other.**
- **A three-state fade needs three reference FRAMES, not a threshold on one
  number.** The first cut of this gate scored the strip by a region's mean or
  its standard deviation and had to guess which way "gone" pointed: the bare
  NXE floor is textured and its mean sits between the old art and the new, so
  both statistics turn back on themselves mid-change and the detector fired on
  frame 1. What works, on the capture and on our screenshots alike, is one
  statistic - the mean absolute luma difference of a region against another
  SAMPLE of the same shot - read against the rest frame, the bare-floor frame
  and the settled frame: distance from rest climbs and then plateaus (the old
  strip is gone at the start of that plateau), the bare floor is the sample
  furthest from the settled one, and distance from the floor is LINEAR in the
  fade's alpha, so half-way is half the distance. **And fix the origin before
  comparing: count from the last frame that has not moved yet, on both sides.**
  Ours starts from a rest screenshot, so a gate that started the footage on its
  first MOVED frame handed our animation a free frame - which is a third of the
  tolerance.
- **The queue's sign was settled by the caller, not the frames.** M4c read the
  layout routine's `b = SLOT[i]` for `progress >= 0` and assumed an Up was
  positive. The caller (0x9248c9cc-0x9248ca18) hands it `-frac(cursor)` while
  the cursor climbs and `1 - frac` while it falls, so a move to a higher index
  is NEGATIVE and every row lerps toward the slot BELOW it: the names scroll
  down. The frames agree [Yrt f07273-07282], but the code says why.
- **One audio onset per channel change, and the cue's length identifies it.**
  A pure-Python RMS envelope and a 24-band log spectrum are enough: the click
  matches `snd_channelup/down` at 0.97; the tail after the select on A is
  0.45 s long, which is `snd_panelfold`'s 0.54 s and not
  `snd_transitioninto`'s 2.6 s, even though the spectra are within 0.06 of
  each other. **Duration separates cues that spectra do not.** The Yrt change
  also carries a second onset 26 dB down at +0.34 s matching
  panelfold/unfold at 0.99 - a mix level the archive has no record of, so it
  is recorded and not played.
- **`[FRAME Kpa f05604]` and friends are the judge's 30 fps cut numbers**, not
  the 2 fps stills: `f = 5490 + (t - 183) x 30` for Kparblu6r14 (and
  `660 + (t - 22) x 30` for its second window), `f = 6660 + (t - 222) x 30`
  for YrtwSj1f6aY. The cuts are regenerated with `ffmpeg -ss <t> -t <d> -vf
  fps=30` into `reference/frames/<capture>-30fps/f%05d.png` under the same
  numbering, so a citation in JUDGE.md, PLACEHOLDERS.md and the smoke suite is
  one file. **A frame citation is only worth something if the frame can be
  opened.**
- **A build-time cull is a cull on frame zero.** Slot 7 of My Xbox sits at
  7 x 505 = 3535 > 3225 at rest and was never given a rig, so "8 of 8" was an
  empty front slot. The reach is measured from the cursor on EVERY frame now
  and rigs mount and unmount as slots cross it; every slot scene is preloaded
  so a mount is synchronous and lands on the tick the rule asks for it.
- **A metapane is two owner slots and a range.** `MetaPanelScene` draws
  DataAssociation 0 (the description) and 4 (the Current Setting) and plays
  `metaScene_1line`'s `NToM` range for the move; 9199's Console Settings table
  carries the description index beside the label (325 for Display, 327 for
  Auto-Play [FRAME Kpa f0381]), and a nav-button page's descriptions are its
  DashScene `PanelStrings` - the Blades mechanism, unchanged.
- **Hidden means Show=false, not "left out of a list".** `navIPTVSettings` was
  dropped from `legacy.rows` and still painted its `<servicename>` token;
  the gate is now on PAINTED text in the DOM, which is the only thing a frame
  can see.

## Blades M3e: the settings pages select (2026-09-03)

Every option page under Console Settings and Family Settings now does what
its class does on A (settingsModel.ts), the 6717 stills pin the reference
console's whole state, and the empty pages of the offline tree each carry
their reason. What the work taught:

- **A scene class's handlers are one vtable slot away.** Every dash scene
  class is registered through `XuiRegisterClass` (0x92147948) with a
  descriptor whose +0x14 is the ctor; the ctor stores a two-slot vtable
  `[dtor, dispatcher]`, and the dispatcher is a switch on `pMsg->dwMessage`
  at +4: `0x13` init, `0x0e` notify (sub-id at pNotify+0: 1 press, 2 focus, 4
  selection change), `0x1a` the list's selection message, `0x27` the timer.
  Shared dispatchers (`dashClockSettings_*`, `dashAudioSettings_*`,
  `dashVideoSettings_*`) call further slots instead of branching. A script
  over the registrations (scratchpad `classmap.py`) maps every class to its
  init and press in one pass; reading twenty pages by hand would have taken
  the day.
- **`ppc-refs.txt`'s .text addresses are 0x200 high**, like `ppc-dis`'s
  (LEARNINGS "flat-mapped"): a reference printed at 0x921c944c is at
  0x921c924c. Every code site in `settingsModel.ts` was re-read at the flat
  address; the first hour went to a "labCurrentSettings" that landed on a
  `li r3, 3`.
- **The press handler ends in `XuiSceneNavigateBack`.** `0x921b5428(scene,
  0xfd)` resolves the parent scene and calls 0x921536d8 with index 0xfd - the
  same 253 `NavigateToScenePath` pushes with. So an option page POPS on A,
  before any footage said so, and the parent's label is refreshed by the
  `XN_FOCUS` it gets when focus returns. **The cue evidence follows:**
  `btn_Select` plays (the row's Press), `btn_Back` does not (no
  `XuiBackButton` was pressed), and the shell's `back(programmatic)` keeps
  that distinction.
- **The arrival row is the current value's, from the init, not from a
  frame.** Every init does `SetFocus` (0x9214cbc0) on the button that carries
  the read value or `XuiListSetCurSel` (0x92251760) on its row; the 8498
  frames (f2170: Background Downloads arriving on "Disable") only confirmed
  it. When the read fails the init skips both, which is exactly the path a
  value nobody can know should take: DefaultFocus and a blank label, not a
  guess.
- **The reference console's state was in the stills all along.** The 6717
  capture walks every Console Settings row at 2 fps (f0053-f0066) with its
  "Current Setting" beside it - Dolby Digital, English, GMT+00 London,
  24-hour ("12:00" with no AM/PM), United Kingdom, Xbox Dashboard, Auto-Off
  Disabled, Background Downloads Enabled, Screen Saver Enabled, All Channels.
  Judge E's three cited rows were the three someone had looked at. **Before
  declaring a value unknowable, tile the whole capture** (`ffmpeg tile=5x6`
  at 384 px is one image to read).
- **The user-options word is one XConfig setting, one bit per page.**
  XCONFIG_USER 0x0c: 0x2 DST off, 0x8 24-hour, 0x80 / 0x800 / 0x20000 the
  three start-ups, 0x100 sound effects OFF, 0x10000 background downloads; the
  accessor pair 0x921c7ef8 / 0x921c7e90 reads and writes one bit through the
  xam read-modify-write import at 0x92739ccc. Screen saver and auto-off are
  XCONFIG_CONSOLE 1 and 2 (0x1000 = off; 0 = off, 0x168 = six hours).
- **A timeline can clear a Nav property.** `dashCDate`'s field-order frames
  write `lstYear.NavRight = ""` (the year is last in the UK's d/m/y order),
  so the runtime override was the empty string - and an empty override read
  as "chain ends" stranded focus in the year spinner. The rule that makes the
  Date and Time page work is XUI's own: **a control with no neighbour takes
  its parent's** (`scDate.NavRight = scTime`), and an empty override is "no
  neighbour", not "stop". The IPTV chain repair still ends the chain because
  the System scene has no NavDown to inherit.
- **`DefaultFocus` can name a scene, and a Nav target can be a child path.**
  `network/ConnStatus.xur` says `DefaultFocus="scene_main"`;
  `MediaSourceSelection.xur` says `NavRight="metaPanelScene\NoComputersScene"`.
  Focus descends: the scene's own DefaultFocus, else its first list with rows,
  else its chain head. The console's `CConnStatus` hands `scene_main` to
  0x92153150 right after binding it.
- **An empty `XuiList` still owns its visual.** A code-driven list with no
  rows and no `ListView` painted the skin's `control_ListItem` TEMPLATE as a
  blank row (DeviceSelector's one "item" in the coverage drive). Consuming the
  visual with an empty `ListView` is what an empty list looks like on the
  console: nothing.
- **The double `btn_Focus` of the audit did not survive a fresh mount.** One
  Down on Console Settings or Display fires one cue and a list item owns one
  scope; the doubled cue is what a second shell from a long-lived dev server
  produces (the HMR leak `__dash.hmr` exists for), so the gate asserts one
  and the audit's number is recorded, not explained away.
- **The message boxes are xam's.** 0x92114a98 (Initial Setup), 0x921a63f0
  (Background Downloads' Enable) and 0x92114898 (the display and Family
  Settings prompts) wrap `XShowMessageBoxUI`; no scene path is involved. A
  press behind one takes the code's own no-answer branch here and the box is
  recorded with its strings. Building a box to get past it would be
  inventing chrome.

## NXE 9199 shell, M4e: the pages behind the home page (2026-09-03)

- **"Materialised in code" was a jump table.** M4d swept for a pointer to the
  `SystemScene.xur` literal, found none, and bound one command by inference.
  The dispatcher does `rlwinm r0, r5, 1; lhzx r0, table, r0; add; mtctr;
  bctr` - a u16 offset table at `.rdata` 0x92028ad0 indexed by the command
  id, base 0x922d312c - and each case materialises its pack and file with
  `lis/addi` right before one shared call (0x922c5780). Five commands bind a
  scene that way. **When a sweep for a data pointer finds nothing, look for
  a `bcctr` with a `lhzx`/`lwzx` off `.rdata` above it; a switch over ids is
  a table of code, not of data.** The 0x200: `tools/ppc-dis.ts` prints .text
  addresses 0x200 above the true VA, and the jump table holds TRUE VAs, so
  the two disagree by exactly that before they agree.
- **The image's wide literals are UTF-16BE.** A search for `'S\0y\0s'` (LE)
  hits one byte past the real start; a search for `'\0S\0y\0s'` lands on it.
  Every "odd address" in a first pass is this.
- **A name filter is not a focus rule.** `Id.startsWith('nav')` was true of
  the one page M4d walked and false of the next fifty. XUI's own rule -
  DefaultFocus, then the NavUp/NavDown chain, over controls that are shown and
  enabled - needs no names at all, and the parked legend carriers are told
  apart by their VISUAL (`legend_A..Y`), which is also how the console finds
  them. A `DefaultFocus` can name a nested scene's control
  (`2004_NetworkDetails`'s Tab1 names `btn_IP`) or a list; take the first one
  down the visible tree.
- **"Every basename is unique" was a 6770 fact.** 9199 carries
  `dashSysCslSetCountry.xur` in `consoles/` and `network/`; a global basename
  index refuses it and the Locale page could never open. The pressing page's
  own pack first, the index second, a bare collision refused.
- **A pushed root is the home page's mechanism one level down**, not a new
  one: an empty 1280x720 host, a `PanelLayer` of `PanelScene` rigs on the
  Rome or Moby constants, the overlay's `Description` as the counter, and the
  same `SceneTransitions` group played `To`/`BackFrom`. The footage shows the
  Sign In title where `Queue\Current` sits at the queue's own 33 px cap
  height [FRAME Yrt f0268], so a MobyRootScene with one channel is what a
  "Sign In page" IS, and the strip's front panel lands within 1.2 px of the
  frame with no number of its own.
- **`Show=false` on a parked legend carrier means "not hoisted".** The Rome
  channel page on the themed capture draws "(A) Select" and no B entry with
  `romechan.xur`'s Show=false `legend_b` "Back" [FRAME Kpa f0450]; the
  sign-in root's Show=false "Continue" never shows either. And a `Label_Head`
  INSIDE its scene with Show=false is not a title - only a PARKED one is
  hoisted (the Game Library shows none [FRAME Kpa f0300]).
- **A skin cue's `tick` in the audio log is its keyframe frame, not the
  engine's.** `btn_Focus@6` is frame 6 of the Focus range; a harness that
  slices the (200-entry, shifting) log by index or by engine tick reads
  nothing after the two-hundredth cue. Wrap the bank's `play` in a sequence.
- **A wrapping list never refuses a Down.** `XuiList.Wrap=true` on the Display
  and Remote Control lists turns a "walk until refused" into a loop; stop when
  the focus id comes round.
- **The hosted page's cues are the skin's, not the strip's.** A LegacyControl
  page is Blades' machinery, and Blades' rule is that the row's Press range
  and `legend_b`'s carry the cue. M4d played the strip glue's table cues on
  those presses and the skin's `btn_Select` / `btn_Back` were silent on every
  page.
- **A "timing residual" is usually a detector, and the two images have to be
  asked the same question.** Three of Judge G's five residuals were re-opened
  with a measurement and two of them dissolved. The pattern each time was a
  detector whose threshold means different things on the two images:
  - The Sign In counter "did not sit where the frame's does". A brightness
    threshold marks the frame's **lit Aura floor** under the profile panel -
    the whole band saturates - and marks **our glyphs** against our darker
    floor. The two pictures were being read by opposite rules. Taking each
    row's MEDIAN as its background, whatever the background is, put the two
    tops 0.3 px apart.
  - The name scroll "settles in ~0.17 s where ours takes 0.30". 0.17 s is
    where the motion is largest; the same detector on both says 0.300 s and
    0.267 s. Three landmarks on the same axis in the same block were already
    agreeing to a frame - **when one number on an axis disagrees and its
    neighbours agree, suspect the number.**
  - `events().onset` fires at a tenth of each series' OWN span, so two ramps
    of different shape are compared by different absolute amounts: the
    console's legend drops 5 luma in one sample where ours takes four, and the
    detector read them three samples apart although both start on the same
    one. A departure test with an absolute floor reads both at the sample
    they share.
  And a region has to exclude what you are not measuring: `pressLegend` blooms
  the A glyph over its own 20-frame range, a bigger swing than the caption
  leaving, so the legend band had to start after the glyph before it could
  measure the legend at all.
- **`TransitionSubElements` is a plateau, and the plateau's edges are the two
  frames.** Its whole keyframe list is
  `0:1 1:0 55:0 75:1 | 76:1 95:0 150:0 | 151:0 205:0 225:1 | 226:1 250:0 300:0`
  [SCENE controlp/Variables.xur]: every range ramps the variable to zero, HOLDS
  it there, and ramps back. The sub-elements are absent exactly while it is
  zero, so "when does the legend go" and "when does it come back" are one
  question with two answers - the near edge (`From` 95) and the far edge
  (`BackTo` 205). M4d had derived 205 and then played the Hide on the press,
  0.27 s early, because it read the two ends as two rules. **When a constant
  for one direction comes out of a variable's shape, read the other direction
  out of the same shape before assuming the press.**
- **Owed work that moves nothing is still busy.** The page walker failed 28
  gates on a cold vite and none on a warm one. Every one of the fold
  timeline's deferred acts - the page at `PAGE_PUSH_FRAME`, the cascade at
  `UNFOLD_BEHIND_FRAME`, the legend at `LEGEND_HIDE_FRAME` / `LEGEND_SHOW_FRAME`
  - waits on a frame count and moves no cursor, no transition and no fold
  phase, so a settle loop watching those stopped between the press and the
  page, and every later act read a shell that was neither at home nor on a
  page. **A shell that defers work has to DISCLOSE the deferral**, or the only
  thing gating it is how fast the machine happened to be.

## Blades M3f: what a shared Id costs, and what a row is as wide as (2026-09-03)

Judge E round 3's seven findings, closed. Four of them were one class of
mistake - a rule read off ONE example - and the other three were the console's
own code saying "hide this" where we had drawn the file as authored.

- **A scope id that is a path of Ids is not unique, and everything hangs off
  it.** `pathOf` walks the chain of element Ids up to the root, and the
  renderer's `NodeIndex.scope` uses it as the id of every timeline scope. Four
  of this build's clock pages carry the root Id `scClockSettings` and the two
  pass-code pages carry `scRating`, so mounting one over the other under the
  same host gave the SECOND page the FIRST page's ids: its `bindTimelines`
  silently replaced the parent's scopes in the engine, and popping it removed
  them. The symptom looked like a transition bug - the page underneath came
  back at FadeOut's `Show=false` with no FadeIn to undo it - and keying the
  TRANSITION by node path fixed only the last step of it. **Give every mounted
  scene root a mount key** (`NodeRecord.pathKey`: root Id, file, serial) so an
  id can only ever belong to one mount, then key the transition by the path.
  The tell that the fix landed: the engine went from 5 scopes under the clock
  page to 11 - its four legends had been the child's all along.
- **"The pressed control's parent" is not where a page goes.** The console's
  `NavigateToScenePath` pushes into the pressed control's parent, which on the
  System blade IS the tab scene at the canvas origin and on Games and Media is
  the panel scene's container at (221,151) / (258,151). Every second-level
  scene in the build declares the full 1120x770 canvas, so a page hosted
  beside the panel drew its whole self offset by the container - a bug that
  the System blade, where the two hosts coincide, cannot show. **When a rule
  is read off one example, find the example where the two candidate readings
  differ before shipping it.**
- **Measure a DOM layout in the AUTHORED frame, not on screen.** The offset
  was invisible in screen pixels (everything is scaled by the view transform
  and the header still looked plausible), and obvious the moment the element's
  offset chain up to the 1120x770 `.xui-canvas` was printed: (156,96) is the
  .xur's own number, and (414,247) is the container's plus it.
- **A list row is as wide as its TEMPLATE anchors it, not as wide as the
  list.** `XuiList`'s `control_ListItem` is 420 wide, LEFT|RIGHT, inside a
  420-wide visual, so on a 423-wide list it is 423 - which is what taking the
  list's width outright happens to give, on every ordinary list in the build.
  `List_VerticalSpin`'s row is 83 wide inside a 53-wide visual: on the 75-wide
  year spinner the row is 83 + 22 = 105, and taking 75 ellipsized "2025" to
  "2...". The anchor rule the renderer already runs for every other element is
  the rule; the row was the one element exempt from it. **A layout constant
  that agrees with the data on 84 of 86 cases is not a rule, it is a
  coincidence with two counterexamples** - so survey the whole corpus for
  which cases a layout change moves before claiming it is inert.
- **Bind a pad key by the property, not by the name.** B pressed a control
  literally called `legend_b`, so the four pages that call their back button
  `navB` or `btnB` played no press and no `btn_Back`. `XuiNavButton.PressKey`
  is the binding (B 0x5841, X 0x5802, Y 0x5803) and the name is decoration.
  The survey that came with the fix is the other half of it: **176 scenes carry
  a B carrier and 87 do not** - and of the 187 scenes that declare the full
  1120x770 canvas, **16** have none - so "every pop plays `btn_Back`" is the
  WRONG gate, and "plays it exactly when the page binds 0x5841" is the right
  one. A page that offers no B still navigates back, because that is the scene
  manager's job, not the button's.
  ~~"176 carry and ten do not, all of them authoring four Enabled=false
  XuiLabel legends"~~ was wrong in both halves and is corrected in the M3g
  section below: the count is 87, only `oobe/oobeProfileCreation` has the
  XuiLabel legends, and the carrier goes by five different names in two
  different classes.
- **Hiding is code, and it is usually the FIRST thing the handler does.**
  Three findings were one shape: `dashCTime`'s init hides `lstAMPM` in the
  24-hour branch, `UpdateCurrentSetting` hides `SwitchImage` before it decides
  anything, and `MediaSourceSelection` rests with its "Please wait" pair down.
  Each scene authors the thing SHOWN, because the authoring tool wants it
  visible, and the class hides it on entry. **Read the init's first ten
  instructions of every page: a `SetShow(x, 0)` there is a fact about the
  screen, and drawing the file as authored is drawing a state the console
  never presents.**
- **`findById` hides ONE of them.** The same scene authored `labelPleaseWaitText`
  twice - once inside a sub-scene that was already hidden, once on the page -
  and the first-match helper hid the invisible one. Where a hide is a
  correction, hide every copy under the level (`findAllById`) or address it by
  path.
- **Calibrate a "is it blank" detector against the failure state, produced on
  purpose.** Gating the pop needed one number that separates a painted page
  from a blank one on both a console capture (light text on a dark plate) and
  ours (dark text on a light one). Band counting failed: it measured whichever
  polarity the plate had. The share of pixels standing off their own row's
  median is polarity-free and blind to which row is highlighted, and the gate
  can state its own floor because the suite HIDES the page's root for one
  screenshot and measures 0.00 there. An NCC against the pre-push frame was
  the tempting version and is wrong: in a window the size of a row block, the
  focus highlight moving one row down drops it to 0.3.

## Blades M3g: what a push HIDES, and which axis a list windows on (2026-09-03)

Judge E round 4's four findings. Three of them were one shape: **a rule read off
the wrong half of the data.**

- **A forward navigation HIDES the scene it came from, and the scene it came
  from is the one that authors the transition properties.** `0x921534e8` is
  `XuiSceneNavigateForward(HXUIOBJ hCur, BOOL bStayVisible, HXUIOBJ hFwd, BYTE
  UserIndex)` — r6 is masked to a byte and tested against `< 4 / 0xff / 0xfe /
  0xfd`, which is the UserIndex check, and the tail at
  0x9215369c-0x921536b8 is the whole rule: `cmpwi cr6, r27, 0` on bStayVisible,
  `li r4, 1` when it is false, `bl 0x921531a8` on the OUTGOING scene. **No
  control in build 6770 authors `StayVisible` at all**, so every push hides its
  source. M3f had already got the page's HOST right (`TabN`, the canvas origin)
  and that is exactly what made the bug visible: with the page's header landing
  on the blade's instead of 258 px away, the arcade home read
  "GamesGaLibrrary". The offset was masking a missing hide.
- **The scene the console navigates from is not the scene the control lives
  in.** Level 0 of a blade is a panel parented into `TabN/scBlade/scContainer`,
  so "hide the level you push from" hid the panel and left the blade's header
  and its four legends painting through the page. The build says which scene is
  the participant, in the scene data and not in the code: the five blade scenes
  author transition properties — `Tab1/scMarketplace` and `Tab6/scOOBE` all
  four, `Tab2/scBlade`, `Tab3/scBlade`, `Tab4/scBlade` and `Tab5/System`
  `TransBackTo=FadeIn` — and **the panel scenes author none at all**. A
  `TransBackTo` is the visual a scene plays when a page pops back TO it, which
  it can only need if it went away. The System blade looked correct all along
  for the boring reason that `Tab5/System` IS its level-0 node.
  **Lesson: when a rule needs "which object", look for the object that AUTHORS
  the property the rule is about, not the one the input happened to arrive at.**
- **A list windows on the axis its template's scroll ends point along.**
  `XUI_SCROLLEND_DIRECTION` is UP 0, DOWN 1, LEFT 2, RIGHT 3 [xui.h 1874-1880].
  `XuiList` authors control_ScrollUp / control_ScrollDown and stacks rows down;
  `XuiListChooser` and `btn_horizontal_spinner` author ScrollLeft / ScrollRight
  and lay theirs along x — one value between two arrows, which is what a chooser
  is. `visibleCount` was `floor(height / pitch)` for everything, so
  `dashSysLiveVision`'s three 480x74 choosers with a 33-tall row template drew
  TWO values stacked. The fix is the same arithmetic on the other axis:
  `floor((480 − 30.5) / 419) = 1`. Four lists in each build name a horizontal
  template and no other does, so the blast radius was surveyable before the
  edit — and the other one, the Family Timer's spinner, already answered 1.
  Two hard-coded XuiList numbers fell out with it: a scroll end's anchor delta
  was `rect − 420x74` (it is the list against its OWN template visual) and the
  arrows were driven by the literal ids `control_ScrollUp` / `control_ScrollDown`
  (they are `ScrollLeft` / `ScrollRight` on a chooser).
- **A page authored as a copy of another page keeps the other page's words, and
  a token gate cannot see prose.** `dashSysCslSetPolicyInfo_System.xur` is a
  copy of the factory-reset screen: `ClassOverride="dashSystemReset"`, and its
  `XuiEdit edInfo` still carries "Do you want to reset your console?…". The
  console's init at 0x921c8568 overwrote it every time. The existing gate
  looked for `<angle-bracket>` tokens, and this was ENGLISH, so it walked
  through 447 screens undetected. **The gate that catches this class is a
  registry of "authored text the code replaces", checked against the scene file
  by a unit test so a typo cannot pass it, and swept over every reachable page.**
  A sweep of every authored `Text` of 40+ characters over all 263 scenes (**127**;
  34 on the 50 reachable pages) found exactly one such control, which is why the
  registry can be a list and not a heuristic. The count was first written as 126
  and is 127: `arcade/250x_EZPassScene` carries TWO controls called `lblInfo`,
  and a survey that keys by id instead of by control loses one of them
  [Judge E round 5, low finding 1].
- **The branch a code path takes is part of the reading.** The finding said the
  page formats `dashCSettingsStrings[546]`. It formats one of TWO, and the test
  at 0x921c86f4 is the IPTV-provider predicate — the same `0x9226e7d8()` that
  hides `navIPTVSettings`. The reference console has no provider, so the string
  is **545**, four fields instead of six. Reading the `bne` as well as the
  `swprintf` was the difference between the right screen and a plausible one.
- **An unset property is the class default, and the default can be the whole
  answer.** Four network scenes author an ENABLED `XuiBackButton legend_b`
  reading "Back" with no `PressKey`, which looked like a hole in "B is the
  control that binds 0x5841". It is not: **`XuiButton.PressKey` defaults to
  22592 = 0x5840 = `VK_PAD_A_OR_START`** [reference/xzp-tool/XuiElements.xml:69]
  and `XuiBackButton` derives from `XuiButton` without adding one, so those
  controls bind **A**. The corroboration is in the corpus: no `legend_a`
  anywhere authors a PressKey while every `legend_x` / `legend_y` authors
  22530 / 22531 — A needs no binding. Two controls on A and none on B is an
  authoring slip in the build, disclosed rather than repaired.
- **Re-run a survey before you quote it.** Round 3's "176 carry a B carrier and
  ten do not, under three names" was wrong in both halves: **176 / 87**, with
  16 of the 187 full-canvas scenes carrier-less, under **five** names
  (`legend_b` 107, `btnB` 54, `navB` 8, `legend_B` 4, `backButton` 3) and in
  **two classes** (172 `XuiBackButton`, 4 plain `XuiButton`). The count now
  lives in a corpus unit test, not in prose, so it cannot drift again.
- **An "all at the origin" sweep needs to say WHICH box is at the origin.**
  Walking all 40 System-blade pages instead of 12 turned up ten that author a
  scene `Position` of their own inside their canvas (−1,−1 / −2,−1 / −2,−3 /
  0,−1 / −2,0 / −1,1). The MOUNT is at (0,0) 1120x770 on all forty; the scene
  inside it is where the file puts it. A gate written against the scene root
  would have failed on a correct render.

## Phones and tablets (2026-09-03)

Making the launcher and both dashboards work on a handheld found four things
that only a small screen or a finger can find.

- **A `flex` item does not keep its width.** `.xui-stage` is 1280 px wide
  inside `.xui-viewport`, which is a centring flex row, so on any window
  NARROWER than the output the stage was flex-SHRUNK to the window and then
  scaled again by `Viewport.layout()`: at 852x393 it drew 465x393 where
  699x393 was right, and the left and right of the console's picture were
  simply cut off. `flex: none` is the fix. Every desktop window anyone had
  opened was wider than 1280 and never shrank, which is why it took a phone to
  find it; the gate is now the stage's own aspect (drawn box against
  `stage.style.width/height`), not its position.
- **`elementFromPoint` (singular) cannot hit-test scene data.** A XUI group's
  box is its authored rectangle whether it paints anything there or not, so the
  Blades metapane's `highlight1` lies transparently over the whole nav list and
  swallows every hit: a tap plainly on `navNetwork` returned `metaPanelScene`.
  `elementsFromPoint` (plural) returns the whole stack and the row is in it.
  Filter that stack to XuiControls, or a tap on the background walks the focus
  two dozen rows down a list.
- **A two-finger tap is two starts, and each finger needs its own origin.**
  Measuring the SECOND finger's release against the FIRST finger's start reads
  40 px of travel and throws the gesture away as a drag. Chrome's touch
  emulation also defaults `maxTouchPoints` to 1, so a second finger cannot even
  be dispatched until a suite sends
  `Emulation.setTouchEmulationEnabled {maxTouchPoints: 5}` - the gesture looks
  broken when only the harness is.
- **Never count out a fixed number of presses for a cursor.** Both shells
  REFUSE input while a transition is running, so a tap that computed "five
  Rights" from the current panel cursor landed one panel short. Re-read the
  cursor after every press and stop when it did not move; that also stops the
  walk at the end of a range.
- **Tile memory is billed at the RASTER scale, not the device ratio.**
  `smoke-boot`'s `area x 4 x dpr^2` is right on its 2000x1196 window because
  the stage there is near 1:1. On a phone the console's 1280x720 output is
  drawn through a 0.55 fit and Chrome rasters a layer at its screen scale, so
  dpr alone bills the GPU for pixels it never allocates: NXE at 852x393@3x
  reads 397 MB that way against 118 MB at the raster scale. `smoke-mobile`
  prints both and holds the budget against the second. The layer COUNT is scale
  free and is held against smoke-boot's 24 either way.

## Blades M3h: an anchored rule is a blind spot in the gate as well as the fix (2026-09-03)

- **When the fix and the detector share a rule, the gate proves nothing.** The
  authoring-token clear tested `/^\s*<[^<>\r\n]{1,40}>\s*$/` - a caption that is
  NOTHING BUT one token. The walk's token detector and the smoke gate carried
  the same anchor, so a page painting `<#> of <Total #>` read as a clean page
  and round 4 could truthfully report "0 painted tokens on 447 screens" while
  two reachable pages had one on screen. The corpus decides the shape, not the
  common case: **211** controls in 6770 carry a token and **192** are wholly one,
  so nineteen slipped through a rule fitted to the 192. **Write the rule from a
  sweep of the whole corpus, and write the gate from the rule's OPPOSITE -
  search where the fix matches.**
- **Widening a text rule is safe only when you have swept for what it would
  swallow.** Every one of the 211 authored `Text`s in the build that contains a
  `<` IS a token: no HTML body, no prose with an angle bracket, in any of 263
  scenes. That sweep is what makes "contains a token anywhere" defensible; the
  same widening on a corpus with one `<font>` in it would eat a sentence.
- **The console replaced captions, it never patched them.** Every writer traced
  for the nineteen either `SetText`s the WHOLE control (0x92158f40) or hides it.
  That is why the predicate is "carries a token anywhere", not "is a token": the
  authored text around the token was never on screen either.
- **"The code never writes it" is a finding you can prove by ABSENCE, and the
  proof is a scan, not a read.** `memory/DeviceSelector` binds `labTotal` into
  its controls block at +0x10 and hides it at init (0x9225ad08). To claim it
  never comes back up, scan every `lwz`/`stw` at that offset across the pack's
  whole address range - one instruction, one grep - instead of reading the class
  hoping to have seen every path. The absence is the answer.
- **A member offset identifies a class better than a name.** Two "n of N"
  writers in the memory pack look identical in source; they differ only in
  `this+20` vs `this+24`. Matching the offset back to the bind function
  (`addi r5, r31, N` beside the `L"id"` literal) is what says WHICH scene each
  belongs to - and that neither of them is the scene the finding was about.
- **A stacking gate must key on the CONTROL's authored box, not on its ink.**
  `2504`'s MUA and MUB indicators are authored at the same design point and
  their glyphs land a pixel apart, so a gate keyed on painted ink walks past
  them. Keyed on the control's own box, the same sweep over 50 pages finds them
  and finds one other pair, which is the console's own.
- **A stalled headless page fails ninety times and says one thing.** Two
  headless Chromes on one machine starve each other, and a page that stops being
  scheduled freezes the shell on one snapshot; every assertion after that point
  compares against the same frozen numbers. Ask the ENGINE whether it ran -
  `frames` before and after the frames you stepped - wait for the clock to come
  back before believing it did not, and when it really is dead report it ONCE
  and suppress the dependent checks with a count. The suppression must be scoped
  to the section and off by default, or it is a way to hide real failures.
- **Do not edit a source file while a suite is running against your own vite.**
  The dev route's teardown does `delete window.__dashApi` (app/main.ts), and an
  HMR update fires it: a save landed mid-run and `smoke-nxe`'s completeness
  walker threw `Cannot read properties of undefined (reading 'nxe')` from an
  `evaluate` that had nothing to do with the edit. It looks exactly like a
  regression in the section it lands in. Finish the run, then edit.
