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
// XuiBackButton and so on by exactly those names. That rule also explains the
// only unresolved visuals in the build: XuiScrollEnd and XuiScrollEndUp are
// class-default names the skin never defines.
import { idOf, propByName, type XuObject, type XuProperty, type XuPropertyDef, type XuRegistry } from '@xur/index';
import * as E from '../xuiEnums';
import type { RenderCtx } from '../render/DomRenderer';
import { renderElement } from '../render/DomRenderer';
import type { NodeIndex, NodeRecord } from '../render/update';
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
  private focused = -1;

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
          // MEASURED: row k top = list y + LIST_ITEM_TOP + pitch*k, and the
          // reference frame's ten row edges land on exactly that line.
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
    this.updateEnds();
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

  /** Which arrows are on: up while rows sit above the window, down below. */
  private updateEnds(): void {
    const top = Math.max(0, Math.min(this.focused - this.visibleCount + 1, this.items.length - this.visibleCount));
    if (this.ends.up) this.ends.up.el.style.visibility = top > 0 ? 'visible' : 'hidden';
    if (this.ends.down) this.ends.down.el.style.visibility = top + this.visibleCount < this.items.length ? 'visible' : 'hidden';
  }

  focus(i: number, state: 'Focus' | 'InitFocus' = 'Focus'): string | null {
    if (this.items.length === 0) return null;
    const prev = this.focused;
    this.focused = i;
    if (prev >= 0 && prev !== i) this.engine.setState(this.rows[prev]!.id, 'KillFocus');
    this.engine.setState(this.rows[i]!.id, state);
    this.updateEnds();
    return this.focusId;
  }

  /** DOCUMENTED: XuiList.Wrap decides whether the ends join up. */
  move(delta: number): string | null {
    if (this.items.length === 0) return null;
    const wrap = propByName(this.list, 'Wrap')?.value === true;
    let next = this.focused + delta;
    if (next < 0) next = wrap ? this.items.length - 1 : 0;
    if (next >= this.items.length) next = wrap ? 0 : this.items.length - 1;
    return this.focus(next);
  }

  select(): ListItem | null { return this.items[this.focused] ?? null; }
}
