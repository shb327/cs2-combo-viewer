import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compositeWeaponLength } from '../src/lib/materials/weapon-size.ts'

// The size factor of csgo_customweapon's g_v*TexCoordXform expressions: the paint's scale times
// g_flWeaponLength1 / 36 unless the paint sets g_bIgnoreWeaponSizeScale, rounded to 2 decimals.
const r2 = (v) => Math.floor((v + 0.005) * 100) / 100
const sizeScale = (scale, ignoreSize, ci, style) => r2(scale * (ignoreSize ? 1 : compositeWeaponLength(ci, style) / 36))

// Composite inputs (g_flUvScale1, g_flWeaponLength1) of release 71979e622923.
const GUT = { uvScale: 0.733, weaponLength: 14.61 }
const KARAMBIT = { uvScale: 0.438, weaponLength: 9.813 }
const BAYONET = { uvScale: 0.505, weaponLength: 14.518 }
const BOWIE = { uvScale: 0.461662, weaponLength: 18.4346 }
const SHADOW_DAGGERS = { uvScale: 0.584, weaponLength: 5.885 }
const TALON = { uvScale: 0.36, weaponLength: 12.57 }
const KNIVES = [GUT, KARAMBIT, BAYONET, BOWIE, SHADOW_DAGGERS, TALON]

// F_PAINT_STYLE: spray paint and airbrush project the pattern from the position map; the others sample it by UV.
const PATINA = 7, SPRAY = 2, AIRBRUSH = 5
const UV_STYLES = [null, 0, 1, 3, 4, 6, 7, 8]

test('UV-sampled finishes are sized by the composite UV scale', () => {
  assert.equal(sizeScale(1, false, GUT, PATINA), 0.73) // Case Hardened 837, in-game pictures
  assert.equal(sizeScale(1, false, KARAMBIT, PATINA), 0.44)
  assert.equal(sizeScale(1, false, BAYONET, PATINA), 0.51)
  assert.equal(sizeScale(1, false, BOWIE, PATINA), 0.46)
  assert.equal(sizeScale(1, false, SHADOW_DAGGERS, PATINA), 0.58)
  assert.equal(sizeScale(1, false, TALON, PATINA), 0.36)
  for (const style of UV_STYLES) assert.equal(sizeScale(1, false, SHADOW_DAGGERS, style), 0.58)
})

test('position-projected finishes are sized by the weapon length', () => {
  assert.equal(sizeScale(1, false, SHADOW_DAGGERS, SPRAY), 0.16) // Scorched 730, in game
  assert.equal(sizeScale(1, false, GUT, SPRAY), 0.41)
  assert.equal(sizeScale(1, false, KARAMBIT, SPRAY), 0.27)
  assert.equal(sizeScale(1, false, BAYONET, SPRAY), 0.4)
  assert.equal(sizeScale(1, false, BOWIE, SPRAY), 0.51)
  assert.equal(sizeScale(1, false, TALON, SPRAY), 0.35)
  assert.equal(sizeScale(1, false, SHADOW_DAGGERS, AIRBRUSH), 0.16)
  assert.equal(compositeWeaponLength(SHADOW_DAGGERS, SPRAY), 5.885)
})

test('the paint scale multiplies the size factor', () => {
  assert.equal(sizeScale(3, false, GUT, PATINA), 2.2) // Damascus Steel
  assert.equal(sizeScale(4.5, false, KARAMBIT, 1), 1.97) // Crimson Web
  assert.equal(sizeScale(0.9, false, SHADOW_DAGGERS, SPRAY), 0.15) // Scorched
})

test('paints with the size flag keep their own scale', () => {
  for (const ci of KNIVES) {
    for (const style of [PATINA, SPRAY, AIRBRUSH, 4]) {
      assert.equal(sizeScale(1.6, true, ci, style), 1.6) // Doppler
      assert.equal(sizeScale(1, true, ci, style), 1) // Fade
    }
  }
})

test('without a UV scale the composite inputs keep their weapon length', () => {
  assert.equal(compositeWeaponLength({ weaponLength: 14.61 }, PATINA), 14.61)
  assert.equal(compositeWeaponLength({ uvScale: null, weaponLength: 14.61 }, PATINA), 14.61)
  assert.equal(compositeWeaponLength({}, PATINA), 32)
  assert.equal(compositeWeaponLength({ uvScale: 0.733 }, SPRAY), 32)
  assert.equal(sizeScale(1, false, { weaponLength: 14.61 }, PATINA), 0.41)
})
