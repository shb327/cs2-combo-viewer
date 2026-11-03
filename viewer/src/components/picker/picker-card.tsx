import type { CSSProperties } from 'react'
import { ItemImage } from '@/components/common/item-image'
import type { PickerCard as Card } from '@/lib/picker'
import { GRID_ITEM } from '@/lib/grid-focus'
import { tiltHandlers } from '@/lib/tilt'
import { cn } from '@/lib/utils'

interface PickerCardProps {
  /** What the card shows (a catalog card, or anything shaped like one: `ported` false dims it). */
  card: Pick<Card, 'title' | 'subtitle' | 'color' | 'icon'> & { ported?: boolean }
  current: boolean
  onPick: () => void
}

/** A picker card: the market icon over its rarity glow, the name and subtitle; it leans toward the mouse. */
export function PickerCard({ card, current, onPick }: PickerCardProps) {
  return (
    <button
      type="button"
      {...tiltHandlers}
      {...{ [GRID_ITEM]: '' }}
      style={{ '--rarity': card.color } as CSSProperties}
      className={cn(
        // No backdrop-filter: there can be hundreds of these on screen.
        'group/card tile tilt-card relative flex flex-col gap-2 p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-300 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent shadow-[inset_0_1px_0_oklch(1_0_0/10%),0_3px_0_oklch(0.12_0_0),0_12px_24px_-14px_oklch(0_0_0/80%)]',
        'hover:border-[color-mix(in_oklch,var(--rarity),transparent_45%)] hover:shadow-[inset_0_1px_0_oklch(1_0_0/14%),0_3px_0_oklch(0.12_0_0),0_18px_34px_-16px_oklch(0_0_0/85%)]',
        current && 'ring-2 ring-violet-400 ring-offset-2 ring-offset-transparent',
        card.ported === false && 'opacity-55',
      )}
      onClick={onPick}
    >
      <ItemImage
        src={card.icon}
        color={card.color}
        lazy
        className="aspect-[4/3] w-full rounded-lg"
        imageClassName="transition-transform duration-200 group-hover/card:scale-110"
      />
      <span className="flex items-start gap-2 px-0.5">
        <span className="mt-1 h-7 w-0.5 shrink-0 rounded-full" style={{ background: card.color }} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium" title={card.title}>{card.title}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{card.subtitle}</span>
        </span>
      </span>
    </button>
  )
}
