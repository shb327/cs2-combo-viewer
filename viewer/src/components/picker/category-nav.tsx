import { CategoryIcon } from '@/components/picker/category-icon'
import type { PickerCategory } from '@/lib/picker'
import { cn } from '@/lib/utils'

interface CategoryNavProps {
  categories: PickerCategory[]
  /** The highlighted one (none while searching everything). */
  active: string | null
  counts: Record<string, number>
  onSelect: (label: string) => void
  /** The counts are known (dims the empty categories). */
  loaded: boolean
}

/** The picker's categories: a column on wide screens, a scrolling row on small ones; empty ones dimmed. */
export function CategoryNav({ categories, active, counts, onSelect, loaded }: CategoryNavProps) {
  return (
    <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 bg-black/20 p-2 md:w-56 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r md:p-3">
      <div className="hidden px-3 pb-2 pt-1 text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted-foreground md:block">Categories</div>
      {categories.map((c) => {
        const isActive = active === c.label
        const empty = loaded && !counts[c.label]
        return (
          <button
            key={c.label}
            type="button"
            onClick={() => onSelect(c.label)}
            className={cn(
              'flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-1.5 text-left text-[13px] transition',
              isActive ? 'bevel-primary text-white' : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
              empty && !isActive && 'opacity-40',
            )}
            title={empty ? `No ${c.label.toLowerCase()} here yet` : undefined}
          >
            <CategoryIcon category={c} active={isActive} />
            <span className="flex-1">{c.label}</span>
            <span className="hidden text-[10.5px] tabular-nums opacity-60 md:inline">{counts[c.label] ?? 0}</span>
          </button>
        )
      })}
    </nav>
  )
}
