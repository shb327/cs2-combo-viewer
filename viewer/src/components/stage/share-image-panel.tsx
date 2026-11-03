import { Check, Copy, Download } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Callout } from '@/components/common/callout'
import { Spinner } from '@/components/common/spinner'
import { ShareImageOptions } from '@/components/stage/share-image-options'
import { Button } from '@/components/ui/button'
import { useStoredSettings } from '@/hooks/use-stored-settings'
import type { ShareCard } from '@/lib/share-card'
import { cardBlob, cardSize, DEFAULT_CARD_STYLE, drawShareImage, itemRenderSize, type CardStyle } from '@/lib/share-image'

interface ShareImagePanelProps {
  card: ShareCard
  link: string
  /** The item's render at `longSide` pixels (transparent, cropped), or null without a viewer. */
  renderItem: (longSide: number) => HTMLCanvasElement | null
}

/** How wide the preview is drawn (pixels on its longer side). */
const PREVIEW = 900

/** The share image: a live preview, its options, and download or copy at the chosen resolution and type. */
export function ShareImagePanel({ card, link, renderItem }: ShareImagePanelProps) {
  const [style, setStyle] = useStoredSettings<CardStyle>('share-image', DEFAULT_CARD_STYLE)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState<'download' | 'copy' | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')
  /** The item rendered once for the previews. */
  const previewItem = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    let live = true
    previewItem.current ??= renderItem(1400)
    const item = previewItem.current
    if (!item) return
    const [w, h] = cardSize(style.aspect, style.quality)
    void drawShareImage(item, card, style, link, PREVIEW / Math.max(w, h)).then((canvas) => { if (live) setPreview(canvas.toDataURL('image/png')) })
    return () => { live = false }
  }, [card, link, style, renderItem])

  /** The image at full resolution. */
  const full = async () => {
    const item = renderItem(itemRenderSize(style.aspect, style.quality))
    if (!item) throw new Error('The viewer isn’t ready.')
    return drawShareImage(item, card, style, link)
  }

  const download = async () => {
    setBusy('download'); setError('')
    try {
      const blob = await cardBlob(await full(), style.format)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${[card.over, card.title].filter(Boolean).join(' ').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'skin'}-${style.quality}p.${style.format === 'jpeg' ? 'jpg' : style.format}`
      a.click()
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const copy = async () => {
    setBusy('copy'); setError('')
    try {
      const blob = await cardBlob(await full(), 'png')
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setError('Could not copy the image here. Download it instead.')
    } finally {
      setBusy(null)
    }
  }

  const [w, h] = cardSize(style.aspect, style.quality)
  return (
    <div className="flex min-h-0 flex-col gap-5 md:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="grid min-h-60 flex-1 place-items-center rounded-2xl bg-[repeating-conic-gradient(#27272a_0_25%,#18181b_0_50%)] bg-[length:16px_16px] p-3">
          {preview
            ? <img src={preview} alt="Share image preview" className="max-h-[52vh] max-w-full rounded-lg shadow-[0_20px_50px_-20px_rgba(0,0,0,0.8)]" />
            : <Spinner />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-[11.5px] tabular-nums text-muted-foreground">{w} × {h} · {style.format.toUpperCase()}</span>
          <Button variant="outline" disabled={!!busy} onClick={copy}>
            {busy === 'copy' ? <Spinner className="size-3.5" /> : copied ? <Check /> : <Copy />} {copied ? 'Copied' : 'Copy'}
          </Button>
          <Button disabled={!!busy} onClick={download}>
            {busy === 'download' ? <Spinner className="size-3.5" /> : <Download />} Download
          </Button>
        </div>
        {error && <Callout tone="error">{error}</Callout>}
      </div>
      <div className="w-full shrink-0 overflow-y-auto md:w-72">
        <ShareImageOptions style={style} rarityColor={card.color} onChange={setStyle} />
      </div>
    </div>
  )
}
