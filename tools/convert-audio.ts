// Convert every sound under extracted/6770/xuiz to Ogg Opus for the browser.
//
//   node --import tsx tools/convert-audio.ts [--in <dir>] [--out <dir>] [--force]
//
// The .xma files in Blades already carry a RIFF/WAVE header with an xma1 fmt
// tag (0x0165), so ffmpeg demuxes them with no help from us; the only reason
// to look inside a fmt chunk is if one is refused, and this prints that chunk
// when it happens. .wav inputs are converted the same way AND copied through
// unchanged, because a short UI blip is small and an untranscoded copy is the
// only way to hear what the encoder did to it.
//
// Every output is then probed: a file that "converted" to zero samples is the
// failure mode worth catching, so duration > 0 and channels >= 1 are asserted
// per file rather than trusting ffmpeg's exit code.
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';

const args = process.argv.slice(2);
function flag(name: string, fallback: string): string {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1]! : fallback;
}
const inDir = flag('--in', 'extracted/6770/xuiz');
const outDir = flag('--out', 'public/assets/6770/audio');
const force = args.includes('--force');

const AUDIO = /\.(xma|wav)$/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (AUDIO.test(e)) out.push(p);
  }
  return out;
}

/** The fmt chunk of a RIFF file, for the report when ffmpeg refuses one. */
function describeFmt(file: string): string {
  const b = new Uint8Array(readFileSync(file));
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!) !== 'RIFF') return 'no RIFF header';
  let p = 12;
  while (p + 8 <= b.byteLength) {
    const id = String.fromCharCode(b[p]!, b[p + 1]!, b[p + 2]!, b[p + 3]!);
    const len = dv.getUint32(p + 4, true);
    if (id === 'fmt ') {
      // RIFF is little-endian even on a big-endian console.
      return `fmt tag=0x${dv.getUint16(p + 8, true).toString(16)} channels=${dv.getUint16(p + 10, true)} rate=${dv.getUint32(p + 12, true)} chunkLen=${len}`;
    }
    p += 8 + len + (len & 1);
  }
  return 'no fmt chunk';
}

interface Probe {
  durationMs: number;
  channels: number;
}

function probe(file: string): Probe | string {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels,duration:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  if (r.status !== 0) return (r.stderr || 'ffprobe failed').trim();
  let j: { streams?: { channels?: number; duration?: string }[]; format?: { duration?: string } };
  try {
    j = JSON.parse(r.stdout) as typeof j;
  } catch {
    return 'ffprobe returned no JSON';
  }
  const s = j.streams?.[0];
  if (!s) return 'no audio stream';
  // Opus in Ogg often reports the duration on the container, not the stream.
  const secs = Number(s.duration ?? j.format?.duration ?? NaN);
  if (!Number.isFinite(secs)) return 'no duration';
  return { durationMs: Math.round(secs * 1000), channels: s.channels ?? 0 };
}

const inputs = existsSync(inDir) ? walk(inDir).sort() : [];
if (inputs.length === 0) {
  console.log(`AUDIO_FAIL no .xma or .wav under ${inDir}`);
  process.exit(1);
}

interface Row {
  out: string;
  durationMs: number;
  channels: number;
}
const rows: Row[] = [];
const failures: string[] = [];

for (const src of inputs) {
  // <pack>/<name>.ogg, keeping the original case of the stem.
  const rel = relative(inDir, src);
  const stem = basename(rel).replace(/\.(xma|wav)$/i, '');
  const dst = join(outDir, dirname(rel), `${stem}.ogg`);
  mkdirSync(dirname(dst), { recursive: true });

  if (force || !existsSync(dst)) {
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-c:a', 'libopus', '-b:a', '96k', dst], { encoding: 'utf8' });
    if (r.status !== 0) {
      failures.push(`${rel}: ffmpeg refused it (${describeFmt(src)}) - ${(r.stderr || '').trim().split('\n').slice(-1)[0]}`);
      continue;
    }
  }

  // A .wav also goes across untouched, so the raw asset is one fetch away.
  if (/\.wav$/i.test(src)) {
    const raw = join(outDir, dirname(rel), basename(rel));
    if (force || !existsSync(raw)) copyFileSync(src, raw);
  }

  const p = probe(dst);
  if (typeof p === 'string') {
    failures.push(`${rel}: ${p}`);
    continue;
  }
  if (p.durationMs <= 0) {
    failures.push(`${rel}: converted to ${p.durationMs} ms of audio`);
    continue;
  }
  if (p.channels < 1) {
    failures.push(`${rel}: ${p.channels} channels`);
    continue;
  }
  rows.push({ out: relative(outDir, dst), durationMs: p.durationMs, channels: p.channels });
}

const w = Math.max(4, ...rows.map((r) => r.out.length));
console.log(`${'file'.padEnd(w)}  ${'ms'.padStart(7)}  ch`);
for (const r of rows) console.log(`${r.out.padEnd(w)}  ${String(r.durationMs).padStart(7)}  ${r.channels}`);
for (const f of failures) console.log(`  FAIL ${f}`);
console.log(failures.length === 0 ? `AUDIO_PASS ${rows.length} files` : `AUDIO_FAIL ${failures.length} of ${inputs.length} files`);
process.exit(failures.length === 0 ? 0 : 1);
