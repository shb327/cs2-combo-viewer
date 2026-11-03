import { cn } from '@/lib/utils'

interface MapButtonProps {
  label: string
  /** The panorama's thumbnail (none: the studio's plain swatch). */
  thumb?: string
  active: boolean
  onClick: () => void
}

/** One map choice: its panorama's thumbnail (or the studio's plain swatch) over its name. */
export function MapButton({ label, thumb, active, onClick }: MapButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-pressed={active}
      className={cn('flex flex-col gap-1.5 rounded-2xl p-1.5 text-left text-[12.5px] font-medium', active ? 'bevel-primary text-white' : 'bevel text-foreground/80')}
    >
      {thumb
        ? <img src={thumb} alt="" loading="lazy" className="aspect-[2/1] w-full rounded-xl object-cover" />
        : <span className="aspect-[2/1] w-full rounded-xl bg-gradient-to-b from-zinc-700 to-zinc-900" />}
      <span className="truncate px-1 pb-0.5">{label}</span>
    </button>
  )
}
