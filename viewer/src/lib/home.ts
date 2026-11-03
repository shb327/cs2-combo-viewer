import type { LucideIcon } from 'lucide-react'
import { Camera, Eye, Map as MapIcon, Sticker } from 'lucide-react'

/** The skins the home page features (catalog keys: item|kit). */
export const FEATURED_SKINS = [
  'weapon_ak47|cu_fireserpent_ak47_bravo',
  'weapon_awp|cu_medieval_dragon_awp',
  'weapon_m4a1|cu_m4a1_howling',
  'weapon_knife_karambit|aa_fade',
  'weapon_knife_butterfly|am_sapphire_marbleized_b',
  'sporty_gloves|sporty_blue_pink',
  'weapon_awp|awp_printstream',
  'weapon_ak47|cu_ak_neon_rider',
]

/** The clip in the home page's hero (AK-47 | Fire Serpent turning on Mirage), recorded from the embed so the home page draws no 3D. */
const HERO_BASE = 'https://assets.chainskins.net/3d/hero'
export const HERO_VIDEO = { webm: HERO_BASE + '.webm', mp4: HERO_BASE + '.mp4', poster: HERO_BASE + '.jpg' }

export interface HomeFeature {
  icon: LucideIcon
  title: string
  text: string
  /** Where trying it starts. */
  to: string
  cta: string
}

export const HOME_FEATURES: HomeFeature[] = [
  {
    icon: Sticker, title: 'Stickers & charms', cta: 'Try it',
    text: 'Up to five stickers with their wear, and a charm with its pattern. Turn on Edit and drag them over the weapon.',
    to: '/skin/weapon_ak47/ak47_jinn_consequence?st=cologne2014_teamldlc_holo~0~0~0~0~0~1,cologne2014_titan_holo~1~0~0~0~0~1&charm=kc_missinglink_slime&cseed=42308',
  },
  {
    icon: Eye, title: 'First person & inspect', cta: 'Hold it',
    text: 'See it in your hands with the agent and gloves you pick, the viewmodel’s FOV and sway, and the game’s inspect animation (F).',
    to: '/skin/weapon_ak47/cu_fireserpent_ak47_bravo?fp=1',
  },
  {
    icon: MapIcon, title: 'The game’s maps', cta: 'Open the viewer',
    text: 'Put it on Mirage, Dust II, Inferno… with the map’s own light, as the game’s inspect shows it.',
    to: '/skin/weapon_awp/cu_medieval_dragon_awp',
  },
  {
    icon: Camera, title: 'Share it', cta: 'Make a card',
    text: 'A short link with everything packed in, or an image card up to 4K with its float, pattern, stickers and a QR code.',
    to: '/skin/weapon_awp/awp_printstream',
  },
]
