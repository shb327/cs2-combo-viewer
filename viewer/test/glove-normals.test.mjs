import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GLOVE_NORMAL_LAYOUT, GLOVE_RESOLVE, HEMI_OCT_STEPS, gloveNormalInputs } from '../src/lib/materials/glove-look.ts'

// The export writes the game's normal textures as plain RGB normals (x, y, z, green pointing up the image), but the
// glove compositor decodes each of its normal inputs as hemi-octahedral, the way the game stores them: x + y - 1 and
// x - y from two channels (r and g; a and g for the newer gloves' surface and substrate normals). Read straight, an RGB
// normal comes out mirrored across a diagonal, so a raised dot lit from above is lit from below: a pit.

/** The shipped encoding (HEMI_OCT_STEPS, also the GLSL), run here: an RGB texel → the game's two channels. */
const hemiOct = new Function('r', 'g', 'b', 'abs', 'max',
  HEMI_OCT_STEPS.map(([name, expr]) => `const ${name} = ${expr};`).join('\n') + '\nreturn [e1, e2];')
const encode = ([r, g, b]) => hemiOct(r, g, b, Math.abs, Math.max)

/** The game's decode of its two channels (csgo_customglove: (e1 + e2) - 1.00392162, e1 - e2, 1 - |x| - |y|). */
function gameDecode(e1, e2) {
  const x = e1 + e2 - 1.00392162799835205078125, y = e1 - e2
  return normalize([x, y, 1 - Math.abs(x) - Math.abs(y)])
}
const normalize = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l) }

/** A raised dot as the export writes it: a Gaussian bump's normal, green up the image (v down), as an RGB texel. */
function bumpTexel(u, v) {
  const s = 0.15, h = (uu, vv) => Math.exp(-(uu * uu + vv * vv) / (2 * s * s)), d = 1e-4
  const dhdu = (h(u + d, v) - h(u - d, v)) / (2 * d), dhdv = (h(u, v + d) - h(u, v - d)) / (2 * d)
  const n = normalize([-dhdu, dhdv, 1]) // up the image is −v: n.y = −dh/d(up) = dh/dv
  return n.map((c) => c * 0.5 + 0.5)
}

/**
 * How brightly a point of the dot is lit by a light from above, through the viewer's chain: the compositor's normal (in
 * its own frame: x along u, y up the image), the resolve (GLOVE_RESOLVE writes y negated), then three.js, which reads
 * the map's green along its bitangent cross(N, T) · w: along +v (down the image) on the glove models, whose tangents
 * all have that handedness. Screen: u right, v down, the surface facing the viewer.
 */
function litFromAbove(compositorNormal) {
  const [x, y, z] = compositorNormal
  const mapN = [x, -y, z] // the resolve
  const world = [mapN[0], -mapN[1], mapN[2]] // T = right, B = down the screen, N = toward the viewer; world y up
  const light = normalize([0, 1, 1])
  return Math.max(0, world[0] * light[0] + world[1] * light[1] + world[2] * light[2])
}

const upper = [0, -0.12], lower = [0, 0.12] // (u, v) around the dot's centre: v down, so −v is its upper side

test('a raised dot is lit on its upper side by a light from above (the export re-encoded for the compositor)', () => {
  const lit = ([u, v]) => litFromAbove(gameDecode(...encode(bumpTexel(u, v))))
  assert.ok(lit(upper) > lit(lower) + 0.2, `upper ${lit(upper).toFixed(3)}, lower ${lit(lower).toFixed(3)}`)
})

test('read straight, as before, the same dot was lit on its lower side: a pit', () => {
  const lit = ([u, v]) => { const [r, g] = bumpTexel(u, v); return litFromAbove(gameDecode(r, g)) }
  assert.ok(lit(lower) > lit(upper), `upper ${lit(upper).toFixed(3)}, lower ${lit(lower).toFixed(3)}`)
})

test('the encoding gives back the export\'s normal through the game\'s decode', () => {
  for (const n of [[0, 0, 1], [0.6, 0, 0.8], [0, -0.6, 0.8], [0.3, 0.4, 0.866], [-0.5, 0.5, 0.707]]) {
    const back = gameDecode(...encode(normalize(n).map((c) => c * 0.5 + 0.5)))
    normalize(n).forEach((c, i) => assert.ok(Math.abs(back[i] - c) < 1e-6, `${n} → ${back}`))
  }
  // A flat texel (the 1×1 stand-in for a missing normal texture, 128 128 255) stays flat.
  const flat = gameDecode(...encode([128 / 255, 128 / 255, 1]))
  assert.ok(flat[2] > 0.9999, `${flat}`)
})

test('the resolve still turns the compositor\'s y (up the image) into three.js\'s (down the image)', () => {
  assert.match(GLOVE_RESOLVE, /oNormal = vec4\(vec3\(nn\.x, -nn\.y, nn\.z\)/)
})

// The converted compositor shaders (cg_<id>.frag.glsl, from the game: not in the repository) read their normals so:
const SNIPPET = `uniform highp sampler2D g_tNormal;
uniform highp sampler2DArray g_tDetailNormal;
uniform highp sampler2DArray g_tSurfaceNormal;
uniform highp sampler2DArray g_tSubstrateNormal;
uniform highp sampler2D g_tPattern;
void main()
{
    vec4 _19372 = texture(g_tNormal, vIn0.xy);
    vec4 _19341 = texture(g_tDetailNormal, vec3(_22630, 0.0));
    _13136 = textureGrad(g_tSurfaceNormal, vec3(vIn2.xy, 0.0), (_7272 * g_fPuffyPaintNormalSoftness).xy, (_24870 * g_fPuffyPaintNormalSoftness).xy).wy * _9306;
    _13189 = textureGrad(g_tSubstrateNormal, vec3(vIn2.xy, 0.0), _7272, _24870).xyzw * _9306;
    vec4 _4 = texture(g_tPattern, vIn1.xy);
}`

test('every normal the compositor samples goes through the encoding, in its texture\'s layout', () => {
  const out = gloveNormalInputs(SNIPPET)
  assert.ok(out.includes('vec4 _19372 = normalXY(texture(g_tNormal, vIn0.xy));'))
  assert.ok(out.includes('vec4 _19341 = normalXY(texture(g_tDetailNormal, vec3(_22630, 0.0)));'))
  assert.ok(out.includes('_13136 = normalWY(textureGrad(g_tSurfaceNormal, vec3(vIn2.xy, 0.0), (_7272 * g_fPuffyPaintNormalSoftness).xy, (_24870 * g_fPuffyPaintNormalSoftness).xy)).wy * _9306;'))
  assert.ok(out.includes('_13189 = normalWY(textureGrad(g_tSubstrateNormal, vec3(vIn2.xy, 0.0), _7272, _24870)).xyzw * _9306;'))
  assert.ok(out.includes('vec4 _4 = texture(g_tPattern, vIn1.xy);'), 'other textures are read as before')
  assert.ok(out.indexOf('vec4 normalXY(vec4 t)') < out.indexOf('void main()'), 'the helpers come before main')
  assert.equal(gloveNormalInputs('void main() { vec4 a = texture(g_tPattern, uv); }'), 'void main() { vec4 a = texture(g_tPattern, uv); }')
})

test('the layouts follow the game\'s decodes: r and g, or a and g for the newer gloves\' surfaces and substrates', () => {
  assert.deepEqual(GLOVE_NORMAL_LAYOUT, {
    g_tNormal: 'xy', g_tDetailNormal: 'xy', g_tDamageNormal: 'xy', g_tSurfaceNormal: 'wy', g_tSubstrateNormal: 'wy',
  })
})
