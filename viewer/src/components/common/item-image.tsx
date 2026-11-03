import { Box, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface ItemImageProps {
  src?: string
  /** The glow under the image (usually the rarity color). */
  color: string
  /** Shown while there is no image or it fails to load. */
  fallback?: LucideIcon
  /** Sizes the image box. */
  className?: string
  /** Extra classes for the image itself (for example a hover zoom). */
  imageClassName?: string
  lazy?: boolean
}

/** A market image over a glow of `color`, with an icon standing in when there is none or it fails to load. */
export function ItemImage({ src, color, fallback: Fallback = Box, className, imageClassName, lazy }: ItemImageProps) {
  const [failed, setFailed] = useState(false)
  return (
    <span
      className={cn('relative grid shrink-0 place-items-center overflow-hidden rounded-xl', className)}
      style={{ background: `radial-gradient(ellipse at 50% 85%, ${color}50, transparent 70%)` }}
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading={lazy ? 'lazy' : undefined}
          decoding="async"
          draggable={false}
          onError={() => setFailed(true)}
          className={cn('max-h-full max-w-full object-contain drop-shadow-[0_6px_12px_rgba(0,0,0,0.6)]', imageClassName)}
        />
      ) : (
        <Fallback className="size-1/3 max-h-8 max-w-8 text-muted-foreground/50" />
      )}
    </span>
  )
}
