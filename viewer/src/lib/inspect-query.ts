import { decodeInspectLink, type InspectItem } from '@/lib/data/inspect'

/** Whether a search text is meant as an inspect link: a steam:// link, anything naming csgo_econ_action_preview, or the bare hex. */
export const looksLikeInspectLink = (text: string): boolean => /^steam:\/\//i.test(text) || /csgo_econ_action_preview/i.test(text) || /^[0-9a-f]{40,}$/i.test(text)

/** An inspect link's decoded item, or why it can't be read. */
export function parseInspectQuery(text: string): { item: InspectItem; error?: undefined } | { item?: undefined; error: string } {
  try {
    return { item: decodeInspectLink(text) }
  } catch (e) {
    return { error: (e as Error).message }
  }
}
