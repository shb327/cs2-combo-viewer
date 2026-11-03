import * as THREE from 'three'
import { texXform } from '@/lib/materials/weapon'
import type { GloveItem } from '@/lib/data/items'
import type { RandomFloat } from '@/lib/data/rng'
import frag from './generated/customglove.frag.glsl?raw'
import shaderDefaults from './generated/customglove.defaults.json'

/** A material dumped by steam-tools/cs2-3d-pipeline/vmat_to_json.py. */
export interface Vmat {
  shader: string
  ints: Record<string, number>
  floats: Record<string, number>
  vectors: Record<string, number[]>
  textures: Record<string, string>
}

const VERT = `
in vec3 position;
uniform vec2 uUvOffset;
out vec2 vUv;
void main() {
  vUv = uUvOffset + position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`

/** The shader's uniforms and their GLSL types. */
const DECLARED = [...frag.matchAll(/^uniform (?:highp )?(\w+) (\w+);$/gm)].map(([, type, name]) => ({ type, name }))
const DEFAULTS = shaderDefaults as Record<string, number[] | string | null>
const SIZE = 2048

/** A texture placement as the composite's two affine rows: uv' = (dot(uv, r0.xy) + r0.w, dot(uv, r1.xy) + r1.w). */

const COPY_FRAG = `
precision highp float;
uniform sampler2D uSrc;
in vec2 vUv;
out vec4 oColor;
void main() { oColor = texture(uSrc, vUv); }`

/**
 * WebGL allows 16 textures per pass and the composite uses 21, so the per-layer sets (detail, detail
 * normal, damage normal, grunge — 1 to 4) go into 4-layer texture arrays, copied on the GPU (a 2D
 * canvas would premultiply the alpha and wipe normals stored with alpha 0).
 */
export const LAYER_SETS = ['g_tDetail', 'g_tDetailNormal', 'g_tDamageNormal', 'g_tGrunge'] as const

export function packLayers(renderer: THREE.WebGLRenderer, layers: THREE.Texture[]): { texture: THREE.Texture; dispose: () => void } {
  const { width, height } = layers[0].image as { width: number; height: number }
  const target = new THREE.WebGLArrayRenderTarget(width, height, layers.length, {
    generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
  })
  target.texture.wrapS = target.texture.wrapT = THREE.RepeatWrapping
  const copy = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: COPY_FRAG, depthTest: false, depthWrite: false,
    uniforms: { uSrc: { value: null }, uUvOffset: { value: new THREE.Vector2() } },
  })
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copy)
  const camera = new THREE.Camera()
  const previous = renderer.getRenderTarget()
  layers.forEach((layer, i) => {
    copy.uniforms.uSrc.value = layer
    renderer.setRenderTarget(target, i)
    renderer.render(quad, camera)
  })
  renderer.setRenderTarget(previous)
  copy.dispose()
  quad.geometry.dispose()
  return { texture: target.texture, dispose: () => target.dispose() }
}

export class GloveFinish {
  readonly material: THREE.MeshPhysicalMaterial
  private readonly target: THREE.WebGLRenderTarget
  private readonly composite: THREE.RawShaderMaterial
  private readonly quad: THREE.Mesh
  private readonly camera = new THREE.Camera()
  private dirty = true

  constructor(
    private readonly item: GloveItem,
    private readonly vmat: Vmat,
    textures: Record<string, THREE.Texture>,
    readonly side: 'left' | 'right',
  ) {
    const uniforms: Record<string, THREE.IUniform> = {
      uUvOffset: { value: new THREE.Vector2(side === 'right' ? -1 : 0, 0) },
    }
    for (const { type, name } of DECLARED) {
      uniforms[name] = { value: type.startsWith('sampler') ? textures[name] ?? null : this.paramValue(type, name) }
    }
    this.composite = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false,
    })
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.composite)
    this.quad.frustumCulled = false

    this.target = new THREE.WebGLRenderTarget(SIZE, SIZE, {
      count: 4, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
    })
    const [albedo, normal, orm, cloth] = this.target.textures
    for (const t of this.target.textures) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace }
    const sheen = vmat.floats.g_flSheenScale ?? (DEFAULTS.g_flSheenScale as number[])[0]
    this.material = new THREE.MeshPhysicalMaterial({
      map: albedo, normalMap: normal, aoMap: orm, roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1,
      sheen: 1, sheenColor: new THREE.Color(1, 1, 1).multiplyScalar(Math.min(1, sheen * 0.5)), sheenColorMap: cloth, sheenRoughness: 0.6,
    })
  }

  /** A shader uniform's value: the material's, derived, or the shader's default. */
  private paramValue(type: string, name: string): unknown {
    const v = this.vmat
    const num = (n: string, i = 0) => v.floats[n] ?? v.ints[n] ?? v.vectors[n]?.[i] ?? (DEFAULTS[n] as number[] | undefined)?.[i] ?? 0
    const blackPoint = /^g_fDetailBlackPointCompensation(\d)$/.exec(name)
    if (blackPoint) return 1 - num('g_fDetailBlackPoint' + blackPoint[1])
    switch (name) {
      case 'g_bPattern': return v.ints.F_PATTERN ? 1 : 0
      case 'g_nOutputMode': return 0
      case 'g_fWearProgress': return 0
      case 'g_fFlipFixup': return this.flip ? -1 : 1
      case 'g_fPaintShadowPower': return Math.max(0.01, num('g_fPaintThickness') * 0.15)
      case 'g_nPatternReplaceIndex': return num('g_nPatternReplaceIndex') - 1
    }
    if (/TexCoordXform|TexRotationXform/.test(name)) return new THREE.Vector4()
    const vec = v.vectors[name] ?? (Array.isArray(DEFAULTS[name]) ? (DEFAULTS[name] as number[]) : [num(name)])
    switch (type) {
      case 'vec2': return new THREE.Vector2(vec[0], vec[1] ?? 0)
      case 'vec3': return new THREE.Vector3(vec[0], vec[1] ?? 0, vec[2] ?? 0)
      case 'vec4': case 'ivec4': return new THREE.Vector4(vec[0], vec[1] ?? 0, vec[2] ?? 0, vec[3] ?? 0)
      default: return num(name)
    }
  }

  setFloat(f: number): void {
    /** The paint wears as the float raised to the kit's g_fWearExponent (Vice 0.5, Pandora's Box 1, Duct Tape 0.2): its vcompmat's wear curve. */
    const exponent = this.vmat.floats.g_fWearExponent ?? this.vmat.ints.g_fWearExponent ?? 1
    this.composite.uniforms.g_fWearProgress.value = Math.pow(Math.max(0, f), exponent)
    this.dirty = true
  }

  /**
   * This hand's g_bFlipFixup, as _shared_paint_generic.vcompmat sets it: the material whose model material carries the
   * "left" attribute (the left hand on most models, the right one on Hand Wraps / Driver / Specialist) gets the
   * paint's value inverted, the other one the paint's value. Items without that information: the right hand takes it.
   */
  private get flip(): boolean {
    const paint = !!this.vmat.ints.g_bFlipFixup
    const sides = this.item.leftAttrSides
    return sides ? (sides.includes(this.side) ? !paint : paint) : this.side === 'right' && paint
  }

  /**
   * The seed's rolls (gloves/paints/_shared_paint_generic.vcompmat; a kit's own instance_params only sets the bounds of the
   * ones it names — Hedge Maze and Pandora's Box fix the rotation at 30): pattern offset x/y, pattern rotation, then the
   * grunge offset x/y and rotation. The grunge is what wears the paint away, so where it wears follows the seed (skincraft.gg:
   * Hedge Maze at 0.8 wear differs between seeds).
   * The pattern is the shader's transform (texXform; g_bFlipFixup negates the rotation, and the shader negates u) on
   * u ∈ [0, 1], and the right hand's result has its x negated (the shader's p.x *= sign(u)). This composite runs the
   * right hand on u ∈ [−1, 0], hence its +1 shift. Matched against skinshotter's composites (Pandora, Cobalt Skulls,
   * both hands). The stream is this hand's own (see SkinViewer.setSeed).
   */
  setSeed(r: RandomFloat): void {
    const px = r(0, 1), py = r(0, 1), prot = r(0, 360)
    const gx = r(0, 1), gy = r(0, 1), grot = r(0, 360)
    const u = this.composite.uniforms
    const f = (n: string) => this.vmat.floats[n] ?? (DEFAULTS[n] as number[])[0]
    const rot = this.item.patternRotation ?? prot
    const flip = this.flip
    const right = this.side === 'right'
    const set = (name: string, [x0, x1]: [THREE.Vector4, THREE.Vector4]) => { u[name + '0'].value = x0; u[name + '1'].value = x1 }
    const [x0, x1] = texXform(f('g_fPatternTexCoordScale'), flip ? -rot : rot, [px, py])
    const shift = right ? (flip ? -1 : 1) : 0
    const sign = right ? -1 : 1
    u.g_vPatternTexCoordXform0.value = new THREE.Vector4(sign * x0.x, sign * x0.y, 0, sign * (x0.w + shift * x0.x))
    u.g_vPatternTexCoordXform1.value = new THREE.Vector4(x1.x, x1.y, 0, x1.w + shift * x1.x)
    set('g_vPatternTexRotationXform', texXform(1, flip ? rot : -rot, [0, 0]))
    set('g_vGrungeTexCoordXform', texXform(f('g_fGrungeTexCoordScale'), grot, [gx, gy]))
    set('g_vGrungeTexRotationXform', texXform(1, -grot, [0, 0]))
    this.dirty = true
  }

  /** Re-render the composite if the float or the seed changed (call before drawing the frame). */
  update(renderer: THREE.WebGLRenderer): void {
    if (!this.dirty) return
    this.dirty = false
    const previous = renderer.getRenderTarget()
    renderer.setRenderTarget(this.target)
    renderer.render(this.quad, this.camera)
    renderer.setRenderTarget(previous)
  }

  dispose(): void {
    this.material.dispose()
    this.composite.dispose()
    this.quad.geometry.dispose()
    this.target.dispose()
  }
}
