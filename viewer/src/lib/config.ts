export const ASSET_BASE: string = import.meta.env.VITE_ASSET_BASE ?? '/assets/'


export const DEFAULT_SKIN = { item: 'weapon_ak47', kit: 'cu_fireserpent_ak47_bravo' } as const


export const STICKER_MAX = 5


export const SEED_MAX = 1000


export const DEFAULT_FLOAT = 0


export const DB_URL = 'https://chainskins.net/db.json'


export const IMAGE_PROXY = 'https://services.chainskins.net/image?url='


export const WEB_ORIGIN: string = (() => {
  const domain = (import.meta.env.VITE_WEB_DOMAIN as string | undefined)?.trim().replace(/\/+$/, '')
  if (!domain) return window.location.origin
  return /^https?:\/\//.test(domain) ? domain : `https://${domain}`
})()


export const STICKER_MOVE_RANGE: [number, number] = [0.3, 0.15]


export const CHARM_MOVE_RANGE: [number, number] = [12, 4]
