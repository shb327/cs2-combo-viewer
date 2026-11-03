import { useCallback, useEffect } from 'react'
import { useKeyShortcut } from '@/hooks/use-key-shortcut'
import type { LoadStatus } from '@/hooks/use-skin-loader'
import type { Item } from '@/lib/data/items'
import type { AttackInfo } from '@/lib/data/attacks'
import type { Selection } from '@/lib/selection'
import type { SkinViewer } from '@/lib/viewer/skin-viewer'

export interface InspectActions {
  /** The first-person weapon has an inspect animation (F). */
  canInspect: boolean
  inspect: () => void
  /** The gloves can be looked at (G): first person with skin gloves, or a glove skin's page. */
  canInspectGloves: boolean
  inspectGloves: () => void
  /** The first-person weapon's attack animations (Space plays the plain fire). */
  attacks: AttackInfo[]
  attack: (name?: string) => void
}

const EMPTY: AttackInfo[] = []

/** The stage's inspect actions (the weapon's, the gloves' look) and their keys. */
export function useInspectActions(viewer: SkinViewer | null, selection: Selection, item: Item | null, status: LoadStatus, firstPerson: boolean, agent: string | null): InspectActions {
  const ready = status === 'ready'
  const canInspect = firstPerson && ready && !!viewer?.canInspect
  const onGlovePage = selection.kind === 'skin' && item?.style === 'glove'
  const canInspectGloves = ready && ((firstPerson && !!viewer?.canInspectGloves) || onGlovePage)

  const attacks = firstPerson && ready && viewer ? viewer.attacks : EMPTY
  const attack = useCallback((name?: string) => void viewer?.attack(name), [viewer])
  const inspect = useCallback(() => viewer?.inspect(), [viewer])
  /** First person with skin gloves looks at them; a glove skin's page shows them on the arms, looked at. */
  const inspectGloves = useCallback(() => {
    if (onGlovePage) void viewer?.lookAtGloves(agent ?? undefined)
    else viewer?.inspectGloves()
  }, [onGlovePage, viewer, agent])

  useKeyShortcut('f', canInspect, inspect)
  useKeyShortcut('g', canInspectGloves, inspectGloves)
  /** Space holds fire like the mouse: a shot on press (not on key repeat), the automatic weapons keep firing until it is released. */
  const canFire = attacks.length > 0
  useEffect(() => {
    if (!canFire || !viewer) return
    const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement | null)?.closest('input, textarea, select, button, a, [contenteditable]')
    const down = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.ctrlKey || e.metaKey || e.altKey || typing(e)) return
      e.preventDefault()
      if (!e.repeat) viewer.startFire()
    }
    const up = (e: KeyboardEvent) => { if (e.key === ' ') viewer.stopFire() }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); viewer.stopFire() }
  }, [canFire, viewer])
  return { canInspect, inspect, canInspectGloves, inspectGloves, attacks, attack }
}
