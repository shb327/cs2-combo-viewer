import { cn } from '@/lib/utils'

interface SegmentedControlProps<T extends string | number> {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  className?: string
}

/** A row of raised buttons, one of them pressed: a choice between a few options. */
export function SegmentedControl<T extends string | number>({ options, value, onChange, className }: SegmentedControlProps<T>) {
  return (
    <div className={cn('flex gap-1.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn('flex-1 rounded-xl px-2.5 py-1.5 text-[12px] font-medium', o.value === value ? 'bevel-primary text-white' : 'bevel text-foreground/80')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
