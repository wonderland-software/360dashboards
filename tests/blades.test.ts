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
 *  NavLeft/NavRight anywhere because left and right are the blade switch. */
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
  // No control in the build sets NavLeft or NavRight: that axis is the blade
  // switch and XuiTabScene owns it.
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
