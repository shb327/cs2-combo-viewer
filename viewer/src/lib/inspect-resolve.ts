import { STICKER_MAX } from '@/lib/config'
import type { AttachmentIndex } from '@/lib/data/attachments'
import { CHARM_PATTERN_MAX } from '@/lib/data/attachments'
import type { AgentIndex } from '@/lib/data/agents'
import type { CatalogIndex } from '@/lib/data/catalog'
import { inspectKind, type InspectItem } from '@/lib/data/inspect'
import type { CharmState } from '@/hooks/use-viewer-state'
import type { StickerOptions } from '@/lib/viewer/skin-viewer'

/** An inspect link mapped onto what the viewer can show: a skin with its attachments, or a sticker or charm on its own. */
export type ResolvedInspect = ResolvedSkin | ResolvedSticker | ResolvedCharm | ResolvedAgent

export interface ResolvedAgent {
  kind: 'agent'
  id: string
}

export interface ResolvedSticker {
  kind: 'sticker'
  id: string
  /** 0 = pristine, 1 = scraped off. */
  wear: number
}

export interface ResolvedCharm {
  kind: 'charm'
  id: string
  seed: number
  /** The sticker inside a sticker slab. */
  sticker: string | null
}

export interface ResolvedSkin {
  kind: 'skin'
  item: string
  kit: string
  float: number
  seed: number
  stickers: StickerOptions[]
  charm: Partial<CharmState>
  unknownStickers: number[]
}

/**
 * Maps a decoded inspect link onto what the viewer shows: a sticker item (definition 1209), a charm item (1355) or an
 * agent on its own, or else a skin with its wear and pattern, its stickers and its charm.
 * @param link the decoded link
 * @param catalog the catalog index
 * @param attachments the sticker and charm index
 * @param agents the agents index (agent links)
 * @returns the resolved item, or an error message when the viewer can't show it
 */
export function resolveInspect(link: InspectItem, catalog: CatalogIndex, attachments: AttachmentIndex, agents: AgentIndex | null = null): ResolvedInspect | string {
  const agent = agents?.agents.find((a) => a.index === link.defindex)
  const kind = inspectKind(link, () => !!agent)
  if (kind === 'agent') return { kind: 'agent', id: agent!.id }
  if (kind === 'sticker') {
    const sticker = link.stickers[0]
    const entry = sticker ? attachments.stickerByIndex.get(sticker.id) : undefined
    if (!entry) return sticker ? `Unknown sticker (kit ${sticker.id}).` : 'This sticker link has no sticker in it.'
    return { kind: 'sticker', id: entry.id, wear: Math.max(0, Math.min(1, sticker.wear ?? 0)) }
  }
  if (kind === 'charm') {
    const keychain = link.keychains[0]
    const def = keychain ? attachments.charmByIndex.get(keychain.id) : undefined
    if (!def) return keychain ? `Unknown charm (definition ${keychain.id}).` : 'This charm link has no charm in it.'
    return {
      kind: 'charm',
      id: def.id,
      seed: Math.max(0, Math.min(CHARM_PATTERN_MAX, keychain.pattern ?? 0)),
      sticker: keychain.wrappedSticker ? attachments.stickerByIndex.get(keychain.wrappedSticker)?.id ?? null : null,
    }
  }
  return resolveSkin(link, catalog, attachments)
}

/** A weapon or glove skin from the catalog, with its stickers and charm. */
function resolveSkin(link: InspectItem, catalog: CatalogIndex, attachments: AttachmentIndex): ResolvedSkin | string {
  const itemName = Object.keys(catalog.items).find((key) => catalog.items[key].defindex === link.defindex)
  if (!itemName) return `Unknown item (definition ${link.defindex}).`
  const skin = catalog.skins.find((s) => s.item === itemName && s.paintIndex === link.paintindex)
  if (!skin) {
    return link.paintindex
      ? `${catalog.items[itemName].displayName}: no skin with paint kit ${link.paintindex} in the catalog.`
      : `${catalog.items[itemName].displayName} without a skin (vanilla) isn't supported yet.`
  }

  const unknownStickers: number[] = []
  const stickers: StickerOptions[] = []
  for (const sticker of [...link.stickers].sort((a, b) => a.slot - b.slot).slice(0, STICKER_MAX)) {
    const entry = attachments.stickerByIndex.get(sticker.id)
    if (!entry) {
      unknownStickers.push(sticker.id)
      continue
    }
    stickers.push({
      id: entry.id,
      slot: sticker.slot,
      wear: sticker.wear ?? 0,
      offset: [sticker.offsetX ?? 0, sticker.offsetY ?? 0],
      rotation: sticker.rotation ?? 0,
      scale: sticker.scale && sticker.scale > 0 ? sticker.scale : 1,
    })
  }

  const keychain = link.keychains[0]
  const charmDef = keychain ? attachments.charmByIndex.get(keychain.id) : undefined
  const charm: Partial<CharmState> = { id: charmDef ? charmDef.id : null }
  if (charmDef && keychain) {
    charm.seed = Math.max(0, Math.min(CHARM_PATTERN_MAX, keychain.pattern ?? 0))
    charm.offset = [0, 0]
    charm.position = keychain.offsetX !== undefined || keychain.offsetZ !== undefined ? [keychain.offsetX ?? 0, keychain.offsetY ?? 0, keychain.offsetZ ?? 0] : null
    charm.sticker = keychain.wrappedSticker ? attachments.stickerByIndex.get(keychain.wrappedSticker)?.id ?? null : null
  }

  return { kind: 'skin', item: skin.item, kit: skin.kit, float: link.paintwear, seed: link.paintseed, stickers, charm, unknownStickers }
}
