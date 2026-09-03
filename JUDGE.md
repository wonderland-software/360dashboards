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
