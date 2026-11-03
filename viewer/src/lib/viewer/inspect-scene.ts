import * as THREE from 'three'
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js'
import type { ScenePost } from '@/lib/viewer/post'

/** A light the game aims at the inspected item (build_scenes.py; glTF space). */
export interface SceneLight {
  type: 'spot' | 'point'
  position: number[]
  direction: number[]
  color: number[]
  lumens: number
  range: number
}

/** The map's sun (light_environment): where its light travels (glTF axes), its colour and brightness. */
export interface SceneSun {
  direction: number[]
  color: number[]
  brightness: number
}

/** An inspect map's 3D scene (build_scenes.py: scenes.json), all in glTF space (metres, Y up). */
export interface InspectSceneData {
  id: string
  name: string
  glb: string
  lightmap: string | null
  /** The scene's exposure: brings its baked light to a common level (outdoor maps are several times brighter). */
  exposure?: number
  /** The game's weapon inspect camera: where it stands, where it looks, its vertical FOV. */
  camera: { position: number[]; forward: number[]; roll: number; fov: number }
  /** Where the game puts the inspected weapon. */
  anchor: { position: number[]; yaw: number }
  lights: SceneLight[]
  /** The map's dynamic lights near the camera: their direct light isn't baked, so it is drawn live (scene and item). */
  sceneLights?: SceneLight[]
  /** The map's distance fog (build_scenes.py), in metres: its colour comes from the map's panorama, blurred. */
  /** The weapon inspect's spot: the `item` entity and the cameras framing it (cam_0..cam_8, and their _intro). */
  weapon?: {
    anchor: { position: number[]; yaw: number }
    cameras: Record<string, { position: number[]; forward: number[]; fov: number }>
    /** The weapon spot's own item lights (light_item, light_item_new) and the dynamic lights near its cameras. */
    lights: SceneLight[]
    sceneLights: SceneLight[]
    /** The light probes' ambient cube at the item (+X, −X, +Y, −Y, +Z, −Z, glTF axes; linear RGB). */
    ambientCube?: number[][]
    sun?: SceneSun | null
  } | null
  /** The map's tone curve, bloom and colour grade (build_post.py). */
  post?: ScenePost
  fog?: { cubemap?: { start: number; end: number; falloff: number; opacity: number; lodBias: number } }
}

let scenesRequest: Promise<Map<string, InspectSceneData>> | null = null

/** The maps that have a 3D scene, by id (loaded once). */
export function loadScenes(dataBase: string): Promise<Map<string, InspectSceneData>> {
  scenesRequest ??= fetch(dataBase + 'scenes.json')
    .then((r) => r.json() as Promise<InspectSceneData[]>)
    .then((list) => new Map(list.map((s) => [s.id, s])))
    .catch(() => new Map())
  return scenesRequest
}

/**
 * Whether a mesh is lightmapped: it has a second UV set that spans part of the atlas. Meshes the game lights per vertex
 * or with probes carry one too, all at (0, 0).
 */
function hasLightmapUv(geometry: THREE.BufferGeometry): boolean {
  const uv = geometry.getAttribute('uv1')
  if (!uv) return false
  for (let i = 0; i < uv.count; i++) if (uv.getX(i) !== 0 || uv.getY(i) !== 0) return true
  return false
}

/**
 * A two-layer world material (build_layers.py): the second layer's colour (shipped in the sheen colour slot) painted
 * over the first by the vertex weight (_TEXCOORD_4.x), sharpened by the blend modulation texture (in the clearcoat
 * slot) when the material has one.
 */
function addLayer2(material: THREE.MeshPhysicalMaterial, geometry: THREE.BufferGeometry): void {
  const layer = material.userData.layer2 as { softness: number; scale: number[]; modulated: boolean }
  const color = material.sheenColorMap
  const modulation = layer.modulated ? material.clearcoatMap : null
  material.sheen = 0
  material.sheenColorMap = null
  material.clearcoat = 0
  material.clearcoatMap = null
  if (!color || !material.map || !geometry.getAttribute('_texcoord_4')) return
  const uniforms = {
    layer2Map: { value: color },
    layer2Mod: { value: modulation },
    layer2Params: { value: new THREE.Vector3(Math.max(layer.softness, 0.01), layer.scale[0] ?? 1, layer.scale[1] ?? 1) },
  }
  const previous = material.onBeforeCompile
  const key = material.customProgramCacheKey()
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer)
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 _texcoord_4;\nvarying float vLayerBlend;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLayerBlend = _texcoord_4.x;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vLayerBlend;\nuniform sampler2D layer2Map;\nuniform sampler2D layer2Mod;\nuniform vec3 layer2Params;')
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  float w = clamp(vLayerBlend, 0.0, 1.0);
  ${modulation ? 'float m = texture2D(layer2Mod, vMapUv).g;\n  w = smoothstep(m - layer2Params.x, m + layer2Params.x, w);' : ''}
  vec4 c2 = texture2D(layer2Map, vMapUv * layer2Params.yz);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuse * c2.rgb, w);
}`)
  }
  material.customProgramCacheKey = () => key + 'layer2' + (modulation ? 'm' : '')
}

/** A Source light as a three one, in `group`. */
/** Which of the map lights a light is (its strength multiplier in `setLightScales`). */
type LightKind = 'sun' | 'item' | 'scene'

function addLight(group: THREE.Group, l: SceneLight, scale = 1, kind: LightKind = 'item'): void {
  const color = new THREE.Color().setRGB(l.color[0], l.color[1], l.color[2], THREE.SRGBColorSpace)
  const candela = (l.lumens / (4 * Math.PI)) * LUMEN_SCALE * scale
  const light = l.type === 'spot' ? new THREE.SpotLight(color, candela, l.range * 1.5, Math.PI / 3, 0.7, 2) : new THREE.PointLight(color, candela, l.range * 1.5, 2)
  light.position.set(l.position[0], l.position[1], l.position[2])
  if (light instanceof THREE.SpotLight) {
    light.target.position.copy(light.position).add(new THREE.Vector3(l.direction[0], l.direction[1], l.direction[2]))
    group.add(light.target)
  }
  light.userData.lightKind = kind
  light.userData.baseIntensity = light.intensity
  group.add(light)
}

/** The map's own lights sit on top of its baked bounce light: matched by eye to the game's inspect (warehouse). */
const SCENE_LIGHT_SCALE = 0.4

/** The effects' noise masks (g_tMask1–3, not exported) leave about this much of the colour texture on average. */
const EFFECT_MASK = 0.25

/** Source's light units are far from three's: lumens → candela, scaled to sit with the viewer's own lights. */
const LUMEN_SCALE = 2.5

/**
 * An inspect map as a 3D background: the scene the game shows (world and props, lightmapped where it has a second UV
 * set), with the lights it aims at the weapon. `place` sets it so the viewer's camera sees exactly what the game's
 * inspect camera sees, whatever the orbit does to the weapon.
 */
export class InspectScene {
  /** The scene's geometry. */
  readonly root = new THREE.Group()
  /** The lights aimed at the item: placed with the scene, they light both the scene and the viewer's model. */
  readonly lights = new THREE.Group()
  /** The map's own dynamic lights, on in both passes. */
  readonly sceneLights = new THREE.Group()
  /** The game camera's world matrix in the scene (inverted once). */
  private cameraInverse: THREE.Matrix4
  private readonly disposables: (() => void)[] = []
  /** The fog's uniforms, shared by every scene material: the panorama and the scene's rotation back to glTF space. */
  private readonly fogUniforms = {
    fogEnv: { value: null as THREE.Texture | null },
    fogInverse: { value: new THREE.Matrix3() },
    fogParams: { value: new THREE.Vector4(0, 1, 1, 0) },
    fogLod: { value: 0 },
  }

  private constructor(readonly data: InspectSceneData) {
    const c = data.camera
    const position = new THREE.Vector3(...c.position)
    const target = position.clone().add(new THREE.Vector3(...c.forward))
    const look = new THREE.Matrix4().lookAt(position, target, new THREE.Vector3(0, 1, 0))
    look.setPosition(position)
    this.cameraInverse = look.invert()
    this.root.matrixAutoUpdate = false
    this.lights.matrixAutoUpdate = false
    this.sceneLights.matrixAutoUpdate = false
  }

  /**
   * @param lightsOnly only the lights and the camera: no geometry or lightmap is downloaded (the map is a pre-rendered video)
   */
  static async load(gltf: GLTFLoader, dataBase: string, data: InspectSceneData, lightsOnly = false): Promise<InspectScene> {
    const s = new InspectScene(data)
    if (lightsOnly) {
      s.useLights(data.lights, data.sceneLights ?? [])
      return s
    }
    const [model, lightmap] = await Promise.all([
      gltf.loadAsync(dataBase + data.glb),
      data.lightmap ? new RGBELoader().loadAsync(dataBase + data.lightmap).catch(() => null) : Promise.resolve(null),
    ])
    if (lightmap) {
      lightmap.channel = 1
      lightmap.flipY = false
      s.disposables.push(() => lightmap.dispose())
    }
    const exposure = data.exposure ?? 1
    /** The export carries the map's own lights (the sun at thousands of lux): the lightmap already holds them. */
    const exported: THREE.Object3D[] = []
    model.scene.traverse((o) => { if (o instanceof THREE.Light) exported.push(o) })
    for (const l of exported) l.removeFromParent()
    model.scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return
      const old = o.material as THREE.MeshStandardMaterial
      if (old.userData?.layer2) addLayer2(old as THREE.MeshPhysicalMaterial, o.geometry)
      const vmat = old.userData?.vmat as { ShaderName?: string; IntParams?: Record<string, number>; FloatParams?: Record<string, number>; VectorParams?: Record<string, number[]> } | undefined
      /** Foliage (awnings, bushes) keeps its wind animation weights in the vertex colour, not a colour. */
      if (vmat?.ShaderName === 'csgo_foliage.vfx' || vmat?.IntParams?.F_VERTEX_ANIMATION) old.vertexColors = false
      if (vmat?.ShaderName === 'csgo_effects.vfx') {
        /** Glow cards and light shafts: added over the scene, never hiding what's behind them. */
        const tint = vmat.VectorParams?.g_vColorTint ?? [1, 1, 1]
        const boost = (vmat.FloatParams?.g_flColorBoost ?? 1) * (vmat.FloatParams?.g_flOpacityScale ?? 1) * EFFECT_MASK
        o.material = new THREE.MeshBasicMaterial({
          map: old.map, color: new THREE.Color().setRGB(tint[0] * boost, tint[1] * boost, tint[2] * boost, THREE.SRGBColorSpace),
          blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, name: old.name,
        })
        o.renderOrder = 1
        s.effectFade(o.material as THREE.MeshBasicMaterial, vmat.FloatParams ?? {})
        old.dispose()
      } else if (vmat?.IntParams?.F_SELF_ILLUM && old.emissiveMap) {
        /** Self-illuminated (lamps, screens): the export keeps the mask but not the strength. */
        const tint = vmat.VectorParams?.g_vSelfIllumTint ?? [1, 1, 1]
        const strength = (vmat.FloatParams?.g_flSelfIllumBrightness ?? 1) * (vmat.FloatParams?.g_flSelfIllumScale ?? 1)
        old.emissive.setRGB(tint[0], tint[1], tint[2], THREE.SRGBColorSpace)
        old.emissiveIntensity = Math.max(strength, 1)
      } else if (lightmap && hasLightmapUv(o.geometry)) {
        /**
         * The material keeps its normal, roughness and occlusion maps (the surface detail, in the reflections); its
         * diffuse light is the lightmap's alone (three divides it by π, as any irradiance), not the environment's.
         */
        /** The export marks most surfaces fully metal; the vmat says what is (a metalness mask only with F_METALNESS_TEXTURE). */
        if (!vmat?.IntParams?.F_METALNESS_TEXTURE) {
          old.metalnessMap = null
          old.metalness = vmat?.FloatParams?.g_flMetalness ?? 0
        }
        old.lightMap = lightmap
        old.lightMapIntensity = exposure * Math.PI
        old.envMapIntensity = exposure
        const previous = old.onBeforeCompile
        const key = old.customProgramCacheKey()
        old.onBeforeCompile = (shader, renderer) => {
          previous.call(old, shader, renderer)
          shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>',
            THREE.ShaderChunk.lights_fragment_maps.replace('iblIrradiance += getIBLIrradiance( geometryNormal );', ''))
        }
        old.customProgramCacheKey = () => key + 'inspect-lightmapped'
      } else if ('envMapIntensity' in old) {
        old.envMapIntensity = exposure
      }
      s.disposables.push(() => { o.geometry.dispose(); (o.material as THREE.Material).dispose() })
    })
    const cubemap = data.fog?.cubemap
    if (cubemap && cubemap.opacity > 0) {
      s.fogUniforms.fogParams.value.set(cubemap.start, Math.max(cubemap.end, cubemap.start + 1), cubemap.falloff, cubemap.opacity)
      s.fogUniforms.fogLod.value = cubemap.lodBias
      /** Once per material: several meshes share one. */
      const materials = new Set<THREE.Material>()
      model.scene.traverse((o) => { if (o instanceof THREE.Mesh) materials.add(o.material as THREE.Material) })
      for (const m of materials) s.addFog(m)
    }
    s.root.add(model.scene)
    s.useLights(data.lights, data.sceneLights ?? [])
    return s
  }

  /**
   * csgo_effects' fades: a card thins out as the camera nears it (`g_flFadeDistance`, in inches, to the power
   * `g_flFadeFalloff`) and where it is seen edge-on (fresnel: |n·v| to `g_flFresnelExponent`), so light shafts read as
   * soft volumes rather than flat sheets.
   */
  private effectFade(material: THREE.MeshBasicMaterial, p: Record<string, number>): void {
    const fade = { value: new THREE.Vector3((p.g_flFadeDistance ?? 0) * 0.0254, p.g_flFadeFalloff ?? 1, p.g_flFresnelExponent ?? 0) }
    const previous = material.onBeforeCompile
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer)
      shader.uniforms.effectFade = fade
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vEffectWorld;\nvarying vec3 vEffectNormal;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvEffectWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvEffectNormal = normalize(mat3(modelMatrix) * normal);')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vEffectWorld;\nvarying vec3 vEffectNormal;\nuniform vec3 effectFade;')
        .replace('#include <opaque_fragment>', `{
  vec3 toCamera = cameraPosition - vEffectWorld;
  float near = effectFade.x > 0.0 ? pow(clamp(length(toCamera) / effectFade.x, 0.0, 1.0), effectFade.y) : 1.0;
  float facing = effectFade.z > 0.01 ? pow(abs(dot(normalize(vEffectNormal), normalize(toCamera))), effectFade.z) : 1.0;
  outgoingLight *= near * facing;
}
#include <opaque_fragment>`)
    }
    material.customProgramCacheKey = () => 'inspect-effect'
  }

  /** Sets the item lights and the map's dynamic lights (those of the scene's item spot, or the weapon spot's). */
  useLights(lights: SceneLight[], sceneLights: SceneLight[], sun: SceneSun | null = null): void {
    for (const group of [this.lights, this.sceneLights]) {
      for (const child of [...group.children]) {
        group.remove(child)
        if (child instanceof THREE.Light) child.dispose()
      }
    }
    for (const l of lights) addLight(this.lights, l, 1, 'item')
    for (const l of sceneLights) addLight(this.sceneLights, l, SCENE_LIGHT_SCALE, 'scene')
    /** The sun lights the item directly as well (on in the game's weapon rig): brightness · N·L, three's Lambert ÷ π. */
    if (sun && sun.brightness > 0) {
      const light = new THREE.DirectionalLight(new THREE.Color().setRGB(sun.color[0], sun.color[1], sun.color[2], THREE.SRGBColorSpace), sun.brightness * Math.PI)
      light.position.set(-sun.direction[0], -sun.direction[1], -sun.direction[2])
      light.target.position.set(0, 0, 0)
      light.userData.lightKind = 'sun'
      light.userData.baseIntensity = light.intensity
      this.sceneLights.add(light, light.target)
    }
    this.applyLightScales()
  }

  /** The strength multipliers of the sun, the item's lights and the scene lights (kept for the lights set later). */
  private lightScales: Record<LightKind, number> = { sun: 1, item: 1, scene: 1 }

  setLightScales(scales: Record<LightKind, number>): void {
    this.lightScales = { ...scales }
    this.applyLightScales()
  }

  /** The kinds of light the scene has on now (sun, item lights, scene lights). */
  lightKinds(): Set<LightKind> {
    const kinds = new Set<LightKind>()
    for (const group of [this.lights, this.sceneLights]) {
      for (const child of group.children) {
        const kind = child.userData.lightKind as LightKind | undefined
        if (kind && child instanceof THREE.Light && (child.userData.baseIntensity as number) > 0) kinds.add(kind)
      }
    }
    return kinds
  }

  private applyLightScales(): void {
    for (const group of [this.lights, this.sceneLights]) {
      for (const child of group.children) {
        const kind = child.userData.lightKind as LightKind | undefined
        if (kind && child instanceof THREE.Light) child.intensity = (child.userData.baseIntensity as number) * this.lightScales[kind]
      }
    }
  }

  /** Which game camera the viewer's camera stands for (the scene's own by default; a weapon camera in the fixed inspect). */
  setGameCamera(position: number[], forward: number[]): void {
    const p = new THREE.Vector3(...position)
    const look = new THREE.Matrix4().lookAt(p, p.clone().add(new THREE.Vector3(...forward)), new THREE.Vector3(0, 1, 0))
    look.setPosition(p)
    this.cameraInverse = look.invert()
  }

  /** Sets the panorama the fog takes its colour from (an equirectangular HDR in glTF space, with mipmaps). */
  setFogEnvironment(texture: THREE.Texture): void {
    this.fogUniforms.fogEnv.value = texture
  }

  /**
   * Source 2's cubemap fog: past `start` the surface fades, by distance to the power `falloff`, up to `opacity`, into
   * the map's cubemap seen in that direction (blurrier when nearer). Mixed in before tone mapping, as in the game.
   */
  private addFog(material: THREE.Material): void {
    const u = this.fogUniforms
    const previous = material.onBeforeCompile
    const key = material.customProgramCacheKey()
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer)
      Object.assign(shader.uniforms, u)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFogWorld;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvFogWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
varying vec3 vFogWorld;
uniform sampler2D fogEnv;
uniform mat3 fogInverse;
uniform vec4 fogParams;
uniform float fogLod;`)
        .replace('#include <tonemapping_fragment>', `{
  vec3 ray = vFogWorld - cameraPosition;
  float f = pow(clamp((length(ray) - fogParams.x) / (fogParams.y - fogParams.x), 0.0, 1.0), fogParams.z) * fogParams.w;
  vec3 d = normalize(fogInverse * ray);
  vec2 uv = vec2(atan(d.z, d.x) * RECIPROCAL_PI2 + 0.5, asin(clamp(d.y, -1.0, 1.0)) * RECIPROCAL_PI + 0.5);
  vec3 fogColor = textureLod(fogEnv, uv, fogLod * 4.0 + (1.0 - f) * 3.0).rgb;
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, f);
}
#include <tonemapping_fragment>`)
    }
    material.customProgramCacheKey = () => key + 'inspect-fog'
    material.needsUpdate = true
  }

  /**
   * Places the scene for the viewer camera (its world matrix) as the game camera sees it, and returns the rotation it
   * applied (to turn the environment map the same way).
   */
  place(cameraWorld: THREE.Matrix4): THREE.Quaternion {
    this.root.matrix.multiplyMatrices(cameraWorld, this.cameraInverse)
    this.root.matrixWorldNeedsUpdate = true
    this.lights.matrix.copy(this.root.matrix)
    this.lights.matrixWorldNeedsUpdate = true
    this.sceneLights.matrix.copy(this.root.matrix)
    this.sceneLights.matrixWorldNeedsUpdate = true
    this.fogUniforms.fogInverse.value.setFromMatrix4(this.root.matrix).invert()
    return new THREE.Quaternion().setFromRotationMatrix(this.root.matrix)
  }

  dispose(): void {
    this.root.removeFromParent()
    this.lights.removeFromParent()
    this.sceneLights.removeFromParent()
    for (const d of this.disposables) d()
  }
}
