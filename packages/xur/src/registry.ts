import type { XuClassDef, XuPropertyDef, XuRegistryJson } from './model';

/**
 * The XUI class registry: which properties each class declares, in mask-bit
 * order, and how classes inherit. Per build, generated from the dashboard
 * executable's own class registrations (tools/xui-propdefs.ts +
 * tools/build-registry.ts, e.g. extensions/6770 and extensions/9199), with
 * XUIHelper's XML (extensions/v5) kept only for name matching and for the
 * compile-time definitions XuiTool knew but the runtime never registered.
 */
export class XuRegistry {
  private readonly byName = new Map<string, XuClassDef>();
  private readonly hierarchyCache = new Map<string, XuClassDef[]>();

  constructor(readonly json: XuRegistryJson) {
    for (const c of json.classes) this.byName.set(c.name, c);
  }

  has(name: string): boolean {
    return this.byName.has(name);
  }

  get(name: string): XuClassDef {
    const c = this.byName.get(name);
    if (!c) throw new Error(`unknown XUI class "${name}"`);
    return c;
  }

  /** Root class first (XuiElement, ..., the class itself). */
  hierarchy(name: string): XuClassDef[] {
    let h = this.hierarchyCache.get(name);
    if (h) return h;
    h = [];
    let cur: XuClassDef | undefined = this.get(name);
    while (cur) {
      h.unshift(cur);
      cur = cur.base ? this.get(cur.base) : undefined;
    }
    this.hierarchyCache.set(name, h);
    return h;
  }

  /** Compound ("object" typed) properties are typed by their NAME in XUR v5. */
  compoundClassFor(def: XuPropertyDef): XuClassDef {
    switch (def.name) {
      case 'Fill': return this.get('XuiFigureFill');
      case 'Gradient': return this.get('XuiFigureFillGradient');
      case 'Stroke': return this.get('XuiFigureStroke');
      default: throw new Error(`no compound class known for object property "${def.name}"`);
    }
  }

}
