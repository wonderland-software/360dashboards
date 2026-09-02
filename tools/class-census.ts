// What a build's scenes actually use: classes, properties, fonts, styles,
// image path forms, visual names, figure shapes, animation reach. Sizes the
// renderer honestly and feeds the judges' coverage checks.
//
//   node --import tsx tools/class-census.ts [extracted/6770/xuiz] [--registry 6770|9199]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { XuRegistry, parseXur, idOf, type XuObject, type XuProperty, type XuFigure } from '@xur/index';
import { positionals } from './builds';

const args = process.argv.slice(2);
const regIx = args.indexOf('--registry');
const regName = regIx >= 0 ? args[regIx + 1]! : process.env['DASH_BUILD'] || '6770';
const dir = positionals(args)[0] ?? `extracted/${regName}/xuiz`;
const reg = new XuRegistry(JSON.parse(readFileSync(`packages/xur/extensions/${regName}/registry.json`, 'utf8')));
const files: string[] = [];
const walk = (d: string) => { for (const e of readdirSync(d)) { const p = join(d, e); if (statSync(p).isDirectory()) walk(p); else if (/\.xur$/i.test(e)) files.push(p); } };
walk(dir);

const count = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
const top = (m: Map<string, number>, n = 40) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${k}=${v}`).join('  ');

const classes = new Map<string, number>();
const props = new Map<string, number>();
const fonts = new Map<string, number>();
const textStyles = new Map<string, number>();
const blendModes = new Map<string, number>();
const anchors = new Map<string, number>();
const sizeModes = new Map<string, number>();
const imagePrefixes = new Map<string, number>();
const visuals = new Map<string, number>();
const figPoints = new Map<string, number>();
const gradStops = new Map<string, number>();
const fillTypes = new Map<string, number>();
const animated = new Map<string, number>();
const interp = new Map<string, number>();
const namedFrames = new Map<string, number>();
const commands = new Map<string, number>();
const rotated = { count: 0, nonZ: 0 };
const scaled = { count: 0 };
const opacityBelow1 = { count: 0 };
let objects = 0, timelines = 0, keyframes = 0, maxFrame = 0;
const skinIds = new Set<string>();
const canvasSizes = new Map<string, number>();
// Classes and properties that a later dashboard may use and an earlier one
// never did; listed per scene so the next runtime phase can be scoped.
const FEATURES = ['XuiAvatar', 'XuiPerspectiveScene', 'XuiShader', 'XuiTextureSurface', 'XuiVideo', 'XuiVariable', 'XuiHtmlElement', 'XuiHtmlPresenter', 'XuiHtmlControl', 'XuiGamerCard', 'AuraControl', 'LegacyControl', 'Xui3DScene', 'Xui3DMesh', 'Xui3DCamera', 'MediaScene', 'ScriptScene', 'XuiComboBox', 'XuiTabScene'];
const featureScenes = new Map<string, Set<string>>();
const elementTail = new Map<string, number>(); // XuiElement definitions 17+ (XuiTool's tail) actually set

function visit(o: XuObject, file: string, inSkin: boolean) {
  objects++;
  count(classes, o.className);
  if (inSkin) skinIds.add(idOf(o));
  if (FEATURES.includes(o.className)) { if (!featureScenes.has(o.className)) featureScenes.set(o.className, new Set()); featureScenes.get(o.className)!.add(file); }
  if (o.className === 'XuiCanvas') {
    const w = o.properties.find((p) => p.def.name === 'Width')?.value, h = o.properties.find((p) => p.def.name === 'Height')?.value;
    count(canvasSizes, `${w ?? '?'}x${h ?? '?'}`);
  }
  for (const p of o.properties) if (p.def.owner === 'XuiElement' && p.def.id >= 17) count(elementTail, p.def.name);
  const flat = (ps: XuProperty[], prefix: string) => {
    for (const p of ps) {
      const key = `${o.className}.${prefix}${p.def.name}`;
      count(props, key);
      if (p.def.type === 'object') { flat(p.value as XuProperty[], `${prefix}${p.def.name}.`); continue; }
      const v = p.value;
      if (p.def.name === 'Font') count(fonts, String(v));
      if (p.def.name === 'TextStyle') count(textStyles, '0x' + (v as number).toString(16));
      if (p.def.name === 'BlendMode') count(blendModes, String(v));
      if (p.def.name === 'Anchor') count(anchors, '0x' + (v as number).toString(16));
      if (p.def.name === 'SizeMode') count(sizeModes, String(v));
      if (p.def.name === 'FillType') count(fillTypes, String(v));
      if (p.def.name === 'ImagePath' || p.def.name === 'TextureFileName') count(imagePrefixes, String(v).replace(/[^:/]*$/, '').replace(/^([a-z]+:\/\/)?(.*?)$/, (_m, a, b) => (a ?? '') + (b ? '<path>' : '')) || '<bare>');
      if (p.def.name === 'Visual' && typeof v === 'string' && v) count(visuals, v);
      if (p.def.name === 'Points') { const f = v as XuFigure; count(figPoints, String(f.points.length)); }
      if (p.def.name === 'NumStops') count(gradStops, String(v));
      if (p.def.name === 'Rotation' && typeof v === 'object' && 'w' in v) { rotated.count++; if (Math.abs(v.x) > 1e-6 || Math.abs(v.y) > 1e-6) rotated.nonZ++; }
      if (p.def.name === 'Scale' && typeof v === 'object' && 'z' in v && (v.x !== 1 || v.y !== 1)) scaled.count++;
      if (p.def.name === 'Opacity' && typeof v === 'number' && v < 1) opacityBelow1.count++;
    }
  };
  flat(o.properties, '');
  for (const nf of o.namedFrames) { count(namedFrames, nf.name); count(commands, nf.command); }
  for (const t of o.timelines) {
    timelines++;
    for (const tr of t.tracks) count(animated, tr.path.map((d) => d.name).join('.'));
    for (const k of t.keyframes) { keyframes++; count(interp, k.interpolation); if (k.keyframe > maxFrame) maxFrame = k.keyframe; }
  }
  for (const c of o.children) visit(c, file, inSkin);
}

for (const f of files) {
  const doc = parseXur(new Uint8Array(readFileSync(f)), reg);
  visit(doc.root, relative(dir, f), /dashuisk|dashskn/.test(f));
}
const unresolvedVisuals = [...visuals.keys()].filter((v) => !skinIds.has(v));

console.log(`scenes=${files.length} objects=${objects} timelines=${timelines} keyframes=${keyframes} maxFrame=${maxFrame}`);
console.log('\nCLASSES', top(classes, 60));
console.log('\nCANVAS SIZES', top(canvasSizes));
console.log('\nFONTS', fonts.size ? top(fonts) : '(no scene sets Font: the skin defaults apply)');
console.log('\nXUIELEMENT TAIL (definitions 17+ from XuiTool\'s list) SET', elementTail.size ? top(elementTail) : 'never');
console.log('\nTEXTSTYLE', top(textStyles));
console.log('\nBLENDMODE', top(blendModes));
console.log('\nANCHOR', top(anchors));
console.log('\nSIZEMODE', top(sizeModes));
console.log('\nFILLTYPE', top(fillTypes));
console.log('\nIMAGE PATH FORMS', top(imagePrefixes));
console.log('\nFIGURE POINT COUNTS', top(figPoints));
console.log('\nGRADIENT STOPS', top(gradStops));
console.log(`\nROTATION props=${rotated.count} (with X/Y component: ${rotated.nonZ})  SCALE!=1: ${scaled.count}  OPACITY<1: ${opacityBelow1.count}`);
console.log('\nANIMATED PROPERTIES', top(animated));
console.log('\nINTERPOLATION', top(interp));
console.log('\nNAMED FRAMES', top(namedFrames, 50));
console.log('\nNAMED FRAME COMMANDS', top(commands));
console.log(`\nVISUALS referenced=${visuals.size}, defined as Ids in skin files=${skinIds.size}, unresolved=${unresolvedVisuals.length}: ${unresolvedVisuals.slice(0, 30).join(' ')}`);
console.log('\nTOP VISUALS', top(visuals, 30));
console.log('\nTOP PROPERTIES', top(props, 80));
console.log('\nFEATURE CLASSES (scenes using them)');
for (const [c, fs] of [...featureScenes.entries()].sort((a, b) => b[1].size - a[1].size)) console.log(`  ${c.padEnd(20)} ${String(fs.size).padStart(3)} scenes  e.g. ${[...fs].slice(0, 4).join(', ')}`);
