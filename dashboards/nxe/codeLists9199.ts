// NXE 9199's own code-filled option lists, decoded from extracted/9199/basefile.exe.
//
// The Blades `CODE_LISTS` (dashboards/blades/codeLists.ts) are keyed by the
// same scene ids, but they carry 6770's tables: 12 languages, 75 time zones,
// 601-entry string indices, and the remote-control rows at 244/245. 9199's
// `consoles/dashCSettingsStrings.xus` has 621 entries and every table below
// moved, so each one is re-read here from the 9199 image. The image base is
// 0x92000000 and `.rdata`/`.data` are flat (file offset = VA - 0x92000000);
// `.text` addresses below are the ones `tools/ppc-dis.ts` prints, which are
// 0x200 above the true VA (LEARNINGS, "The extracted basefile.exe is
// flat-mapped, and its section headers lie").
//
// Every label is a POSITION in the 9199 `dashCSettingsStrings.xus`, never baked
// English, so `&locale=` works by index the way the console's did. The row
// ORDER is the table's own in every case.
//
// ---------------------------------------------------------------------------
// 1. Language - XuiList "lstLanguages", ClassOverride dashCLanguage
//    consoles/dashSysCslSetLanguage.xur
// ---------------------------------------------------------------------------
// Two tables in .rdata, back to back, right after the pointer to the wide
// literal L"dashCLanguage" (0x920169d4) at 0x92018bf8:
//
//   A. label array, VA 0x92018bfc, 13 x u32 labelIndex, indexed by a 0-BASED
//      language id (6770's ids were 1-based and the code did `addi -1`; 9199's
//      GetItemText at .text 0x9221e554-0x9221e574 indexes the array with the
//      id straight: `rlwinm r11,r11,2; lwzx r4, r11, r7(0x92018bfc)`).
//   B. display-order table, VA 0x92018c30, 5 groups x 13 x u32 language id,
//      stride 13 (`mulli r11, r11, 13` at 0x9221e558), each group padded with
//      zeros to 13; the group count (5) sits AFTER the groups at 0x92018c34 +
//      5 x 52 = 0x92018d38 - not before them as in 6770.
//
// The group is picked by region exactly as Blades' localeSettings.ts records
// (an instance field read at 0x92813894); a North-American console shows
// group 0, which is what LANGUAGE_ROWS_9199 carries [INFER: the region rule
// is 6770's, re-used because the 9199 selector was not re-traced]. Group 4 is
// the four-language China set ([10, 0, 1, 8] then zeros), the same shape as
// 6770's three-language group.
//
// ---------------------------------------------------------------------------
// 2. Locale - XuiList "lstCountries", ClassOverride dashCCountry
//    consoles/dashSysCslSetCountry.xur (network/ carries a second copy of the
//    scene with the same list; the table is one)
// ---------------------------------------------------------------------------
// Pointer to L"dashCCountry" (0x920169b8) at 0x92018d38, the count (u32 37) at
// 0x92018d3c, then 37 records of 8 bytes at 0x92018d40:
//     +0 u32 labelIndex   +4 u16 XC_LOCALE id   +6 u16 0
// The 9199 GetItemText addresses the rows at .text 0x9221e938-0x9221eaa8.
//
// ---------------------------------------------------------------------------
// 3. Time Zone - XuiList "lstTimezone", ClassOverride dashCTimezone
//    consoles/dashSysCslSetClockTimeZone.xur
// ---------------------------------------------------------------------------
// .data VA 0x927f0130, 65 records of 32 bytes (6770 had 75 at 0x927bf680):
//     +0 u32 labelIndex, +4 u32 bias (minutes << 16), +8 u32 std bias,
//     +12 ptr wide name, +16 eight u16 DST rule fields
// materialised at .text 0x92217208 / 0x9221741c / 0x922175d0. The record
// walk stops at the first record whose label is 0 or >= 621.
//
// ---------------------------------------------------------------------------
// 4. Remote Control - XuiList "listChannels", ClassOverride dashRemoteCList
//    consoles/dashSysCslSetRemoteC.xur
// ---------------------------------------------------------------------------
// No table, as in 6770. GetItemCount stores the literal 2 (.text 0x9221a6c0:
// `li r11, 2; stw r11, 4(r4)`); GetItemText does `273 + (row != 0)`
// (0x9221a674-0x9221a694: `lwz r11, 0(r31)` = row, `cntlzw; rlwinm 27,31,31;
// xori 1` = row != 0, `addi r11, r11, 273`, then the string fetch 0x9218b300).
// [273] "Both Remotes", [274] "Xbox 360 Media Remote" - and "Both Remotes" is
// the value the reference console shows [FRAME Kpa f0383].
//
// ---------------------------------------------------------------------------
// 5. Pass code hints - XuiList "lstHintQ", ClassOverride dashCHints
//    consoles/dashSysCslSetPControlPasscodeHint.xur
// ---------------------------------------------------------------------------
// u16[5] at 0x9201a06c = 433..437, u16 0 pad, count u32 5 at 0x9201a078;
// read at .text 0x92216924 / 0x92216e54 / 0x922170ec / 0x9221f6a8.
//
// ---------------------------------------------------------------------------
// 6. Display - XuiCommonList "lstSettings", the 16-byte table at 0x927f0ae0
//    (NXE_GLUE_SPEC §5): (u32 label, ptr wide scene, u32 present, u32 enabled),
//    seven rows, present = enabled = 1 on every row in this image.
// ---------------------------------------------------------------------------
import type { CodeList, CodeListRow } from '@dash/blades/codeLists';
import type { SettingsRow } from '@dash/blades/consoleSettings';

export const SETTINGS_STRINGS_PACK_9199 = 'consoles';
export const SETTINGS_STRINGS_TABLE_9199 = 'dashCSettingsStrings.xus';

/** 0x92018bfc: label index by 0-based language id. */
export const LANGUAGE_LABELS_9199: readonly number[] = [
  168, // 0  English
  169, // 1  English (QWERTY Keyboard)
  295, // 2  日本語
  229, // 3  Deutsch
  224, // 4  Français
  524, // 5  Español
  283, // 6  Italiano
  305, // 7  한국어
  100, // 8  中文(繁體)
  509, // 9  Português (Brasil)
  101, // 10 中文(简体)
  508, // 11 Polski
  513, // 12 Pусский
];
export const LANGUAGE_LABELS_VA_9199 = 0x92018bfc;

/** 0x92018c30: five display-order groups, stride 13, zero-padded. */
export const LANGUAGE_GROUPS_9199: readonly (readonly number[])[] = [
  [0, 1, 5, 4, 3, 6, 9, 12, 11, 2, 7, 8],
  [2, 7, 8, 0, 1, 4, 3, 6, 9, 5, 12, 11],
  [7, 2, 8, 0, 1, 4, 3, 6, 9, 5, 12, 11],
  [0, 1, 4, 3, 6, 9, 5, 12, 11, 2, 7, 8],
  [10, 0, 1, 8],
];
export const LANGUAGE_GROUPS_VA_9199 = 0x92018c30;
export const LANGUAGE_GROUP_STRIDE_9199 = 13;
/** The group a North-American console shows [INFER, the 6770 region rule]. */
export const LANGUAGE_GROUP_OFFLINE_9199 = 0;

export const LANGUAGE_ROWS_9199: readonly CodeListRow[] =
  LANGUAGE_GROUPS_9199[LANGUAGE_GROUP_OFFLINE_9199]!.map((id) => ({ label: LANGUAGE_LABELS_9199[id]!, scene: null }));

/** 0x92018d40: 37 x (label, XC_LOCALE). */
export interface CountryRow9199 { label: number; locale: number }
export const COUNTRY_TABLE_VA_9199 = 0x92018d40;
export const COUNTRY_COUNT_VA_9199 = 0x92018d3c;
export const COUNTRY_ROWS_9199: readonly CountryRow9199[] = [
  { label: 8, locale: 6 },     // Australia
  { label: 5, locale: 5 },     // Austria
  { label: 58, locale: 8 },    // Belgium
  { label: 63, locale: 13 },   // Brazil
  { label: 68, locale: 16 },   // Canada
  { label: 102, locale: 19 },  // Chile
  { label: 103, locale: 20 },  // China
  { label: 104, locale: 21 },  // Colombia
  { label: 105, locale: 23 },  // Czech Republic
  { label: 148, locale: 25 },  // Denmark
  { label: 187, locale: 32 },  // Finland
  { label: 215, locale: 34 },  // France
  { label: 138, locale: 24 },  // Germany
  { label: 240, locale: 37 },  // Greece
  { label: 254, locale: 39 },  // Hong Kong SAR
  { label: 257, locale: 42 },  // Hungary
  { label: 259, locale: 46 },  // India
  { label: 258, locale: 44 },  // Ireland
  { label: 276, locale: 50 },  // Italy
  { label: 294, locale: 53 },  // Japan
  { label: 303, locale: 56 },  // Korea
  { label: 322, locale: 71 },  // Mexico
  { label: 360, locale: 74 },  // Netherlands
  { label: 373, locale: 76 },  // New Zealand
  { label: 361, locale: 75 },  // Norway
  { label: 505, locale: 82 },  // Poland
  { label: 511, locale: 84 },  // Portugal
  { label: 512, locale: 88 },  // Russia
  { label: 520, locale: 91 },  // Singapore
  { label: 522, locale: 93 },  // Slovakia
  { label: 620, locale: 109 }, // South Africa
  { label: 170, locale: 31 },  // Spain
  { label: 518, locale: 90 },  // Sweden
  { label: 98, locale: 18 },   // Switzerland
  { label: 572, locale: 101 }, // Taiwan
  { label: 228, locale: 35 },  // United Kingdom
  { label: 593, locale: 103 }, // United States
];

/** 0x927f0130: 65 x 32-byte records; the label is the first u32. */
export const TIMEZONE_TABLE_VA_9199 = 0x927f0130;
export const TIMEZONE_RECORD_SIZE_9199 = 32;
export const TIMEZONE_LABELS_9199: readonly number[] = [
  569, 514, 243, 1, 400, 55, 4, 313, 99, 87, 85, 309, 517, 166, 62, 7, 83, 515, 342, 64,
  67, 241, 310, 311, 82, 84, 307, 61, 60, 402, 516, 86, 6, 66, 69, 510, 253, 293, 54, 306,
  312, 331, 568, 3, 56, 296, 167, 275, 343, 297, 2, 147, 535, 619, 57, 304, 59, 256, 272, 521,
  504, 567, 570, 519, 618,
];

/** The remote-control rows: 273 + (row != 0) [.text 0x9221a674-0x9221a694]. */
export const REMOTE_BASE_9199 = 273;
export const REMOTE_COUNT_9199 = 2;
export const REMOTE_ROWS_9199: readonly CodeListRow[] = [
  { label: REMOTE_BASE_9199 },     // Both Remotes
  { label: REMOTE_BASE_9199 + 1 }, // Xbox 360 Media Remote
];

/** 0x9201a06c: u16[5], count 5 at 0x9201a078. */
export const HINT_TABLE_VA_9199 = 0x9201a06c;
export const HINT_ROWS_9199: readonly number[] = [433, 434, 435, 436, 437];

/** 0x927f0ae0: the Display sub-list (NXE_GLUE_SPEC §5), now wired. */
export const DISPLAY_TABLE_VA_9199 = 0x927f0ae0;
export const DISPLAY_ROWS_9199: readonly SettingsRow[] = [
  { label: 252, description: -1, scene: 'dashSysCslSetDisplayHiDef.xur' },        // HDTV Settings
  { label: 545, description: -1, scene: 'dashSysCslSetDisplayFormat.xur' },       // Screen Format
  { label: 397, description: -1, scene: 'dashSysCslSetOutputLevels.xur' },        // Reference Levels
  { label: 401, description: -1, scene: 'dashSysCslSetDisplayPal.xur' },          // PAL Settings
  { label: 126, description: -1, scene: 'dashSysCslSetColorSpace.xur' },          // HDMI Color Space
  { label: 155, description: -1, scene: 'dashSysCslSetDisplayDiscovery.xur' },    // Display Discovery
  { label: 546, description: -1, scene: 'dashSysCslSetScreensaver.xur' },         // Screen Saver
];

const T = { pack: SETTINGS_STRINGS_PACK_9199, table: SETTINGS_STRINGS_TABLE_9199 };

/**
 * Every code-filled list the 9199 offline tree reaches, keyed by scene id and
 * the list's own Id (the Blades shape, so `lists.ts`'s consumers read both).
 */
export const CODE_LISTS_9199: Readonly<Record<string, readonly CodeList[]>> = {
  'consoles/dashSysCslSetDisplay.xur': [{
    list: 'lstSettings', ...T,
    va: '0x927f0ae0 (7 x 16: label, wide scene, present, enabled)',
    rows: DISPLAY_ROWS_9199.map((r) => ({ label: r.label, scene: r.scene })),
  }],
  'consoles/dashSysCslSetLanguage.xur': [{
    list: 'lstLanguages', ...T,
    va: '0x92018bfc (13 labels by 0-based id) + 0x92018c30 (5 groups, stride 13); group 0',
    rows: LANGUAGE_ROWS_9199,
  }],
  'consoles/dashSysCslSetCountry.xur': [{
    list: 'lstCountries', ...T,
    va: '0x92018d40 (37 x 8: label, u16 XC_LOCALE, u16 0), count at 0x92018d3c',
    rows: COUNTRY_ROWS_9199.map((r) => ({ label: r.label, scene: null })),
  }],
  'network/dashSysCslSetCountry.xur': [{
    list: 'lstCountries', ...T,
    va: '0x92018d40 - the same dashCCountry table; the network pack carries a second copy of the scene',
    rows: COUNTRY_ROWS_9199.map((r) => ({ label: r.label, scene: null })),
  }],
  'consoles/dashSysCslSetClockTimeZone.xur': [{
    list: 'lstTimezone', ...T,
    va: '0x927f0130 (65 x 32: label, bias, std bias, name, DST rules)',
    rows: TIMEZONE_LABELS_9199.map((label) => ({ label, scene: null })),
  }],
  'consoles/dashSysCslSetRemoteC.xur': [{
    list: 'listChannels', ...T,
    va: 'no table: count 2 at .text 0x9221a6c0, label 273 + (row != 0) at 0x9221a674-0x9221a694',
    rows: REMOTE_ROWS_9199,
  }],
  'consoles/dashSysCslSetPControlPasscodeHint.xur': [{
    list: 'lstHintQ', ...T,
    va: '0x9201a06c (u16[5]), count u32 5 at 0x9201a078',
    rows: HINT_ROWS_9199.map((label) => ({ label, scene: null })),
  }],
};

/**
 * Code-driven lists the shell reaches and does NOT fill, with the reason. Each
 * is reported in `__dash.nxe.codeUnfilled` on the page that mounts it, so an
 * empty list says why it is empty instead of looking finished.
 */
export const CODE_LISTS_NOT_FILLED_9199: Readonly<Record<string, string>> = {
  'consoles/dashSysCslSetDisplayHiDef.xur#listOptions':
    'a hardware query: the mode list is chosen by the AV pack and PREPENDED with a row built from the '
    + 'attached display\'s reported native mode (EDID); no display is attached here (the Blades rule, '
    + 'dashboards/blades/codeLists.ts).',
  'consoles/dashSysCslSetClockTime.xur#lstHour/lstMin/lstDay/lstMonth/lstYear':
    'numeric spinners the code sprintfs around the console clock; only lstAMPM is authored. The VALUE they '
    + 'come up on is the console\'s RTC, which this build has no reading of.',
  'consoles/dashSysCslSetPControlFamilyTimer.xur#lstTime':
    'computed from the family-timer frequency and a profile setting; no profile is signed in.',
  'consoles/dashSysCslSetPControlGame.xur#lstRating':
    'region-selected out of 29 rating tables by the console\'s XC_LOCALE; the locale pick is not wired.',
  'consoles/dashSysCslSetPControlVideoMovie.xur#lstRating':
    'region-selected out of 29 rating tables by the console\'s XC_LOCALE; the locale pick is not wired.',
  'consoles/dashSysCslSetPControlVideoTV.xur#lstRating':
    'region-selected out of 29 rating tables by the console\'s XC_LOCALE; the locale pick is not wired.',
  'memory/DeviceSelector.xur#list_devices':
    'the attached storage devices - device state; the page\'s own "No storage devices found." label is what '
    + 'the console shows with none.',
  'dashcomm/MediaSourceSelection.xur#listMediaSources':
    'the media sources on the network - device state.',
  'consoles/dashSysLiveVision.xur':
    'the camera\'s own settings - hardware state, no camera attached.',
  'arcade/CollectionFilterPanel.xur#lstCollections':
    'filled by CollectionFilterList from the title database (arcade/Strings.xus [41] "All Games", [44] "Full Games", '
    + '[43] "Game Demos and Trials", [42] "Arcade Games", [48] "Xbox 360 Games", [50] "Indie Games" are the six rows '
    + 'the capture shows [FRAME Yrt f0396]); which rows a console lists depends on its installed titles, so the '
    + 'list is left empty and the strings are named here rather than painted from a frame.',
  'arcade/RecentGamesFilterPanel.xur#lstRecentGames':
    'the recently played titles - profile and storage state; the panel\'s own labEmpty says so.',
};
