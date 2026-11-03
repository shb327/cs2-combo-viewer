import type { AgentIndex } from '@/lib/data/agents'
import type { AttachmentIndex } from '@/lib/data/attachments'
import type { CatalogIndex } from '@/lib/data/catalog'
import { decodeInspectLink, type InspectItem } from '@/lib/data/inspect'
import { resolveInspect } from '@/lib/inspect-resolve'
import type { Selection } from '@/lib/selection'
import { agentPatchesFromParam, agentPatchesToParam, PATCH_SLOTS, stickersToParam } from '@/lib/url-state'
import type { EmbedTarget } from './types'

export interface ResolvedTarget {
  selection: Selection
  float?: number
  seed?: number
  params: Record<string, string | null>
}

export function resolveTarget(target: EmbedTarget, catalog: CatalogIndex, attachments: AttachmentIndex, agents: AgentIndex | null): ResolvedTarget | string {
  if ('skin' in target) {
    const [item, kit] = target.skin.split('|')
    return item && kit ? { selection: { kind: 'skin', item, kit }, params: {} } : `Bad skin "${target.skin}": use item|kit.`
  }
  if ('sticker' in target) return { selection: { kind: 'sticker', id: target.sticker }, params: {} }
  if ('charm' in target) return { selection: { kind: 'charm', id: target.charm }, params: {} }
  if ('character' in target) return { selection: { kind: 'agent', id: target.character }, params: {} }
  if ('pin' in target) return { selection: { kind: 'pin', id: target.pin }, params: {} }
  if ('patch' in target) return { selection: { kind: 'patch', id: target.patch }, params: {} }
  if ('pet' in target) return { selection: { kind: 'pet', id: target.pet }, params: {} }
  let link: InspectItem
  if ('inspect' in target) {
    try { link = decodeInspectLink(target.inspect) } catch (e) { return (e as Error).message }
  } else {
    link = { defindex: target.def, paintindex: target.paint, paintwear: 0, paintseed: 0, stickers: [], keychains: [] }
  }
  const r = resolveInspect(link, catalog, attachments, agents)
  if (typeof r === 'string') return r
  if (r.kind === 'agent') {
    /** The link's patches, one per slot. */
    const worn = agentPatchesFromParam(null)
    for (const s of link.stickers) if (s.slot >= 0 && s.slot < PATCH_SLOTS) worn[s.slot] = { id: String(s.id), scale: s.scale && s.scale > 0 ? s.scale : 1 }
    return { selection: { kind: 'agent', id: r.id }, params: { ap: agentPatchesToParam(worn) || null } }
  }
  if (r.kind === 'sticker') return { selection: { kind: 'sticker', id: r.id }, params: { swear: r.wear ? String(+r.wear.toFixed(3)) : null } }
  if (r.kind === 'charm') return { selection: { kind: 'charm', id: r.id }, seed: r.seed, params: { cseed: r.seed ? String(r.seed) : null, cst: r.sticker } }
  const fromLink = 'inspect' in target
  const { id, seed, offset, position, sticker } = r.charm
  return {
    selection: { kind: 'skin', item: r.item, kit: r.kit },
    float: fromLink ? r.float : undefined,
    seed: fromLink ? Math.max(1, Math.round(r.seed) || 1) : undefined,
    params: {
      st: r.stickers.length ? stickersToParam(r.stickers) : null,
      charm: id ?? null,
      cseed: id && seed ? String(seed) : null,
      cx: id && offset?.[0] ? String(offset[0]) : null,
      cz: id && offset?.[1] ? String(offset[1]) : null,
      cpx: id && position ? position[0].toFixed(4) : null,
      cpy: id && position ? position[1].toFixed(4) : null,
      cpz: id && position ? position[2].toFixed(4) : null,
      cst: id ? sticker ?? null : null,
    },
  }
}
