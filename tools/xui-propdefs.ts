// Recover XUI class property tables from the dashboard executable.
//
//   node --import tsx tools/xui-propdefs.ts <basefile.exe> > extracted/<build>/propdefs.json
//
// dash.xex registers every XUI class in code: each property definition is a
// 0x30-byte record filled by stores relative to some base register:
//     +0x04 index (u32)      +0x08 data offset     +0x10 name (LPCWSTR)
//     +0x14 type (XUI_PROP_TYPE: 1 bool 2 int 3 uint 4 float 5 string
//                 6 color 7 vector 8 quaternion 9 object 10 custom)
// (verified by hand on XuiElement's Anchor/Pivot/Show and DashScene's three
// Panel* strings, 2026-09-02). This tool simulates just enough PowerPC
// (lis/addi/ori/li/mr and stw) to see those stores, groups them into records
// by base register + offset, and emits every table it finds together with the
// class-registration structs (name, base-class name, table pointer, count)
// that reference them.
import { readFileSync } from 'node:fs';

export interface PropDefTable { fn: string; at: string; baseReg: number; props: { i: number; name: string; type: string; off: number | null }[] }
export interface Registration { fn: string; name: string; base: string; table: number | null; count: number | null }
export interface PropDefs { types: string[]; tables: PropDefTable[]; rejected: { fn: string; at: string; props: string[] }[]; registrations: Registration[] }

export function extractPropDefs(buf: Buffer): PropDefs {
const peOff = buf.readUInt32LE(0x3c);
const numSections = buf.readUInt16LE(peOff + 6);
const optSize = buf.readUInt16LE(peOff + 20);
const imageBase = buf.readUInt32LE(peOff + 24 + 28);
const secTab = peOff + 24 + optSize;
interface Sec { name: string; va: number; raw: number; size: number }
const secs: Sec[] = [];
for (let i = 0; i < numSections; i++) {
  const o = secTab + i * 40;
  secs.push({ name: buf.toString('ascii', o, o + 8).replace(/\0.*$/, ''), va: imageBase + buf.readUInt32LE(o + 12), raw: buf.readUInt32LE(o + 20), size: buf.readUInt32LE(o + 8) });
}
const text = secs.find((s) => s.name === '.text')!;
const rdata = secs.find((s) => s.name === '.rdata')!;
const data = secs.find((s) => s.name === '.data')!;

function wide(va: number): string | null {
  if (va < rdata.va || va >= rdata.va + rdata.size) return null;
  let s = '';
  for (let p = rdata.raw + (va - rdata.va); p + 1 < buf.length; p += 2) {
    if (buf[p] === 0 && buf[p + 1] === 0) break;
    if (buf[p] !== 0 || buf[p + 1]! < 0x20 || buf[p + 1]! >= 0x7f) return null;
    s += String.fromCharCode(buf[p + 1]!);
    if (s.length > 80) return null;
  }
  return s.length ? s : null;
}

type Val = { kind: 'imm'; v: number } | { kind: 'addr'; v: number } | { kind: 'str'; v: string; va: number };
interface Store { at: number; base: number; off: number; val: Val }

// One pass over .text; register file reset at every blr.
const stores: Store[] = [];
let regs = new Map<number, Val>();
const hi = new Map<number, number>();
let fnStart = text.va;
const functions: { start: number; stores: Store[] }[] = [];
let cur: Store[] = [];
for (let o = text.raw; o + 4 <= text.raw + text.size; o += 4) {
  const va = text.va + (o - text.raw);
  const ins = buf.readUInt32BE(o);
  const op = ins >>> 26, rD = (ins >>> 21) & 31, rA = (ins >>> 16) & 31, imm = ins & 0xffff;
  const s = imm >= 0x8000 ? imm - 0x10000 : imm;
  if (op === 15 && rA === 0) { hi.set(rD, imm << 16); regs.delete(rD); }
  else if (op === 14 && rA === 0) { regs.set(rD, { kind: 'imm', v: s }); }
  else if (op === 14 || op === 24) {
    const h = hi.get(rA);
    if (h !== undefined) {
      const addr = (op === 14 ? h + s : h | imm) >>> 0;
      const w = wide(addr);
      regs.set(rD, w ? { kind: 'str', v: w, va: addr } : { kind: 'addr', v: addr });
    } else regs.delete(rD);
    if (rD !== rA) { /* keep hi for rA */ }
  } else if (op === 31 && ((ins >>> 1) & 0x3ff) === 444) { // or rA, rS, rB  (mr)
    const rS = rD, rB = (ins >>> 11) & 31;
    if (rS === rB) { const v = regs.get(rS); if (v) regs.set(rA, v); else regs.delete(rA); const h = hi.get(rS); if (h !== undefined) hi.set(rA, h); }
    else regs.delete(rA);
  } else if (op === 36) { // stw rS, d(rA)
    const v = regs.get(rD);
    if (v) { const st = { at: va, base: rA, off: s, val: v }; stores.push(st); cur.push(st); }
  } else if (op === 19 && ((ins >>> 1) & 0x3ff) === 16) { // blr
    functions.push({ start: fnStart, stores: cur });
    cur = []; fnStart = va + 4; regs = new Map(); hi.clear();
  } else if (op === 18 && (ins & 1)) { // bl: r3..r12 clobbered
    for (let r = 3; r <= 12; r++) { regs.delete(r); hi.delete(r); }
  } else if (op === 32 || op === 40 || op === 34) { regs.delete(rD); hi.delete(rD); } // loads
}

// Property records: a name store at off N, its type store at N+4 within a
// few instructions on either side (the compiler hoists the type immediate), and its index store at N-0xC shortly before. Tight
// code-distance windows matter: several classes' tables are built back to
// back on one stack frame, so a loose window pairs a name with a neighbour's
// type. Records are then ordered by code position and split into runs
// wherever the index restarts, one run per class.
interface Prop { index: number; name: string; type: number; nameVa: number; dataOffset: number | null; at: number }
interface Run { fn: string; at: string; baseReg: number; props: Prop[] }
const runs: Run[] = [];
const TYPE = ['empty', 'bool', 'integer', 'unsigned', 'float', 'string', 'color', 'vector', 'quaternion', 'object', 'custom'];
for (const f of functions) {
  const byBase = new Map<number, Store[]>();
  for (const st of f.stores) byBase.set(st.base, [...(byBase.get(st.base) ?? []), st]);
  for (const [base, sts] of byBase) {
    const props: Prop[] = [];
    for (const st of sts) {
      if (st.val.kind !== 'str') continue;
      const type = sts.find((x) => x.off === st.off + 4 && x.val.kind === 'imm' && x.val.v >= 1 && x.val.v <= 10 && Math.abs(x.at - st.at) <= 0x24);
      const index = sts.find((x) => x.off === st.off - 0xc && x.val.kind === 'imm' && x.at < st.at && x.at >= st.at - 0x100);
      const dataOff = sts.find((x) => x.off === st.off - 0x8 && x.val.kind === 'imm' && x.at < st.at && x.at >= st.at - 0x100);
      if (!type || !index) continue;
      props.push({ index: (index.val as { v: number }).v, name: st.val.v, type: (type.val as { v: number }).v, nameVa: st.val.va, dataOffset: dataOff ? (dataOff.val as { v: number }).v : null, at: st.at });
    }
    if (props.length === 0) continue;
    props.sort((a, b) => a.at - b.at);
    let cur: Prop[] = [];
    for (const p of props) {
      if (cur.length && p.index <= cur[cur.length - 1]!.index) { runs.push({ fn: f.start.toString(16), at: cur[0]!.at.toString(16), baseReg: base, props: cur }); cur = []; }
      cur.push(p);
    }
    if (cur.length) runs.push({ fn: f.start.toString(16), at: cur[0]!.at.toString(16), baseReg: base, props: cur });
  }
}
// A run must be a clean 0..n-1 sequence to be a property table.
const tables = runs.filter((r) => r.props.every((p, i) => p.index === i));
const rejected = runs.filter((r) => !r.props.every((p, i) => p.index === i));

// Class registration structs: a wide-string name store and, at +4 of the same
// base, another wide string (the base class), plus an 'addr' store into .data
// (the property table) and an imm (count) nearby.
interface Reg { fn: string; name: string; base: string; table: number | null; count: number | null }
const regsOut: Reg[] = [];
for (const f of functions) {
  const byBase = new Map<number, Store[]>();
  for (const st of f.stores) byBase.set(st.base, [...(byBase.get(st.base) ?? []), st]);
  for (const [, sts] of byBase) {
    for (const st of sts) {
      if (st.val.kind !== 'str') continue;
      const nxt = sts.find((x) => x.off === st.off + 4 && x.val.kind === 'str' && Math.abs(x.at - st.at) < 0x100);
      if (!nxt || nxt.val.kind !== 'str') continue;
      const tbl = sts.find((x) => x.off === st.off + 8 && x.val.kind === 'addr' && Math.abs(x.at - st.at) < 0x100);
      const cnt = sts.find((x) => x.off === st.off + 12 && x.val.kind === 'imm' && Math.abs(x.at - st.at) < 0x100);
      regsOut.push({ fn: f.start.toString(16), name: st.val.v, base: nxt.val.v, table: tbl ? (tbl.val as { v: number }).v : null, count: cnt ? (cnt.val as { v: number }).v : null });
    }
  }
}

return {
  types: TYPE,
  tables: tables.map((t) => ({ fn: t.fn, at: t.at, baseReg: t.baseReg, props: t.props.map((p) => ({ i: p.index, name: p.name, type: TYPE[p.type] ?? String(p.type), off: p.dataOffset })) })),
  rejected: rejected.map((t) => ({ fn: t.fn, at: t.at, props: t.props.map((p) => `${p.index}:${p.name}`) })),
  registrations: regsOut,
};
}

if (process.argv[1] && /xui-propdefs\.ts$/.test(process.argv[1])) {
  console.log(JSON.stringify(extractPropDefs(readFileSync(process.argv[2]!)), null, 1));
}
