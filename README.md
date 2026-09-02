# 360dashboards

The real Xbox 360 dashboards, running in a browser. Not a redesign: every
scene, texture, string, sound and animation curve comes from the original
dashboard binaries, decoded by the tools in this repo and rendered by a
TypeScript reimplementation of the XUI runtime.

First target: **Blades, build 6770** (the last Blades dashboard, 2008).
Next: NXE 9199, then Metro 17559.

## Run it

```
npm install
npm run extract     # needs the archive + a built xex1tool, see below
npm run dev         # http://localhost:5173
npm test            # parser + container unit tests (+ corpus tests when extracted/ exists)
npm run smoke       # headless-Chrome suites against the dev server
```

`npm run extract` expects two things that are NOT in git (they are Microsoft's):

1. `vendor/archive/` — a sparse clone of
   https://github.com/thedev0ps/Xbox-360-Dashboard-Archive containing
   `Blades/Retail/6770/`. `tools/fetch-archive.ts` does this.
2. `vendor/idaxex/xex1tool/build/xex1tool` — emoose's XEX tool, built with
   `tools/build-xex1tool.sh` (needs `brew install cmake ninja`).

Everything derived from them lives under `extracted/` and `public/assets/`,
both gitignored. A contributor reproduces the whole dump with one command.

## Stack (verified 2026-09-02, don't re-litigate)

- Vite 8 + TypeScript 5.6 strict, zero runtime dependencies.
- Rendering: DOM + CSS 3D transforms, inline SVG for vector figures. No WebGL.
- Tests: node's built-in runner; smoke suites drive `puppeteer-core` against
  system Chrome and assert on `window.__dash`.
- License: GPL-3.0 (the XUR parser is a port of XUIHelper's V5 reader).

## Architecture

```
vendor/archive/.../dash.xex ─xex1tool─▶ extracted/6770/basefile.exe (decrypted PE)
                                      └▶ extracted/6770/resources/<pack>   29 XUIZ packs
extracted/6770/resources/*  ─tools/unpack-xuiz.ts─▶ extracted/6770/xuiz/<pack>/{*.xur,*.png,*.xus,*.xma}
extracted/6770/basefile.exe ─tools/build-registry-6770.ts─▶ packages/xur/extensions/6770/registry.json
extracted/6770/xuiz/**      ─tools/convert-audio.ts, build-manifest.ts─▶ public/assets/6770/{manifest.json,xuiz/,audio/}
```

- `packages/xuiz` — the XUIZ resource-pack container and `.xus` string tables.
- `packages/xur` — the XUR v5 scene parser: header, STRN/VECT/QUAT/CUST/DATA
  sections, the mask-encoded property block, named frames and keyframe
  timelines. Browser-safe (Uint8Array/DataView only). Also `toXui()`, an
  XUIHelper-compatible XML emitter used only for cross-checking.
- `packages/runtime` — the browser XUI runtime (scene loader, DOM renderer,
  timeline engine, input, audio, strings, inspector).
- `dashboards/blades` — hand-written glue that lived in PowerPC code on the
  console: which scene loads, what buttons do, blade navigation.
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
`tools/build-registry-6770.ts` turns that into `registry.json`. Every
property name, order and type for build 6770 is therefore taken from the
binary that shipped, and the strict corpus sweep confirms it: all 263
scenes parse to the last byte of their data section with every declared
count matching.

## Verification

- `node --import tsx tools/xur2json.ts --corpus extracted/6770/xuiz --strict`
  must print `XUR_PASS 263/263`.
- `node --import tsx tools/xur2xui.ts --diff extracted/6770/xuiz extracted/6770/xuihelper`
  compares our parse against XUIHelper's (built from source under .NET) on
  every scene it can read: `XUIDIFF_PASS`.
- `JUDGE.md` records each phase's independent fidelity review.
- `PLACEHOLDERS.md` lists the only things that are not the original (things
  the console pulled from Xbox Live), each with its reason.
