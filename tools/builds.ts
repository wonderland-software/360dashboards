// The dashboard builds the tools know, keyed by build number. One place for
// the archive path so every tool derives extracted/<build> and
// public/assets/<build> from the same string.
//
//   --build 9199   on any tool, or DASH_BUILD=9199 in the environment;
//                  the default is Blades 6770.
export interface BuildInfo {
  /** Directory inside the sparse archive clone that holds dash.xex + shrdres.xzp. */
  archive: string;
  /** Human name, used in messages only. */
  name: string;
}

export const BUILDS: Record<string, BuildInfo> = {
  '6770': { archive: 'vendor/archive/Blades/Retail/6770', name: 'Blades 6770' },
  '9199': { archive: 'vendor/archive/NXE/Retail/9199', name: 'NXE 9199' },
};

export const DEFAULT_BUILD = '6770';

/** The build named on the command line, in the environment, or the default; refuses one the table does not know. */
export function buildArg(argv: string[] = process.argv.slice(2)): string {
  const i = argv.indexOf('--build');
  const b = i >= 0 ? argv[i + 1] : process.env['DASH_BUILD'] || DEFAULT_BUILD;
  if (!b || !(b in BUILDS)) {
    console.error(`unknown build "${b}"; known: ${Object.keys(BUILDS).join(', ')}`);
    process.exit(2);
  }
  return b;
}

/** Positional arguments with `--flag value` pairs removed (so `--build 9199` is never taken for a file). */
export function positionals(argv: string[] = process.argv.slice(2), valueFlags: string[] = ['--build', '--registry', '--out', '--in', '--public', '--archive', '--corpus']): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (valueFlags.includes(a)) { i++; continue; }
    if (a.startsWith('--')) continue;
    out.push(a);
  }
  return out;
}
