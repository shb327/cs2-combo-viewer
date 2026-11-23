// Images for the reference check, in plain Node: PNG in and out, CIELAB, masks (outline, morphology, moments),
// Gaussian blurs and affine sampling. An image is `{ width, height, rgba }` (8-bit RGBA, rows top to bottom); a
// mask or a map is a Uint8Array / Float32Array of width × height.
import { crc32, deflateSync } from 'node:zlib'
import { decode } from '../png.mjs'

export { decode as decodePng }

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'latin1')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

/** An RGBA image as an 8-bit RGBA PNG (no filtering). */
export function encodePng({ width, height, rgba }) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 6
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))])
}

export const blank = (width, height, [r, g, b, a] = [0, 0, 0, 255]) => {
  const rgba = new Uint8Array(width * height * 4)
  for (let i = 0; i < rgba.length; i += 4) { rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a }
  return { width, height, rgba }
}

// --- Colour -------------------------------------------------------------------------------------------------------

const LIN = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 })
const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)

/** CIELAB (D65) of every pixel: L 0–100, a and b about ±100. */
export function toLab({ width, height, rgba }) {
  const n = width * height
  const L = new Float32Array(n), A = new Float32Array(n), B = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const r = LIN[rgba[i * 4]], g = LIN[rgba[i * 4 + 1]], b = LIN[rgba[i * 4 + 2]]
    const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047)
    const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b)
    const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883)
    L[i] = 116 * y - 16; A[i] = 500 * (x - y); B[i] = 200 * (y - z)
  }
  return { L, A, B }
}

// --- Masks --------------------------------------------------------------------------------------------------------

/** Where the image has the item: alpha over half for a render with transparency, else brighter than `level` (0–255). */
export function silhouette({ width, height, rgba }, { level = 14, useAlpha = true } = {}) {
  const n = width * height
  const m = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    m[i] = useAlpha ? +(rgba[i * 4 + 3] >= 128) : +(Math.max(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]) > level)
  }
  return m
}

/** Max (dilate) or min (erode) over a square of radius `r`, separably. */
function boxFilter(m, w, h, r, max) {
  if (r <= 0) return m.slice()
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h)
  const pick = max ? (a, b) => a | b : (a, b) => a & b
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = max ? 0 : 1
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) v = pick(v, m[y * w + k])
      tmp[y * w + x] = v
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = max ? 0 : 1
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) v = pick(v, tmp[k * w + x])
      out[y * w + x] = v
    }
  }
  return out
}
export const dilate = (m, w, h, r) => boxFilter(m, w, h, r, true)
export const erode = (m, w, h, r) => boxFilter(m, w, h, r, false)
export const close = (m, w, h, r) => erode(dilate(m, w, h, r), w, h, r)
export const open = (m, w, h, r) => dilate(erode(m, w, h, r), w, h, r)

/** The connected parts (4-neighbour) with at least `minShare` of the largest one's pixels; the rest cleared. */
export function keepLarge(m, w, h, minShare = 0.05) {
  const label = new Int32Array(w * h).fill(-1)
  const sizes = []
  const stack = []
  for (let s = 0; s < w * h; s++) {
    if (!m[s] || label[s] >= 0) continue
    const id = sizes.length
    let size = 0
    stack.push(s); label[s] = id
    while (stack.length) {
      const p = stack.pop(); size++
      const x = p % w, y = (p - x) / w
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) {
        if (q >= 0 && m[q] && label[q] < 0) { label[q] = id; stack.push(q) }
      }
    }
    sizes.push(size)
  }
  const biggest = Math.max(0, ...sizes)
  const out = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) out[i] = label[i] >= 0 && sizes[label[i]] >= biggest * minShare ? 1 : 0
  return out
}

/** Centre, principal axis angle (radians, of the longer axis) and spreads along / across it. */
export function moments(m, w, h) {
  let n = 0, sx = 0, sy = 0
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) { n++; sx += x; sy += y }
  if (!n) return null
  const cx = sx / n, cy = sy / n
  let xx = 0, yy = 0, xy = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!m[y * w + x]) continue
      const dx = x - cx, dy = y - cy
      xx += dx * dx; yy += dy * dy; xy += dx * dy
    }
  }
  xx /= n; yy /= n; xy /= n
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy)
  const tr = (xx + yy) / 2, d = Math.sqrt(((xx - yy) / 2) ** 2 + xy * xy)
  return { cx, cy, angle, major: Math.sqrt(tr + d), minor: Math.sqrt(Math.max(0, tr - d)), area: n }
}

// --- Resampling ---------------------------------------------------------------------------------------------------

/**
 * The image resampled onto a `w` × `h` grid: the output pixel (x, y) takes the source at
 * (m[0]·x + m[1]·y + m[2], m[3]·x + m[4]·y + m[5]) (pixel centres), bilinear, alpha-weighted; outside is
 * `background`. Also returns the coverage (source alpha 0–1) per output pixel.
 */
export function warp({ width, height, rgba }, w, h, m, background = [0, 0, 0, 0]) {
  const out = new Uint8Array(w * h * 4)
  const cover = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = m[0] * (x + 0.5) + m[1] * (y + 0.5) + m[2] - 0.5
      const sy = m[3] * (x + 0.5) + m[4] * (y + 0.5) + m[5] - 0.5
      const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0
      let r = 0, g = 0, b = 0, a = 0
      for (let j = 0; j < 2; j++) {
        for (let i = 0; i < 2; i++) {
          const px = x0 + i, py = y0 + j
          if (px < 0 || py < 0 || px >= width || py >= height) continue
          const wt = (i ? fx : 1 - fx) * (j ? fy : 1 - fy)
          const p = (py * width + px) * 4
          const al = rgba[p + 3] / 255 * wt
          r += rgba[p] * al; g += rgba[p + 1] * al; b += rgba[p + 2] * al; a += al
        }
      }
      const o = (y * w + x) * 4
      cover[y * w + x] = a
      const ba = background[3] / 255 * (1 - a)
      const ta = a + ba
      if (ta <= 0) continue
      out[o] = Math.round((r + background[0] * ba) / ta)
      out[o + 1] = Math.round((g + background[1] * ba) / ta)
      out[o + 2] = Math.round((b + background[2] * ba) / ta)
      out[o + 3] = Math.round(255 * Math.min(1, ta))
    }
  }
  return { image: { width: w, height: h, rgba: out }, cover }
}

/** A mask (0/1) resampled by the same mapping as `warp`, nearest. */
export function warpMask(mask, width, height, w, h, m) {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.floor(m[0] * (x + 0.5) + m[1] * (y + 0.5) + m[2])
      const sy = Math.floor(m[3] * (x + 0.5) + m[4] * (y + 0.5) + m[5])
      if (sx >= 0 && sy >= 0 && sx < width && sy < height) out[y * w + x] = mask[sy * width + sx]
    }
  }
  return out
}

// --- Maps ---------------------------------------------------------------------------------------------------------

function gaussKernel(sigma) {
  const r = Math.max(1, Math.ceil(sigma * 3))
  const k = new Float32Array(2 * r + 1)
  let s = 0
  for (let i = -r; i <= r; i++) { k[i + r] = Math.exp(-(i * i) / (2 * sigma * sigma)); s += k[i + r] }
  return { k: k.map((v) => v / s), r }
}

/** One box blur of half-width `r` along rows (step 1) or columns (step w), zero outside, by running sums. */
function boxPass(src, dst, w, h, r, alongRows) {
  const n = alongRows ? w : h, lines = alongRows ? h : w
  const at = alongRows ? (line, i) => line * w + i : (line, i) => i * w + line
  const scale = 1 / (2 * r + 1)
  for (let line = 0; line < lines; line++) {
    let s = 0
    for (let i = 0; i <= Math.min(r, n - 1); i++) s += src[at(line, i)]
    for (let i = 0; i < n; i++) {
      dst[at(line, i)] = s * scale
      const add = i + r + 1, drop = i - r
      if (add < n) s += src[at(line, add)]
      if (drop >= 0) s -= src[at(line, drop)]
    }
  }
}

function blurRaw(v, w, h, sigma) {
  if (sigma > 4) {
    // Three box blurs come within a few percent of a Gaussian, in time independent of its size.
    const r = Math.max(1, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2))
    let a = Float32Array.from(v), b = new Float32Array(w * h)
    for (let pass = 0; pass < 3; pass++) {
      boxPass(a, b, w, h, r, true)
      boxPass(b, a, w, h, r, false)
    }
    return a
  }
  const { k, r } = gaussKernel(sigma)
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0
      for (let i = -r; i <= r; i++) { const xx = x + i; if (xx >= 0 && xx < w) s += v[y * w + xx] * k[i + r] }
      tmp[y * w + x] = s
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0
      for (let i = -r; i <= r; i++) { const yy = y + i; if (yy >= 0 && yy < h) s += tmp[yy * w + x] * k[i + r] }
      out[y * w + x] = s
    }
  }
  return out
}

/** A Gaussian blur of `v` that only mixes pixels inside `mask` (normalised convolution); 0 outside. */
export function blurIn(v, mask, w, h, sigma) {
  const vm = new Float32Array(w * h), m = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) { m[i] = mask[i] ? 1 : 0; vm[i] = mask[i] ? v[i] : 0 }
  const a = blurRaw(vm, w, h, sigma), b = blurRaw(m, w, h, sigma)
  const out = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) out[i] = mask[i] && b[i] > 1e-4 ? a[i] / b[i] : 0
  return out
}
