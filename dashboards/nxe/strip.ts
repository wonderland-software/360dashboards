// A strip inside a PUSHED root scene: the Rome strip behind What's Hot, Xbox
// Essentials, the Live upsell and the Game Library, and the Moby strip behind
// Sign In (M4e).
//
// The home page's strip lives in NxeShell (channel queue, channel swap, the
// eight-slot strip Judge G measured) and is not touched. A pushed root is the
// same mechanism one level down [SPEC §3]: an empty 1280x720 `RomeRootScene` /
// `MobyRootScene` host into which the code puts
//
//   * a `PanelLayer` of `controlpack://PanelScene.xur` rigs hung on the line
//     from `<Prefix>FrontPosition` to `<Prefix>BackPosition` at
//     `k x <Prefix>DefaultSpacing`, culled at `<Prefix>VisiblePanelDistance`
//     (Rome: 96,602 / 480 / 1850; Moby: 96,570 / 505 / 3225 - all from
//     controlp/Variables.xur);
//   * `controlpack://RomeOverlayScene.xur` in an `OverlayLayer` (Rome) or
//     `controlpack://MobyChannelScene.xur` in the `ChannelLayer` (Moby), whose
//     `Description` draws dashStrings[27] "%d of %d" [CODE 0x9248b9a4 /
//     0x92490f2c];
//   * the same `SceneTransitions` group, played `To` when the root comes in and
//     `BackFrom` when it goes (transitions.ts: `To` brings TransitionScene 0->1
//     over 24..34, TransitionChannel -1->0 over 29..59 and TransitionPanel
//     -1->0 over 49..69 - the front panel swings IN about the hinge BEHIND it
//     (foldHinge's negative branch) and the queue row unfolds; `BackFrom` runs
//     them back out).
//
// Left/Right are the `<Prefix>Input*` integrator (Rome has one axis for both;
// physics.ts). What is INFERRED, and said so in the report: that the panels
// behind the front one emerge on the frame `TransitionPanel` returns to 0
// (the rule the home page's B uses, UNFOLD_BEHIND_FRAME), and that a pushed
// root plays `To`/`BackFrom` - XuiScene's ordinary pairing for a scene coming
// over another.
import { idOf } from '@xur/index';
import {
  updateNode, FRAMES_PER_SECOND,
  type AssetIndex, type RenderCtx, type NodeIndex, type NodeRecord, type TimelineEngine, type Skin, type LoadedScene,
} from '@runtime/index';
import { Axis, FoldCascade, passingOpacity } from './physics';
import { pointOnStrip, project, scaleAt, perspectiveCss, type Projection } from './projection';
import type { StripConstants } from './variables';
import { SceneTransitions, foldHinge, hingeTransform, foldOpacity, queueRowTheta, yQuaternion } from './transitions';
import { PANEL_SURFACE_SIZE, rigParts } from './panelRig';
import { formatCounter, renderHtmlText } from './html';

export const ROME_OVERLAY_SCENE = 'controlp/RomeOverlayScene.xur';
export const MOBY_CHANNEL_SCENE = 'controlp/MobyChannelScene.xur';
/** `.rdata` 0x920b1208 / 0x920b1220, fetched at 0x92490ea4-0x92490ecc [CODE]. */
export const ROME_LAYERS = { column: 'ColumnLayer', overlay: 'OverlayLayer', panel: 'PanelLayer', channel: 'ChannelLayer' } as const;

/** `To`'s TransitionPanel ramp ends on its frame 69; the panels behind the
 *  front one emerge once it is square-on [INFER, the home's B rule]. */
export const ROOT_UNFOLD_FRAME = 70;
/** `BackFrom` is 75 frames; the root is torn down after the last one. */
export const ROOT_BACKFROM_FRAMES = 75;

export interface StripPanel {
  scene: string;
  index: number;
  z: number;
  visible: boolean;
  opacity: number;
  theta: number;
  rig: NodeRecord | null;
  wrapper: HTMLElement;
}

export interface StripReport {
  kind: 'rome' | 'moby';
  scene: string;
  panels: { scene: string; z: number; mounted: boolean; visible: boolean; opacity: number; theta: number; screen: { x: number; y: number; s: number } }[];
  cursor: number;
  counter: string;
  counterOpacity: number;
  /** The queue row a Moby root draws (Sign In), or null on a Rome root. */
  channelRow: string | null;
  transitions: ReturnType<SceneTransitions['report']> | null;
  fold: { phase: string; q: number[] };
  inferred: readonly string[];
}

export const STRIP_INFERRED: readonly string[] = [
  'a pushed root plays the SceneTransitions To range on arrival and BackFrom on B: the ordinary XuiScene pairing, INFERRED',
  'the panels behind the front one emerge on the frame To\'s TransitionPanel returns to 0 (frame 70), the rule the home page\'s B uses; INFERRED',
];

export interface StripOpts {
  kind: 'rome' | 'moby';
  scene: string;
  panels: readonly string[];
  constants: StripConstants;
  projection: Projection;
  assets: AssetIndex;
  skin: Skin;
  ctx: RenderCtx;
  nodes: NodeIndex;
  engine: TimelineEngine;
  /** The rendered root scene node the layers go into. */
  root: NodeRecord;
  /** Renders a loaded scene under a node, into an element. */
  renderInto: (host: NodeRecord, scene: LoadedScene, into?: HTMLElement) => NodeRecord | null;
  /** Builds a PanelScene rig with `scene` mounted in its surface. */
  buildRig: (wrapper: HTMLElement, scene: string) => NodeRecord | null;
  load: (sceneId: string) => Promise<LoadedScene | null>;
  /** dashStrings[27], "%d of %d". */
  counterFormat: string | null;
  /** The one queue row a Moby root draws (Sign In); null for a Rome root. */
  channelRow: string | null;
  errors: string[];
}

export class PushedStrip {
  readonly panels: StripPanel[] = [];
  readonly axis: Axis;
  readonly cascade: FoldCascade;
  transitions: SceneTransitions | null = null;
  private layer: HTMLElement | null = null;
  private counterNode: NodeRecord | null = null;
  private queueNode: NodeRecord | null = null;
  private counter = '';
  private counterOpacity = 1;
  private pendingUnfold = false;
  private stopStepper: (() => void) | null = null;
  private wasRunning = false;
  disposed = false;

  private constructor(readonly o: StripOpts) {
    this.axis = new Axis(`${o.kind}-panel`, o.constants.panel);
    this.cascade = new FoldCascade({ ...o.constants, visiblePanels: o.constants.visiblePanelDistance / o.constants.defaultSpacing });
  }

  static async mount(o: StripOpts): Promise<PushedStrip> {
    const s = new PushedStrip(o);
    await Promise.all(o.panels.map((p) => o.load(p)));
    // The transition group, one copy per root: each root scene reads its own.
    s.transitions = await SceneTransitions.mount({ assets: o.assets, skin: o.skin, ctx: o.ctx, nodes: o.nodes, engine: o.engine, host: o.root });
    for (const e of s.transitions.errors) o.errors.push(`strip ${o.scene}: ${e}`);
    // The layers: the authored group where the root has one, a div otherwise
    // (SigninScene authors none; MobyRootScene's code creates them).
    s.layer = s.layerEl(ROME_LAYERS.panel);
    s.layer.style.cssText += ';' + perspectiveCss(o.projection);
    s.layer.dataset['xuiProjection'] = `${o.projection.focal}/${o.projection.centreU}/${o.projection.centreV}`;
    if (o.kind === 'rome') await s.mountOverlay();
    else await s.mountQueue();
    s.axis.set(0);
    s.axis.setBounds(0, Math.max(0, o.panels.length - 1));
    for (const [k, scene] of o.panels.entries()) {
      const wrapper = document.createElement('div');
      wrapper.className = `nxe-panel nxe-${o.kind}-panel`;
      wrapper.style.cssText = `position:absolute;left:0;top:0;width:${PANEL_SURFACE_SIZE}px;height:${PANEL_SURFACE_SIZE}px;transform-origin:0 0`;
      s.layer.insertBefore(wrapper, s.layer.firstChild);
      s.panels.push({ scene, index: k, z: k * o.constants.defaultSpacing, visible: false, opacity: 1, theta: 0, rig: null, wrapper });
    }
    return s;
  }

  private layerEl(id: string): HTMLElement {
    const authored = this.findIn(this.o.root, id);
    if (authored) return authored.el;
    const el = document.createElement('div');
    el.dataset['xuiLayer'] = id;
    el.dataset['xuiPlaceholder'] = `${id} (the root authors no group of that name; the code creates it)`;
    el.style.cssText = 'position:absolute;left:0;top:0;width:1280px;height:720px;pointer-events:none';
    this.o.root.el.appendChild(el);
    return el;
  }

  /** RomeOverlayScene into an OverlayLayer: the "%d of %d" counter at (96,605). */
  private async mountOverlay(): Promise<void> {
    const loaded = await this.o.load(ROME_OVERLAY_SCENE);
    if (!loaded) { this.o.errors.push(`${ROME_OVERLAY_SCENE}: not in the manifest`); return; }
    const el = this.layerEl(ROME_LAYERS.overlay);
    const node = this.o.renderInto(this.o.root, loaded, el);
    if (!node) return;
    this.counterNode = this.findIn(node, 'Description');
  }

  /** MobyChannelScene into the ChannelLayer: one queue row and the counter. */
  private async mountQueue(): Promise<void> {
    const loaded = await this.o.load(MOBY_CHANNEL_SCENE);
    if (!loaded) { this.o.errors.push(`${MOBY_CHANNEL_SCENE}: not in the manifest`); return; }
    const el = this.layerEl(ROME_LAYERS.channel);
    const node = this.o.renderInto(this.o.root, loaded, el);
    if (!node) return;
    this.queueNode = node;
    const queue = this.findIn(node, 'Queue');
    if (queue) queue.el.style.cssText += ';' + perspectiveCss(this.o.projection);
    for (const row of ['Next6', 'Next5', 'Next4', 'Next3', 'Next2', 'Next1', 'Prev1']) {
      const n = this.findIn(node, row);
      if (n) { n.overrides.set('Text', ''); n.overrides.set('Opacity', 0); updateNode(n, ['Text', 'Opacity']); }
    }
    const cur = this.findIn(node, 'Current');
    if (cur) { cur.overrides.set('Text', this.o.channelRow ?? ''); updateNode(cur, ['Text']); }
    this.counterNode = this.findIn(node, 'Description');
  }

  /** Play `To`: the root comes in folded and unfolds. */
  arrive(): void {
    this.cascade.reset(this.panels.length, true, 0);
    this.transitions?.play('to');
    this.pendingUnfold = true;
    this.stopStepper?.();
    this.stopStepper = this.o.engine.addStepper(() => this.step(1 / FRAMES_PER_SECOND));
    this.place();
  }

  /** Arrive without motion (`?page=` on a root): parked on `To`'s last frame. */
  settle(): void {
    this.cascade.reset(this.panels.length, false, 0);
    this.transitions?.settle('to');
    this.stopStepper?.();
    this.stopStepper = this.o.engine.addStepper(() => this.step(1 / FRAMES_PER_SECOND));
    this.place();
  }

  /** Play `BackFrom`: the strip folds and the root fades; returns the frames to wait. */
  leave(): number {
    this.cascade.fold(Math.round(this.axis.cursor));
    this.transitions?.play('backFrom');
    this.place();
    return ROOT_BACKFROM_FRAMES;
  }

  movePanel(dir: -1 | 1): boolean {
    if (this.transitions?.running) return false;
    return this.axis.nudge(dir);
  }

  get running(): boolean { return this.transitions?.running ?? false; }

  private step(dt: number): void {
    if (this.disposed) return;
    const moving = this.axis.step(dt);
    const folding = this.cascade.step(dt);
    const running = this.transitions?.running ?? false;
    const frame = this.transitions?.frame ?? null;
    if (this.pendingUnfold && frame !== null && frame >= ROOT_UNFOLD_FRAME) {
      this.pendingUnfold = false;
      this.cascade.unfold(Math.round(this.axis.cursor));
    }
    if (moving || folding || running || this.wasRunning) this.place();
    this.wasRunning = running;
  }

  /** Where every panel sits now: the cursor, the cascade, the hinge, the fade. */
  place(): void {
    const c = this.o.constants;
    const spacing = c.defaultSpacing;
    const cursor = this.axis.cursor;
    const front = Math.round(cursor);
    const panelV = this.transitions?.value('TransitionPanel') ?? 0;
    const sceneV = this.transitions?.value('TransitionScene') ?? 1;
    const channelV = this.transitions?.value('TransitionChannel') ?? 0;
    for (const p of this.panels) {
      const d = this.cascade.depth(p.index, cursor);
      const z = d * spacing;
      p.z = z;
      const foldOp = p.index > front ? this.cascade.opacity(p.index) : 1;
      const theta = p.index === front && cursor === front ? panelV * (Math.PI / 2) : 0;
      p.theta = theta;
      const opacity = foldOp * passingOpacity(z / spacing) * foldOpacity(theta);
      p.opacity = Number(opacity.toFixed(4));
      // Mounted by DISTANCE (the home strip's rule), drawn only while the fold
      // and the hinge leave it something to draw: a rig that exists while it
      // is still folded away is what the legend hoists from on arrival.
      const inReach = z <= c.visiblePanelDistance && z > -spacing;
      const visible = inReach && opacity > 1e-3;
      p.visible = visible;
      p.wrapper.style.display = visible ? '' : 'none';
      if (inReach && !p.rig) { p.rig = this.o.buildRig(p.wrapper, p.scene); }
      else if (!inReach && p.rig) { this.unmountRig(p); }
      if (!visible) continue;
      const pt = pointOnStrip(c.frontPosition, c.backPosition, z);
      let transform = `translate3d(${pt.x}px, ${pt.y - PANEL_SURFACE_SIZE}px, ${-z}px)`;
      if (theta !== 0) {
        const h = hingeTransform(theta);
        transform += ` ${h.transform}`;
        p.wrapper.style.transformOrigin = h.origin;
      } else if (p.wrapper.style.transformOrigin !== '0px 0px') {
        p.wrapper.style.transformOrigin = '0 0';
      }
      p.wrapper.style.transform = transform;
      p.wrapper.style.opacity = opacity < 1 ? String(opacity) : '';
      p.wrapper.dataset['nxeZ'] = z.toFixed(1);
      p.wrapper.dataset['nxeScale'] = scaleAt(this.o.projection, z).toFixed(4);
      p.wrapper.dataset['nxeTheta'] = theta.toFixed(4);
      const pr = project(this.o.projection, { x: pt.x, y: pt.y, z });
      p.wrapper.dataset['nxeScreen'] = `${pr.x.toFixed(1)},${pr.y.toFixed(1)}`;
    }
    if (this.layer) this.layer.style.opacity = sceneV < 1 ? String(Math.max(0, sceneV)) : '';
    this.placeQueue(channelV);
    this.refreshCounter(channelV);
  }

  /** The one queue row of a Moby root, folded by TransitionChannel [CODE 0x9248b7a8]. */
  private placeQueue(p: number): void {
    const node = this.queueNode;
    if (!node) return;
    const cur = this.findIn(node, 'Current');
    if (!cur) return;
    const theta = queueRowTheta(p, 6);
    cur.overrides.set('Opacity', foldOpacity(theta));
    if (theta !== 0) {
      cur.overrides.set('Rotation', yQuaternion(theta));
      cur.overrides.set('Pivot', foldHinge(theta));
    } else {
      cur.overrides.delete('Rotation');
      cur.overrides.delete('Pivot');
    }
    updateNode(cur, ['Opacity', 'Rotation', 'Pivot']);
    const marker = this.findIn(node, 'Marker1');
    if (marker) { marker.overrides.set('Opacity', 1 - Math.min(1, Math.abs(p))); updateNode(marker, ['Opacity']); }
  }

  private refreshCounter(p: number): void {
    const total = this.panels.length;
    const shown = total ? Math.min(total, Math.max(1, Math.round(this.axis.cursor) + 1)) : 0;
    const dim = 1 - Math.min(1, Math.abs(p));
    this.counterOpacity = Number(dim.toFixed(4));
    if (this.o.counterFormat === null) return;
    const html = formatCounter(this.o.counterFormat, shown, total);
    const text = html.replace(/<[^>]*>/g, '').trim();
    if (!this.counterNode) { this.counter = text; return; }
    if (text !== this.counter) {
      this.counter = text;
      this.counterNode.el.replaceChildren(renderHtmlText(html).el);
    }
    this.counterNode.overrides.set('Opacity', dim);
    updateNode(this.counterNode, ['Opacity']);
  }

  /** The front panel's rendered scene node (what the legend hoists from). */
  frontSceneNode(): NodeRecord | null {
    const rig = this.panels[Math.round(this.axis.cursor)]?.rig;
    if (!rig) return null;
    return rigParts(rig).surface?.children[0] ?? null;
  }

  frontScene(): string | null {
    return this.panels[Math.round(this.axis.cursor)]?.scene ?? null;
  }

  private unmountRig(p: StripPanel): void {
    if (!p.rig) return;
    for (const id of this.o.nodes.removeSubtree(p.rig)) this.o.engine.remove(id);
    p.wrapper.replaceChildren();
    p.rig = null;
  }

  dispose(): void {
    this.disposed = true;
    this.stopStepper?.();
    this.stopStepper = null;
    for (const p of this.panels) { this.unmountRig(p); p.wrapper.remove(); }
  }

  report(): StripReport {
    const c = this.o.constants;
    return {
      kind: this.o.kind,
      scene: this.o.scene,
      panels: this.panels.map((p) => {
        const pt = pointOnStrip(c.frontPosition, c.backPosition, p.z);
        const pr = project(this.o.projection, { x: pt.x, y: pt.y, z: p.z });
        return {
          scene: p.scene, z: Number(p.z.toFixed(2)), mounted: p.rig !== null, visible: p.visible,
          opacity: p.opacity, theta: Number(p.theta.toFixed(4)),
          screen: { x: Number(pr.x.toFixed(2)), y: Number(pr.y.toFixed(2)), s: Number(pr.s.toFixed(4)) },
        };
      }),
      cursor: Number(this.axis.cursor.toFixed(4)),
      counter: this.counter,
      counterOpacity: this.counterOpacity,
      channelRow: this.o.channelRow,
      transitions: this.transitions?.report() ?? null,
      fold: { phase: this.cascade.phase, q: this.cascade.q.map((v) => Number(v.toFixed(4))) },
      inferred: STRIP_INFERRED,
    };
  }

  private findIn(root: NodeRecord, id: string): NodeRecord | null {
    let found: NodeRecord | null = null;
    const go = (n: NodeRecord): void => {
      if (found) return;
      if (idOf(n.obj) === id) { found = n; return; }
      n.children.forEach(go);
    };
    go(root);
    return found;
  }
}
