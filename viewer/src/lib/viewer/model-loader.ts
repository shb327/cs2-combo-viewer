import * as THREE from 'three'
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DEFAULT_AGENT, loadAgents, type AgentModel } from '@/lib/data/agents'
import { GAME_ROOT, VIEWER_DATA, type DrawCall } from '@/lib/data/catalog'
import { SHARED, type GloveItem } from '@/lib/data/items'
import { kitRolls, valveRandom, weaponRolls } from '@/lib/data/rng'
import { WeaponComposite } from '@/lib/materials/composite'
import { GloveFinish, LAYER_SETS, packLayers, type Vmat } from '@/lib/materials/glove'
import { GloveV2Finish } from '@/lib/materials/glove2'
import { WeaponFinish, type WeaponItem } from '@/lib/materials/weapon'
import { loadPatchSlots, PatchLayer } from '@/lib/viewer/agent-patches'
import { adoptAncestors, anchorTorsoToArms, SkinnedGeometry, type ArmsSkeleton, type InspectClip, type RigPart, type WeaponRig } from '@/lib/viewer/firstperson'
import { hiddenPart, LOOSE_PIECES, nameDrawCalls, removeDetachedIslands, trianglesOnSide } from '@/lib/viewer/geometry'
import type { TextureSource } from '@/lib/viewer/textures'
import type { SkinViewerOptions } from '@/lib/viewer/viewer-options'

export type Finish = WeaponFinish | GloveFinish | GloveV2Finish
export const isGlove = (f: Finish): f is GloveFinish | GloveV2Finish => f instanceof GloveFinish || f instanceof GloveV2Finish

/** Rolls a glove finish's pattern: the right hand takes the next seed, as in the game. */
export function setGloveSeed(finish: GloveFinish | GloveV2Finish, seed: number): void {
  if (finish instanceof GloveV2Finish) finish.rollSeed(seed)
  else finish.setSeed(valveRandom(finish.side === 'right' ? seed + 1 : seed))
}

/** Rolls a weapon finish's pattern for its item (the kit's roll plan, or the weapon's). */
export function setWeaponSeed(finish: WeaponFinish, item: WeaponItem, seed: number): void {
  finish.setSeed(item.rollPlan ? kitRolls(seed, item.rollPlan) : weaponRolls(seed))
  finish.setSeedNumber(seed)
}

/** What a load leaves behind for the viewer: its finishes, what to dispose, the gloves' hands (to turn palm-up). */
export interface LoadSink {
  finishes: Finish[]
  disposables: (() => void)[]
  hands: { side: 'left' | 'right'; mesh: THREE.Object3D }[]
}

/** The arms' options for the gloves loaded as posed first-person (or third-person) arms. */
export interface GloveArms {
  /** Receives the skinned geometries, to be posed. */
  parts: SkinnedGeometry[]
  /** The arm's own material (the agent's skin), else the model's. */
  armCall?: DrawCall
  arms: { model: string; drawCalls: Record<string, DrawCall[]> }
  group?: 'viewmodel' | 'worldmodel'
}

const json = <T>(url: string): Promise<T> => fetch(url).then((r) => r.json() as Promise<T>)

/** Loads the models and their materials (weapons, gloves, agents' arms), leaving the finishes and disposables in `sink`. */
export class ModelLoader {
  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    readonly textures: TextureSource,
    readonly gltf: GLTFLoader,
    private readonly opts: SkinViewerOptions,
    private readonly sink: LoadSink,
  ) {}

  /** Where the first-person data (poses, skeletons, clips) is. */
  get firstPersonBase(): string {
    return this.opts.assetBase + VIEWER_DATA + 'firstperson/'
  }

  /** The glove inspect clips: the deploy, then the look. */
  gloveInspectClips(): Promise<InspectClip[]> {
    return Promise.all(['gloves_deploy', 'gloves_anim'].map((n) => json<InspectClip>(this.firstPersonBase + 'inspect/' + n + '.json')))
  }

  /**
   * The skeleton a skin glove model is skinned to: arms.json (glove_slick's, shared by most), or its own when it differs
   * (arms_models.json: glove_motorcycle has 54 bones in another order).
   */
  armsSkeleton(glove: GloveItem): Promise<ArmsSkeleton> {
    this.armsModels ??= json<Record<string, ArmsSkeleton>>(this.firstPersonBase + 'arms_models.json').catch(() => ({}))
    this.armsShared ??= json<ArmsSkeleton>(this.firstPersonBase + 'arms.json')
    return this.armsModels.then((own) => {
      const model = glove.model.replace(/\.glb$/, '')
      const key = Object.keys(own).find((k) => model.endsWith(k.replace(/\.vmdl$/, '')))
      return key ? own[key] : this.armsShared!
    })
  }
  private armsModels?: Promise<Record<string, ArmsSkeleton>>
  private armsShared?: Promise<ArmsSkeleton>

  /**
   * An agent's first-person arms: its sleeves, plus its arms with its default gloves — or, wearing skin `glove`s,
   * that glove model (its arm in the agent's skin). Their skeletons and geometries join `parts`, to be posed.
   */
  async firstPersonArms(agentId: string, glove: GloveItem | null, parts: RigPart[], patchLayers: PatchLayer[] = []): Promise<THREE.Object3D> {
    const [arms, agents] = await Promise.all([glove ? this.armsSkeleton(glove) : null, loadAgents(this.opts.assetBase)])
    const entry = agents.agent.get(agentId) ?? agents.agent.get(DEFAULT_AGENT)!
    const agent = agents.models[entry.model]
    if (!agent.glb) throw new Error('No first-person arms for ' + entry.name)
    const root = new THREE.Group()
    root.add(await this.agentArms(agent, parts, !glove, patchLayers))
    if (glove) {
      /** The arm's skin: the bare_arm call (its order next to the default glove's varies by agent). */
      const armCalls = agent.drawCalls.firstperson_default_gloves_arms ?? []
      const armCall = armCalls.find((c) => /bare_arm/.test(c.material)) ?? armCalls[0]
      const geometries: SkinnedGeometry[] = []
      root.add(await this.gloves(glove, { parts: geometries, armCall, arms: { model: glove.model, drawCalls: glove.drawCalls ?? {} } }))
      /** The glove models share the twist bones (forearm roll) with the agent's sleeves, so they take the same constraints. */
      parts.push({ skeleton: { ...adoptAncestors(arms!, agent.skeleton), twists: agent.skeleton.twists }, geometries })
    }
    return root
  }

  /**
   * An agent's first-person arms on the viewmodel: its sleeves, plus (with `defaultGloves`) its arms wearing its default
   * gloves. The meshes are bound to the agent model's own skeleton, whose bones bone-merge by name.
   */
  private async agentArms(agent: AgentModel, parts: RigPart[], defaultGloves: boolean, patchLayers: PatchLayer[]): Promise<THREE.Object3D> {
    const patchSlots = await loadPatchSlots(this.opts.assetBase, VIEWER_DATA)
    const geometries: SkinnedGeometry[] = []
    parts.push({ skeleton: agent.skeleton, geometries })
    const scene = (await this.gltf.loadAsync(this.textures.url(GAME_ROOT + agent.glb!))).scene
    scene.updateMatrixWorld(true)
    const root = new THREE.Group()
    for (const [group, calls] of Object.entries(agent.drawCalls)) {
      if (group !== 'firstperson_sleeves' && !defaultGloves) continue
      const meshes: THREE.Mesh[] = []
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh && (o.name.endsWith(group) || o.parent?.name.endsWith(group))) meshes.push(o)
      })
      meshes.forEach((o, i) => {
        const call = calls[i] ?? calls[0]
        const g = o.geometry.toNonIndexed().applyMatrix4(o.matrixWorld)
        anchorTorsoToArms(g, agent.skeleton)
        geometries.push(new SkinnedGeometry(g))
        const material = call ? this.plainMaterial(call) : new THREE.MeshStandardMaterial()
        /** A few agents' sleeves share the body's material: they wear its patches too. */
        const slots = call && patchSlots[call.material]
        if (slots) patchLayers.push(new PatchLayer(material, slots))
        root.add(new THREE.Mesh(g, material))
      })
    }
    return root
  }

  /**
   * A model's own material, without a finish. csgo_character (agents) packs it differently from the weapons: its
   * "metalness" texture is R metalness, B cloth mask, and the roughness is the normal map's alpha.
   */
  plainMaterial(call: DrawCall): THREE.Material {
    const character = call.shader === 'csgo_character.vfx'
    const m = new THREE.MeshPhysicalMaterial({ roughness: 1, metalness: 1, name: call.material.split('/').pop() })
    if (call.tint) m.color.setRGB(call.tint[0], call.tint[1], call.tint[2], THREE.SRGBColorSpace)
    const t = this.textures
    const set = (key: 'map' | 'normalMap' | 'roughnessMap' | 'aoMap', path: string | null | undefined, srgb: boolean) => {
      if (!path) return
      t.load(GAME_ROOT + path, srgb).then((tex) => { m[key] = tex; if (key === 'roughnessMap') m.metalnessMap = tex; m.needsUpdate = true }).catch(() => {})
    }
    const anisoGloss = { value: null as THREE.Texture | null }
    if (character && call.aniso) {
      t.load(GAME_ROOT + call.aniso, false).then((tex) => { anisoGloss.value = tex }).catch(() => {})
      m.customProgramCacheKey = () => 'character-aniso'
    }
    m.onBeforeCompile = (shader) => {
      if (character && call.aniso) {
        shader.uniforms.anisoGloss = anisoGloss
        shader.fragmentShader = 'uniform sampler2D anisoGloss;\n' + shader.fragmentShader
      }
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <roughnessmap_fragment>', character && call.aniso ? `#include <roughnessmap_fragment>
          #ifdef USE_NORMALMAP
            roughnessFactor = clamp(texture2D(anisoGloss, vNormalMapUv).r, 0.04, 1.0);
          #endif` : character ? `#include <roughnessmap_fragment>
          #ifdef USE_NORMALMAP
            roughnessFactor = clamp(texture2D(normalMap, vNormalMapUv).a, 0.04, 1.0);
          #endif` : `#include <roughnessmap_fragment>
          #ifdef USE_ROUGHNESSMAP
            roughnessFactor = texture2D(roughnessMap, vRoughnessMapUv).r;
          #endif`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
          #ifdef USE_METALNESSMAP
            metalnessFactor = texture2D(metalnessMap, vMetalnessMapUv).${character ? 'r' : 'g'};
          #endif`)
    }
    set('map', call.color, true)
    set('normalMap', call.normal, false)
    set('roughnessMap', call.rough, false)
    set('aoMap', call.ao, false)
    this.sink.disposables.push(() => m.dispose())
    return m
  }

  /** One weapon finish (the paint's textures and composite) for an item. */
  private async weaponFinish(item: WeaponItem): Promise<WeaponFinish> {
    const t = this.textures
    const paintPath = 'paint' in item ? item.paint : undefined
    const masksPath = 'masks' in item ? item.masks : undefined
    const posPath = 'pos' in item ? item.pos : undefined
    const surfacePath = 'surface' in item ? item.surface : undefined
    const [paint, wear, grunge, base, normal, orm, rough, ao, masks, pos, surface] = await Promise.all([
      paintPath ? t.load(paintPath, ['custom', 'gunsmith', 'patina'].includes(item.style)) : t.blank,
      t.load(item.wearTexture ?? SHARED.wear, false), t.load(item.grungeTexture ?? SHARED.grunge, true),
      t.load(item.base, true), t.optional(item.normal, false), t.optional(item.orm, false), t.optional(item.rough, false),
      t.optional(item.ao, true),
      masksPath ? t.load(masksPath, false) : t.blank,
      posPath ? t.exr(posPath) : t.blank,
      surfacePath ? t.load(surfacePath, false) : t.blank,
    ])
    const composite = item.style === 'composite'
      ? await WeaponComposite.create(this.renderer, this.opts.assetBase, item.composite, (path, srgb) => (path.endsWith('.exr') ? t.exr(path) : t.load(path, srgb)))
      : null
    const glitterPath = item.style === 'composite' ? item.composite.materialTextures?.g_tGlitterNormal : undefined
    const glitterNormal = glitterPath ? await t.load(glitterPath, false) : null
    return new WeaponFinish(item, {
      paint, wear, grunge, base, ao, masks, pos, surface,
      normal: item.normal ? normal : null, orm: item.orm ? orm : null, rough: item.rough ? rough : null,
    }, this.opts, glitterNormal, composite)
  }

  /** A weapon's model with its finish (and its parts' own finishes or plain materials). */
  /**
   * Lets a held weapon be posed bone by bone (`weapon.userData.rig`, read by poseRig): its model's own skeleton
   * (build_weapon_skeletons.py) and its visible meshes as skinned geometries in the model's space. Without a skeleton
   * the weapon stays rigid, placed at the hand.
   */
  async rigWeapon(item: WeaponItem, root: THREE.Object3D): Promise<void> {
    const skeletons = await json<Record<string, ArmsSkeleton>>(this.firstPersonBase + 'weapon_skeletons.json').catch(() => ({} as Record<string, ArmsSkeleton>))
    const key = (this.opts.modelOverride ?? item.model).replace(/^.*?game\//, '')
    const skeleton = skeletons[key]
    if (!skeleton) return
    root.updateMatrixWorld(true)
    const geometries: SkinnedGeometry[] = []
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.visible || !o.geometry.getAttribute('skinIndex')) return
      o.geometry = o.geometry.toNonIndexed().applyMatrix4(o.matrixWorld)
      o.matrix.identity()
      o.matrixAutoUpdate = false
      geometries.push(new SkinnedGeometry(o.geometry))
    })
    root.userData.rig = { skeleton, geometries, model: key } satisfies WeaponRig
  }

  async weapon(item: WeaponItem): Promise<THREE.Object3D> {
    const t = this.textures
    const finish = await this.weaponFinish(item)
    this.sink.finishes.push(finish)
    const partFinishes: Record<string, WeaponFinish> = {}
    for (const [material, part] of Object.entries(item.parts ?? {})) {
      if (part.style === 'glove') continue
      partFinishes[material] = await this.weaponFinish(part as WeaponItem)
      this.sink.finishes.push(partFinishes[material])
    }
    const root = (await this.gltf.loadAsync(t.url(this.opts.modelOverride ?? item.model))).scene
    const hide = (item.mesh ?? 'body_legacy') === 'body_hd' ? /body_legacy/ : /body_hd/
    if (item.drawCalls) nameDrawCalls(root, item.drawCalls)
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      if (item.drawCalls) {
        const call = o.userData.drawCall as { mesh: string; call?: DrawCall } | undefined
        if (!call || call.mesh !== item.mesh || !call.call || call.call.sticker || hiddenPart(item, call.mesh, call.call)) { o.visible = false; return }
        if (call.mesh === 'body_hd' && LOOSE_PIECES.test(item.id)) removeDetachedIslands(o.geometry)
      } else if (hide.test(o.name) || hide.test(o.parent?.name ?? '')) { o.visible = false; return }
      WeaponFinish.preparePaintUv(o.geometry, this.opts.paintUv1)
      const call = o.userData.drawCall?.call as DrawCall | undefined
      const first = item.drawCalls?.[item.mesh ?? '']?.find((c) => !c.sticker && !c.missing)
      if (call && first && call.material !== first.material) {
        o.material = partFinishes[call.material]?.material ?? this.plainMaterial(call)
      } else o.material = finish.material
    })
    return root
  }

  /**
   * The gloves. On their own: the glove model has both hands in its reference pose (plus the arm); the viewmodel
   * gloves are kept, each centered on itself, fingers up and side by side — mirror images, so one shows its back and
   * the other its palm, like the official render (their hands join the sink). As arms (`fp`): the glove model's skinned
   * meshes (the gloves, if any, and the bare arms), to be posed.
   */
  async gloves(item: GloveItem | null, fp?: GloveArms): Promise<THREE.Object3D> {
    const group = new RegExp(fp?.group ?? 'viewmodel')
    const t = this.textures
    const src = item ?? fp!.arms
    const vmat = !item ? null : typeof item.vmat === 'string' ? await (await fetch(t.url(item.vmat))).json() as Vmat : item.vmat
    const entries = await Promise.all(Object.entries(vmat?.textures ?? {}).map(async ([name, path]) =>
      [name, await t.load(item!.textureRoot + path.replace(/\.vtex$/, '.png'), false)] as const))
    const textures: Record<string, THREE.Texture> = Object.fromEntries(entries)
    for (const set of !item || item.v2 ? [] : LAYER_SETS) {
      const packed = packLayers(this.renderer, [1, 2, 3, 4].map((i) => textures[set + i]))
      textures[set] = packed.texture
      this.sink.disposables.push(packed.dispose)
    }
    const scene = (await this.gltf.loadAsync(t.url(src.model))).scene
    if (src.drawCalls) nameDrawCalls(scene, src.drawCalls)
    scene.updateMatrixWorld(true)
    const pieces: { material: 'left' | 'right' | 'arm'; geometry: THREE.BufferGeometry; call?: DrawCall }[] = []
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !group.test(o.parent?.name ?? '') && !group.test(o.name)) return
      const m = /glove_\w+_(left|right)$/.exec((o.material as THREE.Material).name ?? '')
      if (fp && /^bare_arm/.test((o.material as THREE.Material).name ?? '')) {
        pieces.push({ material: 'arm', geometry: o.geometry.toNonIndexed().applyMatrix4(o.matrixWorld), call: o.userData.drawCall?.call })
        return
      }
      if (!item) return
      if (m) pieces.push({ material: m[1] as 'left' | 'right' | 'arm', geometry: o.geometry.toNonIndexed().applyMatrix4(o.matrixWorld) })
    })
    if (!pieces.length) throw new Error('No glove meshes in ' + src.model)
    const finishes: Partial<Record<'left' | 'right', GloveFinish | GloveV2Finish>> = {}
    if (item?.v2) {
      for (const side of ['left', 'right'] as const) {
        finishes[side] = await GloveV2Finish.create(this.renderer, this.opts.assetBase, item.v2, side, (p, srgb) => t.load(p, srgb))
        this.sink.finishes.push(finishes[side]!)
      }
    }
    const finishFor = (side: 'left' | 'right' | 'arm') => {
      if (side === 'arm') throw new Error('arms have no glove finish')
      if (!finishes[side]) { finishes[side] = new GloveFinish(item!, vmat!, textures, side); this.sink.finishes.push(finishes[side]!) }
      return finishes[side]!
    }
    const root = new THREE.Group()
    if (fp) {
      const arm = new THREE.MeshStandardMaterial()
      for (const piece of pieces) {
        for (const sign of [1, -1] as const) {
          const g = trianglesOnSide(piece.geometry, sign)
          if (!g) continue
          fp.parts.push(new SkinnedGeometry(g))
          const armCall = fp.armCall ?? piece.call
          const mat = piece.material === 'arm' ? armCall ? this.plainMaterial(armCall) : arm : finishFor(piece.material).material
          root.add(new THREE.Mesh(g, mat))
        }
      }
      return root
    }
    ;(['left', 'right'] as const).forEach((side, i) => {
      const hand = new THREE.Group()
      for (const piece of pieces) {
        const g = trianglesOnSide(piece.geometry, side === 'left' ? 1 : -1)
        if (g) hand.add(new THREE.Mesh(g, finishFor(piece.material).material))
      }
      if (!hand.children.length) return
      const box = new THREE.Box3().setFromObject(hand)
      const c = box.getCenter(new THREE.Vector3())
      for (const child of hand.children) (child as THREE.Mesh).geometry.translate(-c.x, -c.y, -c.z)
      this.sink.hands.push({ side, mesh: hand })
      const slot = new THREE.Group()
      slot.add(hand)
      slot.position.x = (i - 0.5) * box.getSize(new THREE.Vector3()).x * 1.35
      root.add(slot)
    })
    return root
  }
}
