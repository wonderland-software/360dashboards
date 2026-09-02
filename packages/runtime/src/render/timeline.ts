// The still-frame path: putting a control's visual into one named state before
// the first paint. The arithmetic lives in anim/interp.ts and the playhead in
// anim/TimelineEngine.ts; this file only samples once, at a fixed frame.
//
// DOCUMENTED: a visual's states are named-frame PAIRS on its own timeline -
// Normal..EndNormal, Focus..EndFocus, Press..EndPress. Parking on the state's
// OPENING frame is not cosmetic: legend_Y and legend_X in the Console Settings
// scene are Enabled=false, and only the NormalDisable frame swaps their glyph
// to sharedres://disabled-Button.png at half opacity, which is exactly what the
// 6717 reference frame shows.
import type { XuObject, XuScalar } from '@xur/index';
import { VISUAL_STATE_FALLBACK } from '../xuiEnums';
import { sampleKeyframes } from '../anim/interp';
import { trackKey } from '../anim/TimelineEngine';
import type { Overrides } from './props';

/** The frame a state opens on, following the documented fallback chain. */
export function stateFrame(o: XuObject, state: string): number | null {
  const seen = new Set<string>();
  let s: string | undefined = state;
  while (s && !seen.has(s)) {
    seen.add(s);
    const f = o.namedFrames.find((n) => n.name === s);
    if (f) return f.keyframe;
    s = VISUAL_STATE_FALLBACK[s];
  }
  return null;
}

/** Values of every animated property of `o`'s children at `frame`, by Id. */
export function sampleTimelines(o: XuObject, frame: number): Map<string, Map<string, XuScalar>> {
  const out = new Map<string, Map<string, XuScalar>>();
  for (const tl of o.timelines) {
    if (tl.keyframes.length === 0) continue;
    const at = sampleKeyframes(tl.keyframes, frame);
    let bag = out.get(tl.elementId);
    if (!bag) { bag = new Map(); out.set(tl.elementId, bag); }
    tl.tracks.forEach((t, i) => {
      const v = at[i];
      if (v !== undefined) bag!.set(trackKey(t), v);
    });
  }
  return out;
}

export const NO_SAMPLE: ReadonlyMap<string, Map<string, XuScalar>> = new Map();
export type Sampled = ReadonlyMap<string, Map<string, XuScalar>>;
export function overridesFor(s: Sampled, id: string): Overrides {
  return s.get(id) ?? new Map();
}
