import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evalExpr } from '../src/lib/materials/composite-expr.ts'

const ctx = (params) => ({ param: (n) => params[n], ext: (n) => params[n], feature: () => 0 })
const run = (fn, value) => evalExpr([[0, 'PARAM', 'v'], [5, 'FUNC', fn], [8, 'END']], ctx({ v: value }))
const close = (actual, expected) => actual.forEach((x, i) => assert.ok(Math.abs(x - expected[i]) < 1e-4, `${actual} ≉ ${expected}`))

// csgo_customglove's newer combos read a tint id's colour as g_vIdNColor = SrgbGammaToLinear(the paint's value): the
// colour in its rgb, how strongly it covers the leather in its alpha. Alpha isn't a colour: the conversion leaves it
// as it is, as the game's colour functions do. Converting it too laid Driver Gloves | Plum Quill's violet over the
// leather at 0.47 instead of 0.72.
test('SrgbGammaToLinear converts a colour\'s rgb and keeps its alpha', () => {
  close(run('SrgbGammaToLinear', [0.172549, 0.082353, 0.333333, 0.717647]), [0.025187, 0.007499, 0.090842, 0.717647]) // Plum Quill, id 1
  close(run('SrgbGammaToLinear', [1, 1, 1, 0]), [1, 1, 1, 0])
})

test('SrgbLinearToGamma keeps the alpha too', () => {
  close(run('SrgbLinearToGamma', [0.025187, 0.007499, 0.090842, 0.5]), [0.172549, 0.082353, 0.333333, 0.5])
})

test('a scalar or a three-component colour is converted whole, as before', () => {
  close([run('SrgbGammaToLinear', 0.5)], [0.214])
  close(run('SrgbGammaToLinear', [0.5, 0.5, 0.5]), [0.214, 0.214, 0.214])
})
