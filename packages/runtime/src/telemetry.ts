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
  sizeModesSeen: number[];
  dataAssociationsSeen: number[];
  errors: string[];
}

export interface TimelineReport {
  scopes: { id: string; tick: number; playing: boolean; range: string | null; lastCue: string | null }[];
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
}

declare global {
  interface Window { __dash: DashTelemetry }
}

export function emptyReport(scene = ''): SceneReport {
  return {
    scene, controls: 0, objects: 0,
    unknownClasses: [], runtimeDrivenClasses: [], unresolvedVisuals: [],
    missingImages: [], deviceFiles: [], sceneTextures: [], unknownTextStyleBits: [],
    unverifiedBlendModes: [], sizeModesSeen: [], dataAssociationsSeen: [], errors: [],
  };
}

export function createTelemetry(build: string): DashTelemetry {
  const t: DashTelemetry = {
    ...emptyReport(), build, placeholders: [], gallery: [], fps: 0,
    timeline: { scopes: [], playing: 0, frozenAt: null, fps: 0 },
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

/** A frame counter, so a judge can see the page is not wedged. */
export function startFpsMeter(t: DashTelemetry): void {
  let frames = 0;
  let last = performance.now();
  const tick = () => {
    frames++;
    const now = performance.now();
    if (now - last >= 1000) { t.fps = Math.round((frames * 1000) / (now - last)); frames = 0; last = now; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
