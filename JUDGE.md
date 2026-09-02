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
