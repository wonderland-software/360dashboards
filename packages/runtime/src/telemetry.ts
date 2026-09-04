// window.__dash: what the renderer met and what it could not honour.
// Nothing is ever dropped silently; anything approximate lands here.

export interface SceneReport {
  scene: string;
  controls: number;
  objects: number;
  unknownClasses: string[];
  /** Classes rendered as a plain container because their content is filled by
   *  console code we have not written yet (lists, video, gamercard). */
  runtimeDrivenClasses: string[];
  /** Classes drawn as a faithful container because their real behaviour is a
   *  GPU feature (perspective, render-to-texture, shaders, avatars). Their
   *  children ARE rendered and the class IS recorded; nothing is dropped. */
  approximatedClasses: string[];
  unresolvedVisuals: string[];
  missingImages: string[];
  /** file:// paths the console read off a disc or memory unit. */
  deviceFiles: string[];
  /** ImagePaths that name a SCENE (.xur), not a bitmap: XUI can render a scene
   *  to a texture and use it as an image. Not implemented in M1, and not a
   *  missing file - the scene is in the manifest. */
  sceneTextures: string[];
  unknownTextStyleBits: number[];
  unverifiedBlendModes: number[];
  /** Elements with a non-normal BlendMode under an ancestor with opacity < 1:
   *  CSS isolates the blend there, the console does not. */
  blendIsolated: string[];
  /** Visuals whose resting state hides more than half their children, i.e. the
   *  chrome only appears once console code plays a transition into it. */
  codeDrivenStates: { visual: string; state: string; frame: number; hidden: number; total: number }[];
  /** True when everything the scene draws is invisible at rest (Show=false or
   *  Opacity 0 all the way down) - the blades root does this until the glue
   *  drives its tabs. */
  invisibleAtRest: boolean;
  /** Named children of the scene root that draw nothing at rest. dashmain's
   *  Tab1..Tab6 are all Opacity 0 until console code opens a blade, which is
   *  why the default route shows only the blade-skin background. */
  invisibleGroups: string[];
  /** The scene's own XuiCanvas size; NOT always 1120x770. */
  canvas: { w: number; h: number };
  sizeModesSeen: number[];
  dataAssociationsSeen: number[];
  errors: string[];
}

export interface TimelineReport {
  scopes: { id: string; tick: number; playing: boolean; range: string | null; state: string | null; entries: number; lastCue: string | null }[];
  playing: number;
  frozenAt: number | null;
  /** Timeline frames stepped in the last second; 60 is the console's rate. */
  fps: number;
}

export interface DashTelemetry extends SceneReport {
  build: string;
  placeholders: string[];
  gallery: SceneReport[];
  fps: number;
  timeline: TimelineReport;
  /** The Id of the element that currently has focus, or null. */
  focusId: string | null;
  /** The last sound cue fired, and the whole log with the tick it fired on. */
  lastCue: string | null;
  cues: { cue: string; scope: string | null; tick: number; played: boolean }[];
  /** Buttons the router dispatched, newest last. */
  input: { button: string; repeat: boolean; layer: string | null }[];
  /** Touch gestures read on a phone or tablet, newest last, with the pad
   *  button each one sent (packages/runtime/src/input/Touch.ts). Empty on a
   *  machine nobody touched. */
  touch: { gesture: string; button: string | null }[];
  /** The rotate-to-landscape overlay: whether it is up, and what decided it
   *  (app/orientation.ts). `handheld` is false on a desktop window that merely
   *  happens to be tall, which is why the overlay never covers one. */
  orientation: { portrait: boolean; handheld: boolean; overlay: boolean; canLock: boolean };
  /** The Blades shell's state, on the default route only. */
  shell: unknown;
  /** The NXE shell's state, on ?build=9199 only. */
  nxe: unknown;
  locale: string;
  /** What applyLocale actually changed, for the locale smoke check. */
  localePatches: number;
  /** Live singletons, so a leaked one is visible instead of merely felt.
   *  Every count is 1 (or 0) on a healthy page however many times the app has
   *  been mounted; see app/main.ts's teardown and __dashApi.remount(). */
  hmr: { mounts: number; viewports: number; inputRouters: number; audioContexts: number; clocks: number };
}

declare global {
  interface Window { __dash: DashTelemetry }
}

export function emptyReport(scene = ''): SceneReport {
  return {
    scene, controls: 0, objects: 0,
    unknownClasses: [], runtimeDrivenClasses: [], approximatedClasses: [], unresolvedVisuals: [],
    missingImages: [], deviceFiles: [], sceneTextures: [], unknownTextStyleBits: [],
    unverifiedBlendModes: [], blendIsolated: [], codeDrivenStates: [],
    invisibleAtRest: false, invisibleGroups: [], canvas: { w: 0, h: 0 },
    sizeModesSeen: [], dataAssociationsSeen: [], errors: [],
  };
}

export function createTelemetry(build: string): DashTelemetry {
  const t: DashTelemetry = {
    ...emptyReport(), build, placeholders: [], gallery: [], fps: 0,
    timeline: { scopes: [], playing: 0, frozenAt: null, fps: 0 },
    focusId: null, lastCue: null, cues: [], input: [], touch: [], shell: null, nxe: null,
    orientation: { portrait: false, handheld: false, overlay: false, canLock: false },
    locale: 'en', localePatches: 0,
    hmr: { mounts: 0, viewports: 0, inputRouters: 0, audioContexts: 0, clocks: 0 },
  };
  window.__dash = t;
  return t;
}

/** Fold a scene's report into the live top-level view. */
export function publish(t: DashTelemetry, r: SceneReport): void {
  Object.assign(t, r);
}

export function note(list: string[], v: string): void {
  if (v && !list.includes(v)) list.push(v);
}
export function noteNum(list: number[], v: number): void {
  if (!list.includes(v)) list.push(v);
}

/** A frame counter, so a judge can see the page is not wedged. Returns the
 *  stop handle: an unstopped meter is a leaked rAF loop on every remount. */
export function startFpsMeter(t: DashTelemetry): () => void {
  let frames = 0;
  let last = performance.now();
  let raf = 0;
  let stopped = false;
  const tick = () => {
    frames++;
    const now = performance.now();
    if (now - last >= 1000) { t.fps = Math.round((frames * 1000) / (now - last)); frames = 0; last = now; }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => { if (stopped) return; stopped = true; cancelAnimationFrame(raf); };
}
