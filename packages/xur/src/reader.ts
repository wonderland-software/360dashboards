// Bounds-checked big-endian reader over a Uint8Array. Every Xbox 360 format we
// touch (XUR, XUIZ, XUS) is big-endian PowerPC data, so there is no
// little-endian path here on purpose. Browser-safe: no Buffer, no node:fs.

export class BinaryReader {
  readonly view: DataView;
  pos = 0;

  constructor(readonly bytes: Uint8Array, pos = 0) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.pos = pos;
  }

  get length(): number {
    return this.bytes.byteLength;
  }

  get remaining(): number {
    return this.length - this.pos;
  }

  private need(n: number): void {
    if (this.pos + n > this.length) {
      throw new RangeError(`read of ${n} bytes at 0x${this.pos.toString(16)} overruns 0x${this.length.toString(16)}`);
    }
  }

  seek(pos: number): void {
    if (pos < 0 || pos > this.length) throw new RangeError(`seek to 0x${pos.toString(16)} out of range`);
    this.pos = pos;
  }

  skip(n: number): void {
    this.need(n);
    this.pos += n;
  }

  u8(): number {
    this.need(1);
    return this.view.getUint8(this.pos++);
  }

  i8(): number {
    this.need(1);
    return this.view.getInt8(this.pos++);
  }

  u16(): number {
    this.need(2);
    const v = this.view.getUint16(this.pos);
    this.pos += 2;
    return v;
  }

  i16(): number {
    this.need(2);
    const v = this.view.getInt16(this.pos);
    this.pos += 2;
    return v;
  }

  u32(): number {
    this.need(4);
    const v = this.view.getUint32(this.pos);
    this.pos += 4;
    return v;
  }

  i32(): number {
    this.need(4);
    const v = this.view.getInt32(this.pos);
    this.pos += 4;
    return v;
  }

  f32(): number {
    this.need(4);
    const v = this.view.getFloat32(this.pos);
    this.pos += 4;
    return v;
  }

  bytes_(n: number): Uint8Array {
    this.need(n);
    const out = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  /** Four ASCII bytes as a tag string, e.g. "XUIB". */
  tag(): string {
    const b = this.bytes_(4);
    return String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!);
  }

  /** `n` UTF-16BE code units. */
  utf16be(n: number): string {
    this.need(n * 2);
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.view.getUint16(this.pos + i * 2));
    this.pos += n * 2;
    return s;
  }

  ascii(n: number): string {
    const b = this.bytes_(n);
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]!);
    return s;
  }
}
