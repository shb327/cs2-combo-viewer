// PNG: the chunks, text chunks added without touching the pixels, and a decode for the checks before an upload.
import { crc32, inflateSync } from 'node:zlib'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

export class PngError extends Error {}

/** The file's chunks, each with its CRC checked. */
export function chunks(png) {
  if (png.length < 8 || !png.subarray(0, 8).equals(SIGNATURE)) throw new PngError('not a PNG (no signature)')
  const out = []
  let at = 8
  while (at < png.length) {
    if (at + 12 > png.length) throw new PngError('truncated chunk')
    const length = png.readUInt32BE(at)
    const type = png.toString('latin1', at + 4, at + 8)
    if (at + 12 + length > png.length) throw new PngError(`truncated ${type} chunk`)
    const data = png.subarray(at + 8, at + 8 + length)
    if (crc32(png.subarray(at + 4, at + 8 + length)) !== png.readUInt32BE(at + 8 + length)) throw new PngError(`bad CRC in ${type}`)
    out.push({ type, data })
    at += 12 + length
    if (type === 'IEND') break
  }
  if (out[0]?.type !== 'IHDR') throw new PngError('IHDR is not the first chunk')
  if (out[out.length - 1].type !== 'IEND') throw new PngError('no IEND')
  return out
}

/** Width, height, bit depth, colour type and interlace from IHDR. */
export function header(png) {
  const ihdr = chunks(png)[0].data
  return { width: ihdr.readUInt32BE(0), height: ihdr.readUInt32BE(4), bitDepth: ihdr[8], colorType: ihdr[9], interlace: ihdr[12] }
}

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'latin1')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

/**
 * The PNG with `tEXt` chunks added before IEND (keyword, a NUL, the text; Latin-1). The pixels are untouched.
 * @param {Buffer} png
 * @param {Record<string, string>} texts
 */
export function withText(png, texts) {
  const parts = chunks(png)
  const extra = Object.entries(texts).map(([key, value]) => {
    if (!/^[\x20-\x7e]{1,79}$/.test(key) || /^ | $|  /.test(key)) throw new PngError(`bad tEXt keyword ${JSON.stringify(key)}`)
    if (!/^[\x20-\x7e]*$/.test(value)) throw new PngError(`tEXt ${key}: printable ASCII only`)
    return chunk('tEXt', Buffer.from(`${key}\0${value}`, 'latin1'))
  })
  const body = parts.filter((c) => c.type !== 'IEND').map((c) => chunk(c.type, c.data))
  return Buffer.concat([SIGNATURE, ...body, ...extra, chunk('IEND', Buffer.alloc(0))])
}

/** The `tEXt` chunks as an object. */
export function texts(png) {
  const out = {}
  for (const c of chunks(png)) {
    if (c.type !== 'tEXt') continue
    const nul = c.data.indexOf(0)
    out[c.data.toString('latin1', 0, nul)] = c.data.toString('latin1', nul + 1)
  }
  return out
}

/**
 * Decodes an 8-bit RGB or RGBA PNG without interlacing (what browsers write) to RGBA.
 * @returns {{ width: number, height: number, rgba: Buffer }}
 */
export function decode(png) {
  const parts = chunks(png)
  const { width, height, bitDepth, colorType, interlace } = header(png)
  if (bitDepth !== 8 || (colorType !== 2 && colorType !== 6) || interlace !== 0) {
    throw new PngError(`only 8-bit RGB or RGBA without interlacing (bit depth ${bitDepth}, colour type ${colorType}, interlace ${interlace})`)
  }
  const channels = colorType === 6 ? 4 : 3
  const stride = width * channels
  const raw = inflateSync(Buffer.concat(parts.filter((c) => c.type === 'IDAT').map((c) => c.data)))
  if (raw.length < (stride + 1) * height) throw new PngError('image data too short')
  const pixels = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
    const out = y * stride
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[out + x - channels] : 0
      const b = y > 0 ? pixels[out - stride + x] : 0
      const c = x >= channels && y > 0 ? pixels[out - stride + x - channels] : 0
      let v = line[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      } else if (filter !== 0) throw new PngError(`bad filter ${filter}`)
      pixels[out + x] = v & 0xff
    }
  }
  if (channels === 4) return { width, height, rgba: pixels }
  const rgba = Buffer.alloc(width * height * 4)
  for (let i = 0, j = 0; i < pixels.length; i += 3, j += 4) {
    rgba[j] = pixels[i]; rgba[j + 1] = pixels[i + 1]; rgba[j + 2] = pixels[i + 2]; rgba[j + 3] = 255
  }
  return { width, height, rgba }
}

/**
 * Why a decoded image can't be a combo's screenshot, or null when it can: fully transparent, or one flat colour
 * (a blank or cleared frame).
 */
export function blankReason({ rgba }) {
  let opaque = 0
  const [r0, g0, b0] = rgba
  let varied = false
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] > 0) opaque++
    if (!varied && (Math.abs(rgba[i] - r0) > 8 || Math.abs(rgba[i + 1] - g0) > 8 || Math.abs(rgba[i + 2] - b0) > 8)) varied = true
  }
  if (opaque === 0) return 'fully transparent'
  if (opaque < rgba.length / 4 * 0.99) return `transparent in ${Math.round(100 - (opaque / (rgba.length / 4)) * 100)}% of the frame`
  if (!varied) return 'one flat colour'
  return null
}

/** Mean absolute difference per channel (0–255) between two decoded images of the same size, and the share of pixels off by more than `tolerance`. */
export function difference(a, b, tolerance = 24) {
  if (a.width !== b.width || a.height !== b.height) throw new PngError('different sizes')
  let sum = 0, off = 0
  for (let i = 0; i < a.rgba.length; i += 4) {
    let worst = 0
    for (let k = 0; k < 3; k++) {
      const d = Math.abs(a.rgba[i + k] - b.rgba[i + k])
      sum += d
      if (d > worst) worst = d
    }
    if (worst > tolerance) off++
  }
  const n = a.rgba.length / 4
  return { mean: sum / (n * 3), off: off / n }
}
