import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface NumberFieldProps {
  value: number
  min: number
  max: number
  decimals?: number
  label: string
  className?: string
  onChange: (value: number) => void
}

/** A number input you can type in: the value is applied (clamped) on Enter or blur. */
export function NumberField({ value, min, max, decimals = 0, label, className, onChange }: NumberFieldProps) {
  const [draft, setDraft] = useState(value.toFixed(decimals))

  useEffect(() => { setDraft(value.toFixed(decimals)) }, [value, decimals])

  const commit = () => {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed)) return setDraft(value.toFixed(decimals))
    const next = Math.min(max, Math.max(min, parsed))
    onChange(next)
    setDraft(next.toFixed(decimals))
  }

  return (
    <input
      inputMode="decimal"
      aria-label={label}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      className={cn('inset-well h-8 min-w-0 rounded-lg px-2 text-center font-mono text-[13px] tabular-nums outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50', className)}
    />
  )
}
