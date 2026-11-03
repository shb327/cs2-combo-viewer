import * as THREE from 'three'
import { STICKER_GLSL } from '@/lib/materials/sticker-glsl'

export { STICKER_GLSL }

/**
 * A sticker's look: its csgo_weapon_sticker material (stickers.json, built by steam-tools/cs2-3d-pipeline/build_attachments.py).
 * Texture paths are relative to the asset root.
 */
export interface StickerDef {
  id: string
  name: string
  rarity?: string | null
  /** g_tSticker0: color + alpha. */
  color: string
  /** g_tNormalRoughnessSticker0: oct normal .xy, roughness .z, self-illumination mask .w. */
  normalRough?: string
  /** g_tSfxMaskSticker0: holo (x amount, y/z spectrum coordinates), glitter (1 − w). */
  sfx?: string
  /** g_tHoloSpectrumSticker0. */
  spectrum?: string
  /** g_tGlitterNormalSticker0. */
  glitterNormal?: string
  metallic: boolean
  holo: boolean
  glitter: boolean
  paper: boolean
  selfIllum: boolean
  autoFit: boolean
  legacyTint: boolean
  preserveRough: boolean
  clampSpectrumV: boolean
  tint: [number, number, number]
  tintSaturate: number
  colorBoost: number
  sfxColorBoost: number
  glitterScale: number
  /** g_vWearBiasSticker0 (x: how the sticker's alpha resists wear, y: the edge band / paper). */
  wearBias: [number, number]
  /** g_fWearScratchesSticker0. */
  scratches: number
}

/**
 * A sticker's textures packed into one texture array (WebGL has 16 texture units and the weapon material uses most):
 * per sticker i, layers 6i + 0 color (sRGB bytes), 1 normal/roughness, 2 sfx mask, 3 scratches, 4 holo spectrum (sRGB), 5 glitter
 * normals. Each copied at the array's size on the GPU (exact bytes, no premultiplied alpha).
 */
export interface StickerTextures {
  array: THREE.Texture
  size: number
  /** Per sticker: which optional layers it has. */
  has: { normalRough: boolean; sfx: boolean; spectrum: boolean; glitterNormal: boolean }[]
  dispose: () => void
}

/** One sticker's source textures (raw bytes; sRGB decoded in the shader). */
export interface StickerSources {
  color: THREE.Texture
  normalRough: THREE.Texture | null
  sfx: THREE.Texture | null
  spectrum: THREE.Texture | null
  glitterNormal: THREE.Texture | null
  scratches: THREE.Texture
}

/** At most this many stickers on one item (the game's five slots). */
export const STICKER_MAX = 5

const vec4s = (x = 0, y = 0, z = 0, w = 0) => Array.from({ length: STICKER_MAX }, () => new THREE.Vector4(x, y, z, w))

/** The stickers' uniforms (one set per material; per-sticker arrays, the textures in one array texture). */
export function stickerUniforms(): Record<string, THREE.IUniform> {
  return {
    uStTex: { value: null },
    uStCount: { value: 0 },
    uStFlags: { value: vec4s() },
    uStFlags2: { value: vec4s() },
    uStFlags3: { value: vec4s() },
    uStTint: { value: Array.from({ length: STICKER_MAX }, () => new THREE.Vector3(1, 1, 1)) },
    uStParams: { value: vec4s(1, 1, 1, 1) },
    uStWear: { value: vec4s(2, 1, 1, 0) },
  }
}

/** Sticker i (its material, its layers in the packed set) with a wear. */
export function setStickerUniforms(u: Record<string, THREE.IUniform>, i: number, def: StickerDef, set: StickerTextures, wear: number): void {
  const has = set.has[i]
  u.uStTex.value = set.array
  ;(u.uStFlags.value as THREE.Vector4[])[i].set(+def.metallic, +(def.holo && has.sfx && has.spectrum), +(def.glitter && has.sfx && has.glitterNormal), +def.paper)
  ;(u.uStFlags2.value as THREE.Vector4[])[i].set(+def.selfIllum, +def.autoFit, +def.legacyTint, +def.preserveRough)
  ;(u.uStFlags3.value as THREE.Vector4[])[i].set(has.normalRough ? 1 : 0, +def.clampSpectrumV, set.size, 0)
  ;(u.uStTint.value as THREE.Vector3[])[i].set(...def.tint)
  ;(u.uStParams.value as THREE.Vector4[])[i].set(def.tintSaturate, def.colorBoost, def.sfxColorBoost, def.glitterScale)
  ;(u.uStWear.value as THREE.Vector4[])[i].set(def.wearBias[0], def.wearBias[1], def.scratches, wear)
}

const COPY_VS = `out vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`
const COPY_FS = `precision highp float; uniform sampler2D src; in vec2 vUv; out vec4 o; void main() { o = texture(src, vUv); }`

/** A sticker's source textures (decoded on demand by the dev server the first time). */
export async function loadStickerSources(def: StickerDef, scratches: string, load: (p: string, srgb: boolean) => Promise<THREE.Texture>): Promise<StickerSources> {
  const opt = (p: string | undefined) => (p ? load(p, false).catch(() => null) : Promise.resolve(null))
  const [color, normalRough, sfx, spectrum, glitterNormal, scr] = await Promise.all([
    load(def.color, false), opt(def.normalRough), opt(def.sfx), opt(def.spectrum), opt(def.glitterNormal), load(scratches, false),
  ])
  return { color, normalRough, sfx, spectrum, glitterNormal, scratches: scr }
}

/** Packs stickers' textures into one array texture (see StickerTextures). */
export function packStickers(renderer: THREE.WebGLRenderer, list: StickerSources[]): StickerTextures {
  const w = Math.max(256, ...list.map((s) => (s.color.image as { width: number }).width || 512))
  const size = Math.min(1024, w)
  const rt = new THREE.WebGLArrayRenderTarget(size, size, Math.max(1, list.length) * 6, { depthBuffer: false })
  rt.texture.generateMipmaps = true
  rt.texture.minFilter = THREE.LinearMipmapLinearFilter
  rt.texture.magFilter = THREE.LinearFilter
  rt.texture.wrapS = rt.texture.wrapT = THREE.ClampToEdgeWrapping
  const mat = new THREE.RawShaderMaterial({ glslVersion: THREE.GLSL3, vertexShader: 'in vec3 position; in vec2 uv; ' + COPY_VS, fragmentShader: COPY_FS, uniforms: { src: { value: null } }, depthTest: false })
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat)
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const prev = renderer.getRenderTarget()
  list.forEach((src, k) => {
    ;[src.color, src.normalRough, src.sfx, src.scratches, src.spectrum, src.glitterNormal].forEach((t, i) => {
      if (!t) return
      t.flipY = false
      t.minFilter = t.magFilter = i === 5 ? THREE.NearestFilter : THREE.LinearFilter
      t.generateMipmaps = false
      t.needsUpdate = true
      mat.uniforms.src.value = t
      renderer.setRenderTarget(rt, k * 6 + i)
      renderer.render(quad, cam)
    })
  })
  renderer.setRenderTarget(prev)
  mat.dispose()
  quad.geometry.dispose()
  return {
    array: rt.texture, size,
    has: list.map((s) => ({ normalRough: !!s.normalRough, sfx: !!s.sfx, spectrum: !!s.spectrum, glitterNormal: !!s.glitterNormal })),
    dispose: () => rt.dispose(),
  }
}

const BLANK = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
BLANK.needsUpdate = true

export function stickerCard(def: StickerDef, tex: StickerTextures): { mesh: THREE.Mesh; setWear: (w: number) => void } {
  const u = stickerUniforms()
  setStickerUniforms(u, 0, def, tex, 0)
  u.uStCount.value = 1
  const material = new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, transparent: true, specularIntensity: 0.5 })
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        ${STICKER_GLSL}
        StickerOut gSt;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 V = normalize(vViewPosition);
          vec2 dx = dFdx(vMapUv), dy = dFdy(vMapUv);
          gSt = stickerEval(0, vMapUv, dx, dy, 1.0, 0.5, V, normal, stTbn(-vViewPosition, normal, vMapUv));
          normal = normalize(mix(normal, gSt.normal, gSt.alpha));
          diffuseColor = vec4(gSt.color, gSt.alpha);
          if (gSt.alpha < 0.02) discard;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = gSt.rough;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = gSt.metal;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += gSt.emissive * 2.5;`)
  }
  material.map = BLANK
  const geometry = new THREE.PlaneGeometry(1, 1)
  const uv = geometry.getAttribute('uv')
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i))
  const mesh = new THREE.Mesh(geometry, material)
  return { mesh, setWear: (w) => { (u.uStWear.value as THREE.Vector4[])[0].w = w } }
}
