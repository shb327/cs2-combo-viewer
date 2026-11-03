import { MARKUP, type CharmDef, type WeaponMarkup } from '@/lib/data/attachments'
import type { Item } from '@/lib/data/items'

export interface ItemMarkup {
  stickerSlots: WeaponMarkup['stickerSlots']
  charm: boolean
}

/**
 * What a loaded weapon accepts: its sticker slots and whether it has a charm point. Gloves accept nothing.
 * @param item the loaded item
 */
export function markupFor(item: Item | null): ItemMarkup | undefined {
  if (!item || item.style === 'glove') return undefined
  if (item.stickerMask || item.keychainAnchors?.length) {
    return { stickerSlots: item.stickerMask ? item.stickerSlots ?? [] : [], charm: !!item.keychainAnchors?.length }
  }
  const legacy = MARKUP[item.id]
  return legacy && { stickerSlots: legacy.stickerSlots, charm: true }
}

/**
 * Whether a charm shows a sticker (the sticker slab: a material with F_STICKERS).
 * @param charm the charm, if any
 */
export function isSlabCharm(charm: CharmDef | undefined): boolean {
  return !!charm && Object.values(charm.materials).some((m) => m.params.F_STICKERS === '1')
}
