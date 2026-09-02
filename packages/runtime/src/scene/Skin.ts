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

/**
 * Three levels, resolved in order and never pre-merged, so a miss is still a
 * miss and gets recorded rather than faked:
 *
 *   1. scene-local  - visuals the scene itself defines
 *   2. blade skin   - dashskn1/2 BladeSkin.xur, a THEME OVERLAY registered by
 *                     the console under the prefix L"dashSkin" and only when a
 *                     signed-in dash user has a non-zero DASHUSER:\DashStyle
 *   3. base skin    - dashuisk/skin.xur, registered in the default namespace
 *
 * The console's lookup builds prefix+name, tries it, and on failure retries the
 * BARE name - which is why no scene in the corpus writes a "dashSkin://" path
 * and why the base skin has to carry a complete blade palette of its own. It
 * does: blade_{1..5}_{bgcolor,highlight,jewel}, wing, content_panel and
 * content_panel_2 are all in dashuisk/skin.xur.
 */
export class VisualScope {
  constructor(
    private readonly local: Map<string, XuObject>,
    private readonly skin: Skin,
    private readonly theme?: Skin,
  ) {}
  resolve(name: string): XuObject | undefined {
    return this.local.get(name) ?? this.theme?.resolveVisual(name) ?? this.skin.resolveVisual(name);
  }
  /** Which layer answered, for telemetry and for the honesty row. */
  layerOf(name: string): 'scene' | 'theme' | 'base' | null {
    if (this.local.has(name)) return 'scene';
    if (this.theme?.resolveVisual(name)) return 'theme';
    if (this.skin.resolveVisual(name)) return 'base';
    return null;
  }
}

/**
 * DASHUSER:\DashStyle picks the blade skin: 0 = none (the default, and what
 * the reference footage shows - the console in it has no dash user, so the
 * loader bails before it formats the path and the dashSkin package is
 * explicitly unregistered), 1 = dashskn1, 2 = dashskn2.
 */
export const BLADE_SKINS: Readonly<Record<number, string>> = {
  1: 'dashskn1/BladeSkin.xur',
  2: 'dashskn2/BladeSkin.xur',
};
export const DEFAULT_DASH_STYLE = 0;

export async function loadBladeSkin(assets: AssetIndex, style: number): Promise<Skin | undefined> {
  const path = BLADE_SKINS[style];
  return path ? Skin.load(assets, path) : undefined;
}
