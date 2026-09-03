// Focus inside one scene.
//
// XUI focus is authored, not computed: XuiScene.DefaultFocus names where focus
// lands when the scene arrives, and every focusable control names its
// neighbours in NavUp / NavDown / NavLeft / NavRight. The System blade's chain
// is a plain linked list with no wrap - navSettings.NavDown=navPControls ...
// navIPTVSettings.NavUp=navSystemSetUp, with no NavUp on the first and no
// NavDown on the last - and NavLeft/NavRight are unset everywhere, because
// left and right are the blade switch and XuiTabScene owns them [SCENE].
//
// Nothing here searches for the nearest control in a direction: the console
// does not, and inventing a search would move focus where the data says it
// cannot go.
import { idOf, propByName, type XuObject } from '@xur/index';

export type NavDirection = 'Up' | 'Down' | 'Left' | 'Right';
const NAV_PROP: Readonly<Record<NavDirection, string>> = {
  Up: 'NavUp', Down: 'NavDown', Left: 'NavLeft', Right: 'NavRight',
};

export interface FocusHost {
  /** The object with that Id inside this scene, or undefined. */
  object(id: string): XuObject | undefined;
  /** False for a control the glue has hidden (navIPTVSettings offline). */
  focusable(id: string): boolean;
  /** A live override wins over the authored property: hiding the IPTV row
   *  rewrites navSystemSetUp.NavDown to "". */
  override(id: string, prop: string): string | null;
}

export class FocusModel {
  private id: string | null = null;
  private readonly parents = new Map<XuObject, XuObject>();

  constructor(readonly root: XuObject, private readonly host: FocusHost) {
    const walk = (o: XuObject) => { for (const c of o.children) { this.parents.set(c, o); walk(c); } };
    walk(root);
  }

  /** DefaultFocus, as the scene declares it. Null when it names nothing real. */
  get defaultFocus(): string | null {
    const v = propByName(this.root, 'DefaultFocus')?.value;
    return typeof v === 'string' && v && this.host.object(v) ? v : null;
  }

  get current(): string | null { return this.id; }

  /** Returns the id when focus actually moved, null when nothing changed - the
   *  caller uses that to decide whether a state (and therefore a cue) fires. */
  set(id: string | null): string | null {
    if (id === this.id) return null;
    this.id = id;
    return id;
  }

  /** One step along the authored chain. Null when the chain ends there, which
   *  is what makes a held d-pad at the end of the list silent. */
  move(dir: NavDirection): string | null {
    if (!this.id) return null;
    let next: string | null = this.neighbour(this.id, dir);
    // A hidden row is not simply skipped by the console - it repairs the chain
    // instead (BladeShell.applyIptv rewrites NavDown). This loop only guards
    // against a chain that still points at something invisible.
    const seen = new Set<string>([this.id]);
    while (next && !this.host.focusable(next) && !seen.has(next)) {
      seen.add(next);
      next = this.neighbour(next, dir);
    }
    if (!next || next === this.id || !this.host.object(next)) return null;
    return this.set(next);
  }

  private neighbour(from: string, dir: NavDirection): string | null {
    const prop = NAV_PROP[dir];
    const over = this.host.override(from, prop);
    if (over !== null) return over || null;
    const o = this.host.object(from);
    const v = o ? propByName(o, prop)?.value : undefined;
    return typeof v === 'string' && v ? v : null;
  }

  /** The focused object and every ancestor up to the scene root, nearest
   *  first. The console walks exactly this chain comparing each Id against the
   *  DashScene entry table, which is how a presenter deep inside a nav button
   *  still finds its metapane row (0x921b4478). */
  chain(id = this.id): XuObject[] {
    const out: XuObject[] = [];
    let cur = id ? this.host.object(id) : undefined;
    while (cur) { out.push(cur); cur = this.parents.get(cur); }
    return out;
  }

  /** Every focusable id in authored order, for telemetry and the smoke gate. */
  rows(): string[] {
    const out: string[] = [];
    const walk = (o: XuObject) => {
      const id = idOf(o);
      if (id && (propByName(o, 'NavUp') || propByName(o, 'NavDown')) && this.host.focusable(id)) out.push(id);
      o.children.forEach(walk);
    };
    walk(this.root);
    return out;
  }
}
