import { IMAGE_PROXY } from '@/lib/config'
import qrcode from 'qrcode-generator'
import type { ShareCard } from '@/lib/share-card'

/** The share image's shape, its resolution (the short side, in pixels) and its file type. */
export type CardAspect = '16:9' | '1:1' | '9:16'
export type CardQuality = 1080 | 1440 | 2160
export type CardFormat = 'png' | 'jpeg' | 'webp'

export const CARD_ASPECTS: CardAspect[] = ['16:9', '1:1', '9:16']
export const CARD_QUALITIES: { value: CardQuality; label: string }[] = [{ value: 1080, label: '1080p' }, { value: 1440, label: '2K' }, { value: 2160, label: '4K' }]
export const CARD_FORMATS: { value: CardFormat; label: string }[] = [{ value: 'png', label: 'PNG' }, { value: 'jpeg', label: 'JPG' }, { value: 'webp', label: 'WebP' }]

/** A background: a preset's two colors, the item's rarity, custom colors, or none (PNG / WebP only). */
export interface CardBackground { id: string; label: string; from: string; to: string }
export const CARD_BACKGROUNDS: CardBackground[] = [
  { id: 'rarity', label: 'Rarity', from: '#0b0b12', to: '' },
  { id: 'midnight', label: 'Midnight', from: '#0f0c29', to: '#302b63' },
  { id: 'aurora', label: 'Aurora', from: '#0f2027', to: '#2c7a7b' },
  { id: 'ember', label: 'Ember', from: '#1a0a0a', to: '#9a2c1f' },
  { id: 'violet', label: 'Violet', from: '#140a26', to: '#6d34c9' },
  { id: 'gold', label: 'Gold', from: '#16110a', to: '#a8741a' },
  { id: 'mono', label: 'Mono', from: '#09090b', to: '#3f3f46' },
  { id: 'custom', label: 'Custom', from: '', to: '' },
  { id: 'transparent', label: 'None', from: '', to: '' },
]

export interface CardStyle {
  background: string
  /** The custom background's colors and the gradient's angle (degrees, 0 = left to right). */
  from: string
  to: string
  angle: number
  aspect: CardAspect
  quality: CardQuality
  format: CardFormat
  show: { details: boolean; attachments: boolean; qr: boolean }
}

export const DEFAULT_CARD_STYLE: CardStyle = {
  background: 'rarity', from: '#101827', to: '#7c3aed', angle: 135, aspect: '16:9', quality: 1080, format: 'png',
  show: { details: true, attachments: true, qr: true },
}

/** Our watermark: always on the image. */
const BRAND = 'chainskins.net'
const FONT = '"Geist Variable", "Geist", system-ui, sans-serif'
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace'

/** The image's size in pixels for a shape and a resolution. */
export function cardSize(aspect: CardAspect, quality: CardQuality): [number, number] {
  const long = Math.round((quality * 16) / 9)
  return aspect === '16:9' ? [long, quality] : aspect === '9:16' ? [quality, long] : [quality, quality]
}

/** How many pixels the item's render needs on its longer side for an image of this size. */
export const itemRenderSize = (aspect: CardAspect, quality: CardQuality) => Math.round(Math.max(...cardSize(aspect, quality)) * 0.75)

/** The two colors a style's background resolves to (null: transparent). */
function backgroundColors(style: CardStyle, rarityColor: string): [string, string] | null {
  if (style.background === 'transparent') return null
  if (style.background === 'custom') return [style.from, style.to]
  if (style.background === 'rarity') return ['#0b0b12', mix(rarityColor, '#0b0b12', 0.55)]
  const preset = CARD_BACKGROUNDS.find((b) => b.id === style.background) ?? CARD_BACKGROUNDS[1]
  return [preset.from, preset.to]
}

/** `a` mixed toward `b` by `t` (hex colors). */
function mix(a: string, b: string, t: number): string {
  const parse = (h: string) => { const n = parseInt(h.replace('#', '').padEnd(6, '0').slice(0, 6), 16); return [n >> 16, (n >> 8) & 255, n & 255] }
  const [x, y] = [parse(a), parse(b)]
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')
}

/** Steam's images, through the CORS proxy; ours (and data URLs) as they are. */
const corsUrl = (src: string) => (/^https:\/\/[^/]*(steamstatic\.com|akamaihd\.net)\//.test(src) ? IMAGE_PROXY + encodeURIComponent(src) : src)

/** Loads an image cross-origin, so the canvas stays exportable; one whose host doesn't allow it is left out. */
const loadImage = (src: string) => new Promise<HTMLImageElement | null>((resolve) => {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.onload = () => resolve(img)
  img.onerror = () => resolve(null)
  img.src = corsUrl(src)
})

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

/** Draws `text` within `maxWidth`, cut with an ellipsis; returns its width. */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number): number {
  let t = text
  while (t.length > 1 && ctx.measureText(t).width > maxWidth) t = t.slice(0, -2) + '…'
  ctx.fillText(t, x, y)
  return ctx.measureText(t).width
}

/** Splits `text` into at most `lines` lines that fit `maxWidth` (the last one cut with an ellipsis). */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, lines: number): string[] {
  const out: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word
    if (ctx.measureText(next).width <= maxWidth || !line) line = next
    else { out.push(line); line = word }
  }
  if (line) out.push(line)
  if (out.length > lines) {
    const kept = out.slice(0, lines)
    kept[lines - 1] = out.slice(lines - 1).join(' ')
    while (kept[lines - 1].length > 1 && ctx.measureText(kept[lines - 1] + '…').width > maxWidth) kept[lines - 1] = kept[lines - 1].slice(0, -1)
    kept[lines - 1] += '…'
    return kept
  }
  return out
}

/** The QR code of `text`: dark modules on a white rounded tile with its quiet zone. */
function drawQr(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const count = qr.getModuleCount()
  const quiet = 2
  const cell = size / (count + quiet * 2)
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, x, y, size, size, size * 0.08)
  ctx.fill()
  ctx.fillStyle = '#0b0b12'
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(x + (c + quiet) * cell, y + (r + quiet) * cell, Math.ceil(cell), Math.ceil(cell))
    }
  }
}

/** `image` scaled to fit the box (centered), with a soft shadow under it. */
function drawContain(ctx: CanvasRenderingContext2D, image: CanvasImageSource & { width: number; height: number }, x: number, y: number, w: number, h: number, u: number) {
  const scale = Math.min(w / image.width, h / image.height)
  const dw = image.width * scale, dh = image.height * scale
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.55)'
  ctx.shadowBlur = 40 * u
  ctx.shadowOffsetY = 18 * u
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh)
  ctx.restore()
}

interface Box { x: number; y: number; w: number; h: number }

/**
 * Draws the share image: the background, a glow of the rarity color behind the item, the item's render, its name and
 * rarity, its details (wear, float bar, pattern), its stickers and charm, and the QR code of the link with the brand.
 * @param item the item's render (transparent, cropped)
 * @param card what to say about it
 * @param style the background, shape, resolution and what to show
 * @param link the share link (the QR code)
 * @param scale draws smaller (a preview): the image's size × scale
 */
export async function drawShareImage(item: HTMLCanvasElement, card: ShareCard, style: CardStyle, link: string, scale = 1): Promise<HTMLCanvasElement> {
  const [fullW, fullH] = cardSize(style.aspect, style.quality)
  const W = Math.round(fullW * scale), H = Math.round(fullH * scale)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  /** One unit: a pixel of a 1080-pixel short side. */
  const u = Math.min(W, H) / 1080
  const landscape = W > H
  await Promise.all([document.fonts.load(`600 40px ${FONT}`), document.fonts.load(`400 40px ${FONT}`)]).catch(() => {})

  const attachments = style.show.attachments ? [...card.stickers.map((s) => ({ ...s, pattern: null as number | null })), ...(card.charm ? [card.charm] : [])] : []
  const images = await Promise.all(attachments.map((a) => (a.image ? loadImage(a.image) : Promise.resolve(null))))

  // Background.
  const colors = backgroundColors(style, card.color)
  if (colors) {
    const a = (style.background === 'custom' ? style.angle : 135) * Math.PI / 180
    const r = Math.hypot(W, H) / 2
    const g = ctx.createLinearGradient(W / 2 - Math.cos(a) * r, H / 2 - Math.sin(a) * r, W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r)
    g.addColorStop(0, colors[0])
    g.addColorStop(1, colors[1])
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }

  const P = 72 * u
  const qrSize = style.show.qr ? (landscape ? 170 : 150) * u : 0
  const tile = attachments.length ? Math.min(130 * u, ((landscape ? 600 * u : W - 2 * P - (qrSize ? qrSize + 40 * u : 0)) - (attachments.length - 1) * 16 * u) / attachments.length) : 0
  const hasDetails = style.show.details && (card.facts.length > 0 || !!card.float)
  const detailsH = hasDetails ? 90 * u + (card.float ? 102 * u : 0) : 0
  let itemBox: Box, panel: Box
  /** Portrait and square: the stickers and the QR code share the bottom row, the details sit above it. */
  let bottomY = 0, detailsY = 0
  if (landscape) {
    const panelW = 600 * u
    panel = { x: W - P - panelW, y: P, w: panelW, h: H - 2 * P }
    itemBox = { x: P, y: P, w: panel.x - 2 * P, h: H - 2 * P }
  } else {
    panel = { x: P, y: P, w: W - 2 * P, h: H - 2 * P }
    const rowH = Math.max(qrSize, tile ? tile + 32 * u : 0)
    bottomY = H - P - rowH
    detailsY = bottomY - (rowH ? 40 * u : 0) - detailsH
    const headH = 250 * u
    itemBox = { x: P, y: P + headH, w: W - 2 * P, h: Math.max(detailsY - 30 * u - (P + headH), 160 * u) }
  }

  // The rarity's glow behind the item, then the item.
  if (colors) {
    const cx = itemBox.x + itemBox.w / 2, cy = itemBox.y + itemBox.h / 2
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(itemBox.w, itemBox.h) * 0.6)
    glow.addColorStop(0, card.color + '55')
    glow.addColorStop(1, card.color + '00')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, W, H)
  }
  drawContain(ctx, item, itemBox.x, itemBox.y, itemBox.w, itemBox.h, u)

  // Name and rarity.
  ctx.textBaseline = 'alphabetic'
  let y = panel.y
  const x = panel.x
  if (card.over) {
    ctx.font = `600 ${26 * u}px ${FONT}`
    ctx.fillStyle = card.color
    ctx.letterSpacing = `${4 * u}px`
    y += 26 * u
    /** Leaves room for the brand at the top right of a tall image. */
    fitText(ctx, card.over.toUpperCase(), x, y, landscape ? panel.w : panel.w - 300 * u)
    ctx.letterSpacing = '0px'
  }
  ctx.font = `600 ${(landscape ? 66 : 72) * u}px ${FONT}`
  ctx.fillStyle = '#ffffff'
  for (const line of wrap(ctx, card.title, panel.w, 2)) {
    y += (landscape ? 76 : 82) * u
    ctx.fillText(line, x, y)
  }
  if (card.rarity) {
    y += 24 * u
    ctx.font = `700 ${22 * u}px ${FONT}`
    const label = card.rarity.toUpperCase()
    const tw = ctx.measureText(label).width
    ctx.fillStyle = card.color + '30'
    roundRect(ctx, x, y, tw + 28 * u, 44 * u, 10 * u)
    ctx.fill()
    ctx.fillStyle = card.color
    ctx.fillText(label, x + 14 * u, y + 30 * u)
    y += 44 * u
  }

  // Details: the facts in a row, then the float on its wear bar.
  y = landscape ? y + 56 * u : detailsY
  if (hasDetails) {
    let fx = x
    for (const fact of card.facts) {
      ctx.font = `600 ${20 * u}px ${FONT}`
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.letterSpacing = `${2 * u}px`
      ctx.fillText(fact.label.toUpperCase(), fx, y + 20 * u)
      ctx.letterSpacing = '0px'
      ctx.font = `600 ${36 * u}px ${FONT}`
      ctx.fillStyle = fact.color ?? '#ffffff'
      const w = ctx.measureText(fact.value).width
      ctx.fillText(fact.value, fx, y + 64 * u)
      fx += Math.max(w, 120 * u) + 48 * u
    }
    y += 90 * u
    if (card.float) {
      ctx.font = `600 ${20 * u}px ${FONT}`
      ctx.fillStyle = 'rgba(255,255,255,0.55)'
      ctx.letterSpacing = `${2 * u}px`
      ctx.fillText('FLOAT', x, y + 20 * u)
      ctx.letterSpacing = '0px'
      ctx.font = `500 ${30 * u}px ${MONO}`
      ctx.fillStyle = '#ffffff'
      const value = card.float.value.toFixed(10).replace(/0+$/, '').replace(/\.$/, '.0')
      ctx.textAlign = 'right'
      ctx.fillText(value, x + panel.w, y + 22 * u)
      ctx.textAlign = 'left'
      const barY = y + 40 * u, barH = 12 * u
      const bands: [number, number, string][] = [[0, 0.07, '#34d399'], [0.07, 0.15, '#a3e635'], [0.15, 0.38, '#facc15'], [0.38, 0.45, '#fb923c'], [0.45, 1, '#f87171']]
      ctx.save()
      roundRect(ctx, x, barY, panel.w, barH, barH / 2)
      ctx.clip()
      for (const [a, b, c] of bands) {
        ctx.fillStyle = c + 'cc'
        ctx.fillRect(x + a * panel.w, barY, (b - a) * panel.w, barH)
      }
      ctx.restore()
      const mx = x + card.float.value * panel.w
      ctx.fillStyle = '#ffffff'
      ctx.beginPath()
      ctx.moveTo(mx, barY - 4 * u)
      ctx.lineTo(mx - 10 * u, barY - 18 * u)
      ctx.lineTo(mx + 10 * u, barY - 18 * u)
      ctx.closePath()
      ctx.fill()
      y = barY + barH + 50 * u
    }
  }

  // Stickers and charm: each image on a tile, its name under it.
  if (!landscape) y = bottomY
  attachments.forEach((a, k) => {
    const tx = x + k * (tile + 16 * u)
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    roundRect(ctx, tx, y, tile, tile, 18 * u)
    ctx.fill()
    const img = images[k]
    if (img) {
      const s = Math.min((tile * 0.82) / img.width, (tile * 0.82) / img.height)
      ctx.drawImage(img, tx + (tile - img.width * s) / 2, y + (tile - img.height * s) / 2, img.width * s, img.height * s)
    }
    ctx.font = `500 ${17 * u}px ${FONT}`
    ctx.fillStyle = 'rgba(255,255,255,0.75)'
    const name = a.name.replace(/^(Sticker|Charm) \| /, '')
    fitText(ctx, a.pattern !== null && a.pattern !== undefined ? `${name} #${a.pattern}` : name, tx, y + tile + 26 * u, tile)
  })

  /** The QR code of the link (bottom right) and the brand, always: beside the QR code on a wide image, else top right. */
  if (qrSize) drawQr(ctx, link, W - P - qrSize, H - P - qrSize, qrSize)
  ctx.textAlign = 'right'
  ctx.font = `700 ${(landscape ? 38 : 30) * u}px ${FONT}`
  ctx.fillStyle = '#ffffff'
  if (landscape) {
    const right = qrSize ? W - P - qrSize - 28 * u : W - P
    ctx.fillText(BRAND, right, H - P - (qrSize ? 60 : 30) * u)
    if (qrSize) {
      ctx.font = `500 ${20 * u}px ${FONT}`
      ctx.fillStyle = 'rgba(255,255,255,0.6)'
      ctx.fillText('Scan to open it in 3D', right, H - P - 26 * u)
    }
  } else {
    ctx.fillText(BRAND, W - P, P + 26 * u)
  }
  ctx.textAlign = 'left'
  return canvas
}

/** The image as a file of the style's type (JPG has no transparency: it gets a dark backdrop). */
export function cardBlob(canvas: HTMLCanvasElement, format: CardFormat): Promise<Blob> {
  let source = canvas
  if (format === 'jpeg') {
    source = document.createElement('canvas')
    source.width = canvas.width
    source.height = canvas.height
    const ctx = source.getContext('2d')!
    ctx.fillStyle = '#0b0b12'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(canvas, 0, 0)
  }
  return new Promise((resolve, reject) => source.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the image.'))), `image/${format}`, 0.95))
}
