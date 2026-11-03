import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ItemTagProps {
  className?: string
  style?: CSSProperties
  children: ReactNode
}

/** A small uppercase tag on an item card (rarity, StatTrak™, Souvenir). */
export function ItemTag({ className, style, children }: ItemTagProps) {
  return <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', className)} style={style}>{children}</span>
}
