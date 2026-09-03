// Convert XUIHelper's XUI class-extension XML files into one registry.json
// the parser (and the browser) can load without an XML parser.
//
//   node --import tsx tools/build-registry-xml.ts [v5|v8]   -> packages/xur/extensions/<group>/registry.json
//
// This is XuiTool's compile-time view of 9199 (v5) or 17559 (v8) as
// XUIHelper transcribed it; the per-build registries that the parser
// actually uses come from each build's own executable
// (tools/build-registry.ts). These are kept as the source of XuiElement's
// compile-time tail (v5) and as the comparison targets.
//
// The XML is flat and regular (XUIClassExtension > XUIClass > PropDef >
// DefaultVal), so a small hand-rolled scanner is enough; it refuses anything
// it does not expect rather than guessing. PropDef ORDER within a class is
// load-bearing: it is the bit order of the property masks in the XUR DATA
// section, so the registry preserves file order exactly.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { XuClassDef, XuPropertyDef, XuPropertyType, XuRegistryJson } from '@xur/model';

const group = process.argv[2] ?? 'v5';
const dir = join(process.cwd(), `packages/xur/extensions/${group}`);
const xhe = readFileSync(join(dir, group === 'v5' ? '9199.xhe' : '17559.xhe'), 'utf8');
const files = [...xhe.matchAll(/<RelationalExtension>([^<]+)<\/RelationalExtension>/g)].map((m) => m[1]!.trim());

const TYPES = new Set<XuPropertyType>(['bool', 'integer', 'unsigned', 'float', 'string', 'color', 'vector', 'quaternion', 'object', 'custom']);

function unescapeXml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([A-Za-z]+)="([^"]*)"/g)) out[m[1]!] = unescapeXml(m[2]!);
  return out;
}

const classes: XuClassDef[] = [];
for (const file of files) {
  const xml = readFileSync(join(dir, file), 'utf8');
  // Each class block runs from <XUIClass ...> to </XUIClass>.
  for (const cm of xml.matchAll(/<XUIClass\b([^>]*)>([\s\S]*?)<\/XUIClass>/g)) {
    const a = attrs(cm[1]!);
    const name = a['Name'];
    if (!name) throw new Error(`${file}: XUIClass without Name`);
    const base = a['BaseClassName'] && a['BaseClassName'] !== '(null)' ? a['BaseClassName'] : null;
    const props: XuPropertyDef[] = [];
    const body = cm[2]!;
    // PropDef is self-closing (<PropDef ... />), empty (<PropDef ...></PropDef>)
    // or wraps a DefaultVal. A regex that only knows the closing-tag form
    // silently swallows the self-closing ones AND the definition after them,
    // which is how DashScene and ScriptScene once came out empty here.
    for (const pm of body.matchAll(/<PropDef\b([^>]*?)(?:\/>|>([\s\S]*?)<\/PropDef>)/g)) {
      const pa = attrs(pm[1]!);
      const type = pa['Type'] as XuPropertyType;
      if (!TYPES.has(type)) throw new Error(`${file}: ${name}.${pa['Name']} has unknown Type "${pa['Type']}"`);
      const dv = /<DefaultVal>([\s\S]*?)<\/DefaultVal>/.exec(pm[2] ?? '');
      const flags = (pa['Flags'] ?? '').split('|').filter(Boolean);
      props.push({
        id: Number(pa['Id']),
        name: pa['Name']!,
        type,
        flags,
        defaultValue: dv ? unescapeXml(dv[1]!).trim() : null,
        owner: name,
      });
    }
    if (classes.some((c) => c.name === name)) throw new Error(`duplicate class ${name} (${file})`);
    classes.push({ name, base, props, source: file });
  }
}

const out: XuRegistryJson = { version: group === 'v5' ? 5 : 8, group: group === 'v5' ? '9199' : '17559', classes };
writeFileSync(join(dir, 'registry.json'), JSON.stringify(out, null, 1));
console.log(`registry.json: ${classes.length} classes, ${classes.reduce((n, c) => n + c.props.length, 0)} property definitions from ${files.join(', ')}`);
