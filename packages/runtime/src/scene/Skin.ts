// The skin: 296 XuiVisuals at the root of dashuisk/skin.xur, each a reusable
// look that a XuiControl names in its Visual property. A control renders the
// visual as its own child subtree, sized to the control.
//
// A scene may also define visuals of its own (the blade skins do), so the
// lookup is scene-first, skin-second. A name that is in neither is RECORDED,
// never faked: the whole corpus only ever asks for three that do not exist.
import { idOf, type XuObject } from '@xur/index';
import type { AssetIndex } from '../assets/AssetIndex';
import { loadScene, walk } from './SceneLoader';

export const SKIN_SCENE = 'dashuisk/skin.xur';

export class Skin {
  private constructor(private readonly visuals: Map<string, XuObject>, readonly source: string) {}

  static async load(assets: AssetIndex, id = SKIN_SCENE): Promise<Skin> {
    const s = await loadScene(assets, id);
    return new Skin(indexVisuals(s.root), id);
  }

  static empty(): Skin { return new Skin(new Map(), '(none)'); }

  get size(): number { return this.visuals.size; }
  names(): string[] { return [...this.visuals.keys()]; }
  resolveVisual(name: string): XuObject | undefined { return this.visuals.get(name); }
}

export function indexVisuals(root: XuObject): Map<string, XuObject> {
  const m = new Map<string, XuObject>();
  walk(root, (o) => {
    if (o.className !== 'XuiVisual') return;
    const id = idOf(o);
    // First definition wins: the skin lists a few deprecated duplicates.
    if (id && !m.has(id)) m.set(id, o);
  });
  return m;
}

/** Scene-local visuals take priority over the shared skin. */
export class VisualScope {
  constructor(private readonly local: Map<string, XuObject>, private readonly skin: Skin) {}
  resolve(name: string): XuObject | undefined {
    return this.local.get(name) ?? this.skin.resolveVisual(name);
  }
}
