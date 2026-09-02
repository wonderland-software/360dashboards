// The design canvas on a modern screen.
//
// XUI draws in back-buffer pixels: the scene is authored at 1120x770 and the
// title sets a 2D view transform onto the framebuffer. VIEW_TRANSFORM in
// xuiEnums.ts holds that mapping as four tunables (sx, sy, ox, oy) so the
// calibration against the reference frames drops into ONE place. The browser
// then letterboxes the resulting framebuffer uniformly, which is the part that
// is ours and not the console's.
import * as E from '../xuiEnums';

export interface ViewportOptions {
  /** Apply the console's (non-uniform) canvas->framebuffer transform.
   *  Off gives the raw 1120x770 design canvas, which is what the smoke
   *  screenshot captures so that a pixel in the shot is a design unit. */
  consoleView: boolean;
}

export class Viewport {
  readonly stage: HTMLElement;
  readonly canvas: HTMLElement;

  constructor(private readonly host: HTMLElement, private readonly opts: ViewportOptions = { consoleView: false }) {
    this.stage = document.createElement('div');
    this.stage.className = 'xui-stage';
    this.canvas = document.createElement('div');
    this.canvas.className = 'xui-canvas';
    this.canvas.style.width = `${E.CANVAS_WIDTH}px`;
    this.canvas.style.height = `${E.CANVAS_HEIGHT}px`;
    this.stage.appendChild(this.canvas);
    this.host.appendChild(this.stage);
    addEventListener('resize', () => this.layout());
    this.layout();
  }

  /** What the console would have put on screen, in framebuffer pixels. */
  get framebuffer(): { width: number; height: number } {
    return this.opts.consoleView
      ? { width: E.FRAMEBUFFER.width, height: E.FRAMEBUFFER.height }
      : { width: E.CANVAS_WIDTH, height: E.CANVAS_HEIGHT };
  }

  layout(): void {
    const fb = this.framebuffer;
    const k = Math.min(this.host.clientWidth / fb.width, this.host.clientHeight / fb.height) || 1;
    const view = this.opts.consoleView
      ? `translate(${E.VIEW_TRANSFORM.ox}px, ${E.VIEW_TRANSFORM.oy}px) scale(${E.VIEW_TRANSFORM.sx}, ${E.VIEW_TRANSFORM.sy})`
      : '';
    this.stage.style.width = `${fb.width}px`;
    this.stage.style.height = `${fb.height}px`;
    this.stage.style.transform = `scale(${k})`;
    this.canvas.style.transform = view;
  }

  mount(el: HTMLElement): void {
    this.canvas.replaceChildren(el);
  }
}
