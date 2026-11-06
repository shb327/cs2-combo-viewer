/** Where the assets are served from (VITE_ASSET_BASE, default this site's /assets/), always ending in "/". */
export const ASSET_BASE: string = ((import.meta.env.VITE_ASSET_BASE as string | undefined)?.trim() || '/assets/').replace(/\/*$/, '/')


export const DEFAULT_SKIN = { item: 'weapon_knife_karambit', kit: 'am_ruby_marbleized' } as const


export const STICKER_MAX = 5


export const SEED_MAX = 1000


export const DEFAULT_FLOAT = 0


export const WEB_ORIGIN: string = (() => {
  const domain = (import.meta.env.VITE_WEB_DOMAIN as string | undefined)?.trim().replace(/\/+$/, '')
  if (!domain) return window.location.origin
  return /^https?:\/\//.test(domain) ? domain : `https://${domain}`
})()


export const STICKER_MOVE_RANGE: [number, number] = [0.3, 0.15]


export const CHARM_MOVE_RANGE: [number, number] = [12, 4]
