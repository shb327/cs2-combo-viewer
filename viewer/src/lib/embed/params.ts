import type { EmbedParams, EmbedTarget } from './types'

const num = (v: string | null): number | undefined => {
  if (v === null || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

const flag = (params: URLSearchParams, key: string): boolean | undefined => (params.has(key) ? params.get(key) !== '0' : undefined)

function targetOf(params: URLSearchParams): EmbedTarget | null {
  const def = num(params.get('def')), paint = num(params.get('paint'))
  if (params.get('inspect')) return { inspect: params.get('inspect')! }
  if (def !== undefined && paint !== undefined) return { def, paint }
  if (params.get('skin')) return { skin: params.get('skin')! }
  if (params.get('sticker')) return { sticker: params.get('sticker')! }
  if (params.get('charm')) return { charm: params.get('charm')! }
  if (params.get('character')) return { character: params.get('character')! }
  if (params.get('pin')) return { pin: params.get('pin')! }
  if (params.get('patch')) return { patch: params.get('patch')! }
  if (params.get('pet')) return { pet: params.get('pet')! }
  return null
}

export function parseEmbedParams(params: URLSearchParams): EmbedParams {
  const view = params.get('view')
  const pose = params.get('knife_pose'), side = params.get('side')
  return {
    target: targetOf(params),
    options: {
      float: num(params.get('float')),
      seed: num(params.get('seed')),
      view: view === 'fpv' || view === 'orbit' ? view : undefined,
      map: params.get('map') ?? undefined,
      loadout_gloves: params.get('loadout_gloves') ?? undefined,
      loadout_gloves_float: num(params.get('loadout_gloves_float')),
      loadout_gloves_seed: num(params.get('loadout_gloves_seed')),
      loadout_agent: params.get('loadout_agent') ?? undefined,
      viewmodel_sway: flag(params, 'viewmodel_sway'),
      viewmodel_left_hand: flag(params, 'viewmodel_left_hand'),
      knife_pose: pose === 'vertical' || pose === 'horizontal' || pose === 'tilted' ? pose : undefined,
      side: side === 'front' || side === 'back' ? side : undefined,
      auto_rotate: flag(params, 'auto_rotate'),
      sticker_wear: num(params.get('sticker_wear')),
      sticker_card: flag(params, 'sticker_card'),
      charm_pattern: num(params.get('charm_pattern')),
      loadout_weapon: params.get('loadout_weapon') ?? undefined,
      loadout_weapon_float: num(params.get('loadout_weapon_float')),
      loadout_weapon_seed: num(params.get('loadout_weapon_seed')),
      agent_patches: params.get('agent_patches') ?? undefined,
      pet_color: num(params.get('pet_color')),
      pet_animation: params.get('pet_animation') ?? undefined,
    },
    stickers: params.get('stickers'),
    ui: params.get('ui') !== '0',
    transparent: params.get('bg') === 'transparent',
    lite: params.get('quality') === 'lite',
    max: params.get('quality') === 'max',
  }
}
