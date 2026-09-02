// Generate the XUI class registry for dashboard build 6770 FROM THE
// EXECUTABLE. Every class's property list, order and type come from the
// registration tables recovered by tools/xui-propdefs.ts; base classes come
// from the registration structs. The 9199 XML from XUIHelper is used only to
// bind a recovered table to its class name when the binary does not say
// (tables built on the stack are passed by register, not by address).
//
//   node --import tsx tools/build-registry-6770.ts
//
// Output: packages/xur/extensions/6770/registry.json (+ a provenance note per
// class). Anything not recoverable from the binary is marked `inferred` and
// explained, so a reviewer can see exactly which definitions rest on
// corpus evidence rather than code.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { extractPropDefs } from './xui-propdefs';
import type { XuClassDef, XuPropertyDef, XuPropertyType, XuRegistryJson } from '@xur/model';

const R = process.cwd();
const buf = readFileSync(`${R}/extracted/6770/basefile.exe`);
const pd = extractPropDefs(buf);
const xml = JSON.parse(readFileSync(`${R}/packages/xur/extensions/v5/registry.json`, 'utf8')) as XuRegistryJson;

const sig = (names: string[]) => names.join(',');

// Tables that several classes share by shape are assigned in registration
// order (XuiButton/XuiCheckbox/XuiRadioButton each have exactly PressKey; the
// three blur effects each have Brightness+BlurAmount). Everything else binds
// by an exact property-name match against the 9199 XML, or by the explicit
// map below where the XML has no (or a wrong) entry.
const EXPLICIT: Record<string, string> = {
  'PanelSettings,PanelStrings,PanelScenePaths': 'DashScene',
  'File,SizeMode': 'DashVideo',
  'Script,Visible': 'ScriptScene',
  // Each banner-of-the-day class's table sits just before its registration
  // (ButtonVisual @92257128 then XuiBOTDOfflineScene @922577f0; Area/
  // DefaultBanner @922578cc then XuiBOTDOfflineContainer @92257a10), and the
  // scene bytes agree: botd/defaultbanner0 sets one string on the scene,
  // gamesbla/gamesMetaMOTD sets a number and a path on the container.
  'ButtonVisual': 'XuiBOTDOfflineScene',
  'Area,DefaultBanner': 'XuiBOTDOfflineContainer',
  'Active': 'MediaTwist',
  'LineHeight': 'XuiHtmlControl',
  // fn 0x921475c8 builds this table and the XuiEffect registration calls it;
  // XuiTransition's propdef pointer is an explicit NULL (Judge B, 2026-09-02).
  'Id': 'XuiEffect',
  'Text': 'XuiHtmlElement',
  'DataAssociation': 'XuiHtmlPresenter',
  'GrayAmount': 'XuiGrayscaleEffect',
  'ColorFactor': 'XuiRecolorEffect',
  'Threshold': 'XuiBrightPassEffect',
  'TextureFileName,Translation,Scale,Rotation,ColorFactor,SrcBlendFactor,DstBlendFactor,WrapX,WrapY,BrushFlags': 'XuiTextureEffect',
  'File': 'XuiSoundXAudio',
};
const ORDERED: Record<string, string[]> = {
  'PressKey': ['XuiButton', 'XuiCheckbox', 'XuiRadioButton'],
  // Tables in code order @921405cc, @92140784, @921408d4 belong to HVBlur,
  // HBlur, VBlur respectively (registration bl targets; Judge B).
  'Brightness,BlurAmount': ['XuiHVBlurEffect', 'XuiHBlurEffect', 'XuiVBlurEffect'],
  'DataSet,DataAssociation,Embedded,Item': ['ScriptButton', 'ScriptImage'],
};

const bound = new Map<string, { props: XuPropertyDef[]; evidence: string }>();
const orderedUsed = new Map<string, number>();
for (const t of pd.tables) {
  const names = t.props.map((p) => p.name);
  const s = sig(names);
  let cls: string | undefined;
  if (s in EXPLICIT) cls = EXPLICIT[s] ?? undefined;
  else if (s in ORDERED) {
    const n = orderedUsed.get(s) ?? 0;
    cls = ORDERED[s]![n];
    orderedUsed.set(s, n + 1);
  } else {
    // exact match, or the XML's list starts with ours (later-era additions
    // like TextScale / RecurseTransitions sit at the end and are simply
    // absent in this build).
    const exact = xml.classes.filter((c) => sig(c.props.map((p) => p.name)) === s);
    const hits = exact.length ? exact : xml.classes.filter((c) => sig(c.props.map((p) => p.name).slice(0, names.length)) === s && c.props.length >= names.length);
    if (hits.length === 1) cls = hits[0]!.name;
    else if (hits.length > 1) throw new Error(`table ${s} matches several XML classes: ${hits.map((h) => h.name).join(', ')}`);
  }
  if (!cls) {
    if (!(s in EXPLICIT)) console.warn(`unbound table @${t.at}: ${s}`);
    continue;
  }
  if (bound.has(cls)) throw new Error(`class ${cls} bound twice`);
  bound.set(cls, {
    evidence: `dash.xex 6770 .text @0x${t.at}`,
    props: t.props.map((p, i) => ({ id: i, name: p.name, type: p.type as XuPropertyType, flags: [], defaultValue: null, owner: cls! })),
  });
}

// Indexed flags are not in the runtime table (they are a XuiTool notion);
// the XUR encoding needs them. Only the gradient stops are indexed in v5.
for (const [cls, names] of [['XuiFigureFillGradient', ['StopColor', 'StopPos']]] as const) {
  for (const p of bound.get(cls)!.props) if ((names as readonly string[]).includes(p.name)) p.flags.push('indexed');
}

const bases = new Map<string, string>();
for (const r of pd.registrations) if (!bases.has(r.name)) bases.set(r.name, r.base);
// Compound value classes and the root are not registered as elements.
for (const n of ['XuiElement', 'XuiFigureFill', 'XuiFigureFillGradient', 'XuiFigureStroke']) bases.set(n, '(null)');

const classes: XuClassDef[] = [];
const note: Record<string, string> = {};
const seen = new Set<string>();
function add(name: string, base: string | null, props: XuPropertyDef[], source: string, extra?: Partial<XuClassDef>) {
  if (seen.has(name)) return;
  seen.add(name);
  classes.push({ name, base, props, source, ...extra });
}
for (const [name, b] of bound) {
  const base = bases.get(name);
  if (base === undefined) throw new Error(`no registration (base class) found for bound class ${name}`);
  add(name, base === '(null)' ? null : base, b.props, b.evidence);
}
// A registration is only real if its base chain reaches XuiElement. The
// "two wide strings at +0/+4" heuristic also catches a font-path pair
// (ConvectionUI / file://...xtt) and a named-frame command chain
// (BeginShowOSD -> ... -> a name that is never registered).
const regNames = new Set([...pd.registrations.map((r) => r.name), 'XuiElement']);
const reachesRoot = (name: string, hops = 0): boolean => {
  if (name === 'XuiElement') return true;
  if (hops > 20 || !regNames.has(name)) return false;
  const base = bases.get(name);
  return base !== undefined && reachesRoot(base, hops + 1);
};
for (const r of pd.registrations) {
  if (seen.has(r.name)) continue;
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(r.name) || r.name === r.base) continue;
  if (!reachesRoot(r.name)) { console.warn(`dropping non-class registration ${r.name} < ${r.base}`); continue; }
  add(r.name, r.base, [], `dash.xex 6770 registration @0x${r.fn} (no property table found: zero own properties)`);
}

// XuiTool knew MORE XuiElement definitions than the runtime registers: every
// object in the corpus writes FOUR mask bytes for XuiElement (25-32
// definitions) while dash.xex registers 17. XuiTool's own list is the one
// XUIHelper transcribed for 9199 (GripTarget .. CenterPivot, positions
// 17-26); none of those bits is ever set in Blades 6770, but the parser
// checks the mask-byte count against the registry, so the list must be as
// long as the files say.
{
  const el = classes.find((c) => c.name === 'XuiElement')!;
  const xmlEl = xml.classes.find((c) => c.name === 'XuiElement')!;
  const tail = xmlEl.props.slice(el.props.length);
  if (el.props.length !== 17 || tail.length !== 10) throw new Error(`unexpected XuiElement shape: binary ${el.props.length}, xml tail ${tail.length}`);
  el.props.push(...tail.map((p, i) => ({ ...p, id: el.props.length + i, owner: 'XuiElement', origin: 'xuitool-xml' })));
  el.source += '; definitions 17-26 from XuiTool (XUIHelper 9199 XML), required by the 4 mask bytes every scene writes';
}
add('XuiElement', null, bound.get('XuiElement')?.props ?? [], 'dash.xex 6770');

// A class seen in the 6770 scenes but registered by something other than
// dash.xex (the banner-of-the-day packs come from a live service pipeline).
// Its shape comes from the scene bytes, checked by the strict parse.
add('XuiFall07BOTDScene', 'XuiScene', [
  ...[0, 1, 2, 3, 4, 5, 7, 8].map((i) => ({ id: i, name: `Unknown${i}`, type: 'unsigned' as XuPropertyType, flags: [], defaultValue: null, owner: 'XuiFall07BOTDScene', inferred: true })),
  { id: 6, name: 'Unknown6', type: 'string' as XuPropertyType, flags: [], defaultValue: null, owner: 'XuiFall07BOTDScene', inferred: true },
].sort((a, b) => a.id - b.id), 'NOT registered by dash.xex. From botd/defaultbanner_featured.xur alone: the object writes 2 mask bytes (9-16 definitions) and sets only bit 6, whose value is a string index. Only definition 6 is evidenced; 0-5 and 7-8 are placeholders that exist so the mask-byte count matches, and their names and types are unknown.');

const out: XuRegistryJson & { notes: Record<string, string> } = { version: 5, group: '6770', classes, notes: note };
mkdirSync(`${R}/packages/xur/extensions/6770`, { recursive: true });
writeFileSync(`${R}/packages/xur/extensions/6770/registry.json`, JSON.stringify(out, null, 1));
const withProps = classes.filter((c) => c.props.length);
console.log(`registry 6770: ${classes.length} classes (${withProps.length} with property tables from the binary, ${pd.registrations.length} registrations)`);
for (const c of withProps) console.log(`  ${c.name} < ${c.base}: ${c.props.map((p) => p.name + ':' + p.type).join(' ')}`);
