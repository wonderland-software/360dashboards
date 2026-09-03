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
// 0x9249229c-0x924923c4 [CODE]. WHICH of the two forms is chosen is
// NXE_GLUE_SPEC §2.4's [INFER] and stays one: the plain curve when the strip's
// FOLD covers the swap (home -> a page), the `…Ex` curve when a legacy page
// replaces another legacy page and there is no fold to hide it. The `…Ex` pair
// is exactly long enough to cross-fade under its own steam - its incoming curve
// holds transparent for 45 frames, i.e. until 750 ms in, which is 250 ms past
// the end of the outgoing one - and the plain pair is not, which is what the
// inference rests on.
//
// ---------------------------------------------------------------------------
// 3. THE TRANSITION CUES
//
// `controlp` holds TEN `.xma` files. Eight are the `Sound*` entries of the
// config table at .rdata 0x927f7194 and are played by the glue on every
// navigation [SPEC §2.3]. The other two - `snd_transitioninto.xma` and
// `snd_transitionfrom.xma` - are named nowhere in that table; the spec calls
// them "the page transitions". Firing them with the push and the pop is
// therefore an INFERENCE from their names and is tagged as one in
// `__dash.nxe.cues`, unlike the eight, which are tagged `table`.
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
    why: 'the strip folds over this swap, so the short pair is enough [INFER, SPEC §2.4]',
  },
  ex: {
    from: 'LegacyFromEx', to: 'LegacyToEx', backFrom: 'LegacyBackFromEx', backTo: 'LegacyBackToEx',
    form: 'ex' as const,
    why: 'a legacy page replaces another legacy page and no fold covers it, so the long pair carries the cross-fade [INFER, SPEC §2.4]',
  },
} satisfies Record<string, LegacyCurves>;

/** Which pair covers a push. `overLegacy` = there is already a page on screen. */
export function curvesFor(overLegacy: boolean): LegacyCurves {
  return overLegacy ? LEGACY_CURVES.ex : LEGACY_CURVES.plain;
}

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
