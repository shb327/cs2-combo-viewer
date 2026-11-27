import * as THREE from 'three'
import { disposeMaterial } from '@/lib/viewer/dispose'
import { SHADER_DIR, comboId, fallbackTexture, loadCombo, type ComboInfo, type CompositeTable } from '@/lib/materials/composite'
import { GLOVE_RESOLVE, gloveMaterialParameters } from '@/lib/materials/glove-look'

/**
 * The game's glove compositor (csgo_customglove), as the asset pipeline exports it: one table (customglove.json:
 * parameters, expressions) and one fragment shader per static combo (cg_<id>.frag.glsl, its first line the combo's info), both derived from the
 * game's shader and served with the assets. Classic gloves use combo 0 (or 2 with anisotropic gloss), the newer ones 7.
 */
export interface GloveProgram {
  table: CompositeTable
  id: string
  combo: ComboInfo & { sets?: string[] }
  frag: string
}

export const GLOVE_SIZE = 2048

let tablePromise: Promise<CompositeTable> | null = null
const fragCache = new Map<string, string>()

export function loadGloveTable(base: string): Promise<CompositeTable> {
  tablePromise ??= fetch(base + SHADER_DIR + 'customglove.json').then((r) => {
    if (!r.ok) throw new Error(`customglove.json: HTTP ${r.status} (run the pipeline's shader steps)`)
    return r.json() as Promise<CompositeTable>
  })
  tablePromise.catch(() => { tablePromise = null })
  return tablePromise
}

/** The glove compositor's program for a material's features (F_BACKWARDS_COMPATIBILITY, F_ANISOTROPIC_GLOSS, F_TINT_ID). */
export async function loadGloveProgram(base: string, features: Record<string, number>): Promise<GloveProgram> {
  const table = await loadGloveTable(base)
  const id = String(comboId(table, features))
  const loaded = await loadCombo(base, table, 'cg', id)
  if (!loaded) throw new Error(`Glove combo ${id} not exported (run the pipeline's shader steps)`)
  let frag = fragCache.get(id)
  if (frag === undefined) { frag = safeEmboss(loaded.frag); fragCache.set(id, frag) }
  return { table, id, combo: loaded.combo, frag }
}

/** The texture families the combo samples as 4-layer arrays (g_tDetail1 … 4 → g_tDetail). */
export const comboSets = (p: GloveProgram): string[] => p.combo.sets ?? p.table.sets ?? []

/** A texture the material doesn't set, sampled as the game would: its sRGB flag from the shader's table. */
export const isSrgb = (p: GloveProgram, name: string): boolean => p.table.ps[name]?.srgb ?? false
export { fallbackTexture }

export const GLOVE_VS_TYPES: Record<string, string> = {
  g_vUvScale1: 'vec2', g_vUvOffset1: 'vec2', g_vUvScale2: 'vec2', g_vUvOffset2: 'vec2', g_vUvScale3: 'vec2', g_vUvOffset3: 'vec2',
  g_vUvScale4: 'vec2', g_vUvOffset4: 'vec2', g_vDamageTexCoordXform0: 'vec4', g_vDamageTexCoordXform1: 'vec4',
  g_vGrimeTexCoordXform0: 'vec4', g_vGrimeTexCoordXform1: 'vec4', g_vPatternTexCoordScale: 'vec2', g_bFlipFixup: 'int',
  g_fPatternNormalDistortion: 'float', g_vPatternTexCoordXform0: 'vec4', g_vPatternTexCoordXform1: 'vec4',
}

/**
 * The vertex stage's uniform for one of its variables. Some share a name with the fragment stage's (combos 0 and 2:
 * g_vPatternTexCoordXform0/1) but have their own expressions, and three.js would make one uniform of the two.
 */
export const vsUniform = (name: string): string => 'vs_' + name

/**
 * The game's vertex shader for the glove compositor (decompiled, both of its combos): the quad in UV space and the UVs
 * it derives. The classic combo only reads location 0 (the UV); the newer one reads all seven.
 */
export function gloveVertexShader(inputs: Record<string, string>): string {
  const outs: Record<number, [string, string]> = {
    0: ['vec4', 'vec4(uv0, uv0)'],
    1: ['vec4', 'vec4(xf(flipped, g_vPatternTexCoordXform0, g_vPatternTexCoordXform1), vec2(g_fPatternNormalDistortion) * g_vPatternTexCoordScale)'],
    2: ['vec4', 'vec4(uv0 * g_vUvScale1 + g_vUvOffset1, uv0 * g_vUvScale2 + g_vUvOffset2)'],
    3: ['vec4', 'vec4(uv0 * g_vUvScale3 + g_vUvOffset3, uv0 * g_vUvScale4 + g_vUvOffset4)'],
    4: ['vec4', 'vec4(xf(uv0, g_vDamageTexCoordXform0, g_vDamageTexCoordXform1), xf(uv0, g_vGrimeTexCoordXform0, g_vGrimeTexCoordXform1))'],
    5: ['vec3', 'vec3(0.0, 0.0, 1.0)'],
    6: ['vec4', 'vec4(1.0, 0.0, 0.0, 1.0)'],
  }
  const used = Object.keys(inputs).map(Number)
  const vsUniforms = used.some((l) => l > 0) ? Object.entries(GLOVE_VS_TYPES).map(([n, t]) => `uniform ${t} ${vsUniform(n)};\n#define ${n} ${vsUniform(n)}`).join('\n') : ''
  return `precision highp float;
precision highp int;
in vec3 position;
in vec2 uv;
uniform vec2 uUvOffset;
${vsUniforms}
${Object.entries(inputs).map(([loc, name]) => `out ${outs[+loc][0]} ${name};`).join('\n')}
vec2 xf(vec2 p, vec4 x0, vec4 x1) { return vec2(dot(p, x0.xy) + x0.w, dot(p, x1.xy) + x1.w); }
void main() {
  vec2 uv0 = uv + uUvOffset;
  ${used.some((l) => l > 0) ? 'vec2 flipped = g_bFlipFixup != 0 ? vec2(-uv0.x, uv0.y) : uv0;' : ''}
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
export function safeEmboss(frag: string): string {
  const patched = frag.replace(/normalize\(cross\((dFdy\(\w+\)), (dFdx\(\w+\))\)\)/g, 'safeNormalize(cross($1, $2))')
  if (patched === frag) return frag
  return patched.replace('void main()', 'vec3 safeNormalize(vec3 v) { float l = length(v); return l > 1e-12 ? v / l : vec3(0.0, 0.0, 1.0); }\n\nvoid main()')
}

export const QUAD_VS = `in vec3 position;
in vec2 uv;
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`

/**
 * The four per-mode targets the game's shader renders into and the 4-output target GLOVE_RESOLVE packs them into, with the
 * MeshPhysicalMaterial reading it. Shared by the classic and the newer gloves.
 */
export class GloveTargets {
  readonly modes: THREE.WebGLRenderTarget[]
  readonly target: THREE.WebGLRenderTarget
  readonly resolve: THREE.RawShaderMaterial
  readonly material: THREE.MeshPhysicalMaterial

  constructor(sheenScale: number) {
    const rt = () => new THREE.WebGLRenderTarget(GLOVE_SIZE, GLOVE_SIZE, {
      type: THREE.HalfFloatType, depthBuffer: false, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
    })
    this.modes = [rt(), rt(), rt(), rt()]
    this.resolve = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: QUAD_VS, fragmentShader: GLOVE_RESOLVE, depthTest: false, depthWrite: false,
      uniforms: {
        uAlbedo: { value: this.modes[0].texture }, uNormal: { value: this.modes[1].texture },
        uMetal: { value: this.modes[2].texture }, uAo: { value: this.modes[3].texture },
      },
    })
    this.target = new THREE.WebGLRenderTarget(GLOVE_SIZE, GLOVE_SIZE, {
      count: 4, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
    })
    for (const t of this.target.textures) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace }
    const [albedo, normal, orm, cloth] = this.target.textures
    /** The resolve writes linear albedo: stored as sRGB (SRGB8_ALPHA8), so dark tones don't band as in 8-bit linear. */
    albedo.colorSpace = THREE.SRGBColorSpace
    const { sheenColor, ...parameters } = gloveMaterialParameters({ albedo, normal, orm, cloth }, sheenScale)
    this.material = new THREE.MeshPhysicalMaterial({ ...parameters, sheenColor: new THREE.Color(sheenColor, sheenColor, sheenColor) })
  }

  /** The game's shader once per output mode (albedo, normal, metalness, AO), then the resolve. */
  render(renderer: THREE.WebGLRenderer, quad: THREE.Mesh, program: THREE.RawShaderMaterial, camera: THREE.Camera): void {
    const previous = renderer.getRenderTarget()
    quad.material = program
    this.modes.forEach((target, mode) => {
      program.uniforms.g_nOutputMode.value = mode
      renderer.setRenderTarget(target)
      renderer.render(quad, camera)
    })
    quad.material = this.resolve
    renderer.setRenderTarget(this.target)
    renderer.render(quad, camera)
    renderer.setRenderTarget(previous)
  }

  dispose(): void {
    disposeMaterial(this.material)
    this.resolve.dispose()
    this.target.dispose()
    for (const t of this.modes) t.dispose()
  }
}
