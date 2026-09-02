// Find every place the PowerPC code materialises the address of a wide
// string in .rdata (lis rX, hi ; addi/ori rX, rX, lo) and print them in
// code order. Static tables holding string POINTERS would show up in a plain
// byte scan; the XUI property tables in dash.xex do not, so they are built
// by code, and the order of string references inside one function is the
// declaration order of that class's properties.
//
//   node --import tsx tools/ppc-strings.ts <basefile.exe> [--around <regex> --n 40]
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const buf = readFileSync(args[0]!);
const aroundIx = args.indexOf('--around');
const around = aroundIx >= 0 ? new RegExp(args[aroundIx + 1]!) : null;
const nIx = args.indexOf('--n');
const N = nIx >= 0 ? Number(args[nIx + 1]) : 40;

const peOff = buf.readUInt32LE(0x3c);
const numSections = buf.readUInt16LE(peOff + 6);
const optSize = buf.readUInt16LE(peOff + 20);
const imageBase = buf.readUInt32LE(peOff + 24 + 28);
const secTab = peOff + 24 + optSize;
const secs: { name: string; va: number; size: number; raw: number }[] = [];
for (let i = 0; i < numSections; i++) {
  const o = secTab + i * 40;
  secs.push({ name: buf.toString('ascii', o, o + 8).replace(/\0.*$/, ''), size: buf.readUInt32LE(o + 8), va: imageBase + buf.readUInt32LE(o + 12), raw: buf.readUInt32LE(o + 20) });
}
const rdata = secs.find((s) => s.name === '.rdata')!;
const text = secs.find((s) => s.name === '.text')!;
const va2off = (va: number) => (va >= rdata.va && va < rdata.va + rdata.size ? rdata.raw + (va - rdata.va) : -1);

function wideAt(va: number): string | null {
  const off = va2off(va);
  if (off < 0) return null;
  let s = '';
  for (let p = off; p + 1 < buf.length; p += 2) {
    const hi = buf[p]!;
    const lo = buf[p + 1]!;
    if (hi === 0 && lo === 0) break;
    if (hi !== 0 || lo < 0x20 || lo >= 0x7f) return null;
    s += String.fromCharCode(lo);
    if (s.length > 64) break;
  }
  return s.length >= 2 ? s : null;
}

interface Ref { off: number; va: number; str: string }
const refs: Ref[] = [];
const hiOf = new Map<number, number>();
for (let o = text.raw; o + 4 <= text.raw + text.size; o += 4) {
  const ins = buf.readUInt32BE(o);
  const op = ins >>> 26;
  const rD = (ins >>> 21) & 31;
  const rA = (ins >>> 16) & 31;
  const imm = ins & 0xffff;
  if (op === 15 && rA === 0) {
    hiOf.set(rD, imm << 16);
  } else if (op === 14 && hiOf.has(rA)) {
    const simm = imm >= 0x8000 ? imm - 0x10000 : imm;
    const va = (hiOf.get(rA)! + simm) >>> 0;
    const s = wideAt(va);
    if (s) refs.push({ off: o, va, str: s });
    if (rD === rA) hiOf.delete(rA);
  } else if (op === 24 && hiOf.has(rA)) {
    const va = (hiOf.get(rA)! | imm) >>> 0;
    const s = wideAt(va);
    if (s) refs.push({ off: o, va, str: s });
    if (rD === rA) hiOf.delete(rA);
  } else if (op === 19 && ((ins >>> 1) & 0x3ff) === 16) {
    hiOf.clear(); // blr: function boundary
  }
}

const codeVa = (r: Ref) => (text.va + (r.off - text.raw)).toString(16);
if (!around) {
  for (const r of refs) console.log(`${codeVa(r)} ${r.va.toString(16)} ${r.str}`);
} else {
  refs.forEach((r, i) => {
    if (around.test(r.str)) {
      console.log(`=== ${r.str} referenced at code ${codeVa(r)}`);
      for (let j = Math.max(0, i - 4); j < Math.min(refs.length, i + N); j++) {
        const q = refs[j]!;
        console.log(`${j === i ? '>' : ' '} ${codeVa(q)} ${q.str}`);
      }
    }
  });
}
