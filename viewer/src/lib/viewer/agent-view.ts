import * as THREE from 'three'
import { loadAgents } from '@/lib/data/agents'
import { GAME_ROOT, VIEWER_DATA } from '@/lib/data/catalog'
import type { GloveItem } from '@/lib/data/items'
import type { WeaponFinish, WeaponItem } from '@/lib/materials/weapon'
import { addPose, adoptAncestors, poseRig, samplePose, SkinnedGeometry, type InspectClip, type RigPart, type WeaponBind } from '@/lib/viewer/firstperson'
import { isGlove, setGloveSeed, setWeaponSeed, type Finish, type ModelLoader } from '@/lib/viewer/model-loader'
import { addEyeAttributes, EyeLayer, loadEyes } from '@/lib/viewer/agent-eyes'
import { loadPatchSlots, PatchLayer } from '@/lib/viewer/agent-patches'
import type { Viewmodel } from '@/lib/viewer/viewer-options'

/** The agent's UI idle clip (looping), its skinned body (and skin gloves), the weapon it holds and its bind. */
export interface AgentRig {
  clip: InspectClip
  /** The main menu's additive idle layer (uimodel.vnmgraph: LayerBlend "Additive", looping), on top of `clip`. */
  layer: InspectClip | null
  parts: RigPart[]
  weapon: THREE.Object3D | null
  bind?: WeaponBind
  start: number
}

/** A loaded agent: its model, its rig (null in bind pose, without a clip), and the weapon and skin gloves it has on. */
export interface LoadedAgent {
  root: THREE.Object3D
  rig: AgentRig | null
  weapon: WeaponItem | null
  glove: GloveItem | null
  /** The body materials that can wear patches. */
  patches: PatchLayer[]
}

const json = <T>(url: string): Promise<T> => fetch(url).then((r) => r.json() as Promise<T>)

/**
 * A whole agent (third-person body and default gloves, or skin `glove`s) holding `weaponItem`, in the main menu's
 * idle for that weapon and the agent's team (build_agent_poses.py; animation/anims/ui_anims/main_menu); in bind pose
 * when there is no clip. Null when `stale` says a newer load started.
 */
export async function loadAgent(loader: ModelLoader, assetBase: string, id: string, glove: GloveItem | null, weaponItem: WeaponItem | null, stale: () => boolean): Promise<LoadedAgent | null> {
  const agents = await loadAgents(assetBase)
  const entry = agents.agent.get(id)
  if (!entry) throw new Error('No agent ' + id)
  const model = agents.models[entry.model]
  const base = assetBase + VIEWER_DATA
  const weaponName = weaponItem?.id.split('|')[0] ?? 'weapon_ak47'
  const team = /(^|_)ctm_/.test(id) ? 'ct' : 't'
  const [gltf, clip, binds, arms, layer, patchSlots, eyeData] = await Promise.all([
    loader.gltf.loadAsync(loader.textures.url(GAME_ROOT + model.body)),
    json<Record<string, Record<string, string>>>(base + 'agentposes/index.json')
      .then((idx) => (idx[team]?.[weaponName] ? json<InspectClip>(base + 'agentposes/' + idx[team][weaponName]) : null))
      .catch(() => null),
    json<Record<string, WeaponBind>>(base + 'firstperson/weapon_binds.json').catch(() => ({} as Record<string, WeaponBind>)),
    glove ? loader.armsSkeleton(glove).catch(() => null) : Promise.resolve(null),
    json<InspectClip>(base + 'agentposes/idle_layer.json').catch(() => null),
    loadPatchSlots(assetBase, VIEWER_DATA),
    loadEyes(assetBase, VIEWER_DATA),
  ])
  if (stale()) return null
  const scene = gltf.scene
  const root = new THREE.Group()
  scene.updateMatrixWorld(true)
  const geometries: SkinnedGeometry[] = []
  const patches: PatchLayer[] = []
  /** Skin gloves (their third-person "worldmodel" meshes) take the default gloves' place; they need the pose to sit right. */
  const skinGloves = !!(glove && clip && arms)
  for (const [group, calls] of Object.entries(model.drawCalls)) {
    if (!group.startsWith('thirdperson_') || (skinGloves && group === 'thirdperson_default_gloves')) continue
    const meshes: THREE.Mesh[] = []
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh && (o.name.endsWith(group) || o.parent?.name.endsWith(group))) meshes.push(o)
    })
    meshes.forEach((o, i) => {
      const call = calls[i] ?? calls[0]
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld)
      const eyeParams = call && eyeData.materials[call.material]
      const eyeBones = eyeData.models[entry.model]
      const eyes = eyeParams && eyeBones ? addEyeAttributes(g, eyeBones, o.matrixWorld) : null
      if (clip && g.getAttribute('skinIndex')) geometries.push(new SkinnedGeometry(g))
      const material = call ? loader.plainMaterial(call) : new THREE.MeshStandardMaterial()
      const slots = call && patchSlots[call.material]
      if (slots) patches.push(new PatchLayer(material, slots))
      if (eyes && eyeParams && eyeBones) {
        const eyeLayer = new EyeLayer(material, eyeParams, eyeBones, o.matrixWorld, eyes.scale)
        void Promise.all([loader.textures.load(GAME_ROOT + eyeParams.mask, false), loader.textures.load(GAME_ROOT + eyeParams.albedo, true)])
          .then(([mask, albedo]) => { albedo.wrapS = albedo.wrapT = THREE.ClampToEdgeWrapping; eyeLayer.set(mask, albedo); material.needsUpdate = true })
          .catch(() => {})
      }
      root.add(new THREE.Mesh(g, material))
    })
  }
  let held: THREE.Object3D | null = null
  if (clip && weaponItem) {
    held = await loader.weapon(weaponItem)
    await loader.rigWeapon(weaponItem, held)
    if (stale()) return null
    held.matrixAutoUpdate = false
    root.add(held)
  }
  const parts: RigPart[] = [{ skeleton: model.skeleton, geometries }]
  if (skinGloves) {
    const gloveParts: SkinnedGeometry[] = []
    root.add(await loader.gloves(glove, { parts: gloveParts, arms: { model: glove!.model, drawCalls: glove!.drawCalls ?? {} }, group: 'worldmodel' }))
    if (stale()) return null
    /** The glove models share the twist bones (forearm roll) with the agent. */
    parts.push({ skeleton: { ...adoptAncestors(arms!, model.skeleton), twists: model.skeleton.twists }, geometries: gloveParts })
  }
  return {
    root,
    rig: clip ? { clip, layer, parts, weapon: held, bind: binds[weaponName], start: performance.now() } : null,
    weapon: held ? weaponItem : null,
    glove: skinGloves ? glove : null,
    patches,
  }
}

/** Poses the agent at `t` seconds of its idle and of the additive layer over it (each looping on its own). */
export function poseAgent(rig: AgentRig, t: number): void {
  const pose = samplePose(rig.clip, t % rig.clip.duration)
  if (rig.layer) pose.viewmodel = addPose(pose.viewmodel, samplePose(rig.layer, t % rig.layer.duration).viewmodel)
  poseRig(rig.parts, pose, rig.weapon, rig.bind)
}

/** The agent's skin gloves' pattern and wear: the viewmodel's (shared with first person), else their own pattern. */
export function setAgentGloves(finishes: Finish[], glove: GloveItem, viewmodel: Viewmodel): void {
  const seed = viewmodel.gloveSeed ?? glove.seed
  for (const finish of finishes) {
    if (!isGlove(finish)) continue
    setGloveSeed(finish, seed)
    finish.setFloat(viewmodel.gloveFloat)
  }
}

/** The pattern and wear of the weapon the agent holds. */
export function setAgentWeapon(finishes: Finish[], item: WeaponItem, seed: number, float: number): void {
  for (const finish of finishes) {
    if (isGlove(finish)) continue
    setWeaponSeed(finish as WeaponFinish, item, seed)
    finish.setFloat(float)
  }
}
