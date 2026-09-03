// Every list in the build whose rows are code, not scene data - in one shape.
//
// A XuiCommonList or XuiList that declares ItemsText fills itself; 29 do. The
// other 59 in the corpus declare none, because the console's PowerPC code put
// the rows in. Three of those groups are now decoded and live here, keyed by
// scene and by the list's Id so one scene with five spinners is unambiguous:
//
//   consoles/dashSysCslSet.xur         lstSettings   the 11-entry table at
//                                      0x920143d0 (consoleSettings.ts - it has
//                                      descriptions and destinations too, so it
//                                      keeps its own richer shape)
//   consoles/dashSysCslSetDisplay.xur  lstSettings   built by code from the
//                                      4x16-byte table at 0x927bfff0
//   consoles/dashSysCslSetLanguage     lstLanguages  0x92016d8c + 0x92016dc0
//   consoles/dashSysCslSetCountry      lstCountries  0x92016eb8, 37x8
//   oobe/oobeCountry                   lstCountries  the same table
//   consoles/dashSysCslSetClockTimeZone lstTimezone  0x927bf680, 75x32
//   consoles/dashSysCslSetPControlPasscodeHint lstHintQ  0x92015320, u16[5]
//   consoles/dashSysCslSetRemoteC      listChannels  no table: 0x921c8d08
//                                      computes 244 + (row != 0)
//
// Every row is a POSITION in consoles/dashCSettingsStrings.xus, never baked
// English, so a locale table works by index the way the console's did. The row
// ORDER is the table's order in every case; where the code sorts or filters
// (the language list's five region groups, the rating tables' region pick) the
// module that decoded it says which set applies offline, and that is the set
// named here.
//
// Lists that are code-driven and NOT filled: they are listed at the bottom with
// the reason. Nothing is guessed to make a page look finished.
import { COUNTRY_ROWS, LANGUAGE_ROWS, TIMEZONE_ROWS } from './localeSettings';
import { PASSCODE_HINT_ROWS, REMOTE_CHANNEL_ROWS } from './pcontrolSettings';
import { DISPLAY_ROWS_NTSC_HD } from './displaySettings';

/** consoles/dashCSettingsStrings.xus - every table below indexes it. */
export const SETTINGS_STRINGS_PACK = 'consoles';
export const SETTINGS_STRINGS_TABLE = 'dashCSettingsStrings.xus';

export interface CodeListRow {
  /** Position in the pack's positional string table. */
  label: number;
  /** Destination scene basename, or null when the row is not a navigation. */
  scene?: string | null;
  /** False for a row the console draws but will not let you pick. */
  enabled?: boolean;
}

export interface CodeList {
  /** The XuiList / XuiCommonList Id inside the scene. */
  list: string;
  pack: string;
  table: string;
  rows: readonly CodeListRow[];
  /** Where the table lives, for the header of the file that decoded it. */
  va: string;
}

export const CODE_LISTS: Readonly<Record<string, readonly CodeList[]>> = {
  'consoles/dashSysCslSetDisplay.xur': [{
    list: 'lstSettings', pack: SETTINGS_STRINGS_PACK, table: SETTINGS_STRINGS_TABLE,
    va: '0x927bfff0 (4 x 16: label, wide scene, present, enabled)',
    rows: DISPLAY_ROWS_NTSC_HD.map((r) => ({ label: r.label, scene: r.scene, enabled: r.enabled })),
  }],
  'consoles/dashSysCslSetLanguage.xur': [{
    list: 'lstLanguages', pack: SETTINGS_STRINGS_PACK, table: SETTINGS_STRINGS_TABLE,
    va: '0x92016d8c (labels by XC_LANGUAGE-1) + 0x92016dc0 (5 region orders)',
    rows: LANGUAGE_ROWS.map((r) => ({ label: r.label, scene: null })),
  }],
  'consoles/dashSysCslSetCountry.xur': [{
    list: 'lstCountries', pack: SETTINGS_STRINGS_PACK, table: SETTINGS_STRINGS_TABLE,
    va: '0x92016eb8 (37 x 8: label, u16 XC_LOCALE, u16 0)',
    rows: COUNTRY_ROWS.map((r) => ({ label: r.label, scene: null })),
  }],
  'oobe/oobeCountry.xur': [{
    list: 'lstCountries', pack: SETTINGS_STRINGS_PACK, table: SETTINGS_STRINGS_TABLE,
    va: '0x92016eb8 - the same table; oobeCountry declares the same dashCCountry class',
    rows: COUNTRY_ROWS.map((r) => ({ label: r.label, scene: null })),
  }],
  'consoles/dashSysCslSetClockTimeZone.xur': [{
    list: 'lstTimezone', pack: SETTINGS_STRINGS_PACK, table: SETTINGS_STRINGS_TABLE,
    va: '0x927bf680 (75 x 32: label, bias, std/dst bias, names, rules)',
    rows: TIMEZONE_ROWS.map((r) => ({ label: r.label, scene: null })),
  }],
  'consoles/dashSysCslSetPControlPasscodeHint.xur': [{
    list: 'lstHintQ', pack: SETTINGS_STRINGS_PACK, table: SETTINGS_STRINGS_TABLE,
    va: '0x92015320 (u16[5]), count u32 5 at 0x9201532c',
    rows: PASSCODE_HINT_ROWS.map((label) => ({ label, scene: null })),
  }],
  'consoles/dashSysCslSetRemoteC.xur': [{
    list: 'listChannels', pack: SETTINGS_STRINGS_PACK, table: SETTINGS_STRINGS_TABLE,
    va: 'no table: count 2 at 0x921c8d88, label 244 + (row != 0) at 0x921c8d08',
    rows: REMOTE_CHANNEL_ROWS.map((r) => ({ label: r.label, scene: null })),
  }],
};

/**
 * Code-driven lists we do NOT fill, and why. Reported by the shell so a page
 * that comes up empty says so instead of looking finished.
 */
export const CODE_LISTS_NOT_FILLED: Readonly<Record<string, string>> = {
  'consoles/dashSysCslSetDisplayHiDef.xur#listOptions':
    'the mode list is a hardware query: the code picks one of three static mode '
    + 'tables (0x920150fc / 0x92015128 / 0x92015158) by AV pack and then PREPENDS a '
    + '"Optimal Resolution" row built from the attached display\'s reported native '
    + 'mode, which is not in the image. No display is attached here.',
  'consoles/dashSysCslSetClockTime.xur#lstHour/lstMin/lstDay/lstMonth/lstYear':
    'numeric spinners the code sprintfs (%0*d at 0x921cc4c0): hours 1-12 or 0-23, '
    + 'minutes 0-59, months 1-12, days 1..DAYS[month] from 0x92017040, years '
    + '2005-2025 from the two date records at 0x927c00a0/0x927c00a8. The value they '
    + 'come up on is the console clock, which this build has no reading of.',
  'consoles/dashSysCslSetPControlFamilyTimer.xur#lstTime':
    'computed from the timer frequency bitmask at 0x921cb5e0 (744 hours, 96 '
    + 'quarter-hours or 168 hours per step) and formatted with "%d %ls"; with the '
    + 'timer off the code shows the single string 383, and the timer state is '
    + 'profile data this console does not have.',
  'consoles/dashSysCslSetPControlGame.xur#lstRating':
    'region-selected: the 29 rating tables at 0x920163a0 are picked through the '
    + 'locale table at 0x92016530 by the console\'s XC_LOCALE. The reference console '
    + 'reads "United Kingdom" [FRAME hi f0060]; the decoded tables are in '
    + 'pcontrolSettings.ts but the page has not been wired to the locale pick.',
};
