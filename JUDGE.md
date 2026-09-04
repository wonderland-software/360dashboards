# JUDGE

Independent fidelity reviews, one per phase. The judge is a separate agent
briefed as an Xbox 360 dashboard engineer, never the implementer. FAIL blocks
the phase; the loop is fix, re-judge, until PASS. Findings are numbered and
each is closed with what changed.

## Phase A, extraction — Judge A

- **2026-09-02, round 1: FAIL.** Bytes certified (3,820/3,820 unpacked
  entries hash-match their pack ranges, 29/29 resources exact, 3,234 string
  tables parse to EOF, 16/16 audio durations exact, devkit twin 6719 has
  byte-identical resources). Findings: (1) `fetch-archive.ts` and
  `build-xex1tool.sh` promised by README did not exist; (2) `unpack-xuiz.ts`
  dropped its first argument without `--out` and still printed PASS; (3) the
  `--probe` check could not fail; (4) a partial dump passed because no step
  asserted counts; (5) the docs said locale directories hold only keyed
  tables (231 positional and 11 named tables live there too); (6) one XMA
  resampled 44.1→48 kHz undocumented; (7) audio manifest entries hash the
  source, undocumented; (8) "zero misses" was a subset statistic.
- **Round 2 @ ccd4e51: PASS.** All eight closed and re-verified (the probe
  was proven live with a synthetic pack carrying a hidden PNG). Residuals
  fixed after the verdict: the stale kind-2 wording in LEARNINGS, and a
  non-XUIZ input now reports NOT_XUIZ instead of a stack trace.

## Phase B, parser and registry — Judge B

- **2026-09-02, round 1: FAIL** (decoder could not be broken; registry and
  claims could). Findings: XuiElement short of XuiTool's definition count
  (every object writes four mask bytes); XuiEffect/XuiTransition table
  swapped; five non-class registrations; XuiFall07BOTDScene undersized;
  compound packed byte ignored; XUIHelper diff blind to high bytes; broken
  `xur2json <file>`; dead `transparent` code; overstated LEARNINGS claims.
- **Round 2 @ ccd4e51: PASS.** All fourteen closed; the mask-byte and
  packed-count assertions were proven to fire with deliberately wrong
  registries, the XuiEffect binding was re-derived from the binary's call
  graph, and the independent STRN walk covers all 263 scenes. Non-blocking
  notes recorded in README: the mask-byte check proves ceil(N/8), not N,
  and skips classes that never set a property; XuiElement 17-26 are
  XuiTool's 9199 list, unexercised here.

## Phase C, static render (M0/M1) — Judge C

- **2026-09-02, round 1 @ dabf0b6: FAIL** (geometry PASS, honesty FAIL).
  Verified clean: legend discs within 0.6 px on two frames, horizontal text
  advances within 1%, figure point scaling adjudicated (bbox -> WxH),
  anchor arithmetic, 263 scenes with zero unknown classes or TextStyle
  bits. Findings: (1) text 6.1% too tall with an unsupported em derivation;
  (2) canvas hardcoded 1120x770 but 61 scenes use other sizes; (3)
  BlendMode 2-5 paint content scenes, unverified; (4) metapane resting
  state hides all chrome, undisclosed; (5) default route shows only the
  blade background (tabs at Opacity 0), undisclosed; (6) StrokeWidth not
  scaled with the geometry; (7) PLACEHOLDERS' file:// claim fires nowhere;
  (8) data-xui-state records the requested, not resolved, state; (9) 27
  overflowing figures mis-scale gradient space; (10) defaults hardcoded
  outside xuiEnums.
- **Round 2 @ c188d18: PASS for the render, honesty row open.** Re-measured:
  'C' stem 31.72 vs 31.34 px (was 33.26), baseline within 0.4 px, discs
  within 0.6 px, list separators within 0.35 design px, per-scene canvas
  and resolved states verified. Still open: the invisible-at-rest
  detector counts text controls as invisible (false positives on 39
  scenes); PLACEHOLDERS.md had not actually been rewritten; two stale
  README sentences. New: row label ink sits 2.4-3.1 design px low with
  identical heights, a baseline rule inside the row visual.
- **Round 3 @ 39c88f4: PASS (honesty row closed; Phase C certified).**
  Detector, PLACEHOLDERS and README verified. The list offset was list
  geometry (row origin = list y + 45k, no inset), confirmed by two
  independent landmarks: separator strip cross-correlation +0.06 design px,
  row-label ink within 0.6. Residual nit: `invisibleGroups` is snapshotted
  at render time, before lists populate.

## Phase D, timelines (M2) — Judge D

- **2026-09-02, round 1 @ 528f5ef: FAIL.** Verified clean: keyframe
  sampling exact on six timelines incl. quaternion slerp and indexed
  gradient stops, every named-frame command on the exact tick, blade-switch
  durations against the console (20 and 22 timeline frames), the 60 Hz
  fixed-step clock. Findings: (1) the ease curve is inverted (console
  accelerates into a blade open, ours decelerated); (2) EaseIn/EaseOut
  parsed unsigned (-100 arrived as 156) — fixed in packages/xur; (3) the
  "all eases are 0/0/50" claim was false (85% carry real values); (4)
  scopes with timelines but no named frames never play (the background
  animations); (5) range labels name frames that do not exist; (6) the
  reference capture is 30 fps frame-doubled, now noted.
- **Round 2 @ c188d18: PASS.** Ease direction, parsing and the corpus
  distribution re-verified independently (blade_1_grey_rt at frame 225
  matches the hand computation to six digits); ambient scopes advance and
  loop; range labels resolve; all round-1 Linear/None samples unchanged.
  Observation for the input phase: driving frames on the M3a page restarts
  btn_1line_icon's Focus range early, so something in the focus layer
  re-triggers setState mid-range.

## NXE 9199 pipeline and registry — Judge AB-9199

- **2026-09-02, round 1 @ b8c2c38: PASS** (data and registry; docs
  FAIL-with-fixes). Verified from the bytes: 29/29 resources exact, all
  4,344 pack entries hash-match, the duplicated slots TOC entry is
  byte-identical, a partial dump fails the count step, devkit signs the
  same image (29 resources byte-identical), eleven class tables re-derived
  from the disassembly with an independent reader match the registry
  name-for-name, mechanical bl-target binding verified on the PressKey and
  Script* tables, XuiVideo's two properties hand-decoded from the scene,
  6770 registry change provenance-only, DvdAction.xur hand-decoded to its
  last byte, six count headers re-counted, 3,658 string tables to EOF with
  five keyed entries resolved by hand. Findings, all closed in the next
  commit: the keyed-entry statistic was a subset (13,714 total, 137 in 64
  tables unverified); the devkit sentence omitted the positive half; the
  pack-rename list was wrong (dashuisk exists in both); the canvas list was
  incomplete; audio asserted only duration > 0 (now source and output PCM
  lengths must agree within 5 ms); the 44.1 kHz note was a 6770 fact (16 of
  17 NXE sources are 44.1); the XuiElement tail wording overstated; two
  compile-time classes carried null ids. Observation for NXE timelines: 520
  of 570 Ease keyframes use negative ease values.

## Phase E, the driven dashboard (M3) — Judge E

- **2026-09-02, round 1 @ f6db297: FAIL.** Verified clean: one-scene
  composition, rest frames and tab order, every blade-switch range and cue
  tick against the data (32 cue keyframes re-read), the panel-level counter
  with tab lock, TransFrom/TransTo fades, boot from frame 462, metapane
  GotoIndex ranges, Console Settings table at 0x920143d0 (11 rows), page
  edges within 1 px on all five blades, no invented rows or strings.
  Findings: (1) the Xbox LIVE blade lacks offline content the data provides
  (gamercard strings, default banner, tray strip); (2) "Sign Out" paints
  with no profile; (3) Console Settings does not scroll (9-row window,
  pinned selection); (4) no scroll chevron (ScrollMore state); (5) locale
  not wired on the driven route; (6) Guide placeholder claim false; (7)
  Display page shows the XuiTool caption; (8) Marketplace focus text wrong;
  (9) option lists are code-built from hardware queries (addresses given),
  not tables. Tab-stack residual attributed to the wing's rotated gradient
  fill.
- Closed after round 1 (commit follows): LIVE blade offline content
  (default banners, TrayScene, dashStrings labels), Sign Out disabled with
  no profile, Console Settings 9-row scrolling window with chevrons via
  ScrollMore, locale on the driven route (62 patches under de-de), Guide
  placeholder logged, Display page tokens cleared and Current Setting drawn
  where the frames give a value, Marketplace focus text fixed, option lists
  recovered from the code's own tables (Display, Language, Locale, Time
  Zone, Passcode Hint, Remote Control; ratings decoded, not wired) and
  disclosed as code-built. Also: TransBackFrom now plays before a pop, the
  tab-stack residual halved (the wing's opaque radial stop), LIVE arrival
  focus evidenced from DashLiveSignedOut, and a provenance correction: the
  basefile is flat-mapped, so every .text address the tools printed was
  0x200 high; tools fixed and both registries regenerated.
- **Round 2 @ 7d3c879: PASS (M3 certified).** All nine re-verified from a
  fresh snapshot: LIVE offline content string-for-string against f0026,
  Sign Out disabled on every blade, the 9-row window and chevron ink,
  locale on the driven route (40-45 patches), tokens gone, option lists
  re-read from the binary. Follow-ups: F10 an empty localized positional
  entry painted a blank row (the console fell back to the root string) —
  fixed in the next commit with root fallback and a blanks counter; F11 the
  System Info value was typed from the reference console (2.0.6717.0) — now
  the running build's own 2.0.6770.0 from the pack format string; F12 the
  tab-stack residual is unchanged on the System still (+30/+30/+17/+12
  luma at x=30/60/100/150) and stays open with that number.
- Residual work after the verdict (commits through 85db5ba): the same-build
  6770 capture confirms the geometry to 0.0005% and shows the residual is a
  global few-percent lightness in the 160-200 band on page and chrome
  alike (frame = 1.119 x ours - 29.4) plus an under-saturated page purple;
  FillColor modulation, gradient stop colour space (linearRGB, linear,
  the 360 PWL curve), linear-light compositing, backdrop/z-order, ambient
  phase and every blend candidate are measured and refused; BlendMode 5 is
  now settled as screen. Judging rule adopted: achromatic flat blocks
  binned by luma, +-5 capture spread, never luma on a saturated surface.

## NXE M4a, shell foundations — Judge F

- **2026-09-03, round 1 @ 85db5ba: FAIL.** Verified clean: the build table
  and 1:1 viewport (front slot 420.0x320.0 on two frames), Blades edges
  unchanged, the thirty Moby/Rome constants read from controlp/Variables,
  the XML parse and nine condition predicates, "1 of 8" on two captures,
  the 8-row Console Settings table at 0x92016a90 re-read, the rig
  geometry and mirror line 510, both build gates in code. Findings: (1)
  channel queue composed backwards: channels stack ABOVE the current row
  in file order with circular wrap, nothing below, plus distance dimming
  and the marker bullet; (2) reflection ramp inverted (mirror appears 230
  rig px below the floor); (3) projection constants over-fitted (judge's
  18-landmark two-frame fit: f 1445, centre 148.5/353); (4) slot icons by
  a hand rule, 30 px low; (5) no home legend ("A Select" from the slot's
  helptext); (6) gamer-card slot shows the signed-in group; (7) legacy
  page offsets real (empty LegacyControl visual; the frame is
  BackgroundPanel's nine-grid), border attribution false; (8) nits.
- **2026-09-03, round 2 @ a70b89c: FAIL.** All eight round-1 closures
  re-verified PASS. Four new findings, all on M4b: N1 the Aura draws
  `AuraScene`'s 33 `white.png` quads as pictures (achromatic blocks binned by
  frame luma read +157/+177 at 60-99 and −39/−72/−87 at 140-199); N2 the
  integrator lands 2.0-2.5 frames short of its own closed form on all three
  axes because the arrival clamp eats the braking tail; N3 the channel change
  fires the fold on the key press where the footage puts it one channel move
  later; N4 the "footage settles the `…Ex` pair" claim is an over-claim; N5 the
  queue size ramp, the mirrored tray caption, the frame-solved legacy constants
  and two missing PLACEHOLDERS rows.
- **Closed in M4c (this commit), with the number:**
  **N1** - the rule is not the proposed `TextureSurfaceElement` one (that
  property is set on zero elements in the scene); it is the shader/image PAIR,
  swept to 33 hits in 9199 and 0 in 6770. Bins now +16.3/+17.3 at the dark end
  and −10.8/−11.4/−14.8 at the light end, gated at 30 in `smoke-nxe.mjs`. The
  floor under the front panel is still 70-95 dark and is `SolidBack`'s own
  authored stops, ablated layer by layer and tabulated, not tuned.
  **N2** - `Axis.step` is piecewise-analytic; arrival time now EQUALS
  `stepDuration` to 3.6e−15 frames on all three axes and on a five-step move,
  asserted in `tests/nxe.test.ts` and again on the live shell. One panel move
  0.3167 → 0.3416 s against 0.367/0.383 measured. The velocity peak is 0.45
  against the console's 0.33 and is reported, not tuned.
  **N3** - move, then fold, then unfold: channel@T, fold@T+18 (= 60 ×
  stepDuration(50/40)), unfold@T+8..9. A harness bug was found doing it: a
  synchronous frame loop cannot measure an event that waits on a fetch.
  **N4** - withdrawn and re-worded as an inference with what the footage does
  and does not support.
  **N5** - the queue ramp is a ten-row table in `dash.xex` (below), the legacy
  constants are labelled frame-solved, and PLACEHOLDERS carries the Aura slab
  history, the queue table, the avatar silhouette, the Rome channel and the
  `…Ex` withdrawal.
- **Phase brief, the same commit:** the queue's size ramp is
  `.text` 0x9248b548's stack table (not depth, not a scene `Scale`) and
  predicts the frame's 33/25/18/15/14 to 1.2 px; the signed-out avatar is the
  build's own `dashcomm/AvatarSilhouette.png` [CODE 0x921421ec] and lands
  within 2 px of [FRAME Kpa f0048] in position and 4.9 % in height; one Rome
  panel mounts from `RomeFrontPosition` and measures within 1.5 px of
  [FRAME Yrt f0396] on all four edges.
- **2026-09-03, round 3 @ 9bbda7f: PASS.** N1-N5 re-measured closed. The
  judge decoded the queue table at 0x9248b548 independently (every `lfs`
  resolved to its `.rdata` float, the `stfs` block laid out as ten 12-byte
  rows) and matched f0048 within 3 px on every row; the integrator lands on
  the exact frame; the fold order is the footage's; the silhouette's load
  site and the Rome panel's four edges verified. Findings: (1) MEDIUM the Aura
  gate was whole-screen and the sky averaged the floor away - floor rows
  580-700 alone read -30/-50/-72/-87 in the 120-199 bins; (2) LOW the fold
  and unfold clicks are ~0.17 s early against the footage (console has a beat
  between landing and folding); (3) LOW a grey wedge remains at x<96, y
  400-560 (the `Color` figure's rotated edge); (4) LOW the mirrored caption ~10
  px low, stays with the shader placeholder.
  **Closed after the verdict (this commit):** (1) `auraFloor` bins the floor
  rows on their own and holds each bin to the residual measured at 9bbda7f
  (100:-16 120:-32 140:-52 160:-64 180:-81, -8 tolerance), so the SolidBack
  darkness is carried as a number that cannot grow, beside the whole-screen
  bins which stay gated at 30. (2)-(4) recorded in PLACEHOLDERS as open
  residuals; not tuned.

## Judge G: NXE 9199 behaviour (M4)

Rubric: the plan's Judge E applied to the NXE shell - a scripted input path
walked in the browser at 60 Hz and in the frame-stepped footage (Yrt 30 fps,
Kpa 29.97 fps, Yv5), channel/slot/focus order, every string, cue, transition
and legend, and every PLACEHOLDERS row checked for honesty.

- **2026-09-03, round 1 @ 25f19ae: FAIL.** Gates reproduce (tsc 0, 73/73,
  10/10); foundations not re-judged. Findings: (1) CRITICAL the Settings slot
  never gets a rig - `buildStrip` culls slot 7 at build time and nothing
  remounts it, so "8 of 8" is an empty front slot [Kpa f05580]; (2) CRITICAL
  the channel change runs the queue the wrong way (Prev1 rises on Up) and on
  the wrong model - the console scrolls the names DOWN over 4-5 f, the strip
  FADES OUT IN PLACE in ~3 f, the new front panel fades in, the rest unfold
  behind it, 10-18 f total [Yrt f07274-7285, Kpa f00736-0745]; ours takes
  27-45 ticks with a collapse cascade. The "move, then fold, then unfold"
  evidence (Judge F r2 N3, Yrt 238.48 s) was the Guide closing over the
  profile page, not a channel change; the real changes are at Yrt 242.47/243.5
  and Kpa 24.5/25.9 s and carry ONE audio onset; (3) HIGH the queue and the
  counter stay on screen behind every pushed page [Kpa f05598-5605, Yrt
  f0396]; (4) HIGH `<servicename>` is painted on System Settings (8 rows on
  screen, `legacy.rows` reports 7) [Kpa f0391]; (5) HIGH Console Settings
  never draws the metapane description (`dashCSettingsStrings.xus[325]`,
  `[327]` are in the archive) [Kpa f0381, f05604]; (6) HIGH legacy-over-legacy
  uses the `...Ex` pair where the console's 10-frame swap is exactly
  LegacyFrom + LegacyTo [Kpa f05630-5639]; the PLACEHOLDERS window at Kpa
  190.06-191.22 was list moves, not a page swap; (7) MEDIUM fold/unfold
  geometry: the console rotates the front panel about its left edge and
  fades it over ~7 f, never draws panels in front of the cursor, plays the
  legend Hide first; on B the front slot rotates in, queue rows fade in,
  panels emerge behind [Kpa f05587-5605, Yrt f06754-6775, f07172-7227];
  (8) MEDIUM a passing panel does not fade to ~0 as it exits left [Kpa
  f05561-5566]; (9) MEDIUM the queue wrap draws ghost rows on short lists
  (N=2 console shows nothing above "Witamy") [Yv5 f0042]; (10) MEDIUM Media
  Center's `<description2>` (`homepage/strings.xus[13]`) is not drawn -
  `dressSlot` never writes DataAssociation 1 [Kpa f05545]; (11) MEDIUM cues:
  three onsets per channel change vs one; SoundButtonSelect on a refused
  command; select+fold+transitioninto on one tick vs select, +0.1 s, fold at
  +0.3-0.4 s; the fold-to-unfold gap varies 2..17 ticks under `&manual`
  because it waits on a fetch; (12) LOW counter fades during a change (the
  console keeps it), home legend hides ~3 f earlier, list wrap authored not
  verified, a "System Settings" Label_Head at (96,~70) with "565 GB free"
  while the slot rests. PLACEHOLDERS rows rejected: the `...Ex` row, the
  fold-order claim, "tokens are CLEARED" for 9199; missing rows: 9199
  Console Settings current values (frames give "Auto-Play Enabled", "1920 x
  1080 / Widescreen / DVI", "Both Remotes"), "565 GB free", `<description2>`.
  Verified clean: home strings, queue names/ramp, counter, legend,
  silhouette, channel targets, edge refusals, System/Console Settings rows
  and pitch, focus restore, Blades untouched. Fixes in progress with M4d.

## Judge AB-17559: Metro 17559 extraction + parser

Metro 17559 through the extraction and parser pipeline (M5a, 2026-09-03).
What the implementer claims, for the judge to verify from the bytes; nothing
here is self-certified.

- **Inputs and twin.** `Metro/V2/Retail/17559/dash.xex` (5,971,968 B,
  sha256 3ad8f38d...), `shrdres.xzp` (223,911 B, 179c5be1...), and
  `dashbigger.xex` (15,880,192 B, fc4ad906...; the uncompressed SEP copy of
  the same image, `\SEP\20449700\dash.xex`) pinned in `fixtures/hashes.json`.
  The archive has no devkit for Metro; the claim is that both XEXs yield the
  same 16,941,056-byte basefile (c7c5f9b5...) and the same 36 resources
  byte-for-byte.
- **Extraction.** `npm run extract -- --build 17559` prints EXTRACT_PASS with
  packs=36 entries=5186 packEntries=5187 xur=363 png=676 xus=3857 xma=22
  jpg=9 scb=7 other=252 audio=22 (`fixtures/expected-17559.json`); 36/36
  packs tile and pass `--probe`; one duplicate TOC entry (dashcomm
  `ico_64x_AddFriends.png`, identical bytes); thirty `..\handles\*` entries
  of `controlp` written under `__parent__/` and listed in the manifest by
  their TOC name; AUDIO_PASS 22 (all XMA1 44.1 kHz, resampled).
- **Strings.** XUS version 2 (UTF-8, NUL-terminated): 3,857 tables to EOF,
  47,599 entries; 11,001 keyed entries in 3,480 tables resolve to a string
  property of the sibling scene; 70 tables (100 entries) have no sibling and
  are unverified; 31 named, 276 positional.
- **Parser.** XUR v8 (`packages/xur/src/parse8.ts`): XUR_PASS 363/363 with
  all twelve count-header fields recomputed per file (`computeCounts8`),
  sections tiling, STRN charTotal, post-order compound numbering, value
  counts. KEYD read per the console's decoder at .text 0x92203930 and its
  jump table at .rdata 0x92011030 (type in the low six bits, 0..0xc; VECT
  index payload for types 7/0xa/0xb/0xc); curve meanings from the evaluator
  at 0x921e9788 / 0x921e9aa8 (LEARNINGS). The mapping from type 2's three
  inline bytes to the evaluator's two parameters is NOT traced and is stated
  as v5's convention.
- **Oracle.** XUIHelper V8 converts 363/363; `xur2xui --diff` is
  XUIDIFF_PASS 363 identical after the normalisations named in the tool
  ((4) its .xhe IgnoreProperties list, read from the file; (5) XuiHtmlElement
  Text misread as TeletypeCount; (6) its EaseScale `*=` bug; and .NET's
  seven-digit Single formatting for quaternions, `f6single`). The v5 diffs
  are unchanged (243 and 308 identical).
- **Registry.** `packages/xur/extensions/17559/registry.json` from the 17559
  basefile alone: 313 classes, 70 with tables bound by call graph; the
  corpus's 69 classes all present (54 with tables, 15 zero-property); no
  `inferred` or `xuitool-xml` entries. Seven differences from XUIHelper's
  17559 XML listed in LEARNINGS, binary wins; 286 classes identical.
- **Regression.** 6770 and 9199: EXTRACT_PASS with unchanged counts,
  XUR_PASS 263/263 and 311/311, XUIDIFF_PASS, and `npm test` 83/83 (73
  before; +2 synthetic v8 unit tests, +8 17559 corpus tests). Smoke board
  result recorded in the M5a report.
- **Not done, stated:** no 17559 runtime (`?build=17559` is not served;
  `packages/runtime/src/build.ts` still lists two builds); the XACT wave
  bank (`dashcomm/dash.xwb`) and the 44 XuiSoundXACT cues are not converted;
  `SegoeXbox-Light.xtt` is not in the archive, so 17559 text would fall back
  to the Convection decode; the Lua bytecode apps are classified, not
  decoded.

- **2026-09-03, round 1 @ 47f5085: PASS** for the data, the parser and the
  registry. The judge re-derived the twin (dashbigger.xex → the same
  16,941,056 B basefile, 36/36 resources identical), walked the XUIZ v3 TOC
  with its own reader (5,187 entries tiling every data region, all 5,186
  files byte-equal their TOC ranges, 677 PNG signatures = 677 PNG entries),
  parsed all 3,857 XUS tables to EOF independently, hand-decoded seven scenes
  from hexdumps (every value type, post-order compound numbering, KEYD types
  0-4 and 0xa with direction bits), confirmed the KEYD decoder at 0x92203930
  / jump table 0x92011030 / evaluator 0x921e9788 with Capstone, regenerated
  the registry byte-identical, re-read the seven binary-vs-XML differences
  from the table-building code, and checked every xur2xui normalisation in
  XUIHelper's source. Findings, all LOW doc errors, fixed in this commit: 9 of
  the 22 cues are stereo, not all mono; `..\handles` is 9 xur / 6 xma / 15
  png; the two-stop-gradient scene count is 40, not 62. Nit: the
  TeletypeCount normalisation is class-blind (harmless, would surface as a
  diff). Could not verify: which of type 2's three bytes feed p1/p2; the
  runtime meaning of the `.xhe`-ignored properties.
- **Closed in M4d (this commit), with the number:**
  **(1)** rigs are mounted and unmounted by `(k − cursor) × spacing` against
  `MobyVisiblePanelDistance` on every frame, with every slot scene preloaded
  so a mount is synchronous; the smoke drives seven Rights and asserts the
  Settings slot is a mounted, visible front panel at "8 of 8" (7 rigs at
  rest, 8 mounts / 6 unmounts on the way) [FRAME Kpa f05580].
  **(2)** the queue's sign is the CALLER's (0x9248c9cc-0x9248ca18: `−frac`
  while the cursor climbs), so an Up lerps every row toward `SLOT[i+2]` and
  the names scroll down (`queueTargetSlot`, unit-tested; the smoke asserts
  Next1's and Current's y increase on an Up). The change is a measured fade
  in place: old strip out over 6 ticks, a 4-tick beat, each new panel in over
  12 front to back (`CHANNEL_SWAP`). Re-measured on both captures for this
  commit, one statistic on both sides (the mean absolute luma difference of a
  strip region against the REST, BARE-FLOOR and SETTLED frames of its own
  shot) and every time counted from the last rest frame, which is where our
  trace also starts: old strip gone 0.100 s (footage 0.100 s, [Yrt
  f07272-07275] and [Kpa f00735-00738]), new front half-way in 0.267 s
  (0.244 s Yrt, 0.292 s Kpa, the crossing interpolated because the statistic
  is linear in a fade), new front settled 0.367 s (0.367 s [Yrt f07283],
  0.400 s [Kpa f00747]), second panel off the floor 0.333 s (0.367 s [Yrt
  f07283], the file's 0.7 gate) - each inside one 30 fps frame of the
  capture. The beat is 4 ticks and not the 2 first written here: the strip is
  BARE for two to three frames [Yrt f07276-07277, Kpa f00739-00741] before
  the new front moves, and a 2-tick beat put the front's half-way point two
  frames early. Ours is traced on a DOWN: the archive's embedded homepage
  gives Game Marketplace - the channel an Up lands on, and the one the
  capture shows - ONE slot where the capture's console has two, so an Up here
  can never grow a second panel to time. One cue per change; the
  footage's one onset matches `snd_channelup/down` at 0.97 and its second,
  26 dB quieter onset (panelfold/unfold at 0.99) is recorded, not played.
  The "move, then fold, then unfold" claim is retracted in PLACEHOLDERS, the
  README section and the smoke gate. The fold routine at 0x9248b7a8 is NOT
  the channel change: it is the queue's part of the A/B fold, driven by
  `TransitionChannel`.
  **(3)** `controlp/Variables.xur`'s `SceneTransitions` group (the object the
  spec said did not exist) carries `To`/`From`/`BackTo`/`BackFrom` (75 frames
  each) animating the four variables the code reads every frame; the shell
  plays `From` on A and `BackTo` on B, the queue rows fold through the
  decoded routine (top-down, bottom-up back) and `Description` fades by
  1 − |p|; `?page=` parks the group on `From`'s last frame so both routes
  agree (gated: values C1 P1 S0, every row dim 0, counter opacity 0).
  **(4)** `navIPTVSettings` is `Show=false` with no IPTV provider; the smoke
  gates on painted text in the DOM (zero `<...>` tokens) on the A route and
  the `?page=` route.
  **(5)** `syncMeta` as in Blades: the table's description index on
  DataAssociation 0 ([325] "Change your display output settings…" on
  Display, [327] on Auto-Play), the six hardware-state values on 4, the
  `NToM` range; System Settings' descriptions from its `PanelStrings`
  [FRAME Kpa f0391]. Gated on the report and on the painted DOM.
  **(6)** `curvesFor()` returns the plain pair always; measured ten 30 fps
  frames on Kpa f05630-05639 (64→99→67 in the page region, a half-strength
  crossover) = LegacyFrom + LegacyTo started together; the `…Ex` row is
  rewritten and the 190.06-191.22 s window identified as list moves.
  **(7)** the hinge is 0x92488480's left branch (`v = (−128,0,0)` for
  θ ≥ 0; the sliver at 75° lands at design x 13..122 against the footage's
  32..117), the front slot is `TransitionPanel × π/2` on it, the panels
  behind fold by the decoded cascade and are never drawn in front of the
  cursor (gated per tick). Measured the judge's way (seconds after the
  press): front slot rotates 0.48 s (footage 0.47), gone 0.73 (0.63), page
  shows 0.83 (0.73); legend 0.00 (0.30) and queue 0.38 (0.43) lead the
  footage and are printed, not gated; on B the front slot returns 0.53 s
  (0.67) and the rows 0.77 (0.83). The order legend → queue → panel → page
  is gated on both sides.
  **(8)** `passingOpacity`: `1 + z/spacing` floored at 0 [CODE
  0x9248d8dc-0x9248d904]; gated on every tick of a Right with |z| in
  100..400 and on the exit band's clearing against Kpa f05539-05550.
  **(9)** `queueRowChannel` fills at most N − 1 rows above the current
  (unit-tested for N = 7, 2, 1 [FRAME Yv5 f0042]); the wrap is labelled
  INFERRED in `__dash.nxe.physics` and PLACEHOLDERS.
  **(10)** `<description2>` → `setOwnerSlot(1)` on the slot: "TV and media
  from your PC" is painted inside Media Center's rig (gated on the DOM).
  **(11)** a refused press plays nothing (gated on the Welcome slot); a
  change plays one cue; A plays select on the press, fold at the cascade
  start, and the RANGE fires `snd_transitionfrom` at +9 (the two transition
  cues are timeline keyframes of `TransitionSound`, no longer inferred); the
  page is prefetched before the fold and pushed on the range's frame 120, so
  the gap is frame-exact (`+44`, gated).
  **(12)** the counter follows the strip on the tick the new one shows
  (gated unchanged through the six-tick fade); the legend's own `Hide`
  range plays on the press; the "System Settings" / "565 GB free" slot
  observation is in PLACEHOLDERS (the second line is `mobyslot`'s
  DataAssociation 1 presenter; the title is the slot's `Label_Head` hoisted
  into `LTitle`).
  PLACEHOLDERS: the `…Ex`, fold-order and tokens rows rewritten; rows added
  for the `SceneTransitions` choreography, the 9199 Current Setting reads
  (cited to Kpa f0377-f0389), the slot's second line, the wrap, and the
  quieter cue. Reference cuts for every citation are regenerable into
  `reference/frames/<capture>-30fps/` under the judge's numbering.
- **2026-09-03, round 2 @ c60ae4a: PASS.** All twelve findings re-walked at
  60 Hz against the same frames: the Settings rig mounts at z 3220 and "8 of
  8" fronts System Settings; an Up scrolls the names down (Next1 114→154,
  Current 154→194 fading) with the strip gone over ticks 0-5, bare 6-9, new
  front in over 10-22, one cue; queue and counter at opacity 0 behind every
  page on both routes; no painted `<...>` token on the walked pages; the
  metapane paints the table description and the cited Current Setting per
  row; the plain pair measures 0.300 s (footage 0.267); on A the rows fold
  top-down, the front slot rotates about the left hinge and nothing is drawn
  in front of the cursor on any of 110 ticks, on B the slot rotates in and
  the panels emerge behind; passing opacity 0.99→0.86→0.55→0.05→0; wrap
  capped at N-1 and labelled; the second caption line paints; a refused
  press is silent; the fold→page gap is frame-exact. The rotate() change
  moved nothing on NXE (home-rest MAD 0.19 luma). Residuals, LOW, reported
  not blocking: (R1) the name scroll runs 0.30 s where the footage settles in
  ~0.17 s; (R2) the unfold on B takes 0.92 s vs 0.67 (UnfoldSpeed eased to
  UnfoldMinSpeed, stated not tuned); (R3) rapid Ups collapse into one swap,
  unverifiable; (R4) the legend Hide leads the footage by ~0.27 s; (R5) a
  page with no code table (dashSysCslSetRemoteC.xur) still paints
  `<setting>` - the token gate covers only SystemScene and dashSysCslSet.

## Judge E round 3: pending (M3e, Blades 6770 completeness)

What the implementer claims against COVERAGE.md's Blades punch list, each
with the measurement that gates it; nothing here is self-certified. Gates:
`npm run typecheck` clean, `npm test` 110/110 (20 new: the settings model's
tables and handlers, the dynamic lists, the code press paths, the focus
fallback), `tests/smoke/smoke-nav.mjs` section 8 (`[m3e]`), `smoke-blades`
unchanged, the board `npm run smoke`.

- **B1 - the option pages select.** `dashboards/blades/settingsModel.ts`
  decodes every option page's class from the binary: the two-slot vtable and
  dispatcher of each (`0x13` init, `0x0e/1` press, `0x0e/2` focus, `0x1a`,
  `0x27`), the init that binds, READS the setting, focuses the row of the
  current value and writes `labCurrentSettings`, and the press that WRITES
  the setting and calls `0x921b5428(scene, 0xfd)` = `XuiSceneNavigateBack` -
  so the page POPS on A, with `btn_Select` and no `btn_Back`. Twenty pages
  are in `OPTION_PAGES` with their VAs, values and string indices (Screen
  Saver 7/1 0x1000|0x0a, Auto-Off 7/2 0|0x168, the user-flags word
  XCONFIG_USER 0x0c bit by bit, the audio flags, the video flags, XC_LOCALE,
  XC_LANGUAGE, the time zone, the reference level, the parental staging block
  at 0x92872c90 with 0xff/0 and the 0x92013adc label pairs); the twenty-first
  (`dashSysLiveVision`) is disabled without a camera (0x921cda90). The
  parents follow on `XN_FOCUS` (`PARENT_LABELS`: Shutdown 0x921c9000, Audio
  0x921caf68, Clock 0x921c9cb8, Video 0x921bda18, Family Settings
  0x921bd0b0), Console Settings through the eleven table providers
  (`consoleSettingsCurrent`). The state starts at the reference console's,
  read off the 6717 stills f0053-f0066 (every Console Settings row's Current
  Setting is in the footage), with the DST bit and the Family Settings block
  unknown = the failed-read path. Gated: `[m3e] 8a` paints each of the eleven
  rows' lines from the DOM AND measures the value block of nine rows against
  its own still (f0053/55/56/57/60/61/62/63/64: dx within 1 px, dy -3..-6 =
  the pre-existing metapane text offset, block ncc 0.47-0.56, held at |dx|
  <= 3, dy in [-8, 2], ncc >= 0.42); `8b-8g` walk Startup (arrives on
  btnDashboard, Disc pops with exactly `btn_Select@268`, the parent line reads
  Disc, reopens on Disc), Shutdown/Auto-Off/Background Downloads (labels
  follow focus; Enable is the xam box's no-answer branch), Audio/Digital
  Output (list arrives on row 1, WMA Pro propagates two levels up),
  Display (below), Clock (below), Family Settings (PEGI 16+ propagates,
  Explicit's Blocked, "<None>" for the UK's TV row). The pop rule is [CODE]
  on every page (the press handlers end in 0x921b5428) and [FRAME 8498
  f2170-f2181 / f2084-f2088] for the arrival-on-current-row rule.
- **B2 - Media rows.** `nav.ts` `CODE_PRESS_PATHS`: Music/Pictures/Videos
  open `dashcomm/MediaSourceSelection.xur` [SPEC §4, INFER], whose metapane
  rests on `NoComputersScene` alone (0x921aac44-0x921aac58 shows one of the
  three sub-scenes; the "Please wait" pair hidden), `listMediaSources` empty
  and disclosed, and `NavRight="metaPanelScene\NoComputersScene"` (a child
  path) lands on `btnTestConnection`. Gated `[m3e] 8i`. Media Center is a
  recorded code path (hardware).
- **B3 - Create Gamer Profile** opens `oobe/oobeProfileCreation.xur` and
  stops (the profile is device state). Gated `[m3e] 8i`.
- **B4 - Initial Setup** raises the xam box at 0x92114a98: recorded in
  `__dash.shell.dialogs` with dashStrings [176]/[179]/[177]/[178]; nothing
  opens. COVERAGE's "the dialog scene is `dashcomm`'s msgbox, to be
  identified" is SETTLED and the answer is no: `dashcomm/` holds nine `.xur`
  and none is a message box, and the only alert-shaped scenes in the whole
  6770 build are five pack-specific ones (`dvd/DvdAlert`, three `music/*Alert`,
  `network/2030_ConfirmAction`), each carrying its own authored body rather
  than the title/body/two-button shape these calls pass. The generic box is
  xam's. PLACEHOLDERS carries the evidence. Gated `[m3e] 8h`.
- **B5 - painted tokens.** The clear runs on every sub-scene mounted into a
  page (`clearTokens` after `loadMetaScene`, after each `fillContainers`
  load, after the Display pane) and skips nodes the shell filled from the
  string table. Gated on painted DOM text on EVERY page section 8 reaches
  (`noTokens` on 20+ pages, including Computers and the Arcade home).
- **B6 - the Display pane.** `scnCurrentFormat` loads
  `metaPane_DisplayWidescreen.xur` from the aspect provider's row
  (0x921c7040-0x921c7084) and `labCurrentSetting` is the four providers'
  join. No footage shows the Display PAGE (f01580 is Console Settings with
  Display focused; COVERAGE cited it for the pane by mistake); gated on the
  DOM (`[m3e] 8e`: pane mounted, "1080p Widescreen Standard").
- **B7 - the rating lists.** `DYNAMIC_LISTS` picks the table by locale: UK
  games = system 4 (9 rows with their PEGI/BBFC badges), movies = 2, TV =
  none (empty, disclosed, and the Video menu labels it "<None>"). Gated
  `[m3e] 8g`.
- **B8 - the clock spinners.** `clockSpinners` sprintf's the five ranges
  and parks each on the host clock (`ListView.park`); AM/PM is parked by the
  hour. Right walks lstDay -> lstMonth -> lstYear and crosses into scTime's
  hour through `scDate.NavRight` (the parent fallback). Gated `[m3e] 8f`.
- **B9 - X and Y.** `BladeShell.pressKey` routes to the control carrying
  `PressKey` 0x5802/0x5803 on the top scene when enabled: `DeviceSelector`'s
  `legend_y` "Device Options" plays its Press and is a recorded code path
  (no device to act on); the disabled legends take no input. Gated
  `[m3e] 8h`.
- **B10 - NavLeft/NavRight.** Left/Right on the d-pad walk the focused
  control's authored NavLeft/NavRight (or its parent's, or an empty override
  falls through), and fall back to the blade switch; LB/RB stay the switch.
  README corrected. Gated `[m3e] 8f` (spinners) and `8i` (MediaSourceSelection).
- **B11 - Themes.** Its own PLACEHOLDERS row (archive gap); the row's value
  is the no-dash-user string 126 [f0056].
- **B12 - double btn_Focus.** NOT reproduced on a fresh mount at this
  commit: one Down on Console Settings and on Display fires exactly one
  `btn_Focus@15`, and a list item owns one scope. Gated `[m3e] 8a`. The
  audit's doubled cue is consistent with a second shell from a long-lived
  dev server (the HMR leak `__dash.hmr` guards), not with the row visual.
- **B13 - ConnStatus / DeviceSelector.** A `DefaultFocus` that names a scene
  descends into it (its DefaultFocus, else its first list with rows, else its
  chain head) [INFER on which of those XUI takes; `scene_main` has only the
  list], so Network Settings arrives on `list_items_item0` and its rows walk;
  A on them is a recorded code path. DeviceSelector's list is disclosed, the
  template row is no longer painted, `txt_EmptyList` shows. Gated `[m3e] 8h`.
- **The eight empty lists.** ClockTime x5 filled (B8), FamilyTimer filled
  with its single "off" row (0x921cb5e0 / 0x921cb4b0 string 383), Game and
  Movie ratings filled (B7), TV disclosed, HiDef disclosed (hardware),
  DeviceSelector disclosed, ConnStatus was authored (B13). Every other empty
  list on the offline tree now carries a reason (`CODE_LISTS_NOT_FILLED`).
- **The three authored-but-never-fired cues.** `btn_InactiveSelect` now
  fires: the Display page's Screen Format row is drawn DISABLED (the table's
  0x921c677c gate, [FRAME f0053 "Widescreen"]) with the skin's *Disable
  states, and A on it plays `PressDisable` = `btn_InactiveSelect@281`
  (gated `[m3e] 8e`). `tab_Switch.xma` is keyframed only in
  `network/2004_NetworkDetails` and `arcade/250x_CompareAchievements`,
  neither reachable offline (Edit Settings is a code path over a live
  configuration; Compare Achievements is Live). `dash_3rdLevelOpen.xma` is
  frame 684 of `OOBEDone`, reachable only by finishing the OOBE behind the
  Initial Setup box. The three orphans stay orphans.
- **The unread positional tables.** `oobeStrings.xus` (OOBE, behind the
  box), `memory/Strings.xus` (DeviceSelector's counts and device rows,
  device state), `network/Strings.xus` (ConnStatus's metapane per row and
  the SSID line, network state), `music/Strings.xus` (the device pages
  behind a media source): none is reached because nothing offline supplies
  the data those pages format them with. Recorded, not wired.
- **Doc errors fixed.** README's "no control in the build sets NavLeft or
  NavRight"; `displaySettings.ts` "OutputLevels.xur is not in this archive"
  (it is, and the row pushes it; its three buttons are decoded). PLACEHOLDERS
  rows rewritten: the option lists, the tokens, the gamer card; rows added
  for the xam boxes, Personalization.xur, the device pages.
- **Runtime changes (packages/runtime, additive):** `ListView` rows take
  `enabled: false` (instantiated with `Enabled=false`, the *Disable state
  pairs the skin's `XuiButton` authors), `park(i)` (select without focus)
  and `blur()` (KillFocus on leaving); nothing else. NXE 9199 is unchanged in
  behaviour (its suite runs on the same board).
- **Not closed, stated:** the OOBE chain behind the Initial Setup box; the
  Family Settings block's initial values and its Done/Reset commits; the
  Language page's live preview on selection change (0x921ca7e0 re-registers
  the fonts - the label follows the selection only on A here); the metapane
  text's 3-6 px vertical offset (pre-existing, measured, not tuned).

## Judge G round 3: pending (M4e, NXE 9199 completeness)

What M4e claims, closure by closure, with the measurement each one is gated
on. Nothing here is self-certified; the judge re-walks it. The gate is
`tests/smoke/smoke-nxe.mjs` (`SMOKE_NXE_ONLY=completeness` runs the walker
alone), the decodes are `tests/nxe.test.ts` (re-read from the image when
`extracted/9199/basefile.exe` is present), and every number below is the
suite's own printout at this commit.

- **N1 (Console Settings sub-pages are pictures): CLOSED.** The rows of a
  hosted page are its button controls on the plate and enabled, in authored
  order, with the arrival focus from `DefaultFocus` / the chain head / the
  first row (`dashboards/nxe/pageFocus.ts`), not a `nav*` name filter. The
  walker drives A into every row of every page under System Settings to depth
  5 and reaches **50 pages by input** (the audit counted 40 mounted, 13 dead):
  the 7 sub-pages, their 15 children, the 7 Display children, the Family
  Settings chain (`PControlSelect` -> `PControl` -> Game / Video / LiveA /
  LiveC / Content / FamilyTimer / Passcode -> Hint), `2004_NetworkDetails` ->
  DNS / IP, Computers, Live Vision. Every page arrives with a focus wherever it
  has anything to focus (the four that do not - HiDef, ClockTime, Game
  Ratings, Storage Devices - name the empty list and its reason in
  `codeUnfilled`). The basename collision: `LangLocale > Locale` opens
  `consoles/dashSysCslSetCountry.xur` because a PressPath resolves in the
  pressing page's own pack first (`navigation.ts resolveScenePath`; unit
  test). 9199's own tables fill Display (7, 0x927f0ae0), Language (12 of
  group 0, 0x92018bfc + 0x92018c30, stride 13), Locale (37, 0x92018d40), Time
  Zone (65, 0x927f0130), Remote Control (`273 + (row != 0)`, .text
  0x9221a674-0x9221a694), Pass code hints (5, 0x9201a06c) - each byte
  re-read by the unit test - and the walker gates the row counts and the
  first labels. The option-select model (A writing the setting, B1) is NOT
  built: those presses are recorded in `__dash.nxe.codePaths` with the reason
  (184 on the walk).
- **N2 (tokens painted): CLOSED.** `discloseTokens` runs on every push
  (legacy and root): a `Text` that is nothing but tokens, digits and "of" is
  cleared and listed in `__dash.nxe.hardwareState`. The walker asserts zero
  painted `<...>` text on all 50 pages plus Sign In and the four Rome roots;
  the printout names the 30-odd `<setting>`s, `<#> of <Total #>`,
  `<current settings>` and `<help text>` it cleared.
- **N3 (Gamer Card A): CLOSED as the Sign In page.** `KeyDown` A on the
  gamer card with no profile opens `signin/SigninScene.xur` [CODE
  0x922df3b8; FRAME Kpa 48-56 s], a MobyRootScene strip of
  `CreateProfilePanelScene` + `RecoverProfilePanelScene` [CODE 0x922e409c-
  0x922e415c] under one queue row "Sign In" and "1 of 2". Measured against
  [FRAME Yrt f0268] with the same detector on both: front panel left/right/
  top/bottom and the second panel's left within **1.17 px** (tol 3), the
  "Sign In" row's ink band **175.0..239.0 against 175.3..239.3**, the
  counter's text band **top 579.0 against 579.3** (gated to 3 px). That last
  one needed a new detector and the old one was measuring the wrong thing: a
  luma threshold marks the frame's LIT AURA FLOOR under the panel, not the
  glyphs, and marks our glyphs and not our darker floor, so the two images were
  read by opposite rules. `textRows` takes each row's median as its background
  whatever the background is - the same question on both. Only the top is
  gated: the band's bottom is 3-4 px shallower than the console's on the same
  Convection face at the same top, which is the runtime text renderer's shadow
  depth, printed and left to the suite that owns text. Legend "(A) Select (B) Back" from
  `dashStrings[97]`/`[2]` (indices INFERRED, PLACEHOLDERS), title none. A on
  a panel is recorded (xam's profile flow), B returns home, Right/Left move
  the strip with the panel cues.
- **N4 (What's Hot, Xbox Basics, upsell): CLOSED.** The dispatcher's jump
  table (`.rdata` 0x92028ad0, base 0x922d312c) binds `EcNavToWhatsNew` (8),
  `EcNavToXboxBasics` (7) and `EcNavToLiveUpsell` (0x16) to their root scenes
  [CODE; unit test re-reads every case literal], and `EcNavToSettings` (4) is
  now CODE, not inferred. Each root carries a Rome strip (`strip.ts`): What's
  Hot 8 panels in the order of the (flag, id, scene) table at 0x9202b63c
  [CODE; unit test], Xbox Essentials 8 in the code's emission order at
  0x922ed03c-0x922ed0e4 [CODE + INFER on order], the upsell 5 in channel
  order [CODE + INFER]. No offline capture shows these pages: the gates are
  DOM - the counter "1 of 8", the parked `labHeader` hoisted as the title
  ("What's Hot", "Xbox Essentials"), the front panel's HTML text painted.
- **N5 (Games Library): CLOSED; the other four refused with the case
  address.** `EcNavToGamesLibrary` (3) -> `arcade/ArcadeFilterScene.xur`
  [CODE], a Rome strip of Recent Games + Collections. Measured: at "2 of 2"
  the front panel's four edges against [FRAME Yrt f0396] within **0.83 px**
  and the "2 of 2" ink band **600.0..639.0 against 600.0..639.3**
  (RomeOverlayScene's `Description` at (96,605)); at "1 of 2" the second
  panel's left edge **554.5 against 553.0** and top **143.5 against 147.0**
  on [FRAME Kpa f0300] (spacing 480 through the same projection; tol 6). The
  legend is the front panel's own "(A) Select (B) Back (Y) Play" and there is
  no title [FRAME Kpa f0300] - a `Label_Head` INSIDE the scene with Show=false
  is not hoisted. Video / Music / Picture Library and Media Center call
  functions that build their page from device state (0x92242118, 0x9222d9a0,
  0x922227f8, 0x92306510) and stay refused, with that reason.
- **N8 (X and Y): CLOSED.** `pressKey` finds the page's control by `PressKey`
  0x5802 / 0x5803: Storage Devices' Y "Device Options" plays its Press range
  (btn_Select, gated in the audio log) and is recorded as a code path; its
  X (Enabled=false) does nothing and says so. `app/main.ts` routes X and Y.
- **N9 (CRLF legend entry): CLOSED.** A whitespace caption is no caption
  (Computers draws no X entry, gated), and a `Show=false` carrier is not
  hoisted - the rule the Rome channel page confirms [FRAME Kpa f0450: "(A)
  Select" alone with `romechan.xur`'s Show=false `legend_b`] (Network
  Settings draws no "Status", gated).
- **N10 (KillFocus): CLOSED.** Every Down on a nav-button page sends the row
  being left `KillFocus` and the new one `Focus`, scoped to the page's copy;
  the walker reads the engine's scope states after each move and gates it on
  every nav page.
- **N11 (Left/Right inside a page): CLOSED.** They walk the page's authored
  NavLeft/NavRight chain through the Blades `FocusModel`; on a pushed root
  they move its strip.
- **`btn_Select` / `btn_Back` never firing: CLOSED.** A on a hosted legacy
  page sets the row's `Press` (the skin's `btn_Select.xma`), B sets
  `legend_b`'s (`btn_Back.xma`); the table cues are no longer played there.
  Gated per press on the walk and on the Console Settings press and the two
  Bs of the scripted path (`cs.cues.length === 0`, `btn_Select` in the audio
  log). **For the judge:** this changes two accepted round-2 gates on
  purpose; the console's cue on a LegacyControl page is the XuiButton's own
  keyframe by the skin's data, and the audio of Kpa 187.67 s (System ->
  Console Settings) is where a spectrum comparison of `btn_Select.xma`
  against `snd_buttonselect.xma` would settle it. Not done here.
- **The 66 unmounted scenes:** 50 pages + Sign In (3 scenes) + the four Rome
  roots and their 23 panels are mounted by input now. What stays unmounted,
  with the reason in `unboundCommands` / `codePaths`: the two IPTV pages
  (gated), `PControlLiveA/LiveC` are mounted but Live-only in effect, the
  network pages behind `2004_NetworkDetails`'s Additional Settings tab
  (`2038_ConsoleInformation`, `2036_PPoESettings`: the tab switch is
  `XuiTabScene` input the shell has no key for), `WirelessSettings`
  (Show=false without an adapter), `accountm/2629_MoreInfo` (FamilyTimer's
  btnY is Enabled=false), `firstrun/WhatsNewAvatarsScene` (only in the
  4-row table at 0x9202b608, consumer not traced), the noobe / signup / memory
  detail / music / pictures / videos pools (device or profile state).
- **R4 (the legend leads by 0.27 s): CLOSED, and by the file.** The whole
  keyframe list of `SceneTransitions/TransitionSubElements` is
  `0:1 1:0 55:0 75:1 | 76:1 95:0 150:0 | 151:0 205:0 225:1 | 226:1 250:0 300:0`
  [SCENE controlp/Variables.xur]: the variable holds a ZERO PLATEAU across the
  middle of every range, and the sub-elements are absent exactly while it is 0.
  `LEGEND_SHOW_FRAME` was already that plateau's far edge on `BackTo` (205);
  `LEGEND_HIDE_FRAME` is its near edge on `From` (95), the same rule read at
  the other end. M4d played the legend's `Hide` on the press instead;
  `beginFold` now defers it to frame 95. **Measured: legend leaves footage
  0.333 s, ours 0.367 s, d +0.033 s, now GATED at 0.1** (it was ours 0.067 s,
  d -0.267). A unit test re-reads both frames out of the scene as the
  plateau's two edges, so a scene change cannot move them silently.
  Two detector faults had to be fixed before the fix was visible, and the
  judge should check them as carefully as the fix: (a) `pressLegend` blooms the
  A glyph's highlight over its own 20-frame range, a bigger swing than the
  caption leaving, so the region mean locked onto the bloom - the measurement
  moved to `legendR`, the caption band that starts after the glyph; (b)
  `events().onset` fires at a tenth of each series' OWN span, which compares
  two ramps of different shape by different absolute amounts (the console drops
  5 luma in one sample where ours takes four) - `departs()` asks the one
  question that is the same on both, when the band stops being at rest, with a
  half-luma floor.
- **R1 (the name scroll): CLOSED as a measurement fault, no constant touched.**
  Measured with the same detector on both, the `qCur` band settles at **0.300 s
  on the footage and 0.267 s on ours, d -0.033 s** - one 30 fps sample - and it
  is now GATED at 0.1 s. Round 2's "~0.17 s" is the window where the name
  motion is LARGEST ([FRAME Yrt f07274-07279]), not where it stops. That the
  axis is right was already the finding of the three landmarks beside it in the
  same block (old strip gone +0.000, new front +0.022, second panel -0.033):
  the names ride that axis and there is no second name servo in
  `controlp/Variables.xur` to ride instead.
- **R2 (unfold-behind on B): OPEN, constants untouched, and now MEASURED
  rather than quoted - which changes the finding.** On the SECOND panel, the
  only one this suite has a region for, ours arrives in **0.167 s against the
  footage's 0.533 s** - a third of the time - where round 2's whole-cascade
  number had ours SLOWER (0.92 vs 0.67 s). Both follow from the file's own
  rate: `UnfoldEaseRange` is unset, so `dq/dt = 10 - 9.9q` eases across the
  whole move and is fast off q = 0 and asymptotic into q = 1 (one panel needs
  ln(100)/9.9 = 0.465 s to reach 1). The near panels snap and the far ones
  drag. So what is open is the SHAPE, not a speed, and the shape is what the
  code read gives; nothing here is tuned. Printed, not gated - this window's
  footage is a Rome profile page whose own panels share the band, so the
  absolute times are not like-for-like. **For the judge:** the measurement that
  would settle it is the last panel's arrival, and no offline capture isolates
  it from the page above.
- **R3: still unverifiable** (no footage of rapid presses exists).
- **R5: CLOSED** by N2 (every page).
- **A nondeterminism in the harness, not the shell, and the disclosure that
  fixes it.** The walker failed 28 gates on a COLD vite and none on a warm one.
  `settle()` watched `motion` and `transitions`, and none of the fold
  timeline's OWED work moves either: `pendingPage` waits for
  `PAGE_PUSH_FRAME`, the cascade for `UNFOLD_BEHIND_FRAME`, the legend for
  `LEGEND_HIDE_FRAME` / `LEGEND_SHOW_FRAME`, and a scene fetch is in flight
  besides. A settle loop could stop between the press and the page and read a
  shell that was neither at home nor on a page, and every later act then read
  that half-open state. `NxeReport.pending` names all four (additive; nothing
  reads it but the suites) and all three settle loops treat it as busy. A gate
  that only passes warm is not a gate.
- **Runtime changes: none.** `packages/runtime/src` is untouched; everything
  is in `dashboards/nxe/*`, `app/main.ts` (X/Y routing, two api entries),
  `tests/nxe.test.ts`, `tests/smoke/smoke-nxe.mjs`. COVERAGE B12 (a list row's
  Down fires `btn_Focus` twice on the skin's XuiList template) is REPORTED by
  the walker on `dashSysCslSetDisplay` and not gated: the template is the
  runtime's list machinery, shared with Blades.
- **Gates at this commit:** `npm run typecheck` clean over the whole tree;
  `npm test` **111/111** (the last is the legend-frame re-read above);
  `tests/smoke/smoke-nxe.mjs` **SMOKE_PASS** in full, and `SMOKE_NXE_ONLY=
  completeness` / `=footage` run the walker and the frame-by-frame block
  alone; `smoke-launcher` and `smoke-gallery` PASS unchanged (they are the two
  other suites that load the 9199 route).
- **2026-09-03, round 3 @ b274833: PASS** on all eight briefed items. The
  judge's own cold-vite walker mounted 50 pages by input (the suite's 50),
  pressed A on every row, found zero painted tokens on every page plus Sign
  In, the four roots and the Rome strip; spot-read the decoded tables in the
  image (locale count 0x25 @0x18d3c, hints @0x1a06c, Display records
  @0x7f0ae0, language labels @0x18bfc, TZ record 0 @0x7f0130); Sign In within
  1.17 px of Yrt f0268 and the counter top 579.0 vs 579.3; Games Library
  within 0.83 px of Yrt f0396; X/Y as recorded; btn_Select on 50/50 pushes;
  R1 closed (0.300 vs 0.267 s), R4 closed (0.333 vs 0.367 s), R2 accepted as
  a disclosed, ungated shape residual (start of the unfold-behind ~0.3 s vs
  ~0.6 s is its other half; UNFOLD_BEHIND_FRAME is inferred), R5 closed;
  settle-on-pending never read a half-open shell; the unmounted remainder
  carries a reason and case address per command. Findings: (F1) MEDIUM the
  Display page draws HDTV2TVSwitch.png over rows 5-7 - the SwitchImage group
  is authored under scnCurrentFormat (420x450 at 456,15) and belongs at
  ~(788,366) in the right pane; ours applies no parent offset; (F2) LOW three
  of 50 pops played snd_buttonback instead of legend_b's btn_Back,
  nondeterministic (setPageState returning false after a child walk?); (F3)
  LOW Recent Games' authored labEmpty ("You don't have any games in your
  library.") is not raised though codeUnfilled says it is; (F4) LOW
  2004_NetworkDetails' btn_IP/btn_DNS render blank with no codeUnfilled line.
  Observation: the queue bullet is present on the signed-out frames (Kpa
  f0048, Yv5 f0042) and absent on the signed-in ones; the Marker row should
  state the rule. Fixes pending with M4f.

### Closed in M4f (2026-09-03, uncommitted working tree)

Gates at the end of the pass: `npm run typecheck` clean over the whole tree;
`npm test` **120/120** (115 before M3f's five Blades additions landed in the
same tree); `tests/smoke/smoke-nxe.mjs` **SMOKE_PASS** in full and with
`SMOKE_NXE_ONLY=completeness`, against a dedicated vite on port 5391;
`smoke-boot` and `smoke-gallery` **SMOKE_PASS** (the two suites that prove the
shared-runtime edit is behaviour-preserving for 6770).

- **F1 (MEDIUM), the Display page's switch art: CLOSED, in both halves, and
  the second half's premise is REFUTED by the file.**
  - *(a) The console hides it, and now so do we.* 9199's equivalent of the
    Blades site Judge E read is `dashVideoSettings::UpdateCurrentSetting` at
    `0x92219790`: it opens with `SetShow(this+0x68, 0)` - `li r4, 0` at
    `0x922197ac`, then a SCHEDULED `stw r24, 0x50(r1)`, then `lwz r3,
    0x68(r27)` and `bl 0x922df968` at `+8` / `+12` - and re-shows it, `li r4,
    1` at `0x92219874`, only under the branch the resolution provider
    `0x92219328` takes when `XGetAVPack` (thunk `0x92740924`) returns 0, the
    same branch that writes `dashCSettingsStrings[571]` into `labAVPackInfo`
    (`li r4, 0x23b` at `0x92219430`). `dashSysCslSetDisplayHiDef.xur` carries
    the same art and the same rule in `dashVideoSettings_HD::OnInit`
    (`0x92219000`; hide `0x92219058`, show `0x92219180`). `OnInit` resolves
    the name into `this+0x68` (`addi r5, r31, 0x68` at `0x92219c00`, the wide
    literal "SwitchImage" at `0x92018160`). The reference console is on an HD
    pack - its Display metapane reads "1920 x 1080 / Widescreen / DVI" [FRAME
    Kpa f0377] - so the shell takes the non-zero branch. **Gated by the ink,
    as briefed:** the walker screenshots each page as it mounts and counts
    pixels under luma 40 in the box the art would fill (design x 330..500, y
    320..440; the picture's black cable is the only thing that dark in the
    list column). **0 dark pixels on both pages**, against the 626 the same
    detector counts under `&avpack0`. `__dash.nxe.legacy.hidden` carries
    `SwitchImage Show=false (avPack != 0: ...)` on both, and the state is in
    `hardwareState`.
  - *(b) There is no missing parent offset. The art is not under
    `scnCurrentFormat`.* `SwitchImage` is a DIRECT child of the DashScene root
    at (35, 170), with `XuiImage1` at (99, 66) 160 x 96.58 and `XuiLabel1`
    ("TV") at (124, 31); `scnCurrentFormat` (420x450 at 456, 15) authors
    **zero children** [SCENE, and a unit test re-reads both files]. The judge's
    ~(788, 366) is what the group WOULD reach with `scnCurrentFormat`'s origin
    added; the ink box the judge measured (x 391..491, y 325..429) is instead
    exactly what the file's own placement gives once the page's frame-solved
    origin (198.8, 114.7) is added - the label's cap at y 325.7 and the
    picture at 332.8..492.8 x 350.9..447.5. The code never moves it either:
    the whole class body `0x92218c00-0x92219c50` loads `this+0x68` **twice**,
    and both loads are the two `SetShow` calls (unit test). Under `&avpack0`
    the art is measured three ways: its DOM box (332.797, 350.859, 160,
    96.5625) against the authored (332.80, 350.87, 160, 96.58), <= 1 px on
    every edge; its dark ink (334..452 x 355..424) inside that box; and
    `dashCSettingsStrings[571]` painted in `labAVPackInfo`.
  - *The mechanism a nested scene's origin uses, since the judge asked.* There
    is none to fix: a `XuiScene` is an element and its children lay out
    against its box like any other parent's. 46 of the 311 scenes author a
    nested `XuiScene` WITH children; two are on hosted pages, and both are now
    measured in the suite: `network/NetworkMain.xur`'s `Menu` lands at page +
    (10.02, 15.00) against an authored (10.022629, 15.014046) and `ConnectBar`
    at + (45.02, 310.00) against (45.022629, 310.014046);
    `network/2004_NetworkDetails.xur`'s `Tab1` / `Tab2` land at + (0.16, 70.00)
    against `Scene_Tabs`(-136.85762, -126.004822) + (137, 196) = (0.14, 70.00).
  - *The sweep for the same class of misplacement on every other hosted page.*
    A DOM detector now runs on the FIRST visit to each page in the walk: any
    `img` / `svg` inside the hosted scene that is not the page-sized background
    plate, is not inside any list, and overlaps a list's box by more than
    400 px2. **0 of the 50 pages** report one. The detector is not vacuous -
    run against `&avpack0`, where the console's own code does show the art, it
    reports `XuiImage1` over `lstSettings` / `listOptions` by 15450 px2 on 2 of
    2 pages. The one page it had to be taught about is
    `consoles/dashSysLiveVision.xur`, which authors three lists 74 tall on a
    53 pitch (575,395 / 575,448 / 575,501), so each list's OWN focus highlight
    lands inside its neighbour's box; art belonging to any list is excluded and
    the reason is in the check.
- **F2 (LOW), the three `snd_buttonback` pops: CLOSED, cause isolated, and it
  was neither `setPageState` nor a race.** A scope id is the chain of element
  Ids from the canvas down (`pathOf`), and **a child page can root on its
  parent's scene Id**: `dashSysCslSetClock.xur` and its `ClockFormat`,
  `ClockTimeZone` and `ClockDaylightSavings` children are all `scClockSettings`;
  `PControlPasscode` and `PasscodeHint` are both `scRating`;
  `2004_NetworkDetails`, `2016_EditIPSettings` and `2033_DNSConfig` are all
  `Scene_Main` [SCENE]. Mounted beside its parent, the child's controls got the
  PARENT's scope ids, so they never bound (`bindTimelines` skips an id the
  engine already has) and popping the child removed the parent's scopes - after
  which the parent's next B found no `legend_b` to press and fell back to the
  table cue. **Those three parents are exactly the three pops the judge saw**,
  which is why it looked nondeterministic: it depends on which child was
  visited first. `renderInto` now hands `renderElement` a per-mount `pathKey`
  for the scene root only (`NodeRecord.pathKey`, consumed by `pathOf`); unset
  everywhere else, so no id inside any scene changes. **Gated:** the walk now
  requires the carrier's own `btn_Back` on EVERY pop of a legacy page (a pushed
  ROOT has no carrier and plays the table cue, and is gated on that instead),
  and it asserts that the three parents above were walked, so the case is
  exercised. Judge E's related Blades finding is closed too on the NXE side:
  B's carrier is now whatever binds `PressKey` 0x5841 under any Id, and failing
  that any `XuiBackButton`, which is B's carrier by class - 62 of the build's
  70 back buttons author the key and the eight that do not are named in
  `pageFocus.findBackButton`.
- **F3 (LOW), Recent Games' `labEmpty`: CLOSED by raising it, not by
  correcting the disclosure.** The panel's refresh (`0x92271da0`) enumerates
  the title database into at most ten rows; with none it disables `legend_y`
  and `legend_a` (`SetEnable(this+0xcac, 0)` at `0x92271f04`, `(this+0xca8, 0)`
  at `0x92271f10`) and raises `labEmpty` (`this+0xca0`, resolved at
  `0x922710f0` from the wide literal at `0x9201eec0`; `SetShow` true at
  `0x92271f48` -> `0x92271fcc-0x92271fd0`, false at `0x92271fc8` when there are
  rows) [CODE, unit test]. No title is installed here, so that is the console's
  own state. **Gated:** the Games Library strip paints "You don't have any
  games in your library.", `hidden` carries `RecentGamesFilterPanel.xur:
  labEmpty Show=true`, and the hoisted legend's live flags read
  `AButton:false BButton:true YButton:false`. `CODE_LISTS_NOT_FILLED_9199`'s
  line no longer claims a label it was not drawing.
- **F4 (LOW), `2004_NetworkDetails`' `btn_IP` / `btn_DNS`: CLOSED - the code's
  offline text IS in the XUS tables, so it is shown.** `C2004_NetworkDetails`
  resolves the two buttons at `0x92291af8` and writes their lines from
  `network/Strings.xus` through the `C4LineBtn` setters `0x92290be0` / `c20` /
  `c60` / `ca0`: `li r3, 0x2d..0x30` at `0x922913a8-0x922913f4` for `btn_IP`
  ([45] "IP Settings", [46] "IP Address", [47] "Subnet Mask", [48] "Gateway")
  and `li r3, 0x29..0x2c` at `0x9229154c-0x92291598` for `btn_DNS` ([41] "DNS
  Settings", [42] "Primary DNS Server", [43] "Secondary DNS Server", [44] the
  empty string) [CODE, unit test, which also re-reads the seven strings out of
  the table]. The right-hand values - "Automatic"/"Manual" and four
  `%d.%d.%d.%d` addresses - are the network configuration this archive has no
  reading of, and the table has no "no network" caption for them, so they stay
  blank. **Gated:** the page's rows read `IP Settings|DNS Settings`, all seven
  captions are painted, `codeFilled` names the table and the indices and
  `codeUnfilled` names the values on both buttons.
- **The Marker row now states the rule, as asked.** `PLACEHOLDERS.md`'s
  `Marker2` row records that the bullet is drawn while the console is SIGNED
  OUT and not while a profile is signed in - present on [FRAME Kpa f0048] and
  [FRAME Yv5 f0042], absent on [FRAME Yrt f0483], [f0268], [f0484] and [FRAME
  Kpa f05585] - that the shell is signed out and so draws it, and that which
  profile property the code reads for it was not traced. Two more rows are
  added for the work above (the AV pack behind the switch art; the
  code-written captions beside the code-driven lists) and the Rome row now
  says the empty Recent Games state is drawn rather than only described.
- **Shared-runtime changes, and why they are safe for 6770.** Two, both
  additive and both no-ops unless a caller opts in: `Opts.pathKey` on
  `renderElement` and `NodeRecord.pathKey` read by `pathOf` (only
  `NxeShell.renderInto` sets it), and `DomRenderer` passing it through.
  `smoke-boot` and `smoke-gallery` PASS. `packages/runtime/src/ui/ListView.ts`
  in the same working tree is M3f's Blades fix, not this pass's.
- **Not closed, and said so.** COVERAGE B12 (a list row's Down firing
  `btn_Focus` twice on the skin's `XuiList` template) is still reported and
  ungated on `dashSysCslSetDisplay`; it is the shared list machinery and M3f
  owns it. R2's shape residual and the inferred `UNFOLD_BEHIND_FRAME` are
  unchanged. What the AV-pack-0 branch would also do - the row builder at
  `0x92218cf8` rewriting each Display row's present / enabled field - is NOT
  applied under `&avpack0` and says so in `__dash.nxe.codePaths`.

- **2026-09-03, Judge E round 3 @ b274833: FAIL.** Reproduced (typecheck 0,
  111/111, Blades suites green); the judge's own walker drove 5 blades, 51
  pages, 447 screens, A on every row and every option row on 18 of 20 option
  pages, re-disassembled every press handler (Screensaver 0x1000/0xa, Auto-Off
  0/0x168, Startup masks, Remote nibble, audio flags, DST bit 2, parental,
  rating via 0x921c7b38, Output Levels 1/2/3, all ending in bl 0x921b5428) and
  found them as claimed; 0 painted tokens on 447 screens. Findings: (1) HIGH
  every page pushed from the Games and Media blades is drawn offset by the
  blade container's position (MediaSourceSelection's labelHeader authored at
  156,96 paints at 415,248 = Tab4/scBlade/scContainer's 258,151; arcade pages
  carry Tab3's 221,151) because push() hosts the page at scContainer; the
  System blade is the only one hosted at the canvas origin; (2) HIGH
  selecting Time Format, Time Zone or Daylight Saving (A or B out) leaves
  the Clock page blank: the four scenes share the scene Id scClockSettings,
  back() keys transitions by scene Id, so the popped page's teardown removes
  the PARENT's TransBackTo FadeIn inside its hidden frames; the same
  collision waits on PControlPasscode → PasscodeHint (both scRating); (3)
  MED Date and Time shows "14 : 24 PM" in 24-hour mode where the console
  hides lstAMPM (0x921cc8b4-0x921cc8bc) and the year spinner paints "2..."
  for a four-digit value; (4) MED the Display page draws the TV/HDTV switch
  art on the HD reference state where UpdateCurrentSetting (0x921c6f30)
  hides SwitchImage and re-shows it only on the AV-pack-0 branch; (5) MED
  MediaSourceSelection paints "Please wait" beside "No computers found." -
  two labelPleaseWaitText, findById hid the wrong one; (6) MED B only
  presses a control literally named legend_b, so MSS (navB), the arcade
  pages and System Info (btnB) play no Press and no btn_Back; (7) LOW
  missingStrings: dashSysCslSetPControl PanelStrings[8] (btnDone) is empty
  without a CODE_FILLED reason. Could not verify: Time Zone's per-row writes
  (the list wraps), PControlContent's two rows, the Family Timer off row,
  the Passcode blank-page case. Fixes pending with M3f.

### Closed in M3f (Blades 6770), with the measurement for each

Gates at this working tree: `npm run typecheck` clean; `npm test` **120/120**
(five new: the transition-scope keying, the list-row span rule and its two
numbers re-read out of `dashuisk/skin.xur` and `dashSysCslSetClockTime.xur`,
the B carrier's three names, and all 75 Time Zone rows);
`tests/smoke/smoke-nav.mjs` **SMOKE_PASS** with a new `§9` block (`[m3f]`) and
two new gates inside `§8`'s own A and B helpers, so EVERY pop of the walk is
gated; `smoke-blades`, `smoke-timeline`, `smoke-boot`, `smoke-input`,
`smoke-launcher` **SMOKE_PASS** unchanged.

- **(1) HIGH, the offset pages: CLOSED.** `push()` hosted the page at
  `from.node.parentNode`, which on Games and Media is the panel scene's own
  parent - `TabN/scBlade/scContainer` at (221,151) / (258,151) - while the
  System blade's level 0 is `Tab5/System`, whose parent is already the canvas.
  `pageHost()` now hosts every pushed page at `TabN` after checking it is at
  the canvas origin, which is the shell's own `renderInto` rule (a
  second-level scene declares the full 1120x770 canvas, so its authored
  coordinates ARE the dashboard's). **Measured in DESIGN space** - the offset
  chain up to the 1120x770 `.xui-canvas`, so the number is the .xur's own -
  MediaSourceSelection's `labelHeader` **(156,96)**, the Arcade home's
  `txt_Header` **(156,96)**, both identical to Console Settings' `labHeader`
  **(156,96)** on the System blade (smoke-nav §9a, three gates).
- **(2) HIGH, the blank page after a pop: CLOSED, and the cause was wider than
  the transition.** Every scope id in this runtime is `pathOf` - the chain of
  element Ids down to the node (`NodeIndex.scope`) - so two scenes with the
  same root Id mounted under one host had the SAME ids for every timeline
  under them, not just for the transition: the child's `bindTimelines`
  replaced the parent's scopes in the engine and the child's teardown removed
  them. `BladeShell.renderInto` now gives every mount's root its own
  `pathKey` (root Id @ file # serial, the runtime hook M4f added for the same
  collision on 9199), and `transitionKey` is the node path rather than the
  scene Id. **Measured:** after A on Time Format the Clock page's
  `scClockSettings` root is `display:""` / `opacity:""` where it was
  `display:none` / `opacity:0`, and the engine carries **11** scopes under
  that page (its four option buttons, its four legends, its metapane, its two
  transitions) where it carried **5** before. Gated three ways: (a) the page
  underneath is on screen and painted after EVERY pop of §8 and §9 (the A and
  B helpers, ~40 pops); (b) the Clock menu's own body ink, with the same
  detector before the push and after each of the three pops - **9.49%
  painted, 9.09 / 9.62 / 9.66% after the three pops, and 0.00% with the
  page's root hidden**, which is the round-3 failure state produced on
  purpose to calibrate the detector; (c) the pass-code half - Passcode →
  PasscodeHint, both `scRating` - **12.42% before, 12.02% after**, plus its
  screenshots. The console's own answer to the same question with the same
  detector, from the only capture of an option page being opened, written and
  popped: **[FRAME 8498 f2173 → f2179 → f2181] the row column's ink goes
  2.52% → 5.49% → 7.57%** as the parent page comes back.
- **(3) MED, 24-hour mode and the year: CLOSED.** `dashCTime`'s init hides
  `lstAMPM` in the 24-hour branch (0x921cc8b4-0x921cc8bc, `Show(this+0xc, 0)`)
  and runs the hour spinner 0..23; the shell now does the same, and the
  spinner page shows **five rows, not six** (§8f's gate updated, and a hidden
  control is not focusable, so Right from the minutes stops there). The
  "2..." was the LIST machinery, not the presenter: `ListView` gave every row
  the LIST's width, and `List_VerticalSpin`'s template row is 83 wide,
  LEFT|RIGHT, inside a 53-wide visual, so on the 75-wide `lstYear` the row has
  to be 83 + (75 - 53) = **105**. `rowSpan()` runs the same anchor rule
  `applyAnchor` runs for everything else, on the x axis only. **Measured:**
  the year row is **105 px wide** and its text element's content width equals
  its box width (**71 = 71**, no ellipsis), painting "2025"; the Console
  Settings list is unchanged at 423 (its template is 420-in-420 on a 423-wide
  list, which is what the old rule happened to give). The two template numbers
  are re-read from `dashuisk/skin.xur` and the scene in a unit test.
- **(4) MED, the switch art: CLOSED.** `arriveDisplay` applies
  `UpdateCurrentSetting`'s own order: hide `SwitchImage` (0x921c6f30-0x921c6f40)
  and re-show it only where the resolution provider took the `XGetAVPack == 0`
  branch (0x921c6ffc-0x921c7004). The pack is a READING of two frames, in
  `displaySettings.REFERENCE_AV_PACK` with its reasoning: f0053's "1080p" is
  only formattable on the 4/6/8 branch of 0x921c6c40 and its value carries no
  PAL line, which 0x921c6548 suppresses for exactly those packs. **Measured:**
  `SwitchImage` is not visible on the Display page and
  `__dash.shell.hardwareState` names the pack, the source and both addresses
  (§9f). New PLACEHOLDERS row.
- **(5) MED, "Please wait": CLOSED.** The scene authors the id TWICE - once
  inside `WmcConnectingScene`, once on the page at (350,250), bound at
  0x921a9de0 as the enumeration's wait state - and `findById` hid only the
  first. `findAllById` hides every copy, and the disclosure now names the
  page's own pair, where the code binds it, and the three sub-scenes the
  metapane switches between (0x921aac44-0x921aac58). **Measured:** the page
  carries exactly **two** `labelPleaseWaitText`, both not visible, with
  `NoComputersScene` shown and the other two down (§9b).
- **(6) MED, the B button: CLOSED, and the fallback with it.** `back()` now
  resolves the control that binds `XuiBackButton`'s `PressKey` 0x5841 the way
  `pressKey()` resolves X and Y, so `navB`, `btnB` and `legend_b` are all
  found. It also no longer presses the page UNDERNEATH's back button when the
  top page has none: ~~**176 of the build's scenes carry a 0x5841 carrier and
  ten do not** (dashmain and nine wait / progress / confirm screens -
  `oobe/oobeProfileCreation`, `download/2407_WaitingScreen`,
  `memory/OperationProgress`, ...), and every one of those authors its four
  legends as `XuiLabel`s with `Enabled=false`~~ **- that survey was wrong in
  both halves and is corrected under "Closed in M3g" below: 176 carry and 87 do
  not, 16 of them full-canvas, under five names in two classes, and only
  `oobeProfileCreation` has the `XuiLabel` legends.** The behaviour it fixed is
  right either way: a page that offers no B presses
  nothing, while B still navigates back. The new `ShellReport.backCarrier`
  names the carrier, and the suite gates **btn_Back played === a carrier
  exists** on every pop of §8 and §9, with the id asserted on the four pages
  that call it something else (`navB` on MediaSourceSelection, `btnB` on the
  Arcade home, on 2502_TwistSelectorScene and on System Info).
- **(7) LOW, the empty PanelStrings[8]: CLOSED.** `btnDone`'s metapane is the
  whole staged block in one label: 0x921bd0b0's btnDone branch
  (0x921bd1c8-0x921bd298) reads the five current values (0x921bb420 game,
  0x921bb588 video, 0x921bb718 Xbox LIVE access, 0x921bb780 memberships,
  0x921bb860 family timer), sprintf's them into `dashCSettingsStrings[447]`
  and writes `labDoneSummary`. That is its `CODE_FILLED_PANEL_STRINGS` reason.
  **Measured:** with `btnDone` focused, `missingStrings` is empty and
  `hardwareState` carries the line with its address (§9g).
- **What the judge could not verify, now covered.** *Time Zone's per-row
  writes:* driven by INDEX, since the list wraps - rows **0, 1, 74 and 37** of
  75 each reached by `(target - focused) mod 75` Downs, each writing its own
  index and labelling the Clock menu with its own string ("GMT-12 Tokelau",
  "GMT-11 Samoa", "GMT+14 Kiribati", "GMT+03 Kuwait"), and a unit test walks
  all **75** rows through `write` / `current` / `label` including the
  daylight-saving bit each zone sets (§9h). *PControlContent:* two rows,
  `btnYes` authored at y 153 and `btnNo` at y 198, arriving on `btnNo` with
  the block unknown; `btnNo` writes **0xff** and `btnYes` **0**, and the menu's
  Current Setting follows the 408/409 pair. *The Family Timer:* one row,
  "Family Timer is off" (count 1 at 0x921cb5e0, string 383 at 0x921cb4b0),
  three captioned frequency radios, and its own `btnB`. *The pass-code case:*
  the hint page opens off `navHintQ`'s PressPath with its five questions
  (0x92015320), A writes the row index and pops, and the Passcode page comes
  back painted - measured above and screenshotted before, during and after
  (`tests/smoke/out/m3f-passcode-*.png`).
- **Runtime changes, and 9199.** Two of mine, one of M4f's, all shared:
  `ListView`'s `rowSpan` (new), and `pathOf` reading `NodeRecord.pathKey` with
  `DomRenderer` passing it through (M4f's, for the same Id collision on 9199,
  used here too). `rowSpan` is the only one that can move a pixel, so every
  `XuiList` / `XuiCommonList` in both corpora was surveyed against its
  template - **86 lists in 6770, 14 of which the rule moves; 89 in 9199, 17**:
  the six clock spinners (the fix), the Family Timer's `lstTime`, LiveVision's
  three chooser lists, `music/1030_EditPlaylist`'s three icon columns, the
  picture grid, and on 9199 three achievement grids. Every OTHER list keeps
  the width it had, because its template is `control_ListItem` 420-in-420 and
  the delta is the list's own. Of the fourteen, this dashboard mounts three
  with rows offline, and all three follow from the same anchor read: the year
  spinner **75 → 105** (the finding), the Family Timer's single row **420 →
  373 at x 22** (its template is anchored TOP|BOTTOM only, so it keeps its
  authored frame and the spinner's arrows sit outside it) and LiveVision's
  three disabled chooser rows **480 → 419 at x 31** (239-in-300 stretched by
  the 180 delta), all three measured in the browser. No footage shows the last two, and they are disclosed here
  rather than gated. **On 9199 two pages DO move** - the summary that said
  nothing there moves was wrong, and Judge G round 4 caught it by diffing
  every page against its round-3 screenshot (45 of 50 pixel-identical, three
  diffs expected from F1 and F4): `dashSysLiveVision`'s three disabled
  chooser rows **480 at x575 → 419 at x606** and `dashSysCslSetClockTime`'s
  `lstAMPM` **70 → 72 wide** ("AM" ink centre 845.0 → 846.0). Both are the
  `rowSpan` anchor read, not `pathKey`; neither page has footage, so which
  geometry is the console's is unknown and neither is gated.
  `tests/smoke/smoke-nxe.mjs` **SMOKE_PASS** after the change.
- **Not closed, stated.** COVERAGE B12 (a list row's Down firing `btn_Focus`
  twice on the skin's `XuiList` template) is untouched: §8a still gates one
  `btn_Focus` per Down on Console Settings, and the double is only reported by
  the NXE walker on `dashSysCslSetDisplay`. The metapane text's 3-6 px
  vertical offset is unchanged and still printed by §8a. Which of AV pack 4, 6
  or 8 the reference console runs, no frame separates.
  **One thing this pass FOUND and did not fix**, because it is neither in the
  seven nor caused by them: `consoles/dashSysLiveVision.xur`'s three
  `XuiListChooser_No_Kill` lists each draw TWO rows stacked on one another
  (the six §8h counts) where a chooser shows one value between its arrows.
  That is the window arithmetic in `ListView.layout` against a chooser
  template's height, it predates M3f (the row WIDTH is all that moved here),
  and no capture of that page exists to fit it against.
- **2026-09-03, Judge G round 4 @ 9bc9e3d: PASS.** Gates reproduced (typecheck
  0, 120/120, smoke-nxe full and completeness, smoke-boot, smoke-gallery). The
  judge disassembled 0x92219790 itself: the SetShow(SwitchImage, 0) at
  0x922197ac is unconditional and the re-show at 0x92219874 sits behind two
  branches whose flag is written 1 only where string 571 is loaded; ink over a
  box wider than the suite's reads 0 on both Display pages and 626/627 under
  `&avpack0`. **Round 3's F1(b) is withdrawn by the judge**: SwitchImage is a
  direct child of scDisplaySettings at (35,170) and scnCurrentFormat has zero
  children; the live DOM places the group at page origin (198.80,114.69) +
  (35,170) exactly, so the proposed ~(788,366) would have been wrong. The
  overlap sweep is not vacuous (all 50 pages carry 4-165 candidate pictures,
  22 carry both a list and loose art, 0 overlap; the `&avpack0` control
  reports 15450 px² on 2 of 2). F2 verified deterministically over two visit
  orders: 50 pops each, 0 without the carrier's btn_Back, all three
  Id-collision parents exercised. F3 and F4 verified independently (the judge
  re-read li r3,45..48 at 0x922913a8 and 41..44 at 0x9229154c and the XUS
  strings). Findings, all LOW: (1) the claim that nothing on 9199 moves under
  rowSpan was wrong - dashSysLiveVision and dashSysCslSetClockTime move
  (corrected above); (2) the sweep's overlap arm is weakly exercised on 20 of
  22 eligible pages (their only loose art is the legend glyphs far below the
  lists); (3) the queue-bullet rule is stated but the profile property that
  drives it is untraced. Could not verify: that 0x92740924 is literally
  XGetAVPack (no ordinal table; the string it loads settles the semantics),
  the new LiveVision/AM-PM geometry (no footage), and LiveVision's
  two-rows-stacked chooser (reproduced, nothing to fit against).
- **2026-09-03, Judge E round 4 @ 9bc9e3d: FAIL.** Reproduced (typecheck 0,
  120/120, four Blades suites); the judge's walk of 447 screens found 21
  findings where round 3 found 34, 0 painted tokens, and empty
  missingStrings/unresolvedPresses. **All seven round-3 findings verified
  closed** by its own measurement, not the implementer's: every pushed page's
  root at (0,0) of the canvas on every blade that pushes one; the Clock page
  18 leaves / 2,170,284 px painted before the push and identical after every
  pop on all three collisions, popped both ways, 0 leaves with the root
  hidden; five spinner rows with lstAMPM hidden and the year row 105 px
  painting "2025"; SwitchImage display:none with the binary confirming
  this+0x70 and the AV-pack-0 arm; two labelPleaseWaitText both hidden;
  btn_Back exactly where a carrier exists; btnDone's string 447 read at
  0x921bd1c8. Round 3's unverifiables are now verified (Time Zone rows
  0/1/74/37/24 each writing their index and DST bit with labCurrentSettings
  following, PControlContent's btnYes/btnNo writing 0/255, the Family Timer's
  row and radios). NEW findings: (1) HIGH the blade's own header and legends
  paint THROUGH every page pushed from the Games and Media blades - the
  arcade home reads "GamesGaLibrrary" with two X/Y pairs and "Select" twice,
  MSS reads "Select Sderdia" - because push() never hides the level it pushes
  from and hosting at TabN laid the page's header on the blade's; round 3's
  258 px offset was masking it; the System blade is clean only because its
  chrome belongs to the pushed scene [6717 f0053 shows one header, one legend
  set]; (2) HIGH System Info paints another screen's authored text ("Do you
  want to reset your console?") where the console's init at 0x921c8568
  formats dashCSettingsStrings[546] into edInfo and SetTexts it at
  0x921c879c - undisclosed anywhere, and the token gate cannot see prose;
  (3) MED LiveVision's three choosers do draw two rows stacked (480x74 list,
  33-tall template, visibleCount 2), pre-existing and ungated; (4) LOW the
  round-3 carrier survey was wrong in both halves - 87 scenes lack a carrier,
  not ten (16 of them full-canvas pages), and the ids are five (legend_b 107,
  btnB 54, navB 8, legend_B 4, backButton 3), not three; four network scenes
  author an enabled XuiBackButton with no PressKey that the rule cannot find
  (none reachable offline). Could not verify: the exhaustive origin sweep of
  all 40 System-blade pages (12 measured, all (0,0)), which AV pack the
  reference console runs, whether the doubled chrome also affects
  oobeProfileCreation. Fixes pending with M3g.

### Closed in M3g (2026-09-03), with a measurement per finding

- **(1) HIGH, doubled header and legends: CLOSED.** The console's rule is
  `XuiSceneNavigateForward(HXUIOBJ hCur, BOOL bStayVisible, HXUIOBJ hFwd, BYTE
  UserIndex)` at **0x921534e8** (BLADES_GLUE_SPEC §3.4 writes it as
  0x921536e8, which is +0x200 and lands mid-body of the NEXT function - that
  section's whole `.text` column came from `tools/ppc-dis.ts`, which prints
  `.text` VAs 0x200 high; LEARNINGS "The extracted basefile.exe is
  flat-mapped, and its section headers lie". Every address below is flat-mapped,
  like the rest of `dashboards/blades/*.ts`). Its tail at
  **0x9215369c-0x921536b8** is the finding: `cmpwi cr6, r27, 0` on
  bStayVisible, `li r4,1` when it is false, then `bl 0x921531a8` on the scene
  navigated FROM — the source scene is put into state 1 unless the pressed
  control asked to stay. `NavigateToScenePath` (**0x921a5a28**) passes
  `hCur = lwz r3, 4(this)` and `bStayVisible = 0x9214d1f8(pressedControl)`
  (bit 0 of the control's +8 = `XuiNavButton.StayVisible`), and the build's
  other forward path (0x921a5328) hard-codes `li r4, 0`. **No control in build
  6770 authors StayVisible at all** (own sweep, 263 scenes, zero occurrences),
  so every push hides its source.
  WHICH scene that is, is scene data: the five blade scenes author transition
  properties and the panels parented into their `scContainer` author **none** —
  `Tab1/scMarketplace` and `Tab6/scOOBE` all four, `Tab2/scBlade`,
  `Tab3/scBlade`, `Tab4/scBlade` and `Tab5/System` `TransBackTo=FadeIn`, which
  is the visual a scene plays when a page pops back TO it. Those five are
  exactly what carries the blade's header and its four legends, which is why
  the System blade was already clean (`Tab5/System` IS its level-0 node) and
  the others were not. `BladeShell.navScene()` now returns the blade scene at
  level 0 and the page's own scene above it, and both transition roles target
  it; the page is still parented at `TabN`, a SIBLING, so hiding the blade
  scene never touches the page.
  **Measured** (`smoke-nav` §10a, design px, on every blade that pushes):
  | with a page up | headers painted | legend glyphs | "Select" in the band |
  |---|---|---|---|
  | tab3 + `arcade/2500_LiveArcadeHome` | 1 — "Games Library" @(156,96) | 4 | 1 |
  | tab3 + `oobe/oobeProfileCreation` | 0 (it authors none) | 4 | 0 |
  | tab4 + `dashcomm/MediaSourceSelection` | 1 — "Select Source" @(156,96) | 4 | 1 |
  | tab5 + `consoles/dashSysCslSet` | 1 — "Console Settings" @(156,96) | 4 | 1 |
  Before the fix the same probe read TWO headers ("Games" + "Games Library",
  "Media" + "Select Source"), nine legend text boxes and eight glyph discs.
  B restores the blade's own header and its four glyphs on every one
  (`TransBackTo=FadeIn`), and the whole walk of §10b gates "at most one header,
  at most four glyphs" on all 40 System-blade pages.
  **oobeProfileCreation, which the judge could not check: it WAS affected.** It
  authors no header, so nothing collided there, but the Games blade's five
  legend text boxes and four discs painted over its own four
  `XuiLabel Enabled=false` legends — eight discs where the console draws four.
  It now shows its own four alone.

- **(2) HIGH, System Info's authored prose: CLOSED, and the string is 545, not
  546.** `edInfo` exists in exactly ONE scene in the build and `dashSystemReset`
  is that scene's `ClassOverride` and nothing else's, so 0x921c8568 is its init.
  It formats one of TWO strings, and the branch at **0x921c86f4** is the
  IPTV-provider predicate: `0x90(r1)` is filled only when **0x9226e7d8()** ≥ 0
  (0x921c85ac-0x921c85bc), and 0x9226e7d8 is the same call that hides
  `navIPTVSettings` (BLADES_GLUE_SPEC §3.4's 0x9226e9d8, +0x200). With a
  provider it is `dashCSettingsStrings[0x222 = 546]` with the extra
  `%s GUID: %hs`; **without one it is [0x221 = 545]**, four args. The reference
  console has no IPTV provider (seven System rows, [FRAME hi f0051]), so 545 is
  what the page paints. Its fields: serial (`0x9273a9cc(0x14)` at 0x921c85d4,
  whose failed read stores the empty string at 0x921c85d8-0x921c85e8), console
  id (`0x9273ab7c` at 0x921c85f4), the copyright year **2008 from the code
  literal `li 0x7d8`** at 0x921c8730, and the `D:` line built by 0x9273aa1c
  from 0x92016908 `"%s - K:%d.%d.%d.%d (BK:%d.%d.%d.%d) X:%04X-%04X-%04X-%04X"`
  over the version literal 0x920168fc `"2.0.6770.0"` and the records at
  0x92000b08 / 0x92000ccc — which are XEX import thunks the loader patches, so
  this archive carries no firmware version at all.
  **Measured** (`smoke-nav` §10c): `edInfo` now paints
  `"Console Serial Number: / Console ID: / Xbox 360™ video game and
  entertainment system / © 2008 Microsoft Corporation. All rights reserved. /
  Warning: This computer program is protected by copyright law… / D:"`, the
  reset prose is gone, `codeFilled` names `dashCSettingsStrings[545]` and the
  branch, and the **three** fields the archive cannot supply are disclosed in
  `hardwareState` with their read addresses (they were disclosed nowhere).
  **The sweep the finding asked for, done independently:** every authored
  `Text` of 40+ characters over all 263 scenes — 127 of them (corrected in
  M3h: `arcade/250x_EZPassScene` carries TWO `lblInfo` labels), 34 on the 50
  reachable pages. `edInfo` is the only one whose prose belongs to another
  screen; no reachable page repeats another scene's prose; the single
  page-string that also appears in a `.xus`
  (`arcade/250x_FriendsPlayingNowScene#labEmpty` = `arcade/Strings.xus[50]`) is
  its own page's. The registry is `systemInfo.ts`'s `CODE_WRITTEN_TEXT`, a unit
  test asserts it quotes the scene file verbatim, and §10b's walk fails if any
  of that prose is painted on any page it reaches.

- **(3) MED, LiveVision's stacked choosers: CLOSED.** The console's rule is in
  the skin: `XUI_SCROLLEND_DIRECTION` is UP 0, DOWN 1, LEFT 2, RIGHT 3 [xui.h
  1874-1880], and a list template's scroll ends say which axis it windows on.
  `XuiList` authors control_ScrollUp / control_ScrollDown (0, 1);
  `XuiListChooser_No_Kill` (300x60, a 239x33 row at x 30.5) authors
  **ScrollLeft / ScrollRight (2, 3)** and is a horizontal chooser — one value
  between two arrows. `ListView.visibleCount` is now the same arithmetic on
  whichever axis the template names: `floor((480 − 30.5) / rowSpan 419) = 1`
  where `floor(74 / 33)` said 2. Four lists in each build name a horizontal
  template and no other does; the other one, the Family Timer's `lstTime`, was
  already answering 1 and still does.
  **Measured** (`smoke-nav` §10d, design px): each chooser draws ONE row,
  419x33 — Brightness @(539,412), Lighting @(539,465), Flicker @(539,518) — and
  "Dark Wall" / "Incandescent" / "On" are no longer painted under
  "Auto (Default)". Family Timer: one row, 373 wide, unchanged.
  **9199 MOVED, and it is measured** (`smoke-nxe`, new gate): the same three
  choosers now show one value each; the row keeps the **419-wide span at design
  x 606** that Judge G round 4 recorded, so nothing Judge G measured has moved
  — only the second row is gone. `smoke-nxe` is SMOKE_PASS. Two smaller
  corrections ride with it: a scroll end's anchor delta is now the LIST against
  its OWN template visual (it was hard-coded to XuiList's 420x74, which put the
  chooser's right arrow 120 design px inside the list), and the scroll ends are
  driven by the template's own ids (`ScrollLeft` / `ScrollRight`, not
  `control_ScrollUp` / `control_ScrollDown`). `m3e`'s camera gate went from
  "6 rows" to "3 rows, one per chooser" — that count WAS the defect.

- **(4) LOW, the carrier survey: CLOSED, re-surveyed and now gated by a test.**
  Own sweep of all 263 scenes: **176 carry a PressKey 0x5841 control, 87 do
  not; 187 declare the full 1120x770 canvas and 16 of those have no carrier**.
  The ids are five — `legend_b` 107, `btnB` 54, `navB` 8, `legend_B` 4,
  `backButton` 3 — and the CLASS is not constant either: 172 `XuiBackButton`
  and **four plain `XuiButton`** (`network/2010_TestingNetwork`,
  `2011_TestingLAN`, `ConnStatus_2010`, `ConnStatus_2011`, all called
  `legend_b`), so the binding can be neither the name nor the class. The
  runtime already resolved by PressKey and so needed no change; the unit test
  now exercises all five ids in both classes, and a corpus test asserts every
  number above so a wrong count cannot survive in prose again. The 16
  carrier-less full-canvas scenes are not one shape (six author no legend band,
  five author a `legend_b` that is `Enabled=false`, `oobeProfileCreation`
  authors four `XuiLabel` legends, four network scenes author an enabled
  "Back"), and the round-3 claim that they all use `Enabled=false` XuiLabels is
  corrected in `keyCarrierOf`, `LEARNINGS`, `JUDGE` and the suite.
  **What B does on a full-canvas page with no carrier, decided with evidence:**
  it presses nothing and still pops, and the four network scenes are not a gap
  in the rule. **`XuiButton.PressKey` defaults to 22592 = 0x5840 =
  `VK_PAD_A_OR_START`** [xui.h 551, reference/xzp-tool/XuiElements.xml:69];
  `XuiBackButton` derives from `XuiButton` and adds no PressKey of its own, and
  an unset property in a XUR is the class default — so those four `legend_b`s
  bind **A**, not B. The corroboration is that no `legend_a` anywhere in the
  build authors a PressKey while every `legend_x` / `legend_y` authors 22530 /
  22531: A needs no binding. Those pages therefore have two controls on A and
  none on B, which is an authoring slip in the build. XUI does export
  `XuiControlIsBackButton`, so its input router may reach a back button by
  class, but that router is in `xam.xex` and is not in this archive; none of the
  four scenes is reachable offline. Disclosed in PLACEHOLDERS.md rather than
  guessed.

- **Also closed: the origin sweep the judge's Chrome died in the middle of.**
  §10b now walks the System blade to depth 5 and reaches **all 40 pages**;
  every pushed page's mount is at **(0,0), 1120x770**. One thing the 12-page
  sample would have hidden: **ten of the forty author a scene `Position` of
  their own** inside that canvas — `dashSysCslSetStartUp`, `Screensaver`,
  `RemoteC`, `AutoOff` (−1,−1), `BackgroundDownloads` and `PControlVideo`
  (−2,−1 / −2,−3), `PControl` and `PControlVideoExplicit` (0,−1),
  `PControlFamilyTimer` (−2,0), `ClockTime` (−1,1). The canvas is what "hosted
  at the origin" means; the scene's own authored offset is reported, not
  asserted away.

- **Still open / not settled:** which AV pack the reference console runs (4, 6
  or 8) — no frame separates them, unchanged from M3f.
- **2026-09-03, Judge E round 5 @ 0dc2e62: FAIL** (one HIGH, three LOW), with
  **all four round-4 findings verified closed** by the judge's own
  measurement: it re-disassembled 0x921534e8 (a real function, next prologue
  0x921536d8) and its tail's branch on arg 2, found NavigateToScenePath
  reading bit 0 of the pressed control's +8 while the other forward path
  hard-codes 0, parsed the corpus for **zero** StayVisible occurrences in 263
  scenes, and confirmed exactly six scene nodes author Trans* in dashmain;
  with its own unscoped detector over all 447 screens there is at most one
  header, at most four glyphs and one "Select" everywhere, and
  oobeProfileCreation shows its own four legends alone. System Info: the
  fall-through is li r4,0x221 = **545** with four args and the taken arm 546
  with five, and the strings have exactly four and five %-slots, so the arity
  settles the mapping independently of the predicate. LiveVision: from the
  skin data, XuiListChooser_No_Kill authors ScrollLeft/ScrollRight and only
  four lists in 6770 name a horizontal template; one row each, 419x33 at
  (539,412)/(539,465)/(539,518), lstTime unchanged at 373. The carrier survey
  reproduces exactly (176/87, 187 full-canvas, 16 without, five ids, two
  classes; XuiElements.xml:69 confirms PressKey DefaultVal 22592). Both
  round-4 unverifiables are verified (39 pushed System pages all at (0,0)
  1120x770, the same ten authoring their own Position).
  NEW findings: (1) HIGH two reachable pages paint tokens the clear cannot
  see - `memory/DeviceSelector#labTotal` paints "<#> of <Total #>" and
  `arcade/2504_TitleOptionsScene#lblRatingText` paints
  "<www.pegi.info: 3+ with mild>" and two "<Rating Information>" - because
  AUTHORING_PLACEHOLDER (consoleSettings.ts:113) is ANCHORED, so it clears
  only a Text that is nothing but one token: the corpus has 192 whole-token
  controls (cleared) and 19 carrying a token inside other text (not), two of
  them reachable. The walk's detectors and the smoke gate use the same
  anchored shape, which is why round 4 read "0 painted tokens on 447 screens"
  and why PLACEHOLDERS' "every angle-bracket token is CLEARED" is wrong in
  the same way. (2) LOW the 40-char sweep count is 127, not 126
  (250x_EZPassScene carries two lblInfo). (3) LOW 2504_TitleOptionsScene
  paints both MUA and MUB memory-unit indicators at the identical authored
  position with no memory unit attached, and 2502_TwistSelectorScene stacks
  two of its three btnX discs; device state, undisclosed. (4) LOW smoke-nxe
  fails loudly (40+ FAILs, "the panel axis integrated 0.000 frames") when run
  beside another headless Chrome tearing down; alone and on the board it
  passes. Could not verify: which AV pack; the xui.h line citation (values
  confirmed from skin data); whether the console filled or hid labTotal and
  lblRatingText offline. Fixes pending with M3h.

### Closed in M3h (2026-09-03), with a measurement per finding

- **(1) HIGH, two reachable pages paint tokens the clear cannot see: CLOSED,
  and the RULE is what changed, not the two labels.** The judge is right about
  the cause and right that the detector had the same blind spot as the fix.

  **What the console does with each of the two, traced to the instruction
  (own disassembly of `extracted/6770/basefile.exe`, flat-mapped).**

  `memory/DeviceSelector#labTotal` is **HIDDEN, and never comes back up.**
  `DeviceSelectorScene`'s bind (**0x9225aec8**) fills a controls block:
  `+8 list_devices` (through the list wrapper at 0x9213cf10), `+12 labDots`,
  **`+16 labTotal`** (the `addi r5,r31,16` / `L"labTotal"` pair at 0x9225af34),
  `+20 legend_a`, `+24 legend_b`, `+28 legend_y`, `+32 legend_x`,
  `+36 txt_EmptyList`. The block's reset (**0x9225ace8**, called from the
  scene's load at 0x9225b1d4) runs four `Show(x, FALSE)` in a row —
  0x9225ad00 `labDots`, **0x9225ad08-0x9225ad10 `labTotal`**, 0x9225ad18
  `txt_EmptyList`, 0x9225ad2c the list — then `Enable(legend_y, 0)` and
  `Enable(legend_a, 0)`. The populate (**0x9225b1f0**) re-shows the list and
  then takes one of two arms: `Show(txt_EmptyList, TRUE)` at
  0x9225b2f8-0x9225b304 when the device count is 0, or fills the list and hides
  it. **Neither arm touches +16.** A scan of every `lwz`/`stw` at offset 16
  across 0x92258000-0x92266000 finds no read of the block's +16 anywhere in the
  class outside that hide. The memory pack has exactly TWO "n of N" writers and
  neither is this one: `Categories` (**0x9225fe78**, labTotal at this+20) and
  `ItemsGrid`/`ItemsIcons` (**0x92263ea0**, this+24), and both do
  `if (visibleWindow < itemCount) { Show(lab,1); swprintf(memory/Strings.xus[67]
  = "%1!d! of %2!d!", index+1, total) (0x9273a38c); SetText (0x92158f40) }
  else Show(lab,0)` — so even a page that HAS the writer hides the line when
  nothing scrolls, which with no storage device attached is the same answer.

  `arcade/2504_TitleOptionsScene#lblRatingText` is **written to the empty
  string.** The bind at 0x9221d9e0-0x9221d9f0 puts it at `this+2292`
  (`imgGameRating` at +2288). The rating routine (**0x9221cbe8**) reads
  `this+2196`, the selected TITLE record: null and it returns 0x8000ffff having
  painted nothing; with a rating (record+14 set, record+16 in {0x5000, >0xd0000})
  it writes `SetText(lblRatingText, (wchar*)(record + 7718))` at
  0x9221ccc4-0x9221ccf0; and on the no-rating arm **0x9221ccd0** it hides the
  pane's own carrier (`this+2184` - a field the ctor zeroes at 0x9221c41c and
  no name bind fills, so this survey does not name the control) and writes **`SetText(lblRatingText, L"")`** from
  the empty wide literal at **0x92001cd4** (bytes `00 00`). There is no title
  offline, so an empty caption is the console's own state either way.

  **The rule.** `AUTHORING_PLACEHOLDER` is gone;
  `dashboards/blades/consoleSettings.ts` now exports `AUTHORING_TOKEN`
  (unanchored), `AUTHORING_TOKEN_ALL` and `paintsAuthoringToken(text)`, a
  SEARCH. Justified over the corpus rather than by taste: a sweep of every
  authored `Text` in all 263 scenes finds **211** that contain a `<` and all
  211 are tokens — there is no HTML body and no prose with an angle bracket
  anywhere in the build, so widening cannot swallow a real caption. The
  console's writers never patch a token in place; each replaces the whole
  caption (`SetText` 0x92158f40) or hides the control, which is why "carries a
  token anywhere" is the right predicate and not just a wider net.

  **All 19 handled, each with a reason.** `TOKEN_SLOTS` in the same file names
  every one of the 19 partial-token controls with the console rule that filled
  it, and the shell appends that reason to its `hardwareState` line, so a blank
  caption says WHY it is blank. Two are reachable and carry the addresses
  above; the seventeen behind unreachable pages carry their state class and
  its source: the `labTotal`/`labelHighlightedOfTotal`/`labelSongCount` family
  (memory/Strings.xus[67], pictures/Strings.xus[8] `"%u of %u"`),
  `memory/OperationProgress#txt_MetaHead` (**0x9225c060** switches on the
  operation code and writes memory/Strings.xus[70..74] at **0x9225c19c**, with
  [86..90] into `txt_Header` at 0x9225c184), `music/*#labelCDName`
  (music/Strings.xus[40] `"Rip CD: %s"`, off the disc), `iptv/uninstallIPTV`'s
  pair (the provider name, absent behind the same 0x9226e7d8 predicate that
  hides `navIPTVSettings`), `network/2036_PPoESettings#txt_CurrentSettings`
  (stored PPPoE configuration) and the two `accountm` Live-ID panels.

  **The gate, widened and re-run over every reachable page.** `smoke-nav.mjs`'s
  §8 detector is now `String.match(/<[^<>\r\n]{1,40}>/g)` instead of
  `/^<[^<>]{1,40}>$/`, and a new §11 pushes all **50** pages the drive reaches
  and scans each one. **Measured: 50 pages swept, 0 painted tokens.** The gate
  is proven, not asserted: with `AUTHORING_TOKEN` put back to the anchored
  shape and the M3h hides reverted, the same suite prints exactly the round-5
  findings and nothing else —
  `[m3e] Storage Devices paints an authoring token: ["<#>","<Total #>"]`,
  `[m3h] arcade/2504_TitleOptionsScene.xur paints an authoring token: ["Text:
  <www.pegi.info: 3+ with mild> <Rating Information> <Rating Information>"]`,
  `[m3h] memory/DeviceSelector.xur paints an authoring token: ["Text: <#>
  <Total #>"]`, plus the two missing disclosures and the five indicators of
  finding 3. `tests/blades.test.ts` gates the rule over the CORPUS, not a
  synthetic string: all 211 matched, the anchored form misses exactly 19, and
  those 19 are exactly `TOKEN_SLOTS`' keys (127/127 unit tests green).
  PLACEHOLDERS' "Every angle-bracket token is CLEARED" now says what was wrong
  and what the rule is; COVERAGE's Blades row is corrected the same way.

- **(2) LOW, the 40-char sweep is 127: CORRECTED.** Re-counted over
  `public/assets/6770/xuiz` — 263 files, **127** authored `Text` of 40+
  characters, and `arcade/250x_EZPassScene` really does carry two controls
  called `lblInfo` (with `arcade/2500_metaEZPass#lblText` the third hit in that
  pack). Fixed in this file's round-4 block and in LEARNINGS, with the reason a
  survey keyed by id loses one.

- **(3) LOW, the stacked indicators and the stacked discs: ONE FIXED, ONE
  DISCLOSED, both gated.**
  `2504`'s five storage-device indicators are ALTERNATIVES, and offline the
  console shows none. `Arcade::CTitleOptionsScene` binds `HD`/`MUA`/`MUB`/`OD`/
  `BuiltInMU` at this+2300/+2304/+2308/+2312/+2316 (0x9221da20-0x9221da80) and
  at **0x9221c558** clears five flags, reads `this+2196` (the title record),
  **returns to the show block with every flag still 0 when it is null**, else
  switches on `0x922297b0(title)` — 1 `HD`, 2 `BuiltInMU`, 4 `OD`, 0x10000002
  `MUA`, 0x20000002 `MUB` — and then runs the five `Show(x, flag)` calls at
  **0x9221c5e8-0x9221c620**. `CONTROLS_HIDDEN_OFFLINE` in `codeLists.ts` now
  applies exactly that, every copy under the level, and discloses it in
  `hardwareState`. **Measured** (`smoke-nav` §11d): the scene authors all five
  and 0 of 5 are shown; before the fix the same probe read 5 of 5.
  `2502`'s two `btnX` discs are the CONSOLE's doing and stay:
  `Arcade::CTwistSelectorScene` binds the SCENE's own `btnX` at this+2224
  (0x92223cb0) and shows it whenever the active tab's content is up
  (0x922243a4-0x922243b4, `Show(btnX,0)` at 0x92224478 on the same flag that
  hides Tab1 and raises `ctlWait`), while `Arcade::CTitleSelectorScene` owns
  Tab1's own `btnX` at this+2212 (0x9221efe4) and only ever ENABLES and
  captions it (0x9221e4e4 `Enable(btnX, hasTitle)`, 0x9221e520
  `SetText(btnX, arcade strings 71/76)`) — it never hides it. Tab1 sits at
  (142,196) and its `btnX` at local (4,442) = (146,638); the scene's own is
  authored at (145.806,638). Disclosed in PLACEHOLDERS.
  **The gate** (`smoke-nav` §11b): no two visible controls may paint at one
  authored design box on any of the 50 reached pages, with a named allowlist of
  what the console stacks. **Measured: 1 stacked pair over 50 pages, the
  allowlisted one.** With the M3h hide reverted the same sweep reads
  `arcade/2504_TitleOptionsScene.xur 940,96 59x32 XuiGroup#MUB | XuiGroup#MUA`
  and `967,101 25x25 XuiGroup#B | XuiGroup#A`, so the gate sees the finding.
  Keying on the CONTROL's authored box and not on its ink is load-bearing:
  MUA's and MUB's glyphs land a pixel apart, and an ink-keyed gate walks past
  them.

- **(4) LOW, smoke-nxe cascades under contention: FIXED, without weakening an
  assertion.** The signature is a shell frozen on one snapshot: in the judge's
  log every step from `Left` onward reads `panel 0.051 channel 6 rigs 7`, and
  the two integrator lines that name it (`the panel axis integrated 0.000
  frames`) are the last two of 88. `smoke-nxe.mjs`'s walk now asks the engine's
  own frame counter whether the page ran: `run()` compares
  `motion.frames - t0` against the frames it stepped, and on a shortfall waits
  up to two seconds (40 x 50 ms) for the clock to come back, topping the step
  up and carrying on if it does. A second detector covers the other shape of
  the same fault — three consecutive 20-frame-or-longer steps that leave the
  snapshot byte-identical, which never happens on a live shell. When the clock
  really is dead the suite reports it ONCE ("the browser did not schedule
  frames for the NXE page - ..."), raises `quiet` for the rest of §3 and prints
  how many dependent checks it suppressed. `quiet` is null on every healthy
  run, so no assertion is weakened and none of §3's dashboard assertions were
  touched.
  **Measured both ways.** Healthy: `smoke-nxe` SMOKE_PASS, unchanged. Stalled:
  a copy of the suite with `api.stepFrames` made a no-op after 45 calls - a
  browser that stops scheduling the page, in one line - prints
  `nxe §3: the clock stalled: 50 dependent checks were suppressed behind the one
  failure above` and exactly ONE failure: `the browser did not schedule frames
  for the NXE page - Left: the engine advanced 15 of the 30 frames it was
  stepped. Nothing below this line was measured; run the suite alone or on the
  board (two headless Chromes on one machine starve each other).` One sentence
  where round 5 got eighty-eight.
- **2026-09-03, Judge E round 6 @ 8425bb0: PASS** (four LOW residuals). The
  judge swept the corpus itself: 211 authored Texts contain "<", all 211
  carry a well-formed token, 0 HTML tags, 0 bare angle brackets after
  stripping, so widening the clear to a search cannot swallow a caption; the
  anchored rule matched 192 and missed exactly the 19 `TOKEN_SLOTS` names.
  Both binary claims verified from its own disassembly (labTotal at +0x10,
  the block reset's Show(_, 0) at 0x9225ad08-0x9225ad10 called from the load
  at 0x9225b1d4, the populate's empty arm never touching it; both "n of N"
  writers hiding the label unless the list scrolls, string 67 =
  "%1!d! of %2!d!"; 2504's no-rating arm hiding this+2184 and writing the
  empty literal at 0x92001cd4). 447 screens, 0 painted tokens. **It
  reproduced the falsification itself** in an isolated `git archive` copy:
  re-anchored and with the hides emptied, smoke-nav exits 1 with 10 FAILs,
  every one a round-5 finding and nothing spurious. The five indicators, the
  two console-stacked discs, the smoke-nxe stall report and the 127 count all
  check out, and the mobile work moved nothing it had measured. Residuals,
  all LOW: (1) PLACEHOLDERS' token row still opens "the 168 controls" against
  the 192/211 the same paragraph states, and no variant lands on 168
  (XuiLabel-only is 166); (2) the shell CLEARS labTotal where the console
  HIDES it - same pixels, but CONTROLS_HIDDEN_OFFLINE exists and would make
  the DOM say what the binary says; (3) 2504's rating-pane frame
  (grfxBackground, 144,428 405x165) is still drawn because the control the
  no-rating arm hides at this+2184 has no name bind; (4) prose precision:
  record+16 is {0x5000, 0xd0000}, and the reset's tail touches legend_b,
  legend_y AND legend_a. Could not verify: that nothing else in the class
  reads +0x10 (scanned an address window, not a symbol boundary); which AV
  pack; the xui.h line citation.
