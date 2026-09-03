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
 * not scene data and not a string table.
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
  { row: 10, value: 'Dashboard: 2.0.6717.0', frame: '6717/f0066' },
];

/**
 * A caption the AUTHORING TOOL left behind, not a caption the console drew.
 *
 * 168 controls across the corpus ship a Text that is nothing but an
 * angle-bracket token - "<setting>" on every Console Settings page's current
 * setting line, "<servicename>" on the IPTV rows, "<game title>", "<free
 * space>", "<MAC Addr>". Each is a slot the console filled from device or Live
 * state before the control was ever shown, so painting the token is strictly
 * wrong: the console never displayed one. They are cleared and counted, and the
 * ones we can fill from the footage are filled above.
 */
export const AUTHORING_PLACEHOLDER = /^\s*<[^<>\r\n]{1,40}>\s*$/;

/** Scenes whose list the glue fills from a code table rather than scene data. */
export const CODE_TABLE_LISTS: Readonly<Record<string, {
  pack: string; table: string; rows: readonly SettingsRow[]; focus: number;
}>> = {
  [CONSOLE_SETTINGS_SCENE]: {
    pack: CONSOLE_SETTINGS_PACK, table: CONSOLE_SETTINGS_TABLE,
    rows: CONSOLE_SETTINGS_ROWS, focus: CONSOLE_SETTINGS_FOCUS,
  },
};
