import { Tag } from 'lucide-react'
import { ItemImage } from '@/components/common/item-image'
import { ItemTag } from '@/components/inspect/item-tag'
import type { InspectPreview } from '@/lib/inspect-preview'

/** The inspected item's market card: image, rarity / StatTrak™ / Souvenir tags, weapon, finish and name tag. */
export function ItemHeader({ preview }: { preview: InspectPreview }) {
  return (
    <div className="tile relative flex gap-4 overflow-hidden p-3.5">
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: preview.color }} />
      <ItemImage src={preview.image} color={preview.color} className={preview.kind === 'skin' ? 'h-[104px] w-[138px] bg-black/20' : 'h-[132px] w-[176px] bg-black/20'} />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {preview.rarityLabel && (
            <ItemTag style={{ color: preview.color, background: `${preview.color}1f` }}>{preview.rarityLabel}</ItemTag>
          )}
          {preview.statTrak !== null && <ItemTag className="bg-orange-500/15 text-orange-300">StatTrak™ · {preview.statTrak.toLocaleString()}</ItemTag>}
          {preview.souvenir && <ItemTag className="bg-yellow-400/15 text-yellow-300">Souvenir</ItemTag>}
        </div>
        <div className="min-w-0">
          <div className="truncate text-[12px] text-muted-foreground">{preview.weapon}</div>
          <div className="truncate text-[18px] font-semibold leading-tight tracking-tight">{preview.finish}</div>
        </div>
        {preview.nameTag && (
          <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-foreground/80">
            <Tag className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate italic">“{preview.nameTag}”</span>
          </div>
        )}
      </div>
    </div>
  )
}
