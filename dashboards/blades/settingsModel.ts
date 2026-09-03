// The console state the settings pages read and write, and what each option
// page's handler does with it - recovered from extracted/6770/basefile.exe.
//
// Every VA here is FLAT (raw = VA - 0x92000000; see displaySettings.ts for the
// proof). Every string number is a position in the positional table
// consoles/dashCSettingsStrings.xus (601 entries) unless it says dashStrings.
//
// ---------------------------------------------------------------------------
// 1. HOW AN OPTION PAGE WORKS - the same shape on all twenty-one
// ---------------------------------------------------------------------------
// Each page is a XuiScene with a ClassOverride whose class is registered at
// XuiRegisterClass (0x92147948) with a two-slot vtable [dtor, dispatcher]; the
// dispatcher switches on pMsg->dwMessage at +4 (scratchpad classmap over every
// registration):
//   0x13          XM_INIT              -> the class's init (bind, read, focus, label)
//   0x0e / n1     XM_NOTIFY XN_PRESS   -> the class's press (write, navigate back)
//   0x0e / n2     XM_NOTIFY XN_FOCUS   -> a parent page's label refresh
//   0x0e / n4     a list's selection change (the spinners, the language preview)
//   0x1a          the code list's selection message (Console Settings, Display)
//   0x27          the timer (the Clock pages redraw the time every second)
// e.g. dashScreensaver's dispatcher at 0x921c0e00 sends 0x13 to 0x921c8d90 and
// 0x0e/1 to 0x921c8e88; dashAutoOff's (0x921c0d00) to 0x921cd328 / 0x921cd408.
//
// The init of every page does the same four things [CODE, fns1-6 in the M3e
// scratchpad, one function per page]:
//   1. bind its buttons (XuiElementGetChildById 0x9214dc88) into this+8..;
//   2. READ the setting (ExGetXConfigSetting 0x9273990c = xboxkrnl ordinal 16,
//      or the xam audio/parental accessors);
//   3. SetFocus (0x9214cbc0) on the button that carries the current value, or
//      XuiListSetCurSel (0x92251760) on the row that does;
//   4. write labCurrentSettings from a string index chosen by the value
//      (0x9214ebe8 fetches from the table cached at 0x92872fc8, which is
//      dashCSettingsStrings.xus; 0x92158f40 sets the text).
// When the read FAILS (r3 < 0) steps 3 and 4 are skipped: the page keeps the
// scene's DefaultFocus and the label stays as authored. That failed-read path
// is exactly what this shell takes for a value it cannot know.
//
// The press of every page compares the notify's hObjSource against its bound
// buttons (or its list), WRITES the setting (ExSetXConfigSetting 0x9273aa4c =
// xboxkrnl ordinal 24, or the xam read-modify-write import at 0x92739ccc for
// the user-flags word), and then calls 0x921b5428(scene, 0xfd), which is
// XuiSceneNavigateBack(hScene, GetParentScene(hScene), 0xfd) at 0x921536d8 -
// the page POPS on A. Nothing else happens on the page itself; the PARENT
// refreshes its "Current Setting" from the same read on the XN_FOCUS it gets
// when focus returns (dashShutdownSettings 0x921c9000, dashAudioSettings
// 0x921caf68, dashClockSettings_Menu 0x921c9cb8), and Console Settings
// through the table's provider (the third field of each 0x920143d0 record).
//
// FOOTAGE: the only capture of an option page is build 8498's Console
// Settings walk (reference/frames/nxe-8498-ucJoSC29UL8 f2170-f2181): the
// Background Downloads page ARRIVES on "Disable" - the row of its current
// "Background Downloads Disabled" - and returns to Startup and Shutdown with
// that value on the right; f2084-f2088 show Digital Output arriving on its
// current "Dolby Digital with WMA Pro" row. The arrival-on-current-row rule
// is [CODE] on every page and [FRAME] on those two.
//
// ---------------------------------------------------------------------------
// 2. THE SETTINGS, as the code stores them
// ---------------------------------------------------------------------------
// XCONFIG_CONSOLE (category 7):
//   setting 1, u16  screen saver: 0x1000 = disabled, 0x0a = enabled
//                   [0x921c8e88 writes 0x1000 for btnOff and 0x0a for btnOn;
//                    0x921c8d90 tests == 0x1000; labels 130 / 156]
//   setting 2, u16  auto-off: 0 = disabled, 0x168 (360 minutes) = enabled
//                   [0x921cd408 writes 0 / 0x168; 0x921cd328 tests > 0;
//                    labels 127 / 153]
//   setting 22      the remote-control nibble read through 0x9273ab2c: 0xf =
//                   Xbox 360 Media Remote only, anything else = All Channels
//                   [0x921c8c40 tests (byte & 0xf) == 0xf; 0x921c8d00 writes
//                    0xf for row 1 and 1 for row 0; labels 244 / 245]
// XCONFIG_USER (category 3):
//   setting 0x0a, u32 video flags: bit 0x10000 = widescreen
//                   [0x921c5e90 reads it through 0x921c8148 and indexes the
//                    8-byte table at 0x92015198 (196 Normal / 197 Widescreen);
//                    0x921c5f48 clears 0x10000 and 0x100000 then sets 0x10000
//                    for btnWide; the same bit picks scnCurrentFormat's scene]
//   setting 0x0c, u32 user flags, one bit per option (0x921c7ef8 reads a bit,
//                   0x921c7e90 writes one through the xam import at 0x92739ccc):
//                     0x00000002 daylight saving OFF        [0x921ca228/0x921ca2c8, labels 95 on / 94 off]
//                     0x00000008 24-hour clock              [0x921ca388/0x921c9a20]
//                     0x00000080 start up into the dashboard[0x921c9230/0x921c93c8, label 538]
//                     0x00000100 sound effects DISABLED     [0x921cb160/0x921cb1f8, labels 40 on / 39 off]
//                     0x00000800 start up into IPTV         [label 540, or the provider's name]
//                     0x00010000 background downloads       [0x921cddd8/0x921cdeb8, labels 128 / 154]
//                     0x00020000 start up into Media Center [label 541]
//                     none of the three start-up bits = start the disc [label 539]
//   setting 0x0e, u8  XC_LOCALE [0x921c81e8 writes it; 0x921c8310 reads it;
//                   the label is the country table's row, 0x921cbfa8]
// xam:
//   XGetLanguage (import 0x9273a11c) / 0x921c8198 writes: XC_LANGUAGE, label
//                   0x92016d8c[lang - 1] [0x921ca760, 0x921caa90]
//   audio flags (0x9273a0fc read, 0x9273aaec write): bit 0x10000 = Dolby
//                   Digital, 0x20000 = WMA Pro; 0x921cae10 indexes the u16
//                   table at 0x927c00b0 = [37, 36, 38] with (0x20000 ? 2 :
//                   0x10000 ? 1 : 0); 0x921cb0e8 writes 0 / 0x10000 / 0x30000
//   reference level (import ordinal 34 through 0x921cd518 / 0x921cd5a8):
//                   1 = Expanded (371; 372 "Extended" on an SD pack), 2 =
//                   Intermediate (373), 3 = Standard (374) [0x921cd880,
//                   0x921cd660, provider 0x921cd6f8; btnExpanded/Intermediate/
//                   Standard bound at 0x921cd800 in that order]
//   the time zone: the row of the 75-row table whose bias matches the
//                   console's (0x921c5128 selects it; 0x921ca070 writes the
//                   row's rule and clears/sets the DST-off bit from its
//                   observesDst field)
// Parental controls: the pages write a STAGING block at 0x92872c90 through
//   0x921bc3e8(id, &value) and read it through 0x921baeb0; the Family Settings
//   page commits it on Done after a "Save Changes" message box [0x921bcdd0].
//   The yes/no pages (ids 1 LiveA, 2 LiveC, 4 Content, 0x25 Explicit, 0x27
//   Unrated) store 0xff for btnNo and 0 for btnYes [0x921bd710]; their labels
//   come from the u16 pairs at 0x92013adc: [401,400] Blocked/Allowed for ids
//   1, 2, 0x25, 0x27 and [408,409] Show All Content/Hide Restricted Content
//   for id 4, indexed by (value == 0xff). The rating pages (ids 0x16 game,
//   0x18 movie, 0x23 TV) store the selected row's rating value [0x921bd458
//   through 0x921c7b38]; the pass-code hint page stores the row index as a
//   byte at block+0x50 [0x921be1b8].
//
// ---------------------------------------------------------------------------
// 3. THE REFERENCE CONSOLE'S STATE, read off the footage
// ---------------------------------------------------------------------------
// The 6717 capture walks every Console Settings row with its "Current Setting"
// on the right [FRAME reference/frames/6717/f0050-f0066]:
//   f0053 Display   "1080p / Widescreen / Standard"
//   f0055 Audio     "Dolby Digital / Sound Effects Enabled"
//   f0056 Themes    "Xbox 360 (Default)"          (string 126: the no-dash-user path of 0x921cabc0)
//   f0057 Language  "English"
//   f0059 Clock     "22/11/2005  12:00 / GMT+00 London"  (the RTC's factory default, dd/mm/yyyy, no AM/PM = 24-hour)
//   f0060 Locale    "United Kingdom"
//   f0061 Startup   "Xbox Dashboard"
//   f0062 Shutdown  "Auto-Off Disabled / Background Downloads Enabled"
//   f0063 Screen Saver "Screen Saver Enabled"
//   f0064 Remote Control "All Channels"
//   f0066 System Info "Dashboard: 2.0.6717.0"
// Build 6770's own capture agrees where it overlaps (reference/frames/6770-boot
// f0044-f0049: Display, Audio, Startup, System Info 2.0.6770.0).
// So every value a settings page reads is known for the reference console
// except the Family Settings block (no capture enters it) and the daylight
// saving bit (the clock line does not show it). Those start UNKNOWN, which is
// the failed-read path above, and are disclosed.
import { CONSOLE_SETTINGS_ROWS } from './consoleSettings';
import { COUNTRY_ROWS, LANGUAGE_LABEL_BY_ID, LANGUAGE_ROWS, TIMEZONE_ROWS } from './localeSettings';
import {
  RATING_LOCALES, RATING_TABLES, RATING_CATEGORY_GAME, RATING_CATEGORY_MOVIE, RATING_CATEGORY_TV,
  RATING_SYSTEM_NONE_GAME, RATING_SYSTEM_NONE_VIDEO, PASSCODE_HINT_ROWS, FAMILY_TIMER_OFF_LABEL,
  type RatingTable,
} from './pcontrolSettings';
import { SCREEN_FORMAT_CHOICES, CURRENT_SETTING_OBSERVED } from './displaySettings';

/** consoles/dashCSettingsStrings.xus. */
export const SETTINGS_STRINGS_PACK = 'consoles';
export const SETTINGS_STRINGS_TABLE = 'dashCSettingsStrings.xus';

/** The bits of XCONFIG_USER setting 0x0c, as the option pages test them. */
export const USER_FLAG = {
  DST_OFF: 0x2,
  CLOCK_24H: 0x8,
  STARTUP_DASHBOARD: 0x80,
  SOUND_EFFECTS_OFF: 0x100,
  STARTUP_IPTV: 0x800,
  BACKGROUND_DOWNLOADS: 0x10000,
  STARTUP_MEDIA_CENTER: 0x20000,
} as const;

export const VIDEO_FLAG_WIDESCREEN = 0x10000;
export const AUDIO_FLAG_DOLBY = 0x10000;
export const AUDIO_FLAG_WMA_PRO = 0x20000;

/** XCONFIG_CONSOLE setting 1 / 2 values. */
export const SCREENSAVER_OFF = 0x1000;
export const SCREENSAVER_ON = 0x0a;
export const AUTO_OFF_OFF = 0;
export const AUTO_OFF_ON = 0x168;

export type Startup = 'disc' | 'dashboard' | 'mediacenter' | 'iptv';

/**
 * A setting is a number or NULL. Null is "the read failed": the page keeps
 * its DefaultFocus and its authored label, the Console Settings line is left
 * out, and `hardwareState` says so. A setting the footage pins is a number
 * with a `Provenance` row in REFERENCE_STATE_SOURCES.
 */
export interface ConsoleState {
  screensaver: number | null;
  autoOff: number | null;
  startup: Startup | null;
  backgroundDownloads: boolean | null;
  soundEffectsOff: boolean | null;
  clock24h: boolean | null;
  dstOff: boolean | null;
  widescreen: boolean | null;
  /** 0 Digital Stereo, 1 Dolby Digital, 2 Dolby Digital with WMA Pro. */
  digitalOutput: number | null;
  /** 1 Expanded, 2 Intermediate, 3 Standard. */
  referenceLevel: number | null;
  language: number | null;
  locale: number | null;
  /** Row of TIMEZONE_ROWS. */
  timeZone: number | null;
  /** 0 All Channels, 1 Xbox 360 Media Remote. */
  remote: number | null;
  /** The staging block at 0x92872c90, by the ids the pages pass. */
  parental: {
    liveA: number | null; liveC: number | null; content: number | null;
    explicit: number | null; unrated: number | null;
    game: number | null; movie: number | null; tv: number | null;
    passcodeHint: number | null;
  };
}

export interface Provenance {
  setting: keyof ConsoleState | `parental.${keyof ConsoleState['parental']}`;
  value: string;
  frame: string;
}

/** What the reference console showed, with the still each value is read off. */
export const REFERENCE_STATE_SOURCES: readonly Provenance[] = [
  { setting: 'widescreen', value: 'Widescreen', frame: '6717/f0053 (6717-60fps/f01580)' },
  { setting: 'referenceLevel', value: 'Standard', frame: '6717/f0053' },
  { setting: 'digitalOutput', value: 'Dolby Digital', frame: '6717/f0055' },
  { setting: 'soundEffectsOff', value: 'Sound Effects Enabled', frame: '6717/f0055' },
  { setting: 'language', value: 'English', frame: '6717/f0057' },
  { setting: 'clock24h', value: '"12:00" with no AM/PM suffix (string 103 " AM" is what the 12-hour format appends)', frame: '6717/f0059' },
  { setting: 'timeZone', value: 'GMT+00 London', frame: '6717/f0059' },
  { setting: 'locale', value: 'United Kingdom', frame: '6717/f0060' },
  { setting: 'startup', value: 'Xbox Dashboard', frame: '6717/f0061' },
  { setting: 'autoOff', value: 'Auto-Off Disabled', frame: '6717/f0062' },
  { setting: 'backgroundDownloads', value: 'Background Downloads Enabled', frame: '6717/f0062' },
  { setting: 'screensaver', value: 'Screen Saver Enabled', frame: '6717/f0063' },
  { setting: 'remote', value: 'All Channels', frame: '6717/f0064' },
];

/** The rows of the three locale tables the reference console sits on. */
export const REFERENCE_LANGUAGE = 1;                   // English, LANGUAGE_LABEL_BY_ID[1] = 141
export const REFERENCE_LOCALE = 35;                    // United Kingdom, COUNTRY_ROWS label 198
export const REFERENCE_TIMEZONE = TIMEZONE_ROWS.findIndex((r) => r.label === 278); // "GMT+00 London"

export function referenceState(): ConsoleState {
  return {
    screensaver: SCREENSAVER_ON,
    autoOff: AUTO_OFF_OFF,
    startup: 'dashboard',
    backgroundDownloads: true,
    soundEffectsOff: false,
    clock24h: true,
    dstOff: null,
    widescreen: true,
    digitalOutput: 1,
    referenceLevel: 3,
    language: REFERENCE_LANGUAGE,
    locale: REFERENCE_LOCALE,
    timeZone: REFERENCE_TIMEZONE,
    remote: 0,
    parental: {
      liveA: null, liveC: null, content: null, explicit: null, unrated: null,
      game: null, movie: null, tv: null, passcodeHint: null,
    },
  };
}

/** What is unknown on a fresh state, with the reason - one line each. */
export function unknownSettings(s: ConsoleState): string[] {
  const out: string[] = [];
  if (s.dstOff === null) out.push('daylight saving: the clock line on f0059 does not show it');
  const p = s.parental;
  if (p.liveA === null || p.liveC === null || p.content === null || p.explicit === null || p.unrated === null
    || p.game === null || p.movie === null || p.tv === null || p.passcodeHint === null) {
    out.push('Family Settings: no capture enters them, and the block at 0x92872c90 is read from the console');
  }
  return out;
}

/* ------------------------------------------------------------------ labels */

/** A string to put on screen: a position in dashCSettingsStrings.xus, or a
 *  literal the code formats itself (the clock). */
export type Label = { idx: number } | { text: string };

export interface OptionRow {
  /** The button id, or `${list}_item${k}` for a list row. */
  control: string;
  /** What the handler writes for it. */
  value: number;
}

export interface OptionPage {
  scene: string;
  cls: string;
  va: { init: number; press: number };
  /** The list the rows live in, or null for a page of buttons. */
  list: string | null;
  rows: readonly OptionRow[];
  /** The row value the state is on, or null when the state is unknown. */
  current: (s: ConsoleState) => number | null;
  /** labCurrentSettings for the state, or null when unknown. */
  label: (s: ConsoleState) => Label | null;
  /** The label control's id ("labCurrentSettings" on most, "labCurrentSetting" on the newer pages). */
  labelId: string;
  write: (s: ConsoleState, value: number) => void;
  /** A press the console gates behind a xam message box: what it says. */
  dialog?: (s: ConsoleState, value: number) => Dialog | null;
  note: string;
}

/** A xam message box (XShowMessageBoxUI through the wrappers at 0x921a63f0 /
 *  0x92114898 / 0x92114a98). Its chrome is system software, not a dashboard
 *  scene; the strings are the build's. */
export interface Dialog {
  title: Label & { table?: 'dashStrings' };
  body: Label & { table?: 'dashStrings' };
  buttons: (Label & { table?: 'dashStrings' })[];
  /** Which button the code takes as "go ahead". */
  accept: number;
  va: number;
}

const startupOf = (s: ConsoleState): number | null =>
  s.startup === null ? null : (['disc', 'dashboard', 'mediacenter', 'iptv'] as Startup[]).indexOf(s.startup);

function yesNo(id: keyof ConsoleState['parental'], key: string, cls: string, va: { init: number; press: number }, labels: [number, number]): OptionPage {
  return {
    scene: `consoles/dashSysCslSetPControl${key}.xur`, cls, va, list: null,
    // btnNo is authored FIRST (y=153, DefaultFocus) on every one of these; the
    // handler stores 0xff for btnNo and 0 for btnYes [0x921bd710].
    rows: [{ control: 'btnNo', value: 0xff }, { control: 'btnYes', value: 0 }],
    current: (s) => s.parental[id],
    label: (s) => (s.parental[id] === null ? null : { idx: s.parental[id] === 0xff ? labels[1] : labels[0] }),
    labelId: 'labCurrentSetting',
    write: (s, v) => { s.parental[id] = v; },
    note: `init ${va.init.toString(16)} focuses btnYes/btnNo by (value == 0xff) and labels from the pair at 0x92013adc; press 0x921bd710 stages the value through 0x921bc3e8 and navigates back`,
  };
}

/** Every option page, keyed by scene id. */
export const OPTION_PAGES: Readonly<Record<string, OptionPage>> = {
  'consoles/dashSysCslSetScreensaver.xur': {
    scene: 'consoles/dashSysCslSetScreensaver.xur', cls: 'dashScreensaver',
    va: { init: 0x921c8d90, press: 0x921c8e88 }, list: null,
    rows: [{ control: 'btnOn', value: SCREENSAVER_ON }, { control: 'btnOff', value: SCREENSAVER_OFF }],
    current: (s) => (s.screensaver === null ? null : s.screensaver === SCREENSAVER_OFF ? SCREENSAVER_OFF : SCREENSAVER_ON),
    label: (s) => (s.screensaver === null ? null : { idx: s.screensaver === SCREENSAVER_OFF ? 130 : 156 }),
    labelId: 'labCurrentSettings',
    write: (s, v) => { s.screensaver = v; },
    note: 'XCONFIG_CONSOLE(7) setting 1: btnOff writes 0x1000, btnOn 0x0a; enabled = value != 0x1000',
  },
  'consoles/dashSysCslSetAutoOff.xur': {
    scene: 'consoles/dashSysCslSetAutoOff.xur', cls: 'dashAutoOff',
    va: { init: 0x921cd328, press: 0x921cd408 }, list: null,
    rows: [{ control: 'btnOn', value: AUTO_OFF_ON }, { control: 'btnOff', value: AUTO_OFF_OFF }],
    current: (s) => (s.autoOff === null ? null : s.autoOff > 0 ? AUTO_OFF_ON : AUTO_OFF_OFF),
    label: (s) => (s.autoOff === null ? null : { idx: s.autoOff > 0 ? 153 : 127 }),
    labelId: 'labCurrentSettings',
    write: (s, v) => { s.autoOff = v; },
    note: 'XCONFIG_CONSOLE(7) setting 2: btnOff writes 0, btnOn 0x168 (six hours); enabled = value > 0',
  },
  'consoles/dashSysCslSetBackgroundDownloads.xur': {
    scene: 'consoles/dashSysCslSetBackgroundDownloads.xur', cls: 'dashBackgroundDownloads',
    va: { init: 0x921cddd8, press: 0x921cdeb8 }, list: null,
    rows: [{ control: 'btnOn', value: 1 }, { control: 'btnOff', value: 0 }],
    current: (s) => (s.backgroundDownloads === null ? null : s.backgroundDownloads ? 1 : 0),
    label: (s) => (s.backgroundDownloads === null ? null : { idx: s.backgroundDownloads ? 154 : 128 }),
    labelId: 'labCurrentSettings',
    write: (s, v) => { s.backgroundDownloads = v === 1; },
    // Enabling asks first. 0x921cdeb8: btnOff clears bit 0x10000 outright;
    // btnOn, when the bit is clear, raises the message box at 0x921a63f0 with
    // title [42], body [41] and dashStrings [246] "Yes" / [50] "No", and sets
    // the bit only when that returns 0 (Yes). The box is xam's.
    dialog: (s, v) => (v === 1 && s.backgroundDownloads !== true
      ? { title: { idx: 42 }, body: { idx: 41 }, buttons: [{ idx: 246, table: 'dashStrings' }, { idx: 50, table: 'dashStrings' }], accept: 0, va: 0x921a63f0 }
      : null),
    note: 'user flags bit 0x10000; Enable is gated behind a xam message box (title 42, body 41, Yes/No)',
  },
  'consoles/dashSysCslSetStartUp.xur': {
    scene: 'consoles/dashSysCslSetStartUp.xur', cls: 'dashStartUp',
    va: { init: 0x921c9230, press: 0x921c93c8 }, list: null,
    rows: [
      { control: 'btnDefault', value: 0 },       // clears 0x80|0x800|0x20000: start the disc
      { control: 'btnDashboard', value: 1 },     // sets 0x80
      { control: 'btnMediaCenter', value: 2 },   // sets 0x20000
      { control: 'btnIPTV', value: 3 },          // sets 0x800 (hidden without an IPTV provider)
    ],
    current: startupOf,
    label: (s) => (s.startup === null ? null : { idx: [539, 538, 541, 540][startupOf(s)!]! }),
    labelId: 'labCurrentSettings',
    write: (s, v) => { s.startup = (['disc', 'dashboard', 'mediacenter', 'iptv'] as Startup[])[v]!; },
    note: 'user flags 0x80 / 0x20000 / 0x800 through the read-modify-write import (3, 0x0c, mask, bits); labels 539 Disc, 538 Xbox Dashboard, 541 Media Center, 540 Television (or the IPTV provider name)',
  },
  'consoles/dashSysCslSetRemoteC.xur': {
    scene: 'consoles/dashSysCslSetRemoteC.xur', cls: 'dashRemoteC',
    va: { init: 0x921c8c40, press: 0x921c8d00 }, list: 'listChannels',
    rows: [{ control: 'listChannels_item0', value: 0 }, { control: 'listChannels_item1', value: 1 }],
    current: (s) => s.remote,
    label: (s) => (s.remote === null ? null : { idx: 244 + s.remote }),
    labelId: 'labCurrentSettings',
    write: (s, v) => { s.remote = v; },
    note: 'setting 22 nibble through 0x9273ab2c: row 1 writes 0xf, row 0 writes 1; the label is 244 + (nibble == 0xf)',
  },
  'consoles/dashSysCslSetAudioDigital.xur': {
    scene: 'consoles/dashSysCslSetAudioDigital.xur', cls: 'dashAudioSettings_D',
    va: { init: 0x921cb058, press: 0x921cb0e8 }, list: 'listOptions',
    rows: [
      { control: 'listOptions_item0', value: 0 },   // Digital Stereo: clears 0x30000
      { control: 'listOptions_item1', value: 1 },   // Dolby Digital 5.1: 0x10000
      { control: 'listOptions_item2', value: 2 },   // Dolby Digital with WMA Pro: 0x30000
    ],
    current: (s) => s.digitalOutput,
    label: (s) => (s.digitalOutput === null ? null : { idx: [37, 36, 38][s.digitalOutput]! }),
    labelId: 'labCurrentSettings',
    write: (s, v) => { s.digitalOutput = v; },
    note: 'xam audio flags 0x10000 / 0x20000 (0x9273a0fc read, 0x9273aaec write); label = u16 table 0x927c00b0[idx] = [37, 36, 38]',
  },
  'consoles/dashSysCslSetAudioSoundEffects.xur': {
    scene: 'consoles/dashSysCslSetAudioSoundEffects.xur', cls: 'dashAudioSettings_FX',
    va: { init: 0x921cb160, press: 0x921cb1f8 }, list: 'listOptions',
    rows: [{ control: 'listOptions_item0', value: 0 }, { control: 'listOptions_item1', value: 1 }],
    current: (s) => (s.soundEffectsOff === null ? null : s.soundEffectsOff ? 1 : 0),
    label: (s) => (s.soundEffectsOff === null ? null : { idx: s.soundEffectsOff ? 39 : 40 }),
    labelId: 'labCurrentSettings',
    write: (s, v) => { s.soundEffectsOff = v === 1; },
    note: 'user flags bit 0x100 = sound effects DISABLED; the list row IS the bit; label 39 + (bit clear)',
  },
  'consoles/dashSysCslSetClockFormat.xur': {
    scene: 'consoles/dashSysCslSetClockFormat.xur', cls: 'dashClockSettings_1224',
    va: { init: 0x921ca138, press: 0x921ca1c0 }, list: 'listOptions',
    rows: [{ control: 'listOptions_item0', value: 0 }, { control: 'listOptions_item1', value: 1 }],
    current: (s) => (s.clock24h === null ? null : s.clock24h ? 1 : 0),
    // The label is the LIVE clock in the chosen format (0x921ca388 -> 0x921c97d0(0),
    // redrawn every second by the 0x27 timer) - a literal, formatted by the shell.
    label: (s) => (s.clock24h === null ? null : { text: formatTime(new Date(), s.clock24h) }),
    labelId: 'labCurrentSettings',
    write: (s, v) => { s.clock24h = v === 1; },
    note: 'user flags bit 8 = 24-hour clock (vtable slot 9 0x921ca388 reads it, slot 10 0x921c9a20 writes it); the label is the console clock formatted by XamFormatTimeString',
  },
  'consoles/dashSysCslSetClockDaylightSavings.xur': {
    scene: 'consoles/dashSysCslSetClockDaylightSavings.xur', cls: 'dashClockSettings_DSaving',
    va: { init: 0x921ca138, press: 0x921ca1c0 }, list: 'listOptions',
    rows: [{ control: 'listOptions_item0', value: 0 }, { control: 'listOptions_item1', value: 1 }],
    current: (s) => (s.dstOff === null ? null : s.dstOff ? 1 : 0),
    label: (s) => (s.dstOff === null ? null : { idx: s.dstOff ? 94 : 95 }),
    labelId: 'labCurrentSettings',
    write: (s, v) => { s.dstOff = v === 1; },
    note: 'user flags bit 2 = daylight saving OFF (slot 9 0x921ca228 reads it and labels 94/95; slot 10 0x921ca2c8 writes it and re-applies the clock)',
  },
  'consoles/dashSysCslSetClockTimeZone.xur': {
    scene: 'consoles/dashSysCslSetClockTimeZone.xur', cls: 'dashClockSettings_TZone',
    va: { init: 0x921c9fd0, press: 0x921ca070 }, list: 'lstTimezone',
    rows: TIMEZONE_ROWS.map((_, k) => ({ control: `lstTimezone_item${k}`, value: k })),
    current: (s) => s.timeZone,
    label: (s) => (s.timeZone === null ? null : { idx: TIMEZONE_ROWS[s.timeZone]!.label }),
    labelId: 'labCurrentSettings',
    write: (s, v) => { s.timeZone = v; s.dstOff = !TIMEZONE_ROWS[v]!.observesDst; },
    note: '0x921c5128 selects the row whose bias is the console\'s; the label is 0x921c97d0(3) = the row\'s own string; the press writes the zone and sets the DST-off bit when the zone has no daylight rule',
  },
  'consoles/dashSysCslSetLanguage.xur': {
    scene: 'consoles/dashSysCslSetLanguage.xur', cls: 'dashLanguageSettings',
    va: { init: 0x921ca988, press: 0x921cab20 }, list: 'lstLanguages',
    rows: LANGUAGE_ROWS.map((r, k) => ({ control: `lstLanguages_item${k}`, value: r.language })),
    current: (s) => s.language,
    label: (s) => (s.language === null ? null : { idx: LANGUAGE_LABEL_BY_ID[s.language] ?? 141 }),
    labelId: 'labCurrentSettings',
    write: (s, v) => { s.language = v; },
    note: '0x921ca760 selects the XGetLanguage row and labels from 0x92016d8c[lang - 1]; the press (0x921caa90) applies the language and writes it through 0x921c8198',
  },
  'consoles/dashSysCslSetCountry.xur': {
    scene: 'consoles/dashSysCslSetCountry.xur', cls: 'dashCountrySettings',
    va: { init: 0x921c9670, press: 0x921c9700 }, list: 'lstCountries',
    rows: COUNTRY_ROWS.map((r, k) => ({ control: `lstCountries_item${k}`, value: r.locale })),
    current: (s) => s.locale,
    label: (s) => (s.locale === null ? null : { idx: (COUNTRY_ROWS.find((r) => r.locale === s.locale) ?? COUNTRY_ROWS[0]!).label }),
    labelId: 'labCurrentSettings',
    write: (s, v) => { s.locale = v; },
    note: '0x921c9600 selects the XC_LOCALE row and labels through 0x921cbfa8 (row 0 when the id is not in the table); the press writes XCONFIG_USER 0x0e',
  },
  'consoles/dashSysCslSetDisplayFormat.xur': {
    scene: 'consoles/dashSysCslSetDisplayFormat.xur', cls: 'dashVideoSettings_Format',
    va: { init: 0x921c5e90, press: 0x921c5f48 }, list: null,
    rows: [{ control: 'btnNormal', value: 0 }, { control: 'btnWide', value: 1 }],
    current: (s) => (s.widescreen === null ? null : s.widescreen ? 1 : 0),
    label: (s) => (s.widescreen === null ? null : { idx: SCREEN_FORMAT_CHOICES[s.widescreen ? 1 : 0]!.label }),
    labelId: 'labCurrentSettings',
    write: (s, v) => { s.widescreen = v === 1; },
    note: 'video flags bit 0x10000 through 0x921c8148 / 0x921c80f0; the label is the 0x92015198 table\'s string (196 / 197) and the same row names the Display page\'s metapane scene',
  },
  'consoles/dashSysCslSetOutputLevels.xur': {
    scene: 'consoles/dashSysCslSetOutputLevels.xur', cls: 'dashOutputLevels',
    va: { init: 0x921cd880, press: 0x921cd660 }, list: null,
    rows: [{ control: 'btnStandard', value: 3 }, { control: 'btnIntermediate', value: 2 }, { control: 'btnExpanded', value: 1 }],
    current: (s) => s.referenceLevel,
    label: (s) => (s.referenceLevel === null ? null : { idx: s.referenceLevel === 1 ? 371 : s.referenceLevel === 2 ? 373 : 374 }),
    labelId: 'labCurrentSetting',
    write: (s, v) => { s.referenceLevel = v; },
    note: 'the level read through 0x921cd518: 1 focuses btnExpanded (371, or 372 on an SD pack), 2 btnIntermediate (373), anything else btnStandard (374); the press writes 1/2/3 through 0x921cd5a8',
  },
  'consoles/dashSysCslSetPControlLiveA.xur': yesNo('liveA', 'LiveA', 'dashPControlSettings_LiveA', { init: 0x921bdd00, press: 0x921bd710 }, [401, 400]),
  'consoles/dashSysCslSetPControlLiveC.xur': yesNo('liveC', 'LiveC', 'dashPControlSettings_LiveC', { init: 0x921bde70, press: 0x921bd710 }, [401, 400]),
  'consoles/dashSysCslSetPControlContent.xur': yesNo('content', 'Content', 'dashPControlSettings_Content', { init: 0x921bdfe8, press: 0x921bd710 }, [408, 409]),
  'consoles/dashSysCslSetPControlVideoExplicit.xur': yesNo('explicit', 'VideoExplicit', 'dashPControlSettings_VideoExplicit', { init: 0x921bdb80, press: 0x921bd710 }, [401, 400]),
  'consoles/dashSysCslSetPControlVideoUnrated.xur': yesNo('unrated', 'VideoUnrated', 'dashPControlSettings_VideoUnrated', { init: 0x921bd798, press: 0x921bd710 }, [401, 400]),
  'consoles/dashSysCslSetPControlPasscodeHint.xur': {
    scene: 'consoles/dashSysCslSetPControlPasscodeHint.xur', cls: 'dashPControlSettings_PasscodeHint',
    va: { init: 0x921be160, press: 0x921be1b8 }, list: 'lstHintQ',
    rows: PASSCODE_HINT_ROWS.map((_, k) => ({ control: `lstHintQ_item${k}`, value: k })),
    current: (s) => s.parental.passcodeHint,
    label: () => null,   // the page has no Current Setting label
    labelId: '',
    write: (s, v) => { s.parental.passcodeHint = v; },
    note: 'the row index is the value: init selects block+0x50, the press stores the selection there and navigates back',
  },
};

/**
 * The rating pages, id 0x16 / 0x18 / 0x23 [0x921bd4f0]: the list is the
 * category's table for the locale's system, the arrival row is the row whose
 * value is the staged one (0x921c7a98), and A stages the selected row's value
 * (0x921bd458 through 0x921c7b38) and navigates back. With no system for the
 * locale (63 games / 7 video) the init returns before touching the list.
 */
export const RATING_PAGES: Readonly<Record<string, { key: 'game' | 'movie' | 'tv'; category: number; list: string }>> = {
  'consoles/dashSysCslSetPControlGame.xur': { key: 'game', category: RATING_CATEGORY_GAME, list: 'lstRating' },
  'consoles/dashSysCslSetPControlVideoMovie.xur': { key: 'movie', category: RATING_CATEGORY_MOVIE, list: 'lstRating' },
  'consoles/dashSysCslSetPControlVideoTV.xur': { key: 'tv', category: RATING_CATEGORY_TV, list: 'lstRating' },
};

/** The rating table a locale gets for a category, or null when its system is "not enforced". */
export function ratingTableFor(locale: number | null, category: number): RatingTable | null {
  if (locale === null) return null;
  const row = RATING_LOCALES.find((r) => r.country === locale);
  if (!row) return null;
  const system = category === RATING_CATEGORY_GAME ? row.game : category === RATING_CATEGORY_MOVIE ? row.movie : row.tv;
  const none = category === RATING_CATEGORY_GAME ? RATING_SYSTEM_NONE_GAME : RATING_SYSTEM_NONE_VIDEO;
  if (system === none) return null;
  return RATING_TABLES.find((t) => t.category === category && t.system === system) ?? null;
}

/* --------------------------------------------------- the parent pages' labels */

/**
 * A page whose labCurrentSetting follows the FOCUSED row: the XN_FOCUS
 * handler compares hObjSource against its bound buttons and writes the
 * matching provider's string. Each entry maps a control to the label it shows
 * for a state; null means "unknown" (the console's failed read leaves the
 * authored text, which the shell clears).
 */
export const PARENT_LABELS: Readonly<Record<string, { labelId: string; va: number; by: Readonly<Record<string, (s: ConsoleState) => Label | null>> }>> = {
  // dashShutdownSettings, XN_FOCUS 0x921c9000: btnAutoOff -> 0x921cd480, btnBackgroundDownloads -> 0x921cdfc0
  'consoles/dashSysCslSetShutdown.xur': {
    labelId: 'labCurrentSetting', va: 0x921c9000,
    by: {
      btnAutoOff: (s) => OPTION_PAGES['consoles/dashSysCslSetAutoOff.xur']!.label(s),
      btnBackgroundDownloads: (s) => OPTION_PAGES['consoles/dashSysCslSetBackgroundDownloads.xur']!.label(s),
    },
  },
  // dashAudioSettings, XN_FOCUS 0x921caf68: btnDigital -> 0x921cae10, btnSoundEffects -> 0x921cae70
  'consoles/dashSysCslSetAudio.xur': {
    labelId: 'labCurrentSettings', va: 0x921caf68,
    by: {
      btnDigital: (s) => OPTION_PAGES['consoles/dashSysCslSetAudioDigital.xur']!.label(s),
      btnSoundEffects: (s) => OPTION_PAGES['consoles/dashSysCslSetAudioSoundEffects.xur']!.label(s),
    },
  },
  // dashClockSettings_Menu, XN_FOCUS 0x921c9cb8: btnOption1 -> 0x921c97d0(2) date and time,
  // btnOption2 -> the time, btnOption3 -> 0x921c97d0(3) the zone, btnOption4 -> bit 2 -> 94 / 95
  'consoles/dashSysCslSetClock.xur': {
    labelId: 'labCurrentSettings', va: 0x921c9cb8,
    by: {
      btnOption1: (s) => ({ text: formatDateTime(new Date(), s) }),
      btnOption2: (s) => (s.clock24h === null ? null : { text: formatTime(new Date(), s.clock24h) }),
      btnOption3: (s) => OPTION_PAGES['consoles/dashSysCslSetClockTimeZone.xur']!.label(s),
      btnOption4: (s) => OPTION_PAGES['consoles/dashSysCslSetClockDaylightSavings.xur']!.label(s),
    },
  },
  // dashPControlSettings_Video, 0x921bda18: btnMovie / btnTV -> the staged rating's row label
  // (0x921c7c30) or 427 "<None>" when the locale has no system; btnExplicit /
  // btnUnrated -> the 0x92013adc pair by (value == 0xff).
  'consoles/dashSysCslSetPControlVideo.xur': {
    labelId: 'labCurrentSetting', va: 0x921bda18,
    by: {
      btnMovie: (s) => ratingLabel(s, 'movie', RATING_CATEGORY_MOVIE),
      btnTV: (s) => ratingLabel(s, 'tv', RATING_CATEGORY_TV),
      btnExplicit: (s) => OPTION_PAGES['consoles/dashSysCslSetPControlVideoExplicit.xur']!.label(s),
      btnUnrated: (s) => OPTION_PAGES['consoles/dashSysCslSetPControlVideoUnrated.xur']!.label(s),
    },
  },
  // dashPControlSettingsMenu, 0x921bd0b0: one helper per row. The yes/no rows are
  // the pairs above; the game row is the staged rating's label (0x921bb420); the
  // Family Timer, Pass Code, Reset and Done rows read state no capture pins.
  'consoles/dashSysCslSetPControl.xur': {
    labelId: 'labCurrentSetting', va: 0x921bd0b0,
    by: {
      btnGame: (s) => ratingLabel(s, 'game', RATING_CATEGORY_GAME),
      btnLiveA: (s) => OPTION_PAGES['consoles/dashSysCslSetPControlLiveA.xur']!.label(s),
      btnLiveC: (s) => OPTION_PAGES['consoles/dashSysCslSetPControlLiveC.xur']!.label(s),
      btnContent: (s) => OPTION_PAGES['consoles/dashSysCslSetPControlContent.xur']!.label(s),
    },
  },
};

function ratingLabel(s: ConsoleState, key: 'game' | 'movie' | 'tv', category: number): Label | null {
  const table = ratingTableFor(s.locale, category);
  if (!table) return { idx: 427 };            // "<None>": the row's system flag is 0
  const v = s.parental[key];
  if (v === null) return null;
  const row = table.rows.find((r) => r.value === v);
  return row ? { idx: row.label } : null;
}

/* ------------------------------------------------- the Display page's pane */

/** dashVideoSettings::UpdateCurrentSetting (0x921c6f18 -> 0x921c6d88): the
 *  four providers joined with L"%s\n", and the aspect provider's metapane
 *  scene loaded into scnCurrentFormat (0x921c7040-0x921c7084). */
export function displayCurrentSetting(s: ConsoleState): { lines: Label[]; metaPane: string | null; unknown: string[] } {
  const lines: Label[] = [];
  const unknown: string[] = [];
  // [0] the current mode, formatted by 0x921cc080: hardware. The reference
  // console's is 1080p [FRAME 6717/f0053].
  lines.push({ idx: 217 });
  // [1] the aspect, from the video flags.
  let metaPane: string | null = null;
  if (s.widescreen === null) unknown.push('aspect');
  else { lines.push({ idx: SCREEN_FORMAT_CHOICES[s.widescreen ? 1 : 0]!.label }); metaPane = SCREEN_FORMAT_CHOICES[s.widescreen ? 1 : 0]!.metaPane; }
  // [2] PAL-50/60 is suppressed on an HD AV pack (0x921c6548), which is the state
  // the three-line frame shows.
  // [3] the reference level.
  const level = OPTION_PAGES['consoles/dashSysCslSetOutputLevels.xur']!.label(s);
  if (level) lines.push(level); else unknown.push('reference level');
  return { lines, metaPane, unknown };
}

/* ------------------------------------- Console Settings' "Current Setting" */

export interface RowCurrent {
  lines: Label[];
  /** What is left out, and why, one entry per missing line. */
  unknown: string[];
  /** Cited when the value is the reference console's rather than a selection. */
  source?: string;
}

/**
 * The 0x920143d0 table's third field, one provider per row, each writing
 * (text, flag) for the metapane's DataAssociation 4 [CODE]:
 *   0 0x921c6d88 Display   the four providers above
 *   1 0x921cafd0 Audio     0x921cae10 then 0x921cae70 (two lines)
 *   2 0x921cabc0 Themes    DASHUSER:\ThematicSkin / DashStyle; no dash user -> 126
 *   3 0x921ca638 Language  XGetLanguage -> 0x921cbc60
 *   4 0x921c9a90 Clock     0x921c97d0(2) date and time, then (3) the zone
 *   5 0x921c9570 Locale    XC_LOCALE -> 0x921cbfa8
 *   6 0x921c9478 Startup   the start-up bit
 *   7 0x921c9080 Shutdown  0x921cd480 then 0x921cdfc0
 *   8 0x921c8f00 Screen Saver
 *   9 0x921c8ba0 Remote Control
 *  10 0x921c8508 System Info  the "Dashboard: %hs" line (consoleSettings.ts)
 */
export function consoleSettingsCurrent(row: number, s: ConsoleState, signedIn: boolean): RowCurrent {
  const label = (page: string) => OPTION_PAGES[page]!.label(s);
  const one = (l: Label | null, what: string): RowCurrent => (l ? { lines: [l], unknown: [] } : { lines: [], unknown: [what] });
  switch (CONSOLE_SETTINGS_ROWS[row]?.label) {
    case 529: { const d = displayCurrentSetting(s); return { lines: d.lines, unknown: d.unknown }; }
    case 527: {
      const a = label('consoles/dashSysCslSetAudioDigital.xur');
      const b = label('consoles/dashSysCslSetAudioSoundEffects.xur');
      return { lines: [a, b].filter((l): l is Label => l !== null), unknown: [a ? '' : 'digital output', b ? '' : 'sound effects'].filter(Boolean) };
    }
    // 0x921cabc0: no dash user (0x92803a5c == 0xff) -> string 126 "Xbox 360
    // (Default)" [FRAME 6717/f0056]; a signed-in user's DashStyle 1 -> 93
    // "Carbon", 2 -> 213 "Glass", a ThematicSkin -> its own name.
    case 537: return signedIn ? { lines: [], unknown: ['the dash user\'s DashStyle'] } : { lines: [{ idx: 126 }], unknown: [] };
    case 530: return one(label('consoles/dashSysCslSetLanguage.xur'), 'language');
    case 528: {
      const tz = label('consoles/dashSysCslSetClockTimeZone.xur');
      return { lines: [{ text: formatDateTime(new Date(), s) }, ...(tz ? [tz] : [])], unknown: tz ? [] : ['time zone'], source: 'the console clock is the host clock (f0059 shows the reference RTC at its factory default, 22/11/2005 12:00)' };
    }
    case 531: return one(label('consoles/dashSysCslSetCountry.xur'), 'locale');
    case 535: return one(label('consoles/dashSysCslSetStartUp.xur'), 'startup');
    case 534: {
      const a = label('consoles/dashSysCslSetAutoOff.xur');
      const b = label('consoles/dashSysCslSetBackgroundDownloads.xur');
      return { lines: [a, b].filter((l): l is Label => l !== null), unknown: [a ? '' : 'auto-off', b ? '' : 'background downloads'].filter(Boolean) };
    }
    case 533: return one(label('consoles/dashSysCslSetScreensaver.xur'), 'screen saver');
    case 532: return one(label('consoles/dashSysCslSetRemoteC.xur'), 'remote control');
    default: return { lines: [], unknown: [] };
  }
}

/* ------------------------------------------------------------- the clock */

/**
 * 0x921c97d0: mode 0 is XamFormatTimeString, mode 1 XamFormatDateString,
 * mode 2 joins them with string 102 "%s  %s". The reference console's locale
 * writes the date day-first: "22/11/2005  12:00" [FRAME 6717/f0059], and the
 * 12-hour form appends string 103 " AM" / 104 " PM".
 */
export function formatTime(d: Date, h24: boolean): string {
  const h = d.getHours(), m = d.getMinutes();
  const mm = String(m).padStart(2, '0');
  if (h24) return `${String(h).padStart(2, '0')}:${mm}`;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm}${h < 12 ? ' AM' : ' PM'}`;
}
export function formatDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
export function formatDateTime(d: Date, s: ConsoleState): string {
  return `${formatDate(d)}  ${formatTime(d, s.clock24h ?? true)}`;
}

/* ------------------------------------------------------ the other pages */

/** The Family Timer page with the timer off (the no-profile state, and the
 *  frequency mask's fall-through at 0x921cb5e0): lstTime is ONE row, string
 *  383 "Family Timer is off" [0x921cb4b0]. */
export const FAMILY_TIMER_OFF_ROW = FAMILY_TIMER_OFF_LABEL;

/**
 * The confirmation the Initial Setup row raises (0x92114a98, through the xam
 * message box import at 0x9273984c): dashcomm/dashStrings.xus [176] "Initial
 * Setup", [179] "Do you want to run initial setup?", [177] "Yes, run setup",
 * [178] "No, don't run setup". Yes runs the OOBE from oobe/oobeWelcome.xur.
 */
export const INITIAL_SETUP_DIALOG: Dialog = {
  title: { idx: 176, table: 'dashStrings' },
  body: { idx: 179, table: 'dashStrings' },
  buttons: [{ idx: 177, table: 'dashStrings' }, { idx: 178, table: 'dashStrings' }],
  accept: 0,
  va: 0x92114a98,
};

/** Scenes whose press the shell routes through OPTION_PAGES, for the report. */
export const OPTION_PAGE_SCENES: readonly string[] = Object.keys(OPTION_PAGES);
