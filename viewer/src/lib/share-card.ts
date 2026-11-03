import type { DbImages } from '@/context/db-context'
import type { ViewerState } from '@/hooks/use-viewer-state'
import type { AttachmentIndex } from '@/lib/data/attachments'
import type { CatalogIndex, CatalogSkin } from '@/lib/data/catalog'
import type { Item } from '@/lib/data/items'
import type { Heading } from '@/lib/heading'
import { rarityName, rarityOf } from '@/lib/rarity'
import type { Selection } from '@/lib/selection'
import { clampFloat, wearOf } from '@/lib/wear'
import { DEFAULT_FLOAT } from '@/lib/config'
import type { ShareLink } from '@/lib/share-code'

/** What the share dialog needs, read when it opens: the view's link, what its image says, and its render. */
export interface ShareSource {
  link: ShareLink
  card: ShareCard
  /** The item at `longSide` pixels (transparent, cropped), or null without a viewer. */
  renderItem: (longSide: number) => HTMLCanvasElement | null
}

/** What the share image says about the view, besides the render. */
export interface ShareCard {
  /** Above the title: the weapon, "Sticker", "Charm" or the agent's faction. */
  over: string
  title: string
  /** The rarity color, and its name when known. */
  color: string
  rarity: string | null
  /** Short values in a row: pattern, wear… */
  facts: { label: string; value: string; color?: string }[]
  /** A skin's float on its wear bar. */
  float: { value: number; wear: string; color: string } | null
  stickers: { name: string; image?: string }[]
  charm: { name: string; image?: string; pattern: number } | null
}

/**
 * The share image's text and attachments for the current view.
 * @param selection what is shown
 * @param state the view's state
 * @param heading the stage's title block (names and rarity color)
 * @param item the loaded skin, if any
 * @param skin the selection's catalog entry, if any
 * @param catalog the catalog index (the skin's definition index)
 * @param attachments the sticker and charm index
 * @param images the db: market images and rarities
 */
export function shareCardFor(selection: Selection, state: ViewerState, heading: Heading, item: Item | null, skin: CatalogSkin | undefined,
  catalog: CatalogIndex | null, attachments: AttachmentIndex | null, images: DbImages): ShareCard {
  const card: ShareCard = { over: heading.over, title: heading.title, color: heading.color, rarity: null, facts: [], float: null, stickers: [], charm: null }
  const stickerOf = (id: string) => {
    const entry = attachments?.sticker.get(id)
    return { name: entry?.name ?? id, image: entry ? images.sticker(entry.index) : undefined }
  }
  const charmOf = (id: string, pattern: number) => {
    const def = attachments?.charm.get(id)
    return { name: def?.name ?? id, image: def ? images.charm(def.index) : undefined, pattern }
  }

  if (selection.kind === 'sticker') {
    const entry = attachments?.sticker.get(selection.id)
    const rarity = entry ? rarityOf(images.stickerRarity(entry.index), entry.rarity) : undefined
    card.rarity = rarity ? rarityName(rarity, 'other') : null
    if (state.stickerWear) card.facts.push({ label: 'Wear', value: `${Math.round(state.stickerWear * 100)}%` })
    return card
  }
  if (selection.kind === 'charm') {
    const def = attachments?.charm.get(selection.id)
    const rarity = def ? rarityOf(images.charmRarity(def.index), def.rarity) : undefined
    card.rarity = rarity ? rarityName(rarity, 'other') : null
    card.facts.push({ label: 'Pattern', value: `#${state.charm.seed}` })
    if (state.charm.sticker) card.stickers.push(stickerOf(state.charm.sticker))
    return card
  }
  if (selection.kind === 'agent') return card

  const rarity = skin ? rarityOf(images.skinRarity(catalog?.items[skin.item]?.defindex, skin.paintIndex), skin.rarity) : undefined
  card.rarity = rarity ? rarityName(rarity, 'skin') : null
  if (item) {
    const float = clampFloat(item, state.float ?? DEFAULT_FLOAT)
    const wear = wearOf(float)
    card.float = { value: float, wear: wear.name, color: wear.color }
    card.facts.push({ label: 'Wear', value: wear.name, color: wear.color }, { label: 'Pattern', value: `#${state.seed}` })
  }
  card.stickers = state.stickers.map((s) => stickerOf(s.id))
  if (state.charm.id) card.charm = charmOf(state.charm.id, state.charm.seed)
  return card
}
