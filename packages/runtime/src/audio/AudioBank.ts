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

export interface CueEvent { cue: string; scope: string | null; tick: number; t: number; played: boolean }

/**
 * INFERRED. Which cue a control state fires. XuiSoundXAudio children exist in
 * the skin (every button visual has one) but their File property is EMPTY in
 * build 6770 - the console filled it from code - so this table is a reading of
 * the five shrdres cue names against the five states a button can be in, not
 * something the scenes state. It is the one place to correct.
 */
export const STATE_CUES: Readonly<Record<string, string>> = {
  Focus: 'btn_Focus',
  InitFocus: 'btn_Focus',
  Press: 'btn_Select',
  Back: 'btn_Back',
  FocusDisable: 'btn_InactiveFocus',
  InitFocusDisable: 'btn_InactiveFocus',
  PressDisable: 'btn_InactiveSelect',
  NormalSelDisable: 'btn_InactiveSelect',
};

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

  /** The cue a control state fires, or null when that state is silent. */
  cueForState(state: string): string | null {
    const cue = STATE_CUES[state];
    return cue && this.has(cue) ? cue : null;
  }
}
