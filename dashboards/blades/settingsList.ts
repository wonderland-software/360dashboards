// The Console Settings rows.
//
// The scene does NOT carry them: lstSettings is a XuiCommonList with no
// ItemsText, because the console's code filled it. The labels live in the
// pack's POSITIONAL table, consoles/dashCSettingsStrings.xus, which the title
// indexes by position - so the row order below is the console's, and the text
// is the archive's, byte for byte.
//
// The table is alphabetical, which is why the indices are not consecutive:
//   527 Audio        528 Clock        529 Display      530 Language
//   531 Locale       532 Remote Control  533 Screen Saver
//   534 Shutdown     535 Startup      536 System Info  537 Themes
//
// Order and membership are taken from reference/frames/6717/f0060.png, which
// shows Display, Audio, Themes, Language, Clock, Locale, Startup, Shutdown,
// Screen Saver and a scroll-down arrow. INFERRED: what sits below the fold.
// Build 6770's DashScene.PanelSettings names nine buttons and omits Themes,
// so 6717 and 6770 do not agree on this list; the geometry is comparable, the
// membership is not.
export const CONSOLE_SETTINGS_TABLE = 'dashCSettingsStrings.xus';
export const CONSOLE_SETTINGS_PACK = 'consoles';

/** Positional indices into dashCSettingsStrings.xus, in the frame's order. */
export const CONSOLE_SETTINGS_ROWS: readonly number[] = [
  529, // Display
  527, // Audio
  537, // Themes
  530, // Language
  528, // Clock
  531, // Locale
  535, // Startup
  534, // Shutdown
  533, // Screen Saver
  536, // System Info  (below the fold in f0060; the arrow says there is more)
];

/** The row the reference frame has focused. */
export const CONSOLE_SETTINGS_FOCUS = 5; // Locale

/** Scenes whose list the glue fills from a positional table, by scene id. */
export const POSITIONAL_LISTS: Readonly<Record<string, { pack: string; table: string; rows: readonly number[]; focus: number }>> = {
  'consoles/dashSysCslSet.xur': {
    pack: CONSOLE_SETTINGS_PACK, table: CONSOLE_SETTINGS_TABLE,
    rows: CONSOLE_SETTINGS_ROWS, focus: CONSOLE_SETTINGS_FOCUS,
  },
};
