import * as THREE from 'three'

/** An eyeball material's parameters (build_agent_eyes.py): sphere radius in Source inches, iris / pupil sizes, hue shift, saturation. */
export interface EyeMaterial {
  radius: number
  iris: number
  pupil: number
  hue: number
  saturation: number
  albedo: string
  mask: string
}

/** One eye of an agent model: its center and axes (the eyeball bone's bind pose) in the glb's space, meters. */
export interface EyeBone {
  center: [number, number, number]
  forward: [number, number, number]
  side: [number, number, number]
  up: [number, number, number]
}

export interface EyeData {
  materials: Record<string, EyeMaterial>
  models: Record<string, { l: EyeBone; r: EyeBone }>
}

const INCH = 0.0254
const loaded = new Map<string, Promise<EyeData>>()

/** The agents' eyes; loaded once per asset root. */
export function loadEyes(base: string, dataRoot: string): Promise<EyeData> {
  let p = loaded.get(base)
  if (!p) {
    p = fetch(base + dataRoot + 'agent_eyes.json').then((r) => r.json() as Promise<EyeData>).catch(() => ({ materials: {}, models: {} }))
    loaded.set(base, p)
  }
  return p
}

/**
 * Gives the head mesh the data its eyes need: for every vertex, the vector to the center of its nearest eye (so the
 * skinned vertex carries it along: the eyeball bone moves with the head) and which eye that is (0 left, 1 right).
 * @param geometry the head mesh, already in the agent's space
 * @param matrix the transform that brought the glb's mesh into that space
 */
export function addEyeAttributes(geometry: THREE.BufferGeometry, eyes: { l: EyeBone; r: EyeBone }, matrix: THREE.Matrix4): { centers: THREE.Vector3[]; scale: number } {
  const centers = [eyes.l, eyes.r].map((e) => new THREE.Vector3(...e.center).applyMatrix4(matrix))
  const pos = geometry.getAttribute('position')
  const offset = new Float32Array(pos.count * 3), side = new Float32Array(pos.count)
  const p = new THREE.Vector3(), d = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i)
    const toLeft = d.subVectors(centers[0], p).lengthSq(), toRight = p.distanceToSquared(centers[1])
    const eye = toRight < toLeft ? 1 : 0
    d.subVectors(centers[eye], p)
    offset.set([d.x, d.y, d.z], i * 3)
    side[i] = eye
  }
  geometry.setAttribute('eyeOffset', new THREE.BufferAttribute(offset, 3))
  geometry.setAttribute('eyeSide', new THREE.BufferAttribute(side, 1))
  return { centers, scale: matrix.getMaxScaleOnAxis() }
}

/**
 * csgo_character's F_EYEBALLS, as the game's pixel shader does it (decompiled): where the mask marks an eye, the ray from the
 * camera through the pixel meets a sphere around the eye's center (radius × the model's scale); the hit point's direction
 * in the eye's axes ((side, -up) components) is the iris texture's coordinate, widened by the iris size; hue shift and
 * saturation tint the iris (the texture's alpha marks it), the pupil darkens the middle, and the hit's facing the eye's forward fades
 * the edge. The eye is glossy. The eye's center travels with the skinned vertices, its axes are the bind pose's.
 */
export class EyeLayer {
  private readonly uniforms = {
    uEyeMask: { value: null as THREE.Texture | null },
    uEyeAlbedo: { value: null as THREE.Texture | null },
    uEyeParams: { value: new THREE.Vector4() }, // iris, pupil, hue, saturation
    uEyeRadius: { value: 0 },
    uEyeForward: { value: [new THREE.Vector3(), new THREE.Vector3()] },
    uEyeSide: { value: [new THREE.Vector3(), new THREE.Vector3()] },
    uEyeUp: { value: [new THREE.Vector3(), new THREE.Vector3()] },
  }

  constructor(material: THREE.Material, params: EyeMaterial, eyes: { l: EyeBone; r: EyeBone }, matrix: THREE.Matrix4, scale: number) {
    this.uniforms.uEyeParams.value.set(params.iris, params.pupil, params.hue, params.saturation)
    this.uniforms.uEyeRadius.value = params.radius * INCH * scale
    ;[eyes.l, eyes.r].forEach((e, i) => {
      this.uniforms.uEyeForward.value[i].set(...e.forward).transformDirection(matrix)
      this.uniforms.uEyeSide.value[i].set(...e.side).transformDirection(matrix)
      this.uniforms.uEyeUp.value[i].set(...e.up).transformDirection(matrix)
    })
    const previous = material.onBeforeCompile
    const key = material.customProgramCacheKey.bind(material)
    material.onBeforeCompile = (shader, renderer) => {
      previous.call(material, shader, renderer)
      Object.assign(shader.uniforms, this.uniforms)
      shader.vertexShader = `
        attribute vec3 eyeOffset;
        attribute float eyeSide;
        uniform vec3 uEyeForward[2], uEyeSide[2], uEyeUp[2];
        uniform float uEyeRadius;
        varying vec3 vEyeC, vEyeF, vEyeS, vEyeU;
        varying float vEyeR;
      ` + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          int e = eyeSide > 0.5 ? 1 : 0;
          mat3 mv = mat3(modelViewMatrix);
          vEyeC = (modelViewMatrix * vec4(position + eyeOffset, 1.0)).xyz;
          vEyeF = mv * uEyeForward[e];
          vEyeS = mv * uEyeSide[e];
          vEyeU = mv * uEyeUp[e];
          vEyeR = uEyeRadius * length(mv[0]);
        }`)
      shader.fragmentShader = `
        uniform sampler2D uEyeMask, uEyeAlbedo;
        uniform vec4 uEyeParams;
        varying vec3 vEyeC, vEyeF, vEyeS, vEyeU;
        varying float vEyeR;
        float eyeK = 0.0;
      ` + shader.fragmentShader
        .replace('#include <map_fragment>', `#include <map_fragment>
        #ifdef USE_MAP
        {
          float mask = texture2D(uEyeMask, vMapUv).r;
          if (mask > 0.0) {
            vec3 ray = normalize(-vViewPosition);
            float b = dot(-vEyeC, ray);
            float disc = b * b - (dot(vEyeC, vEyeC) - vEyeR * vEyeR);
            float t = -b - sqrt(max(disc, 0.0));
            if (disc > 0.0 && t > 0.0) {
              vec3 n = normalize(ray * t - vEyeC);
              vec2 l = vec2(dot(n, normalize(vEyeS)), dot(n, -normalize(vEyeU)));
              float len = length(l);
              vec2 uv = mix(l * (2.0 - uEyeParams.x), l, len);
              vec4 tex = texture2D(uEyeAlbedo, uv * 0.5 + 0.5);
              float c = cos(uEyeParams.z), s = sin(uEyeParams.z);
              vec3 k = vec3(0.57735);
              vec3 rotated = tex.rgb * c + cross(k, tex.rgb) * s + k * dot(k, tex.rgb) * (1.0 - c);
              vec3 hue = mix(tex.rgb, rotated, tex.a);
              vec3 sat = mix(vec3(dot(hue, vec3(0.2125, 0.7154, 0.0721))), hue, uEyeParams.w);
              vec3 iris = mix(hue, sat, tex.a) * smoothstep(uEyeParams.y, uEyeParams.y + 0.03, len);
              float facing = clamp(dot(normalize(vEyeF), n), 0.0, 1.0);
              eyeK = mask * smoothstep(0.1, 0.3, facing);
              diffuseColor.rgb = mix(diffuseColor.rgb, iris * facing, eyeK);
            }
          }
        }
        #endif`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.12, eyeK);`)
    }
    material.customProgramCacheKey = () => key() + '-eyes'
  }

  /** Loads the layer's textures (the mask, and the iris' albedo). */
  set(mask: THREE.Texture | null, albedo: THREE.Texture | null): void {
    this.uniforms.uEyeMask.value = mask
    this.uniforms.uEyeAlbedo.value = albedo
  }
}
