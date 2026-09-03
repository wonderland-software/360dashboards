// XUS: the Xbox 360 localized string table. One table per scene per locale
// (`<locale>/<scene>.xus` next to `<scene>.xur`), plus a few pack-wide
// `Strings.xus` tables the title code indexes directly.
//
// Layout, verified against all 3,234 .xus files under extracted/6770 (every
// one parses to exactly EOF with the entry count the header declares):
//   0x00 "XUIS"
//   0x04 u8  version      1 in 6770 and 9199 (UTF-16BE strings), 2 in Metro
//                         17559 (NUL-terminated UTF-8 strings, see below)
//   0x05 u8  kind         0 = NAMED, 1 = KEYED, 2 = POSITIONAL (see below)
//   0x06 u32 fileSize     equals the file's byte length
//   0x0A u16 entryCount
//   0x0C entries, back to back
//
// The one ambiguous field was 0x06. A hex dump of a small table reads
// `00 00 | 0a c0`, which looks like a u16 pad plus a u16 length. It is one
// u32: ten tables in the corpus carry 0x0001 in the first half (they are
// larger than 64 KiB; the biggest is 79,412 bytes) and for all 3,234 the
// big-endian u32 at 0x06 equals the file size exactly.
//
// An entry is `u16 charCount, charCount UTF-16BE code units` (the VALUE) in
// version 1, or a NUL-terminated UTF-8 string in version 2 (all 3,857 tables
// of Metro 17559 parse to EOF that way, 47,599 entries, 23,686 of them with
// non-ASCII bytes that decode as strict UTF-8), followed by a key whose
// shape depends on `kind`:
//   KEYED (1, 2,970 tables)      u32 key, strictly increasing within a table
//   NAMED (0, 12 tables)         another string in the version's encoding,
//                                e.g. "IDS_ACCTINFO_META_PHONE"
//   POSITIONAL (2, 252 tables)   nothing; the entry's position IS the key
//
// The KEYED u32 is three fields, not an opaque id. Decoded as
// (u8 classIndex, u8 propIndex, u16 objectId) it names one property of one
// object in the sibling .xur:
//   classIndex  index into the object's non-transparent class hierarchy
//               (XuiElement = 0, so XuiText.Text is 1 and DashScene.* is 3)
//   propIndex   index of the property inside that class, in mask-bit order
//               (XuiControl.Text = 0x0a, XuiText.Text = 0x00,
//                DashScene.PanelStrings = 0x01)
//   objectId    1-based POSTORDER position of the object in the .xur tree
//               (children before their parent; the XuiCanvas root is last)
// Checked over the whole corpus: all 14,407 keyed entries in the 2,860 tables
// that sit beside their .xur resolve to an existing string property. Zero
// misses. English is not in these tables at all - it is the literal already
// stored in the .xur, and a locale table overwrites it property by property.
import { BinaryReader } from '@xur/reader';

export const XUS_MAGIC = 'XUIS';
export const XUS_HEADER_SIZE = 0x0c;

/** How a table names its entries. The byte at 0x05. */
export const XusKind = {
  /** 0: each value is followed by an IDS_* name. */
  Named: 0,
  /** 1: each value is followed by a u32 (classIndex, propIndex, objectId). */
  Keyed: 1,
  /** 2: no key at all; the runtime indexes by position. */
  Positional: 2,
} as const;
export type XusKind = (typeof XusKind)[keyof typeof XusKind];

/** The three fields packed into a KEYED entry's u32. */
export interface XusRef {
  /** Index into the target object's class hierarchy, XuiElement = 0. */
  classIndex: number;
  /** Index of the property within that class, in mask-bit order. */
  propIndex: number;
  /** 1-based postorder position of the object in the sibling .xur. */
  objectId: number;
}

export interface XusEntry {
  /** Position in the table. The only key a POSITIONAL table has. */
  index: number;
  /** The u32 key for a KEYED table; the position for the other two kinds. */
  key: number;
  /** `key` as 0x-prefixed 8 hex digits, the form used in logs and manifests. */
  keyHex: string;
  /** The IDS_* name for a NAMED table, else null. */
  name: string | null;
  /** Decoded key for a KEYED table, else null. */
  ref: XusRef | null;
  /** The localized text. Embedded "\r\n" and literal "\0" separators kept. */
  value: string;
}

export interface XusTable {
  version: number;
  /** The raw byte at 0x05. Kept as `flags` because that is what it looks like. */
  flags: number;
  kind: XusKind;
  fileSize: number;
  entries: XusEntry[];
}

/** Split a KEYED u32 into the object/property it points at. */
export function parseXusKey(key: number): XusRef {
  return {
    classIndex: (key >>> 24) & 0xff,
    propIndex: (key >>> 16) & 0xff,
    objectId: key & 0xffff,
  };
}

/** The inverse of parseXusKey. */
export function buildXusKey(ref: XusRef): number {
  return (((ref.classIndex & 0xff) << 24) | ((ref.propIndex & 0xff) << 16) | (ref.objectId & 0xffff)) >>> 0;
}

export function xusKeyHex(key: number): string {
  return `0x${(key >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * The token the runtime looks a string up by: the hex key for a KEYED table,
 * the IDS_ name for a NAMED one, and "#<position>" for a POSITIONAL one.
 * Distinct prefixes on purpose, so one map can hold all three kinds without
 * a numeric name and a numeric position ever colliding.
 */
export function xusToken(e: XusEntry): string {
  if (e.name !== null) return e.name;
  if (e.ref !== null) return e.keyHex;
  return `#${e.index}`;
}

export function parseXus(bytes: Uint8Array): XusTable {
  const r = new BinaryReader(bytes);
  const magic = r.tag();
  if (magic !== XUS_MAGIC) throw new Error(`not a XUS table (magic "${magic}")`);
  const version = r.u8();
  if (version !== 1 && version !== 2) throw new Error(`unsupported XUS version ${version}`);
  const text = (): string => (version === 1 ? r.utf16be(r.u16()) : r.cstringUtf8());
  const flags = r.u8();
  if (flags !== XusKind.Named && flags !== XusKind.Keyed && flags !== XusKind.Positional) {
    throw new Error(`unknown XUS kind ${flags}`);
  }
  const kind = flags as XusKind;
  const fileSize = r.u32();
  if (fileSize !== bytes.byteLength) {
    throw new Error(`XUS fileSize ${fileSize} != actual ${bytes.byteLength}`);
  }
  const entryCount = r.u16();

  const entries: XusEntry[] = [];
  for (let i = 0; i < entryCount; i++) {
    const value = text();
    let key = i;
    let name: string | null = null;
    let ref: XusRef | null = null;
    if (kind === XusKind.Keyed) {
      key = r.u32();
      ref = parseXusKey(key);
    } else if (kind === XusKind.Named) {
      name = text();
    }
    entries.push({ index: i, key, keyHex: xusKeyHex(key), name, ref, value });
  }
  // The count and the entry shape are only proven right together: a wrong
  // entry shape desynchronises and lands short of or past the last byte.
  if (r.pos !== bytes.byteLength) {
    throw new Error(`XUS ${entryCount} entries end at 0x${r.pos.toString(16)}, file is 0x${bytes.byteLength.toString(16)} bytes`);
  }
  return { version, flags, kind, fileSize, entries };
}

/** Lookup table keyed by xusToken: hex key, IDS_ name, or "#position". */
export function xusToMap(table: XusTable): Map<string, string> {
  const m = new Map<string, string>();
  for (const e of table.entries) m.set(xusToken(e), e.value);
  return m;
}

/** Just the tokens, in table order. Handy for comparing two locales. */
export function xusKeySet(table: XusTable): string[] {
  return table.entries.map(xusToken);
}
