// Reading one element's properties, with the class defaults filled in and any
// timeline overrides for the current state applied on top.
//
// XUR omits a property whose value equals the class default, so "absent" is a
// real value and every default here is justified in xuiEnums.ts.
import {
  propByName, type XuObject, type XuProperty, type XuColour, type XuVector,
  type XuQuaternion, type XuFigure, type XuScalar,
} from '@xur/index';
import * as E from '../xuiEnums';

/** Timeline overrides, keyed by dotted property path ("Opacity",
 *  "Fill.TextureFileName", "Fill.Gradient.StopColor#2"). */
export type Overrides = ReadonlyMap<string, XuScalar>;
export const NO_OVERRIDES: Overrides = new Map();

export class PropBag {
  constructor(
    private readonly props: readonly XuProperty[],
    private readonly overrides: Overrides,
    private readonly prefix = '',
  ) {}

  static of(o: XuObject, overrides: Overrides = NO_OVERRIDES): PropBag {
    return new PropBag(o.properties, overrides);
  }

  has(name: string): boolean {
    return this.overrides.has(this.prefix + name) || propByName({ properties: this.props as XuProperty[] }, name) !== undefined;
  }

  raw(name: string): XuScalar | undefined {
    const o = this.overrides.get(this.prefix + name);
    if (o !== undefined) return o;
    const p = this.props.find((q) => q.def.name === name);
    if (!p) return undefined;
    return Array.isArray(p.value) && p.def.flags.includes('indexed') ? undefined : (p.value as XuScalar);
  }

  /** An indexed property (gradient stops), with per-index overrides applied. */
  indexed(name: string): XuScalar[] | undefined {
    const p = this.props.find((q) => q.def.name === name);
    let list = p && Array.isArray(p.value) && p.def.flags.includes('indexed') ? (p.value as XuScalar[]).slice() : undefined;
    for (const [k, v] of this.overrides) {
      if (!k.startsWith(this.prefix + name + '#')) continue;
      const ix = Number(k.slice((this.prefix + name + '#').length));
      if (!Number.isFinite(ix)) continue;
      if (!list) list = [];
      list[ix] = v;
    }
    return list;
  }

  /** A compound property (Fill, Stroke, Gradient) as its own bag. */
  compound(name: string): PropBag | undefined {
    const p = this.props.find((q) => q.def.name === name);
    const nested = p && Array.isArray(p.value) && !p.def.flags.includes('indexed')
      ? (p.value as XuProperty[]) : undefined;
    const pfx = this.prefix + name + '.';
    if (!nested) {
      // A timeline can animate into a compound the file never stored.
      for (const k of this.overrides.keys()) if (k.startsWith(pfx)) return new PropBag([], this.overrides, pfx);
      return undefined;
    }
    return new PropBag(nested, this.overrides, pfx);
  }

  num(name: string, dflt: number): number {
    const v = this.raw(name);
    return typeof v === 'number' ? v : dflt;
  }
  bool(name: string, dflt: boolean): boolean {
    const v = this.raw(name);
    return typeof v === 'boolean' ? v : dflt;
  }
  str(name: string, dflt = ''): string {
    const v = this.raw(name);
    return typeof v === 'string' ? v : dflt;
  }
  colour(name: string, dflt: XuColour): XuColour {
    const v = this.raw(name);
    return isColour(v) ? v : dflt;
  }
  vec(name: string, dflt: XuVector): XuVector {
    const v = this.raw(name);
    return isVector(v) ? v : dflt;
  }
  quat(name: string): XuQuaternion | undefined {
    const v = this.raw(name);
    return isQuat(v) ? v : undefined;
  }
  figure(name: string): XuFigure | undefined {
    const v = this.raw(name);
    return isFigure(v) ? v : undefined;
  }
}

function isColour(v: unknown): v is XuColour {
  return !!v && typeof v === 'object' && 'a' in v && 'r' in v;
}
function isVector(v: unknown): v is XuVector {
  return !!v && typeof v === 'object' && 'x' in v && 'z' in v && !('w' in v);
}
function isQuat(v: unknown): v is XuQuaternion {
  return !!v && typeof v === 'object' && 'w' in v && 'x' in v;
}
function isFigure(v: unknown): v is XuFigure {
  return !!v && typeof v === 'object' && 'boundingBox' in v && 'points' in v;
}

/** The geometry every element has, before anchoring. */
export interface Rect { x: number; y: number; w: number; h: number }

export function authoredRect(p: PropBag): Rect {
  const pos = p.vec('Position', { x: 0, y: 0, z: 0 });
  return {
    x: pos.x, y: pos.y,
    w: p.num('Width', E.DEFAULT_WIDTH),
    h: p.num('Height', E.DEFAULT_HEIGHT),
  };
}

export function cssColour(c: XuColour): string {
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${(c.a / 255).toFixed(4)})`;
}
