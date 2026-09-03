// The XML that composes the NXE home page.
//
// Blades is one scene. NXE's home page is a scene GRAPH assembled at runtime
// from `homepage/emb_homepage.xml` plus the three `epix://*.xml` definitions it
// names [SCENE]. This module is the parser, the `<condition>` evaluator, and
// the Epix-path -> `.xur` binding. It renders nothing.
//
// Three things are read out of the binary rather than guessed:
//
//  * the 27-entry Epix table at .rdata 0x920289d8, `{ char* name, u32 id }`
//    pairs running EsDvdTray=2 .. EsOfflineInsideXbox=28 [CODE, re-read here];
//  * the 26 wide `.xur` names at 0x92028b1c, from `OfflineInsideXboxSlotScene`
//    through `GamesSlotScene`, with the three pack literals `slots.xzp`,
//    `FirstRun.xzp` and `extslots.xzp` interleaved [CODE, re-read here];
//  * the IDS_ resource names at 0x920279b8.. with their positional indices in
//    `homepage/strings.xus`, from the parallel arrays at 0x927f26b8 (25 wide
//    name pointers) and 0x927f25f0 (25 indices) [CODE].
//
// The Epix-path -> file BINDING itself is materialised in code (lis/addi), not
// stored as a pointer array, so it is not mechanically recoverable the way the
// two arrays above are. EPIX_SCENES below is NXE_GLUE_SPEC §1.2's table, and
// every entry is checked against the manifest at load time: a path that names
// no file in the archive is REPORTED, never silently dropped. That check is
// what catches `EsSolutions`, whose `SolutionsSlotScene.xur` the binary names
// and the `slots` pack does not contain (§10.7).

export const HOMEPAGE_PACK = 'homepage';
export const HOMEPAGE_MANIFEST = 'emb_homepage.xml';
/** `epix://foo.xml` resolves in the same pack as the manifest [SCENE]. */
export const EPIX_SCHEME = 'epix://';

export interface OnClick {
  button: string;
  /** "EpixCmd" (run <cmd>) or "KeyDown" (deliver the button to the slot). */
  action: string;
  cmd: string;
  helptext: string;
}

export interface Slot {
  name: string;
  epixid: string;
  description: string;
  description2: string;
  condition: string;
  onclick: OnClick | null;
  boxstyle: string;
}

export interface Channel {
  id: string;
  /** The raw `<description>`, usually `%EvResStr(IDS_…)%`. */
  description: string;
  condition: string;
  /** `<spacing>` overrides MobyDefaultSpacing for this channel [SCENE]. */
  spacing: number | null;
  type: string;
  slots: Slot[];
  /** epixid -> Epix `<path>` (EsGamerCard). */
  epix: Map<string, string>;
  /** Where it came from, for the report. */
  source: string;
}

/* ------------------------------------------------------------------ parsing */

function text(el: Element | null | undefined, tag: string): string {
  const c = el?.querySelector(`:scope > ${tag}`);
  return c?.textContent?.trim() ?? '';
}

function parseSlot(el: Element): Slot {
  const oc = el.querySelector(':scope > onclick');
  return {
    name: text(el, 'name'),
    epixid: text(el, 'epixid'),
    description: text(el, 'description'),
    description2: text(el, 'description2'),
    condition: text(el, 'condition'),
    boxstyle: text(el, 'boxstyle'),
    onclick: oc ? {
      button: text(oc, 'button'),
      action: text(oc, 'action'),
      cmd: text(oc, 'cmd'),
      helptext: text(oc, 'helptext'),
    } : null,
  };
}

/** A `<channeldef>` body, shared by the inline channels and the epix:// files. */
export function parseChannelDef(def: Element, id: string, source: string): Channel {
  const epix = new Map<string, string>();
  for (const e of Array.from(def.querySelectorAll(':scope > epix'))) {
    epix.set(text(e, 'id'), text(e, 'path'));
  }
  const spacing = text(def, 'spacing');
  return {
    id,
    description: text(def, 'description'),
    condition: text(def, 'condition'),
    spacing: spacing ? Number(spacing) : null,
    type: text(def, 'type'),
    slots: Array.from(def.querySelectorAll(':scope > slot')).map(parseSlot),
    epix,
    source,
  };
}

export interface ManifestChannel {
  id: string;
  /** Inline `<channeldef>`, or null when `<definitionpath>` names a file. */
  inline: Channel | null;
  definitionPath: string;
}

export interface HomeManifest {
  defaultChannelId: string;
  channels: ManifestChannel[];
}

export function parseHomeManifest(xml: string): HomeManifest {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error(`${HOMEPAGE_MANIFEST}: ${err.textContent ?? 'parse error'}`);
  const root = doc.documentElement;
  const channels: ManifestChannel[] = [];
  for (const c of Array.from(root.querySelectorAll(':scope > channel'))) {
    const id = text(c, 'id');
    const def = c.querySelector(':scope > channeldef');
    channels.push({
      id,
      inline: def ? parseChannelDef(def, id, HOMEPAGE_MANIFEST) : null,
      definitionPath: text(c, 'definitionpath'),
    });
  }
  return { defaultChannelId: text(root, 'defaultchannelid'), channels };
}

export function parseChannelFile(xml: string, id: string, source: string): Channel {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) throw new Error(`${source}: ${err.textContent ?? 'parse error'}`);
  return parseChannelDef(doc.documentElement, id, source);
}

/* --------------------------------------------------------------- conditions */

/**
 * The console state every `<condition>` in the archive asks about.
 *
 * NONE of these can be answered from the dashboard image: they are Live tier,
 * region, attached hardware and a profile setting. The state modelled here is
 * the one the only offline capture is in - no Xbox LIVE, no profile, no HD-DVD
 * add-on, no Mediaroom [FRAME nxe-8955-Yv5A4DFHAAE] - and every field says how
 * it is evidenced, because the channel list is the whole home page.
 */
export interface ConsoleState {
  /** `EcoLiveTier(None)`: no Live account at all. TRUE offline. */
  liveTierNone: boolean;
  /** `EcoInLiveLocale()`: Xbox LIVE is offered in this console's region. */
  inLiveLocale: boolean;
  /** `EcoVideoMarketplaceAvailable()`. */
  videoMarketplaceAvailable: boolean;
  /** `EcoInsideXboxAvailable()`. */
  insideXboxAvailable: boolean;
  /** `EcoEventsAvailable()`. */
  eventsAvailable: boolean;
  /** `EcoShowWelcomeChannel()`: the channel the user has not dismissed. */
  showWelcomeChannel: boolean;
  /** `EcoExperienceMode(Full)`. */
  experienceModeFull: boolean;
  /** `EcoHdDvdInstalled()`: the HD-DVD drive add-on. */
  hdDvdInstalled: boolean;
  /** `EcoMediaroomEnabled()`: Microsoft Mediaroom (IPTV). */
  mediaroomEnabled: boolean;
}

/**
 * The default state, and where each value comes from:
 *
 *  liveTierNone TRUE           - the console has no profile [FRAME Yv5], which
 *                                is also what makes My Xbox eight slots.
 *  hdDvdInstalled FALSE        - no HD-DVD add-on; with it, HD-DVD would be a
 *                                ninth slot and the frame says "1 of 8"
 *                                [FRAME Yrt f0483].
 *  mediaroomEnabled FALSE      - same count.
 *  showWelcomeChannel TRUE     - the Welcome channel is on screen in the
 *                                offline capture [FRAME Yv5 f0048-f0060].
 *  inLiveLocale TRUE           - INFERRED. A region query; the captures are all
 *  videoMarketplaceAvailable   - in Live regions and the five inline channels
 *  insideXboxAvailable         - exist precisely to upsell Live to a console
 *  eventsAvailable             - that has none. Nothing in the archive answers
 *  experienceModeFull TRUE       these, so they are switches, not facts, and
 *                                __dash.nxe.conditions reports every one.
 */
export const OFFLINE_STATE: ConsoleState = {
  liveTierNone: true,
  inLiveLocale: true,
  videoMarketplaceAvailable: true,
  insideXboxAvailable: true,
  eventsAvailable: true,
  showWelcomeChannel: true,
  experienceModeFull: true,
  hdDvdInstalled: false,
  mediaroomEnabled: false,
};

/** Predicates that are INFERRED rather than evidenced, for the honesty row. */
export const INFERRED_CONDITIONS: readonly string[] = [
  'EcoInLiveLocale', 'EcoVideoMarketplaceAvailable', 'EcoInsideXboxAvailable',
  'EcoEventsAvailable', 'EcoExperienceMode',
];

export interface ConditionResult { expr: string; value: boolean; known: boolean }

/**
 * Evaluate one `<condition>`. The grammar in the archive is exactly: an
 * optional `!`, a name, and a parenthesised argument list that is either empty
 * or one enum token (`EcoLiveTier(None)`, `EcoExperienceMode(Full)`). Anything
 * outside that grammar, or any predicate this module does not know, comes back
 * `known: false` and the caller keeps the slot rather than inventing an answer.
 */
export function evalCondition(expr: string, s: ConsoleState): ConditionResult {
  const raw = expr.trim();
  if (!raw) return { expr, value: true, known: true };
  const m = /^(!?)\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(\s*([A-Za-z0-9_]*)\s*\)$/.exec(raw);
  if (!m) return { expr, value: true, known: false };
  const [, bang, name, arg] = m;
  let v: boolean | null = null;
  switch (name) {
    case 'EcoLiveTier': v = arg === 'None' ? s.liveTierNone : null; break;
    case 'EcoInLiveLocale': v = s.inLiveLocale; break;
    case 'EcoVideoMarketplaceAvailable': v = s.videoMarketplaceAvailable; break;
    case 'EcoInsideXboxAvailable': v = s.insideXboxAvailable; break;
    case 'EcoEventsAvailable': v = s.eventsAvailable; break;
    case 'EcoShowWelcomeChannel': v = s.showWelcomeChannel; break;
    case 'EcoExperienceMode': v = arg === 'Full' ? s.experienceModeFull : null; break;
    case 'EcoHdDvdInstalled': v = s.hdDvdInstalled; break;
    case 'EcoMediaroomEnabled': v = s.mediaroomEnabled; break;
    default: v = null;
  }
  if (v === null) return { expr, value: true, known: false };
  return { expr, value: bang === '!' ? !v : v, known: true };
}

/* ------------------------------------------------------------ epix -> scene */

export interface EpixScene {
  /** "<pack>/<file>", as the manifest names it. */
  scene: string;
  /** How this binding is evidenced. */
  note?: string;
}

/**
 * Epix `<path>` -> the `.xur` it instantiates [NXE_GLUE_SPEC §1.2].
 *
 * Both halves are in the binary - the path names in the id table at 0x920289d8
 * and the file names in the block at 0x92028b1c - but the pairing between them
 * is built in code, so this table is the spec's reading and every row is
 * checked against the manifest when the shell loads.
 */
export const EPIX_SCENES: Readonly<Record<string, EpixScene>> = {
  EsDvdTray: { scene: 'slots/TraySlotScene.xur' },
  EsGamerCard: { scene: 'slots/GamerCardSlotScene.xur' },
  EsGameLibrary: { scene: 'slots/GamesSlotScene.xur' },
  EsVideoLibrary: { scene: 'slots/VideoSlotScene.xur' },
  EsMusicLibrary: { scene: 'slots/MusicSlotScene.xur' },
  EsPictureLibrary: { scene: 'slots/PhotosSlotScene.xur' },
  EsMediaCenter: { scene: 'slots/MediaCenterSlotScene.xur' },
  EsMediaRoom: { scene: 'slots/MediaRoomSlotScene.xur' },
  EsHdDvdTray: { scene: 'slots/HdDvdTraySlotScene.xur' },
  EsSettings: { scene: 'slots/SettingsSlotScene.xur' },
  // Named at 0x92028d7c and by the id table, but the slots pack has no such
  // file. Reported by the shell rather than substituted [SPEC §10.7].
  EsSolutions: { scene: 'slots/SolutionsSlotScene.xur', note: 'named in dash.xex, absent from the slots pack' },
  EsWhatsHot: { scene: 'firstrun/WhatsNewSlotScene.xur' },
  EsXboxBasics: { scene: 'firstrun/XboxBasicsSlotScene.xur' },
  EsNxeVideo: { scene: 'firstrun/NxeVideoSlotScene.xur' },
  EsHideWelcome: { scene: 'firstrun/HideWelcomeSlotScene.xur' },
  EsStorageUpsell: { scene: 'firstrun/StorageUpsellSlotScene.xur' },
  EsOfflineGames: { scene: 'firstrun/OfflineGamesSlotScene.xur' },
  EsOfflineVideo: { scene: 'firstrun/OfflineVideoSlotScene.xur' },
  EsOfflineFriends: { scene: 'firstrun/OfflineFriendsSlotScene.xur' },
  EsOfflineInsideXbox: { scene: 'firstrun/OfflineInsideXboxSlotScene.xur' },
  EsOfflinePromotions: { scene: 'firstrun/OfflinePromotionsSlotScene.xur' },
};

/* ------------------------------------------------------------ IDS_ -> string */

/**
 * `%EvResStr(IDS_X)%` -> a positional index in `homepage/strings.xus` (25
 * entries) [SCENE].
 *
 * The mapping is a pair of parallel arrays in `.rdata`: 25 wide-string
 * pointers to the IDS_ names at 0x927f26b8..0x927f2718, and 25 u64 indices at
 * 0x927f25f0..0x927f26b0. Read with the name array offset one slot against the
 * index array, EIGHTEEN CONSECUTIVE names resolve to exactly the string they
 * are called - IDS_DISKINTRAY->"Disc in Tray", IDS_GAMERCARD->"Gamer Card",
 * IDS_GAMESLIBRARY->"Game Library", IDS_VIDEOLIBRARY->"Video Library",
 * IDS_MUSICLIBRARY->"Music Library", IDS_PICTURELIBRARY->"Picture Library",
 * IDS_MEDIACENTER->"Windows Media Center", IDS_MEDIACENTER_LINE2->"TV and
 * media from your PC", IDS_SETTINGS->"System Settings",
 * IDS_SOLUTIONS->"Solutions", IDS_SOLUTIONS_DESC->"Help, How-to, and Tips",
 * IDS_HDDVD->"HD-DVD", IDS_PROMOTIONS->"Events", IDS_PRIMETIME->"Primetime",
 * IDS_VIDEO->"Video & Music Marketplace", IDS_FRIENDS->"Friends",
 * IDS_GAMES->"Game Marketplace", IDS_INSIDEXBOX->"Inside Xbox" - which is not
 * a coincidence and is why the offset is read that way.
 *
 * THE OFFSET DOES NOT HOLD AT BOTH ENDS, and that is stated rather than
 * papered over. IDS_CHANNELNAME_WELCOME comes out "Welcome" under it, but
 * IDS_CHANNELNAME_XBOX360 and IDS_CHANNELNAME_FRIENDS come out swapped
 * ("Friends" and "My Xbox"). Those two are therefore settled by the strings
 * themselves and by the footage - the My Xbox channel is captioned "My Xbox"
 * [FRAME Yrt f0483] - and are marked below. IDS_SELECT, IDS_SELECTSLOT and
 * IDS_TELLMEMORE resolve outside this table (a common resource) and are not
 * mapped; a slot's helptext is not drawn by anything this milestone renders.
 */
export interface IdsEntry { index: number; evidence: 'rdata-pair' | 'string+frame' }

export const IDS_TO_STRINGS_INDEX: Readonly<Record<string, IdsEntry>> = {
  IDS_DISKINTRAY: { index: 3, evidence: 'rdata-pair' },
  IDS_GAMERCARD: { index: 5, evidence: 'rdata-pair' },
  IDS_GAMESLIBRARY: { index: 7, evidence: 'rdata-pair' },
  IDS_VIDEOLIBRARY: { index: 24, evidence: 'rdata-pair' },
  IDS_MUSICLIBRARY: { index: 14, evidence: 'rdata-pair' },
  IDS_PICTURELIBRARY: { index: 15, evidence: 'rdata-pair' },
  IDS_MEDIACENTER: { index: 12, evidence: 'rdata-pair' },
  IDS_MEDIACENTER_LINE2: { index: 13, evidence: 'rdata-pair' },
  IDS_SETTINGS: { index: 19, evidence: 'rdata-pair' },
  IDS_SOLUTIONS: { index: 20, evidence: 'rdata-pair' },
  IDS_SOLUTIONS_DESC: { index: 21, evidence: 'rdata-pair' },
  IDS_HDDVD: { index: 8, evidence: 'rdata-pair' },
  IDS_PROMOTIONS: { index: 17, evidence: 'rdata-pair' },
  IDS_PRIMETIME: { index: 16, evidence: 'rdata-pair' },
  IDS_VIDEO: { index: 23, evidence: 'rdata-pair' },
  IDS_FRIENDS: { index: 4, evidence: 'rdata-pair' },
  IDS_GAMES: { index: 6, evidence: 'rdata-pair' },
  IDS_INSIDEXBOX: { index: 11, evidence: 'rdata-pair' },
  IDS_CHANNELNAME_WELCOME: { index: 1, evidence: 'rdata-pair' },
  IDS_CHANNELNAME_XBOX360: { index: 2, evidence: 'string+frame' },
  IDS_CHANNELNAME_FRIENDS: { index: 0, evidence: 'string+frame' },
};

/**
 * Resolve one `%EvResStr(IDS_X)%` fragment against a positional table. The
 * archive writes the closing `%` inconsistently (`%EvResStr(IDS_DISKINTRAY)`
 * has none), so both forms are accepted. An unmapped name comes back null and
 * the caller draws nothing - the console never drew an unresolved token.
 */
export function resolveResString(raw: string, table: readonly string[]): { text: string | null; ids: string | null } {
  const m = /^%Ev(Com)?ResStr\(\s*([A-Za-z0-9_]+)\s*\)%?$/.exec(raw.trim());
  if (!m) return { text: raw.trim() ? raw.trim() : null, ids: null };
  const ids = m[2]!;
  // A COMMON resource string is a different table this module does not carry.
  if (m[1]) return { text: null, ids };
  const e = IDS_TO_STRINGS_INDEX[ids];
  if (!e) return { text: null, ids };
  return { text: table[e.index] ?? null, ids };
}
