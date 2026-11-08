import * as THREE from 'three'
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js'
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'
import { loadBackground } from '@/lib/viewer/fixed-inspect'
import { InspectScene, loadScenes } from '@/lib/viewer/inspect-scene'
import { MapVeil } from '@/lib/viewer/map-veil'
import { PostPipeline } from '@/lib/viewer/post'

/**
 * A map's HDR panorama: maps/<id>.exr (the map's sky as the game stores it, what build-maps.mjs writes), else
 * maps/<id>.hdr, or null. The EXR first, so a normal load makes no failing request.
 */
function loadPanorama(base: string): Promise<THREE.DataTexture | null> {
  return new EXRLoader().setDataType(THREE.HalfFloatType).loadAsync(base + '.exr')
    .catch(() => new RGBELoader().loadAsync(base + '.hdr'))
    .catch(() => null)
}

/** What the map stage needs from the viewer. */
export interface MapStageHost {
  renderer: THREE.WebGLRenderer
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  container: HTMLElement
  gltf: GLTFLoader
  /** Where the viewer data (maps, scenes, backgrounds) is. */
  dataBase: string
  /** The model's holder and the studio lights, kept out of the scene's own pass. */
  holder: THREE.Object3D
  studioLights: THREE.Light[]
  firstPerson: () => boolean
  /** Whether only the map's own light lights the item (the fixed inspect, first person over a map). */
  fixedInspect: () => boolean
  exposure: () => number
  /** The lights' turn (degrees), which turns the panorama too. */
  lightYaw: () => number
  /** Fetch the background with CORS, so it can be drawn into a readable canvas. */
  readableBackground?: boolean
  /** Called once a map (or the studio) is in place. */
  onChange: () => void
}

/**
 * Where the model is shown: the studio (a color and a room environment) or an inspect map — its baked HDR panorama
 * as the background and, prefiltered, as the environment, its 3D scene and lights, its pre-rendered background video
 * (or a still screenshot) and its own post (tone curve, bloom, grade).
 */
export class MapStage {
  private readonly studioBackground: THREE.Color | null
  private readonly studioEnvironment: THREE.Texture
  private post: PostPipeline | null = null
  /** The post pipeline is used (off: the plain draw, lighter on slow devices). */
  private postEnabled = true
  private map: { id: string; background: THREE.Texture; environment: THREE.Texture; scene3d: InspectScene | null; video: HTMLVideoElement | HTMLImageElement | null } | null = null
  private token = 0
  /** Covers the view while the map changes. */
  private readonly veil: MapVeil

  constructor(private readonly host: MapStageHost, background: THREE.ColorRepresentation | null) {
    this.veil = new MapVeil(host.container)
    this.studioBackground = background === null ? null : new THREE.Color(background)
    this.studioEnvironment = new THREE.PMREMGenerator(host.renderer).fromScene(new RoomEnvironment(), 0.04).texture
    host.scene.background = this.studioBackground
    host.scene.environment = this.studioEnvironment
  }

  get id(): string | null {
    return this.map?.id ?? null
  }

  get scene3d(): InspectScene | null {
    return this.map?.scene3d ?? null
  }

  /** The background drawn behind the canvas: the map's video or still image. */
  get video(): HTMLVideoElement | HTMLImageElement | null {
    return this.map?.video ?? null
  }

  /** Puts an inspect map around the model, or back to the studio with null. */
  async load(id: string | null): Promise<void> {
    const { scene, renderer } = this.host
    const token = ++this.token
    /** The first map of the session appears without the veil only when there was nothing to hide. */
    const veiled = this.map !== null || id !== null
    if (!id) {
      if (veiled) await this.veil.cover()
      if (token !== this.token) return
      this.disposeMap()
      scene.background = this.studioBackground
      scene.environment = this.studioEnvironment
      scene.backgroundIntensity = 1
      this.host.onChange()
      this.veil.reveal()
      return
    }
    const dataBase = this.host.dataBase
    const backgroundLoad = loadScenes(dataBase).then((s) => loadBackground(dataBase + 'backgrounds/' + id, s.get(id)?.background, this.size, this.host.readableBackground))
    /**
     * The first map of the page: its background (a small image) goes up as soon as it has loaded, without the veil, so
     * the visitor sees the map while the environment (a larger file), the lights and the model still load.
     */
    const early = this.map === null ? backgroundLoad.then((v) => (token === this.token && v ? this.showEarly(v) : null)) : null
    const [, texture, video, scenes] = await Promise.all([
      early ? Promise.resolve() : this.veil.cover(),
      loadPanorama(dataBase + 'maps/' + id),
      backgroundLoad,
      loadScenes(dataBase),
      early,
    ])
    const sceneData = scenes.get(id)
    const scene3d = texture && video && sceneData ? await InspectScene.load(this.host.gltf, dataBase, sceneData, true).catch(() => null) : null
    if (!texture || !video || token !== this.token) {
      texture?.dispose(); scene3d?.dispose(); video?.remove()
      /** Failed: the old map stays. */
      if (token === this.token) this.veil.reveal()
      return
    }
    texture.mapping = THREE.EquirectangularReflectionMapping
    texture.generateMipmaps = true
    texture.minFilter = THREE.LinearMipmapLinearFilter
    scene3d?.setFogEnvironment(texture)
    const pmrem = new THREE.PMREMGenerator(renderer)
    const environment = pmrem.fromEquirectangular(texture).texture
    pmrem.dispose()
    this.disposeMap()
    this.map = { id, background: texture, environment, scene3d, video }
    scene.environment = environment
    /**
     * A pre-rendered background (the game's fixed inspect camera: only the item turns): shown behind the canvas,
     * already graded, so it skips the tone curve; the 3D scene only lends its lights.
     */
    scene.background = null
    if (!video.isConnected) this.insertBackground(video)
    if (scene3d) scene.add(scene3d.lights, scene3d.sceneLights)
    if (scene3d?.data.post) {
      this.post = new PostPipeline(renderer, scene3d.data.post, () => this.draw())
      this.post.setExposure(this.host.exposure())
      void this.post.loadLut(dataBase)
    }
    scene.backgroundIntensity = scene3d?.data.exposure ?? 1
    this.place()
    this.host.onChange()
    if (!early) this.veil.reveal(video)
  }

  /** Puts a background behind the canvas. */
  private insertBackground(video: HTMLVideoElement | HTMLImageElement): void {
    const { renderer, container } = this.host
    const canvas = renderer.domElement
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative'
    canvas.style.position = 'relative'
    container.insertBefore(video, canvas)
    if (video instanceof HTMLVideoElement) void video.play().catch(() => {})
  }

  /** The first map's background, faded in on its own before the rest of the map has loaded. */
  private showEarly(video: HTMLVideoElement | HTMLImageElement): void {
    video.style.opacity = '0'
    video.style.transition = 'opacity 250ms ease-out'
    this.insertBackground(video)
    this.host.scene.background = null
    this.host.onChange()
    requestAnimationFrame(() => { video.style.opacity = '1' })
  }

  /**
   * Turns the map with the camera, as the game's inspect does: the background stays put on screen while the orbit
   * turns the weapon in front of it (and its reflections change); the light angle still turns the map.
   */
  place(): void {
    const { scene, camera } = this.host
    const scene3d = this.map?.scene3d
    if (scene3d) {
      /** The 3D scene sits as the game camera sees it; the panorama (reflections, and what lies past the scene) turns with it. */
      camera.updateMatrixWorld()
      const turn = new THREE.Euler().setFromQuaternion(scene3d.place(camera.matrixWorld))
      scene.backgroundRotation.copy(turn)
      scene.environmentRotation.copy(turn)
      return
    }
    const view = new THREE.Euler().setFromQuaternion(this.host.firstPerson() ? new THREE.Quaternion() : camera.quaternion, 'YXZ')
    const yaw = THREE.MathUtils.degToRad(this.host.lightYaw())
    scene.backgroundRotation.set(view.x, view.y + yaw, 0, 'YXZ')
    scene.environmentRotation.copy(scene.backgroundRotation)
  }

  /** Draws a frame, through the map's post pipeline when it has one. */
  render(): void {
    if (this.post && this.postEnabled) this.post.render()
    else this.draw()
  }

  /** Turns the map's post-processing (bloom, color grading) on or off. */
  setPostEnabled(on: boolean): void {
    this.postEnabled = on
  }

  /**
   * Draws the scene. With an inspect map's 3D scene it takes two passes, so the scene keeps the game's own light (its
   * lightmap, environment and item lights) and the viewer's key / rim lights only reach the model: the scene and the
   * background first, then the model over it, sharing the depth.
   */
  private draw(): void {
    const { renderer, scene, camera, holder, studioLights } = this.host
    const scene3d = this.map?.scene3d
    if (!scene3d) {
      renderer.render(scene, camera)
      return
    }
    const background = scene.background
    /**
     * The item lights are for the item: they stay out of the scene's pass (its light is baked), and off in first person,
     * whose arms sit right under them.
     */
    scene3d.lights.visible = false
    holder.visible = false
    for (const light of studioLights) light.visible = false
    renderer.render(scene, camera)
    holder.visible = true
    scene3d.lights.visible = !this.host.firstPerson()
    scene3d.root.visible = false
    /** The game's inspect has no studio lights: in the fixed inspect and first person only the map's own light the item. */
    for (const light of studioLights) light.visible = !this.host.fixedInspect()
    scene.background = null
    renderer.autoClear = false
    renderer.render(scene, camera)
    renderer.autoClear = true
    scene.background = background
    scene3d.root.visible = true
  }

  setExposure(exposure: number): void {
    this.post?.setExposure(exposure)
  }

  /** The canvas' size in CSS pixels: a still background is picked to cover it. */
  private size = { w: 1280, h: 720 }

  setSize(w: number, h: number): void {
    this.size = { w, h }
    this.post?.setSize(w, h)
  }

  private disposeMap(): void {
    this.post?.dispose()
    this.post = null
    if (!this.map) return
    this.map.background.dispose()
    this.map.environment.dispose()
    this.map.scene3d?.dispose()
    this.map.video?.remove()
    this.map = null
  }

  dispose(): void {
    this.disposeMap()
    this.veil.dispose()
  }
}
