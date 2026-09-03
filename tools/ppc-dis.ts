// Minimal PowerPC immediate-form disassembler for reading XUI property
// registration code: enough to see lis/addi string addresses, li type
// immediates, and the stores that place them into a table.
//
//   node --import tsx tools/ppc-dis.ts <basefile.exe> <startVa> <endVa>
import { readFileSync } from 'node:fs';

const [file, a, b] = process.argv.slice(2);
const buf = readFileSync(file!);
const peOff = buf.readUInt32LE(0x3c);
const numSections = buf.readUInt16LE(peOff + 6);
const optSize = buf.readUInt16LE(peOff + 20);
const imageBase = buf.readUInt32LE(peOff + 24 + 28);
const secTab = peOff + 24 + optSize;
let text = { va: 0, raw: 0 };
let rdata = { va: 0, raw: 0, size: 0 };
for (let i = 0; i < numSections; i++) {
  const o = secTab + i * 40;
  const name = buf.toString('ascii', o, o + 8).replace(/\0.*$/, '');
  const s = { va: imageBase + buf.readUInt32LE(o + 12), raw: buf.readUInt32LE(o + 12) /* flat: xex1tool writes each section at its RVA; the header's PointerToRawData is 0x200 low for .text (LEARNINGS: section headers lie) */, size: buf.readUInt32LE(o + 8) };
  if (name === '.text') text = s;
  if (name === '.rdata') rdata = s;
}
function wide(va: number): string | null {
  if (va < rdata.va || va >= rdata.va + rdata.size) return null;
  let s = '';
  for (let p = rdata.raw + (va - rdata.va); p + 1 < buf.length; p += 2) {
    if (buf[p] === 0 && buf[p + 1] === 0) break;
    if (buf[p] !== 0 || buf[p + 1]! < 0x20 || buf[p + 1]! >= 0x7f) return null;
    s += String.fromCharCode(buf[p + 1]!);
  }
  return s;
}
const hi = new Map<number, number>();
for (let va = parseInt(a!, 16); va < parseInt(b!, 16); va += 4) {
  const ins = buf.readUInt32BE(text.raw + (va - text.va));
  const op = ins >>> 26, rD = (ins >>> 21) & 31, rA = (ins >>> 16) & 31, imm = ins & 0xffff;
  const s = imm >= 0x8000 ? imm - 0x10000 : imm;
  let t = '';
  if (op === 15 && rA === 0) { t = `lis r${rD}, 0x${imm.toString(16)}`; hi.set(rD, imm << 16); }
  else if (op === 14 && rA === 0) t = `li r${rD}, ${s}`;
  else if (op === 14) { const base = hi.get(rA); const va2 = base !== undefined ? ((base + s) >>> 0) : null; const w = va2 !== null ? wide(va2) : null; t = `addi r${rD}, r${rA}, ${s}${va2 !== null ? ` ; =0x${va2.toString(16)}${w ? ' "' + w + '"' : ''}` : ''}`; }
  else if (op === 24) { const base = hi.get(rA); const va2 = base !== undefined ? ((base | imm) >>> 0) : null; const w = va2 !== null ? wide(va2) : null; t = `ori r${rD}, r${rA}, 0x${imm.toString(16)}${w ? ` ; "${w}"` : ''}`; }
  else if (op === 36) t = `stw r${rD}, ${s}(r${rA})`;
  else if (op === 37) t = `stwu r${rD}, ${s}(r${rA})`;
  else if (op === 38) t = `stb r${rD}, ${s}(r${rA})`;
  else if (op === 44) t = `sth r${rD}, ${s}(r${rA})`;
  else if (op === 32) t = `lwz r${rD}, ${s}(r${rA})`;
  else if (op === 18) t = `b${ins & 1 ? 'l' : ''} 0x${((va + ((ins & 0x03fffffc) << 6 >> 6)) >>> 0).toString(16)}`;
  else if (op === 19 && ((ins >>> 1) & 0x3ff) === 16) t = 'blr';
  else if (op === 31) t = `(X-form op31 xo=${(ins >>> 1) & 0x3ff})`;
  else t = `op${op}`;
  console.log(`${va.toString(16)}  ${ins.toString(16).padStart(8, '0')}  ${t}`);
}
