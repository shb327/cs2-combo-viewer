import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { LoadStatus } from '@/hooks/use-skin-loader'
import type { ViewerStateApi } from '@/hooks/use-viewer-state'
import { DEFAULT_FLOAT } from '@/lib/config'
import type { CatalogIndex } from '@/lib/data/catalog'
import type { Item } from '@/lib/data/items'
import { skinDisplayName } from '@/lib/picker'
import { parseSkinKey, selectionPath, type Selection } from '@/lib/selection'
import type { SkinViewer } from '@/lib/viewer/skin-viewer'
import { clampFloat } from '@/lib/wear'

export interface LoadoutView {
  /** The loadout weapon's display name. */
  weaponName: string | null
  /** On an agent's page: opens the loadout weapon in first person with this agent and the loadout gloves. */
  openFirstPerson: (() => void) | null
}

/**
 * Keeps the shared loadout and the page in step: a weapon skin's pattern and float, as seen, become the loadout's
 * (what agents hold, first person shares), and on an agent's page the loadout's reach the weapon it holds as they
 * change.
 * @param held on an agent's page, the loadout weapon it holds (loaded)
 */
export function useLoadoutSync(viewer: SkinViewer | null, selection: Selection, item: Item | null, held: Item | null, status: LoadStatus, state: ViewerStateApi, catalog: CatalogIndex | null | undefined): LoadoutView {
  const navigate = useNavigate()
  const { loadout, updateLoadout, seed, float, gloves } = state

  useEffect(() => {
    if (selection.kind !== 'skin' || !item || item.style === 'glove' || status !== 'ready') return
    const key = `${selection.item}|${selection.kit}`
    if (loadout.weapon !== key || loadout.weaponSeed !== seed || loadout.weaponFloat !== float) {
      updateLoadout({ weapon: key, weaponSeed: seed, weaponFloat: float })
    }
  }, [selection, item, status, seed, float, loadout.weapon, loadout.weaponSeed, loadout.weaponFloat, updateLoadout])

  useEffect(() => {
    if (selection.kind !== 'agent' || !held || status !== 'ready') return
    viewer?.setAgentWeapon(loadout.weaponSeed, clampFloat(held, loadout.weaponFloat ?? DEFAULT_FLOAT))
  }, [viewer, selection, held, status, loadout.weaponSeed, loadout.weaponFloat])

  const weaponName = useMemo(() => skinDisplayName(catalog, loadout.weapon), [catalog, loadout.weapon])
  const target = selection.kind === 'agent' && loadout.weapon ? parseSkinKey(loadout.weapon) : null
  const openFirstPerson = target && selection.kind === 'agent'
    ? () => {
      const params = new URLSearchParams({ fp: '1', fpa: selection.id, seed: String(loadout.weaponSeed) })
      if (loadout.weaponFloat !== null) params.set('float', loadout.weaponFloat.toFixed(4))
      if (gloves) params.set('fpg', gloves)
      navigate(selectionPath({ kind: 'skin', ...target }) + '?' + params.toString())
    }
    : null
  return { weaponName, openFirstPerson }
}
