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
 * Second-level scenes declare TransFrom/TransTo "FadeOut"/"FadeIn", naming
 * one-timeline visuals of those names in dashuisk/skin.xur. Play them on the
 * outgoing and incoming scene while RootScene plays NOpen / NClose.
 */
export const TRANSITION_VISUALS = ['FadeIn', 'FadeOut', 'FadeIn1', 'FadeOut1'] as const;
