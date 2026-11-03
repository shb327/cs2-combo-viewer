import { ArrowDownWideNarrow, X } from 'lucide-react'
import { SelectMenu } from '@/components/common/select-menu'
import { PICKER_SORTS, type PickerSort } from '@/lib/picker'
import { getColorByRarity, rarityName } from '@/lib/rarity'
import { cn } from '@/lib/utils'

interface PickerArrangeBarProps {
  /** The line on the left ("120 items"…). */
  summary: string
  sort: PickerSort
  /** The rarities the current cards have, and the ones kept (none: all). */
  available: number[]
  rarities: number[]
  /** How this category names its rarities. */
  naming: 'skin' | 'other' | 'agent'
  onSort: (sort: PickerSort) => void
  onRarities: (rarities: number[]) => void
}

/** Above the cards: their count, a rarity filter (a dot per rarity, in its color) and the order. */
export function PickerArrangeBar({ summary, sort, available, rarities, naming, onSort, onRarities }: PickerArrangeBarProps) {
  const toggle = (r: number) => onRarities(rarities.includes(r) ? rarities.filter((x) => x !== r) : [...rarities, r])
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 pt-3 text-[11.5px] text-muted-foreground">
      <span className="mr-auto">{summary}</span>
      {available.length > 1 && (
        <div className="flex items-center gap-1" role="group" aria-label="Filter by rarity">
          {available.map((r) => {
            const on = rarities.includes(r)
            const color = getColorByRarity(r) ?? '#71717a'
            return (
              <button
                key={r}
                type="button"
                aria-pressed={on}
                title={rarityName(r, naming)}
                onClick={() => toggle(r)}
                className={cn('grid size-6 place-items-center rounded-full transition', on ? 'bg-white/12 ring-1 ring-white/30' : 'hover:bg-white/8', rarities.length && !on && 'opacity-45')}
              >
                <span className="size-3 rounded-full ring-1 ring-black/40" style={{ background: color }} />
              </button>
            )
          })}
          {rarities.length > 0 && (
            <button type="button" aria-label="Show every rarity" title="Show every rarity" onClick={() => onRarities([])} className="grid size-6 place-items-center rounded-full hover:bg-white/8 hover:text-foreground">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}
      <SelectMenu label="Sort" icon={ArrowDownWideNarrow} options={PICKER_SORTS} value={sort} onChange={onSort} />
    </div>
  )
}
