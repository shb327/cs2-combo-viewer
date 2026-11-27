import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evalExpr } from '../src/lib/materials/composite-expr.ts'
import { gloveV2WearParam } from '../src/lib/materials/glove-look.ts'

// csgo_customglove's g_fWearProgress is the game's expression SrgbLinearToGamma(g_fWearProgress): the shader encodes
// the wear itself. Its values were matched against skinshotter's composites of Sport Gloves | Brocade Flowers
// (0.15, 0.37, 0.6 drawn as 0.42, 0.64, 0.79). Given the float as it is, the expression gives exactly those; given the
// float already raised to 1/2.2, it encoded it twice (float 0.06 drawn at 0.56: gloves near factory new looked worn).
const shaderWear = (param) => evalExpr([[0, 'PARAM', 'g_fWearProgress'], [5, 'FUNC', 'SrgbLinearToGamma'], [8, 'END']],
  { param: () => param, ext: () => param, feature: () => 0 })

test('a newer glove passes its float to the shader as it is', () => {
  for (const f of [0, 0.06, 0.15, 0.37, 0.6, 0.8]) assert.equal(gloveV2WearParam(f), f)
  assert.equal(gloveV2WearParam(-0.1), 0)
})

test('the shader then sees the wear skinshotter\'s composites show', () => {
  for (const [f, seen] of [[0.15, 0.42], [0.37, 0.64], [0.6, 0.79]]) {
    assert.ok(Math.abs(shaderWear(gloveV2WearParam(f)) - seen) < 0.01, `${f} → ${shaderWear(gloveV2WearParam(f))}`)
  }
  assert.ok(shaderWear(gloveV2WearParam(0.06)) < 0.3)
})
