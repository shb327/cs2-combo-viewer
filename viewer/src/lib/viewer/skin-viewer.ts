import { IS_MOBILE_DEVICE } from '@/lib/device'
import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { GloveItem, Item } from '@/lib/data/items'
import { TextureSource } from '@/lib/viewer/textures'
import type { WeaponItem } from '@/lib/materials/weapon'
import { loadAttachments } from '@/lib/data/attachments'
import { GAME_ROOT, VIEWER_DATA } from '@/lib/data/catalog'
import { PatchLayer, type AgentPatch } from '@/lib/viewer/agent-patches'
import { attackLabel, AUTO_CYCLE, primaryAttacks, secondaryAttack, sortAttacks, type AttackEntry, type AttackInfo } from '@/lib/data/attacks'
import { loadPatches } from '@/lib/data/patches'
import { defaultPetClip, loadPetClip, loadPets, petClips, type PetIndex, type PetModel } from '@/lib/data/pets'
import { loadPins } from '@/lib/data/pins'
import { DEFAULT_AGENT } from '@/lib/data/agents'
import { handIK, poseRig, samplePose, SkinnedGeometry, type InspectClip, type RigPart, type ViewmodelPose, type WeaponBind } from '@/lib/viewer/firstperson'
import type { CharmPart } from '@/lib/materials/charm'
import { packStickers, stickerCard } from '@/lib/materials/sticker'
import { FixedInspect } from '@/lib/viewer/fixed-inspect'
import { MapStage } from '@/lib/viewer/map-stage'
import { loadAgent, poseAgent, setAgentGloves, setAgentWeapon, type AgentRig } from '@/lib/viewer/agent-view'
import { isGlove, ModelLoader, setGloveSeed, setWeaponSeed, type LoadSink } from '@/lib/viewer/model-loader'
import { WeaponAttachments } from '@/lib/viewer/weapon-attachments'
import { DEFAULT_LIGHTING, DEFAULT_MAP_LIGHTING, DEFAULT_RENDER_QUALITY, DEFAULT_VIEWMODEL, type CharmOptions, type LightSource, type Lighting, type MapLighting, type RenderQuality, type SkinViewerOptions, type StickerOptions, type Viewmodel } from '@/lib/viewer/viewer-options'
import { cropToContent } from '@/lib/canvas'
import { AttachmentEditor, type EditorEvents } from '@/lib/viewer/attachment-editor'

export { DEFAULT_LIGHTING, DEFAULT_MAP_LIGHTING, DEFAULT_RENDER_QUALITY, DEFAULT_VIEWMODEL, type CharmOptions, type LightSource, type Lighting, type MapLighting, type RenderQuality, type SkinViewerOptions, type StickerOptions, type Viewmodel }

/**
 * The game's sticker card: a grey rounded card with a triangle pattern and a faint CS2 mark (materials/default/stickers/sticker_default_backing).
 * models/inventory_items/sticker_inspect/sticker_backing is the same card with a darker mark; skincraft.gg, which follows the game, shows this fainter one.
 */
const STICKER_CARD = 'materials/default/stickers/sticker_default_backing_psd_a8e114d8.png'
/** The card's side in sticker sides: the card is the sticker's own size, as skincraft.gg (which follows the game) draws it: measured against it, 1.02 matched. */
const STICKER_CARD_SIDE = 1.02

/**
 * A pet shown over a map is turned this far from facing the camera (degrees): its side and a bit of its front. The chick's
 * model faces the other way than the hens'; the egg is round, so it takes more room around it.
 */
const PET_TURN = -135
/** A pin's face looks along the model's X: turned this far to face the camera. */
const PIN_VIEW = { turn: -90, room: 1 }
const petView = (glb: string): { turn: number; room: number } =>
  /\/chick\.glb$/.test(glb) ? { turn: PET_TURN + 180, room: 1 } : /egg/.test(glb) ? { turn: 0, room: 1.6 } : { turn: PET_TURN, room: 1 }

/** Where the lights sit around the model (world space, before `angle`), as before lighting was adjustable. */
const KEY_POSITION = new THREE.Vector3(3, 4, 5)
const RIM_POSITION = new THREE.Vector3(-4, 2, -3)
/** Relative to the camera (right, up, toward the viewer): the key from over the shoulder, the rim from behind the model. */
const KEY_FROM_CAMERA = new THREE.Vector3(2.5, 3, 4)
const RIM_FROM_CAMERA = new THREE.Vector3(-3, 1.5, -5)
/** The orbit effect's speed (degrees per frame). */
const ORBIT_SPEED = 0.35

const INCH = 0.0254
/** Sway: how far (radians) the weapon leans toward the pointer at the edge of the view, and how fast it follows. */
const SWAY_YAW = 0.045
const SWAY_PITCH = 0.03
const SWAY_FOLLOW = 0.08

/** The first-person arms and weapon, kept to pose them again (the inspect animation). */
interface FirstPersonRig {
  idle: ViewmodelPose
  /** The idle when it moves (a knife's idle1: a breathing loop), played over and over instead of the still pose. */
  idleLoop?: InspectClip | null
  inspect: InspectClip | null
  /** The weapon's attack animations (shots, slashes…), the clips fetched when first played. */
  attacks: AttackEntry[]
  /** With skin gloves: the arms raising them to look at them (deploy, then the look), the weapon put away. */
  gloveInspect: InspectClip[] | null
  /** Each skeleton (the agent's, the gloves') with the geometries bound to it. */
  parts: RigPart[]
  weapon: THREE.Object3D | null
  bind?: WeaponBind
}

const json = <T>(url: string): Promise<T> => fetch(url).then((r) => r.json() as Promise<T>)

/** A 3D viewer for one CS2 skin at a time, with float and pattern (seed). */
export type KnifePose = 'vertical' | 'horizontal' | 'tilted'

/** How far a knife (modelled upright) leans over for each pose. */
const KNIFE_TILT: Record<KnifePose, number> = { vertical: 0, tilted: 0.95, horizontal: Math.PI / 2 }

export class SkinViewer {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera: THREE.PerspectiveCamera
  readonly controls: OrbitControls
  autoRotate = false
  /** How finely it draws (resolution, map post-processing, adapting to slow frames). */
  private quality: RenderQuality = { ...DEFAULT_RENDER_QUALITY }
  /** The map lights' strengths (× the game's). */
  private mapLighting: MapLighting = { ...DEFAULT_MAP_LIGHTING }
  /** The adaptive resolution's share of the 'auto' resolution (1 = full). */
  private adaptiveScale = 1
  /** Frame timing for the adaptive resolution: a smoothed frame time (ms), the last frame, and when it last changed. */
  private frameMs = 16
  private lastTick = 0
  private lastAdapt = 0
  private readonly gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)
  private readonly holder = new THREE.Group()
  private readonly resizeObserver: ResizeObserver
  private readonly keyLight = new THREE.DirectionalLight(0xffffff, DEFAULT_LIGHTING.key)
  private readonly rimLight = new THREE.DirectionalLight(0xffffff, DEFAULT_LIGHTING.rim)
  private lighting: Lighting = { ...DEFAULT_LIGHTING }
  /** The studio or the inspect map around the model. */
  private readonly map: MapStage
  /** The game's fixed inspect camera over a map's pre-rendered background. */
  private readonly fixed: FixedInspect
  private viewmodel: Viewmodel = { ...DEFAULT_VIEWMODEL }
  /** The pointer over the canvas (−1…1 each way), for the first-person sway. */
  private readonly pointer = new THREE.Vector2()
  /** The weapon's own float and pattern, kept to re-apply when the gloves' settings change. */
  private weaponFloat = 0
  private weaponSeed = 1
  /** The orbit effect's own turn, added to `lighting.angle`. */
  private lightSpin = 0
  /** What the current model left behind: its finishes, disposables and the gloves' hands. */
  private readonly loaded: LoadSink = { finishes: [], disposables: [], hands: [] }
  private readonly loader: ModelLoader
  private readonly attachments: WeaponAttachments
  /** Edit mode: dragging the stickers and the charm. */
  private readonly editor: AttachmentEditor
  private item: Item | null = null
  private palmUp = false
  /** First-person view (the arms hold the weapon, seen from the eye), and the gloves they wear. */
  private firstPerson = false
  private fpGlove: GloveItem | null = null
  /** The first-person rig: what to pose again for the inspect animation (the arms' geometries per skeleton, the weapon). */
  private fpRig: FirstPersonRig | null = null
  /** The agent shown holding a weapon. */
  private agentRig: AgentRig | null = null
  /** Gloves on a map lit by the game's inspect rig (true) or the studio lights (false, the default). */
  private gloveGameLight = false
  /** An agent is shown (posed or not). */
  private agentShown = false
  /** A pet or a pin is on the stage: it takes the map's light like an item on its own does (the fixed game inspect). */
  private framedShown = false
  private patchLayers: PatchLayer[] = []
  /** The pet on the stage: its meshes (their material swaps with the colour), skinned parts and the clip playing. */
  private petRig: { index: PetIndex; model: PetModel; meshes: THREE.Mesh[]; parts: RigPart[]; clip: InspectClip | null; start: number } | null = null
  private agentPatches: (AgentPatch | null)[] = []
  /** The weapon skin the shown agent holds (for its pattern and wear). */
  private agentWeaponItem: WeaponItem | null = null
  /** The skin gloves the shown agent wears. */
  private agentGlove: GloveItem | null = null
  /** The last weapon skin loaded: what an agent holds when shown. */
  private lastWeapon: Item | null = null
  private knifePose: KnifePose = 'tilted'
  /** When the inspect animation started (performance.now() ms), while it plays. */
  private inspectStart: number | null = null
  /** The glove skin whose page is playing its look at the gloves (back to it when done). */
  private gloveLookItem: Item | null = null
  /** The clips the playing inspect runs through (the weapon's, or the gloves' deploy and look). */
  private inspectClips: InspectClip[] | null = null
  private home = new THREE.Vector3()
  /** The loaded weapon's model (its own space: inches, Z up) — stickers and charms go on it. */
  private weaponRoot: THREE.Object3D | null = null
  /** A sticker or charm shown on its own (instead of an item). */
  /** The charm or sticker shown on its own. */
  private standalone: { setWear?: (w: number) => void; setCard?: (on: boolean) => void; parts?: CharmPart[]} | null = null
  /** Bumped by clear(): a load (item, sticker or charm view) that finished late is dropped. */
  private loadToken = 0
  /** The framed model's size and the side it's viewed from, to re-fit the view when the panel resizes. */
  private fit: { size: THREE.Vector3; side: THREE.Vector3; lookX: boolean } | null = null

  constructor(private readonly container: HTMLElement, private readonly opts: SkinViewerOptions) {
    this.renderer = new THREE.WebGLRenderer({ antialias: opts.antialias ?? true, alpha: true })
    this.renderer.setPixelRatio(this.pixelRatio)
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 1000)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.map = new MapStage({
      renderer: this.renderer, scene: this.scene, camera: this.camera, container, gltf: this.gltf,
      dataBase: opts.assetBase + VIEWER_DATA, holder: this.holder, studioLights: [this.keyLight, this.rimLight],
      firstPerson: () => this.firstPerson,
      fixedInspect: () => this.fixed.gameLit,
      exposure: () => this.lighting.exposure,
      lightYaw: () => this.lighting.angle + this.lightSpin,
      onChange: () => this.updateFixedInspect(),
    }, opts.background === undefined ? 0x0b0b12 : opts.background)
    this.fixed = new FixedInspect(this.camera, this.holder, this.renderer.domElement)
    this.scene.environmentIntensity = DEFAULT_LIGHTING.ambient
    this.scene.add(this.keyLight, this.rimLight, this.keyLight.target, this.rimLight.target, this.holder, this.fixed.probe)
    this.loader = new ModelLoader(this.renderer, new TextureSource(opts.assetBase, this.renderer), this.gltf, opts, this.loaded)
    this.attachments = new WeaponAttachments(this.renderer, this.loader, opts.assetBase, this.loaded, () => ({ item: this.item, weaponRoot: this.weaponRoot }))
    this.editor = new AttachmentEditor({
      container, canvas: this.renderer.domElement, camera: this.camera, controls: this.controls, attachments: this.attachments,
      weaponRoot: () => (this.item && this.item.style !== 'glove' ? this.weaponRoot : null),
      allowed: () => !this.firstPerson && this.inspectStart === null,
    })

    this.resizeObserver = new ResizeObserver(() => this.resize())
    this.resizeObserver.observe(container)
    this.resize()
    this.placeLights()
    this.renderer.setAnimationLoop((time) => this.tick(time))
    const canvas = this.renderer.domElement
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect()
      this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1))
    })
    canvas.addEventListener('pointerleave', () => this.pointer.set(0, 0))
    /** First person: left click fires (a gun's shot, a knife's slash), right click is the secondary attack (a stab, the revolver's alt fire). */
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.firstPerson || !this.fpRig?.attacks.length) return
      if (e.button === 0) this.startFire()
      else if (e.button === 2) void this.attack(secondaryAttack(this.fpRig.attacks)?.name)
    })
    window.addEventListener('pointerup', () => this.stopFire())
    window.addEventListener('pointercancel', () => this.stopFire())
    window.addEventListener('blur', () => this.stopFire())
    canvas.addEventListener('contextmenu', (e) => {
      if (this.firstPerson && this.fpRig?.attacks.length) e.preventDefault()
    })
  }

  /** One frame: the viewmodel, the playing animations, the lights, then the draw. */
  private tick(time: number): void {
    this.adapt(time)
    if (this.firstPerson) this.updateViewmodel(time / 1000)
    if (this.inspectStart !== null) this.stepInspect(time)
    else if (this.fpRig?.idleLoop) this.stepIdle(time)
    else if (!this.firstPerson) this.fixed.step(this.autoRotate)
    if (this.agentRig) poseAgent(this.agentRig, (time - this.agentRig.start) / 1000)
    if (this.petRig) this.stepPet(time)
    else if (this.autoRotate) this.holder.rotation.y += 0.004
    if (this.lighting.orbit) this.lightSpin = (this.lightSpin + ORBIT_SPEED) % 360
    this.placeLights()
    for (const finish of this.loaded.finishes) if (isGlove(finish)) finish.update(this.renderer)
    if (!this.firstPerson && !this.fixed.active) this.controls.update()
    this.map.render()
  }

  /** Stops drawing frames (offscreen) or starts again. */
  setPaused(paused: boolean): void {
    this.renderer.setAnimationLoop(paused ? null : (time) => this.tick(time))
  }

  async load(item: Item): Promise<void> {
    if (item.style !== 'glove') this.lastWeapon = item
    this.clear()
    this.item = item
    const root = item.style === 'glove' ? await this.loader.gloves(item) : await this.loader.weapon(item)
    if (item.style === 'glove') this.placeHands()
    this.weaponRoot = item.style === 'glove' ? null : root
    this.frame(root, item.style !== 'glove')
    await this.attachments.apply()
    this.fixed.patchAdded()
    this.setSeed(item.seed)
  }

  /**
   * First person: the weapon in the idle pose with the agent's arms holding it, seen from the eye (the viewmodel's pose:
   * build_firstperson.py). The arms are the agent's, as in the game: its sleeves, and its arms with its default gloves —
   * or, wearing skin `glove`s, that glove model (its arm in the agent's skin).
   */
  async loadFirstPerson(item: Item, glove: GloveItem | null, agentId: string = DEFAULT_AGENT): Promise<void> {
    if (item.style === 'glove') return this.load(item)
    this.clear()
    const token = this.loadToken
    this.item = item
    const base = this.loader.firstPersonBase
    const name = item.id.split('|')[0]
    const index = await json<Record<string, string>>(base + 'index.json')
    const file = index[name]
    if (!file) throw new Error('No first-person pose for ' + name)
    const [pose, binds, inspect, gloveInspect, idleLoop, attacks] = await Promise.all([
      json<ViewmodelPose>(base + file),
      json<Record<string, WeaponBind>>(base + 'weapon_binds.json').catch(() => ({} as Record<string, WeaponBind>)),
      json<Record<string, string>>(base + 'inspect_index.json')
        .then((idx) => idx[name] ? json<InspectClip>(base + 'inspect/' + idx[name]) : null)
        .catch(() => null),
      glove ? this.loader.gloveInspectClips().catch(() => null) : Promise.resolve(null),
      json<Record<string, string>>(base + 'idle_index.json')
        .then((idx) => idx[file] ? json<InspectClip>(base + 'idle/' + idx[file]) : null)
        .catch(() => null),
      json<Record<string, AttackEntry[]>>(base + 'attack_index.json').then((idx) => sortAttacks(idx[name] ?? [])).catch(() => [] as AttackEntry[]),
    ])
    const rig: FirstPersonRig = { idle: pose, idleLoop, inspect, attacks, gloveInspect, parts: [], weapon: null, bind: binds[name] }
    const patchLayers: PatchLayer[] = []
    const armsRoot = await this.loader.firstPersonArms(agentId, glove, rig.parts, patchLayers)
    const weapon = await this.loader.weapon(item)
    await this.loader.rigWeapon(item, weapon)
    if (token !== this.loadToken) return
    weapon.matrixAutoUpdate = false
    rig.weapon = weapon
    this.fpRig = rig
    poseRig(rig.parts, handIK(pose), rig.weapon, rig.bind)
    this.weaponRoot = weapon
    this.fpGlove = glove
    this.patchLayers = patchLayers
    this.enterFirstPerson(armsRoot, weapon)
    await this.attachments.apply()
    await this.setAgentPatches(this.agentPatches)
    this.setSeed(item.seed)
  }

  /**
   * On a glove skin's page: first person with just the arms (the agent's sleeves and these gloves, no weapon) playing
   * the glove inspect, then back to the gloves on their own.
   */
  async lookAtGloves(agentId: string = DEFAULT_AGENT): Promise<void> {
    const glove = this.item
    if (!glove || glove.style !== 'glove') return
    const seed = this.weaponSeed, float = this.weaponFloat
    this.clear()
    const token = this.loadToken
    const clips = await this.loader.gloveInspectClips()
    const rig: FirstPersonRig = { idle: samplePose(clips[0], 0), inspect: null, attacks: [], gloveInspect: clips, parts: [], weapon: null }
    const armsRoot = await this.loader.firstPersonArms(agentId, glove as GloveItem, rig.parts)
    if (token !== this.loadToken) return
    for (const finish of this.loaded.finishes) {
      if (!isGlove(finish)) continue
      setGloveSeed(finish, seed)
      finish.setFloat(float)
    }
    this.fpRig = rig
    this.fpGlove = glove as GloveItem
    this.gloveLookItem = glove
    this.enterFirstPerson(armsRoot)
    this.inspectClips = clips
    this.inspectStart = performance.now()
  }

  /** Shows the posed first-person models from the eye. */
  private enterFirstPerson(...models: THREE.Object3D[]): void {
    // A map's fixed inspect (its game camera and FOV) ends here: first person has its own camera and viewmodel FOV.
    this.fixed.exit(this.map.scene3d)
    this.firstPerson = true
    this.holder.rotation.set(0, 0, 0)
    this.holder.add(...models)
    this.updateViewmodel(0)
    this.controls.enabled = false
    this.camera.position.set(0, 0, 0)
    this.camera.up.set(0, 1, 0)
    this.camera.lookAt(0, 0, 1)
    this.fit = null
    this.resize()
    this.updateFixedInspect()
  }

  /** The attack animations the first-person weapon has (a gun's shots, a knife's slashes and stabs). */
  get attacks(): AttackInfo[] {
    return (this.fpRig?.attacks ?? []).map((a) => ({ name: a.name, label: attackLabel(a.name) }))
  }

  private attackNext = 0
  private readonly attackClips = new Map<string, Promise<InspectClip>>()

  /**
   * Plays one of the weapon's attacks (from the start, over whatever plays): the named clip, or — with no name — the plain
   * fire: a gun's shot, a knife's slashes one after the other.
   * @param name a clip name from `attacks`
   */
  async attack(name?: string): Promise<void> {
    const rig = this.fpRig
    if (!rig?.attacks.length) return
    let entry = name ? rig.attacks.find((a) => a.name === name) : undefined
    if (!entry) {
      const primary = primaryAttacks(rig.attacks)
      entry = primary[this.attackNext++ % primary.length]
    }
    let clip = this.attackClips.get(entry.file)
    if (!clip) this.attackClips.set(entry.file, (clip = json<InspectClip>(this.loader.firstPersonBase + 'attack/' + entry.file)))
    const loaded = await clip.catch(() => null)
    if (!loaded || this.fpRig !== rig) return
    this.inspectClips = [loaded]
    if (rig.weapon) rig.weapon.visible = true
    this.inspectStart = performance.now()
  }

  private firing = false
  private fireTimer: ReturnType<typeof setTimeout> | undefined

  /**
   * Starts firing: one shot, and — on an automatic weapon — a shot every cycle time (the animation restarts each time, so it stays
   * in the kick) until `stopFire`. Semi-automatic weapons and knives play one attack per press.
   */
  startFire(): void {
    if (this.firing || !this.fpRig?.attacks.length) return
    this.firing = true
    const cycle = AUTO_CYCLE[this.item?.id.split('|')[0] ?? '']
    const shoot = (): void => {
      void this.attack()
      if (cycle && this.firing) this.fireTimer = setTimeout(shoot, cycle * 1000)
    }
    shoot()
  }

  /** Stops the held fire. */
  stopFire(): void {
    this.firing = false
    clearTimeout(this.fireTimer)
  }

  /** Whether the loaded first-person weapon has an inspect animation. */
  get canInspect(): boolean {
    return !!this.fpRig?.inspect
  }

  /** Plays the first-person weapon's inspect animation (from the start, if it was already playing). */
  inspect(): void {
    if (!this.fpRig?.inspect) return
    this.inspectClips = [this.fpRig.inspect]
    if (this.fpRig.weapon) this.fpRig.weapon.visible = true
    this.inspectStart = performance.now()
  }

  /** Whether first person can look at its skin gloves (the glove inspect). */
  get canInspectGloves(): boolean {
    return !!this.fpRig?.gloveInspect && !!this.fpGlove
  }

  /** First person looks at its gloves: the weapon put away, the arms raise them (from the start if already playing). */
  inspectGloves(): void {
    const rig = this.fpRig
    if (!rig?.gloveInspect || !this.fpGlove) return
    this.inspectClips = rig.gloveInspect
    if (rig.weapon) rig.weapon.visible = false
    this.inspectStart = performance.now()
  }

  /** Poses the animated idle at `now` (ms), looping. */
  private stepIdle(now: number): void {
    const rig = this.fpRig
    const loop = rig?.idleLoop
    if (!rig || !loop) return
    poseRig(rig.parts, handIK(samplePose(loop, (now / 1000) % loop.duration)), rig.weapon, rig.bind)
  }

  /** Advances the playing inspect (its clips one after another) to `now` (ms); at its end the idle pose comes back. */
  private stepInspect(now: number): void {
    const rig = this.fpRig
    if (!rig || !this.inspectClips || this.inspectStart === null) { this.inspectStart = null; return }
    let t = (now - this.inspectStart) / 1000
    for (const clip of this.inspectClips) {
      if (t < clip.duration) { poseRig(rig.parts, handIK(samplePose(clip, t)), rig.weapon, rig.bind); return }
      t -= clip.duration
    }
    this.inspectStart = null
    this.inspectClips = null
    if (rig.weapon) rig.weapon.visible = true
    poseRig(rig.parts, handIK(rig.idle), rig.weapon, rig.bind)
    /** The glove page's look at the gloves ends back on the gloves on their own, as they were. */
    const glove = this.gloveLookItem
    if (glove) {
      const seed = this.weaponSeed, float = this.weaponFloat
      void this.load(glove).then(() => { this.setFloat(float); this.setSeed(seed) })
    }
  }

  /** Changes the lighting; anything left out keeps its value. */
  setLighting(changes: Partial<Lighting>): void {
    this.lighting = { ...this.lighting, ...changes }
    const l = this.lighting
    this.renderer.toneMappingExposure = l.exposure
    this.map.setExposure(l.exposure)
    this.keyLight.intensity = l.key
    this.keyLight.color.set(l.keyColor)
    this.rimLight.intensity = l.rim
    this.rimLight.color.set(l.rimColor)
    const map = IS_MOBILE_DEVICE ? null : l.map ?? null
    this.scene.environmentIntensity = map ? (l.ambient / DEFAULT_LIGHTING.ambient) * this.mapLighting.reflections : l.ambient
    if (!l.orbit) this.lightSpin = 0
    this.placeLights()
    if (map !== this.map.id) void this.map.load(map)
  }

  /**
   * Puts the key and rim lights in place: around the model in world space, or — in first person, where the camera
   * sits at the origin looking at the weapon from behind, and when asked — relative to the camera, so the side you
   * see is the lit one.
   */
  private placeLights(): void {
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(this.lighting.angle + this.lightSpin))
    const target = this.firstPerson ? this.camera.position.clone().add(new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion).multiplyScalar(0.5)) : this.controls.target
    if (this.firstPerson || this.lighting.followCamera) {
      const view = this.camera.quaternion.clone().multiply(turn)
      this.keyLight.position.copy(KEY_FROM_CAMERA).applyQuaternion(view).add(target)
      this.rimLight.position.copy(RIM_FROM_CAMERA).applyQuaternion(view).add(target)
    } else {
      this.keyLight.position.copy(KEY_POSITION).applyQuaternion(turn).add(target)
      this.rimLight.position.copy(RIM_POSITION).applyQuaternion(turn).add(target)
    }
    this.keyLight.target.position.copy(target)
    this.rimLight.target.position.copy(target)
    this.map.place()
  }

  setFloat(f: number): void {
    this.weaponFloat = f
    for (const finish of this.loaded.finishes) finish.setFloat(this.firstPerson && isGlove(finish) ? this.viewmodel.gloveFloat : f)
  }

  /** Changes the first-person viewmodel; anything left out keeps its value. */
  setViewmodel(changes: Partial<Viewmodel>): void {
    const before = this.viewmodel
    this.viewmodel = { ...before, ...changes }
    if (this.agentGlove && (before.gloveFloat !== this.viewmodel.gloveFloat || before.gloveSeed !== this.viewmodel.gloveSeed)) {
      setAgentGloves(this.loaded.finishes, this.agentGlove, this.viewmodel)
    }
    if (!this.firstPerson) return
    if (before.fov !== this.viewmodel.fov) this.resize()
    if (before.gloveFloat !== this.viewmodel.gloveFloat) this.setFloat(this.weaponFloat)
    if (before.gloveSeed !== this.viewmodel.gloveSeed) this.setSeed(this.weaponSeed)
    this.updateViewmodel(performance.now() / 1000)
  }

  /**
   * Places the first-person holder: the default spot plus the offsets, mirrored for the left hand, and — with sway
   * on — leaning toward the pointer and breathing.
   * @param t time in seconds
   */
  private updateViewmodel(t: number): void {
    const vm = this.viewmodel
    const side = vm.leftHanded ? 1 : -1
    let bob = 0
    if (vm.sway) {
      bob = Math.sin(t * 1.7) * 0.0009
      const r = this.holder.rotation
      /** Applied after the mirror, so the same sign leans toward the pointer with either hand. */
      r.y += (-this.pointer.x * SWAY_YAW - r.y) * SWAY_FOLLOW
      r.x += (-this.pointer.y * SWAY_PITCH - r.x) * SWAY_FOLLOW
      r.z = Math.sin(t * 0.85) * 0.006
    } else {
      this.holder.rotation.set(0, 0, 0)
    }
    this.holder.position.set(side * vm.offsetX * INCH, vm.offsetZ * INCH + bob, vm.offsetY * INCH)
    this.holder.scale.set(vm.leftHanded ? -1 : 1, 1, 1)
  }

  setSeed(seed: number): void {
    this.weaponSeed = seed
    const item = this.item
    if (!item) return
    for (const finish of this.loaded.finishes) {
      if (isGlove(finish)) setGloveSeed(finish, item.style === 'glove' ? seed : this.viewmodel.gloveSeed ?? this.fpGlove?.seed ?? 1)
      else if (item.style !== 'glove') setWeaponSeed(finish, item, seed)
    }
  }

  dispose(): void {
    this.clear()
    this.attachments.dispose()
    this.editor.dispose()
    this.resizeObserver.disconnect()
    this.renderer.setAnimationLoop(null)
    this.controls.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
    this.map.dispose()
  }

  /**
   * Gloves: both backs facing the camera (default), or the right hand turned palm-up like the official
   * render. The hands are mirror images, so the right one needs the opposite turn to show its back.
   */
  setGlovePalmUp(palmUp: boolean): void {
    this.palmUp = palmUp
    this.placeHands()
  }

  private placeHands(): void {
    for (const { side, mesh } of this.loaded.hands) {
      const turn = side === 'right' && !this.palmUp ? -Math.PI / 2 : Math.PI / 2
      mesh.rotation.set(0, turn, Math.PI)
    }
  }

  /** Whether the fixed game inspect applies: a gun, gloves, an agent, or a charm or sticker on its own, over a map's pre-rendered background, outside first person. */
  private get wantsFixedInspect(): boolean {
    const name = this.item?.id.split('|')[0] ?? ''
    if (!this.map.video || !this.map.scene3d?.data.weapon || this.firstPerson) return false
    return !!this.standalone || this.agentShown || this.framedShown || (this.item?.style === 'glove' ? this.gloveGameLight : !!this.item && !!name)
  }

  /** Enters the fixed inspect when it applies, or gives the view back to the orbit. */
  private updateFixedInspect(): void {
    const scene3d = this.map.scene3d
    scene3d?.setLightScales(this.mapLighting)
    if (this.firstPerson) {
      this.fixed.lightFirstPerson(scene3d)
      return
    }
    if (this.fixed.gameLit && !this.fixed.active) {
      this.fixed.lightFirstPerson(null)
      scene3d?.useLights(scene3d.data.lights, scene3d.data.sceneLights ?? [])
    }
    if (!this.wantsFixedInspect || !scene3d) {
      if (this.fixed.exit(scene3d)) {
        this.setLighting({})
        this.controls.enabled = !this.firstPerson
        if (!this.firstPerson) this.resetView()
      }
      return
    }
    this.controls.enabled = false
    const glove = this.item?.style === 'glove'
    const studio = this.fit ? { distance: this.homePosition(35).length(), fov: 35 } : undefined
    if ((this.standalone || this.agentShown || this.framedShown || glove) && this.fit) {
      this.fixed.enter(scene3d, 'weapon_glock', { radius: this.agentShown ? this.fit.size.y * 0.4 : (this.fit.size.length() / 2) * (this.petRig ? petView(this.petRig.model.glb).room : this.framedShown ? PIN_VIEW.room : 1), sunOnly: !!this.standalone, face: !this.standalone?.parts, turn: this.petRig ? petView(this.petRig.model.glb).turn : this.framedShown ? PIN_VIEW.turn : 0, studio: glove && !this.agentShown && !this.standalone ? studio : undefined })
    } else if (/knife|bayonet/.test(this.item!.id.split('|')[0]) && this.fit) {
      this.fixed.enter(scene3d, 'weapon_glock', { radius: this.fit.size.length() / 2, studio })
    } else {
      this.fixed.enter(scene3d, this.item!.id.split('|')[0])
    }
    this.map.place()
  }

  /** Gloves on a map: the game's inspect light (true) or the studio's (false). */
  setGloveGameLight(on: boolean): void {
    if (this.gloveGameLight === on) return
    this.gloveGameLight = on
    this.updateFixedInspect()
  }

  /** Center the model and put the camera at its side, far enough for it to fit. */
  private frame(root: THREE.Object3D, tiltUpright: boolean): void {
    root.userData.framedFrom ??= { position: root.position.clone(), rotation: root.rotation.clone() }
    let size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3())
    if (tiltUpright && size.y > Math.max(size.x, size.z)) {
      const angle = this.isKnife() ? KNIFE_TILT[this.knifePose] : 0.95
      if (size.x <= size.z) root.rotation.x = -angle
      else root.rotation.z = angle
      root.updateMatrixWorld(true)
    }
    const box = new THREE.Box3().setFromObject(root)
    size = box.getSize(new THREE.Vector3())
    root.position.sub(box.getCenter(new THREE.Vector3()))
    this.holder.rotation.set(0, 0, 0)
    this.holder.add(root)
    const lookX = size.x <= size.z
    this.fit = { size, lookX, side: lookX ? new THREE.Vector3(1, 0.08, 0.12) : new THREE.Vector3(0.12, 0.08, 1) }
    this.home.copy(this.homePosition())
    this.camera.position.copy(this.home)
    this.controls.target.set(0, 0, 0)
    this.controls.update()
    this.updateFixedInspect()
  }

  private isKnife(): boolean {
    return !!this.item && /knife|bayonet/.test(this.item.id.split('|')[0])
  }

  /** How knives stand: upright, lying flat, or tilted (the default). */
  setKnifePose(pose: KnifePose): void {
    if (this.knifePose === pose) return
    this.knifePose = pose
    const root = this.weaponRoot
    const from = root?.userData.framedFrom as { position: THREE.Vector3; rotation: THREE.Euler } | undefined
    if (!root || !from || !this.isKnife() || this.firstPerson) return
    root.position.copy(from.position)
    root.rotation.copy(from.rotation)
    root.updateMatrixWorld(true)
    this.frame(root, true)
    this.resetView()
  }

  /** Where the camera frames the model at the current aspect. */
  private homePosition(fov = this.camera.fov): THREE.Vector3 {
    const { size, side, lookX } = this.fit!
    const across = lookX ? size.z : size.x
    /** The model's depth along the view: its near side is half of it closer (a round charm would overflow without it). */
    const depth = lookX ? size.x : size.z
    const halfTan = Math.tan(THREE.MathUtils.degToRad(fov / 2))
    const dist = depth / 2 + Math.max(size.y / halfTan, across / (halfTan * this.camera.aspect)) * 0.62
    return side.clone().multiplyScalar(dist)
  }

  /** Back to the framing the item was loaded with. */
  resetView(): void {
    // (on a map's fixed inspect: the game's own view back)
    if (this.fixed.active) { this.fixed.reset(); return }
    this.holder.rotation.set(0, 0, 0)
    if (this.fit) this.home.copy(this.homePosition())
    this.camera.position.copy(this.home)
    this.controls.target.set(0, 0, 0)
    this.controls.update()
  }

  /** The initial framing seen from the other side (a half turn around the model). */
  backView(): void {
    if (this.firstPerson) return
    this.resetView()
    if (this.fixed.active) { this.fixed.flip(); return }
    this.camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI)
    this.controls.update()
  }

  /**
   * The item alone from the front (the initial framing) and from the back (a half turn around it), each drawn with
   * `longSide` pixels on its longer side and cut down to what it covers. The camera is left at the front. A knife is
   * shot standing up.
   */
  renderSides(longSide: number): { front: HTMLCanvasElement; back: HTMLCanvasElement } {
    /** Over a map the item is the one that turns, in the frame loop's step: it has to be applied before drawing now. */
    const settle = () => { if (this.fixed.active) this.fixed.step() }
    /** A knife is shot standing up (whatever pose the viewer shows it in), and left as it was. */
    const pose = this.knifePose
    if (this.isKnife()) this.setKnifePose('vertical')
    this.resetView()
    settle()
    const front = this.renderItem(longSide)
    this.backView()
    settle()
    const back = this.renderItem(longSide)
    if (this.isKnife()) this.setKnifePose(pose)
    this.resetView()
    settle()
    return { front, back }
  }

  /** The current view as a PNG data URL (transparent where the scene has no background). */
  /**
   * The model alone (no background, map or studio) as the camera sees it, drawn with `longSide` pixels on the view's
   * longer side and cut down to what it covers — for the share image.
   */
  renderItem(longSide: number): HTMLCanvasElement {
    const size = this.renderer.getSize(new THREE.Vector2())
    const ratio = this.renderer.getPixelRatio()
    const scale = Math.min(longSide, this.renderer.capabilities.maxTextureSize, 8192) / Math.max(size.x, size.y)
    const background = this.scene.background
    const root = this.map.scene3d?.root
    const rootVisible = root?.visible ?? false
    this.scene.background = null
    if (root) root.visible = false
    this.renderer.setPixelRatio(1)
    this.renderer.setSize(Math.round(size.x * scale), Math.round(size.y * scale), false)
    this.renderer.render(this.scene, this.camera)
    // (read before the frame ends: the drawing buffer isn't kept)
    const image = cropToContent(this.renderer.domElement)
    this.scene.background = background
    if (root) root.visible = rootVisible
    this.renderer.setPixelRatio(ratio)
    this.renderer.setSize(size.x, size.y, false)
    this.map.render()
    return image
  }

  /** Changes the map lights' strengths (× the game's): sun, the item's lights, scene lights, ambient, reflections. */
  setMapLighting(lighting: MapLighting): void {
    this.mapLighting = { ...lighting }
    this.map.scene3d?.setLightScales(lighting)
    this.fixed.setAmbientScale(lighting.ambient)
    this.setLighting({})
  }

  /**
   * What lights the current view: on a map, the sources the game's inspect rig has on for this item (a weapon, gloves
   * or agent: sun, item light, ambient, scene lights where the map has them; a charm or sticker alone and first
   * person: sun and ambient), with the reflections; over a map without the rig, the studio's lights and the map's; in
   * the studio, its own.
   */
  get lightSources(): LightSource[] {
    if (!this.map.id) return ['studio']
    const scene3d = this.map.scene3d
    const kinds = scene3d?.lightKinds() ?? new Set()
    const out: LightSource[] = this.fixed.gameLit ? [] : ['studio']
    if (kinds.has('sun')) out.push('sun')
    // (outside the game's rig, and in first person, the item lights aren't drawn on the item)
    if (kinds.has('item') && (this.fixed.active || (!this.fixed.gameLit && !this.firstPerson))) out.push('item')
    if (kinds.has('scene')) out.push('scene')
    if (this.fixed.ambientOn) out.push('ambient')
    out.push('reflections')
    return out
  }

  /** The pixels per CSS pixel it draws at now. */
  get pixelRatio(): number {
    const auto = Math.min(devicePixelRatio, 2)
    return this.quality.resolution === 'auto' ? Math.max(0.75, auto * this.adaptiveScale) : this.quality.resolution
  }

  /** The smoothed frame rate. */
  get fps(): number {
    return Math.round(1000 / Math.max(1, this.frameMs))
  }

  /** Changes how finely it draws (antialiasing is fixed for the canvas: see `antialias` in the options). */
  setQuality(quality: RenderQuality): void {
    if (quality.resolution !== this.quality.resolution || !quality.adaptive) this.adaptiveScale = 1
    this.quality = { ...quality }
    this.map.setPostEnabled(quality.post)
    this.applyPixelRatio()
  }

  private applyPixelRatio(): void {
    const ratio = this.pixelRatio
    if (Math.abs(ratio - this.renderer.getPixelRatio()) < 1e-3) return
    this.renderer.setPixelRatio(ratio)
    this.resize()
  }

  /**
   * The adaptive resolution: under ~30 fps (smoothed, over two seconds at least) it draws 20% fewer pixels a side,
   * down to 0.75×; over ~55 fps for a while it goes back up. Only with 'auto' resolution.
   */
  private adapt(time: number): void {
    const dt = this.lastTick ? time - this.lastTick : 16
    this.lastTick = time
    // (a hidden tab or a long load stall isn't a slow frame)
    if (dt > 250) return
    this.frameMs += (dt - this.frameMs) * 0.05
    if (!this.quality.adaptive || this.quality.resolution !== 'auto' || time - this.lastAdapt < 2000) return
    const auto = Math.min(devicePixelRatio, 2)
    if (this.frameMs > 34 && auto * this.adaptiveScale > 0.75) {
      this.adaptiveScale = Math.max(0.75 / auto, this.adaptiveScale * 0.8)
    } else if (this.frameMs < 18 && this.adaptiveScale < 1 && time - this.lastAdapt > 6000) {
      this.adaptiveScale = Math.min(1, this.adaptiveScale / 0.8)
    } else return
    this.lastAdapt = time
    this.applyPixelRatio()
  }

  /** Turns edit mode on (dragging the weapon's stickers and charm, told through `events`) or off (null). */
  setEditing(events: EditorEvents | null): void {
    this.editor.setEnabled(events)
  }

  /** A copy of the frame on screen: held over the view while the next model loads, so nothing blinks. */
  snapshotCanvas(): HTMLCanvasElement {
    this.map.render()
    const source = this.renderer.domElement
    const copy = document.createElement('canvas')
    copy.width = source.width
    copy.height = source.height
    copy.getContext('2d')?.drawImage(source, 0, 0)
    return copy
  }

  screenshot(): string {
    this.map.render()
    return this.renderer.domElement.toDataURL('image/png')
  }

  private clear(): void {
    for (const child of [...this.holder.children]) {
      this.holder.remove(child)
      child.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose() })
    }
    for (const finish of this.loaded.finishes) finish.dispose()
    for (const dispose of this.loaded.disposables) dispose()
    this.loaded.finishes.length = 0
    this.loaded.disposables.length = 0
    this.loaded.hands.length = 0
    this.item = null
    this.firstPerson = false
    this.fpGlove = null
    this.fpRig = null
    this.agentRig = null
    this.petRig = null
    this.patchLayers = []
    this.agentShown = false
    this.framedShown = false
    this.agentWeaponItem = null
    this.agentGlove = null
    this.inspectStart = null
    this.inspectClips = null
    this.gloveLookItem = null
    this.holder.position.set(0, 0, 0)
    this.holder.rotation.set(0, 0, 0)
    this.holder.scale.set(1, 1, 1)
    this.controls.enabled = true
    this.camera.fov = 35
    this.camera.updateProjectionMatrix()
    this.weaponRoot = null
    this.standalone = null
    this.attachments.reset()
    this.loadToken++
  }

  /** The stickers the weapon wears (up to five, later ones on top); kept across loads. */
  setStickers(list: StickerOptions[]): Promise<void> {
    return this.attachments.setStickers(list).then(() => this.fixed.patchAdded())
  }

  /** The charm on the weapon's keychain point (pattern, custom offset); null = none. Kept across loads. */
  setCharm(opts: CharmOptions | null): Promise<void> {
    return this.attachments.setCharm(opts).then(() => this.fixed.patchAdded())
  }

  /** The item's sticker slots (empty when it has no markup yet). */
  stickerSlots(): number {
    return this.attachments.stickerSlots()
  }

  /** A sticker on its own, as a card; wear 0–1. */
  async showSticker(id: string, wear: number): Promise<void> {
    this.clear()
    const token = this.loadToken
    const { def, sources } = await this.attachments.stickerLook(id)
    if (token !== this.loadToken) return
    const textures = packStickers(this.renderer, [sources])
    const card = stickerCard(def, textures)
    card.setWear(wear)
    this.loaded.disposables.push(() => { (card.mesh.material as THREE.Material).dispose(); textures.dispose() })
    const root = new THREE.Group()
    root.add(card.mesh)
    /** The card behind the sticker (alpha-tested: its corners are round), hidden until asked for. */
    const backing = new THREE.Mesh(new THREE.PlaneGeometry(STICKER_CARD_SIDE, STICKER_CARD_SIDE), new THREE.MeshStandardMaterial({ roughness: 0.47, metalness: 0, alphaTest: 0.5, side: THREE.DoubleSide }))
    const uv = backing.geometry.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i))
    backing.position.z = -0.004
    backing.visible = false
    root.add(backing)
    void this.loader.textures.load(GAME_ROOT + STICKER_CARD, true).then((map) => {
      if (token !== this.loadToken) return
      const m = backing.material as THREE.MeshStandardMaterial
      m.map = map
      m.needsUpdate = true
    }).catch(() => {})
    this.loaded.disposables.push(() => { backing.geometry.dispose(); (backing.material as THREE.Material).dispose() })
    /** With the card on, everything shrinks so the card takes the room the sticker had (the framing stays the sticker's). */
    const setCard = (on: boolean) => {
      backing.visible = on
      root.scale.setScalar(on ? 1 / STICKER_CARD_SIDE : 1)
    }
    this.standalone = { setWear: card.setWear, setCard }
    this.frame(root, false)
  }

  /** A whole agent holding `weapon` (else the last weapon skin loaded), wearing skin `glove`s or its default ones. */
  async showAgent(id: string, glove: GloveItem | null = null, weapon: Item | null = null): Promise<void> {
    const held = weapon ?? this.lastWeapon
    this.clear()
    const token = this.loadToken
    const agent = await loadAgent(this.loader, this.opts.assetBase, id, glove, held && held.style !== 'glove' ? held : null, () => token !== this.loadToken)
    if (!agent) return
    this.agentWeaponItem = agent.weapon
    if (agent.weapon) this.setAgentWeapon(agent.weapon.seed, this.weaponFloat)
    this.agentGlove = agent.glove
    this.patchLayers = agent.patches
    await this.setAgentPatches(this.agentPatches)
    if (agent.glove) setAgentGloves(this.loaded.finishes, agent.glove, this.viewmodel)
    this.agentRig = agent.rig
    this.agentShown = true
    if (agent.rig) poseAgent(agent.rig, 0)
    this.frame(agent.root, false)
  }

  /** The patches the agent wears (kept across loads): one per slot, null = empty. */
  async setAgentPatches(worn: (AgentPatch | null)[]): Promise<void> {
    this.agentPatches = worn
    if (!this.patchLayers.length) return
    const index = await loadPatches(this.opts.assetBase)
    const textures = await Promise.all(worn.map(async (p) => {
      const entry = p && index.patch.get(p.id)
      if (!entry) return null
      const [patch, backing] = await Promise.all([
        this.loader.textures.load(GAME_ROOT + entry.texture, true).catch(() => null),
        entry.backing ? this.loader.textures.load(GAME_ROOT + entry.backing, true).catch(() => null) : null,
      ])
      /** The game samples patches with a clamping sampler (no tiling where a backing scale shrinks the patch). */
      for (const t of [patch, backing]) if (t) t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
      return patch ? { patch, backing } : null
    }))
    if (worn !== this.agentPatches) return
    for (const layer of this.patchLayers) layer.set(worn, textures)
  }

  /** The pattern and wear of the weapon the agent holds, without making it the viewer's item. */
  setAgentWeapon(seed: number, float: number): void {
    if (this.agentWeaponItem) setAgentWeapon(this.loaded.finishes, this.agentWeaponItem, seed, float)
  }

  /**
   * A pet on its own (a chicken, the chick, the egg): its model in one of its colours, playing a clip of its skeleton
   * (the named one, else the first idle) in a loop. The roasted chicken has no skeleton animations.
   */
  async showPet(id: string, variant = 0, clipName: string | null = null): Promise<void> {
    this.clear()
    const token = this.loadToken
    const index = await loadPets(this.opts.assetBase)
    const entry = index.pet.get(id)
    const model = entry && index.models[entry.model]
    if (!entry || !model) throw new Error('No pet ' + id)
    const clips = petClips(index, entry)
    const wanted = clips.find((c) => c.name === clipName) ?? defaultPetClip(clips)
    const [gltf, clip] = await Promise.all([
      this.loader.gltf.loadAsync(this.loader.textures.url(GAME_ROOT + model.glb)),
      wanted ? loadPetClip(this.opts.assetBase, index, wanted).catch(() => null) : null,
    ])
    if (token !== this.loadToken) return
    const root = new THREE.Group()
    gltf.scene.updateMatrixWorld(true)
    const meshes: THREE.Mesh[] = [], skinned: SkinnedGeometry[] = []
    gltf.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld)
      if (g.getAttribute('skinIndex')) skinned.push(new SkinnedGeometry(g))
      const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial())
      meshes.push(mesh)
      root.add(mesh)
    })
    this.framedShown = true
    this.petRig = { index, model, meshes, parts: [{ skeleton: model.skeleton, geometries: skinned }], clip, start: performance.now() }
    this.setPetVariant(variant)
    this.stepPet(performance.now())
    /** Posing moved the vertices: the box the framing reads must follow (the glb's, kept by the clone, is the bind pose's). */
    for (const mesh of meshes) mesh.geometry.computeBoundingBox()
    this.frame(root, false)
  }

  /** Paints the pet in colour `index` of its model (the materials of that variant, in mesh order). */
  setPetVariant(index: number): void {
    const rig = this.petRig
    if (!rig) return
    const calls = rig.model.variants[Math.min(Math.max(0, index), rig.model.variants.length - 1)]?.drawCalls ?? []
    rig.meshes.forEach((mesh, i) => {
      const call = calls[i] ?? calls[0]
      const old = mesh.material as THREE.Material
      const material = call ? this.loader.plainMaterial(call) : new THREE.MeshStandardMaterial()
      /** plainMaterial's defaults (fully metal, fully rough) are for models with a metalness map: without one it is a matte surface. */
      if (call && !call.rough && material instanceof THREE.MeshStandardMaterial) { material.metalness = 0; material.roughness = 0.7 }
      mesh.material = material
      old.dispose()
    })
  }

  /** Plays the named clip of the pet from the start (null: its default idle). */
  async playPetClip(name: string | null): Promise<void> {
    const rig = this.petRig
    if (!rig) return
    const token = this.loadToken
    const entry = [...rig.index.pet.values()].find((p) => rig.index.models[p.model] === rig.model)
    const clips = entry ? petClips(rig.index, entry) : []
    const wanted = clips.find((c) => c.name === name) ?? defaultPetClip(clips)
    if (!wanted) return
    const clip = await loadPetClip(this.opts.assetBase, rig.index, wanted).catch(() => null)
    if (!clip || token !== this.loadToken || this.petRig !== rig) return
    rig.clip = clip
    rig.start = performance.now()
  }

  /** Poses the pet at `now` (ms) of its clip, looping. */
  private stepPet(now: number): void {
    const rig = this.petRig
    if (!rig?.clip) return
    const t = ((now - rig.start) / 1000) % rig.clip.duration
    poseRig(rig.parts, samplePose(rig.clip, t))
  }

  /** A collectible pin on its own: its model with the game's material (glitter overlays blended on top). */
  async showPin(id: string): Promise<void> {
    this.clear()
    const token = this.loadToken
    const pins = await loadPins(this.opts.assetBase)
    const entry = pins.pin.get(id)
    const model = entry && pins.models[entry.model]
    if (!model) throw new Error('No pin ' + id)
    const gltf = await this.loader.gltf.loadAsync(this.loader.textures.url(GAME_ROOT + model.glb))
    if (token !== this.loadToken) return
    const root = new THREE.Group()
    gltf.scene.updateMatrixWorld(true)
    this.framedShown = true
    let i = 0
    gltf.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      const call = model.drawCalls[i++] ?? model.drawCalls[0]
      const g = o.geometry.clone().applyMatrix4(o.matrixWorld)
      const material = this.loader.plainMaterial(call)
      /**
       * A pin's metal map has the metalness in G and nothing in R (plainMaterial reads R as roughness: a mirror that
       * reflects the dark stage). Enamel is glossy, the metal polished but not a mirror.
       */
      const compile = material.onBeforeCompile
      material.onBeforeCompile = (shader, renderer) => {
        compile.call(material, shader, renderer)
        shader.fragmentShader = shader.fragmentShader.replace('roughnessFactor = texture2D(roughnessMap, vRoughnessMapUv).r;',
          'roughnessFactor = mix(0.5, 0.3, texture2D(roughnessMap, vRoughnessMapUv).g);')
      }
      material.customProgramCacheKey = () => 'pin'
      /** The sparkle layers (a glitter texture, tinted) shine over the pin instead of covering it. */
      if (call.color?.includes('glitter')) {
        material.transparent = true
        material.blending = THREE.AdditiveBlending
        material.depthWrite = false
      }
      root.add(new THREE.Mesh(g, material))
    })
    this.frame(root, false)
  }

  /**
   * An agent patch on its own, on the game's inspect card (the plastic package, with its hang tab): the embroidered
   * texture is drawn over the card's, scaled and offset as the patch's material says, into one canvas texture.
   */
  async showPatch(id: string): Promise<void> {
    this.clear()
    const token = this.loadToken
    const patches = await loadPatches(this.opts.assetBase)
    const entry = patches.patch.get(id)
    if (!entry) throw new Error('No patch ' + id)
    const t = this.loader.textures
    const [card, normal, patch] = await Promise.all([
      t.load(GAME_ROOT + patches.card.color, true), t.load(GAME_ROOT + patches.card.normal, false), t.load(GAME_ROOT + entry.texture, true),
    ])
    if (token !== this.loadToken) return
    const size = 1024
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(card.image as CanvasImageSource, 0, 0, size, size)
    const side = size * 0.5 * entry.scale
    ctx.translate(size / 2 + entry.offset[0] * size, size / 2 - entry.offset[1] * size)
    ctx.rotate(THREE.MathUtils.degToRad(entry.rotation))
    ctx.scale(1, entry.squash)
    ctx.drawImage(patch.image as CanvasImageSource, -side / 2, -side / 2, side, side)
    const map = new THREE.CanvasTexture(canvas)
    map.flipY = false
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = card.anisotropy
    const geometry = new THREE.PlaneGeometry(1, 1)
    const uv = geometry.getAttribute('uv')
    for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i))
    const material = new THREE.MeshStandardMaterial({ map, normalMap: normal, roughness: 0.8, metalness: 0, side: THREE.DoubleSide, transparent: true })
    this.loaded.disposables.push(() => { material.dispose(); map.dispose() })
    const mesh = new THREE.Mesh(geometry, material)
    this.standalone = {}
    this.frame(mesh, false)
  }

  /** A charm on its own; pattern 0–100000. */
  async showCharm(id: string, seed: number, sticker?: string | null): Promise<void> {
    this.clear()
    const token = this.loadToken
    const def = (await loadAttachments(this.opts.assetBase)).charm.get(id)
    if (!def) throw new Error('No charm ' + id)
    const built = await this.attachments.buildCharm(def)
    if (token !== this.loadToken) return
    for (const p of built.parts) p.setSeed(seed)
    await this.attachments.charmSticker(built.parts, sticker)
    this.loaded.disposables.push(() => { for (const p of built.parts) p.material.dispose() })
    this.standalone = { parts: built.parts }
    this.frame(built.model, false)
  }

  /** The sticker slab's sticker when the charm is shown on its own. */
  async setStandaloneCharmSticker(id: string | null): Promise<void> {
    if (this.standalone?.parts) await this.attachments.charmSticker(this.standalone.parts, id)
  }

  /** Shows the sticker on its inspect card (or not). */
  setStandaloneCard(on: boolean): void {
    this.standalone?.setCard?.(on)
  }

  /** The wear of the sticker shown on its own. */
  setStandaloneWear(w: number): void {
    this.standalone?.setWear?.(w)
  }

  /** The pattern of the charm shown on its own. */
  setStandaloneSeed(seed: number): void {
    for (const p of this.standalone?.parts ?? []) p.setSeed(seed)
  }

  private resize(): void {
    const w = this.container.clientWidth || 1, h = this.container.clientHeight || 1
    this.camera.aspect = w / h
    /**
     * viewmodel_fov is the viewmodel's vertical angle, as skincraft.gg (which matches the game) draws it: at 16:9 a 68 puts
     * the AWP's scope 1.35x smaller than treating 68 as the horizontal angle at 4:3 (53.4 vertical) did. The canvas' shape
     * only crops the sides.
     */
    this.camera.fov = this.firstPerson ? this.viewmodel.fov : 35
    this.camera.updateProjectionMatrix()
    if (!this.firstPerson) this.fixed.fitFov()
    this.renderer.setSize(w, h)
    this.map.setSize(w, h)
    if (!this.fixed.active && this.fit && this.camera.position.distanceTo(this.home) < 1e-6 * Math.max(1, this.home.length())) {
      this.home.copy(this.homePosition())
      this.camera.position.copy(this.home)
      this.controls.update()
    }
    /**
     * Resizing clears the canvas, and the observer runs after this frame's render: draw again now, or the model
     * blinks out on every step of a resize (the side panel's folding animation is one per frame).
     */
    this.map.render()
  }
}
