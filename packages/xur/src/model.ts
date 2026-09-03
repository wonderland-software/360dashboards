// The XUR object model. Mirrors XUIHelper's XU* classes (GPL-3, see NOTICE)
// in TypeScript-idiomatic form. Browser-safe: plain data, no node imports.

export type XuPropertyType =
  | 'bool' | 'integer' | 'unsigned' | 'float' | 'string'
  | 'color' | 'vector' | 'quaternion' | 'object' | 'custom';

export interface XuPropertyDef {
  id: number;
  name: string;
  type: XuPropertyType;
  /** e.g. ["indexed"], ["noanim","filepath"] */
  flags: string[];
  defaultValue: string | null;
  /** Class that declares this property. */
  owner: string;
  /** True when the definition rests on scene evidence rather than the binary. */
  inferred?: boolean;
  /**
   * Where the definition came from when NOT the runtime's registration code:
   * 'xuitool-xml' = XuiTool's compile-time class definition (XUIHelper's
   * 9199 XML), needed because the scenes' mask-byte counts prove XuiTool
   * knew more properties than the runtime registers.
   */
  origin?: string;
}

export interface XuClassDef {
  name: string;
  base: string | null;
  /** In declaration order: position i is mask bit (i % 8) of mask byte (i / 8). */
  props: XuPropertyDef[];
  source: string;
}

export interface XuRegistryJson {
  version: number;
  group: string;
  classes: XuClassDef[];
}

export interface XuVector { x: number; y: number; z: number }
export interface XuQuaternion { x: number; y: number; z: number; w: number }
export interface XuColour { a: number; r: number; g: number; b: number }
export interface XuPoint { x: number; y: number }
export interface XuBezierPoint { point: XuPoint; control1: XuPoint; control2: XuPoint }
export interface XuFigure { boundingBox: XuPoint; points: XuBezierPoint[] }

/** A single (non-indexed) value. Compound ("object") values are property lists. */
export type XuScalar = boolean | number | string | XuVector | XuQuaternion | XuColour | XuFigure | XuProperty[];
/** Indexed properties (Flags="indexed", e.g. gradient stops) carry one value per index. */
export type XuValue = XuScalar | XuScalar[];

export interface XuProperty {
  def: XuPropertyDef;
  value: XuValue;
}

export type XuNamedFrameCommand = 'Play' | 'Stop' | 'GoTo' | 'GoToAndPlay' | 'GoToAndStop';
export const NAMED_FRAME_COMMANDS: readonly XuNamedFrameCommand[] = ['Play', 'Stop', 'GoTo', 'GoToAndPlay', 'GoToAndStop'];

export interface XuNamedFrame {
  name: string;
  keyframe: number;
  command: XuNamedFrameCommand;
  /** Only GoTo-style commands carry one. */
  target: string | null;
}

export type XuInterpolation = 'Linear' | 'None' | 'Ease';
export const INTERPOLATIONS: readonly XuInterpolation[] = ['Linear', 'None', 'Ease'];

/**
 * One animated slot. `path` is the definition chain from the element's class
 * down to the animated definition (length 1 for a direct property such as
 * Opacity, 3 for Fill > Gradient > StopColor). `index` is the list slot for an
 * indexed definition (a gradient stop), else null.
 */
export interface XuTrack {
  path: XuPropertyDef[];
  def: XuPropertyDef;
  index: number | null;
}

export interface XuKeyframe {
  keyframe: number;
  interpolation: XuInterpolation;
  easeIn: number;
  easeOut: number;
  easeScale: number;
  /** One value per track, in track order. */
  values: XuScalar[];
  /**
   * XUR v8 only: the KEYD record's flag byte as stored (low six bits = the
   * console's keyframe TYPE 0..0xc, top two bits a separate field), the
   * VECT index types 7/0xa/0xb/0xc carry, and that vector (see parse8.ts,
   * "KEYD flag byte"). Kept raw so the meaning of each type is a separate,
   * checkable claim.
   */
  flags8?: number;
  extra8?: number | null;
  curve8?: XuVector;
}

export interface XuTimeline {
  /** Id of the child element this timeline animates. */
  elementId: string;
  tracks: XuTrack[];
  keyframes: XuKeyframe[];
}

export interface XuObject {
  className: string;
  properties: XuProperty[];
  children: XuObject[];
  namedFrames: XuNamedFrame[];
  timelines: XuTimeline[];
}

export function propByName(o: { properties: XuProperty[] }, name: string): XuProperty | undefined {
  return o.properties.find((p) => p.def.name === name);
}

export function idOf(o: XuObject): string {
  const p = propByName(o, 'Id');
  return typeof p?.value === 'string' ? p.value : '';
}
