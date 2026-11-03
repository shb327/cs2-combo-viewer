import * as THREE from 'three'
import type { AirbrushItem, BareItem, CompositeItem, CustomPaintItem, MulticolorItem, PaintStyleItem, Rgb } from '@/lib/data/items'
import { COMPOSITE_ROUGH_GLSL, type WeaponComposite } from '@/lib/materials/composite'
import { kitRollValues, type SeedRolls, type Placement } from '@/lib/data/rng'
import { STICKER_GLSL, STICKER_MAX, setStickerUniforms, stickerUniforms, type StickerDef, type StickerTextures } from '@/lib/materials/sticker'
import { AIRBRUSH_DEBUG_EXPR, DEBUG_EXPR, DEBUG_VIEWS, PAINT_HELPERS_GLSL, STYLE_GLSL } from '@/lib/materials/weapon-glsl'

export { DEBUG_VIEWS }

export type WeaponItem = CustomPaintItem | AirbrushItem | MulticolorItem | PaintStyleItem | CompositeItem | BareItem

export interface WeaponTextureSet {
  paint: THREE.Texture
  wear: THREE.Texture
  grunge: THREE.Texture
  base: THREE.Texture
  normal: THREE.Texture | null
  orm: THREE.Texture | null
  rough: THREE.Texture | null
  ao: THREE.Texture
  masks: THREE.Texture
  pos: THREE.Texture
  /** Weapon composite input g_tSurface: object-space normals (the airbrush's plane blend). */
  surface: THREE.Texture
}

export interface WeaponFinishOptions {
  /** Debug view number (see DEBUG_VIEWS); 0 = off. */
  debug?: number
  /** Paint through the second UV set (comparison). */
  paintUv1?: boolean
  /** Override the airbrush pattern scale / offset x (tuning). */
  patternScale?: number
  patternOffsetX?: number
  /** Override whether the composite inputs are sampled upside down (checking a new weapon). */
  flipInputs?: boolean
}

/**
 * g_vPatternTexCoordXform0/1: the shader's parameter expression (csgo_customweapon, decompiled VFX
 * bytecode). Rotation, scale and offset are rounded to 2 decimals; the scale is multiplied by the
 * weapon's g_flUvScale1 unless the paint sets g_bIgnoreWeaponSizeScale. uv = (dot(p, X0.xy) + X0.w,
 * dot(p, X1.xy) + X1.w), p = the projected pos pair.
 */
export function patternXform(scale: number, rotDeg: number, offset: [number, number], uvScale: number, ignoreWeaponSize: boolean): [THREE.Vector4, THREE.Vector4] {
  const r2 = (v: number) => Math.floor((v + 0.005) * 100) / 100
  return texXform(r2(scale * (ignoreWeaponSize ? 1 : uvScale)), r2(rotDeg), [r2(offset[0]), r2(offset[1])])
}

/** The unrounded core of the TexCoordXform expressions (the glove shader uses it as is). */
export function texXform(s: number, rotDeg: number, offset: [number, number]): [THREE.Vector4, THREE.Vector4] {
  const t = (rotDeg * 3.14159) / 180
  const c = Math.cos(t), sn = Math.sin(t)
  const h = 0.5 / (s !== 0 ? s : 1)
  const c2 = Math.cos(-t), s2 = Math.sin(-t)
  const v9 = h * c2 - h * s2
  const v10 = v9 * s2 + h * c2
  return [
    new THREE.Vector4(c * s, -sn * s, 0, s * c * v9 + s * -sn * v10 + offset[0] - 0.5),
    new THREE.Vector4(sn * s, c * s, 0, s * sn * v9 + s * c * v10 + offset[1] - 0.5),
  ]
}

/** A seed-rolled wear / grunge placement through the same expression (their scales aren't weapon-sized either:
 * every current paint sets g_bIgnoreWeaponSizeScale). */
const placementXform = (p: Placement, uvScale: number, ignore: boolean) => patternXform(p.scale, p.rot, p.offset, uvScale, ignore)

/** vmat colors are sRGB; the shader's g_vColorN = SrgbGammaToLinear(color) (its parameter expression). */
const linearColor = (c: Rgb) => new THREE.Color().setRGB(...c, THREE.SRGBColorSpace)

export class WeaponFinish {
  readonly material: THREE.MeshPhysicalMaterial
  private readonly u: Record<string, THREE.IUniform>

  private wearAmount = 0.15
  private seed = 0

  constructor(private readonly item: WeaponItem, tex: WeaponTextureSet, private readonly opts: WeaponFinishOptions = {},
    /** csgo_weapon's glitter normals (the kit's), when it has glitter. */
    glitterNormal: THREE.Texture | null = null,
    /** The game's composite (catalog kits): its two textures replace the ported styles. */
    private readonly composite: WeaponComposite | null = null) {
    const style = item.style
    const anodized = style === 'airbrush' || style === 'multi' ? item : null
    const pp = item.pp
    const colors = 'colors' in item ? item.colors : undefined
    const matParams = style === 'composite' ? item.composite.material : {}
    const matNum = (k: string, d: number) => { const v = matParams[k]; return typeof v === 'number' ? v : typeof v === 'boolean' ? +v : d }
    const srcRough = !!tex.rough
    const debug = opts.debug ?? 0
    const black: Rgb = [0, 0, 0]

    this.u = {
      uPaint: { value: tex.paint }, uWear: { value: tex.wear }, uGrunge: { value: tex.grunge }, uAo: { value: tex.ao },
      uMasks: { value: tex.masks }, uPos: { value: tex.pos },
      uWearAmount: { value: 0.15 },
      uColors: { value: (colors ?? [black, black, black, black]).map(linearColor) },
      uBrightness: { value: pp?.brightness ?? anodized?.brightness ?? 1 },
      uSprayBias: { value: new THREE.Vector3(...('sprayBias' in item && item.sprayBias ? item.sprayBias : [0, 0, 1])) },
      uDurability: { value: new THREE.Vector4(...(pp?.durability ?? [1, 1, 1, 1])) },
      uRough4: { value: new THREE.Vector4(...(pp?.roughness4 ?? [0.6, 0.6, 0.6, 0.6])) },
      uMetal4: { value: new THREE.Vector4(...(pp?.metalness4 ?? [0, 0, 0, 0])) },
      uRoughPerColor: { value: pp?.roughPerColor ? 1 : 0 },
      uColorAdj: { value: pp?.colorAdjust ?? 1 },
      uSurface: { value: tex.surface },
      uPaintRough: { value: pp?.paintRoughness ?? anodized?.paintRoughness ?? (style === 'custom' ? item.paintRoughness ?? 0.38 : 0.38) },
      uWearSoftness: { value: pp?.wearSoftness ?? (style === 'custom' ? item.wearSoftness ?? 0 : 0) },
      uPaintMetalness: { value: pp?.paintMetalness ?? (style === 'custom' ? item.paintMetalness ?? 0 : 0) },
      uPatX0: { value: new THREE.Vector4(1, 0, 0, 0) },
      uPatX1: { value: new THREE.Vector4(0, 1, 0, 0) },
      uWearX0: { value: new THREE.Vector4(1, 0, 0, 0) },
      uWearX1: { value: new THREE.Vector4(0, 1, 0, 0) },
      uGrungeX0: { value: new THREE.Vector4(1, 0, 0, 0) },
      uGrungeX1: { value: new THREE.Vector4(0, 1, 0, 0) },
      uStickerMask: { value: null },
      uStickerXf: { value: Array.from({ length: STICKER_MAX }, () => new THREE.Vector4(0, 0, 1, 0)) },
      ...stickerUniforms(),
      uCompColor: { value: composite?.color.texture ?? null },
      uCompRough: { value: composite?.rough.texture ?? null },
      uPearl: { value: matNum('g_flPearlescentScale', 0) },
      uIrid: { value: matNum('F_IRIDESCENCE', 0) },
      uIridScale: { value: matNum('g_flIridescentScale', 2) },
      uIridStrength: { value: matNum('g_flIridescentStrength', 0.75) },
      uIridHue: { value: matNum('g_flIridescentHueShift', 0.5) },
      uGlitter: { value: matNum('F_GLITTER', 0) ? matNum('g_fGlitterIntensity', 0) : 0 },
      uGlitterScale: { value: matNum('g_fGlitterScale', 10) * matNum('g_flUvScale1', 1) },
      uGlitterSpread: { value: matNum('g_fGlitterRainbowSpread', 0) },
      uGlitterBalance: { value: matNum('g_fGlitterRainbowBalance', 0.25) },
      uGlitterNormal: { value: glitterNormal },
    }

    this.material = new THREE.MeshPhysicalMaterial({
      specularIntensity: 0.5,
      map: tex.base, normalMap: tex.normal, aoMap: srcRough ? null : tex.orm,
      roughnessMap: srcRough ? tex.rough : tex.orm, metalnessMap: srcRough ? tex.rough : tex.orm,
      roughness: 1, metalness: 1,
    })

    const flip = opts.flipInputs ?? ('flipInputs' in item ? item.flipInputs : false)
    const finish = STYLE_GLSL[style]
    const debugExpr = DEBUG_EXPR[debug] ?? (style === 'airbrush' ? AIRBRUSH_DEBUG_EXPR[debug] : undefined) ?? '0.0'

    this.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.u)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute vec2 uvPaint;
          attribute vec2 uvSticker;
          varying vec2 vPaintUv;
          varying vec2 vStickerUv;
          varying vec3 vObjN;`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
          vObjN = normal; // the mesh's own (bind pose) axes, before skinning`)
        .replace('#include <uv_vertex>', `#include <uv_vertex>
          vPaintUv = uvPaint;
          vStickerUv = uvSticker;`)
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform sampler2D uPaint; uniform sampler2D uWear; uniform sampler2D uGrunge; uniform sampler2D uAo;
          uniform sampler2D uMasks; uniform sampler2D uPos;
          uniform float uWearAmount; uniform vec4 uWearX0; uniform vec4 uWearX1; uniform vec4 uGrungeX0; uniform vec4 uGrungeX1;
          uniform vec3 uColors[4]; uniform float uBrightness; uniform vec3 uSprayBias; uniform vec4 uDurability;
          uniform sampler2D uSurface; uniform float uPaintRough; uniform float uWearSoftness; uniform float uPaintMetalness; uniform vec4 uPatX0; uniform vec4 uPatX1;
          uniform vec4 uRough4; uniform vec4 uMetal4; uniform float uRoughPerColor; uniform float uColorAdj;
          uniform sampler2D uCompColor; uniform sampler2D uCompRough;
          uniform float uPearl; uniform float uIrid; uniform float uIridScale; uniform float uIridStrength; uniform float uIridHue;
          uniform float uGlitter; uniform float uGlitterScale; uniform float uGlitterSpread; uniform float uGlitterBalance;
          uniform sampler2D uGlitterNormal;
          vec3 gGlitter = vec3(0.0);
          float gPearlMask = 0.0;
          ${COMPOSITE_ROUGH_GLSL}
          // Styles that weight the roughness / metalness their own way set these (≥ 0) instead of the paint mix.
          float gRoughOv = -1.0; float gMetalOv = -1.0;
          ${PAINT_HELPERS_GLSL}
          uniform int uStCount; uniform sampler2D uStickerMask; uniform vec4 uStickerXf[5];
          float gStickerRough = 0.5; float gStickerMetal = 0.0; vec3 gStickerEmissive = vec3(0.0);
          ${STICKER_GLSL}
          varying vec2 vPaintUv;
          varying vec2 vStickerUv;
          varying vec3 vObjN;
          float gSticker = 0.0;
          float gPaint; float gDbg; float gMetalPaint; float gPaintRough; vec3 gDbgRgb;
          // A texture placement: the shader's g_v*TexCoordXform0/1 rows (patternXform), as its vertex shader applies them.
          vec2 xf(vec2 uv, vec4 x0, vec4 x1) { return vec2(dot(uv, x0.xy) + x0.w, dot(uv, x1.xy) + x1.w); }
          // The game composites into a 0–1 texture that the model then samples with wrapping, so a placement
          // is evaluated at fract(uv) (the AK's UVs reach u 1.4). Gradients from the unwrapped uv: no mip seams.
          vec4 xfTex(sampler2D t, vec2 uv, vec4 x0, vec4 x1) {
            vec2 g = xf(uv, x0, x1);
            return textureGrad(t, xf(fract(uv), x0, x1), dFdx(g), dFdy(g));
          }`)
        .replace('#include <map_fragment>', `
          vec4 baseCol = texture2D(map, vMapUv);             // the bare weapon
          // Its metalness: Source "rough" texture G, or the glTF ORM's B.
          float baseMetal = texture2D(metalnessMap, vMetalnessMapUv).${srcRough ? 'g' : 'b'};
          float baseRough = texture2D(roughnessMap, vRoughnessMapUv).${srcRough ? 'r' : 'g'};
          float wearTex = xfTex(uWear, vPaintUv, uWearX0, uWearX1).r;
          vec4 grunge = xfTex(uGrunge, vPaintUv, uGrungeX0, uGrungeX1);
          vec2 cuv = ${flip ? 'vec2(vMapUv.x, 1.0 - vMapUv.y)' : 'vMapUv'}; // composite inputs' UVs
          // The weapon's composite input g_tAmbientOcclusion: R = occlusion, A = extra wear per area.
          vec4 aoIn = texture2D(uAo, cuv);
          // Each style sets: paintCol, painted (coverage before wear), kept (after wear), tough,
          // metallicPaint, paintRough.
          ${finish}
          gPaint = painted * kept;
          gMetalPaint = metallicPaint;
          gPaintRough = paintRough;
          diffuseColor.rgb = mix(baseCol.rgb, paintCol, gPaint);
          gDbgRgb = vec3(-1.0);
          ${debug === 18 ? 'gDbgRgb = baseCol.rgb;' : ''}
          ${debug === 22 ? 'gDbgRgb = paintCol;' : ''}
          ${debug === 23 ? 'gDbgRgb = texture2D(uMasks, cuv).rgb;' : ''}
          ${debug === 26 ? 'gDbgRgb = xfTex(uPaint, vPaintUv, uPatX0, uPatX1).rgb;' : ''}
          ${debug === 27 ? 'gDbgRgb = vec3(xfTex(uPaint, vPaintUv, uPatX0, uPatX1).a);' : ''}
          ${debug ? `gDbg = ${debugExpr}; diffuseColor.rgb = vec3(0.0);` : ''}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          ${debug ? 'totalEmissiveRadiance = gDbgRgb.x >= 0.0 ? gDbgRgb : vec3(gDbg);' : ''}`)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          // The stickers, in order (later ones on top; each one's sparkles add up). The screen derivatives are taken
          // here, in uniform control flow, and carried through each sticker's (affine) placement.
          vec2 stUvDx = dFdx(vStickerUv), stUvDy = dFdy(vStickerUv);
          vec3 stPDx = dFdx(-vViewPosition), stPDy = dFdy(-vViewPosition);
          for (int si = 0; si < STICKER_MAX; si++) {
            if (si >= uStCount) break;
            vec4 xf = uStickerXf[si];
            vec2 so = (vStickerUv - 0.5 - xf.xy) * max(abs(xf.z), 1e-4);
            float sa = xf.w * 6.28318, sc = cos(sa), ss = sin(sa);
            vec2 sk = vec2(so.x * sc - so.y * ss, so.x * ss + so.y * sc) + 0.5;
            if (all(greaterThanEqual(sk, vec2(0.0))) && all(lessThanEqual(sk, vec2(1.0)))) {
              vec4 sm = texture2D(uStickerMask, vMapUv);
              // A sticker is a decal over the surface: its frame is the geometry's normal, not the weapon's normal map
              // (the slide's serrations would streak the glitter).
              mat2 rot = mat2(sc, ss, -ss, sc);
              float scale = max(abs(xf.z), 1e-4);
              vec2 skDx = rot * (stUvDx * scale), skDy = rot * (stUvDy * scale);
              StickerOut so2 = stickerEval(si, sk, skDx, skDy, sm.r, sm.g, normalize(vViewPosition), nonPerturbedNormal, stTbnD(stPDx, stPDy, skDx, skDy, nonPerturbedNormal));
              float a = so2.alpha;
              normal = normalize(mix(normal, so2.normal, a));
              gStickerRough = gSticker > 0.0 ? mix(gStickerRough, so2.rough, a) : so2.rough;
              gStickerMetal = gSticker > 0.0 ? mix(gStickerMetal, so2.metal, a) : so2.metal;
              gStickerEmissive += so2.emissive * a;
              gSticker = 1.0 - (1.0 - gSticker) * (1.0 - a);
              diffuseColor.rgb = mix(diffuseColor.rgb, so2.color, a);
            }
          }
          if (uPearl != 0.0) {
            float pa = uPearl * (1.0 - dot(normalize(vViewPosition), normal)) * gPearlMask;
            vec3 a = diffuseColor.rgb, k = vec3(0.57735);
            float mx = max(a.r, max(a.g, a.b));
            float sat = mx == 0.0 ? 0.0 : (mx - min(a.r, min(a.g, a.b))) / mx;
            vec3 rot = a * cos(pa) + cross(k, a) * sin(pa) + k * dot(k, a) * (1.0 - cos(pa));
            diffuseColor.rgb = mix(vec3(dot(a, vec3(0.2125, 0.7154, 0.0721))), rot, pow(sat, 0.125));
          }
          // csgo_weapon's glitter (S_GLITTER): glitter normals (point-sampled, tiled by g_fGlitterScale) tilt the normal;
          // sin(reflect(V, N') · k) makes rainbow sparkles, added to the color; the albedo brightens, the roughness drops.
          float gAmt = gPearlMask * min(1.0, uGlitter);
          if (gAmt > 0.0) {
            vec3 V = normalize(vViewPosition);
            vec2 guv = vMapUv * 1.75 * uGlitterScale;
            vec4 gs = texelFetch(uGlitterNormal, ivec2(fract(guv) * vec2(textureSize(uGlitterNormal, 0))), 0);
            vec3 gn = normalize(gs.xyz * 2.0 - 1.0);
            vec3 tilt = gn * gn.z;
            vec3 np = normal;
            #ifdef USE_NORMALMAP_TANGENTSPACE
              np = normalize(normal + tbn * vec3(tilt.xy, 0.0));
            #endif
            vec3 sp = sin(reflect(V, np) * mix(12.0, 5.6, uGlitterSpread));
            float th = mix(0.99, 0.8, uGlitterSpread), inv = 1.0 / (1.0 - th);
            vec3 hi = max(vec3(0.0), sp - th) * inv;
            vec3 lo = max(vec3(0.0), -sp - th) * inv;
            vec3 Lw = vec3(0.2125, 0.7154, 0.0721);
            vec3 c = vec3(pow(dot(clamp(-sp, 0.0, 1.0), Lw), 4.0)) + vec3(dot(clamp(0.15 - sp, 0.0, 1.0), Lw) * max(0.0, uGlitterBalance))
              + (hi + pow(hi.yzx + lo * max(0.0, -uGlitterBalance), vec3(4.0 - 3.5 * max(0.0, uGlitterSpread)))) * 4.0 * max(0.0, 1.0 - uGlitterBalance);
            gGlitter = (c * 0.05 + c * normalize(max(vec3(0.0003), diffuseColor.rgb)) * 1.06 * 0.95) * gs.a * max(0.0, dot(V, normal)) * uGlitter * gPearlMask;
            float k = gAmt * gs.a * abs(1.0 - tilt.z);
            diffuseColor.rgb *= mix(1.0 + k * 2.5, 1.0, smoothstep(0.0, 0.8, dot(diffuseColor.rgb, Lw)));
            roughnessFactor *= 1.0 - k * 0.25;
            metalnessFactor = max(metalnessFactor, k * 0.5 * gAmt);
          }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          // (the game scales the sparkles by the diffuse lighting there; roughly the scene's here)
          totalEmissiveRadiance += gGlitter * 0.8 + gStickerEmissive * 2.5;`)
        .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
          if (uIrid > 0.5) {
            vec3 V = normalize(vViewPosition);
            // (the second term uses a per-view vector of the game's; the camera's forward axis here)
            float h = fract((dot(V, normalize(vNormal)) + dot(V, vec3(0.0, 0.0, -1.0))) * uIridScale + uIridHue) * 6.0;
            float sec = floor(h), f = h - sec, g = 1.0 - f;
            vec3 hue = sec == 0.0 ? vec3(1.0, f, 0.0) : sec == 1.0 ? vec3(g, 1.0, 0.0) : sec == 2.0 ? vec3(0.0, 1.0, f)
              : sec == 3.0 ? vec3(0.0, g, 1.0) : sec == 4.0 ? vec3(f, 0.0, 1.0) : vec3(1.0, 0.0, g);
            vec3 s0 = material.specularColor;
            float l = dot(s0, vec3(0.2125, 0.7154, 0.0721));
            vec3 hn = normalize(max(hue, vec3(0.001)));
            vec3 irid = hn * min(l / dot(hn, vec3(0.2125, 0.7154, 0.0721)), 3.0 * l * max(hue.r, max(hue.g, hue.b)));
            material.specularColor = clamp(mix(s0, irid, uIridStrength * gPearlMask), 0.0, 1.0);
          }`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          ${srcRough ? 'roughnessFactor = texture2D(roughnessMap, vRoughnessMapUv).r;' : ''}
          roughnessFactor = gRoughOv >= 0.0 ? gRoughOv : mix(roughnessFactor, gPaintRough, gPaint);
          roughnessFactor = mix(roughnessFactor, gStickerRough, gSticker);`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
          ${srcRough ? 'metalnessFactor = texture2D(metalnessMap, vMetalnessMapUv).g;' : ''}
          metalnessFactor = gMetalOv >= 0.0 ? gMetalOv : mix(metalnessFactor, gMetalPaint, gPaint);
          metalnessFactor = mix(metalnessFactor, gStickerMetal, gSticker);
          ${debug === 19 || debug === 20 ? `gDbgRgb = vec3(texture2D(${debug === 19 ? 'roughnessMap, vRoughnessMapUv).r' : 'metalnessMap, vMetalnessMapUv).g'});` : ''}
          ${debug === 24 ? 'gDbgRgb = vec3(metalnessFactor);' : debug === 25 ? 'gDbgRgb = vec3(roughnessFactor);' : ''}
          ${debug ? 'metalnessFactor = 0.0; roughnessFactor = 1.0;' : ''}`)
    }
  }

  /** Which UV set the paint uses on a mesh's geometry. */
  static preparePaintUv(geometry: THREE.BufferGeometry, useUv1 = false): void {
    const uv1 = geometry.getAttribute('uv1')
    geometry.setAttribute('uvPaint', useUv1 && uv1 ? uv1 : geometry.getAttribute('uv'))
    geometry.setAttribute('uvSticker', uv1 ?? geometry.getAttribute('uv'))
  }

  /** Show a sticker (its texture, the weapon's sticker mask, the slot's placement) or none. */
  /** The stickers (their materials, packed textures, the weapon's sticker mask, each one's placement). */
  setStickers(s: {
    textures: StickerTextures; mask: THREE.Texture
    list: { def: StickerDef; offset: [number, number]; scale: number; rotation: number; wear: number }[]
  } | null): void {
    const list = s?.list.slice(0, STICKER_MAX) ?? []
    this.u.uStCount.value = list.length
    if (!s) return
    this.u.uStickerMask.value = s.mask
    list.forEach((st, i) => {
      setStickerUniforms(this.u, i, st.def, s.textures, st.wear)
      ;(this.u.uStickerXf.value as THREE.Vector4[])[i].set(st.offset[0], st.offset[1], st.scale, st.rotation)
    })
  }

  setFloat(f: number): void {
    this.u.uWearAmount.value = f
    this.wearAmount = f
    this.recomposite()
  }

  /** The composite's inputs that change: the float, the seed and what it rolls. */
  private recomposite(): void {
    const it = this.item
    if (!this.composite || !it.rollPlan) return
    const overrides: Record<string, number | number[]> = { g_flWearAmount: this.wearAmount, g_nRandomSeed: this.seed }
    for (const [k, v] of Object.entries(kitRollValues(this.seed, it.rollPlan))) overrides[k] = v.length === 1 ? v[0] : v
    this.composite.update(overrides)
  }

  /** The seed itself (the game's composite rolls from it). */
  setSeedNumber(seed: number): void {
    this.seed = seed
    this.recomposite()
  }

  setSeed(rolls: SeedRolls): void {
    const it = this.item
    const uvScale = it.uvScale ?? 1, ignore = it.ignoreWeaponSizeScale ?? true
    ;[this.u.uWearX0.value, this.u.uWearX1.value] = placementXform(rolls.wear, uvScale, ignore)
    ;[this.u.uGrungeX0.value, this.u.uGrungeX1.value] = placementXform(rolls.grunge, uvScale, ignore)
    const [x0, x1] =
      it.rollPlan ? patternXform(it.patternScale ?? 1, rolls.patternRot, [rolls.patternX, rolls.patternY], uvScale, ignore)
      : it.style === 'airbrush' ? patternXform(this.opts.patternScale ?? it.patternScale, 0,
        [this.opts.patternOffsetX ?? it.patternOffsetX, rolls.patternY], uvScale, ignore)
      : it.style === 'multi' ? patternXform(it.patternScale, rolls.patternRot, [rolls.patternX, rolls.patternY], uvScale, ignore)
      : patternXform(1, 0, [0, 0], uvScale, ignore)
    this.u.uPatX0.value = x0
    this.u.uPatX1.value = x1
  }

  dispose(): void {
    this.material.dispose()
    this.composite?.dispose()
  }
}
