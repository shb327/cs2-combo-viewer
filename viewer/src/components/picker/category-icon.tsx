import { Bird, Box, Crosshair, Hand, LayoutGrid, MapPin, Shield, Sticker, Swords, Target, UserRound, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { categoryImageUrl, type PickerCategory } from '@/lib/picker'
import { cn } from '@/lib/utils'

const ICONS: Record<PickerCategory['icon'], LucideIcon> = {
  grid: LayoutGrid, rifle: Crosshair, target: Target, pistol: Crosshair, knife: Swords, glove: Hand, cube: Box, sticker: Sticker, charm: Sticker, agent: UserRound, pin: MapPin, patch: Shield, pet: Bird,
}

/** A category's picture: its item image, or its generic icon when it has none or the image fails to load. */
export function CategoryIcon({ category, active }: { category: PickerCategory; active: boolean }) {
  const [failed, setFailed] = useState(false)
  const Icon = ICONS[category.icon]
  if (!category.image || failed) return <span className="grid size-9 shrink-0 place-items-center"><Icon className="size-5 opacity-80" /></span>
  return (
    <img
      src={categoryImageUrl(category.image)}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
      className={cn('size-9 shrink-0 object-contain transition', active ? 'drop-shadow-[0_2px_6px_rgba(0,0,0,0.6)]' : 'opacity-75')}
    />
  )
}
