// Parental Control, Remote Control, Family Timer and Clock/Date option lists.
//
// Every scene named here carries ItemsText="" - the rows come from the
// executable. Image: extracted/6770/basefile.exe (a flat 0xE40000 dump; .rdata
// and .data are at raw = VA - 0x92000000, .text at raw = VA - 0x92000200).
// All label/description numbers below are positions in the POSITIONAL table
// consoles/dashCSettingsStrings.xus (kind 2, 601 entries), the same table the
// Console Settings rows use.
//
// -------------------------------------------------------------------------
// 1. consoles/dashSysCslSetRemoteC.xur, XuiList "listChannels" (dashRemoteCList)
//    NO table. The class answers the two XuiList messages itself:
//      item count  0x7dc -> 0x921c8d88: stores the literal 2. Always 2 rows.
//      item text   0x7df -> 0x921c8d08: msg[0] is the row index (same message
//                  layout DashSettingsList uses at 0x921bfcc8); the code does
//                  244 + (index != 0 ? 1 : 0) and calls the string fetch
//                  0x9214ede8. So row 0 = 244, row 1 = 245. Nothing else.
//    Class registered at 0x921c2a48 (name VA 0x920147d0, base "XuiList");
//    its message dispatcher is at 0x921bfc70.
//    The current value comes from a setting read (0x921c8da0/0x921c8e40 call
//    the import thunk 0x9273ad2c with setting id 22-in-a-byte); the nibble
//    value 0xF selects row 1, anything else row 0.
//    2 rows recovered.
//
// -------------------------------------------------------------------------
// 2. consoles/dashSysCslSetPControlPasscodeHint.xur, XuiList "lstHintQ"
//    (dashCHints, name VA 0x92013a6c, registered 0x921c25f0).
//    Table VA 0x92015320: a flat array of u16 string indices, 5 entries,
//    followed by a u16 0 pad; the COUNT (u32 5) sits at 0x9201532c.
//    Proof: 0x921bf014-0x921bf044 loads the count from 0x9201532c, bounds-
//    checks the row index, does `rlwinm r11, r11, 1` (index*2) and
//    `lhzx r4, r11, r10` off 0x92015320, then calls the string fetch.
//    5 rows recovered.
//
// -------------------------------------------------------------------------
// 3. dashSysCslSetPControlGame.xur / ...VideoMovie.xur / ...VideoTV.xur,
//    XuiList "lstRating" (dashCRatingView, name VA 0x92013a84, reg 0x921c22d8).
//    ONE shared scene function (0x921bd6f0, the only xref of the wide literal
//    "lstRating" at 0x92013f08) serves all three scenes. It switches on the
//    parental-control setting id it was opened for:
//        id 22 (0x16) -> category 0  (games)      0x921bd70c
//        id 24 (0x18) -> category 1  (movies)     0x921bd730
//        id 35 (0x23) -> category 2  (TV)         0x921bd754
//
//    MASTER TABLE at VA 0x920163a0, 29 records of 12 bytes; the count (u32 29)
//    is at 0x9201639c and is passed as `li r4, 29` at 0x921c7e7c:
//        +0  u32 key   = (category << 24) | (systemId << 8) | low
//                       (the key is assembled at 0x921c7e58-0x921c7e74 from
//                        category<<24, a 16-bit system id at bits 8..23, and a
//                        low byte that is 0 in every stored record)
//        +4  u32 rowCount
//        +8  u32 pointer to the row array
//    The linear search over it is 0x921c7ae0; 0x921c8018 is the same helper for
//    the locale table below.
//
//    ROW RECORD, 16 bytes (stride proved at 0x921c770c: `rlwinm r10, r9, 4`):
//        +0   u32 ratingValue   (255 = the "Allow All ..." row)
//        +4   s16 labelIndex    proved at 0x921c7764 `lha r4, 4(r11)` feeding
//                               the string fetch 0x9214ede8
//        +6   s16 descIndex     the metapane sentence. INFER: I did not find
//                               the instruction that reads +6; it is identified
//                               by content - in all 29 tables the value at +6
//                               resolves to the description of the label at +4
//                               (e.g. 149 "Mature" / 150 "Play games rated EC,
//                               E, E10+, T, or M...").
//        +8   u32 wide filename of the first rating icon, or 0
//        +12  u32 wide filename of the second icon, or 0
//             (both read at 0x921c7714-0x921c7718; the pair is counted so the
//              view can show one or two badges, e.g. PEGI + BBFC)
//    29 tables / 184 rows recovered, listed in RATING_TABLES in table order.
//
//    WHICH SYSTEM A CONSOLE GETS - locale table at VA 0x92016530, 39 records of
//    24 bytes, count 39 passed as `li r4, 39` at 0x921c8570:
//        +0  u32 countryId
//        +4  u32 game rating system   (default 63 when the country is missing)
//        +8  u32 movie rating system  (default 7)
//        +12 u32 TV rating system     (default 7)
//        +16 u32 unidentified         (default 7)
//        +20 u32 unidentified         (default 7)
//    The field is chosen by the same setting id as the category: 22 -> +4,
//    24 -> +8, 35 -> +12, 37 -> +16, 39 -> +20 (0x921c8578-0x921c85c8).
//    A system id with no master-table row (63 for games, 7 for movies/TV) is
//    the "not enforced in your locale" case - strings 407 and 426.
//    INFER on the last two fields: the parental-control scene set is Game /
//    VideoMovie / VideoTV / VideoExplicit / VideoUnrated, so 37 and 39 are
//    most likely Explicit and Unrated video; I did not prove it, and neither
//    field indexes RATING_TABLES, so nothing is claimed about their rows.
//    countryId is decoded through the dashCCountry picker table at VA
//    0x92016eb8 (37 records of 8 bytes: u32 name string index, u16 countryId,
//    u16 pad; count u32 37 at 0x92016eb4) - that is how "United States" is
//    known to be country 0x67. Country 0x0d (Brazil) appears TWICE in the
//    locale table with identical fields, and country 0x3e has a locale row but
//    no row in the country picker, so 37 names cover 39 locale rows.
//
// -------------------------------------------------------------------------
// 4. consoles/dashSysCslSetPControlFamilyTimer.xur, XuiList "lstTime"
//    (CFamilyTimerDurationList, name VA 0x9201490c, registered 0x921c3788).
//    NO table - the rows are COMPUTED. 0x921cb5e0 sets, from the frequency
//    bitmask in r4: this->count (offset 8) and this->stepMs (offset 12).
//        r4 & 1 -> count 744, step 3600000 ms
//        r4 & 2 -> count  96, step  900000 ms
//        r4 & 4 -> count 168, step 3600000 ms
//        r4 & 8 -> count 744, step 3600000 ms
//        none   -> count   1, step       0
//    The item-text handler 0x921cb4b0 (message 0x7df, dispatcher 0x921cb590):
//    when count == 1 it emits string 383 "Family Timer is off"; otherwise it
//    computes (rowIndex + 1) * stepMs and formats it with 0x92274198, which
//    uses "%d %ls" (VA 0x92027adc), 3600000 ms per hour and 60000 ms per
//    minute, and the four words fetched as strings 385 Hour / 386 Hours /
//    387 Minute / 388 Minutes.
//    NO ROWS ARE LISTED: the text is built at runtime and the frequency comes
//    from the scene's radbtnDisabled/radbtnDaily/radbtnWeekly group.
//
// -------------------------------------------------------------------------
// 5. consoles/dashSysCslSetClockTime.xur - the five dashCValueSpin lists.
//    dashCValueSpin (0x92014370, registered 0x921c1e80, base XuiList) is a
//    numeric spinner, not a table: its item text (0x921cc4c0-0x921cc568) is
//    sprintf'd from this->min (+8) and this->max (+12) as "%0*d" (VA
//    0x92016fec) when the zero-pad flag at +20 is set, else "%d" (0x9200a884);
//    the pad width at +24 is derived from the digit count of max inside the
//    range setter 0x921cc870. Ranges are set with 0x921cc870(this, min, max):
//      lstHour   1..12  (0x921cc9d4)  or 0..23 in 24-hour mode (0x921ccac0)
//      lstMin    0..59  (0x921cca10)
//      lstMonth  1..12  (0x921cce2c), clamped to the boundary month when the
//                chosen year is the first or last allowed year
//      lstDay    1..DAYS_IN_MONTH[month-1], from the u32 table at 0x92017040
//                (0x921cce5c: `lwz r5, -4(month*4 + 0x92017040)`)
//      lstYear   2005..2025 - min/max come from two {u16 day, u16 month,
//                u16 year} records in .data at 0x927c00a0 (1/1/2005) and
//                0x927c00a8 (31/12/2025), copied into the dashCDate object by
//                0x921cd088 (called once from 0x921ca148) and read back as
//                this+20 / this+26 at 0x921cd128-0x921cd130.
//    lstAMPM is NOT a code list: it is a plain XuiCommonList whose scene data
//    carries ItemsText "AM\nPM".
//    MONTH NAMES DO NOT EXIST in this scene. lstMonth is a dashCValueSpin and
//    renders the number. The only month-related strings are the field order
//    literals "dmy"/"ymd"/"my"/"mdy" at 0x920170a0-0x920170bc and the
//    separator formats 96/97/98/101 ("%d / %d / %0*d" and friends).
//    dashCTextSpin (0x92014354, registered 0x921c38b8, base XuiList) is
//    registered but no list in this scene overrides to it.
//
// -------------------------------------------------------------------------
// NOT RECOVERED
//  - The Family Timer duration rows (computed, see 4 above).
//  - The meaning of locale-table fields +16 and +20 (see 3 above).
//  - The instruction that reads the rating record's +6 description index.
//  - The country enum beyond the 37 ids named by the dashCCountry picker.
//  - Which scene passes which setting id (RATING_SCENE_SETTING_ID is INFER).

export const PCONTROL_STRING_TABLE = 'consoles/dashCSettingsStrings.xus';

/** consoles/dashSysCslSetRemoteC.xur -> listChannels. Count is hard-coded 2. */
export interface RemoteChannelRow {
  /** Position in dashCSettingsStrings.xus. */
  label: number;
}

export const REMOTE_CHANNEL_ROWS: readonly RemoteChannelRow[] = [
  { label: 244 }, // All Channels
  { label: 245 }, // Xbox 360 Media Remote
];

/** consoles/dashSysCslSetPControlPasscodeHint.xur -> lstHintQ. VA 0x92015320. */
export const PASSCODE_HINT_TABLE_VA = 0x92015320;

export const PASSCODE_HINT_ROWS: readonly number[] = [
  411, // Favorite fictional character?
  412, // Favorite person from history?
  413, // Favorite childhood book or story?
  414, // Favorite movie?
  415, // Favorite food?
];

/** Category byte of a RATING_TABLES key. */
export const RATING_CATEGORY_GAME = 0;
export const RATING_CATEGORY_MOVIE = 1;
export const RATING_CATEGORY_TV = 2;

/** Parental-control setting id -> rating category, from 0x921bd6f0. */
export const RATING_SETTING_ID_TO_CATEGORY: Readonly<Record<number, number>> = {
  22: RATING_CATEGORY_GAME,
  24: RATING_CATEGORY_MOVIE,
  35: RATING_CATEGORY_TV,
};

/**
 * Scene -> the setting id it opens with. INFER: the shared scene function
 * 0x921bd6f0 switches on 22/24/35 and the scene name set at 0x920144b0 has one
 * Game / VideoMovie / VideoTV class each, but I did not trace the call that
 * hands a given .xur its id.
 */
export const RATING_SCENE_SETTING_ID: Readonly<Record<string, number>> = {
  'dashSysCslSetPControlGame.xur': 22,
  'dashSysCslSetPControlVideoMovie.xur': 24,
  'dashSysCslSetPControlVideoTV.xur': 35,
};

/** A system id that has no RATING_TABLES row: ratings are not enforced. */
export const RATING_SYSTEM_NONE_GAME = 63;
export const RATING_SYSTEM_NONE_VIDEO = 7;

/** String shown instead of a list when the locale has no rating system. */
export const RATING_NOT_ENFORCED_GAME = 407;
export const RATING_NOT_ENFORCED_MOVIE = 426;

export interface RatingRow {
  /** The stored rating level. 255 is the "Allow All ..." row. */
  value: number;
  /** Position in dashCSettingsStrings.xus for the row label. */
  label: number;
  /** Position for the metapane description. */
  description: number;
  /** First rating badge, or null. */
  icon: string | null;
  /** Second rating badge (e.g. BBFC beside PEGI), or null. */
  icon2: string | null;
}

export interface RatingTable {
  /** 0 games, 1 movies, 2 TV. */
  category: number;
  /** Rating system id, bits 8..23 of the master key. */
  system: number;
  /** VA of the row array in the image. */
  va: number;
  rows: readonly RatingRow[];
}

/** Master table VA 0x920163a0, 29 records of 12 bytes, in stored order. */
export const RATING_MASTER_TABLE_VA = 0x920163a0;
export const RATING_MASTER_TABLE_COUNT = 29;

export const RATING_TABLES: readonly RatingTable[] = [
  {
    category: 0, system: 0, va: 0x92015810,
    rows: [
      { value: 255, label: 569, description: 570, icon: 'AllowAllGames.png', icon2: null }, // Allow All Games
      { value: 8, label: 149, description: 150, icon: 'ESRB_M.png', icon2: null }, // Mature
      { value: 6, label: 151, description: 152, icon: 'ESRB_T.png', icon2: null }, // Teen
      { value: 4, label: 144, description: 145, icon: 'ESRB_E10.png', icon2: null }, // Everyone 10+
      { value: 2, label: 143, description: 148, icon: 'ESRB_E.png', icon2: null }, // Everyone
      { value: 0, label: 146, description: 147, icon: 'ESRB_EC.png', icon2: null }, // Early Childhood
    ],
  },
  {
    category: 0, system: 1, va: 0x92015870,
    rows: [
      { value: 255, label: 569, description: 570, icon: 'AllowAllGames.png', icon2: null }, // Allow All Games
      { value: 14, label: 475, description: 476, icon: 'PEGI_18P.png', icon2: null }, // PEGI 18+
      { value: 13, label: 473, description: 474, icon: 'PEGI_16P.png', icon2: null }, // PEGI 16+
      { value: 9, label: 469, description: 470, icon: 'PEGI_12P.png', icon2: null }, // PEGI 12+
      { value: 4, label: 483, description: 484, icon: 'PEGI_7P.png', icon2: null }, // PEGI 7+
      { value: 0, label: 477, description: 478, icon: 'PEGI_3P.png', icon2: null }, // PEGI 3+
    ],
  },
  {
    category: 0, system: 2, va: 0x920158d8,
    rows: [
      { value: 255, label: 569, description: 570, icon: 'AllowAllGames.png', icon2: null }, // Allow All Games
      { value: 14, label: 475, description: 476, icon: 'PEGI_18P.png', icon2: null }, // PEGI 18+
      { value: 12, label: 473, description: 474, icon: 'PEGI_16P.png', icon2: null }, // PEGI 16+
      { value: 8, label: 469, description: 470, icon: 'PEGI_12P.png', icon2: null }, // PEGI 12+
      { value: 4, label: 483, description: 484, icon: 'PEGI_7P.png', icon2: null }, // PEGI 7+
      { value: 0, label: 477, description: 478, icon: 'PEGI_3P.png', icon2: null }, // PEGI 3+
    ],
  },
  {
    category: 0, system: 3, va: 0x92015938,
    rows: [
      { value: 255, label: 569, description: 570, icon: 'AllowAllGames.png', icon2: null }, // Allow All Games
      { value: 14, label: 475, description: 476, icon: 'PEGI_18P.png', icon2: null }, // PEGI 18+
      { value: 13, label: 473, description: 474, icon: 'PEGI_16P.png', icon2: null }, // PEGI 16+
      { value: 9, label: 469, description: 470, icon: 'PEGI_12P.png', icon2: null }, // PEGI 12+
      { value: 3, label: 481, description: 482, icon: 'PEGI_6P.png', icon2: null }, // PEGI 6+
      { value: 1, label: 479, description: 480, icon: 'PEGI_4P.png', icon2: null }, // PEGI 4+
    ],
  },
  {
    category: 0, system: 4, va: 0x920159a0,
    rows: [
      { value: 255, label: 569, description: 570, icon: 'AllowAllGames.png', icon2: null }, // Allow All Games
      { value: 14, label: 457, description: 458, icon: 'PEGI_18P.png', icon2: 'BBFC_18.png' }, // PEGI 18+ / BBFC 18
      { value: 13, label: 455, description: 456, icon: 'PEGI_16P.png', icon2: null }, // PEGI 16+
      { value: 12, label: 453, description: 454, icon: null, icon2: 'BBFC_15.png' }, // BBFC 15
      { value: 9, label: 451, description: 452, icon: 'PEGI_12P.png', icon2: 'BBFC_12.png' }, // PEGI 12+ / BBFC 12
      { value: 5, label: 465, description: 466, icon: null, icon2: 'BBFC_PG.png' }, // BBFC PG
      { value: 4, label: 463, description: 464, icon: 'PEGI_7P.png', icon2: null }, // PEGI 7+
      { value: 1, label: 461, description: 462, icon: null, icon2: 'BBFC_U.png' }, // BBFC U
      { value: 0, label: 459, description: 460, icon: 'PEGI_3P.png', icon2: null }, // PEGI 3+
    ],
  },
  {
    category: 0, system: 5, va: 0x92015a30,
    rows: [
      { value: 255, label: 569, description: 570, icon: 'AllowAllGames.png', icon2: null }, // Allow All Games
      { value: 8, label: 84, description: 85, icon: 'CERO_18Z.png', icon2: null }, // CERO Z
      { value: 6, label: 82, description: 83, icon: 'CERO_D17.png', icon2: 'CERO_18P.png' }, // CERO D / CERO 18
      { value: 4, label: 80, description: 81, icon: 'CERO_C15.png', icon2: 'CERO_15P.png' }, // CERO C / CERO 15
      { value: 2, label: 78, description: 79, icon: 'CERO_B.png', icon2: 'CERO_12P.png' }, // CERO B / CERO 12
      { value: 0, label: 76, description: 77, icon: 'CERO_A.png', icon2: 'CERO_C.png' }, // CERO A / CERO All
    ],
  },
  {
    category: 0, system: 6, va: 0x92015a98,
    rows: [
      { value: 255, label: 569, description: 570, icon: 'AllowAllGames.png', icon2: null }, // Allow All Games
      { value: 8, label: 584, description: 585, icon: 'USK_NY.png', icon2: null }, // USK No Youth
      { value: 6, label: 578, description: 579, icon: 'USK_16P.png', icon2: null }, // USK 16
      { value: 4, label: 576, description: 577, icon: 'USK_12P.png', icon2: null }, // USK 12
      { value: 2, label: 580, description: 581, icon: 'USK_6P.png', icon2: null }, // USK 6
      { value: 0, label: 582, description: 583, icon: 'USK_A.png', icon2: null }, // USK All
    ],
  },
  {
    category: 0, system: 9, va: 0x92015af8,
    rows: [
      { value: 255, label: 569, description: 570, icon: '', icon2: null }, // Allow All Games
      { value: 6, label: 272, description: 272, icon: '', icon2: null }, // GRB 18+
      { value: 4, label: 271, description: 271, icon: '', icon2: null }, // GRB 15+
      { value: 2, label: 270, description: 270, icon: '', icon2: null }, // GRB 12+
      { value: 0, label: 273, description: 273, icon: '', icon2: null }, // GRB All
    ],
  },
  {
    category: 0, system: 7, va: 0x92015b50,
    rows: [
      { value: 255, label: 569, description: 570, icon: 'AllowAllGames.png', icon2: null }, // Allow All Games
      { value: 6, label: 361, description: 362, icon: 'OFLC_AU_MA15P.png', icon2: null }, // Mature Restricted
      { value: 4, label: 359, description: 360, icon: 'OFLC_AU_M15P.png', icon2: null }, // Recommended for
      { value: 2, label: 357, description: 358, icon: 'OFLC_AU_G8P.png', icon2: null }, // Parental Guidance
      { value: 0, label: 355, description: 356, icon: 'OFLC_AU_A.png', icon2: null }, // General
    ],
  },
  {
    category: 0, system: 8, va: 0x92015ba0,
    rows: [
      { value: 255, label: 569, description: 570, icon: 'AllowAllGames.png', icon2: null }, // Allow All Games
      { value: 6, label: 369, description: 370, icon: 'OFLC_AU_MA15P.png', icon2: null }, // Mature Restricted
      { value: 4, label: 367, description: 368, icon: 'OFLC_AU_M15P.png', icon2: null }, // Recommended for
      { value: 2, label: 365, description: 366, icon: 'OFLC_AU_G8P.png', icon2: null }, // Parental Guidance
      { value: 0, label: 363, description: 364, icon: 'OFLC_AU_A.png', icon2: null }, // General
    ],
  },
  {
    category: 0, system: 11, va: 0x92015bf8,
    rows: [
      { value: 255, label: 569, description: 570, icon: null, icon2: null }, // Allow All Games
      { value: 14, label: 179, description: 180, icon: 'fpb-18_64x.png', icon2: null }, // 18
      { value: 13, label: 177, description: 178, icon: 'fpb-16_64x.png', icon2: null }, // 16
      { value: 10, label: 175, description: 176, icon: 'fpb-13_64x.png', icon2: null }, // 13
      { value: 7, label: 173, description: 174, icon: 'fpb-10_64x.png', icon2: null }, // 10
      { value: 6, label: 183, description: 184, icon: 'fpb-pg_64x.png', icon2: null }, // PG
      { value: 0, label: 181, description: 182, icon: 'fpb-a_64x.png', icon2: null }, // A
    ],
  },
  {
    category: 1, system: 0, va: 0x92015c68,
    rows: [
      { value: 255, label: 571, description: 572, icon: null, icon2: null }, // Allow All Movies
      { value: 6, label: 291, description: 292, icon: null, icon2: null }, // (R) Restricted
      { value: 4, label: 288, description: 289, icon: null, icon2: null }, // (PG-13) Parents Strongly Cautioned
      { value: 3, label: 287, description: 290, icon: null, icon2: null }, // (PG) Parental Guidance Suggested
      { value: 1, label: 285, description: 286, icon: null, icon2: null }, // (G) General Audiences
    ],
  },
  {
    category: 1, system: 1, va: 0x92015cc0,
    rows: [
      { value: 255, label: 571, description: 572, icon: null, icon2: null }, // Allow All Movies
      { value: 7, label: 262, description: 263, icon: null, icon2: null }, // 8
      { value: 6, label: 261, description: 263, icon: null, icon2: null }, // 7
      { value: 5, label: 260, description: 263, icon: null, icon2: null }, // 6
      { value: 4, label: 259, description: 263, icon: null, icon2: null }, // 5
      { value: 3, label: 258, description: 263, icon: null, icon2: null }, // 4
      { value: 2, label: 257, description: 263, icon: null, icon2: null }, // 3
      { value: 1, label: 256, description: 263, icon: null, icon2: null }, // 2
      { value: 0, label: 255, description: 263, icon: null, icon2: null }, // 1
    ],
  },
  {
    category: 1, system: 2, va: 0x92015d50,
    rows: [
      { value: 255, label: 571, description: 572, icon: null, icon2: null }, // Allow All Movies
      { value: 60, label: 563, description: 564, icon: null, icon2: null }, // R18
      { value: 50, label: 559, description: 560, icon: null, icon2: null }, // 18
      { value: 40, label: 557, description: 558, icon: null, icon2: null }, // 15
      { value: 30, label: 555, description: 556, icon: null, icon2: null }, // 12
      { value: 20, label: 561, description: 562, icon: null, icon2: null }, // PG
      { value: 10, label: 565, description: 568, icon: null, icon2: null }, // U
      { value: 0, label: 566, description: 567, icon: null, icon2: null }, // Uc
    ],
  },
  {
    category: 1, system: 3, va: 0x92015dd8,
    rows: [
      { value: 255, label: 571, description: 572, icon: null, icon2: null }, // Allow All Movies
      { value: 50, label: 237, description: 238, icon: null, icon2: null }, // 18
      { value: 40, label: 235, description: 236, icon: null, icon2: null }, // 16
      { value: 30, label: 233, description: 234, icon: null, icon2: null }, // 15A
      { value: 20, label: 231, description: 232, icon: null, icon2: null }, // 12A
      { value: 10, label: 241, description: 242, icon: null, icon2: null }, // PG
      { value: 0, label: 239, description: 240, icon: null, icon2: null }, // G
    ],
  },
  {
    category: 1, system: 4, va: 0x92015e48,
    rows: [
      { value: 255, label: 571, description: 572, icon: null, icon2: null }, // Allow All Movies
      { value: 30, label: 190, description: 191, icon: null, icon2: null }, // 18
      { value: 20, label: 188, description: 189, icon: null, icon2: null }, // 16
      { value: 10, label: 186, description: 187, icon: null, icon2: null }, // 12
      { value: 0, label: 192, description: 193, icon: null, icon2: null }, // U
    ],
  },
  {
    category: 1, system: 5, va: 0x92015ea0,
    rows: [
      { value: 255, label: 571, description: 572, icon: null, icon2: null }, // Allow All Movies
      { value: 40, label: 206, description: 207, icon: null, icon2: null }, // FSK 18
      { value: 30, label: 204, description: 205, icon: null, icon2: null }, // FSK 16
      { value: 20, label: 202, description: 203, icon: null, icon2: null }, // FSK 12
      { value: 10, label: 208, description: 209, icon: null, icon2: null }, // FSK 6
      { value: 0, label: 200, description: 201, icon: null, icon2: null }, // FSK 0
    ],
  },
  {
    category: 1, system: 6, va: 0x92015f00,
    rows: [
      { value: 255, label: 571, description: 572, icon: null, icon2: null }, // Allow All Movies
      { value: 50, label: 10, description: 11, icon: null, icon2: null }, // E
      { value: 40, label: 20, description: 21, icon: null, icon2: null }, // R18+
      { value: 30, label: 15, description: 16, icon: null, icon2: null }, // MA15+
      { value: 20, label: 14, description: 17, icon: null, icon2: null }, // M
      { value: 10, label: 18, description: 19, icon: null, icon2: null }, // PG
      { value: 0, label: 12, description: 13, icon: null, icon2: null }, // G
    ],
  },
  {
    category: 1, system: 8, va: 0x92015f78,
    rows: [
      { value: 255, label: 571, description: 572, icon: null, icon2: null }, // Allow All Movies
      { value: 40, label: 310, description: 311, icon: null, icon2: null }, // 16
      { value: 30, label: 308, description: 309, icon: null, icon2: null }, // 12
      { value: 20, label: 314, description: 315, icon: null, icon2: null }, // 9
      { value: 10, label: 312, description: 313, icon: null, icon2: null }, // 6
      { value: 0, label: 316, description: 317, icon: null, icon2: null }, // AL
    ],
  },
  {
    category: 1, system: 9, va: 0x92015fd8,
    rows: [
      { value: 255, label: 571, description: 572, icon: null, icon2: null }, // Allow All Movies
      { value: 60, label: 32, description: 33, icon: null, icon2: null }, // 18
      { value: 50, label: 30, description: 31, icon: null, icon2: null }, // 16
      { value: 40, label: 28, description: 29, icon: null, icon2: null }, // 14
      { value: 30, label: 26, description: 27, icon: null, icon2: null }, // 12
      { value: 20, label: 24, description: 25, icon: null, icon2: null }, // 10
      { value: 10, label: 34, description: 35, icon: null, icon2: null }, // 6
      { value: 0, label: 22, description: 23, icon: null, icon2: null }, // 0
    ],
  },
  {
    category: 1, system: 10, va: 0x92016060,
    rows: [
      { value: 255, label: 571, description: 572, icon: null, icon2: null }, // Allow All Movies
      { value: 70, label: 326, description: 335, icon: null, icon2: null }, // R
      { value: 60, label: 333, description: 334, icon: null, icon2: null }, // R18
      { value: 50, label: 322, description: 323, icon: null, icon2: null }, // M
      { value: 40, label: 331, description: 332, icon: null, icon2: null }, // R16
      { value: 30, label: 329, description: 330, icon: null, icon2: null }, // R15
      { value: 20, label: 327, description: 328, icon: null, icon2: null }, // R13
      { value: 10, label: 324, description: 325, icon: null, icon2: null }, // PG
      { value: 0, label: 320, description: 321, icon: null, icon2: null }, // G
    ],
  },
  {
    category: 1, system: 11, va: 0x920160f0,
    rows: [
      { value: 255, label: 571, description: 572, icon: null, icon2: null }, // Allow All Movies
      { value: 30, label: 519, description: 520, icon: null, icon2: null }, // 15
      { value: 20, label: 517, description: 518, icon: null, icon2: null }, // 11
      { value: 10, label: 521, description: 522, icon: null, icon2: null }, // 7
      { value: 0, label: 523, description: 524, icon: null, icon2: null }, // Btl
    ],
  },
  {
    category: 1, system: 12, va: 0x92016148,
    rows: [
      { value: 255, label: 571, description: 572, icon: null, icon2: null }, // Allow All Movies
      { value: 40, label: 342, description: 343, icon: null, icon2: null }, // 18
      { value: 30, label: 340, description: 341, icon: null, icon2: null }, // 15
      { value: 20, label: 338, description: 339, icon: null, icon2: null }, // 11
      { value: 10, label: 344, description: 345, icon: null, icon2: null }, // 7
      { value: 0, label: 346, description: 347, icon: null, icon2: null }, // A
    ],
  },
  {
    category: 1, system: 13, va: 0x920161a8,
    rows: [
      { value: 255, label: 571, description: 572, icon: null, icon2: null }, // Allow All Movies
      { value: 30, label: 118, description: 119, icon: null, icon2: null }, // 15
      { value: 20, label: 116, description: 117, icon: null, icon2: null }, // 11
      { value: 10, label: 120, description: 121, icon: null, icon2: null }, // 7
      { value: 0, label: 122, description: 123, icon: null, icon2: null }, // A
    ],
  },
  {
    category: 1, system: 14, va: 0x92016200,
    rows: [
      { value: 255, label: 571, description: 572, icon: null, icon2: null }, // Allow All Movies
      { value: 60, label: 165, description: 166, icon: null, icon2: null }, // K-18
      { value: 50, label: 163, description: 164, icon: null, icon2: null }, // K-15
      { value: 40, label: 161, description: 162, icon: null, icon2: null }, // K-13
      { value: 30, label: 159, description: 160, icon: null, icon2: null }, // K-11
      { value: 20, label: 169, description: 170, icon: null, icon2: null }, // K-7
      { value: 10, label: 167, description: 168, icon: null, icon2: null }, // K-3
      { value: 0, label: 171, description: 172, icon: null, icon2: null }, // S
    ],
  },
  {
    category: 1, system: 17, va: 0x92016280,
    rows: [
      { value: 255, label: 571, description: 572, icon: null, icon2: null }, // Allow All Movies
      { value: 50, label: 62, description: 63, icon: null, icon2: null }, // Exempt (E)
      { value: 40, label: 68, description: 69, icon: null, icon2: null }, // Restricted (R)
      { value: 30, label: 60, description: 61, icon: null, icon2: null }, // 18A
      { value: 20, label: 58, description: 59, icon: null, icon2: null }, // 14A
      { value: 10, label: 66, description: 67, icon: null, icon2: null }, // Parental Guidance (PG)
      { value: 0, label: 64, description: 65, icon: null, icon2: null }, // General (G)
    ],
  },
  {
    category: 1, system: 18, va: 0x920162f8,
    rows: [
      { value: 255, label: 571, description: 572, icon: null, icon2: null }, // Allow All Movies
      { value: 40, label: 510, description: 511, icon: null, icon2: null }, // 18
      { value: 30, label: 508, description: 509, icon: null, icon2: null }, // 16
      { value: 20, label: 506, description: 507, icon: null, icon2: null }, // 13
      { value: 10, label: 512, description: 513, icon: null, icon2: null }, // 7
      { value: 0, label: 514, description: 515, icon: null, icon2: null }, // All
    ],
  },
  {
    category: 1, system: 19, va: 0x92016358,
    rows: [
      { value: 255, label: 571, description: 572, icon: null, icon2: null }, // Allow All Movies
      { value: 20, label: 252, description: 253, icon: null, icon2: null }, // VM18
      { value: 10, label: 250, description: 251, icon: null, icon2: null }, // VM14
      { value: 0, label: 248, description: 249, icon: null, icon2: null }, // T
    ],
  },
  {
    category: 2, system: 0, va: 0x920157b8,
    rows: [
      { value: 255, label: 573, description: 574, icon: null, icon2: null }, // Allow All Rated TV Shows
      { value: 12, label: 590, description: 591, icon: null, icon2: null }, // (TV-MA) Mature Audience Only
      { value: 10, label: 586, description: 587, icon: null, icon2: null }, // (TV-14) Parents Strongly Cautioned
      { value: 8, label: 592, description: 593, icon: null, icon2: null }, // (TV-PG) Parental Guidance Suggested
      { value: 6, label: 588, description: 589, icon: null, icon2: null }, // (TV-G) General Audiences
    ],
  },
];

export interface RatingLocale {
  /** Console country id (the dashCCountry picker's id). */
  country: number;
  /** Position in dashCSettingsStrings.xus for the country name, or null. */
  countryLabel: number | null;
  /** Game rating system id; 63 = not enforced. */
  game: number;
  /** Movie rating system id; 7 = not enforced. */
  movie: number;
  /** TV rating system id; 7 = not enforced. */
  tv: number;
  /** Unidentified, setting id 37. */
  field16: number;
  /** Unidentified, setting id 39. */
  field20: number;
}

/** Locale table VA 0x92016530, 39 records of 24 bytes, in stored order. */
export const RATING_LOCALE_TABLE_VA = 0x92016530;
export const RATING_LOCALE_TABLE_COUNT = 39;

/** consoles/dashSysCslSetPControlFamilyTimer.xur -> lstTime. Computed, not a table. */
export interface FamilyTimerMode {
  /** Bit tested against the frequency mask at 0x921cb5e0. */
  frequencyBit: number;
  /** Number of rows the list reports for message 0x7dc. */
  count: number;
  /** Milliseconds added per row; row N shows (N + 1) * stepMs. */
  stepMs: number;
}

export const FAMILY_TIMER_MODES: readonly FamilyTimerMode[] = [
  { frequencyBit: 1, count: 744, stepMs: 3600000 },
  { frequencyBit: 2, count: 96, stepMs: 900000 },
  { frequencyBit: 4, count: 168, stepMs: 3600000 },
  { frequencyBit: 8, count: 744, stepMs: 3600000 },
];

/** No frequency bit set: one row, string 383 "Family Timer is off". */
export const FAMILY_TIMER_OFF_LABEL = 383;

/** The four words the duration text is assembled from, "%d %ls" twice. */
export const FAMILY_TIMER_UNIT_LABELS = {
  hour: 385,
  hours: 386,
  minute: 387,
  minutes: 388,
} as const;

/** The rows are built at runtime; nothing static to list. */
export const FAMILY_TIMER_ROWS: readonly never[] = [];

/** consoles/dashSysCslSetClockTime.xur numeric spinners. */
export interface SpinRange {
  /** Inclusive low end of the value range. */
  min: number;
  /** Inclusive high end. */
  max: number;
  /** Where the range comes from. */
  note: string;
}

export const CLOCK_SPIN_RANGES: Readonly<Record<string, SpinRange>> = {
  lstHour12: { min: 1, max: 12, note: '12-hour mode, set at 0x921cc9d4' },
  lstHour24: { min: 0, max: 23, note: '24-hour mode, set at 0x921ccac0' },
  lstMin: { min: 0, max: 59, note: 'set at 0x921cca10' },
  lstMonth: { min: 1, max: 12, note: 'clamped to the boundary month at the first or last year' },
  lstYear: { min: 2005, max: 2025, note: '.data 0x927c00a0 {1,1,2005} .. 0x927c00a8 {31,12,2025}' },
};

/** Days table at VA 0x92017040, indexed month-1. February is always 29. */
export const DAYS_IN_MONTH_TABLE_VA = 0x92017040;
export const DAYS_IN_MONTH: readonly number[] = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** lstAMPM carries its rows in the scene, not in code. */
export const CLOCK_AMPM_ITEMS_TEXT: readonly string[] = ['AM', 'PM'];

/** dashCValueSpin printf formats: zero-padded and plain. */
export const VALUE_SPIN_FORMAT_PADDED = '%0*d';
export const VALUE_SPIN_FORMAT_PLAIN = '%d';

/** No month names exist in this build; lstMonth renders a number. */
export const CLOCK_MONTH_NAMES: readonly never[] = [];

/** Date field order literals at VA 0x920170a0. */
export const DATE_FIELD_ORDERS: readonly string[] = ['dmy', 'ymd', 'my', 'mdy'];

export const RATING_LOCALES: readonly RatingLocale[] = [
  { country: 6, countryLabel: 8, game: 7, movie: 6, tv: 7, field16: 7, field20: 0 }, // Australia
  { country: 5, countryLabel: 5, game: 1, movie: 9, tv: 7, field16: 7, field20: 0 }, // Austria
  { country: 8, countryLabel: 46, game: 1, movie: 7, tv: 7, field16: 7, field20: 7 }, // Belgium
  { country: 13, countryLabel: 51, game: 63, movie: 7, tv: 7, field16: 7, field20: 7 }, // Brazil
  { country: 16, countryLabel: 56, game: 0, movie: 17, tv: 7, field16: 7, field20: 0 }, // Canada
  { country: 21, countryLabel: 91, game: 0, movie: 7, tv: 7, field16: 7, field20: 7 }, // Colombia
  { country: 25, countryLabel: 125, game: 1, movie: 13, tv: 7, field16: 7, field20: 0 }, // Denmark
  { country: 32, countryLabel: 157, game: 2, movie: 14, tv: 7, field16: 7, field20: 0 }, // Finland
  { country: 34, countryLabel: 185, game: 1, movie: 4, tv: 7, field16: 7, field20: 0 }, // France
  { country: 39, countryLabel: 225, game: 63, movie: 7, tv: 7, field16: 7, field20: 7 }, // Hong Kong SAR
  { country: 24, countryLabel: 115, game: 6, movie: 5, tv: 7, field16: 7, field20: 0 }, // Germany
  { country: 37, countryLabel: 210, game: 1, movie: 7, tv: 7, field16: 7, field20: 7 }, // Greece
  { country: 44, countryLabel: 229, game: 4, movie: 3, tv: 7, field16: 7, field20: 0 }, // Ireland
  { country: 50, countryLabel: 247, game: 1, movie: 19, tv: 7, field16: 7, field20: 0 }, // Italy
  { country: 53, countryLabel: 265, game: 5, movie: 1, tv: 7, field16: 7, field20: 0 }, // Japan
  { country: 56, countryLabel: 274, game: 63, movie: 7, tv: 7, field16: 7, field20: 7 }, // Korea
  { country: 62, countryLabel: null, game: 1, movie: 7, tv: 7, field16: 7, field20: 7 }, // (not offered in the country picker)
  { country: 71, countryLabel: 293, game: 0, movie: 7, tv: 7, field16: 7, field20: 7 }, // Mexico
  { country: 74, countryLabel: 336, game: 1, movie: 8, tv: 7, field16: 7, field20: 0 }, // Netherlands
  { country: 76, countryLabel: 351, game: 8, movie: 10, tv: 7, field16: 7, field20: 0 }, // New Zealand
  { country: 75, countryLabel: 337, game: 1, movie: 12, tv: 7, field16: 7, field20: 0 }, // Norway
  { country: 84, countryLabel: 492, game: 3, movie: 7, tv: 7, field16: 7, field20: 7 }, // Portugal
  { country: 91, countryLabel: 501, game: 63, movie: 7, tv: 7, field16: 7, field20: 7 }, // Singapore
  { country: 31, countryLabel: 142, game: 1, movie: 18, tv: 7, field16: 7, field20: 0 }, // Spain
  { country: 90, countryLabel: 499, game: 1, movie: 11, tv: 7, field16: 7, field20: 0 }, // Sweden
  { country: 18, countryLabel: 86, game: 1, movie: 7, tv: 7, field16: 7, field20: 7 }, // Switzerland
  { country: 101, countryLabel: 554, game: 63, movie: 7, tv: 7, field16: 7, field20: 7 }, // Taiwan
  { country: 35, countryLabel: 198, game: 4, movie: 2, tv: 7, field16: 7, field20: 0 }, // United Kingdom
  { country: 103, countryLabel: 575, game: 0, movie: 0, tv: 0, field16: 0, field20: 0 }, // United States
  { country: 19, countryLabel: 89, game: 63, movie: 7, tv: 7, field16: 7, field20: 7 }, // Chile
  { country: 13, countryLabel: 51, game: 63, movie: 7, tv: 7, field16: 7, field20: 7 }, // Brazil
  { country: 46, countryLabel: 230, game: 63, movie: 7, tv: 7, field16: 7, field20: 7 }, // India
  { country: 109, countryLabel: 600, game: 11, movie: 7, tv: 7, field16: 7, field20: 7 }, // South Africa
  { country: 82, countryLabel: 486, game: 1, movie: 7, tv: 7, field16: 7, field20: 7 }, // Poland
  { country: 42, countryLabel: 228, game: 1, movie: 7, tv: 7, field16: 7, field20: 7 }, // Hungary
  { country: 23, countryLabel: 92, game: 1, movie: 7, tv: 7, field16: 7, field20: 7 }, // Czech Republic
  { country: 93, countryLabel: 503, game: 1, movie: 7, tv: 7, field16: 7, field20: 7 }, // Slovakia
  { country: 20, countryLabel: 90, game: 63, movie: 7, tv: 7, field16: 7, field20: 7 }, // China
  { country: 88, countryLabel: 493, game: 63, movie: 7, tv: 7, field16: 7, field20: 7 }, // Russia
];
