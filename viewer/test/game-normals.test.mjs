import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as THREE from 'three'
import { gameNormalScale } from '../src/lib/materials/normal-map.ts'

// The export writes the game's normal textures as plain RGB normals, green pointing up the image. three.js reads a
// normal map's green along the bitangent cross(N, T) · w, which on the exported models (every knife, glove and arm
// model, and the agents) points down the image. A knife's or an arm's own normal map read as it is has its relief
// mirrored top to bottom: a ridge lit from above is lit on its lower side.

const normalize = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l) }

/** A raised dot as the export writes it: a Gaussian bump's normal, green up the image (v down), as an RGB texel. */
function bumpTexel(u, v) {
  const s = 0.15, h = (uu, vv) => Math.exp(-(uu * uu + vv * vv) / (2 * s * s)), d = 1e-4
  const dhdu = (h(u + d, v) - h(u - d, v)) / (2 * d), dhdv = (h(u, v + d) - h(u, v - d)) / (2 * d)
  return normalize([-dhdu, dhdv, 1]).map((c) => c * 0.5 + 0.5) // up the image is −v: n.y = dh/dv
}

/**
 * three.js's normal_fragment_maps (mapN.xy *= normalScale; tbn * mapN) on a surface facing the viewer, with the
 * exported models' frame: T right, B down the screen (+v), N toward the viewer. How brightly a light from above lights
 * it. World: x right, y up.
 */
function litFromAbove(texel, scale) {
  const mapN = texel.map((c) => c * 2 - 1)
  mapN[0] *= scale.x; mapN[1] *= scale.y
  const T = [1, 0, 0], B = [0, -1, 0], N = [0, 0, 1]
  const n = normalize([0, 1, 2].map((i) => T[i] * mapN[0] + B[i] * mapN[1] + N[i] * mapN[2]))
  const light = normalize([0, 1, 1])
  return Math.max(0, n[0] * light[0] + n[1] * light[1] + n[2] * light[2])
}

const upper = [0, -0.12], lower = [0, 0.12] // (u, v) around the dot's centre: v down, so −v is its upper side

test('with the game\'s normal scale, a raised dot on a knife or an arm is lit on its upper side', () => {
  const lit = ([u, v]) => litFromAbove(bumpTexel(u, v), gameNormalScale())
  assert.ok(lit(upper) > lit(lower) + 0.2, `upper ${lit(upper).toFixed(3)}, lower ${lit(lower).toFixed(3)}`)
})

test('read as it is (three.js\'s default scale), the same dot is lit on its lower side', () => {
  const lit = ([u, v]) => litFromAbove(bumpTexel(u, v), new THREE.Vector2(1, 1))
  assert.ok(lit(lower) > lit(upper) + 0.2, `upper ${lit(upper).toFixed(3)}, lower ${lit(lower).toFixed(3)}`)
})

test('a flat texel stays flat, and left and right are kept', () => {
  const flat = [128 / 255, 128 / 255, 1] // the 1×1 stand-in for a missing normal texture (128 is 0.004 off zero)
  assert.ok(Math.abs(litFromAbove(flat, gameNormalScale()) - litFromAbove(flat, new THREE.Vector2(1, 1))) < 0.01)
  assert.equal(gameNormalScale().x, 1)
  assert.notEqual(gameNormalScale(), gameNormalScale(), 'a fresh vector for each material')
})

test('three.js still applies the scale before the frame, with the vertex bitangent', () => {
  assert.match(THREE.ShaderChunk.normal_fragment_maps, /mapN\.xy \*= normalScale;\s*normal = normalize\( tbn \* mapN \);/)
  assert.match(THREE.ShaderChunk.normal_fragment_begin, /mat3 tbn = mat3\( normalize\( vTangent \), normalize\( vBitangent \), normal \);/)
})

const source = (path) => readFileSync(new URL('../src/lib/' + path, import.meta.url), 'utf8')

test('the knives\' finishes, the models\' own materials (arms, agents) and charms read their normal maps so', () => {
  assert.match(source('materials/weapon.ts'), /normalMap: tex\.normal, normalScale: gameNormalScale\(\)/)
  assert.match(source('viewer/model-loader.ts'), /new THREE\.MeshPhysicalMaterial\(\{[^}]*normalScale: gameNormalScale\(\)/)
  assert.match(source('materials/charm.ts'), /normalMap: normal \?\? null, normalScale: gameNormalScale\(\)/)
})

test('the gloves don\'t: their resolve already writes the map for three.js\'s frame', () => {
  assert.doesNotMatch(source('materials/glove-look.ts'), /normalScale/)
})
