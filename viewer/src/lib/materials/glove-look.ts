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
  // hemi-octahedral normal (x, y) → vector; the composite flips y for its normal output.
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
