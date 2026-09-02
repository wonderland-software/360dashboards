// DashScene.PanelSettings / PanelStrings / PanelScenePaths, and the metapane.
//
// The three strings are index-parallel: for entry i, PanelSettings[i] is the
// control id, PanelStrings[i] is the metapane description, and
// PanelScenePaths[i] is the scene to load into the metapane placeholder - empty
// meaning "no scene, show the string". The count comes from PanelSettings
// alone, exactly as the console's rebuild does.
import { idOf, propByName, type XuObject } from '@xur/index';

/**
 * THE SEPARATOR IS THE TWO CHARACTERS BACKSLASH and ZERO, NOT a NUL byte. The
 * first PanelSettings bytes are 6E 61 76 53 65 74 74 69 6E 67 73 5C 30 ... -
 * "navSettings", then 0x5C, then 0x30. Splitting on a real NUL gives one entry
 * and makes the property look like a single string; this is the easiest thing
 * in the whole format to get wrong.
 */
export const PANEL_SEPARATOR = '\\0';

export function splitPanelList(s: string): string[] {
  if (!s) return [];
  const parts = s.split(PANEL_SEPARATOR);
  // A trailing separator produces an empty tail; an EMBEDDED empty entry is
  // meaningful (an empty scene path means "no scene"), so only the tail goes.
  if (parts.length > 1 && parts[parts.length - 1] === '') parts.pop();
  return parts;
}

export interface PanelEntry {
  index: number;
  /** The control id this row belongs to, or a logical row id. */
  id: string;
  /** The metapane description. */
  description: string;
  /** The scene to load into the metapane, or '' for "just the text". */
  scenePath: string;
}

/** The entry table a DashScene declares. Empty for a scene that is not one. */
export function panelEntries(scene: XuObject): PanelEntry[] {
  const settings = splitPanelList(str(scene, 'PanelSettings'));
  const strings = splitPanelList(str(scene, 'PanelStrings'));
  const paths = splitPanelList(str(scene, 'PanelScenePaths'));
  return settings.map((id, index) => ({
    index, id,
    description: strings[index] ?? '',
    scenePath: paths[index] ?? '',
  }));
}

function str(o: XuObject, name: string): string {
  const v = propByName(o, name)?.value;
  return typeof v === 'string' ? v : '';
}

/**
 * Which entry a focused control belongs to. The console walks the newly
 * focused control UP its parent chain comparing each Id against every entry's
 * id, so a presenter deep inside a nav button still finds its row.
 */
export function entryForFocus(entries: readonly PanelEntry[], chain: readonly XuObject[]): PanelEntry | null {
  for (const node of chain) {
    const id = idOf(node);
    if (!id) continue;
    const hit = entries.find((e) => e.id === id);
    if (hit) return hit;
  }
  return null;
}

/**
 * MetaPanelScene::GotoIndex. Indices are 1-BASED on the wire and the rules are
 * exact:
 *   index < 0                      -> Default / Default
 *   adjacent to the previous index -> "%dTo%d" / "%dTo%dEnd"  (prev+1, index+1)
 *   a jump, index > 0              -> "%dTo%dEnd" ALONE       (index, index+1) - snap
 *   a jump to index 0              -> "2To1End"                               - snap
 *
 * The names resolve through the metapane's VISUAL (metaScene_1line and its
 * variants, which carry upper-case "To" ranges over 11 timelines), never
 * through the placeholder's own lower-case 1to2/2to1 frames - those exist on
 * every metaPanelScene in the corpus and carry no timelines at all, so playing
 * them animates nothing.
 */
export function metaRange(prev: number, index: number): { start: string; end?: string } {
  if (index < 0) return { start: 'Default', end: 'Default' };
  if (prev >= 0 && Math.abs(index - prev) === 1) {
    return { start: `${prev + 1}To${index + 1}`, end: `${prev + 1}To${index + 1}End` };
  }
  if (index > 0) return { start: `${index}To${index + 1}End` };
  return { start: '2To1End' };
}

/** The press flourish, also 1-based. */
export const metaPressRange = (index: number) => ({ start: `${index + 1}Press`, end: `${index + 1}EndPress` });
