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
import { idOf, type XuObject } from '@xur/index';
import { CODE_TABLE_LISTS } from './consoleSettings';
import { CODE_LISTS, CODE_LISTS_NOT_FILLED, type CodeList } from './codeLists';

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
  /** Lists this scene declares empty that the glue filled from a recovered
   *  code table: "lstLanguages x11 from 0x92016d8c ...". */
  codeFilled: string[];
  /** Lists this scene declares empty that stay empty, with the reason. A page
   *  that comes up blank has to SAY it is blank. */
  codeUnfilled: string[];
}

export async function populateLists(
  scene: { id: string; root: XuObject; pack: string },
  ctx: RenderCtx, nodes: NodeIndex, engine: TimelineEngine, strings: Strings,
  // The POSITIONAL tables are localized too: consoles/de-de/dashCSettingsStrings.xus
  // is the German copy of the same 601 entries, read by the same index. Without
  // this the code-filled rows stayed English while every authored row around
  // them was translated.
  locale = 'en',
): Promise<PopulatedLists> {
  const out: PopulatedLists = {
    lists: [], initialFocus: 0, stillFocus: 0, descriptions: [], navPaths: [],
    missingStrings: [], codeFilled: [], codeUnfilled: [],
  };
  // Lists the executable fills that are NOT the Console Settings table: the
  // Display page's four-row table, the language / country / time-zone tables,
  // the passcode hints and the two remote-control channels. Keyed by the list's
  // OWN Id, because dashSysCslSetClockTime.xur has five empty lists.
  const byList = new Map<string, CodeList>();
  for (const spec of CODE_LISTS[scene.id] ?? []) byList.set(spec.list, spec);
  const codeTables = new Map<string, string[]>();
  const tableFor = async (spec: CodeList): Promise<string[]> => {
    const key = `${spec.pack}/${spec.table}`;
    let t = codeTables.get(key);
    if (!t) { t = await strings.stringsByIndex(spec.pack, spec.table, locale); codeTables.set(key, t); }
    return t;
  };
  const coded = CODE_TABLE_LISTS[scene.id];
  let table: string[] = [];
  if (coded) {
    table = await strings.stringsByIndex(coded.pack, coded.table, locale);
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
    const listId = idOf(list);
    let items: ListItem[] = authoredItems(list);
    if (items.length === 0 && coded && table.length) {
      items = coded.rows.map((r) => ({ text: table[r.label] ?? `#${r.label}` }));
    }
    const spec = items.length === 0 ? byList.get(listId) : undefined;
    if (spec) {
      const t = await tableFor(spec);
      for (const r of spec.rows) {
        if (t[r.label] === undefined) out.missingStrings.push(`${spec.table}[${r.label}] (${listId} row)`);
      }
      items = spec.rows.map((r) => ({ text: t[r.label] ?? `#${r.label}` }));
      out.navPaths = spec.rows.map((r) => r.scene ?? null);
      out.codeFilled.push(`${listId} x${items.length} from ${spec.va}`);
      // A row the console drew but would not let you pick. The Display page has
      // one: Screen Format is present and DISABLED while the console runs a
      // widescreen mode, which "Widescreen" in f01580's metapane confirms. We
      // draw it selectable, so it is reported rather than left silent.
      for (const [k, r] of spec.rows.entries()) {
        if (r.enabled === false) out.codeUnfilled.push(`${scene.id}#${listId} row ${k}: the code table marks it disabled on this hardware; drawn selectable`);
      }
    }
    if (items.length === 0) {
      // An empty list is only acceptable when we can say why.
      const why = CODE_LISTS_NOT_FILLED[`${scene.id}#${listId}`]
        ?? Object.entries(CODE_LISTS_NOT_FILLED)
          .find(([k]) => k.startsWith(`${scene.id}#`) && k.includes(listId))?.[1];
      out.codeUnfilled.push(`${scene.id}#${listId}: ${why ?? 'no code table recovered'}`);
      continue;
    }
    const view = new ListView(list, node, ctx, nodes, engine, xuiRegistry());
    view.setItems(items);
    out.lists.push(view);
  }
  return out;
}
