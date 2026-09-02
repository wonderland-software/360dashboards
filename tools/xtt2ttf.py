#!/usr/bin/env python3
"""
xtt2ttf.py - convert Xbox 360 .xtt / .xttp1 console fonts into real TrueType files.

THE FORMAT (reverse engineered 2026-09; everything big-endian, nothing encrypted)

  0x000  char[4]   'xttf'
  0x004  byte[252] signature / hash blob (opaque, not needed to decode)
  0x100  uint32    id / flags
  0x104  uint32    (shell payload size - 16)
  0x108  uint32    total file size (always a multiple of 4096)
  0x10C  uint32    shell payload bytes from 0x118 to the next 4096 boundary
  0x110  uint32    uncompressed size of the shell
  0x114  uint32    0x00010000 version
  0x118  ...       one zlib stream -> the "shell": an sfnt with a normal table
                   directory but NON-STANDARD glyph tables.
  page-aligned tail (starts at the next 4096 boundary after the shell):
                   a run of 4096-byte pages, EACH its own independent zlib
                   stream.  Inflated, these pages are the glyph outline store.

Shell tables: cmap, head, hhea, hmtx, name are stock TrueType.  Then:
  xttf  264 bytes of header (version + shell size)
  xchk  one 20-byte SHA-1 per tail page (integrity, 271 entries for xenonclatin)
  xloc  like `loca` (long format, numGlyphs+1 uint32) BUT the values are PAGED
        addresses: (page_index << 16) | byte_offset_inside_that_inflated_page.
        That is why the last value looks absurd (0x010E0E5E = page 270).
  xglf  a stub entry whose offset/length describe the compressed tail region in
        FILE space, not the shell - the glyph bytes themselves live in the pages.

Once the pages are inflated and the paged addresses are flattened, the glyph
records are ordinary TrueType `glyf` data.  This script rebuilds a spec-legal
font: flat glyf + loca, the original cmap/head/hhea/hmtx/name, and synthesized
maxp / post / OS/2 (the console font ships none of those, and OTS - the
sanitizer in Chrome, Firefox and Safari - rejects a font without them).

Usage:  python3 xtt2ttf.py [files...]      (defaults to ./xtt/*.xtt*)
Output: ./out/<name>.ttf
"""
import os
import struct
import sys
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
PAGE = 4096


# ---------------------------------------------------------------- container

def parse_container(data):
    if data[:4] != b"xttf":
        raise ValueError("not an xttf container")
    ident, f104, total, shell_pad, shell_raw, ver = struct.unpack(">6I", data[0x100:0x118])
    if total != len(data):
        print("   warning: header size %d != actual %d" % (total, len(data)))
    shell = zlib.decompressobj().decompress(data[0x118:])
    if len(shell) != shell_raw:
        print("   warning: shell inflated to %d, header said %d" % (len(shell), shell_raw))
    tail_start = ((0x118 + shell_pad) // PAGE) * PAGE
    pages = []
    for off in range(tail_start, len(data), PAGE):
        chunk = data[off:off + PAGE]
        if chunk[0] != 0x78:
            pages.append(b"")          # zero padding page at EOF
            continue
        pages.append(zlib.decompressobj().decompress(chunk))
    return dict(ident=ident, total=total, shell=shell, pages=pages,
                tail_start=tail_start, version=ver)


def sfnt_dir(blob):
    ver, num = struct.unpack(">IH", blob[:6])
    tabs = {}
    for i in range(num):
        o = 12 + i * 16
        tag = blob[o:o + 4].decode("latin1", "replace")
        cs, off, ln = struct.unpack(">III", blob[o + 4:o + 16])
        tabs[tag] = (off, ln)
    return ver, tabs


# ---------------------------------------------------------------- rebuild

def flatten_glyphs(shell, tabs, pages):
    lo, ll = tabs["xloc"]
    xloc = struct.unpack(">%dI" % (ll // 4), shell[lo:lo + ll])
    n = len(xloc) - 1
    glyf = bytearray()
    loca = [0]
    stats = dict(empty=0, drawn=0, clipped=0, instr=0,
                 max_pts=0, max_cnt=0, max_instr=0, max_comp=0)
    for g in range(n):
        a, b = xloc[g], xloc[g + 1]
        pa, oa = a >> 16, a & 0xFFFF
        pb, ob = b >> 16, b & 0xFFFF
        if a == b or pa >= len(pages):
            loca.append(len(glyf))
            stats["empty"] += 1
            continue
        page = pages[pa]
        end = ob if pb == pa else len(page)
        if end > len(page):
            end = len(page)
            stats["clipped"] += 1
        rec = page[oa:end]
        if len(rec) >= 10:
            nc = struct.unpack(">h", rec[:2])[0]
            if nc >= 0:
                stats["max_cnt"] = max(stats["max_cnt"], nc)
                p = 10 + nc * 2
                if nc and p <= len(rec):
                    pts = struct.unpack(">H", rec[p - 2:p])[0] + 1
                    stats["max_pts"] = max(stats["max_pts"], pts)
                if p + 2 <= len(rec):
                    il = struct.unpack(">H", rec[p:p + 2])[0]
                    if il:
                        stats["instr"] += 1
                    stats["max_instr"] = max(stats["max_instr"], il)
            else:
                stats["max_comp"] = max(stats["max_comp"], 1)
            stats["drawn"] += 1
        glyf += rec
        while len(glyf) % 4:
            glyf += b"\0"
        loca.append(len(glyf))
    return bytes(glyf), loca, n, stats


LATIN = (list(range(0x20, 0x7F)) + list(range(0xA0, 0x180)) + list(range(0x2000, 0x2070))
         + [0x20AC, 0x2122, 0x2190, 0x2191, 0x2192, 0x2193, 0x25A0, 0x25AA, 0x25CF,
            0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2026, 0x00D7])


def composite_refs(rec):
    """(offset, gid) for each component of a composite glyph record."""
    refs, p = [], 10
    while p + 4 <= len(rec):
        flags, gid = struct.unpack(">HH", rec[p:p + 4])
        refs.append((p + 2, gid))
        p += 4 + (4 if flags & 1 else 2)
        if flags & 8:
            p += 2
        elif flags & 0x40:
            p += 4
        elif flags & 0x80:
            p += 8
        if not flags & 0x20:
            break
    return refs


def subset(mapping, glyf, loca, hmtx, keep_cps):
    """Keep only the glyphs the wanted codepoints need. Returns new pieces."""
    want = {c for c in keep_cps if c in mapping}
    keep = {0} | {mapping[c] for c in want}
    stack = list(keep)
    while stack:                                   # pull in composite parts
        g = stack.pop()
        if g + 1 >= len(loca):
            continue
        rec = glyf[loca[g]:loca[g + 1]]
        if len(rec) >= 10 and struct.unpack(">h", rec[:2])[0] < 0:
            for _, c in composite_refs(rec):
                if c not in keep:
                    keep.add(c)
                    stack.append(c)
    order = sorted(keep)
    remap = {old: new for new, old in enumerate(order)}
    ng, nl, nh = bytearray(), [0], bytearray()
    for old in order:
        rec = bytearray(glyf[loca[old]:loca[old + 1]])
        if len(rec) >= 10 and struct.unpack(">h", rec[:2])[0] < 0:
            for off, c in composite_refs(bytes(rec)):
                struct.pack_into(">H", rec, off, remap.get(c, 0))
        ng += rec
        while len(ng) % 4:
            ng += b"\0"
        nl.append(len(ng))
        nh += hmtx[old * 4:old * 4 + 4] if old * 4 + 4 <= len(hmtx) else b"\0\0\0\0"
    return ({c: remap[mapping[c]] for c in want}, bytes(ng), nl, bytes(nh), len(order))


def build_maxp(n, st):
    pts = max(st["max_pts"], 4)
    cnt = max(st["max_cnt"], 1)
    return struct.pack(">IH13H", 0x00010000, n,
                       pts, cnt,                 # maxPoints, maxContours
                       pts * 2, cnt * 2,         # maxComposite{Points,Contours}
                       2, 16,                    # maxZones, maxTwilightPoints
                       0, 0, 0, 64,              # storage, funcDefs, instrDefs, stack
                       max(st["max_instr"], 0),  # maxSizeOfInstructions
                       8, 4)                     # maxComponentElements, Depth


def build_post():
    return struct.pack(">IihhIIIII", 0x00030000, 0, -100, 50, 0, 0, 0, 0, 0)


def read_cmap(shell, tabs):
    """codepoint -> gid, from every format-4 subtable in the shell."""
    off, _ = tabs["cmap"]
    n = struct.unpack(">H", shell[off + 2:off + 4])[0]
    m = {}
    for i in range(n):
        pid, eid, so = struct.unpack(">HHI", shell[off + 4 + i * 8:off + 12 + i * 8])
        t = off + so
        if struct.unpack(">H", shell[t:t + 2])[0] != 4:
            continue
        segX2 = struct.unpack(">H", shell[t + 6:t + 8])[0]
        sc = segX2 // 2
        ends = struct.unpack(">%dH" % sc, shell[t + 14:t + 14 + segX2])
        starts = struct.unpack(">%dH" % sc, shell[t + 16 + segX2:t + 16 + 2 * segX2])
        deltas = struct.unpack(">%dh" % sc, shell[t + 16 + 2 * segX2:t + 16 + 3 * segX2])
        rob = t + 16 + 3 * segX2
        ros = struct.unpack(">%dH" % sc, shell[rob:rob + segX2])
        for s, (st, en, dl, ro) in enumerate(zip(starts, ends, deltas, ros)):
            for c in range(st, min(en, 0xFFFE) + 1):
                if ro == 0:
                    g = (c + dl) & 0xFFFF
                else:
                    p = rob + s * 2 + ro + (c - st) * 2
                    if p + 2 > len(shell):
                        continue
                    g = struct.unpack(">H", shell[p:p + 2])[0]
                    if g:
                        g = (g + dl) & 0xFFFF
                if g:
                    m[c] = g
    return m


def build_cmap(mapping):
    """Emit a clean format-4 subtable under platform 3/1 and 0/3."""
    cps = sorted(mapping)
    segs = []
    i = 0
    while i < len(cps):
        j = i
        while (j + 1 < len(cps) and cps[j + 1] == cps[j] + 1
               and mapping[cps[j + 1]] == mapping[cps[j]] + 1):
            j += 1
        segs.append((cps[i], cps[j], mapping[cps[i]] - cps[i]))
        i = j + 1
    segs.append((0xFFFF, 0xFFFF, 1))
    sc = len(segs)
    sr = 2
    while sr * 2 <= sc:
        sr *= 2
    sub = struct.pack(">HHHHHHH", 4, 16 + 8 * sc, 0, sc * 2, sr * 2,
                      (sr).bit_length() - 1, sc * 2 - sr * 2)
    sub += struct.pack(">%dH" % sc, *[e for _, e, _ in segs])
    sub += b"\0\0"
    sub += struct.pack(">%dH" % sc, *[s for s, _, _ in segs])
    sub += struct.pack(">%dh" % sc, *[((d + 0x8000) % 0x10000) - 0x8000 for _, _, d in segs])
    sub += struct.pack(">%dH" % sc, *([0] * sc))
    hdr = struct.pack(">HH", 0, 2)
    base = 4 + 2 * 8
    hdr += struct.pack(">HHI", 3, 1, base) + struct.pack(">HHI", 0, 3, base)
    return hdr + sub


def cmap_range(shell, tabs):
    off, _ = tabs["cmap"]
    n = struct.unpack(">H", shell[off + 2:off + 4])[0]
    lo, hi = 0xFFFF, 0
    for i in range(n):
        pid, eid, so = struct.unpack(">HHI", shell[off + 4 + i * 8:off + 12 + i * 8])
        t = off + so
        if struct.unpack(">H", shell[t:t + 2])[0] != 4:
            continue
        segX2 = struct.unpack(">H", shell[t + 6:t + 8])[0]
        sc = segX2 // 2
        ends = struct.unpack(">%dH" % sc, shell[t + 14:t + 14 + segX2])
        starts = struct.unpack(">%dH" % sc, shell[t + 16 + segX2:t + 16 + 2 * segX2])
        for s, e in zip(starts, ends):
            if e == 0xFFFF:
                continue
            lo = min(lo, s)
            hi = max(hi, e)
    return (lo if lo != 0xFFFF else 0x20), (hi or 0xFFFF)


def build_os2(shell, tabs, upem, first, last):
    ho, _ = tabs["hhea"]
    asc, desc, gap = struct.unpack(">3h", shell[ho + 4:ho + 10])
    adv_max = struct.unpack(">H", shell[ho + 10:ho + 12])[0]
    return (struct.pack(">HhHHH", 4, min(adv_max, upem) // 2, 400, 5, 0)
            + struct.pack(">8h", upem // 15, upem // 15, 0, upem // 5,
                          upem // 15, upem // 15, 0, upem // 2)
            + struct.pack(">3h", upem // 20, upem // 4, 0)
            + b"\2\0\5\3\0\0\0\0\0\0"                    # PANOSE
            + struct.pack(">4I", 1, 0, 0, 0)             # unicode ranges
            + b"XBOX"
            + struct.pack(">3H", 0x40, first, last)      # fsSelection REGULAR
            + struct.pack(">3h", asc, desc, gap)
            + struct.pack(">2H", abs(asc), abs(desc))
            + struct.pack(">2I", 1, 0)                   # code page ranges
            + struct.pack(">2h", upem // 2, int(asc * 0.9))
            + struct.pack(">3H", 0, 32, 2))


def build_name(existing_family):
    fam = existing_family or "Xbox Convection"
    recs = [(1, fam), (2, "Regular"), (3, fam + " 1.0"), (4, fam),
            (5, "Version 1.00"), (6, fam.replace(" ", "")),
            (0, "Convection is a trademark of Microsoft Corporation. "
                "Extracted from Xbox 360 system media for local use.")]
    strings = b""
    entries = []
    for nid, val in recs:
        for pid, eid, lid, enc in ((1, 0, 0, "mac_roman"), (3, 1, 0x409, "utf-16-be")):
            b = val.encode(enc, "replace")
            entries.append((pid, eid, lid, nid, len(b), len(strings)))
            strings += b
    entries.sort()
    hdr = struct.pack(">HHH", 0, len(entries), 6 + 12 * len(entries))
    body = b"".join(struct.pack(">6H", *e) for e in entries)
    return hdr + body + strings


def read_family(shell, tabs):
    off, ln = tabs["name"]
    _, cnt, so = struct.unpack(">HHH", shell[off:off + 6])
    for i in range(cnt):
        p = off + 6 + i * 12
        pid, eid, lid, nid, l, o = struct.unpack(">6H", shell[p:p + 12])
        if nid == 1:
            raw = shell[off + so + o:off + so + o + l]
            try:
                return raw.decode("utf-16-be") if pid == 3 else raw.decode("mac-roman")
            except Exception:
                pass
    return None


def checksum(b):
    b = b + b"\0" * (-len(b) % 4)
    return sum(struct.unpack(">%dI" % (len(b) // 4), b)) & 0xFFFFFFFF


def assemble(tables):
    tags = sorted(tables)
    n = len(tags)
    sr = 1
    while sr * 2 <= n:
        sr *= 2
    hdr = struct.pack(">IHHHH", 0x00010000, n, sr * 16,
                      (sr).bit_length() - 1, n * 16 - sr * 16)
    off = 12 + n * 16
    recs, body = b"", b""
    for t in tags:
        d = tables[t]
        recs += struct.pack(">4sIII", t.encode(), checksum(d), off + len(body), len(d))
        body += d + b"\0" * (-len(d) % 4)
    font = hdr + recs + body
    adj = (0xB1B0AFBA - checksum(font)) & 0xFFFFFFFF
    hpos = font.index(b"head")
    hoff = struct.unpack(">I", font[hpos + 8:hpos + 12])[0]
    return font[:hoff + 8] + struct.pack(">I", adj) + font[hoff + 12:]


def convert(path, want_subset=False):
    data = open(path, "rb").read()
    base = os.path.basename(path)
    print("== %s (%d bytes)" % (base, len(data)))
    c = parse_container(data)
    ver, tabs = sfnt_dir(c["shell"])
    print("   shell sfnt %08X tables=%s  tail pages=%d @0x%X"
          % (ver, ",".join(sorted(tabs)), len(c["pages"]), c["tail_start"]))
    if "xloc" not in tabs or "xglf" not in tabs:
        print("   no paged glyph tables, skipping")
        return
    shell = c["shell"]
    glyf, loca, n, st = flatten_glyphs(shell, tabs, c["pages"])
    print("   glyphs=%d drawn=%d empty=%d clipped=%d with-instructions=%d"
          % (n, st["drawn"], st["empty"], st["clipped"], st["instr"]))
    print("   flat glyf=%d bytes  maxPoints=%d maxContours=%d"
          % (len(glyf), st["max_pts"], st["max_cnt"]))

    head = bytearray(shell[tabs["head"][0]:tabs["head"][0] + tabs["head"][1]])
    upem = struct.unpack(">H", head[18:20])[0]
    struct.pack_into(">I", head, 8, 0)          # checkSumAdjustment
    struct.pack_into(">h", head, 50, 1)         # indexToLocFormat = long
    raw_map = read_cmap(shell, tabs)
    # The console cmap points unavailable characters at gid 0xFFFF (a
    # "render me from the fallback font" marker).  Drop those: OTS rejects any
    # cmap entry >= numGlyphs, which is the one and only thing standing between
    # the console data and a browser-loadable font.
    mapping = {c: g for c, g in raw_map.items() if g < n}
    dropped = len(raw_map) - len(mapping)
    first = min(mapping) if mapping else 0x20
    last = max(mapping) if mapping else 0xFFFF
    fam = read_family(shell, tabs)
    print("   family=%r unitsPerEm=%d cmap %d chars (dropped %d out-of-range) "
          "U+%04X..U+%04X" % (fam, upem, len(mapping), dropped, first, last))

    _unused = None
    hhea = bytearray(shell[tabs["hhea"][0]:tabs["hhea"][0] + tabs["hhea"][1]])
    hmtx = shell[tabs["hmtx"][0]:tabs["hmtx"][0] + tabs["hmtx"][1]]
    if want_subset:
        mapping, glyf, loca, hmtx, n = subset(mapping, glyf, loca, hmtx, LATIN)
        struct.pack_into(">H", hhea, 34, n)
        first, last = (min(mapping), max(mapping)) if mapping else (0x20, 0xFFFF)
        print("   subset -> %d glyphs, %d chars, glyf=%d bytes"
              % (n, len(mapping), len(glyf)))

    out = {
        "cmap": build_cmap(mapping),
        "head": bytes(head),
        "hhea": bytes(hhea),
        "hmtx": hmtx,
        "maxp": build_maxp(n, st),
        "name": build_name(fam),
        "post": build_post(),
        "OS/2": build_os2(shell, tabs, upem, first, last),
        "loca": struct.pack(">%dI" % len(loca), *loca),
        "glyf": glyf,
    }
    font = assemble(out)
    os.makedirs(OUT, exist_ok=True)
    dst = os.path.join(OUT, base.replace(".", "_")
                       + ("-latin" if want_subset else "") + ".ttf")
    open(dst, "wb").write(font)
    print("   -> %s (%d bytes)" % (dst, len(font)))
    return dst


if __name__ == "__main__":
    args = sys.argv[1:]
    want_subset = "--subset" in args
    args = [a for a in args if a != "--subset"]
    if "--out" in args:
        i = args.index("--out")
        OUT = os.path.abspath(args[i + 1])
        del args[i:i + 2]
    if not args:
        d = os.path.join(HERE, "xtt")
        args = [os.path.join(d, x) for x in sorted(os.listdir(d))
                if x.endswith((".xtt", ".xttp1"))]
    # Canonical names the runtime loads: the Latin face is ConvectionUI, the
    # CJK-bearing face ConvectionUI-JK (internal families "Xbox TC"/"Xbox JK").
    CANON = {"xenonclatin.xtt": "ConvectionUI.ttf", "xenonjklatin.xtt": "ConvectionUI-JK.ttf"}
    ok = True
    for p in args:
        try:
            dst = convert(p, want_subset)
            canon = CANON.get(os.path.basename(p))
            if canon:
                target = os.path.join(OUT, canon)
                if os.path.exists(target):
                    os.remove(target)
                os.rename(dst, target)
                print("   -> %s" % target)
        except Exception as e:
            print("   FAILED: %r" % (e,))
            ok = False
    sys.exit(0 if ok else 1)
