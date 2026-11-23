// The reference check's alignment and scoring, on synthetic pictures (no browser, no reference pictures).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { arrangements, referenceOutline, renderOutline } from '../src/refcheck/align.mjs'
import { paintedMask } from '../src/refcheck/check.mjs'
import { decodePng, encodePng, toLab } from '../src/refcheck/image.mjs'
import { readManifest, slug } from '../src/refcheck/manifest.mjs'
import { FLAG_BELOW, finishKind, scorePair } from '../src/refcheck/score.mjs'

/** An image from a function of the pixel: [r, g, b] or [r, g, b, a]. */
function paint(width, height, fn) {
  const rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a = 255] = fn(x, y)
      rgba.set([r, g, b, a], (y * width + x) * 4)
    }
  }
  return { width, height, rgba }
}

/** An asymmetric knife-like outline, in a unit box: a blade with a curved spine and a tip on the right, a grip. */
const insideKnife = (u, v) => (u > 0.05 && u < 0.35 && v > 0.42 && v < 0.62) ||
  (u >= 0.35 && u < 0.95 && v > 0.38 + 0.18 * ((u - 0.35) / 0.6) ** 2 && v < 0.66 - 0.2 * ((u - 0.35) / 0.6))

const W = 240, H = 160
/** The blade's painted area on the synthetic grid. */
const blade = paint(W, H, (x, y) => (x > 40 && x < 210 && y > 50 && y < 110 ? [1, 1, 1] : [0, 0, 0]))
const bladeMask = Uint8Array.from({ length: W * H }, (_, i) => blade.rgba[i * 4])
const none = new Uint8Array(W * H)
const score = (ref, ours, finish) => scorePair({ ref, ours, painted: bladeMask, bare: none, finish, length: 200 })

test('png: encode and decode keep every pixel', () => {
  const img = paint(7, 5, (x, y) => [x * 30, y * 40, 200, 255 - x])
  const back = decodePng(encodePng(img))
  assert.equal(back.width, 7)
  assert.deepEqual([...back.rgba], [...img.rgba])
})

test('manifest: rows by header, quoted fields; catalog names as the manifest writes them', () => {
  const rows = readManifest('picture,group,knife,finish,phase,seed,wear,side\na.png,g,flip,gamma-doppler-phase-4,"Phase 4, late",412,0.00,back\n')
  assert.equal(rows[0].phase, 'Phase 4, late')
  assert.equal(rows[0].seed, '412')
  assert.equal(slug('Gamma Doppler (Phase 4)'), 'gamma-doppler-phase-4')
  assert.equal(slug('Bowie Knife'), 'bowie')
  assert.equal(slug('M9 Bayonet'), 'm9-bayonet')
  assert.throws(() => readManifest('picture,knife\na.png,flip\n'), /group/)
})

test('align: finds our side turned, scaled and moved, and tells it from the other side', () => {
  // Ours: the knife upright (tip up) in a 300×600 render; the reference: lying down, tip left, smaller, off centre.
  const front = paint(300, 600, (x, y) => (insideKnife(1 - y / 600, x / 300) ? [150, 150, 150, 255] : [0, 0, 0, 0]))
  const back = paint(300, 600, (x, y) => (insideKnife(1 - y / 600, 1 - x / 300) ? [150, 150, 150, 255] : [0, 0, 0, 0]))
  const ref = paint(400, 300, (x, y) => (insideKnife(1 - (x - 40) / 330, 1 - (y - 20) / 165) ? [120, 120, 120] : [3, 3, 3]))
  const outlines = {
    front: { mask: renderOutline(front), width: 300, height: 600 },
    back: { mask: renderOutline(back), width: 300, height: 600 },
  }
  const all = arrangements(referenceOutline(ref), 400, 300, outlines)
  const best = all[0]
  assert.ok(best.iou > 0.93, `best overlap ${best.iou}`)
  // Our back mirrored is our front's outline: either is right; our back as it is is not.
  assert.ok((best.side === 'front' && !best.mirror) || (best.side === 'back' && best.mirror), `${best.side} ${best.mirror}`)
  const plainBack = all.find((a) => a.side === 'back' && !a.mirror)
  assert.ok(plainBack.iou < best.iou - 0.05, `our back as it is overlaps ${plainBack.iou}`)
})

test('painted mask: where the finish differs from the vanilla knife', () => {
  const vanilla = paint(120, 80, (x, y) => (y > 10 && y < 70 ? [140, 140, 140, 255] : [0, 0, 0, 0]))
  const finish = paint(120, 80, (x, y) => (y > 10 && y < 70 ? (x > 50 ? [60, 90, 200, 255] : [140, 140, 140, 255]) : [0, 0, 0, 0]))
  const m = paintedMask(finish, vanilla)
  assert.equal(m[40 * 120 + 90], 1)
  assert.equal(m[40 * 120 + 20], 0)
  assert.equal(m[5 * 120 + 90], 0)
})

const BLUE = [60, 90, 200], GOLD = [205, 165, 60]
/** Blue blobs on gold, centred at `spots`. */
const caseHardened = (spots) => paint(W, H, (x, y) => (spots.some(([cx, cy]) => (x - cx) ** 2 + (y - cy) ** 2 < 18 ** 2) ? BLUE : GOLD))

test('Case Hardened: blue where the reference has blue scores high; elsewhere, or none, scores low', () => {
  const ref = caseHardened([[70, 70], [150, 90]])
  assert.equal(finishKind('case-hardened'), 'patina')
  const same = score(ref, caseHardened([[70, 70], [150, 90]]), 'case-hardened')
  const moved = score(ref, caseHardened([[110, 60], [190, 95]]), 'case-hardened')
  const gold = score(ref, caseHardened([]), 'case-hardened')
  assert.ok(same.score > 0.9, `same ${same.score}`)
  assert.ok(moved.score < FLAG_BELOW, `moved ${moved.score}`)
  assert.ok(gold.score < FLAG_BELOW, `all gold ${gold.score}`)
  assert.ok(Math.abs(same.blue.ref - same.blue.ours) < 0.02)
})

test('spray: a flat dark paint matches whatever the light does; blotches against it are flagged', () => {
  // The reference: flat dark paint under light that brightens slowly along the blade.
  const ref = paint(W, H, (x) => { const v = 45 + Math.round(x / 12); return [v, v, v] })
  const flat = paint(W, H, () => [50, 50, 50])
  const blotchy = paint(W, H, (x, y) => (Math.sin(x / 9) * Math.sin(y / 9) > 0.2 ? [170, 165, 155] : [50, 50, 50]))
  assert.equal(finishKind('scorched'), 'spray')
  const good = score(ref, flat, 'scorched'), bad = score(ref, blotchy, 'scorched')
  assert.ok(good.score > 0.75, `flat ${good.score}`)
  assert.ok(bad.score < FLAG_BELOW, `blotchy ${bad.score}`)
  // The same blotches in both line up.
  const both = score(blotchy, blotchy, 'scorched')
  assert.ok(both.score > 0.9, `same blotches ${both.score}`)
})

/** A fade along the blade: hue from `h0` to `h1` degrees in CIELAB, chroma 45. */
function fade(h0, h1) {
  return paint(W, H, (x) => {
    const t = Math.min(1, Math.max(0, (x - 40) / 170)), hue = (h0 + (h1 - h0) * t) * Math.PI / 180
    return labRgb(60, 45 * Math.cos(hue), 45 * Math.sin(hue))
  })
}
/** sRGB from CIELAB (D65), for the synthetic fades. */
function labRgb(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200
  const inv = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27))
  const X = inv(fx) * 0.95047, Y = inv(fy), Z = inv(fz) * 1.08883
  return [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z]
    .map((c) => Math.round(255 * Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055))))
}

test('fades and Dopplers: the same hues in the same places score high; reversed or another colour, low', () => {
  const ref = fade(80, 300)
  assert.equal(finishKind('fade'), 'anodized')
  assert.equal(finishKind('gamma-doppler-phase-4'), 'anodized')
  const same = score(ref, fade(80, 300), 'fade')
  const reversed = score(ref, fade(300, 80), 'fade')
  const green = score(ref, fade(140, 160), 'gamma-doppler-phase-4')
  assert.ok(same.score > 0.9, `same ${same.score}`)
  assert.ok(reversed.score < FLAG_BELOW, `reversed ${reversed.score}`)
  assert.ok(reversed.colour > 0.8, 'reversed has the same colours')
  assert.ok(green.score < FLAG_BELOW, `green ${green.score}`)
  // The synthetic colours are what they claim.
  const lab = toLab(ref)
  assert.ok(lab.B[80 * W + 45] > 30)
})
