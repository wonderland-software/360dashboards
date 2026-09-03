// Where A goes on the NXE home page, and which curve covers the swap.
//
// ---------------------------------------------------------------------------
// 1. THE COMMAND TABLE, AND THE DISPATCHER THAT BINDS IT (M4e)
//
// A Moby slot's `<onclick>` is either `KeyDown` (deliver A to the hosted slot
// scene) or `EpixCmd` with a `<cmd>` naming one of the console's navigation
// commands [SCENE, homepage/xbox360channel.xml]. Those command NAMES are a real
// table in the image: 35 `{ char* name, u32 id }` pairs at `.rdata`
// 0x920288a0-0x920289c4, running `EcCreateGamerProfile` = 0 through
// `EcNavToLocalEpixManifest` = 0x22 [CODE, re-read here].
//
// M4d wrote that the other half - which `.xur` a command opens - was
// "materialised in code, not in a pointer array" and bound ONE row by
// inference. That was half right: there is no pointer array from id to scene,
// but there IS a jump table. The dispatcher at `.text` 0x922d312c (true VA;
// tools/ppc-dis.ts prints it 0x200 higher) does `lhzx` into a u16 offset table
// at `.rdata` 0x92028ad0 indexed by the command id and `bcctr`s to the case.
// Read off that table, the cases that name a scene do it through ONE helper,
// 0x922c5780(scene, L"<pack>.xzp", L"<file>.xur", 0, 1) [CODE]:
//
//   id 0x03 EcNavToGamesLibrary -> 0x922d31b4  arcade.xzp / ArcadeFilterScene.xur
//   id 0x04 EcNavToSettings     -> 0x922d31d8  consolesettings.xzp / SystemScene.xur
//   id 0x06 EcNavToStorageUpsell-> 0x922d3244  FirstRun.xzp / StorageUpsellScene.xur
//   id 0x07 EcNavToXboxBasics   -> 0x922d325c  FirstRun.xzp / XboxBasicsRootScene.xur
//   id 0x08 EcNavToWhatsNew     -> 0x922d326c  FirstRun.xzp / WhatsNewRootScene.xur
//   id 0x16 EcNavToLiveUpsell   -> 0x922d349c  homepage.xzp / LiveUpsellRootScene.xur
//   id 0x21 EcNavToSolutions    -> 0x922d31ec  solutions.xml (an epix manifest, Live)
//
// so `EcNavToSettings -> consoles/SystemScene.xur` is no longer an inference,
// and the three Rome roots the M4d audit flagged are bound by the same bytes.
// The library commands go to FUNCTIONS, not literals - `EcNavToVideoLibrary`
// (5) `bl 0x92242118`, `EcNavToMusicLibrary` (0x17) `bl 0x9222d9a0`,
// `EcNavToPictureLibrary` (0x18) `bl 0x922227f8`, `EcNavToMediaCenter` (0x10)
// `bl 0x92306510` - which build their page from device state (the videos,
// music and pictures on the attached storage; the Media Center PCs on the
// network). Those are refused and reported, with the case address, because
// the archive has the scenes but not the device list that picks among them.
// `EcHideWelcomeChannel` (0x1a, case 0x922d34c0) raises a message box with
// dashcomm/dashStrings.xus [26] "Welcome Channel" / [25] "Do you want to remove
// this channel? ..." / [174] "Yes" / [81] "No" before it acts; the box is xam's
// and is not built here (PLACEHOLDERS). `EcPlayMigrationVideo` (0x0b) plays
// `homepage/VideoScene.xur`, whose XuiVideo has no file in the archive.
//
// The Gamer Card slot is `KeyDown`, not a command: `CGamerCardSlotScene`'s
// key handler opens `signin/SigninScene.xur` (the `CSigninScene` registration
// at 0x922e2f34 and the literal materialised at 0x922df3b8 / 0x922e91d0), and
// that scene's `MobyRootScene` strip is built from `ProfilePanelScene.xur` x
// profiles, `CreateProfilePanelScene.xur`, `RecoverProfilePanelScene.xur` in
// that order [CODE 0x922e409c, 0x922e411c, 0x922e415c; FRAME Yrt f0264,
// f0268, Kpa f0090 show exactly that strip under a "Sign In" queue row].
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
    evidence: 'CODE: jump table 0x92028ad0[4] -> 0x922d31d8, consolesettings.xzp / SystemScene.xur; the page the footage opens [FRAME Kpa f0391]',
  },
  EcNavToGamesLibrary: {
    id: 3,
    scene: 'arcade/ArcadeFilterScene.xur',
    evidence: 'CODE: jump table 0x92028ad0[3] -> 0x922d31b4, arcade.xzp / ArcadeFilterScene.xur; the Rome strip the footage shows ("Collections 2 of 2" [FRAME Yrt f0396], "6 of 53" [FRAME Kpa f0300])',
  },
  EcNavToXboxBasics: {
    id: 7,
    scene: 'firstrun/XboxBasicsRootScene.xur',
    evidence: 'CODE: jump table 0x92028ad0[7] -> 0x922d325c, FirstRun.xzp / XboxBasicsRootScene.xur',
  },
  EcNavToWhatsNew: {
    id: 8,
    scene: 'firstrun/WhatsNewRootScene.xur',
    evidence: 'CODE: jump table 0x92028ad0[8] -> 0x922d326c, FirstRun.xzp / WhatsNewRootScene.xur',
  },
  EcNavToLiveUpsell: {
    id: 0x16,
    scene: 'homepage/LiveUpsellRootScene.xur',
    evidence: 'CODE: jump table 0x92028ad0[0x16] -> 0x922d349c, homepage.xzp / LiveUpsellRootScene.xur',
  },
  EcNavToStorageUpsell: {
    id: 6,
    scene: null,
    evidence: 'CODE: jump table [6] -> 0x922d3244 names FirstRun.xzp / StorageUpsellScene.xur, which is not in the archive',
  },
  // The library commands call a function that builds the page from device
  // state; no scene literal is bound in the dispatcher.
  EcNavToVideoLibrary: { id: 5, scene: null, evidence: 'CODE: jump table [5] -> 0x922d3204 calls 0x92242118, which builds the page from the videos on the attached storage (device state)' },
  EcNavToMusicLibrary: { id: 0x17, scene: null, evidence: 'CODE: jump table [0x17] -> 0x922d3218 calls 0x9222d9a0, which builds the page from the music on the attached storage (device state)' },
  EcNavToPictureLibrary: { id: 0x18, scene: null, evidence: 'CODE: jump table [0x18] -> 0x922d3230 calls 0x922227f8, which builds the page from the pictures on the attached storage (device state)' },
  EcNavToMediaCenter: { id: 0x10, scene: null, evidence: 'CODE: jump table [0x10] -> 0x922d3330 calls 0x92306510 with the Media Center extender state (device and network state)' },
  EcNavToMediaRoom: { id: 0x11, scene: null, evidence: 'CODE: jump table [0x11] -> 0x922d3350 calls 0x922c0be8 (Mediaroom, not installed offline)' },
  EcNavToSolutions: { id: 0x21, scene: null, evidence: 'CODE: jump table [0x21] -> 0x922d31ec opens solutions.xml, a Live epix manifest; SolutionsSlotScene.xur is not in the archive either [SPEC §10.7]' },
  EcHideWelcomeChannel: { id: 0x1a, scene: null, evidence: 'CODE: jump table [0x1a] -> 0x922d34c0 raises a message box (dashStrings [26] "Welcome Channel", [25] body, [174] "Yes", [81] "No") before flipping the setting; the box is xam\'s and is not built here' },
  EcPlayMigrationVideo: { id: 0x0b, scene: null, evidence: 'CODE: jump table [0x0b] -> 0x922d32a8 plays homepage/VideoScene.xur, whose XuiVideo names no file in the archive' },
};

/**
 * The strip each pushed ROOT scene carries, from the image.
 *
 * A root scene (`RomeRootScene` / `MobyRootScene` subclass) is an empty
 * 1280x720 host; the code puts a strip of panels in it. Which panels, and in
 * what order, is read off the image three ways and each row says which:
 *
 *  * What's New: a table of 8 x (u32 flag, u32 id, ptr wide scene) at .rdata
 *    0x9202b63c, walked in table order [CODE]. The flags (2 on USB storage, 4
 *    on avatar gear) are not decoded and are recorded. A second, four-row table
 *    at 0x9202b608 (USB storage, content transfer, avatars, Xbox Basics'
 *    "getting around") is a different set - its consumer was not traced - and
 *    is NOT what `WhatsNewRootScene` walks [INFER: the eight-row table sits
 *    at the address the root's 0x92028ad0 case leads to].
 *  * Xbox Basics: the eight panel literals are materialised one after another
 *    at .text 0x922ed03c-0x922ed0e4 (Getting Around, Join LIVE, Family, Create
 *    Profile, Play Games, Media, Friends, Privacy) [CODE]; that emission order
 *    is taken as the strip order [INFER].
 *  * Live upsell: the five literals at .text 0x922d9908-0x922d9970 (Games,
 *    Video, Friends, Inside Xbox, Promotions) - the channel order of
 *    emb_homepage.xml, which the same reading gives [CODE + INFER].
 *  * Game Library: `arcade/ArcadeFilterScene.xur` hosts `RecentGamesFilterPanel`
 *    and `CollectionFilterPanel`; "Collections" is "2 of 2" [FRAME Yrt f0396]
 *    and Kparblu6r14 144-168 s shows Recent Games in front of Collections.
 *  * Sign In: `signin/SigninScene.xur` is a MobyRootScene with ONE channel
 *    (the footage draws "Sign In" where Queue\Current sits and no other row)
 *    whose panels are one `ProfilePanelScene` per local profile, then
 *    `CreateProfilePanelScene`, then `RecoverProfilePanelScene`
 *    [CODE 0x922e409c-0x922e415c; FRAME Yrt f0268 "1 of 3", Kpa f0090 "3 of 5"].
 */
export interface RootStrip {
  /** 'rome' = 460x495 panels on the Rome constants; 'moby' = 420x320 slots on the Moby constants. */
  kind: 'rome' | 'moby';
  panels: readonly string[];
  /** The queue row a Moby root draws (Sign In has one), by string table index. */
  channel: { pack: string; table: string; index: number; evidence: string } | null;
  evidence: string;
}

export const ROOT_STRIPS: Readonly<Record<string, RootStrip>> = {
  'firstrun/WhatsNewRootScene.xur': {
    kind: 'rome',
    panels: [
      'firstrun/WhatsNewJoinXboxLIVEScene.xur', 'firstrun/WhatsNewFacebookTwitterScene.xur',
      'firstrun/WhatsNewLastFMScene.xur', 'firstrun/WhatsNewUSBStorageScene.xur',
      'firstrun/WhatsNewContentTransferScene.xur', 'firstrun/WhatsNewZuneVideoMarketplaceScene.xur',
      'firstrun/WhatsNewAvatarGearScene.xur', 'firstrun/WhatsNewGamesOnDemandScene.xur',
    ],
    channel: null,
    evidence: 'CODE: the 8-row table at .rdata 0x9202b63c (flag, id, scene), in table order; WhatsNewAvatarsScene.xur is only in the 4-row table at 0x9202b608 and is not mounted',
  },
  'firstrun/XboxBasicsRootScene.xur': {
    kind: 'rome',
    panels: [
      'firstrun/XboxBasicsGettingAroundScene.xur', 'firstrun/XboxBasicsJoinLiveScene.xur',
      'firstrun/XboxBasicsFamilyScene.xur', 'firstrun/XboxBasicsCreateProfileScene.xur',
      'firstrun/XboxBasicsPlayGamesScene.xur', 'firstrun/XboxBasicsMediaScene.xur',
      'firstrun/XboxBasicsFriendsScene.xur', 'firstrun/XboxBasicsPrivacyScene.xur',
    ],
    channel: null,
    evidence: 'CODE: eight literals materialised in this order at .text 0x922ed03c-0x922ed0e4; INFER that the emission order is the strip order',
  },
  'homepage/LiveUpsellRootScene.xur': {
    kind: 'rome',
    panels: [
      'homepage/GamesUpsellScene.xur', 'homepage/VideoUpsellScene.xur', 'homepage/FriendsUpsellScene.xur',
      'homepage/InsideXboxUpsellScene.xur', 'homepage/PromotionsUpsellScene.xur',
    ],
    channel: null,
    evidence: 'CODE: five literals materialised in this order at .text 0x922d9908-0x922d9970, the channel order of emb_homepage.xml; INFER that the strip starts on the first panel whichever upsell slot was pressed',
  },
  'arcade/ArcadeFilterScene.xur': {
    kind: 'rome',
    panels: ['arcade/RecentGamesFilterPanel.xur', 'arcade/CollectionFilterPanel.xur'],
    channel: null,
    evidence: 'FRAME: "Collections" is "2 of 2" [Yrt f0396] and Recent Games fronts it [Kpa 144-168 s]; the two panels are the pack\'s two filter panels',
  },
  'signin/SigninScene.xur': {
    kind: 'moby',
    panels: ['signin/CreateProfilePanelScene.xur', 'signin/RecoverProfilePanelScene.xur'],
    channel: {
      pack: 'dashcomm', table: 'dashStrings.xus', index: 91,
      evidence: 'the queue row reads "Sign In" [FRAME Yrt f0268, Kpa f0090]; dashStrings [91] and [98] are both "Sign In", so the index is INFERRED and cannot change the pixel',
    },
    evidence: 'CODE 0x922e409c-0x922e415c: ProfilePanelScene x profiles (none offline), CreateProfilePanelScene, RecoverProfilePanelScene',
  },
};

/** One local profile's panel, prepended once per profile [CODE 0x922e409c]. */
export const SIGNIN_PROFILE_PANEL = 'signin/ProfilePanelScene.xur';
export const SIGNIN_SCENE = 'signin/SigninScene.xur';

/**
 * The legend the Sign In page shows: "(A) Select  (B) Back" on every capture
 * [FRAME Yrt f0264, f0268; Kpa f0090]. The root's own parked `legend_a` reads
 * "Continue" and is Show=false / Enabled=false, and the panel scenes carry no
 * legend controls, so the two captions come from the code. dashcomm/
 * dashStrings.xus [97] "Select" and [2] "Back" are the build's own words; that
 * the code reads THOSE indices is INFERRED (no other "Select" / "Back" entry
 * exists in that table, so the choice cannot change the pixel).
 */
export const SIGNIN_LEGEND = { pack: 'dashcomm', table: 'dashStrings.xus', select: 97, back: 2 } as const;

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

/**
 * Resolve a bare `PressPath` to "<pack>/<file>".
 *
 * Blades' rule - every `.xur` basename is unique across all packs - is 6770's
 * only. 9199 carries `dashSysCslSetCountry.xur` in BOTH `consoles/` and
 * `network/`, and `AssetIndex.findByBasename` refuses a collision, so
 * `dashSysCslSetLangLocale.btnLocale` could never open. The console's
 * DashSystemScene names the pack in code and a settings page's children live
 * in its own pack (`consolesettings.xzp` is the literal beside the Console
 * Settings table, 0x920166a4), so the pressing scene's OWN pack is tried first
 * and the global index second. A collision with no own-pack copy is refused
 * with the reason, never guessed.
 */
export function resolveScenePath(assets: AssetIndex, pressPath: string, fromPack?: string): string | null {
  const base = pressPath.replace(/^.*[\\/]/, '');
  if (fromPack && assets.entry(fromPack, base)) return `${fromPack}/${base}`;
  return assets.findByBasename(pressPath) ?? null;
}
