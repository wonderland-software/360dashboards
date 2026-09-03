// controlp/Variables.xur: the thirty-five constants the NXE shell's motion and
// layout are built out of.
//
// This is not a config file we invented a schema for. `Variables.xur` is a
// 320x320 XuiScene with ClassOverride="VariablesScene" (registered 0x9248926c)
// whose only children are 35 XuiVariables - the ONLY XuiVariables in the whole
// build [SCENE, class census]. The console looks each one up BY NAME through a
// contiguous 43-entry table of wide-string pointers at .rdata
// 0x927f7108-0x927f71b0, which also names the four SceneTransitions entries and
// the eight Sound* cues [CODE].
//
// So the names below are the console's own strings, and the values are read out
// of the file at runtime rather than copied here. Nothing is hard-coded except
// the names, and a name that the file does not carry is REPORTED.
import { idOf, propByName, type XuObject } from '@xur/index';
import { walk } from '@runtime/index';

export const VARIABLES_SCENE = 'controlp/Variables.xur';

/** The 43 names, in the order they sit in .rdata 0x927f7108..0x927f71b0. */
export const VARIABLE_NAMES: readonly string[] = [
  // 0x927f7108: the four SceneTransitions entries. No object called
  // SceneTransitions exists in any scene in the build, so these resolve
  // somewhere this spec has not found (NXE_GLUE_SPEC §10.4). Listed, unused.
  'SceneTransitions/TransitionScene',
  'SceneTransitions/TransitionSubElements',
  'SceneTransitions/TransitionChannel',
  'SceneTransitions/TransitionPanel',
  // 0x927f7118: the home strip.
  'MobyDefaultSpacing', 'MobyFoldSpeed', 'MobyFoldNextRange', 'MobyUnfoldSpeed',
  'MobyUnfoldEaseRange', 'MobyUnfoldNextRange', 'MobyUnfoldMinSpeed',
  'MobyFrontPosition', 'MobyBackPosition',
  'MobyVisiblePanelDistance', 'MobyVisiblePanelDistanceSD',
  'MobyChannelInputAcceleration', 'MobyChannelInputDeceleration', 'MobyChannelInputMaxVelocity',
  'MobyPanelInputAcceleration', 'MobyPanelInputDeceleration', 'MobyPanelInputMaxVelocity',
  // 0x927f715c: the page strip.
  'RomeDefaultSpacing', 'RomeFoldSpeed', 'RomeFoldNextRange', 'RomeUnfoldSpeed',
  'RomeUnfoldEaseRange', 'RomeUnfoldNextRange', 'RomeUnfoldMinSpeed',
  'RomeFrontPosition', 'RomeBackPosition',
  'RomeVisiblePanelDistance', 'RomeVisiblePanelDistanceSD',
  'RomeInputAcceleration', 'RomeInputDeceleration', 'RomeInputMaxVelocity',
  // 0x927f7194: the eight navigation cues, played by the GLUE (§2.3).
  'SoundButtonBack', 'SoundButtonSelect', 'SoundChannelUp', 'SoundChannelDown',
  'SoundPanelLeft', 'SoundPanelRight', 'SoundPanelFold', 'SoundPanelUnfold',
];

export interface Vec3 { x: number; y: number; z: number }

export interface StripConstants {
  /** Depth between one panel and the next, in z units. */
  defaultSpacing: number;
  foldSpeed: number;
  foldNextRange: number;
  unfoldSpeed: number;
  unfoldNextRange: number;
  unfoldMinSpeed: number;
  /** The front panel's anchor, in screen units at z = 0. */
  frontPosition: Vec3;
  /** Where the strip's line reaches at its own z. */
  backPosition: Vec3;
  visiblePanelDistance: number;
  visiblePanelDistanceSD: number;
}

export class Variables {
  private readonly floats = new Map<string, number>();
  private readonly ints = new Map<string, number>();
  private readonly vectors = new Map<string, Vec3>();
  /** Names in the code's table that the scene does not define. */
  readonly missing: string[] = [];
  /** XuiVariables the scene defines that the code's table does not name. */
  readonly extra: string[] = [];

  constructor(root: XuObject) {
    const seen = new Set<string>();
    walk(root, (o) => {
      if (o.className !== 'XuiVariable') return;
      const id = idOf(o);
      if (!id) return;
      seen.add(id);
      const f = propByName(o, 'FloatVariable')?.value;
      const i = propByName(o, 'IntegerVariable')?.value;
      const v = propByName(o, 'VectorVariable')?.value;
      if (typeof f === 'number') this.floats.set(id, f);
      if (typeof i === 'number') this.ints.set(id, i);
      if (v && typeof v === 'object' && 'x' in v) this.vectors.set(id, v as Vec3);
    });
    for (const n of VARIABLE_NAMES) {
      if (n.includes('/') || n.startsWith('Sound')) continue; // not XuiVariables
      if (!seen.has(n)) this.missing.push(n);
    }
    for (const n of seen) if (!VARIABLE_NAMES.includes(n)) this.extra.push(n);
  }

  float(name: string): number | undefined { return this.floats.get(name); }
  int(name: string): number | undefined { return this.ints.get(name); }
  vector(name: string): Vec3 | undefined { return this.vectors.get(name); }

  /**
   * One strip's constants. `prefix` is "Moby" (the home page) or "Rome" (every
   * page below it). A missing float is a data error, not a default: the whole
   * point of reading them is that the numbers are the console's.
   */
  strip(prefix: 'Moby' | 'Rome'): StripConstants {
    const f = (n: string): number => {
      const v = this.floats.get(prefix + n);
      if (v === undefined) throw new Error(`${VARIABLES_SCENE}: no ${prefix}${n}`);
      return v;
    };
    const v3 = (n: string): Vec3 => {
      const v = this.vectors.get(prefix + n);
      if (!v) throw new Error(`${VARIABLES_SCENE}: no ${prefix}${n}`);
      return v;
    };
    return {
      defaultSpacing: f('DefaultSpacing'),
      foldSpeed: f('FoldSpeed'),
      foldNextRange: f('FoldNextRange'),
      unfoldSpeed: f('UnfoldSpeed'),
      unfoldNextRange: f('UnfoldNextRange'),
      unfoldMinSpeed: f('UnfoldMinSpeed'),
      frontPosition: v3('FrontPosition'),
      backPosition: v3('BackPosition'),
      visiblePanelDistance: f('VisiblePanelDistance'),
      visiblePanelDistanceSD: f('VisiblePanelDistanceSD'),
    };
  }
}

/**
 * The eight navigation cues, by the name the config table gives them. Their
 * files are `controlp/snd_<lowercased tail>.xma`, extracted as .ogg; the bank
 * indexes them by basename. The glue plays these - they are NOT on any
 * timeline, which is the opposite of the Blades rule [SPEC NXE §2.3].
 */
export const SOUND_CUES: Readonly<Record<string, string>> = {
  SoundButtonBack: 'snd_buttonback',
  SoundButtonSelect: 'snd_buttonselect',
  SoundChannelUp: 'snd_channelup',
  SoundChannelDown: 'snd_channeldown',
  SoundPanelLeft: 'snd_panelleft',
  SoundPanelRight: 'snd_panelright',
  SoundPanelFold: 'snd_panelfold',
  SoundPanelUnfold: 'snd_panelunfold',
};
