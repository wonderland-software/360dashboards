// Fetch a .xur, parse it with the ACTIVE build's class registry, and hand back
// the object tree. Nothing here draws; nothing here invents.
//
// The registry is per build and it is not interchangeable: XUR stores
// properties as bitmasks over each class's property list in declaration order,
// so parsing 9199 with 6770's list misaligns rather than failing. Each
// registry is generated from that build's own decrypted dash.xex
// (tools/build-registry.ts), and the parser asserts every class's mask-byte
// count against it, so the wrong one fails loudly.
import { XuRegistry, parseXur, type XuObject, type XurDocument } from '@xur/index';
import registry6770 from '../../../xur/extensions/6770/registry.json';
import registry9199 from '../../../xur/extensions/9199/registry.json';
import { activeBuildId, type BuildId } from '../build';
import { AssetIndex, splitScenePath } from '../assets/AssetIndex';

const REGISTRY_JSON: Readonly<Record<BuildId, unknown>> = {
  '6770': registry6770,
  '9199': registry9199,
};
const registries = new Map<BuildId, XuRegistry>();

export function xuiRegistry(build: BuildId = activeBuildId()): XuRegistry {
  let reg = registries.get(build);
  if (!reg) { reg = new XuRegistry(REGISTRY_JSON[build] as never); registries.set(build, reg); }
  return reg;
}

export interface LoadedScene {
  /** "<pack>/<path>" */
  id: string;
  pack: string;
  path: string;
  doc: XurDocument;
  root: XuObject;
  /** Classes in the file that the registry does not describe. Empty on both
   *  builds today; kept because an unknown class must never be silent. */
  unknownClasses: string[];
}

export async function loadScene(assets: AssetIndex, id: string): Promise<LoadedScene>;
export async function loadScene(assets: AssetIndex, pack: string, path: string): Promise<LoadedScene>;
export async function loadScene(assets: AssetIndex, a: string, b?: string): Promise<LoadedScene> {
  const { pack, path } = b === undefined ? splitScenePath(a) : { pack: a, path: b };
  const url = assets.url(pack, path);
  if (!url) throw new Error(`no manifest entry for scene ${pack}/${path}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const reg = xuiRegistry();
  const doc = parseXur(bytes, reg);
  const unknownClasses: string[] = [];
  walk(doc.root, (o) => { if (!reg.has(o.className) && !unknownClasses.includes(o.className)) unknownClasses.push(o.className); });
  return { id: pack + '/' + path, pack, path, doc, root: doc.root, unknownClasses };
}

export function walk(o: XuObject, fn: (o: XuObject, depth: number) => void, depth = 0): void {
  fn(o, depth);
  for (const c of o.children) walk(c, fn, depth + 1);
}
