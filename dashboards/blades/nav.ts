// Where a press goes.
//
// XuiNavButton.PressPath is a BARE FILE NAME, and it is not always in the
// scene's own pack: navNetwork sits in dashmain but ConnStatus.xur exists only
// in network. The console's DashSystemScene compares the nav id against a chain
// of literals and names the pack itself; the XUR names the file. Both halves
// build section://<handle>,<pack>#<scene>.
//
// Because every .xur basename in the build is unique across all 30 packs (a
// sweep of every PressPath / ScenePath / ImagePath found zero collisions), a
// global basename index gets the same answer. The table below is the code's
// own mapping, kept as a cross-check rather than as the mechanism.
import type { AssetIndex } from '@runtime/index';

export interface NavRow {
  id: string;
  /** The pack the executable names for this nav id. */
  pack: string | null;
  /** The bare PressPath in the scene, or null for a code path. */
  pressPath: string | null;
  note?: string;
}

/**
 * The System blade's eight nav buttons, in the code's index order, which is
 * also their on-screen order (y = 153 + 45k).
 */
export const SYSTEM_NAV: readonly NavRow[] = [
  { id: 'navSettings', pack: 'consoles', pressPath: 'dashSysCslSet.xur' },
  { id: 'navPControls', pack: 'consoles', pressPath: 'dashSysCslSetPControlSelect.xur' },
  { id: 'navMemory', pack: 'memory', pressPath: 'DeviceSelector.xur' },
  { id: 'navNetwork', pack: 'network', pressPath: 'ConnStatus.xur' },
  { id: 'navWindowMediaConnect', pack: 'dashcomm', pressPath: '742_SelectNetworkDevice.xur' },
  { id: 'navLiveVision', pack: 'consoles', pressPath: 'dashSysLiveVision.xur' },
  // Never navigates: it raises a confirmation dialog and then runs the OOBE.
  { id: 'navSystemSetUp', pack: null, pressPath: null, note: 'code path into oobe/oobeWelcome.xur, behind a confirmation dialog' },
  { id: 'navIPTVSettings', pack: 'iptv', pressPath: 'dashSysIPTVSet.xur', note: 'hidden without an IPTV provider' },
];

/**
 * The footage shows SEVEN rows, ending at Initial Setup: navIPTVSettings is
 * hidden on a non-IPTV console. Hiding it also has to repair the nav chain,
 * because the chain is a plain linked list with no wrap and navSystemSetUp's
 * NavDown points at the row that is now gone.
 */
export const IPTV_ROW = 'navIPTVSettings';
export function systemNavRows(iptv: boolean): readonly NavRow[] {
  return iptv ? SYSTEM_NAV : SYSTEM_NAV.filter((r) => r.id !== IPTV_ROW);
}

export interface Resolved { scene: string; pack: string; path: string; viaTable: boolean }

/**
 * Resolve a bare PressPath to "<pack>/<path>". The basename index is the
 * mechanism; when the code table names a pack for this nav id we check the two
 * agree and report if they do not, rather than silently preferring one.
 */
export function resolvePress(
  assets: AssetIndex, pressPath: string, navId?: string,
): { resolved: Resolved | null; mismatch: string | null } {
  const found = assets.findByBasename(pressPath);
  if (!found) return { resolved: null, mismatch: null };
  const i = found.indexOf('/');
  const pack = found.slice(0, i);
  const path = found.slice(i + 1);
  const row = navId ? SYSTEM_NAV.find((r) => r.id === navId) : undefined;
  const mismatch = row?.pack && row.pack !== pack
    ? `${navId}: the code names pack "${row.pack}" but ${pressPath} lives in "${pack}"`
    : null;
  return { resolved: { scene: found, pack, path, viaTable: !!row?.pack }, mismatch };
}

/**
 * Presses the console handles in CODE, and where they go. Each is a control
 * with no PressPath (or one that names a file the build does not carry) whose
 * class navigates itself.
 *
 * - The Media blade's Music / Pictures / Videos rows carry PressPaths
 *   1000_MusicMain.xur / 900_PicturesMain.xur / VideosMain.xur, none of which
 *   is in any pack [SCENE]. What the console opens first is the source picker
 *   dashcomm/MediaSourceSelection.xur (MediaSourceSelectionScene, whose list
 *   class MediaSourceList is registered at 0x921ac344), then the device's own
 *   page - music/1003_IndividualDevice, pictures/905_IndividualDeviceMain,
 *   videos/Video [BLADES_GLUE_SPEC §4]. The chain is [INFER]: the spec reads
 *   it from the pack inventory, and this shell opens only its first page.
 * - Games' Create Gamer Profile has no PressPath; the console runs the OOBE
 *   profile chain, whose first scene is oobe/oobeProfileCreation.xur ("Please
 *   wait" over Loading_Large) [SPEC §4, INFER]. The profile it creates is
 *   device state, so that page is where this shell stops.
 * - Media Center opens MediaCenterScene (registered 0x922879c4): a Media
 *   Center PC on the network. Hardware; not opened.
 * - Initial Setup raises the message box at 0x92114a98 (settingsModel.ts
 *   INITIAL_SETUP_DIALOG) and runs the OOBE on Yes; the box is xam's.
 */
export const CODE_PRESS_PATHS: Readonly<Record<string, { scene: string | null; note: string }>> = {
  'mediabla/mediaSignedOut.xur#navMusic': { scene: 'dashcomm/MediaSourceSelection.xur', note: 'PressPath 1000_MusicMain.xur is not in the build; the source picker is the first page of the code path [SPEC §4, INFER]' },
  'mediabla/mediaSignedOut.xur#navPictures': { scene: 'dashcomm/MediaSourceSelection.xur', note: 'PressPath 900_PicturesMain.xur is not in the build; the source picker is the first page of the code path [SPEC §4, INFER]' },
  'mediabla/mediaSignedOut.xur#navVideo': { scene: 'dashcomm/MediaSourceSelection.xur', note: 'PressPath VideosMain.xur is not in the build; the source picker is the first page of the code path [SPEC §4, INFER]' },
  'mediabla/mediaSignedOut.xur#navMCX': { scene: null, note: 'MediaCenterScene (0x922879c4) connects to a Media Center PC: hardware' },
  'gamesbla/gamesSignedOut.xur#navCreateProfile': { scene: 'oobe/oobeProfileCreation.xur', note: 'the OOBE profile chain starts on its wait page [SPEC §4, INFER]; the profile is device state, so it ends there' },
};

/**
 * Second-level scenes declare TransFrom/TransTo "FadeOut"/"FadeIn", naming
 * one-timeline visuals of those names in dashuisk/skin.xur. Play them on the
 * outgoing and incoming scene while RootScene plays NOpen / NClose.
 */
export const TRANSITION_VISUALS = ['FadeIn', 'FadeOut', 'FadeIn1', 'FadeOut1'] as const;
