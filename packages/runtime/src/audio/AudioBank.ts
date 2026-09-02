// The dashboard's sound cues.
//
// The XMA sounds were converted to .ogg by tools/convert-audio.ts and land at
// public/assets/6770/audio/<pack>/<name>.ogg. There are 16 of them:
//   shrdres   btn_Focus, btn_Select, btn_Back, btn_InactiveFocus, btn_InactiveSelect
//   dashmain  dash_BladeSwitch_1..4, dash_BladeLand, dash_2ndLevelOpen/Close,
//             dash_3rdLevelOpen/Close, dash_Blink
//   dashcomm  tab_Switch
//
// A cue is named by its file's basename, so "btn_Focus" is the cue and the
// bank finds it in whichever pack holds it.
import type { AssetIndex } from '../assets/AssetIndex';
import type { TimelineEngine } from '../anim/TimelineEngine';

export interface CueEvent { cue: string; scope: string | null; tick: number; t: number; played: boolean; missing?: boolean }

/**
 * A cue is the basename of a XuiSoundXAudio.File value: "sharedres://btn_Focus.xma"
 * and "dash_BladeSwitch_1.xma" both name the file the bank holds. The File
 * tracks are NOT empty in build 6770 (an earlier note here said they were):
 * btn_1line_icon sets btn_Focus.xma on its Focus frame and btn_Select.xma on
 * Press, legend_B sets btn_Back.xma on frame 2 of its Press range, and the
 * four emitters under RootScene carry every blade and level cue. So the
 * engine's onCue reports each keyframe and this bank plays it; no table maps
 * a state name to a sound.
 */
export function cueName(file: string): string {
  const bare = file.replace(/\\/g, '/');
  const base = bare.slice(bare.lastIndexOf('/') + 1);
  return base.replace(/\.[^.]+$/, '');
}

export class AudioBank {
  private ctx: AudioContext | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly urls = new Map<string, string>();
  private unlocking: (() => void) | null = null;
  readonly log: CueEvent[] = [];
  muted = false;

  private constructor(readonly names: string[]) {}

  /** Index every .ogg the manifest lists, without decoding any of them. */
  static index(assets: AssetIndex, muted = false): AudioBank {
    const urls = new Map<string, string>();
    for (const pack of assets.manifest.packs) {
      for (const e of pack.entries) {
        if (e.kind !== 'xma') continue;
        // convert-audio.ts writes <name>.ogg beside the pack's xma entry.
        const name = e.path.replace(/\.[^.]+$/, '');
        urls.set(name, assets.base + 'assets/' + `6770/audio/${pack.name}/${name}.ogg`);
      }
    }
    const bank = new AudioBank([...urls.keys()]);
    for (const [k, v] of urls) bank.urls.set(k, v);
    bank.muted = muted;
    return bank;
  }

  has(cue: string): boolean { return this.urls.has(cue); }

  /**
   * An AudioContext may only start inside a user gesture, so the first click,
   * key or pad press builds it and preloads every cue. Until then play() still
   * logs, which is what the headless suites read.
   */
  unlockOnGesture(target: EventTarget = window): void {
    if (this.ctx || this.unlocking) return;
    const go = () => {
      this.unlocking = null;
      for (const ev of ['pointerdown', 'keydown', 'gamepadconnected']) target.removeEventListener(ev, go);
      void this.start();
    };
    this.unlocking = go;
    for (const ev of ['pointerdown', 'keydown', 'gamepadconnected']) target.addEventListener(ev, go, { once: true });
  }

  async start(): Promise<void> {
    if (this.ctx || this.muted) return;
    this.ctx = new AudioContext();
    await Promise.all([...this.urls].map(async ([name, url]) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        this.buffers.set(name, await this.ctx!.decodeAudioData(await res.arrayBuffer()));
      } catch { /* a cue that will not decode is silent, never fatal */ }
    }));
  }

  /** Fire a cue. `tick` is the timeline frame it fired on, for the log. */
  play(cue: string, scope: string | null = null, tick = -1): CueEvent {
    const ev: CueEvent = { cue, scope, tick, t: Date.now(), played: false };
    const buf = this.buffers.get(cue);
    if (buf && this.ctx && !this.muted) {
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.start();
      ev.played = true;
    }
    this.log.push(ev);
    if (this.log.length > 200) this.log.shift();
    return ev;
  }

  /** Play whatever File keyframes the engine lands on. */
  attach(engine: TimelineEngine): void {
    engine.onCue = (ev) => {
      const cue = cueName(ev.file);
      if (this.has(cue)) this.play(cue, ev.scopeId, ev.tick);
      else this.play(cue, ev.scopeId, ev.tick).missing = true;
    };
  }
}
