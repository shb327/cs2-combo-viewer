// Scores our render against a reference picture on the painted parts only, in the way each finish shows its pattern:
// Case Hardened by blue against gold, spray finishes by light against dark, the anodized fades and Dopplers by hue
// and where each hue sits. Both images are on the reference's grid already (see align.mjs). Every score is 0–1.
import { blurIn, toLab } from './image.mjs'

/** How each finish is scored. */
export function finishKind(finish) {
  if (finish === 'case-hardened') return 'patina'
  if (['scorched', 'safari-mesh', 'urban-masked'].includes(finish)) return 'spray'
  if (finish === 'fade' || finish === 'marble-fade' || /^(gamma-)?doppler/.test(finish)) return 'anodized'
  throw new Error(`no scoring for the finish ${finish}`)
}

/** Below this a pair is flagged. */
export const FLAG_BELOW = 0.5

const median = (xs) => {
  if (!xs.length) return 0
  const s = Float64Array.from(xs).sort()
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}
const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))))]
const clamp01 = (v) => Math.min(1, Math.max(0, v))

/** Indexes of the pixels in `mask`, every `step`th to keep the statistics fast. */
function indexes(mask, max = 40_000) {
  let n = 0
  for (let i = 0; i < mask.length; i++) n += mask[i]
  const step = Math.max(1, Math.floor(n / max))
  const out = []
  let k = 0
  for (let i = 0; i < mask.length; i++) if (mask[i] && k++ % step === 0) out.push(i)
  return out
}

function ranks(values) {
  const order = Array.from(values.keys()).sort((a, b) => values[a] - values[b])
  const r = new Float64Array(values.length)
  for (let i = 0; i < order.length;) {
    let j = i
    while (j + 1 < order.length && values[order[j + 1]] === values[order[i]]) j++
    for (let k = i; k <= j; k++) r[order[k]] = (i + j) / 2
    i = j + 1
  }
  return r
}

function pearson(a, b) {
  const n = a.length
  if (n < 3) return 0
  let ma = 0, mb = 0
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i] }
  ma /= n; mb /= n
  let ab = 0, aa = 0, bb = 0
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; ab += x * y; aa += x * x; bb += y * y }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0
}

/** Spearman's rank correlation of two maps over the pixels `idx`. */
export function rankCorrelation(a, b, idx) {
  return pearson(ranks(idx.map((i) => a[i])), ranks(idx.map((i) => b[i])))
}

/** The pattern's typical feature length in pixels: spread over mean gradient (a blur-free measure of blotch size). */
function featureLength(v, mask, w, h) {
  let n = 0, s = 0, ss = 0, g = 0, gn = 0
  for (let y = 0; y < h - 1; y++) {
    for (let x = 0; x < w - 1; x++) {
      const i = y * w + x
      if (!mask[i]) continue
      n++; s += v[i]; ss += v[i] * v[i]
      if (mask[i + 1] && mask[i + w]) { g += Math.hypot(v[i + 1] - v[i], v[i + w] - v[i]); gn++ }
    }
  }
  if (!n || !gn) return null
  const sd = Math.sqrt(Math.max(0, ss / n - (s / n) ** 2))
  const mg = g / gn
  return mg > 1e-6 ? sd / mg : null
}

/** Circular hue difference in degrees (0–180). */
const hueGap = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d }

/** Chroma-weighted hue histogram (bins of 20°), normalised. */
function hueHistogram(A, B, idx, minChroma) {
  const bins = new Float64Array(18)
  let total = 0
  for (const i of idx) {
    const c = Math.hypot(A[i], B[i])
    if (c < minChroma) continue
    const h = (Math.atan2(B[i], A[i]) * 180 / Math.PI + 360) % 360
    bins[Math.floor(h / 20) % 18] += c
    total += c
  }
  return total ? bins.map((v) => v / total) : bins
}

/**
 * Scores one aligned pair.
 * @param {object} o
 * @param {{ width: number, height: number, rgba: Uint8Array }} o.ref  the reference picture
 * @param {{ width: number, height: number, rgba: Uint8Array }} o.ours  our render on the reference's grid
 * @param {Uint8Array} o.painted  where our render is painted (on the reference's grid), inside both outlines
 * @param {Uint8Array} o.bare  where both show the knife and ours is not painted (for the light's colour)
 * @param {string} o.finish
 * @param {number} o.length  the knife's length in reference pixels (for the blur sizes)
 */
export function scorePair({ ref, ours, painted, bare, finish, length }) {
  const { width: w, height: h } = ref
  const kind = finishKind(finish)
  const R = toLab(ref), O = toLab(ours)
  const idxPainted = indexes(painted)
  const area = idxPainted.length
  if (area < 200) return { kind, score: 0, area, note: 'too little painted area to score' }

  // The lights' colour: the bare parts are the same material in both, so their median colour difference is the
  // difference between the two lights (kept small: a whole finish must not be "corrected" away).
  const idxBare = indexes(bare, 20_000)
  let shiftA = 0, shiftB = 0
  if (idxBare.length >= 300) {
    shiftA = Math.max(-8, Math.min(8, median(idxBare.map((i) => O.A[i] - R.A[i]))))
    shiftB = Math.max(-8, Math.min(8, median(idxBare.map((i) => O.B[i] - R.B[i]))))
    for (let i = 0; i < w * h; i++) { O.A[i] -= shiftA; O.B[i] -= shiftB }
  }

  const sigma = Math.max(1.5, length * 0.012)
  const sm = (v) => blurIn(v, painted, w, h, sigma)
  const base = { kind, area, light: { a: +shiftA.toFixed(1), b: +shiftB.toFixed(1) } }

  if (kind === 'patina') {
    // b* runs from blue (negative) to gold (positive).
    const rb = sm(R.B), ob = sm(O.B)
    const ra = sm(R.A), oa = sm(O.A)
    const placement = rankCorrelation(rb, ob, idxPainted)
    const isBlue = (A, B, i) => B[i] < -6 && Math.hypot(A[i], B[i]) > 6
    const isGold = (A, B, i) => B[i] > 12
    let blueR = 0, blueO = 0, goldR = 0, goldO = 0
    for (const i of idxPainted) {
      blueR += isBlue(ra, rb, i); blueO += isBlue(oa, ob, i)
      goldR += isGold(ra, rb, i); goldO += isGold(oa, ob, i)
    }
    blueR /= area; blueO /= area; goldR /= area; goldO /= area
    const amount = clamp01(1 - Math.abs(blueR - blueO) / 0.3)
    const lr = featureLength(sm(R.B), painted, w, h), lo = featureLength(sm(O.B), painted, w, h)
    return {
      ...base, score: 0.65 * clamp01(placement) + 0.35 * amount, placement, amount,
      blue: { ref: blueR, ours: blueO }, gold: { ref: goldR, ours: goldO },
      size: lr && lo ? lr / lo : null,
    }
  }

  if (kind === 'spray') {
    // L* in two bands of scale, so the light's own broad bands along a blade drop out: `hp` (0.012–0.07 of the
    // knife's length) for where light and dark sit, `edge` (0.006–0.02) for how much the paint itself varies: the
    // edges of blotches pass, the slow light across a blade doesn't (checked on Shadow Daggers 730, whose reference
    // has strong light bands on a flat dark paint).
    const band = (L, s1, s2) => {
      const a = blurIn(L, painted, w, h, length * s1), b = blurIn(L, painted, w, h, length * s2)
      return a.map((v, i) => v - b[i])
    }
    const bands = (L) => ({ fine: sm(L), hp: band(L, 0.012, 0.07), edge: band(L, 0.006, 0.02) })
    const r = bands(R.L), o = bands(O.L)
    const spread = ({ fine, edge }) => {
      const s = Float64Array.from(idxPainted.map((i) => edge[i])).sort()
      const t = Float64Array.from(idxPainted.map((i) => fine[i])).sort()
      return { contrast: quantile(s, 0.75) - quantile(s, 0.25), p50: quantile(t, 0.5) }
    }
    const sr = spread(r), so = spread(o)
    // Contrast in L* units; two near-flat finishes agree whatever their small difference.
    const contrast = (Math.min(sr.contrast, so.contrast) + 2) / (Math.max(sr.contrast, so.contrast) + 2)
    const placement = rankCorrelation(r.hp, o.hp, idxPainted)
    // The placement only counts where both show a pattern.
    const weight = clamp01(Math.min(sr.contrast, so.contrast) / 4)
    const tone = clamp01(1 - Math.abs(sr.p50 - so.p50) / 30)
    const lr = featureLength(r.hp, painted, w, h), lo = featureLength(o.hp, painted, w, h)
    const pattern = weight * (0.6 * clamp01(placement) + 0.4 * contrast) + (1 - weight) * contrast
    return {
      ...base, score: 0.8 * pattern + 0.2 * tone,
      placement, contrast, tone, patterned: weight,
      lightness: { ref: sr, ours: so },
      size: lr && lo ? lr / lo : null,
    }
  }

  // Anodized: hue, and where each hue is.
  const ra = sm(R.A), rb = sm(R.B), oa = sm(O.A), ob = sm(O.B)
  let gap = 0, wsum = 0
  for (const i of idxPainted) {
    const cr = Math.hypot(ra[i], rb[i]), co = Math.hypot(oa[i], ob[i])
    const wt = Math.min(cr, co)
    if (wt < 8) continue
    gap += wt * hueGap(Math.atan2(rb[i], ra[i]) * 180 / Math.PI, Math.atan2(ob[i], oa[i]) * 180 / Math.PI)
    wsum += wt
  }
  const meanGap = wsum ? gap / wsum : 180
  const placement = clamp01(1 - meanGap / 60)
  const hr = hueHistogram(ra, rb, idxPainted, 8), ho = hueHistogram(oa, ob, idxPainted, 8)
  let colour = 0
  for (let k = 0; k < 18; k++) colour += Math.min(hr[k], ho[k])
  const chroma = (A, B) => median(idxPainted.map((i) => Math.hypot(A[i], B[i])))
  const top = (hist) => Array.from(hist, (v, k) => [v, k * 20 + 10]).sort((a, b) => b[0] - a[0]).slice(0, 3).filter(([v]) => v > 0.1).map(([v, hue]) => `${hue}°:${Math.round(v * 100)}%`)
  return {
    ...base, score: 0.6 * placement + 0.4 * colour, placement, colour, hueGap: meanGap,
    chroma: { ref: chroma(ra, rb), ours: chroma(oa, ob) }, hues: { ref: top(hr), ours: top(ho) },
  }
}
