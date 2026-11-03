import * as THREE from 'three'
import { valveRandom, type RandomFloat } from '@/lib/data/rng'
import type { KitRollPlan } from '@/lib/data/catalog'
import { SHADER_DIR, evalExpr, fallbackTexture, uniformValue, type CompositeTable, type ExprContext } from '@/lib/materials/composite'
import { packLayers } from '@/lib/materials/glove'

const SIZE = 2048
const COMBO = '7'
type Params = Record<string, number | boolean | number[] | string>

export interface GloveV2Inputs {
  params: Params
  textures: Record<string, string>
  /** The final material's values (g_flSheenScale…). */
  material: Params
  rollPlan: KitRollPlan
}

let tablePromise: Promise<CompositeTable> | null = null
let fragPromise: Promise<string> | null = null
let averagesPromise: Promise<Record<string, number[]>> | null = null

const VS_TYPES: Record<string, string> = {
  g_vUvScale1: 'vec2', g_vUvOffset1: 'vec2', g_vUvScale2: 'vec2', g_vUvOffset2: 'vec2', g_vUvScale3: 'vec2', g_vUvOffset3: 'vec2',
  g_vUvScale4: 'vec2', g_vUvOffset4: 'vec2', g_vDamageTexCoordXform0: 'vec4', g_vDamageTexCoordXform1: 'vec4',
  g_vGrimeTexCoordXform0: 'vec4', g_vGrimeTexCoordXform1: 'vec4', g_vPatternTexCoordScale: 'vec2', g_bFlipFixup: 'int',
  g_fPatternNormalDistortion: 'float', g_vPatternTexCoordXform0: 'vec4', g_vPatternTexCoordXform1: 'vec4',
}

/** The game's vertex shader (combo with F_BACKWARDS_COMPATIBILITY, decompiled): the quad in UV space and the UVs it derives. */
function vertexShader(inputs: Record<string, string>): string {
  const outs: Record<number, [string, string]> = {
    0: ['vec4', 'vec4(uv0, uv0)'],
    1: ['vec4', 'vec4(xf(flipped, g_vPatternTexCoordXform0, g_vPatternTexCoordXform1), vec2(g_fPatternNormalDistortion) * g_vPatternTexCoordScale)'],
    2: ['vec4', 'vec4(uv0 * g_vUvScale1 + g_vUvOffset1, uv0 * g_vUvScale2 + g_vUvOffset2)'],
    3: ['vec4', 'vec4(uv0 * g_vUvScale3 + g_vUvOffset3, uv0 * g_vUvScale4 + g_vUvOffset4)'],
    4: ['vec4', 'vec4(xf(uv0, g_vDamageTexCoordXform0, g_vDamageTexCoordXform1), xf(uv0, g_vGrimeTexCoordXform0, g_vGrimeTexCoordXform1))'],
    5: ['vec3', 'vec3(0.0, 0.0, 1.0)'],
    6: ['vec4', 'vec4(1.0, 0.0, 0.0, 1.0)'],
  }
  return `precision highp float;
precision highp int;
in vec3 position;
in vec2 uv;
uniform vec2 uUvOffset;
${Object.entries(VS_TYPES).map(([n, t]) => `uniform ${t} ${n};`).join('\n')}
${Object.entries(inputs).map(([loc, name]) => `out ${outs[+loc][0]} ${name};`).join('\n')}
vec2 xf(vec2 p, vec4 x0, vec4 x1) { return vec2(dot(p, x0.xy) + x0.w, dot(p, x1.xy) + x1.w); }
void main() {
  vec2 uv0 = uv + uUvOffset;
  vec2 flipped = g_bFlipFixup != 0 ? vec2(-uv0.x, uv0.y) : uv0;
${Object.entries(inputs).map(([loc, name]) => `  ${name} = ${outs[+loc][1]};`).join('\n')}
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`
}

/**
 * The pattern paint's emboss (F_PUFFY_PAINT → g_bPatternPaintEmboss) takes a surface normal from screen derivatives
 * inside a branch. Derivatives in non-uniform control flow are undefined in GLSL; under WebGL they can come out zero,
 * and normalize(0) is NaN, which then fills the whole normal output (Occult, Knit Argyle). A zero cross product falls
 * back to the flat normal instead.
 */
function safeEmboss(frag: string): string {
  const patched = frag.replace(/normalize\(cross\((dFdy\(\w+\)), (dFdx\(\w+\))\)\)/g, 'safeNormalize(cross($1, $2))')
  if (patched === frag) return frag
  return patched.replace('void main()', 'vec3 safeNormalize(vec3 v) { float l = length(v); return l > 1e-12 ? v / l : vec3(0.0, 0.0, 1.0); }\n\nvoid main()')
}

/** The game's outputs (one render target each) → albedo, normal map, ORM, sheen color (pre-linearized values undone). */
const RESOLVE = `precision highp float;
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
  float cloth = cv(m.z);
  oAlbedo = vec4(albedo, 1.0);
  oNormal = vec4(vec3(nn.x, -nn.y, nn.z) * 0.5 + 0.5, 1.0);
  oOrm = vec4(cv(texture(uAo, vUv).x), cv(n.z), cv(m.y), 1.0);
  oCloth = vec4(albedo * clamp(cloth, 0.0, 1.0), 1.0);
}`
const QUAD_VS = `in vec3 position;
in vec2 uv;
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

export class GloveV2Finish {
  readonly material: THREE.MeshPhysicalMaterial
  private readonly program: THREE.RawShaderMaterial
  private readonly resolve: THREE.RawShaderMaterial
  private readonly quad: THREE.Mesh
  private readonly camera = new THREE.Camera()
  private readonly modes: THREE.WebGLRenderTarget[]
  private readonly target: THREE.WebGLRenderTarget
  private overrides: Record<string, number | number[]> = {}
  private dirty = true

  static async create(renderer: THREE.WebGLRenderer, base: string, inputs: GloveV2Inputs, side: 'left' | 'right',
    loadTexture: (path: string, srgb: boolean) => Promise<THREE.Texture>): Promise<GloveV2Finish> {
    tablePromise ??= fetch(base + SHADER_DIR + 'customglove.json').then((r) => r.json())
    fragPromise ??= fetch(base + SHADER_DIR + `cg_${COMBO}.frag.glsl`).then((r) => r.text()).then(safeEmboss)
    averagesPromise ??= fetch(base + 'extracted/viewer/texture_average.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
    const [table, frag, averages] = await Promise.all([tablePromise, fragPromise, averagesPromise])
    const combo = table.combos[COMBO]
    const load = async (name: string) => {
      const path = inputs.textures[name]
      return path ? loadTexture(path, table.ps[name]?.srgb ?? false) : fallbackTexture(name)
    }
    const textures: Record<string, THREE.Texture> = {}
    await Promise.all(combo.textures.map(async (n) => { textures[n] = await load(n) }))
    const disposers: (() => void)[] = []
    for (const set of table.sets ?? []) {
      const layers = await Promise.all([1, 2, 3, 4].map((i) => load(set + i)))
      const packed = packLayers(renderer, layers)
      textures[set] = packed.texture
      disposers.push(packed.dispose)
    }
    return new GloveV2Finish(table, combo.uniforms, combo.inputs, frag, inputs, textures, side, averages, disposers)
  }

  private constructor(private readonly table: CompositeTable,
    private readonly uniformList: [string, string][], inputsLayout: Record<string, string>, frag: string,
    private readonly inputs: GloveV2Inputs, textures: Record<string, THREE.Texture>, readonly side: 'left' | 'right',
    private readonly averages: Record<string, number[]>, private readonly disposers: (() => void)[]) {
    const uniforms: Record<string, THREE.IUniform> = { uUvOffset: { value: new THREE.Vector2(0, 0) } }
    for (const [name] of uniformList) uniforms[name] = { value: null }
    for (const [name, t] of Object.entries(textures)) uniforms[name] = { value: t }
    for (const name of Object.keys(VS_TYPES)) uniforms[name] = { value: null }
    this.program = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: vertexShader(inputsLayout), fragmentShader: frag, uniforms, depthTest: false, depthWrite: false,
    })
    const rt = () => {
      const t = new THREE.WebGLRenderTarget(SIZE, SIZE, { type: THREE.HalfFloatType, depthBuffer: false, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping })
      return t
    }
    this.modes = [rt(), rt(), rt(), rt()]
    this.resolve = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: QUAD_VS, fragmentShader: RESOLVE, depthTest: false, depthWrite: false,
      uniforms: {
        uAlbedo: { value: this.modes[0].texture }, uNormal: { value: this.modes[1].texture },
        uMetal: { value: this.modes[2].texture }, uAo: { value: this.modes[3].texture },
      },
    })
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.program)
    this.quad.frustumCulled = false
    this.target = new THREE.WebGLRenderTarget(SIZE, SIZE, {
      count: 4, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
    })
    for (const t of this.target.textures) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace }
    const [albedo, normal, orm, cloth] = this.target.textures
    const sheen = Number(inputs.material.g_flSheenScale ?? 1)
    this.material = new THREE.MeshPhysicalMaterial({
      map: albedo, normalMap: normal, aoMap: orm, roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1,
      sheen: 1, sheenColor: new THREE.Color(1, 1, 1).multiplyScalar(Math.min(1, sheen * 0.5)), sheenColorMap: cloth, sheenRoughness: 0.6,
    })
  }

  /**
   * The wear the compositor sees is the float raised to 1/2.2 (gamma-encoded): matched against skinshotter's
   * composites (Brocade Flowers at 0.15 / 0.37 / 0.6 ≙ 0.42 / 0.64 / 0.79 of the raw value).
   */
  setFloat(f: number): void {
    const wear = Math.pow(Math.max(0, f), 1 / 2.2)
    this.overrides.g_flWearAmount = wear
    this.overrides.g_fWearProgress = wear
    this.dirty = true
  }

  /**
   * The paint seed's rolls as the kit's vcompmat runs them: each random-roll mutator whose conditions pass for this
   * hand restarts the stream from its seed (g_nRandomSeed = the seed, g_nRandomSeedAlt = seed + 1) and rolls its
   * variables in order. The right hand is the material with seed_offset 1; per-material sync flags pick which seed
   * the right hand's placement rolls use. Kits without that list fall back to one stream per hand.
   */
  rollSeed(seed: number): void {
    const plan = this.inputs.rollPlan
    if (!plan.groups?.length) return this.setSeed(valveRandom(this.side === 'right' ? seed + 1 : seed))
    const hand = this.side === 'right' ? '1' : '0'
    const passes = (c: { container: string; var: string; value: string; not: boolean }) => {
      const actual = c.var === 'seed_offset' ? hand : plan.flags?.[c.var] ?? '0'
      return (actual === c.value) !== c.not
    }
    for (const group of plan.groups) {
      if (!group.when.every(passes)) continue
      const r = valveRandom(group.seed === 'g_nRandomSeedAlt' ? seed + 1 : seed)
      for (const spec of group.vars) {
        const [name, comps = 'x'] = spec.split('.')
        const roll = plan.rolls.find((x) => x.var === name)
        const fixed = plan.fixed[name] ?? [0]
        const v = Array.from(comps, (_, i) => {
          const x = r(roll?.min?.[i] ?? 0, roll?.max?.[i] ?? 1)
          return !roll || roll.fixed || !roll.min ? fixed[i] ?? 0 : x
        })
        this.overrides[name] = v.length === 1 ? v[0] : v
      }
    }
    this.dirty = true
  }

  /** The kit's rolls (its vcompmat's list, in order) from this hand's stream. */
  setSeed(r: RandomFloat): void {
    const plan = this.inputs.rollPlan
    for (const roll of plan.rolls) {
      const fixed = plan.fixed[roll.var] ?? [0]
      const n = roll.min?.length ?? (/^g_v/.test(roll.var) ? 2 : 1)
      const v = Array.from({ length: n }, (_, i) => {
        const x = r(roll.min?.[i] ?? 0, roll.max?.[i] ?? 1)
        return roll.fixed || !roll.min ? fixed[i] ?? 0 : x
      })
      this.overrides[roll.var] = v.length === 1 ? v[0] : v
    }
    this.dirty = true
  }

  update(renderer: THREE.WebGLRenderer): void {
    if (!this.dirty) return
    this.dirty = false
    const u = this.program.uniforms
    const ctx = this.context()
    for (const [name, type] of this.uniformList) u[name].value = uniformValue(this.table.ps[name], name, type, ctx)
    for (const [name, type] of Object.entries(VS_TYPES)) u[name].value = uniformValue(this.table.vs[name], name, type, ctx)
    const previous = renderer.getRenderTarget()
    this.quad.material = this.program
    this.modes.forEach((target, mode) => {
      u.g_nOutputMode.value = mode
      renderer.setRenderTarget(target)
      renderer.render(this.quad, this.camera)
    })
    this.quad.material = this.resolve
    renderer.setRenderTarget(this.target)
    renderer.render(this.quad, this.camera)
    renderer.setRenderTarget(previous)
  }

  dispose(): void {
    this.material.dispose()
    this.program.dispose()
    this.resolve.dispose()
    this.quad.geometry.dispose()
    this.target.dispose()
    for (const t of this.modes) t.dispose()
    for (const d of this.disposers) d()
  }

  private context(): ExprContext {
    const p = this.inputs.params
    const table = this.table
    const param = (name: string): number | number[] | string => {
      if (name in this.overrides) return this.overrides[name]
      if (name === 'g_bFlipFixup' && this.side === 'left') return 0
      if (name.startsWith('g_t')) return name
      const v = p[name]
      if (typeof v === 'number') return v
      if (typeof v === 'boolean') return +v
      if (Array.isArray(v)) return /^g_vColorTint\d$/.test(name) ? v.map((x, i) => (i < 3 ? (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4) : x)) : v
      const d = table.ps[name]?.default ?? table.vs[name]?.default
      const n = table.ps[name]?.elements ?? table.vs[name]?.elements ?? 1
      return d ? (n > 1 ? d.slice(0, n) : d[0]) : 0
    }
    return {
      param: (n) => param(n) as number,
      ext: (n) => param(n) as number,
      feature: (i) => Number(p[table.features[i]] ?? 0),
      textureAverage: (name) => {
        const path = this.inputs.textures[name]
        return (path && this.averages[path.replace(/^extracted\/game\//, '')]) || [0.5, 0.5, 0.5, 1]
      },
    }
  }
}

export { evalExpr }
