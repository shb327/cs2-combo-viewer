import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ViewerStateApi } from '@/hooks/use-viewer-state'
import { STICKER_MAX } from '@/lib/config'
import { DEFAULT_AGENT } from '@/lib/data/agents'
import type { Item } from '@/lib/data/items'
import { markupFor } from '@/lib/markup'
import type { PickerTarget } from '@/lib/picker'
import { parseSkinKey, selectionPath, skinKey, type Selection } from '@/lib/selection'

/** Search params a new selection keeps (first person, its agent and gloves, stickers and charm). */
const KEPT_PARAMS = ['ap', 'fp', 'fpg', 'fpa', 'st', 'charm', 'cseed', 'cx', 'cz', 'cpx', 'cpy', 'cpz', 'cst']

export interface PickerApi {
  /** What the open picker chooses, or null when it's closed. */
  picker: PickerTarget | null
  open: (target: PickerTarget) => void
  close: () => void
  /** Applies a pick to what the picker chooses. */
  pick: (next: Selection) => void
  /** What the picker shows as chosen. */
  current: Selection | null
  /** The only category it shows (sticker, charm, agent pickers), or the one it opens in (gloves). */
  only: 'Stickers' | 'Charms' | 'Agents' | 'Patches' | undefined
  startIn: string | undefined
}

/**
 * The item picker: one picker for everything the page lets you choose — the selection itself (navigates, keeping
 * the first-person / attachment params), first person's gloves and agent, the agent's loadout weapon, the charm,
 * its slab sticker, and the stickers (replace one, or add one in the first free slot).
 * @param setActiveSticker focuses the sticker just added
 */
export function usePicker(selection: Selection, item: Item | null, state: ViewerStateApi, setActiveSticker: (index: number) => void): PickerApi {
  const navigate = useNavigate()
  const [picker, setPicker] = useState<PickerTarget | null>(null)

  const select = useCallback((next: Selection) => {
    const kept = new URLSearchParams()
    const current = new URLSearchParams(state.search)
    for (const key of KEPT_PARAMS) if (current.has(key)) kept.set(key, current.get(key)!)
    const query = kept.toString()
    navigate(selectionPath(next) + (query ? '?' + query : ''))
  }, [navigate, state.search])

  const pick = useCallback((next: Selection) => {
    if (!picker) return
    if (picker.kind === 'selection') return select(next)
    if (next.kind === 'skin' && picker.kind === 'gloves') return state.setGloves(skinKey(next))
    if (next.kind === 'skin' && picker.kind === 'weapon') return state.updateLoadout({ weapon: skinKey(next), weaponSeed: 1, weaponFloat: null })
    if (next.kind === 'charm' && picker.kind === 'charm') return state.setCharm({ id: next.id })
    if (next.kind === 'agent' && picker.kind === 'agent') return state.setAgent(next.id)
    if (next.kind === 'patch' && picker.kind === 'patch') return state.setAgentPatch(picker.slot, { id: next.id, scale: state.agentPatches[picker.slot]?.scale ?? 1 })
    if (next.kind !== 'sticker' || picker.kind !== 'sticker') return
    if (picker.target === 'slab') return state.setCharm({ sticker: next.id })
    if (picker.target === 'add') {
      if (state.stickers.length >= STICKER_MAX) return
      const slots = Math.max(1, markupFor(item)?.stickerSlots.length ?? 1)
      const used = new Set(state.stickers.map((s) => s.slot))
      const slot = [...Array(slots).keys()].find((k) => !used.has(k)) ?? slots - 1
      setActiveSticker(state.stickers.length)
      return state.setStickers([...state.stickers, { id: next.id, slot, wear: 0, offset: [0, 0], rotation: 0, scale: 1 }])
    }
    const index = picker.target
    state.setStickers(state.stickers.map((s, k) => (k === index ? { ...s, id: next.id } : s)))
  }, [picker, select, state, item, setActiveSticker])

  const skinOf = (key: string | null): Selection | null => {
    const parts = key ? parseSkinKey(key) : null
    return parts ? { kind: 'skin', ...parts } : null
  }
  const current: Selection | null = !picker || picker.kind === 'selection' ? selection
    : picker.kind === 'sticker' ? { kind: 'sticker', id: typeof picker.target === 'number' ? state.stickers[picker.target]?.id ?? '' : picker.target === 'slab' ? state.charm.sticker ?? '' : '' }
      : picker.kind === 'charm' ? { kind: 'charm', id: state.charm.id ?? '' }
        : picker.kind === 'agent' ? { kind: 'agent', id: state.agent ?? DEFAULT_AGENT }
          : picker.kind === 'patch' ? { kind: 'patch', id: state.agentPatches[picker.slot]?.id ?? '' }
          : picker.kind === 'weapon' ? skinOf(state.loadout.weapon)
            : skinOf(state.gloves)

  return {
    picker,
    open: setPicker,
    close: () => setPicker(null),
    pick,
    current,
    only: picker?.kind === 'sticker' ? 'Stickers' : picker?.kind === 'charm' ? 'Charms' : picker?.kind === 'agent' ? 'Agents' : picker?.kind === 'patch' ? 'Patches' : undefined,
    startIn: picker?.kind === 'gloves' ? 'Gloves' : undefined,
  }
}
