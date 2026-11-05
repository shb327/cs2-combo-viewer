import * as THREE from 'three'
import { texXform } from '@/lib/materials/weapon'
import type { GloveItem } from '@/lib/data/items'
import type { RandomFloat } from '@/lib/data/rng'
import { uniformValue, type ExprContext } from '@/lib/materials/composite'
import type { Value } from '@/lib/materials/composite-expr'
import { GLOVE_VS_TYPES, GloveTargets, gloveVertexShader, type GloveProgram } from '@/lib/materials/glove-shared'

/** A glove paint's material (the kit's vmat): its features, values and textures. */
export interface Vmat {
  shader: string
  ints: Record<string, number>
  floats: Record<string, number>
  vectors: Record<string, number[]>
  textures: Record<string, string>
}

/** The material's static features (F_*), which pick the compositor's combo. */
export const vmatFeatures = (vmat: Vmat): Record<string, number> =>
  Object.fromEntries(Object.entries(vmat.ints).filter(([k]) => k.startsWith('F_')))

const COPY_VERT = `
in vec3 position;
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`

const COPY_FRAG = `
precision highp float;
uniform sampler2D uSrc;
in vec2 vUv;
out vec4 oColor;
void main() { oColor = texture(uSrc, vUv); }`

/**
 * WebGL allows 16 textures per pass and the glove compositor uses up to 37, so its per-layer families (1 to 4) go into
 * 4-layer texture arrays (the pipeline rewrites the shader to match), copied on the GPU: a 2D canvas would
 * premultiply the alpha and wipe normals stored with alpha 0.
 */
export function packLayers(renderer: THREE.WebGLRenderer, layers: THREE.Texture[]): { texture: THREE.Texture; dispose: () => void } {
  const { width, height } = layers[0].image as { width: number; height: number }
  const target = new THREE.WebGLArrayRenderTarget(width, height, layers.length, {
    generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
  })
  target.texture.wrapS = target.texture.wrapT = THREE.RepeatWrapping
  const copy = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3, vertexShader: COPY_VERT, fragmentShader: COPY_FRAG, depthTest: false, depthWrite: false,
    uniforms: { uSrc: { value: null } },
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

/**
 * A classic glove finish (csgo_customglove without F_BACKWARDS_COMPATIBILITY): the game's compositor, run once per output
 * mode on this hand's UVs, then resolved into the material's maps. The seed placement, the hand's flip and the wear curve
 * are set here; every other parameter is the material's value, the shader's default, or the shader's own expression.
 */
export class GloveFinish {
  readonly material: THREE.MeshPhysicalMaterial
  private readonly targets: GloveTargets
  private readonly program: THREE.RawShaderMaterial
  private readonly quad: THREE.Mesh
  private readonly camera = new THREE.Camera()
  /** Values set by the seed and the float, over the material's. */
  private readonly overrides: Record<string, Value> = {}
  private dirty = true

  constructor(
    private readonly item: GloveItem,
    private readonly vmat: Vmat,
    textures: Record<string, THREE.Texture>,
    readonly side: 'left' | 'right',
    private readonly shader: GloveProgram,
  ) {
    const { combo } = shader
    const uniforms: Record<string, THREE.IUniform> = {
      uUvOffset: { value: new THREE.Vector2(side === 'right' ? -1 : 0, 0) },
    }
    for (const [name] of combo.uniforms) uniforms[name] = { value: null }
    for (const name of combo.textures) uniforms[name] = { value: textures[name] ?? null }
    for (const name of Object.keys(GLOVE_VS_TYPES)) uniforms[name] ??= { value: null }
    this.program = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: gloveVertexShader(combo.inputs), fragmentShader: shader.frag, uniforms,
      depthTest: false, depthWrite: false,
    })
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.program)
    this.quad.frustumCulled = false
    this.targets = new GloveTargets(this.number('g_flSheenScale'))
    this.material = this.targets.material
  }

  /** A scalar parameter: the material's value, else the shader's default. */
  private number(name: string): number {
    const v = this.vmat
    return v.floats[name] ?? v.ints[name] ?? v.vectors[name]?.[0] ?? this.shader.table.ps[name]?.default?.[0] ?? 0
  }

  private context(): ExprContext {
    const v = this.vmat
    const table = this.shader.table
    const param = (name: string): Value => {
      if (name in this.overrides) return this.overrides[name]
      if (name === 'g_bFlipFixup') return this.flip ? 1 : 0
      if (name.startsWith('g_t')) return name
      if (name in v.vectors) return v.vectors[name]
      if (name in v.floats) return v.floats[name]
      if (name in v.ints) return v.ints[name]
      const d = table.ps[name]?.default ?? table.vs[name]?.default
      const n = table.ps[name]?.elements ?? table.vs[name]?.elements ?? 1
      return d ? (n > 1 ? d.slice(0, n) : d[0]) : 0
    }
    return { param, ext: param, feature: (i) => Number(v.ints[table.features[i]] ?? 0) }
  }

  setFloat(f: number): void {
    /** The paint wears as the float raised to the kit's g_fWearExponent (Vice 0.5, Pandora's Box 1, Duct Tape 0.2): its vcompmat's wear curve. */
    const exponent = this.vmat.floats.g_fWearExponent ?? this.vmat.ints.g_fWearExponent ?? 1
    this.overrides.g_fWearProgress = Math.pow(Math.max(0, f), exponent)
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
   * ones it names — Hedge Maze and Pandora's Box fix the rotation at 30, Crimson Kimono at 25.2): pattern offset x/y,
   * pattern rotation, then the grunge offset x/y and rotation. The grunge is what wears the paint away, so where it
   * wears follows the seed.
   * The pattern is the shader's transform (texXform; g_bFlipFixup negates the rotation, and the shader negates u) on
   * u ∈ [0, 1], and the right hand's result has its x negated (the shader's p.x *= sign(u)). This composite runs the
   * right hand on u ∈ [−1, 0], hence its +1 shift. The stream is this hand's own (see SkinViewer.setSeed).
   */
  setSeed(r: RandomFloat): void {
    const px = r(0, 1), py = r(0, 1), prot = r(0, 360)
    const gx = r(0, 1), gy = r(0, 1), grot = r(0, 360)
    const rot = this.item.patternRotation ?? prot
    const flip = this.flip
    const right = this.side === 'right'
    const o = this.overrides
    const vec = (x: THREE.Vector4) => [x.x, x.y, x.z, x.w]
    const set = (name: string, [x0, x1]: [THREE.Vector4, THREE.Vector4]) => { o[name + '0'] = vec(x0); o[name + '1'] = vec(x1) }
    const [x0, x1] = texXform(this.number('g_fPatternTexCoordScale'), flip ? -rot : rot, [px, py])
    const shift = right ? (flip ? -1 : 1) : 0
    const sign = right ? -1 : 1
    o.g_vPatternTexCoordXform0 = [sign * x0.x, sign * x0.y, 0, sign * (x0.w + shift * x0.x)]
    o.g_vPatternTexCoordXform1 = [x1.x, x1.y, 0, x1.w + shift * x1.x]
    set('g_vPatternTexRotationXform', texXform(1, flip ? rot : -rot, [0, 0]))
    set('g_vGrungeTexCoordXform', texXform(this.number('g_fGrungeTexCoordScale'), grot, [gx, gy]))
    set('g_vGrungeTexRotationXform', texXform(1, -grot, [0, 0]))
    this.dirty = true
  }

  /** Re-render the composite if the float or the seed changed (call before drawing the frame). */
  update(renderer: THREE.WebGLRenderer): void {
    if (!this.dirty) return
    this.dirty = false
    const u = this.program.uniforms
    const ctx = this.context()
    const table = this.shader.table
    for (const [name, type] of this.shader.combo.uniforms) {
      // The seed's and the float's values win over the shader's own expressions for them.
      u[name].value = uniformValue(name in this.overrides ? undefined : table.ps[name], name, type, ctx)
    }
    // The vertex stage's variables share names with the fragment stage's (g_vPatternTexCoordXform0/1): a name the
    // fragment shader declares keeps its value from above, or the seed's placement would be reset to the default.
    const fragment = new Set(this.shader.combo.uniforms.map(([name]) => name))
    for (const [name, type] of Object.entries(GLOVE_VS_TYPES)) {
      if (!fragment.has(name)) u[name].value = uniformValue(table.vs[name], name, type, ctx)
    }
    this.targets.render(renderer, this.quad, this.program, this.camera)
  }

  dispose(): void {
    this.targets.dispose()
    this.program.dispose()
    this.quad.geometry.dispose()
  }
}
