import { Check, ChevronDown, type LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface SelectMenuProps<T extends string> {
  label: string
  icon?: LucideIcon
  options: { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  /** Which edge of the button the menu lines up with. Default right. */
  align?: 'left' | 'right'
}

/**
 * A compact choice: a button with the current option, opening a glass menu under it (arrow keys and Enter, Escape or
 * a click outside closes it).
 */
export function SelectMenu<T extends string>({ label, icon: Icon, options, value, onChange, align = 'right' }: SelectMenuProps<T>) {
  const [open, setOpen] = useState(false)
  const [hover, setHover] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const current = options.find((o) => o.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false) }
    window.addEventListener('pointerdown', outside, true)
    return () => window.removeEventListener('pointerdown', outside, true)
  }, [open])

  const choose = (v: T) => { onChange(v); setOpen(false) }
  const onKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setHover(Math.max(0, options.indexOf(current))); setOpen(true) }
      return
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setHover((h) => (h + 1) % options.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHover((h) => (h - 1 + options.length) % options.length) }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(options[hover].value) }
  }

  return (
    <div ref={root} className="relative" onKeyDown={onKey}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${current.label}`}
        onClick={() => { setHover(Math.max(0, options.indexOf(current))); setOpen((o) => !o) }}
        className={cn('flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11.5px] text-foreground/90 transition', open ? 'bg-white/10' : 'hover:bg-white/[0.06]')}
      >
        {Icon && <Icon className="size-3.5 text-muted-foreground" />}
        <span className="text-muted-foreground">{label}:</span> {current.label}
        <ChevronDown className={cn('size-3.5 text-muted-foreground transition-transform duration-150', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="listbox" className={cn('glass-strong absolute top-full z-30 mt-1.5 max-h-72 min-w-48 overflow-y-auto rounded-xl p-1', align === 'right' ? 'right-0' : 'left-0', ' shadow-[0_18px_40px_-12px_oklch(0_0_0/80%)] animate-in fade-in zoom-in-95 duration-100')}>
          {options.map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onPointerEnter={() => setHover(i)}
              onClick={() => choose(o.value)}
              className={cn('flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px]', i === hover ? 'bg-white/10 text-foreground' : 'text-foreground/80')}
            >
              <Check className={cn('size-3.5', o.value === value ? 'text-violet-300' : 'opacity-0')} />
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
