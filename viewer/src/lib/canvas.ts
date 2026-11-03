/**
 * A copy of an image cut down to what it covers (its pixels that aren't transparent), with a margin around.
 * @param source the image (a WebGL canvas right after drawing, before the frame ends)
 * @param margin the margin kept around, as a share of the content's longer side
 */
export function cropToContent(source: HTMLCanvasElement, margin = 0.02): HTMLCanvasElement {
  const { width, height } = source
  const full = document.createElement('canvas')
  full.width = width
  full.height = height
  const ctx = full.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(source, 0, 0)
  const data = ctx.getImageData(0, 0, width, height).data
  let x0 = width, y0 = height, x1 = -1, y1 = -1
  for (let y = 0; y < height; y++) {
    const row = y * width * 4
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3] > 6) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        y1 = y
      }
    }
  }
  if (x1 < 0) return full
  const pad = Math.round(Math.max(x1 - x0, y1 - y0) * margin)
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad)
  x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad)
  const out = document.createElement('canvas')
  out.width = x1 - x0 + 1
  out.height = y1 - y0 + 1
  out.getContext('2d')!.drawImage(full, x0, y0, out.width, out.height, 0, 0, out.width, out.height)
  return out
}
