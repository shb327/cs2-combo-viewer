import type * as THREE from 'three'
import type { WeaponFinishOptions } from '@/lib/materials/weapon'

export interface SkinViewerOptions extends WeaponFinishOptions {
  /** Where item asset paths are resolved from. */
  assetBase: string
  /** Load this model instead of the item's (e.g. another export of the same weapon). */
  modelOverride?: string
  /** Scene background color; null = transparent (the page shows through). Default #0b0b12. */
  background?: THREE.ColorRepresentation | null
  /** Multisampled edges (fixed for the canvas' lifetime: a change needs a new viewer). Default true. */
  antialias?: boolean
}

/** How finely the viewer draws: for slower devices. */
export interface RenderQuality {
  /** Pixels per CSS pixel; 'auto' is the screen's (at most 2), lowered while frames are slow when `adaptive`. */
  resolution: 'auto' | 1 | 1.5 | 2
  /** Multisampled edges (the viewer is rebuilt when it changes). */
  antialias: boolean
  /** A map's post-processing: bloom and its color grading. */
  post: boolean
  /** With 'auto' resolution: draw fewer pixels while the frame rate is low, more again once it recovers. */
  adaptive: boolean
}

/**
 * The map lights' strengths (× the game's): what lights an item over a map depends on the item, as in the game's
 * inspect rig (iluminacion.md) — a weapon has the sun, its item light, the map's scene lights and the light probes'
 * ambient; a charm or sticker alone and first person only the sun and the ambient.
 */
export interface MapLighting {
  /** The map's sun (light_environment). */
  sun: number
  /** The item's own spot lights (light_item_new…). */
  item: number
  /** The map's scene lights around the inspect spot. */
  scene: number
  /** The light probes' ambient cube (the diffuse light from around). */
  ambient: number
  /** The environment's reflections. */
  reflections: number
}

export const DEFAULT_MAP_LIGHTING: MapLighting = { sun: 1, item: 1, scene: 1, ambient: 1, reflections: 1 }

/** The light sources lighting the current view: on a map, which of the map lights apply; else the studio's. */
export type LightSource = keyof MapLighting | 'studio'

export const DEFAULT_RENDER_QUALITY: RenderQuality = { resolution: 'auto', antialias: true, post: true, adaptive: true }

/** A sticker on the weapon: its slot, wear, placement relative to the slot (UV offset, degrees) and size (×). */
export interface StickerOptions { id: string; slot: number; wear: number; offset: [number, number]; rotation: number; scale?: number }

/**
 * The charm on the weapon: pattern, placement, the sticker slab's sticker. The placement starts at the weapon's default
 * keychain point, or at `position` (the weapon's model space, inches: an inspect link's keychain offsets), and is moved
 * by `offset` (inches along / up); the charm then snaps to the nearest keychain anchor.
 */
export interface CharmOptions { id: string; seed: number; offset: [number, number]; position?: [number, number, number] | null; sticker?: string | null }

/** The scene's lighting: overall brightness, the key / rim lights and the environment, plus two effects. */
export interface Lighting {
  /** Tone-mapping exposure: the overall brightness. */
  exposure: number
  /** The key light's intensity and color. */
  key: number
  keyColor: string
  /** The rim (back) light's intensity and color. */
  rim: number
  rimColor: string
  /** The environment (reflections and fill). */
  ambient: number
  /** Turns the lights around the model (degrees). */
  angle: number
  /** Effect: the lights circle the model on their own. */
  orbit: boolean
  /** The lights keep their place relative to the camera instead of the world (always on in first person). */
  followCamera: boolean
  /**
   * An inspect map (build_vanity.py: maps.json id) seen around the model, lighting it and in its reflections — as the
   * game's inspect backgrounds — or null for the studio.
   */
  map: string | null
}

export const DEFAULT_LIGHTING: Lighting = {
  exposure: 1, key: 2, keyColor: '#ffffff', rim: 0.6, rimColor: '#ffffff', ambient: 0.45, angle: 0, orbit: false, followCamera: false, map: null,
}

/** First person's viewmodel settings (like CS2's viewmodel_fov / viewmodel_offset_* / cl_righthand). */
export interface Viewmodel {
  /** Vertical field of view in degrees, as viewmodel_fov (54–68). */
  fov: number
  /** viewmodel_offset_x / _y / _z (inches from the eye): right, forward, up. CS2's defaults are 2.5, 0, −1.5. */
  offsetX: number
  offsetY: number
  offsetZ: number
  /** Hold the weapon in the left hand (the viewmodel mirrored). */
  leftHanded: boolean
  /** The weapon leans a little toward the pointer and breathes when idle. */
  sway: boolean
  /** The first-person gloves' float and pattern (null = the gloves' own). */
  gloveFloat: number
  gloveSeed: number | null
}

export const DEFAULT_VIEWMODEL: Viewmodel = {
  fov: 68, offsetX: 2.5, offsetY: 0, offsetZ: -1.5, leftHanded: false, sway: true, gloveFloat: 0.15, gloveSeed: null,
}
