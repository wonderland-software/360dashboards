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

/** Scenes whose list the glue fills from a code table rather than scene data. */
export const CODE_TABLE_LISTS: Readonly<Record<string, {
  pack: string; table: string; rows: readonly SettingsRow[]; focus: number;
}>> = {
  'consoles/dashSysCslSet.xur': {
    pack: CONSOLE_SETTINGS_PACK, table: CONSOLE_SETTINGS_TABLE,
    rows: CONSOLE_SETTINGS_ROWS, focus: CONSOLE_SETTINGS_FOCUS,
  },
};
