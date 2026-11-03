import type { ViewerStateApi } from '@/hooks/use-viewer-state'
import type { ViewOptions } from '@/hooks/use-viewer-sync'
import { agentPatchesToParam } from '@/lib/url-state'
import type { Lighting, Viewmodel } from '@/lib/viewer/viewer-options'
import type { EmbedItemInfo, EmbedState } from './types'

interface Snapshot {
  item: EmbedItemInfo | null
  shareUrl: string | null
  state: ViewerStateApi
  lighting: Lighting
  viewmodel: Viewmodel
  view: ViewOptions
}

export function buildEmbedState({ item, shareUrl, state, lighting, viewmodel, view }: Snapshot): EmbedState {
  return {
    item,
    share_url: shareUrl,
    float: state.float ?? undefined,
    seed: state.seed,
    view: state.firstPerson ? 'fpv' : 'orbit',
    map: lighting.map ?? 'studio',
    loadout_gloves: state.gloves ?? '',
    loadout_gloves_float: viewmodel.gloveFloat,
    loadout_gloves_seed: viewmodel.gloveSeed ?? undefined,
    loadout_agent: state.agent ?? '',
    sticker_wear: state.stickerWear,
    sticker_card: state.stickerCard,
    charm_pattern: state.charm.seed,
    loadout_weapon: state.loadout.weapon ?? '',
    loadout_weapon_float: state.loadout.weaponFloat ?? undefined,
    loadout_weapon_seed: state.loadout.weaponSeed,
    agent_patches: agentPatchesToParam(state.agentPatches),
    pet_color: state.petVariant,
    pet_animation: state.petClip ?? '',
    viewmodel_sway: viewmodel.sway,
    viewmodel_left_hand: viewmodel.leftHanded,
    auto_rotate: view.spin,
    knife_pose: view.knifePose,
    side: view.back ? 'back' : 'front',
  }
}
