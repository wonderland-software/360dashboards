// Console Settings: Language, Locale and Time Zone rows.
//
// All three lists ship with ItemsText="" in their .xur. Each XuiList carries a
// ClassOverride whose native class fills the list from a static table compiled
// into the executable (extracted/6770/basefile.exe). Nothing below is guessed:
// every row is bytes read out of the image, and every English string is the
// entry that index resolves to in the 601-entry positional table
// consoles/dashCSettingsStrings.xus.
//
// ---------------------------------------------------------------------------
// Address note
// ---------------------------------------------------------------------------
// In this decrypted basefile the .rdata and .data payloads both sit at
// file offset = VA - 0x92000000. (The PE section header's PointerToRawData for
// .data implies a 0x1200 skew; that skew is wrong for this extracted image.
// Proof: dashCTimezone::GetItemText at .text 0x921c4fa0 materialises the base
// 0x927bf680 with lis 0x927c / addi -2432, and 0x927bf680 - 0x92000000 =
// file offset 0x7bf680, which is where the time-zone records actually are.
// The header mapping would point at 0x7be480, which is all zeroes.)
//
// ---------------------------------------------------------------------------
// 1. Language - XuiList "lstLanguages", ClassOverride dashCLanguage
//    consoles/dashSysCslSetLanguage.xur
// ---------------------------------------------------------------------------
// Two tables, both in .rdata, laid out back to back right after the wide
// literal L"dashCLanguage" (0x92014310, whose address sits at 0x92016d88):
//
//   A. label array, VA 0x92016d8c, 12 x u32, one u32 per record:
//        u32 labelIndex   -> position in dashCSettingsStrings.xus
//      Indexed by (XC_LANGUAGE id - 1); entry 0 is English.
//
//   B. display-order table, VA 0x92016dc0, 5 groups x 12 x u32:
//        u32 languageId   -> XC_LANGUAGE id, 0 terminates the group
//      The u32 at VA 0x92016dbc immediately before it is 5, the group count.
//
// How it was proved. dashCLanguage::GetItemText (.text 0x921cbd20):
//     lwz  r10, 0(r31)            ; row index
//     lwz  r11, 12520(r9)         ; r9 = 0x92870000, so g = *(u32*)0x928730e8
//     mulli r11, r11, 12
//     add  r9, r11, r10
//     rlwinm r8, r9, 2
//     lwzx r11, r8, 0x92016dc0    ; lang = order[g*12 + row]
//     addi r11, r11, -1
//     rlwinm r11, r11, 2
//     lwzx r4, r11, 0x92016d8c    ; labelIndex = label[lang - 1]
//     bl   0x9214ede8             ; resolve from the string table
// dashCLanguage::GetItemCount (.text 0x921cbdb0) returns an instance field set
// at 0x921cbec0 to 3 when the region equals 0x0104 and 11 otherwise.
// The group setter at .text 0x921cbe38 clamps: values >= 5 store 0.
//
// Which group is live is chosen once, in dashLanguageSettings, at .text
// 0x921ca7d0, from the value of the xam.xex import thunk at 0x9273a2ec:
//     v = thunk();  hi = (v >> 8) & 0xFF
//     hi == 0                 -> group 0
//     hi == 1 and v == 0x0101 -> group 1
//     hi == 1 and v == 0x0104 -> group 4
//     hi == 1  (otherwise)    -> group 2
//     hi >= 2                 -> group 3
// INFER: that thunk is XGetGameRegion and the constants are XC_GAME_REGION_*
// (0x00xx America, 0x0101 Japan, 0x0104 China, 0x02xx/0x03xx Europe and rest
// of world). The comparisons and the group numbers are read straight from the
// branch bytes; only the API name and the region labels are inferred.
// A US / North-America console therefore shows group 0, which is what
// LANGUAGE_ROWS below carries. All 5 groups are exported so the other regions
// are available without re-reading the image.
//
// ---------------------------------------------------------------------------
// 2. Locale - XuiList "lstCountries", ClassOverride dashCCountry
//    consoles/dashSysCslSetCountry.xur AND oobe/oobeCountry.xur (same class,
//    same table; the OOBE scene's list is also Id="lstCountries").
// ---------------------------------------------------------------------------
// Table VA 0x92016eb8, 37 records, 8 bytes each:
//     +0x00 u32 labelIndex  -> position in dashCSettingsStrings.xus
//     +0x04 u16 localeId    -> XC_LOCALE id
//     +0x06 u16 (0 in every one of the 37 rows)
// The u32 at VA 0x92016eb4 immediately before the table is 37, and the wide
// literal L"dashCCountry" pointer sits at 0x92016eb0 just before that.
//
// How it was proved. dashCCountry::GetItemCount (.text 0x921cc078) is
// "li r10, 37; stw r10, 4(r4)" - a constant, so the list is never filtered by
// region or hardware. GetItemText (.text 0x921cc008) does
// "rlwinm r10, r9, 3" (row * 8) then "lwzx r4, r10, 0x92016eb8", which fixes
// both the 8-byte stride and labelIndex at +0. The locale lookup at
// .text 0x921cc0d8 walks the same table with "addi r10, r10, 8" reading
// "lhz" from +4 and stopping at 37, which fixes localeId as a u16 at +4;
// .text 0x921cc150 reads it back with lhzx from 0x92016eb8+4.
// No sort runs at load: the order below is the table order, which happens to
// be alphabetical by the ENGLISH name (a localised build would show the same
// order with translated names).
//
// ---------------------------------------------------------------------------
// 3. Time Zone - XuiList "lstTimezone", ClassOverride dashCTimezone
//    consoles/dashSysCslSetClockTimeZone.xur
// ---------------------------------------------------------------------------
// Table VA 0x927bf680 (file offset 0x7bf680), 75 records, 32 bytes each:
//     +0x00 u32 labelIndex     -> position in dashCSettingsStrings.xus
//     +0x04 i16 bias           -> minutes WEST of UTC (Win32 TIME_ZONE Bias)
//     +0x06 i16 standardBias   -> 0 in all 75 rows
//     +0x08 i16 daylightBias   -> -60 where DST is observed, else 0
//     +0x0a i16 pad            -> 0 in all 75 rows
//     +0x0c ptr  wide standard abbreviation literal in .rdata
//     +0x10 u32 standard rule  -> packed bytes month, week, dayOfWeek, hour
//     +0x14 ptr  wide daylight abbreviation literal, 0 when no DST
//     +0x18 u32 daylight rule  -> same packing
//     +0x1c u32 observesDst    -> 1 where the DST fields are filled, else 0
// A three-word descriptor in .rdata at 0x92014f84 reads
// { &L"dashCTimezone", 0x18, 0x4b }; 0x4b is the 75 row count. The 0x18 (24)
// is NOT identified - nothing in .text reads either word, so it is recorded
// here and not interpreted.
//
// How it was proved. dashCTimezone::GetItemCount (.text 0x921c4fe0) is
// "li r10, 75" - a constant, so this list too is never filtered.
// GetItemText (.text 0x921c4fa0) does "rlwinm r10, r9, 5" (row * 32) then
// "lwzx r4, r10, 0x927bf680", fixing the 32-byte stride and labelIndex at +0.
// The search loop at .text 0x921c4f20 uses "li r26, 75" and
// "addi r27, r27, 32". The bias column is self-checking: every row's bias
// equals the GMT offset printed in its own label string (GMT-12 -> +720,
// GMT+05:45 -> -345), across all 75 rows.
// The rows are in table order, ascending GMT offset, no runtime sort.
//
// Two oddities in the shipped data, left exactly as the image has them:
// "GMT-07 Arizona" points at the literal "AMST", and the daylight name of
// "GMT-07 Mountain" points at "MST" rather than the "MDT" literal that exists
// at 0x92014f10 and is used by "GMT-06 Mexico City".
//
// ---------------------------------------------------------------------------
// Not recovered: nothing. All three tables are complete (12 + 5 groups,
// 37 rows, 75 rows). No export below is an empty array.
export const LOCALE_SETTINGS_PACK = 'consoles';
export const LOCALE_SETTINGS_TABLE = 'dashCSettingsStrings.xus';

/**
 * VA 0x92016d8c - dashCSettingsStrings.xus index of each language's own name.
 * The image array is 12 u32 indexed by (XC_LANGUAGE id - 1); slot 0 below is a
 * placeholder so this array can be indexed by the id itself.
 */
export const LANGUAGE_LABEL_BY_ID: readonly number[] = [
  0, // placeholder - there is no XC_LANGUAGE 0
  141, // 1 "English"
  266, // 2 "日本語"
  199, // 3 "Deutsch"
  194, // 4 "Français"
  505, // 5 "Español"
  254, // 6 "Italiano "
  276, // 7 "한국어"
  87, // 8 "中文(繁體)"
  490, // 9 "Português (Brasil)"
  88, // 10 "中文(简体)"
  489, // 11 "Polski"
  494, // 12 "Pусский"
];

/**
 * VA 0x92016dc0 - the five region orderings, as XC_LANGUAGE ids.
 * Each group is 12 u32 in the image, terminated by a 0 that is dropped here.
 */
export const LANGUAGE_ORDERS: readonly (readonly number[])[] = [
  // group 0 - America (region high byte 0): English / Español / Français / Deutsch / Italiano  / Português (Brasil) / Pусский / Polski / 日本語 / 한국어 / 中文(繁體)
  [1, 5, 4, 3, 6, 9, 12, 11, 2, 7, 8],
  // group 1 - Japan (region 0x0101): 日本語 / 한국어 / 中文(繁體) / English / Français / Deutsch / Italiano  / Português (Brasil) / Español / Pусский / Polski
  [2, 7, 8, 1, 4, 3, 6, 9, 5, 12, 11],
  // group 2 - rest of Asia (region high byte 1, not 0x0101/0x0104): 한국어 / 日本語 / 中文(繁體) / English / Français / Deutsch / Italiano  / Português (Brasil) / Español / Pусский / Polski
  [7, 2, 8, 1, 4, 3, 6, 9, 5, 12, 11],
  // group 3 - Europe and rest of world (region high byte >= 2): English / Français / Deutsch / Italiano  / Português (Brasil) / Español / Pусский / Polski / 日本語 / 한국어 / 中文(繁體)
  [1, 4, 3, 6, 9, 5, 12, 11, 2, 7, 8],
  // group 4 - China (region 0x0104): 中文(简体) / English / 中文(繁體)
  [10, 1, 8],
];

export interface LanguageRow {
  /** XC_LANGUAGE id. */
  language: number;
  /** Position in dashCSettingsStrings.xus for the row label. */
  label: number;
}

/**
 * The rows a North-America console shows: LANGUAGE_ORDERS[0] resolved through
 * LANGUAGE_LABEL_BY_ID. 11 rows, matching the count 11 stored at .text
 * 0x921cbec0 for every region except 0x0104 (China), which shows 3.
 */
export const LANGUAGE_ROWS: readonly LanguageRow[] = [
  { language: 1, label: 141 }, // English
  { language: 5, label: 505 }, // Español
  { language: 4, label: 194 }, // Français
  { language: 3, label: 199 }, // Deutsch
  { language: 6, label: 254 }, // Italiano 
  { language: 9, label: 490 }, // Português (Brasil)
  { language: 12, label: 494 }, // Pусский
  { language: 11, label: 489 }, // Polski
  { language: 2, label: 266 }, // 日本語
  { language: 7, label: 276 }, // 한국어
  { language: 8, label: 87 }, // 中文(繁體)
];

/** Index into LANGUAGE_ORDERS chosen at .text 0x921ca7d0 for a US console. */
export const LANGUAGE_ORDER_DEFAULT = 0;

export interface CountryRow {
  /** Position in dashCSettingsStrings.xus for the row label. */
  label: number;
  /** XC_LOCALE id stored as a u16 at +0x04 of the record. */
  locale: number;
}

/** VA 0x92016eb8 - all 37 rows, in table order. */
export const COUNTRY_ROWS: readonly CountryRow[] = [
  { label: 8, locale: 6 }, // Australia
  { label: 5, locale: 5 }, // Austria
  { label: 46, locale: 8 }, // Belgium
  { label: 51, locale: 13 }, // Brazil
  { label: 56, locale: 16 }, // Canada
  { label: 89, locale: 19 }, // Chile
  { label: 90, locale: 20 }, // China
  { label: 91, locale: 21 }, // Colombia
  { label: 92, locale: 23 }, // Czech Republic
  { label: 125, locale: 25 }, // Denmark
  { label: 157, locale: 32 }, // Finland
  { label: 185, locale: 34 }, // France
  { label: 115, locale: 24 }, // Germany
  { label: 210, locale: 37 }, // Greece
  { label: 225, locale: 39 }, // Hong Kong SAR
  { label: 228, locale: 42 }, // Hungary
  { label: 230, locale: 46 }, // India
  { label: 229, locale: 44 }, // Ireland
  { label: 247, locale: 50 }, // Italy
  { label: 265, locale: 53 }, // Japan
  { label: 274, locale: 56 }, // Korea
  { label: 293, locale: 71 }, // Mexico
  { label: 336, locale: 74 }, // Netherlands
  { label: 351, locale: 76 }, // New Zealand
  { label: 337, locale: 75 }, // Norway
  { label: 486, locale: 82 }, // Poland
  { label: 492, locale: 84 }, // Portugal
  { label: 493, locale: 88 }, // Russia
  { label: 501, locale: 91 }, // Singapore
  { label: 503, locale: 93 }, // Slovakia
  { label: 600, locale: 109 }, // South Africa
  { label: 142, locale: 31 }, // Spain
  { label: 499, locale: 90 }, // Sweden
  { label: 86, locale: 18 }, // Switzerland
  { label: 554, locale: 101 }, // Taiwan
  { label: 198, locale: 35 }, // United Kingdom
  { label: 575, locale: 103 }, // United States
];

export interface TimezoneRow {
  /** Position in dashCSettingsStrings.xus for the row label. */
  label: number;
  /** Minutes west of UTC (record +0x04). */
  bias: number;
  /** Record +0x08; -60 where daylight saving is observed, else 0. */
  daylightBias: number;
  /** Wide literal at record +0x0c, baked into the executable (not localised). */
  standardName: string;
  /** Wide literal at record +0x14, or null when the row has no DST rule. */
  daylightName: string | null;
  /** Record +0x10, packed bytes: month, week, dayOfWeek, hour. 0 when unused. */
  standardRule: number;
  /** Record +0x18, same packing. 0 when unused. */
  daylightRule: number;
  /** Record +0x1c; 1 where the DST fields are filled. */
  observesDst: boolean;
}

/** VA 0x927bf680 - all 75 rows, in table order (ascending GMT offset). */
export const TIMEZONE_ROWS: readonly TimezoneRow[] = [
  { label: 551, bias: 720, daylightBias: 0, standardName: "IDLW", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT-12 Tokelau
  { label: 495, bias: 660, daylightBias: 0, standardName: "NT", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT-11 Samoa
  { label: 214, bias: 600, daylightBias: 0, standardName: "HST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT-10 Hawaii
  { label: 1, bias: 540, daylightBias: -60, standardName: "YST", daylightName: "YDT", standardRule: 0x0a050002, daylightRule: 0x04010002, observesDst: true }, // GMT-09 Alaska
  { label: 378, bias: 480, daylightBias: -60, standardName: "PST", daylightName: "PDT", standardRule: 0x0a050002, daylightRule: 0x04010002, observesDst: true }, // GMT-08 Pacific
  { label: 4, bias: 420, daylightBias: 0, standardName: "AMST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT-07 Arizona
  { label: 284, bias: 420, daylightBias: -60, standardName: "MST", daylightName: "MST", standardRule: 0x0a050002, daylightRule: 0x04010002, observesDst: true }, // GMT-07 Mountain
  { label: 75, bias: 360, daylightBias: 0, standardName: "CAST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT-06 Central America
  { label: 73, bias: 360, daylightBias: -60, standardName: "CST", daylightName: "CDT", standardRule: 0x0a050002, daylightRule: 0x04010002, observesDst: true }, // GMT-06 Central
  { label: 280, bias: 360, daylightBias: -60, standardName: "MST", daylightName: "MDT", standardRule: 0x0a050002, daylightRule: 0x04010002, observesDst: true }, // GMT-06 Mexico City
  { label: 498, bias: 360, daylightBias: 0, standardName: "CCST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT-06 Saskatchewan
  { label: 139, bias: 300, daylightBias: -60, standardName: "EST", daylightName: "EDT", standardRule: 0x0a050002, daylightRule: 0x04010002, observesDst: true }, // GMT-05 Eastern
  { label: 50, bias: 300, daylightBias: 0, standardName: "SPST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT-05 Bogota
  { label: 7, bias: 240, daylightBias: -60, standardName: "AST", daylightName: "ADT", standardRule: 0x0a050002, daylightRule: 0x04010002, observesDst: true }, // GMT-04 Atlantic
  { label: 71, bias: 240, daylightBias: 0, standardName: "SWST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT-04 Caracas
  { label: 496, bias: 240, daylightBias: -60, standardName: "PSST", daylightName: "PSDT", standardRule: 0x03020600, daylightRule: 0x0a020600, observesDst: true }, // GMT-04 Santiago
  { label: 318, bias: 210, daylightBias: -60, standardName: "NST", daylightName: "NDT", standardRule: 0x0a050002, daylightRule: 0x04010002, observesDst: true }, // GMT-03:30 Newfoundland
  { label: 52, bias: 180, daylightBias: -60, standardName: "ESST", daylightName: "ESDT", standardRule: 0x02020002, daylightRule: 0x0a030002, observesDst: true }, // GMT-03 Brasilia
  { label: 55, bias: 180, daylightBias: 0, standardName: "SEST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT-03 Buenos Aires
  { label: 211, bias: 180, daylightBias: -60, standardName: "GST", daylightName: "GDT", standardRule: 0x0a050002, daylightRule: 0x04010002, observesDst: true }, // GMT-03 Greenland
  { label: 281, bias: 120, daylightBias: -60, standardName: "MAST", daylightName: "MADT", standardRule: 0x09050002, daylightRule: 0x03050002, observesDst: true }, // GMT-02 Mid-Atlantic
  { label: 282, bias: 60, daylightBias: -60, standardName: "AST", daylightName: "ADT", standardRule: 0x0a050003, daylightRule: 0x03050002, observesDst: true }, // GMT-01 Azores
  { label: 70, bias: 60, daylightBias: 0, standardName: "WAT", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT-01 Cape Verde Is.
  { label: 72, bias: 0, daylightBias: 0, standardName: "GST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+00 Casablanca
  { label: 278, bias: 0, daylightBias: -60, standardName: "GMT", daylightName: "BST", standardRule: 0x0a050002, daylightRule: 0x03050001, observesDst: true }, // GMT+00 London
  { label: 49, bias: -60, daylightBias: -60, standardName: "WEST", daylightName: "WEDT", standardRule: 0x0a050003, daylightRule: 0x03050002, observesDst: true }, // GMT+01 Berlin
  { label: 48, bias: -60, daylightBias: -60, standardName: "CEST", daylightName: "CEDT", standardRule: 0x0a050003, daylightRule: 0x03050002, observesDst: true }, // GMT+01 Belgrade
  { label: 380, bias: -60, daylightBias: -60, standardName: "RST", daylightName: "RDT", standardRule: 0x0a050003, daylightRule: 0x03050002, observesDst: true }, // GMT+01 Paris
  { label: 497, bias: -60, daylightBias: -60, standardName: "SCST", daylightName: "SCDT", standardRule: 0x0a050003, daylightRule: 0x03050002, observesDst: true }, // GMT+01 Sarajevo
  { label: 74, bias: -60, daylightBias: 0, standardName: "WAST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+01 W. Central Africa
  { label: 6, bias: -120, daylightBias: -60, standardName: "GTST", daylightName: "GTDT", standardRule: 0x0a050003, daylightRule: 0x03050002, observesDst: true }, // GMT+02 Athens
  { label: 54, bias: -120, daylightBias: -60, standardName: "EEST", daylightName: "EEDT", standardRule: 0x09050001, daylightRule: 0x03050000, observesDst: true }, // GMT+02 Bucharest
  { label: 57, bias: -120, daylightBias: -60, standardName: "EST", daylightName: "EDT", standardRule: 0x09050302, daylightRule: 0x05010502, observesDst: true }, // GMT+02 Cairo
  { label: 491, bias: -120, daylightBias: 0, standardName: "SAST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+02 Pretoria
  { label: 224, bias: -120, daylightBias: -60, standardName: "FLST", daylightName: "FLDT", standardRule: 0x0a050004, daylightRule: 0x03050003, observesDst: true }, // GMT+02 Helsinki
  { label: 264, bias: -120, daylightBias: 0, standardName: "JST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+02 Jerusalem
  { label: 43, bias: -180, daylightBias: -60, standardName: "AST", daylightName: "ADT", standardRule: 0x0a010004, daylightRule: 0x04010003, observesDst: true }, // GMT+03 Baghdad
  { label: 277, bias: -180, daylightBias: 0, standardName: "AST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+03 Kuwait
  { label: 283, bias: -180, daylightBias: -60, standardName: "RST", daylightName: "RDT", standardRule: 0x0a050003, daylightRule: 0x03050002, observesDst: true }, // GMT+03 Moscow
  { label: 307, bias: -180, daylightBias: 0, standardName: "EAST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+03 Nairobi
  { label: 550, bias: -210, daylightBias: -60, standardName: "IST", daylightName: "IDT", standardRule: 0x09040202, daylightRule: 0x03010002, observesDst: true }, // GMT+03:30 Tehran
  { label: 3, bias: -240, daylightBias: 0, standardName: "AST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+04 Abu Dhabi
  { label: 44, bias: -240, daylightBias: -60, standardName: "CST", daylightName: "CDT", standardRule: 0x0a050003, daylightRule: 0x03050002, observesDst: true }, // GMT+04 Baku
  { label: 267, bias: -270, daylightBias: 0, standardName: "AST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+04:30 Kabul
  { label: 140, bias: -300, daylightBias: -60, standardName: "EST", daylightName: "EDT", standardRule: 0x0a050003, daylightRule: 0x03050002, observesDst: true }, // GMT+05 Ekaterinburg
  { label: 246, bias: -300, daylightBias: 0, standardName: "WAST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+05 Islamabad
  { label: 319, bias: -330, daylightBias: 0, standardName: "IST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+05:30 New Delhi
  { label: 268, bias: -345, daylightBias: 0, standardName: "NST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+05:45 Kathmandu
  { label: 2, bias: -360, daylightBias: -60, standardName: "NCST", daylightName: "NCDT", standardRule: 0x0a050003, daylightRule: 0x03050002, observesDst: true }, // GMT+06 Almaty
  { label: 124, bias: -360, daylightBias: 0, standardName: "CAST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+06 Dhaka
  { label: 516, bias: -360, daylightBias: 0, standardName: "SRST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+06 Sri Lanka
  { label: 599, bias: -390, daylightBias: 0, standardName: "MST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+06:30 Yangon
  { label: 45, bias: -420, daylightBias: 0, standardName: "SAST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+07 Bangkok
  { label: 275, bias: -420, daylightBias: -60, standardName: "NAST", daylightName: "NADT", standardRule: 0x0a050003, daylightRule: 0x03050002, observesDst: true }, // GMT+07 Krasnoyarsk
  { label: 47, bias: -480, daylightBias: 0, standardName: "CST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+08 Beijing
  { label: 227, bias: -480, daylightBias: 0, standardName: "HKST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+08 Hong Kong SAR
  { label: 243, bias: -480, daylightBias: -60, standardName: "NEST", daylightName: "NEDT", standardRule: 0x0a050003, daylightRule: 0x03050002, observesDst: true }, // GMT+08 Irkutsk
  { label: 502, bias: -480, daylightBias: 0, standardName: "MPST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+08 Singapore
  { label: 485, bias: -480, daylightBias: 0, standardName: "AWST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+08 Perth
  { label: 549, bias: -480, daylightBias: 0, standardName: "TST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+08 Taipei
  { label: 552, bias: -540, daylightBias: 0, standardName: "TST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+09 Tokyo
  { label: 500, bias: -540, daylightBias: 0, standardName: "KST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+09 Seoul
  { label: 598, bias: -540, daylightBias: -60, standardName: "YST", daylightName: "YDT", standardRule: 0x0a050003, daylightRule: 0x03050002, observesDst: true }, // GMT+09 Yakutsk
  { label: 0, bias: -570, daylightBias: -60, standardName: "ACST", daylightName: "ACDT", standardRule: 0x03050002, daylightRule: 0x0a050002, observesDst: true }, // GMT+09:30 Adelaide
  { label: 114, bias: -570, daylightBias: 0, standardName: "ACST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+09:30 Darwin
  { label: 53, bias: -600, daylightBias: 0, standardName: "AEST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+10 Brisbane
  { label: 525, bias: -600, daylightBias: -60, standardName: "AEST", daylightName: "AEDT", standardRule: 0x03050002, daylightRule: 0x0a050002, observesDst: true }, // GMT+10 Sydney
  { label: 212, bias: -600, daylightBias: 0, standardName: "WPST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+10 Guam
  { label: 226, bias: -600, daylightBias: -60, standardName: "TST", daylightName: "TDT", standardRule: 0x03050002, daylightRule: 0x0a010002, observesDst: true }, // GMT+10 Hobart
  { label: 597, bias: -600, daylightBias: -60, standardName: "VST", daylightName: "VDT", standardRule: 0x0a050003, daylightRule: 0x03050002, observesDst: true }, // GMT+10 Vladivostok
  { label: 504, bias: -660, daylightBias: 0, standardName: "CPST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+11 Solomon Islands
  { label: 9, bias: -720, daylightBias: -60, standardName: "NZST", daylightName: "NZDT", standardRule: 0x03030002, daylightRule: 0x0a010002, observesDst: true }, // GMT+12 Auckland
  { label: 158, bias: -720, daylightBias: 0, standardName: "FST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+12 Fiji Islands
  { label: 350, bias: -780, daylightBias: 0, standardName: "TST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+13 Nuku'alofa
  { label: 269, bias: -840, daylightBias: 0, standardName: "KST", daylightName: null, standardRule: 0x00000000, daylightRule: 0x00000000, observesDst: false }, // GMT+14 Kiribati
];

/** Scenes whose XuiList is filled from one of the tables above. */
export const LOCALE_CODE_TABLE_LISTS: Readonly<Record<string, {
  list: string; classOverride: string; tableVa: string; rowCount: number;
}>> = {
  'consoles/dashSysCslSetLanguage.xur': {
    list: 'lstLanguages', classOverride: 'dashCLanguage',
    tableVa: '0x92016d8c + 0x92016dc0', rowCount: LANGUAGE_ROWS.length,
  },
  'consoles/dashSysCslSetCountry.xur': {
    list: 'lstCountries', classOverride: 'dashCCountry',
    tableVa: '0x92016eb8', rowCount: COUNTRY_ROWS.length,
  },
  'oobe/oobeCountry.xur': {
    list: 'lstCountries', classOverride: 'dashCCountry',
    tableVa: '0x92016eb8', rowCount: COUNTRY_ROWS.length,
  },
  'consoles/dashSysCslSetClockTimeZone.xur': {
    list: 'lstTimezone', classOverride: 'dashCTimezone',
    tableVa: '0x927bf680', rowCount: TIMEZONE_ROWS.length,
  },
};
