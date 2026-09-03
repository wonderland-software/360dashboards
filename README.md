# 360dashboards

The real Xbox 360 dashboards, running in a browser. Not a redesign: every
scene, texture, string, sound and animation curve comes from the original
dashboard binaries, decoded by the tools in this repo and rendered by a
TypeScript reimplementation of the XUI runtime.

First target: **Blades, build 6770** (the last Blades dashboard, 2008), then
NXE 9199. **Metro 17559** (the last Xbox 360 dashboard) is extracted, parsed
and cross-checked through the same pipeline (XUR v8, XUS v2, XUIZ v3); its
runtime is next.

## Run it

```
npm install
npm run extract     # Blades 6770; needs the archive + a built xex1tool, see below
npm run extract -- --build 9199   # NXE 9199 (same pipeline, its own registry and counts)
npm run extract -- --build 17559  # Metro 17559 (XUR v8; no runtime yet)
npm run dev         # http://localhost:5173
npm test            # parser + container unit tests (+ corpus tests for every extracted build)
npm run smoke       # headless-Chrome suites against the dev server
```

Every tool takes `--build 6770|9199|17559` (or `DASH_BUILD=9199`); the
default is Blades 6770. `tools/builds.ts` is the one table of builds, archive
paths and twins.

`npm run extract` expects two things that are NOT in git (they are Microsoft's):

1. `vendor/archive/` — a sparse clone of
   https://github.com/thedev0ps/Xbox-360-Dashboard-Archive:
   `node --import tsx tools/fetch-archive.ts` checks out every build in
   `tools/builds.ts` and its twins (`Blades/Retail/6770`, `Blades/Devkit/6719
   (7776.0 XDK)`, `NXE/Retail/9199`, `NXE/Devkit/9199 (11626.0 XDK)`,
   `Metro/V2/Retail/17559`). Passing paths replaces that list (the tool calls
   `sparse-checkout set`).
2. `vendor/idaxex/xex1tool/build/xex1tool` — emoose's XEX tool:
   `tools/build-xex1tool.sh` (needs `brew install cmake ninja`).
3. Optional, for the genuine typeface: the console's `xenonclatin.xtt` and
   `xenonjklatin.xtt` (ripped from a system update; one public source is
   the Kaceydotme/Convection-Font-for-Xbox-360 release) placed in
   `reference/fonts/xtt/`. `tools/xtt2ttf.py` decodes them; without them
   text falls back and PLACEHOLDERS.md says so.

Everything derived from them lives under `extracted/<build>/` and
`public/assets/<build>/`, both gitignored. `npm run extract` reproduces the
whole dump and asserts the expected counts (`fixtures/expected-<build>.json`,
including the TOC entry count read from the packs themselves), so a partial
dump cannot pass.

## Controls

A controller works through the Gamepad API with the standard mapping. Without
one, the keyboard maps as: Enter = A, Esc or Backspace = B, X = X, Y = Y,
Q/E = LB/RB (blade switch, as are left and right — no control in the build sets
NavLeft or NavRight), arrows or WASD = d-pad (up and down walk the scene's own
NavUp/NavDown chain, A presses the focused control, B goes back a page), Tab = Guide (a no-op,
see PLACEHOLDERS.md). Routes: `/` is the dashboard — it BOOTS, playing `dashmain`'s own `BootLive`
range onto Xbox LIVE the way the console's boot dispatcher does (`&boot=<range>`
picks another of the fifteen, `&boot=none` parks on `DefaultTab`, `&blade=N`
drops straight onto a blade's rest state). `/?scene=<pack>/<file>.xur` renders
one scene, `/?gallery` renders every scene, `&debug` adds the inspector,
`&locale=de-de` applies a localized string table, `&mute` silences cues,
`&frame=N` freezes every timeline at frame N. The default view is the
console's 1280x720 output (the measured anisotropic mapping of the 1120x770
canvas, filling the window uniformly); `&design` shows the raw design canvas
instead.

`?build=9199` serves **NXE 9199** from the same app and the same runtime: the
manifest, the class registry, the skin, the string tables, the audio bank and
the canvas -> framebuffer view all take the build (`packages/runtime/src/build.ts`
is the one table of what differs). `?scene=` and `?gallery` take it too. The
NXE home page is not a scene - `homepage/homepage.xur` is three empty groups -
so `dashboards/nxe/` composes it from `homepage/emb_homepage.xml`, the three
`epix://` channel files and the thirty constants in `controlp/Variables.xur`,
and hangs each slot's `controlpack://PanelScene.xur` clone on a 3D line through
a measured perspective. `&page=<pack>/<file>` hosts an 880x480 Blades-era page
inside the NXE shell instead of the strip
(`&page=consoles/dashSysCslSet.xur` is Console Settings, eight rows from the
table at 0x92016a90). `&channel=<id>` picks another channel; `&hddvd`,
`&mediaroom`, `&live`, `&nowelcome` and `&iptv` flip the console-state
predicates the `<condition>` elements ask about. On that route the pad drives
the strip: left/right move the panel cursor and up/down the channel cursor (the
opposite axis assignment to Blades, and the file's own - `MobyPanelInput*` is
the horizontal axis), A runs the focused slot's `<onclick>` and B pops the page
stack. Navigation is a per-frame velocity integrator over the thirty constants
in `controlp/Variables.xur`, stepped on the timeline's own 60 Hz clock, so
`&manual` plus `__dashApi.stepFrames()` reproduces any position exactly. The
fold behind a page and the unfold in front of it are the same file's own
`From` / `BackTo` ranges (the `SceneTransitions` group animates four
variables the executable reads every frame) plus the executable's per-panel
cascade, both decoded; a channel change is a measured fade
(`dashboards/nxe/transitions.ts`, `physics.ts`, and the runtime README's M4d
section). Rigs are mounted by distance every frame, so every slot of a channel
reaches the front with its scene. NXE scenes are 1280x720 and land 1:1 on the
output, so the Blades view transform does not apply to them - measured, see
`packages/runtime/README.md`.

## Stack (verified 2026-09-02, don't re-litigate)

- Vite 8 + TypeScript 5.6 strict, zero runtime dependencies.
- Rendering: DOM + CSS 3D transforms, inline SVG for vector figures. No WebGL.
- Tests: node's built-in runner; smoke suites drive `puppeteer-core` against
  system Chrome and assert on `window.__dash`.
- License: GPL-3.0 (the XUR parser is a port of XUIHelper's V5 and V8
  readers).

## Architecture

```
vendor/archive/.../dash.xex ─xex1tool─▶ extracted/6770/basefile.exe (decrypted PE)
                                      └▶ extracted/6770/resources/<pack>   29 XUIZ packs
extracted/6770/resources/*  ─tools/unpack-xuiz.ts─▶ extracted/6770/xuiz/<pack>/{*.xur,*.png,*.xus,*.xma}
extracted/6770/basefile.exe ─tools/build-registry.ts──▶ packages/xur/extensions/6770/registry.json
extracted/6770/xuiz/**      ─tools/convert-audio.ts, build-manifest.ts─▶ public/assets/6770/{manifest.json,xuiz/,audio/}
```

The same chain runs for NXE with `--build 9199` (`extracted/9199/`,
`packages/xur/extensions/9199/registry.json`, `public/assets/9199/`) and for
Metro with `--build 17559` (36 resources: 35 XUIZ v3 packs, XUR v8 scenes,
XUS v2 string tables, Lua 5.1 bytecode apps, an XACT wave bank; LEARNINGS
"Metro 17559").

- `packages/xuiz` — the XUIZ resource-pack container and `.xus` string tables.
- `packages/xur` — the XUR v5 scene parser: header, STRN/VECT/QUAT/CUST/DATA
  sections, the mask-encoded property block, named frames and keyframe
  timelines; and (`parse8.ts`, behind the same `parseXur`) the XUR v8 reader
  for Metro: packed uints, a twelve-count header, FLOT/COLR pools, shared
  property and compound lists, NAME/KEYD/KEYP keyframes whose flag byte is
  read the way the console's decoder reads it. Browser-safe
  (Uint8Array/DataView only). Also `toXui()`, an XUIHelper-compatible XML
  emitter used only for cross-checking.
- `packages/runtime` — the browser XUI runtime (scene loader, DOM renderer,
  timeline engine, input, audio, strings, inspector).
- `dashboards/blades` — hand-written glue that lived in PowerPC code on the
  console: which scene loads, what buttons do, blade navigation.
- `dashboards/nxe` — the same for NXE 9199, where there is much more of it:
  the XML channel manifest and its `<condition>` predicates, the Epix
  path -> scene binding, the strip constants, the `XuiPerspectiveScene`
  projection, the velocity integrator and fold cascade the strip navigates on,
  the eight navigation cues (played by the glue, not by a timeline), the
  `PanelScene` reflection rig, the `LegendScene` hoist, the `DashBkgnd`/Aura
  background and the `LegacyControl` page stack.
- `tools/` — extraction and reverse-engineering tools (see LEARNINGS.md for
  what each one established).

### Where the dashboard UI actually lives

The dashboard's screens are not code. They are compiled XUI scenes (`.xur`)
embedded in `dash.xex` as 29 named resource packs (`dashmain`, `neon`,
`consoles`, `network`, ...), each an uncompressed `XUIZ` container of
scenes, PNG textures, XMA sounds and localized `.xus` string tables. The
loose `shrdres.xzp` holds the shared icons, sounds and Live strings. The
PowerPC code only decides which scene to show and what to do on a button.

### The class registry comes from the executable

XUR files store properties as bitmasks over each class's property list, in
declaration order, so parsing needs the exact per-build list. Rather than
trust a later build's XML, `tools/xui-propdefs.ts` reads the XUI class
registration code out of the decrypted `dash.xex` (each property record is
built in code: index, name pointer, XUI_PROP_TYPE) and
`tools/build-registry.ts --build <n>` turns that into `registry.json`,
binding each table to its class through the call graph (a registration
calls the function that builds its table and stores the result). For the
50 (6770) / 51 (9199) classes that own properties, name, order and type
come from the binary that shipped; for 17559 it is 313 classes, 70 with
tables, and the 69 classes its scenes use are all registered by its
`dash.xex` (XuiElement registers all 27 there, so no XuiTool tail is
needed). Exceptions are recorded in the registry itself: the scene files write four mask bytes for XuiElement (so XuiTool
knew 25-32 definitions) while both runtimes register 17; definitions 17-26
are taken from XuiTool's own list (XUIHelper's 9199 XML) and tagged
`origin: xuitool-xml` (the builder measures the mask-byte count from the
scenes); one banner class registered outside 6770's dash.xex is marked
`inferred`, and two classes 9199's scenes use but its dash.xex does not
register (XuiVideo, MediaScene) carry XuiTool's definitions with the scene
evidence spelled out. The parser checks every class's mask-byte count
against the registry, so a registry that is too short or too long fails
the sweep (the check proves the definition count to within its group of
eight, and only for classes that set at least one property somewhere in
the corpus). All 263 Blades and 311 NXE scenes parse to the last byte of
their data section with every declared count matching. Where XUIHelper's
hand-written 9199 XML and the 9199 binary disagree, the binary wins
(LEARNINGS.md, "NXE 9199").

## Verification

- `node --import tsx tools/xur2json.ts --corpus extracted/6770/xuiz --strict`
  must print `XUR_PASS 263/263`; with `--corpus extracted/9199/xuiz
  --registry 9199`, `XUR_PASS 311/311`; with `--corpus extracted/17559/xuiz
  --registry 17559`, `XUR_PASS 363/363` (every v8 file carries the count
  header, so all 363 are checked against it).
- `node --import tsx tools/xur2xui.ts --diff extracted/6770/xuiz extracted/6770/xuihelper`
  compares our parse against XUIHelper's (built from source under .NET,
  batch-run by `tools/xuihelper-convert.sh <build>`) on every scene it can
  read: `XUIDIFF_PASS`; the same with `extracted/9199/... --registry 9199`
  and `extracted/17559/... --registry 17559` (363 identical). Every
  normalisation the diff applies is documented in the tool.
- `npm run smoke` runs ten headless suites serially, including
  `smoke-gallery` (both builds: 263 + 311 scenes, zero unknown classes) and
  `smoke-nxe`, which measures the composed NXE home page and a hosted legacy
  page against their reference stills with the same detector run over both,
  re-derives the perspective fit from its own thirty-two landmarks, drives a
  scripted navigation path a 60 Hz frame at a time (Right/Left, Up/Down, seven
  Rights to "8 of 8", A into System Settings, A into Console Settings, B twice)
  gating the cue ticks, the fold ranges, the queue direction, the metapane text
  and the painted DOM per tick, then measures a channel change, an A, a B, a
  page-over-page swap and a passing panel against the 30 fps cuts of the
  reference captures with the same region traces (skipped, and said so, when
  `reference/frames/<capture>-30fps/` is absent), and mounts the app twice to
  prove the teardown leaves exactly one viewport, one input router, one clock
  and one audio bank.
- `JUDGE.md` records each phase's independent fidelity review.
- `PLACEHOLDERS.md` lists the only things that are not the original (things
  the console pulled from Xbox Live), each with its reason.
