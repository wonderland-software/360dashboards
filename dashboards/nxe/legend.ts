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
  NO_DELTA, updateNode, isNativeLocale, xuiRegistry, pathOf, PropBag, NO_OVERRIDES, authoredRect,
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
/**
 * The gap between one entry's caption and the next entry's icon.
 *
 * MEASURED on the Storage Devices legend row, which reads
 * "(A) Select (B) Back (Y) Device Options" [FRAME nxe-9199-YrtwSj1f6aY/f0437].
 * Ink runs along that row, in 1280x720 units: A icon 100..123, "Select"
 * 133..183, B icon 207..231, "Back" 241..279, Y icon 304..327, "Device
 * Options" 337..419. Caption end to next icon start is 202-183 = 19 and
 * 299-279 = 20, and the icon-to-caption offset is 37 and 39 against the file's
 * authored 36. So the gap is 20, not the 24 M4a guessed - which, with a
 * per-character caption width, put the B icon 7 px right of the frame.
 */
export const LEGEND_GAP = 20;
/**
 * The fallback caption advance, per character.
 *
 * It used to be the mechanism, and as a mechanism it is indefensible: a
 * per-character constant against a proportional face is wrong by a different
 * amount for every caption, and it put the B icon several pixels out on the
 * Console Settings still. The layout now measures the caption that was
 * ACTUALLY LAID OUT - the runtime has already rendered the glyphs by then, so
 * its own ink width is there for the asking - and this number is only reached
 * when the DOM cannot answer (a detached node, a font that never loaded).
 */
export const LEGEND_CHAR_W = 8.6;

/**
 * The INK width of a rendered caption, in design px, or null.
 *
 * A `Range` over the paint box measures the glyphs, not the box: the box is
 * the control's authored width (420 px here) and tells you nothing. Measured
 * this way "Select" comes out 51 px against 50 on the frame [FRAME Yrt f0437].
 */
function captionWidth(label: NodeRecord): number | null {
  const paint = label.el.matches('[data-xui-paint="text"]')
    ? label.el
    : label.el.querySelector('[data-xui-paint="text"]');
  if (!paint) return null;
  try {
    // A Range over the BOX measures the box (512 px here, the control's own
    // width); a Range over a TEXT NODE measures the glyphs. Take the widest
    // line, which for a one-line legend caption is the caption.
    const walker = document.createTreeWalker(paint, NodeFilter.SHOW_TEXT);
    const r = document.createRange();
    let w = 0;
    while (walker.nextNode()) {
      r.selectNodeContents(walker.currentNode);
      w = Math.max(w, r.getBoundingClientRect().width);
    }
    r.detach?.();
    return w > 0 ? w : null;
  } catch {
    return null;
  }
}

export interface LegendReport {
  scene: string;
  /** group -> the caption hoisted into it, in layout order. */
  buttons: { group: string; from: string; text: string; x: number; enabled: boolean; width: number | null }[];
  /** The page title and which title group it went into. */
  title: string;
  titleGroup: string | null;
  /** Buttons the page authors that carry no caption (disabled, or Live-only). */
  empty: string[];
  /** Scopes parked on the END of their Bind/Show range, with the frame. */
  settled: { scope: string; frame: number }[];
}

/** A legend caption the shell supplies rather than reading off a parked
 *  control. `from` says where it came from, for the report. */
export interface SuppliedCaption { group: string; from: string; text: string }

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
  /** Where the TITLE comes from when it is not the caption source (a pushed root). */
  titleSource?: NodeRecord | null;
  /** Filled with the groups that need settling once timelines are bound. */
  pending: NodeRecord[];
  /** Handed the mounted LegendScene root, so the shell can rebind it later
   *  without remounting the scene. */
  mounted?: (root: NodeRecord) => void;
  /** Captions the shell supplies (the home page's A, from the slot helptext). */
  supplied?: readonly SuppliedCaption[];
}

/**
 * Re-lay the legend row once the groups are on screen and their glyphs have
 * been laid out.
 *
 * `bindLegend` runs while the groups are still parked on frame 0 of their
 * `Show` range - i.e. invisible - so a `Range` over the caption measures
 * nothing and the layout falls back to the per-character estimate. Once
 * `settleLegend` has put them on the last frame the ink is real, so the row is
 * laid out again from the widths the renderer actually produced.
 */
export function relayoutLegend(root: NodeRecord, report: LegendReport): void {
  let x = 0;
  for (const b of report.buttons) {
    const node = find(root, b.group);
    if (!node) continue;
    b.x = x;
    node.overrides.set('Position', { x, y: 0, z: 0 });
    updateNode(node, ['Position']);
    const label = find(node, 'Text');
    b.width = label ? captionWidth(label) : null;
    x += LEGEND_TEXT_X + (b.width ?? b.text.length * LEGEND_CHAR_W) + LEGEND_GAP;
  }
}

/**
 * Park each bound group on the END of its `Show` range.
 *
 * The legend's artwork is Show=false as authored: `Images` inside every button
 * group and the whole of `LTitle`/`RTitle`/`SLTitle`/`SRTitle` only appear once
 * the group's `Show` timeline (frames 1..20, with a 1.0 -> 1.2 -> 0.8 -> 1.0
 * overshoot on the icon and the text fading in over 2..20) has run [SCENE]. So
 * a bound legend at REST is that range's last frame, and the shell seeks it -
 * the same rule the Blades shell uses for a blade's rest frame, and for the
 * same reason: a state range is motion, and arriving is not motion.
 */
export function settleLegend(engine: TimelineEngine, groups: readonly NodeRecord[]): { scope: string; frame: number }[] {
  const out: { scope: string; frame: number }[] = [];
  for (const node of groups) {
    const id = pathOf(node);
    const scope = engine.get(id);
    if (!scope) continue;
    const end = scope.frameOf('ShowEnd') ?? scope.frameOf('EndShow');
    if (end === null) continue;
    scope.seek(end);
    engine.applyNow(scope);
    out.push({ scope: id, frame: end });
  }
  return out;
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
  o.mounted?.(root);
  return bindLegend(root, o.source, o.pending, o.supplied ?? [], o.titleSource ?? o.source);
}

/**
 * Re-read the captions out of whatever page the shell is showing now.
 *
 * The legend is a SHELL service, so it survives every navigation and only its
 * contents change: moving the panel cursor, pushing a page and popping one all
 * hand it a different source scene. Remounting `LegendScene.xur` for each would
 * throw away the `Show` ranges the groups are parked on.
 */
export function bindLegend(
  root: NodeRecord, source: NodeRecord | null, pending: NodeRecord[],
  supplied: readonly SuppliedCaption[] = [], titleSource: NodeRecord | null = source,
): LegendReport {
  const report: LegendReport = { scene: LEGEND_SCENE, buttons: [], title: '', titleGroup: null, empty: [], settled: [] };
  const settle: NodeRecord[] = [];
  const o = { source };

  // What the page parks, by id. A carrier the author left Show=false is not
  // read: `signin/SigninScene.xur`'s legend_a says "Continue" with Show=false
  // and the footage draws "Select" there [FRAME Yrt f0268] (M4e).
  const parked = new Map<string, XuObject>();
  if (o.source) {
    walk(o.source.obj, (ob) => {
      const id = idOf(ob);
      if (id && id in LEGEND_BUTTONS && propByName(ob, 'Show')?.value !== false) parked.set(id, ob);
    });
  }
  // The title: a `Label_Head*` label the page PARKS off its own plate. A label
  // wearing the visual INSIDE the scene with Show=false (arcade/
  // ArcadeFilterScene.xur's labRomeTitle at (40,56)) stays where it is: the
  // footage shows no "Game Library" title over the Rome strip [FRAME Yrt
  // f0396, Kpa f0300] (M4e).
  let header: XuObject | null = null;
  const titleRoot = titleSource ?? o.source;
  if (titleRoot) {
    const size = PropBag.of(titleRoot.obj.children[0] ?? titleRoot.obj, NO_OVERRIDES);
    const h = size.num('Height', 480);
    walk(titleRoot.obj, (ob) => {
      const visual = propByName(ob, 'Visual')?.value;
      if (header || typeof visual !== 'string' || !(visual in HEADER_TITLES)) return;
      const r = authoredRect(PropBag.of(ob, NO_OVERRIDES));
      if (r.y < 0 || r.y >= h) header = ob;
    });
  }

  let x = 0;
  for (const group of LEGEND_ORDER) {
    const from = Object.keys(LEGEND_BUTTONS).find((k) => LEGEND_BUTTONS[k] === group)!;
    const ob = parked.get(from);
    // A caption the SHELL supplies outranks a parked control, because on the
    // home page there is no page to park one: the A caption is the focused
    // slot's own `<onclick><helptext>` out of the channel XML (§4.1).
    const given = supplied.find((c) => c.group === group);
    // A caption that is nothing but whitespace is no caption:
    // dashcomm/742_SelectNetworkDevice.xur's legend_x reads "\n" and is
    // Enabled=false, and M4d drew a blank X entry for it [COVERAGE N9] (M4e).
    const text = (given ? given.text : ob ? String(propByName(ob, 'Text')?.value ?? '') : '').trim();
    const enabled = given ? true : ob ? propByName(ob, 'Enabled')?.value !== false : false;
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
    let advance: number | null = null;
    if (label) {
      label.overrides.set('Text', text);
      updateNode(label, ['Text']);
      advance = captionWidth(label);
    }
    settle.push(node);
    report.buttons.push({ group, from: given ? given.from : from, text, x, enabled, width: advance });
    x += LEGEND_TEXT_X + (advance ?? text.length * LEGEND_CHAR_W) + LEGEND_GAP;
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
      settle.push(node);
    }
  } else {
    // No `Label_Head*` label on this page: the title groups stay hidden rather
    // than keeping the previous page's caption.
    for (const group of Object.values(HEADER_TITLES)) {
      const node = find(root, group);
      if (!node) continue;
      node.overrides.set('Show', false);
      updateNode(node, ['Show']);
    }
  }
  pending.length = 0;
  pending.push(...settle);
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

/**
 * Play a bound group's `Hide` or `Show` range - the legend's own authored
 * exits and entrances (frames 21..40 and 1..20 on the four button groups,
 * 11..20 and 1..10 on the title groups [SCENE]). The shell plays `Hide` when
 * the home page folds away behind a page and `Show` when it comes back; the
 * footage has the legend gone before the front slot starts rotating
 * [FRAME Kpa f05585-05590].
 */
export function playLegendRange(engine: TimelineEngine, groups: readonly NodeRecord[], range: 'Hide' | 'Show'): number {
  let n = 0;
  for (const node of groups) {
    const id = pathOf(node);
    if (engine.playRange(id, range, `${range}End`)) n++;
  }
  return n;
}

/** The press flourish on one button's `Images` group (`Press`..`PressEnd`,
 *  frames 1..20: the highlight blooms and the icon scales 1.2x [SCENE]). */
export function pressLegend(engine: TimelineEngine, root: NodeRecord, group: string): boolean {
  const node = find(root, group);
  const images = node ? find(node, 'Images') : null;
  if (!images) return false;
  return engine.playRange(pathOf(images), 'Press', 'PressEnd');
}
