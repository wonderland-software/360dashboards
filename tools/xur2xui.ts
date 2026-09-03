// Emit XUIHelper-format XUI XML for one XUR, or diff a whole corpus against
// XUIHelper's own output (the second-parser oracle for Judge B).
//
//   node --import tsx tools/xur2xui.ts <file.xur>                     # XML to stdout
//   node --import tsx tools/xur2xui.ts --diff <xurDir> <xuiHelperDir> # compare every scene
//   --registry 6770|9199|17559   the build's registry (default 6770, or DASH_BUILD)
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { XuRegistry, parseXur, toXui } from '@xur/index';

const args = process.argv.slice(2);
const regIx = args.indexOf('--registry');
const regName = regIx >= 0 ? args[regIx + 1]! : process.env['DASH_BUILD'] || '6770';
const reg = new XuRegistry(JSON.parse(readFileSync(`packages/xur/extensions/${regName}/registry.json`, 'utf8')));

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.toLowerCase().endsWith('.xur')) out.push(p);
  }
  return out;
}

// Scenes where XUIHelper's own output is defective, with the reason, so they
// are skipped rather than counted against our parser. Per build, because a
// path can exist in both and be fine in one (9199's memory/DeleteMusic has
// no U+2019 and converts completely). Keep this list short and every entry
// explained. The pattern is always the same: XUIHelper keeps only the low
// byte of each UTF-16 unit, so U+2013..U+2019 become control characters
// (0x13..0x19), invalid in XML, and its XmlWriter aborts mid-write.
// Scenes XUIHelper REFUSES outright are not here: they have no output and
// are counted as "no XUIHelper output" (9199's consoles/dashSysLiveVision
// uses LiveVisionControl, a class dash.xex registers but XUIHelper's XML
// does not know, so its reader throws).
const XUIHELPER_BROKEN: Record<string, Record<string, string>> = {
  '6770': {
    'memory/DeleteMusic.xui': 'the text "Don\u2019t" contains U+2019; XUIHelper keeps only the low byte (0x19), an invalid XML character, so its XmlWriter aborts and the file is truncated mid-write at "<Text>"',
  },
  '9199': {
    'dashcomm/OfflineMarketplace.xui': 'the text "trailers\u2014whatever" contains U+2014 (em dash); low byte 0x14 aborts XUIHelper\'s XmlWriter, the file ends inside the <Text> before it',
    'firstrun/WhatsNewFacebookTwitterScene.xui': 'the HTML text contains U+2013 (en dash); low byte 0x13 aborts XUIHelper\'s XmlWriter at "<Text>"',
  },
};

/** Builds whose scenes are XUR v8, with the XUIHelper extension group and .xhe that describe them. */
const XUR_V8: Record<string, { group: string; xhe: string }> = { '17559': { group: 'v8', xhe: '17559.xhe' } };

/** The <IgnoreProperty> names XUIHelper's extension file declares for a build's group (empty for the v5 builds but TextureSurfaceElement). */
function ignoredProperties(build: string): string[] {
  const v8 = XUR_V8[build];
  const xhe = readFileSync(`packages/xur/extensions/${v8 ? v8.group : 'v5'}/${v8 ? v8.xhe : '9199.xhe'}`, 'utf8');
  const block = /<IgnoreProperties>([\s\S]*?)<\/IgnoreProperties>/.exec(xhe)?.[1] ?? '';
  return [...new Set([...block.matchAll(/<IgnoreProperty>([^<]+)<\/IgnoreProperty>/g)].map((m) => m[1]!.trim()))];
}

const diffIx = args.indexOf('--diff');
if (diffIx >= 0) {
  const xurDir = args[diffIx + 1]!;
  const refDir = args[diffIx + 2]!;
  let same = 0, differ = 0, missing = 0, broken = 0;
  const reasons = new Map<string, string[]>();
  for (const f of walk(xurDir)) {
    const rel = relative(xurDir, f).replace(/\.xur$/i, '.xui');
    const refPath = join(refDir, rel);
    if (!existsSync(refPath)) { missing++; continue; }
    if (rel in (XUIHELPER_BROKEN[regName] ?? {})) { broken++; continue; }
    const doc = parseXur(new Uint8Array(readFileSync(f)), reg);
    // (4) XUIHelper's <build>.xhe lists properties under <IgnoreProperties>:
    // its reader consumes the value (the bytes after it still parse) but its
    // writer never emits it, in a <Properties> block or in a timeline, so
    // toXui leaves those out on OUR side. 9199.xhe names
    // TextureSurfaceElement (controlp/PanelScene's reflection image reads the
    // ReflectedItems surface through it); 17559.xhe names XuiElement's
    // Column/Row/ColorFactor/... tail, XuiControl's AutoId/QuickInput/
    // UseNuiAsMouse, LoadType, WrapBump and TextScale (gamercar/gamercard
    // animates Hittable, slots/CarouselSlotScene animates Column). The list
    // is read from the .xhe, not typed here.
    let ours = toXui(doc.root, ignoredProperties(regName));
    let theirs = readFileSync(refPath, 'utf8').replace(/^﻿/, '');
    // Known, documented XUIHelper deviations normalised away so the diff
    // measures OUR parser: (1) its hand-written 9199 XML names DashScene's
    // three strings differently from what BOTH executables register
    // (PanelSettings/PanelStrings/PanelScenePaths in 6770 and 9199);
    // (2) it calls XuiShader's first property ShaderId where the 9199
    // executable registers it as "Id" (tools/build-registry.ts, table
    // @0x921844cc); the binary wins and its name is what the registry and
    // the runtime use; (3) its string reader keeps only the low byte of each
    // UTF-16 unit.
    theirs = theirs.replace(/NavigationBreadcrumbs/g, 'PanelSettings').replace(/DescriptionTexts/g, 'PanelStrings').replace(/MetapaneSceneOverrides/g, 'PanelScenePaths');
    theirs = theirs.replace(/<ShaderId>/g, '<Id>').replace(/<\/ShaderId>/g, '</Id>');
    // (5) XUIHelper's 17559 XML gives XuiHtmlElement one definition,
    // TeletypeCount, where the binary registers Text (string) then
    // TeletypeCount (tools/build-registry.ts, table @0x9223fab8): its reader
    // takes the string INDEX as the count. The value is put back through
    // this file's own string table so the comparison measures the rest.
    if (XUR_V8[regName]) theirs = theirs.replace(/<TeletypeCount>(\d+)<\/TeletypeCount>/g, (_m, n) => `<Text>${(doc.strings[Number(n)] ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Text>`);
    // (6) XUIHelper's XUKeyframe(XURKeyframe) constructor reads
    // `EaseScale *= xurKeyframe.EaseScale` on a field that starts at 0
    // (XU/Animation/XUKeyframe.cs:41), so every v8 keyframe it writes has
    // EaseScale 0 whatever the file says (11 scenes carry 50/60/85). The
    // line is dropped from both sides; our EaseScale is the third inline
    // byte of a type-2 KEYD record, the layout the console's decoder at
    // 0x92203930 stores (parse8.ts).
    if (XUR_V8[regName]) { ours = ours.replace(/^<EaseScale>\d+<\/EaseScale>\r\n/gm, ''); theirs = theirs.replace(/^<EaseScale>\d+<\/EaseScale>\r\n/gm, ''); }
    // (3) again: XUIHelper keeps one byte per character. v5 STRN is UTF-16BE,
    // so it keeps the low byte of each unit; v8 STRN is UTF-8, so it keeps
    // every byte as a Latin-1 character (a bullet becomes three of them).
    ours = XUR_V8[regName]
      ? ours.replace(/[\u0080-\uffff]+/g, (t) => [...Buffer.from(t, 'utf8')].map((b) => String.fromCharCode(b)).join(''))
      : ours.replace(/[\u0080-\uffff]/g, (c) => { const lo = c.charCodeAt(0) & 0xff; return lo < 0x20 ? '' : String.fromCharCode(lo); });
    if (ours === theirs) { same++; continue; }
    differ++;
    const a = ours.split('\r\n'), b = theirs.split('\r\n');
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    const key = `line ${i + 1}: ours=${JSON.stringify(a[i] ?? '<eof>').slice(0, 80)} theirs=${JSON.stringify(b[i] ?? '<eof>').slice(0, 80)}`;
    const k2 = key.replace(/\d+\.\d+/g, '#.#').replace(/line \d+/, 'line');
    reasons.set(k2, [...(reasons.get(k2) ?? []), rel]);
  }
  for (const [k, fs] of [...reasons.entries()].sort((x, y) => y[1].length - x[1].length)) console.log(`${String(fs.length).padStart(4)}  ${k}\n        e.g. ${fs.slice(0, 3).join(', ')}`);
  console.log(`${differ === 0 ? 'XUIDIFF_PASS' : 'XUIDIFF_FAIL'} identical=${same} different=${differ} (no XUIHelper output for ${missing}; ${broken} skipped as documented XUIHelper defects)`);
  process.exit(differ === 0 ? 0 : 1);
} else {
  const file = args.find((a, i) => !a.startsWith('--') && !(regIx >= 0 && i === regIx + 1))!;
  process.stdout.write(toXui(parseXur(new Uint8Array(readFileSync(file)), reg).root));
}
