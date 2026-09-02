// Fetch a .xur, parse it with the build-6770 class registry, and hand back the
// object tree. Nothing here draws; nothing here invents.
import { XuRegistry, parseXur, type XuObject, type XurDocument } from '@xur/index';
import registryJson from '../../../xur/extensions/6770/registry.json';
import { AssetIndex, splitScenePath } from '../assets/AssetIndex';

let registry: XuRegistry | null = null;
export function xuiRegistry(): XuRegistry {
  // The registry is generated from the decrypted executable, so it is the
  // property order build 6770 actually shipped, not a later build's XML.
  if (!registry) registry = new XuRegistry(registryJson as never);
  return registry;
}

export interface LoadedScene {
  /** "<pack>/<path>" */
  id: string;
  pack: string;
  path: string;
  doc: XurDocument;
  root: XuObject;
  /** Classes in the file that the registry does not describe. Always empty in
   *  6770; kept because a later build will not be. */
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
