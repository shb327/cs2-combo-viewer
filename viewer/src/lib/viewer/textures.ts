import * as THREE from 'three'
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js'

/** The textures are served as WebP (steam-tools/cs2-3d-pipeline/build_webp.mjs converts them): the data's .png paths load as .webp. */
export const imagePath = (path: string): string => path.replace(/\.png$/i, '.webp')

/** Loads textures relative to an asset base, with the glTF UV convention (no vertical flip). */
export class TextureSource {
  private readonly loader = new THREE.TextureLoader().setCrossOrigin('anonymous')
  /**
   * Images decoded off the main thread as each one arrives (an <img> is decoded when it is first drawn: for a combo's
   * forty-odd textures, seconds on the main thread after the last byte). Stored as they are: no premultiplied alpha
   * (normals and masks keep their RGB under zero alpha), no colour conversion, no flip (the glTF convention).
   */
  private readonly bitmaps = typeof createImageBitmap === 'function'
    ? new THREE.ImageBitmapLoader().setCrossOrigin('anonymous').setOptions({ imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
    : null
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
    const t = await this.image(this.url(imagePath(path)))
      .catch(() => this.image(url))
      .catch(() => { throw new Error('Missing ' + url) })
    t.flipY = false
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.anisotropy = this.anisotropy
    return t
  }

  /**
   * Decoded images by URL, kept for half a minute after they arrive: a knife's finish and its composite ask for the
   * same files, the composite a little later (after its shader). Enough for one item's load, then let go.
   */
  private readonly decoding = new Map<string, Promise<ImageBitmap>>()

  private async image(url: string): Promise<THREE.Texture> {
    if (!this.bitmaps) return this.loader.loadAsync(url)
    let bitmap = this.decoding.get(url)
    if (!bitmap) {
      bitmap = this.bitmaps.loadAsync(url)
      this.decoding.set(url, bitmap)
      const forget = () => { this.decoding.delete(url) }
      bitmap.then(() => setTimeout(forget, 30000), forget)
    }
    // Each caller its own texture (the colour space differs per use); they share the decoded image.
    const texture = new THREE.Texture(await bitmap)
    texture.needsUpdate = true
    return texture
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
