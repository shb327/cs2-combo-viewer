// Lines our render up with a reference picture by the knife's outline: the principal axes give a first guess (centre,
// angle, length), then a small search over angle, scale and offset maximises the outlines' overlap (IoU). Every
// arrangement is tried: either of our sides, mirrored or not, and turned half way round.
import { close, keepLarge, moments, open, silhouette } from './image.mjs'

/** The reference's outline: brighter than its black background, specks removed, small gaps closed. */
export function referenceOutline(img, level = 14) {
  const { width: w, height: h } = img
  let m = silhouette(img, { useAlpha: false, level })
  m = open(m, w, h, 1)
  m = keepLarge(m, w, h, 0.02)
  return close(m, w, h, 2)
}

/** Our render's outline: its alpha. */
export const renderOutline = (img) => silhouette(img, { useAlpha: true })

/**
 * The mapping from a reference pixel to our render's pixel (for `warp`), as 6 numbers.
 * @param {{ angle: number, scale: number, mirror: boolean, tx: number, ty: number }} p  our render turned by
 *   `angle`, scaled by `scale` (reference pixels per render pixel), mirrored left-right first; `tx`, `ty` move it.
 */
export function mapping(p, refCentre, ourCentre) {
  const c = Math.cos(p.angle), s = Math.sin(p.angle), m = p.mirror ? -1 : 1
  const a00 = (m * c) / p.scale, a01 = (m * s) / p.scale, a10 = -s / p.scale, a11 = c / p.scale
  const ox = refCentre.cx + p.tx, oy = refCentre.cy + p.ty
  return [a00, a01, ourCentre.cx - a00 * ox - a01 * oy, a10, a11, ourCentre.cy - a10 * ox - a11 * oy]
}

/** IoU of the reference outline (sampled every `k` pixels) and ours mapped onto it. */
function overlap(ref, rw, rh, ours, ow, oh, mat, k) {
  let i = 0, u = 0
  for (let y = (k - 1) / 2; y < rh; y += k) {
    const yy = Math.floor(y)
    for (let x = (k - 1) / 2; x < rw; x += k) {
      const xx = Math.floor(x)
      const px = xx + 0.5, py = yy + 0.5
      const sx = Math.floor(mat[0] * px + mat[1] * py + mat[2]), sy = Math.floor(mat[3] * px + mat[4] * py + mat[5])
      const o = sx >= 0 && sy >= 0 && sx < ow && sy < oh ? ours[sy * ow + sx] : 0
      const r = ref[yy * rw + xx]
      i += r & o; u += r | o
    }
  }
  return u ? i / u : 0
}

/** Coordinate search from `start`, halving the steps when nothing improves. */
function refine(start, score) {
  let p = { ...start }
  let best = score(p)
  const steps = { angle: 0.05, scale: 0.04, tx: 6, ty: 6 }
  const min = { angle: 0.002, scale: 0.002, tx: 0.4, ty: 0.4 }
  for (let round = 0; round < 60; round++) {
    let improved = false
    for (const key of ['angle', 'scale', 'tx', 'ty']) {
      for (const dir of [1, -1]) {
        const q = { ...p, [key]: key === 'scale' ? p.scale * (1 + dir * steps.scale) : p[key] + dir * steps[key] }
        const v = score(q)
        if (v > best) { best = v; p = q; improved = true; break }
      }
    }
    if (!improved) {
      let done = true
      for (const key of Object.keys(steps)) { steps[key] /= 2; if (steps[key] >= min[key]) done = false }
      if (done) break
    }
  }
  return { params: p, iou: best }
}

/**
 * Every arrangement of our two sides against one reference outline, best overlap first.
 * @param {Uint8Array} ref  the reference outline
 * @param {{ front: { mask: Uint8Array, width: number, height: number }, back: { … } }} sides  our outlines
 * @returns {{ side: 'front'|'back', mirror: boolean, turned: boolean, iou: number, params: object, mat: number[] }[]}
 */
export function arrangements(ref, rw, rh, sides) {
  const rm = moments(ref, rw, rh)
  if (!rm) throw new Error('the reference picture has no outline')
  const out = []
  for (const side of ['front', 'back']) {
    const { mask, width: ow, height: oh } = sides[side]
    const om = moments(mask, ow, oh)
    for (const mirror of [false, true]) {
      // Mirrored left-right, our axis at angle θ points along π − θ.
      const ourAngle = mirror ? Math.PI - om.angle : om.angle
      for (const turned of [false, true]) {
        const start = { angle: rm.angle - ourAngle + (turned ? Math.PI : 0), scale: rm.major / om.major, mirror, tx: 0, ty: 0 }
        const coarse = refine(start, (p) => overlap(ref, rw, rh, mask, ow, oh, mapping(p, rm, om), 3))
        const fine = refine(coarse.params, (p) => overlap(ref, rw, rh, mask, ow, oh, mapping(p, rm, om), 1))
        out.push({ side, mirror, turned, iou: fine.iou, params: fine.params, mat: mapping(fine.params, rm, om) })
      }
    }
  }
  return out.sort((a, b) => b.iou - a.iou)
}
