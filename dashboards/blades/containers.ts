// The containers the console filled at runtime, and what it put in them.
//
// Three of them, all of which the footage shows full and which we were drawing
// empty. None of the three needs Xbox LIVE, and none of them is a guess: two
// name their own content in the scene data and the third names it in the
// executable.
//
// 1. XuiBOTDOfflineContainer.DefaultBanner  [SCENE]
//    "banner of the day" containers hold a Live-served banner when the console
//    is online. Offline they hold the scene the container itself names in
//    XuiBOTDOfflineContainer.DefaultBanner, and every one of the eleven in the
//    build names a real file in botd/ whose CANVAS IS THE CONTAINER'S SIZE:
//      live/*            botdBillboard 345x240 -> defaultbanner0.xur (345x240)
//                        btn_AdBanner  345x94  -> defaultbanner1.xur (345x95)
//      blademp/*         scnBanner     420x358 -> defaultbanner_media_large.xur
//      gamesbla/gamesMetaMOTD  345x240 -> defaultbanner_games.xur
//      mediabla/mediaMetaMOTD  345x240 -> defaultbanner0.xur
//      arcade/2500_LiveArcadeHome 420x72 -> defaultbanner_media_small.xur
//    defaultbanner0.xur is the "Xbox LIVE / Games. Tournaments. Entertainment.
//    All the rewards. Endless possibilities. What are you waiting for?" panel
//    the reference still shows on the Xbox LIVE blade [FRAME hi f0026, f0078],
//    and it is the ONLY file in the whole 6770 asset set that carries that
//    sentence, so the mapping is not inferred.
//
// 2. TraySceneLoader  [CODE]
//    Every blade panel carries `XuiScene Id="TrayScene" 694x47 @ (2,385)
//    ClassOverride="TraySceneLoader"` with no ScenePath. The class loads the
//    wide literal L"common://TrayScene.xur" at VA 0x92013130, referenced once,
//    from 0x921b1e00; the `common://X` rewriter at 0x9210dcf8 turns that into
//    `section://%X,dashcomm#X`, so it is dashcomm/TrayScene.xur. That scene is
//    a two-tab scene (ranges 1To2 @0..45 and 2To1 @46..90): tab 1 is the "Open
//    Tray" strip, tab 2 the disc panel. With no disc it rests on tab 1, frame
//    0, which is what the footage shows [FRAME hi f0078].
//
// 3. DashLiveSignedOut's two labels  [CODE + SCENE]
//    live/liveSignedOutUI.xur ships `labSignInText Text="Sign In"` and an EMPTY
//    labFoundProfiles, and the screen shows "Create Profile" and "No Profiles
//    Found" [FRAME hi f0026, f0078]. The class is registered at 0x9228f060
//    (name VA 0x92029970, base XuiScene) and its bind at 0x9228f478 fetches
//    exactly five children in order - fakeGamerCard, labSignInText,
//    labFoundProfiles, btnJoinXbox, btnUseExistingTag - then calls the string
//    helper at 0x921ba618, which resolves ids 173 and 174. Those are positions
//    in the POSITIONAL table dashcomm/dashStrings.xus (kind 2, 248 entries):
//      [173] "Create Profile"     [174] "Sign In"     [52] "No Profiles Found"
//    So the caption is "Create Profile" while no profile exists and "Sign In"
//    once one does, and the body line is the profile count. With zero profiles
//    - the state of the console in the footage - it is [52].
//
// The number of profiles on the console is device state, not scene data, and
// there is no profile here: PLACEHOLDERS.md records it as such.
import { idOf, propByName, type XuObject } from '@xur/index';
import { setOwnerText, type NodeRecord } from '@runtime/index';

/** dashcomm/dashStrings.xus, the pack-wide positional table. */
export const DASH_STRINGS_PACK = 'dashcomm';
export const DASH_STRINGS_TABLE = 'dashStrings.xus';

/** The three indices 0x9228f478 resolves, by what they mean. */
export const DASH_STRING = {
  noProfilesFound: 52,
  createProfile: 173,
  signIn: 174,
  /**
   * The tray pill's caption, chosen by DRIVE STATE, not by scene data:
   * dashcomm/TrayScene.xur ships btn_Tray with no Text at all. The switch is at
   * 0x921b2054-0x921b209c [CODE]: it loads the drive state from +136 and
   * branches 1 -> [196], 2 -> [195], 3 -> [204] "Opening", 4 -> [206]
   * "Reading", and FALLS THROUGH to [203] "Open Tray" - each index passed to
   * the same string resolver 0x921a5ea8 that DashLiveSignedOut uses. There is
   * no disc in this drive and none in the console the footage was shot on, so
   * the fall-through is the case, and "Open Tray" is what f0078 shows.
   */
  openTray: 203,
} as const;

/** L"common://TrayScene.xur" at 0x92013130, rewritten by 0x9210dcf8. */
export const TRAY_SCENE = 'dashcomm/TrayScene.xur';
export const TRAY_LOADER_CLASS = 'TraySceneLoader';
export const BOTD_CONTAINER_CLASS = 'XuiBOTDOfflineContainer';

export interface ContainerFill {
  /** "botdBillboard -> botd/defaultbanner0.xur", for the report. */
  filled: string[];
  /** A container whose named scene is not in the manifest. Never empty
   *  silently: a missing banner is a fidelity failure, not a blank. */
  missing: string[];
}

export interface FillHost {
  /** Parent a scene under `host` and return its node, or null. */
  load(host: NodeRecord, sceneId: string): Promise<NodeRecord | null>;
  /** Resolve a bare basename to "<pack>/<file>", or null. */
  resolve(basename: string): string | null;
  /** dashcomm/dashStrings.xus, by index. */
  dashStrings(): Promise<string[]>;
  /** False in the state the footage is in, and the shell's default. */
  signedIn: boolean;
}

/**
 * Fill every runtime container inside one already-rendered scene. Safe to call
 * on any scene: a scene with none of the three is a no-op.
 */
export async function fillContainers(
  root: NodeRecord, host: FillHost,
): Promise<ContainerFill> {
  const out: ContainerFill = { filled: [], missing: [] };
  const banners: { node: NodeRecord; file: string }[] = [];
  const trays: NodeRecord[] = [];
  const walk = (n: NodeRecord) => {
    const o = n.obj;
    if (o.className === BOTD_CONTAINER_CLASS) {
      const file = str(o, 'DefaultBanner');
      if (file) banners.push({ node: n, file });
      else out.missing.push(`${idOf(o)}: XuiBOTDOfflineContainer with no DefaultBanner`);
    }
    if (str(o, 'ClassOverride') === TRAY_LOADER_CLASS) trays.push(n);
    n.children.forEach(walk);
  };
  walk(root);

  for (const b of banners) {
    const id = host.resolve(b.file);
    if (!id) { out.missing.push(`${idOf(b.node.obj)} -> ${b.file} (not in the manifest)`); continue; }
    if (await host.load(b.node, id)) out.filled.push(`${idOf(b.node.obj)} -> ${id}`);
    else out.missing.push(`${idOf(b.node.obj)} -> ${id} (did not render)`);
  }
  for (const t of trays) {
    if (await host.load(t, TRAY_SCENE)) out.filled.push(`${idOf(t.obj)} -> ${TRAY_SCENE}`);
    else out.missing.push(`${idOf(t.obj)} -> ${TRAY_SCENE} (did not render)`);
  }
  await fillLiveLabels(root, host, out);
  await fillTrayCaption(root, host, out);
  return out;
}

/** btn_Tray's caption. See DASH_STRING.openTray for the drive-state switch. */
async function fillTrayCaption(root: NodeRecord, host: FillHost, out: ContainerFill): Promise<void> {
  const btn = find(root, 'btn_Tray');
  if (!btn) return;
  const table = await host.dashStrings();
  const text = table[DASH_STRING.openTray];
  if (text === undefined) { out.missing.push(`${DASH_STRINGS_TABLE}[${DASH_STRING.openTray}] (tray caption)`); return; }
  setOwnerText(btn, text);
  out.filled.push(`btn_Tray -> ${DASH_STRINGS_TABLE}[${DASH_STRING.openTray}]`);
}

/**
 * DashLiveSignedOut's bind, 0x9228f478. setOwnerText, not a bare override: the
 * caption is drawn by a XuiTextPresenter inside btn_Gamercard, which reads the
 * OWNER's text, and the owner is captured when the visual is instantiated.
 */
async function fillLiveLabels(root: NodeRecord, host: FillHost, out: ContainerFill): Promise<void> {
  const sign = find(root, 'labSignInText');
  const found = find(root, 'labFoundProfiles');
  if (!sign && !found) return;
  const table = await host.dashStrings();
  const want = (i: number, what: string): string | null => {
    const v = table[i];
    if (v === undefined) { out.missing.push(`${DASH_STRINGS_TABLE}[${i}] (${what})`); return null; }
    return v;
  };
  if (sign) {
    // "Create Profile" while the console has none, "Sign In" once it has one.
    const i = host.signedIn ? DASH_STRING.signIn : DASH_STRING.createProfile;
    const text = want(i, 'gamercard caption');
    if (text !== null) { setOwnerText(sign, text); out.filled.push(`labSignInText -> ${DASH_STRINGS_TABLE}[${i}]`); }
  }
  if (found && !host.signedIn) {
    const text = want(DASH_STRING.noProfilesFound, 'profile count line');
    if (text !== null) {
      setOwnerText(found, text);
      out.filled.push(`labFoundProfiles -> ${DASH_STRINGS_TABLE}[${DASH_STRING.noProfilesFound}]`);
    }
  }
}

function str(o: XuObject, name: string): string {
  const v = propByName(o, name)?.value;
  return typeof v === 'string' ? v : '';
}

function find(root: NodeRecord, id: string): NodeRecord | null {
  let hit: NodeRecord | null = null;
  const walk = (n: NodeRecord) => { if (!hit) { if (idOf(n.obj) === id) hit = n; else n.children.forEach(walk); } };
  walk(root);
  return hit;
}
