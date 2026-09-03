// Which dashboard build the runtime is serving.
//
// Everything that differs between builds and is NOT read out of the scene data
// lives here, in one table, so a module can ask `activeBuild()` instead of
// carrying a second copy of a constant. Three things actually differ:
//
//  1. the class REGISTRY (packages/xur/extensions/<build>/registry.json), which
//     is generated from that build's own dash.xex;
//  2. the canvas -> framebuffer VIEW TRANSFORM. Blades 6770 draws a 1120x770
//     canvas through the console's anisotropic 8/7 x 12/11 mapping (MEASURED,
//     18 landmarks, LEARNINGS "Screen mapping"). NXE 9199 does not: its shell
//     scenes ARE 1280x720 and land 1:1 on the output, MEASURED on three
//     landmarks in the default-theme footage - the front Moby slot's own edges
//     (left 95.3, right 515.6, top 248.0, bottom 568.0 against an authored
//     420x320 at (96,568)), all within 0.7 px of authored, so sx = sy = 1 and
//     there is no offset [FRAME nxe-9199-YrtwSj1f6aY/f0483];
//  3. the GLYPH counter-scale, which is a consequence of (2): the console
//     rasterises glyphs isotropically at the canvas's HORIZONTAL scale, so a
//     Blades text node carries scaleY(21/22) to undo the view transform's
//     extra vertical stretch. With an identity view transform there is nothing
//     to undo, so NXE's is 1.
//
// The active build is set ONCE, by the app, before anything renders. It is a
// module-level value rather than a parameter threaded through every call
// because the class registry already was one; making the registry build-aware
// and leaving the rest global would be worse.
import * as E from './xuiEnums';

export type BuildId = '6770' | '9199';

export const BUILDS: readonly BuildId[] = ['6770', '9199'];
export const DEFAULT_BUILD: BuildId = '6770';

export interface BuildProfile {
  id: BuildId;
  /** What the dashboard root's canvas is, when a scene does not say. */
  canvas: { width: number; height: number };
  /** design -> framebuffer. sx/sy scale, ox/oy translate, in framebuffer px. */
  view: { sx: number; sy: number; ox: number; oy: number };
  /** Vertical counter-scale on text, see the header. */
  glyphAspect: number;
  /** The shared visual bank. Both builds ship it at the same path. */
  skin: string;
  /** Human label for the telemetry and the gallery header. */
  label: string;
  /** Dispatch XuiNineGrid to its renderer. FALSE on 6770 only because no scene
   *  in that corpus carries one - the gate is a promise that Blades cannot
   *  change, not a capability difference. */
  renderNineGrid: boolean;
}

export const BUILD_PROFILES: Readonly<Record<BuildId, BuildProfile>> = {
  '6770': {
    id: '6770',
    canvas: { width: E.DASHBOARD_CANVAS.width, height: E.DASHBOARD_CANVAS.height },
    view: E.VIEW_TRANSFORM,
    glyphAspect: E.GLYPH_ASPECT,
    skin: 'dashuisk/skin.xur',
    label: 'Blades 6770',
    renderNineGrid: false,
  },
  '9199': {
    id: '9199',
    // homepage/homepage.xur, controlp/LegendScene.xur, controlp/AuraScene.xur
    // and every other shell scene declare a 1280x720 XuiCanvas [SCENE].
    canvas: { width: E.FRAMEBUFFER.width, height: E.FRAMEBUFFER.height },
    view: { sx: 1, sy: 1, ox: 0, oy: 0 },
    glyphAspect: 1,
    skin: 'dashuisk/skin.xur',
    label: 'NXE 9199',
    renderNineGrid: true,
  },
};

let active: BuildId = DEFAULT_BUILD;

/** Set before any scene is loaded or rendered. */
export function setActiveBuild(id: BuildId): void { active = id; }
export function activeBuildId(): BuildId { return active; }
export function activeBuild(): BuildProfile { return BUILD_PROFILES[active]; }

/** Parse a ?build= value; anything unknown falls back to Blades, loudly. */
export function parseBuild(v: string | null | undefined): { build: BuildId; error: string | null } {
  if (!v) return { build: DEFAULT_BUILD, error: null };
  if ((BUILDS as readonly string[]).includes(v)) return { build: v as BuildId, error: null };
  return { build: DEFAULT_BUILD, error: `?build=${v} is not one of ${BUILDS.join(', ')}` };
}
