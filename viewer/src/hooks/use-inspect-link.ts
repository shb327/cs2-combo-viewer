import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDbImages } from '@/context/db-context'
import type { AgentIndex } from '@/lib/data/agents'
import type { AttachmentIndex } from '@/lib/data/attachments'
import type { CatalogIndex } from '@/lib/data/catalog'
import type { InspectItem } from '@/lib/data/inspect'
import { resolveInspect } from '@/lib/inspect-resolve'
import { selectionPath } from '@/lib/selection'
import { agentPatchesFromParam, agentPatchesToParam, PATCH_SLOTS, stickersToParam } from '@/lib/url-state'

/**
 * Loads a decoded inspect link: resolves it against the catalog and goes to what it names — a sticker (with its
 * wear), an agent, a charm (pattern, slab sticker) or a skin (float, pattern, stickers, charm; first person and its
 * gloves kept). Returns an error message, or null once it navigated.
 * @param search the current search params (first person is kept)
 * @param onSkin called before going to a skin (the stickers start from the first one)
 */
export function useInspectLink(catalog: CatalogIndex | null, attachments: AttachmentIndex | null, agents: AgentIndex | null, search: string, onSkin: () => void): (link: InspectItem) => string | null {
  const navigate = useNavigate()
  const images = useDbImages()
  return useCallback((link: InspectItem): string | null => {
    if (!catalog || !attachments) return 'The catalog is still loading.'
    if (!agents && images.agentName(link.defindex)) return 'The agents are still loading.'
    const resolved = resolveInspect(link, catalog, attachments, agents)
    if (typeof resolved === 'string') return resolved
    if (resolved.kind === 'sticker') {
      const params = new URLSearchParams()
      if (resolved.wear) params.set('swear', String(+resolved.wear.toFixed(3)))
      navigate(`${selectionPath({ kind: 'sticker', id: resolved.id })}${params.size ? '?' + params : ''}`)
      return null
    }
    if (resolved.kind === 'agent') {
      const worn = agentPatchesFromParam(null)
      for (const s of link.stickers) if (s.slot >= 0 && s.slot < PATCH_SLOTS) worn[s.slot] = { id: String(s.id), scale: s.scale && s.scale > 0 ? s.scale : 1 }
      const ap = agentPatchesToParam(worn)
      navigate(selectionPath({ kind: 'agent', id: resolved.id }) + (ap ? '?ap=' + ap : ''))
      return null
    }
    if (resolved.kind === 'charm') {
      const params = new URLSearchParams()
      if (resolved.seed) params.set('cseed', String(resolved.seed))
      if (resolved.sticker) params.set('cst', resolved.sticker)
      navigate(`${selectionPath({ kind: 'charm', id: resolved.id })}${params.size ? '?' + params : ''}`)
      return null
    }
    const params = new URLSearchParams()
    for (const key of ['fp', 'fpg']) {
      const value = new URLSearchParams(search).get(key)
      if (value) params.set(key, value)
    }
    params.set('float', resolved.float.toFixed(4))
    params.set('seed', String(Math.max(1, Math.min(1000, Math.round(resolved.seed) || 1))))
    if (resolved.stickers.length) params.set('st', stickersToParam(resolved.stickers))
    const { id, seed, offset, position, sticker } = resolved.charm
    if (id) {
      params.set('charm', id)
      if (seed) params.set('cseed', String(seed))
      if (offset?.[0]) params.set('cx', String(offset[0]))
      if (offset?.[1]) params.set('cz', String(offset[1]))
      if (position) { params.set('cpx', position[0].toFixed(4)); params.set('cpy', position[1].toFixed(4)); params.set('cpz', position[2].toFixed(4)) }
      if (sticker) params.set('cst', sticker)
    }
    onSkin()
    navigate(`${selectionPath({ kind: 'skin', item: resolved.item, kit: resolved.kit })}?${params}`)
    if (resolved.unknownStickers.length) console.warn('Inspect link: unknown sticker ids', resolved.unknownStickers)
    return null
  }, [catalog, attachments, agents, images, search, navigate, onSkin])
}
