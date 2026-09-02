// XUIZ: the Xbox 360 UI resource pack. Used both for the loose shrdres.xzp and
// for every scene pack embedded in dash.xex. Uncompressed; a header, a table
// of contents, then the file bodies back to back.
//
// Layout, verified by hand on Blades 6770 `dashmain` (xxd, 2026-09-02):
//   0x00 "XUIZ"
//   0x04 u32 version        1 = Blades/NXE (UTF-16BE names), 3 = Metro (ASCII)
//   0x08 u32 fileSize       equals the pack's byte length
//   0x0C u32 zero
//   0x10 u32 dataOffset     length of the TOC; data region = 0x16 + dataOffset
//   0x14 u16 entryCount
//   0x16 TOC entries: u32 size, u32 offset (relative to the data region,
//        cumulative), u8 nameLen (in characters), then the name
//        (v1: nameLen UTF-16BE units; v3: nameLen ASCII bytes)
// The first entry of dashmain (dashmain.xur, size 0x10D8C, offset 0) lands at
// 0x16 + 0x536 = 0x54C = 1356, exactly where the first "XUIB" magic sits.
import { BinaryReader } from '@xur/reader';

export const XUIZ_HEADER_SIZE = 0x16;

export interface XuizEntry {
  /** Name as stored, backslashes included (e.g. "de-de\\LiveProfile.xus"). */
  name: string;
  size: number;
  /** Offset relative to the data region. */
  offset: number;
  /** Absolute byte offset inside the pack. */
  start: number;
}

export interface XuizHeader {
  version: number;
  fileSize: number;
  dataOffset: number;
  entryCount: number;
  dataStart: number;
}

export interface XuizPack {
  header: XuizHeader;
  entries: XuizEntry[];
}

export function readXuizHeader(bytes: Uint8Array): XuizHeader {
  const r = new BinaryReader(bytes);
  const magic = r.tag();
  if (magic !== 'XUIZ') throw new Error(`not a XUIZ pack (magic "${magic}")`);
  const version = r.u32();
  if (version !== 1 && version !== 3) throw new Error(`unsupported XUIZ version ${version}`);
  const fileSize = r.u32();
  if (fileSize !== bytes.byteLength) {
    throw new Error(`XUIZ fileSize ${fileSize} != actual ${bytes.byteLength}`);
  }
  r.u32(); // always zero in every pack seen so far
  const dataOffset = r.u32();
  const entryCount = r.u16();
  return { version, fileSize, dataOffset, entryCount, dataStart: XUIZ_HEADER_SIZE + dataOffset };
}

export function readXuiz(bytes: Uint8Array): XuizPack {
  const header = readXuizHeader(bytes);
  const r = new BinaryReader(bytes, XUIZ_HEADER_SIZE);
  const entries: XuizEntry[] = [];
  for (let i = 0; i < header.entryCount; i++) {
    const size = r.u32();
    const offset = r.u32();
    const nameLen = r.u8();
    const name = header.version === 1 ? r.utf16be(nameLen) : r.ascii(nameLen);
    const start = header.dataStart + offset;
    if (start + size > bytes.byteLength) {
      throw new Error(`entry "${name}" [${start}, ${start + size}) overruns pack of ${bytes.byteLength}`);
    }
    entries.push({ name, size, offset, start });
  }
  if (r.pos !== header.dataStart) {
    throw new Error(`TOC ended at 0x${r.pos.toString(16)} but data starts at 0x${header.dataStart.toString(16)}`);
  }
  return { header, entries };
}

export function entryBytes(bytes: Uint8Array, e: XuizEntry): Uint8Array {
  return bytes.subarray(e.start, e.start + e.size);
}

/** Pack-relative path with backslashes turned into '/'. Rejects traversal. */
export function entryPath(e: XuizEntry): string {
  const p = e.name.replace(/\\/g, '/');
  if (p.startsWith('/') || p.split('/').some((seg) => seg === '..' || seg === '')) {
    throw new Error(`refusing unsafe entry name "${e.name}"`);
  }
  return p;
}

/** Entries sorted by offset must tile the data region with no gaps or overlap. */
export function checkTiling(pack: XuizPack, byteLength: number): string[] {
  const problems: string[] = [];
  const sorted = [...pack.entries].sort((a, b) => a.start - b.start);
  let cursor = pack.header.dataStart;
  for (const e of sorted) {
    if (e.start < cursor) problems.push(`"${e.name}" overlaps the previous entry by ${cursor - e.start} bytes`);
    else if (e.start > cursor) problems.push(`gap of ${e.start - cursor} bytes before "${e.name}"`);
    cursor = e.start + e.size;
  }
  if (cursor !== byteLength) problems.push(`data ends at ${cursor}, pack is ${byteLength} bytes`);
  return problems;
}
