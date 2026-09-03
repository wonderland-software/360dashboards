// Which controls on a hosted page can take focus, and where a page arrives.
//
// M4d collected a hosted page's rows as "every XuiNavButton whose Id starts
// with `nav`", which is true of `consoles/SystemScene.xur` and of nothing
// else: the seven Console Settings sub-pages author `btnDigital`,
// `btnOption1..4`, `btnStartup`..., `2004_NetworkDetails` authors `btn_IP`,
// `btn_DNS`..., and `dashSysCslSetMediaAutoLaunch` authors plain `XuiButton`s.
// All of them arrived with nothing to focus [COVERAGE N1].
//
// The console does not filter by name. XUI focus is authored: the scene's
// `DefaultFocus` names where focus lands, every focusable control names its
// neighbours in NavUp/NavDown/NavLeft/NavRight, and a control is focusable
// when it is shown and enabled (dashboards/blades/focus.ts). So the rows are
// the scene's own button controls that are on the page and enabled, and the
// arrival focus is the first `DefaultFocus` found walking the visible scene
// tree, or the head of the authored chain, or the first row from the top.
//
// The parked legend buttons - `legend_a/b/x/y` and the `btnA/btnB/btnX/btnY`
// on `PolicyInfo_System` and `PControlFamilyTimer`, which wear the `legend_*`
// visuals - are caption carriers for the LegendScene hoist (legend.ts) and
// never rows: they sit at y = 900..1300 in an 880x480 scene [SCENE]. They are
// told apart by their VISUAL, not their name, which is also how the console
// finds them (`legend_A`..`legend_Y` at .rdata 0x92013ab8..).
import { idOf, propByName, type XuObject } from '@xur/index';
import { PropBag, NO_OVERRIDES, authoredRect } from '@runtime/index';

export interface PageRow {
  id: string;
  obj: XuObject;
  /** Authored y in the page's own coordinates (nested scene offsets added). */
  y: number;
  text: string;
  pressPath: string | null;
  className: string;
}

export interface PageRows {
  rows: PageRow[];
  /** Where the page arrives: a row id, a LIST id, or null. */
  arrival: string | null;
  /** How `arrival` was chosen, for the report. */
  arrivalBy: 'DefaultFocus' | 'chain head' | 'first row' | 'list' | 'none';
  /** The list a DefaultFocus named, when it named one. */
  arrivalList: string | null;
}

const BUTTON_CLASSES = new Set(['XuiNavButton', 'XuiButton', 'XuiRadioButton', 'XuiCheckbox']);
const LIST_CLASSES = new Set(['XuiList', 'XuiCommonList', 'ScriptList']);

/** A parked legend carrier: wears a `legend_*` visual or is named for one. */
export function isLegendCarrier(o: XuObject): boolean {
  const visual = propByName(o, 'Visual')?.value;
  if (typeof visual === 'string' && /^legend_[abxy]$/i.test(visual)) return true;
  const id = idOf(o);
  return /^legend_[abxy]$/.test(id) || o.className === 'XuiBackButton';
}

function str(o: XuObject, name: string): string {
  const v = propByName(o, name)?.value;
  return typeof v === 'string' ? v : '';
}

/**
 * Collect the page's rows and its arrival focus.
 *
 * `hidden` names controls the glue has hidden (navIPTVSettings with no IPTV
 * provider); they are neither rows nor arrival candidates.
 */
export function collectPageRows(sceneRoot: XuObject, hidden: readonly string[] = []): PageRows {
  const rows: PageRow[] = [];
  const lists = new Set<string>();
  let defaultFocus: string | null = null;
  const size = PropBag.of(sceneRoot, NO_OVERRIDES);
  const height = size.num('Height', 480);

  const walk = (o: XuObject, ox: number, oy: number, root: boolean): void => {
    const id = idOf(o);
    if (!root) {
      // A hidden subtree (the inactive tab of a XuiTabScene) is not on screen.
      if (propByName(o, 'Show')?.value === false) return;
      if (id && hidden.includes(id)) return;
    }
    const r = authoredRect(PropBag.of(o, NO_OVERRIDES));
    const x = root ? 0 : ox + r.x;
    const y = root ? 0 : oy + r.y;
    // The first DefaultFocus down the visible tree wins: the root's, or a
    // nested scene's (2004_NetworkDetails' Tab1 names btn_IP).
    if (defaultFocus === null) {
      const df = str(o, 'DefaultFocus');
      if (df) defaultFocus = df.slice(df.lastIndexOf('\\') + 1);
    }
    if (!root && id) {
      if (LIST_CLASSES.has(o.className)) lists.add(id);
      else if (BUTTON_CLASSES.has(o.className) && !isLegendCarrier(o)
        && propByName(o, 'Enabled')?.value !== false && y >= 0 && y < height) {
        rows.push({ id, obj: o, y, text: str(o, 'Text'), pressPath: str(o, 'PressPath') || null, className: o.className });
      }
    }
    for (const c of o.children) walk(c, x, y, false);
  };
  walk(sceneRoot, 0, 0, true);
  rows.sort((a, b) => a.y - b.y);

  const ids = new Set(rows.map((r) => r.id));
  const df: string | null = defaultFocus;
  if (df && lists.has(df)) return { rows, arrival: df, arrivalBy: 'list', arrivalList: df };
  if (df && ids.has(df)) return { rows, arrival: df, arrivalBy: 'DefaultFocus', arrivalList: null };
  // A DefaultFocus that names a scene (dashSysCslSetClockTime's scDate) or a
  // control that is not a row: fall through to the chain.
  const head = rows.find((r) => str(r.obj, 'NavDown') && !str(r.obj, 'NavUp'));
  if (head) return { rows, arrival: head.id, arrivalBy: 'chain head', arrivalList: null };
  if (rows.length) return { rows, arrival: rows[0]!.id, arrivalBy: 'first row', arrivalList: null };
  // No rows: a list page with no DefaultFocus lands on its first list.
  const firstList = [...lists][0] ?? null;
  if (firstList) return { rows, arrival: firstList, arrivalBy: 'list', arrivalList: firstList };
  return { rows, arrival: null, arrivalBy: 'none', arrivalList: null };
}

/** The control on the page bound to a pad button through `PressKey`. */
export const PRESS_KEYS = { X: 22530, Y: 22531, B: 22593 } as const;

export function findPressKey(sceneRoot: XuObject, key: number): XuObject | null {
  let found: XuObject | null = null;
  const walk = (o: XuObject): void => {
    if (found) return;
    if (propByName(o, 'PressKey')?.value === key) { found = o; return; }
    o.children.forEach(walk);
  };
  walk(sceneRoot);
  return found;
}

/**
 * A `XuiBackButton` that authors no `PressKey`: the class is bound to B on
 * the console, so it is B's carrier when nothing on the page names 0x5841.
 * 62 of the build's 70 back buttons author the key; the eight that do not are
 * network/2008_ActivateConfiguration, 2030_ConfirmAction, 2032_connecNow,
 * 2040_Ad-HocWirelessSecurity and download/2407_WaitingScreen,
 * 2410_AttemptingOldSoftware, AcquiringNetworkSettings [SCENE] (M4f).
 */
export function findBackButton(sceneRoot: XuObject): XuObject | null {
  let found: XuObject | null = null;
  const walk = (o: XuObject): void => {
    if (found) return;
    if (o.className === 'XuiBackButton') { found = o; return; }
    o.children.forEach(walk);
  };
  walk(sceneRoot);
  return found;
}

/**
 * An authoring token the console overwrote before the control was shown:
 * "<setting>", "<servicename>", "<#> of <Total #>", "<current settings>\n2\n3".
 * The Blades regex (consoleSettings.ts AUTHORING_PLACEHOLDER) takes a Text
 * that is ONE token; 9199's `memory/DeviceSelector.labTotal` and the network
 * pages compose two tokens with a word or a digit between them, so the rule
 * here is: at least one token, and nothing but tokens, whitespace, digits,
 * punctuation and the connective "of" around it. HTML bodies (`<font ...>`)
 * are not tokens: they carry sentences.
 */
export const TOKEN = /<[^<>\r\n]{1,40}>/g;
export function isAuthoringToken(text: string): boolean {
  if (!/<[^<>\r\n]{1,40}>/.test(text)) return false;
  const rest = text.replace(TOKEN, '').replace(/\bof\b/gi, '').replace(/[\s\d\W]/g, '');
  return rest.length === 0;
}
