import * as THREE from 'three'
import type { InspectScene } from '@/lib/viewer/inspect-scene'

/** The game's inspect camera per weapon (panorama/scripts/inspect.vts: m_CameraSettingsPerWeapon; else by category). */
const INSPECT_CAMERA: Record<string, string> = {
  weapon_awp: '7', weapon_aug: '3', weapon_sg556: '4', weapon_ssg08: '6', weapon_ak47: '4', weapon_m4a1_silencer: '6', weapon_famas: '4',
  weapon_g3sg1: '5', weapon_galilar: '3', weapon_m4a1: '4', weapon_scar20: '5', weapon_mp5sd: '3', weapon_xm1014: '4', weapon_m249: '6',
  weapon_ump45: '3', weapon_bizon: '3', weapon_mag7: '3', weapon_nova: '5', weapon_sawedoff: '3', weapon_negev: '5', weapon_usp_silencer: '2',
  weapon_elite: '2', weapon_tec9: '2', weapon_revolver: '2', weapon_c4: '3', weapon_taser: '0',
}
const PISTOLS = /^weapon_(glock|hkp2000|p250|fiveseven|cz75a|deagle)$/
const SMGS = /^weapon_(mac10|mp9|mp7|p90)$/

/** The inspect camera (cam_<n>) the game uses for a weapon. */
export function inspectCamera(name: string): string {
  return INSPECT_CAMERA[name] ?? (PISTOLS.test(name) ? '0' : SMGS.test(name) ? '2' : '3')
}

/**
 * The spherical harmonics (three's LightProbe convention) whose irradiance matches the game's ambient cube: the
 * cube holds radiance, Σ n_i² · cube[sign of n_i] for a normal n, so the irradiance is π² times it with three's
 * Lambert (which divides by π) — matched against skinshotter's inspect (Anubis, Ancient, Italy) — fitted by least
 * squares over directions. `yaw` turns the cube from the scene into the viewer's frame (the item stands unturned at
 * the origin).
 */
export function ambientCubeSH(cube: number[][], yaw: number): THREE.SphericalHarmonics3 {
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(yaw))
  const dirs: THREE.Vector3[] = []
  for (let i = 0; i < 400; i++) {
    const y = 1 - (2 * (i + 0.5)) / 400, r = Math.sqrt(1 - y * y), a = i * 2.399963
    dirs.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r))
  }
  const target = (n: THREE.Vector3) => {
    const d = n.clone().applyQuaternion(turn)
    const c = [0, 1, 2].map((k) => d.x * d.x * cube[d.x >= 0 ? 0 : 1][k] + d.y * d.y * cube[d.y >= 0 ? 2 : 3][k] + d.z * d.z * cube[d.z >= 0 ? 4 : 5][k])
    return c.map((v) => v * Math.PI * Math.PI)
  }
  /** Each coefficient's irradiance at every direction (getIrradianceAt is linear in the coefficients). */
  const basis = Array.from({ length: 9 }, (_, j) => {
    const sh = new THREE.SphericalHarmonics3()
    sh.coefficients[j].set(1, 1, 1)
    return dirs.map((n) => sh.getIrradianceAt(n, new THREE.Vector3()).x)
  })
  const out = new THREE.SphericalHarmonics3()
  const goal = dirs.map(target)
  for (let ch = 0; ch < 3; ch++) {
    /** Normal equations (9×9), solved by Gaussian elimination. */
    const m = basis.map((bi) => [...basis.map((bj) => bi.reduce((s, v, k) => s + v * bj[k], 0)), bi.reduce((s, v, k) => s + v * goal[k][ch], 0)])
    for (let i = 0; i < 9; i++) {
      let p = i
      for (let r = i + 1; r < 9; r++) if (Math.abs(m[r][i]) > Math.abs(m[p][i])) p = r
      ;[m[i], m[p]] = [m[p], m[i]]
      for (let r = 0; r < 9; r++) {
        if (r === i || m[i][i] === 0) continue
        const f = m[r][i] / m[i][i]
        for (let c = i; c < 10; c++) m[r][c] -= f * m[i][c]
      }
    }
    for (let j = 0; j < 9; j++) out.coefficients[j].setComponent(ch, m[j][j] === 0 ? 0 : m[j][9] / m[j][j])
  }
  return out
}

/**
 * Lets the model's materials drop the environment map's diffuse light (scaled by `uniform`), keeping its
 * reflections: once per material, chained to the material's own shader changes.
 */
export function patchEnvDiffuse(root: THREE.Object3D, uniform: { value: number }): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!(m instanceof THREE.MeshStandardMaterial) || m.userData.envDiffusePatched) continue
      m.userData.envDiffusePatched = true
      const previous = m.onBeforeCompile
      const key = m.customProgramCacheKey()
      m.onBeforeCompile = (shader, renderer) => {
        previous.call(m, shader, renderer)
        shader.uniforms.uEnvDiffuse = uniform
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uEnvDiffuse;')
          .replace('#include <lights_fragment_maps>', THREE.ShaderChunk.lights_fragment_maps
            .replace('iblIrradiance += getIBLIrradiance( geometryNormal );', 'iblIrradiance += getIBLIrradiance( geometryNormal ) * uEnvDiffuse;'))
      }
      m.customProgramCacheKey = () => key + 'envDiffuse'
      m.needsUpdate = true
    }
  })
}

/** A map's pre-rendered background video (muted, looping), or null when there is none. */
export function loadBackgroundVideo(url: string): Promise<HTMLVideoElement | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    Object.assign(video, { muted: true, loop: true, playsInline: true, autoplay: true, preload: 'auto' })
    Object.assign(video.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none', zIndex: '0' })
    const done = (v: HTMLVideoElement | null) => { clearTimeout(timer); resolve(v) }
    const timer = setTimeout(() => done(null), 8000)
    video.addEventListener('loadeddata', () => done(video), { once: true })
    video.addEventListener('error', () => done(null), { once: true })
    video.src = url
  })
}

/** How far the zoom moves the camera (× the game camera's distance to the item). */
const MIN_DOLLY = 0.35
const MAX_DOLLY = 1.6
/** The auto-rotate's turn per frame (degrees), as the orbit view's. */
const AUTO_ROTATE = THREE.MathUtils.radToDeg(0.004)

const wrapDegrees = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180

/**
 * The game's inspect over a pre-rendered map background: the camera stays where the game's is (scroll moves it toward
 * the item), and the item turns when dragged or with the viewer's auto-rotate (inspect.vts mouse limits 90° up and
 * down; its own auto_rotate sway is left out). The item's diffuse light is
 * then the map's light probes (an ambient cube), the environment map only reflects.
 */
export class FixedInspect {
  /** The item's ambient light here (the map's light probes, as an ambient cube); add it to the scene. */
  readonly probe = new THREE.LightProbe(new THREE.SphericalHarmonics3(), 0)
  /**
   * How much of the environment map's diffuse light the model takes (a uniform shared by every patched material): 0
   * here, where the probes' ambient cube is the diffuse light and the environment only reflects.
   */
  private readonly envDiffuse = { value: 1 }
  /** The ambient cube's strength (× the game's), and whether the item uses it now. */
  private ambientScale = 1
  private probeOn = false
  private drag: { yaw: number; pitch: number; dragging: boolean; last: [number, number] } | null = null
  /** The game camera's vertical FOV. */
  private fov = 35
  /** The game camera's place (the item at the origin), and the zoom: its distance × this. */
  private readonly base = new THREE.Vector3()
  private dolly = 1
  /** The item's turn (degrees) so its front (+Z) faces the camera: for items framed by size; 0 for weapons. */
  private faceYaw = 0

  constructor(private readonly camera: THREE.PerspectiveCamera, private readonly holder: THREE.Object3D, canvas: HTMLCanvasElement) {
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.drag) return
      this.drag.dragging = true
      this.drag.last = [e.clientX, e.clientY]
      canvas.setPointerCapture(e.pointerId)
    })
    canvas.addEventListener('pointermove', (e) => {
      const f = this.drag
      if (!f?.dragging) return
      f.yaw = wrapDegrees(f.yaw + (e.clientX - f.last[0]) * 0.4)
      f.pitch = THREE.MathUtils.clamp(f.pitch + (e.clientY - f.last[1]) * 0.4, -45, 45)
      f.last = [e.clientX, e.clientY]
    })
    const release = () => { if (this.drag) this.drag.dragging = false }
    canvas.addEventListener('pointerup', release)
    canvas.addEventListener('pointercancel', release)
    // Scroll zooms: the camera moves along its line to the item (the background stays as the game framed it).
    canvas.addEventListener('wheel', (e) => {
      if (!this.drag) return
      e.preventDefault()
      this.dolly = THREE.MathUtils.clamp(this.dolly * Math.exp(e.deltaY * 0.001), MIN_DOLLY, MAX_DOLLY)
      this.placeCamera()
    }, { passive: false })
  }

  private setProbe(on: boolean): void {
    this.probeOn = on
    this.probe.intensity = on ? this.ambientScale : 0
  }

  /** The probes' ambient lights the item now. */
  get ambientOn(): boolean {
    return this.probeOn
  }

  /** The light probes' ambient strength (× the game's). */
  setAmbientScale(scale: number): void {
    this.ambientScale = scale
    this.setProbe(this.probeOn)
  }

  /** The item is lit by the sun only (a charm or sticker on its own, as the game's). */
  sunOnly = false

  get active(): boolean {
    return this.drag !== null
  }

  /**
   * Puts the camera where the game's inspect camera for `weapon` is relative to the item (scene: the item at the
   * anchor, turned by its yaw; here: the item at the origin), with its vertical FOV and the item's lights.
   * @param fit an item framed by its size instead (a charm, sticker or agent; its bounding radius): the camera moved along
   * its line until the item fills the view, and with `face` the item turned so its front (+Z) faces it (`turn` degrees more); `sunOnly`: lit by the sun only, as the game's keychain and sticker inspect
   * (skincraft's rig: every light_item spot off)
   */
  enter(scene3d: InspectScene, weapon: string, fit?: { radius: number; sunOnly?: boolean; face?: boolean; turn?: number; studio?: { distance: number; fov: number } }): void {
    if (!this.drag) {
      this.drag = { yaw: 0, pitch: 0, dragging: false, last: [0, 0] }
      this.dolly = 1
    }
    const view = scene3d.data.weapon!
    const cam = view.cameras[inspectCamera(weapon)] ?? view.cameras['3'] ?? Object.values(view.cameras)[0]
    scene3d.setGameCamera(cam.position, cam.forward)
    /** The item's lights as the game's rig has them on for a weapon: the sun and light_item(_new) (skincraft's rig dump). */
    this.sunOnly = !!fit?.sunOnly
    if (fit?.sunOnly) scene3d.useLights([], [], view.sun ?? null)
    else scene3d.useLights(view.lights ?? [], view.sceneLights ?? [], view.sun ?? null)
    if (view.ambientCube) {
      this.probe.sh.copy(ambientCubeSH(view.ambientCube, view.anchor.yaw))
      this.setProbe(true)
      patchEnvDiffuse(this.holder, this.envDiffuse)
      this.envDiffuse.value = 0
    } else {
      this.setProbe(false)
      this.envDiffuse.value = 1
    }
    this.fov = cam.fov
    const unturn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -THREE.MathUtils.degToRad(view.anchor.yaw))
    const position = new THREE.Vector3(...cam.position).sub(new THREE.Vector3(...view.anchor.position)).applyQuaternion(unturn)
    const forward = new THREE.Vector3(...cam.forward).applyQuaternion(unturn)
    this.faceYaw = fit?.face ? THREE.MathUtils.radToDeg(Math.atan2(position.x, position.z)) + (fit.turn ?? 0) : 0
    if (fit?.studio) {
      /** The studio's framing kept: its distance scaled so the item fills the game camera's (fitted) FOV as it did the studio's. */
      const half = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * Math.min(1, (16 / 9) / this.camera.aspect)
      position.setLength(fit.studio.distance * Math.tan(THREE.MathUtils.degToRad(fit.studio.fov / 2)) / half)
    } else if (fit) position.setLength(fit.radius / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.25)
    this.base.copy(position)
    this.camera.position.copy(position)
    this.camera.up.set(0, 1, 0)
    this.camera.lookAt(position.clone().add(forward))
    this.placeCamera()
    this.fitFov()
    this.camera.updateMatrixWorld()
  }

  /** First person lit as the game's (skincraft's FPV rig): the map's sun and ambient, no studio lights. */
  private fpLit = false

  /** Whether the map's own light (sun, probes) lights the item: the fixed inspect or a first-person view over a map. */
  get gameLit(): boolean {
    return this.active || this.fpLit
  }

  /**
   * First person over a map: the sun, the probes' ambient cube at the item spot (turned into the eye's frame: the
   * scene's camera looks along +Z here) and the environment for reflections only; null scene3d turns it off.
   */
  lightFirstPerson(scene3d: InspectScene | null): void {
    const view = scene3d?.data.weapon
    this.fpLit = !!scene3d && !!view
    if (!scene3d || !view) {
      this.setProbe(false)
      this.envDiffuse.value = 1
      return
    }
    scene3d.useLights([], [], view.sun ?? null)
    if (view.ambientCube) {
      const [fx, , fz] = scene3d.data.camera.forward
      this.probe.sh.copy(ambientCubeSH(view.ambientCube, THREE.MathUtils.radToDeg(Math.atan2(fx, fz))))
      this.setProbe(true)
      patchEnvDiffuse(this.holder, this.envDiffuse)
      this.envDiffuse.value = 0
    }
  }

  /** Patches meshes added to the item after `enter` (a charm hung on the weapon) to drop the environment's diffuse light too. */
  patchAdded(): void {
    if (this.gameLit && this.envDiffuse.value === 0) patchEnvDiffuse(this.holder, this.envDiffuse)
  }

  /** Leaves the fixed inspect (the scene back to its own camera and lights); false when it wasn't on. */
  exit(scene3d: InspectScene | null): boolean {
    if (!this.drag) return false
    this.drag = null
    this.setProbe(false)
    this.envDiffuse.value = 1
    if (scene3d) {
      scene3d.setGameCamera(scene3d.data.camera.position, scene3d.data.camera.forward)
      scene3d.useLights(scene3d.data.lights, scene3d.data.sceneLights ?? [])
    }
    this.holder.quaternion.identity()
    return true
  }

  /** The game camera's vertical FOV, narrowed when the canvas is wider than the 16:9 background (cropped top and bottom). */
  fitFov(): void {
    if (!this.drag) return
    const half = Math.tan(THREE.MathUtils.degToRad(this.fov / 2)) * Math.min(1, (16 / 9) / this.camera.aspect)
    this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(half))
    this.camera.updateProjectionMatrix()
  }

  /** The game's view with the item turned half way round (its other side). */
  flip(): void {
    if (!this.drag) return
    this.reset()
    this.drag.yaw = 180
  }

  /** Back to the game's view: the item unturned, the camera at its distance. */
  reset(): void {
    if (!this.drag) return
    this.drag.yaw = 0
    this.drag.pitch = 0
    this.dolly = 1
    this.placeCamera()
  }

  /** The camera at the game's place, moved toward or away from the item by the zoom. */
  private placeCamera(): void {
    this.camera.position.copy(this.base).multiplyScalar(this.dolly)
    this.camera.updateMatrixWorld()
  }

  /**
   * The user's turn of the item, plus the auto-rotate's (the item stays put until dragged otherwise).
   * @param autoRotate the viewer's auto-rotate is on
   */
  step(autoRotate = false): void {
    if (!this.drag) return
    if (autoRotate && !this.drag.dragging) this.drag.yaw = wrapDegrees(this.drag.yaw + AUTO_ROTATE)
    const { yaw, pitch } = this.drag
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion)
    this.holder.quaternion
      .setFromAxisAngle(right, THREE.MathUtils.degToRad(pitch))
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(yaw + this.faceYaw)))
  }
}
