import type { DbImages } from '@/context/db-context'
import type { AttachmentIndex } from '@/lib/data/attachments'
import type { AgentIndex } from '@/lib/data/agents'
import type { CatalogIndex } from '@/lib/data/catalog'
import { inspectKind, type InspectItem, type InspectKind, type InspectSticker } from '@/lib/data/inspect'
import { variantName } from '@/lib/picker'
import { getColorByRarity, rarityName, rarityOf } from '@/lib/rarity'
import { wearOf, type Wear } from '@/lib/wear'

export interface PreviewSticker {
  slot: number
  name: string
  image?: string
  /** 0 = pristine, 1 = scraped off. */
  wear: number
  known: boolean
}

export interface InspectPreview {
  /** A weapon / glove skin, or a sticker or charm item on its own. */
  kind: InspectKind
  /** "AK-47 | Fire Serpent", or the raw ids when the catalog doesn't know it. */
  title: string
  weapon: string
  finish: string
  image?: string
  /** In-game rarity (1 Consumer … 7 Contraband), when known, and its name for this kind of item. */
  rarity: number | null
  rarityLabel: string | null
  color: string
  /** Why the viewer can't load it (unknown weapon or paint kit); the rest still shows. */
  problem?: string
  float: number
  floatMin: number
  floatMax: number
  wear: Wear
  seed: number
  statTrak: number | null
  souvenir: boolean
  nameTag?: string
  /** The weapon's stickers — or, for an agent, its patches. */
  stickers: PreviewSticker[]
  /** The charm on the weapon — or, for a charm item, the charm itself. */
  charm: PreviewCharm | null
}

export interface PreviewCharm {
  name: string
  image?: string
  pattern: number
  known: boolean
  /** The sticker inside a sticker slab. */
  slabSticker: PreviewSticker | null
}

/** The skin-only fields, for items that have none (stickers, charms, agents). */
const EMPTY_DETAILS = {
  float: 0, floatMin: 0, floatMax: 1, wear: wearOf(0), seed: 0, statTrak: null, souvenir: false, stickers: [], charm: null,
} satisfies Partial<InspectPreview>

const QUALITY_STATTRAK = 9
const QUALITY_SOUVENIR = 12
const GREY = '#71717a'

/**
 * Everything an inspect link says about its item, in names: the weapon and finish, rarity, float and wear,
 * pattern, StatTrak and name tag, each sticker and the charm, with their market images when the db has them.
 * @param link the decoded link
 * @param catalog the catalog index (null while it loads: names fall back to ids)
 * @param attachments the sticker and charm index (likewise)
 * @param images market names and images (db.json)
 * @param agents the agents index (likewise)
 */
export function inspectPreview(link: InspectItem, catalog: CatalogIndex | null, attachments: AttachmentIndex | null, images: DbImages, agents: AgentIndex | null = null): InspectPreview {
  const agent = agents?.agents.find((a) => a.index === link.defindex)
  const kind = inspectKind(link, (defindex) => !!agent || !!images.agentName(defindex))
  if (kind === 'agent') return agentPreview(link, agents, agent, images)
  if (kind !== 'skin') return attachmentPreview(kind, link, attachments, images)

  const itemKey = catalog ? Object.keys(catalog.items).find((key) => catalog.items[key].defindex === link.defindex) : undefined
  const itemInfo = itemKey ? catalog!.items[itemKey] : undefined
  const skin = itemKey ? catalog!.skins.find((s) => s.item === itemKey && s.paintIndex === link.paintindex) : undefined

  const weapon = itemInfo?.displayName ?? `Item #${link.defindex}`
  const finish = skin ? variantName(skin) : link.paintindex ? `Paint kit #${link.paintindex}` : 'Vanilla'
  const problem = !catalog ? undefined
    : !itemInfo ? `Unknown item (definition ${link.defindex}).`
      : !skin ? (link.paintindex ? `No skin with paint kit ${link.paintindex} in the catalog.` : 'Vanilla items aren’t supported yet.')
        : undefined

  const stickers = [...link.stickers].sort((a, b) => a.slot - b.slot).map((s) => previewSticker(s, attachments, images))

  const keychain = link.keychains[0]
  const charm = keychain ? previewCharm(keychain, attachments, images) : null

  // The link carries the item's own rarity; then the db's, then the catalog's.
  const rarity = rarityOf(link.rarity || images.skinRarity(link.defindex, link.paintindex), skin?.rarity) ?? null
  return {
    kind,
    title: `${weapon} | ${finish}`,
    weapon,
    finish,
    image: images.skin(link.defindex, link.paintindex),
    rarity,
    rarityLabel: rarity ? rarityName(rarity, 'skin') : null,
    color: getColorByRarity(rarity) ?? GREY,
    problem,
    float: link.paintwear,
    floatMin: skin?.floatMin ?? 0,
    floatMax: skin?.floatMax ?? 1,
    wear: wearOf(link.paintwear),
    seed: link.paintseed,
    statTrak: link.quality === QUALITY_STATTRAK ? link.killeatervalue ?? 0 : null,
    souvenir: link.quality === QUALITY_SOUVENIR,
    nameTag: link.customname || undefined,
    stickers,
    charm,
  }
}

const previewSticker = (s: InspectSticker, attachments: AttachmentIndex | null, images: DbImages): PreviewSticker => {
  const entry = attachments?.stickerByIndex.get(s.id)
  return { slot: s.slot, name: entry?.name ?? `Sticker #${s.id}`, image: images.sticker(s.id), wear: Math.max(0, Math.min(1, s.wear ?? 0)), known: !!entry }
}

function previewCharm(keychain: InspectSticker, attachments: AttachmentIndex | null, images: DbImages): PreviewCharm {
  const def = attachments?.charmByIndex.get(keychain.id)
  return {
    name: def?.name ?? `Charm #${keychain.id}`,
    image: images.charm(keychain.id),
    pattern: keychain.pattern ?? 0,
    known: !!def,
    slabSticker: keychain.wrappedSticker ? previewSticker({ slot: 0, id: keychain.wrappedSticker }, attachments, images) : null,
  }
}

/**
 * A sticker item (definition 1209: its kit in stickers[0]) or a charm item (1355: in keychains[0]) on its own: its
 * name, image, rarity and its wear or pattern.
 */
function attachmentPreview(kind: 'sticker' | 'charm', link: InspectItem, attachments: AttachmentIndex | null, images: DbImages): InspectPreview {
  const sticker = kind === 'sticker' ? link.stickers[0] : undefined
  const keychain = kind === 'charm' ? link.keychains[0] : undefined
  const stickerEntry = sticker ? attachments?.stickerByIndex.get(sticker.id) : undefined
  const charmDef = keychain ? attachments?.charmByIndex.get(keychain.id) : undefined

  const ref = sticker ?? keychain
  const label = kind === 'sticker' ? 'Sticker' : 'Charm'
  const name = stickerEntry?.name ?? charmDef?.name ?? (ref ? `${label} #${ref.id}` : label)
  const dbRarity = ref ? (kind === 'sticker' ? images.stickerRarity(ref.id) : images.charmRarity(ref.id)) : undefined
  const rarity = rarityOf(link.rarity || dbRarity, stickerEntry?.rarity ?? charmDef?.rarity) ?? null
  const known = kind === 'sticker' ? !!stickerEntry : !!charmDef
  const problem = !attachments ? undefined
    : !ref ? `This ${label.toLowerCase()} link has no ${label.toLowerCase()} in it.`
      : !known ? `Unknown ${label.toLowerCase()} (${kind === 'sticker' ? 'kit' : 'definition'} ${ref.id}).`
        : undefined

  return {
    kind,
    title: name,
    weapon: label,
    finish: name,
    image: ref ? (kind === 'sticker' ? images.sticker(ref.id) : images.charm(ref.id)) : undefined,
    rarity,
    rarityLabel: rarity ? rarityName(rarity, 'other') : null,
    color: getColorByRarity(rarity) ?? GREY,
    ...EMPTY_DETAILS,
    problem,
    nameTag: link.customname || undefined,
    charm: keychain ? previewCharm(keychain, attachments, images) : null,
  }
}

/**
 * An agent (its item definition index is the db's agents key): its name and faction, image, rarity and patches (the
 * link's `stickers`, named and pictured from the db's patches).
 */
function agentPreview(link: InspectItem, agents: AgentIndex | null, agent: AgentIndex['agents'][number] | undefined, images: DbImages): InspectPreview {
  const fullName = images.agentName(link.defindex) ?? agent?.name ?? `Agent #${link.defindex}`
  const [name, faction] = fullName.split(' | ')
  const rarity = rarityOf(link.rarity || images.agentRarity(link.defindex), agent?.rarity) ?? null
  const patches = [...link.stickers].sort((a, b) => a.slot - b.slot).map((s): PreviewSticker => {
    const patchName = images.patchName(s.id)
    return { slot: s.slot, name: patchName?.replace(/^Patch \| /, '') ?? `Patch #${s.id}`, image: images.patch(s.id), wear: 0, known: !!patchName }
  })
  return {
    ...EMPTY_DETAILS,
    kind: 'agent',
    title: fullName,
    weapon: faction ?? 'Agent',
    finish: name,
    image: images.agent(link.defindex),
    rarity,
    rarityLabel: rarity ? rarityName(rarity, 'agent') : null,
    color: getColorByRarity(rarity) ?? GREY,
    problem: agents && !agent ? `Unknown agent (definition ${link.defindex}).` : undefined,
    nameTag: link.customname || undefined,
    stickers: patches,
  }
}
