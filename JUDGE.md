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
