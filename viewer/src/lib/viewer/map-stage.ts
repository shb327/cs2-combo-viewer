import * as THREE from 'three'
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'
import { loadBackgroundVideo } from '@/lib/viewer/fixed-inspect'
import { InspectScene, loadScenes } from '@/lib/viewer/inspect-scene'
import { MapVeil } from '@/lib/viewer/map-veil'
import { PostPipeline } from '@/lib/viewer/post'

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
  /** Called once a map (or the studio) is in place. */
  onChange: () => void
}

/**
 * Where the model is shown: the studio (a color and a room environment) or an inspect map — its baked HDR panorama
 * as the background and, prefiltered, as the environment, its 3D scene and lights, its pre-rendered background video
 * and its own post (tone curve, bloom, grade).
 */
export class MapStage {
  private readonly studioBackground: THREE.Color | null
  private readonly studioEnvironment: THREE.Texture
  private post: PostPipeline | null = null
  /** The post pipeline is used (off: the plain draw, lighter on slow devices). */
  private postEnabled = true
  private map: { id: string; background: THREE.Texture; environment: THREE.Texture; scene3d: InspectScene | null; video: HTMLVideoElement | null } | null = null
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

  get video(): HTMLVideoElement | null {
    return this.map?.video ?? null
  }

  /** Puts an inspect map around the model, or back to the studio with null. */
  async load(id: string | null): Promise<void> {
    const { scene, renderer, container } = this.host
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
    const [, texture, video, scenes] = await Promise.all([
      this.veil.cover(),
      new RGBELoader().loadAsync(dataBase + 'maps/' + id + '.hdr').catch(() => null),
      loadBackgroundVideo(dataBase + 'backgrounds/' + id + '.mp4'),
      loadScenes(dataBase),
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
    const canvas = renderer.domElement
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative'
    canvas.style.position = 'relative'
    container.insertBefore(video, canvas)
    void video.play().catch(() => {})
    if (scene3d) scene.add(scene3d.lights, scene3d.sceneLights)
    if (scene3d?.data.post) {
      this.post = new PostPipeline(renderer, scene3d.data.post, () => this.draw())
      this.post.setExposure(this.host.exposure())
      void this.post.loadLut(dataBase)
    }
    scene.backgroundIntensity = scene3d?.data.exposure ?? 1
    this.place()
    this.host.onChange()
    this.veil.reveal(video)
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

  setSize(w: number, h: number): void {
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
