import type { XuClassDef, XuPropertyDef, XuRegistryJson } from './model';

/**
 * The XUI class registry: which properties each class declares, in mask-bit
 * order, and how classes inherit. Built from XUIHelper's V5 extension XML
 * (see tools/build-registry.ts) and loaded from registry.json.
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

  /**
   * Root class first (XuiElement, ..., the class itself). Transparent
   * classes are left out: the XUR carries no packed byte for them.
   */
  hierarchy(name: string): XuClassDef[] {
    let h = this.hierarchyCache.get(name);
    if (h) return h;
    h = [];
    let cur: XuClassDef | undefined = this.get(name);
    while (cur) {
      if (!cur.transparent) h.unshift(cur);
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

  /**
   * How many class-lookups deep a property definition sits from `className`:
   * 1 for a direct property, 2 for one inside Fill/Stroke, 3 for one inside
   * Fill.Gradient. Used by the count header.
   */
  depthOf(def: XuPropertyDef, className: string, depth = 1): number | null {
    for (const cls of this.hierarchy(className)) {
      for (const d of cls.props) {
        if (d === def) return depth;
        if (d.type === 'object') {
          const found = this.depthOf(def, this.compoundClassFor(d).name, depth + 1);
          if (found !== null) return found;
        }
      }
    }
    return null;
  }
}
