// XuiList / XuiCommonList row population.
//
// Everything about the geometry comes from the skin, not from a guess. The
// XuiList visual is a TEMPLATE: it holds one XuiListItem (Id control_ListItem,
// 420x45, Anchor 15, Visual "XuiButton") and two XuiScrollEnds (control_ScrollUp
// and control_ScrollDown, 27x27, Anchor 12 = RIGHT|BOTTOM, visuals
// scr_ScrollEndUp / scr_ScrollEndDown, the down one carrying Direction 1). So
// the 45px row pitch, the row's look and where the arrows sit are all read out
// of dashuisk/skin.xur.
//
// A control with no Visual of its own falls back to a visual named after its
// CLASS - the skin defines XuiList, XuiButton, XuiLabel, XuiCheckbox,
// XuiBackButton and so on by exactly those names. That rule is also why
// XuiScrollEnd / XuiScrollEndUp go unresolved: they are named as the Visual of
// XuiEdit's own ScrollDown / ScrollUp inside skin.xur and the skin never
// defines them. The LIST's arrows do not go through that fallback - XuiList
// names scr_ScrollEndUp and scr_ScrollEndDown outright, and both exist.
//
// THE WINDOW IS NINE ROWS. lstSettings is 423x435 and the row pitch is 45, so
// floor(435/45) = 9 rows fit; the tenth would start at design y 559 and the
// frame ends at 589. Measured in reference/frames/6717/f0060.png (Console
// Settings, unscrolled): the eleven-row table paints nine row bands inside the
// frame, mean luma 128.0 / 126.2 / 123.7 / 124.1 / 127.8 / 164.3 / 107.4 /
// 108.0 / 110.8 for k=0..8 - the 164.3 at k=5 is the focus highlight on Locale,
// row 5 of the code table, and there is no tenth band to measure.
//
// f0066.png is the same list at System Info, row 10 of 11 (0-based), and it
// settles both the pin and the scroll amount:
//   - the highlight band has moved to k=8, the BOTTOM row of the window
//     (mean luma 157.6 against ~113 for its neighbours), so once the selection
//     passes the window it is pinned to the last visible row;
//   - the window has slid by exactly TWO. Cross-correlating each frame's row
//     label ink profile against the other's, over the rows that are unfocused
//     in both, gives mean ncc 0.371 / 0.326 / 0.902 / 0.291 for shifts of
//     0 / 1 / 2 / 3. Two is the only shift that fits, and 10 - 9 + 1 = 2.
//
// That nine is also why the METAPANE is indexed by the VISIBLE row and not the
// absolute one: metaScene_1line authors NToM ranges for 1..9 only, which is
// exactly one per window slot. `visibleIndex` is what a metapane must be
// driven from; `focusIndex` stays the row's place in the table.
import { idOf, propByName, type XuObject, type XuProperty, type XuPropertyDef, type XuRegistry } from '@xur/index';
import * as E from '../xuiEnums';
import type { RenderCtx } from '../render/DomRenderer';
import { renderElement } from '../render/DomRenderer';
import { updateNode, pathOf, type NodeIndex, type NodeRecord } from '../render/update';
import { bindTimelines } from '../anim/bind';
import type { TimelineEngine } from '../anim/TimelineEngine';
import { NO_DELTA } from '../render/anchor';

export interface ListItem { text: string; image?: string; navPath?: string }

/** ItemsText / ItemsImage / ItemsNavPath are CRLF-separated, with a trailing
 *  separator; proven on all 31 XuiCommonLists in the build that set them. */
export function splitItems(s: string): string[] {
  return s.split(/\r\n|\n/).filter((v) => v.length > 0);
}

/** The items a XuiCommonList declares in the scene, if any. */
export function authoredItems(list: XuObject): ListItem[] {
  const text = propByName(list, 'ItemsText')?.value;
  if (typeof text !== 'string' || !text) return [];
  const images = splitItems(typeof propByName(list, 'ItemsImage')?.value === 'string' ? String(propByName(list, 'ItemsImage')!.value) : '');
  const navs = splitItems(typeof propByName(list, 'ItemsNavPath')?.value === 'string' ? String(propByName(list, 'ItemsNavPath')!.value) : '');
  return splitItems(text).map((t, i) => ({ text: t, image: images[i], navPath: navs[i] }));
}

interface Template {
  itemVisual: string;
  itemHeight: number;
  itemAnchor: number;
  scrollUp: XuObject | null;
  scrollDown: XuObject | null;
}

/** Read the row template out of the list's own visual. */
export function templateOf(listVisual: XuObject | undefined): Template {
  const t: Template = { itemVisual: 'XuiButton', itemHeight: E.LIST_ITEM_PITCH, itemAnchor: 15, scrollUp: null, scrollDown: null };
  if (!listVisual) return t;
  for (const c of listVisual.children) {
    const id = idOf(c);
    if (c.className === 'XuiListItem' || id === 'control_ListItem') {
      const v = propByName(c, 'Visual')?.value;
      if (typeof v === 'string' && v) t.itemVisual = v;
      const h = propByName(c, 'Height')?.value;
      if (typeof h === 'number') t.itemHeight = h;
      const a = propByName(c, 'Anchor')?.value;
      if (typeof a === 'number') t.itemAnchor = a;
    } else if (c.className === 'XuiScrollEnd') {
      const dir = propByName(c, 'Direction')?.value;
      if (dir === 1) t.scrollDown = c; else t.scrollUp = c;
    }
  }
  return t;
}

function def(reg: XuRegistry, className: string, name: string): XuPropertyDef | null {
  for (const cls of reg.hierarchy(className)) {
    const d = cls.props.find((p) => p.name === name);
    if (d) return d;
  }
  return null;
}
function prop(reg: XuRegistry, className: string, name: string, value: XuProperty['value']): XuProperty | null {
  const d = def(reg, className, name);
  return d ? { def: d, value } : null;
}

/**
 * A live list. `setItems` builds one XuiListItem per row from the template and
 * renders it into the list's element; focus drives each row's visual through
 * the state ranges the skin defines.
 */
export class ListView {
  private items: ListItem[] = [];
  private rows: { obj: XuObject; node: NodeRecord | undefined; id: string }[] = [];
  private ends: { up: NodeRecord | undefined; down: NodeRecord | undefined } = { up: undefined, down: undefined };
  /** Last state played into each scroll end, so a held d-pad does not re-enter
   *  a range it is already in (the same edge rule `focus` documents below). */
  private endState: { up: string; down: string } = { up: 'Normal', down: 'Normal' };
  private focused = -1;
  /** The first row inside the window; rows before it are not drawn. */
  private windowTop = 0;

  constructor(
    readonly list: XuObject,
    private readonly node: NodeRecord,
    private readonly ctx: RenderCtx,
    private readonly index: NodeIndex,
    private readonly engine: TimelineEngine,
    private readonly reg: XuRegistry,
  ) {}

  get id(): string { return idOf(this.list); }
  get count(): number { return this.items.length; }
  get focusIndex(): number { return this.focused; }
  get focusId(): string | null { return this.focused < 0 ? null : this.rows[this.focused]?.id ?? null; }
  /** Rows that fit inside the list's Height at the template's pitch. */
  get visibleCount(): number { return Math.max(1, Math.floor((this.node.rect.h - E.LIST_ITEM_TOP) / this.pitch)); }
  /** The table row drawn in the window's first slot. */
  get topIndex(): number { return this.windowTop; }
  /**
   * Which SLOT of the window the focused row occupies, 0-based, or -1 for no
   * focus. This is the number a metapane is indexed by - see the header: the
   * metapane visual authors one range per slot (1..9) and none per table row,
   * so `focusIndex` would run off the end the moment the list scrolls.
   */
  get visibleIndex(): number { return this.focused < 0 ? -1 : this.focused - this.windowTop; }
  private get pitch(): number { return templateOf(this.visual()).itemHeight; }

  private visual(): XuObject | undefined {
    const named = propByName(this.list, 'Visual')?.value;
    const name = typeof named === 'string' && named ? named : this.list.className;
    // XuiCommonList has no visual of its own in the skin; its base does.
    return this.ctx.visuals.resolve(name) ?? this.ctx.visuals.resolve('XuiList');
  }

  setItems(items: ListItem[], opts: { itemVisual?: string } = {}): void {
    const tpl = templateOf(this.visual());
    const itemVisual = opts.itemVisual ?? tpl.itemVisual;
    this.items = items;
    this.rows = [];
    this.windowTop = 0;
    this.endState = { up: 'Normal', down: 'Normal' };
    this.node.el.replaceChildren();
    this.node.children.length = 0;

    items.forEach((item, k) => {
      const id = `${this.id}_item${k}`;
      const obj: XuObject = {
        className: 'XuiListItem',
        properties: [
          prop(this.reg, 'XuiListItem', 'Id', id),
          prop(this.reg, 'XuiListItem', 'Width', this.node.rect.w),
          prop(this.reg, 'XuiListItem', 'Height', tpl.itemHeight),
          // MEASURED: the row in window SLOT s tops out at list y +
          // LIST_ITEM_TOP + pitch*s, and f0060's ten row edges land on exactly
          // that line. Authored here for the unscrolled window (slot = k);
          // `layout` rewrites it whenever the window moves, and is the only
          // thing that decides which rows are drawn at all.
          prop(this.reg, 'XuiListItem', 'Position', { x: 0, y: E.LIST_ITEM_TOP + tpl.itemHeight * k, z: 0 }),
          prop(this.reg, 'XuiListItem', 'Anchor', tpl.itemAnchor),
          prop(this.reg, 'XuiListItem', 'Visual', itemVisual),
          prop(this.reg, 'XuiListItem', 'Text', item.text),
          item.image ? prop(this.reg, 'XuiListItem', 'ImagePath', item.image) : null,
          item.navPath ? prop(this.reg, 'XuiListItem', 'NavPath', item.navPath) : null,
        ].filter((p): p is XuProperty => p !== null),
        children: [], namedFrames: [], timelines: [],
      };
      const before = this.index.all.length;
      const el = renderElement(obj, this.ctx, {
        overrides: new Map(), delta: NO_DELTA, parent: this.node.rect,
        owner: null, parentNode: this.node,
      });
      if (el) this.node.el.appendChild(el);
      const node = this.index.all[before];
      this.rows.push({ obj, node, id });
    });

    // Scroll ends only exist while there is something off the end to reach.
    this.ends = { up: undefined, down: undefined };
    if (items.length > this.visibleCount) {
      this.ends.up = this.addScrollEnd(tpl.scrollUp);
      this.ends.down = this.addScrollEnd(tpl.scrollDown);
    }

    bindTimelines(this.index, this.engine);
    this.rows.forEach((r) => this.engine.setState(r.id, 'Normal'));
    this.layout();
  }

  private addScrollEnd(tplObj: XuObject | null): NodeRecord | undefined {
    if (!tplObj) return undefined;
    const before = this.index.all.length;
    const el = renderElement(tplObj, this.ctx, {
      overrides: new Map(), delta: { dw: this.node.rect.w - 420, dh: this.node.rect.h - 74 },
      parent: this.node.rect, owner: null, parentNode: this.node,
    });
    if (el) this.node.el.appendChild(el);
    return this.index.all[before];
  }

  /**
   * Slide the window the least that keeps the focused row inside it, then
   * repaint. Coming DOWN past the last slot the window follows one row at a
   * time, which is what pins the selection to the bottom of the frame - f0066
   * has row 10 of 11 highlighted in slot 8 with the window at 2. Going back UP
   * the mirror rule holds the rows still until focus reaches slot 0; a "always
   * pin to the bottom" rule would drag the whole table up under a stationary
   * highlight, which no frame shows.
   */
  private scrollIntoView(): void {
    const last = Math.max(0, this.items.length - this.visibleCount);
    if (this.focused < this.windowTop) this.windowTop = this.focused;
    else if (this.focused >= this.windowTop + this.visibleCount) this.windowTop = this.focused - this.visibleCount + 1;
    this.windowTop = Math.max(0, Math.min(this.windowTop, last));
  }

  /**
   * Paint the window. Row k sits in slot k - windowTop, and a row outside the
   * window is not drawn: the eleven Console Settings rows at a flat 45k would
   * put the last two below the list frame and over the legend band, and the
   * console shows nine.
   */
  private layout(): void {
    const pitch = this.pitch;
    const bottom = this.windowTop + this.visibleCount;
    for (let k = 0; k < this.rows.length; k++) {
      const node = this.rows[k]!.node;
      if (!node) continue;
      node.overrides.set('Show', k >= this.windowTop && k < bottom);
      node.overrides.set('Position', { x: 0, y: E.LIST_ITEM_TOP + pitch * (k - this.windowTop), z: 0 });
      updateNode(node, ['Show', 'Position']);
    }
    this.updateEnds();
  }

  /**
   * Which arrow is on: up while rows sit above the window, down while rows sit
   * below it. MEASURED in the two Console Settings frames, thresholding luma
   * above 155 inside each control's own 27x27 design rect (control_ScrollUp at
   * list-local (363,411), control_ScrollDown at (386,409), both after the
   * Anchor 12 delta the 420x74 template takes to 423x435):
   *
   *   f0060 (window at 0, eight rows still below)  down: 125 lit px spanning
   *         design x 535.5..555.3, y 568.3..580.6   up: nothing (4 px)
   *   f0066 (window at 2, nothing below)           up:   124 lit px spanning
   *         design x 511.6..532.0, y 569.6..581.8   down: nothing (0 px)
   *
   * Both glyphs land inside their own authored rect and the pair is 23.9 design
   * px apart in x, against the 23 the skin authors - so these are the skin's two
   * controls, one at a time, and not one control that moves.
   *
   * The state is ScrollMore, not Normal. scr_ScrollEndDown's named frames are
   * Normal 0..1, ScrollMore 2..3, Scrolling 4..20, and every child (xhade2,
   * xhade3, white2) carries Show=false on frames 0 and 1 and Show=true from
   * frame 2 on. So Normal draws nothing at all and ScrollMore is the resting
   * chevron; the glow figure xhade2 only fades in over Scrolling (Opacity 0 at
   * frame 4, 0.5 at 12, 0 at 20). scr_ScrollEndUp is the mirror of it.
   */
  private updateEnds(): void {
    const path = pathOf(this.node) + '/';
    const set = (which: 'up' | 'down', id: string, on: boolean): void => {
      if (!this.ends[which]) return;
      const state = on ? 'ScrollMore' : 'Normal';
      if (this.endState[which] === state) return;   // no edge, no re-entry
      this.endState[which] = state;
      this.engine.setState(id, state, path);
    };
    set('up', 'control_ScrollUp', this.windowTop > 0);
    set('down', 'control_ScrollDown', this.windowTop + this.visibleCount < this.items.length);
  }

  /**
   * EDGE-TRIGGERED. A state range is a piece of motion, not a property: playing
   * it again restarts it from its opening frame. XuiButton's Focus range runs
   * frame 15 to 253 and its EndFocus GoToAndPlay's back to FocusLoop at 28, so
   * a Focus re-issued while focus has not moved throws the playhead back to 15
   * and the row's shine never gets past the first third of its loop.
   *
   * That is exactly what a held d-pad used to do at either end of the list:
   * move() clamps, focus() was called with the index it already had, and the
   * 100ms auto-repeat re-entered the range ten times a second.
   *
   * So: only an actual change of focused row plays anything. `force` exists for
   * the caller that really does want to replay a state (a re-entry into the
   * scene), and nothing on the input path passes it.
   */
  focus(i: number, state: 'Focus' | 'InitFocus' = 'Focus', force = false): string | null {
    if (this.items.length === 0) return null;
    const prev = this.focused;
    if (prev === i && !force) return this.focusId;   // no edge, no state change
    this.focused = i;
    if (prev >= 0 && prev !== i) this.engine.setState(this.rows[prev]!.id, 'KillFocus');
    this.engine.setState(this.rows[i]!.id, state);
    this.scrollIntoView();
    this.layout();
    return this.focusId;
  }

  /**
   * DOCUMENTED: XuiList.Wrap decides whether the ends join up. Returns null
   * when the move was absorbed by a clamp, so the caller can tell "focus moved"
   * from "focus was already there" - the cue depends on it.
   */
  move(delta: number): string | null {
    if (this.items.length === 0) return null;
    const wrap = propByName(this.list, 'Wrap')?.value === true;
    let next = this.focused + delta;
    if (next < 0) next = wrap ? this.items.length - 1 : 0;
    if (next >= this.items.length) next = wrap ? 0 : this.items.length - 1;
    if (next === this.focused) return null;
    return this.focus(next);
  }

  select(): ListItem | null { return this.items[this.focused] ?? null; }
}
