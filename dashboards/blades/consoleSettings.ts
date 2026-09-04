// The Console Settings rows.
//
// consoles/dashSysCslSet.xur carries NO ItemsText, no ItemsNavPath and no
// hand-placed rows - the list is an 11-entry table in the executable at
// VA 0x920143d0, 20 bytes an entry: (labelIndex, descIndex, handler,
// wide sceneFile, altHandler). The wide literal "dashCSettingsStrings.xus"
// sits four bytes past the table's end.
//
// The label and description indices are positions in the POSITIONAL table
// consoles/dashCSettingsStrings.xus (kind 2, 601 entries). The footage's row
// order is exactly this table's order, all 11 rows.
//
// This supersedes an earlier ten-row guess that took its order from the frame
// and read membership off the scene's own PanelSettings. That was wrong twice:
// the scene's 9-entry PanelSettings names no control that exists in the file
// (they are logical row ids), and Remote Control was missing entirely.
/** The scene the eleven-row table fills. */
export const CONSOLE_SETTINGS_SCENE = 'consoles/dashSysCslSet.xur';
export const CONSOLE_SETTINGS_PACK = 'consoles';
export const CONSOLE_SETTINGS_TABLE = 'dashCSettingsStrings.xus';

export interface SettingsRow {
  /** Position in dashCSettingsStrings.xus for the row label. */
  label: number;
  /** Position for the metapane description. */
  description: number;
  /** Destination scene in consoles/, or null for a code path. */
  scene: string | null;
}

export const CONSOLE_SETTINGS_ROWS: readonly SettingsRow[] = [
  { label: 529, description: 297, scene: 'dashSysCslSetDisplay.xur' },           // Display
  { label: 527, description: 294, scene: 'dashSysCslSetAudio.xur' },             // Audio
  // Themes has no destination scene: an alt handler opens the theme picker
  // Personalization.xur, which is not in this archive.
  { label: 537, description: 306, scene: null },                                 // Themes
  { label: 530, description: 298, scene: 'dashSysCslSetLanguage.xur' },          // Language
  { label: 528, description: 296, scene: 'dashSysCslSetClock.xur' },             // Clock
  { label: 531, description: 299, scene: 'dashSysCslSetCountry.xur' },           // Locale
  { label: 535, description: 303, scene: 'dashSysCslSetStartUp.xur' },           // Startup
  { label: 534, description: 302, scene: 'dashSysCslSetShutdown.xur' },          // Shutdown
  { label: 533, description: 301, scene: 'dashSysCslSetScreensaver.xur' },       // Screen Saver
  { label: 532, description: 300, scene: 'dashSysCslSetRemoteC.xur' },           // Remote Control
  { label: 536, description: 305, scene: 'dashSysCslSetPolicyInfo_System.xur' }, // System Info
];

/** The row the reference still f0060 has focused: Locale, index 5. */
export const CONSOLE_SETTINGS_FOCUS = 5;

/**
 * The metapane text comes from the TABLE's description index, not from the
 * scene's PanelStrings. They differ, and the screen shows the table's: for
 * Audio, PanelStrings reads "Change your audio output settings." while xus
 * [294] reads "...output AND SOUND EFFECT settings", and the footage shows
 * the latter.
 */
export const METAPANE_TEXT_COMES_FROM_TABLE = true;

/**
 * The "Current Setting" block above the description - the console's own state,
 * not scene data and not a string table. SINCE M3e the value of rows 0-9 is
 * derived from the console state in settingsModel.ts by the table's own
 * provider rules (the third field of each 0x920143d0 record), so a selection
 * on an option page changes it; this table's entries for rows 0 and 5 stand
 * as the frame citations the model's reference state was read from, and row
 * 10 (the version string) is still taken from here.
 *
 * The metapane's visual metaScene_1line carries TWO text presenters: Pane_txt
 * (DataAssociation 0), which draws the description above, and
 * Pane_txtCurrentSetting (DataAssociation 4), a 383x173 block at y=33 [SCENE].
 * That is what the leading CRLFs in every description string are for: xus [297]
 * (Display) starts with six, [299] (Locale) with three, [305] (System Info)
 * with three, and the value block sits in exactly that gap.
 *
 * The values are HARDWARE STATE - the console's video mode, its locale, its
 * dashboard version. This build cannot query any of them, so the only honest
 * source is the reference console itself, and only for the rows the footage
 * actually focuses. Every other row is left EMPTY rather than invented; that is
 * why this table has three entries and not eleven. PLACEHOLDERS.md records it.
 */
export const CURRENT_SETTING_ASSOC = 4;

export interface CurrentSetting {
  /** Index into CONSOLE_SETTINGS_ROWS. */
  row: number;
  /** Exactly what the reference console shows, newlines included. */
  value: string;
  /** The still it was read off. */
  frame: string;
}

export const CONSOLE_SETTINGS_CURRENT: readonly CurrentSetting[] = [
  // 1080p / Widescreen / Standard - resolution, aspect, reference level.
  { row: 0, value: '1080p\r\nWidescreen\r\nStandard', frame: '6717-60fps/f01580' },
  { row: 5, value: 'United Kingdom', frame: '6717/f0060' },
  // The System Info value is the RUNNING dashboard's version, not hardware
  // state: the pack string is the format "Dashboard: %hs" and this build is
  // 2.0.6770.0 (xex-headers.txt). The reference console printed 6717.
  { row: 10, value: 'Dashboard: 2.0.6770.0', frame: 'format from the pack strings; version from extracted/6770/xex-headers.txt (f0066 shows the reference console\'s own 6717)' },
];

/**
 * A caption the AUTHORING TOOL left behind, not a caption the console drew.
 *
 * 211 controls across the corpus ship a Text carrying an angle-bracket token -
 * "<setting>" on every Console Settings page's current setting line,
 * "<servicename>" on the IPTV rows, "<game title>", "<free space>",
 * "<MAC Addr>". Each is a slot the console filled from device or Live state
 * before the control was ever shown, so painting the token is strictly wrong:
 * the console never displayed one. They are cleared and counted, and the ones
 * we can fill from the footage are filled above.
 *
 * THE TOKEN CAN SIT INSIDE OTHER TEXT, and this rule used to be ANCHORED
 * (`/^\s*<...>\s*$/`), so it only cleared a Text that was nothing but a single
 * token. 192 of the 211 are; the other 19 carry a token among words, digits or
 * a second token - "<#> of <Total #>", "Uninstall <servicename>",
 * "<string> in progress. Please do not turn off your console.",
 * "<www.pegi.info: 3+ with mild>\r\n<Rating Information>\r\n<Rating
 * Information>" - and every one of those slipped through. Two of them are
 * reachable offline and both painted [Judge E round 5]. The console's writers
 * do not patch a token in place: each one calls SetText over the WHOLE control
 * (0x92158f40) or hides it, so a Text carrying a token anywhere is a slot in
 * its entirety. The rule is therefore a SEARCH, not a match.
 *
 * Nothing legitimate is caught by widening it: a sweep of every authored Text
 * in all 263 scenes finds 211 that contain "<" and all 211 are tokens (there
 * is no HTML body and no "<" in prose anywhere in the build). A value the
 * build's own string table spells with angle brackets ("<None>", string 427)
 * is written by the shell and skipped, because the clear leaves a node the
 * shell filled alone. `tests/blades.test.ts` gates both halves over the corpus.
 */
export const AUTHORING_TOKEN = /<[^<>\r\n]{1,40}>/;

/** The same token, for a match-all: never call `.test` on this one. */
export const AUTHORING_TOKEN_ALL = /<[^<>\r\n]{1,40}>/g;

/** True when a Text carries an authoring token ANYWHERE inside it. */
export function paintsAuthoringToken(text: string): boolean {
  return AUTHORING_TOKEN.test(text);
}

/**
 * The NINETEEN controls whose Text carries a token among other text, and what
 * the console's own code did with each. The other 192 are wholly one token and
 * the generic rule above covers them; these are the ones the anchored rule
 * missed, so each is named and sourced. Two are reachable offline today
 * (`memory/DeviceSelector#labTotal`, `arcade/2504_TitleOptionsScene`
 * `#lblRatingText`) and both are traced to the instruction; the other
 * seventeen sit behind pages this shell does not reach, and the clear runs on
 * every page and sub-scene it mounts, so they are covered the day they do.
 *
 * The shell appends the reason to `__dash.shell.hardwareState` when it clears
 * one, so the report says WHY the caption is blank, not just that it is.
 * `tests/blades.test.ts` gates that the keys are exactly the 19 the corpus has.
 */
export const TOKEN_SLOTS: Readonly<Record<string, string>> = {
  'memory/DeviceSelector.xur#labTotal':
    'the list\'s "n of N" line. The console HIDES it: DeviceSelectorScene binds '
    + 'labTotal into the controls block at +0x10 (0x9225af38) and the block reset '
    + '0x9225ace8 - which the scene load calls at 0x9225b1d4 - runs Show(labTotal, 0) '
    + 'at 0x9225ad08-0x9225ad10, next to Show(labDots, 0) and Show(txt_EmptyList, 0). '
    + 'Nothing in the class ever reads +0x10 again (no lwz/stw at that offset in the '
    + 'whole pack outside the bind and that hide), so it never comes back up. The two '
    + '"n of N" writers the memory pack does have are Categories (0x9225fe78, labTotal '
    + 'at this+20) and ItemsGrid/ItemsIcons (0x92263ea0, this+24), and both format '
    + 'memory/Strings.xus[67] "%1!d! of %2!d!" (swprintf 0x9273a38c, SetText 0x92158f40) '
    + 'ONLY when the list window is smaller than the item count, hiding the label '
    + 'otherwise - which with no storage device attached is the same answer.',
  'arcade/2504_TitleOptionsScene.xur#lblRatingText':
    'the selected title\'s content rating. The console writes it from the TITLE '
    + 'record: the rating routine 0x9221cbe8 reads this+2196 (the record), returns '
    + '0x8000ffff and paints nothing when it is null, writes SetText(lblRatingText, '
    + '(wchar*)(record + 7718)) at 0x9221ccc4-0x9221ccf0 when the record carries a '
    + 'rating, and on the no-rating arm 0x9221ccd0 hides the pane\'s own carrier '
    + '(this+2184, a field the ctor zeroes at 0x9221c41c and no name bind fills, so '
    + 'this survey does not name the control) '
    + 'and writes SetText(lblRatingText, L"") from the empty literal at 0x92001cd4. '
    + 'There is no title offline, so the empty caption is the console\'s own state.',
  'memory/Categories.xur#labTotal': 'the same "n of N" line, filled by 0x9225fe78 from memory/Strings.xus[67] and hidden when the list does not scroll; the items are device state.',
  'memory/HDDVDContents.xur#labTotal': 'the same "n of N" line over the HD DVD player\'s contents: device state.',
  'memory/ItemsGrid.xur#labTotal': 'the same "n of N" line, filled by 0x92263ea0 from memory/Strings.xus[67]; the items are device state.',
  'memory/ItemsGrid2.xur#labTotal': 'the same "n of N" line, filled by 0x92263ea0 from memory/Strings.xus[67]; the items are device state.',
  'memory/ItemsIcons.xur#labTotal': 'the same "n of N" line, filled by 0x92263ea0 from memory/Strings.xus[67]; the items are device state.',
  'memory/ItemsGrid2.xur#labSpaceRequired': 'the free space the copy needs, in GB: storage state read off the attached device.',
  'memory/OperationProgress.xur#txt_MetaHead':
    'the running storage operation. 0x9225c060 switches on the operation code and '
    + 'writes memory/Strings.xus[70..74] ("Copy in progress...", "Delete...", '
    + '"Formatting...", "Move...", "Performing maintenance.") into txt_MetaHead at '
    + '0x9225c19c, with [86..90] ("Copy", "Delete", "Format Device", "Move", '
    + '"Maintain Storage Devices") into txt_Header at 0x9225c184. No operation runs here.',
  'pictures/905_IndividualDeviceMain.xur#labelHighlightedOfTotal': 'the same "n of N" line over the pictures on the device, from pictures/Strings.xus[8] "%u of %u"; the pictures are device state.',
  'music/1020_ripCDlist.xur#labelSongCount': 'the track index of the total on the CD being ripped: disc state.',
  'music/1021_RipProgress.xur#labelSelectedTrack': 'the track index of the total on the CD being ripped: disc state.',
  'music/1020_ripCDlist.xur#labelCDName': 'the album name, from music/Strings.xus[40] "Rip CD: %s"; the name comes off the disc.',
  'music/1021_RipProgress.xur#labelCDName': 'the album name, from music/Strings.xus[40] "Rip CD: %s"; the name comes off the disc.',
  'iptv/uninstallIPTV.xur#labHeader': 'the IPTV service\'s name. There is no IPTV provider here - the same predicate (0x9226e7d8) that hides navIPTVSettings on the System blade - so the page is unreachable as well as unfilled.',
  'iptv/uninstallIPTV.xur#btnUninstall': 'the IPTV service\'s name again, on the page\'s one button; the same provider read, and the same absent provider.',
  'network/2036_PPoESettings.xur#txt_CurrentSettings': 'the PPPoE user name, password and service name the console has stored (network/Strings.xus[87] heads the block "Current Settings"): network configuration, none here.',
  'accountm/15XX_ChangeLiveIDCongrats.xur#labMetaPanel': 'the old and new Windows Live IDs of the account being changed: Xbox LIVE and a signed-in profile.',
  'accountm/15XX_ChangeLiveIDFinish.xur#labMetaPanel': 'the old and new Windows Live IDs and the Microsoft Points balance being transferred: Xbox LIVE and a signed-in profile.',
};

/** Scenes whose list the glue fills from a code table rather than scene data. */
export const CODE_TABLE_LISTS: Readonly<Record<string, {
  pack: string; table: string; rows: readonly SettingsRow[]; focus: number;
}>> = {
  [CONSOLE_SETTINGS_SCENE]: {
    pack: CONSOLE_SETTINGS_PACK, table: CONSOLE_SETTINGS_TABLE,
    rows: CONSOLE_SETTINGS_ROWS, focus: CONSOLE_SETTINGS_FOCUS,
  },
};
