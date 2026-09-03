// controlp/PanelScene.xur - the rig every page in NXE is built out of.
//
// A slot, a Rome panel and an 880x480 legacy page differ only in which scene is
// mounted into the rig and where the rig is placed on the strip [SPEC §1.4].
// The rig itself is five children of one XuiGroup "Panel", all `Show=false`
// until the code binds them [SCENE]:
//
//   ReflectedItems     XuiTextureSurface  512x512 @ (0,-2)   the render target
//   ReflectionShader   XuiShader          @ (0,-2)  reflection.uxfx,
//                                         EffectParams2 = (-1.5, 0.2, 0)
//   Reflection         XuiImage  528x512 @ (-8,1022), Scale (1,-1,1),
//                                SizeMode 2, TextureSurfaceElement=ReflectedItems
//   NonReflectedItems  XuiGroup           512x512 @ (0,-2)
//   Shadow             XuiNineGrid        32x320 @ (465,190), PanelShadow.png,
//                                         Top/BottomOffset 100
//
// WHAT IS EXACT HERE. The mirror geometry is not approximated at all: the
// runtime already applies `Scale` as a CSS scale about `Pivot`, so a
// `Scale=(1,-1,1)` element authored at y=1022 with a 512-tall surface puts the
// mirror line at 1022/2 = 511 - flush with the surface's own bottom edge, which
// is why the reflection starts exactly at the panel's foot. Placing a live
// clone of the surface's subtree inside that element needs no arithmetic of
// ours; the numbers are the file's.
//
// WHAT IS APPROXIMATE, and recorded in PLACEHOLDERS.md:
//
//  * XuiTextureSurface is a real render target on the console. Here it is the
//    subtree itself, and the reflection is a second, live DOM copy of it. A
//    render target FLATTENS its contents before the mirror is drawn, so where
//    two children of a slot overlap with partial alpha the console composites
//    once and we composite twice. No frame in the material separates them.
//  * reflection.uxfx is a compiled ps_2_0/ps_3_0 pair with the uniforms
//    ColorFactor, EffectParams2 and Texture1 [file inspection]. Its job on
//    screen is a fade with depth - the reflection is brightest at the floor
//    line and gone within about half a panel height - so the stand-in is a CSS
//    alpha ramp plus a flat dim, with no distortion and no colour term. The
//    EffectParams2 vector (-1.5, 0.2, 0) is the shader's own float3 constant
//    and is NOT interpreted; it is recorded so a future decode has it.
import { idOf } from '@xur/index';
import { type NodeRecord } from '@runtime/index';

export const PANEL_SCENE = 'controlp/PanelScene.xur';
export const PANEL_SURFACE_SIZE = 512;

/** The rig's own child ids, as the code names them [CODE 0x9248dc64-0x9248dcf0]. */
export const RIG_IDS = {
  scene: '__PanelScene__',
  panel: 'Panel',
  surface: 'ReflectedItems',
  shader: 'ReflectionShader',
  reflection: 'Reflection',
  nonReflected: 'NonReflectedItems',
  shadow: 'Shadow',
} as const;

/**
 * The reflection stand-in. Alpha at the floor line and the fraction of the
 * mirror's height it survives - both chosen to match what the default-theme
 * frames show under the front slot and both APPROXIMATE
 * [FRAME nxe-9199-YrtwSj1f6aY/f0483].
 */
export const REFLECTION_ALPHA = 0.38;
export const REFLECTION_FADE = 0.55;

export interface RigParts {
  surface: NodeRecord | null;
  reflection: NodeRecord | null;
  nonReflected: NodeRecord | null;
  shadow: NodeRecord | null;
  panel: NodeRecord | null;
}

/** Find the rig's five children inside a rendered PanelScene clone. */
export function rigParts(root: NodeRecord): RigParts {
  const out: RigParts = { surface: null, reflection: null, nonReflected: null, shadow: null, panel: null };
  const walk = (n: NodeRecord): void => {
    switch (idOf(n.obj)) {
      case RIG_IDS.panel: out.panel ??= n; break;
      case RIG_IDS.surface: out.surface ??= n; break;
      case RIG_IDS.reflection: out.reflection ??= n; break;
      case RIG_IDS.nonReflected: out.nonReflected ??= n; break;
      case RIG_IDS.shadow: out.shadow ??= n; break;
      default: break;
    }
    n.children.forEach(walk);
  };
  walk(root);
  return out;
}

/**
 * Present the surface's subtree inside the mirrored `Reflection` element.
 *
 * The clone sits at the Reflection box's own local (8, 0): the box is 528 wide
 * at x = -8 and the surface is 512 wide at x = 0, so 8 is where the surface's
 * left edge lands, and 0 is where its TOP edge lands once the -1 y scale has
 * been applied (the flip maps local v to rig 1022 - v, and the surface's top
 * at rig -2 mirrors about the floor line to rig 1022). No offset of ours.
 */
export function mountReflection(surface: NodeRecord, reflection: NodeRecord): HTMLElement {
  const clone = surface.el.cloneNode(true) as HTMLElement;
  // The clone is presentation only: strip the ids so nothing looks it up, and
  // make sure it is visible even though the authored surface is Show=false
  // until the code binds it.
  clone.removeAttribute('data-xui-id');
  clone.dataset['xuiClone'] = RIG_IDS.surface;
  clone.style.left = '8px';
  clone.style.top = '0px';
  clone.style.display = '';
  const wrap = document.createElement('div');
  wrap.dataset['xuiShader'] = 'reflection.uxfx';
  wrap.dataset['xuiPlaceholder'] = 'shader';
  const fade = Math.round(REFLECTION_FADE * 100);
  wrap.style.cssText = [
    'position:absolute', 'left:0', 'top:0', 'width:100%', 'height:100%',
    `opacity:${REFLECTION_ALPHA}`,
    // Local v = 0 IS the floor line (see the header), so the ramp runs from
    // opaque at the top of this box to nothing part way down.
    `-webkit-mask-image:linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) ${fade}%)`,
    `mask-image:linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) ${fade}%)`,
    'pointer-events:none',
  ].join(';');
  wrap.appendChild(clone);
  reflection.el.replaceChildren(wrap);
  reflection.el.style.display = '';
  return wrap;
}
