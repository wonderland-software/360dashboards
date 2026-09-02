// Pull UTF-16BE and ASCII strings out of the decrypted dashboard image, with
// their virtual addresses, so XUI class registrations can be located.
//
//   node --import tsx tools/pe-strings.ts <basefile.exe> [--grep <regex>] [--min 4]
//
// The image is a big-endian PowerPC PE: section headers are little-endian
// (PE convention) but the string data the code points at is UTF-16BE.
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const file = args[0]!;
const grepIx = args.indexOf('--grep');
const grep = grepIx >= 0 ? new RegExp(args[grepIx + 1]!) : null;
const minIx = args.indexOf('--min');
const min = minIx >= 0 ? Number(args[minIx + 1]) : 4;
const buf = readFileSync(file);

// PE section table (little-endian, standard layout).
const peOff = buf.readUInt32LE(0x3c);
const numSections = buf.readUInt16LE(peOff + 6);
const optSize = buf.readUInt16LE(peOff + 20);
const imageBase = buf.readUInt32LE(peOff + 24 + 28);
const secTab = peOff + 24 + optSize;
export interface Section { name: string; va: number; vsize: number; raw: number; rawSize: number }
const sections: Section[] = [];
for (let i = 0; i < numSections; i++) {
  const o = secTab + i * 40;
  sections.push({
    name: buf.toString('ascii', o, o + 8).replace(/\0.*$/, ''),
    vsize: buf.readUInt32LE(o + 8),
    va: imageBase + buf.readUInt32LE(o + 12),
    rawSize: buf.readUInt32LE(o + 16),
    raw: buf.readUInt32LE(o + 20),
  });
}
if (!grep) for (const s of sections) console.log(`section ${s.name.padEnd(8)} va=${s.va.toString(16)} size=${s.vsize.toString(16)} raw=${s.raw.toString(16)}`);

function vaOf(off: number): number {
  for (const s of sections) if (off >= s.raw && off < s.raw + s.rawSize) return s.va + (off - s.raw);
  return -1;
}

const printable = (c: number) => c >= 0x20 && c < 0x7f;
// UTF-16BE: 00 xx pairs.
let i = 0;
while (i + 1 < buf.length) {
  if (buf[i] === 0 && printable(buf[i + 1]!)) {
    let j = i;
    let s = '';
    while (j + 1 < buf.length && buf[j] === 0 && printable(buf[j + 1]!)) {
      s += String.fromCharCode(buf[j + 1]!);
      j += 2;
    }
    if (s.length >= min && (!grep || grep.test(s))) console.log(`w ${vaOf(i).toString(16)} ${s}`);
    i = j;
  } else i++;
}
i = 0;
while (i < buf.length) {
  if (printable(buf[i]!)) {
    let j = i;
    while (j < buf.length && printable(buf[j]!)) j++;
    const s = buf.toString('ascii', i, j);
    if (s.length >= min && (!grep || grep.test(s))) console.log(`a ${vaOf(i).toString(16)} ${s}`);
    i = j;
  } else i++;
}
