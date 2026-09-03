// The Display branch of Console Settings (consoles/dashSysCslSetDisplay.xur
// and its sub-scenes), recovered from extracted/6770/basefile.exe.
//
// ---------------------------------------------------------------------------
// ADDRESS SPACE NOTE - read this before checking any VA in here
// ---------------------------------------------------------------------------
// basefile.exe is a rebuilt PE whose SECTION HEADERS disagree with the image
// the code was linked for. The code's own absolute addresses (and .pdata) use
// a FLAT mapping: raw = VA - 0x92000000 for every section. The section table
// instead places .text at 0x9210c000 (raw 0x10be00, +0x200) and .data at
// 0x92797400 (raw 0x796200, +0x1200).
//
// Proof: 18326 .pdata BeginAddress entries were tested against the disassembly.
// Under the header mapping only 82/1200 sampled entries land on a prologue;
// shifting by +0x200 makes it 1191/1200. So a .text VA printed by
// tools/ppc-dis.ts (header mapping) is 0x200 HIGHER than the VA the code
// itself uses. EVERY VA IN THIS FILE IS A FLAT VA (raw = VA - 0x92000000).
// To disassemble one with tools/ppc-dis.ts, add 0x200.
//
// ---------------------------------------------------------------------------
// 1. THE DISPLAY PAGE ROW TABLE - VA 0x927bfff0, in .data, 4 records x 16 bytes
// ---------------------------------------------------------------------------
// Unlike the Console Settings list (one 20-byte .rdata table at 0x920143d0),
// the Display page's list is a MUTABLE 16-byte table in .data that code
// rewrites on every entry to the page. Record layout, field by field:
//
//   +0  u32 labelIndex   position in consoles/dashCSettingsStrings.xus
//   +4  u32 sceneFile    pointer to a wide L"dashSysCslSet*.xur" in .rdata
//   +8  u32 present      row is inserted into the list at all (initial 1)
//   +12 u32 enabled      row is selectable (initial 1)
//
// Image bytes (verified with a flat-mapped dumper over raw 0x7bfff0):
//   0x927bfff0  000000df 92015044 00000001 00000001  -> 223, HiDef.xur
//   0x927c0000  0000020e 92015004 00000001 00000001  -> 526, Format.xur
//   0x927c0010  00000177 92014fc8 00000001 00000001  -> 375, OutputLevels.xur
//   0x927c0020  0000017b 92014f90 00000001 00000001  -> 379, Pal.xur
// The four .rdata scene-name literals are contiguous at 0x92014f90 (Pal),
// 0x92014fc8 (OutputLevels), 0x92015004 (Format), 0x92015044 (HiDef); a
// whole-image pointer scan finds NO other reference to any of them, so this
// table is the only place the Display page's destinations exist.
//
// How the rows reach lstSettings:
//   0x921c72f0  dashVideoSettings::OnInit - resolves lstSettings -> this+96,
//               labCurrentSetting -> this+100, scnCurrentFormat -> this+104,
//               labAVPackInfo -> this+108, SwitchImage -> this+112, then
//               calls 0x921c6650 (row builder) and 0x921c6f18 (metapane).
//   0x921c6650  the row builder. 0x921c66c8 materialises 0x927bfff0 into r30;
//               0x921c6730/676c/677c/678c/679c/67e8/67f8/6808 write the
//               label/present/enabled fields; 0x921c6834-0x921c68a8 walks the
//               table BACKWARDS (r29 = r30+48, r29 -= 16) inserting each row
//               at list index 0, so the on-screen order is record 0..3.
//               Per row it: skips when +8 == 0; inserts one item; loads
//               string[+0] and sets the item text; hands the +4 scene pointer
//               to the list; sets the item's enabled state from +12.
//
// ---------------------------------------------------------------------------
// 2. THE GATING - which hardware queries decide each row
// ---------------------------------------------------------------------------
// Import thunks are the XEX pre-patch form `li r3,<moduleIndex>; li r4,<ordinal>`:
//   0x9273990c  module 1, ordinal 16   - ExGetXConfigSetting (see below)
//   0x9273986c  module 0, ordinal 971  - the AV pack query (XGetAVPack, INFER)
//   0x927396dc  module 0, ordinal 977  - the video mode query (XGetVideoMode, INFER)
//   0x9273ab0c  module 1, ordinal 638  - display/EDID info query (INFER)
//   0x9273ab1c  module 1, ordinal 624  - registers the display-change callback
//   0x9273989c  module 1, ordinal 34   - used by the reference-level provider
// The ExGetXConfigSetting identification is behavioural, not from a symbol:
// 0x921c8148 calls it as (3, 10, &dword, 4, &size) and returns the dword, and
// 0x921c668c calls it as (2, 2, &dword, 4, &size) then masks 0xFF00 and
// compares 0x100 / 0x200 - i.e. XCONFIG_USER (3) setting 0x0A = VIDEO_FLAGS,
// and XCONFIG_SECURED (2) setting 0x02 = AV_REGION whose second byte is
// 1=NTSC-M, 2=NTSC-J, 3=PAL-I, 4=PAL-M. Marked INFER; the ordinals are fact.
//
// State the builder computes (0x921c6650), all straight from those queries:
//   this+132 "ntsc"      = (avRegion & 0xFF00) is 0x100 or 0x200        [0x921c66b4]
//                          then forced to 1 for avPack 3, and for avPack
//                          4/6/8, and for any other non-zero avPack whose
//                          mode-set kind != 5                    [0x921c6734/670c]
//   this+124 "hdOk"      = 1, cleared only when avPack is not in {0,3,4,6,8}
//                          and the mode-set kind == 5                   [0x921c6704]
//   this+128 "wideLock"  = current video mode's flags word has 0x8000 set
//                          AND avPack != 0                       [0x921c6738-6764]
//
// Row assignments, exactly as written:
//   row0 HDTV        +0  = 596 "Screen Resolution" instead of 223 "HDTV Settings"
//                         when avPack in {4,6,8} AND modeSetKind not in {0,2}
//                                                                      [0x921c672c]
//                    +8  never written -> always present
//                    +12 = hdOk                                        [0x921c676c]
//   row1 Format      +8  never written -> always present
//                    +12 = !wideLock                                   [0x921c677c]
//   row2 OutputLevels the code re-reads the AV pack at 0x921c67a0. If it is
//                    4, 6 or 8 the label stays 375 "Reference Levels" and
//                    +12 = 1. Otherwise +0 = 376 "Black Level"  [0x921c67e8]
//                    and the AV region is re-read: NTSC-M -> +12 = 1,
//                    anything else -> +8 = 0 and +12 = 0        [0x921c67f8/67fc]
//   row3 Pal         +8 = +12 = !ntsc                           [0x921c678c/679c]
//
// So on an NTSC-M console the PAL Settings row is ABSENT, and it is present
// only when avPack == 0 (the one path that leaves "ntsc" alone) on a PAL
// region console. The row set below named DISPLAY_ROWS_NTSC_HD is the
// three-row set for an NTSC-M console on an HD-capable pack (avPack in
// {4,6,8}), which is the state the reference footage shows (see 4 below).
//
// ---------------------------------------------------------------------------
// 3. dashSysCslSetDisplayHiDef.xur - listOptions IS A HARDWARE MODE LIST
// ---------------------------------------------------------------------------
// dashVideoSettings_HD::OnInit is 0x921c6910. It resolves listOptions into
// this+96, binds the item class L"dashCScreenSize" (0x921c694c), picks a mode
// list into this+8, hands it to dashCScreenSize at 0x921cc190, finds the
// current mode's index with 0x921c5918 and selects it.
//
// 0x921cc190 is the row builder: it inserts list->count items (one per mode)
// and sets each item's enabled state from bit 0x2000 of the mode's flags.
// The row TEXT comes from 0x921cc080 (FormatModeLabel):
//     entry = list->entries[i]                       (8 bytes)
//     nameIndex = *(u16*)(entry+4)
//     if (nameIndex >= 352 && allowNumeric) fmt = string[353] "%d x %d"
//     else                                  fmt = string[nameIndex]
//     swprintf(buf, 256, fmt, (s16)entry[+0], abs((s16)entry[+2]))
// so a row is either a fixed string or "<width> x <height>".
//
// Mode entry layout, proven by 0x921c5c48 building the same shape from the
// video-mode query (width -> +0, height -> +2, negated when height == 1080 and
// the mode is NOT interlaced) and by 0x921cc080 reading +4 / +6:
//     +0 s16 width
//     +2 s16 height   (for 1080 modes only, NEGATIVE marks progressive)
//     +4 u16 nameIndex in dashCSettingsStrings.xus
//     +6 u16 flags    (0x8000 = widescreen, 0x2000 = selectable)
// A ModeList is { u32 _; u32 count; Mode* entries; u32 kind } - read as
// count@+4 / entries@+8 at 0x921c5d38 and 0x921c6ae0.
//
// Which list is shown (0x921c69e0-0x921c6ac4):
//   avPack 0  -> labAVPackInfo = string[553], the TV/HDTV switch art is shown,
//                then the STATIC list is used
//   avPack 3  -> the STATIC list
//   avPack 4/6/8 -> the RUNTIME list at 0x927bffe0; and when modeSetKind is
//                not 0 or 2 the page header is retitled string[594]
//                "Screen Resolution"                              [0x921c6a38]
// The STATIC list is chosen at 0x921c6a9c (same test as 0x921c5d00) by a u16
// read through the .rdata slot 0x92000af8: == 0x101 picks MODES_D_TERMINAL,
// otherwise MODES_HD_COMPONENT. That slot holds an unpatched XEX import
// descriptor in this file, so the u16's meaning is NOT recovered; 0x101 as a
// region code and the D-terminal ("D2/D3/D4/D5") labels behind it make Japan
// the obvious reading, but that is INFER.
//
// The RUNTIME list at 0x927bffe0 is FILLED BY CODE, not authored:
//   0x921c5d78 queries the display (import ordinal 638), reads a byte at
//   struct+29: 1 -> kind 4, 2 -> kind 0 or 1, 3 -> kind 2 or 3, and then
//   memcpy's MODES_HD_COMPONENT (32 bytes, 4 entries) for kind 0 or 2, or
//   MODES_VGA (64 bytes, 8 entries) for kind 4, into the runtime buffer at
//   0x92872ff8, storing the entry count at 0x927bffe4.
//   0x921c5688-0x921c5750 then SHIFTS the array up by one and inserts a new
//   entry at index 0 taking width/height from the display's reported mode,
//   nameIndex 352 "Optimal Resolution", flags |= 0x3000.
// So the HiDef list's first row can be a display-reported "Optimal Resolution"
// that exists nowhere in the image. THAT ROW IS NOT RECOVERABLE AS DATA and is
// not listed below.
//
// ---------------------------------------------------------------------------
// 4. labCurrentSetting and scnCurrentFormat on the Display page
// ---------------------------------------------------------------------------
// 0x921c6f18 (dashVideoSettings::UpdateCurrentSetting) calls 0x921c6d88, which
// runs FOUR provider functions from a stack array built at 0x921c6dd8-0x921c6df0
// and joins whatever they return with string 0x920149b4 = L"%s\n":
//   [0] 0x921c6c40  resolution. avPack 0 -> string[354] "TV" (plus string[553]
//                   into labAVPackInfo and the switch art shown); avPack 2 or
//                   anything outside {4,6,8} -> string[354] "TV"; avPack 4/6/8
//                   -> FormatModeLabel of the CURRENT mode.
//   [1] 0x921c6018  aspect. Emits string[196] "Normal" or string[197]
//                   "Widescreen" from the 8-byte table at 0x92015198, and
//                   ALSO returns that record's second field - the metapane
//                   scene name - which the caller loads into scnCurrentFormat
//                   (0x921c7040-0x921c7084).
//   [2] 0x921c6548  PAL rate. Suppressed for avPack 4/6/8 and for AV region
//                   NTSC-M/NTSC-J. Otherwise queries the video mode's refresh
//                   rate and emits string[155] "PAL-60" or string[129] "PAL-50".
//   [3] 0x921cd6f8  reference level. Runs for avPack 4/6/8, or for AV region
//                   NTSC-M; emits one of strings 371-374.
// The aspect choice itself (0x921c6018): widescreen when the current mode's
// flags word has 0x8000 AND avPack != 0; otherwise bit 0x10000 of the user
// video-flags setting read by 0x921c8148.
//
// Ground truth for that state, from the footage: reference/frames/6717-60fps/
// f01580.png shows the Console Settings page with Display focused, and its
// metapane reads "1080p", "Widescreen", "Standard" - i.e. providers [0], [1]
// and [3] fired and [2] did not, which is exactly avPack in {4,6,8} on an
// NTSC-M console.
//
// ---------------------------------------------------------------------------
// 5. WHAT IS *NOT* RECOVERED - stated explicitly, exports left empty
// ---------------------------------------------------------------------------
// * dashSysCslSetDisplayFormat.xur: the scene already authors btnNormal and
//   btnWide and its own NavigationBreadcrumbs. dashVideoSettings_Format
//   (init at 0x921c5e90) only BINDS those two existing buttons (this+96,
//   this+100) and writes labCurrentSettings from the 0x92015198 table. It adds
//   NO rows. DISPLAY_FORMAT_CODE_ROWS is empty because there are none, not
//   because the search failed.
// * dashSysCslSetDisplayPal.xur: the scene authors ItemsText "PAL-60\nPAL-50".
//   dashVideoSettings_60 (init at 0x921c6130) binds listOptions and writes
//   labCurrentSettings only. DISPLAY_PAL_CODE_ROWS is empty for the same reason.
// * dashSysCslSetOutputLevels.xur IS in this archive (consoles/, 35 manifest
//   entries counting its locale tables) and the Display row pushes it; an
//   earlier draft here said it was not. Its three buttons and the level they
//   write are decoded in settingsModel.ts (dashOutputLevels, 0x921cd880 /
//   0x921cd660): btnExpanded 1, btnIntermediate 2, btnStandard 3, labels
//   371-374; 376/377 are its Black Level retitling on an SD pack.
// * The "Optimal Resolution" HiDef row (string 352): comes from the connected
//   display's reported native mode. No mode values exist in the image.
// * The meaning of the u16 behind .rdata slot 0x92000af8 (the 0x101 test that
//   picks the D-terminal mode list): unpatched import descriptor, not resolved.
// * The numeric AV-pack identities (0, 2, 3, 4, 6, 8) are the literal
//   comparisons in the code. This file does NOT claim which cable each is.
// * The Display page's rows carry NO metapane description index - the record
//   is 16 bytes with no description field, and the scene's labDescription text
//   is authored in the .xur. DISPLAY_ROW_DESCRIPTIONS is therefore empty.

export const DISPLAY_SETTINGS_PACK = 'consoles';
export const DISPLAY_SETTINGS_TABLE = 'dashCSettingsStrings.xus';

/** VA of the 4-record row table, .data, 16 bytes per record. */
export const DISPLAY_ROW_TABLE_VA = 0x927bfff0;
export const DISPLAY_ROW_RECORD_SIZE = 16;

/**
 * The condition under which a row's label / presence / enabled state changes.
 * Every value here is a literal comparison found in 0x921c6650.
 */
export type DisplayGate =
  /** Written unconditionally; the field is never touched again. */
  | 'always'
  /** AV pack query returned 4, 6 or 8 (an HD-capable output path). */
  | 'avPackIn468'
  /** AV pack not 4/6/8, and the secured AV region's second byte is 1 (NTSC-M). */
  | 'sdAndNtscM'
  /** AV pack not 4/6/8, and the AV region is anything but NTSC-M. */
  | 'sdAndNotNtscM'
  /** this+124: set unless avPack is outside {0,3,4,6,8} with mode-set kind 5. */
  | 'hdOk'
  /** !this+128: the current video mode is not flagged widescreen (0x8000). */
  | 'notWidescreenLocked'
  /** !this+132: the AV region is PAL *and* avPack is 0. */
  | 'palRegion';

export interface DisplayRow {
  /** Record index in the table at 0x927bfff0. */
  readonly slot: number;
  /** Default label: position in dashCSettingsStrings.xus, from image bytes. */
  readonly label: number;
  /** Label the code substitutes, with the gate that triggers it. */
  readonly altLabel: { readonly index: number; readonly when: DisplayGate } | null;
  /** Destination scene in consoles/. */
  readonly scene: string;
  /** Condition on the +8 field: whether the row is inserted at all. */
  readonly present: DisplayGate;
  /** Condition on the +12 field: whether the row is selectable. */
  readonly enabled: DisplayGate;
}

/** The table exactly as it sits in the image, with the code's overwrites named. */
export const DISPLAY_SETTINGS_ROWS: readonly DisplayRow[] = [
  {
    slot: 0,
    label: 223, // "HDTV Settings"
    altLabel: { index: 596, when: 'avPackIn468' }, // "Screen Resolution"
    scene: 'dashSysCslSetDisplayHiDef.xur',
    present: 'always',
    enabled: 'hdOk',
  },
  {
    slot: 1,
    label: 526, // "Screen Format"
    altLabel: null,
    scene: 'dashSysCslSetDisplayFormat.xur',
    present: 'always',
    enabled: 'notWidescreenLocked',
  },
  {
    slot: 2,
    label: 375, // "Reference Levels"
    altLabel: { index: 376, when: 'sdAndNotNtscM' }, // "Black Level"
    scene: 'dashSysCslSetOutputLevels.xur', // in consoles/; pushed by the row
    present: 'sdAndNotNtscM',
    enabled: 'sdAndNtscM',
  },
  {
    slot: 3,
    label: 379, // "PAL Settings"
    altLabel: null,
    scene: 'dashSysCslSetDisplayPal.xur',
    present: 'palRegion',
    enabled: 'palRegion',
  },
];

/**
 * The resolved row set for the state the reference footage shows: NTSC-M
 * region, AV pack in {4,6,8}, mode-set kind 0 or 2 (so row 0 keeps its
 * "HDTV Settings" label). PAL Settings is gone because the region is NTSC.
 * Screen Format is present but not selectable while the console runs a
 * widescreen mode, which "Widescreen" in f01580.png's metapane confirms.
 */
export const DISPLAY_ROWS_NTSC_HD: readonly {
  readonly label: number;
  readonly scene: string;
  readonly enabled: boolean;
}[] = [
  { label: 223, scene: 'dashSysCslSetDisplayHiDef.xur', enabled: true },   // HDTV Settings
  { label: 526, scene: 'dashSysCslSetDisplayFormat.xur', enabled: false }, // Screen Format
  { label: 375, scene: 'dashSysCslSetOutputLevels.xur', enabled: true },   // Reference Levels
];

/**
 * NOT RECOVERED: the Display page's rows carry no description index. The
 * record is 16 bytes and has no such field, so nothing here is a placeholder
 * for a lookup that exists - there is no per-row metapane text.
 */
export const DISPLAY_ROW_DESCRIPTIONS: readonly number[] = [];

// ---------------------------------------------------------------------------
// HiDef: the video mode tables
// ---------------------------------------------------------------------------

export interface VideoMode {
  readonly width: number;
  /** As stored: for 1080 modes a NEGATIVE height marks progressive. */
  readonly storedHeight: number;
  /** Absolute height, which is what "%d x %d" prints. */
  readonly height: number;
  readonly interlaced: boolean;
  /** Position in dashCSettingsStrings.xus, or 352/595 for a formatted label. */
  readonly nameIndex: number;
  /** Raw flags word at +6. 0x8000 = widescreen, 0x2000 = selectable. */
  readonly flags: number;
  readonly widescreen: boolean;
}

/**
 * VA 0x920150fc, 4 entries, reached through the ModeList at 0x9201511c
 * {_, count 4, entries 0x920150fc}. Also memcpy'd into the runtime buffer at
 * 0x92872ff8 for mode-set kind 0 or 2 (0x921c5e10-0x921c5e30, 32 bytes).
 */
export const MODES_HD_COMPONENT: readonly VideoMode[] = [
  { width: 640, storedHeight: 480, height: 480, interlaced: false, nameIndex: 219, flags: 0x2000, widescreen: false },   // "480p"
  { width: 1280, storedHeight: 720, height: 720, interlaced: false, nameIndex: 221, flags: 0xa000, widescreen: true },   // "720p"
  { width: 1920, storedHeight: 1080, height: 1080, interlaced: true, nameIndex: 215, flags: 0xe000, widescreen: true },  // "1080i"
  { width: 1920, storedHeight: -1080, height: 1080, interlaced: false, nameIndex: 217, flags: 0xa000, widescreen: true },// "1080p"
];

/**
 * VA 0x92015128, 4 entries, reached through the ModeList at 0x92015148.
 * Chosen instead of MODES_HD_COMPONENT when the u16 behind .rdata slot
 * 0x92000af8 equals 0x101. Its labels are the D-terminal names, so this is
 * the Japanese list (INFER - the 0x101 test itself is fact, its meaning is not).
 */
export const MODES_D_TERMINAL: readonly VideoMode[] = [
  { width: 640, storedHeight: 480, height: 480, interlaced: false, nameIndex: 220, flags: 0x2000, widescreen: false },   // "D2 (525p / 480p)"
  { width: 1920, storedHeight: 1080, height: 1080, interlaced: true, nameIndex: 216, flags: 0xe000, widescreen: true },  // "D3 (1125i / 1080i)"
  { width: 1280, storedHeight: 720, height: 720, interlaced: false, nameIndex: 222, flags: 0xa000, widescreen: true },   // "D4 (750p / 720p)"
  { width: 1920, storedHeight: -1080, height: 1080, interlaced: false, nameIndex: 218, flags: 0xa000, widescreen: true },// "D5 (1125p / 1080p)"
];

/**
 * VA 0x92015158, 8 entries, memcpy'd into the runtime buffer for mode-set
 * kind 4 (0x921c5e68-0x921c5e78, 64 bytes). Every entry names string 595
 * "%d x %d", so all eight rows render as "<width> x <height>".
 */
export const MODES_VGA: readonly VideoMode[] = [
  { width: 640, storedHeight: 480, height: 480, interlaced: false, nameIndex: 595, flags: 0x2000, widescreen: false },
  { width: 848, storedHeight: 480, height: 480, interlaced: false, nameIndex: 595, flags: 0xa000, widescreen: true },
  { width: 1024, storedHeight: 768, height: 768, interlaced: false, nameIndex: 595, flags: 0x2000, widescreen: false },
  { width: 1280, storedHeight: 720, height: 720, interlaced: false, nameIndex: 595, flags: 0xa000, widescreen: true },
  { width: 1280, storedHeight: 768, height: 768, interlaced: false, nameIndex: 595, flags: 0xa000, widescreen: true },
  { width: 1280, storedHeight: 1024, height: 1024, interlaced: false, nameIndex: 595, flags: 0x2000, widescreen: false },
  { width: 1360, storedHeight: 768, height: 768, interlaced: false, nameIndex: 595, flags: 0xa000, widescreen: true },
  { width: 1920, storedHeight: -1080, height: 1080, interlaced: false, nameIndex: 595, flags: 0xa000, widescreen: true },
];

/** How the HiDef page's listOptions is filled. There is no authored row set. */
export const HIDEF_LIST_SOURCE = {
  scene: 'dashSysCslSetDisplayHiDef.xur',
  list: 'listOptions',
  itemClass: 'dashCScreenSize',
  /** One row per mode of whichever table is selected. */
  fromCodeTable: true,
  /**
   * TRUE: a leading row labelled string 352 "Optimal Resolution" is inserted
   * at index 0 from the connected display's reported native mode
   * (0x921c5688-0x921c5750). Its width/height are NOT in the image.
   */
  prependsDisplayNativeMode: true,
  optimalResolutionLabel: 352,
  /** Header label swaps to this when the runtime list is a VGA-style set. */
  headerLabelWhenNonHd: 594,
  defaultHeaderLabel: 223,
} as const;

/**
 * The AV-pack values the Display code literally compares against, with the
 * table each one selects. The numbers are fact; no cable names are claimed.
 */
export const HIDEF_LIST_BY_AV_PACK: readonly {
  readonly avPack: number;
  readonly list: 'static' | 'runtime';
  readonly note: string;
}[] = [
  { avPack: 0, list: 'static', note: 'labAVPackInfo gets string 553 and the TV/HDTV switch art is shown' },
  { avPack: 3, list: 'static', note: 'static list, no AV-pack warning' },
  { avPack: 4, list: 'runtime', note: 'runtime list at 0x927bffe0' },
  { avPack: 6, list: 'runtime', note: 'runtime list at 0x927bffe0' },
  { avPack: 8, list: 'runtime', note: 'runtime list at 0x927bffe0' },
];

// ---------------------------------------------------------------------------
// Format and Pal: what code adds (nothing)
// ---------------------------------------------------------------------------

/**
 * EMPTY BY FINDING, NOT BY OMISSION. dashSysCslSetDisplayFormat.xur authors
 * btnNormal and btnWide itself; dashVideoSettings_Format (0x921c5e90) only
 * binds them and writes labCurrentSettings.
 */
export const DISPLAY_FORMAT_CODE_ROWS: readonly number[] = [];

/**
 * EMPTY BY FINDING. dashSysCslSetDisplayPal.xur authors ItemsText
 * "PAL-60\nPAL-50"; dashVideoSettings_60 (0x921c6130) only binds listOptions
 * and writes labCurrentSettings from string 155 / 129.
 */
export const DISPLAY_PAL_CODE_ROWS: readonly number[] = [];

// ---------------------------------------------------------------------------
// labCurrentSetting / scnCurrentFormat
// ---------------------------------------------------------------------------

/**
 * VA 0x92015198, 2 records x 8 bytes: { u16 nameIndex, u16 pad, wchar* scene }.
 * Indexed by (widescreen ? 1 : 0) at 0x921c60a4 and 0x921c5f00.
 */
export const SCREEN_FORMAT_CHOICES: readonly {
  readonly label: number;
  readonly metaPane: string;
}[] = [
  { label: 196, metaPane: 'metaPane_DisplayNormal.xur' },     // "Normal"
  { label: 197, metaPane: 'metaPane_DisplayWidescreen.xur' }, // "Widescreen"
];

export interface CurrentSettingProvider {
  /** Flat VA of the provider function. */
  readonly va: number;
  /** What it contributes to labCurrentSetting, in provider order. */
  readonly line: string;
  /** String-table indices it can emit. Empty when the text is formatted. */
  readonly strings: readonly number[];
  /** The query the value comes from. */
  readonly source: string;
}

/**
 * labCurrentSetting is the join of these four providers' output with L"%s\n"
 * (the format literal at 0x920149b4). Built as a stack array of function
 * pointers at 0x921c6dd8-0x921c6df0 and run by 0x921c6d88, which is also the
 * Console Settings table's Display-row handler - the same text fills the
 * Console Settings metapane.
 */
export const CURRENT_SETTING_PROVIDERS: readonly CurrentSettingProvider[] = [
  {
    va: 0x921c6c40,
    line: 'resolution',
    strings: [354],
    source:
      'AV pack 4/6/8: the current video mode formatted by 0x921cc080; any other AV pack: string 354 "TV". AV pack 0 also pushes string 553 into labAVPackInfo and shows the HDTV/TV switch art.',
  },
  {
    va: 0x921c6018,
    line: 'aspect',
    strings: [196, 197],
    source:
      'widescreen when the current mode flags have 0x8000 and AV pack != 0; otherwise bit 0x10000 of the user video-flags setting read by 0x921c8148 (ExGetXConfigSetting(3, 10)). Also returns the metaPane_Display*.xur name that scnCurrentFormat loads.',
  },
  {
    va: 0x921c6548,
    line: 'palRate',
    strings: [129, 155],
    source:
      'suppressed for AV pack 4/6/8 and for AV region NTSC-M/NTSC-J; otherwise the video mode query\'s refresh rate picks 155 "PAL-60" or 129 "PAL-50".',
  },
  {
    va: 0x921cd6f8,
    line: 'referenceLevel',
    strings: [371, 372, 373, 374],
    source:
      'runs for AV pack 4/6/8 or AV region NTSC-M; the level itself comes from import module 1 ordinal 34 via 0x921cd518.',
  },
];

/**
 * The values the reference footage pins down, so they can be recorded as
 * hardware state rather than guessed. Source frame:
 * reference/frames/6717-60fps/f01580.png, the Console Settings page with the
 * Display row focused; its metapane reads these three lines under
 * "Current Setting".
 */
export const CURRENT_SETTING_OBSERVED = {
  frame: 'reference/frames/6717-60fps/f01580.png',
  resolution: '1080p',      // provider 0, mode 1920x1080 progressive, string 217
  aspect: 'Widescreen',     // provider 1, string 197
  palRate: null,            // provider 2 produced nothing: NTSC region
  referenceLevel: 'Standard', // provider 3, string 374
  /** scnCurrentFormat therefore loads this scene. */
  metaPane: 'metaPane_DisplayWidescreen.xur',
} as const;

/** Import thunks the Display code depends on. Ordinals are read from the image. */
export const DISPLAY_IMPORTS: readonly {
  readonly thunk: number;
  readonly moduleIndex: number;
  readonly ordinal: number;
  readonly inferredName: string;
}[] = [
  { thunk: 0x9273990c, moduleIndex: 1, ordinal: 16, inferredName: 'ExGetXConfigSetting (INFER, from call shape)' },
  { thunk: 0x9273986c, moduleIndex: 0, ordinal: 971, inferredName: 'AV pack query / XGetAVPack (INFER)' },
  { thunk: 0x927396dc, moduleIndex: 0, ordinal: 977, inferredName: 'video mode query / XGetVideoMode (INFER)' },
  { thunk: 0x9273ab0c, moduleIndex: 1, ordinal: 638, inferredName: 'display info query (INFER)' },
  { thunk: 0x9273ab1c, moduleIndex: 1, ordinal: 624, inferredName: 'display-change notification register (INFER)' },
  { thunk: 0x9273989c, moduleIndex: 1, ordinal: 34, inferredName: 'reference-level read (INFER)' },
];
