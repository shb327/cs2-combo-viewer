import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compositeWeaponLength } from '../src/lib/materials/weapon-size.ts'

// The size factor of csgo_customweapon's g_v*TexCoordXform expressions: the paint's scale times
// g_flWeaponLength1 / 36 unless the paint sets g_bIgnoreWeaponSizeScale, rounded to 2 decimals.
const r2 = (v) => Math.floor((v + 0.005) * 100) / 100
const sizeScale = (scale, ignoreSize, ci) => r2(scale * (ignoreSize ? 1 : compositeWeaponLength(ci) / 36))

// Composite inputs (g_flUvScale1, g_flWeaponLength1) of release 71979e622923.
const GUT = { uvScale: 0.733, weaponLength: 14.61 }
const KARAMBIT = { uvScale: 0.438, weaponLength: 9.813 }
const SHADOW_DAGGERS = { uvScale: 0.584, weaponLength: 5.885 }
const BOWIE = { uvScale: 0.461662, weaponLength: 18.4346 }
const TALON = { uvScale: 0.36, weaponLength: 12.57 }

test('knife textures are sized by the composite UV scale', () => {
  assert.equal(sizeScale(1, false, GUT), 0.73)
  assert.equal(sizeScale(1, false, KARAMBIT), 0.44)
  assert.equal(sizeScale(1, false, SHADOW_DAGGERS), 0.58)
  assert.equal(sizeScale(1, false, BOWIE), 0.46)
  assert.equal(sizeScale(1, false, TALON), 0.36)
})

test('the paint scale multiplies the UV scale', () => {
  assert.equal(sizeScale(3, false, GUT), 2.2) // Damascus Steel
  assert.equal(sizeScale(4.5, false, KARAMBIT), 1.97) // Crimson Web
})

test('paints with the size flag keep their own scale', () => {
  for (const ci of [GUT, KARAMBIT, SHADOW_DAGGERS, BOWIE, TALON]) {
    assert.equal(sizeScale(1.6, true, ci), 1.6) // Doppler
    assert.equal(sizeScale(1, true, ci), 1) // Fade
  }
})

test('without a UV scale the composite inputs keep their weapon length', () => {
  assert.equal(compositeWeaponLength({ weaponLength: 14.61 }), 14.61)
  assert.equal(compositeWeaponLength({ uvScale: null, weaponLength: 14.61 }), 14.61)
  assert.equal(compositeWeaponLength({}), 32)
  assert.equal(sizeScale(1, false, { weaponLength: 14.61 }), 0.41)
})
