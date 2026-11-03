import { addPngMetadata } from '@/lib/png-meta'

/** The text of the watermark. */
export const WATERMARK = 'chainskins.net'

const LOGO = '/logo/favicon.svg'

const loadImage = (src: string): Promise<HTMLImageElement | null> => new Promise((resolve) => {
  const img = new Image()
  img.onload = () => resolve(img)
  img.onerror = () => resolve(null)
  img.src = src
})

/**
 * Burns the watermark into a screenshot: the logo and "chainskins.net" on a dark pill in the top-left corner, sized
 * to the image.
 * @param dataUrl the screenshot (PNG data URL)
 * Also writes metadata into the PNG: the site, the viewer's version, when it was taken and (given) what it shows.
 * @param title what the screenshot shows (item name or id)
 * @returns the watermarked PNG data URL (the original if it can't be drawn)
 */
export async function watermarkScreenshot(dataUrl: string, title?: string): Promise<string> {
  const [shot, logo] = await Promise.all([loadImage(dataUrl), loadImage(LOGO)])
  if (!shot) return dataUrl
  const canvas = document.createElement('canvas')
  canvas.width = shot.width
  canvas.height = shot.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(shot, 0, 0)

  const unit = Math.max(12, Math.round(Math.min(shot.width, shot.height) / 42))
  const pad = Math.round(unit * 0.7)
  const logoSize = Math.round(unit * 1.4)
  ctx.font = `600 ${unit}px system-ui, -apple-system, "Segoe UI", sans-serif`
  const textWidth = ctx.measureText(WATERMARK).width
  const x = Math.round(unit * 1.2), y = Math.round(unit * 1.2)
  const w = pad + logoSize + pad * 0.8 + textWidth + pad * 1.2
  const h = logoSize + pad * 1.2

  ctx.fillStyle = 'rgba(10, 8, 18, 0.55)'
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)'
  ctx.lineWidth = Math.max(1, unit / 14)
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, h / 2)
  ctx.fill()
  ctx.stroke()

  if (logo) ctx.drawImage(logo, x + pad, y + (h - logoSize) / 2, logoSize, logoSize)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)'
  ctx.textBaseline = 'middle'
  ctx.fillText(WATERMARK, x + pad + logoSize + pad * 0.8, y + h / 2 + 1)
  return addPngMetadata(canvas.toDataURL('image/png'), {
    ...(title ? { Title: title } : {}),
    Software: `chainskins 3dviewer v${__APP_VERSION__}`,
    Source: `https://${WATERMARK}`,
    'Creation Time': new Date().toISOString(),
  })
}
