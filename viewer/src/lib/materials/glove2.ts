import * as THREE from 'three'
import { valveRandom, type RandomFloat } from '@/lib/data/rng'
import type { KitRollPlan } from '@/lib/data/catalog'
import { evalExpr, uniformValue, type CompositeTable, type ExprContext } from '@/lib/materials/composite'
import { GLOVE_VS_TYPES, GloveTargets, comboSets, fallbackTexture, gloveVertexShader, isSrgb, loadGloveProgram, vsUniform, type GloveProgram } from '@/lib/materials/glove-shared'
import { packLayers } from '@/lib/materials/glove'

type Params = Record<string, number | boolean | number[] | string>

export interface GloveV2Inputs {
  params: Params
  textures: Record<string, string>
  /** The final material's values (g_flSheenScale…). */
  material: Params
  rollPlan: KitRollPlan
  /** The hands whose model material carries the "left" attribute (the vcompmat's handedness container). */
  leftAttrSides?: ('left' | 'right')[]
}

/**
 * The game's combo for the kit's static features, as its passes leave them (the compositor template sets all three;
 * a paint without F_TINT_ID turns that one off).
 */
const v2Features = (p: Params): Record<string, number> => Object.fromEntries(
  ['F_BACKWARDS_COMPATIBILITY', 'F_ANISOTROPIC_GLOSS', 'F_TINT_ID'].map((f) => [f, Number(p[f] ?? 0)]))

let averagesPromise: Promise<Record<string, number[]>> | null = null

export class GloveV2Finish {
  readonly material: THREE.MeshPhysicalMaterial
  private readonly program: THREE.RawShaderMaterial
  private readonly quad: THREE.Mesh
  private readonly camera = new THREE.Camera()
  private readonly targets: GloveTargets
  private readonly table: CompositeTable
  private readonly uniformList: [string, string][]
  private overrides: Record<string, number | number[]> = {}
  private dirty = true

  static async create(renderer: THREE.WebGLRenderer, base: string, inputs: GloveV2Inputs, side: 'left' | 'right',
    loadTexture: (path: string, srgb: boolean) => Promise<THREE.Texture>): Promise<GloveV2Finish> {
    averagesPromise ??= fetch(base + 'extracted/viewer/texture_average.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}))
    const [shader, averages] = await Promise.all([loadGloveProgram(base, v2Features(inputs.params)), averagesPromise])
    const load = async (name: string) => {
      const path = inputs.textures[name]
      return path ? loadTexture(path, isSrgb(shader, name)) : fallbackTexture(name)
    }
    const sets = comboSets(shader)
    const textures: Record<string, THREE.Texture> = {}
    await Promise.all(shader.combo.textures.filter((n) => !sets.includes(n)).map(async (n) => { textures[n] = await load(n) }))
    const disposers: (() => void)[] = []
    for (const set of sets) {
      const layers = await Promise.all([1, 2, 3, 4].map((i) => load(set + i)))
      const packed = packLayers(renderer, layers)
      textures[set] = packed.texture
      disposers.push(packed.dispose)
    }
    return new GloveV2Finish(shader, inputs, textures, side, averages, disposers)
  }

  private constructor(shader: GloveProgram, private readonly inputs: GloveV2Inputs, textures: Record<string, THREE.Texture>,
    readonly side: 'left' | 'right', private readonly averages: Record<string, number[]>, private readonly disposers: (() => void)[]) {
    this.table = shader.table
    this.uniformList = shader.combo.uniforms
    const uniforms: Record<string, THREE.IUniform> = { uUvOffset: { value: new THREE.Vector2(0, 0) } }
    for (const [name] of this.uniformList) uniforms[name] = { value: null }
    for (const [name, t] of Object.entries(textures)) uniforms[name] = { value: t }
    for (const name of Object.keys(GLOVE_VS_TYPES)) uniforms[vsUniform(name)] = { value: null }
    this.program = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: gloveVertexShader(shader.combo.inputs), fragmentShader: shader.frag, uniforms,
      depthTest: false, depthWrite: false,
    })
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.program)
    this.quad.frustumCulled = false
    this.targets = new GloveTargets(Number(inputs.material.g_flSheenScale ?? 1))
    this.material = this.targets.material
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
   * variables in order. The right hand is the material with seed_offset 1 (material_seed); the kit's sync flags
   * (instance_params) pick which seed the right hand's placement rolls use. A variable the container doesn't have
   * equals nothing: the game's own sync groups test instance_params.seed_offset, which never exists, so they never run.
   * Kits without that list fall back to one stream per hand.
   */
  rollSeed(seed: number): void {
    const plan = this.inputs.rollPlan
    if (!plan.groups?.length) return this.setSeed(valveRandom(this.side === 'right' ? seed + 1 : seed))
    const hand = this.side === 'right' ? '1' : '0'
    const passes = (c: { container: string; var: string; value: string; not: boolean }) => {
      const actual = c.container === 'material_seed' && c.var === 'seed_offset' ? hand
        : c.container === 'handedness' && c.var === 'left' ? (this.leftAttr ? '1' : '0')
          : plan.flags?.[c.var]
      return (actual !== undefined && actual === c.value) !== c.not
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
    // The vertex stage's own uniforms: some share a name with the fragment stage's but have their own expressions.
    for (const [name, type] of Object.entries(GLOVE_VS_TYPES)) u[vsUniform(name)].value = uniformValue(this.table.vs[name], name, type, ctx)
    this.targets.render(renderer, this.quad, this.program, this.camera)
  }

  dispose(): void {
    this.targets.dispose()
    this.program.dispose()
    this.quad.geometry.dispose()
    for (const d of this.disposers) d()
  }

  /** This hand's model material has the "left" attribute (Specialist: the right hand); without that list, the left hand. */
  private get leftAttr(): boolean {
    return this.inputs.leftAttrSides ? this.inputs.leftAttrSides.includes(this.side) : this.side === 'left'
  }

  private context(): ExprContext {
    const p = this.inputs.params
    const table = this.table
    const param = (name: string): number | number[] | string => {
      if (name in this.overrides) return this.overrides[name]
      // The vcompmat clears g_bFlipFixup on the hand whose material has the "left" attribute; the other keeps the paint's.
      if (name === 'g_bFlipFixup' && this.leftAttr) return 0
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
