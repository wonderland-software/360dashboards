// The design canvas on a modern screen.
//
// Two transforms, and only the second one is ours:
//
//  1. canvas -> framebuffer. The console's own view transform, MEASURED
//     against the reference frames and kept as four numbers in
//     VIEW_TRANSFORM. It is anisotropic (8/7 across, 12/11 down) and it
//     pushes the canvas 64px above the top of the frame, so 110 of the
//     canvas's 770 rows are off the TV. Never letterbox this one.
//  2. framebuffer -> window. A uniform fit, which is the browser's problem
//     and not the console's.
import * as E from '../xuiEnums';

export interface ViewportOptions {
  /**
   * true  - what the console put on the TV: a 1280x720 frame with the
   *         console's anisotropic view transform applied.
   * false - the raw 1120x770 design canvas, so that one pixel of a screenshot
   *         is one design unit. This is what the boot smoke captures.
   */
  consoleView: boolean;
  /** The scene's own canvas size. Only the dashboard root is 1120x770; 61 of
   *  the 245 canvases in the build are something else, and the console's view
   *  transform was measured against the root's size, so applying it to a
   *  345x240 scene texture would be meaningless. */
  canvas?: { w: number; h: number };
  /** Extra uniform zoom on the framebuffer, e.g. 1.5 for a 1920x1080 grab
   *  that overlays a reference frame directly. */
  zoom?: number;
}

export class Viewport {
  readonly stage: HTMLElement;
  readonly canvas: HTMLElement;

  constructor(private readonly host: HTMLElement, private readonly opts: ViewportOptions = { consoleView: false }) {
    this.stage = document.createElement('div');
    this.stage.className = 'xui-stage';
    this.canvas = document.createElement('div');
    this.canvas.className = 'xui-canvas';
    const c = opts.canvas ?? { w: E.DASHBOARD_CANVAS.width, h: E.DASHBOARD_CANVAS.height };
    this.canvas.style.width = `${c.w}px`;
    this.canvas.style.height = `${c.h}px`;
    this.canvas.style.transformOrigin = '0 0';
    this.stage.appendChild(this.canvas);
    this.host.appendChild(this.stage);
    addEventListener('resize', () => this.layout());
    this.layout();
  }

  /** The console's output size in framebuffer pixels. */
  get framebuffer(): { width: number; height: number } {
    const z = this.opts.zoom ?? 1;
    const c = this.opts.canvas ?? { w: E.DASHBOARD_CANVAS.width, h: E.DASHBOARD_CANVAS.height };
    return this.opts.consoleView
      ? { width: E.FRAMEBUFFER.width * z, height: E.FRAMEBUFFER.height * z }
      : { width: c.w, height: c.h };
  }

  /** Resize the stage once the scene's own canvas size is known. */
  setCanvas(c: { w: number; h: number }): void {
    (this.opts as { canvas?: { w: number; h: number } }).canvas = c;
    this.canvas.style.width = `${c.w}px`;
    this.canvas.style.height = `${c.h}px`;
    this.layout();
  }

  layout(): void {
    const fb = this.framebuffer;
    const fit = Math.min(this.host.clientWidth / fb.width, this.host.clientHeight / fb.height) || 1;
    // The console's 16:9 output fills the window uniformly (up or down);
    // only a differently shaped window letterboxes. The screenshot harness
    // passes an explicit zoom and sizes the window itself, so it keeps the
    // stage at 1:1 and lets zoom do the scaling.
    const k = this.opts.zoom && this.opts.zoom !== 1 ? Math.min(fit, 1) : fit;
    this.stage.style.width = `${fb.width}px`;
    this.stage.style.height = `${fb.height}px`;
    this.stage.style.overflow = 'hidden';
    this.stage.style.transformOrigin = '50% 50%';
    this.stage.style.transform = `scale(${k})`;
    if (this.opts.consoleView) {
      const z = this.opts.zoom ?? 1;
      const v = E.VIEW_TRANSFORM;
      this.canvas.style.transform =
        `scale(${z}) translate(${v.ox}px, ${v.oy}px) scale(${v.sx}, ${v.sy})`;
    } else {
      this.canvas.style.transform = '';
    }
  }

  mount(el: HTMLElement): void {
    this.canvas.replaceChildren(el);
  }
}
