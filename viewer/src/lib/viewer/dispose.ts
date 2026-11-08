import * as THREE from 'three'

/**
 * Frees a material and the textures it holds, in its properties, its uniforms and the uniforms it adds to a built-in
 * shader (registered with `addedUniforms`, for materials extended in onBeforeCompile). Render-target textures (composites,
 * the environment) belong to their targets and are left to them. A texture still used elsewhere is only uploaded
 * again when next drawn. Without this, every switch of combo left its textures on the GPU (about 50 per combo).
 */
const added = new WeakMap<THREE.Material, Record<string, THREE.IUniform>>()

/** The uniforms a material adds to its built-in shader in onBeforeCompile: their textures are freed with it. */
export function addedUniforms(material: THREE.Material, uniforms: Record<string, THREE.IUniform>): void {
  added.set(material, uniforms)
}

export function disposeMaterial(material: THREE.Material): void {
  disposeMaterials([material])
}

export function disposeMaterials(materials: Iterable<THREE.Material>): void {
  const textures = new Set<THREE.Texture>()
  const take = (v: unknown) => { if (v instanceof THREE.Texture && !v.isRenderTargetTexture) textures.add(v) }
  for (const m of materials) {
    for (const v of Object.values(m)) take(v)
    const uniforms = [m instanceof THREE.ShaderMaterial ? m.uniforms : null, added.get(m)]
    for (const set of uniforms) {
      for (const u of Object.values(set ?? {})) {
        if (Array.isArray(u.value)) u.value.forEach(take)
        else take(u.value)
      }
    }
    m.dispose()
  }
  for (const t of textures) t.dispose()
}
