// Test PNGs and a quiet log.
import { crc32, deflateSync } from 'node:zlib'

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'latin1')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

/**
 * An 8-bit PNG (colour type 6 RGBA or 2 RGB), each pixel from `pixel(x, y)` → [r, g, b, a].
 */
export function encodePng(width, height, pixel, { colorType = 6, bitDepth = 8 } = {}) {
  const channels = colorType === 6 ? 4 : 3
  const raw = Buffer.alloc((width * channels * (bitDepth / 8) + 1) * height)
  let at = 0
  for (let y = 0; y < height; y++) {
    raw[at++] = 0
    for (let x = 0; x < width; x++) {
      const p = pixel(x, y)
      for (let k = 0; k < channels; k++) {
        raw[at++] = p[k]
        if (bitDepth === 16) raw[at++] = 0
      }
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = bitDepth; ihdr[9] = colorType
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 1 })), chunk('IEND', Buffer.alloc(0))])
}

/** A frame that looks drawn: a gradient with a block in the middle. */
export const drawnPixel = (x, y) => (x > 800 && x < 1100 && y > 400 && y < 700 ? [200, 30, 40, 255] : [x % 256, y % 256, 90, 255])

let cached = null
/** A 1920×1080 drawn frame (made once). */
export const drawnFrame = () => (cached ??= encodePng(1920, 1080, drawnPixel))

/** A log that keeps its lines. */
export function memoryLog() {
  const lines = []
  const log = {}
  for (const level of ['info', 'warn', 'error']) log[level] = (m, f) => lines.push(`${level} ${m} ${JSON.stringify(f ?? {})}`)
  return { log, lines }
}
