// Localized text.
//
// English is NOT in the .xus tables: it is the literal already stored in the
// .xur, and a locale table overwrites it property by property (see
// packages/xuiz/src/xus.ts, proven over all 3,234 tables). So applyLocale on
// "en" is a no-op by design, not a gap.
//
// A KEYED entry's u32 is (u8 classIndex, u8 propIndex, u16 objectId):
//   classIndex  index into the object's non-transparent class hierarchy
//   propIndex   the property's index inside that class, in mask-bit order
//   objectId    1-based POSTORDER position of the object in the .xur tree
//               (children before their parent, the XuiCanvas root last)
// All 14,407 keyed entries in the corpus resolve; a miss here is a bug.
import { parseXus, XusKind, type XusTable } from '@xuiz/index';
import type { XuObject, XuRegistry } from '@xur/index';
import type { AssetIndex, Manifest } from '../assets/AssetIndex';

export const DEFAULT_LOCALE = 'en';

/** True when the locale needs no patching: en ships inside the .xur. */
export const isNativeLocale = (locale: string): boolean =>
  !locale || locale.toLowerCase() === 'en' || locale.toLowerCase().startsWith('en-');

export interface StringPatch { objectId: number; className: string; property: string; from: string; to: string }

export class Strings {
  private readonly tables = new Map<string, XusTable>();

  constructor(private readonly assets: AssetIndex) {}

  private map(): Manifest['strings'] { return this.assets.manifest.strings; }

  /** Every locale the manifest has a table directory for, "root" excluded. */
  locales(pack: string): string[] {
    return Object.keys(this.map()[pack] ?? {}).filter((l) => l !== 'root');
  }

  private path(pack: string, locale: string, file: string): string | undefined {
    return this.map()[pack]?.[locale]?.[file];
  }

  async table(pack: string, locale: string, file: string): Promise<XusTable | null> {
    const key = `${pack}/${locale}/${file}`;
    const cached = this.tables.get(key);
    if (cached) return cached;
    const out = this.path(pack, locale, file);
    if (!out) return null;
    const res = await fetch(this.assets.base + 'assets/' + out);
    if (!res.ok) return null;
    const t = parseXus(new Uint8Array(await res.arrayBuffer()));
    this.tables.set(key, t);
    return t;
  }

  /** A POSITIONAL table's values, in table order; the console indexes these
   *  directly (consoles/dashCSettingsStrings.xus is 601 of them). */
  async stringsByIndex(pack: string, file: string, locale = 'root'): Promise<string[]> {
    const t = await this.table(pack, locale, file) ?? await this.table(pack, 'root', file);
    if (!t) return [];
    if (t.kind !== XusKind.Positional) return t.entries.map((e) => e.value);
    return t.entries.map((e) => e.value);
  }

  /**
   * Patch a parsed scene in place from its sibling locale table. Returns what
   * changed, so a smoke suite can assert on it rather than on pixels.
   */
  async applyLocale(root: XuObject, reg: XuRegistry, pack: string, sceneFile: string, locale: string): Promise<StringPatch[]> {
    if (isNativeLocale(locale)) return [];
    const file = sceneFile.replace(/\.xur$/i, '.xus');
    const t = await this.table(pack, locale, file);
    if (!t || t.kind !== XusKind.Keyed) return [];

    const order = postorder(root);
    const patches: StringPatch[] = [];
    for (const e of t.entries) {
      const ref = e.ref;
      if (!ref) continue;
      const target = order[ref.objectId - 1];   // objectId is 1-based
      if (!target) continue;
      const cls = reg.hierarchy(target.className)[ref.classIndex];
      const def = cls?.props[ref.propIndex];
      if (!def || def.type !== 'string') continue;
      const existing = target.properties.find((p) => p.def.name === def.name && p.def.owner === def.owner);
      const from = typeof existing?.value === 'string' ? existing.value : '';
      if (existing) existing.value = e.value;
      else target.properties.push({ def, value: e.value });
      patches.push({ objectId: ref.objectId, className: target.className, property: `${def.owner}.${def.name}`, from, to: e.value });
    }
    return patches;
  }
}

/** Children before their parent, the root last - the order the keys count in. */
export function postorder(root: XuObject): XuObject[] {
  const out: XuObject[] = [];
  const walk = (o: XuObject) => { o.children.forEach(walk); out.push(o); };
  walk(root);
  return out;
}
