import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

/** A map's post-processing (build_post.py, from its .vpost): the game's tone curve, bloom and colour grade. */
export interface ScenePost {
  /** The map's fixed exposure (its post_processing_volume). */
  exposure: number
  /** Valve's filmic curve (Hable's): A shoulder, B linear, C linear angle, D toe, E toe numerator, F toe denominator, W white point. */
  tonemap?: { exposureBias: number; shoulder: number; linear: number; linearAngle: number; toe: number; toeNum: number; toeDenom: number; whitePoint: number }
  bloom?: { strength: number; threshold: number }
  /** The colour lookup table, in display (sRGB) space: size³ RGBA bytes, red fastest. */
  lut?: { file: string; size: number }
}

/** Draws the scene into the composer's HDR buffer with the viewer's own (two-pass) render. */
class DrawPass extends Pass {
  constructor(private readonly draw: () => void) {
    super()
    this.needsSwap = false
  }

  render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
    renderer.setRenderTarget(read)
    renderer.clear()
    this.draw()
  }
}

const GRADE_SHADER = /* glsl */ `
precision highp sampler3D;
uniform sampler2D tDiffuse;
uniform sampler3D lut;
uniform float lutSize;
uniform float useLut;
uniform float exposure;
uniform vec4 curveA;
uniform vec3 curveB;
varying vec2 vUv;

vec3 hable(vec3 x) {
  float A = curveA.x, B = curveA.y, C = curveA.z, D = curveA.w, E = curveB.x, F = curveB.y;
  return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
}

vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec4 src = texture2D(tDiffuse, vUv);
  // (premultiplied where the frame is see-through, over a background video: graded unpremultiplied)
  float alpha = clamp(src.a, 0.0, 1.0);
  vec3 x = max(src.rgb / max(alpha, 1e-4) * exposure, 0.0);
  vec3 c = clamp(hable(x) / hable(vec3(curveB.z)), 0.0, 1.0);
  c = toSrgb(c);
  if (useLut > 0.5) c = texture(lut, c * ((lutSize - 1.0) / lutSize) + 0.5 / lutSize).rgb;
  gl_FragColor = vec4(c * alpha, alpha);
}
`

/**
 * The game's look for an inspect map: the frame drawn in HDR, its bloom, then the map's tone curve and colour grade —
 * in place of the viewer's ACES.
 */
export class PostPipeline {
  private readonly composer: EffectComposer
  private readonly bloom: UnrealBloomPass | null
  private readonly grade: Pass & { material: THREE.ShaderMaterial }
  private lutTexture: THREE.Data3DTexture | null = null
  /** The map's exposure, with its tone curve's bias (in stops). */
  private exposureScale = 1

  constructor(private readonly renderer: THREE.WebGLRenderer, readonly data: ScenePost, draw: () => void) {
    const size = renderer.getSize(new THREE.Vector2())
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 })
    this.composer = new EffectComposer(renderer, target)
    this.composer.setPixelRatio(renderer.getPixelRatio())
    this.composer.addPass(new DrawPass(draw))
    const b = data.bloom
    this.bloom = b && b.strength > 0 ? new UnrealBloomPass(size, b.strength * 2, 0.5, b.threshold) : null
    if (this.bloom) {
      /** The glow adds to the colour only: the frame's alpha (see-through over a background video) stays the scene's. */
      const blend = (this.bloom as unknown as { blendMaterial: THREE.Material }).blendMaterial
      blend.blending = THREE.CustomBlending
      blend.blendSrc = blend.blendDst = THREE.OneFactor
      blend.blendSrcAlpha = THREE.ZeroFactor
      blend.blendDstAlpha = THREE.OneFactor
      this.composer.addPass(this.bloom)
    }
    const t = data.tonemap ?? { exposureBias: 0, shoulder: 0.15, linear: 0.5, linearAngle: 0.1, toe: 0.2, toeNum: 0.02, toeDenom: 0.3, whitePoint: 4 }
    const material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        lut: { value: null },
        lutSize: { value: 32 },
        useLut: { value: 0 },
        exposure: { value: 1 },
        curveA: { value: new THREE.Vector4(t.shoulder, t.linear, t.linearAngle, t.toe) },
        curveB: { value: new THREE.Vector3(t.toeNum, t.toeDenom, t.whitePoint) },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: GRADE_SHADER,
    })
    const quad = new FullScreenQuad(material)
    const bias = Math.pow(2, t.exposureBias)
    const grade = new (class extends Pass {
      material = material
      render(r: THREE.WebGLRenderer, write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget): void {
        material.uniforms.tDiffuse.value = read.texture
        r.setRenderTarget(this.renderToScreen ? null : write)
        quad.render(r)
      }
    })()
    this.grade = grade
    this.composer.addPass(grade)
    this.exposureScale = data.exposure * bias
    this.setExposure(1)
  }

  /** Loads the colour grade. */
  async loadLut(dataBase: string): Promise<void> {
    const lut = this.data.lut
    if (!lut) return
    const bytes = new Uint8Array(await (await fetch(dataBase + lut.file)).arrayBuffer())
    if (bytes.length !== lut.size ** 3 * 4) return
    const texture = new THREE.Data3DTexture(bytes, lut.size, lut.size, lut.size)
    texture.minFilter = texture.magFilter = THREE.LinearFilter
    texture.wrapS = texture.wrapT = texture.wrapR = THREE.ClampToEdgeWrapping
    texture.needsUpdate = true
    this.lutTexture = texture
    const u = this.grade.material.uniforms
    u.lut.value = texture
    u.lutSize.value = lut.size
    u.useLut.value = 1
  }

  /** The viewer's exposure slider, on top of the map's own. */
  setExposure(value: number): void {
    this.grade.material.uniforms.exposure.value = value * this.exposureScale
  }

  setSize(w: number, h: number): void {
    this.composer.setPixelRatio(this.renderer.getPixelRatio())
    this.composer.setSize(w, h)
  }

  render(): void {
    this.composer.render()
  }

  dispose(): void {
    this.composer.dispose()
    this.bloom?.dispose()
    this.grade.material.dispose()
    this.lutTexture?.dispose()
  }
}
