// Just enough OpenEXR for the environment maps: reads scanline files (no compression, ZIPS or ZIP; HALF or FLOAT
// channels) and writes RGB as HALF with ZIP compression, which three.js' EXRLoader reads.

import zlib from 'node:zlib'

const NO_COMPRESSION = 0, ZIPS = 2, ZIP = 3
const LINES = { [NO_COMPRESSION]: 1, [ZIPS]: 1, [ZIP]: 16 }

/** { w, h, channels: { [name]: Float32Array } } */
export function readExr(buf) {
  if (buf.readUInt32LE(0) !== 20000630) throw new Error('not an EXR file')
  if (buf[5] & 0x02) throw new Error('tiled EXR not supported')
  let p = 8
  const attrs = {}
  const str = () => { const e = buf.indexOf(0, p); const s = buf.toString('latin1', p, e); p = e + 1; return s }
  for (;;) {
    const name = str()
    if (!name) break
    const type = str(), size = buf.readInt32LE(p); p += 4
    attrs[name] = { type, value: buf.subarray(p, p + size) }
    p += size
  }
  const channels = []
  for (let q = 0, v = attrs.channels.value; v[q] !== 0;) {
    const e = v.indexOf(0, q), name = v.toString('latin1', q, e)
    channels.push({ name, type: v.readInt32LE(e + 1) })
    q = e + 1 + 16
  }
  const compression = attrs.compression.value[0]
  if (!(compression in LINES)) throw new Error(`EXR compression ${compression} not supported`)
  const dw = attrs.dataWindow.value
  const x0 = dw.readInt32LE(0), y0 = dw.readInt32LE(4), w = dw.readInt32LE(8) - x0 + 1, h = dw.readInt32LE(12) - y0 + 1
  const lines = LINES[compression], blocks = Math.ceil(h / lines)
  const out = Object.fromEntries(channels.map((c) => [c.name, new Float32Array(w * h)]))
  for (let b = 0; b < blocks; b++) {
    const offset = Number(buf.readBigUInt64LE(p + b * 8))
    const y = buf.readInt32LE(offset) - y0, size = buf.readInt32LE(offset + 4)
    const n = Math.min(lines, h - y)
    const raw = buf.subarray(offset + 8, offset + 8 + size)
    const expected = n * w * channels.reduce((s, c) => s + (c.type === 1 ? 2 : 4), 0)
    const data = compression === NO_COMPRESSION || size === expected ? raw : unpredict(zlib.inflateSync(raw))
    let q = 0
    for (let line = 0; line < n; line++) {
      for (const c of channels) {
        const dst = out[c.name], row = (y + line) * w
        for (let x = 0; x < w; x++) {
          if (c.type === 1) { dst[row + x] = fromHalf(data.readUInt16LE(q)); q += 2 }
          else if (c.type === 2) { dst[row + x] = data.readFloatLE(q); q += 4 }
          else throw new Error('EXR UINT channels not supported')
        }
      }
    }
  }
  return { w, h, channels: out }
}

/** Writes R, G, B (Float32Arrays of w × h) as a HALF, ZIP-compressed scanline EXR. */
export function writeExr({ w, h, channels }) {
  const names = ['B', 'G', 'R']
  const attr = (name, type, value) => Buffer.concat([Buffer.from(`${name}\0${type}\0`, 'latin1'), int32(value.length), value])
  const chlist = Buffer.concat([...names.map((n) => Buffer.concat([Buffer.from(n + '\0', 'latin1'), int32(1), Buffer.from([0, 0, 0, 0]), int32(1), int32(1)])), Buffer.from([0])])
  const box = Buffer.concat([int32(0), int32(0), int32(w - 1), int32(h - 1)])
  const header = Buffer.concat([
    Buffer.from([0x76, 0x2f, 0x31, 0x01, 2, 0, 0, 0]),
    attr('channels', 'chlist', chlist),
    attr('compression', 'compression', Buffer.from([ZIP])),
    attr('dataWindow', 'box2i', box),
    attr('displayWindow', 'box2i', box),
    attr('lineOrder', 'lineOrder', Buffer.from([0])),
    attr('pixelAspectRatio', 'float', float32(1)),
    attr('screenWindowCenter', 'v2f', Buffer.concat([float32(0), float32(0)])),
    attr('screenWindowWidth', 'float', float32(1)),
    Buffer.from([0]),
  ])
  const blocks = []
  for (let y = 0; y < h; y += 16) {
    const n = Math.min(16, h - y), data = Buffer.alloc(n * w * names.length * 2)
    let q = 0
    for (let line = 0; line < n; line++) {
      for (const name of names) {
        const src = channels[name], row = (y + line) * w
        for (let x = 0; x < w; x++) { data.writeUInt16LE(toHalf(src[row + x]), q); q += 2 }
      }
    }
    const packed = zlib.deflateSync(predict(data), { level: 9 })
    blocks.push(Buffer.concat([int32(y), int32(packed.length), packed]))
  }
  const table = Buffer.alloc(blocks.length * 8)
  let offset = header.length + table.length
  blocks.forEach((b, i) => { table.writeBigUInt64LE(BigInt(offset), i * 8); offset += b.length })
  return Buffer.concat([header, table, ...blocks])
}

function int32(v) { const b = Buffer.alloc(4); b.writeInt32LE(v); return b }
function float32(v) { const b = Buffer.alloc(4); b.writeFloatLE(v); return b }

/** EXR's ZIP pre-pass, undone: the bytes were split into two interleaved halves and delta-coded. */
function unpredict(t) {
  for (let i = 1; i < t.length; i++) t[i] = (t[i - 1] + t[i] - 128) & 255
  const out = Buffer.alloc(t.length), half = (t.length + 1) >> 1
  for (let i = 0; i < t.length; i++) out[i] = i % 2 === 0 ? t[i >> 1] : t[half + (i >> 1)]
  return out
}

function predict(data) {
  const t = Buffer.alloc(data.length), half = (data.length + 1) >> 1
  for (let i = 0; i < data.length; i++) t[i % 2 === 0 ? i >> 1 : half + (i >> 1)] = data[i]
  for (let i = t.length - 1; i > 0; i--) t[i] = (t[i] - t[i - 1] + 128 + 256) & 255
  return t
}

const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer)

function toHalf(v) {
  f32[0] = v
  const x = u32[0], sign = (x >>> 16) & 0x8000
  let e = ((x >>> 23) & 0xff) - 127 + 15, m = x & 0x7fffff
  if (((x >>> 23) & 0xff) === 0xff) return sign | 0x7c00 | (m ? 0x200 : 0)
  if (e >= 0x1f) return sign | 0x7c00
  if (e <= 0) {
    if (e < -10) return sign
    m |= 0x800000
    const shift = 14 - e
    let h = m >> shift
    if ((m >> (shift - 1)) & 1) h++
    return sign | h
  }
  let h = sign | (e << 10) | (m >> 13)
  if (m & 0x1000) h++
  return h
}

function fromHalf(h) {
  const s = h & 0x8000 ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff
  if (e === 0) return s * m * 2 ** -24
  if (e === 31) return m ? NaN : s * Infinity
  return s * (1 + m / 1024) * 2 ** (e - 15)
}
