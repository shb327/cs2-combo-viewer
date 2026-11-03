import type { Selection } from '@/lib/selection'

export const EMBED_PREFIX = 'cs3d:'
export const EMBED_VERSION = 1

export type EmbedTarget =
  | { inspect: string }
  | { def: number; paint: number }
  | { skin: string }
  | { sticker: string }
  | { charm: string }
  | { character: string }
  | { pin: string }
  | { patch: string }
  | { pet: string }

export interface EmbedOptions {
  float?: number
  seed?: number
  view?: 'orbit' | 'fpv'
  map?: string
  loadout_gloves?: string
  loadout_gloves_float?: number
  loadout_gloves_seed?: number
  loadout_agent?: string
  viewmodel_sway?: boolean
  viewmodel_left_hand?: boolean
  knife_pose?: 'vertical' | 'horizontal' | 'tilted'
  side?: 'front' | 'back'
  auto_rotate?: boolean
  sticker_wear?: number
  /** A sticker shown on its own: on its inspect card. */
  sticker_card?: boolean
  charm_pattern?: number
  loadout_weapon?: string
  loadout_weapon_float?: number
  loadout_weapon_seed?: number
  /** An agent's patches: `id~size`, comma-separated, one entry per slot (empty = none). */
  agent_patches?: string
  /** A pet's colour: its index among the model's colours (0 = the first). */
  pet_color?: number
  /** The clip a pet plays (`chick_trick05`; empty = its default idle). */
  pet_animation?: string
}

export type EmbedCommand =
  | { type: 'cs3d:load'; target: EmbedTarget; options?: EmbedOptions }
  | { type: 'cs3d:set'; options: EmbedOptions }
  | { type: 'cs3d:setMap'; map: string }
  | { type: 'cs3d:inspect' }
  | { type: 'cs3d:inspectGloves' }
  | { type: 'cs3d:resetView' }
  | { type: 'cs3d:screenshot'; id?: string }
  | { type: 'cs3d:screenshots'; id?: string; longSide?: number }
  | { type: 'cs3d:getState'; id?: string }
  | { type: 'cs3d:share'; id?: string }
  | { type: 'cs3d:openShare' }

export type EmbedEvent =
  | { type: 'cs3d:ready'; version: number }
  | { type: 'cs3d:loading' }
  | { type: 'cs3d:loaded'; item: EmbedItemInfo }
  | { type: 'cs3d:error'; message: string }
  | { type: 'cs3d:screenshot'; id?: string; dataUrl: string }
  | { type: 'cs3d:screenshots'; id?: string; front: Blob; back: Blob }
  | { type: 'cs3d:state'; id?: string; state: EmbedState }
  | { type: 'cs3d:share'; id?: string; url: string }
  | { type: 'cs3d:key'; key: 'Escape' }

export interface EmbedItemInfo {
  kind: Selection['kind']
  id: string
  floatMin?: number
  floatMax?: number
  canInspect: boolean
  canInspectGloves: boolean
  stickerWear?: number
  charmPattern?: number
  /** An agent's patches, as the `agent_patches` option. */
  agentPatches?: string
  /** A pet's colour (index) and the clip it plays, as the `pet_color` and `pet_animation` options. */
  petColor?: number
  petAnimation?: string
}

export interface EmbedState extends EmbedOptions {
  item: EmbedItemInfo | null
  share_url: string | null
}

export interface EmbedParams {
  target: EmbedTarget | null
  options: EmbedOptions
  stickers: string | null
  ui: boolean
  transparent: boolean
  lite: boolean
  max: boolean
}
