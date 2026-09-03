// controlp/LegendScene.xur - the legend and the page title, as a SHELL service.
//
// In Blades every page drew its own legend row and its own header. In NXE the
// page still AUTHORS them and then parks them off-screen, and the shell reads
// them: `consoles/dashSysCslSet.xur` puts `legend_y` at y = 1111, `legend_x` at
// 1139, `legend_a` at 1139, `legend_b` at 1111 and `labHeader` at y = -467.8
// with `Show=false` - all far outside its own 880x480 scene, so none of them is
// drawn [SCENE]. That parked geometry IS the hand-off contract.
//
// The console does exactly this, by name:
//
//  * `legend_y`, `legend_x`, `legend_b`, `legend_a` (.rdata 0x92013ab8,
//    0x92013acc, 0x92013ae0, 0x9201bb34, referenced consecutively at .text
//    0x92489d10-0x92489d1c) are copied into `YButton`/`XButton`/`BButton`/
//    `AButton`'s `Text` [CODE];
//  * the header comes from whichever of `Label_Head`, `Label_HeadR`,
//    `Label_HeadSL`, `Label_HeadSR` the page's label WEARS as its Visual
//    (0x920b0c44-0x920b0c90, referenced at 0x92489d00-0x92489d0c) and is
//    written into `LTitle`, `RTitle`, `SLTitle`, `SRTitle` respectively
//    (0x920b0cac-0x920b0cdc, referenced at 0x9248a274-0x9248a2b0) [CODE].
//
// `LegendScene.xur` is a 1088x32 scene at (96,632), Anchor 15, holding eight
// groups. The four button groups are all authored at (0,0) 32x32 - "the code
// lays them out" - so their x positions are the one number here that is not in
// the file. They are MEASURED off the frame and marked.
import { idOf, propByName, type XuObject } from '@xur/index';
import {
  loadScene, renderElement, indexVisuals, VisualScope, Skin, walk,
  NO_DELTA, updateNode, isNativeLocale, xuiRegistry,
  type AssetIndex, type RenderCtx, type NodeIndex, type NodeRecord,
  type Strings, type TimelineEngine,
} from '@runtime/index';

export const LEGEND_SCENE = 'controlp/LegendScene.xur';

/** page control id -> the LegendScene group its Text goes into [CODE]. */
export const LEGEND_BUTTONS: Readonly<Record<string, string>> = {
  legend_a: 'AButton',
  legend_b: 'BButton',
  legend_x: 'XButton',
  legend_y: 'YButton',
};

/** header Visual -> the LegendScene title group it is written into [CODE]. */
export const HEADER_TITLES: Readonly<Record<string, string>> = {
  Label_Head: 'LTitle',
  Label_HeadR: 'RTitle',
  Label_HeadSL: 'SLTitle',
  Label_HeadSR: 'SRTitle',
};

/**
 * Where the four button groups sit along the 1088-wide legend row.
 *
 * The file authors all four at (0,0) and says the code lays them out. MEASURED
 * off the legend row of the Storage Devices still, which reads
 * "(A) Select  (B) Back  (Y) Device Options" from x = 96 along y ~ 650
 * [FRAME nxe-9199-YrtwSj1f6aY/f0437]: the row starts at the scene's own left
 * edge and each entry is followed by its caption at x + 36 (the `Text` child's
 * authored offset) plus a gap. This is a LAYOUT RULE, not four numbers: entries
 * are packed left to right in A, B, X, Y order, each taking 32 px for the icon,
 * 36 px to its caption, the caption's measured width, and a 24 px gap.
 */
export const LEGEND_ORDER = ['AButton', 'BButton', 'XButton', 'YButton'] as const;
export const LEGEND_ICON_W = 32;
export const LEGEND_TEXT_X = 36;
export const LEGEND_GAP = 24;
/** INFERRED: the caption advance we cannot measure without laying out text. */
export const LEGEND_CHAR_W = 8.6;

export interface LegendReport {
  scene: string;
  /** group -> the caption hoisted into it, in layout order. */
  buttons: { group: string; from: string; text: string; x: number; enabled: boolean }[];
  /** The page title and which title group it went into. */
  title: string;
  titleGroup: string | null;
  /** Buttons the page authors that carry no caption (disabled, or Live-only). */
  empty: string[];
}

export interface HoistOpts {
  assets: AssetIndex;
  skin: Skin;
  ctx: RenderCtx;
  nodes: NodeIndex;
  engine: TimelineEngine;
  /** Where the legend scene is mounted: the shell's root scene. */
  host: NodeRecord;
  strings: Strings;
  locale: string;
  /** The hosted page whose parked controls are read, or null. */
  source: NodeRecord | null;
}

/**
 * Mount `LegendScene.xur` into the shell and fill it from the hosted page.
 *
 * Nothing is invented: a button with no `Text` gets no caption and is listed in
 * `empty`, and a page with no `Label_Head*` label leaves the title blank.
 */
export async function hoistLegend(o: HoistOpts): Promise<LegendReport | null> {
  const scene = await loadScene(o.assets, LEGEND_SCENE);
  if (!isNativeLocale(o.locale)) {
    await o.strings.applyLocale(scene.root, xuiRegistry(), scene.pack, scene.path, o.locale);
  }
  const ctx: RenderCtx = {
    ...o.ctx, pack: scene.pack,
    visuals: new VisualScope(indexVisuals(scene.root), o.skin),
  };
  const before = o.nodes.all.length;
  const el = renderElement(scene.root, ctx, {
    overrides: new Map(), delta: NO_DELTA, owner: null,
    parent: o.host.rect, parentNode: o.host,
  });
  if (!el) return null;
  el.dataset['xuiScene'] = scene.id;
  o.host.el.appendChild(el);
  const root = o.nodes.all[before];
  if (!root) return null;

  const report: LegendReport = { scene: LEGEND_SCENE, buttons: [], title: '', titleGroup: null, empty: [] };

  // What the page parks, by id.
  const parked = new Map<string, XuObject>();
  let header: XuObject | null = null;
  if (o.source) {
    walk(o.source.obj, (ob) => {
      const id = idOf(ob);
      if (id && id in LEGEND_BUTTONS) parked.set(id, ob);
      const visual = propByName(ob, 'Visual')?.value;
      if (!header && typeof visual === 'string' && visual in HEADER_TITLES) header = ob;
    });
  }

  let x = 0;
  for (const group of LEGEND_ORDER) {
    const from = Object.keys(LEGEND_BUTTONS).find((k) => LEGEND_BUTTONS[k] === group)!;
    const ob = parked.get(from);
    const text = ob ? String(propByName(ob, 'Text')?.value ?? '') : '';
    const enabled = ob ? propByName(ob, 'Enabled')?.value !== false : false;
    const node = find(root, group);
    if (!node) continue;
    if (!text) {
      // No caption means the console drew no entry: the page's legend_x/legend_y
      // are Enabled=false with no Text on the settings pages [SCENE], and the
      // frame shows nothing where they would be.
      report.empty.push(`${group} (${from}${ob ? '' : ': the page has no such control'})`);
      node.overrides.set('Show', false);
      updateNode(node, ['Show']);
      continue;
    }
    node.overrides.set('Show', true);
    node.overrides.set('Position', { x, y: 0, z: 0 });
    updateNode(node, ['Show', 'Position']);
    const label = find(node, 'Text');
    if (label) { label.overrides.set('Text', text); updateNode(label, ['Text']); }
    report.buttons.push({ group, from, text, x, enabled });
    x += LEGEND_ICON_W + (LEGEND_TEXT_X - LEGEND_ICON_W) + text.length * LEGEND_CHAR_W + LEGEND_GAP;
  }

  if (header) {
    const visual = String(propByName(header, 'Visual')?.value ?? '');
    const group = HEADER_TITLES[visual] ?? null;
    const text = String(propByName(header, 'Text')?.value ?? '');
    report.title = text;
    report.titleGroup = group;
    const node = group ? find(root, group) : null;
    if (node && text) {
      const label = find(node, 'Text') ?? node;
      label.overrides.set('Text', text);
      updateNode(label, ['Text']);
      node.overrides.set('Show', true);
      updateNode(node, ['Show']);
    }
  }
  return report;
}

function find(root: NodeRecord, id: string): NodeRecord | null {
  let out: NodeRecord | null = null;
  const go = (n: NodeRecord): void => {
    if (out) return;
    if (idOf(n.obj) === id) { out = n; return; }
    n.children.forEach(go);
  };
  go(root);
  return out;
}
