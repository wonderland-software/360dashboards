// Filling the lists a scene does not fill itself.
//
// A XuiCommonList that declares ItemsText fills itself (31 scenes do). The
// Console Settings list declares none: its eleven rows are a 20-byte-per-entry
// table in the executable at VA 0x920143d0 whose label index points into the
// POSITIONAL string table consoles/dashCSettingsStrings.xus. See
// consoleSettings.ts - this module only applies it.
//
// It lives in the glue, not in the runtime, because "which table fills which
// list" is PowerPC code, and it is shared by both routes (?scene=... renders
// Console Settings on its own, and the shell pushes the same scene on A).
import { walk, ListView, authoredItems, xuiRegistry, type ListItem, type Strings, type RenderCtx, type NodeIndex, type TimelineEngine } from '@runtime/index';
import type { XuObject } from '@xur/index';
import { CODE_TABLE_LISTS } from './consoleSettings';

export interface PopulatedLists {
  lists: ListView[];
  /**
   * The row a list comes up on. NOTHING in the data picks a row: lstSettings
   * has no authored rows and the scene's DefaultFocus names the LIST, not an
   * item, so a fresh list is on index 0 and that is what the shell uses.
   */
  initialFocus: number;
  /**
   * The row reference/frames/6717/f0060.png has focused - Locale, index 5.
   * That is where the operator in the capture had scrolled to, not where the
   * page arrives, so it is used only by the ?scene= still route that has to
   * reproduce that frame.
   */
  stillFocus: number;
  /** Row descriptions, index-parallel with the first list's rows, when the code
   *  table supplies them. The metapane text comes from HERE, not from
   *  PanelStrings: for Audio the scene's PanelStrings reads "Change your audio
   *  output settings." while xus [294] reads "...output AND SOUND EFFECT
   *  settings", and the footage shows the latter. */
  descriptions: string[];
  /** The destination scene of each row, or null for a code path (Themes). */
  navPaths: (string | null)[];
  /** Positional-table indices the code table names and the .xus does not have.
   *  Empty on build 6770; a non-empty list would mean a row was invented. */
  missingStrings: string[];
}

export async function populateLists(
  scene: { id: string; root: XuObject; pack: string },
  ctx: RenderCtx, nodes: NodeIndex, engine: TimelineEngine, strings: Strings,
): Promise<PopulatedLists> {
  const out: PopulatedLists = { lists: [], initialFocus: 0, stillFocus: 0, descriptions: [], navPaths: [], missingStrings: [] };
  const coded = CODE_TABLE_LISTS[scene.id];
  let table: string[] = [];
  if (coded) {
    table = await strings.stringsByIndex(coded.pack, coded.table);
    out.stillFocus = coded.focus;
    out.descriptions = coded.rows.map((r) => table[r.description] ?? '');
    out.navPaths = coded.rows.map((r) => r.scene);
    for (const r of coded.rows) {
      if (table[r.label] === undefined) out.missingStrings.push(`${coded.table}[${r.label}] (row label)`);
      if (table[r.description] === undefined) out.missingStrings.push(`${coded.table}[${r.description}] (metapane)`);
    }
  }

  const listObjects: XuObject[] = [];
  walk(scene.root, (o) => { if (o.className === 'XuiList' || o.className === 'XuiCommonList') listObjects.push(o); });

  for (const list of listObjects) {
    const node = nodes.all.find((n) => n.obj === list);
    if (!node) continue;
    let items: ListItem[] = authoredItems(list);
    if (items.length === 0 && coded && table.length) {
      items = coded.rows.map((r) => ({ text: table[r.label] ?? `#${r.label}` }));
    }
    if (items.length === 0) continue;
    const view = new ListView(list, node, ctx, nodes, engine, xuiRegistry());
    view.setItems(items);
    out.lists.push(view);
  }
  return out;
}
