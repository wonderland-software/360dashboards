// The pure parts of the blade glue: the panel-string format, the metapane
// index rules, and the switch/level range names. No DOM, no dev server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitPanelList, metaRange, metaPressRange, PANEL_SEPARATOR } from '@dash/blades/panels';
import { switchRange, levelRange, BLADES, HOME_BLADES, DEFAULT_TAB, bladeByTab, panelSceneFor } from '@dash/blades/tabs';
import { CONSOLE_SETTINGS_ROWS, CONSOLE_SETTINGS_FOCUS } from '@dash/blades/consoleSettings';
import { SYSTEM_NAV, systemNavRows, IPTV_ROW } from '@dash/blades/nav';
import { BOOT_RANGES, DEFAULT_BOOT, BOOT_CUES, BOOT_HANDOVER_FRAME } from '@dash/blades/boot';
import { FocusModel } from '@dash/blades/focus';
import { xuiRegistry } from '@runtime/index';
import type { XuObject, XuProperty } from '@xur/index';

const NUL = String.fromCharCode(0);

test('the panel separator is backslash-zero, not a NUL byte', () => {
  assert.equal(PANEL_SEPARATOR, '\\0');
  assert.equal(PANEL_SEPARATOR.length, 2);
  assert.equal(PANEL_SEPARATOR.charCodeAt(0), 0x5c);
  assert.equal(PANEL_SEPARATOR.charCodeAt(1), 0x30);
  // dashmain's System blade, verbatim
  const settings = 'navSettings\\0navPControls\\0navMemory';
  assert.deepEqual(splitPanelList(settings), ['navSettings', 'navPControls', 'navMemory']);
  // splitting on a real NUL is the classic mistake: one entry, and the
  // property looks like a single unsplittable string
  assert.equal(settings.split(NUL).length, 1);
});

test('an empty entry is meaningful; only a trailing separator is dropped', () => {
  // PanelScenePaths is all-empty on the System blade: eight rows, no scenes.
  assert.deepEqual(splitPanelList('\\0\\0\\0\\0\\0\\0\\0'), ['', '', '', '', '', '', '']);
  assert.deepEqual(splitPanelList('a\\0\\0c'), ['a', '', 'c']);
  assert.deepEqual(splitPanelList('a\\0b\\0'), ['a', 'b']);
  assert.deepEqual(splitPanelList(''), []);
});

test('MetaPanelScene::GotoIndex - adjacent animates, a jump snaps, and it is 1-based', () => {
  assert.deepEqual(metaRange(0, 1), { start: '1To2', end: '1To2End' });
  assert.deepEqual(metaRange(4, 3), { start: '5To4', end: '5To4End' });
  // a jump plays the End frame ALONE: no animation, just the destination
  assert.deepEqual(metaRange(0, 5), { start: '5To6End' });
  assert.deepEqual(metaRange(8, 2), { start: '2To3End' });
  // a jump to index 0 has its own literal
  assert.deepEqual(metaRange(4, 0), { start: '2To1End' });
  // no index at all
  assert.deepEqual(metaRange(3, -1), { start: 'Default', end: 'Default' });
  // first focus of all: prev is -1, so index 0 is not "adjacent"
  assert.deepEqual(metaRange(-1, 0), { start: '2To1End' });
  assert.deepEqual(metaPressRange(0), { start: '1Press', end: '1EndPress' });
});

test('only adjacent blade switches exist - no jump and no wrap', () => {
  assert.deepEqual(switchRange(1, 2), { start: '1To2', end: '1To2End' });
  assert.deepEqual(switchRange(5, 4), { start: '5To4', end: '5To4End' });
  assert.equal(switchRange(1, 3), null, 'dashmain authors no 1To3');
  assert.equal(switchRange(5, 1), null, 'and no wrap');
  assert.equal(switchRange(5, 6), null, 'Tab6 is OOBE, not a blade you switch to');
  const names: string[] = [];
  for (let a = 1; a <= 5; a++) for (let b = 1; b <= 5; b++) {
    const r = switchRange(a, b);
    if (r) names.push(r.start);
  }
  assert.deepEqual(names.sort(), ['1To2', '2To1', '2To3', '3To2', '3To4', '4To3', '4To5', '5To4']);
});

test('the level ranges use tabIndex + 1, and Blink is the deep level both ways', () => {
  assert.deepEqual(levelRange.open(5), { start: '5Open', end: '5OpenEnd' });
  assert.deepEqual(levelRange.close(5), { start: '5Close', end: '5CloseEnd' });
  assert.deepEqual(levelRange.blink(1), { start: '1Blink', end: '1BlinkEnd' });
});

test('the colour index sits one behind the tab index, and is not derivable', () => {
  // The skins define blade_1..5; they do NOT line up with Tab1..Tab5.
  assert.deepEqual(BLADES.slice(0, 5).map((b) => [b.name, b.colour]), [
    ['Marketplace', 5], ['Xbox LIVE', 1], ['Games', 2], ['Media', 3], ['System', 4],
  ]);
  assert.equal(bladeByTab(1)?.colour, 5, 'Marketplace wears blade_5, the burnt orange');
});

test('DefaultTab 2 is 1-based: the console comes up on Xbox LIVE', () => {
  assert.equal(DEFAULT_TAB, 2);
  assert.equal(bladeByTab(DEFAULT_TAB)?.name, 'Xbox LIVE');
  assert.equal(HOME_BLADES.length, 5, 'Tab6 is OOBE and is not reachable from home');
});

test('rest frames are the End frames of the ranges that arrive at each blade', () => {
  assert.deepEqual(BLADES.slice(0, 5).map((b) => b.restFrame), [43, 21, 68, 118, 168]);
});

test('offline with no profile, each blade loads its SignedOut panel', () => {
  assert.equal(panelSceneFor(1, 'SignedOut'), 'blademp/marketplaceSignedOut.xur');
  assert.equal(panelSceneFor(2, 'SignedOut'), 'live/liveSignedOutUI.xur');
  assert.equal(panelSceneFor(3, 'SignedOut'), 'gamesbla/gamesSignedOut.xur');
  assert.equal(panelSceneFor(4, 'SignedOut'), 'mediabla/mediaSignedOut.xur');
  assert.equal(panelSceneFor(4, 'SignedOut', true), 'mediabla/mediaSignedOutIPTV.xur');
  assert.equal(panelSceneFor(5, 'SignedOut'), null, "System's panel is authored inline");
  assert.equal(panelSceneFor(2, 'SignedInNL'), 'live/liveSignedInNLUI.xur');
  assert.equal(panelSceneFor(3, 'SignedInNL'), 'gamesbla/gamesSignedIn.xur');
});

test('Console Settings is an 11-row code table in the executable, not scene data', () => {
  assert.equal(CONSOLE_SETTINGS_ROWS.length, 11);
  assert.deepEqual(CONSOLE_SETTINGS_ROWS.map((r) => r.label),
    [529, 527, 537, 530, 528, 531, 535, 534, 533, 532, 536]);
  // Themes is the only row with no destination scene
  assert.deepEqual(CONSOLE_SETTINGS_ROWS.map((r, i) => (r.scene ? null : i)).filter((v) => v !== null), [2]);
  assert.equal(CONSOLE_SETTINGS_ROWS[CONSOLE_SETTINGS_FOCUS]?.label, 531, 'f0060 has Locale focused');
});

test('the System nav list is 8 rows, 7 of them without an IPTV provider', () => {
  assert.equal(SYSTEM_NAV.length, 8);
  assert.equal(systemNavRows(false).length, 7);
  assert.equal(systemNavRows(false).some((r) => r.id === IPTV_ROW), false);
  assert.equal(systemNavRows(true).length, 8);
  // The code names the pack, the XUR names the file - and they differ:
  // navNetwork sits in dashmain but ConnStatus.xur exists only in network.
  assert.equal(SYSTEM_NAV.find((r) => r.id === 'navNetwork')?.pack, 'network');
  assert.equal(SYSTEM_NAV.find((r) => r.id === 'navMemory')?.pack, 'memory');
  // navSystemSetUp never navigates: it raises a dialog and runs the OOBE
  assert.equal(SYSTEM_NAV.find((r) => r.id === 'navSystemSetUp')?.pressPath, null);
});

/* ------------------------------------------------------------------ boot */

test('every boot range is one of RootScene\'s authored pairs, with a 0-based tab', () => {
  // The frames are RootScene's own named frames; the ranges are contiguous and
  // never overlap, which is what a mis-copied table would break.
  const sorted = [...BOOT_RANGES].sort((a, b) => a.from - b.from);
  for (let i = 1; i < sorted.length; i++) {
    assert.ok(sorted[i]!.from > sorted[i - 1]!.to,
      `${sorted[i]!.name} starts at ${sorted[i]!.from}, inside ${sorted[i - 1]!.name}`);
  }
  for (const r of BOOT_RANGES) {
    assert.equal(r.end, 'End' + r.name, 'boot pairs are End<Name>, not <Name>End');
    assert.ok(r.tab >= 0 && r.tab <= 5, `${r.name} tab ${r.tab} is out of range`);
    assert.ok(r.to > r.from, `${r.name} is not a range`);
  }
  const live = BOOT_RANGES.find((r) => r.name === DEFAULT_BOOT)!;
  // 71 frames at 60 Hz = 1.18 s, against 73 presented frames (1.22 s) measured
  // on the capture - the strongest single confirmation of the 60 Hz clock.
  assert.equal(live.to - live.from, 71);
  assert.equal(live.tab, 1, '0-based: tab 1 is Tab2, Xbox LIVE');
  assert.equal(live.from, BOOT_HANDOVER_FRAME);
  // BootLive fires exactly one cue, and it is inside the range.
  const cue = BOOT_CUES[DEFAULT_BOOT]!;
  assert.equal(cue.length, 1);
  assert.ok(cue[0]!.frame > live.from && cue[0]!.frame < live.to);
});

/* ----------------------------------------------------------------- focus */

const prop = (name: string, value: XuProperty['value'], className = 'XuiNavButton'): XuProperty => {
  const reg = xuiRegistry();
  for (const cls of reg.hierarchy(className)) {
    const d = cls.props.find((x) => x.name === name);
    if (d) return { def: d, value };
  }
  throw new Error(`no property ${name} on ${className}`);
};
const obj = (className: string, props: XuProperty[], children: XuObject[] = []): XuObject =>
  ({ className, properties: props, children, namedFrames: [], timelines: [] });

/** dashmain's System chain, verbatim: a linked list with no wrap, and no
 *  NavLeft/NavRight on it because left and right are the blade switch there. */
function systemScene(hidden: string[] = []): { scene: XuObject; model: FocusModel } {
  const ids = ['navSettings', 'navPControls', 'navMemory', 'navNetwork'];
  const rows = ids.map((id, i) => {
    const p = [prop('Id', id)];
    if (i > 0) p.push(prop('NavUp', ids[i - 1]!));
    if (i < ids.length - 1) p.push(prop('NavDown', ids[i + 1]!));
    return obj('XuiNavButton', p, [obj('XuiTextPresenter', [prop('Id', `txt_${id}`)])]);
  });
  const scene = obj('DashScene',
    [prop('Id', 'System'), prop('DefaultFocus', 'navSettings', 'DashScene')], rows);
  const byId = new Map(rows.map((r) => [String(r.properties[0]!.value), r]));
  const model = new FocusModel(scene, {
    object: (id) => (id === 'System' ? scene : byId.get(id) ?? findDeep(scene, id)),
    focusable: (id) => !hidden.includes(id),
    override: () => null,
  });
  return { scene, model };
}
function findDeep(root: XuObject, id: string): XuObject | undefined {
  let found: XuObject | undefined;
  const walk = (o: XuObject) => {
    if (found) return;
    if (o.properties.some((p) => p.def.name === 'Id' && p.value === id)) found = o;
    else o.children.forEach(walk);
  };
  walk(root);
  return found;
}

test('focus walks the authored chain and stops at both ends - no wrap, no search', () => {
  const { model } = systemScene();
  assert.equal(model.defaultFocus, 'navSettings');
  model.set(model.defaultFocus);
  assert.equal(model.move('Down'), 'navPControls');
  assert.equal(model.move('Down'), 'navMemory');
  assert.equal(model.move('Down'), 'navNetwork');
  // The last row has no NavDown, so the press is absorbed. null is what tells
  // the caller nothing happened - which is why a held d-pad at the end of a
  // list is silent on the console.
  assert.equal(model.move('Down'), null);
  assert.equal(model.move('Up'), 'navMemory');
  // No BLADE page sets NavLeft or NavRight: that axis is the blade switch and
  // XuiTabScene owns it (deeper scenes do, see the focus test below).
  assert.equal(model.move('Left'), null);
  assert.equal(model.move('Right'), null);
});

test('a hidden row is stepped over, not focused', () => {
  const { model } = systemScene(['navMemory']);
  model.set('navPControls');
  assert.equal(model.move('Down'), 'navNetwork', 'the chain skips the hidden row');
});

test('the focus chain is walked UP, so a presenter inside a button finds its row', () => {
  const { model } = systemScene();
  const chain = model.chain('txt_navMemory').map((o) =>
    o.properties.find((p) => p.def.name === 'Id')?.value);
  assert.deepEqual(chain, ['txt_navMemory', 'navMemory', 'System'],
    'the console compares each Id up the parent chain against the DashScene entry table');
});

/* --------------------------------------------------- the settings model (M3e) */

import {
  OPTION_PAGES, PARENT_LABELS, RATING_PAGES, INITIAL_SETUP_DIALOG, REFERENCE_STATE_SOURCES,
  referenceState, unknownSettings, consoleSettingsCurrent, displayCurrentSetting, ratingTableFor,
  formatTime, formatDate, SCREENSAVER_OFF, SCREENSAVER_ON, AUTO_OFF_ON,
} from '@dash/blades/settingsModel';
import { clockSpinners, DYNAMIC_LISTS, CODE_LISTS, LISTS_DISABLED_OFFLINE } from '@dash/blades/codeLists';
import { CODE_PRESS_PATHS } from '@dash/blades/nav';
import { RATING_CATEGORY_GAME, RATING_CATEGORY_MOVIE, RATING_CATEGORY_TV } from '@dash/blades/pcontrolSettings';
import { TIMEZONE_ROWS } from '@dash/blades/localeSettings';

test('twenty option pages plus the camera page, each with rows that map to values and a label rule', () => {
  // The audit's twenty-first, dashSysLiveVision, is not an option page on
  // this console: its three choosers are disabled without a camera
  // (LISTS_DISABLED_OFFLINE), so A on it does nothing, as on the console.
  const pages = Object.values(OPTION_PAGES);
  assert.equal(pages.length, 20);
  assert.ok(LISTS_DISABLED_OFFLINE['consoles/dashSysLiveVision.xur']);
  for (const p of pages) {
    assert.ok(p.rows.length >= 2, `${p.scene} has ${p.rows.length} rows`);
    assert.ok(p.va.init > 0x92100000 && p.va.press > 0x92100000, `${p.scene} VAs`);
    const values = new Set(p.rows.map((r) => r.value));
    assert.equal(values.size, p.rows.length, `${p.scene}: every row writes a different value`);
    if (p.list) assert.ok(p.rows.every((r) => r.control.startsWith(`${p.list}_item`)), `${p.scene}: list rows are ${p.list}_itemN`);
  }
});

test('the reference console\'s state is what the 6717 stills show, and every value cites its frame', () => {
  const s = referenceState();
  assert.equal(s.startup, 'dashboard');                 // f0061 "Xbox Dashboard"
  assert.equal(s.autoOff, 0);                            // f0062 "Auto-Off Disabled"
  assert.equal(s.backgroundDownloads, true);             // f0062
  assert.equal(s.screensaver, SCREENSAVER_ON);           // f0063
  assert.equal(s.remote, 0);                             // f0064 "All Channels"
  assert.equal(s.digitalOutput, 1);                      // f0055 "Dolby Digital"
  assert.equal(s.soundEffectsOff, false);
  assert.equal(s.locale, 35);                            // f0060 "United Kingdom"
  assert.equal(s.language, 1);                           // f0057 "English"
  assert.equal(TIMEZONE_ROWS[s.timeZone!]?.label, 278);  // f0059 "GMT+00 London"
  assert.equal(s.clock24h, true);                        // f0059 "12:00", no AM/PM
  assert.equal(s.widescreen, true);                      // f0053
  assert.equal(s.referenceLevel, 3);                     // f0053 "Standard"
  assert.equal(s.dstOff, null, 'the DST bit is not in any frame');
  assert.ok(Object.values(s.parental).every((v) => v === null), 'no capture enters Family Settings');
  assert.ok(REFERENCE_STATE_SOURCES.every((r) => /^6717\/f00\d\d/.test(r.frame)));
  assert.equal(unknownSettings(s).length, 2);
});

test('an option page arrives on the row of its current value, and A writes the row\'s value', () => {
  const s = referenceState();
  const startup = OPTION_PAGES['consoles/dashSysCslSetStartUp.xur']!;
  assert.equal(startup.rows.find((r) => r.value === startup.current(s))?.control, 'btnDashboard');
  assert.deepEqual(startup.label(s), { idx: 538 });
  startup.write(s, 0);
  assert.equal(s.startup, 'disc');
  assert.deepEqual(startup.label(s), { idx: 539 });

  const ss = OPTION_PAGES['consoles/dashSysCslSetScreensaver.xur']!;
  assert.equal(ss.rows.find((r) => r.value === ss.current(s))?.control, 'btnOn');
  ss.write(s, SCREENSAVER_OFF);
  assert.deepEqual(ss.label(s), { idx: 130 });

  const ao = OPTION_PAGES['consoles/dashSysCslSetAutoOff.xur']!;
  assert.equal(ao.rows.find((r) => r.value === ao.current(s))?.control, 'btnOff');
  ao.write(s, AUTO_OFF_ON);
  assert.deepEqual(ao.label(s), { idx: 153 });

  const digital = OPTION_PAGES['consoles/dashSysCslSetAudioDigital.xur']!;
  assert.equal(digital.rows[digital.current(s)!]?.control, 'listOptions_item1');
  assert.deepEqual(digital.label(s), { idx: 36 });
  digital.write(s, 2);
  assert.deepEqual(digital.label(s), { idx: 38 });

  const levels = OPTION_PAGES['consoles/dashSysCslSetOutputLevels.xur']!;
  assert.equal(levels.rows.find((r) => r.value === 3)?.control, 'btnStandard');
  assert.equal(levels.rows.find((r) => r.value === 1)?.control, 'btnExpanded');
  assert.deepEqual(levels.label(s), { idx: 374 });

  // unknown = the failed-read path: no row, no label
  const dst = OPTION_PAGES['consoles/dashSysCslSetClockDaylightSavings.xur']!;
  assert.equal(dst.current(s), null);
  assert.equal(dst.label(s), null);
  dst.write(s, 1);
  assert.deepEqual(dst.label(s), { idx: 94 });
  // a time zone without a daylight rule turns DST off, as 0x921ca070 does
  const tz = OPTION_PAGES['consoles/dashSysCslSetClockTimeZone.xur']!;
  const noDst = TIMEZONE_ROWS.findIndex((r) => !r.observesDst);
  tz.write(s, noDst);
  assert.equal(s.dstOff, true);
});

test('the yes/no parental pages store 0xff for btnNo and 0 for btnYes, labelled from the 0x92013adc pairs', () => {
  const s = referenceState();
  const liveA = OPTION_PAGES['consoles/dashSysCslSetPControlLiveA.xur']!;
  assert.equal(liveA.rows.find((r) => r.control === 'btnNo')?.value, 0xff);
  assert.equal(liveA.current(s), null);
  liveA.write(s, 0xff);
  assert.deepEqual(liveA.label(s), { idx: 400 });   // Allowed
  liveA.write(s, 0);
  assert.deepEqual(liveA.label(s), { idx: 401 });   // Blocked
  const content = OPTION_PAGES['consoles/dashSysCslSetPControlContent.xur']!;
  content.write(s, 0xff);
  assert.deepEqual(content.label(s), { idx: 409 }); // Hide Restricted Content
  content.write(s, 0);
  assert.deepEqual(content.label(s), { idx: 408 }); // Show All Content
});

test('Background Downloads: Enable is gated behind a xam message box, Disable is not', () => {
  const s = referenceState();
  const bg = OPTION_PAGES['consoles/dashSysCslSetBackgroundDownloads.xur']!;
  assert.equal(bg.dialog!(s, 0), null, 'Disable writes outright');
  assert.equal(bg.dialog!(s, 1), null, 'Enable when already enabled: nothing to ask');
  bg.write(s, 0);
  const d = bg.dialog!(s, 1)!;
  assert.deepEqual([d.title, d.body], [{ idx: 42 }, { idx: 41 }]);
  assert.equal(d.buttons.length, 2);
  assert.equal(d.va, 0x921a63f0);
  assert.equal(INITIAL_SETUP_DIALOG.va, 0x92114a98);
  assert.deepEqual(INITIAL_SETUP_DIALOG.buttons.map((b) => ('idx' in b ? b.idx : -1)), [177, 178]);
});

test('Console Settings\' eleven Current Setting providers follow the state', () => {
  const s = referenceState();
  const lines = (row: number) => consoleSettingsCurrent(row, s, false).lines;
  assert.deepEqual(lines(0), [{ idx: 217 }, { idx: 197 }, { idx: 374 }]);   // 1080p / Widescreen / Standard
  assert.deepEqual(lines(1), [{ idx: 36 }, { idx: 40 }]);                   // Dolby Digital / Sound Effects Enabled
  assert.deepEqual(lines(2), [{ idx: 126 }]);                               // Xbox 360 (Default)
  assert.deepEqual(lines(3), [{ idx: 141 }]);                               // English
  assert.equal(lines(4).length, 2);                                          // date time / GMT+00 London
  assert.deepEqual(lines(4)[1], { idx: 278 });
  assert.deepEqual(lines(5), [{ idx: 198 }]);                               // United Kingdom
  assert.deepEqual(lines(6), [{ idx: 538 }]);                               // Xbox Dashboard
  assert.deepEqual(lines(7), [{ idx: 127 }, { idx: 154 }]);                 // Auto-Off Disabled / Background Downloads Enabled
  assert.deepEqual(lines(8), [{ idx: 156 }]);                               // Screen Saver Enabled
  assert.deepEqual(lines(9), [{ idx: 244 }]);                               // All Channels
  assert.deepEqual(lines(10), []);                                           // System Info is the version string
  OPTION_PAGES['consoles/dashSysCslSetStartUp.xur']!.write(s, 2);
  assert.deepEqual(lines(6), [{ idx: 541 }]);                               // Media Center
  const d = displayCurrentSetting(s);
  assert.equal(d.metaPane, 'metaPane_DisplayWidescreen.xur');
  OPTION_PAGES['consoles/dashSysCslSetDisplayFormat.xur']!.write(s, 0);
  assert.equal(displayCurrentSetting(s).metaPane, 'metaPane_DisplayNormal.xur');
  assert.equal(consoleSettingsCurrent(2, s, true).lines.length, 0, 'a dash user\'s theme is not readable');
});

test('the parent pages label the focused row from the same rules', () => {
  const s = referenceState();
  assert.deepEqual(PARENT_LABELS['consoles/dashSysCslSetShutdown.xur']!.by['btnAutoOff']!(s), { idx: 127 });
  assert.deepEqual(PARENT_LABELS['consoles/dashSysCslSetAudio.xur']!.by['btnSoundEffects']!(s), { idx: 40 });
  assert.deepEqual(PARENT_LABELS['consoles/dashSysCslSetClock.xur']!.by['btnOption3']!(s), { idx: 278 });
  assert.equal(PARENT_LABELS['consoles/dashSysCslSetClock.xur']!.by['btnOption4']!(s), null);
  assert.deepEqual(PARENT_LABELS['consoles/dashSysCslSetPControlVideo.xur']!.by['btnTV']!(s), { idx: 427 }, 'no TV system for the UK: "<None>"');
  assert.equal(PARENT_LABELS['consoles/dashSysCslSetPControlVideo.xur']!.by['btnMovie']!(s), null, 'a movie system exists but the staged value is unknown');
  s.parental.movie = 40;
  assert.deepEqual(PARENT_LABELS['consoles/dashSysCslSetPControlVideo.xur']!.by['btnMovie']!(s), { idx: 557 }, 'BBFC 15');
});

test('the rating lists come from the locale: UK games are PEGI+BBFC, movies BBFC, TV none', () => {
  const s = referenceState();
  assert.equal(ratingTableFor(s.locale, RATING_CATEGORY_GAME)?.system, 4);
  assert.equal(ratingTableFor(s.locale, RATING_CATEGORY_MOVIE)?.system, 2);
  assert.equal(ratingTableFor(s.locale, RATING_CATEGORY_TV), null);
  assert.equal(ratingTableFor(103, RATING_CATEGORY_TV)?.system, 0, 'the United States has a TV system');
  const game = DYNAMIC_LISTS['consoles/dashSysCslSetPControlGame.xur']!({ settings: s, now: new Date() });
  assert.equal(game[0]?.rows.length, 9);
  assert.equal(game[0]?.rows[0]?.label, 569, 'Allow All Games first');
  assert.equal(game[0]?.rows[1]?.image, 'PEGI_18P.png');
  assert.deepEqual(DYNAMIC_LISTS['consoles/dashSysCslSetPControlVideoTV.xur']!({ settings: s, now: new Date() }), []);
  assert.equal(Object.keys(RATING_PAGES).length, 3);
});

test('the clock spinners are the sprintf ranges parked on the clock', () => {
  const now = new Date(2026, 8, 3, 23, 7);   // 3 September 2026, 23:07
  const lists = clockSpinners(now, true);
  const by = Object.fromEntries(lists.map((l) => [l.list, l]));
  assert.equal(by['lstHour']!.rows.length, 24);
  assert.equal(by['lstHour']!.rows[23]!.text, '23');
  assert.equal(by['lstHour']!.initialIndex, 23);
  assert.equal(by['lstMin']!.rows.length, 60);
  assert.equal(by['lstMin']!.rows[7]!.text, '07');
  assert.equal(by['lstDay']!.rows.length, 30, 'September');
  assert.equal(by['lstDay']!.initialIndex, 2);
  assert.equal(by['lstMonth']!.rows[8]!.text, '09');
  assert.equal(by['lstYear']!.rows.length, 21);
  assert.equal(by['lstYear']!.rows[0]!.text, '2005');
  assert.equal(by['lstYear']!.initialIndex, 20, '2026 clamps to the table\'s 2025');
  assert.equal(by['lstAMPM']!.rows.length, 0, 'authored rows, only parked');
  assert.equal(by['lstAMPM']!.initialIndex, 1);
  const h12 = clockSpinners(now, false);
  assert.equal(h12.find((l) => l.list === 'lstHour')!.rows.length, 12);
  assert.equal(h12.find((l) => l.list === 'lstHour')!.initialIndex, 10, '23 -> 11');
  assert.equal(formatTime(now, true), '23:07');
  assert.equal(formatTime(now, false), '11:07 PM');
  assert.equal(formatDate(now), '03/09/2026');
});

test('the family timer with no timer is one row, and the camera page is disabled without a camera', () => {
  assert.deepEqual(CODE_LISTS['consoles/dashSysCslSetPControlFamilyTimer.xur']![0]!.rows.map((r) => r.label), [383]);
  assert.deepEqual(LISTS_DISABLED_OFFLINE['consoles/dashSysLiveVision.xur']!.lists, ['BrightnessSetting', 'LightingSetting', 'FlickerSetting']);
});

test('code press paths name scenes that exist in the pack inventory, or nothing', () => {
  for (const [k, v] of Object.entries(CODE_PRESS_PATHS)) {
    assert.ok(k.includes('#'), k);
    if (v.scene) assert.ok(/^(dashcomm|oobe)\//.test(v.scene), `${k} -> ${v.scene}`);
    assert.ok(v.note.length > 20);
  }
  assert.equal(CODE_PRESS_PATHS['mediabla/mediaSignedOut.xur#navMusic']!.scene, 'dashcomm/MediaSourceSelection.xur');
  assert.equal(CODE_PRESS_PATHS['gamesbla/gamesSignedOut.xur#navCreateProfile']!.scene, 'oobe/oobeProfileCreation.xur');
});

test('focus: a NavLeft/NavRight authored deeper in the tree is honoured, an empty one falls back to the parent', () => {
  const lstYear = obj('XuiList', [prop('Id', 'lstYear', 'XuiList'), prop('NavLeft', 'lstMonth', 'XuiList'), prop('NavRight', '', 'XuiList')]);
  const scDate = obj('XuiScene', [prop('Id', 'scDate', 'XuiScene'), prop('NavRight', 'scTime', 'XuiScene')], [lstYear]);
  const lstHour = obj('XuiList', [prop('Id', 'lstHour', 'XuiList'), prop('NavRight', 'lstMin', 'XuiList')]);
  const lstMin = obj('XuiList', [prop('Id', 'lstMin', 'XuiList'), prop('NavLeft', 'lstHour', 'XuiList')]);
  const scTime = obj('XuiScene', [prop('Id', 'scTime', 'XuiScene'), prop('NavLeft', 'scDate', 'XuiScene')], [lstHour, lstMin]);
  const scene = obj('XuiScene', [prop('Id', 'SceneMain', 'XuiScene')], [scDate, scTime]);
  const over = new Map<string, string>([['lstYear/NavRight', '']]);   // what dashCDate's field-order timeline writes
  const model = new FocusModel(scene, {
    object: (id) => findDeep(scene, id) ?? (id === 'SceneMain' ? scene : undefined),
    focusable: () => true,
    override: (id, p) => over.get(`${id}/${p}`) ?? null,
  });
  model.set('lstYear');
  assert.equal(model.move('Right'), 'scTime', 'the parent scene\'s NavRight carries the move');
  model.set('lstHour');
  assert.equal(model.move('Right'), 'lstMin');
  assert.equal(model.move('Left'), 'lstHour');
  assert.equal(model.move('Left'), 'scDate', 'and back through the parent');
  // the IPTV chain repair: an empty NavDown with no parent NavDown ends the chain
  const { model: sys } = systemScene();
  sys.set('navNetwork');
  assert.equal(sys.move('Down'), null);
});

/* ------------------------------------------------- M3f: Judge E round 3 fixes */

import { existsSync, readFileSync } from 'node:fs';
import { transitionId, transitionKey } from '@dash/blades/transitions';
import { keyCarrierOf, PRESS_KEY } from '@dash/blades/BladeShell';
import { rowSpan, templateOf, pathOf, Anchor, type NodeRecord } from '@runtime/index';
import { TIMEZONE_ROWS as TZ_ROWS } from '@dash/blades/localeSettings';

/** A NodeRecord stub with only what `pathOf` reads: the object's Id, the mount
 *  key and the parent link. Nothing here renders. */
function rec(id: string, parentNode?: NodeRecord, pathKey?: string): NodeRecord {
  const o = obj('XuiScene', [prop('Id', id, 'XuiScene')]);
  return { obj: o, parentNode, ...(pathKey ? { pathKey } : {}) } as unknown as NodeRecord;
}

test('a transition is keyed by the node PATH, so two scenes with one Id never share a scope [Judge E round 3, finding 2]', () => {
  // Four clock pages carry the scene Id scClockSettings and the two pass-code
  // pages carry scRating. Hosted under one TabN, keyed by Id, they are the
  // same string - which is what popped the parent's FadeIn with the child.
  const tab = rec('Tab5');
  const bare1 = rec('scClockSettings', rec('XuiCanvas', tab));
  const bare2 = rec('scClockSettings', rec('XuiCanvas', tab));
  assert.equal(pathOf(bare1), pathOf(bare2), 'without a mount key the two paths ARE the same - the bug');

  // Every BladeShell.renderInto mount gives its root a pathKey, so they are not.
  const clock = rec('scClockSettings', rec('XuiCanvas', tab, 'XuiCanvas@dashSysCslSetClock.xur#3'));
  const format = rec('scClockSettings', rec('XuiCanvas', tab, 'XuiCanvas@dashSysCslSetClockFormat.xur#4'));
  assert.notEqual(transitionKey(clock), transitionKey(format));
  assert.ok(transitionKey(clock).endsWith('/scClockSettings'), transitionKey(clock));
  for (const role of ['in', 'out']) {
    assert.notEqual(transitionId(role, transitionKey(clock)), transitionId(role, transitionKey(format)));
  }
  // and the two roles of ONE node still differ, which is what the id was for
  assert.notEqual(transitionId('in', transitionKey(clock)), transitionId('out', transitionKey(clock)));
  assert.equal(transitionId('in', 'K'), '(trans)in/K');
});

test('a list row takes the span its TEMPLATE anchors to, not the list\'s width [Judge E round 3, finding 3]', () => {
  const A = Anchor;
  // XuiList's control_ListItem: 420 wide, LEFT|RIGHT, in a 420-wide visual. On
  // the 423-wide Console Settings list the row is 423 - the old rule's answer.
  assert.deepEqual(rowSpan({ itemWidth: 420, itemX: 0, itemAnchor: A.LEFT | A.RIGHT, visualWidth: 420 }, 423), { x: 0, w: 423 });
  // List_VerticalSpin's is 83 wide in a 53-wide visual: the year spinner is 75
  // wide, so the row is 83 + 22 = 105 and the four-digit year fits.
  assert.deepEqual(rowSpan({ itemWidth: 83, itemX: 0, itemAnchor: A.LEFT | A.RIGHT, visualWidth: 53 }, 75), { x: 0, w: 105 });
  // A template anchored to neither side keeps its authored width AND its x.
  assert.deepEqual(rowSpan({ itemWidth: 373, itemX: 21.7, itemAnchor: A.NONE, visualWidth: 420 }, 420), { x: 21.7, w: 373 });
  // and the width is floored at 0 (music/1030_EditPlaylist's 42-in-420 row in
  // a 40-wide list, which neither build mounts offline)
  assert.deepEqual(rowSpan({ itemWidth: 42, itemX: 0, itemAnchor: A.LEFT | A.RIGHT, visualWidth: 420 }, 40), { x: 0, w: 0 });
  // RIGHT alone slides by the delta; HCENTER by half of it.
  assert.deepEqual(rowSpan({ itemWidth: 100, itemX: 10, itemAnchor: A.RIGHT, visualWidth: 400 }, 420), { x: 30, w: 100 });
  assert.deepEqual(rowSpan({ itemWidth: 100, itemX: 10, itemAnchor: A.HCENTER, visualWidth: 400 }, 420), { x: 20, w: 100 });
  // The default template (no visual at all) is unchanged by the rule.
  const t = templateOf(undefined);
  assert.equal(t.itemAnchor, 15);
  assert.deepEqual(rowSpan(t, t.visualWidth), { x: 0, w: t.itemWidth });
});

const SKIN = 'extracted/6770/xuiz/dashuisk/skin.xur';
const CLOCK_TIME = 'extracted/6770/xuiz/consoles/dashSysCslSetClockTime.xur';
test('the spinner numbers come from the build: List_VerticalSpin 83-in-53, lstYear 75 (skipped without extracted/6770)',
  { skip: !existsSync(SKIN) || !existsSync(CLOCK_TIME) }, async () => {
    const { XuRegistry, parseXur } = await import('@xur/index');
    const reg = new XuRegistry(JSON.parse(readFileSync('packages/xur/extensions/6770/registry.json', 'utf8')) as never);
    const idOfObj = (o: XuObject): string => { const p = o.properties.find((x) => x.def.name === 'Id'); return typeof p?.value === 'string' ? p.value : ''; };
    const skin = parseXur(new Uint8Array(readFileSync(SKIN)), reg);
    const find = (o: XuObject, id: string): XuObject | undefined => {
      if (idOfObj(o) === id) return o;
      for (const c of o.children) { const hit = find(c, id); if (hit) return hit; }
      return undefined;
    };
    const spin = find(skin.root, 'List_VerticalSpin');
    assert.ok(spin, 'the skin ships List_VerticalSpin');
    const tpl = templateOf(spin);
    assert.equal(tpl.visualWidth, 53);
    assert.equal(tpl.itemWidth, 83);
    assert.equal(tpl.itemAnchor & (Anchor.LEFT | Anchor.RIGHT), Anchor.LEFT | Anchor.RIGHT, 'the row is anchored to both sides');
    const clock = parseXur(new Uint8Array(readFileSync(CLOCK_TIME)), reg);
    const year = find(clock.root, 'lstYear');
    assert.ok(year);
    const w = year.properties.find((p) => p.def.name === 'Width')?.value;
    assert.equal(w, 75, 'lstYear is 75 wide in the scene');
    assert.deepEqual(rowSpan(tpl, 75), { x: 0, w: 105 });
  });

test('B resolves the same way X and Y do: the control carrying PressKey 0x5841 [Judge E round 3, finding 6]', () => {
  const back = (id: string): XuObject => obj('XuiNavButton', [prop('Id', id, 'XuiNavButton'), prop('PressKey', PRESS_KEY.B, 'XuiNavButton')]);
  assert.equal(PRESS_KEY.B, 0x5841);
  // Three of the five names the build uses for the same job; all five and both
  // classes are exercised in the M3g test below, against the corpus.
  for (const id of ['legend_b', 'navB', 'btnB']) {
    const scene = obj('XuiScene', [prop('Id', 'scene', 'XuiScene')], [obj('XuiGroup', [prop('Id', 'g', 'XuiGroup')], [back(id)])]);
    const hit = keyCarrierOf(scene, PRESS_KEY.B);
    assert.ok(hit, `${id} carries B`);
    assert.equal(hit.properties.find((p) => p.def.name === 'Id')?.value, id);
  }
  // X and Y are the same lookup with the other codes, and a scene with none
  // answers nothing rather than guessing a name.
  const none = obj('XuiScene', [prop('Id', 'scene', 'XuiScene')], [obj('XuiButton', [prop('Id', 'btnDone', 'XuiButton')])]);
  assert.equal(keyCarrierOf(none, PRESS_KEY.B), undefined);
  assert.equal(PRESS_KEY.X, 0x5802);
  assert.equal(PRESS_KEY.Y, 0x5803);
});

test('the Time Zone page writes the row INDEX, for all 75 rows', () => {
  const page = OPTION_PAGES['consoles/dashSysCslSetClockTimeZone.xur'];
  assert.ok(page);
  assert.equal(page.rows.length, TZ_ROWS.length);
  assert.equal(TZ_ROWS.length, 75);
  for (let k = 0; k < TZ_ROWS.length; k++) {
    assert.equal(page.rows[k]!.control, `lstTimezone_item${k}`);
    assert.equal(page.rows[k]!.value, k);
    const s = { timeZone: null as number | null, dstOff: false } as never;
    page.write(s, k);
    assert.equal((s as { timeZone: number }).timeZone, k, `row ${k} writes ${k}`);
    // the zone with no daylight rule sets the DST-off bit with it
    assert.equal((s as { dstOff: boolean }).dstOff, !TZ_ROWS[k]!.observesDst, `row ${k} DST`);
    assert.equal(page.current(s), k);
    assert.deepEqual(page.label(s), { idx: TZ_ROWS[k]!.label });
  }
});

/* ------------------------------------------------- M3g: Judge E round 4 fixes */

import {
  SYSTEM_INFO_SCENE, SYSTEM_INFO_EDIT, SYSTEM_INFO_STRING, CODE_WRITTEN_TEXT, NO_CONSOLE,
  COPYRIGHT_YEAR, DASH_VERSION, D_LINE_FORMAT,
  formatSystemInfo, systemInfoGaps, systemInfoStringIndex,
} from '@dash/blades/systemInfo';
import { PRESS_KEY_DEFAULT } from '@dash/blades/BladeShell';
import { templateOf as tplOf, visibleSlots, ScrollEnd } from '@runtime/index';

const ASSETS = 'public/assets/6770/xuiz';
const assetsHere = existsSync(`${ASSETS}/dashmain/dashmain.xur`);
async function scene(rel: string): Promise<XuObject> {
  const { XuRegistry, parseXur } = await import('@xur/index');
  const reg = new XuRegistry(JSON.parse(readFileSync('packages/xur/extensions/6770/registry.json', 'utf8')) as never);
  return parseXur(new Uint8Array(readFileSync(`${ASSETS}/${rel}`)), reg).root;
}
const idIn = (o: XuObject): string => { const p = o.properties.find((x) => x.def.name === 'Id'); return typeof p?.value === 'string' ? p.value : ''; };
function findIn(o: XuObject, id: string): XuObject | undefined {
  if (idIn(o) === id) return o;
  for (const c of o.children) { const hit = findIn(c, id); if (hit) return hit; }
  return undefined;
}
const propIn = (o: XuObject, name: string): XuProperty['value'] | undefined => o.properties.find((p) => p.def.name === name)?.value;

test('the scene a push hides is the BLADE scene, and dashmain says which one [Judge E round 4, finding 1]',
  { skip: !assetsHere }, async () => {
    // XuiSceneNavigateForward(hCur, bStayVisible, hFwd, UserIndex) puts the
    // scene it came from into state !bStayVisible (0x9215369c-0x921536b0), and
    // NOTHING in the build authors StayVisible, so every push hides its source.
    // WHICH scene is scene data: the five blade scenes author transition
    // properties and the panels parented into their scContainer author none.
    const dash = await scene('dashmain/dashmain.xur');
    const blades: [string, string][] = [
      ['Tab1', 'scMarketplace'], ['Tab2', 'scBlade'], ['Tab3', 'scBlade'],
      ['Tab4', 'scBlade'], ['Tab5', 'System'], ['Tab6', 'scOOBE'],
    ];
    for (const [tab, id] of blades) {
      const tabNode = findIn(dash, tab);
      assert.ok(tabNode, `${tab} is in dashmain`);
      const blade = tabNode.children.find((c) => idIn(c) === id);
      assert.ok(blade, `${tab}/${id} is Tab${tab}'s own scene`);
      assert.equal(propIn(blade, 'TransBackTo'), 'FadeIn',
        `${tab}/${id} authors the visual it plays when a page pops back to it`);
      // and it is the thing that carries the blade's header and legends
      const header = blade.children.some((c) => /header/i.test(idIn(c)));
      const legends = blade.children.filter((c) => /^legend_[abxy]$/.test(idIn(c))).length;
      if (tab !== 'Tab6') {
        assert.ok(header, `${tab}/${id} carries the blade header`);
        assert.equal(legends, 4, `${tab}/${id} carries the four legends`);
      }
    }
    // Tab1's and Tab6's scenes author all four; the panels author none at all.
    assert.equal(propIn(findIn(dash, 'scMarketplace')!, 'TransFrom'), 'FadeOut');
    assert.equal(propIn(findIn(dash, 'scOOBE')!, 'TransFrom'), 'FadeOut');
    for (const rel of ['gamesbla/gamesSignedOut.xur', 'mediabla/mediaSignedOut.xur',
      'live/liveSignedOutUI.xur', 'blademp/marketplaceSignedOut.xur']) {
      const panel = await scene(rel);
      const seen: string[] = [];
      const w = (o: XuObject) => { for (const p of ['TransFrom', 'TransTo', 'TransBackFrom', 'TransBackTo']) if (propIn(o, p) !== undefined) seen.push(`${idIn(o)}.${p}`); o.children.forEach(w); };
      w(panel);
      assert.deepEqual(seen, [], `${rel} authors no transition property - it is not what XUI navigates from`);
    }
  });

test('System Info paints dashCSettingsStrings[545], not the reset screen\'s authored prose [Judge E round 4, finding 2]', () => {
  // The branch at 0x921c86f4 is the IPTV-provider predicate: 546 with a
  // provider (it adds "%s GUID: %hs"), 545 without, and the reference console
  // has none.
  assert.equal(systemInfoStringIndex(false), 545);
  assert.equal(systemInfoStringIndex(true), 546);
  assert.equal(SYSTEM_INFO_STRING.noProvider, 0x221);
  assert.equal(SYSTEM_INFO_STRING.withProvider, 0x222);
  // 545's four slots, in the code's argument order.
  const s545 = 'Console Serial Number: %hs\r\nConsole ID: %hs\r\n\r\n(c) %d Microsoft\r\n\r\nD:%hs\r\n';
  assert.equal(
    formatSystemInfo(s545, { serial: 'SN', consoleId: 'CID', provider: null, dLine: 'D' }),
    'Console Serial Number: SN\r\nConsole ID: CID\r\n\r\n(c) 2008 Microsoft\r\n\r\nD:D\r\n');
  // 546 takes the provider's name and GUID between the id and the year.
  const s546 = 'Console Serial Number: %hs\r\nConsole ID: %hs\r\n%s GUID: %hs\r\n(c) %d\r\nD:%hs\r\n';
  assert.equal(
    formatSystemInfo(s546, { serial: 'SN', consoleId: 'CID', provider: { name: 'P', guid: 'G' }, dLine: 'D' }),
    'Console Serial Number: SN\r\nConsole ID: CID\r\nP GUID: G\r\n(c) 2008\r\nD:D\r\n');
  // With no console the three hardware fields are the code's own empty buffer
  // and the year is still the literal; each empty field is disclosed.
  assert.equal(formatSystemInfo(s545, NO_CONSOLE), 'Console Serial Number: \r\nConsole ID: \r\n\r\n(c) 2008 Microsoft\r\n\r\nD:\r\n');
  assert.equal(COPYRIGHT_YEAR, 0x7d8);
  assert.equal(DASH_VERSION, '2.0.6770.0');
  assert.ok(D_LINE_FORMAT.startsWith('%s - K:'));
  const gaps = systemInfoGaps(NO_CONSOLE);
  assert.equal(gaps.length, 3, 'serial, console id and the D: line');
  for (const g of gaps) assert.ok(g.startsWith(`${SYSTEM_INFO_SCENE}:${SYSTEM_INFO_EDIT}`), g);
  assert.deepEqual(systemInfoGaps({ serial: 'a', consoleId: 'b', provider: null, dLine: 'c' }), []);
});

test('the code-written-text registry quotes the scene verbatim, and it is the only one',
  { skip: !assetsHere }, async () => {
    assert.equal(CODE_WRITTEN_TEXT.length, 1);
    for (const e of CODE_WRITTEN_TEXT) {
      const root = await scene(e.scene);
      const node = findIn(root, e.control);
      assert.ok(node, `${e.scene}#${e.control} exists`);
      assert.equal(String(propIn(node, 'Text') ?? '').replace(/\s+/g, ' ').trim(), e.authored,
        'the registry must quote the file, or the gate can be passed by a typo');
    }
    // The page is authored as a copy of the factory-reset screen: that is what
    // its ClassOverride says, and no other scene in the build shares either.
    const root = await scene(SYSTEM_INFO_SCENE);
    assert.equal(propIn(root.children[0]!, 'ClassOverride'), 'dashSystemReset');
  });

test('a list windows on the axis its template\'s scroll ends point along [Judge E round 4, finding 3]',
  { skip: !assetsHere }, async () => {
    assert.deepEqual({ ...ScrollEnd }, { UP: 0, DOWN: 1, LEFT: 2, RIGHT: 3 });
    const skin = await scene('dashuisk/skin.xur');
    const chooser = findIn(skin, 'XuiListChooser_No_Kill');
    const list = findIn(skin, 'XuiList');
    const spinner = findIn(skin, 'btn_horizontal_spinner_Arrows');
    assert.ok(chooser && list && spinner);
    const tc = tplOf(chooser), tl = tplOf(list), ts = tplOf(spinner);
    assert.equal(tl.horizontal, false, 'XuiList authors ScrollUp/ScrollDown');
    assert.equal(tc.horizontal, true, 'the chooser authors ScrollLeft/ScrollRight');
    assert.equal(ts.horizontal, true);
    // The chooser: a 239-wide row at x 30.5 in a 300x60 visual, in a 480x74
    // list -> rowSpan 419 at 30.5, and floor((480 - 30.5) / 419) = ONE row.
    // The vertical rule answered floor(74 / 33) = 2 and stacked two values.
    assert.equal(tc.visualWidth, 300); assert.equal(tc.visualHeight, 60);
    assert.equal(tc.itemHeight, 33); assert.equal(tc.itemWidth, 239);
    assert.equal(Math.round(tc.itemX * 10) / 10, 30.5);
    assert.equal(visibleSlots(tc, { w: 480, h: 74 }), 1);
    assert.equal(Math.floor((74 - 0) / 33), 2, 'which is what the old rule said');
    // The Family Timer's spinner already answered one, and still does.
    assert.equal(visibleSlots(ts, { w: 420, h: 47 }), 1);
    // Console Settings is untouched: 423x435 at a 45 pitch is nine rows.
    assert.equal(visibleSlots(tl, { w: 423, h: 435 }), 9);
    assert.equal(visibleSlots(tl, { w: 420, h: 74 }), 1);
    // A template with no visual at all keeps the measured vertical default.
    assert.equal(tplOf(undefined).horizontal, false);
    // The scroll ends are named by the template, not by a constant.
    assert.equal(idIn(tl.scrollUp!), 'control_ScrollUp');
    assert.equal(idIn(tl.scrollDown!), 'control_ScrollDown');
    assert.equal(idIn(tc.scrollUp!), 'ScrollLeft');
    assert.equal(idIn(tc.scrollDown!), 'ScrollRight');
  });

test('the B carrier has FIVE names and two classes, and an unkeyed back button binds A [Judge E round 4, finding 4]',
  { skip: !assetsHere }, async () => {
    // Every id the build really uses, not the three the round-3 test invented.
    for (const [id, cls] of [['legend_b', 'XuiBackButton'], ['btnB', 'XuiBackButton'],
      ['navB', 'XuiBackButton'], ['legend_B', 'XuiBackButton'], ['backButton', 'XuiBackButton'],
      ['legend_b', 'XuiButton']] as const) {
      const ctrl = obj(cls, [prop('Id', id, cls), prop('PressKey', PRESS_KEY.B, cls)]);
      const sc = obj('XuiScene', [prop('Id', 'scene', 'XuiScene')], [obj('XuiGroup', [prop('Id', 'g', 'XuiGroup')], [ctrl])]);
      const hit = keyCarrierOf(sc, PRESS_KEY.B);
      assert.ok(hit, `${cls} #${id} carries B`);
      assert.equal(hit.properties.find((p) => p.def.name === 'Id')?.value, id);
      assert.equal(hit.className, cls, 'the class is not part of the rule either');
    }
    // A XuiBackButton with NO PressKey is not a B carrier: XuiButton.PressKey
    // defaults to 0x5840 (A) and XuiBackButton adds none of its own.
    assert.equal(PRESS_KEY_DEFAULT, PRESS_KEY.A);
    assert.equal(PRESS_KEY.A, 0x5840);
    const unkeyed = obj('XuiScene', [prop('Id', 'scene', 'XuiScene')],
      [obj('XuiBackButton', [prop('Id', 'legend_b', 'XuiBackButton'), prop('Text', 'Back', 'XuiBackButton')])]);
    assert.equal(keyCarrierOf(unkeyed, PRESS_KEY.B), undefined);

    // And the corpus behind all of that, re-surveyed here so a wrong number
    // cannot survive in prose again.
    const { XuRegistry, parseXur } = await import('@xur/index');
    const { readdirSync, statSync } = await import('node:fs');
    const { join } = await import('node:path');
    const reg = new XuRegistry(JSON.parse(readFileSync('packages/xur/extensions/6770/registry.json', 'utf8')) as never);
    const files: string[] = [];
    const walkDir = (d: string) => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walkDir(p); else if (p.endsWith('.xur')) files.push(p); } };
    walkDir(ASSETS);
    let carriers = 0, none = 0, full = 0, fullNone = 0;
    const ids = new Map<string, number>(), classes = new Map<string, number>();
    for (const f of files) {
      const root = parseXur(new Uint8Array(readFileSync(f)), reg).root;
      const isFull = propIn(root, 'Width') === 1120 && propIn(root, 'Height') === 770;
      if (isFull) full++;
      const hit = keyCarrierOf(root, PRESS_KEY.B);
      if (hit) { carriers++; ids.set(idIn(hit), (ids.get(idIn(hit)) ?? 0) + 1); classes.set(hit.className, (classes.get(hit.className) ?? 0) + 1); }
      else { none++; if (isFull) fullNone++; }
    }
    assert.equal(files.length, 263);
    assert.equal(carriers, 176);
    assert.equal(none, 87, 'not ten - the round-3 survey counted a partition that does not exist');
    assert.equal(full, 187);
    assert.equal(fullNone, 16);
    assert.deepEqual(Object.fromEntries([...ids].sort((a, b) => b[1] - a[1])),
      { legend_b: 107, btnB: 54, navB: 8, legend_B: 4, backButton: 3 });
    assert.deepEqual(Object.fromEntries(classes), { XuiBackButton: 172, XuiButton: 4 });
  });
