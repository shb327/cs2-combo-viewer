import { test } from 'node:test'
import assert from 'node:assert/strict'
import { drawSides } from '../src/lib/viewer/item-sides.ts'

/**
 * A stand-in for the viewer in the studio: a flat plate (one face's normal along +Z, the other's along −Z) under a light
 * fixed in the world, coming from +Z. `draw` returns how bright the face the camera sees is (Lambert), so a back lit
 * from behind shows up as 0. The camera may only be moved by `resetView` (to the front); the item turns about Y.
 */
function studio() {
  const light = [0, 0, 1]
  const s = {
    cameraAngle: 0, itemAngle: 0, calls: [],
    resetView() { s.calls.push('reset'); s.cameraAngle = 0; s.itemAngle = 0 },
    turnBack() { s.calls.push('turn'); s.itemAngle += Math.PI },
    draw() {
      s.calls.push('draw')
      // The camera looks at the plate from its angle around Y; it sees the face whose normal points at it.
      const toCamera = [Math.sin(s.cameraAngle), 0, Math.cos(s.cameraAngle)]
      const front = [Math.sin(s.itemAngle), 0, Math.cos(s.itemAngle)]
      const facing = front[0] * toCamera[0] + front[2] * toCamera[2] >= 0 ? front : front.map((v) => -v)
      const lit = Math.max(0, facing[0] * light[0] + facing[1] * light[1] + facing[2] * light[2])
      return { lit, face: facing === front ? 'front' : 'back', cameraAngle: s.cameraAngle }
    },
  }
  return s
}

test('both sides are drawn under the same light: the item turns, the camera stays', () => {
  const s = studio()
  const { front, back } = drawSides(s)
  assert.equal(front.face, 'front')
  assert.equal(back.face, 'back')
  assert.equal(back.cameraAngle, front.cameraAngle)
  assert.ok(front.lit > 0.99)
  assert.ok(Math.abs(back.lit - front.lit) < 1e-9, `front lit ${front.lit}, back lit ${back.lit}`)
})

test('the viewer is left at the front framing, the item unturned', () => {
  const s = studio()
  drawSides(s)
  assert.deepEqual(s.calls, ['reset', 'draw', 'turn', 'draw', 'reset'])
  assert.equal(s.itemAngle, 0)
  assert.equal(s.cameraAngle, 0)
})
