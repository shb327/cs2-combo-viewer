import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { PickerCard } from '@/components/picker/picker-card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDbImages } from '@/context/db-context'
import type { CatalogIndex } from '@/lib/data/catalog'
import { FEATURED_SKINS } from '@/lib/home'
import { variantName } from '@/lib/picker'
import { rarityColor } from '@/lib/rarity'
import { parseSkinKey, selectionPath } from '@/lib/selection'

/** A row of well-known skins, as picker cards that open them in the viewer. */
export function FeaturedSkins({ catalog }: { catalog: CatalogIndex | null }) {
  const images = useDbImages()
  const navigate = useNavigate()
  const cards = useMemo(() => FEATURED_SKINS.flatMap((key) => {
    const parts = parseSkinKey(key)
    const skin = parts && catalog?.skins.find((s) => s.item === parts.item && s.kit === parts.kit)
    const item = skin && catalog!.items[skin.item]
    if (!skin || !item) return []
    return [{
      key, skin,
      card: { title: variantName(skin), subtitle: item.displayName, color: rarityColor(images.skinRarity(item.defindex, skin.paintIndex), skin.rarity, '#71717a'), icon: images.skin(item.defindex, skin.paintIndex) },
    }]
  }), [catalog, images])

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">
      {!catalog && FEATURED_SKINS.map((k) => <Skeleton key={k} className="h-[190px] rounded-2xl" />)}
      {cards.map(({ key, skin, card }) => (
        <PickerCard key={key} card={card} current={false} onPick={() => navigate(selectionPath({ kind: 'skin', item: skin.item, kit: skin.kit }))} />
      ))}
    </div>
  )
}
