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
