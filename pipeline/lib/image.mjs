// Small image helpers for the compression step: an 8-bit PNG reader, a 2× box downscale that keeps every channel as it
// is (no premultiplied alpha: textures carry data under zero alpha), and a PNG writer.

import { writeFileSync } from 'node:fs'
import zlib from 'node:zlib'

/** An 8-bit, non-interlaced PNG (grey, grey + alpha, RGB or RGBA) as { w, h, channels, data }. */
export function readPng(buf) {
  let p = 8, w = 0, h = 0, depth = 0, type = 0, interlace = 0
  const idat = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), tag = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len)
    if (tag === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; interlace = d[12] }
    else if (tag === 'IDAT') idat.push(d)
    else if (tag === 'IEND') break
    p += 12 + len
  }
  const channels = { 0: 1, 4: 2, 2: 3, 6: 4 }[type]
  if (depth !== 8 || !channels || interlace) throw new Error(`unsupported PNG (depth ${depth}, type ${type}, interlace ${interlace})`)
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * channels
  const data = Buffer.alloc(stride * h), prev = Buffer.alloc(stride), cur = Buffer.alloc(stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0, b = prev[x], c = x >= channels ? prev[x - channels] : 0
      let v = line[x]
      if (f === 1) v += a
      else if (f === 2) v += b
      else if (f === 3) v += (a + b) >> 1
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      cur[x] = v & 255
    }
    cur.copy(data, y * stride)
    cur.copy(prev)
  }
  return { w, h, channels, data }
}

/** Half the size in each direction (odd edges dropped), each channel averaged on its own. */
export function halve({ w, h, channels, data }) {
  const W = Math.max(1, w >> 1), H = Math.max(1, h >> 1), out = Buffer.alloc(W * H * channels)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let c = 0; c < channels; c++) {
        const at = (yy, xx) => data[(Math.min(h - 1, yy) * w + Math.min(w - 1, xx)) * channels + c]
        out[(y * W + x) * channels + c] = (at(2 * y, 2 * x) + at(2 * y, 2 * x + 1) + at(2 * y + 1, 2 * x) + at(2 * y + 1, 2 * x + 1) + 2) >> 2
      }
    }
  }
  return { w: W, h: H, channels, data: out }
}

/** Writes the image as an 8-bit PNG (the encoder's input). */
export function writePng(file, { w, h, channels, data }) {
  const type = { 1: 0, 2: 4, 3: 2, 4: 6 }[channels], stride = w * channels
  const raw = Buffer.alloc((stride + 1) * h)
  for (let y = 0; y < h; y++) data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (tag, body) => {
    const t = Buffer.concat([Buffer.from(tag, 'ascii'), body]), out = Buffer.alloc(t.length + 8)
    out.writeUInt32BE(body.length, 0); t.copy(out, 4); out.writeUInt32BE(crc(t), t.length + 4)
    return out
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = type
  writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))]))
}
