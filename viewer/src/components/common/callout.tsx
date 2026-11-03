import { AlertCircle, AlertTriangle, CheckCircle2, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Tone = 'error' | 'warning' | 'success'

const TONES: Record<Tone, { icon: LucideIcon; className: string }> = {
  error: { icon: AlertCircle, className: 'border-destructive/30 bg-destructive/10 text-destructive' },
  warning: { icon: AlertTriangle, className: 'border-amber-400/30 bg-amber-400/10 text-amber-200' },
  success: { icon: CheckCircle2, className: 'border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-300' },
}

interface CalloutProps {
  tone: Tone
  /** A compact one-line pill instead of a block. */
  pill?: boolean
  className?: string
  children: ReactNode
}

/** A message box with an icon: an error, a warning or a success. */
export function Callout({ tone, pill, className, children }: CalloutProps) {
  const { icon: Icon, className: toneClass } = TONES[tone]
  return (
    <div
      role={tone === 'error' ? 'alert' : undefined}
      className={cn(
        'flex items-start gap-2 border text-[12px]',
        pill ? 'items-center rounded-full px-3.5 py-1.5 shadow-lg' : 'rounded-2xl px-3.5 py-2.5',
        toneClass,
        className,
      )}
    >
      <Icon className={cn('size-4 shrink-0', !pill && 'mt-px')} />
      <span className="min-w-0">{children}</span>
    </div>
  )
}
