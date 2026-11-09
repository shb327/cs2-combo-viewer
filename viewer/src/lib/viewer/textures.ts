import * as THREE from 'three'
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js'

/** The textures are served as WebP (steam-tools/cs2-3d-pipeline/build_webp.mjs converts them): the data's .png paths load as .webp. */
export const imagePath = (path: string): string => path.replace(/\.png$/i, '.webp')

const BITMAP_OPTIONS: ImageBitmapOptions = { imageOrientation: 'none', premultiplyAlpha: 'none', colorSpaceConversion: 'none' }

/** A 1×1 PNG of (255, 128, 0) under alpha 0. */
const PROBE_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP438DAAAAFgQGAX/d3agAAAABJRU5ErkJggg=='

let bitmapCheck: Promise<boolean> | null = null

/**
 * Whether createImageBitmap keeps a pixel's colour under zero alpha, as `premultiplyAlpha: 'none'` asks. Safari (and
 * so every browser on iOS) ignores the option: its bitmaps come premultiplied, so a texture's RGB is zero wherever its
 * alpha is and rounded where alpha is low. The viewer's data textures keep values there (the knives' composite masks
 * have zero alpha throughout), and the composites then paint the wrong colours. Checked once, by uploading a bitmap of
 * PROBE_PNG to a WebGL2 context of its own and reading it back. If the check itself fails, bitmaps are used as before.
 */
export function bitmapsKeepAlpha(): Promise<boolean> {
  bitmapCheck ??= (async () => {
    let gl: WebGL2RenderingContext | null = null
    try {
      const bytes = Uint8Array.from(atob(PROBE_PNG), (c) => c.charCodeAt(0))
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }), BITMAP_OPTIONS)
      gl = document.createElement('canvas').getContext('webgl2')
      if (!gl) return true
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
      bitmap.close()
      const fb = gl.createFramebuffer()
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, gl.getParameter(gl.TEXTURE_BINDING_2D), 0)
      const px = new Uint8Array(4)
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px)
      return px[0] > 200 && px[1] > 100
    } catch {
      return true
    } finally {
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    }
  })()
  return bitmapCheck
}

/** Loads textures relative to an asset base, with the glTF UV convention (no vertical flip). */
export class TextureSource {
  /**
   * Images decoded off the main thread as each one arrives (an <img> is decoded when it is first drawn: for a combo's
   * forty-odd textures, seconds on the main thread after the last byte). Stored as they are: no premultiplied alpha
   * (normals and masks keep their RGB under zero alpha), no colour conversion, no flip (the glTF convention).
   * Where bitmaps lose the colour under zero alpha (bitmapsKeepAlpha: Safari), an <img> instead: WebGL uploads it
   * unpremultiplied (three.js sets UNPACK_PREMULTIPLY_ALPHA false), byte for byte what the bitmap gives elsewhere.
   */
  private readonly bitmaps = typeof createImageBitmap === 'function'
    ? new THREE.ImageBitmapLoader().setCrossOrigin('anonymous').setOptions(BITMAP_OPTIONS)
    : null
  private readonly images = new THREE.ImageLoader().setCrossOrigin('anonymous')
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
  private readonly decoding = new Map<string, Promise<ImageBitmap | HTMLImageElement>>()

  private async image(url: string): Promise<THREE.Texture> {
    let decoded = this.decoding.get(url)
    if (!decoded) {
      const bitmaps = this.bitmaps
      decoded = (bitmaps ? bitmapsKeepAlpha() : Promise.resolve(false))
        .then((ok): Promise<ImageBitmap | HTMLImageElement> => (ok && bitmaps ? bitmaps.loadAsync(url) : this.images.loadAsync(url)))
      this.decoding.set(url, decoded)
      const forget = () => { this.decoding.delete(url) }
      decoded.then(() => setTimeout(forget, 30000), forget)
    }
    // Each caller its own texture (the colour space differs per use); they share the decoded image.
    const texture = new THREE.Texture(await decoded)
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
