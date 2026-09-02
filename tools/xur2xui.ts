// Emit XUIHelper-format XUI XML for one XUR, or diff a whole corpus against
// XUIHelper's own output (the second-parser oracle for Judge B).
//
//   node --import tsx tools/xur2xui.ts <file.xur>                     # XML to stdout
//   node --import tsx tools/xur2xui.ts --diff <xurDir> <xuiHelperDir> # compare every scene
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { XuRegistry, parseXur, toXui } from '@xur/index';

const args = process.argv.slice(2);
const reg = new XuRegistry(JSON.parse(readFileSync('packages/xur/extensions/6770/registry.json', 'utf8')));

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.toLowerCase().endsWith('.xur')) out.push(p);
  }
  return out;
}

// Scenes where XUIHelper's own output is defective, with the reason, so they
// are skipped rather than counted against our parser. Keep this list short
// and every entry explained.
const XUIHELPER_BROKEN: Record<string, string> = {
  'memory/DeleteMusic.xui': 'the text "Don\u2019t" contains U+2019; XUIHelper keeps only the low byte (0x19), an invalid XML character, and its writer emits an empty <Text> element',
};

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
    if (rel in XUIHELPER_BROKEN) { broken++; continue; }
    let ours = toXui(parseXur(new Uint8Array(readFileSync(f)), reg).root);
    let theirs = readFileSync(refPath, 'utf8').replace(/^﻿/, '');
    // Known, documented XUIHelper deviations normalised away so the diff
    // measures OUR parser: (1) its hand-written 9199 XML names DashScene's
    // three strings differently from what the 6770 executable registers;
    // (2) its string reader keeps only the low byte of each UTF-16 unit.
    theirs = theirs.replace(/NavigationBreadcrumbs/g, 'PanelSettings').replace(/DescriptionTexts/g, 'PanelStrings').replace(/MetapaneSceneOverrides/g, 'PanelScenePaths');
    ours = ours.replace(/[\u0080-\uffff]/g, (c) => { const lo = c.charCodeAt(0) & 0xff; return lo < 0x20 ? '' : String.fromCharCode(lo); });
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
  const file = args.find((a) => !a.startsWith('--'))!;
  process.stdout.write(toXui(parseXur(new Uint8Array(readFileSync(file)), reg).root));
}
