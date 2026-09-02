// Convert every sound under extracted/<build>/xuiz to Ogg Opus for the browser.
//
//   node --import tsx tools/convert-audio.ts [--build 6770] [--in <dir>] [--out <dir>] [--force]
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
import { buildArg } from './builds';

const args = process.argv.slice(2);
function flag(name: string, fallback: string): string {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1]! : fallback;
}
const BUILD = buildArg(args);
const inDir = flag('--in', `extracted/${BUILD}/xuiz`);
const outDir = flag('--out', `public/assets/${BUILD}/audio`);
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

/** Decoded length in ms from the PCM sample count at 48 kHz (null on failure). */
function decodedMs(file: string, channels: number): number | null {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 's16le', '-ac', String(channels), '-ar', '48000', '-'], { maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 || !r.stdout) return null;
  return Math.round((r.stdout.length / (2 * channels * 48000)) * 1000);
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
  // The transcode must keep every sample: compare against the source's own
  // decoded duration and channel count (Judge AB-9199: a truncating ffmpeg
  // would otherwise still pass). 5 ms covers Opus's 20 ms framing rounding
  // on both ends after ffprobe's own rounding; the measured maximum is 0.02.
  // ffprobe reports no stream duration for XMA, so both sides are decoded
  // to PCM at one rate and the sample counts compared.
  const srcMs = decodedMs(src, p.channels);
  const outMs = decodedMs(dst, p.channels);
  if (srcMs === null || outMs === null || Math.abs(srcMs - outMs) > 5) {
    failures.push(`${rel}: source decodes to ${srcMs} ms, output to ${outMs} ms`);
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
