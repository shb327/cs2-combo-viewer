import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classicGloveRolls, valveRandom } from '../src/lib/data/rng.ts'

// A classic glove kit's rolls (gloves/paints/<kit>.vcompmat): pattern offset, pattern rotation, grunge offset,
// grunge rotation, listed twice (the seed's set and the alternate seed's). Bounds as in release 71979e622923.
const set = (pattern = [[0, 0], [1, 1]], rotation = [[0], [360]]) => [
  { var: 'g_fPatternTexCoordOffset', min: pattern[0], max: pattern[1] },
  rotation ? { var: 'g_fPatternTexCoordRotation', min: rotation[0], max: rotation[1] } : { var: 'g_fPatternTexCoordRotation', fixed: true },
  { var: 'g_fGrungeTexCoordOffset', min: [0, 0], max: [1, 1] },
  { var: 'g_fGrungeTexCoordRotation', min: [0], max: [360] },
]
const plan = (rolls, fixed = {}) => ({
  rolls: [...rolls, ...rolls],
  fixed: { g_fPatternTexCoordOffset: [0, 0, 0, 0], g_fPatternTexCoordRotation: [0], g_fGrungeTexCoordOffset: [0, 0, 0, 0], g_fGrungeTexCoordRotation: [0], ...fixed },
})
const MARBLE_FADE = plan(set([[0.65, 0], [0.65, 1]], [[86], [86]]))
const CRIMSON_KIMONO = plan(set(undefined, [[25.200001], [25.200001]]))
const FADE = plan(set(undefined, [[45], [135]]))
const SCARLET_SHAMAGH = plan(set(undefined, null), { g_fPatternTexCoordRotation: [12] })
const CASE_HARDENED = plan(set())

/** The six draws of a hand's stream in [0, 1), as the game's RandomFloat(0, 1) gives them. */
const draws = (seed) => { const r = valveRandom(seed); return Array.from({ length: 6 }, () => r(0, 1)) }
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-4, `${a} ≉ ${b}`)

test('a kit with the default bounds rolls as before: offsets in [0, 1), rotations in [0, 360)', () => {
  for (const seed of [0, 1, 15, 269, 1000]) {
    const r = valveRandom(seed)
    const before = { pattern: [r(0, 1), r(0, 1)], patternRot: r(0, 360), grunge: [r(0, 1), r(0, 1)], grungeRot: r(0, 360) }
    assert.deepEqual(classicGloveRolls(valveRandom(seed), CASE_HARDENED), before)
    assert.deepEqual(classicGloveRolls(valveRandom(seed)), before, 'no roll plan: the default bounds')
  }
})

test('Marble Fade keeps its pattern at x = 0.65 and 86°: only y comes from the seed', () => {
  for (const seed of [0, 1, 2, 500, 1000]) {
    const d = draws(seed)
    const v = classicGloveRolls(valveRandom(seed), MARBLE_FADE)
    close(v.pattern[0], 0.65)
    close(v.pattern[1], d[1])
    close(v.patternRot, 86)
    close(v.grunge[0], d[3])
    close(v.grunge[1], d[4])
    close(v.grungeRot, 360 * d[5])
  }
})

test('a rotation range is rolled inside it (Specialist Gloves | Fade: 45° to 135°)', () => {
  for (const seed of [0, 3, 77, 999]) {
    const v = classicGloveRolls(valveRandom(seed), FADE)
    close(v.patternRot, 45 + 90 * draws(seed)[2])
  }
})

test('a fixed rotation stays fixed and still uses up its draw (Crimson Kimono: 25.2°)', () => {
  const d = draws(269)
  const v = classicGloveRolls(valveRandom(269), CRIMSON_KIMONO)
  close(v.patternRot, 25.200001)
  close(v.pattern[0], d[0])
  close(v.grungeRot, 360 * d[5])
})

test('a variable rolled without bounds keeps the kit\'s value and still uses up its draw (Scarlet Shamagh)', () => {
  const d = draws(42)
  const v = classicGloveRolls(valveRandom(42), SCARLET_SHAMAGH)
  assert.equal(v.patternRot, 12)
  close(v.grunge[0], d[3])
})

// Driver Gloves | Imperial Plaid, seed 630 (its kit: offset in [0, 0.2) × [0, 0.3), rotation 0), checked against the
// game's look of that seed with the same knife and pose: swept over the whole offset range, each hand's plaid matched
// best near the offset these rolls give — the left hand's stream from the seed, the right hand's from the seed + 1.
// Rolled in [0, 1) as before, the left hand's plaid sat a half block off.
test('Imperial Plaid 630 places each hand as the game does', () => {
  const IMPERIAL_PLAID = plan(set([[0, 0], [0.2, 0.3]], [[0], [0]]))
  const left = classicGloveRolls(valveRandom(630), IMPERIAL_PLAID)
  const right = classicGloveRolls(valveRandom(631), IMPERIAL_PLAID)
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-3, `${a} ≉ ${b}`)
  near(left.pattern[0], 0.146); near(left.pattern[1], 0.247); near(left.patternRot, 0)
  near(right.pattern[0], 0.021); near(right.pattern[1], 0.058)
})
