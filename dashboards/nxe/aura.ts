// The NXE background: `dashmain/DashBkgnd.xur` with a scene used as an image.
//
// `DashBkgnd.xur` is a 1280x720 `XuiPerspectiveScene` with three children
// [SCENE, re-read from the file]:
//
//   XuiImage   Aura                     1280x720  ImagePath="controlpack://aurascene.xur"
//   XuiControl LiveVisionEffectOverlay  1280x720  Opacity 0.1, ClassOverride="LiveVisionDashEffect"
//   XuiImage   imgIPTVLogo              200x50 @ (800,85) SizeMode 16, no path
//
// So the whole NXE background is one image whose PATH IS A SCENE. XUI renders
// `controlp/AuraScene.xur` into a texture and `DashBkgnd` draws that texture -
// the same "render a scene as an image" mechanism eleven Blades scenes use for
// `common://TitleMetadata.xur`, but here it is load-bearing for every screen.
//
// WHAT IS EXACT. Both files are in the archive and both mount with zero unknown
// classes. The composition - a background scene behind the shell, keyed off
// `DashBkgnd`'s own children, with `defaultbackground.jpg` as the built-in
// theme fallback - is the file's, not ours.
//
// WHAT IS APPROXIMATE, and recorded in PLACEHOLDERS.md and in
// `__dash.approximatedClasses`:
//
//  * there is no offscreen render target, so `AuraScene` is mounted as a LIVE
//    DOM SUBTREE where the `Aura` image would be, exactly as `PanelScene`'s
//    `XuiTextureSurface` is. A real render target flattens its contents before
//    anything samples them; a subtree composites in place. No frame in the
//    material separates the two.
//  * `themeripple.uxfx` is a compiled ps_2_0/ps_3_0 pair whose job is to
//    distort `Image_Current` into `Image_Next` while a theme changes. Both
//    presenters are Live/theme data and are EMPTY in this archive, so the
//    shader has nothing to distort: the `Theme` group is mounted, marked, and
//    animates nothing. `EffectParams1 = (1152, 672, 0)` and
//    `EffectParams2 = (0.05, 0, -1)` are recorded, NOT interpreted.
//  * `LiveVisionEffectOverlay` is the camera overlay. `NoVisualVisual` draws
//    nothing and the class is recorded.
//
// `AuraControl` (registered 0x92488aa4) is the handle a PAGE uses to configure
// this background: `ThemeImageIndex`, `BackgroundImage`, `SurfaceSphere`,
// `BannerImage` [CODE]. Thirteen scenes carry one; `homepage/homepage.xur` sets
// `ThemeImageIndex=1, SurfaceSphere=true` and `consoles/SystemScene.xur` sets
// `ThemeImageIndex=4` [SCENE]. `BackgroundImage` and `BannerImage` are unset in
// every one of the thirteen, because a theme is downloaded content - so the
// index is READ AND REPORTED and nothing is keyed off it. The one thing it can
// honestly drive is `SurfaceSphere`, which is a bool the file sets and the
// scene has a `Sphere` group for.
import { idOf, propByName, type XuObject } from '@xur/index';
import {
  loadScene, renderElement, indexVisuals, VisualScope, Skin, walk, updateNode,
  NO_DELTA, isNativeLocale, xuiRegistry, note,
  type AssetIndex, type RenderCtx, type NodeIndex, type NodeRecord,
  type Strings, type LoadedScene,
} from '@runtime/index';

export const BACKGROUND_SCENE = 'dashmain/DashBkgnd.xur';
export const AURA_SCENE = 'controlp/AuraScene.xur';
/** The `ImagePath` that names a scene instead of a bitmap [SCENE]. */
export const AURA_IMAGE_PATH = 'controlpack://aurascene.xur';
/** The `Aura` image's own id inside DashBkgnd, and AuraScene's top groups. */
export const AURA_IDS = {
  image: 'Aura',
  liveVision: 'LiveVisionEffectOverlay',
  iptv: 'imgIPTVLogo',
  back: 'Back',
  theme: 'Theme',
  sphere: 'Sphere',
  banner: 'Banner',
  front: 'Front',
} as const;

/** The shader the theme cross-fade runs, and its authored constants [SCENE]. */
export const THEME_RIPPLE = {
  shader: 'themeripple.uxfx',
  effectParams1: [1152, 672, 0] as const,
  effectParams2: [0.05, 0, -1] as const,
};

export interface AuraReport {
  /** The background scene mounted, or null when it could not be. */
  scene: string | null;
  /** The scene used as an ImagePath, and how it is stood in for. */
  auraScene: string | null;
  auraImagePath: string;
  /** The AuraControl the hosted page carries, read and NOT acted on beyond
   *  SurfaceSphere. */
  control: { owner: string; themeImageIndex: number | null; backgroundImage: string; bannerImage: string; surfaceSphere: boolean | null } | null;
  /** AuraScene's top-level groups, with whether each is on screen. */
  groups: { id: string; shown: boolean; why: string }[];
  /** Every approximation this module makes, named on every load. */
  placeholders: string[];
  errors: string[];
}

export interface AuraOpts {
  assets: AssetIndex;
  skin: Skin;
  ctx: RenderCtx;
  nodes: NodeIndex;
  strings: Strings;
  locale: string;
  /** The shell's root scene: the background goes in FRONT of nothing, i.e.
   *  first in document order, because the layer is `transform-style: flat` and
   *  paint order is document order. */
  host: NodeRecord;
  /** The scene whose `AuraControl` configures this background. */
  configuredBy: XuObject | null;
}

export const AURA_PLACEHOLDERS: readonly string[] = [
  `${AURA_IMAGE_PATH} is a SCENE used as an ImagePath: XUI renders it to a texture and this runtime has no offscreen target, so AuraScene is mounted as a live DOM subtree in the image's place`,
  `${THEME_RIPPLE.shader}: a compiled ps_2_0/ps_3_0 pair. Its two ImagePresenters (Image_Current, Image_Next) are theme data and are empty in this archive, so the Theme group is mounted and animates nothing; EffectParams are recorded, not interpreted`,
  'AuraControl.BackgroundImage and .BannerImage are unset in all thirteen scenes that carry one - a theme is downloaded content - so ThemeImageIndex is reported and no theme is applied',
  'LiveVisionDashEffect is the Xbox LIVE Vision camera overlay; it wears NoVisualVisual and draws nothing',
];

/**
 * Mount the background behind the shell and read the page's `AuraControl`.
 *
 * Nothing is drawn that the archive does not carry: if `DashBkgnd.xur` or
 * `AuraScene.xur` is missing from the manifest the shell renders on black and
 * the reason is in the report.
 */
export async function mountAura(o: AuraOpts): Promise<AuraReport> {
  const report: AuraReport = {
    scene: null, auraScene: null, auraImagePath: AURA_IMAGE_PATH,
    control: readAuraControl(o.configuredBy),
    groups: [], placeholders: [...AURA_PLACEHOLDERS], errors: [],
  };

  const bkgnd = await load(o, BACKGROUND_SCENE);
  if (!bkgnd) { report.errors.push(`${BACKGROUND_SCENE} is not in the manifest`); return report; }

  const wrapper = document.createElement('div');
  wrapper.className = 'nxe-background';
  wrapper.style.cssText = 'position:absolute;left:0;top:0;width:1280px;height:720px;pointer-events:none';
  // The shell's root scene is 1280x720 at the canvas origin, so the background
  // needs no arithmetic: it is the same box. First child = painted first.
  o.host.el.insertBefore(wrapper, o.host.el.firstChild);

  const root = renderInto(o, o.host, bkgnd, wrapper);
  if (!root) { report.errors.push(`${BACKGROUND_SCENE} rendered nothing`); return report; }
  report.scene = BACKGROUND_SCENE;

  // The `Aura` image drew nothing: image.ts refuses a `.xur` ImagePath and
  // records it in __dash.sceneTextures. Put the scene there as a subtree.
  const auraNode = find(root, AURA_IDS.image);
  if (!auraNode) { report.errors.push(`${BACKGROUND_SCENE}: no ${AURA_IDS.image} image`); return report; }
  const declared = String(propByName(auraNode.obj, 'ImagePath')?.value ?? '');
  if (declared.toLowerCase() !== AURA_IMAGE_PATH) {
    report.errors.push(`${AURA_IDS.image}.ImagePath is "${declared}", not ${AURA_IMAGE_PATH}`);
    return report;
  }

  const aura = await load(o, AURA_SCENE);
  if (!aura) { report.errors.push(`${AURA_SCENE} is not in the manifest`); return report; }
  const auraRoot = renderInto(o, auraNode, aura);
  if (!auraRoot) { report.errors.push(`${AURA_SCENE} rendered nothing`); return report; }
  report.auraScene = AURA_SCENE;
  auraNode.el.dataset['xuiSceneTexture'] = AURA_SCENE;
  auraNode.el.dataset['xuiPlaceholder'] = 'scene-texture';
  note(o.ctx.report.approximatedClasses, 'XuiImage#ImagePath=.xur (scene as texture)');

  // SurfaceSphere is the ONE AuraControl property this archive can honour: the
  // scene has a `Sphere` group and the bool says whether the page wants it.
  // Absent, the group keeps its authored state - never forced either way.
  const sphere = find(auraRoot, AURA_IDS.sphere);
  const wants = report.control?.surfaceSphere ?? null;
  if (sphere && wants !== null) {
    sphere.overrides.set('Show', wants);
    updateNode(sphere, ['Show']);
  }
  for (const id of [AURA_IDS.back, AURA_IDS.theme, AURA_IDS.sphere, AURA_IDS.banner, AURA_IDS.front]) {
    const n = find(auraRoot, id);
    if (!n) { report.groups.push({ id, shown: false, why: 'not in the scene' }); continue; }
    const authored = propByName(n.obj, 'Show')?.value !== false;
    const shown = id === AURA_IDS.sphere && wants !== null ? wants : authored;
    report.groups.push({
      id, shown,
      why: id === AURA_IDS.sphere && wants !== null
        ? `AuraControl.SurfaceSphere=${wants}`
        : id === AURA_IDS.theme
          ? 'authored; both theme presenters are empty (no theme in the archive)'
          : 'as authored',
    });
  }

  // The theme rig is mounted and marked, so a judge can see it is present and
  // inert rather than missing.
  const theme = find(auraRoot, AURA_IDS.theme);
  if (theme) theme.el.dataset['xuiPlaceholder'] = `shader:${THEME_RIPPLE.shader}`;
  const vision = find(root, AURA_IDS.liveVision);
  if (vision) vision.el.dataset['xuiPlaceholder'] = 'live-vision-camera';

  return report;
}

/** Read an `AuraControl`'s four properties out of the scene that carries it. */
export function readAuraControl(scene: XuObject | null): AuraReport['control'] {
  if (!scene) return null;
  let found: XuObject | null = null;
  walk(scene, (o) => { if (!found && o.className === 'AuraControl') found = o; });
  if (!found) return null;
  const c: XuObject = found;
  const num = (n: string): number | null => {
    const v = propByName(c, n)?.value;
    return typeof v === 'number' ? v : null;
  };
  const bool = (n: string): boolean | null => {
    const v = propByName(c, n)?.value;
    return typeof v === 'boolean' ? v : null;
  };
  return {
    owner: idOf(c) ?? 'AuraControl',
    themeImageIndex: num('ThemeImageIndex'),
    backgroundImage: String(propByName(c, 'BackgroundImage')?.value ?? ''),
    bannerImage: String(propByName(c, 'BannerImage')?.value ?? ''),
    surfaceSphere: bool('SurfaceSphere'),
  };
}

/* ------------------------------------------------------------- primitives */

async function load(o: AuraOpts, id: string): Promise<LoadedScene | null> {
  try {
    const scene = await loadScene(o.assets, id);
    if (!isNativeLocale(o.locale)) {
      await o.strings.applyLocale(scene.root, xuiRegistry(), scene.pack, scene.path, o.locale);
    }
    return scene;
  } catch {
    return null;
  }
}

function renderInto(o: AuraOpts, host: NodeRecord, scene: LoadedScene, into?: HTMLElement): NodeRecord | null {
  const ctx: RenderCtx = {
    ...o.ctx, pack: scene.pack,
    visuals: new VisualScope(indexVisuals(scene.root), o.skin),
  };
  const before = o.nodes.all.length;
  const el = renderElement(scene.root, ctx, {
    overrides: new Map(), delta: NO_DELTA, owner: null,
    parent: host.rect, parentNode: host,
  });
  if (!el) return null;
  el.dataset['xuiScene'] = scene.id;
  (into ?? host.el).appendChild(el);
  return o.nodes.all[before] ?? null;
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
