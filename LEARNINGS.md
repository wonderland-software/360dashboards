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
  v3 ASCII); data starts at `0x16 + tocLength`. The first entry lands exactly
  on the first `XUIB` magic. `tools/unpack-xuiz.ts --probe` re-proves this on
  every pack by matching every PNG/RIFF/XUIB/XUIS signature to an entry start.
- **All 263 Blades 6770 scenes are XUR v5.** Only 10 carry the optional
  count header (`flags & 1`); the rest are verified structurally.
- **The packed byte's upper five bits are a per-class property count.**
  XUIHelper only writes `(count-1) << 3`; reading it back gives a check that
  every file carries even without a count header.
- **A nested compound counts as ONE value** in a compound's declared count
  (Fill's Gradient is 1, not its four children). XUIHelper gets this right by
  accident (`is List<object>` never matches `List<XUProperty>`).
- **Count-header formulas from XUIHelper are wrong for animated indexed
  properties** (its verifier is `return true;` so nobody noticed). What the
  files actually store: keyframeProperties = Σ keyframes × tracks,
  keyframePropertyDefinitions = Σ tracks, classDepth = Σ track path length.
  Confirmed on all ten scenes that carry the header.
- **XUS string tables** (2026-09-02, 3,234 files): header `XUIS`, u8
  version 1, u8 KIND (not flags), u32 fileSize, u16 count. Kind 1 = keyed:
  value (u16 len + UTF-16BE) then a u32 key; kind 0 = named: value then a
  second string (only `LiveAddressStrings.xus`); kind 2 = positional (the
  pack-root `Strings.xus`). The u32 key is `(u8 classIndex, u8 propIndex,
  u16 objectId)` where objectId is the 1-based POSTORDER index of the object
  in the sibling `.xur` (children before parent, XuiCanvas last): a locale
  table patches the scene's string properties one by one. English is the
  literal text already inside the `.xur`; there is no reference syntax.
  Locale key sets legitimately differ (a locale omits entries equal to the
  English), so tests assert keys ⊆ union, not equality.
- **XUR strings are UTF-16BE, and XUIHelper drops the high byte.** Bullets
  (U+2022) become `"`, curly apostrophes (U+2019) become 0x19 and break its
  XML writer. Ours keeps them.

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
- **9199 XML vs 6770 binary:** core classes match exactly, minus later
  additions at the tail (XuiScene.RecurseTransitions, XuiText.TextScale,
  XuiElement's GripTarget..CenterPivot, XuiHtmlControl.TeletypeCount vs
  LineHeight). DashScene's three strings are PanelSettings, PanelStrings,
  PanelScenePaths in the binary (XUIHelper's hand-written names differ).
  ScriptScene = Script, Visible. Banner classes: XuiBOTDOfflineScene owns
  ButtonVisual; XuiBOTDOfflineContainer owns Area, DefaultBanner.
  XuiFall07BOTDScene is registered by something outside dash.xex; its seven
  properties are inferred from the one scene that uses it and marked so.
- **A regex that only knows `<PropDef ...></PropDef>` swallows the
  self-closing `<PropDef .../>` AND the definition after it.** That is how
  DashScene and ScriptScene first came out empty from the 9199 XML.

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

## Process

- **Judges are not the implementer.** Every phase ends with an independent
  review against the original bytes and reference footage (see JUDGE.md).
