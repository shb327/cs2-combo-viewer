import type { WeaponItem } from '@/lib/materials/weapon'

/**
 * Debug views: each is a GLSL expression shown as grayscale (or rgb for the vec3 ones). 1–7 for every
 * style, 8–17 for the airbrush, 18–20 for the bare weapon.
 */
export const DEBUG_VIEWS: Record<number, string> = {
  1: 'kept paint', 2: 'paint toughness', 3: 'wear texture', 4: 'painted mask', 5: 'ao input R', 6: 'ao input G', 7: 'ao input B',
  8: 'pos length', 9: 'pos height', 10: 'top plane weight', 11: 'front plane weight',
  12: 'normal |x|', 13: 'normal |y|', 14: 'normal |z|', 15: 'pos thickness', 16: 'length in 0.1 bands', 17: 'height in 0.1 bands',
  18: 'base color', 19: 'rough texture R (roughness)', 20: 'rough texture G (metalness)', 21: 'ao input A (extra wear)',
  22: 'paint color', 23: 'masks input RGB', 24: 'final metalness', 25: 'final roughness', 26: 'pattern RGB (UV styles)', 27: 'pattern alpha',
}
export const DEBUG_EXPR: Record<number, string> = {
  1: 'kept', 2: 'tough', 3: 'wearTex', 4: 'painted', 5: 'aoIn.r', 6: 'aoIn.g', 7: 'aoIn.b', 21: 'aoIn.a',
}
export const AIRBRUSH_DEBUG_EXPR: Record<number, string> = {
  8: 'posIn.y', 9: 'posIn.z', 10: 'topW', 11: 'frontW', 12: 'abs(nrm.x)', 13: 'abs(nrm.y)', 14: 'abs(nrm.z)', 15: 'posIn.x',
  16: 'step(0.5, fract(posIn.y * 10.0)) * 0.6 + posIn.y * 0.4', 17: 'step(0.5, fract(posIn.z * 10.0)) * 0.6 + posIn.z * 0.4',
}

/**
 * Custom paint — the game's own formula (csgo_customweapon pixel shader, S_PAINT_STYLE 6, decompiled
 * from csgo_core/shaders_vulkan_dir.vpk; see 3dviewer.md):
 *   k    = smoothstep(0, 0.5, a)                      paint alpha < 0.5 → tougher, 0 → never wears
 *   X    = ((ao.a + wear · ao.r) · (float·6 + 1) + smoothstep(0.5,0.6,a)·smoothstep(1,0.9,a)) · k
 *   worn = smoothstep(0.58 − s, 0.68 + s, X)          s = g_fWearSoftness · k; alpha ~0.6–0.9 → no paint
 *   color = paint · mix(1, grunge, (1−ao.r)⁴·0.25 + 0.75·float), pulled toward PBR albedo levels by the
 *           float (g_vPaintAlbedoLevels = (0.045, −log2(0.4), 1); metallic paint (0.08, …)), then the
 *           bare weapon where worn.
 *   rough = g_flPaintRoughness + (1 − grunge.a)·float²·0.5, the bare weapon's where worn.
 */
/** A style not ported yet: nothing painted (the bare weapon). */
const BARE_GLSL = `
  vec3 paintCol = vec3(0.0);
  float painted = 0.0, kept = 0.0, tough = 0.0, metallicPaint = 0.0, paintRough = 0.5;`

const CUSTOM_GLSL = `
  vec4 paint = xfTex(uPaint, vPaintUv, uPatX0, uPatX1);
  float pa = paint.a;
  float k = smoothstep(0.0, 0.5, pa);
  float soft = uWearSoftness * k;
  float X = ((aoIn.a + wearTex * aoIn.r) * (uWearAmount * 6.0 + 1.0) + smoothstep(0.5, 0.6, pa) * smoothstep(1.0, 0.9, pa)) * k;
  float worn = smoothstep(0.58 - soft, 0.68 + soft, X);
  vec3 pcol = clamp(paint.rgb * uBrightness, 0.0, 1.0);
  vec3 c = pcol * mix(vec3(1.0), grunge.rgb, pow(1.0 - aoIn.r, 4.0) * 0.25 + 0.75 * uWearAmount);
  vec3 L = mix(vec3(0.045, 1.321928, 1.0), vec3(0.08, 1.321928, 1.0), uPaintMetalness);
  vec3 cn = normalize(max(vec3(0.0003), c));
  float lvl = mix(min(L.x, dot(pcol, vec3(0.2125, 0.7154, 0.0721))), L.z, clamp(pow(max(c.r, max(c.g, c.b)), L.y), 0.0, 1.0));
  vec3 paintCol = mix(c, cn * lvl / max(cn.r, max(cn.g, cn.b)), uWearAmount);
  float painted = 1.0;
  float kept = 1.0 - worn;
  float tough = 1.0 - k;
  float metallicPaint = uPaintMetalness;
  float paintRough = min(1.0, uPaintRough + (1.0 - grunge.a) * uWearAmount * uWearAmount * 0.5);`

/**
 * The anodized styles' shared end (csgo_customweapon S_PAINT_STYLE 4 and 5): needs pat, m (masks), worn, bare,
 * chrome, pc (the color blend), baseRoughPaint and dur. Color × brightness twice (clamped each time), chrome
 * underlayer (0.38, 0.37, 0.35) where worn anodizing starts, grunge, metallic albedo levels by the float
 * (luminance of the color before grunge); metal = masks.R; roughness → 0.35 on chrome, + grunge.
 */
const ANODIZED_TAIL_GLSL = `
  float b = mix(uBrightness, 1.0, chrome);
  vec3 c0 = clamp(clamp(mix(mix(baseCol.rgb, pc, m.r), vec3(0.38, 0.37, 0.35), chrome) * b, 0.0, 1.0) * b, 0.0, 1.0);
  vec3 gm = mix(vec3(1.0), grunge.rgb, pow(1.0 - aoIn.r, 4.0) * 0.25 + 0.75 * uWearAmount);
  vec3 c = c0 * mix(gm, vec3(1.0), chrome);
  vec3 cn = normalize(max(vec3(0.0003), c));
  float lvl = mix(min(0.08, dot(c0, vec3(0.2125, 0.7154, 0.0721))), 1.0, clamp(pow(max(c.r, max(c.g, c.b)), 1.321928), 0.0, 1.0));
  vec3 paintCol = mix(c, cn * lvl / max(cn.r, max(cn.g, cn.b)), uWearAmount);
  float painted = 1.0;
  float kept = 1.0 - bare;
  float tough = 1.0 - dur;
  float metallicPaint = m.r;
  float paintRough = min(1.0, mix(mix(baseRoughPaint, uPaintRough, max(max(m.g, m.b), bare)), 0.35, chrome)
    + (1.0 - dot(gm, vec3(0.2125, 0.7154, 0.0721))) * 0.2);`

/**
 * Anodized airbrush — the game's formula (csgo_customweapon, S_PAINT_STYLE 5):
 *  - pattern projected from the weapon's position (g_tPosition × 2): the side plane (length, height),
 *    blended toward the front (thickness, height) by g_vSprayBiasBlend.y·|n.y|⁷ and the top (length,
 *    thickness) by .z·|n.z|⁷, n = the g_tSurface normal. Placement: patternXform (the shader's own
 *    parameter expression), clamped along the length;
 *  - masks: R = where the finish goes, G / B = solid color2 / color3 areas;
 *  - wear like custom paint, scaled by the per-color durability; worn anodizing shows chrome first
 *    (0.38, 0.37, 0.35), then the bare weapon;
 *  - color × brightness twice (clamped each time), grunge, pulled toward metallic albedo levels by the float;
 *    metallic where masks.R; roughness → 0.35 on chrome, + grunge.
 */
const AIRBRUSH_GLSL = `
  vec3 posIn = texture2D(uPos, cuv).xyz;
  vec3 p = posIn * 2.0;
  vec3 nrm = normalize(texture2D(uSurface, cuv).xyz * 2.0 - 1.0);
  vec2 uvSide = xf(p.yz, uPatX0, uPatX1), uvFront = xf(p.xz, uPatX0, uPatX1), uvTop = xf(p.yx, uPatX0, uPatX1);
  uvSide.x = clamp(uvSide.x, 0.002, 0.998); uvTop.x = clamp(uvTop.x, 0.002, 0.998);
  float frontW = uSprayBias.y * pow(abs(nrm.y), 7.0), topW = uSprayBias.z * pow(abs(nrm.z), 7.0);
  vec4 pat = mix(mix(texture2D(uPaint, uvSide), texture2D(uPaint, uvFront), frontW), texture2D(uPaint, uvTop), topW);
  vec4 m = texture2D(uMasks, cuv);
  float dur = mix(mix(mix(mix(mix(uDurability.x, uDurability.y, pat.r), uDurability.z, pat.g), uDurability.w, pat.b), uDurability.z, m.g), uDurability.w, m.b);
  float soft = uWearSoftness * dur;
  float worn = smoothstep(0.58 - soft, 0.68 + soft, (aoIn.a + wearTex * aoIn.r) * (uWearAmount * 6.0 + 1.0) * dur);
  float bare = max(1.0 - m.r, worn);
  float chrome = smoothstep(0.0, 0.01, worn) * (1.0 - smoothstep(0.5, 0.6, pat.a) * smoothstep(1.0, 0.9, pat.a)) * m.r;
  vec3 pc = mix(mix(mix(mix(mix(uColors[0], uColors[1], pat.r), uColors[2], pat.g), uColors[3], pat.b), uColors[2], m.g), uColors[3], m.b);
  float baseRoughPaint = uPaintRough;
  ${ANODIZED_TAIL_GLSL}`

/**
 * Anodized multicolor (Doppler etc.) — the game's formula (csgo_customweapon, S_PAINT_STYLE 4): the pattern
 * through the model's UVs; its RGB picks colors 1–3 inside masks.R (masks G / B force colors 2 / 3); its alpha
 * band 0.5–1 wears at once, below 0.5 sets the roughness ((1 − 2a)²·0.85 + 0.15); wear like custom paint
 * scaled by the per-color durability; then the shared anodized end.
 */
const MULTI_GLSL = `
  vec4 pat = xfTex(uPaint, vPaintUv, uPatX0, uPatX1);
  vec4 m = texture2D(uMasks, cuv);
  float band = smoothstep(0.5, 0.6, pat.a) * smoothstep(1.0, 0.9, pat.a);
  float dur = mix(mix(mix(mix(mix(uDurability.x, uDurability.y, pat.r), uDurability.z, pat.g), uDurability.w, pat.b), uDurability.z, m.g), uDurability.w, m.b);
  float soft = uWearSoftness * dur;
  float worn = smoothstep(0.58 - soft, 0.68 + soft, ((aoIn.a + wearTex * aoIn.r) * (uWearAmount * 6.0 + 1.0) + band) * dur);
  float bare = max(1.0 - m.r, worn);
  float chrome = smoothstep(0.0, 0.01, worn) * (1.0 - band) * m.r;
  vec3 pc = mix(mix(mix(mix(mix(uColors[0], uColors[1], pat.r * m.r), uColors[2], pat.g * m.r), uColors[3], pat.b * m.r), uColors[2], m.g), uColors[3], m.b);
  float q = 1.0 - min(1.0, pat.a * 2.0);
  float baseRoughPaint = pat.a >= 0.5 ? uPaintRough : q * q * 0.85 + 0.15;
  ${ANODIZED_TAIL_GLSL}`

/**
 * Shared by the styles below (csgo_customweapon's own code, decompiled combos): Rec.709 luminance; the dirt
 * gm = mix(1, grunge, (1 − ao)⁴·0.25 + 0.75·float); the float pulling the color toward PBR albedo levels
 * (g_vPaintAlbedoLevels (0.045, −log2 0.4, 1) or the metallic (0.08, …)); the band of pattern alpha 0.5–1 that
 * wears at once; the per-color mixes; and the layered wear of hydro / spray (color 3 goes first, then 2, then 1).
 */
export const PAINT_HELPERS_GLSL = `
  const vec3 PAINT_LEVELS = vec3(0.045, 1.3219327, 1.0);
  const vec3 METAL_LEVELS = vec3(0.08, 1.3219327, 1.0);
  float luma(vec3 c) { return dot(c, vec3(0.2125, 0.7154, 0.0721)); }
  float maxc(vec3 c) { return max(c.r, max(c.g, c.b)); }
  vec3 albedoLevels(vec3 c, vec3 lumaOf, vec3 L) {
    vec3 cn = normalize(max(vec3(0.0003), c));
    float lvl = mix(min(L.x, luma(lumaOf)), L.z, clamp(pow(maxc(c), L.y), 0.0, 1.0));
    return mix(c, cn * lvl / maxc(cn), uWearAmount);
  }
  float bandOf(float a) { return smoothstep(0.5, 0.6, a) * smoothstep(1.0, 0.9, a); }
  float mix4(vec4 v, vec3 w) { return mix(mix(mix(v.x, v.y, w.x), v.z, w.y), v.w, w.z); }
  vec3 mixColors(vec3 w) { return mix(mix(mix(uColors[0], uColors[1], w.x), uColors[2], w.y), uColors[3], w.z); }
  vec3 layeredWear(vec3 rgb, float X, float s) {
    float t1 = 0.56 - 0.06 * uWearAmount, t2 = 0.54 - 0.12 * uWearAmount, t3 = 0.52 - 0.18 * uWearAmount;
    return rgb * vec3(smoothstep(0.58 + s, t1 - s, X), smoothstep(t1 + s, t2 - s, X), smoothstep(t2 + s, t3 - s, X));
  }
  // Patina / gunsmith: exposed highlights (edges rubbed through) and cavities (dirt, darker).
  float rubbed(vec4 ao, float wearTex) { return smoothstep(0.1, 0.2, wearTex * ao.g * ao.r * ao.r * uWearAmount); }
  float cavityOf(vec4 ao, vec4 grunge) {
    return smoothstep(0.0, 0.15, clamp(ao.r * ao.g - uWearAmount * 0.1, 0.0, 1.0) - clamp(grunge.r * grunge.g * grunge.b, 0.0, 1.0) * 0.23 + 0.08);
  }
  // Spray paint: the position input is blurred with 17 taps.
  const vec2 SPRAY_TAPS[17] = vec2[](vec2(-0.00107234, -0.00400203), vec2(0.00195312, -0.00338291), vec2(0.00400203, -0.00107234),
    vec2(-0.000714896, -0.00266802), vec2(0.000976565, -0.00169146), vec2(0.00266802, -0.000714896), vec2(-0.00338291, -0.00195312),
    vec2(-0.00169146, -0.000976565), vec2(0.0), vec2(0.00169146, 0.000976565), vec2(0.00338291, 0.00195312), vec2(-0.00266802, 0.000714896),
    vec2(-0.000976565, 0.00169146), vec2(0.000714896, 0.00266802), vec2(-0.00400203, 0.00107234), vec2(-0.00195312, 0.00338291),
    vec2(0.00107234, 0.00400202));`

/** Wear through the weapon's AO (exposed parts first; ao.a adds wear per area), × durability. */
const WEAR_X = '(aoIn.a + wearTex * aoIn.r) * (uWearAmount * 6.0 + 1.0)'
const GRUNGE_MIX = 'vec4 gm = mix(vec4(1.0), grunge, pow(1.0 - aoIn.r, 4.0) * 0.25 + 0.75 * uWearAmount);'

/** Solid color (S_PAINT_STYLE 0): masks R / G / B pick colors 1 / 2 / 3 over color 0, per-color durability, metalness, roughness. */
const SOLID_GLSL = `
  vec4 m = texture2D(uMasks, cuv);
  float dur = mix4(uDurability, m.rgb);
  float soft = uWearSoftness * dur;
  float worn = smoothstep(0.58 - soft, 0.68 + soft, ${WEAR_X} * dur);
  ${GRUNGE_MIX}
  float metallicPaint = mix4(uMetal4, m.rgb);
  vec3 col = mixColors(m.rgb);
  vec3 paintCol = albedoLevels(col * gm.rgb, col, mix(PAINT_LEVELS, METAL_LEVELS, metallicPaint));
  float R = uRoughPerColor > 0.5 ? mix4(uRough4, m.rgb) : uPaintRough;
  float paintRough = min(1.0, R + (1.0 - gm.a) * uWearAmount * uWearAmount * 0.5);
  float painted = 1.0, kept = 1.0 - worn, tough = 1.0 - dur;`

/**
 * Hydrographic (S_PAINT_STYLE 1): the pattern through the UVs, its RGB picks colors 1–3 (masks G / B force 2 / 3);
 * layered wear; color × brightness except where worn to the chrome / in the alpha band.
 */
const HYDRO_GLSL = `
  vec4 pat = xfTex(uPaint, vPaintUv, uPatX0, uPatX1);
  vec4 m = texture2D(uMasks, cuv);
  float band = bandOf(pat.a);
  float dur = mix(mix(mix4(uDurability, pat.rgb), uDurability.z, m.g), uDurability.w, m.b);
  float X = (${WEAR_X} + band) * max(clamp(m.g + m.b, 0.0, 1.0), smoothstep(0.0, 0.5, pat.a)) * dur;
  float soft = uWearSoftness * dur;
  vec3 ch = layeredWear(pat.rgb, X, soft);
  float worn = smoothstep(0.58 - soft, 0.68 + soft, X);
  ${GRUNGE_MIX}
  float metallicPaint = mix(mix(mix4(uMetal4, ch), uMetal4.z, m.g), uMetal4.w, m.b);
  float R = uRoughPerColor > 0.5 ? mix(mix(mix4(uRough4, ch), uRough4.z, m.g), uRough4.w, m.b) : uPaintRough;
  vec3 col = clamp(mix(mix(mixColors(ch), uColors[2], m.g), uColors[3], m.b) * mix(uBrightness, 1.0, smoothstep(0.0, 0.01, worn) * (1.0 - band)), 0.0, 1.0);
  vec3 paintCol = albedoLevels(col * gm.rgb, col, mix(PAINT_LEVELS, METAL_LEVELS, metallicPaint));
  float paintRough = min(1.0, R + (1.0 - gm.a) * uWearAmount * uWearAmount * 0.5);
  float painted = 1.0, kept = 1.0 - worn, tough = 1.0 - dur;`

/**
 * Spray paint (S_PAINT_STYLE 2): the pattern projected from the weapon's position (blurred, × 2) on three planes
 * blended by the surface normal (g_vSprayBiasBlend), like the airbrush; then hydro's colors and layered wear
 * without the masks. (The halftone variant, F_SPRAYPAINT_HALFTONE, isn't ported.)
 */
const SPRAY_GLSL = `
  vec3 posIn = vec3(0.0);
  for (int i = 0; i < 17; i++) posIn += texture2D(uPos, cuv + SPRAY_TAPS[i] * 0.2).xyz * 0.05882353;
  vec3 p = posIn * 2.0;
  vec3 nrm = normalize(texture2D(uSurface, cuv).xyz * 2.0 - 1.0);
  float frontW = uSprayBias.y * pow(abs(nrm.y), 7.0), topW = uSprayBias.z * pow(abs(nrm.z), 7.0);
  vec4 pat = mix(mix(texture2D(uPaint, xf(p.yz, uPatX0, uPatX1)), texture2D(uPaint, xf(p.xz, uPatX0, uPatX1)), frontW),
                 texture2D(uPaint, xf(p.yx, uPatX0, uPatX1)), topW);
  float dur = mix4(uDurability, pat.rgb);
  float X = ${WEAR_X} * dur;
  float soft = uWearSoftness * dur;
  vec3 ch = layeredWear(pat.rgb, X, soft);
  float worn = smoothstep(0.58 - soft, 0.68 + soft, X);
  ${GRUNGE_MIX}
  float metallicPaint = mix4(uMetal4, ch);
  float R = uRoughPerColor > 0.5 ? mix4(uRough4, ch) : uPaintRough;
  vec3 col = clamp(mixColors(ch) * mix(uBrightness, 1.0, smoothstep(0.0, 0.01, worn) * (1.0 - bandOf(pat.a))), 0.0, 1.0);
  vec3 paintCol = albedoLevels(col * gm.rgb, col, mix(PAINT_LEVELS, METAL_LEVELS, metallicPaint));
  float paintRough = min(1.0, R + (1.0 - gm.a) * uWearAmount * uWearAmount * 0.5);
  float painted = 1.0, kept = 1.0 - worn, tough = 1.0 - dur;`

/**
 * Anodized (S_PAINT_STYLE 3): color 0 on masks.R (the weapon's color elsewhere), × brightness twice (clamped);
 * worn anodizing shows chrome (0.38, 0.37, 0.35) first, then the bare weapon; metallic albedo levels; metal = masks.R.
 */
const ANODIZED_GLSL = `
  vec4 m = texture2D(uMasks, cuv);
  float worn = smoothstep(0.58 - uWearSoftness, 0.68 + uWearSoftness, ${WEAR_X});
  float bare = max(1.0 - m.r, worn);
  float chrome = smoothstep(0.0, 0.01, worn) * m.r;
  ${GRUNGE_MIX}
  float b = mix(uBrightness, 1.0, chrome);
  vec3 c0 = clamp(clamp(mix(mix(baseCol.rgb, uColors[0], m.r), vec3(0.38, 0.37, 0.35), chrome) * b, 0.0, 1.0) * b, 0.0, 1.0);
  vec3 paintCol = albedoLevels(c0 * mix(gm.rgb, vec3(1.0), chrome), c0, METAL_LEVELS);
  float metallicPaint = m.r;
  float paintRough = min(1.0, mix(uPaintRough, 0.35, chrome) + (1.0 - luma(gm.rgb)) * 0.2);
  float painted = 1.0, kept = 1.0 - bare, tough = 0.0;`

/**
 * Patina (S_PAINT_STYLE 7, e.g. Case Hardened): on masks.R only (the bare weapon elsewhere, it never wears off):
 * pattern × a color that ages with the float (color 1 → 3 by √float in the open, → 2 in the cavities), color 0 where
 * edges are rubbed through; metallic, less so in the dirty cavities as the float rises.
 */
const PATINA_GLSL = `
  vec4 pat = xfTex(uPaint, vPaintUv, uPatX0, uPatX1);
  vec4 m = texture2D(uMasks, cuv);
  ${GRUNGE_MIX}
  float hi = rubbed(aoIn, wearTex), cav = cavityOf(aoIn, grunge);
  vec3 P = mix(pat.rgb, pat.rgb * uBrightness, max(m.r, uColorAdj));
  vec3 col = mix(mix(mix(uColors[1], uColors[3], vec3(sqrt(uWearAmount))), mix(uColors[1], uColors[2], vec3(uWearAmount)), cav) * P,
                 uColors[0] * luma(P), hi) * gm.rgb;
  vec3 paintCol = albedoLevels(col, P * uColors[1], METAL_LEVELS);
  float lg = luma(gm.rgb), w1 = (1.0 - gm.a) * uWearAmount;
  float paintRough = clamp(uPaintRough * mix(1.0, 0.9, hi) + (1.0 - lg) * uWearAmount * 0.05 + (1.0 - cav) * 0.15 * uWearAmount + w1 * 0.15, 0.0, 1.0);
  float metallicPaint = mix(mix(1.0, sqrt(cav * gm.a * lg), uWearAmount), 1.0, hi);
  float painted = 1.0, kept = m.r, tough = 0.0;
  gRoughOv = mix(baseRough, mix(min(1.0, paintRough + w1 * uWearAmount * 0.5), paintRough, m.r), step(aoIn.a, 0.996) * m.r);`

/**
 * Gunsmith (S_PAINT_STYLE 8): custom paint (pattern, its alpha = toughness / roughness) with a patina-like metal
 * area on masks.R (pattern × the aging colors; it never wears to the bare weapon, its wear drives the roughness).
 */
const GUNSMITH_GLSL = `
  vec4 pat = xfTex(uPaint, vPaintUv, uPatX0, uPatX1);
  vec4 m = texture2D(uMasks, cuv);
  float mr = m.r;
  float k = smoothstep(0.0, 0.5, pat.a);
  float X = ((min(aoIn.a, 1.0 - mr) + wearTex * aoIn.r) * (uWearAmount * 6.0 + 1.0) + bandOf(pat.a)) * k;
  float soft = uWearSoftness * k;
  bool metalArea = mr > 0.99;
  float worn = metalArea ? X : smoothstep(0.58 - soft, 0.68 + soft, X);
  ${GRUNGE_MIX}
  float hi = rubbed(aoIn, wearTex), cav = cavityOf(aoIn, grunge);
  vec3 P = mix(pat.rgb, pat.rgb * uBrightness, max(mr, uColorAdj));
  vec3 metalCol = mix(mix(mix(uColors[1], uColors[3], vec3(sqrt(uWearAmount))), mix(uColors[1], uColors[2], vec3(uWearAmount)), cav) * P,
                      uColors[0] * luma(P), hi);
  vec3 paintCol = albedoLevels(mix(P, metalCol, mr) * gm.rgb, mix(P, P * uColors[1], mr), mix(PAINT_LEVELS, METAL_LEVELS, mix(uPaintMetalness, 1.0, mr)));
  float lg = luma(gm.rgb), w1 = (1.0 - gm.a) * uWearAmount, q = 1.0 - min(1.0, pat.a * 2.0);
  float paintRough = clamp(mix(uPaintRough, pat.a >= 0.5 ? uPaintRough : q * q * 0.85 + 0.15, mr) * mix(1.0, 0.9, hi)
    + (1.0 - lg) * uWearAmount * 0.05 + (1.0 - cav) * 0.15 * uWearAmount + w1 * 0.15, 0.0, 1.0);
  float metallicPaint = mix(mix(1.0, sqrt(cav * gm.a * lg), uWearAmount), 1.0, hi);
  float painted = 1.0, kept = 1.0 - clamp(worn, 0.0, 1.0) * (1.0 - mr), tough = 1.0 - k;
  gRoughOv = mix(baseRough, mix(min(1.0, paintRough + w1 * uWearAmount * 0.5), paintRough, mr), metalArea ? 1.0 : max(0.0, 1.0 - worn));
  gMetalOv = mix(mix(uPaintMetalness, baseMetal, clamp(worn, 0.0, 1.0)), metallicPaint, mr);`

/**
 * The game's composite: color and roughness / metalness (pre-linearized in the composite) through the model's UVs.
 * The game stores it in an 8-bit texture (saturated, NaN → 0); our half-float targets keep NaN and out-of-range values
 * (heavy wear on some kits, e.g. Aphrodite), which the maps' bloom then spreads over the whole frame: saturate them.
 */
const COMPOSITE_GLSL = `
  vec4 compC = texture2D(uCompColor, vMapUv);
  vec4 compR = texture2D(uCompRough, vMapUv);
  // NaN by its bits, not isnan(): the D3D compiler (ANGLE on Windows) may assume there are none and drop the test.
  compC = clamp(mix(compC, vec4(0.0), vec4(greaterThan(floatBitsToUint(compC) & uvec4(0x7fffffffu), uvec4(0x7f800000u)))), 0.0, 1.0);
  compR = clamp(mix(compR, vec4(0.0), vec4(greaterThan(floatBitsToUint(compR) & uvec4(0x7fffffffu), uvec4(0x7f800000u)))), 0.0, 1.0);
  vec3 paintCol = compC.rgb;
  float painted = 1.0, kept = 1.0, tough = 0.0;
  float metallicPaint = compositeValue(compR.y);
  gPearlMask = compositeValue(compR.z);
  float paintRough = compositeValue(compR.x);`

export const STYLE_GLSL: Record<WeaponItem['style'], string> = {
  composite: COMPOSITE_GLSL, custom: CUSTOM_GLSL, airbrush: AIRBRUSH_GLSL, multi: MULTI_GLSL, bare: BARE_GLSL,
  solid: SOLID_GLSL, hydro: HYDRO_GLSL, spray: SPRAY_GLSL, anodized: ANODIZED_GLSL, patina: PATINA_GLSL, gunsmith: GUNSMITH_GLSL,
}
