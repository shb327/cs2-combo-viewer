// One reference picture against our two renders: outline, alignment in every arrangement, the painted parts, scores.
import { arrangements, referenceOutline, renderOutline } from './align.mjs'
import { close, dilate, erode, keepLarge, moments, open, toLab, warp, warpMask } from './image.mjs'
import { FLAG_BELOW, scorePair } from './score.mjs'

/** Outlines that overlap within this much IoU of each other are taken as fitting equally well. */
export const OUTLINE_TIE = 0.02
/** Below this outline IoU the alignment itself is in doubt. */
export const OUTLINE_POOR = 0.8

/**
 * Where a finish is painted on our render: where it differs from the same knife without a finish (vanilla), drawn
 * the same way. Small gaps (paint that happens to look like the bare metal) are closed.
 */
export function paintedMask(finish, vanilla) {
  const { width: w, height: h } = finish
  if (vanilla.width !== w || vanilla.height !== h) throw new Error(`the vanilla render is ${vanilla.width}×${vanilla.height}, the finish's ${w}×${h}`)
  const F = toLab(finish), V = toLab(vanilla)
  const inside = renderOutline(finish)
  let m = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) {
    if (!inside[i] || vanilla.rgba[i * 4 + 3] < 128) continue
    m[i] = +(Math.hypot(F.L[i] - V.L[i], F.A[i] - V.A[i], F.B[i] - V.B[i]) > 6)
  }
  const r = Math.max(2, Math.round(Math.max(w, h) / 160))
  m = close(m, w, h, r)
  m = open(m, w, h, 2)
  m = keepLarge(m, w, h, 0.03)
  for (let i = 0; i < w * h; i++) m[i] &= inside[i]
  return m
}

const label = (a) => `${a.side}${a.mirror ? ', mirrored' : ''}`

/**
 * @param {object} o
 * @param {{ width: number, height: number, rgba: Uint8Array }} o.ref
 * @param {{ front: object, back: object }} o.renders  our renders (RGBA, transparent background)
 * @param {{ front: Uint8Array, back: Uint8Array }} o.painted  their painted masks
 * @param {string} o.finish
 */
export function checkPicture({ ref, renders, painted, finish }) {
  const { width: w, height: h } = ref
  const refMask = referenceOutline(ref)
  const rm = moments(refMask, w, h)
  const length = rm.major * Math.sqrt(12)
  const outlines = {
    front: { mask: renderOutline(renders.front), width: renders.front.width, height: renders.front.height },
    back: { mask: renderOutline(renders.back), width: renders.back.width, height: renders.back.height },
  }
  const all = arrangements(refMask, w, h, outlines)
  const refInner = erode(refMask, w, h, 2)

  /** Our render in one arrangement, on the reference's grid, and its score. */
  const evaluate = (a) => {
    const src = renders[a.side]
    const { image, cover } = warp(src, w, h, a.mat, [0, 0, 0, 255])
    const ourMask = warpMask(outlines[a.side].mask, src.width, src.height, w, h, a.mat)
    const paint = warpMask(painted[a.side], src.width, src.height, w, h, a.mat)
    const region = new Uint8Array(w * h), bare = new Uint8Array(w * h)
    const paintNear = dilate(paint, w, h, 3)
    const ourInner = erode(ourMask, w, h, 2)
    for (let i = 0; i < w * h; i++) {
      region[i] = paint[i] & refInner[i] & ourInner[i] & +(cover[i] > 0.95)
      bare[i] = refInner[i] & ourInner[i] & (1 - paintNear[i])
    }
    const s = scorePair({ ref, ours: image, painted: region, bare, finish, length })
    return { ...a, image, region, ourMask, result: s }
  }

  // The best outline per (side, mirror); a half turn is only the pose.
  const bestOf = new Map()
  for (const a of all) {
    const key = label(a)
    if (!bestOf.has(key)) bestOf.set(key, a)
  }
  const evaluated = [...bestOf.values()].map(evaluate)
  // A knife seen from behind is its front mirrored, so our back mirrored has our front's outline (up to perspective):
  // the outline tells apart only the two pairs {front, back mirrored} and {back, front mirrored}. It picks the pair;
  // the pattern picks within it. A near-symmetric outline leaves all four to the pattern.
  const pairOf = (a) => ((a.side === 'front') === !a.mirror ? 'same' : 'other')
  const pairIou = (p) => Math.max(...evaluated.filter((a) => pairOf(a) === p).map((a) => a.iou))
  const symmetric = Math.abs(pairIou('same') - pairIou('other')) < OUTLINE_TIE
  const pair = pairIou('same') >= pairIou('other') ? 'same' : 'other'
  const candidates = symmetric ? evaluated : evaluated.filter((a) => pairOf(a) === pair)
  const chosen = candidates.reduce((b, a) => (a.result.score > b.result.score ? a : b))
  const decidedBy = symmetric ? 'pattern' : 'outline'
  // The other way to read the same outline: our other side, mirrored the other way.
  const otherSide = evaluated.find((a) => pairOf(a) === pairOf(chosen) && a.side !== chosen.side)
  /** The side whose outline fits without mirroring: the reference's side in our naming, if its picture isn't mirrored. */
  const face = evaluated.find((a) => pairOf(a) === pairOf(chosen) && !a.mirror).side
  return {
    refMask, length, chosen, otherSide, decidedBy, face,
    arrangements: evaluated.map((a) => ({ arrangement: label(a), iou: a.iou, turned: a.turned, score: a.result.score })),
  }
}

/** A short guess at why a pair scores as it does, from its numbers. */
export function likelyCause(row) {
  const r = row.result
  const causes = []
  if (row.iou < OUTLINE_POOR) causes.push('outline (shape or framing)')
  if (r.kind === 'patina') {
    if (r.amount < 0.5) causes.push(`blue amount (ours ${pct(r.blue.ours)}, ref ${pct(r.blue.ref)})`)
    if (r.size && (r.size > 1.45 || r.size < 0.7)) causes.push(`pattern size (ref/ours ${r.size.toFixed(2)})`)
    if (r.placement < 0.3 && r.amount >= 0.5) causes.push('placement or rotation')
  } else if (r.kind === 'spray') {
    if (r.contrast < 0.5) causes.push(`light/dark contrast (ours ${r.lightness.ours.contrast.toFixed(2)}, ref ${r.lightness.ref.contrast.toFixed(2)})`)
    if (r.size && (r.size > 1.45 || r.size < 0.7) && r.patterned > 0.5) causes.push(`pattern size (ref/ours ${r.size.toFixed(2)})`)
    if (r.patterned > 0.5 && r.placement < 0.3) causes.push('placement or rotation')
  } else if (r.kind === 'anodized') {
    if (r.colour < 0.5) causes.push('phase or colour')
    if (r.placement < 0.5 && r.colour >= 0.5) causes.push('hue placement')
  }
  if (row.mirrored && row.otherFaceScore !== null && r.score > row.otherFaceScore + 0.15) causes.push(`fits our ${row.arrangement.split(',')[0]} side only mirrored`)
  return causes.join('; ') || (r.score < FLAG_BELOW ? 'unclear' : '')
}

const pct = (v) => `${Math.round(v * 100)}%`
