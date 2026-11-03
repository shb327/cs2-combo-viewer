import { cn } from '@/lib/utils'

interface PillSwitchProps<T extends string> {
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  label: string
  className?: string
}

/** A pill with a glowing thumb that slides to the chosen option (two or three). */
export function PillSwitch<T extends string>({ options, value, onChange, label, className }: PillSwitchProps<T>) {
  const index = Math.max(0, options.findIndex((o) => o.value === value))
  const next = options[(index + 1) % options.length].value
  return (
    <div role="radiogroup" aria-label={label} className={cn('glass-panel pointer-events-auto relative flex h-10 items-center rounded-full p-1 text-[11px] font-semibold uppercase tracking-widest', className)}>
      <span
        className="absolute inset-y-1 left-1 rounded-full bg-gradient-to-b from-violet-400 to-violet-600 shadow-[0_0_14px_oklch(0.65_0.25_295/55%)] transition-transform duration-300 ease-out"
        style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value === value ? next : o.value)}
          className={cn('relative z-10 flex-1 rounded-full text-center transition-colors', o.value === value ? 'text-white' : 'text-muted-foreground hover:text-foreground')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
