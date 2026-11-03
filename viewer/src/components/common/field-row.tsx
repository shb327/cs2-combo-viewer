import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface FieldRowProps {
  label: string
  className?: string
  children: ReactNode
}

/** A control row with its label in a fixed-width column on the left (sliders, pickers, colors line up). */
export function FieldRow({ label, className, children }: FieldRowProps) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <span className="w-14 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
