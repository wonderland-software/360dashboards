// Where A goes on the NXE home page, and which curve covers the swap.
//
// ---------------------------------------------------------------------------
// 1. THE COMMAND TABLE
//
// A Moby slot's `<onclick>` is either `KeyDown` (deliver A to the hosted slot
// scene) or `EpixCmd` with a `<cmd>` naming one of the console's navigation
// commands [SCENE, homepage/xbox360channel.xml]. Those command NAMES are a real
// table in the image: 35 `{ char* name, u32 id }` pairs at `.rdata`
// 0x920288a0-0x920289c4, running `EcCreateGamerProfile` = 0 through
// `EcLaunchLocalTitle` = 0x24, immediately followed by the 27-entry Epix id
// table at 0x920289d8 that `epix.ts` already reads [CODE, re-read here].
// `EcNavToSettings` is command **4**.
//
// WHAT IS NOT IN A TABLE is the other half: which `.xur` a command opens. There
// is no pointer array from command id to scene name - a sweep for a reference
// to the `SystemScene.xur` literal at 0x920291a4 finds NONE, so the binding is
// materialised in code (lis/addi) exactly as the slot artwork's is
// (LEARNINGS, "A slot's picture is code, its caption is data").
//
// So this table carries the ONE row that can be evidenced, and every other
// command is REFUSED and reported rather than pointed somewhere plausible:
//
//   EcNavToSettings -> consoles/SystemScene.xur   [INFERRED]
//     * `SystemScene.xur` (0x920291a4) is the only settings destination in the
//       epix-glue literal cluster, which otherwise holds the eleven slot
//       scenes, the four Rome root scenes, `advert.xur`, `blank.xur` and the
//       `%s.xur` format string - and `EcNavToSettings` is the only settings
//       command;
//     * `consoles/SystemScene.xur` is an 880x480 `DashScene` whose
//       `txt_Header` reads "System Settings" and whose seven visible nav rows
//       are exactly what the footage shows after the Settings slot is pressed
//       [FRAME Kpa f0391].
//
// ---------------------------------------------------------------------------
// 2. THE CURVES
//
// `dashuisk/skin.xur` carries eight transition visuals beyond FadeIn/FadeOut,
// and each is a one-timeline proxy whose Opacity/Show track is what XUI applies
// to the scene (LEARNINGS, "XuiScene.TransFrom/TransTo name a CURVE"). Read
// straight out of the 9199 skin:
//
//   LegacyFrom, LegacyBackFrom          1 -> 0 over frames 0..15    (250 ms)
//   LegacyTo, LegacyBackTo              hold 0 to 5, 0 -> 1 to 20   (333 ms)
//   LegacyFromEx, LegacyBackFromEx      1 -> 0 over frames 0..30    (500 ms)
//   LegacyToEx, LegacyBackToEx          hold 0 to 45, 0 -> 1 to 60  (1000 ms)
//
// The code writes the scene's own `TransTo`/`TransFrom`/`TransBackTo`/
// `TransBackFrom` with one of these eight names; the four property names and
// the eight visual names sit in one block at `.text`
// 0x9249229c-0x924923c4 [CODE].
//
// WHICH pair covers a legacy page replacing another is MEASURED now, and it is
// the PLAIN pair [Judge G finding 6]. System Settings -> Console Settings on
// the 29.97 fps cut of the primary capture [FRAME Kpa f05630-05639, 187.67 s]:
// the page region's luma runs 64 -> 75 -> 85 -> 93 -> 98 -> 99 (the outgoing
// page gone in five frames) then 99 -> 96 -> 88 -> 77 -> 67 (the incoming one
// up in five), ten frames = twenty 60 Hz ticks in all, which is LegacyFrom's
// fifteen ticks and LegacyTo's five-tick hold plus fifteen-tick ramp started
// together. The `...Ex` pair would take sixty. M4b-M4c's "the 1.0 s window at
// Kpa 190.06-191.22 rules the plain pair out" measured LIST MOVES on the
// Console Settings page, not a swap, and is withdrawn (PLACEHOLDERS). Where
// the console uses the `...Ex` pair is not observed in the four captures; the
// pair is kept below as the skin's data and is not chosen anywhere.
import type { AssetIndex } from '@runtime/index';

/** `<cmd>` -> the scene it opens. One row, because one row is evidenced. */
export interface NavCommand {
  /** The `.rdata` command id at 0x920288a0.. */
  id: number;
  /** "<pack>/<file>", or null when the destination is not recovered. */
  scene: string | null;
  /** How the row is evidenced, printed in the report. */
  evidence: string;
}

export const EPIX_COMMANDS: Readonly<Record<string, NavCommand>> = {
  EcNavToSettings: {
    id: 4,
    scene: 'consoles/SystemScene.xur',
    evidence: 'INFERRED: the only settings destination in the epix literal cluster (0x920291a4) and the only settings command; the page the footage opens [FRAME Kpa f0391]',
  },
  // Named in the same table and reachable from a My Xbox slot, with no
  // destination this archive binds. A press on one is refused and reported.
  EcNavToGamesLibrary: { id: 3, scene: null, evidence: 'no scene literal binds to this command id' },
  EcNavToVideoLibrary: { id: 5, scene: null, evidence: 'no scene literal binds to this command id' },
  EcNavToMusicLibrary: { id: 0x17, scene: null, evidence: 'no scene literal binds to this command id' },
  EcNavToPictureLibrary: { id: 0x18, scene: null, evidence: 'no scene literal binds to this command id' },
  EcNavToMediaCenter: { id: 0x10, scene: null, evidence: 'no scene literal binds to this command id' },
  EcNavToMediaRoom: { id: 0x11, scene: null, evidence: 'no scene literal binds to this command id' },
  EcNavToSolutions: { id: 0x21, scene: null, evidence: 'SolutionsSlotScene.xur is not in the archive either [SPEC §10.7]' },
};

/** The eight skin curves the code writes into a scene's Trans* properties. */
export interface LegacyCurves {
  /** What the OUTGOING scene plays. */
  from: string;
  /** What the INCOMING scene plays. */
  to: string;
  /** The same pair, coming back. */
  backFrom: string;
  backTo: string;
  /** Which form was chosen, and why. */
  form: 'plain' | 'ex';
  why: string;
}

export const LEGACY_CURVES = {
  plain: {
    from: 'LegacyFrom', to: 'LegacyTo', backFrom: 'LegacyBackFrom', backTo: 'LegacyBackTo',
    form: 'plain' as const,
    why: 'MEASURED: a legacy page over a legacy page is LegacyFrom + LegacyTo started together, twenty ticks in all [FRAME Kpa f05630-05639]',
  },
  ex: {
    from: 'LegacyFromEx', to: 'LegacyToEx', backFrom: 'LegacyBackFromEx', backTo: 'LegacyBackToEx',
    form: 'ex' as const,
    why: 'in the skin, written by the same code block; not chosen here because no capture shows a sixty-tick swap',
  },
} satisfies Record<string, LegacyCurves>;

/** Which pair covers a push. The plain pair, over the strip and over a page
 *  alike: the argument is kept so the report can say what it was asked. */
export function curvesFor(_overLegacy: boolean): LegacyCurves {
  return LEGACY_CURVES.plain;
}

// ---------------------------------------------------------------------------
// 3. THE TRANSITION CUES
//
// `controlp` holds TEN `.xma` files. Eight are the `Sound*` entries of the
// config table at .rdata 0x927f7194. The other two - `snd_transitioninto.xma`
// and `snd_transitionfrom.xma` - are named nowhere in that table, and M4b fired
// them on a push and a pop as an INFERENCE. They are not inferred any more:
// `controlp/Variables.xur`'s transition group carries a `TransitionSound`
// element whose `File` track writes `snd_transitioninto.xma` on frame 29 of
// `To` and 39 of `BackTo`, and `snd_transitionfrom.xma` on frame 9 of `From`
// and 24 of `BackFrom` [SCENE] - timeline cues, fired by the range
// (dashboards/nxe/transitions.ts) and logged `timeline` in `__dash.nxe.cues`.
// The names below are kept for the report only.

/** `<cmd>` -> the scene it opens. One row, because one row is evidenced. */
/** The two `controlp` cues that are NOT in the eight-name table. */
export const TRANSITION_CUES = {
  into: 'snd_transitioninto',
  from: 'snd_transitionfrom',
} as const;

/** Resolve a bare `PressPath` the way `dashboards/blades/nav.ts` does: every
 *  `.xur` basename in the build is unique across all packs. */
export function resolveScenePath(assets: AssetIndex, pressPath: string): string | null {
  return assets.findByBasename(pressPath) ?? null;
}
