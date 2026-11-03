import type { CharmDef } from '@/lib/data/attachments'
import { imagePath } from '@/lib/viewer/textures'
import { compileCharmExpr } from '@/lib/materials/charm'

type Rgb = [number, number, number]
type Expr = (seed: number) => number | number[]

const STEPS = 28
const FALLBACK = 'linear-gradient(90deg, #6d28d9, #a855f7, #ec4899)'
const COLOR_PARAMS = ['g_fHueShift', 'g_fBrightness', 'g_fSaturation', 'g_fContrast', 'g_flLiquidColorHueShift']
const averages = new Map<string, Promise<Rgb | null>>()

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const luma = (c: Rgb) => c[0] * 0.2125 + c[1] * 0.7154 + c[2] * 0.0721

/** The weapon shader's hue rotation (around the gray axis, weighted by saturation^0.125). */
function rotateHue(c: Rgb, degrees: number): Rgb {
  const hi = Math.max(...c)
  const sat = hi > 0 ? (hi - Math.min(...c)) / hi : 0
  const a = (degrees * Math.PI) / 180
  const co = Math.cos(a), si = Math.sin(a), k = 1 / Math.sqrt(3)
  const dot = k * (c[0] + c[1] + c[2])
  const cross: Rgb = [k * (c[2] - c[1]), k * (c[0] - c[2]), k * (c[1] - c[0])]
  const w = Math.pow(sat, 0.125)
  const l = luma(c)
  return [0, 1, 2].map((i) => l + (c[i] * co + cross[i] * si + k * dot * (1 - co) - l) * w) as Rgb
}

/** The average color of a texture (pixels weighted toward the saturated ones, so gray backgrounds don't win). */
function averageColor(url: string): Promise<Rgb | null> {
  let p = averages.get(url)
  if (!p) {
    p = new Promise<Rgb | null>((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 32
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(img, 0, 0, 32, 32)
        const data = ctx.getImageData(0, 0, 32, 32).data
        let r = 0, g = 0, b = 0, total = 0
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 128) continue
          const hi = Math.max(data[i], data[i + 1], data[i + 2]), lo = Math.min(data[i], data[i + 1], data[i + 2])
          const w = 0.05 + (hi ? (hi - lo) / hi : 0)
          r += data[i] * w; g += data[i + 1] * w; b += data[i + 2] * w; total += w
        }
        resolve(total ? [r / total / 255, g / total / 255, b / total / 255] : null)
      }
      img.onerror = () => { if (img.src.endsWith('.webp')) img.src = url.replace(/\.webp$/, '.png'); else resolve(null) }
      img.src = url
    })
    averages.set(url, p)
  }
  return p
}

/**
 * The color bar a charm's pattern slider shows: its base color put through the hue / brightness / saturation /
 * contrast the pattern drives, sampled along the pattern. A charm whose pattern changes none of those (glitter,
 * pearlescence, liquid level…) gets a neutral violet bar.
 * @param charm the charm
 * @param base the asset root
 */
export async function charmGradient(charm: CharmDef, base: string): Promise<string> {
  const exprs: Record<string, Expr> = {}
  let texture: string | undefined
  for (const m of Object.values(charm.materials)) {
    for (const [name, src] of Object.entries(m.dynamic ?? {})) {
      if (!COLOR_PARAMS.includes(name) || exprs[name]) continue
      const f = compileCharmExpr(src)
      if (!f) continue
      exprs[name] = f
      texture ??= m.textures.g_tColor ?? m.textures.g_tColorA
    }
  }
  if (!texture) return FALLBACK
  const color = await averageColor(base + imagePath(texture))
  if (!color) return FALLBACK

  const num = (name: string, s: number, d: number) => {
    const r = exprs[name]?.(s)
    return typeof r === 'number' && Number.isFinite(r) ? r : d
  }
  const stops: string[] = []
  for (let i = 0; i <= STEPS; i++) {
    const s = i / STEPS
    const contrast = num('g_fContrast', s, 1), bright = num('g_fBrightness', s, 1)
    let c = color.map((v) => clamp01((v - 0.5) * contrast + 0.5) * bright) as Rgb
    c = rotateHue(c, num('g_fHueShift', s, 0) + num('g_flLiquidColorHueShift', s, 0))
    const l = luma(c), sat = num('g_fSaturation', s, 1)
    c = c.map((v) => clamp01(l + (v - l) * sat)) as Rgb
    stops.push(`rgb(${c.map((v) => Math.round(clamp01(v) * 255)).join(' ')}) ${(s * 100).toFixed(1)}%`)
  }
  return `linear-gradient(90deg, ${stops.join(', ')})`
}
