// NXE 9199's Console Settings rows.
//
// Same pattern as Blades, one field shorter. `consoles/dashSysCslSet.xur`
// carries no ItemsText and no hand-placed rows: the list is an EIGHT-entry
// table in the executable at VA 0x92016a90, SIXTEEN bytes an entry -
// `(u32 labelIndex, u32 descIndex, ptr handler, ptr wide sceneFile)` - which is
// the 6770 layout minus its fifth `altHandler` field. The pack literal
// `consolesettings.xzp` (0x920166a4) and the table name
// `dashCSettingsStrings.xus` (0x92016670) sit beside it [CODE, NXE_GLUE_SPEC
// §5]. Immediately after it, at 0x92016b18, comes the Family-Settings chain.
//
// Both indices of every row were re-read here against
// `consoles/dashCSettingsStrings.xus` (kind 2, 621 entries): all sixteen
// resolve, the labels are the eight the footage shows in the order the footage
// shows them [FRAME nxe-9199-Kparblu6r14/f0375], and each description carries
// the leading CRLFs the metapane's "Current Setting" block sits in.
//
// Blades' eleven rows are GONE: Themes moved to its own channel entry
// (`gamer/ThemesRoot.xur`), Language and Locale merged, Startup and Shutdown
// merged, Screen Saver moved under Display, and Auto-Play is new.
import type { SettingsRow } from '@dash/blades/consoleSettings';

export const CONSOLE_SETTINGS_SCENE_9199 = 'consoles/dashSysCslSet.xur';
export const CONSOLE_SETTINGS_PACK_9199 = 'consoles';
export const CONSOLE_SETTINGS_TABLE_9199 = 'dashCSettingsStrings.xus';
export const CONSOLE_SETTINGS_VA_9199 = '0x92016a90';

export const CONSOLE_SETTINGS_ROWS_9199: readonly SettingsRow[] = [
  { label: 549, description: 325, scene: 'dashSysCslSetDisplay.xur' },            // Display
  { label: 547, description: 323, scene: 'dashSysCslSetAudio.xur' },              // Audio
  { label: 550, description: 326, scene: 'dashSysCslSetLangLocale.xur' },         // Language and Locale
  { label: 548, description: 324, scene: 'dashSysCslSetClock.xur' },              // Clock
  { label: 553, description: 329, scene: 'dashSysCslSetStartupShutdown.xur' },    // Startup and Shutdown
  { label: 551, description: 327, scene: 'dashSysCslSetMediaAutoLaunch.xur' },    // Auto-Play
  { label: 552, description: 328, scene: 'dashSysCslSetRemoteC.xur' },            // Remote Control
  { label: 554, description: 330, scene: 'dashSysCslSetPolicyInfo_System.xur' },  // System Info
];

/**
 * The Display sub-list: a second 16-byte table at VA 0x927f0ae0, fields
 * `(u32 labelIndex, ptr wide sceneFile, u32, u32)`, seven entries, resolving in
 * the same `.xus` [CODE, NXE_GLUE_SPEC §5]. Not wired into a page yet; kept
 * here so the row set is recorded where the Console Settings one is.
 */
export const DISPLAY_ROWS_9199: readonly SettingsRow[] = [
  { label: 252, description: -1, scene: 'dashSysCslSetDisplayHiDef.xur' },        // HDTV Settings
  { label: 545, description: -1, scene: 'dashSysCslSetDisplayFormat.xur' },       // Screen Format
  { label: 397, description: -1, scene: 'dashSysCslSetOutputLevels.xur' },        // Reference Levels
  { label: 401, description: -1, scene: 'dashSysCslSetDisplayPal.xur' },          // PAL Settings
  { label: 126, description: -1, scene: 'dashSysCslSetColorSpace.xur' },          // HDMI Color Space
  { label: 155, description: -1, scene: 'dashSysCslSetDisplayDiscovery.xur' },    // Display Discovery
  { label: 546, description: -1, scene: 'dashSysCslSetScreensaver.xur' },         // Screen Saver
];

/**
 * The pages the shell can host inside a `LegacyControl` today, and which code
 * table fills each one's list. Keyed by the manifest scene id.
 */
export const LEGACY_CODE_TABLES: Readonly<Record<string, {
  pack: string; table: string; rows: readonly SettingsRow[]; va: string;
}>> = {
  [CONSOLE_SETTINGS_SCENE_9199]: {
    pack: CONSOLE_SETTINGS_PACK_9199,
    table: CONSOLE_SETTINGS_TABLE_9199,
    rows: CONSOLE_SETTINGS_ROWS_9199,
    va: CONSOLE_SETTINGS_VA_9199,
  },
};
