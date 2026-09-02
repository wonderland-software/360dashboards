// Pixel measurements in plain Node: a PNG decoder (zlib is built in) and the
// luma arithmetic the suites need. Everything is luma unless a function says
// otherwise, with Rec. 709 weights - the same numbers as
// reference/calibration/pixlib.py, so measurements here and there agree.
//
// The decoder handles what the material is: 8-bit, non-interlaced, colour
// types 0/2/4/6 (grey, RGB, grey+alpha, RGBA). The reference frames are RGB
// and Chrome's screenshots are RGB or RGBA; anything else is refused loudly
// rather than mis-read.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';


export function readPng(path) {
  const b = readFileSync(path);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${path}: not a PNG`);
  let p = 8;
  let w = 0, h = 0, depth = 0, ctype = 0, interlace = 0;
  const idat = [];
  while (p < b.length) {
    const len = b.readUInt32BE(p);
    const type = b.toString('latin1', p + 4, p + 8);
    const body = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = body.readUInt32BE(0); h = body.readUInt32BE(4); depth = body[8]; ctype = body[9]; interlace = body[12]; }
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || ![0, 2, 4, 6].includes(ctype)) {
    throw new Error(`${path}: unsupported PNG (depth ${depth}, colour type ${ctype}, interlace ${interlace})`);
  }
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ctype];
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const data = new Uint8Array(w * h * ch);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = data.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? row[i - ch] : 0;
      const up = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = src[i];
      switch (f) {
        case 0: break;
        case 1: v += a; break;
        case 2: v += up; break;
        case 3: v += (a + up) >> 1; break;
        case 4: { const pa = Math.abs(up - c), pb = Math.abs(a - c), pc = Math.abs(a + up - 2 * c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; break; }
        default: throw new Error(`${path}: bad filter ${f} on row ${y}`);
      }
      row[i] = v & 0xff;
    }
    prev = row;
  }
  return { w, h, ch, data };
}

export function rgb(im, x, y) {
  const i = (y * im.w + x) * im.ch;
  if (im.ch < 3) return [im.data[i], im.data[i], im.data[i]];
  return [im.data[i], im.data[i + 1], im.data[i + 2]];
}
export function luma(im, x, y) {
  const i = (y * im.w + x) * im.ch;
  if (im.ch < 3) return im.data[i];
  return 0.2126 * im.data[i] + 0.7152 * im.data[i + 1] + 0.0722 * im.data[i + 2];
}

/** Mean luma over a rect {x,y,w,h}. */
export function mean(im, r) {
  let s = 0, n = 0;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { s += luma(im, x, y); n++; }
  return s / n;
}
export function meanRgb(im, r) {
  const s = [0, 0, 0]; let n = 0;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { const c = rgb(im, x, y); s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; n++; }
  return s.map((v) => v / n);
}

/** Mean absolute luma difference and normalised cross-correlation over a rect. */
export function compare(a, b, r) {
  const va = [], vb = [];
  let sa = 0, sb = 0;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) {
    const la = luma(a, x, y), lb = luma(b, x, y);
    va.push(la); vb.push(lb); sa += la; sb += lb;
  }
  const n = va.length, ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0, mad = 0;
  for (let i = 0; i < n; i++) {
    const xa = va[i] - ma, xb = vb[i] - mb;
    num += xa * xb; da += xa * xa; db += xb * xb; mad += Math.abs(va[i] - vb[i]);
  }
  return { ncc: da && db ? num / Math.sqrt(da * db) : 0, mad: mad / n, meanA: ma, meanB: mb };
}

/** Per-column mean luma over rows y0..y1-1: a profile across x. */
export function rowProfile(im, x0, x1, y0, y1) {
  const out = [];
  for (let x = x0; x < x1; x++) { let s = 0; for (let y = y0; y < y1; y++) s += luma(im, x, y); out.push(s / (y1 - y0)); }
  return out;
}
/** Per-row mean luma over columns x0..x1-1: a profile down y. */
export function colProfile(im, x0, x1, y0, y1) {
  const out = [];
  for (let y = y0; y < y1; y++) { let s = 0; for (let x = x0; x < x1; x++) s += luma(im, x, y); out.push(s / (x1 - x0)); }
  return out;
}
/** |d/dx| of a profile. */
export function grad(p) { const out = [0]; for (let i = 1; i < p.length; i++) out.push(Math.abs(p[i] - p[i - 1])); return out; }

export function ncc1d(a, b) {
  const n = Math.min(a.length, b.length);
  let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; } ma /= n; mb /= n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : 0;
}
/** Best integer shift of b against a within +-maxShift, by NCC. */
export function profileFit(a, b, maxShift = 0) {
  let best = { shift: 0, ncc: -2 };
  for (let s = -maxShift; s <= maxShift; s++) {
    const bs = s >= 0 ? b.slice(s) : new Array(-s).fill(b[0]).concat(b);
    const v = ncc1d(a, bs);
    if (v > best.ncc) best = { shift: s, ncc: v };
  }
  return best;
}

/** Local minima of a profile at least `depth` below both neighbours `reach` away. */
export function valleys(p, reach, depth) {
  const out = [];
  for (let x = reach; x < p.length - reach; x++) {
    if (p[x] <= p[x - reach] - depth && p[x] <= p[x + reach] - depth && p[x] <= p[x - 1] && p[x] <= p[x + 1]) {
      out.push({ x, v: p[x], depth: Math.min(p[x - reach], p[x + reach]) - p[x] });
    }
  }
  return out;
}

/** The strongest rising luma edge (dark->light) of a profile within [x0,x1). */
export function risingEdge(p, x0 = 0, x1 = p.length) {
  let best = { x: -1, d: 0 };
  for (let x = Math.max(1, x0); x < Math.min(p.length, x1); x++) { const d = p[x] - p[x - 1]; if (d > best.d) best = { x, d }; }
  return best.x;
}
/** Sub-pixel half-intensity crossing between the levels just outside [i0,i1). */
export function halfCrossing(p, i0, i1) {
  const lo = p[i0], hi = p[i1 - 1], mid = (lo + hi) / 2;
  for (let i = i0; i < i1 - 1; i++) {
    const a = p[i], b = p[i + 1];
    if ((a - mid) * (b - mid) <= 0 && a !== b) return i + (mid - a) / (b - a);
  }
  return null;
}
