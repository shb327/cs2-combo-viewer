import { STICKER_MAX } from '@/lib/config'
import type { AgentPatch } from '@/lib/viewer/agent-patches'
import type { StickerOptions } from '@/lib/viewer/skin-viewer'

/**
 * Reads a numeric search param.
 * @param params the search params
 * @param key the param name
 * @param fallback the value when it is missing or not a number
 */
export function numberParam(params: URLSearchParams, key: string, fallback: number): number {
  const raw = params.get(key)
  if (raw === null || raw === '') return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

/**
 * Stickers as `id~slot~wear~x~y~rotation~scale,…`.
 * @param list the weapon's stickers
 */
export function stickersToParam(list: StickerOptions[]): string {
  return list
    .map((o) => [o.id, o.slot, +o.wear.toFixed(3), +o.offset[0].toFixed(4), +o.offset[1].toFixed(4), +o.rotation.toFixed(1), +(o.scale ?? 1).toFixed(3)].join('~'))
    .join(',')
}

/**
 * Parses the `st` search param.
 * @param value the param's value, if any
 */
export function stickersFromParam(value: string | null): StickerOptions[] {
  if (!value) return []
  return value
    .split(',')
    .filter(Boolean)
    .slice(0, STICKER_MAX)
    .map((entry) => {
      const [id, slot, wear, x, y, rotation, scale] = entry.split('~')
      return { id, slot: Number(slot) || 0, wear: Number(wear) || 0, offset: [Number(x) || 0, Number(y) || 0], rotation: Number(rotation) || 0, scale: Number(scale) || 1 }
    })
}

/** An agent has this many patch slots. */
export const PATCH_SLOTS = 3

/**
 * An agent's patches as `id~scale,…`, one entry per slot (an empty entry is an empty slot).
 * @param list the patch in each slot
 */
export function agentPatchesToParam(list: (AgentPatch | null)[]): string {
  const entries = Array.from({ length: PATCH_SLOTS }, (_, i) => (list[i] ? `${list[i]!.id}~${+list[i]!.scale.toFixed(3)}` : ''))
  while (entries.length && !entries[entries.length - 1]) entries.pop()
  return entries.join(',')
}

/**
 * Parses the `ap` search param.
 * @param value the param's value, if any
 */
export function agentPatchesFromParam(value: string | null): (AgentPatch | null)[] {
  const entries = (value ?? '').split(',')
  return Array.from({ length: PATCH_SLOTS }, (_, i) => {
    const [id, scale] = (entries[i] ?? '').split('~')
    return id ? { id, scale: Number(scale) > 0 ? Number(scale) : 1 } : null
  })
}
