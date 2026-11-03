import { useCallback, useState } from 'react'

const LOADOUT_KEY = 'loadout-v1'

/**
 * One loadout shared by first person and the agent view, kept across visits: the agent and gloves (a link's own
 * fpa / fpg win over them) and the weapon skin an agent holds, with its pattern and float (the last skin seen, or
 * the one picked on an agent's page).
 */
export interface Loadout {
  gloves: string | null
  agent: string | null
  weapon: string | null
  weaponSeed: number
  weaponFloat: number | null
}

const EMPTY: Loadout = { gloves: null, agent: null, weapon: null, weaponSeed: 1, weaponFloat: null }

function storedLoadout(): Loadout {
  try {
    const raw = localStorage.getItem(LOADOUT_KEY)
    const v = raw ? (JSON.parse(raw) as Partial<Loadout>) : {}
    return { gloves: v.gloves ?? null, agent: v.agent ?? null, weapon: v.weapon ?? null, weaponSeed: v.weaponSeed ?? 1, weaponFloat: v.weaponFloat ?? null }
  } catch {
    return { ...EMPTY }
  }
}

function storeLoadout(changes: Partial<Loadout>): void {
  try {
    localStorage.setItem(LOADOUT_KEY, JSON.stringify({ ...storedLoadout(), ...changes }))
  } catch {
    /** Storage can be off (private windows): the choice then lasts as long as the URL. */
  }
}

/**
 * The shared loadout, kept in storage.
 * @param persist false: a loadout of its own, in memory, that starts empty (the embed)
 */
export function useLoadout(persist = true): [Loadout, (changes: Partial<Loadout>) => void] {
  const [loadout, setLoadout] = useState<Loadout>(() => (persist ? storedLoadout() : { ...EMPTY }))
  const updateLoadout = useCallback((changes: Partial<Loadout>) => {
    if (persist) storeLoadout(changes)
    setLoadout((prev) => ({ ...prev, ...changes }))
  }, [persist])
  return [loadout, updateLoadout]
}
