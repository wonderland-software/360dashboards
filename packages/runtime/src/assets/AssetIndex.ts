// Where a file named inside a scene actually lives.
//
// A XUR names images four ways (DOCUMENTED, and the only four forms in 6770):
//   "foo.png"            relative to the scene's OWN pack
//   "common://foo.png"   the dashcomm pack
//   "sharedres://foo.png" the shrdres pack
//   "file://Game:\\..."  a device path; nothing in the archive can supply it
// The manifest built by tools/build-manifest.ts is the authority for what was
// extracted, so a path that is not in it is a MISSING image, never a guess.

import { DEFAULT_BUILD, type BuildId } from '../build';

export interface ManifestEntry { path: string; kind: string; size: number; sha256: string; out: string }
export interface ManifestPack { name: string; entries: ManifestEntry[] }
export interface Manifest {
  build: string;
  packs: ManifestPack[];
  strings: Record<string, Record<string, Record<string, string>>>;
}

export const SCHEME_PACKS: Readonly<Record<string, string>> = {
  'common://': 'dashcomm',
  'sharedres://': 'shrdres',
};

export interface ResolvedAsset {
  /** URL to fetch, or null when nothing in the archive can supply it. */
  url: string | null;
  pack: string | null;
  path: string;
  /** A device path the console filled at runtime; not a missing asset. */
  deviceFile: boolean;
}

export class AssetIndex {
  /** pack -> lowercased path -> manifest entry */
  private readonly byPack = new Map<string, Map<string, ManifestEntry>>();
  /** lowercased basename -> "<pack>/<path>", for bare PressPath resolution.
   *  Every .xur basename in the build is unique across all 30 packs (swept:
   *  zero collisions), so a bare name resolves with one global index. */
  private readonly byBasename = new Map<string, string>();
  private readonly basenameCollisions = new Set<string>();

  private constructor(readonly manifest: Manifest, readonly base: string) {
    for (const pack of manifest.packs) {
      const m = new Map<string, ManifestEntry>();
      for (const e of pack.entries) {
        m.set(normalisePath(e.path), e);
        const base = basenameOf(e.path);
        if (this.byBasename.has(base) && this.byBasename.get(base) !== pack.name + '/' + e.path) {
          this.basenameCollisions.add(base);
        } else {
          this.byBasename.set(base, pack.name + '/' + e.path);
        }
      }
      this.byPack.set(pack.name, m);
    }
  }

  /**
   * `build` picks which extracted dump is served: public/assets/<build>/.
   * The manifest carries its own `build` field, and a mismatch is an error
   * rather than a silent cross-build render.
   */
  static async load(base: string, build: BuildId = DEFAULT_BUILD): Promise<AssetIndex> {
    const url = `${base}assets/${build}/manifest.json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`manifest ${url}: HTTP ${res.status}`);
    const manifest = (await res.json()) as Manifest;
    if (manifest.build !== build) throw new Error(`manifest ${url} says build ${manifest.build}, not ${build}`);
    return new AssetIndex(manifest, base);
  }

  get build(): string { return this.manifest.build; }

  packNames(): string[] { return this.manifest.packs.map((p) => p.name); }

  /** Every .xur in the build, as "<pack>/<path>", in manifest order. */
  scenePaths(): string[] {
    const out: string[] = [];
    for (const p of this.manifest.packs) {
      for (const e of p.entries) if (e.kind === 'xur') out.push(p.name + '/' + e.path);
    }
    return out;
  }

  /**
   * Resolve a bare file name (a XuiNavButton.PressPath) to "<pack>/<path>".
   * The console names the pack in code and the XUR names the file; because
   * basenames are globally unique this index gets the same answer, and a
   * collision is reported rather than guessed at.
   */
  findByBasename(name: string): string | null {
    const base = basenameOf(name);
    if (this.basenameCollisions.has(base)) return null;
    return this.byBasename.get(base) ?? null;
  }

  /** Names that exist in more than one pack; empty in build 6770. */
  get collisions(): string[] { return [...this.basenameCollisions]; }

  entry(pack: string, path: string): ManifestEntry | undefined {
    return this.byPack.get(pack)?.get(normalisePath(path));
  }

  url(pack: string, path: string): string | null {
    const e = this.entry(pack, path);
    return e ? this.base + 'assets/' + e.out : null;
  }

  /** Resolve an ImagePath / TextureFileName written inside `scenePack`. */
  resolveImage(scenePack: string, raw: string): ResolvedAsset {
    const path = raw.trim();
    if (path.toLowerCase().startsWith('file://')) {
      return { url: null, pack: null, path, deviceFile: true };
    }
    for (const [scheme, pack] of Object.entries(SCHEME_PACKS)) {
      if (path.toLowerCase().startsWith(scheme)) {
        const rest = path.slice(scheme.length);
        return { url: this.url(pack, rest), pack, path: rest, deviceFile: false };
      }
    }
    return { url: this.url(scenePack, path), pack: scenePack, path, deviceFile: false };
  }
}

/** The file name alone, lowercased. */
export function basenameOf(p: string): string {
  const n = normalisePath(p);
  const i = n.lastIndexOf('/');
  return i < 0 ? n : n.slice(i + 1);
}

/** XUR paths are authored on Windows, so both separators and any case occur. */
export function normalisePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
}

/** Split a "<pack>/<path/inside/pack>" scene id. */
export function splitScenePath(id: string): { pack: string; path: string } {
  const i = id.indexOf('/');
  if (i < 0) throw new Error(`scene id "${id}" is not <pack>/<path>`);
  return { pack: id.slice(0, i), path: id.slice(i + 1) };
}
