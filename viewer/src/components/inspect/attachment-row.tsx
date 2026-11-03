import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { ItemImage } from '@/components/common/item-image'
import { cn } from '@/lib/utils'

interface AttachmentRowProps {
  name: string
  image?: string
  /** The glow behind the image. */
  color: string
  icon: LucideIcon
  /** A line under the name. */
  detail?: string
  /** Dimmed: something the viewer doesn't have. */
  known: boolean
  /** On the right (a wear read-out, a pattern number). */
  aside?: ReactNode
}

/** One sticker or charm of an inspected item: its image, name, a detail line and a value on the right. */
export function AttachmentRow({ name, image, color, icon, detail, known, aside }: AttachmentRowProps) {
  return (
    <div className={cn('flex items-center gap-3 rounded-xl bg-black/15 p-1.5 pr-3', !known && 'opacity-60')}>
      <ItemImage src={image} color={color} fallback={icon} className="size-10" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium">{name}</div>
        {detail && <div className="text-[10.5px] text-muted-foreground">{detail}</div>}
      </div>
      {aside}
    </div>
  )
}
