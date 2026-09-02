// The six blades: what each one is, what colour it wears, where it rests, and
// which panel scene goes inside it.
//
// Every number here is read out of dashmain.xur or measured off the 6717
// footage; see reference/glue/BLADES_GLUE_SPEC.md sections 1 and 2.

export interface BladeDef {
  /** 1-based, matching the Tab<N> ids the console formats with "Tab%u". */
  tab: number;
  id: string;
  name: string;
  /** The blade_N_* palette this tab wears. It is NOT the tab index: the skins
   *  define blade_1..5 and they sit one behind, with Marketplace on blade_5. */
  colour: number;
  /** Path from RootScene to the empty XuiScene the panel loads into, or null
   *  when the panel is authored inline (System). */
  container: string | null;
  /** The frame RootScene rests on once this blade has arrived. */
  restFrame: number;
}

/**
 * DefaultTab is 2 and it is 1-BASED: the console comes up on Xbox LIVE, and
 * the ids really are Tab1..Tab6 (the code formats them with "Tab%u").
 * DefaultFocus "Tab1" is a focus target, a different property.
 */
export const DEFAULT_TAB = 2;

export const BLADES: readonly BladeDef[] = [
  { tab: 1, id: 'Tab1', name: 'Marketplace', colour: 5, container: 'Tab1/scMarketplace/scContainer', restFrame: 43 },
  { tab: 2, id: 'Tab2', name: 'Xbox LIVE', colour: 1, container: 'Tab2/scBlade/scContainer', restFrame: 21 },
  { tab: 3, id: 'Tab3', name: 'Games', colour: 2, container: 'Tab3/scBlade/scContainer', restFrame: 68 },
  { tab: 4, id: 'Tab4', name: 'Media', colour: 3, container: 'Tab4/scBlade/scContainer', restFrame: 118 },
  { tab: 5, id: 'Tab5', name: 'System', colour: 4, container: null, restFrame: 168 },
  { tab: 6, id: 'Tab6', name: 'OOBE', colour: 0, container: null, restFrame: 0 },
];

export const bladeByTab = (tab: number): BladeDef | undefined => BLADES.find((b) => b.tab === tab);

/** The blades a user can reach from home. Tab6 is OOBE and is not one of them. */
export const HOME_BLADES = BLADES.filter((b) => b.tab <= 5);

/**
 * Which panel scene goes into which container, offline with no profile - the
 * state the reference footage is in. The three variants a blade can have are
 * SignedOut / SignedIn / SignedInNL (signed in, not connected to Live).
 */
export type BladeState = 'SignedOut' | 'SignedIn' | 'SignedInNL';

export interface PanelChoice { scene: string | null }

export function panelSceneFor(tab: number, state: BladeState, iptv = false): string | null {
  switch (tab) {
    case 1: return state === 'SignedOut' ? 'blademp/marketplaceSignedOut.xur'
      : state === 'SignedInNL' ? 'blademp/marketplaceSignedInNL.xur' : 'blademp/marketplaceSignedIn.xur';
    case 2: return state === 'SignedOut' ? 'live/liveSignedOutUI.xur'
      : state === 'SignedInNL' ? 'live/liveSignedInNLUI.xur' : 'live/liveSignedInUI.xur';
    case 3: return state === 'SignedOut' ? 'gamesbla/gamesSignedOut.xur' : 'gamesbla/gamesSignedIn.xur';
    case 4: return state === 'SignedOut'
      ? (iptv ? 'mediabla/mediaSignedOutIPTV.xur' : 'mediabla/mediaSignedOut.xur')
      : (iptv ? 'mediabla/mediaSignedInIPTV.xur' : 'mediabla/mediaSignedIn.xur');
    // Tab5's panel is authored inline in dashmain as the DashScene "System";
    // Tab6 is OOBE and is not composed here.
    default: return null;
  }
}

/**
 * The eight adjacent switch ranges RootScene authors. There is no 1To3 and no
 * wrap: XuiTabScene can format "%uTo1" and "1To%u", but dashmain sets no Wrap
 * and authors no such range, and every switch in the footage is to a
 * neighbour. So a jump is impossible, not merely unimplemented.
 */
export function switchRange(from: number, to: number): { start: string; end: string } | null {
  if (Math.abs(from - to) !== 1) return null;
  if (from < 1 || to < 1 || from > 5 || to > 5) return null;
  return { start: `${from}To${to}`, end: `${from}To${to}End` };
}

/** The panel-level ranges. %u is always tabIndex + 1. */
export const levelRange = {
  open: (tab: number) => ({ start: `${tab}Open`, end: `${tab}OpenEnd` }),
  close: (tab: number) => ({ start: `${tab}Close`, end: `${tab}CloseEnd` }),
  /** Third level and deeper, in BOTH directions - not a content-refresh flash. */
  blink: (tab: number) => ({ start: `${tab}Blink`, end: `${tab}BlinkEnd` }),
};

/**
 * MEASURED off the 1080p stills: the blade page's left and right edges at
 * y=20, per blade. Page left advances about 72px per blade index. These are
 * the numbers the smoke gate compares our composition against.
 */
export const PAGE_EDGES_1080: Readonly<Record<number, { left: number; right: number; frame: string }>> = {
  1: { left: 148, right: 1507, frame: 'f0034' },
  2: { left: 228, right: 1577, frame: 'f0026' },
  3: { left: 292, right: 1643, frame: 'f0042' },
  4: { left: 368, right: 1713, frame: 'f0047' },
  5: { left: 436, right: 1757, frame: 'f0051' },
};
