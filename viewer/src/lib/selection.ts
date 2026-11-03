/** What the stage shows: a catalog skin (`item` + paint `kit`), a sticker, charm, pin, patch or pet on its own, or a whole agent. */
export type Selection =
  | { kind: 'skin'; item: string; kit: string }
  | { kind: 'sticker'; id: string }
  | { kind: 'charm'; id: string }
  | { kind: 'agent'; id: string }
  | { kind: 'pin'; id: string }
  | { kind: 'patch'; id: string }
  | { kind: 'pet'; id: string }

/**
 * The catalog key of a skin, as the picker and the viewer's items name it.
 * @param s a skin selection or any `{ item, kit }` pair
 */
export const skinKey = (s: { item: string; kit: string }): string => `${s.item}|${s.kit}`

/**
 * Splits a catalog key back into its parts.
 * @param key `item|kit`
 */
export function parseSkinKey(key: string): { item: string; kit: string } | null {
  const [item, kit] = key.split('|')
  return item && kit ? { item, kit } : null
}

/**
 * The route path that shows a selection.
 * @param s the selection
 */
export function selectionPath(s: Selection): string {
  if (s.kind === 'skin') return `/skin/${encodeURIComponent(s.item)}/${encodeURIComponent(s.kit)}`
  return `/${s.kind}/${encodeURIComponent(s.id)}`
}
