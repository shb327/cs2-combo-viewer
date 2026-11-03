import { useEffect, useRef, useState } from 'react'
import { ASSET_BASE, DEFAULT_FLOAT } from '@/lib/config'
import { catalogItem, loadItemData, loadKitData } from '@/lib/data/catalog'
import type { GloveItem, Item } from '@/lib/data/items'
import { parseSkinKey, type Selection } from '@/lib/selection'
import { agentPatchesToParam } from '@/lib/url-state'
import { clampFloat } from '@/lib/wear'
import type { SkinViewer } from '@/lib/viewer/skin-viewer'
import type { ViewerStateApi } from '@/hooks/use-viewer-state'

export type LoadStatus = 'loading' | 'ready' | 'error'

export interface SkinLoad {
  item: Item | null
  /** On an agent's page: the loadout's weapon it holds. */
  weapon: Item | null
  status: LoadStatus
  error: string
}

/**
 * Loads what the selection names into the viewer: a skin (optionally in first person, with the chosen agent's arms),
 * a sticker, charm or pin on its own, or a whole agent.
 * @param viewer the 3D viewer
 * @param selection what to show
 * @param state the URL state, read once per load for the wear and pattern
 */
export function useSkinLoader(viewer: SkinViewer | null, selection: Selection, state: ViewerStateApi): SkinLoad {
  const [load, setLoad] = useState<SkinLoad>({ item: null, weapon: null, status: 'loading', error: '' })
  const latest = useRef(state)
  latest.current = state

  const key = selection.kind === 'skin' ? `skin:${selection.item}|${selection.kit}` : `${selection.kind}:${selection.id}`
  const firstPerson = state.firstPerson
  // The loadout's gloves and agent are drawn in first person (gloves also on an agent's page): elsewhere a change of
  // them must not reload the model.
  const gloves = firstPerson || selection.kind === 'agent' ? state.gloves : null
  const agent = firstPerson ? state.agent : null
  const loadoutWeapon = selection.kind === 'agent' ? state.loadout.weapon : null
  const patchParam = selection.kind === 'agent' || firstPerson ? agentPatchesToParam(state.agentPatches) : ''

  useEffect(() => {
    if (!viewer) return
    let cancelled = false
    setLoad((prev) => ({ ...prev, status: 'loading', error: '' }))

    let held: Item | null = null
    const job = async (): Promise<Item | null> => {
      const now = latest.current
      if (selection.kind === 'sticker') {
        await viewer.showSticker(selection.id, now.stickerWear)
        return null
      }
      if (selection.kind === 'agent') {
        /** The agent wears the gloves picked for first person (kept across visits). */
        const [glove, weapon] = await Promise.all([gloves ? loadGlove(gloves) : null, loadWeaponSkin(now.loadout.weapon, now.loadout.weaponSeed)])
        if (cancelled) return null
        await viewer.showAgent(selection.id, glove, weapon)
        if (cancelled) return null
        if (weapon) viewer.setAgentWeapon(now.loadout.weaponSeed, clampFloat(weapon, now.loadout.weaponFloat ?? DEFAULT_FLOAT))
        /** The agent seen is first person's agent too. */
        if (now.loadout.agent !== selection.id) now.updateLoadout({ agent: selection.id })
        held = weapon
        return null
      }
      if (selection.kind === 'patch') {
        await viewer.showPatch(selection.id)
        return null
      }
      if (selection.kind === 'pet') {
        await viewer.showPet(selection.id, now.petVariant, now.petClip)
        return null
      }
      if (selection.kind === 'pin') {
        await viewer.showPin(selection.id)
        return null
      }
      if (selection.kind === 'charm') {
        await viewer.showCharm(selection.id, now.charm.seed, now.charm.sticker)
        return null
      }
      const glove = firstPerson && gloves ? await loadGlove(gloves) : null
      const [itemData, kitData] = await Promise.all([loadItemData(ASSET_BASE, selection.item), loadKitData(ASSET_BASE, selection.kit)])
      if (cancelled) return null
      const item = catalogItem(itemData, kitData, now.seed)
      if (item.style !== 'glove') now.updateLoadout({ weapon: `${selection.item}|${selection.kit}`, weaponSeed: now.seed, weaponFloat: now.float })
      await (firstPerson ? viewer.loadFirstPerson(item, glove, agent ?? undefined) : viewer.load(item))
      if (cancelled) return null
      viewer.setFloat(clampFloat(item, now.float ?? DEFAULT_FLOAT))
      viewer.setSeed(now.seed)
      return item
    }

    job()
      .then((item) => {
        if (!cancelled) setLoad({ item, weapon: held, status: 'ready', error: '' })
      })
      .catch((e: Error) => {
        if (!cancelled) setLoad((prev) => ({ ...prev, status: 'error', error: e.message }))
      })
    return () => { cancelled = true }
  }, [viewer, key, firstPerson, gloves, agent, selection, loadoutWeapon])

  // A pet's colour and animation change in place too.
  const { petVariant, petClip } = state
  useEffect(() => {
    if (viewer && selection.kind === 'pet') viewer.setPetVariant(petVariant)
  }, [viewer, selection.kind, petVariant])
  useEffect(() => {
    if (viewer && selection.kind === 'pet') void viewer.playPetClip(petClip)
  }, [viewer, selection.kind, petClip])

  // The patches an agent wears change in place: no reload of the model.
  useEffect(() => {
    if (viewer && (selection.kind === 'agent' || firstPerson)) void viewer.setAgentPatches(latest.current.agentPatches)
  }, [viewer, selection.kind, firstPerson, patchParam])

  return load
}

/** The weapon skin an agent holds: the last one seen (item|kit), or none. */
async function loadWeaponSkin(key: string | null, seed: number): Promise<Item | null> {
  const parts = key ? parseSkinKey(key) : null
  if (!parts) return null
  try {
    const [itemData, kitData] = await Promise.all([loadItemData(ASSET_BASE, parts.item), loadKitData(ASSET_BASE, parts.kit)])
    const item = catalogItem(itemData, kitData, seed)
    return item.style === 'glove' ? null : item
  } catch {
    return null
  }
}

async function loadGlove(key: string): Promise<GloveItem | null> {
  const parts = parseSkinKey(key)
  if (!parts) return null
  const [itemData, kitData] = await Promise.all([loadItemData(ASSET_BASE, parts.item), loadKitData(ASSET_BASE, parts.kit)])
  return catalogItem(itemData, kitData, 1) as GloveItem
}
