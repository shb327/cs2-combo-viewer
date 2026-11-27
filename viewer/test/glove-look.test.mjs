import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CLOTH_SPECULAR, GLOVE_RESOLVE, classicTextureSrgb, gloveMaterialParameters } from '../src/lib/materials/glove-look.ts'

// csgo_customglove's classic combos convert the pattern's colour from sRGB themselves (SrgbGammaToLinear on the
// pattern sample when g_nPatternMode is 2 or 3), so that texture must reach them as stored: an sRGB read on top
// converts it twice (Hydra Gloves | Case Hardened deep blue instead of pale, Marble Fade's pink and gold as red and
// orange). The shader's table marks g_tPattern as sRGB all the same.
test('a classic glove reads its pattern as stored when the pattern is the colour (modes 2 and 3)', () => {
  assert.equal(classicTextureSrgb('g_tPattern', true, 2), false) // Case Hardened, Fade, Marble Fade
  assert.equal(classicTextureSrgb('g_tPattern', true, 3), false)
})

test('the pattern as a palette mask (modes 0 and 1), and every other texture, follow the shader table', () => {
  assert.equal(classicTextureSrgb('g_tPattern', true, 0), true) // Crimson Kimono and the other print gloves
  assert.equal(classicTextureSrgb('g_tPattern', true, 1), true)
  assert.equal(classicTextureSrgb('g_tGrunge1', true, 2), true)
  assert.equal(classicTextureSrgb('g_tNormal', false, 2), false)
  assert.equal(classicTextureSrgb('g_tNoise', true, 2), true)
})

// The compositor's cloth output says where the glove is fabric. In the game's cloth shading that part is lit by the
// cloth lobe rather than the usual specular one; three.js's full specular on top of its sheen made knit look like
// plastic (Driver Gloves | Hand Sweaters). A quarter of it is kept on cloth: with none, suede went darker than in the
// game's pictures (Specialist Gloves' palm), so the share is fitted to both.
test('the material takes its specular intensity from the cloth map', () => {
  const maps = { albedo: 'albedo', normal: 'normal', orm: 'orm', cloth: 'cloth' }
  const p = gloveMaterialParameters(maps, 0.667)
  assert.equal(p.specularIntensityMap, 'cloth')
  assert.equal(p.sheenColorMap, 'cloth')
  assert.equal(p.roughnessMap, 'orm')
  assert.equal(p.metalnessMap, 'orm')
  assert.equal(p.map, 'albedo')
  assert.equal(p.normalMap, 'normal')
})

test('cloth keeps a quarter of the specular, everything else all of it', () => {
  assert.equal(CLOTH_SPECULAR, 0.25)
  const line = GLOVE_RESOLVE.split('\n').find((l) => /oCloth\s*=/.test(l))
  assert.ok(line, 'the resolve writes the cloth map')
  // three.js reads the specular intensity from the map's alpha: 1 where cloth is 0, CLOTH_SPECULAR where it is 1.
  assert.match(line, /,\s*1\.0\s*-\s*0\.75\s*\*\s*cloth\s*\)\s*;/)
  assert.match(GLOVE_RESOLVE, /float cloth = clamp\(cv\(m\.z\), 0\.0, 1\.0\);/)
})
