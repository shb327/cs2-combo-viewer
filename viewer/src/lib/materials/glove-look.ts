/**
 * How the glove compositor's outputs become the glove's look: which textures it reads as sRGB, how its output modes
 * are resolved into maps, and the material that reads them.
 */

/**
 * Whether a classic glove reads a texture as sRGB. The shader's table says so for each texture, but its classic
 * combos convert the pattern's colour from sRGB themselves when the pattern is the colour (g_nPatternMode 2 and 3:
 * Hydra Gloves | Case Hardened, Specialist Gloves | Fade and Marble Fade). Read as sRGB as well, it would be
 * converted twice: darker and more saturated (Case Hardened's pale blue and gold as deep blue and dark orange). As a
 * palette mask (modes 0 and 1) the pattern isn't converted by the shader and follows the table, as before.
 */
export function classicTextureSrgb(name: string, tableSrgb: boolean, patternMode: number): boolean {
  if (name === 'g_tPattern' && patternMode >= 2) return false
  return tableSrgb
}

/**
 * Where the glove compositor finds each normal texture's two encoded channels. The game stores its normals
 * hemi-octahedral and the compositor decodes them so: x + y - 1 and x - y from r and g, or from a and g for the newer
 * gloves' surface and substrate normals (their r and b hold other data).
 */
export const GLOVE_NORMAL_LAYOUT: Record<string, 'xy' | 'wy'> = {
  g_tNormal: 'xy', g_tDetailNormal: 'xy', g_tDamageNormal: 'xy', g_tSurfaceNormal: 'wy', g_tSubstrateNormal: 'wy',
}

/**
 * An RGB normal texel (as the export writes the game's normal textures: x, y, z, green pointing up the image) → the
 * game's two hemi-octahedral channels, which its decode turns back into the same normal. Scalar statements, written once
 * for the GLSL (and run as they are by the tests).
 */
export const HEMI_OCT_STEPS: [string, string][] = [
  ['x', 'r * 2.0 - 1.0'], ['y', 'g * 2.0 - 1.0'], ['z', 'max(b * 2.0 - 1.0, 0.0)'],
  ['l', 'max(abs(x) + abs(y) + z, 0.000001)'],
  // 128/255 is the game's zero: its decode subtracts 1.00392162 (256/255) from the sum of the two.
  ['e1', '(x + y) / l * 0.5 + 0.50196078'], ['e2', '(x - y) / l * 0.5 + 0.50196078'],
]

const HEMI_OCT_GLSL = `vec2 hemiOct(vec3 c) {
  float r = c.r, g = c.g, b = c.b;
${HEMI_OCT_STEPS.map(([name, expr]) => `  float ${name} = ${expr};`).join('\n')}
  return vec2(e1, e2);
}
vec4 normalXY(vec4 t) { return vec4(hemiOct(t.rgb), t.ba); }
vec4 normalWY(vec4 t) { vec2 e = hemiOct(t.rgb); return vec4(t.r, e.y, t.b, e.x); }
`

/**
 * The export writes the game's normal textures as plain RGB normals, but the glove compositor decodes its normal inputs
 * as the game stores them (GLOVE_NORMAL_LAYOUT). Read straight, an RGB normal comes out mirrored across a diagonal and
 * flattened: raised dots (Driver Gloves | Plum Quill's quills) lit from below, like pits. Every sample of a normal
 * texture is re-encoded to the game's layout, so the compositor's blends and decodes see what they do in the game.
 */
export function gloveNormalInputs(frag: string): string {
  const call = new RegExp(`\\b(?:texture|textureGrad|textureLod)\\((${Object.keys(GLOVE_NORMAL_LAYOUT).join('|')})\\b`, 'g')
  let out = '', from = 0
  for (let m = call.exec(frag); m; m = call.exec(frag)) {
    let depth = 0, end = m.index + m[0].length - m[1].length - 1
    for (; end < frag.length; end++) {
      if (frag[end] === '(') depth++
      else if (frag[end] === ')' && --depth === 0) break
    }
    const wrap = GLOVE_NORMAL_LAYOUT[m[1]] === 'wy' ? 'normalWY' : 'normalXY'
    out += frag.slice(from, m.index) + `${wrap}(${frag.slice(m.index, end + 1)})`
    from = end + 1
    call.lastIndex = from
  }
  if (!from) return frag
  return (out + frag.slice(from)).replace('void main()', HEMI_OCT_GLSL + '\nvoid main()')
}

/**
 * The share of the usual specular that cloth keeps. The game lights cloth with its cloth lobe instead (F_CLOTH_SHADING);
 * three.js's sheen stands in for it, darker at grazing angles, so a quarter of the specular is kept: fitted to the
 * game's pictures of Driver Gloves | Hand Sweaters (all of it: shiny like plastic) and Specialist Gloves' suede palm
 * (none: darker than in the game).
 */
export const CLOTH_SPECULAR = 0.25

/**
 * The game's outputs (one render target per F_OUTPUT_MODE) → albedo, normal map, ORM, cloth (pre-linearized values
 * undone). The cloth map holds the sheen colour (albedo where the glove is cloth) and, in its alpha, the specular
 * intensity: CLOTH_SPECULAR where the glove is cloth, 1 elsewhere.
 */
export const GLOVE_RESOLVE = `precision highp float;
uniform sampler2D uAlbedo; uniform sampler2D uNormal; uniform sampler2D uMetal; uniform sampler2D uAo;
in vec2 vUv;
layout(location = 0) out vec4 oAlbedo;
layout(location = 1) out vec4 oNormal;
layout(location = 2) out vec4 oOrm;
layout(location = 3) out vec4 oCloth;
float cv(float l) { return l <= 0.0031308 ? l * 12.92 : 1.055 * pow(l, 1.0 / 2.4) - 0.055; }
void main() {
  vec3 albedo = texture(uAlbedo, vUv).rgb;
  vec4 n = texture(uNormal, vUv);
  // hemi-octahedral normal (x, y) → vector. Its y points up the image; three.js reads green along the glove models'
  // bitangent, which points down it: y is negated.
  float a = cv(n.x) * 2.0 - 1.0, b = cv(n.y) * 2.0 - 1.0;
  vec2 p = vec2(a + b, a - b) * 0.5;
  vec3 nn = normalize(vec3(p, 1.0 - abs(p.x) - abs(p.y)));
  vec4 m = texture(uMetal, vUv);
  float cloth = clamp(cv(m.z), 0.0, 1.0);
  oAlbedo = vec4(albedo, 1.0);
  oNormal = vec4(vec3(nn.x, -nn.y, nn.z) * 0.5 + 0.5, 1.0);
  oOrm = vec4(cv(texture(uAo, vUv).x), cv(n.z), cv(m.y), 1.0);
  oCloth = vec4(albedo * cloth, 1.0 - ${(1 - CLOTH_SPECULAR).toFixed(2)} * cloth);
}`

export interface GloveMaps<T> { albedo: T; normal: T; orm: T; cloth: T }

/**
 * The MeshPhysicalMaterial's parameters over the resolved maps. Where the compositor's cloth output says the glove
 * is fabric, the game's cloth shading lights it with the cloth lobe instead of the usual specular one: here the
 * sheen, with the specular intensity cut to CLOTH_SPECULAR (the cloth map's alpha). The full specular on top of the
 * sheen made knit look like plastic (Driver Gloves | Hand Sweaters). Leather, rubber and metal parts (cloth 0) keep it.
 */
export function gloveMaterialParameters<T>(maps: GloveMaps<T>, sheenScale: number) {
  return {
    map: maps.albedo, normalMap: maps.normal, aoMap: maps.orm, roughnessMap: maps.orm, metalnessMap: maps.orm, roughness: 1, metalness: 1,
    sheen: 1, sheenColor: Math.min(1, sheenScale * 0.5), sheenColorMap: maps.cloth, sheenRoughness: 0.6,
    specularIntensityMap: maps.cloth,
  }
}

/**
 * A newer glove's g_fWearProgress (and g_flWearAmount) for a float: the float as it is. The shader's own expression
 * (SrgbLinearToGamma) encodes it: 0.15, 0.37 and 0.6 reach the composite as 0.42, 0.64 and 0.79, as skinshotter's
 * composites of Brocade Flowers show. Encoded here as well, the wear doubled near factory new (0.06 drawn at 0.56).
 */
export const gloveV2WearParam = (float: number): number => Math.max(0, float)
