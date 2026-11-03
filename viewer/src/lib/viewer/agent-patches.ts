import * as THREE from 'three'

/** One of an agent material's three patch slots (build_agent_patches.py): the game's placement on the texture sheet. */
export interface PatchSlot {
  /** The patch is 1 / scale of the sheet wide (the item's own `scale` multiplies it). */
  scale: number
  /** Radians. */
  rotation: number
  squash: number
  /** UV units from the sheet's center. */
  offset: [number, number]
  /** 0: no backing cloth behind the patch. */
  backing: number
}

/** A patch worn in a slot: the patch kit's id (db.json's patches key) and the item's scale for it (1.0 = as designed). */
export interface AgentPatch {
  id: string
  scale: number
}

const SLOTS = 3

/** The agent materials' patch slots, by material path; loaded once per asset root. */
const loaded = new Map<string, Promise<Record<string, PatchSlot[]>>>()
export function loadPatchSlots(base: string, dataRoot: string): Promise<Record<string, PatchSlot[]>> {
  let p = loaded.get(base)
  if (!p) {
    p = fetch(base + dataRoot + 'agent_patches.json').then((r) => r.json() as Promise<Record<string, PatchSlot[]>>).catch(() => ({}))
    loaded.set(base, p)
  }
  return p
}

/**
 * Patches on an agent's body material (csgo_character F_PATCHES): each worn patch is drawn over the color texture
 * where the slot's placement puts it, its embroidery's alpha mixing it into the cloth.
 */
export class PatchLayer {
  private readonly uniforms = {
    uPatch0: { value: null as THREE.Texture | null },
    uPatch1: { value: null as THREE.Texture | null },
    uPatch2: { value: null as THREE.Texture | null },
    uBack0: { value: null as THREE.Texture | null },
    uBack1: { value: null as THREE.Texture | null },
    uBack2: { value: null as THREE.Texture | null },
    uPatchOn: { value: new THREE.Vector3() },
    uPatchScale: { value: new THREE.Vector3(1, 1, 1) },
    uPatchRot: { value: new THREE.Vector3() },
    uPatchSquash: { value: new THREE.Vector3(1, 1, 1) },
    uPatchBack: { value: new THREE.Vector3() },
    uPatchOff: { value: [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()] },
  }

  constructor(material: THREE.Material, private readonly slots: PatchSlot[]) {
    const previous = material.onBeforeCompile
    const key = material.customProgramCacheKey.bind(material)
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer)
      Object.assign(shader.uniforms, this.uniforms)
      /**
       * csgo_character's F_PATCHES, as the game's pixel shader does it (decompiled): with p = uv - 0.5 - offset, the patch's
       * coordinate is rotate(p * scale with its y times squash) + 0.5; outside 0..1 there is no patch. A backing scale
       * draws the backing cloth under the patch at another scale (below 1: the cloth is the smaller one), the patch's alpha
       * mixing it over the cloth.
       */
      shader.fragmentShader = `
        uniform sampler2D uPatch0, uPatch1, uPatch2, uBack0, uBack1, uBack2;
        uniform vec3 uPatchOn, uPatchScale, uPatchRot, uPatchSquash, uPatchBack;
        uniform vec2 uPatchOff[3];
        vec2 patchUv(vec2 p, float scale, float squash, float rot) {
          vec2 q = p * scale;
          q.y *= squash;
          float c = cos(rot), s = sin(rot);
          return vec2(q.x * c - q.y * s, q.x * s + q.y * c) + 0.5;
        }
        bool patchOut(vec2 t) { return t.x < 0.0 || t.x > 1.0 || t.y < 0.0 || t.y > 1.0; }
        void patchApply(inout vec3 color, sampler2D patchTex, sampler2D backTex, vec2 uv, vec2 off, float scale, float squash, float rot, float backing) {
          vec2 p = uv - 0.5 - off;
          vec2 uvPatch = patchUv(p, scale, squash, rot);
          if (patchOut(uvPatch)) return;
          vec2 uvBack = uvPatch;
          if (backing != 0.0) {
            float b = abs(backing);
            if (b < 1.0) uvBack = patchUv(p, scale / b, squash, rot);
            else uvPatch = patchUv(p, scale * b, squash, rot);
          }
          vec4 t = texture2D(patchTex, uvPatch);
          vec4 cloth = backing != 0.0 ? texture2D(backTex, uvBack) : vec4(0.0);
          vec4 layer = backing != 0.0 ? vec4(mix(cloth.rgb, t.rgb, t.a), max(t.a, cloth.a)) : t;
          color = mix(color, layer.rgb, layer.a);
        }
      ` + shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        #ifdef USE_MAP
          if (uPatchOn.x > 0.5) patchApply(diffuseColor.rgb, uPatch0, uBack0, vMapUv, uPatchOff[0], uPatchScale.x, uPatchSquash.x, uPatchRot.x, uPatchBack.x);
          if (uPatchOn.y > 0.5) patchApply(diffuseColor.rgb, uPatch1, uBack1, vMapUv, uPatchOff[1], uPatchScale.y, uPatchSquash.y, uPatchRot.y, uPatchBack.y);
          if (uPatchOn.z > 0.5) patchApply(diffuseColor.rgb, uPatch2, uBack2, vMapUv, uPatchOff[2], uPatchScale.z, uPatchSquash.z, uPatchRot.z, uPatchBack.z);
        #endif`)
    }
    material.customProgramCacheKey = () => key() + '-patches'
    slots.forEach((s, i) => {
      this.uniforms.uPatchRot.value.setComponent(i, s.rotation)
      this.uniforms.uPatchSquash.value.setComponent(i, s.squash || 1)
      this.uniforms.uPatchBack.value.setComponent(i, s.backing)
      this.uniforms.uPatchOff.value[i].set(s.offset[0], s.offset[1])
    })
  }

  /** Wears `worn` (one per slot, null = empty) with their textures (the patch's and its backing cloth's). */
  set(worn: (AgentPatch | null)[], textures: ({ patch: THREE.Texture; backing: THREE.Texture | null } | null)[]): void {
    for (let i = 0; i < SLOTS; i++) {
      const slot = this.slots[i]
      const patch = worn[i], tex = textures[i]
      const on = !!(slot && slot.scale > 0 && patch && tex)
      this.uniforms.uPatchOn.value.setComponent(i, on ? 1 : 0)
      this.uniforms[`uPatch${i}` as 'uPatch0'].value = on ? tex!.patch : null
      this.uniforms[`uBack${i}` as 'uBack0'].value = on ? tex!.backing : null
      this.uniforms.uPatchScale.value.setComponent(i, on ? slot.scale / (patch!.scale > 0 ? patch!.scale : 1) : 1)
    }
  }
}
