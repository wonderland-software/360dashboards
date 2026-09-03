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
