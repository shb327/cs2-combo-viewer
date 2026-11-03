import * as THREE from 'three'
import { CHARM_PATTERN_MAX, type CharmMaterial } from '@/lib/data/attachments'
import type { TextureSource } from '@/lib/viewer/textures'
import { STICKER_GLSL, setStickerUniforms, stickerUniforms, type StickerDef, type StickerTextures } from '@/lib/materials/sticker'

export interface CharmPart {
  material: THREE.MeshPhysicalMaterial
  /** The charm's pattern (0–100000): drives the material's dynamic parameters. */
  setSeed: (seed: number) => void
  /** Called with each mesh drawn with this material. */
  attach?: (mesh: THREE.Mesh) => void
  /** Materials with F_STICKERS (the sticker slab): the sticker shown, or none. */
  setSticker?: (s: { def: StickerDef; textures: StickerTextures } | null) => void
}

const num = (v: string | undefined, d: number) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v))
const vec = (v: string | undefined, d: number[]) => {
  const xs = (v ?? '').replace(/[[\]]/g, ' ').trim().split(/\s+/).filter(Boolean).map(Number)
  return xs.length ? xs : d
}

/** VFX helpers the charms' dynamic expressions use. */
const EXPR_FUNCS = {
  lerp: (a: number, b: number, t: number) => a + (b - a) * t,
  frac: (x: number) => x - Math.floor(x),
  pow: Math.pow, abs: Math.abs, sin: Math.sin, cos: Math.cos, min: Math.min, max: Math.max, sqrt: Math.sqrt,
  clamp: (x: number, a: number, b: number) => Math.min(b, Math.max(a, x)),
  saturate: (x: number) => Math.min(1, Math.max(0, x)),
  float2: (...a: number[]) => a, float3: (...a: number[]) => a, float4: (...a: number[]) => a,
}

const AXES: Record<string, number> = { x: 0, y: 1, z: 2, w: 3 }

/**
 * The game attributes a charm's expressions read besides its pattern, at rest (the viewer has no weapon movement):
 * the weapon's shake is zero, and a bone's up vector points up (+Z).
 */
function atRest(src: string): string {
  const shake = [0, 0, 0], up = [0, 0, 1]
  return src
    .replace(/\$ent_weapon_shake\.([xyzw])/g, (_, a: string) => String(shake[AXES[a]] ?? 0))
    .replace(/\$ent_weapon_shake/g, `float3(${shake.join(',')})`)
    .replace(/\$bone_upvector\$\w+\.([xyzw])/g, (_, a: string) => String(up[AXES[a]] ?? 0))
    .replace(/\$bone_upvector\$\w+/g, `float3(${up.join(',')})`)
}

/**
 * A material's m_dynamicParams expression ("return lerp(-180,-360,$KeychainSeed);", a few statements with locals)
 * → a function of the pattern (0–1). Other game attributes (weapon shake, bone vectors) take their value at rest
 * (atRest); an expression that still can't be read gives null and the vmat's static value stays.
 */
export function compileCharmExpr(src: string): ((seed: number) => number | number[]) | null {
  const body = atRest(src.replace(/\\n/g, '\n')).replace(/\$KeychainSeed/gi, 'S')
  if (body.includes('$') || /[^\w\s.,;:+\-*/%()<>=!?&|]/.test(body)) return null
  const names = new Set(body.match(/[A-Za-z_]\w*/g) ?? [])
  const locals = [...names].filter((n) => n !== 'S' && n !== 'return' && !(n in EXPR_FUNCS))
  if (locals.some((n) => !new RegExp(`\\b${n}\\s*=[^=]`).test(body))) return null
  try {
    const fn = new Function('S', ...Object.keys(EXPR_FUNCS), `let ${locals.length ? locals.join(',') : '_'};\n${body}`)
    const f = (s: number) => fn(s, ...Object.values(EXPR_FUNCS)) as number | number[]
    f(0.5)
    return f
  } catch {
    return null
  }
}

/** Scalar / vector values a charm material reads (vmat value, then the pattern's dynamic expression). */
const SCALARS: Record<string, number> = {
  g_fContrast: 1, g_fBrightness: 1, g_fHueShift: 0, g_fSaturation: 1,
  g_fTextureRoughnessBrightness: 1, g_fTextureRoughnessContrast: 1,
  g_flPearlescentScale: 0,
  g_fGlitterScale: 1, g_fGlitterIntensity: 0, g_fGlitterRainbowSpread: 0, g_fGlitterRainbowBalance: 0.25, g_flUvScale1: 1,
  g_flIridescentScale: 1, g_flIridescentStrength: 0, g_flIridescentHueShift: 0,
  g_fDetailBlendFactor: 0, g_nDetailBlendMode: 0, g_flDetailTexCoordRotation: 0,
  g_flLiquidLevelHeight: 0.5, g_flLiquidColorHueShift: 0, g_flLiquidBrightness: 1, g_flLiquidInnerGlow: 0,
}
const VECTORS: Record<string, number[]> = {
  g_vColorTint: [1, 1, 1], g_vMetalnessRemapRange: [0, 1], g_vDetailTexCoordScale: [1, 1], g_vDetailTexCoordOffset: [0, 0],
  g_vLiquidColor: [0.5, 0.5, 0.5],
}

const CHARM_GLSL = `
  uniform float uOn[8]; // 0 tint mask, 1 adjustments, 2 detail, 3 sfx mask, 4 glitter, 5 iridescence, 6 liquid, 7 sticker
  uniform vec3 uTint; uniform sampler2D uTintMask;
  uniform vec4 uAdjust;      // contrast, brightness, hue (radians), saturation
  uniform vec4 uRoughAdj;    // brightness, contrast, mask by tint, metal remap min
  uniform float uMetalMax;
  uniform sampler2D uDetail; uniform vec4 uDetailXf; uniform vec4 uDetailOpt; // xf: scale xy, offset xy; opt: rotation, factor, mode, mask by tint
  uniform float uPearl;
  uniform sampler2D uGlitterN; uniform vec4 uGlitter; // scale (· uv scale), intensity, spread, balance
  uniform vec4 uIrid;        // scale, strength, hue shift
  uniform vec4 uLiquid;      // level 0–1, brightness, hue (radians), sharpness
  uniform vec2 uLiquidGlass; // fresnel glass thickness, inner glow
  uniform vec3 uLiquidColor; uniform vec3 uLiquidLevels; uniform vec4 uLiquidMisc; uniform sampler2D uLiquidMask;
  uniform int uStCount;
  varying vec3 vLocalPos;
  varying vec2 vStUv;
  float gSfx = 1.0; float gTintM = 1.0; vec3 gGlitter = vec3(0.0); float gRough = 0.5; float gMetal = 0.0;
  const vec3 CH_LW = vec3(0.2125, 0.7154, 0.0721);
  vec3 chHue(vec3 b, float ang) {
    float hi = max(b.r, max(b.g, b.b));
    float sat = hi > 0.0 ? (hi - min(b.r, min(b.g, b.b))) / hi : 0.0;
    vec3 k = vec3(0.57735026918);
    float co = cos(ang), si = sin(ang);
    vec3 rot = b * co + cross(k, b) * si + k * dot(k, b) * (1.0 - co);
    return mix(vec3(dot(b, CH_LW)), rot, pow(sat, 0.125));
  }
`

/**
 * A charm draw call's material, as csgo_weapon draws it (decompiled: extracted/shaders/spv_weapon/w_charm225.msl,
 * the variant with adjustments, tint mask, glitter and sfx mask):
 *   color × tint through the tint mask; the detail texture (multiply or replace, by g_fDetailBlendFactor, optionally
 *   through the tint mask); F_ENABLE_ADJUSTMENTS (contrast around 0.5, brightness, hue rotation weighted by
 *   saturation^0.125, saturation) blended in by the tint mask; the "metalness" texture: R roughness (contrast /
 *   brightness), G metalness (remapped), B the sfx mask that gates pearlescence, glitter and iridescence.
 * csgo_simple_liquid: the vessel's color tinted by the liquid up to its level, measured from the liquid_surface
 *   bone as the game does (at rest: no wobble, bubbles or refraction).
 * F_STICKERS (the sticker slab): a sticker over the body's UVs.
 * Values with a dynamic expression follow the pattern.
 */
/**
 * @param liquidSurface the charm's liquid_surface bone (inches), for its liquid materials
 */
export async function charmMaterial(def: CharmMaterial, t: TextureSource, liquidSurface?: [number, number, number]): Promise<CharmPart> {
  const tx = def.textures, p = def.params
  const liquid = def.shader === 'csgo_simple_liquid.vfx'
  const flag = (k: string) => p[k] === '1'
  const opt = (path: string | undefined, srgb: boolean) => (path ? t.load(path, srgb).catch(() => null) : Promise.resolve(null))
  const [map, rough, normal, ao, tintMask, detail, glitterN, liquidMask] = await Promise.all([
    opt(tx.g_tColor ?? tx.g_tColorA, true), opt(liquid ? undefined : tx.g_tMetalness, false), opt(tx.g_tNormal ?? tx.g_tNormalA, false),
    opt(tx.g_tAmbientOcclusion, false), opt(flag('F_TINT_MASK') ? tx.g_tTintMask : undefined, false),
    opt(tx.g_tDetail, true), opt(flag('F_GLITTER') ? tx.g_tGlitterNormal : undefined, false),
    opt(liquid ? tx.g_tLiquidMask : undefined, false),
  ])
  if (glitterN) { glitterN.minFilter = glitterN.magFilter = THREE.NearestFilter; glitterN.generateMipmaps = false; glitterN.needsUpdate = true }
  const material = new THREE.MeshPhysicalMaterial({
    map: map ?? null, roughnessMap: rough ?? null, metalnessMap: rough ?? null, roughness: 1, metalness: rough ? 1 : 0,
    normalMap: normal ?? null, aoMap: ao ?? null,
  })
  if (liquid) {
    material.roughness = num(p.g_flLiquidRoughness, 0.3)
    material.metalness = 0
  }
  const values: Record<string, number | number[]> = {}
  for (const [k, d] of Object.entries(SCALARS)) values[k] = num(p[k], d)
  for (const [k, d] of Object.entries(VECTORS)) values[k] = vec(p[k], d)
  const n = (k: string) => Number(values[k])
  const v = (k: string) => values[k] as number[]

  const st = stickerUniforms()
  const u: Record<string, THREE.IUniform> = {
    uOn: { value: [tintMask ? 1 : 0, flag('F_ENABLE_ADJUSTMENTS') ? 1 : 0, detail ? 1 : 0, flag('F_ENABLE_SFX_MASK') ? 1 : 0, glitterN ? 1 : 0, flag('F_IRIDESCENCE') ? 1 : 0, liquid ? 1 : 0, 0] },
    uTint: { value: new THREE.Vector3() }, uTintMask: { value: tintMask },
    uAdjust: { value: new THREE.Vector4() }, uRoughAdj: { value: new THREE.Vector4() }, uMetalMax: { value: 1 },
    uDetail: { value: detail }, uDetailXf: { value: new THREE.Vector4() }, uDetailOpt: { value: new THREE.Vector4() },
    uPearl: { value: 0 }, uGlitterN: { value: glitterN }, uGlitter: { value: new THREE.Vector4() }, uIrid: { value: new THREE.Vector4() },
    uLiquid: { value: new THREE.Vector4() }, uLiquidColor: { value: new THREE.Vector3() },
    uLiquidLevels: { value: new THREE.Vector3(...vec(p.g_vLiquidLevelUpwardsMinMidMax, [-1, 0, 1]).slice(0, 3)) },
    uLiquidMisc: { value: new THREE.Vector4(num(p.g_flBrightenEmptyArea, 0), num(p.g_flMaskMinimum, 0), num(p.g_flMaskMaximum, 1), liquidSurface?.[2] ?? 0) },
    uLiquidGlass: { value: new THREE.Vector2(num(p.g_flFresnelGlassThickness, 0.2), 0) },
    uLiquidMask: { value: liquidMask ?? t.blank },
    ...st,
  }
  const apply = () => {
    const tint = v('g_vColorTint')
    ;(u.uTint.value as THREE.Vector3).set(tint[0], tint[1], tint[2])
    ;(u.uAdjust.value as THREE.Vector4).set(n('g_fContrast'), n('g_fBrightness'), THREE.MathUtils.degToRad(n('g_fHueShift')), n('g_fSaturation'))
    const remap = v('g_vMetalnessRemapRange')
    ;(u.uRoughAdj.value as THREE.Vector4).set(n('g_fTextureRoughnessBrightness'), n('g_fTextureRoughnessContrast'), flag('g_bMaskRoughnessAdjustmentsByTintMask') ? 1 : 0, remap[0])
    u.uMetalMax.value = remap[1] ?? 1
    const ds = v('g_vDetailTexCoordScale'), dof = v('g_vDetailTexCoordOffset')
    ;(u.uDetailXf.value as THREE.Vector4).set(ds[0] ?? 1, ds[1] ?? ds[0] ?? 1, dof[0] ?? 0, dof[1] ?? 0)
    ;(u.uDetailOpt.value as THREE.Vector4).set(THREE.MathUtils.degToRad(n('g_flDetailTexCoordRotation')), n('g_fDetailBlendFactor'), n('g_nDetailBlendMode'), flag('g_bMaskDetailTextureByTintMask') ? 1 : 0)
    u.uPearl.value = n('g_flPearlescentScale')
    ;(u.uGlitter.value as THREE.Vector4).set(n('g_fGlitterScale') * n('g_flUvScale1'), n('g_fGlitterIntensity'), n('g_fGlitterRainbowSpread'), n('g_fGlitterRainbowBalance'))
    ;(u.uIrid.value as THREE.Vector4).set(n('g_flIridescentScale'), n('g_flIridescentStrength'), n('g_flIridescentHueShift'), 0)
    ;(u.uLiquid.value as THREE.Vector4).set(n('g_flLiquidLevelHeight'), n('g_flLiquidBrightness'), THREE.MathUtils.degToRad(n('g_flLiquidColorHueShift')), num(p.g_flLiquidSharpness, 100))
    ;(u.uLiquidGlass.value as THREE.Vector2).y = n('g_flLiquidInnerGlow')
    /** vmat colors are sRGB (the shader's parameters are linearized). */
    const lc = new THREE.Color().setRGB(...(v('g_vLiquidColor').slice(0, 3) as [number, number, number]), THREE.SRGBColorSpace)
    ;(u.uLiquidColor.value as THREE.Vector3).set(lc.r, lc.g, lc.b)
  }
  apply()

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocalPos;\nattribute vec2 uvSticker;\nvarying vec2 vStUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocalPos = position;\nvStUv = uvSticker;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${CHARM_GLSL}
        ${STICKER_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 c = diffuseColor.rgb;
          gTintM = uOn[0] > 0.5 ? texture2D(uTintMask, vMapUv).r : 1.0;
          c = mix(c, c * uTint, gTintM);
          if (uOn[2] > 0.5) {
            vec2 duv = vMapUv - 0.5;
            float dc = cos(uDetailOpt.x), ds = sin(uDetailOpt.x);
            duv = vec2(duv.x * dc - duv.y * ds, duv.x * ds + duv.y * dc) + 0.5;
            vec3 d = texture2D(uDetail, duv * uDetailXf.xy + uDetailXf.zw).rgb;
            float amt = uDetailOpt.y * (uDetailOpt.w > 0.5 ? gTintM : 1.0);
            c = uDetailOpt.z > 0.5 ? mix(c, d, amt) : mix(c, c * d, amt);
          }
          if (uOn[1] > 0.5) {
            vec3 b = clamp(mix(vec3(0.5), c, uAdjust.x) * uAdjust.y, 0.0, 1.0);
            vec3 h = chHue(b, uAdjust.z);
            c = mix(c, clamp(mix(vec3(dot(h, CH_LW)), h, uAdjust.w), 0.0, 1.0), gTintM);
          }
          if (uOn[6] > 0.5) {
            /**
             * csgo_simple_liquid at rest (decompiled, combo S_USE_TEST_VALUES): the level is a height above the
             * liquid_surface bone (inches; the Upwards min / mid / max by g_flLiquidLevelHeight), the mask says where
             * liquid can be. The color texture is tinted by the hue-shifted liquid color where it is, glows a little
             * from inside, darkens toward the glass's rim, and is brightened where the vessel is empty.
             */
            float L = uLiquid.x;
            float above = mix(mix(uLiquidLevels.x, uLiquidLevels.y, clamp(L * 2.0, 0.0, 1.0)), uLiquidLevels.z, clamp((L - 0.5) * 2.0, 0.0, 1.0));
            float mask = clamp((texture2D(uLiquidMask, vMapUv).r - uLiquidMisc.y) / (uLiquidMisc.z + 0.001), 0.0, 1.0);
            float depth = vLocalPos.y / 0.0254 - (uLiquidMisc.w + above);
            float liquid = 1.0 - clamp(depth * uLiquid.w * mask * 0.25, 0.0, 1.0);
            float wet = clamp(liquid * mask, 0.0, 1.0);
            float ndv = abs(dot(normalize(vNormal), normalize(vViewPosition)));
            float rim = clamp(2.0 * ((1.0 - ndv) - uLiquidGlass.x), 0.0, 1.0);
            vec3 lc = chHue(uLiquidColor * uLiquid.y, uLiquid.z);
            c *= mix(vec3(1.0), vec3(0.2), rim * mask);
            c *= mix(vec3(1.0), lc, wet);
            c += lc * uLiquid.y * pow(ndv, 3.0) * wet * uLiquidGlass.y;
            c *= 1.0 + uLiquidMisc.x * mask * (1.0 - liquid);
          }
          diffuseColor.rgb = c;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        #ifdef USE_ROUGHNESSMAP
        {
          vec4 rm = texture2D(roughnessMap, vRoughnessMapUv);
          float m = uRoughAdj.z > 0.5 ? gTintM : 1.0;
          float con = mix(1.0, uRoughAdj.y, m), bri = mix(1.0, uRoughAdj.x, m);
          roughnessFactor = clamp(((rm.r - 0.5) * con + 0.5) * bri, 0.0, 1.0);
          gSfx = uOn[3] > 0.5 ? rm.b : 1.0;
        }
        #endif
        gRough = roughnessFactor;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        #ifdef USE_METALNESSMAP
          metalnessFactor = mix(uRoughAdj.w, uMetalMax, texture2D(metalnessMap, vMetalnessMapUv).g);
        #endif
        gMetal = metalnessFactor;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 V = normalize(vViewPosition);
          if (uPearl != 0.0) {
            // pearlescence: a hue rotation by scale · (1 − N·V) · sfx mask
            diffuseColor.rgb = chHue(diffuseColor.rgb, uPearl * (1.0 - dot(V, normal)) * gSfx);
          }
          float gAmt = gSfx * min(1.0, uGlitter.y);
          if (uOn[4] > 0.5 && gAmt > 0.0) {
            // glitter: point-sampled glitter normals tilt the normal; sin(reflect(V, N')·k) rainbow sparkles
            vec4 gs = texelFetch(uGlitterN, ivec2(fract(vMapUv * 1.75 * uGlitter.x) * vec2(textureSize(uGlitterN, 0))), 0);
            vec3 gn = normalize(gs.xyz * 2.0 - 1.0); vec3 tilt = gn * gn.z;
            vec3 np = normal;
            #ifdef USE_NORMALMAP_TANGENTSPACE
              np = normalize(normal + tbn * vec3(tilt.xy, 0.0));
            #endif
            vec3 sp = sin(reflect(V, np) * mix(12.0, 5.6, uGlitter.z));
            float th = mix(0.99, 0.8, uGlitter.z), inv = 1.0 / (1.0 - th);
            vec3 hi = max(vec3(0.0), sp - th) * inv, lo = max(vec3(0.0), -sp - th) * inv;
            vec3 cc = vec3(pow(dot(clamp(-sp, 0.0, 1.0), CH_LW), 4.0)) + vec3(dot(clamp(0.15 - sp, 0.0, 1.0), CH_LW) * max(0.0, uGlitter.w))
              + (hi + pow(hi.yzx + lo * max(0.0, -uGlitter.w), vec3(4.0 - 3.5 * max(0.0, uGlitter.z)))) * 4.0 * max(0.0, 1.0 - uGlitter.w);
            gGlitter = (cc * 0.05 + cc * normalize(max(vec3(0.0003), diffuseColor.rgb)) * 1.06 * 0.95) * gs.a * max(0.0, dot(V, normal)) * uGlitter.y * gSfx;
            float k = gAmt * gs.a * abs(1.0 - tilt.z);
            diffuseColor.rgb *= mix(1.0 + k * 2.5, 1.0, smoothstep(0.0, 0.8, dot(diffuseColor.rgb, CH_LW)));
            roughnessFactor *= 1.0 - k * 0.25;
            metalnessFactor = max(metalnessFactor, k * 0.5 * gAmt);
          }
          vec2 csDx = dFdx(vStUv), csDy = dFdy(vStUv);
          vec3 cpDx = dFdx(-vViewPosition), cpDy = dFdy(-vViewPosition);
          if (uOn[7] > 0.5 && uStCount > 0 && all(greaterThanEqual(vStUv, vec2(0.0))) && all(lessThanEqual(vStUv, vec2(1.0)))) {
            // the sticker slab's sticker, through the model's second UV set (the sticker's)
            StickerOut so = stickerEval(0, vStUv, csDx, csDy, 1.0, 0.5, V, normal, stTbnD(cpDx, cpDy, csDx, csDy, normal));
            normal = normalize(mix(normal, so.normal, so.alpha));
            diffuseColor.rgb = mix(diffuseColor.rgb, so.color, so.alpha);
            roughnessFactor = mix(roughnessFactor, so.rough, so.alpha);
            metalnessFactor = mix(metalnessFactor, so.metal, so.alpha);
            gGlitter += so.emissive * so.alpha * 3.1;
          }
        }`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
        if (uOn[5] > 0.5 && uIrid.y != 0.0) {
          // iridescence: a hue wheel by the view angle replaces the specular color (× strength · sfx mask)
          vec3 V = normalize(vViewPosition);
          float h = fract((dot(V, normalize(vNormal)) + dot(V, vec3(0.0, 0.0, -1.0))) * uIrid.x + uIrid.z) * 6.0;
          float sec = floor(h), f = h - sec, g = 1.0 - f;
          vec3 hue = sec == 0.0 ? vec3(1.0, f, 0.0) : sec == 1.0 ? vec3(g, 1.0, 0.0) : sec == 2.0 ? vec3(0.0, 1.0, f)
            : sec == 3.0 ? vec3(0.0, g, 1.0) : sec == 4.0 ? vec3(f, 0.0, 1.0) : vec3(1.0, 0.0, g);
          vec3 s0 = material.specularColor;
          float l = dot(s0, CH_LW);
          vec3 hn = normalize(max(hue, vec3(0.001)));
          vec3 irid = hn * min(l / dot(hn, CH_LW), 3.0 * l * max(hue.r, max(hue.g, hue.b)));
          material.specularColor = clamp(mix(s0, irid, uIrid.y * gSfx), 0.0, 1.0);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += gGlitter * 0.8;`)
  }

  const dynamic = Object.entries(def.dynamic ?? {})
    .filter(([name]) => name in values)
    .map(([name, src]) => [name, compileCharmExpr(src)] as const)
    .filter((d): d is readonly [string, (s: number) => number | number[]] => !!d[1])
  const setSeed = (seed: number) => {
    if (!dynamic.length) return
    const s = Math.max(0, Math.min(CHARM_PATTERN_MAX, seed)) / CHARM_PATTERN_MAX
    for (const [name, f] of dynamic) {
      const r = f(s)
      values[name] = Array.isArray(values[name]) ? (Array.isArray(r) ? r : [r, r]) : Array.isArray(r) ? r[0] : r
    }
    apply()
  }
  const attach = (mesh: THREE.Mesh) => {
    const g = mesh.geometry
    if (!g.getAttribute('uvSticker')) g.setAttribute('uvSticker', g.getAttribute('uv1') ?? g.getAttribute('uv') ?? new THREE.Float32BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2))
  }
  const setSticker = flag('F_STICKERS') ? (s: { def: StickerDef; textures: StickerTextures } | null) => {
    ;(u.uOn.value as number[])[7] = s ? 1 : 0
    u.uStCount.value = s ? 1 : 0
    if (s) setStickerUniforms(u, 0, s.def, s.textures, 0)
  } : undefined
  return { material, setSeed, attach, setSticker }
}
