import { useCallback, type Dispatch, type SetStateAction } from 'react'
import type { ViewerStateApi } from '@/hooks/use-viewer-state'
import type { ViewOptions } from '@/hooks/use-viewer-sync'
import { SEED_MAX } from '@/lib/config'
import { CHARM_PATTERN_MAX } from '@/lib/data/attachments'
import type { EmbedOptions } from '@/lib/embed'
import { agentPatchesFromParam, agentPatchesToParam } from '@/lib/url-state'
import type { Lighting, Viewmodel } from '@/lib/viewer/viewer-options'

interface Setters {
  setLighting: Dispatch<SetStateAction<Lighting>>
  setViewmodel: Dispatch<SetStateAction<Viewmodel>>
  setView: Dispatch<SetStateAction<ViewOptions>>
}

export function useEmbedOptions(state: ViewerStateApi, { setLighting, setViewmodel, setView }: Setters): (options: EmbedOptions) => void {
  return useCallback((o: EmbedOptions) => {
    const patch: Record<string, string | number | null> = {}
    if (o.float !== undefined) patch.float = o.float.toFixed(4)
    if (o.seed !== undefined) patch.seed = o.seed
    if (o.view !== undefined) patch.fp = o.view === 'fpv' ? 1 : null
    if (o.loadout_gloves !== undefined) patch.fpg = o.loadout_gloves || null
    if (o.loadout_agent !== undefined) patch.fpa = o.loadout_agent || null
    if (o.agent_patches !== undefined) patch.ap = agentPatchesToParam(agentPatchesFromParam(o.agent_patches)) || null
    if (o.sticker_card !== undefined) patch.card = o.sticker_card ? 1 : null
    if (o.pet_color !== undefined) patch.pv = Math.max(0, Math.round(o.pet_color)) || null
    if (o.pet_animation !== undefined) patch.pc = o.pet_animation || null
    if (Object.keys(patch).length) state.patch(patch)
    if (o.map !== undefined) setLighting((l) => ({ ...l, map: o.map && o.map !== 'studio' ? o.map : null }))
    const gloveFloat = o.loadout_gloves_float, gloveSeed = o.loadout_gloves_seed
    if (gloveFloat !== undefined || gloveSeed !== undefined) {
      setViewmodel((v) => ({ ...v, ...(gloveFloat !== undefined && { gloveFloat }), ...(gloveSeed !== undefined && { gloveSeed }) }))
    }
    if (o.viewmodel_sway !== undefined) setViewmodel((v) => ({ ...v, sway: o.viewmodel_sway! }))
    if (o.viewmodel_left_hand !== undefined) setViewmodel((v) => ({ ...v, leftHanded: o.viewmodel_left_hand! }))
    if (o.auto_rotate !== undefined) setView((v) => ({ ...v, spin: o.auto_rotate! }))
    if (o.knife_pose !== undefined) setView((v) => ({ ...v, knifePose: o.knife_pose!, back: o.side === undefined ? false : v.back }))
    if (o.side !== undefined) setView((v) => ({ ...v, back: o.side === 'back' }))
    if (o.sticker_wear !== undefined) state.setStickerWear(Math.max(0, Math.min(1, o.sticker_wear)))
    if (o.charm_pattern !== undefined) state.setCharm({ seed: Math.max(0, Math.min(CHARM_PATTERN_MAX, Math.round(o.charm_pattern))) })
    const weapon = o.loadout_weapon, weaponFloat = o.loadout_weapon_float, weaponSeed = o.loadout_weapon_seed
    if (weapon !== undefined || weaponFloat !== undefined || weaponSeed !== undefined) {
      state.updateLoadout({
        ...(weapon !== undefined && { weapon: weapon || null }),
        ...(weaponFloat !== undefined && { weaponFloat }),
        ...(weaponSeed !== undefined && { weaponSeed: Math.max(1, Math.min(SEED_MAX, Math.round(weaponSeed))) }),
      })
    }
  }, [state, setLighting, setViewmodel, setView])
}
