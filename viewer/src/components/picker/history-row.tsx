import { Link2, X } from 'lucide-react'
import { ItemImage } from '@/components/common/item-image'
import { ItemTag } from '@/components/inspect/item-tag'
import type { InspectPreview } from '@/lib/inspect-preview'
import { timeAgo } from '@/lib/time'

interface HistoryRowProps {
  preview: InspectPreview
  /** When it was loaded (ms since the epoch). */
  at: number
  onLoad: () => void
  onRemove: () => void
}

/**
 * One inspect link of the history, on a line: the item's image, its name and tags, its float and pattern (or what
 * kind of item it is), its stickers and charm, and when it was loaded. A click loads it again.
 */
export function HistoryRow({ preview, at, onLoad, onRemove }: HistoryRowProps) {
  const facts: [string, string, string?][] = preview.kind === 'skin'
    ? [['Float', preview.float.toFixed(6)], ['Wear', preview.wear.name, preview.wear.color], ['Pattern', `#${preview.seed}`]]
    : [['Type', preview.weapon], ...(preview.charm && preview.kind === 'charm' ? [['Pattern', `#${preview.charm.pattern}`] as [string, string]] : [])]
  const attachments = preview.kind === 'charm' ? [] : preview.stickers

  return (
    <div className="group/row relative">
      <button
        type="button"
        onClick={onLoad}
        className="tile flex w-full items-center gap-4 p-2.5 pr-12 text-left transition hover:border-white/20 hover:bg-white/[0.04]"
      >
        <ItemImage src={preview.image} color={preview.color} className="h-20 w-28 rounded-lg" imageClassName="transition-transform duration-200 group-hover/row:scale-110" />

        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-4 w-0.5 shrink-0 rounded-full" style={{ background: preview.color }} />
            <span className="truncate text-[14px] font-medium" title={preview.title}>{preview.title}</span>
            {preview.statTrak !== null && <ItemTag className="shrink-0 bg-orange-500/15 text-orange-300">StatTrak™</ItemTag>}
            {preview.souvenir && <ItemTag className="shrink-0 bg-yellow-500/15 text-yellow-300">Souvenir</ItemTag>}
            {preview.rarityLabel && <ItemTag className="shrink-0" style={{ color: preview.color, background: `${preview.color}22` }}>{preview.rarityLabel}</ItemTag>}
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-0.5 text-[12px]">
            {facts.map(([label, value, color]) => (
              <span key={label} className="flex items-baseline gap-1.5">
                <span className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{label}</span>
                <span className="font-mono tabular-nums" style={color ? { color } : undefined}>{value}</span>
              </span>
            ))}
            {preview.nameTag && <span className="truncate italic text-muted-foreground">“{preview.nameTag}”</span>}
          </div>

          {(attachments.length > 0 || (preview.charm && preview.kind === 'skin')) && (
            <div className="flex items-center gap-1.5">
              {attachments.map((s) => (
                <span key={s.slot} title={s.name}>
                  <ItemImage src={s.image} color={preview.color} className="size-8 rounded-md bg-black/20" lazy />
                </span>
              ))}
              {preview.charm && preview.kind === 'skin' && (
                <span className="ml-1 flex items-center gap-1 rounded-md bg-black/20 pr-2 text-[11px] text-muted-foreground" title={preview.charm.name}>
                  <ItemImage src={preview.charm.image} color={preview.color} fallback={Link2} className="size-8 rounded-md" lazy />
                  #{preview.charm.pattern}
                </span>
              )}
            </div>
          )}
        </div>

        <span className="shrink-0 self-start pt-0.5 text-[11px] text-muted-foreground">{timeAgo(at)}</span>
      </button>
      <button
        type="button"
        aria-label="Remove from history"
        title="Remove from history"
        onClick={onRemove}
        className="absolute right-2.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground opacity-0 transition hover:bg-white/10 hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100"
      >
        <X className="size-4" />
      </button>
    </div>
  )
}
