import { LayoutGrid } from 'lucide-react'
import { Kbd } from '@/components/common/kbd'
import { MOD_KEY } from '@/lib/keys'

interface CurrentPickProps {
  over: string
  title: string
  color: string
  onClick: () => void
}

/** The current selection, as a raised card lit in its rarity color that opens the picker. */
export function CurrentPick({ over, title, color, onClick }: CurrentPickProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={`Change (/ or ${MOD_KEY}+K)`}
      className="bevel group relative flex shrink-0 items-center gap-3 overflow-hidden rounded-2xl p-3 text-left"
    >
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-24 opacity-40 transition-opacity group-hover:opacity-70" style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
      <span className="relative h-10 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="relative min-w-0 flex-1">
        <span className="block truncate text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{over}</span>
        <span className="block truncate text-[14px] font-semibold">{title}</span>
      </span>
      <span className="bevel-primary relative flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-white">
        <LayoutGrid className="size-3.5" /> Change <Kbd className="ml-0.5 hidden sm:inline-flex">{MOD_KEY} K</Kbd>
      </span>
    </button>
  )
}
