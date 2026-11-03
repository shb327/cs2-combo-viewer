import * as THREE from 'three'
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js'

/** The textures are served as WebP (steam-tools/cs2-3d-pipeline/build_webp.mjs converts them): the data's .png paths load as .webp. */
export const imagePath = (path: string): string => path.replace(/\.png$/i, '.webp')

/** Loads textures relative to an asset base, with the glTF UV convention (no vertical flip). */
export class TextureSource {
  private readonly loader = new THREE.TextureLoader().setCrossOrigin('anonymous')
  private readonly anisotropy: number
  /** 1×1 white, for optional inputs an item doesn't have. */
  readonly blank: THREE.DataTexture

  constructor(private readonly base: string, renderer: THREE.WebGLRenderer) {
    this.anisotropy = renderer.capabilities.getMaxAnisotropy()
    this.blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)
    this.blank.needsUpdate = true
  }

  url(path: string): string {
    return this.base + path
  }

  /** srgb: color data (albedo, paint); otherwise raw data (masks, normals, weights). */
  async load(path: string, srgb: boolean): Promise<THREE.Texture> {
    const url = this.url(path)
    /** The .webp, else the .png (not converted yet). */
    const t = await this.loader.loadAsync(this.url(imagePath(path)))
      .catch(() => this.loader.loadAsync(url))
      .catch(() => { throw new Error('Missing ' + url) })
    t.flipY = false
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = this.anisotropy
    return t
  }

  optional(path: string | undefined, srgb: boolean): Promise<THREE.Texture> {
    return path ? this.load(path, srgb) : Promise.resolve(this.blank)
  }

  /** Float EXR (the composite "pos" inputs). */
  async exr(path: string): Promise<THREE.Texture> {
    const url = this.url(path)
    const t = await new EXRLoader().setDataType(THREE.FloatType).loadAsync(url).catch(() => { throw new Error('Missing ' + url) })
    const { data, height } = t.image as unknown as { data: Float32Array; height: number }
    const row = data.length / height
    const tmp = new Float32Array(row)
    for (let y = 0; y < height >> 1; y++) {
      const a = y * row, b = (height - 1 - y) * row
      tmp.set(data.subarray(a, a + row))
      data.copyWithin(a, b, b + row)
      data.set(tmp, b)
    }
    t.flipY = false
    t.colorSpace = THREE.NoColorSpace
    t.needsUpdate = true
    return t
  }
}
