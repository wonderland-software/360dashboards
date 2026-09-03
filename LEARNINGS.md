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
