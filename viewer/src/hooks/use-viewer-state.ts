import { useCallback, useMemo } from 'react'
import { useLiveSearchParams, type Patch } from '@/hooks/use-live-search-params'
import { useLoadout, type Loadout } from '@/hooks/use-loadout'
import { SEED_MAX } from '@/lib/config'
import { agentPatchesFromParam, agentPatchesToParam, numberParam, stickersFromParam, stickersToParam } from '@/lib/url-state'
import type { AgentPatch } from '@/lib/viewer/agent-patches'
import type { CharmOptions, StickerOptions } from '@/lib/viewer/skin-viewer'

export type { Loadout }

export interface CharmState {
  id: string | null
  seed: number
  offset: [number, number]
  position: [number, number, number] | null
  sticker: string | null
}

export interface ViewerState {
  float: number | null
  seed: number
  firstPerson: boolean
  gloves: string | null
  /** The agent whose arms first person shows (an agent item id), or the default. */
  agent: string | null
  stickers: StickerOptions[]
  charm: CharmState
  stickerWear: number
  /** A sticker shown on its own: on the game's inspect card (the grey backing it sits on). */
  stickerCard: boolean
  /** On an agent's page: the patch worn in each of its slots. */
  agentPatches: (AgentPatch | null)[]
  /** On a pet's page: its colour (an index into the model's variants) and the animation clip it plays (null: the default idle). */
  petVariant: number
  petClip: string | null
}

export interface ViewerStateApi extends ViewerState {
  /** Writes search params in place (a value of null removes the param). */
  patch: (changes: Patch) => void
  /** The current search params, including changes not yet written to the URL. */
  search: string
  setFloat: (value: number) => void
  setSeed: (value: number) => void
  setFirstPerson: (on: boolean) => void
  setGloves: (key: string | null) => void
  setAgent: (id: string | null) => void
  setStickers: (list: StickerOptions[]) => void
  setCharm: (changes: Partial<CharmState>) => void
  setStickerWear: (value: number) => void
  setStickerCard: (on: boolean) => void
  /** Wears `patch` in `slot` (null: takes it off). */
  setAgentPatch: (slot: number, patch: AgentPatch | null) => void
  setPetVariant: (index: number) => void
  setPetClip: (name: string | null) => void
  charmOptions: CharmOptions | null
  /** The shared loadout (agent, gloves, the weapon an agent holds), kept in storage. */
  loadout: Loadout
  updateLoadout: (changes: Partial<Loadout>) => void
}

/**
 * The viewer's state as search params, so every view is a shareable link (and the shared loadout, in storage).
 * @param persistLoadout false: the loadout lives in memory only (the embed)
 */
export function useViewerState(persistLoadout = true): ViewerStateApi {
  const [params, patch] = useLiveSearchParams()
  const [loadout, updateLoadout] = useLoadout(persistLoadout)

  const floatParam = params.get('float')
  const state = useMemo<ViewerState>(() => ({
    float: floatParam === null ? null : Number(floatParam),
    seed: Math.max(1, Math.min(SEED_MAX, Math.round(numberParam(params, 'seed', 1)) || 1)),
    firstPerson: params.get('fp') === '1',
    gloves: params.has('fpg') ? params.get('fpg') : loadout.gloves,
    agent: params.has('fpa') ? params.get('fpa') : loadout.agent,
    stickers: stickersFromParam(params.get('st')),
    charm: {
      id: params.get('charm'),
      seed: numberParam(params, 'cseed', 0),
      offset: [numberParam(params, 'cx', 0), numberParam(params, 'cz', 0)],
      position: params.has('cpx') ? [numberParam(params, 'cpx', 0), numberParam(params, 'cpy', 0), numberParam(params, 'cpz', 0)] : null,
      sticker: params.get('cst'),
    },
    stickerWear: numberParam(params, 'swear', 0),
    stickerCard: params.get('card') === '1',
    agentPatches: agentPatchesFromParam(params.get('ap')),
    petVariant: Math.max(0, Math.round(numberParam(params, 'pv', 0)) || 0),
    petClip: params.get('pc'),
  }), [params, floatParam, loadout.gloves, loadout.agent])

  const { id, seed: charmSeed, offset, position, sticker } = state.charm
  const [offsetX, offsetZ] = offset
  const positionKey = position?.join(',') ?? ''
  const charmOptions = useMemo<CharmOptions | null>(
    () => (id ? { id, seed: charmSeed, offset: [offsetX, offsetZ], position: positionKey ? (positionKey.split(',').map(Number) as [number, number, number]) : null, sticker } : null),
    [id, charmSeed, offsetX, offsetZ, positionKey, sticker],
  )

  const setCharm = useCallback((changes: Partial<CharmState>) => {
    const out: Patch = {}
    if ('id' in changes) out.charm = changes.id ?? null
    if ('seed' in changes) out.cseed = changes.seed || null
    if ('offset' in changes) {
      out.cx = changes.offset![0] || null
      out.cz = changes.offset![1] || null
    }
    if ('position' in changes) {
      const p = changes.position
      out.cpx = p ? +p[0].toFixed(4) : null
      out.cpy = p ? +p[1].toFixed(4) : null
      out.cpz = p ? +p[2].toFixed(4) : null
    }
    if ('sticker' in changes) out.cst = changes.sticker ?? null
    patch(out)
  }, [patch])

  return {
    ...state,
    patch,
    search: params.toString(),
    setFloat: (value) => patch({ float: value.toFixed(4) }),
    setSeed: (value) => patch({ seed: value }),
    setFirstPerson: (on) => patch({ fp: on ? 1 : null }),
    setGloves: (key) => { updateLoadout({ gloves: key }); patch({ fpg: key }) },
    setAgent: (id) => { updateLoadout({ agent: id }); patch({ fpa: id }) },
    loadout,
    updateLoadout,
    setStickers: (list) => patch({ st: list.length ? stickersToParam(list) : null }),
    setCharm,
    setStickerWear: (value) => patch({ swear: value || null }),
    setStickerCard: (on) => patch({ card: on ? 1 : null }),
    setAgentPatch: (slot, worn) => {
      const list = agentPatchesFromParam(params.get('ap'))
      list[slot] = worn
      patch({ ap: agentPatchesToParam(list) || null })
    },
    setPetVariant: (index) => patch({ pv: index || null }),
    setPetClip: (name) => patch({ pc: name }),
    charmOptions,
  }
}
