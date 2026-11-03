import * as THREE from 'three'
import { evalExpr, vec, type ExprContext, type Instr, type Value } from '@/lib/materials/composite-expr'

export { evalExpr, type ExprContext }

export interface ShaderVar { default?: number[]; int?: boolean; expr?: Instr[]; srgb?: boolean; defaultTexture?: string; elements?: number }
export interface ComboInfo { values: Record<string, number>; uniforms: [string, string][]; textures: string[]; inputs: Record<string, string> }
export interface CompositeTable {
  sets?: string[]
  features: string[]
  static: string[]
  ps: Record<string, ShaderVar>
  vs: Record<string, ShaderVar>
  combos: Record<string, ComboInfo>
}

export const SHADER_DIR = 'extracted/viewer/shaders/'
const SIZE = 2048

let tablePromise: Promise<CompositeTable> | null = null
let channelsPromise: Promise<Record<string, number>> | null = null
const APPLY_CHANNELS = false

/** Decoded texture → channel count for the game's 1- / 2-channel formats (BC4 / BC5), which the GPU reads as
 * (r, 0, 0, 1) / (r, g, 0, 1) while the exported PNGs repeat the channel. */
function loadChannels(base: string): Promise<Record<string, number>> {
  channelsPromise ??= fetch(base + 'extracted/viewer/texture_channels.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
  return channelsPromise
}
const fragCache = new Map<string, Promise<string>>()

export function loadCompositeTable(base: string): Promise<CompositeTable> {
  tablePromise ??= fetch(base + SHADER_DIR + 'customweapon.json').then((r) => {
    if (!r.ok) throw new Error('customweapon.json: HTTP ' + r.status)
    return r.json()
  })
  return tablePromise
}

/** The static combo id: mixed radix over the shader's static combos (S_PAINT_STYLE 0–8, then the on/off ones). */
export function comboId(table: CompositeTable, features: Record<string, number>): number {
  const RANGE: Record<string, number> = { S_PAINT_STYLE: 9 }
  let id = 0, stride = 1
  for (const s of table.static) {
    id += (features['F_' + s.slice(2)] ?? 0) * stride
    stride *= RANGE[s] ?? 2
  }
  return id
}

/** One pass of the kit (its vcompmat GENERATE_TEXTURE): parameters and textures, already built from its layers. */
export interface PassInputs {
  params: Record<string, number | boolean | number[] | string>
  textures: Record<string, string>
}
export interface CompositeInputs { passes: Record<'color' | 'rough', PassInputs> }

/** One composite pass: the kit's static combo for it, its uniforms and textures, rendering into its own target. */
class CompositePass {
  readonly target: THREE.WebGLRenderTarget
  private readonly material: THREE.RawShaderMaterial
  private readonly quad: THREE.Mesh

  static async create(renderer: THREE.WebGLRenderer, base: string, table: CompositeTable, inputs: PassInputs,
    loadTexture: (path: string, srgb: boolean) => Promise<THREE.Texture>): Promise<CompositePass> {
    const features = Object.fromEntries(Object.entries(inputs.params).filter(([k]) => k.startsWith('F_')).map(([k, v]) => [k, Number(v)]))
    const id = String(comboId(table, features))
    const combo = table.combos[id]
    if (!combo) throw new Error(`Composite combo ${id} not exported (run port_weapon_shader.py)`)
    let frag = fragCache.get(id)
    if (!frag) {
      frag = fetch(base + SHADER_DIR + `cw_${id}.frag.glsl`).then((r) => r.text())
      fragCache.set(id, frag)
    }
    const textures: Record<string, THREE.Texture> = {}
    await Promise.all(combo.textures.map(async (name) => {
      const path = inputs.textures[name]
      const style = Number(inputs.params.F_PAINT_STYLE ?? 0)
      const srgb = name === 'g_tPattern' ? style >= 6 : table.ps[name]?.srgb ?? false
      textures[name] = path ? await loadTexture(path, srgb) : fallbackTexture(name)
    }))
    for (const name of ['g_tCaseHardeningColorRamp', 'g_tPatinaAgeColorRamp']) {
      const t = textures[name]
      if (t && inputs.textures[name]) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true }
    }
    const pattern = textures.g_tPattern
    if (pattern && inputs.textures.g_tPattern) {
      pattern.wrapS = addressMode(inputs.params.g_nPatternTextureHorizontalSampling)
      pattern.wrapT = addressMode(inputs.params.g_nPatternTextureVerticalSampling)
      pattern.needsUpdate = true
    }
    return new CompositePass(renderer, table, combo, await frag, inputs, textures)
  }

  private constructor(renderer: THREE.WebGLRenderer, private readonly table: CompositeTable, private readonly combo: ComboInfo,
    frag: string, private readonly inputs: PassInputs, textures: Record<string, THREE.Texture>) {
    const uniforms: Record<string, THREE.IUniform> = {}
    for (const [name] of combo.uniforms) uniforms[name] = { value: null }
    for (const name of combo.textures) uniforms[name] = { value: textures[name] }
    for (const name of VS_UNIFORMS) uniforms[name] = { value: null }
    this.material = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: vertexShader(combo.inputs), fragmentShader: frag, uniforms,
      depthTest: false, depthWrite: false,
    })
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material)
    this.quad.frustumCulled = false
    this.target = new THREE.WebGLRenderTarget(SIZE, SIZE, {
      type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, depthBuffer: false,
    })
    this.target.texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
  }

  render(renderer: THREE.WebGLRenderer, camera: THREE.Camera, overrides: Record<string, Value>, roughnessMode: number): void {
    const u = this.material.uniforms
    const ctx = this.context(overrides)
    for (const [name, type] of this.combo.uniforms) u[name].value = uniformValue(this.table.ps[name], name, type, ctx)
    for (const name of VS_UNIFORMS) u[name].value = uniformValue(this.table.vs[name], name, VS_TYPES[name], ctx)
    if (u.bRoughnessMode) u.bRoughnessMode.value = roughnessMode
    renderer.setRenderTarget(this.target)
    renderer.render(this.quad, camera)
  }

  dispose(): void {
    this.material.dispose()
    this.quad.geometry.dispose()
    this.target.dispose()
  }

  private context(overrides: Record<string, Value>): ExprContext {
    const p = this.inputs.params
    const param = (name: string): Value => {
      if (name in overrides) return overrides[name]
      const v = p[name]
      if (typeof v === 'number') return v
      if (typeof v === 'boolean') return +v
      if (Array.isArray(v)) return v
      const d = this.table.ps[name]?.default ?? this.table.vs[name]?.default
      const n = this.table.ps[name]?.elements ?? this.table.vs[name]?.elements ?? 1
      return d ? (n > 1 ? d.slice(0, n) : d[0]) : 0
    }
    return { param, ext: (name) => param(name), feature: (i) => Number(p[this.table.features[i]] ?? 0) }
  }
}

export function uniformValue(v: ShaderVar | undefined, name: string, type: string, ctx: ExprContext): unknown {
  const value = v?.expr ? evalExpr(v.expr, ctx) : ctx.param(name)
  const a = vec(value)
  switch (type) {
    case 'int': case 'bool': return Math.round(a[0] ?? 0)
    case 'float': return a[0] ?? 0
    case 'vec2': return new THREE.Vector2(a[0] ?? 0, a[1] ?? 0)
    case 'vec3': return new THREE.Vector3(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0)
    case 'vec4': return new THREE.Vector4(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0, a[3] ?? 0)
    case 'mat4': return new THREE.Matrix4().fromArray(a.length === 16 ? a : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
    default: return a[0] ?? 0
  }
}

/** The game's composite for one skin: the color pass and the roughness / metalness / pearlescence pass. */
export class WeaponComposite {
  private readonly camera = new THREE.Camera()

  static async create(renderer: THREE.WebGLRenderer, base: string, inputs: CompositeInputs,
    loadTexture: (path: string, srgb: boolean) => Promise<THREE.Texture>): Promise<WeaponComposite> {
    const [table, channels] = await Promise.all([loadCompositeTable(base), loadChannels(base)])
    const load = async (path: string, srgb: boolean) => {
      const n = APPLY_CHANNELS ? channels[path.replace(/^extracted\/game\//, '')] : 0
      const t = await loadTexture(path, n ? false : srgb)
      if (n) {
        t.format = n === 1 ? THREE.RedFormat : THREE.RGFormat
        t.needsUpdate = true
      }
      return t
    }
    const [color, rough] = await Promise.all([
      CompositePass.create(renderer, base, table, inputs.passes.color, load),
      CompositePass.create(renderer, base, table, inputs.passes.rough, load),
    ])
    return new WeaponComposite(renderer, color, rough)
  }

  private constructor(private readonly renderer: THREE.WebGLRenderer, private readonly colorPass: CompositePass,
    private readonly roughPass: CompositePass) {}

  get color(): THREE.WebGLRenderTarget { return this.colorPass.target }
  get rough(): THREE.WebGLRenderTarget { return this.roughPass.target }

  /** The float, and the seed's rolled values (variable → value); then re-render both passes. */
  update(overrides: Record<string, Value>): void {
    const previous = this.renderer.getRenderTarget()
    this.colorPass.render(this.renderer, this.camera, overrides, 0)
    this.roughPass.render(this.renderer, this.camera, overrides, 1)
    this.renderer.setRenderTarget(previous)
  }

  dispose(): void {
    this.colorPass.dispose()
    this.roughPass.dispose()
  }
}

/** The vertex shader's inputs to the pixel shader: the texture-space quad and the placements (its own code, decompiled). */
const VS_TYPES: Record<string, string> = {
  g_vPatternTexCoordXform0: 'vec4', g_vPatternTexCoordXform1: 'vec4', g_vWearTexCoordXform0: 'vec4', g_vWearTexCoordXform1: 'vec4',
  g_vGrungeTexCoordXform0: 'vec4', g_vGrungeTexCoordXform1: 'vec4', g_vOverlayTexCoordXform0: 'vec4', g_vOverlayTexCoordXform1: 'vec4',
  g_bOverlayUsesUniqueUVs: 'int', g_bOverlayUsesPatternUVs: 'int',
}
const VS_UNIFORMS = Object.keys(VS_TYPES)

function vertexShader(inputs: Record<string, string>): string {
  const outs: Record<number, [string, string]> = {
    0: ['vec4', 'vec4(1.0)'],
    1: ['vec4', 'vec4(uv, xf(uv, g_vPatternTexCoordXform0, g_vPatternTexCoordXform1))'],
    2: ['vec4', 'vec4(xf(uv, g_vWearTexCoordXform0, g_vWearTexCoordXform1), xf(uv, g_vGrungeTexCoordXform0, g_vGrungeTexCoordXform1))'],
    3: ['vec2', `g_bOverlayUsesPatternUVs != 0
      ? (g_bOverlayUsesUniqueUVs != 0 ? xf(uv, g_vOverlayTexCoordXform0, g_vOverlayTexCoordXform1) : xf(uv, g_vPatternTexCoordXform0, g_vPatternTexCoordXform1))
      : uv`],
  }
  const decl = Object.entries(inputs).map(([loc, name]) => `out ${outs[+loc][0]} ${name};`).join('\n')
  const body = Object.entries(inputs).map(([loc, name]) => `  ${name} = ${outs[+loc][1]};`).join('\n')
  return `precision highp float;
precision highp int;
in vec3 position;
in vec2 uv;
${VS_UNIFORMS.map((n) => `uniform ${VS_TYPES[n]} ${n};`).join('\n')}
${decl}
vec2 xf(vec2 p, vec4 x0, vec4 x1) { return vec2(dot(p, x0.xy) + x0.w, dot(p, x1.xy) + x1.w); }
void main() {
${body}
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`
}

/** RsTextureAddressMode_t: 0 wrap, 1 mirror, 2 clamp (3 border / 4 mirror-once: closest WebGL has). */
function addressMode(v: unknown): THREE.Wrapping {
  switch (Number(v ?? 0)) {
    case 1: case 4: return THREE.MirroredRepeatWrapping
    case 2: case 3: return THREE.ClampToEdgeWrapping
    default: return THREE.RepeatWrapping
  }
}

/** A texture the kit doesn't set: a neutral 1×1 (flat normal, no mask, full AO / white otherwise). */
export function fallbackTexture(name: string): THREE.Texture {
  const rgba = /Normal/.test(name) ? [128, 128, 255, 255] : /Mask|Overlay|Pearlescence|PaintMetalness/.test(name) ? [0, 0, 0, 0] : [255, 255, 255, 255]
  const t = new THREE.DataTexture(new Uint8Array(rgba), 1, 1)
  t.needsUpdate = true
  return t
}

/** The composite stores roughness / metalness pre-linearized (for an sRGB target): back to the plain values. */
export const COMPOSITE_ROUGH_GLSL = `
  float compositeValue(float l) { return l <= 0.0031308 ? l * 12.92 : 1.055 * pow(l, 1.0 / 2.4) - 0.055; }`
