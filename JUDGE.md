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
