import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { placeViewmodel } from '../src/lib/viewer/viewmodel-sway.ts'
import { DEFAULT_VIEWMODEL } from '../src/lib/viewer/viewer-options.ts'

/** The combo page's viewmodel: the sway on (it is off only for screenshots). */
const COMBO = { ...DEFAULT_VIEWMODEL, leftHanded: false, sway: true }
const FRAME = 1 / 60
const FRAMES = 240
/** The pointer's spots as it crosses the view edge to edge, 40 frames at each. */
const EDGES = [[-1, -1], [1, -1], [1, 1], [-1, 1], [-1, 0], [1, 0]]
const crossing = (i) => EDGES[Math.floor(i / 40) % EDGES.length]

/** Runs a fresh holder for FRAMES frames with the pointer where `at` says; returns its pose on every frame. */
function run(vm, lean, at) {
  const holder = new THREE.Object3D()
  const pointer = new THREE.Vector2()
  const poses = []
  for (let i = 0; i < FRAMES; i++) {
    pointer.set(...at(i))
    placeViewmodel(holder, vm, 3 + i * FRAME, pointer, lean)
    poses.push([...holder.position.toArray(), ...holder.rotation.toArray().slice(0, 3)])
  }
  return poses
}

const centre = () => [0, 0]

test('input=game: moving the pointer edge to edge leaves the first-person holder where it was', () => {
  const still = run(COMBO, false, centre)
  const moved = run(COMBO, false, crossing)
  const drift = Math.max(...moved.flatMap((p, i) => p.map((v, k) => Math.abs(v - still[i][k]))))
  assert.equal(drift, 0, `the holder moved with the pointer by up to ${drift}`)
  assert.equal(Math.max(...moved.map(([, , , rx, ry]) => Math.max(Math.abs(rx), Math.abs(ry)))), 0, 'no lean or tilt')
})

test('input=game: the breathing (the bob and the roll) stays', () => {
  const poses = run(COMBO, false, crossing)
  const span = (k) => Math.max(...poses.map((p) => p[k])) - Math.min(...poses.map((p) => p[k]))
  assert.ok(span(1) > 0.001, `the holder bobs: ${span(1)}`)
  assert.ok(span(5) > 0.005, `the holder rolls: ${span(5)}`)
})

test('with the lean on (the app\'s "Weapon sway"), the weapon still leans toward the pointer', () => {
  const upRight = run(COMBO, true, () => [1, 1]).at(-1)
  assert.ok(upRight[4] < -0.04, `leans right: ${upRight[4]}`)
  assert.ok(upRight[3] < -0.025, `leans up: ${upRight[3]}`)
  const downLeft = run(COMBO, true, () => [-1, -1]).at(-1)
  assert.ok(downLeft[4] > 0.04, `leans left: ${downLeft[4]}`)
  assert.ok(downLeft[3] > 0.025, `leans down: ${downLeft[3]}`)
})

test('sway off: the holder is still whatever the pointer does', () => {
  const vm = { ...COMBO, sway: false }
  const moved = run(vm, true, crossing)
  assert.deepEqual(moved, run(vm, true, centre))
  for (const p of moved) assert.deepEqual(p, moved[0])
  assert.deepEqual(moved[0].slice(3), [0, 0, 0])
})
