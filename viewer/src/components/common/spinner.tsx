import { cn } from '@/lib/utils'

/** A small spinning ring in the accent color. */
export function Spinner({ className }: { className?: string }) {
  return <span aria-hidden className={cn('size-4 shrink-0 animate-spin rounded-full border-2 border-primary/30 border-t-primary', className)} />
}
