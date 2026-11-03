import type { DbImages } from '@/context/db-context'
import type { AgentIndex } from '@/lib/data/agents'
import type { PatchIndex } from '@/lib/data/patches'
import type { PetIndex } from '@/lib/data/pets'
import type { PinIndex } from '@/lib/data/pins'
import type { AttachmentIndex } from '@/lib/data/attachments'
import { ASSET_BASE } from '@/lib/config'
import { isPorted, styleName, VIEWER_DATA, type CatalogIndex, type CatalogSkin } from '@/lib/data/catalog'
import { rarityColor, rarityOf } from '@/lib/rarity'
import { skinKey, type Selection } from '@/lib/selection'

export type CategoryIcon = 'grid' | 'rifle' | 'target' | 'pistol' | 'knife' | 'glove' | 'cube' | 'sticker' | 'charm' | 'agent' | 'pin' | 'patch' | 'pet'

export interface PickerCategory {
  label: string
  types?: string[]
  icon: CategoryIcon
  /** An item image for the category, over the generic icon: a name in public/icons/categories, or a full URL. */
  image?: string
}

export const CATEGORIES: PickerCategory[] = [
  { label: 'All', icon: 'grid' },
  { label: 'Rifles', types: ['Rifle'], icon: 'rifle', image: 'weapon_7' },
  { label: 'Snipers', types: ['Sniper Rifle'], icon: 'target', image: 'weapon_9' },
  { label: 'Pistols', types: ['Pistol'], icon: 'pistol', image: 'weapon_1' },
  { label: 'SMGs', types: ['SMG'], icon: 'rifle', image: 'weapon_19' },
  { label: 'Heavy', types: ['Shotgun', 'Machinegun'], icon: 'rifle', image: 'weapon_35' },
  { label: 'Knives', types: ['Knife'], icon: 'knife', image: 'weapon_507' },
  { label: 'Gloves', types: ['Gloves'], icon: 'glove', image: 'weapon_5030' },
  { label: 'Zeus x27', types: ['Equipment'], icon: 'cube', image: 'weapon_31' },
  { label: 'Stickers', icon: 'sticker', image: 'sticker_crown_foil' },
  { label: 'Charms', icon: 'charm', image: 'collection_missing_link_charm_collection' },
  { label: 'Patches', icon: 'patch', image: 'https://community.fastly.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXT4BhcJo8h5hhcX0nYS-WhztecQ1xgJgxovrakJx547PvNcC9W_5LnltbZlvKiZOnVkjoH65Ili-qTodSh3gDnqEVoNmqmIoKcJFNoZwvR5BHglpDx_aDO/256fx192f' },
  { label: 'Pins', icon: 'pin', image: 'https://community.cloudflare.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXQ9Q1LO5kNoBhSQl-fROuh28rQR1R2KQFoprOrFA9vxP-GcjxH7YS1kdLSwa6na77Vk2oDsJEk2r6Vo97w3gXg-kQ_NmCmd9OSIBh-Pw8cFMO2NA' },
  { label: 'Pets', icon: 'pet', image: 'pet' },
  { label: 'Agents', icon: 'agent', image: 'https://community.steamstatic.com/economy/image/-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXA6Q1NL4kmrAlOA0_FVPCi2t_fUkRxNztUoreaLQVp7OXJYzRD4si02tHSlKatNe-GxzoB68cgiezCrYnwjFbs-hE6amjwIYKSdlM2YV6E_1WggbC4kdowLd4/256fx192f' },
]

/** Where a category's image comes from: a full URL as is, a name from public/icons/categories. */
export const categoryImageUrl = (image: string) => (/^https?:\/\//.test(image) ? image : `${import.meta.env.BASE_URL}icons/categories/${image}.png`)

export const RARITY_COLOR: Record<string, string> = {
  common: '#b0c3d9', uncommon: '#5e98d9', rare: '#4b69ff', mythical: '#8847ff', legendary: '#d32ce6', ancient: '#eb4b4b', immortal: '#e4ae39',
}

export const STICKER_KIND: Record<string, string> = { paper: 'Paper', foil: 'Foil', holo: 'Holo', glitter: 'Glitter', lenticular: 'Lenticular' }

/**
 * A sticker's finish. Lenticular stickers are told by their name ("… (Lenticular)") when the exported index
 * doesn't give them their own kind.
 * @param sticker its kind in the index and its name
 */
export function stickerKindOf(sticker: { kind: string; name: string }): string {
  return /\(lenticular\)/i.test(sticker.name) ? 'lenticular' : sticker.kind
}

/** At most this many sticker cards when browsing the category (the picker renders them a page at a time as you scroll). */
export const STICKER_CAP = Infinity

export interface PickerCard {
  key: string
  selection: Selection
  title: string
  subtitle: string
  color: string
  ported: boolean
  meta: string
  /** The market image from the db, when it has one. */
  icon?: string
  /** The in-game rarity (1 Consumer … 7 Contraband), when known: sorting and filtering by it. */
  rarity: number | null
}

export interface PickerGroup {
  title: string
  cards: PickerCard[]
}

export interface GroupFilters {
  category: string
  stickerKind: string | null
  query: string
  portedOnly: boolean
  /** Choosing a sticker, a charm or the first-person agent: only that kind is searched. */
  scope?: 'Stickers' | 'Charms' | 'Agents' | 'Pins' | 'Patches' | 'Pets'
}

/** Cards of each kind a search shows at most (a category lists them all up to the sticker cap). */
const SEARCH_CAP = 60

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9\s]/g, '')
const wordsOf = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)

type Score = (title: string, rest: string) => number

/**
 * A search matcher. Strict: every word of the query must start a word of the title or of the item's other names
 * ("die" finds "Die-cast AK" but not "Soldier", "m4 howl" finds "M4A4 | Howl"). Loose: the words only have to appear
 * inside the names, spaces and punctuation ignored ("diecast"). Better matches score higher.
 * @param query the search text
 * @param strict word starts only
 */
function matcher(query: string, strict: boolean): Score {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  return (title, rest) => {
    if (!words.length) return 1
    const t = wordsOf(title), r = wordsOf(rest)
    if (strict) {
      if (!words.every((w) => t.some((x) => x.startsWith(w)) || r.some((x) => x.startsWith(w)))) return 0
      return 1 + words.filter((w) => t.some((x) => x.startsWith(w))).length * 2 + (t[0]?.startsWith(words[0]) ? 2 : 0)
    }
    const hay = t.join('') + r.join('')
    return words.every((w) => hay.includes(w)) ? 1 : 0
  }
}

/**
 * The market name of a skin: Doppler-style finishes share one name and their kit tells the variant.
 * @param skin the catalog skin
 */
export function variantName(skin: CatalogSkin): string {
  const phase = /phase(\d)/.exec(skin.kit)
  if (phase) return `${skin.name} Phase ${phase[1]}`
  const gem = /^am_(ruby|sapphire|blackpearl|emerald)_/.exec(skin.kit)
  if (gem) return `${skin.name} ${({ ruby: 'Ruby', sapphire: 'Sapphire', blackpearl: 'Black Pearl', emerald: 'Emerald' } as Record<string, string>)[gem[1]]}`
  return skin.name
}

/**
 * A skin key's (item|kit) display name, "Item | Variant"; the key itself while the catalog hasn't it, null for none.
 * @param catalog the catalog index, once loaded
 */
export function skinDisplayName(catalog: CatalogIndex | null | undefined, key: string | null): string | null {
  if (!key) return null
  const skin = catalog?.skins.find((s) => skinKey(s) === key)
  return skin ? `${catalog!.items[skin.item].displayName} | ${variantName(skin)}` : key
}

/**
 * How many entries each category has under the current filters.
 * @param catalog the catalog index
 * @param attachments the sticker and charm index
 * @param portedOnly count only the finishes the viewer renders
 */
export function categoryCounts(catalog: CatalogIndex | null, attachments: AttachmentIndex | null, portedOnly: boolean, agents: AgentIndex | null = null, pins: PinIndex | null = null, patches: PatchIndex | null = null, pets: PetIndex | null = null): Record<string, number> {
  const out: Record<string, number> = {}
  for (const skin of catalog?.skins ?? []) {
    if (portedOnly && !isPorted(skin)) continue
    const type = catalog!.items[skin.item].type
    out.All = (out.All ?? 0) + 1
    const category = CATEGORIES.find((c) => c.types?.includes(type))
    if (category) out[category.label] = (out[category.label] ?? 0) + 1
  }
  out.Stickers = attachments?.stickers.length ?? 0
  out.Charms = attachments?.charms.length ?? 0
  out.Agents = agents?.agents.length ?? 0
  out.Pins = pins?.pins.length ?? 0
  out.Patches = patches?.patches.length ?? 0
  out.Pets = pets?.pets.length ?? 0
  return out
}

const stickerCards = (attachments: AttachmentIndex | null, filters: GroupFilters, score: Score, images: DbImages): { card: PickerCard; score: number }[] =>
  (attachments?.stickers ?? [])
    .filter((s) => !filters.stickerKind || stickerKindOf(s) === filters.stickerKind)
    .map((s) => ({ s, score: score(s.name, `${s.id} ${STICKER_KIND[stickerKindOf(s)] ?? ''}`) }))
    .filter((x) => x.score)
    .map(({ s, score }) => ({
      score,
      card: {
        key: 'sticker:' + s.id, selection: { kind: 'sticker', id: s.id }, title: s.name, subtitle: STICKER_KIND[stickerKindOf(s)] ?? s.kind,
        color: rarityColor(images.stickerRarity(s.index), s.rarity, '#b0c3d9'), ported: true, meta: s.id, icon: images.sticker(s.index),
        rarity: rarityOf(images.stickerRarity(s.index), s.rarity) ?? null,
      },
    }))

const charmCards = (attachments: AttachmentIndex | null, score: Score, images: DbImages): { card: PickerCard; score: number }[] =>
  (attachments?.charms ?? [])
    .map((c) => ({ c, score: score(c.name, c.id) }))
    .filter((x) => x.score)
    .map(({ c, score }) => ({
      score,
      card: {
        key: 'charm:' + c.id, selection: { kind: 'charm', id: c.id }, title: c.name, subtitle: 'Charm',
        color: rarityColor(images.charmRarity(c.index), c.rarity, '#8847ff'), ported: true, meta: 'Pattern 0–100000', icon: images.charm(c.index),
        rarity: rarityOf(images.charmRarity(c.index), c.rarity) ?? null,
      },
    }))

const pinCards = (pins: PinIndex | null, score: Score, images: DbImages): { card: PickerCard; score: number }[] =>
  (pins?.pins ?? [])
    .map((p) => ({ p, score: score(p.name, `${p.id} pin collectible`) }))
    .filter((x) => x.score)
    .map(({ p, score }) => ({
      score,
      card: {
        key: 'pin:' + p.id, selection: { kind: 'pin', id: p.id }, title: p.name.replace(/ Pin$/, ''), subtitle: 'Pin',
        color: rarityColor(images.pinRarity(p.index), null, '#b0c3d9'), ported: true, meta: 'Collectible', icon: images.pin(p.index),
        rarity: rarityOf(images.pinRarity(p.index), null) ?? null,
      },
    }))

const petCards = (pets: PetIndex | null, score: Score): { card: PickerCard; score: number }[] =>
  (pets?.pets ?? [])
    .map((p) => ({ p, score: score(p.name, `${p.id} pet chicken ${p.key}`) }))
    .filter((x) => x.score)
    .map(({ p, score }) => ({
      score,
      card: {
        key: 'pet:' + p.id, selection: { kind: 'pet', id: p.id }, title: p.name, subtitle: 'Pet',
        color: '#e4ae39', ported: true, meta: `${pets!.models[p.model]?.variants.length ?? 1} colours`, icon: `${ASSET_BASE}${VIEWER_DATA}pets/thumbs/pet_${p.id}.png`, rarity: null,
      },
    }))

const patchCards = (patches: PatchIndex | null, score: Score, images: DbImages): { card: PickerCard; score: number }[] =>
  (patches?.patches ?? [])
    .map((p) => ({ p, score: score(p.name, `${p.id} patch agent`) }))
    .filter((x) => x.score)
    .map(({ p, score }) => ({
      score,
      card: {
        key: 'patch:' + p.id, selection: { kind: 'patch', id: p.id }, title: p.name, subtitle: 'Patch',
        color: rarityColor(images.patchRarity(p.index) ?? p.rarity ?? undefined, null, '#b0c3d9'), ported: true, meta: 'Agent patch', icon: images.patch(p.index),
        rarity: rarityOf(images.patchRarity(p.index), null) ?? p.rarity ?? null,
      },
    }))

const TEAM_TITLE = { ct: 'Counter-Terrorists', t: 'Terrorists' } as const

const agentGroups = (agents: AgentIndex | null, score: Score, images: DbImages): { group: PickerGroup; best: number }[] =>
  (['ct', 't'] as const).flatMap((team) => {
    const cards = (agents?.agents ?? [])
      .filter((a) => a.team === team)
      .map((a) => ({ a, score: score(a.name, `${a.id} ${TEAM_TITLE[team]} agent`) }))
      .filter((x) => x.score)
      .sort((x, y) => y.score - x.score || x.a.name.localeCompare(y.a.name))
    if (!cards.length) return []
    return [{
      best: cards[0].score,
      group: {
        title: TEAM_TITLE[team],
        cards: cards.map(({ a }) => {
          const [name, faction] = a.name.split(' | ')
          return {
            key: 'agent:' + a.id, selection: { kind: 'agent', id: a.id } as Selection, title: name, subtitle: faction ?? 'Agent',
            color: rarityColor(images.agentRarity(a.index), a.rarity, '#b0c3d9'), ported: true, meta: TEAM_TITLE[team], icon: images.agent(a.index),
            rarity: rarityOf(images.agentRarity(a.index), a.rarity) ?? null,
          }
        }),
      },
    }]
  })

const skinGroups = (catalog: CatalogIndex | null, filters: GroupFilters, score: Score, anyType: boolean, images: DbImages): { group: PickerGroup; best: number }[] => {
  const types = anyType ? undefined : CATEGORIES.find((c) => c.label === filters.category)?.types
  const byItem = new Map<string, { skin: CatalogSkin; score: number }[]>()
  for (const skin of catalog?.skins ?? []) {
    const info = catalog!.items[skin.item]
    if (types && !types.includes(info.type)) continue
    if (filters.portedOnly && !isPorted(skin)) continue
    const s = score(`${info.displayName} ${variantName(skin)}`, `${skin.item} ${skin.kit} ${styleName(skin)} ${skin.rarity ?? ''}`)
    if (s) byItem.set(skin.item, [...(byItem.get(skin.item) ?? []), { skin, score: s }])
  }
  return [...byItem].map(([name, list]) => ({
    best: Math.max(...list.map((x) => x.score)),
    group: {
      title: catalog!.items[name].displayName,
      cards: list.sort((a, b) => b.score - a.score || variantName(a.skin).localeCompare(variantName(b.skin))).map(({ skin }) => ({
        key: 'skin:' + skinKey(skin), selection: { kind: 'skin', item: skin.item, kit: skin.kit }, title: variantName(skin),
        subtitle: styleName(skin) + (isPorted(skin) ? '' : ' · not ported'), color: rarityColor(images.skinRarity(catalog!.items[skin.item].defindex, skin.paintIndex), skin.rarity, '#71717a'),
        ported: isPorted(skin), meta: `${skin.floatMin}–${skin.floatMax}`, icon: images.skin(catalog!.items[skin.item].defindex, skin.paintIndex),
        rarity: rarityOf(images.skinRarity(catalog!.items[skin.item].defindex, skin.paintIndex), skin.rarity) ?? null,
      })),
    },
  }))
}

/**
 * The cards the picker shows. With a search text it looks in every category (skins, charms and stickers), whichever
 * one is selected, and the best matches come first; without it, the selected category.
 * @param catalog the catalog index
 * @param attachments the sticker and charm index
 * @param filters the category, sticker kind, search text, ported-only switch and scope
 * @param images the db's images
 * @param agents the agents index
 */
export function pickerGroups(catalog: CatalogIndex | null, attachments: AttachmentIndex | null, filters: GroupFilters, images: DbImages, agents: AgentIndex | null = null, pins: PinIndex | null = null, patches: PatchIndex | null = null, pets: PetIndex | null = null): PickerGroup[] {
  const strict = build(catalog, attachments, filters, images, true, agents, pins, patches, pets)
  return strict.length || !filters.query.trim() ? strict : build(catalog, attachments, filters, images, false, agents, pins, patches, pets)
}

function build(catalog: CatalogIndex | null, attachments: AttachmentIndex | null, filters: GroupFilters, images: DbImages, strict: boolean, agents: AgentIndex | null, pins: PinIndex | null, patches: PatchIndex | null, pets: PetIndex | null): PickerGroup[] {
  const searching = filters.query.trim().length > 0
  const score = matcher(filters.query, strict)
  const limit = <T,>(list: T[], n: number) => list.slice(0, n)
  const stickersGroup = (cap: number): { group: PickerGroup; best: number } | null => {
    const all = stickerCards(attachments, filters, score, images).sort((a, b) => b.score - a.score)
    if (!all.length) return null
    const title = all.length > cap ? `Stickers (${cap} of ${all.length}: refine the search)` : 'Stickers'
    return { group: { title, cards: limit(all, cap).map((x) => x.card) }, best: all[0].score }
  }
  const charmsGroup = (): { group: PickerGroup; best: number } | null => {
    const all = charmCards(attachments, score, images).sort((a, b) => b.score - a.score)
    return all.length ? { group: { title: 'Charms', cards: all.map((x) => x.card) }, best: all[0].score } : null
  }

  if (filters.scope === 'Stickers' || (!searching && filters.category === 'Stickers')) return [stickersGroup(STICKER_CAP)?.group].filter((g): g is PickerGroup => !!g)
  if (filters.scope === 'Charms' || (!searching && filters.category === 'Charms')) return [charmsGroup()?.group].filter((g): g is PickerGroup => !!g)
  const pinsGroup = (): { group: PickerGroup; best: number } | null => {
    const all = pinCards(pins, score, images).sort((a, b) => b.score - a.score)
    return all.length ? { group: { title: 'Pins', cards: all.map((x) => x.card) }, best: all[0].score } : null
  }

  const patchesGroup = (): { group: PickerGroup; best: number } | null => {
    const all = patchCards(patches, score, images).sort((a, b) => b.score - a.score)
    return all.length ? { group: { title: 'Patches', cards: all.map((x) => x.card) }, best: all[0].score } : null
  }

  const petsGroup = (): { group: PickerGroup; best: number } | null => {
    const all = petCards(pets, score).sort((a, b) => b.score - a.score)
    return all.length ? { group: { title: 'Pets', cards: all.map((x) => x.card) }, best: all[0].score } : null
  }

  if (filters.scope === 'Pets' || (!searching && filters.category === 'Pets')) return [petsGroup()?.group].filter((g): g is PickerGroup => !!g)
  if (filters.scope === 'Patches' || (!searching && filters.category === 'Patches')) return [patchesGroup()?.group].filter((g): g is PickerGroup => !!g)
  if (filters.scope === 'Pins' || (!searching && filters.category === 'Pins')) return [pinsGroup()?.group].filter((g): g is PickerGroup => !!g)
  if (filters.scope === 'Agents' || (!searching && filters.category === 'Agents')) return agentGroups(agents, score, images).map((x) => x.group)
  if (!searching) return skinGroups(catalog, filters, score, false, images).sort((a, b) => a.group.title.localeCompare(b.group.title)).map((x) => x.group)

  const found = [
    ...skinGroups(catalog, filters, score, true, images),
    ...agentGroups(agents, score, images),
    ...[petsGroup(), pinsGroup(), patchesGroup(), charmsGroup(), stickersGroup(SEARCH_CAP)].filter((g): g is { group: PickerGroup; best: number } => !!g),
  ]
  return found.sort((a, b) => b.best - a.best).map((x) => x.group)
}

/** Why the picker is open: to change the selection, or to choose a sticker, a charm, the first-person gloves or agent. */
/** How the picker orders cards within each group: as found (search relevance, then name), by rarity, or by name. */
export type PickerSort = 'relevance' | 'rarity' | 'rarity-asc' | 'name'

export const PICKER_SORTS: { value: PickerSort; label: string }[] = [
  { value: 'relevance', label: 'Default' },
  { value: 'rarity', label: 'Rarity, high to low' },
  { value: 'rarity-asc', label: 'Rarity, low to high' },
  { value: 'name', label: 'Name, A to Z' },
]

/** The rarities found among the groups' cards, highest first. */
export const raritiesIn = (groups: PickerGroup[]): number[] =>
  [...new Set(groups.flatMap((g) => g.cards.map((c) => c.rarity)).filter((r): r is number => r !== null))].sort((a, b) => b - a)

/**
 * The groups with only the cards of the chosen rarities (none chosen: all of them), sorted within each group; groups
 * left empty are dropped.
 * @param groups the picker's groups
 * @param sort the order within a group
 * @param rarities the rarities to keep (empty: every one)
 */
export function arrangeGroups(groups: PickerGroup[], sort: PickerSort, rarities: number[]): PickerGroup[] {
  const keep = rarities.length ? new Set(rarities) : null
  const compare: ((a: PickerCard, b: PickerCard) => number) | null =
    sort === 'rarity' ? (a, b) => (b.rarity ?? 0) - (a.rarity ?? 0) || a.title.localeCompare(b.title)
      : sort === 'rarity-asc' ? (a, b) => (a.rarity ?? 99) - (b.rarity ?? 99) || a.title.localeCompare(b.title)
        : sort === 'name' ? (a, b) => a.title.localeCompare(b.title)
          : null
  return groups.flatMap((g) => {
    let cards = keep ? g.cards.filter((c) => c.rarity !== null && keep.has(c.rarity)) : g.cards
    if (compare) cards = [...cards].sort(compare)
    return cards.length ? [{ ...g, cards }] : []
  })
}

export type PickerTarget =
  | { kind: 'selection' }
  | { kind: 'sticker'; target: number | 'add' | 'slab' }
  | { kind: 'charm' }
  | { kind: 'gloves' }
  | { kind: 'agent' }
  /** A patch for one of the agent's slots. */
  | { kind: 'patch'; slot: number }
  /** The weapon skin an agent holds (the shared loadout). */
  | { kind: 'weapon' }
