/** In-game rarity (the db's `rarity` and inspect links' field 5) → its color. */
const COLOR_BY_RARITY: Record<number, string> = {
  7: '#e4ae39',
  6: '#eb4b4b',
  5: '#d32ce6',
  4: '#8847ff',
  3: '#4b69ff',
  2: '#5e98d9',
  1: '#b0c3d9',
}

/** In-game rarity → its weapon-skin name. */
export const RARITY_NAME: Record<number, string> = {
  7: 'Contraband',
  6: 'Covert',
  5: 'Classified',
  4: 'Restricted',
  3: 'Mil-Spec',
  2: 'Industrial Grade',
  1: 'Consumer Grade',
}

/** In-game rarity → its name for stickers, charms and other non-weapon items. */
export const OTHER_RARITY_NAME: Record<number, string> = {
  7: 'Contraband',
  6: 'Extraordinary',
  5: 'Exotic',
  4: 'Remarkable',
  3: 'High Grade',
  2: 'Industrial Grade',
  1: 'Base Grade',
}

/** In-game rarity → its name for agents. */
export const AGENT_RARITY_NAME: Record<number, string> = {
  6: 'Master',
  5: 'Superior',
  4: 'Exceptional',
  3: 'Distinguished',
}

const NAMES = { skin: RARITY_NAME, other: OTHER_RARITY_NAME, agent: AGENT_RARITY_NAME }

/**
 * A rarity's name as the game shows it for that kind of item: weapon skins (Mil-Spec … Covert), agents
 * (Distinguished … Master), or stickers, charms and patches (High Grade … Extraordinary).
 * @param rarity the rarity number
 * @param kind which naming
 */
export function rarityName(rarity: number, kind: keyof typeof NAMES): string {
  return NAMES[kind][rarity] ?? `Rarity ${rarity}`
}

/** The catalog's rarity names, as numbers. */
const RARITY_BY_NAME: Record<string, number> = {
  common: 1, uncommon: 2, rare: 3, mythical: 4, legendary: 5, ancient: 6, immortal: 7,
}

/**
 * The color of an in-game rarity (1 Consumer … 7 Contraband).
 * @param rarity the rarity number
 * @returns the color, or undefined for an unknown rarity
 */
export function getColorByRarity(rarity: number | null | undefined): string | undefined {
  return rarity == null ? undefined : COLOR_BY_RARITY[rarity]
}

/**
 * The best rarity number we have for something: the db's (game data) first, then the catalog's name.
 * @param dbRarity the db's rarity, if it has one
 * @param catalogRarity the catalog's rarity name, if any
 */
export function rarityOf(dbRarity: number | undefined, catalogRarity: string | null | undefined): number | undefined {
  return dbRarity ?? (catalogRarity ? RARITY_BY_NAME[catalogRarity] : undefined)
}

/**
 * The color to show for something: the db's rarity first, then the catalog's, then `fallback`.
 * @param dbRarity the db's rarity number, if it has one
 * @param catalogRarity the catalog's rarity name, if any
 * @param fallback when neither is known
 */
export function rarityColor(dbRarity: number | undefined, catalogRarity: string | null | undefined, fallback: string): string {
  return getColorByRarity(rarityOf(dbRarity, catalogRarity)) ?? fallback
}
